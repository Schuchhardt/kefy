'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired');

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
        setError(data.error ?? 'Error al iniciar sesión');
        return;
      }

      router.push(`/${lang}/dashboard`);
    } catch {
      setError('Error de red, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
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
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--muted)' }}>
            Contraseña
          </label>
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href={`/${lang}`} style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28, color: 'var(--accent)', textDecoration: 'none' }}>
            kefy
          </Link>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>Inicia sesión en tu cuenta</p>
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
  color: disabled ? 'var(--muted)' : 'var(--bg)',
  border: 'none',
  borderRadius: 8,
  padding: '12px',
  fontWeight: 700,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s',
  width: '100%',
  fontFamily: 'inherit',
});
