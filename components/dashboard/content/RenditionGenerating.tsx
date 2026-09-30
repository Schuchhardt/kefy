'use client';

// ─── Estado "generando" de una conversión de formato ────────────────────────
// Antes, al pulsar «Generar versión de carrusel», lo único que cambiaba era el
// texto del botón a «Generando…». La petición tarda entre medio minuto y dos
// minutos, sin barra ni indicio de avance: parecía colgado y la gente volvía a
// pulsar o cerraba el modal.
//
// Acá se muestra el esqueleto de la pieza que se está construyendo (con la
// forma real del formato destino), una barra con progreso estimado por tiempo
// y el paso en el que va. El progreso es una estimación honesta: el endpoint
// no reporta avance, así que la barra se frena en 95 % hasta que responde de
// verdad — nunca llega a 100 % antes de tiempo.

import { useEffect, useState } from 'react';
import GenerationLoader from '@/components/ui/GenerationLoader';
import { toLocale } from '@/lib/i18n';
import { networkFrame } from '@/lib/preview-layout';
import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

/** Duración típica de cada conversión, medida sobre generaciones reales. */
export const ESTIMATED_MS: Record<ContentType, number> = {
  post:     35_000,
  story:    35_000,
  carousel: 95_000,
  reel:     95_000,
};

/** Tope hasta el que sube la barra mientras no haya respuesta del servidor. */
const MAX_ESTIMATED = 0.95;

/**
 * Progreso estimado a partir del tiempo transcurrido.
 * Exportado para poder testear la curva sin montar el componente.
 */
export function estimateProgress(elapsedMs: number, estimatedMs: number): number {
  if (estimatedMs <= 0) return MAX_ESTIMATED;
  return Math.min(MAX_ESTIMATED, elapsedMs / estimatedMs);
}

/** Índice del paso que corresponde a un progreso dado. */
export function stepIndexFor(progress: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(stepCount - 1, Math.floor((progress / MAX_ESTIMATED) * stepCount));
}

function Shimmer({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      // Con --text: el brillo se ve en tema oscuro y en claro (antes era
      // blanco sobre un marco casi negro fijo, una mancha oscura en claro).
      background: 'linear-gradient(90deg, color-mix(in srgb, var(--text) 5%, transparent) 25%, color-mix(in srgb, var(--text) 12%, transparent) 37%, color-mix(in srgb, var(--text) 5%, transparent) 63%)',
      backgroundSize: '400% 100%',
      animation: 'kefy-shimmer 1.4s ease infinite',
      borderRadius: 6,
      ...style,
    }} />
  );
}

/** Esqueleto con la forma real del formato que se está generando. */
function FormatSkeleton({ format, channel }: { format: ContentType; channel: ContentChannel }) {
  const frame = networkFrame(channel, format);
  const isMultiPart = format === 'carousel' || format === 'reel';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: frame.css,
        background: 'var(--surface-2)', borderRadius: 10, overflow: 'hidden',
      }}>
        <Shimmer style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
        {/* Bloque de texto donde va a ir el título/cuerpo del slide */}
        <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '10%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Shimmer style={{ height: 14, width: '70%' }} />
          <Shimmer style={{ height: 9,  width: '90%' }} />
          <Shimmer style={{ height: 9,  width: '55%' }} />
        </div>
      </div>

      {isMultiPart && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} style={{ height: 6, width: i === 0 ? 18 : 6, borderRadius: 3 }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Shimmer style={{ height: 10, width: '85%' }} />
        <Shimmer style={{ height: 10, width: '60%' }} />
      </div>
    </div>
  );
}

export function RenditionGenerating({
  format,
  lang,
  channel = 'instagram',
  accentColor,
  estimatedMs,
}: {
  format:       ContentType;
  lang:         'es' | 'en';
  channel?:     ContentChannel;
  accentColor?: string;
  /** Sólo para tests: acorta la estimación. */
  estimatedMs?: number;
}) {
  const total = estimatedMs ?? ESTIMATED_MS[format];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(id);
  }, [format]);

  const t        = toLocale(lang) === 'en' ? enT : esT;
  const progress = estimateProgress(elapsed, total);
  const steps    = t.renditionSteps[format];
  const step     = steps[stepIndexFor(progress, steps.length)];

  const remaining = Math.max(0, Math.ceil((total - elapsed) / 1000));
  const hint = remaining > 0 ? t.renditionEta(remaining) : t.renditionAlmost;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        border: '1px solid var(--border)', borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      <FormatSkeleton format={format} channel={channel} />
      <GenerationLoader
        progress={progress}
        label={step}
        hint={hint}
        tone="surface"
        accentColor={accentColor}
        fullWidthBar
        size={34}
      />
      <style>{`@keyframes kefy-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }`}</style>
    </div>
  );
}
