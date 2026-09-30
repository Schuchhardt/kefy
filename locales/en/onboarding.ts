import type { OnboardingCopy } from '../es/onboarding';

const en: OnboardingCopy = {
  title: "Let's see how your business would look on social media",
  intro: 'Paste your website or tell us in one sentence what you do. Kefy will write 3 on-brand posts in under a minute.',
  urlLabel: 'Your business website',
  urlPlaceholder: 'yourbusiness.com',
  urlHint: 'We read your website to get your name, tone, colors and logo.',
  or: 'or',
  descriptionLabel: 'Your business in one sentence',
  descriptionPlaceholder: 'E.g.: Vegan bakery with home delivery in Austin',
  cost: (credits: number) => `Uses about ${credits} credits.`,
  costRemaining: (credits: number, remaining: number) =>
    `Uses about ${credits} credits (you have ${remaining} left this month).`,
  submit: 'Create my 3 posts',
  skip: 'Skip for now',
  noScript: 'This screen needs JavaScript. You can go straight to the dashboard.',
  goDashboard: 'Go to dashboard',
  working: {
    title: 'Creating your posts…',
    readingWeb: 'Reading your website',
    writing: 'Writing 3 posts in your voice',
    images: 'Creating the images',
    hint: "It usually takes less than a minute. Don't close this tab.",
  },
  done: {
    title: 'Your first 3 posts',
    intro: 'They are drafts: you can edit them, ask for another version or publish them once you connect your accounts.',
    angles: {
      intro: 'Introduction',
      tip: 'Useful tip',
      benefit: 'Why choose you',
    },
    imageLoading: 'Creating image…',
    imageError: "The image couldn't be created.",
    imageRetry: 'Create image',
    imageAlt: (angle: string) => `Image for the “${angle}” post`,
    edit: 'Edit',
    connectTitle: 'Publish them on your accounts',
    connectBody: 'Connect Instagram (or another network) and publish or schedule these posts from their detail page.',
    connect: 'Connect Instagram',
    otherNetworks: 'Other networks',
    completeBrand: 'Complete my brand',
    goDashboard: 'Go to dashboard',
    websiteFailed: "We couldn't read your website, so we used your description.",
    partial: (failed: number) =>
      failed === 1
        ? "One of the posts couldn't be created. You can create more from “Create content”."
        : `${failed} posts couldn't be created. You can create more from “Create content”.`,
    filled: (n: number) =>
      n === 1 ? 'We saved 1 detail about your brand.' : `We saved ${n} details about your brand.`,
  },
  errors: {
    empty: 'Paste your website or describe your business in one sentence.',
    generic: "The posts couldn't be created. Please try again.",
    network: 'Network error. Check your connection and try again.',
    plans: 'See plans',
  },
};

export default en;
