'use client';

import { useSignup } from '@/components/ui/SignupContext';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['final'];
  cta: KefyCopy['cta'];
}

export default function FinalCTA({ copy, cta }: Props) {
  const goToRegister = useSignup();

  return (
    <section className="final reveal" id="cta" aria-labelledby="final-title">
      <span className="label">{copy.tag}</span>
      <h2 id="final-title" className="h2">{copy.h2}</h2>
      <p>{copy.sub}</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={goToRegister}>{cta.label}</button>
      <p className="final-note">
        <span className="pulse" aria-hidden="true" />
        {cta.note}
      </p>
    </section>
  );
}
