// Aviso tras reenviar un contenido editado a sus publicaciones programadas
// (EditContentModal → onScheduledSync). Lo usan el detalle y la lista.

import { NET_LABEL } from '@/components/dashboard/NetworkPreview';
import type { ScheduledSyncResult } from '@/types/content';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';

const COPY = { es: esPublish, en: enPublish } as const;

export function scheduledSyncNotice(
  result: ScheduledSyncResult | null,
  lang: 'es' | 'en',
): { tone: 'success' | 'warning'; text: string } | null {
  const t = COPY[lang].scheduled;
  if (!result) return { tone: 'warning', text: t.syncError };
  if (result.failed.length > 0) {
    const nets = [...new Set(result.failed.map((f) => (f.platform ? NET_LABEL[f.platform] ?? f.platform : '?')))].join(', ');
    return { tone: 'warning', text: t.syncFailed(nets) };
  }
  if (result.updated > 0) return { tone: 'success', text: t.syncOk(result.updated) };
  return null;
}
