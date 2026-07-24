'use client';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
function RichText({ text, color = 'var(--text)', hashColor = '#1d9bf0', fontSize = 14 }: {
  text: string; color?: string; hashColor?: string; fontSize?: number;
}) {
  const parts = text.split(/(#\w+)/g);
  return (
    <span style={{ fontSize, color, lineHeight: 1.55 }}>
      {parts.map((part, i) =>
        part.startsWith('#')
          ? <span key={i} style={{ color: hashColor }}>{part}</span>
          : part,
      )}
    </span>
  );
}

// ─── Channel renderers ────────────────────────────────────────────────────────

function InstagramPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const caption = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10 }}>
        <Avatar logoUrl={logoUrl} username={username} size={36} gradientRing />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>Instagram · Ahora</p>
        </div>
        <span style={{ fontSize: 18, color: 'var(--muted)', cursor: 'pointer', padding: '0 4px' }}>•••</span>
      </div>
      {/* Image / placeholder */}
      {media ? (
        <div style={{ position: 'relative', width: '100%' }}>{media}</div>
      ) : (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000' }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="post" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, boxSizing: 'border-box' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.3, margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>{body}</p>
            </div>
          )}
        </div>
      )}
      {mediaFooter}
      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 14 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        <div style={{ flex: 1 }} />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
      </div>
      {/* Caption */}
      {caption && (
        <div style={{ padding: '4px 12px 14px', fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{username} </span>
          <RichText text={caption} hashColor="#1d9bf0" fontSize={13} />
        </div>
      )}
    </div>
  );
}

function LinkedInPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const handle = username.toLowerCase().replace(/\s+/g, '');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join('\n');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 14px 10px', gap: 10 }}>
        <Avatar logoUrl={logoUrl} username={username} size={44} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: '1px 0', fontSize: 12, color: 'var(--muted)' }}>@{handle} · 1er grado</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', opacity: 0.7 }}>Ahora · 🌐</p>
        </div>
        <button style={{ background: 'transparent', border: '1px solid #0a66c2', color: '#0a66c2', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          + Seguir
        </button>
      </div>
      {/* Body */}
      {fullText && (
        <div style={{ padding: '0 14px 12px', fontSize: 14, lineHeight: 1.55 }}>
          <RichText text={fullText} hashColor="#0a66c2" fontSize={14} />
        </div>
      )}
      {/* Image */}
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="post" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
      )}
      {/* Reactions */}
      <div style={{ padding: '8px 14px 4px', borderTop: '1px solid var(--border)', display: 'flex', gap: 0 }}>
        {['👍 Me gusta', '💬 Comentar', '🔁 Repostear', '✈️ Enviar'].map((label) => (
          <button key={label} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TwitterPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar logoUrl={logoUrl} username={username} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{username}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.33 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.26-2.52.8-3.91c1.32-.67 2.2-1.91 2.2-3.34z" /></svg>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>@{handle} · 2h</span>
          </div>
          {/* Tweet text */}
          {fullText && <div style={{ marginBottom: (imageUrl || media) ? 10 : 0 }}><RichText text={fullText} hashColor="#1d9bf0" fontSize={15} /></div>}
          {/* Image */}
          {media ? (
            <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 8 }}>{media}{mediaFooter}</div>
          ) : imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="post" style={{ width: '100%', borderRadius: 14, display: 'block', maxHeight: 280, objectFit: 'cover', marginTop: 8 }} />
          )}
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, maxWidth: 300 }}>
            {[
              <><svg key="a" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span style={{fontSize:13,color:'var(--muted)',marginLeft:4}}>42</span></>,
              <><svg key="b" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><span style={{fontSize:13,color:'var(--muted)',marginLeft:4}}>18</span></>,
              <><svg key="c" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span style={{fontSize:13,color:'var(--muted)',marginLeft:4}}>126</span></>,
              <svg key="d" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
            ].map((icon, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>{icon}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadsPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <Avatar logoUrl={logoUrl} username={username} size={38} />
          <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--border)', marginTop: 6 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>@{handle}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· 2h</span>
          </div>
          {fullText && <div style={{ marginBottom: (imageUrl || media) ? 10 : 0 }}><RichText text={fullText} hashColor="#1d9bf0" fontSize={14} /></div>}
          {media ? (
            <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>{media}{mediaFooter}</div>
          ) : imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="post" style={{ width: '100%', borderRadius: 10, display: 'block', maxHeight: 260, objectFit: 'cover', marginTop: 8 }} />
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {['♡', '↩', '⟳', '✈'].map((icon, i) => (
              <span key={i} style={{ fontSize: 18, color: 'var(--muted)', cursor: 'pointer' }}>{icon}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      <div style={{ padding: '12px 14px 8px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar logoUrl={logoUrl} username={username} size={40} />
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{username}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Ahora · 🌐</p>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--muted)', cursor: 'pointer' }}>•••</span>
      </div>
      {fullText && (
        <div style={{ padding: '0 14px 10px', fontSize: 14 }}>
          <RichText text={fullText} hashColor="#0866ff" fontSize={14} />
        </div>
      )}
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="post" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
      )}
      <div style={{ borderTop: '1px solid var(--border)', display: 'flex' }}>
        {['👍 Me gusta', '💬 Comentar', '↗ Compartir'].map((label) => (
          <button key={label} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '10px 0' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TikTokPost({ body, imageUrl, hashtags, username, logoUrl, media }: PostPreviewProps) {
  const handle = username.toLowerCase().replace(/\s+/g, '_');
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: '#000', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16, position: 'relative' }}>
      {/* Background image or gradient */}
      <div style={{ aspectRatio: '9 / 16', position: 'relative', background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)', overflow: 'hidden', maxHeight: 420 }}>
        {media ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{media}</div>
        ) : imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="post" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
        )}
        {/* Right action bar */}
        <div style={{ position: 'absolute', right: 10, bottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <Avatar logoUrl={logoUrl} username={username} size={42} />
          {[['♥', '12.4K'], ['💬', '843'], ['🔖', '2.1K'], ['↗', '3.2K']].map(([icon, count]) => (
            <div key={icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 26, cursor: 'pointer' }}>{icon}</span>
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

function GenericPost({ body, imageUrl, hashtags, username, logoUrl, media, mediaFooter }: PostPreviewProps) {
  const fullText = [body, ...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))].filter(Boolean).join(' ');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', marginBottom: 16 }}>
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar logoUrl={logoUrl} username={username} size={36} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{username}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>Ahora</span>
      </div>
      {media ? (
        <div style={{ width: '100%' }}>{media}{mediaFooter}</div>
      ) : imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="post" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
      )}
      {fullText && (
        <div style={{ padding: '10px 14px 14px', fontSize: 14 }}>
          <RichText text={fullText} hashColor="var(--accent)" fontSize={14} />
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
