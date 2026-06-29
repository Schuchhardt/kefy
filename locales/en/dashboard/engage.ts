const en = {
  subtitle: 'Manage comments and messages from all your platforms',
  tabComments: 'Comments',
  showAll: 'Showing all',
  unansweredOnly: 'Unanswered only',
  loadingComments: 'Loading comments...',
  noComments: 'No pending comments',
  noCommentsHint: 'Comments arrive automatically',
  yourReply: 'Your reply',
  replyBtn: '↩ Reply',
  all: 'All',
  replyPlaceholder: 'Write your reply...',
  replyBtnSend: 'Reply',
  errorSend: 'Error sending',
  syncBtn: 'Sync',
  syncing: 'Syncing...',
  syncDone: (n: number) => `${n} comment${n !== 1 ? 's' : ''} synced`,
  syncError: 'Error syncing',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
};

export default en;
