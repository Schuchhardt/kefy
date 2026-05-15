'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['lang'];
}

const FLAGS = [
  { flag: '🇲🇽', label: 'México' },
  { flag: '🇨🇴', label: 'Colombia' },
  { flag: '🇦🇷', label: 'Argentina' },
  { flag: '🇨🇱', label: 'Chile' },
  { flag: '🇪🇸', label: 'España' },
  { flag: '🇵🇪', label: 'Perú' },
  { flag: '🇺🇸', label: 'English' },
];

export default function BilingualBand({ copy }: Props) {
  const [ref, seen] = useReveal();

  return (
    <section style={{ borderTop: '1px solid var(--border)' }}>
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`lang-band reveal${seen ? ' is-in' : ''}`}
      >
        <h2 className="h2">
          {copy.h2[0]}
          <br />
          <em className="em">{copy.em}</em>
        </h2>
        <p>{copy.sub}</p>
        <div className="flags">
          {FLAGS.map((f, i) => (
            <div key={i} className="flag">
              {f.flag} {f.label}
            </div>
          ))}
          <div className="flag more">+ {copy.more}</div>
        </div>
      </div>
    </section>
  );
}
