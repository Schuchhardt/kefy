'use client';

// ─── Multi-network preview ──────────────────────────────────────────────────
// Renders the content being edited as it would appear on each social network.
// A tab bar (one icon per relevant network) switches the active network; for
// carousels/reels the active slide/scene is driven from the parent so that
// clicking a slide in the editor updates this preview.

import { useState } from 'react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { PostPreview } from './PostPreview';
import { SlideCanvas } from './CarouselPreview';
import { ImageGeneratingSpinner } from './ImageGeneratingSpinner';
import { safeAreaFor } from '@/lib/preview-layout';
import type { ContentChannel } from '@/types/ai';
import type { CarouselSlide, ReelScene, ContentType } from '@/types/content';

/** Networks worth showing per format. Square formats (post/carousel) map to the
 *  native PostPreview chrome; vertical formats (reel/story) share a lighter
 *  vertical frame since the media is identical across networks. */
const NETWORKS: Record<ContentType, string[]> = {
  post:     ['instagram', 'facebook', 'linkedin', 'twitter', 'threads', 'tiktok'],
  carousel: ['instagram', 'facebook', 'linkedin', 'tiktok'],
  reel:     ['instagram', 'tiktok', 'facebook'],
  story:    ['instagram', 'facebook', 'tiktok'],
};

const NET_LABEL: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn',
  twitter: 'X', threads: 'Threads', tiktok: 'TikTok',
};

interface NetworkPreviewProps {
  contentType:    ContentType;
  defaultChannel: string;
  body:           string | null;
  imageUrl:       string | null;
  videoUrl:       string | null;
  hashtags:       string[];
  slides:         Array<CarouselSlide | ReelScene>;
  activeSlide:    number;
  onActiveSlideChange: (idx: number) => void;
  username:       string;
  logoUrl?:       string | null;
  /** True while the cover image is still being generated in the background
   *  (no imageUrl yet, but it's not a failure — shows a spinner instead of
   *  the plain text-only fallback). */
  imagePending?:  boolean;
  accentColor?:   string;
  /** Redes a mostrar. Por defecto, las relevantes para el formato; el modal de
   *  publicación pasa sólo las de las cuentas elegidas. */
  networks?:      string[];
}

export function NetworkPreview({
  contentType, defaultChannel, body, imageUrl, videoUrl, hashtags,
  slides, activeSlide, onActiveSlideChange, username, logoUrl,
  imagePending, accentColor, networks: networksProp,
}: NetworkPreviewProps) {
  const relevant = NETWORKS[contentType];
  const narrowed = (networksProp ?? []).filter((n) => relevant.includes(n));
  const networks = narrowed.length > 0 ? narrowed : relevant;
  // Default to the item's own channel when it's in the relevant set.
  const initial = networks.includes(defaultChannel) ? defaultChannel : networks[0];
  const [channel, setChannel] = useState(initial);

  const total = slides.length;
  const idx = Math.min(Math.max(activeSlide, 0), Math.max(total - 1, 0));
  const slide = slides[idx];

  return (
    <div>
      {/* ── Network tabs ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {networks.map((net) => {
          const active = net === channel;
          return (
            <button
              key={net}
              type="button"
              onClick={() => setChannel(net)}
              title={NET_LABEL[net] ?? net}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'rgba(198,255,75,0.12)' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <ChannelIcon name={net} size={18} />
            </button>
          );
        })}
      </div>

      {/* ── Framed preview ───────────────────────────── */}
      {contentType === 'post' && channel === 'tiktok' && (
        <TikTokFrame username={username} logoUrl={logoUrl} caption={body ?? ''}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          ) : imagePending ? (
            <ImageGeneratingSpinner accentColor={accentColor} height="100%" />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #080810 0%, #0d0d1c 100%)' }} />
          )}
        </TikTokFrame>
      )}

      {contentType === 'post' && channel !== 'tiktok' && (
        <PostPreview
          channel={channel}
          body={body}
          imageUrl={imageUrl}
          hashtags={hashtags}
          username={username}
          logoUrl={logoUrl ?? undefined}
          media={!imageUrl && imagePending ? (
            <ImageGeneratingSpinner accentColor={accentColor} />
          ) : undefined}
        />
      )}

      {contentType === 'carousel' && (
        total === 0 ? (
          <EmptyFrame />
        ) : channel === 'tiktok' ? (
          // TikTok no muestra el carrusel en un feed cuadrado: lo muestra a
          // pantalla completa con su propia interfaz encima del contenido.
          <>
            <TikTokFrame username={username} logoUrl={logoUrl} caption={body ?? ''}>
              <SlideCanvas slide={slide} index={idx} total={total} platform="tiktok" format="carousel" />
            </TikTokFrame>
            {total > 1 && <SlideDots total={total} idx={idx} onSelect={onActiveSlideChange} />}
          </>
        ) : (
          <PostPreview
            channel={channel}
            body={body}
            hashtags={hashtags}
            username={username}
            logoUrl={logoUrl ?? undefined}
            media={<SlideCanvas slide={slide} index={idx} total={total} platform={channel as ContentChannel} format="carousel" />}
            mediaFooter={
              total > 1 ? (
                <SlideDots total={total} idx={idx} onSelect={onActiveSlideChange} />
              ) : null
            }
          />
        )
      )}

      {contentType === 'reel' && (() => {
        const media = videoUrl
          ? <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <ReelSceneCanvas scene={slide as ReelScene | undefined} channel={channel as ContentChannel} />;
        return channel === 'tiktok' ? (
          <TikTokFrame username={username} logoUrl={logoUrl} caption={body || slide?.title || ''}>{media}</TikTokFrame>
        ) : (
          <VerticalNetworkFrame channel={channel} caption={body || slide?.title || ''} username={username} logoUrl={logoUrl}>
            {media}
          </VerticalNetworkFrame>
        );
      })()}

      {contentType === 'reel' && total > 1 && (
        <SlideDots total={total} idx={idx} onSelect={onActiveSlideChange} />
      )}

      {contentType === 'story' && (() => {
        const media = videoUrl
          ? <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #a18cd1 0%, #fbc2eb 100%)' }} />;
        return channel === 'tiktok' ? (
          <TikTokFrame username={username} logoUrl={logoUrl} caption={body ?? ''}>{media}</TikTokFrame>
        ) : (
          <VerticalNetworkFrame channel={channel} caption={body ?? ''} username={username} logoUrl={logoUrl}>
            {media}
          </VerticalNetworkFrame>
        );
      })()}
    </div>
  );
}

