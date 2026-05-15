'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['who'];
}

export default function WhoSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [gridRef, gridSeen] = useReveal();

  return (
    <section className="section" id="who">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">
            {copy.h2[0]}{' '}
            <em className="em">{copy.h2[1]}</em>{' '}
            {copy.h2[2]}
          </h2>
        </div>

        <div
          ref={gridRef as React.RefObject<HTMLDivElement>}
          className={`who-grid reveal${gridSeen ? ' is-in' : ''}`}
        >
          {copy.segments.map((seg, i) => (
            <div key={i} className="who-card" style={{ transitionDelay: `${i * 0.08}s` }}>
              <div className="who-ic">{seg.ic}</div>
              <div>
                <h3>{seg.t}</h3>
                <p>{seg.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
