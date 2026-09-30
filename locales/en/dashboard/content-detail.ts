import type { ContentDetailCopy } from '@/locales/es/dashboard/content-detail';

const en: ContentDetailCopy = {
  back: 'Back to content',
  notFound: "This content couldn't be found",
  notFoundHint: 'It may have been deleted or belong to another brand.',
  untitled: 'Untitled content',
  draftNotice: "This content hasn't been published yet: you can still edit it and publish it when it's ready.",
  edit: 'Edit',
  publish: 'Publish or schedule',
  delete: 'Delete',
  deleteConfirmTitle: 'Delete this content?',
  deleteError: "Couldn't delete the content. Please try again.",
  createSimilar: 'Create a similar one',
  publishOn: (network: string) => `Also publish on ${network}`,
  statsTitle: 'Performance',
  noStatsYet: 'No metrics yet for this content: they can take a little while to sync after publishing.',
  publishedOn: (date: string) => `Published on ${date}`,
  createdOn: (date: string) => `Created on ${date}`,
  impressions: 'Impressions',
  reach: 'Reach',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  engagementRate: 'Engagement',
  contentType: { post: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story' },
  channelGeneric: 'All networks',
  autopilot: 'Autopilot',
  createdBy: (name: string) => `by ${name}`,
  via: (label: string) => `via ${label}`,
  origin: { ui: 'Web', chat: 'Assistant', api: 'API', mcp: 'MCP' },
};

export default en;
