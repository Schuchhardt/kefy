'use client';

// ─── Vídeo de fondo (hero de la landing y pantallas de auth) ────────────────
//
// El mismo bloque estaba copiado cinco veces, cada uno con `autoPlay` sin
// póster, sin `preload`, sin respetar `prefers-reduced-motion` y con un
// requestAnimationFrame corriendo sin parar para el fundido. En 4G el hero
// descargaba un MP4 antes del contenido principal, y con la CDN bloqueada no
// quedaba nada detrás.
//
// Ahora:
// - Siempre pinta el póster estático (public/backdrop-poster.svg), que es lo
//   que se ve si el vídeo no llega.
// - Solo monta el <video> en pantallas de 768px o más, sin movimiento
//   reducido ni ahorro de datos; con `preload="none"` y después del primer
//   pintado.
// - Se pausa fuera de la vista y con la pestaña oculta. El fundido de entrada
//   es una transición CSS, sin bucle de animación.

import { useEffect, useRef, useState } from 'react';

export const BACKDROP_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';
export const BACKDROP_POSTER = '/backdrop-poster.svg';

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** ¿Se puede reproducir un vídeo decorativo sin molestar ni gastar datos? */
export function canPlayBackdropVideo(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!window.matchMedia('(min-width: 768px)').matches) return false;
  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return false;
  return true;
}

export default function VideoBackdrop({
  src = BACKDROP_VIDEO_SRC,
  poster = BACKDROP_POSTER,
  overlay = 0,
  zIndex = 0,
}: {
  src?: string;
  poster?: string;
  /** Opacidad (0–1) de la capa oscura encima del vídeo. */
  overlay?: number;
  zIndex?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Se decide en el cliente, después del primer pintado: el vídeo nunca
  // compite con el contenido principal.
  useEffect(() => {
    const id = window.setTimeout(() => setEnabled(canPlayBackdropVideo()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;

    let inView = true;
    const sync = () => {
      if (inView && document.visibilityState === 'visible') video.play().catch(() => {});
      else video.pause();
    };
    const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    io.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [enabled]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex,
        background: `#030409 url(${poster}) center / cover no-repeat`,
      }}
    >
      {enabled && (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          onPlaying={() => setPlaying(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: playing ? 1 : 0, transition: 'opacity 0.8s ease',
          }}
        />
      )}
      {overlay > 0 && (
        <div style={{ position: 'absolute', inset: 0, background: `rgba(8,8,10,${overlay})` }} />
      )}
    </div>
  );
}
