'use client';

import { useId, useState } from 'react';
import { useSignupWithEmail } from '@/components/ui/SignupContext';
import VideoBackdrop from '@/components/ui/VideoBackdrop';
import HeroDemo from './HeroDemo';
import type { KefyCopy } from '@/types/locales';

interface HeroProps {
  lang: string;
  copy: KefyCopy['hero'];
  cta: KefyCopy['cta'];
  demoCopy: KefyCopy['demo'];
}

export default function Hero({ copy, cta, demoCopy }: HeroProps) {
  const goToRegisterWithEmail = useSignupWithEmail();
  const [heroEmail, setHeroEmail] = useState('');
  const emailId = useId();
  const noteId = useId();

  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    goToRegisterWithEmail(heroEmail.trim());
  }

  return (
    <section className="hero">
      {/* Vídeo de fondo: póster estático siempre; el vídeo solo en escritorio,
          sin movimiento reducido ni ahorro de datos (ver VideoBackdrop). */}
      <VideoBackdrop zIndex={-2} />
      {/* Sombra detrás del texto para que se lea sobre el vídeo. Acotada al
          ancho de la pantalla: con 984px fijos la página se desbordaba 297px
          a 390px de ancho. */}
      <div aria-hidden="true" className="hero-shade" />

      <div className="container hero-inner">
        <div className="hero-tag reveal">
          <span className="dot" aria-hidden="true" />
          {copy.tag}
        </div>

        <h1 className="h1 reveal" style={{ animationDelay: '0.08s' }}>
          {copy.h1[0]}
          {copy.h1[1] && <><br />{copy.h1[1]}</>}
          {copy.h1em && <><br /><em className="em">{copy.h1em}</em></>}
        </h1>

        <p className="hero-sub reveal" style={{ animationDelay: '0.16s' }}>
          {copy.sub}
        </p>

        <div className="hero-ctas reveal" style={{ animationDelay: '0.22s' }}>
          <form onSubmit={handleHeroSubmit} className="hero-form">
            <label htmlFor={emailId} className="sr-only">{copy.emailLabel}</label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={heroEmail}
              onChange={(e) => setHeroEmail(e.target.value)}
              placeholder={copy.emailPlaceholder}
              aria-describedby={noteId}
              className="hero-form-input"
            />
            <button type="submit" className="btn btn-primary hero-form-btn">
              {cta.label} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p id={noteId} className="hero-cta-note">{cta.note}</p>
        </div>

        <HeroDemo copy={demoCopy} />
      </div>
    </section>
  );
}
