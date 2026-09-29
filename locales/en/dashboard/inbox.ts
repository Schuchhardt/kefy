import type { InboxCopy } from '@/locales/es/dashboard/inbox';

const en: InboxCopy = {
  title: 'Conversations',
  tabsLabel: 'Conversation type',
  tabDms: 'DMs',
  unreadCount: (n: number) => `${n} unread`,
  platformFilterLabel: 'Filter by network',
  all: 'All',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
  unreadOnly: 'Unread only',
  unread: 'Unread',
  loading: 'Loading…',
  threadListLabel: 'Direct messages',
  noMessages: 'No messages yet',
  noMessagesHint: 'Once someone DMs you on a connected account, the conversation shows up here.',
  noUnread: "You're all caught up",
  noUnreadHint: 'No unread messages.',
  selectMessage: 'Select a conversation to view it',
  backToList: 'Back to conversations',
  loadingConvo: 'Loading conversation…',
  errorSend: 'Error sending',
  errorConn: 'Connection error',
  replyLabel: 'Your reply',
  replyPlaceholder: 'Write a reply…',
  sendBtn: 'Send',
  syncBtn: 'Sync',
  syncing: 'Syncing…',
  syncDone: (n: number) => `${n} conversation${n !== 1 ? 's' : ''} synced`,
  syncError: 'Error syncing',
};

export default en;
