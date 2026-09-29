import type { SettingsCopy } from '@/locales/es/dashboard/settings';

// Plan prices, limits and features come from lib/plans.ts and
// locales/*/plans.ts, never from here (see the Spanish file).

const en: SettingsCopy = {
  title: 'Settings',
  subtitle: 'Your account, your organization, the plan, connected networks and integrations.',
  indexLabel: 'Settings sections',

  sections: {
    profile: 'Profile',
    org: 'Organization',
    billing: 'Plan & billing',
    social: 'Social accounts',
    team: 'Team',
    leadScoring: 'Lead scoring',
  },

  profile: {
    subtitle: 'Your name and password are changed in your profile.',
    nameLabel: 'Name',
    emailLabel: 'Email address',
    noName: 'No name',
    edit: 'Edit in your profile',
  },

  org: {
    subtitle: 'The name your team sees and that shows up in invitations.',
    nameLabel: 'Organization name',
    saved: 'Name saved',
    saveError: 'Could not save the organization name. Please try again.',
    readOnly: 'Only the owner or an admin can change the organization name.',
  },

  billing: {
    current: 'Current plan',
    includedTitle: 'Every plan includes',
    upgrade: (plan: string) => `Upgrade to ${plan}`,
    change: (plan: string) => `Switch to ${plan}`,
    subscribe: (plan: string) => `Subscribe to ${plan}`,
    manage: 'Manage subscription',
    redirecting: 'Redirecting to Stripe…',
    success: 'Plan updated. Thank you for subscribing!',
    canceled: 'The payment process was canceled.',
    checkoutError: 'Could not start the payment process. Please try again.',
    portalError: 'Could not open the billing portal. Please try again.',
    noCustomer: "You don't have a paid subscription yet. Pick a plan to subscribe.",
    onlyManagers: 'Only the owner or an admin can change the plan.',
    status: {
      trial: (days: number) => (days <= 1
        ? 'Your free month ends today. Pick a plan so your content keeps going.'
        : `You're on your free month: ${days} days left. Pick a plan before it ends so your content keeps going.`),
      trialEnded: 'Your free month has ended. Everything you made is still here: pick a plan to generate and publish again.',
      paymentFailed: 'We could not process your last payment. Update your payment method in "Manage subscription".',
      inactive: 'Your subscription is not active. Pick a plan to generate and publish again.',
    },
  },

  leadScoring: {
    subtitle: 'Every interaction adds points to a lead. When its score reaches a stage minimum, it moves to that stage.',
    pointsTitle: 'Points per interaction type',
    thresholdsTitle: 'Minimum score for each stage',
    points: (n: number) => (n === 1 ? '1 point' : `${n} points`),
    interactions: {
      comment: 'Comment',
      review: 'Review',
      dm: 'Direct message',
      mention: 'Mention',
      follow: 'New follower',
      share: 'Share',
      click: 'Link click',
      manual: 'Manual interaction',
    },
    stages: {
      tibio: 'Warm',
      caliente: 'Hot',
      contactado: 'Contacted',
      convertido: 'Converted',
    },
    save: 'Save scoring',
    saved: 'Scoring saved',
    saveError: 'Could not save the scoring. Please try again.',
    readOnly: 'Only the owner or an admin can change the scoring.',
  },

  apiKeys: {
    dateLocale: 'en-US',
    sectionTitle: 'API & MCP',
    intro: 'Connect Kefy to Claude, Cursor or other agents and projects. Each key acts with the current role of whoever created it, and only with the permissions you choose.',
    create: 'Create API key',
    loading: 'Loading…',
    loadError: 'We could not load the API keys.',
    retry: 'Retry',
    empty: 'No API keys yet. Create one to connect an agent or an external project.',
    limitNote: (n: number) => `Up to ${n} active keys per organization.`,
    allBrands: 'All brands',
    unknownBrand: 'Archived brand',
    createdBy: (name: string) => `Created by ${name}`,
    lastUsed: (when: string) => `Last used ${when}`,
    neverUsed: 'Never used',
    expiresOn: (date: string) => `Expires on ${date}`,
    expiredOn: (date: string) => `Expired on ${date}`,
    noExpiry: 'No expiry',
    statusRevoked: 'Revoked',
    statusExpired: 'Expired',
    showInactive: (n: number) => `Show revoked and expired (${n})`,
    hideInactive: 'Hide revoked and expired',
    // Revoke
    revoke: 'Revoke',
    revokeTitle: 'Revoke API key',
    revokeBody: (name: string) => `"${name}" will stop working immediately and any integration using it will start getting 401 errors. This cannot be undone.`,
    revokeConfirm: 'Yes, revoke',
    revoking: 'Revoking…',
    revokeError: 'Could not revoke the key.',
    cancel: 'Cancel',
    close: 'Close',
    // Create
    createTitle: 'New API key',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Claude Code — marketing',
    scopesLabel: 'Permissions',
    scopes: {
      read: { label: 'Read', hint: 'View content, calendar, analytics, inbox, brand and strategy.' },
      write: { label: 'Write', hint: 'Create and edit drafts and generate with AI (spends credits).' },
      publish: { label: 'Publish', hint: 'Publish and schedule on social networks and reply to DMs and comments.' },
    },
    publishWarning: 'It can publish and reply on social networks without human confirmation. Do not use it in agents that read messages.',
    scopesRequired: 'Pick at least one permission.',
    brandLabel: 'Brand',
    brandHint: 'Bind the key to a brand if the integration only works with one.',
    expiryLabel: 'Expiry',
    expiryNever: 'Never',
    expiryDays: (n: number) => `${n} days`,
    submit: 'Create key',
    creating: 'Creating…',
    createError: 'Could not create the key.',
    invalidInput: 'Check the form fields.',
    brandNotFound: 'That brand no longer exists or was archived. Pick another one.',
    keyLimitReached: (n: number) => `You reached the limit of ${n} active keys. Revoke one to create another.`,
    // Secret (shown only once)
    secretTitle: 'Your new API key',
    secretWarning: 'Copy it and store it somewhere safe. You will not see it again.',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    done: 'I saved it',
    // Connect
    connectTitle: 'Connect via MCP',
    connectIntro: 'Use this URL with the "Authorization: Bearer" header and your key. In the examples, replace kefy_sk_... with the key you created.',
    mcpUrlLabel: 'MCP server URL',
    snippetsLabel: 'Setup examples by client',
    snippetHints: {
      claudeCode: 'Run in your terminal:',
      cursor: 'Add to ~/.cursor/mcp.json:',
      claudeDesktop: 'Add to claude_desktop_config.json (uses the mcp-remote bridge):',
      curl: 'List the tools available to the key (REST API):',
    },
  },
};

export default en;
