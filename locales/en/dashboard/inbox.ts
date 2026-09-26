const en = {
  all: 'All',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
  unreadOnly: 'Unread only',
  loading: 'Loading...',
  noMessages: 'No messages yet',
  noMessagesHint: 'Once someone DMs you on a connected account, the conversation shows up here.',
  noUnread: "You're all caught up",
  noUnreadHint: 'No unread messages.',
  selectMessage: 'Select a message to view it',
  loadingConvo: 'Loading conversation...',
  errorSend: 'Error sending',
  errorConn: 'Connection error',
  replyPlaceholder: 'Write a reply...',
  sendBtn: '↑ Send',
  syncBtn: 'Sync',
  syncing: 'Syncing...',
  syncDone: (n: number) => `${n} conversation${n !== 1 ? 's' : ''} synced`,
  syncError: 'Error syncing',
};

export default en;
