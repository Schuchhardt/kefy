import { z } from 'zod';
import { defineAdminTool } from '@/lib/admin/registry';
import {
  getRuntimeLogs, getSentryIssue, listAuditLog, listRecentFailures, listSentryIssues,
} from '@/lib/services/admin/logs';

export const logTools = [
  defineAdminTool({
    name: 'list_recent_failures',
    title: 'Recent failures',
    kind: 'read',
    description: 'What broke recently, from the database (cheap, start here when something seems wrong): failed posts with the '
      + 'Zernio/platform error, failed autopilot runs, failed video jobs, failed auto-replies, failed assistant/API/MCP actions and '
      + 'social accounts that stopped being active. Optionally for one organization.',
    input: z.object({
      hours: z.number().int().min(1).max(24 * 30).default(24),
      org_id: z.uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20).describe('Per section.'),
    }),
    handler: async (ctx, input) => ({ data: await listRecentFailures(ctx, input) }),
  }),
  defineAdminTool({
    name: 'list_audit_log',
    title: 'Audit log',
    kind: 'read',
    description: 'Audit trail. log=assistant: every action customers ran through the dashboard assistant, the REST API or their '
      + 'MCP (tool, source, status, error, credits). log=admin: every write made through this admin MCP (who, what, reason).',
    input: z.object({
      log: z.enum(['assistant', 'admin']).default('assistant'),
      org_id: z.uuid().optional(),
      tool: z.string().max(100).optional(),
      status: z.string().max(40).optional().describe('assistant: succeeded, failed, pending_confirmation, rejected, expired, running. admin: succeeded, failed.'),
      hours: z.number().int().min(1).max(24 * 90).default(72),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    handler: async (ctx, input) => ({ data: await listAuditLog(ctx, input) }),
  }),
  defineAdminTool({
    name: 'list_sentry_issues',
    title: 'Sentry issues',
    kind: 'read',
    description: 'Grouped errors from Sentry for the Kefy project, most recent first. `query` uses Sentry search syntax '
      + '(default is:unresolved; e.g. "is:unresolved route:POST*", "org_id:<uuid>", "service:zernio"). Use get_sentry_issue for '
      + 'the latest event and stack trace.',
    input: z.object({
      query: z.string().max(300).default('is:unresolved'),
      period: z.enum(['1h', '24h', '7d', '14d']).default('24h'),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    handler: async (ctx, input) => ({ data: await listSentryIssues(ctx, input) }),
  }),
  defineAdminTool({
    name: 'get_sentry_issue',
    title: 'Sentry issue detail',
    kind: 'read',
    description: 'One Sentry issue with its latest event: exception, in-app stack frames, tags (route, org_id, plan, service) and context.',
    input: z.object({ issue_id: z.string().min(1).max(40).describe('Numeric id or short id from list_sentry_issues.') }),
    handler: async (ctx, input) => ({ data: await getSentryIssue(ctx, input) }),
  }),
  defineAdminTool({
    name: 'get_runtime_logs',
    title: 'Vercel runtime logs',
    kind: 'read',
    description: 'Runtime logs of the current production deployment on Vercel (or of deployment_id), read for wait_seconds and '
      + 'filtered. Vercel keeps them only for a short time: use it for "what is happening right now". Filter by levels '
      + '(error, warning, info…), path (e.g. /api/mcp), text contained in the message or minimum HTTP status.',
    input: z.object({
      deployment_id: z.string().max(100).optional(),
      levels: z.array(z.enum(['debug', 'info', 'warning', 'error', 'fatal', 'trace'])).optional(),
      path: z.string().max(200).optional(),
      contains: z.string().max(200).optional(),
      status_min: z.number().int().min(100).max(599).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      wait_seconds: z.number().int().min(2).max(25).default(8),
    }),
    handler: async (ctx, input) => ({ data: await getRuntimeLogs(ctx, input) }),
  }),
];
