'use client';

// ─── Story preview ─────────────────────────────────────────────────────────
// Vertical 9:16 mockup matching Instagram/Facebook stories: a top progress
// bar, avatar + username header, and full-bleed media (video takes priority
// over the still image once a video has been generated/uploaded).

interface StoryPreviewProps {
  imageUrl?: string | null;
  videoUrl?: string | null;
  caption?:  string | null;
  username:  string;
  logoUrl?:  string | null;
  height?:   number;
}

export function StoryPreview({
  imageUrl, videoUrl, caption, username, logoUrl, height = 480,
}: StoryPreviewProps) {
  const width = Math.round(height * (9 / 16));

  return (
    <div style={{
      width, height, margin: '0 auto', borderRadius: 14, overflow: 'hidden',
      position: 'relative', background: '#000',
    }}>
      {videoUrl ? (
        <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #a18cd1 0%, #fbc2eb 100%)' }} />
      )}

      {/* Top progress bar (Instagram/Facebook story convention) */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 4 }}>
        <div style={{ flex: 1, height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.95)' }} />
      </div>

      {/* Header: avatar + username */}
      <div style={{ position: 'absolute', top: 18, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid rgba(255,255,255,0.85)',
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{username[0]?.toUpperCase()}</span>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
          {username}
        </span>
      </div>

      {/* Bottom gradient + caption */}
      {caption && (
        <>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
          }} />
          <p style={{
            position: 'absolute', bottom: 14, left: 14, right: 14, margin: 0,
            fontSize: 13, color: '#fff', lineHeight: 1.4, textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {caption}
          </p>
        </>
      )}
    </div>
  );
}
