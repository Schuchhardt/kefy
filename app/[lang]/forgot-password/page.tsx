'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';
const FADE = 0.5;

export default function ForgotPasswordPage() {
  const { lang } = useParams<{ lang: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let rafId: number;
    const tick = () => {
      const { duration, currentTime } = video;
      if (duration && !isNaN(duration)) {
        let opacity = 1;
        if (currentTime < FADE) opacity = currentTime / FADE;
        else if (currentTime > duration - FADE) opacity = (duration - currentTime) / FADE;
        video.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      }
      rafId = requestAnimationFrame(tick);
    };
    const handleEnded = () => {
      video.style.opacity = '0';
      setTimeout(() => { video.currentTime = 0; video.play().catch(() => {}); }, 100);
    };
    video.style.opacity = '0';
    video.play().catch(() => {});
    rafId = requestAnimationFrame(tick);
    video.addEventListener('ended', handleEnded);
    return () => { cancelAnimationFrame(rafId); video.removeEventListener('ended', handleEnded); };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Error al enviar el correo');
        return;
      }
      setSent(true);
    } catch {
      setError('Error de red, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Background video */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }}
        />
      </div>
      {/* Dark overlay */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,10,0.78)', zIndex: 1, pointerEvents: 'none' }} />
      {/* Blur glow behind card */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 500, background: 'rgba(3,7,18,0.85)', filter: 'blur(72px)', pointerEvents: 'none', zIndex: 1 }} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 2 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Link href={`/${lang}`} className="logo" style={{ textDecoration: 'none', justifyContent: 'center', fontSize: 26, color: '#F0EFE8' }}>
              <Image src="/apple-touch-icon.png" alt="Kefy" width={28} height={28} />
              <span>Kef<span className="y">y</span></span>
            </Link>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 12 }}>Recuperar contraseña</p>
          </div>

          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(198,255,75,0.1)', border: '1px solid rgba(198,255,75,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>
                ✉️
              </div>
              <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Revisa tu correo
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Si existe una cuenta con ese correo, recibirás un enlace para crear una nueva contraseña. El enlace expira en 1 hora.
              </p>
              <Link href={`/${lang}/login`} style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 500 }}>
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24, textAlign: 'center' }}>
                Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--muted)' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="tu@email.com"
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <p style={{ color: '#ff6b6b', fontSize: 13, background: 'rgba(255,107,107,0.08)', padding: '8px 12px', borderRadius: 6 }}>
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                  {loading ? 'Enviando...' : 'Enviar instrucciones'}
                </button>
              </form>

              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 24 }}>
                <Link href={`/${lang}/login`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                  Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      <footer style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Link href={`/${lang}/terminos`} style={{ color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
          Términos de servicio
        </Link>
        <Link href={`/${lang}/privacidad`} style={{ color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
          Privacidad
        </Link>
        <Link href={`/${lang}/cookies`} style={{ color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
          Cookies
        </Link>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>© {new Date().getFullYear()} Kefy</span>
      </footer>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? 'var(--border)' : 'var(--accent)',
  color: disabled ? 'var(--muted)' : '#0A0A0C',
  border: 'none',
  borderRadius: 8,
  padding: '11px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  width: '100%',
  transition: 'opacity 0.15s',
});
