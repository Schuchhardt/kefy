'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import { ReelPlayer } from '@/components/dashboard/ReelPlayer';
import type { ReelSceneProps } from '@/remotion/ReelComposition';

// Lazy-load MuxPlayer to avoid SSR — it accesses browser APIs
const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
  loading: () => (
    <div style={{ ...playerContainerStyle(480), background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Cargando reproductor…</span>
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MuxReelPlayerProps {
  itemId:             string;
  scenes:             ReelSceneProps[];
  muxPlaybackId?:     string | null;
  renderStatus?:      'not_rendered' | 'rendering' | 'ready' | 'error' | null;
  brandName?:         string;
  accentColor?:       string;
  primaryColor?:      string;
  fontHeading?:       string;
  logoUrl?:           string;
  height?:            number;
  hideRenderButton?:  boolean;
  autoPlay?:          boolean;
  onRenderStart?:     (itemId: string) => void;
  onRenderDone?:      (itemId: string, playbackId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerContainerStyle(height: number): React.CSSProperties {
  const width = Math.round(height * (9 / 16));
  return {
    width, height,
    margin:       '0 auto',
    borderRadius: 14,
    overflow:     'hidden',
    position:     'relative',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MuxReelPlayer({
  itemId,
  scenes,
  muxPlaybackId,
  renderStatus,
  brandName,
  accentColor = '#c6ff4b',
  primaryColor,
  fontHeading,
  logoUrl,
  height = 480,
  hideRenderButton = false,
  autoPlay = false,
  onRenderStart,
  onRenderDone,
}: MuxReelPlayerProps) {
  const [isRendering, setIsRendering] = useState(renderStatus === 'rendering');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [localPlaybackId, setLocalPlaybackId] = useState<string | null>(muxPlaybackId ?? null);
  const [pollCount, setPollCount] = useState(0);

  const status = isRendering ? 'rendering' : localPlaybackId ? 'ready' : renderStatus ?? 'not_rendered';

  // ── Poll for render completion ─────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    if (!isRendering) return;
    try {
      const res  = await fetch(`/api/content/reel/render?itemId=${itemId}`, { credentials: 'include' });
      const data = await res.json() as { render_status?: string; mux_playback_id?: string };

      if (data.render_status === 'ready' && data.mux_playback_id) {
        setLocalPlaybackId(data.mux_playback_id);
        setIsRendering(false);
        onRenderDone?.(itemId, data.mux_playback_id);
      } else if (data.render_status === 'error') {
        setIsRendering(false);
        setRenderError('El render falló. Intenta de nuevo.');
      } else {
        // Still processing — poll again after 4 seconds
        const nextPoll = pollCount + 1;
        setPollCount(nextPoll);
        if (nextPoll < 60) {  // max ~4 minutes
          setTimeout(pollStatus, 4000);
        } else {
          setIsRendering(false);
          setRenderError('El render tardó demasiado. Inténtalo de nuevo.');
        }
      }
    } catch {
      setTimeout(pollStatus, 6000);
    }
  }, [itemId, isRendering, pollCount, onRenderDone]);

  // ── Trigger render ─────────────────────────────────────────────────────────
  const handleRender = useCallback(async () => {
    setIsRendering(true);
    setRenderError(null);
    setPollCount(0);
    onRenderStart?.(itemId);

    try {
      const res  = await fetch('/api/content/reel/render', {
        method:  'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId }),
      });
      const data = await res.json() as { mux_playback_id?: string; error?: string };

      if (!res.ok) {
        setIsRendering(false);
        setRenderError(data.error ?? 'Error al iniciar el render');
        return;
      }

      // If the API returned immediately with playbackId (sync render)
      if (data.mux_playback_id) {
        setLocalPlaybackId(data.mux_playback_id);
        setIsRendering(false);
        onRenderDone?.(itemId, data.mux_playback_id);
      } else {
        // Async render — start polling
        setTimeout(pollStatus, 5000);
      }
    } catch (err) {
      setIsRendering(false);
      setRenderError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }, [itemId, pollStatus, onRenderStart, onRenderDone]);

  const containerStyle = playerContainerStyle(height);

  // ── Mux video ready ────────────────────────────────────────────────────────
  if (localPlaybackId) {
    return (
      <div>
        <div style={containerStyle}>
          {/* @ts-ignore - MuxPlayer types vary across versions */}
          <MuxPlayer
            playbackId={localPlaybackId}
            streamType="on-demand"
            style={{ width: '100%', height: '100%' }}
            accentColor={accentColor}
            thumbnailTime={1}
            muted={autoPlay}
            autoPlay={autoPlay}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, color: '#4ade80', fontWeight: 600,
            background: '#4ade8018', border: '1px solid #4ade8030',
            padding: '3px 10px', borderRadius: 20,
          }}>
            ● Video listo en Mux
          </span>
          <a
            href={`https://stream.mux.com/${localPlaybackId}.m3u8`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
          >
            HLS ↗
          </a>
        </div>
      </div>
    );
  }

  // ── Rendering in progress ──────────────────────────────────────────────────
  if (status === 'rendering') {
    return (
      <div>
        <div style={{
          ...containerStyle,
          background: '#0a0a0f',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: `3px solid ${accentColor}30`,
            borderTop: `3px solid ${accentColor}`,
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', margin: 0 }}>
            Renderizando video…<br />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              Esto puede tomar 1-3 minutos
            </span>
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Remotion browser preview + render button ──────────────────────────────
  return (
    <div>
      <ReelPlayer
        scenes={scenes}
        height={height}
        brandName={brandName}
        accentColor={accentColor}
        primaryColor={primaryColor}
        fontHeading={fontHeading}
        logoUrl={logoUrl}
      />

      {renderError && (
        <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 8 }}>{renderError}</p>
      )}

      {!hideRenderButton && (
        <>
          <button
            onClick={handleRender}
            disabled={isRendering}
            style={{
              width: '100%', marginTop: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}10)`,
              border: `1px solid ${accentColor}60`,
              color: accentColor,
              borderRadius: 10, padding: '12px 0',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: isRendering ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 16 }}>▶</span>
            Renderizar y subir a Mux
          </button>

          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
            Genera el MP4 final en alta calidad y lo aloja en Mux
          </p>
        </>
      )}
    </div>
  );
}
