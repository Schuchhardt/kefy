'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

const COPY = {
  es: {
    title: 'Invitación al equipo',
    loading: 'Verificando invitación…',
    invitedTo: (org: string) => `Te invitaron a ${org}`,
    forEmail: (email: string) => `La invitación es para ${email}.`,
    roleMember: 'Entrarás como miembro del equipo.',
    roleAdmin: 'Entrarás como administrador del equipo.',
    accept: 'Aceptar invitación',
    accepting: 'Uniéndote…',
    needsAccount: 'Para aceptarla, inicia sesión o crea tu cuenta con ese mismo correo.',
    login: 'Iniciar sesión',
    register: 'Crear cuenta',
    accepted: '¡Listo! Ya eres parte del equipo.',
    goDashboard: 'Ir al dashboard',
    backHome: 'Volver al inicio',
    genericError: 'No pudimos procesar la invitación.',
  },
  en: {
    title: 'Team invitation',
    loading: 'Checking invitation…',
    invitedTo: (org: string) => `You've been invited to ${org}`,
    forEmail: (email: string) => `This invitation is for ${email}.`,
    roleMember: "You'll join as a team member.",
    roleAdmin: "You'll join as a team admin.",
    accept: 'Accept invitation',
    accepting: 'Joining…',
    needsAccount: 'To accept it, sign in or create your account with that same email.',
    login: 'Sign in',
    register: 'Create account',
    accepted: "You're in! You're now part of the team.",
    goDashboard: 'Go to dashboard',
    backHome: 'Back home',
    genericError: "We couldn't process the invitation.",
  },
} as const;

interface Invitation {
  email: string;
  role: 'admin' | 'member';
  orgName: string | null;
}

function InvitationInner() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const t = COPY[lang === 'en' ? 'en' : 'es'];

  const [token, setToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'accepted'>('loading');
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // El token viaja en el enlace del correo. Se lee de `window.location` en vez
  // de `useSearchParams` para no obligar a envolver la página en un <Suspense>
  // adicional durante el prerender.
  useEffect(() => {
    const t0 = new URLSearchParams(window.location.search).get('token');
    if (!t0) {
      setState('error');
      setError(t.genericError);
      return;
    }
    setToken(t0);

    void (async () => {
      try {
        const res = await fetch(`/api/team/invitations/accept?token=${encodeURIComponent(t0)}`);
        const data = await res.json();
        if (!res.ok) {
          setState('error');
          setError(data.error ?? t.genericError);
          return;
        }
        setInvitation(data);
        setState('ready');
      } catch {
        setState('error');
        setError(t.genericError);
      }
    })();
  }, [t]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      const res = await fetch('/api/team/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Sin sesión no se puede aceptar: se ofrece entrar o registrarse en
        // lugar de mostrar un error sin salida.
        if (data.needsAuth) setNeedsAuth(true);
        setError(data.error ?? t.genericError);
        return;
      }

      // El JWT todavía apunta a la organización anterior: hay que renovarlo
      // para que la sesión refleje la membresía recién creada.
      if (data.refreshRequired) {
        await fetch('/api/auth/refresh', { method: 'POST' });
      }
      setState('accepted');
    } catch {
      setError(t.genericError);
    } finally {
      setAccepting(false);
    }
  }

  const wrap = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
    textAlign: 'center' as const, color: 'var(--text)',
  };

  if (state === 'loading') {
    return <div style={wrap}><p style={{ color: 'var(--muted)' }}>{t.loading}</p></div>;
  }

  if (state === 'accepted') {
    return (
      <div style={wrap}>
        <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 24, fontWeight: 700, margin: 0 }}>
          {t.accepted}
        </h1>
        <button className="btn btn-primary" onClick={() => router.push(`/${lang}/dashboard`)}>
          {t.goDashboard}
        </button>
      </div>
    );
  }

  if (state === 'error' || !invitation) {
    return (
      <div style={wrap}>
        <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t.title}
        </h1>
        <p style={{ color: 'var(--muted)', maxWidth: 420 }}>{error || t.genericError}</p>
        <Link className="btn btn-ghost btn-sm" href={`/${lang}`}>{t.backHome}</Link>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <span className="label">{t.title}</span>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 700, margin: 0 }}>
        {t.invitedTo(invitation.orgName ?? 'Kefy')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        {t.forEmail(invitation.email)}
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        {invitation.role === 'admin' ? t.roleAdmin : t.roleMember}
      </p>

      {error && (
        <p style={{ color: '#ff8c42', fontSize: 14, maxWidth: 420 }}>{error}</p>
      )}

      {needsAuth ? (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 420 }}>{t.needsAccount}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link
              className="btn btn-primary btn-sm"
              href={`/${lang}/register?email=${encodeURIComponent(invitation.email)}`}
            >
              {t.register}
            </Link>
            <Link className="btn btn-ghost btn-sm" href={`/${lang}/login`}>{t.login}</Link>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" onClick={handleAccept} disabled={accepting}>
          {accepting ? t.accepting : t.accept}
        </button>
      )}
    </div>
  );
}

export default function InvitationPage() {
  return (
    <Suspense>
      <InvitationInner />
    </Suspense>
  );
}
