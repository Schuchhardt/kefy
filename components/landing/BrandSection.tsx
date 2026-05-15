import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['brand'];
}

const PALETTE = ['#F5F0E8', '#C6FF4B', '#1E1E24', '#08080A', '#FF8C42'];

export default function BrandSection({ copy }: Props) {
  return (
    <section className="section" id="brand">
      <div className="container">
        <div className="brand-grid">
          {/* Left */}
          <div>
            <div className="reveal">
              <span className="label">{copy.tag}</span>
              <h2 className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2[0]}{' '}
                <em className="em">{copy.h2[1]}</em>{' '}
                {copy.h2[2]}
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <div className="brand-bullets">
              {copy.bullets.map((b, i) => (
                <div key={i} className="brand-bullet">
                  <div className="ic">{b.ic}</div>
                  {b.t}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Brand kit visual */}
          <div
            className="brand-kit reveal"
            style={{ animationDelay: '0.15s' }}
          >
            <div className="brand-kit-head">
              <div className="brand-kit-title">Brand Kit · Trazo Studio</div>
              <div className="brand-kit-status">
                <div className="d" />
                active
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{copy.kit.palette}</div>
              <div className="brand-kit-v palette">
                {PALETTE.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{copy.kit.type}</div>
              <div style={{ fontSize: '13px' }}>{copy.kit.typeV}</div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{copy.kit.logo}</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 700,
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, rgba(198,255,75,0.3), rgba(255,140,66,0.2))',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '11px',
                  }}
                >
                  T
                </div>
                trazo.
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{copy.kit.tone}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {copy.kit.toneV}
              </div>
            </div>

            {/* Applied section */}
            <div className="brand-kit-apply">
              <div className="brand-kit-arrow" />
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-syne)',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  textAlign: 'center',
                  marginBottom: '10px',
                }}
              >
                Applied
              </div>
              <div className="brand-kit-applied">
                {['post', 'story', 'ad'].map((tag) => (
                  <div key={tag} className="bk-mini">
                    <div className="bk-mini-tag">{tag}</div>
                    <div
                      className="bk-mini-shape"
                      style={{
                        background: `linear-gradient(135deg, rgba(198,255,75,${0.1 + 0.05 * ['post','story','ad'].indexOf(tag)}), rgba(255,140,66,${0.06 + 0.04 * ['post','story','ad'].indexOf(tag)}))`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
