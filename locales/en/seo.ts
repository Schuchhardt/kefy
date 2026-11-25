// SEO and AEO copy for the public pages (see locales/es/seo.ts and docs/seo-aeo.md).

import type { HomeFaq, SeoCopy } from '@/locales/es/seo';

const homeFaq: HomeFaq[] = [
  {
    q: 'What is Kefy?',
    a: () => 'Kefy is an AI social media marketing platform for businesses without a marketing team. It learns your brand from your website, creates posts, carousels, reels and stories, and publishes them to your accounts. You approve them in one tap or turn on autopilot.',
  },
  {
    q: 'How much does Kefy cost?',
    a: (c) => `The platform starts at USD ${c.platform} a month and every account begins with 30 free days, no card required; there is no contract and you can cancel anytime. If you’d rather have our team run your social media, the service costs USD ${c.service} a month.`,
  },
  {
    q: 'Which social networks does Kefy publish to?',
    a: (c) => `${c.channelCount} networks: ${c.channels}. You connect your accounts once and every piece is adapted to each network’s format.`,
  },
  {
    q: 'Does Kefy publish on its own or do I approve every post?',
    a: () => 'Your choice. You can review and approve every post before it goes out, or turn on autopilot: Kefy creates and publishes based on the topics, networks, days and times you set.',
  },
  {
    q: 'What kind of content does Kefy create?',
    a: () => 'Posts, carousels, reels and stories. Copy, images and video are created with AI from your colors, your tone and what you sell, in Spanish or English.',
  },
  {
    q: 'Can you run my business’s social media for me?',
    service: true,
    a: (c) => `Yes. With the social media service (USD ${c.service} a month) our team posts every week, runs your ads and answers messages and comments, nights and weekends too. We start with a free review of your accounts.`,
  },
  {
    q: 'What kinds of businesses is Kefy for?',
    a: (c) => `Businesses without a marketing team, and agencies that manage several brands. There is a page with examples for each industry: ${c.niches}.`,
  },
];

const en: SeoCopy = {
  home: {
    appDescription: 'Kefy creates on-brand posts, carousels, reels and stories and publishes them to your social networks. You approve them or turn on autopilot.',
    offersDescription: (from: string, trialDays: string) => `Monthly plans from USD ${from}. Every account starts with ${trialDays} free days of the Starter plan, no card required.`,
    serviceName: 'Managed social media service',
    serviceDescription: 'The Kefy team posts every week in your business’s look, runs your ads and answers messages and comments.',
    nichesName: 'Kefy by industry',
  },
  pages: {
    pricing: {
      title: 'Kefy pricing: plans from USD 49 a month | Kefy',
      description: 'Kefy plans from USD 49 a month, with 30 free days and no card. Compare credits, brands and networks across Starter, Pro and Business. No contract.',
    },
    about: {
      title: 'About Kefy: who we are and why we built it | Kefy',
      description: 'Kefy was born from a real problem: marketing our own businesses on social media was expensive and slow. Meet the story and the team behind it.',
    },
    blog: {
      title: 'Kefy blog: social media marketing for businesses | Kefy',
      description: 'Practical guides on marketing, content and social media for businesses that don’t have a dedicated marketing team.',
    },
    terms: {
      title: 'Terms of Service | Kefy',
      description: 'The terms for using Kefy: accounts, acceptable use, ownership of the content you generate and limitation of liability.',
    },
    privacy: {
      title: 'Privacy Policy | Kefy',
      description: 'What data Kefy collects, what it is used for, who it is shared with and how to request access, correction or deletion.',
    },
    cookies: {
      title: 'Cookie Policy | Kefy',
      description: 'Which cookies Kefy uses (essential, preference and analytics) and how to manage them from your browser.',
    },
  },
  llms: {
    offers: 'Ways to work with Kefy',
    plans: (list: string) => `Plans: ${list}.`,
    niches: 'Industry pages',
    faq: 'Frequently asked questions',
    pages: 'More pages',
    updated: 'Updated',
    home: 'Home',
  },
  breadcrumb: {
    label: 'Breadcrumb',
    home: 'Home',
    niches: 'Industries',
    pricing: 'Pricing',
    blog: 'Blog',
  },
  faq: {
    tag: 'FAQ',
    h2: 'What people ask us most',
    items: homeFaq,
  },
};

export default en;
