'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type React from 'react';

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
  /** S3 URL of the rendered MP4 (preferred). */
  videoUrl?:        string | null;
  /** Legacy: Mux playback ID (backward compat for older renders). */
  muxPlaybackId?:   string | null;
  renderStatus?:    'not_rendered' | 'rendering' | 'ready' | 'error' | null;
  accentColor?:     string;
  height?:          number;
  autoPlay?:        boolean;
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

function containerStyle(height: number): React.CSSProperties {
  const width = Math.round(height * (9 / 16));
  return {
    width, height,
    margin:       '0 auto',
    borderRadius: 14,
    overflow:     'hidden',
    position:     'relative',
    background:   '#000',
  };
}

// Resolve the initial local URL from whichever prop is available
function resolveInitialUrl(videoUrl?: string | null, muxPlaybackId?: string | null): string | null {
  if (videoUrl) return videoUrl;
  if (muxPlaybackId) return `mux:${muxPlaybackId}`; // sentinel for Mux legacy
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MuxReelPlayer({
  itemId,
  videoUrl,
  muxPlaybackId,
  renderStatus,
  accentColor = '#c6ff4b',
  height = 480,
  autoPlay = false,
  onRenderStart,
  onRenderDone,
}: MuxReelPlayerProps) {
  const [localUrl, setLocalUrl]     = useState<string | null>(() => resolveInitialUrl(videoUrl, muxPlaybackId));
  const [isRendering, setIsRendering] = useState(renderStatus === 'rendering');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [progress, setProgress]       = useState<number>(0);

  const isRenderingRef  = useRef(renderStatus === 'rendering');
  const pollCountRef    = useRef(0);
  const hasTriggeredRef = useRef(false);

  const isMuxLegacy = localUrl?.startsWith('mux:') ?? false;
  const muxId       = isMuxLegacy ? localUrl!.slice(4) : null;

  // ── Poll for render completion ─────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    if (!isRenderingRef.current) return;
    try {
      const res  = await fetch(`/api/content/reel/render?itemId=${itemId}`, { credentials: 'include' });
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
        setRenderError('El render falló. Inténtalo de nuevo.');
      } else {
        pollCountRef.current += 1;
        if (pollCountRef.current < 90) {
          setTimeout(pollStatus, 4000);
        } else {
          isRenderingRef.current = false;
          setIsRendering(false);
          setRenderError('El render tardó demasiado. Inténtalo de nuevo.');
        }
      }
    } catch {
      if (isRenderingRef.current) setTimeout(pollStatus, 6000);
    }
  }, [itemId, onRenderDone]);

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
        body:        JSON.stringify({ itemId }),
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
        setRenderError(data.error ?? 'Error al iniciar el render');
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
      setRenderError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }, [itemId, pollStatus, onRenderStart, onRenderDone]);

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

  const cs = containerStyle(height);

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
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  // ── Video ready (Mux legacy) ───────────────────────────────────────────────
  if (isMuxLegacy && muxId) {
    return (
      <div style={cs}>
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
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (renderError) {
    return (
      <div style={{ ...cs, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚠️</span>
        <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', margin: 0, padding: '0 16px' }}>
          {renderError}
        </p>
        <button
          onClick={() => { hasTriggeredRef.current = false; setRenderError(null); startRender(); }}
          style={{
            background: 'transparent', border: `1px solid ${accentColor}60`,
            color: accentColor, borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Loading / rendering ────────────────────────────────────────────────────
  return (
    <div style={{ ...cs, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: `3px solid ${accentColor}30`,
        borderTop: `3px solid ${accentColor}`,
        animation: 'spin 1s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', margin: 0 }}>
        {isRendering ? 'Generando video…' : 'Iniciando…'}
      </p>
      <div style={{ width: '80%', background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.round((isRendering ? Math.max(progress, 0.02) : 0.02) * 100)}%`,
          background: accentColor,
          borderRadius: 99,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: 0 }}>
        {isRendering ? `${Math.round(Math.max(progress, 0) * 100)}%` : ''}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
