const en = {
  subtitle: 'Manage comments and reviews from all your platforms',
  tabComments: 'Comments',
  tabReviews: 'Reviews',
  showAll: 'Showing all',
  unansweredOnly: 'Unanswered only',
  loadingComments: 'Loading comments...',
  noComments: 'No pending comments',
  noCommentsHint: 'Comments arrive automatically via Zernio webhooks',
  yourReply: 'Your reply',
  replyBtn: '↩ Reply',
  loadingReviews: 'Loading reviews...',
  noReviews: 'No pending reviews',
  noReviewsHint: 'Reviews arrive automatically via Zernio webhooks',
  all: 'All',
  replyPlaceholder: 'Write your reply...',
  replyBtnSend: 'Reply',
  errorSend: 'Error sending',
  timeNow: 'now',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
};

export default en;
