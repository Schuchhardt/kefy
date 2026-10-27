// ─── AI assistant copy (dashboard widget) ────────────────────────────────────
//
// Mismas claves que locales/es/dashboard/assistant.ts. `toolLabels` y
// `toolSummaries` cubren todas las herramientas registradas (ver el
// `satisfies`).

import type { AssistantToolName, ToolSummaryFn } from '@/lib/assistant/summaries';

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: any, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;
const list = (v: any): string =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).join(', ') : '';
const quote = (v: any, max = 80): string => {
  const s = str(v);
  return s.length > max ? `“${s.slice(0, max)}…”` : `“${s}”`;
};

/** Brand tones (same labels as the identity page). */
const toneLabels: Record<string, string> = {
  professional: 'Professional',
  friendly: 'Friendly',
  authoritative: 'Authoritative',
  playful: 'Playful',
  inspirational: 'Inspirational',
  educational: 'Educational',
  casual: 'Casual',
  formal: 'Formal',
};

/** Autopilot frequencies. */
const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

const statusLabels: Record<string, string> = {
  draft: 'draft',
  approved: 'approved',
  archived: 'archived',
  scheduled: 'scheduled',
  published: 'published',
  publishing: 'publishing',
  failed: 'failed',
  cancelled: 'cancelled',
  pending: 'pending',
  active: 'active',
  paused: 'paused',
};

const fieldLabels: Record<string, string> = {
  title: 'title',
  body: 'text',
  hashtags: 'hashtags',
  slides: 'slides',
  image_url: 'image',
  video_url: 'video',
  status: 'status',
  name: 'name',
  tagline: 'tagline',
  industry: 'industry',
  mission: 'mission',
  communication_style: 'communication style',
  target_audience: 'target audience',
  notes: 'notes',
  niche: 'niche',
  tone: 'tone',
  primary_color: 'primary color',
  secondary_color: 'secondary color',
  accent_color: 'accent color',
  font_heading: 'heading font',
  font_body: 'body font',
  logo_url: 'logo',
  website_url: 'website',
  social_urls: 'social links',
  language: 'language',
  customer_locations: 'customer locations',
  differentiators: 'differentiators',
  challenges: 'challenges',
  competitors: 'competitors',
  uses_emojis: 'emoji use',
  company_size: 'company size',
};

const fields = (v: any): string =>
  Array.isArray(v) ? v.map((f) => fieldLabels[f] ?? String(f).replace(/_/g, ' ')).join(', ') : '';

