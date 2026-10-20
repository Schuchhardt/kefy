import type { VideoCopy } from '@/locales/es/dashboard/video';

const en: VideoCopy = {
  plan: {
    title: 'Production plan',
    intro: 'This script is produced in the cloud with these tools. Check the cost before producing it.',
    loading: 'Working out the plan…',
    loadError: 'Could not load the video plan.',
    shots: (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`,
    duration: (s: number) => `~${s} s`,
    characters: (names: string) => `Characters: ${names}`,
    motionLabel: 'Animation',
    motion: {
      none: 'No animation — photos with camera moves',
      key:  'Key shots — the hook and up to 3 animated shots',
      full: 'Every shot animated',
    },
    toolCount: (label: string, n: number) => `${label} ×${n}`,
    credits: (n: number) => `${n} credits`,
    total: (n: number) => `Total: ${n} credits`,
    remaining: (n: number) => `${n} left this month`,
    notEnough: "You don't have enough credits left this month: try less animation.",
    stepsToggle: (n: number) => `See all ${n} steps`,
    general: 'General',
    shot: (n: number) => `Shot ${n}`,
    fallback: 'If a step fails, that shot uses a fallback (a photo instead of a clip) and the video still comes out. Credits for a failed step are refunded.',
    produce: (n: number) => `Produce video · ${n} credits`,
  },
  progress: {
    tools: {
      generate_image: 'Image',
      text_to_speech: 'Voice',
      animate_image:  'Animation',
      lip_sync:       'Lip-sync',
      compose_video:  'Final edit',
    },
    shot: (n: number) => `shot ${n}`,
    title: 'Producing the video',
    stepsDone: (done: number, total: number) => `${done} of ${total} steps`,
    status: {
      pending: 'Queued',
      running: 'Running',
      done:    'Done',
      failed:  'Failed',
      skipped: 'Skipped',
    },
    composing: 'Editing the final video…',
    slow: 'Animations take a few minutes. You can close this page: the video keeps being produced.',
  },
};

export default en;
