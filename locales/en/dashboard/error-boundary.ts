import type { ErrorBoundaryCopy } from '@/locales/es/dashboard/error-boundary';

const en: ErrorBoundaryCopy = {
  title: 'This section failed',
  body: 'The error was logged. Retry or head to another dashboard section.',
  retry: 'Retry',
  home: 'Go to home',
  reference: (id: string) => `Error reference: ${id}`,
};

export default en;
