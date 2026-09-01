// ─── Simulación de las funciones RPC de Postgres en los tests ────────────────
//
// Las rutas que generan contenido pasan por `guardAiRequest`, que llama a dos
// funciones almacenadas de Supabase: `kefy_rate_limit_hit` y `kefy_credits_consume`.
// Sin ellas el guard falla cerrado y toda ruta responde 503, así que cualquier
// test de una ruta de generación necesita este `rpc`.
//
// Uso: añadir `rpc: fakeRpc` al mock del cliente de Supabase.
//
//   const mockSupabaseClient = { from: vi.fn(), rpc: fakeRpc };
//
// `fakeRpc` es una función normal y no un espía a propósito: los tests llaman
// `vi.resetAllMocks()` en `beforeEach`, que borraría la implementación de un
// `vi.fn()` y dejaría el guard sin respuesta.

export interface QuotaState {
  /** false → `kefy_credits_consume` devuelve -1 (créditos agotados). */
  quotaAllowed: boolean;
  /** true → `kefy_rate_limit_hit` devuelve un conteo por encima del tope. */
  rateLimited: boolean;
  /** true → las RPC responden con error, como una base caída. */
  dbError: boolean;
  /** Registro de las llamadas, para poder afirmar sobre ellas. */
  calls: Array<{ fn: string; args: Record<string, unknown> }>;
}

export const quotaState: QuotaState = {
  quotaAllowed: true,
  rateLimited: false,
  dbError: false,
  calls: [],
};

/** Vuelve al estado por defecto: todo permitido. Llamar en `beforeEach`. */
export function resetQuotaState(): void {
  quotaState.quotaAllowed = true;
  quotaState.rateLimited = false;
  quotaState.dbError = false;
  quotaState.calls = [];
}

/** Número de descuentos de créditos por un importe dado. */
export function consumedCount(amount: number): number {
  return quotaState.calls.filter(
    (c) => c.fn === 'kefy_credits_consume' && c.args.p_amount === amount,
  ).length;
}

/** Total de créditos descontados en todas las llamadas. */
export function creditsSpent(): number {
  return quotaState.calls
    .filter((c) => c.fn === 'kefy_credits_consume')
    .reduce((sum, c) => sum + Number(c.args.p_amount ?? 0), 0);
}

/** Número de reembolsos registrados. */
export function refundCount(): number {
  return quotaState.calls.filter((c) => c.fn === 'kefy_credits_refund').length;
}

export async function fakeRpc(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<{ data: unknown; error: { message: string } | null }> {
  quotaState.calls.push({ fn, args });

  if (quotaState.dbError) {
    return { data: null, error: { message: 'simulated database failure' } };
  }

  switch (fn) {
    case 'kefy_rate_limit_hit':
      // El límite se compara con `count <= limit`, así que un número enorme
      // provoca el bloqueo sin tener que saber el tope de cada regla.
      return { data: quotaState.rateLimited ? 999_999 : 1, error: null };

    case 'kefy_credits_consume':
      return { data: quotaState.quotaAllowed ? Number(args.p_amount ?? 1) : -1, error: null };

    case 'kefy_credits_refund':
      return { data: null, error: null };

    default:
      return { data: null, error: null };
  }
}

// ─── Suscripción ──────────────────────────────────────────────────────────────
//
// `guardAiRequest` también consulta `kefy_subscriptions` antes de gastar nada.
// Este helper devuelve una cuenta con el trial vigente, que es el estado de
// cualquier cuenta recién creada.

export interface SubscriptionState {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  /** Días hasta el fin del período. Negativo = ya venció. */
  daysLeft: number;
  /** true → la consulta no devuelve fila (cuenta sin suscripción). */
  missing: boolean;
}

export const subscriptionState: SubscriptionState = {
  status: 'trialing',
  daysLeft: 20,
  missing: false,
};

export function resetSubscriptionState(): void {
  subscriptionState.status = 'trialing';
  subscriptionState.daysLeft = 20;
  subscriptionState.missing = false;
}

/** Fila de `kefy_subscriptions` según el estado simulado. */
export function subscriptionRow(): { status: string; current_period_end: string } | null {
  if (subscriptionState.missing) return null;
  return {
    status: subscriptionState.status,
    current_period_end: new Date(
      Date.now() + subscriptionState.daysLeft * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

/**
 * Cadena de Supabase para `kefy_subscriptions`, encadenable y terminada en
 * `.maybeSingle()`, como la usa `getEntitlement`.
 */
export function subscriptionChain() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: subscriptionRow(), error: null });
  return chain;
}

/**
 * Reemplazo de `getEntitlement` para los tests de rutas: resuelve el estado
 * simulado sin tocar la base de datos.
 *
 * Se mockea el módulo entero en vez de la fila de Supabase porque cada test de
 * ruta encadena sus propias respuestas de `from()` con `mockReturnValueOnce`, y
 * una consulta extra les desordenaría la secuencia.
 */
export function fakeEntitlement() {
  if (subscriptionState.missing) {
    return {
      canCreate: false, status: 'canceled' as const, isTrialing: false,
      periodEnd: null, trialDaysLeft: null, reason: 'no_subscription' as const,
    };
  }

  const { status, daysLeft } = subscriptionState;
  const expired = daysLeft <= 0;
  const periodEnd = new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000);

  if (status === 'trialing') {
    return {
      canCreate: !expired, status, isTrialing: true, periodEnd,
      trialDaysLeft: Math.max(0, daysLeft),
      reason: expired ? ('trial_expired' as const) : null,
    };
  }
  if (status === 'active') {
    return {
      canCreate: true, status, isTrialing: false, periodEnd,
      trialDaysLeft: null, reason: null,
    };
  }
  return {
    canCreate: false, status, isTrialing: false, periodEnd, trialDaysLeft: null,
    reason: status === 'past_due' || status === 'unpaid'
      ? ('payment_failed' as const)
      : ('canceled' as const),
  };
}
