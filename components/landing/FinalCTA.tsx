'use client';

import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['final'];
}

export default function FinalCTA({ copy }: Props) {
  const openWaitlist = useWaitlistOpen();

  return (
    <section
      className="final reveal"
      id="cta"
    >
      <span className="label">{copy.tag}</span>
      <h2 className="h2">{copy.h2}</h2>
      <p>{copy.sub}</p>
      <button className="btn btn-primary btn-lg" onClick={openWaitlist}>{copy.cta}</button>
      <div className="final-note">
        <span className="pulse" />
        {copy.note}
      </div>
    </section>
  );
}
