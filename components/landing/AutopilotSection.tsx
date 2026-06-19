'use client';

import { useState } from 'react';
import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['autopilot'];
}

export default function AutopilotSection({ copy }: Props) {
  const [mode, setMode] = useState<'pilot' | 'manual'>('pilot');
  const [headRef, headSeen] = useReveal();
  const [calRef, calSeen] = useReveal();
  const isPilot = mode === 'pilot';

  return (
    <section className="section autopilot-section" id="autopilot">
      <div className="autopilot-bg" />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="autopilot-grid">
          {/* Left */}
          <div>
            <div
              ref={headRef as React.RefObject<HTMLDivElement>}
              className={`reveal${headSeen ? ' is-in' : ''}`}
            >
              <span className="label">{copy.tag}</span>
              <h2 className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2[0]}
                <br />
                <em className="em">{copy.h2[1]}</em>
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <div className="autopilot-bullets" style={{ marginTop: '28px' }}>
              {/* Toggle */}
              <div className="ap-toggle">
                <button
                  className={`ap-toggle-btn${isPilot ? ' active' : ''}`}
                  onClick={() => setMode('pilot')}
                >
                  {isPilot && <span className="ap-toggle-dot" />}
                  {copy.togglePilot}
                </button>
                <button
                  className={`ap-toggle-btn${!isPilot ? ' active' : ''}`}
                  onClick={() => setMode('manual')}
                >
                  {!isPilot && <span className="ap-toggle-dot" />}
                  {copy.toggleManual}
                </button>
              </div>

              {copy.bullets.map((b, i) => (
                <div key={i} className="autopilot-bullet">
                  <div className="ic">{b.ic}</div>
                  {b.t}
                </div>
              ))}

              <p className="autopilot-closer">{copy.closer}</p>
            </div>
          </div>

          {/* Right: Calendar */}
          <div
            ref={calRef as React.RefObject<HTMLDivElement>}
            className={`autopilot-cal reveal${calSeen ? ' is-in' : ''}`}
            style={{ transitionDelay: '0.15s' }}
          >
            <div className="autopilot-cal-head">
              <div className="ac-title">Content calendar</div>
              <div className="ac-mode">
                <div className={`ac-pulse${isPilot ? ' on' : ''}`} />
                {isPilot ? copy.togglePilot : copy.toggleManual}
              </div>
            </div>

            <div className="autopilot-cal-grid">
              {copy.schedule.map((day, di) => (
                <div key={di} className="autopilot-cal-day">
                  <div className="acd-day">{day.day}</div>
                  <div className="acd-items">
                    {day.items.map((item, ii) => (
                      <div
                        key={ii}
                        className={`acd-item${isPilot ? ' auto' : ''}`}
                      >
                        <span className="acd-ic">{item.ic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
