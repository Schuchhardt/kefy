'use client';

import type { ContentType } from '@/types/content';

// ─── Static, illustrative mockups explaining each content format ─────────────
// No real data — just enough visual shape (single image, stacked slides,
// vertical video, story ring) so someone who doesn't know the terms yet can
// tell a post apart from a carousel/reel/story at a glance.

const COPY: Record<ContentType, { es: [string, string]; en: [string, string] }> = {
  post: {
    es: ['Publicación', 'Una imagen + texto en el feed'],
    en: ['Post', 'One image + text on the feed'],
  },
  carousel: {
    es: ['Carrusel', 'Varias imágenes que se deslizan'],
    en: ['Carousel', 'Several images the viewer swipes through'],
  },
  reel: {
    es: ['Reel', 'Video corto vertical'],
    en: ['Reel', 'Short vertical video'],
  },
  story: {
    es: ['Story', 'Contenido efímero de 24h'],
    en: ['Story', 'Ephemeral content, visible for 24h'],
  },
};

function PostMock() {
  return (
    <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, background: 'linear-gradient(135deg, #667eea, #764ba2)' }} />
      <div style={{ height: 12, background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
        <div style={{ width: '70%', height: 2, borderRadius: 1, background: 'var(--muted)' }} />
      </div>
    </div>
  );
}

function CarouselMock() {
  return (
    <div style={{ width: 56, height: 56, position: 'relative' }}>
      {['#f093fb', '#4facfe', '#43e97b'].map((c, i) => (
        <div
          key={c}
          style={{
            position: 'absolute', width: 40, height: 48, borderRadius: 8,
            border: '1px solid var(--border)', background: `linear-gradient(135deg, ${c}, #ffffff22)`,
            left: i * 8, top: i * 2, boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        />
      ))}
    </div>
  );
}

function ReelMock() {
  return (
    <div style={{
      width: 34, height: 56, borderRadius: 8, border: '1px solid var(--border)',
      background: 'linear-gradient(180deg, #fa709a, #fee140)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
    }}>
      <span style={{ fontSize: 16, color: '#fff' }}>▶</span>
    </div>
  );
}

function StoryMock() {
  return (
    <div style={{
      width: 34, height: 56, borderRadius: 8, border: '1px solid var(--border)',
      background: 'linear-gradient(180deg, #a18cd1, #fbc2eb)',
      position: 'relative', margin: '0 auto',
    }}>
      <div style={{ position: 'absolute', top: 4, left: 4, right: 4, display: 'flex', gap: 2 }}>
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.9)' }} />
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.4)' }} />
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.4)' }} />
      </div>
    </div>
  );
}

const MOCKS: Record<ContentType, () => React.JSX.Element> = {
  post: PostMock,
  carousel: CarouselMock,
  reel: ReelMock,
  story: StoryMock,
};

interface FormatExampleProps {
  format: ContentType;
  lang: 'es' | 'en';
  compact?: boolean;
}

export default function FormatExample({ format, lang, compact }: FormatExampleProps) {
  const Mock = MOCKS[format];
  const [title, desc] = COPY[format][lang];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Mock />
      </div>
      {!compact && (
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.3 }}>{desc}</p>
        </div>
      )}
    </div>
  );
}
