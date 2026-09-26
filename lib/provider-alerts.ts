// ─── Alerta por correo: proveedor de IA sin crédito ───────────────────────────
//
// `guardAiRequest` (docs/beta-abierta.md) cubre los créditos DE KEFY — el pool
// mensual por organización. Esto es lo que le falta: si la cuenta de Anthropic
// u OpenAI misma se queda sin saldo, TODAS las generaciones fallan con un 502
// y, sin esto, nadie se entera hasta que un cliente se queja.
//
// Se detecta por status HTTP + el texto del error de la respuesta cruda:
// ninguno de los dos SDKs expone un código de error dedicado y estable para
// "sin crédito" que se pueda usar de forma fiable. Enganchado vía la opción
// `fetch` de cada cliente (getAnthropic/getOpenAI en lib/ai.ts) — un solo
// punto para cualquier llamada, no hay que instrumentar cada call site.
//
// El aviso se manda una vez por hora como mucho, con el mismo `kefy_rate_limits`
// que ya usa el resto de la app (ver lib/rate-limit.ts): sin tabla nueva, sin
// contador en memoria (no sirve entre invocaciones serverless).

import { Resend } from 'resend';
import { render } from '@react-email/render';
import { checkRateLimit } from '@/lib/rate-limit';
import { reportWarning } from '@/lib/observability';
import ProviderCreditsLow from '@/emails/ProviderCreditsLow';

export type AiProvider = 'anthropic' | 'openai';

const ALERT_WINDOW_SECONDS = 60 * 60; // como mucho 1 correo por proveedor por hora

const EXHAUSTION_STATUS: Record<AiProvider, ReadonlySet<number>> = {
  openai:    new Set([429]),
  anthropic: new Set([400, 403]),
};

const EXHAUSTION_PATTERN: Record<AiProvider, RegExp> = {
  openai:    /insufficient_quota|exceeded your current quota|billing hard limit/i,
  anthropic: /credit balance is too low|insufficient credit/i,
};

function looksExhausted(provider: AiProvider, status: number, body: string): boolean {
  if (!EXHAUSTION_STATUS[provider].has(status)) return false;
  return EXHAUSTION_PATTERN[provider].test(body);
}

async function sendAlertEmail(provider: AiProvider, detail: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.PLATFORM_ALERT_EMAIL;
  if (!apiKey || !to) return;

  const resend = new Resend(apiKey);
  const html   = await render(ProviderCreditsLow({ provider, detail }));
  const label  = provider === 'openai' ? 'OpenAI' : 'Anthropic';

  await resend.emails.send({
    from:    process.env.RESEND_FROM_EMAIL ?? 'Kefy <no-reply@email.kefy.app>',
    to,
    subject: `⚠️ Kefy: ${label} sin crédito`,
    html,
  });
}

/**
 * Revisa una respuesta HTTP cruda del proveedor y, si pinta a "sin crédito",
 * manda el correo (a lo sumo 1 por hora por proveedor). Nunca lanza: un fallo
 * de esta alerta no puede tumbar la llamada real que la disparó.
 */
export async function checkProviderExhaustion(
  provider: AiProvider,
  status: number,
  body: string,
): Promise<void> {
  try {
    if (!looksExhausted(provider, status, body)) return;

    const gate = await checkRateLimit({
      bucket: `provider-alert:${provider}`,
      limit: 1,
      windowSeconds: ALERT_WINDOW_SECONDS,
    });
    if (!gate.allowed) return; // ya se avisó en esta ventana

    await sendAlertEmail(provider, body.slice(0, 800));
  } catch (err) {
    reportWarning(`No se pudo enviar la alerta de crédito agotado: ${String(err)}`, {
      route: 'lib/provider-alerts', service: provider,
    });
  }
}

/**
 * Envuelve `fetch` para observar las respuestas de un proveedor sin cambiar
 * nada de lo que ve el SDK: clona la respuesta, la inspecciona en paralelo, y
 * devuelve la original intacta (streams de un solo uso — el SDK necesita leer
 * el body real; el clon es solo para esta inspección).
 */
export function withProviderAlerts(provider: AiProvider, baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const res = await baseFetch(input, init);
    if (!res.ok) {
      void res.clone().text()
        .then((text) => checkProviderExhaustion(provider, res.status, text))
        .catch(() => {/* inspección best-effort */});
    }
    return res;
  };
}
