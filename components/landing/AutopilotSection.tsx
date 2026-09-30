'use client';

import { useState } from 'react';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['autopilot'];
}

export default function AutopilotSection({ copy }: Props) {
  const [mode, setMode] = useState<'pilot' | 'manual'>('pilot');
  const isPilot = mode === 'pilot';

  return (
    <section className="section autopilot-section" id="autopilot" aria-labelledby="autopilot-title">
      <div className="autopilot-bg" aria-hidden="true" />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="autopilot-grid">
          <div>
            <div className="reveal">
              <span className="label">{copy.tag}</span>
              <h2 id="autopilot-title" className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2[0]}
                <br />
                <em className="em">{copy.h2[1]}</em>
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <div className="autopilot-bullets" style={{ marginTop: '28px' }}>
              <div className="ap-toggle" role="group" aria-label={copy.modeLabel}>
                <button
                  type="button"
                  className={`ap-toggle-btn${isPilot ? ' active' : ''}`}
                  onClick={() => setMode('pilot')}
                  aria-pressed={isPilot}
                >
                  {isPilot && <span className="ap-toggle-dot" aria-hidden="true" />}
                  {copy.togglePilot}
                </button>
                <button
                  type="button"
                  className={`ap-toggle-btn${!isPilot ? ' active' : ''}`}
                  onClick={() => setMode('manual')}
                  aria-pressed={!isPilot}
                >
                  {!isPilot && <span className="ap-toggle-dot" aria-hidden="true" />}
                  {copy.toggleManual}
                </button>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {copy.bullets.map((b) => (
                  <li key={b.t} className="autopilot-bullet">
                    <span className="ic" aria-hidden="true">{b.ic}</span>
                    {b.t}
                  </li>
                ))}
              </ul>

              <p className="autopilot-closer">{copy.closer}</p>
            </div>
          </div>

          {/* Calendario de ejemplo: decorativo. */}
          <div className="autopilot-cal reveal" style={{ animationDelay: '0.15s' }} aria-hidden="true">
            <div className="autopilot-cal-head">
              <div className="ac-title">{copy.calendarTitle}</div>
              <div className="ac-mode">
                <div className={`ac-pulse${isPilot ? ' on' : ''}`} />
                {isPilot ? copy.togglePilot : copy.toggleManual}
              </div>
            </div>

            <div className="autopilot-cal-grid">
              {copy.schedule.map((day) => (
                <div key={day.day} className="autopilot-cal-day">
                  <div className="acd-day">{day.day}</div>
                  <div className="acd-items">
                    {day.items.map((item) => (
                      <div key={item.t} className={`acd-item${isPilot ? ' auto' : ''}`} title={item.t}>
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
