'use client';

import { useRef } from 'react';
import { useReveal } from '@/hooks/useReveal';
import HeroDemo from './HeroDemo';
import type { KefyCopy } from '@/lib/content';

interface HeroProps {
  lang: string;
  copy: KefyCopy['hero'];
  demoCopy: KefyCopy['demo'];
}

export default function Hero({ lang, copy, demoCopy }: HeroProps) {
  const [tagRef, tagSeen] = useReveal();
  const [h1Ref, h1Seen] = useReveal();
  const [subRef, subSeen] = useReveal();
  const [ctaRef, ctaSeen] = useReveal();
  const [statsRef, statsSeen] = useReveal();

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="container hero-inner">
        <div
          ref={tagRef as React.RefObject<HTMLDivElement>}
          className={`hero-tag reveal${tagSeen ? ' is-in' : ''}`}
        >
          <span className="dot" />
          {copy.tag}
        </div>

        <h1
          ref={h1Ref as React.RefObject<HTMLHeadingElement>}
          className={`h1 reveal${h1Seen ? ' is-in' : ''}`}
          style={{ transitionDelay: '0.08s' }}
        >
          {copy.h1[0]}
          <br />
          {copy.h1[1]}{' '}
          <em className="em">{copy.h1em}</em>
        </h1>

        <p
          ref={subRef as React.RefObject<HTMLParagraphElement>}
          className={`hero-sub reveal${subSeen ? ' is-in' : ''}`}
          style={{ transitionDelay: '0.16s' }}
        >
          {copy.sub}
        </p>

        <div
          ref={ctaRef as React.RefObject<HTMLDivElement>}
          className={`hero-ctas reveal${ctaSeen ? ' is-in' : ''}`}
          style={{ transitionDelay: '0.22s' }}
        >
          <a href="#how" className="btn btn-primary btn-lg">
            {copy.cta2} →
          </a>
        </div>

        <div
          ref={statsRef as React.RefObject<HTMLDivElement>}
          className={`hero-stats reveal${statsSeen ? ' is-in' : ''}`}
          style={{ transitionDelay: '0.3s' }}
        >
          {copy.stats.map((stat, i) => (
            <div key={i} className="hero-stat">
              <div className="big">{stat.big}</div>
              <div className="lbl">{stat.lbl}</div>
            </div>
          ))}
        </div>

        <HeroDemo copy={demoCopy} />
      </div>
    </section>
  );
}
