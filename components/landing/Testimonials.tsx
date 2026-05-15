'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['testi'];
}

export default function Testimonials({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  // Duplicate for seamless marquee loop
  const items = [...copy.items, ...copy.items];

  return (
    <section className="section" id="testimonials">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>
      </div>

      <div className="marquee">
        <div className="marquee-track">
          {items.map((t, i) => (
            <div key={i} className="testi">
              <p className="testi-q">{t.q}</p>
              <div className="testi-who">
                <div className="testi-avatar">{t.avatar}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-role">{t.role}</div>
                </div>
                <div className="testi-flag">{t.flag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
