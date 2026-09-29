import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['brand'];
}

const PALETTE = ['#F5F0E8', '#C6FF4B', '#1E1E24', '#08080A', '#FF8C42'];

// Maqueta del Brand Kit. Antes decía «Brand Kit · HiClothes» pero el logo y las
// miniaturas decían «trazo.», y «active»/«Applied» salían en inglés en la
// versión en español.
export default function BrandSection({ copy }: Props) {
  const kit = copy.kit;
  return (
    <section className="section" id="brand" aria-labelledby="brand-title">
      <div className="container">
        <div className="brand-grid">
          <div>
            <div className="reveal">
              <span className="label">{copy.tag}</span>
              <h2 id="brand-title" className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2[0]}{' '}
                <em className="em">{copy.h2[1]}</em>{' '}
                {copy.h2[2]}
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <ul className="brand-bullets" style={{ listStyle: 'none', padding: 0 }}>
              {copy.bullets.map((b) => (
                <li key={b.t} className="brand-bullet">
                  <span className="ic" aria-hidden="true">{b.ic}</span>
                  {b.t}
                </li>
              ))}
            </ul>
          </div>

          {/* Maqueta decorativa: se describe con el propio texto de la sección. */}
          <div className="brand-kit reveal" style={{ animationDelay: '0.15s' }} aria-hidden="true">
            <div className="brand-kit-head">
              <div className="brand-kit-title">{kit.title} · {kit.brandName}</div>
              <div className="brand-kit-status">
                <div className="d" />
                {kit.status}
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{kit.palette}</div>
              <div className="brand-kit-v palette">
                {PALETTE.map((c) => <span key={c} style={{ background: c }} />)}
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{kit.type}</div>
              <div style={{ fontSize: '13px' }}>{kit.typeV}</div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{kit.logo}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontFamily: 'var(--font-syne)', fontWeight: 700 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hiclothes_demo.png" alt="" width={28} height={28} style={{ borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover' }} />
                {kit.brandName}
              </div>
            </div>

            <div className="brand-kit-row">
              <div className="brand-kit-k">{kit.tone}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{kit.toneV}</div>
            </div>

            <div className="brand-kit-apply">
              <div className="brand-kit-arrow" />
              <div style={{ fontSize: '12px', fontFamily: 'var(--font-syne)', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: '10px' }}>
                {kit.applied}
              </div>
              <div className="brand-kit-applied">
                {kit.formats.map((tag, i) => (
                  <div key={tag} className="bk-mini">
                    <div className="bk-mini-tag">{tag}</div>
                    <div
                      className="bk-mini-shape"
                      data-brand={kit.brandName}
                      style={{ background: `linear-gradient(135deg, rgba(198,255,75,${0.1 + 0.05 * i}), rgba(255,140,66,${0.06 + 0.04 * i}))` }}
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
