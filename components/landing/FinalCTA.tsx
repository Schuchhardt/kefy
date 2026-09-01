'use client';

import { useSignup } from '@/components/ui/SignupContext';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['final'];
}

export default function FinalCTA({ copy }: Props) {
  const goToRegister = useSignup();

  return (
    <section
      className="final reveal"
      id="cta"
    >
      <span className="label">{copy.tag}</span>
      <h2 className="h2">{copy.h2}</h2>
      <p>{copy.sub}</p>
      <button className="btn btn-primary btn-lg" onClick={goToRegister}>{copy.cta}</button>
      <div className="final-note">
        <span className="pulse" />
        {copy.note}
      </div>
    </section>
  );
}
