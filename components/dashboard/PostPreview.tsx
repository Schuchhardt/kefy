'use client';

import { useState, type ReactNode } from 'react';
import Icon from '@/components/ui/icons';
import { aspectLimitsFor } from '@/lib/image-fit';
import type { ContentChannel } from '@/types/ai';
import { previewCopy } from './CarouselPreview';

// La interfaz de cada red (acciones, «Seguir», «Me gusta»…) es una imitación
// visual: va con aria-hidden y sin botones de verdad. Antes eran <button> que
// no hacían nada pero recibían el foco, y dentro del formulario de publicar
// un <button> sin `type` envía el formulario.

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Feed image that previews exactly what will be published: the photo keeps its
 * own aspect ratio while it is inside the network's accepted range, and is only
 * cropped when it falls outside — the same rule `lib/image-fit.ts` applies
 * server-side. Previously every preview was a hard `object-fit: cover` crop, so
 * a 1080×1350 Instagram-ready photo looked cut in the app even when it wasn't.
 */
function FeedImage({ src, channel, radius = 0, alt }: {
  src:      string;
  channel:  ContentChannel;
  radius?:  number;
  alt:      string;
}) {
  const [natural, setNatural] = useState<number | null>(null);
  const { min, max } = aspectLimitsFor(channel);
  const ratio = natural === null ? null : Math.min(max, Math.max(min, natural));

  return (
    <div style={{
      position: 'relative', width: '100%',
      aspectRatio: ratio === null ? undefined : `${ratio}`,
      overflow: 'hidden', background: '#000',
      borderRadius: radius || undefined,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setNatural(img.naturalWidth / img.naturalHeight);
        }}
        style={{ width: '100%', height: ratio === null ? 'auto' : '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

interface AvatarProps {
  logoUrl?:     string | null;
  username:     string;
  size?:        number;
  gradientRing?: boolean;
}

function Avatar({ logoUrl, username, size = 36, gradientRing = false }: AvatarProps) {
  const inner = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={username}
      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
    />
  ) : (
    <div
      style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      }}
    >
      {username[0]?.toUpperCase()}
    </div>
  );

  if (gradientRing) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', padding: 2, flexShrink: 0,
        background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
      }}>
        {inner}
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)', background: '#1a1a1a' }}>
      {inner}
    </div>
  );
}

/** Renders body text with #hashtags highlighted in the platform's accent color. */
// Enlaces y hashtags en --info: el azul de X (#1d9bf0) sobre blanco da 3:1,
// por debajo del 4.5:1 que pide el texto normal.
function RichText({ text, color = 'var(--text)', hashColor = 'var(--info)', fontSize = 14 }: {
  text: string; color?: string; hashColor?: string; fontSize?: number;
}) {
  const parts = text.split(/(#\w+)/g);
  return (
    <span style={{ fontSize, color, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
      {parts.map((part, i) =>
        part.startsWith('#')
          ? <span key={i} style={{ color: hashColor }}>{part}</span>
          : part,
      )}
    </span>
  );
}

/** Pulgar arriba («Me gusta» de LinkedIn y Facebook): no está en el set de iconos. */
function ThumbUpIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function BookmarkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Fila de reacciones de LinkedIn/Facebook (imitación, no interactiva). */
function ReactionBar({ items, padding }: { items: Array<{ icon: ReactNode; label: string }>; padding: string }) {
  return (
    <div aria-hidden="true" style={{ borderTop: '1px solid var(--border)', display: 'flex', padding: '0 4px' }}>
      {items.map(({ icon, label }) => (
        <span
          key={label}
          style={{
            flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            color: 'var(--muted)', fontSize: 12, fontWeight: 600, padding,
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}
        >
          {icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </span>
      ))}
    </div>
  );
}

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const cardStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
  overflow: 'hidden', fontFamily: SYSTEM_FONT, marginBottom: 16, ...extra,
});

// ─── Channel renderers ────────────────────────────────────────────────────────

function InstagramPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const caption = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={cardStyle()}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10 }}>
        <Avatar logoUrl={logoUrl} username={username} size={36} gradientRing />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>Instagram · {t.now}</p>
        </div>
        <Icon name="more" size={18} style={{ color: 'var(--muted)' }} />
      </div>
      {/* Image / placeholder */}
      {media ? (
        <div style={{ position: 'relative', width: '100%' }}>{media}</div>
      ) : imageUrl ? (
        <FeedImage src={imageUrl} channel="instagram" alt={t.imageAlt} />
      ) : (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000' }}>
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, boxSizing: 'border-box' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.3, margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.25)', overflowWrap: 'anywhere' }}>{body}</p>
          </div>
        </div>
      )}
      {mediaFooter}
      {/* Actions (imitación) */}
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 14, color: 'var(--text)' }}>
        <Icon name="heart" size={22} strokeWidth={2} />
        <Icon name="inbox" size={22} strokeWidth={2} />
        <Icon name="send" size={22} strokeWidth={2} />
        <div style={{ flex: 1 }} />
        <BookmarkIcon />
      </div>
      {/* Caption */}
      {caption && (
        <div style={{ padding: '4px 12px 14px', fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{username} </span>
          <RichText text={caption} hashColor="var(--info)" fontSize={13} />
        </div>
      )}
    </div>
  );
}

function LinkedInPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const handle = username.toLowerCase().replace(/\s+/g, '');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join('\n');
  return (
    <div style={cardStyle()}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 14px 10px', gap: 10 }}>
        <Avatar logoUrl={logoUrl} username={username} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: '1px 0', fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{handle} · {t.firstDegree}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {t.now} · <Icon name="globe" size={11} />
          </p>
        </div>
        <span aria-hidden="true" style={{ border: '1px solid var(--net-linkedin-link)', color: 'var(--net-linkedin-link)', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
          + {t.follow}
        </span>
      </div>
      {/* Body */}
      {fullText && (
        <div style={{ padding: '0 14px 12px', fontSize: 14, lineHeight: 1.55 }}>
          <RichText text={fullText} hashColor="var(--net-linkedin-link)" fontSize={14} />
        </div>
      )}
      {/* Image */}
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        <FeedImage src={imageUrl} channel="linkedin" alt={t.imageAlt} />
      )}
      {/* Reactions (imitación) */}
      <ReactionBar
        padding="10px 0"
        items={[
          { icon: <ThumbUpIcon />, label: t.like },
          { icon: <Icon name="comment" size={16} />, label: t.comment },
          { icon: <Icon name="refresh" size={16} />, label: t.repost },
          { icon: <Icon name="send" size={16} />, label: t.send },
        ]}
      />
    </div>
  );
}

function TwitterPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={cardStyle()}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar logoUrl={logoUrl} username={username} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{username}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1d9bf0" aria-hidden="true" focusable="false"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.33 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.26-2.52.8-3.91c1.32-.67 2.2-1.91 2.2-3.34z" /></svg>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>@{handle} · 2h</span>
          </div>
          {/* Tweet text */}
          {fullText && <div style={{ marginBottom: (imageUrl || media) ? 10 : 0 }}><RichText text={fullText} hashColor="var(--info)" fontSize={15} /></div>}
          {/* Image */}
          {media ? (
            <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 8 }}>{media}{mediaFooter}</div>
          ) : imageUrl && (
            <div style={{ marginTop: 8 }}>
              <FeedImage src={imageUrl} channel="twitter" radius={14} alt={t.imageAlt} />
            </div>
          )}
          {/* Actions (imitación) */}
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, maxWidth: 300, color: 'var(--muted)', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="inbox" size={18} strokeWidth={2} />42</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="refresh" size={18} strokeWidth={2} />18</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="heart" size={18} strokeWidth={2} />126</span>
            <span style={{ display: 'flex', alignItems: 'center' }}><Icon name="send" size={18} strokeWidth={2} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadsPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={cardStyle()}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <Avatar logoUrl={logoUrl} username={username} size={38} />
          <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--border)', marginTop: 6 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{handle}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>· 2h</span>
          </div>
          {fullText && <div style={{ marginBottom: (imageUrl || media) ? 10 : 0 }}><RichText text={fullText} hashColor="var(--info)" fontSize={14} /></div>}
          {media ? (
            <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>{media}{mediaFooter}</div>
          ) : imageUrl && (
            <div style={{ marginTop: 8 }}>
              <FeedImage src={imageUrl} channel="threads" radius={10} alt={t.imageAlt} />
            </div>
          )}
          <div aria-hidden="true" style={{ display: 'flex', gap: 16, marginTop: 10, color: 'var(--muted)' }}>
            <Icon name="heart" size={18} />
            <Icon name="comment" size={18} />
            <Icon name="refresh" size={18} />
            <Icon name="send" size={18} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={cardStyle()}>
      <div style={{ padding: '12px 14px 8px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar logoUrl={logoUrl} username={username} size={40} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {t.now} · <Icon name="globe" size={12} />
          </p>
        </div>
        <Icon name="more" size={18} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
      </div>
      {fullText && (
        <div style={{ padding: '0 14px 10px', fontSize: 14 }}>
          <RichText text={fullText} hashColor="var(--net-facebook-link)" fontSize={14} />
        </div>
      )}
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        <FeedImage src={imageUrl} channel="facebook" alt={t.imageAlt} />
      )}
      <ReactionBar
        padding="10px 0"
        items={[
          { icon: <ThumbUpIcon />, label: t.like },
          { icon: <Icon name="comment" size={16} />, label: t.comment },
          { icon: <Icon name="share" size={16} />, label: t.share },
        ]}
      />
    </div>
  );
}

