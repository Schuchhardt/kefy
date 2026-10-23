'use client';

// Consentimiento OAuth: una aplicación (p. ej. un conector de claude.ai) pide
// acceso al servidor MCP de Kefy. La persona elige permisos y marca, y Kefy
// vuelve a la aplicación con un código de un solo uso.
//
// Publicar no se marca por defecto: por MCP no hay confirmación humana y un
// agente que lea DMs podría acabar publicando por instrucciones de terceros.
// Ver lib/assistant/oauth.ts y docs/assistant.md §7.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type Scope = 'read' | 'write' | 'publish';
const SCOPES: readonly Scope[] = ['read', 'write', 'publish'];

interface ConsentInfo {
  client: { name: string; redirect_host: string };
  org_name: string | null;
  user_email: string | null;
  brands: { id: string; name: string }[];
  can_authorize: boolean;
  default_scopes: Scope[];
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'redirecting' }
  | { kind: 'ready'; info: ConsentInfo };

type Copy = typeof esAuth.oauth;

function errorMessage(t: Copy, data: unknown, status: number): string {
  const body = (data ?? {}) as { code?: unknown; error?: unknown };
  const code = typeof body.code === 'string' ? body.code : '';
  if (code in t.errors) return t.errors[code as keyof Copy['errors']];
  // 402/503 de la suscripción: el mensaje ya viene en el idioma pedido.
  if ((status === 402 || status === 503) && typeof body.error === 'string') return body.error;
  return t.errors.generic;
}

export default function OAuthConsentView({ lang, query }: { lang: string; query: string }) {
  const tAll = lang === 'en' ? enAuth : esAuth;
  const t = tAll.oauth;
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [brandId, setBrandId] = useState('');
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/oauth/consent?${query}`, { cache: 'no-store' });
        const data = await res.json().catch(() => null) as (ConsentInfo & { redirect?: string }) | null;
        if (cancelled) return;
        // Petición inválida pero de un cliente de fiar: el error vuelve a él.
        if (res.ok && data?.redirect) {
          setState({ kind: 'redirecting' });
          window.location.assign(data.redirect);
          return;
        }
        if (!res.ok || !data) {
          setState({ kind: 'error', message: errorMessage(t, data, res.status) });
          return;
        }
        setScopes(data.default_scopes);
        setState({ kind: 'ready', info: data });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: tAll.errors.network });
      }
    })();
    return () => { cancelled = true; };
  }, [query, t, tAll]);

  async function decide(decision: 'approve' | 'deny') {
    setSubmitting(decision);
    setError('');
    try {
      const res = await fetch('/api/oauth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          decision,
          scopes: SCOPES.filter((s) => scopes.includes(s)),
          brand_id: brandId || null,
          lang: lang === 'en' ? 'en' : 'es',
        }),
      });
      const data = await res.json().catch(() => null) as { redirect?: string } | null;
      if (res.ok && data?.redirect) {
        setState({ kind: 'redirecting' });
        window.location.assign(data.redirect);
        return;
      }
      setError(errorMessage(t, data, res.status));
    } catch {
      setError(tAll.errors.network);
    }
    setSubmitting(null);
  }

  async function switchAccount() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    const next = `/${lang}/oauth/authorize?${query}`;
    router.push(`/${lang}/login?${new URLSearchParams({ next })}`);
  }

  function toggleScope(s: Scope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  if (state.kind === 'loading' || state.kind === 'redirecting') {
    return (
      <div className="auth-status" role="status">
        <Spinner size={20} />
        <p>{state.kind === 'loading' ? t.loading : t.redirecting}</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="auth-status">
        <p role="alert">{state.message}</p>
        <ButtonLink href={`/${lang}`} variant="ghost" size="lg" block>{t.backHome}</ButtonLink>
      </div>
    );
  }

  const { info } = state;
  const busy = submitting !== null;

  return (
    <div className="auth-form">
      <p className="auth-invite-org" style={{ textAlign: 'center' }}>{t.wantsAccess(info.client.name)}</p>
      {info.user_email && (
        <p className="auth-note" style={{ textAlign: 'center' }}>
          {t.signedInAs(info.user_email, info.org_name ?? 'Kefy')}{' '}
          <button type="button" className="auth-inline-link" onClick={switchAccount} disabled={busy}>
            {t.switchAccount}
          </button>
        </p>
      )}

      {!info.can_authorize ? (
        <>
          <Notice tone="warning" icon={<Icon name="alert" size={16} />}>{t.notAllowed}</Notice>
          <Button variant="secondary" size="lg" block loading={submitting === 'deny'} onClick={() => decide('deny')}>
            {t.deny}
          </Button>
        </>
      ) : (
        <>
          <p className="auth-note">{t.actsAsYou}</p>

          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <legend className="auth-label">{t.scopesLabel}</legend>
            {SCOPES.map((s) => (
              <label key={s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggleScope(s)}
                  disabled={busy}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.scopes[s].label}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>{t.scopes[s].hint}</span>
                </span>
              </label>
            ))}
            {scopes.includes('publish') && (
              <div role="alert" className="ui-notice ui-notice--warning">
                <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, marginTop: 2 }}>
                  <Icon name="alert" size={16} />
                </span>
                <div style={{ minWidth: 0 }}>{t.publishWarning}</div>
              </div>
            )}
          </fieldset>

          {info.brands.length > 1 && (
            <Field label={t.brandLabel} hint={t.brandHint}>
              <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={busy}>
                <option value="">{t.allBrands}</option>
                {info.brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
          )}

          {error && <p role="alert" className="auth-error">{error}</p>}

          <div className="auth-actions">
            <Button
              variant="primary" size="lg" block
              loading={submitting === 'approve'}
              disabled={busy || scopes.length === 0}
              onClick={() => decide('approve')}
            >
              {submitting === 'approve' ? t.approving : t.approve}
            </Button>
            <Button variant="ghost" size="lg" block loading={submitting === 'deny'} disabled={busy} onClick={() => decide('deny')}>
              {t.deny}
            </Button>
          </div>
          <p className="auth-legal">{t.returnsTo(info.client.redirect_host)}</p>
        </>
      )}
    </div>
  );
}
