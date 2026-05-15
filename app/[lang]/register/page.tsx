'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, orgName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al crear la cuenta');
        return;
      }

      router.push(`/${lang}/onboarding`);
    } catch {
      setError('Error de red, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href={`/${lang}`} style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28, color: 'var(--accent)', textDecoration: 'none' }}>
            kefy
          </Link>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>Crea tu cuenta gratis</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Tu nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Ana García"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Nombre del negocio</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                placeholder="Mi Marca"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
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
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: 13, background: 'rgba(255,107,107,0.08)', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} style={buttonStyle(loading)}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
          </button>

          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
            Al registrarte aceptas nuestros{' '}
            <Link href={`/${lang}/terminos`} style={{ color: 'var(--accent)' }}>Términos de servicio</Link>
            {' '}y{' '}
            <Link href={`/${lang}/privacidad`} style={{ color: 'var(--accent)' }}>Política de privacidad</Link>.
          </p>
        </form>

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 24 }}>
          ¿Ya tienes cuenta?{' '}
          <Link href={`/${lang}/login`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: 'var(--muted)',
};

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
