import type { DemoCopy } from '../es/demo';

const en: DemoCopy = {
  metaTitle: 'Private preview — Kefy',
  metaDescription: 'Sample posts made with Kefy from the business website.',
  badge: 'Private preview',
  title: (brand: string) => `This is how ${brand} would look on social media`,
  intro: 'Kefy read your website and wrote these posts in your brand: your name, your tone and your colors. They are sample drafts and were not published anywhere.',
  postsTitle: 'Sample posts',
  postLabel: (n: number) => `Post ${n}`,
  empty: 'There are no posts in this preview yet.',
  expires: (date: string) => `This link expires on ${date}.`,
  ctaTitle: 'Would you like this every week?',
  ctaText: 'Kefy creates, schedules and publishes content for your business. Use the platform yourself or let us manage your accounts.',
  ctaContact: 'Talk to us',
  ctaLearn: 'Discover Kefy',
  footer: 'Made with Kefy',
  notFoundTitle: 'This link is no longer available',
  notFoundText: 'The preview expired or was turned off. Ask whoever sent it for a new link.',
};

export default en;
