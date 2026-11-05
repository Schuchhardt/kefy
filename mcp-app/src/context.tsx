import { createContext, useContext } from 'react';
import es from '@/locales/es/mcp-app';
import en from '@/locales/en/mcp-app';
import type { McpAppCopy } from '@/locales/es/mcp-app';
import type { Host } from './host';
import type { Lang } from './format';

export const COPY: Record<Lang, McpAppCopy> = { es, en };

export type ToastKind = 'info' | 'error' | 'success';

export interface ViewEnv {
  host: Host;
  t: McpAppCopy;
  lang: Lang;
  /** Locale BCP 47 para Intl (el del host, o el idioma de la vista). */
  locale: string;
  timeZone?: string;
  toast: (message: string, kind?: ToastKind) => void;
}

export const EnvContext = createContext<ViewEnv | null>(null);

export function useEnv(): ViewEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error('EnvContext missing');
  return env;
}
