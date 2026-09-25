/**
 * grant-comp-plan.ts
 *
 * Regala un plan a una organización sin pasar por Stripe: para agencias que
 * quieren probar Kefy con varias marcas antes de pagar. Actualiza
 * `kefy_organizations.plan` y `kefy_subscriptions` juntos — a mano, cambiar
 * solo la primera deja `status` desalineado (ver docs/beta-abierta.md, «plan»
 * vs. «puede crear»).
 *
 * Con --days se define hasta cuándo corre el regalo (queda como `trialing`,
 * el mismo mecanismo que el mes gratis, así vence solo). Sin --days, queda
 * `active` sin fecha de corte — no vence hasta que alguien lo cambie a mano
 * o la org pague de verdad por Stripe (el webhook pisa esto sin problema:
 * ver handleCheckoutCompleted en app/api/webhooks/stripe/route.ts).
 *
 * No toca `stripe_customer_id` ni `stripe_subscription_id`: esto nunca fue
 * una suscripción de Stripe y no debe aparentar serlo.
 *
 * ── Por qué también cierra las sesiones ────────────────────────────────────
 * El límite de marcas ya lee el plan en vivo (fix del 2026-09-25), pero
 * créditos, cuota del asistente y cupo de equipo siguen leyendo el plan del
 * JWT de sesión (`auth.plan`), que vive hasta 24h y solo se refresca solo o
 * en un 401. Para que el plan nuevo se sienta "ya mismo" sin esperar eso, este
 * script:
 *   1. marca `kefy_organizations.session_invalidated_at = now()` — cualquier
 *      access token emitido antes de esa marca queda inválido en el próximo
 *      GET /api/auth/me (ver app/api/auth/me/route.ts), aunque no haya
 *      expirado todavía;
 *   2. borra los refresh tokens de todos los miembros de la organización, así
 *      no pueden renovar la sesión vieja en silencio.
 * El resultado: la próxima vez que la app llame a /api/auth/me (al abrir o
 * recargar, o el refresco automático de cada 23h) los devuelve al login. Al
 * volver a entrar, el login lee el plan fresco de la base y listo. Una
 * pestaña ya abierta que no vuelva a llamar a /api/auth/me sigue funcionando
 * con el plan viejo hasta que la recarguen — no hay forma de revocar un JWT
 * ya en uso sin tocar la verificación en cada request, y eso no vale la pena
 * por este caso.
 *
 * Uso:
 *   npx tsx scripts/grant-comp-plan.ts --org <uuid> --plan business
 *   npx tsx scripts/grant-comp-plan.ts --email dueño@agencia.com --plan business --days 30
 *
 * Por defecto es un dry run: solo muestra qué haría. Hay que agregar --yes
 * para aplicar los cambios.
 *
 *   --org <uuid>     ID de la organización (kefy_organizations.id)
 *   --email <email>  Alternativa a --org: email de cualquier miembro de la
 *                     organización. Si el usuario es dueño de más de una org,
 *                     el script no adivina — hay que usar --org.
 *   --plan <plan>     starter | pro | business (default: business)
 *   --days <n>        Días de vigencia. Omitido o 0 = sin vencimiento.
 *   --yes             Aplica los cambios. Sin esto, solo hace dry run.
 *
 * Lee SUPABASE_URL / SUPABASE_SERVICE_KEY de .env.local, igual que la app.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { parseArgs } from 'node:util';
import { createSupabaseServer } from '@/lib/supabase';
import { BRAND_LIMITS } from '@/lib/brands';
import { PLAN_CREDITS } from '@/lib/usage';
import { MEMBER_LIMITS } from '@/lib/team';

type Plan = 'starter' | 'pro' | 'business';
const VALID_PLANS: Plan[] = ['starter', 'pro', 'business'];

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      org:   { type: 'string' },
      email: { type: 'string' },
      plan:  { type: 'string', default: 'business' },
      days:  { type: 'string' },
      yes:   { type: 'boolean', default: false },
    },
  });

  const plan = values.plan as string;
  if (!VALID_PLANS.includes(plan as Plan)) {
    fail(`--plan debe ser uno de: ${VALID_PLANS.join(', ')} (llegó "${plan}")`);
  }

  let days: number | null = null;
  if (values.days !== undefined) {
    const n = Number(values.days);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      fail(`--days debe ser un entero >= 0 (llegó "${values.days}")`);
    }
    days = n > 0 ? n : null; // 0 == sin vencimiento, igual que omitirlo
  }

  if (!values.org && !values.email) {
    fail('Hace falta --org <uuid> o --email <email>.');
  }
  if (values.org && values.email) {
    fail('Usá --org o --email, no los dos.');
  }

  const db = createSupabaseServer();

  // ── Resolver la organización ────────────────────────────────────────────
  let orgId: string;

  if (values.org) {
    orgId = values.org;
  } else {
    const email = values.email!.trim().toLowerCase();
    const { data: user, error: userErr } = await db
      .from('kefy_users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (userErr) fail(`Error buscando el usuario: ${userErr.message}`);
    if (!user) fail(`No existe ningún usuario con email "${email}".`);

    const { data: memberships, error: memErr } = await db
      .from('kefy_org_memberships')
      .select('org_id, role, kefy_organizations(name)')
      .eq('user_id', user.id);

    if (memErr) fail(`Error buscando las organizaciones del usuario: ${memErr.message}`);
    if (!memberships || memberships.length === 0) {
      fail(`"${email}" no pertenece a ninguna organización.`);
    }

    const owned = memberships.filter((m) => m.role === 'owner');
    const candidates = owned.length > 0 ? owned : memberships;

    if (candidates.length > 1) {
      const list = candidates
        .map((m) => `  - ${(m.kefy_organizations as unknown as { name: string } | null)?.name ?? '?'} (${m.org_id}) [${m.role}]`)
        .join('\n');
      fail(
        `"${email}" pertenece a ${candidates.length} organizaciones — no puedo adivinar cuál. ` +
        `Usá --org con el id que corresponda:\n${list}`,
      );
    }

    orgId = candidates[0].org_id;
  }

  const { data: org, error: orgErr } = await db
    .from('kefy_organizations')
    .select('id, name, plan')
    .eq('id', orgId)
    .maybeSingle();

  if (orgErr) fail(`Error leyendo la organización: ${orgErr.message}`);
  if (!org) fail(`No existe ninguna organización con id "${orgId}".`);

  const { data: sub } = await db
    .from('kefy_subscriptions')
    .select('plan, status, current_period_end')
    .eq('org_id', orgId)
    .maybeSingle();

  const { data: members, error: membersErr } = await db
    .from('kefy_org_memberships')
    .select('user_id, role, kefy_users(email)')
    .eq('org_id', orgId);
  if (membersErr) fail(`Error listando los miembros de la organización: ${membersErr.message}`);

  // ── Estado objetivo ─────────────────────────────────────────────────────
  const now = new Date();
  const periodEnd = days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;
  const status = days ? 'trialing' : 'active';

  console.log('\n── Organización ──────────────────────────────────────────');
  console.log(`  ${org.name}  (${org.id})`);
  console.log(`  plan actual:          ${org.plan}`);
  console.log(`  suscripción actual:   ${sub ? `${sub.plan} / ${sub.status} / vence ${sub.current_period_end ?? 'nunca'}` : '(sin fila en kefy_subscriptions)'}`);
  console.log('\n── Cambio propuesto ──────────────────────────────────────');
  console.log(`  plan nuevo:           ${plan}`);
  console.log(`  status nuevo:         ${status}`);
  console.log(`  vence:                ${periodEnd ? periodEnd.toISOString() : 'nunca (hasta que se cambie a mano o pague por Stripe)'}`);
  console.log(`  marcas incluidas:     ${BRAND_LIMITS[plan]}`);
  console.log(`  créditos IA / mes:    ${PLAN_CREDITS[plan as Plan]}`);
  console.log(`  miembros incluidos:   ${MEMBER_LIMITS[plan]}`);

  const memberEmails = (members ?? []).map(
    (m) => (m.kefy_users as unknown as { email: string } | null)?.email ?? m.user_id,
  );
  console.log('\n── Se van a cerrar las sesiones de ──────────────────────');
  for (const email of memberEmails) console.log(`  - ${email}`);

  if (!values.yes) {
    console.log('\n(dry run — no se cambió nada. Agregá --yes para aplicar.)\n');
    return;
  }

  const { error: updateOrgErr } = await db
    .from('kefy_organizations')
    .update({ plan, session_invalidated_at: now.toISOString() })
    .eq('id', orgId);
  if (updateOrgErr) fail(`Error actualizando kefy_organizations: ${updateOrgErr.message}`);

  const { error: upsertSubErr } = await db
    .from('kefy_subscriptions')
    .upsert(
      {
        org_id: orgId,
        plan,
        status,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd ? periodEnd.toISOString() : null,
      },
      { onConflict: 'org_id' },
    );
  if (upsertSubErr) fail(`Error actualizando kefy_subscriptions: ${upsertSubErr.message}`);

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length > 0) {
    const { error: revokeErr } = await db
      .from('kefy_refresh_tokens')
      .delete()
      .in('user_id', userIds);
    if (revokeErr) fail(`El plan quedó aplicado pero no pude revocar las sesiones: ${revokeErr.message}`);
  }

  console.log('\n✔ Aplicado.');
  console.log('  Plan y suscripción actualizados. Sesiones canceladas para:');
  for (const email of memberEmails) console.log(`    - ${email}`);
  console.log('  La próxima vez que la app llame a /api/auth/me (al abrir o recargar)');
  console.log('  los manda al login. Al volver a entrar ya tienen el plan nuevo.\n');
}

main();
