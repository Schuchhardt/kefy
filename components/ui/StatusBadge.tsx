// Pastilla de estado (borrador, programado, publicado…) con los colores de
// lib/status.ts y el texto de locales/*/dashboard/common.ts.

import type { CSSProperties } from 'react';
import { statusColors } from '@/lib/status';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const LABELS = { es: esCommon.status, en: enCommon.status };

export default function StatusBadge({
  status, lang, style,
}: {
  status: string;
  lang: string;
  style?: CSSProperties;
}) {
  const labels = LABELS[lang === 'en' ? 'en' : 'es'] as Record<string, string>;
  const { color, background } = statusColors(status);
  return (
    <span
      className="ui-badge"
      style={{ ['--badge-color' as string]: color, ['--badge-bg' as string]: background, ...style }}
    >
      {labels[status] ?? status}
    </span>
  );
}
