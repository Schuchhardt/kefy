import type { CalendarCopy } from '@/locales/es/dashboard/calendar';

const en: CalendarCopy = {
  title: 'Calendar',
  subtitle: 'Schedule and manage your social media posts',
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as string[],
  dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as string[],
  today: 'Today',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  selectDayHint: 'Pick a day to see its posts or schedule something new.',
  scheduleBtn: 'Schedule',

  accountsLabel: 'Connected accounts',
  accountStatus: { active: 'Active', expired: 'Expired', revoked: 'Revoked' } as Record<string, string>,
  noAccounts: 'No accounts connected.',
  noAccountsHint: 'Connect your networks to publish and schedule.',
  noAccountsLink: 'Connect accounts',

  legendLabel: 'Status legend',
  dayLabel: (date: string, count: number) => (count === 0
    ? `${date}, no posts`
    : count === 1 ? `${date}, 1 post` : `${date}, ${count} posts`),
  morePosts: (n: number) => `+${n}`,
  scheduleOnDay: 'Schedule on this day',

  emptyDayTitle: 'Nothing scheduled on this day',
  emptyDayHint: 'Create a new piece or schedule one you already have.',
  emptyPastDayHint: 'This day has passed: anything you schedule will go out from now on.',
  createContent: 'Create content',
  scheduleExisting: 'Schedule existing content',

  agendaLabel: (month: string) => `${month} agenda`,
  agendaEmpty: (month: string) => `Nothing scheduled in ${month}`,
  agendaEmptyHint: 'Schedule a post or create new content.',

  loadError: "Couldn't load the calendar.",
  retry: 'Retry',
  noText: '(no text)',
  unknownAccount: 'Unknown account',
  cancelPost: 'Cancel post',
  cancelConfirmTitle: 'Cancel this scheduled post?',
  cancelConfirmMessage: "It won't be published. The content stays in your library and you can schedule it again.",
  cancelKeep: 'Keep it',
  cancelError: "Couldn't cancel the post. Please try again.",
};

export default en;
