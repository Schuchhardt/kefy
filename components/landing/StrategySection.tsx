'use client';

import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['strategy'];
}

export default function StrategySection({ copy }: Props) {
  const openWaitlist = useWaitlistOpen();

  return (
    <section
      style={{
        padding: 'clamp(64px, 10vw, 120px) clamp(20px, 6vw, 80px)',
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 'clamp(48px, 6vw, 80px)' }}>
        <span
          style={{
            display:       'inline-block',
            background:    'rgba(198,255,75,0.1)',
            border:        '1px solid rgba(198,255,75,0.25)',
            borderRadius:  100,
            padding:       '6px 16px',
            fontSize:      12,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--accent)',
            marginBottom:  20,
          }}
        >
          {copy.tag}
        </span>
        <h2
          style={{
            fontFamily:  'var(--font-syne)',
            fontSize:    'clamp(28px, 4vw, 48px)',
            fontWeight:  800,
            lineHeight:  1.15,
            color:       'var(--text)',
            margin:      '0 auto 20px',
            maxWidth:    680,
          }}
        >
          {copy.h2}
        </h2>
        <p
          style={{
            fontSize:   'clamp(15px, 2vw, 18px)',
            color:      'var(--muted)',
            lineHeight: 1.7,
            maxWidth:   600,
            margin:     '0 auto',
          }}
        >
          {copy.sub}
        </p>
      </div>

      {/* ── Objectives grid ── */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap:                 16,
          marginBottom:        'clamp(40px, 5vw, 64px)',
        }}
      >
        {copy.objectives.map((obj) => (
          <div
            key={obj.slug}
            style={{
              background:   'var(--surface)',
              border:       '1px solid var(--border)',
              borderRadius: 14,
              padding:      '22px 20px',
              transition:   'border-color .15s ease',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(198,255,75,0.4)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)')
            }
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{obj.ic}</div>
            <div
              style={{
                fontSize:    15,
                fontWeight:  700,
                color:       'var(--text)',
                marginBottom: 6,
              }}
            >
              {obj.t}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              {obj.d}
            </div>
          </div>
        ))}
      </div>

      {/* ── Industries pills ── */}
      <div style={{ marginBottom: 'clamp(40px, 5vw, 64px)' }}>
        <p
          style={{
            fontSize:      12,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--muted)',
            marginBottom:  18,
            textAlign:     'center',
          }}
        >
          {copy.industriesTitle}
        </p>
        <div
          style={{
            display:        'flex',
            flexWrap:       'wrap',
            gap:            10,
            justifyContent: 'center',
          }}
        >
          {copy.industries.map((ind) => (
            <div
              key={ind.t}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:           8,
                background:   'var(--surface)',
                border:       '1px solid var(--border)',
                borderRadius:  100,
                padding:       '9px 18px',
                fontSize:      14,
                color:         'var(--text)',
              }}
            >
              <span>{ind.ic}</span>
              <span>{ind.t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interaction layers ── */}
      <div style={{ marginBottom: 'clamp(48px, 6vw, 72px)' }}>
        <p
          style={{
            fontSize:      12,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--muted)',
            marginBottom:  24,
            textAlign:     'center',
          }}
        >
          {copy.layersTitle}
        </p>
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap:                 16,
          }}
        >
          {copy.layers.map((layer) => (
            <div
              key={layer.num}
              style={{
                background:   'var(--surface)',
                border:       '1px solid var(--border)',
                borderRadius: 14,
                padding:      '24px 22px',
              }}
            >
              <div
                style={{
                  fontSize:      11,
                  fontWeight:    700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color:         'var(--accent)',
                  marginBottom:  8,
                }}
              >
                {layer.num}
              </div>
              <div
                style={{
                  fontSize:     16,
                  fontWeight:   700,
                  color:        'var(--text)',
                  marginBottom: 14,
                  fontFamily:   'var(--font-syne)',
                }}
              >
                {layer.t}
              </div>
              <ul
                style={{
                  margin:      0,
                  paddingLeft: 18,
                  color:       'var(--muted)',
                  fontSize:    13,
                  lineHeight:  1.8,
                }}
              >
                {layer.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={openWaitlist}
          style={{
            background:   'var(--accent)',
            color:        '#000',
            border:       'none',
            borderRadius: 12,
            padding:      '14px 32px',
            fontSize:     15,
            fontWeight:   700,
            cursor:       'pointer',
            transition:   'opacity .15s ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.85')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
        >
          {copy.cta}
        </button>
      </div>
    </section>
  );
}
