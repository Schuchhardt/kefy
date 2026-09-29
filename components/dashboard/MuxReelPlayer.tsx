'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type React from 'react';
import GenerationLoader from '@/components/ui/GenerationLoader';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';

type MuxLegacyPlayerProps = {
  playbackId: string; streamType: string; style: React.CSSProperties;
  accentColor: string; thumbnailTime: number; muted: boolean; autoPlay: boolean;
};

// Dynamic import to keep Mux out of the main bundle
const MuxLegacyPlayer = dynamic(
  () => import('@mux/mux-player-react').then((m) => ({ default: m.default as unknown as React.ComponentType<MuxLegacyPlayerProps> })),
  { ssr: false },
) as unknown as React.ComponentType<MuxLegacyPlayerProps>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MuxReelPlayerProps {
  itemId:           string;
  /** Render target format when it differs from the item's own content_type
   *  (e.g. rendering a 'reel'/'story' rendition of a 'post'-primary item). */
  format?:          'reel' | 'story';
  /** S3 URL of the rendered MP4 (preferred). */
  videoUrl?:        string | null;
  /** Legacy: Mux playback ID (backward compat for older renders). */
  muxPlaybackId?:   string | null;
  renderStatus?:    'not_rendered' | 'rendering' | 'ready' | 'error' | null;
  accentColor?:     string;
  /** Alto preferido en px (el ancho sale de 9:16). En un contenedor más
   *  estrecho el reproductor se encoge manteniendo la proporción. */
  height?:          number;
  /** Tope de alto adicional en CSS (p. ej. `50dvh`), para que en un móvil el
   *  video no ocupe varias pantallas. */
  maxHeight?:       string;
  autoPlay?:        boolean;
  /** Idioma de los mensajes de estado (por defecto, español). */
  lang?:            'es' | 'en';
  onRenderStart?:   (itemId: string) => void;
  /** Callback receives the video URL (S3 or Mux) once ready. */
  onRenderDone?:    (itemId: string, videoUrl: string) => void;
  // Kept for backward compat — ignored
  scenes?:          unknown[];
  brandName?:       string;
  primaryColor?:    string;
  fontHeading?:     string;
  logoUrl?:         string;
  hideRenderButton?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fluido: nunca más ancho que su contenedor (antes `width` fijo = alto × 9/16:
// con `height={640}` medía 360px y desbordaba un móvil de 360px). El alto sale
// de la proporción, así que no se deforma.
function containerStyle(height: number, maxHeight?: string): React.CSSProperties {
  const width = Math.round(height * (9 / 16));
  const caps = [`${width}px`, '100%'];
  if (maxHeight) caps.push(`calc(${maxHeight} * 9 / 16)`);
  return {
    width:        `min(${caps.join(', ')})`,
    aspectRatio:  '9 / 16',
    margin:       '0 auto',
    borderRadius: 14,
    overflow:     'hidden',
    position:     'relative',
    background:   '#000',
  };
}

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

/** Error del render: un motivo conocido (se traduce al pintarlo) o el mensaje
 *  que devolvió el servidor. */
type RenderError =
  | { kind: 'failed' | 'interrupted' | 'timeout' | 'startError' | 'unknownError' }
  | { kind: 'message'; message: string };

// Resolve the initial local URL from whichever prop is available
function resolveInitialUrl(videoUrl?: string | null, muxPlaybackId?: string | null): string | null {
  if (videoUrl) return videoUrl;
  if (muxPlaybackId) return `mux:${muxPlaybackId}`; // sentinel for Mux legacy
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MuxReelPlayer({
  itemId,
  format,
  videoUrl,
  muxPlaybackId,
  renderStatus,
  accentColor = '#c6ff4b',
  height = 480,
  maxHeight,
  autoPlay = false,
  lang = 'es',
  onRenderStart,
  onRenderDone,
}: MuxReelPlayerProps) {
  const t = (lang === 'en' ? enPublish : esPublish).player;
  const [localUrl, setLocalUrl]     = useState<string | null>(() => resolveInitialUrl(videoUrl, muxPlaybackId));
  const [isRendering, setIsRendering] = useState(renderStatus === 'rendering');
  const [renderError, setRenderError] = useState<RenderError | null>(null);
  const [progress, setProgress]       = useState<number>(0);

  const isRenderingRef  = useRef(renderStatus === 'rendering');
  const pollCountRef    = useRef(0);
  const hasTriggeredRef = useRef(false);
  // Auto-restart of a render the server declared dead — capped to avoid loops.
  const restartCountRef = useRef(0);
  const startRenderRef  = useRef<(() => void) | null>(null);

  const isMuxLegacy = localUrl?.startsWith('mux:') ?? false;
  const muxId       = isMuxLegacy ? localUrl!.slice(4) : null;

  // ── Poll for render completion ─────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    if (!isRenderingRef.current) return;
    try {
      const qs = format ? `itemId=${itemId}&format=${format}` : `itemId=${itemId}`;
      const res  = await fetch(`/api/content/reel/render?${qs}`, { credentials: 'include' });
      const data = await res.json() as {
        render_status?: string;
        video_url?:     string;
        mux_playback_id?: string;
        progress?:      number;
      };

      if (typeof data.progress === 'number') setProgress(data.progress);

      const resolvedUrl = data.video_url ?? (data.mux_playback_id ? `mux:${data.mux_playback_id}` : null);

      if (data.render_status === 'ready' && resolvedUrl) {
        isRenderingRef.current = false;
        setProgress(1);
        setLocalUrl(resolvedUrl);
        setIsRendering(false);
        onRenderDone?.(itemId, data.video_url ?? data.mux_playback_id ?? '');
      } else if (data.render_status === 'error') {
        isRenderingRef.current = false;
        setIsRendering(false);
        setRenderError({ kind: 'failed' });
      } else if (data.render_status === 'not_rendered') {
        // The server found the render dead (trigger lost or stale) and reset the
        // row — polling it further would never finish. Start a fresh render,
        // once, so a persistently failing render can't loop forever.
        isRenderingRef.current = false;
        setIsRendering(false);
        setProgress(0);
        if (restartCountRef.current < 1) {
          restartCountRef.current += 1;
          startRenderRef.current?.();
        } else {
          setRenderError({ kind: 'interrupted' });
        }
      } else {
        pollCountRef.current += 1;
        if (pollCountRef.current < 90) {
          setTimeout(pollStatus, 4000);
        } else {
          isRenderingRef.current = false;
          setIsRendering(false);
          setRenderError({ kind: 'timeout' });
        }
      }
    } catch {
      if (isRenderingRef.current) setTimeout(pollStatus, 6000);
    }
  }, [itemId, format, onRenderDone]);

  // ── Start render ───────────────────────────────────────────────────────────
  const startRender = useCallback(async () => {
    isRenderingRef.current = true;
    pollCountRef.current   = 0;
    setIsRendering(true);
    setRenderError(null);
    onRenderStart?.(itemId);

    try {
      const res  = await fetch('/api/content/reel/render', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(format ? { itemId, format } : { itemId }),
      });
      const data = await res.json() as {
        video_url?:       string;
        mux_playback_id?: string;
        renderId?:        string;
        error?:           string;
      };

      if (!res.ok) {
        isRenderingRef.current = false;
        setIsRendering(false);
        setRenderError(data.error ? { kind: 'message', message: data.error } : { kind: 'startError' });
        return;
      }

      const resolvedUrl = data.video_url ?? (data.mux_playback_id ? `mux:${data.mux_playback_id}` : null);
      if (resolvedUrl) {
        // Already done (idempotent response)
        isRenderingRef.current = false;
        setLocalUrl(resolvedUrl);
        setIsRendering(false);
        onRenderDone?.(itemId, data.video_url ?? data.mux_playback_id ?? '');
      } else {
        // Async Lambda render — start polling
        setTimeout(pollStatus, 5000);
      }
    } catch (err) {
      isRenderingRef.current = false;
      setIsRendering(false);
      setRenderError(err instanceof Error && err.message ? { kind: 'message', message: err.message } : { kind: 'unknownError' });
    }
  }, [itemId, format, pollStatus, onRenderStart, onRenderDone]);

  // Keeps the poller able to restart a render without a circular dependency
  // between the two callbacks.
  useEffect(() => { startRenderRef.current = startRender; }, [startRender]);

  // ── Auto-render on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (hasTriggeredRef.current || localUrl || renderStatus === 'ready') return;
    hasTriggeredRef.current = true;
    if (renderStatus === 'rendering') {
      isRenderingRef.current = true;
      setTimeout(pollStatus, 4000);
    } else {
      startRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cs = containerStyle(height, maxHeight);

  // ── Video ready (S3 URL) ───────────────────────────────────────────────────
  if (localUrl && !isMuxLegacy) {
    return (
      <div style={cs}>
        <video
          src={localUrl}
          controls
          playsInline
          autoPlay={autoPlay}
          muted={autoPlay}
          style={{ ...fill, objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  // ── Video ready (Mux legacy) ───────────────────────────────────────────────
  if (isMuxLegacy && muxId) {
    return (
      <div style={cs}>
        <div style={fill}>
          <MuxLegacyPlayer
            playbackId={muxId}
            streamType="on-demand"
            style={{ width: '100%', height: '100%' }}
            accentColor={accentColor}
            thumbnailTime={1}
            muted={autoPlay}
            autoPlay={autoPlay}
          />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (renderError) {
    const message = renderError.kind === 'message' ? renderError.message : t[renderError.kind];
    return (
      <div
        role="alert"
        style={{
          ...cs, background: 'var(--surface-2)', border: '1px solid var(--danger-border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: 16, boxSizing: 'border-box',
        }}
      >
        <Icon name="alert" size={24} style={{ color: 'var(--danger)' }} />
        <p style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center', margin: 0, overflowWrap: 'anywhere' }}>
          {message}
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="refresh" size={14} />}
          onClick={() => { hasTriggeredRef.current = false; setRenderError(null); startRender(); }}
        >
          {t.retry}
        </Button>
      </div>
    );
  }

  // ── Loading / rendering ────────────────────────────────────────────────────
  return (
    <div style={{ ...cs, background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <GenerationLoader
        progress={isRendering ? Math.max(progress, 0) : 0.02}
        label={isRendering ? t.rendering : t.starting}
        accentColor={accentColor}
        showPercent={isRendering}
      />
    </div>
  );
}
