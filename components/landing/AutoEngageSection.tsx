'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['engage'];
}

export default function AutoEngageSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [rightRef, rightSeen] = useReveal();

  return (
    <section className="section" id="engage">
      <div className="container">
        <div className="brand-grid">
          {/* Left */}
          <div>
            <div
              ref={headRef as React.RefObject<HTMLDivElement>}
              className={`reveal${headSeen ? ' is-in' : ''}`}
            >
              <span className="label">{copy.tag}</span>
              <h2 className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2}
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <div className="brand-bullets" style={{ marginTop: '32px' }}>
              {copy.bullets.map((b, i) => (
                <div key={i} className="brand-bullet">
                  <div className="ic">{b.ic}</div>
                  {b.t}
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div
            ref={rightRef as React.RefObject<HTMLDivElement>}
            className={`reveal${rightSeen ? ' is-in' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* Scoring card */}
            <div className="engage-card">
              <p className="engage-card-title">{copy.scoringTitle}</p>
              <div className="engage-scoring-grid">
                {copy.scoringItems.map((item, i) => (
                  <div key={i} className="engage-score-row">
                    <span className="engage-score-type">{item.type}</span>
                    <span className="engage-score-pts">{item.pts}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline card */}
            <div className="engage-card">
              <p className="engage-card-title">{copy.pipelineTitle}</p>
              <div className="engage-pipeline">
                {copy.stages.map((stage, i) => (
                  <div key={i} className="engage-stage">
                    <span className="engage-stage-emoji">{stage.emoji}</span>
                    <span className="engage-stage-label">{stage.label}</span>
                    {i < copy.stages.length - 1 && (
                      <span className="engage-stage-arrow">→</span>
                    )}
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
