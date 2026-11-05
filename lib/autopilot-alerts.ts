// ─── Avisos del autopilot por correo ─────────────────────────────────────────
//
// El autopilot corre solo (cron): si una regla se pausa por falta de créditos
// o el video de un reel no sale tras el reintento, nadie lo ve en el
// dashboard. Esto le escribe a quien creó la regla (o al dueño de la org).
//
// No es una ruta y no lo dispara una persona: lo llama el cron como mucho una
// vez por regla y motivo cada 12 horas (kefy_rate_limits, como
// lib/provider-alerts.ts), así que no puede usarse para mandar correo sin
// límite. Nunca lanza: un fallo del aviso no puede tumbar la ejecución.

import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createSupabaseServer } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { reportWarning } from '@/lib/observability';
import { absoluteUrl } from '@/lib/app-url';
import AutopilotAlert, { autopilotAlertSubject, type AutopilotAlertKind } from '@/emails/AutopilotAlert';

const ALERT_WINDOW_SECONDS = 12 * 60 * 60;

export interface AutopilotAlert {
  kind: AutopilotAlertKind;
  orgId: string;
  ruleId: string;
  ruleName: string;
  /** Quien creó la regla. Sin él (o si ya no es miembro), el dueño de la org. */
  userId: string | null;
  language: 'es' | 'en';
  detail: string;
  /** Pausa por créditos: cuándo se reanuda sola. */
  resumesAt?: Date;
}

async function recipient(orgId: string, userId: string | null): Promise<string | null> {
  const db = createSupabaseServer();
  let id = userId;
  if (id) {
    const { data: member } = await db
      .from('kefy_org_memberships').select('user_id').eq('org_id', orgId).eq('user_id', id).maybeSingle();
    if (!member) id = null;
  }
  if (!id) {
    const { data: owner } = await db
      .from('kefy_org_memberships').select('user_id').eq('org_id', orgId).eq('role', 'owner').limit(1).maybeSingle();
    id = (owner?.user_id as string | undefined) ?? null;
  }
  if (!id) return null;
  const { data: user } = await db.from('kefy_users').select('email').eq('id', id).maybeSingle();
  return (user?.email as string | undefined) ?? null;
}

/** Manda el aviso si no se mandó otro igual en las últimas 12 horas. */
export async function sendAutopilotAlert(alert: AutopilotAlert): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;

    const gate = await checkRateLimit({
      bucket: `autopilot-alert:${alert.ruleId}:${alert.kind}`,
      limit: 1,
      windowSeconds: ALERT_WINDOW_SECONDS,
    });
    if (!gate.allowed) return false;

    const to = await recipient(alert.orgId, alert.userId);
    if (!to) return false;

    const lang = alert.language;
    const resumesOn = alert.resumesAt?.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
      day: 'numeric', month: 'long', timeZone: 'UTC',
    });
    const html = await render(AutopilotAlert({
      kind: alert.kind,
      language: lang,
      ruleName: alert.ruleName,
      detail: alert.detail.slice(0, 600),
      resumesOn,
      href: absoluteUrl(`/${lang}/dashboard/automations/autopilot`),
    }));

    await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'Kefy <no-reply@email.kefy.app>',
      to,
      subject: autopilotAlertSubject(alert.kind, lang, alert.ruleName),
      html,
    });
    return true;
  } catch (err) {
    reportWarning(`No se pudo enviar el aviso del autopilot: ${String(err)}`, {
      route: 'lib/autopilot-alerts', service: 'resend', extra: { ruleId: alert.ruleId, kind: alert.kind },
    });
    return false;
  }
}