const en = {
  launcherLabel: 'Open the Kefy assistant',
  closeLauncherLabel: 'Close the assistant',
  title: 'Kefy assistant',
  subtitle: (brand: string) => `Working on ${brand}`,
  placeholder: 'Ask the assistant anything…',
  send: 'Send',
  stop: 'Stop',
  newChat: 'New conversation',
  history: 'History',
  back: 'Back',
  close: 'Close',
  delete: 'Archive conversation',
  emptyTitle: 'How can I help today?',
  emptyHint: 'I can create content, check your metrics, answer messages and tune your brand. I always ask before publishing or replying on social networks.',
  suggestions: [
    'Create a carousel about the benefits of our product',
    'How are my posts doing this month?',
    'Summarize my unread messages',
    'Make my brand tone friendlier',
  ],
  historyEmpty: 'You have no conversations yet.',
  historyLoading: 'Loading…',
  untitled: 'Untitled conversation',
  loadingConversation: 'Loading conversation…',
  thinking: 'Thinking…',
  you: 'You',
  assistant: 'Assistant',
  messagesLeft: (remaining: number, limit: number) => `${remaining.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} messages`,
  messagesLeftTitle: 'Assistant messages left this month. Chatting costs no credits; only what gets generated does.',

  toolLabels: {
    get_workspace_context: 'Checking your workspace…',
    open_page: 'Opening page…',
    get_brand_profile: 'Reading the brand profile…',
    update_brand_profile: 'Updating the brand profile…',
    import_brand_from_website: 'Reading your website…',
    get_strategy_catalog: 'Checking strategies…',
    preview_strategy: 'Preparing the strategy…',
    set_active_strategy: 'Activating the strategy…',
    save_custom_strategy: 'Saving the strategy…',
    get_content_ideas: 'Finding content ideas…',
    list_content: 'Searching content…',
    get_content: 'Reading the content…',
    create_post: 'Creating post…',
    create_starter_posts: 'Creating your 3 starter posts…',
    create_carousel: 'Creating carousel…',
    create_reel: 'Creating reel…',
    create_manual_content: 'Saving content…',
    update_content: 'Editing content…',
    generate_content_image: 'Generating image…',
    get_video_plan: 'Working out the video plan…',
    produce_video: 'Starting the video production…',
    get_video_status: 'Checking the video…',
    list_social_accounts: 'Checking connected accounts…',
    get_connect_account_link: 'Preparing the connection link…',
    list_autopilot_rules: 'Checking autopilot…',
    save_autopilot_rule: 'Saving the rule…',
    delete_autopilot_rule: 'Deleting the rule…',
    run_autopilot_now: 'Running autopilot…',
    publish_content: 'Publishing…',
    list_scheduled_posts: 'Checking scheduled posts…',
    cancel_scheduled_post: 'Cancelling post…',
    get_analytics_overview: 'Checking metrics…',
    list_post_performance: 'Analyzing posts…',
    sync_social_data: 'Syncing social data…',
    list_conversations: 'Checking direct messages…',
    get_conversation_messages: 'Reading the conversation…',
    list_comments: 'Checking comments…',
    reply_to_conversation: 'Sending reply…',
    reply_to_comment: 'Replying to comment…',
    list_brand_assets: 'Checking brand assets…',
    add_brand_asset: 'Saving the asset…',
    delete_brand_asset: 'Deleting the asset…',
    create_brand: 'Creating the brand…',
    archive_brand: 'Archiving the brand…',
    set_brand_avatar: 'Updating the brand image…',
    create_story: 'Creating story…',
    prepare_story_video: 'Preparing the story video…',
    convert_content_format: 'Converting format…',
    disconnect_social_account: 'Disconnecting the account…',
    list_engagement_rules: 'Checking auto-replies…',
    save_engagement_rule: 'Saving the auto-reply…',
    delete_engagement_rule: 'Deleting the auto-reply…',
    list_leads: 'Checking leads…',
    save_lead: 'Saving the lead…',
    delete_lead: 'Deleting the lead…',
    get_lead_scoring: 'Checking lead scoring…',
    update_lead_scoring: 'Updating lead scoring…',
  } satisfies Record<AssistantToolName, string>,

  toolSummaries: {
    get_workspace_context: () => 'Check your workspace',
    open_page: () => 'Open a dashboard page',
    get_brand_profile: () => 'Read the brand profile',
    update_brand_profile: (_i, p) => {
      const f = fields(p.fields);
      const base = f ? `Update the brand profile's ${f}` : 'Update the brand profile';
      return p.sync_org_name ? `${base} and rename the organization` : base;
    },
    import_brand_from_website: (i, p) => {
      const url = str(p.url, str(i.url));
      return url
        ? `Read ${quote(url)} and fill the empty brand profile fields (1 credit)`
        : 'Read your website and fill the empty brand profile fields (1 credit)';
    },
    get_strategy_catalog: () => 'Check the strategy catalog',
    preview_strategy: () => 'Preview a strategy',
    set_active_strategy: (_i, p) => {
      const target = str(p.brand) ? `for the brand ${quote(str(p.brand))}` : 'for this brand';
      if (str(p.name)) return `Activate your custom strategy ${quote(str(p.name))} ${target}`;
      const pair = [str(p.objective), str(p.industry)].filter(Boolean).join(' · ');
      return pair ? `Activate the ${pair} strategy ${target}` : `Activate a strategy ${target}`;
    },
    save_custom_strategy: (i, p) => {
      const name = str(p.name, str(i.name));
      const verb = i.id ? 'Update the custom strategy' : 'Create the custom strategy';
      const base = name ? `${verb} ${quote(name)}` : verb;
      if (!p.activate) return base;
      return str(p.brand) ? `${base} and activate it for the brand ${quote(str(p.brand))}` : `${base} and activate it`;
    },
    get_content_ideas: () => 'Find content ideas',
    list_content: () => 'Search content',
    get_content: () => 'Read a content item',
    create_post: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const img = (p.with_image ?? i.with_image) !== false ? ' with an image' : '';
      return topic ? `Create a post${img} about ${quote(topic)}` : `Create a post${img}`;
    },
    create_starter_posts: (i, p) => {
      const url = str(p.url, str(i.url));
      return url
        ? `Read ${quote(url)}, fill the empty brand profile fields and create 3 starter posts`
        : 'Create 3 starter posts from your business description';
    },
    create_carousel: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const n = Number(p.slide_count ?? i.slide_count ?? 5);
      const imgs = (p.generate_images ?? i.generate_images) !== false ? ' with images' : '';
      return `Create a ${n}-slide carousel${imgs}${topic ? ` about ${quote(topic)}` : ''}`;
    },
    create_reel: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const n = Number(p.variant_count ?? i.variant_count ?? 1);
      const variants = n > 1 ? ` (${n} variants)` : '';
      return `Write a reel script${variants}${topic ? ` about ${quote(topic)}` : ''}`;
    },
    create_manual_content: (i) => {
      const title = str(i.title);
      const type = str(i.content_type, 'post');
      return title ? `Save the ${type} ${quote(title)} as a draft` : `Save a ${type} as a draft`;
    },
    update_content: (_i, p) => {
      const title = str(p.title, 'content');
      if (p.new_status === 'archived') return `Archive ${quote(title)}`;
      if (p.new_image_url === null && fields(p.fields) === 'image') return `Remove the image from ${quote(title)}`;
      const f = fields(p.fields);
      const warn = p.current_status === 'scheduled' ? ' (it is scheduled)' : '';
      return `Edit the ${f || 'content'} of ${quote(title)}${warn}`;
    },
    generate_content_image: (i) => {
      const prompt = str(i.prompt);
      return prompt ? `Generate a new image: ${quote(prompt, 60)}` : 'Generate a new image for the content';
    },
    get_video_plan: () => 'See the video production plan',
    produce_video: (i, p) => {
      const credits = Number(p.credits);
      const tools = str(p.tools);
      return `Produce the video${Number.isFinite(credits) && credits > 0 ? ` (${credits} credits)` : ''}${tools ? `: ${tools}` : ''}${i.force ? ', replacing the current one' : ''}`;
    },
    get_video_status: () => 'Check how the video is going',
    list_social_accounts: () => 'Check connected accounts',
    get_connect_account_link: (i) => `Prepare the link to connect ${str(i.platform, 'an account')}`,
    list_autopilot_rules: () => 'Check the autopilot rules',
    save_autopilot_rule: (i, p) => {
      const name = quote(str(p.name, str(i.name)));
      if (!i.id) return `Create the autopilot rule ${name}: it will generate and schedule posts on its own`;
      if (i.status === 'paused') return `Pause the autopilot rule ${name}`;
      if (i.status === 'active') return `Resume the autopilot rule ${name}`;
      return `Edit the autopilot rule ${name}`;
    },
    delete_autopilot_rule: (_i, p) => `Delete the autopilot rule ${quote(str(p.name))}`,
    run_autopilot_now: (i) => {
      const n = Array.isArray(i.rule_ids) ? i.rule_ids.length : 1;
      return n === 1 ? 'Run an autopilot rule now (generates and schedules a post)' : `Run ${n} autopilot rules now`;
    },
    publish_content: (i, p) => {
      const title = str(p.title, 'content');
      const accounts = list(p.accounts) || 'the selected accounts';
      const when = i.when === 'now' ? 'now' : str(p.when) ? `on ${str(p.when)}` : '';
      return `Publish ${quote(title)} to ${accounts}${when ? ` ${when}` : ''}`;
    },
    list_scheduled_posts: () => 'Check scheduled posts',
    cancel_scheduled_post: (_i, p) => {
      const title = str(p.title, 'content');
      const account = str(p.account);
      const when = str(p.when);
      return `Cancel the post ${quote(title)}${account ? ` on ${account}` : ''}${when ? ` scheduled for ${when}` : ''}`;
    },
    get_analytics_overview: () => 'Check the metrics overview',
    list_post_performance: () => 'Check how your posts perform',
    sync_social_data: (i) => {
      const parts = [
        i.analytics !== false ? 'metrics' : '',
        i.inbox !== false ? 'messages and comments' : '',
      ].filter(Boolean);
      return `Sync ${parts.join(' and ') || 'data'} from the social networks`;
    },
    list_conversations: () => 'Check direct messages',
    get_conversation_messages: () => 'Read a conversation',
    list_comments: () => 'Check comments',
    reply_to_conversation: (_i, p) => {
      const to = str(p.recipient);
      const from = str(p.account);
      return `Send a direct message${to ? ` to ${to}` : ''}${from ? ` from ${from}` : ''}`;
    },
    reply_to_comment: (_i, p) => {
      const to = str(p.recipient);
      const from = str(p.account);
      return `Publicly reply to the comment${to ? ` by ${to}` : ''}${from ? ` on ${from}` : ''}`;
    },
    list_brand_assets: () => 'Check the brand assets',
    add_brand_asset: (i): string => (i.set_as_logo
      ? 'Add the image to the assets and use it as the brand logo'
      : 'Add an image to the brand assets'),
    delete_brand_asset: (_i, p) => {
      const what = str(p.label) ? quote(p.label) : str(p.type);
      return what ? `Delete the brand asset ${what}` : 'Delete a brand asset';
    },
    create_brand: (i, p) => `Create the brand ${quote(str(p.name, str(i.name)))}`,
    archive_brand: (_i, p) => `Archive the brand ${quote(str(p.name))}: it disappears and nothing can act on it anymore`,
    set_brand_avatar: (i): string => (i.image_url ? 'Change the brand image' : 'Remove the brand image'),
    create_story: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const img = (p.with_image ?? i.with_image) !== false ? ' with an image' : '';
      return topic ? `Create a story${img} about ${quote(topic)}` : `Create a story${img}`;
    },
    prepare_story_video: () => "Write the story's video script (1 credit)",
    convert_content_format: (i, p) => {
      const credits = Number(p.credits);
      const cost = Number.isFinite(credits) && credits > 0 ? ` (up to ${credits} credits)` : '';
      const from = str(p.from) ? ` from ${str(p.from)}` : '';
      return `Convert ${quote(str(p.title, 'the content'))}${from} to ${str(p.format, str(i.format))}${cost}`;
    },
    disconnect_social_account: (_i, p) => {
      const n = Number(p.scheduled_posts);
      const base = `Disconnect ${str(p.account, 'the account')}`;
      return n > 0 ? `${base} (${n} scheduled posts will be deleted)` : base;
    },
    list_engagement_rules: () => 'Check the auto-reply rules',
    save_engagement_rule: (i, p) => {
      const name = quote(str(p.name, str(i.name)));
      if (!i.id) {
        const target = String(p.trigger ?? i.trigger_type ?? '').includes('dm') ? 'DMs' : 'comments';
        return `Create the auto-reply ${name}: it will answer ${target} on its own`;
      }
      if (p.new_status === 'paused') return `Pause the auto-reply ${name}`;
      if (p.new_status === 'active') return `Resume the auto-reply ${name}`;
      return `Edit the auto-reply ${name}`;
    },
    delete_engagement_rule: (_i, p) => `Delete the auto-reply ${quote(str(p.name))}`,
    list_leads: () => 'Check the leads',
    save_lead: (i): string => (i.id ? 'Update a lead' : `Save the lead ${quote(str(i.username))}`),
    delete_lead: (_i, p) => `Delete the lead ${quote(str(p.username))}${str(p.channel) ? ` (${str(p.channel)})` : ''}`,
    get_lead_scoring: () => 'Check lead scoring',
    update_lead_scoring: () => 'Update lead scoring',
  } satisfies Record<AssistantToolName, ToolSummaryFn>,

  previewLabels: {
    title: 'Content',
    format: 'Format',
    accounts: 'Accounts',
    account: 'Account',
    when: 'When',
    status: 'Status',
    recipient: 'To',
    comment: 'Comment',
    text: 'Text',
    topic: 'Topic',
    channel: 'Network',
    with_image: 'With image',
    slide_count: 'Slides',
    generate_images: 'With images',
    current_status: 'Current status',
    new_status: 'New status',
    fields: 'Fields',
    changes: 'Changes',
    sync_org_name: 'Rename organization',
    objective: 'Objective',
    industry: 'Industry',
    framework: 'Framework',
    custom_notes: 'Notes',
    new_title: 'New title',
    hashtags: 'Hashtags',
    slides: 'Slides',
    name: 'Name',
    description: 'Approach',
    kpi_primary: 'Primary KPI',
    cta_mechanic: 'Conversion mechanic',
    weeks: 'Weeks',
    posts: 'Pieces',
    sample_topics: 'Some topics',
    activate: 'Activate it now',
    frequency: 'Frequency',
  } as Record<string, string>,
  fieldLabels,
  statusLabels,
  toneLabels,
  frequencyLabels,
  yes: 'Yes',
  no: 'No',

  confirm: {
    title: 'I need your confirmation',
    confirm: 'Confirm',
    cancel: 'Cancel',
    cost: (n: number) => `Estimated cost: ${n} credit${n === 1 ? '' : 's'}`,
    expires: (time: string) => `Expires at ${time}`,
    expired: 'This confirmation expired. Ask the assistant again.',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    working: 'Running…',
    failed: 'Could not complete',
    unknown: "We don't know if it finished. Reopen the conversation to see the result.",
  },

  toolStatus: {
    rejected: 'Cancelled',
    expired: 'Expired',
    pending: 'Waiting for confirmation',
    unsettled: 'No result yet',
    unsettledHint: 'It may still be running. Reopen the conversation later to see how it ended.',
    error: 'Failed',
  },

  errors: {
    subscription: 'Your subscription is not active. Reactivate it to keep using the assistant.',
    credits: (limit: number) => `You've used this month's ${limit} AI credits. Upgrade your plan to keep generating.`,
    assistantQuota: (limit: number) => `You've used all ${limit.toLocaleString('en-US')} assistant messages for this month. Upgrade your plan to keep chatting.`,
    rateLimit: (s: number) => s > 0 ? `You're going too fast. You can retry in ${s}s.` : 'You can retry now.',
    unavailable: 'The assistant is not available right now.',
    generic: 'Something went wrong. Try again.',
    network: "We couldn't reach the assistant. Check your connection.",
    refusal: "I can't help with that request.",
    stepLimit: 'This request needed too many steps, so I stopped. Tell me how to continue.',
    expired: 'This action is no longer pending.',
  },

  viewPlans: 'View plans',
  open: 'Open',
  retry: 'Retry',
  externalLink: (host: string) => `Open ${host} in a new tab`,
  disabledNotice: 'Your subscription is not active. Reactivate it to keep using the assistant.',
  disabledLink: 'Go to settings',
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export default en;
