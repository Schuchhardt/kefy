'use client';

import { useEffect, useRef, useState } from 'react';
import { useWaitlistOpenWithEmail } from '@/components/ui/WaitlistContext';
import HeroDemo from './HeroDemo';
import type { KefyCopy } from '@/lib/content';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';
const FADE = 0.5; // seconds fade-in / fade-out

interface HeroProps {
  lang: string;
  copy: KefyCopy['hero'];
  demoCopy: KefyCopy['demo'];
}

export default function Hero({ lang: _lang, copy, demoCopy }: HeroProps) {
  const openWithEmail = useWaitlistOpenWithEmail();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [heroEmail, setHeroEmail] = useState('');

  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    openWithEmail(heroEmail.trim());
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;

    const tick = () => {
      const { duration, currentTime } = video;
      if (duration && !isNaN(duration)) {
        let opacity = 1;
        if (currentTime < FADE) {
          opacity = currentTime / FADE;
        } else if (currentTime > duration - FADE) {
          opacity = (duration - currentTime) / FADE;
        }
        video.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      }
      rafId = requestAnimationFrame(tick);
    };

    const handleEnded = () => {
      video.style.opacity = '0';
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {});
      }, 100);
    };

    video.style.opacity = '0';
    video.play().catch(() => {});
    rafId = requestAnimationFrame(tick);
    video.addEventListener('ended', handleEnded);

    return () => {
      cancelAnimationFrame(rafId);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  return (
    <section className="hero">
      {/* Background video — fondo negro con líneas azules */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: -2, pointerEvents: 'none' }}>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }}
        />
      </div>
      {/* Dark blur shape centrada detrás del contenido para legibilidad */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '42%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '984px',
          height: '527px',
          background: 'rgba(3,7,18,0.90)',
          filter: 'blur(82px)',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
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
          style={{ animationDelay: '0.22s', flexDirection: 'column', alignItems: 'center' }}
        >
          <form
            onSubmit={handleHeroSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 999,
              padding: '5px 5px 5px 22px',
              maxWidth: 460,
              width: '100%',
            }}
          >
            <input
              type="email"
              value={heroEmail}
              onChange={e => setHeroEmail(e.target.value)}
              placeholder={copy.emailPlaceholder ?? 'tu@correo.com'}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: 15,
                minWidth: 0,
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {copy.cta2} →
            </button>
          </form>
          {copy.ctaNote && (
            <p className="hero-cta-note" style={{ textAlign: 'center', marginTop: 12 }}>{copy.ctaNote}</p>
          )}
        </div>

        

        <HeroDemo copy={demoCopy} />
      </div>
    </section>
  );
}
