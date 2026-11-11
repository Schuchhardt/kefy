import { z } from 'zod';
import { defineAdminTool } from '@/lib/admin/registry';
import {
  addOrgNote, describeExtendTrial, extendTrial, getOrganization, getPlatformOverview, grantCredits,
  revokeApiKey, searchOrganizations, searchUsers, setAutopilotRuleStatus,
} from '@/lib/services/admin/platform';

const reason = z.string().trim().min(3).max(500)
  .describe('Who asked for this and through which channel, e.g. "Owner asked by WhatsApp on 2026-11-10 after the trial expired".');

export const platformTools = [
  defineAdminTool({
    name: 'get_platform_overview',
    title: 'Platform overview',
    kind: 'read',
    description: 'Start here. Platform-wide snapshot: organizations and users (total and new), subscriptions by status and plan, '
      + 'active/expiring/expired trials, paying accounts and estimated MRR (USD, from list prices), AI credits used this month '
      + '(top orgs), content created, posts published/failed, autopilot and video failures, and signups per day.',
    input: z.object({ days: z.number().int().min(1).max(90).default(30).describe('Window for "new" and activity counts.') }),
    handler: async (ctx, input) => ({ data: await getPlatformOverview(ctx, input) }),
  }),
  defineAdminTool({
    name: 'search_organizations',
    title: 'Search organizations',
    kind: 'read',
    description: 'Find organizations (Kefy customers) by name, slug, id or a member\'s email/name, optionally filtered by '
      + 'subscription status or plan. Each row: owner, subscription (can_create, trial_days_left, paying), credits used, brands, '
      + 'social accounts active/broken. Use the id with get_organization.',
    input: z.object({
      query: z.string().max(100).optional(),
      status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'unpaid']).optional(),
      plan: z.enum(['starter', 'pro', 'business']).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }),
    handler: async (ctx, input) => ({ data: await searchOrganizations(ctx, input) }),
  }),
  defineAdminTool({
    name: 'get_organization',
    title: 'Organization detail',
    kind: 'read',
    description: 'Everything about one organization for support: subscription and plan limits, members (emails), brands, '
      + 'credit usage (last 3 months), social accounts and their health, content in the last 30 days, failed posts, autopilot '
      + 'rules and failed runs, recent video jobs, API keys/connections, admin notes, its sales lead and recent admin actions.',
    input: z.object({ org_id: z.uuid() }),
    handler: async (ctx, input) => ({ data: await getOrganization(ctx, input) }),
  }),
  defineAdminTool({
    name: 'search_users',
    title: 'Search users',
    kind: 'read',
    description: 'Find users by email or name, with the organizations they belong to and their role.',
    input: z.object({ query: z.string().min(2).max(100), limit: z.number().int().min(1).max(50).default(20) }),
    handler: async (ctx, input) => ({ data: await searchUsers(ctx, input) }),
  }),
  defineAdminTool({
    name: 'extend_trial',
    title: 'Extend trial',
    kind: 'write',
    confirm: true,
    description: 'Give an organization more free trial time (status trialing until the new date). Adds `days` from the current '
      + 'end (or from now if it already expired), or sets `until`. Refused for organizations with a live Stripe subscription. '
      + 'Requires server confirmation: the first call returns confirmation_required with a summary; show it to the owner and only '
      + 'after an explicit yes repeat the call with the same arguments plus confirmation_token.',
    input: z.object({
      org_id: z.uuid(),
      days: z.number().int().min(1).max(90).optional(),
      until: z.iso.datetime({ offset: true }).optional(),
      reason,
    }).refine((v) => !!v.days !== !!v.until, { message: 'Pass exactly one of days or until' }),
    describe: (ctx, input) => describeExtendTrial(ctx, input),
    targetOrg: (input) => input.org_id,
    handler: async (ctx, input) => ({ data: await extendTrial(ctx, input) }),
  }),
  defineAdminTool({
    name: 'grant_credits',
    title: 'Grant credits',
    kind: 'write',
    confirm: true,
    description: 'Give an organization extra AI credits for the CURRENT month only (the counter resets next month). '
      + 'Requires server confirmation (confirmation_required → owner says yes → repeat with confirmation_token).',
    input: z.object({ org_id: z.uuid(), credits: z.number().int().min(1).max(5000), reason }),
    describe: async (_ctx, input) => `Grant ${input.credits} extra AI credits this month to organization ${input.org_id}. Reason: ${input.reason}`,
    targetOrg: (input) => input.org_id,
    handler: async (ctx, input) => ({ data: await grantCredits(ctx, input) }),
  }),
  defineAdminTool({
    name: 'set_autopilot_rule_status',
    title: 'Pause or resume an autopilot rule',
    kind: 'write',
    confirm: true,
    description: 'Pause (e.g. it keeps failing or burning credits) or resume an autopilot rule of any organization. Get rule ids '
      + 'from get_organization. Requires server confirmation.',
    input: z.object({ rule_id: z.uuid(), status: z.enum(['active', 'paused']), reason }),
    describe: async (_ctx, input) => `Set autopilot rule ${input.rule_id} to ${input.status}. Reason: ${input.reason}`,
    handler: async (ctx, input) => ({ data: await setAutopilotRuleStatus(ctx, input) }),
  }),
  defineAdminTool({
    name: 'revoke_api_key',
    title: 'Revoke an API key or MCP connection',
    kind: 'write',
    confirm: true,
    description: 'Revoke an API key or OAuth connection of any organization right away (abuse, leaked key). Get ids from '
      + 'get_organization. Requires server confirmation.',
    input: z.object({ key_id: z.uuid(), reason }),
    describe: async (_ctx, input) => `Revoke API key / connection ${input.key_id} immediately. Reason: ${input.reason}`,
    handler: async (ctx, input) => ({ data: await revokeApiKey(ctx, input) }),
  }),
  defineAdminTool({
    name: 'add_organization_note',
    title: 'Add internal note',
    kind: 'write',
    description: 'Add an internal support note to an organization (only admins see it; shown in get_organization).',
    input: z.object({ org_id: z.uuid(), body: z.string().trim().min(1).max(5000) }),
    targetOrg: (input) => input.org_id,
    handler: async (ctx, input) => ({ data: await addOrgNote(ctx, input) }),
  }),
];
