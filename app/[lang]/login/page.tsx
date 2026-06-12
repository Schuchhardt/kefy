'use client';

import { useState, FormEvent, Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4';
const FADE = 0.5;

const LOGIN_ERROR_MESSAGES = {
  es: {
    invalidCredentials: 'Email o contraseña incorrectos',
    invalidEmail: 'Ingresa un email válido',
    passwordRequired: 'La contraseña es obligatoria',
    invalidBody: 'Solicitud inválida',
    noOrganization: 'No se encontró una organización para esta cuenta',
    generic: 'Error al iniciar sesión',
    network: 'Error de red, intenta de nuevo',
  },
  en: {
    invalidCredentials: 'Invalid email or password',
    invalidEmail: 'Please enter a valid email',
    passwordRequired: 'Password is required',
    invalidBody: 'Invalid request',
    noOrganization: 'No organization found for this account',
    generic: 'Error signing in',
    network: 'Network error, please try again',
  },
} as const;

function resolveLoginError(error: unknown, lang: string): string {
  const locale = lang === 'en' ? 'en' : 'es';
  const messages = LOGIN_ERROR_MESSAGES[locale];

  if (typeof error !== 'string' || !error.trim()) {
    return messages.generic;
  }

  const normalized = error.trim().toLowerCase();

  if (
    normalized === 'invalid email or password' ||
    normalized === 'email o contraseña incorrectos'
  ) {
    return messages.invalidCredentials;
  }
  if (
    normalized === 'valid email is required' ||
    normalized === 'ingresa un email válido'
  ) {
    return messages.invalidEmail;
  }
  if (
    normalized === 'password is required' ||
    normalized === 'la contraseña es obligatoria'
  ) {
    return messages.passwordRequired;
  }
  if (
    normalized === 'invalid request body' ||
    normalized === 'invalid request' ||
    normalized === 'solicitud inválida'
  ) {
    return messages.invalidBody;
  }
  if (
    normalized === 'no organization found' ||
    normalized === 'no se encontró una organización para esta cuenta'
  ) {
    return messages.noOrganization;
  }

  return messages.generic;
}

function LoginForm() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired');
  const reset   = searchParams.get('reset');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(resolveLoginError(data?.error, lang));
        return;
      }

      router.push(`/${lang}/dashboard`);
    } catch {
      const locale = lang === 'en' ? 'en' : 'es';
      setError(LOGIN_ERROR_MESSAGES[locale].network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {reset && (
        <div style={{ background: 'rgba(198,255,75,0.08)', border: '1px solid rgba(198,255,75,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--accent)' }}>
          ✓ Contraseña actualizada. Ya puedes iniciar sesión.
        </div>
      )}

      {expired && (
        <div style={{ background: 'rgba(255,140,66,0.1)', border: '1px solid rgba(255,140,66,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--warm)' }}>
          Tu sesión expiró. Vuelve a iniciar sesión.
        </div>
      )}

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

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
              Contraseña
            </label>
            <Link href={`/${lang}/forgot-password`} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13, background: 'rgba(255,107,107,0.08)', padding: '8px 12px', borderRadius: 6 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={buttonStyle(loading)}
        >
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  const { lang } = useParams<{ lang: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);

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

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 2 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Link href={`/${lang}`} className="logo" style={{ textDecoration: 'none', justifyContent: 'center', fontSize: 26, color: '#F0EFE8' }}>
              <Image src="/apple-touch-icon.png" alt="Kefy" width={28} height={28} />
              <span>Kef<span className="y">y</span></span>
            </Link>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 12 }}>Inicia sesión en tu cuenta</p>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>

          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 24 }}>
            ¿No tienes cuenta?{' '}
            <Link href={`/${lang}/register`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>

      {/* Footer legal */}
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
  padding: '12px',
  fontWeight: 700,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s',
  width: '100%',
  fontFamily: 'var(--font-syne)',
});
