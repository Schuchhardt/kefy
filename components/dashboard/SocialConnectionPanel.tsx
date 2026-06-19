'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { CHANNELS, CHANNEL_LABELS } from '@/lib/channels';
import type { Channel } from '@/types/channels';
import type { SocialAccount } from '@/types/social';

type Locale = 'es' | 'en';
type Mode = 'settings' | 'onboarding';

interface Props {
  locale: Locale;
  mode: Mode;
  contentHref?: string;
  onAccountsChange?: (count: number) => void;
}

export default function SocialConnectionPanel({
  locale,
  mode,
  contentHref,
  onAccountsChange,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

  const t = {
    es: {
      connectError: 'No se pudo conectar la cuenta',
      unknownError: 'Error desconocido al conectar',
      connectedOk: 'conectado correctamente',
      connected: 'Conectadas',
      connectNew: 'Conectar nueva',
      redirecting: 'Redirigiendo…',
      disconnect: 'Desconectar',
      confirmDisconnect: '¿Seguro que quieres desconectar esta cuenta?',
      expires: 'expira',
      connectTitle: 'Conecta tus redes sociales',
      connectDesc: 'Conecta al menos una cuenta para empezar a publicar desde Kefy.',
      ctaTitle: 'Perfecto, ahora crea tu primer contenido',
      ctaDesc: 'Tu red social ya está conectada y lista para publicar.',
      ctaButton: 'Crear primer contenido',
    },
    en: {
      connectError: 'Failed to connect account',
      unknownError: 'Unknown connection error',
      connectedOk: 'connected successfully',
      connected: 'Connected',
      connectNew: 'Connect new',
      redirecting: 'Redirecting…',
      disconnect: 'Disconnect',
      confirmDisconnect: 'Are you sure you want to disconnect this account?',
      expires: 'expires',
      connectTitle: 'Connect your social networks',
      connectDesc: 'Connect at least one account to start publishing from Kefy.',
      ctaTitle: 'Great, now create your first content',
      ctaDesc: 'Your social account is connected and ready to publish.',
      ctaButton: 'Create first content',
    },
  }[locale];

  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/social/accounts', { credentials: 'include' });
    if (!res.ok) {
      setAccounts([]);
      onAccountsChange?.(0);
      setLoadingAccounts(false);
      return;
    }

    const json = await res.json() as { accounts?: SocialAccount[] };
    const items = json.accounts ?? [];
    setAccounts(items);
    onAccountsChange?.(items.length);
    setLoadingAccounts(false);
  }, [onAccountsChange]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (!connected && !error) return;

    if (connected) {
      setConnectSuccess(connected);
      setConnectError(null);
      void fetchAccounts();
    } else if (error) {
      console.error('[social oauth] callback returned error:', error);
      setConnectError(t.connectError);
      setConnectSuccess(null);
    }

    router.replace(pathname);
  }, [searchParams, router, pathname, fetchAccounts, t.connectError]);

  async function handleConnectPlatform(platform: string) {
    setConnecting(platform);
    setConnectError(null);
    setConnectSuccess(null);

    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      const res = await fetch(
        `/api/social/oauth/url?platform=${platform}&state=${state}&returnTo=${encodeURIComponent(pathname)}`,
        { credentials: 'include' },
      );
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? t.connectError);
      }

      window.location.href = data.url;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : t.unknownError);
      setConnecting(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm(t.confirmDisconnect)) return;
    await fetch(`/api/social/accounts/${accountId}`, { method: 'DELETE', credentials: 'include' });
    const next = accounts.filter((a) => a.id !== accountId);
    setAccounts(next);
    onAccountsChange?.(next.length);
  }

  return (
    <>
      {connectError && (
        <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{connectError}</p>
      )}
      {connectSuccess && (
        <p style={{ color: '#4caf50', fontSize: 13, marginBottom: 12 }}>
          ✓ {connectSuccess.charAt(0).toUpperCase() + connectSuccess.slice(1)} {t.connectedOk}
        </p>
      )}

      {mode === 'onboarding' ? (
        accounts.length > 0 ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t.ctaTitle}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>{t.ctaDesc}</p>
            <Link href={contentHref ?? '/dashboard/content'} style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontWeight: 700,
              fontSize: 13,
              padding: '9px 18px',
              borderRadius: 8,
              textDecoration: 'none',
            }}>
              {t.ctaButton}
            </Link>
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t.connectTitle}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>{t.connectDesc}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {CHANNELS.filter((ch) => ch.group === 'organic').map(({ value: platform, label: platformLabel }) => {
                const already = accounts.some((a) => a.platform === platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => void handleConnectPlatform(platform)}
                    disabled={connecting !== null}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: already ? 'rgba(198,255,75,0.04)' : 'var(--bg)',
                      border: `1px solid ${already ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                      opacity: connecting !== null ? 0.6 : 1,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                      <ChannelIcon name={platform} size={16} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {connecting === platform ? t.redirecting : (CHANNEL_LABELS[platform as Channel] ?? platformLabel)}
                    </span>
                    {already && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        <>
          {!loadingAccounts && accounts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.connected}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.map((acc) => (
                  <div key={acc.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <span style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChannelIcon name={acc.platform} size={18} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: 14 }}>{acc.username}</p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                        {acc.platform} · {acc.status}
                        {acc.token_expires_at && (
                          <> · {t.expires} {new Date(acc.token_expires_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}</>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDisconnect(acc.id)}
                      style={{
                        background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#ff6b6b',
                      }}
                    >
                      {t.disconnect}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t.connectNew}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {CHANNELS.filter((ch) => ch.group === 'organic').map(({ value: platform, label: platformLabel }) => {
              const already = accounts.some((a) => a.platform === platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => void handleConnectPlatform(platform)}
                  disabled={connecting !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: already ? 'rgba(198,255,75,0.04)' : 'var(--bg)',
                    border: `1px solid ${already ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                    opacity: connecting !== null ? 0.6 : 1,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                    <ChannelIcon name={platform} size={16} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {connecting === platform ? t.redirecting : (CHANNEL_LABELS[platform as Channel] ?? platformLabel)}
                  </span>
                  {already && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
