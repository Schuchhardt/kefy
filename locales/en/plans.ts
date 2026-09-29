import type { PlansCopy } from '@/locales/es/plans';

const en: PlansCopy = {
  names: { starter: 'Starter', pro: 'Pro', business: 'Business' },
  per: '/ month',
  popular: 'Most popular',
  brands: (n: string) => (n === '1' ? '1 brand' : `${n} brands`),
  socialConnections: (n: string) => `${n} social connections`,
  credits: (n: string) => `${n} AI credits / month`,
  assistantMessages: (n: string) => `AI assistant: ${n} messages / month`,
  members: (n: string) => (n === '1' ? '1 member' : `${n} team members`),
  included: [
    'Posts, carousels, reels and stories',
    'Calendar and scheduling',
    'Autopilot',
    'Inbox and auto-replies',
    'API and MCP server',
  ],
};

export default en;
