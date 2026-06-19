import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['mult'];
}

export default function MultSection({ copy }: Props) {
  return (
    <section className="section" id="multiply">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">
            {copy.h2[0]}
            <br />
            <em className="em">{copy.h2[1]}</em>
          </h2>
          <p className="intro">{copy.sub}</p>
        </div>

        {/* Visual */}
        <div className="mult-viz reveal" style={{ animationDelay: '0.1s' }}>
          {/* Input */}
          <div>
            <div className="mult-input-lbl">{copy.inLbl}</div>
            <div className="mult-input-card">
              <div className="mult-input-thumb">
                <div className="mult-play">▶</div>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                  {copy.inV}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  kefy · AI
                </div>
              </div>
            </div>
          </div>

          {/* Fan SVG */}
          <div className="mult-fan">
            <svg viewBox="0 0 120 200" preserveAspectRatio="none">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <line
                  key={i}
                  x1="10"
                  y1="100"
                  x2="110"
                  y2={10 + i * 20}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}
              <circle cx="10" cy="100" r="5" fill="var(--accent)" />
            </svg>
          </div>

          {/* Outputs */}
          <div>
            <div className="mult-output-lbl">{copy.outLbl}</div>
            <div className="mult-output-grid">
              {copy.outputs.map((out, i) => (
                <div key={i} className="mult-output-card">
                  <div className="mult-output-k">{out.k}</div>
                  <div className="mult-output-sub">{out.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bullets */}
        <div className="mult-bullets reveal" style={{ animationDelay: '0.18s' }}>
          {copy.bullets.map((b, i) => (
            <div key={i} className="mult-bullet">
              <div className="ic">{b.ic}</div>
              {b.t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
