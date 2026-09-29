import type { EngageCopy } from '@/locales/es/dashboard/engage';

const en: EngageCopy = {
  subtitle: 'Manage comments and messages from all your platforms',
  tabComments: 'Comments',
  commentsListLabel: 'Comments by post',
  unansweredOnly: 'Unanswered only',
  loadingComments: 'Loading comments…',
  noComments: 'No comments yet',
  noCommentsHint: 'Comments on your posts will show up here.',
  noCommentsCaughtUp: "You're all caught up",
  noCommentsCaughtUpHint: 'No unanswered comments.',
  yourReply: 'Your reply',
  viewEarlier: (n: number) => (n === 1 ? 'View 1 earlier message' : `View ${n} earlier messages`),
  viewConversation: 'View conversation',
  replyBtn: 'Reply',
  all: 'All',
  replyPlaceholder: 'Write your reply…',
  replyBtnSend: 'Reply',
  errorSend: 'Error sending',
  syncBtn: 'Sync',
  syncing: 'Syncing…',
  syncDone: (n: number) => `${n} comment${n !== 1 ? 's' : ''} synced`,
  syncError: 'Error syncing',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
};

export default en;
