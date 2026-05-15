'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['final'];
}

export default function FinalCTA({ copy }: Props) {
  const [ref, seen] = useReveal();

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={`final reveal${seen ? ' is-in' : ''}`}
      id="cta"
    >
      <span className="label">{copy.tag}</span>
      <h2 className="h2">{copy.h2}</h2>
      <p>{copy.sub}</p>
      <button className="btn btn-primary btn-lg">{copy.cta}</button>
      <div className="final-note">
        <span className="pulse" />
        {copy.note}
      </div>
    </section>
  );
}