// ─── Slide dots (clickable) ──────────────────────────────────────────────────

function SlideDots({ total, idx, onSelect }: { total: number; idx: number; onSelect: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '8px 0 2px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          style={{
            height: 6, width: i === idx ? 18 : 6, borderRadius: 3,
            background: i === idx ? 'var(--accent)' : 'var(--border)',
            cursor: 'pointer', transition: 'width 0.2s ease, background 0.2s ease',
          }}
        />
      ))}
    </div>
  );
}

// ─── Marco de TikTok ─────────────────────────────────────────────────────────
// TikTok dibuja su interfaz ENCIMA del contenido: la columna de avatar / me
// gusta / comentarios / compartir a la derecha, y el @usuario con la
// descripción y la música abajo. El preview los reproduce a escala para que se
// vea qué parte de la imagen queda tapada — es el mismo espacio que
// `safeAreaFor('tiktok', …)` le reserva al texto en el servidor.

function TikTokAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ color: '#fff', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>{icon}</div>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{label}</span>
    </div>
  );
}

export function TikTokFrame({
  username, logoUrl, caption, children,
}: {
  username: string;
  logoUrl?: string | null;
  caption:  string;
  children: React.ReactNode;
}) {
  const safe = safeAreaFor('tiktok', 'carousel');

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', background: '#000' }}>
        {children}

        {/* Pestañas superiores */}
        <div style={{
          position: 'absolute', top: 10, left: 0, right: 0, display: 'flex',
          justifyContent: 'center', gap: 14, fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          <span>Siguiendo</span>
          <span style={{ color: '#fff', borderBottom: '2px solid #fff', paddingBottom: 2 }}>Para ti</span>
        </div>

        {/* Columna de acciones (derecha) */}
        <div style={{
          position: 'absolute', right: 0, bottom: `${safe.bottom * 100}%`,
          width: `${safe.right * 100}%`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          paddingBottom: 8, pointerEvents: 'none',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
            border: '1.5px solid #fff', background: '#1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{username[0]?.toUpperCase()}</span>
            )}
          </div>
          <TikTokAction label="12.4K" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z"/></svg>
          } />
          <TikTokAction label="318" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          } />
          <TikTokAction label="86" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 2 11 13 2 9l20-7zM11 13l4 9 7-20"/></svg>
          } />
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, #333, #111)', border: '2px solid rgba(255,255,255,0.25)',
          }} />
        </div>

        {/* Usuario + descripción + música (abajo) */}
        <div style={{
          position: 'absolute', left: 0, right: `${safe.right * 100}%`, bottom: 0,
          padding: '0 10px 10px', boxSizing: 'border-box', pointerEvents: 'none',
        }}>
          <p style={{
            margin: '0 0 3px', fontSize: 12, fontWeight: 800, color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
          }}>@{username}</p>
          {caption && (
            <p style={{
              margin: '0 0 4px', fontSize: 11, color: 'rgba(255,255,255,0.92)', lineHeight: 1.35,
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{caption}</p>
          )}
          <p style={{
            margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.85)',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
          }}>♪ sonido original — {username}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Vertical (9:16) network frame for reels & stories ───────────────────────

function VerticalNetworkFrame({
  channel, caption, username, logoUrl, children,
}: {
  channel:  string;
  caption:  string;
  username: string;
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', background: '#000' }}>
        {children}
        {/* Network badge */}
        <span style={{
          position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.55)', color: '#fff',
          borderRadius: 6, padding: '3px 7px',
        }}>
          <ChannelIcon name={channel} size={12} />
          {NET_LABEL[channel] ?? channel}
        </span>
        {caption && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 14px 14px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}>
            <p style={{
              margin: 0, fontSize: 12, color: '#fff', lineHeight: 1.4, textShadow: '0 1px 6px rgba(0,0,0,0.6)',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{caption}</p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{username[0]?.toUpperCase()}</span>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{username}</span>
      </div>
    </div>
  );
}

/** A single reel scene rendered full-bleed with its overlaid title/body. */
function ReelSceneCanvas({ scene, channel = 'instagram' }: { scene?: ReelScene; channel?: ContentChannel }) {
  const safe = safeAreaFor(channel, 'reel');
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {scene?.image_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)' }} />
        </>
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #080810 0%, #0d0d1c 45%, #080814 100%)' }} />
      )}
      {/* El texto se mantiene dentro de la zona que la red no tapa con su UI. */}
      <div style={{
        position: 'absolute', top: '38%',
        left: `${safe.left * 100}%`, right: `${safe.right * 100}%`,
        display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center',
      }}>
        {scene?.title && (
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>{scene.title}</p>
        )}
        {scene?.body && (
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.88)', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>{scene.body}</p>
        )}
      </div>
    </div>
  );
}

function EmptyFrame() {
  return (
    <div style={{
      width: '100%', aspectRatio: '1 / 1', borderRadius: 10,
      border: '1px dashed var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--muted)', fontSize: 13,
    }}>—</div>
  );
}
