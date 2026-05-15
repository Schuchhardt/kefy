'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['features'];
}

export default function FeaturesGrid({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [gridRef, gridSeen] = useReveal();

  return (
    <section className="section" id="features">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        <div
          ref={gridRef as React.RefObject<HTMLDivElement>}
          className={`fgrid reveal${gridSeen ? ' is-in' : ''}`}
        >
          {copy.items.map((item, i) => (
            <div key={i} className="fcard">
              <div className="ic">{item.ic}</div>
              <h3>{item.t}</h3>
              <p>{item.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
