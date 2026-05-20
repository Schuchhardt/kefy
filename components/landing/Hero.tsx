'use client';

import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import HeroDemo from './HeroDemo';
import type { KefyCopy } from '@/lib/content';

interface HeroProps {
  lang: string;
  copy: KefyCopy['hero'];
  demoCopy: KefyCopy['demo'];
}

export default function Hero({ lang: _lang, copy, demoCopy }: HeroProps) {
  const openWaitlist = useWaitlistOpen();

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="container hero-inner">
        <div className="hero-tag reveal">
          <span className="dot" />
          {copy.tag}
        </div>

        <h1
          className="h1 reveal"
          style={{ animationDelay: '0.08s' }}
        >
          {copy.h1[0]}
          {copy.h1[1] && <><br />{copy.h1[1]}</>}
          {copy.h1em && <><br /><em className="em">{copy.h1em}</em></>}
        </h1>

        <p
          className="hero-sub reveal"
          style={{ animationDelay: '0.16s' }}
        >
          {copy.sub}
        </p>

        <div
          className="hero-ctas reveal"
          style={{ animationDelay: '0.22s' }}
        >
          <button className="btn btn-primary btn-lg" onClick={openWaitlist}>
            {copy.cta2} →
          </button>
          {copy.ctaNote && (
            <p className="hero-cta-note">{copy.ctaNote}</p>
          )}
        </div>

        {copy.stats.length > 0 && (
          <div
            className="hero-stats reveal"
            style={{ animationDelay: '0.3s' }}
          >
            {copy.stats.map((stat, i) => (
              <div key={i} className="hero-stat">
                <div className="big">{stat.big}</div>
                <div className="lbl">{stat.lbl}</div>
              </div>
            ))}
          </div>
        )}

        <HeroDemo copy={demoCopy} />
      </div>
    </section>
  );
}
