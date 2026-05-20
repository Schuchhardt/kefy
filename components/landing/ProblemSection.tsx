'use client';

import { useReveal } from '@/hooks/useReveal';
import { useCounter } from '@/hooks/useCounter';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['problem'];
}

function StatCard({ stat, index }: { stat: CopyType; index: number }) {
  const [ref, seen] = useReveal();
  const decimals = stat.v % 1 !== 0 ? 1 : 0;
  const value = useCounter(stat.v, 1800, seen, decimals);

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`stat-card${stat.warm ? ' warm' : ''} reveal${seen ? ' is-in' : ''}`}
      style={{ transitionDelay: `${index * 0.1}s` }}
    >
      <div className="big">
        {stat.pre || ''}{value.toFixed(decimals)}{stat.suf || ''}
      </div>
      <p>{stat.d}</p>
    </div>
  );
}

type CopyType = {
  v: number;
  pre?: string;
  suf?: string;
  d: string;
  warm?: boolean;
};

export default function ProblemSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();

  return (
    <section className="section" id="problem">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
          {copy.intro && <p className="intro">{copy.intro}</p>}
        </div>

        <div className={`problem-grid${copy.stats.length === 0 ? ' no-stats' : ''}`}>
          <div className="pain-list">
            {copy.pains.map((pain, i) => {
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const [painRef, painSeen] = useReveal();
              return (
                <div
                  key={i}
                  ref={painRef as React.RefObject<HTMLDivElement>}
                  className={`pain reveal${painSeen ? ' is-in' : ''}`}
                  style={{ transitionDelay: `${i * 0.1}s` }}
                >
                  <div className="pain-num">{pain.num}</div>
                  <div>
                    <h3>{pain.t}</h3>
                    <p>{pain.d}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {copy.stats.length > 0 && (
            <div className="stat-cards">
              {copy.stats.map((stat, i) => (
                <StatCard key={i} stat={stat} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
