const en = {
  all: 'All',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
  unreadOnly: 'Unread only',
  loading: 'Loading...',
  noMessages: 'No messages',
  noMessagesHint: 'DMs arrive here via Zernio webhook',
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
