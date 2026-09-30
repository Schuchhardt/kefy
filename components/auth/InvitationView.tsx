'use client';

// Aceptar una invitación al equipo.
//
// Antes la página pedía aceptar sin saber si había sesión y, al fallar,
// mandaba al registro normal: la persona creaba una organización propia con su
// trial en vez de entrar al equipo. Ahora:
// - sin sesión: «Crear cuenta» registra directamente en el equipo
//   (`/register?invitation=…`) e «Iniciar sesión» vuelve aquí con `?next=`;
// - con la sesión del email invitado: botón de aceptar;
// - con otra cuenta: lo dice y ofrece cambiar de cuenta.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import { authErrorMessage } from '@/lib/auth-errors';
import { localizedSlug } from '@/lib/localized-paths';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

interface Invitation {
  email: string;
  role: 'admin' | 'member';
  orgName: string | null;
}

// lib/team tiene la misma función, pero arrastra `crypto` y lib/auth al
// bundle del cliente.
const normalizeEmail = (email: string) => email.trim().toLowerCase();

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; invitation: Invitation; sessionEmail: string | null }
  | { kind: 'accepted' };

export default function InvitationView({ lang, token }: { lang: string; token: string | null }) {
  const t = lang === 'en' ? enAuth : esAuth;
  const router = useRouter();
  const [state, setState] = useState<ViewState>(
    token ? { kind: 'loading' } : { kind: 'error', message: t.errors.invitation_not_found },
  );
  const [accepting, setAccepting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const [invRes, meRes] = await Promise.all([
          fetch(`/api/team/invitations/accept?token=${encodeURIComponent(token)}`),
          fetch('/api/auth/me').catch(() => null),
        ]);
        const inv = await invRes.json().catch(() => null);
        if (cancelled) return;
        if (!invRes.ok) {
          setState({ kind: 'error', message: authErrorMessage(inv, lang, invRes.status) });
          return;
        }
        const me = meRes?.ok ? await meRes.json().catch(() => null) : null;
        setState({
          kind: 'ready',
          invitation: { email: inv.email, role: inv.role, orgName: inv.orgName ?? null },
          sessionEmail: typeof me?.user?.email === 'string' ? me.user.email : null,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: t.errors.network });
      }
    })();
    return () => { cancelled = true; };
  }, [token, lang, t]);

  const selfPath = `/${lang}/${localizedSlug('invitacion', lang)}?token=${encodeURIComponent(token ?? '')}`;

  const loginHref = useCallback((email: string) => {
    const params = new URLSearchParams({ next: selfPath, email });
    return `/${lang}/login?${params}`;
  }, [lang, selfPath]);

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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status));
        return;
      }
      // El JWT todavía apunta a la organización anterior: hay que renovarlo
      // para que la sesión refleje la membresía recién creada.
      if (data?.refreshRequired) {
        await fetch('/api/auth/refresh', { method: 'POST' }).catch(() => null);
      }
      setState({ kind: 'accepted' });
    } catch {
      setError(t.errors.network);
    } finally {
      setAccepting(false);
    }
  }

  async function switchAccount(invitationEmail: string) {
    setSwitching(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push(loginHref(invitationEmail));
  }

  if (state.kind === 'loading') {
    return (
      <div className="auth-status" role="status">
        <Spinner size={20} />
        <p>{t.invitation.loading}</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="auth-status">
        <p role="alert">{state.message}</p>
        <ButtonLink href={`/${lang}`} variant="ghost" size="lg" block>{t.invitation.backHome}</ButtonLink>
      </div>
    );
  }

  if (state.kind === 'accepted') {
    return (
      <div className="auth-status" role="status">
        <p className="auth-status-title">{t.invitation.accepted}</p>
        <ButtonLink href={`/${lang}/dashboard`} variant="primary" size="lg" block>
          {t.invitation.goDashboard}
        </ButtonLink>
      </div>
    );
  }

  const { invitation, sessionEmail } = state;
  const sameAccount = !!sessionEmail && normalizeEmail(sessionEmail) === normalizeEmail(invitation.email);
  const registerParams = new URLSearchParams({ invitation: token ?? '', email: invitation.email });

  return (
    <div className="auth-status">
      <p className="auth-invite-org">{t.invitation.invitedTo(invitation.orgName ?? 'Kefy')}</p>
      <p>
        {t.invitation.forEmail(invitation.email)}{' '}
        {invitation.role === 'admin' ? t.invitation.roleAdmin : t.invitation.roleMember}
      </p>

      {error && <p role="alert" className="auth-error" style={{ width: '100%' }}>{error}</p>}

      {sameAccount ? (
        <Button variant="primary" size="lg" block loading={accepting} onClick={handleAccept}>
          {accepting ? t.invitation.accepting : t.invitation.accept}
        </Button>
      ) : sessionEmail ? (
        <>
          <p className="auth-banner auth-banner--warm" style={{ margin: 0, width: '100%' }}>
            {t.invitation.signedInAs(sessionEmail)} {t.errors.invitation_wrong_account}
          </p>
          <Button
            variant="primary" size="lg" block loading={switching}
            onClick={() => switchAccount(invitation.email)}
          >
            {t.invitation.switchAccount}
          </Button>
        </>
      ) : (
        <>
          <p>{t.invitation.needsAccount}</p>
          <div className="auth-actions">
            <ButtonLink href={`/${lang}/register?${registerParams}`} variant="primary" size="lg" block>
              {t.invitation.register}
            </ButtonLink>
            <ButtonLink href={loginHref(invitation.email)} variant="secondary" size="lg" block>
              {t.invitation.login}
            </ButtonLink>
          </div>
        </>
      )}
    </div>
  );
}
