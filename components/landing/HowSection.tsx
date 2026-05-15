'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['how'];
}

export default function HowSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [closerRef, closerSeen] = useReveal();

  return (
    <section className="section" id="how">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
          <p className="intro">{copy.intro}</p>
        </div>

        <div className="steps">
          {copy.steps.map((step, i) => {
            const isLast = i === copy.steps.length - 1;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const [ref, seen] = useReveal();
            return (
              <div
                key={i}
                ref={ref as React.RefObject<HTMLDivElement>}
                className={`step${isLast ? ' last' : ''} reveal${seen ? ' is-in' : ''}`}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="step-ic">{step.ic}</div>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
                <div className="step-num">{step.n}</div>
              </div>
            );
          })}
        </div>

        <div
          ref={closerRef as React.RefObject<HTMLDivElement>}
          className={`how-closer reveal${closerSeen ? ' is-in' : ''}`}
        >
          {copy.closer[0]}{' '}
          <span className="how-closer-pill">{copy.closer[1]}</span>{' '}
          {copy.closer[2]}
        </div>
      </div>
    </section>
  );
}
