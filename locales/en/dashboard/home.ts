import type { HomeCopy } from '../../es/dashboard/home';

const en: HomeCopy = {
  loading: 'Loading…',
  hello: (name: string) => `Hi, ${name}`,
  helloAnonymous: 'Hi',
  intro: (org: string) => `Kefy creates ${org}'s posts and you decide which ones go out.`,
  introNoOrg: 'Kefy creates your posts and you decide which ones go out.',
  create: 'Create content',

  plan: {
    trialActive: (n: number) => (n === 1 ? '1 day left in your trial' : `${n} days left in your trial`),
    trialActiveDesc: "You're on Starter for free. Pick a plan before it ends so your content doesn't stop.",
    trialLastDay: 'Your trial ends today',
    trialEnded: 'Your free month has ended',
    trialEndedDesc: 'Everything you made is still here. Pick a plan to generate and publish again.',
    paymentFailed: "We couldn't process your payment",
    paymentFailedDesc: 'Update your payment method to keep creating.',
    creditsLow: (n: number, total: number) => `${n} of ${total} AI credits left`,
    creditsLowDesc: 'When they run out, generation pauses until your next cycle.',
    creditsOut: (total: number) => `You've used all ${total} AI credits this month`,
    creditsOutDesc: 'Upgrade your plan to keep generating this month.',
    viewPlans: 'View plans',
  },

  welcome: {
    title: 'Getting started',
    progress: (done: number, total: number) => `${done} of ${total} done`,
    hide: 'Hide',
    hideLabel: 'Hide the getting started list',
    done: 'Done',
    pending: 'Pending',
    steps: {
      posts: {
        title: 'Create your first posts',
        desc: 'Paste your website or describe your business and Kefy writes 3 on-brand posts.',
        cta: 'Create my 3 posts',
      },
      brand: {
        title: 'Complete your brand',
        desc: 'Tone, colors, audience… so what Kefy writes sounds like you.',
        descPercent: (n: number) => `It's ${n}% complete. Tone, colors, audience… so what Kefy writes sounds like you.`,
        cta: 'Complete my brand',
      },
      social: {
        title: 'Connect an account',
        desc: 'Instagram, LinkedIn, TikTok and more, to publish from Kefy.',
        cta: 'Connect accounts',
      },
      publish: {
        title: 'Publish or schedule a post',
        desc: 'Pick a draft, review it and publish it or schedule it.',
        cta: 'See my content',
      },
    },
  },

  metrics: {
    title: 'Summary (last 30 days)',
    sync: 'Sync metrics',
    syncing: 'Syncing…',
    impressions: 'Impressions',
    reach: 'Reach',
    likes: 'Likes',
    comments: 'Comments',
    shares: 'Shares',
    clicks: 'Clicks',
    noAccounts: 'Connect an account to see your metrics.',
    connect: 'Connect accounts',
  },

  recent: {
    title: 'Recent content',
    all: 'See all',
    empty: "You don't have any content yet.",
    perf: (impressions: string, likes: string) => `${impressions} impressions · ${likes} likes`,
    video: 'Video',
  },

  top: {
    title: 'Top performing',
    perf: (impressions: string, likes: string, rate: string) =>
      `${impressions} impressions · ${likes} likes · ${rate} engagement`,
  },

  quick: {
    title: 'Shortcuts',
    brand: { label: 'My brand', desc: 'Identity, market and strategy' },
    content: { label: 'Create content', desc: 'AI posts, carousels, reels and stories' },
    inbox: { label: 'Inbox', desc: 'DMs and comments from your accounts' },
    automations: { label: 'Automate', desc: 'Autopilot and auto-replies' },
  },
};

export default en;