function TikTokPost({ body, imageUrl, hashtags, username, logoUrl, media, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  const actions: Array<[ReactNode, string]> = [
    [<Icon key="h" name="heart" size={26} strokeWidth={2} />, '12.4K'],
    [<Icon key="c" name="comment" size={26} strokeWidth={2} />, '843'],
    [<BookmarkIcon key="b" size={26} />, '2.1K'],
    [<Icon key="s" name="share" size={26} strokeWidth={2} />, '3.2K'],
  ];
  return (
    <div style={cardStyle({ background: '#000', position: 'relative' })}>
      {/* Background image or gradient */}
      <div style={{ aspectRatio: '9 / 16', position: 'relative', background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)', overflow: 'hidden', maxHeight: 420 }}>
        {media ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{media}</div>
        ) : imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={t.imageAlt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
        )}
        {/* Right action bar (imitación) */}
        <div aria-hidden="true" style={{ position: 'absolute', right: 10, bottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, color: '#fff' }}>
          <Avatar logoUrl={logoUrl} username={username} size={42} />
          {actions.map(([icon, count]) => (
            <div key={count} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {icon}
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{count}</span>
            </div>
          ))}
        </div>
        {/* Bottom caption */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 52, padding: '12px 12px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#fff' }}>@{handle}</p>
          {fullText && <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>{fullText.slice(0, 120)}{fullText.length > 120 ? '…' : ''}</p>}
        </div>
      </div>
    </div>
  );
}

function GenericPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter, lang }: PostPreviewProps) {
  const t = previewCopy(lang);
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={cardStyle()}>
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar logoUrl={logoUrl} username={username} size={36} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{t.now}</span>
      </div>
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        <FeedImage src={imageUrl} channel="generic" alt={t.imageAlt} />
      )}
      {fullText && (
        <div style={{ padding: '10px 14px 14px', fontSize: 14 }}>
          <RichText text={fullText} hashColor="var(--accent-text)" fontSize={14} />
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface PostPreviewProps {
  channel:   string;
  body:      string | null;
  imageUrl?: string | null;
  hashtags:  string[];
  username:  string;
  logoUrl?:  string | null;
  /** Custom media node rendered in place of `imageUrl` — lets carousel slides
   *  (see `SlideCanvas`) reuse each network's chrome. */
  media?:    React.ReactNode;
  /** Extra node rendered right under the media (slide dots, counters…). */
  mediaFooter?: React.ReactNode;
  /** Idioma de la interfaz simulada («Ahora», «Seguir», «Me gusta»…). */
  lang?:     'es' | 'en';
}

export function PostPreview(props: PostPreviewProps) {
  switch (props.channel) {
    case 'instagram': return <InstagramPost {...props} />;
    case 'linkedin':  return <LinkedInPost  {...props} />;
    case 'twitter':   return <TwitterPost   {...props} />;
    case 'threads':   return <ThreadsPost   {...props} />;
    case 'facebook':  return <FacebookPost  {...props} />;
    case 'tiktok':    return <TikTokPost    {...props} />;
    default:          return <GenericPost   {...props} />;
  }
}
