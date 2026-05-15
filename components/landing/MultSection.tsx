'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['mult'];
}

export default function MultSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [vizRef, vizSeen] = useReveal();
  const [bulletsRef, bulletsSeen] = useReveal();

  return (
    <section className="section" id="multiply">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">
            {copy.h2[0]}
            <br />
            <em className="em">{copy.h2[1]}</em>
          </h2>
          <p className="intro">{copy.sub}</p>
        </div>

        {/* Visual */}
        <div
          ref={vizRef as React.RefObject<HTMLDivElement>}
          className={`mult-viz reveal${vizSeen ? ' is-in' : ''}`}
        >
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
        <div
          ref={bulletsRef as React.RefObject<HTMLDivElement>}
          className={`mult-bullets reveal${bulletsSeen ? ' is-in' : ''}`}
        >
          {copy.bullets.map((b, i) => (
            <div key={i} className="mult-bullet" style={{ transitionDelay: `${i * 0.07}s` }}>
              <div className="ic">{b.ic}</div>
              {b.t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
