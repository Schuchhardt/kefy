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
}

export function NetworkPreview({
  contentType, defaultChannel, body, imageUrl, videoUrl, hashtags,
  slides, activeSlide, onActiveSlideChange, username, logoUrl,
}: NetworkPreviewProps) {
  const networks = NETWORKS[contentType];
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
      {(contentType === 'post') && (
        <PostPreview
          channel={channel}
          body={body}
          imageUrl={imageUrl}
          hashtags={hashtags}
          username={username}
          logoUrl={logoUrl ?? undefined}
        />
      )}

      {contentType === 'carousel' && (
        total > 0 ? (
          <PostPreview
            channel={channel}
            body={body}
            hashtags={hashtags}
            username={username}
            logoUrl={logoUrl ?? undefined}
            media={<SlideCanvas slide={slide} index={idx} total={total} />}
            mediaFooter={
              total > 1 ? (
                <SlideDots total={total} idx={idx} onSelect={onActiveSlideChange} />
              ) : null
            }
          />
        ) : (
          <EmptyFrame />
        )
      )}

      {contentType === 'reel' && (
        <VerticalNetworkFrame
          channel={channel}
          caption={body || slide?.title || ''}
          username={username}
          logoUrl={logoUrl}
        >
          {videoUrl ? (
            <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <ReelSceneCanvas scene={slide as ReelScene | undefined} />
          )}
        </VerticalNetworkFrame>
      )}

      {contentType === 'reel' && total > 1 && (
        <SlideDots total={total} idx={idx} onSelect={onActiveSlideChange} />
      )}

      {contentType === 'story' && (
        <VerticalNetworkFrame
          channel={channel}
          caption={body ?? ''}
          username={username}
          logoUrl={logoUrl}
        >
          {videoUrl ? (
            <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #a18cd1 0%, #fbc2eb 100%)' }} />
          )}
        </VerticalNetworkFrame>
      )}
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
function ReelSceneCanvas({ scene }: { scene?: ReelScene }) {
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
      <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
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
