// ─── Servicio: reportar errores y pedir funciones ────────────────────────────
//
// El asistente (chat, API y MCP) registra lo que la persona reporta como un
// issue de GitHub con su etiqueta: `bug` para un error, `enhancement` para una
// función nueva, y siempre `reportado-por-usuario`. Ver docs/assistant.md
// («Reportar errores y pedir funciones»).
//
// El repo puede ser público: el texto se limpia de correos, teléfonos y
// menciones, y los datos de la cuenta van solo como ids.

import { checkRateLimit } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import { createGithubIssue, githubFeedbackConfigured } from '@/lib/github-issues';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';

export type FeedbackType = 'bug' | 'feature_request';

export const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  bug: 'bug',
  feature_request: 'enhancement',
};
export const USER_REPORT_LABEL = 'reportado-por-usuario';

const RATE_RULES = (ctx: ServiceContext) => [
  { bucket: `feedback:user:${ctx.auth.userId}`, limit: 5, windowSeconds: 60 * 60 },
  { bucket: `feedback:org:${ctx.auth.orgId}`, limit: 20, windowSeconds: 24 * 60 * 60 },
];

export interface FeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  /** Pasos para reproducirlo (errores). */
  steps?: string;
  /** Página o sección de Kefy donde pasó, si se sabe. */
  page?: string;
}

export interface FeedbackResult {
  issue_number: number;
  url: string;
  type: FeedbackType;
  labels: string[];
}

/**
 * Quita lo que no debe quedar en un repo que puede ser público: correos,
 * teléfonos, tokens con pinta de secreto y menciones (GitHub avisa a cada
 * `@usuario` escrito en un issue).
 */
export function sanitizeFeedbackText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]')
    .replace(/\b(kefy_(sk|at|rt)_|sk-|ghp_|github_pat_)[\w-]{8,}/gi, '[token]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[teléfono]')
    .replace(/(^|[^\w`])@(?=[\w-])/g, '$1@​')
    .trim();
}

export function buildFeedbackIssue(ctx: ServiceContext, input: FeedbackInput): { title: string; body: string; labels: string[] } {
  const title = sanitizeFeedbackText(input.title).replace(/\s+/g, ' ').slice(0, 120);
  const sections = [
    `## ${input.type === 'bug' ? 'Qué pasa' : 'Qué se pide'}`,
    sanitizeFeedbackText(input.description),
  ];
  if (input.steps?.trim()) sections.push('## Pasos para reproducirlo', sanitizeFeedbackText(input.steps));
  sections.push(
    '---',
    '_Reportado por un usuario desde el asistente de Kefy._',
    [
      `- Tipo: ${input.type}`,
      `- Origen: ${ctx.source}`,
      input.page?.trim() ? `- Página: ${sanitizeFeedbackText(input.page).slice(0, 200)}` : null,
      `- Plan: ${ctx.auth.plan} · Rol: ${ctx.auth.role} · Idioma: ${ctx.language}`,
      `- Organización: \`${ctx.auth.orgId}\``,
      ctx.brandId ? `- Marca: \`${ctx.brandId}\`` : null,
    ].filter(Boolean).join('\n'),
  );
  return {
    title,
    body: sections.join('\n\n').slice(0, 60000),
    labels: [FEEDBACK_LABELS[input.type], USER_REPORT_LABEL],
  };
}

export async function submitFeedback(ctx: ServiceContext, input: FeedbackInput): Promise<FeedbackResult> {
  if (!githubFeedbackConfigured()) {
    throw new ServiceError('unavailable', 503, msg(ctx.language,
      'Ahora no se pueden registrar reportes. Escríbenos a soporte.',
      'Reports can’t be filed right now. Please contact support.'));
  }

  for (const rule of RATE_RULES(ctx)) {
    const gate = await checkRateLimit(rule);
    if (!gate.allowed) {
      throw new ServiceError('rate_limited', 429, msg(ctx.language,
        'Ya registraste varios reportes hace poco. Inténtalo más tarde.',
        'You filed several reports recently. Please try again later.'),
      { error: 'rate_limited', retryAfter: gate.retryAfter }, { 'Retry-After': String(gate.retryAfter) });
    }
  }

  const issue = buildFeedbackIssue(ctx, input);
  try {
    const created = await createGithubIssue(issue);
    return { issue_number: created.number, url: created.url, type: input.type, labels: issue.labels };
  } catch (err) {
    reportError(err, { route: 'lib/services/feedback', service: 'github', auth: ctx.auth, extra: { type: input.type } });
    throw new ServiceError('provider_error', 502, msg(ctx.language,
      'No se pudo registrar el reporte. Inténtalo de nuevo en un rato.',
      'The report could not be filed. Please try again in a while.')).markReported();
  }
}
