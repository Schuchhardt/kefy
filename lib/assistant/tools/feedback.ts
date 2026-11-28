// ─── Herramientas del asistente: reportes de usuarios ────────────────────────
//
// report_issue registra un error o una función pedida como issue de GitHub con
// su etiqueta. La lógica vive en lib/services/feedback.ts.

import { z } from 'zod';
import { defineTool } from '@/lib/assistant/registry';
import { msg } from '@/lib/services/errors';
import { submitFeedback } from '@/lib/services/feedback';

const reportIssueInput = z.object({
  type: z.enum(['bug', 'feature_request'])
    .describe('bug: something in Kefy does not work as it should. feature_request: something Kefy does not do yet.'),
  title: z.string().trim().min(5).max(120)
    .describe('Short, specific summary in the user\'s language (e.g. "El calendario no muestra los reels programados").'),
  description: z.string().trim().min(10).max(4000)
    .describe('What happens and what was expected (bug), or what the user wants and why (feature request), in the user\'s words. No personal data.'),
  steps: z.string().trim().max(2000).optional()
    .describe('Bug only: steps to reproduce it, if the user gave them.'),
  page: z.string().trim().max(200).optional()
    .describe('Kefy page or section where it happened, if known (e.g. the current page from the snapshot).'),
}).strict();

const reportIssueTool = defineTool({
  name: 'report_issue',
  title: { es: 'Reportar un problema o una idea', en: 'Report a problem or an idea' },
  kind: 'write',
  description:
    'Files a bug report or a feature request for the Kefy team (it becomes a GitHub issue labeled "bug" or ' +
    '"enhancement"). Use it when the user reports something that does not work in Kefy, or asks for something Kefy ' +
    'cannot do yet and wants to suggest it. Before calling: check it is not something you can solve with another ' +
    'tool or a user-side setting (e.g. an account that just needs reconnecting), and ask one short question only if ' +
    'the report is too vague to act on. Write the title and description in the user\'s language from what they said, ' +
    'without names, emails, phone numbers, tokens or other personal data: the issue may be public. Always requires ' +
    'user confirmation in the chat. At most 5 reports per hour per user. Costs no credits.',
  input: reportIssueInput,
  brandOptional: true,
  confirm: 'always',
  describe: async (ctx, input) => ({
    issue_type: input.type === 'bug'
      ? msg(ctx.language, 'Error', 'Bug')
      : msg(ctx.language, 'Idea / función nueva', 'Idea / new feature'),
    issue_title: input.title,
    details: input.description,
  }),
  handler: async (ctx, input) => {
    const out = await submitFeedback(ctx, input);
    return { data: out };
  },
});

export const feedbackTools = [reportIssueTool];
