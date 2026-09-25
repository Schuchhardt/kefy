'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { CHANNELS, CHANNEL_LABELS } from '@/lib/channels';
import { useBrand } from '@/lib/brand-context';
import type { Channel } from '@/types/channels';
import type { SocialAccount } from '@/types/social';

type Locale = 'es' | 'en';
type Mode = 'settings' | 'onboarding';

/** Redes que el panel ofrece conectar: las mismas que los botones. */
const CONNECTABLE_PLATFORMS = new Set<string>(
  CHANNELS.filter((ch) => ch.group === 'organic').map((ch) => ch.value),
);

interface Props {
  locale: Locale;
  mode: Mode;
  contentHref?: string;
  onAccountsChange?: (count: number) => void;
  /**
   * Si es `true`, el panel lee `?connect=<red>&brand=<id>` de la URL y arranca
   * solo el flujo de conexión (el enlace que devuelven el asistente, la API y
   * el MCP). Solo lo activa la página de ajustes: el panel del inicio no debe
   * disparar OAuth por su cuenta.
   */
  autoConnectFromQuery?: boolean;
}

export default function SocialConnectionPanel({
  locale,
  mode,
  contentHref,
  onAccountsChange,
  autoConnectFromQuery = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { brands, activeBrand, loading: brandsLoading, switchBrand } = useBrand();

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  // Estado del enlace directo `?connect=`: la red que se está preparando.
  const [autoConnecting, setAutoConnecting] = useState<string | null>(null);
  // Evita que el enlace se procese dos veces (efectos dobles de StrictMode,
  // re-renders al cambiar la URL o al terminar de cargar las marcas).
  const autoConnectHandled = useRef(false);

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
      xSensitiveHint: 'Si tus imágenes salen en X detrás de un aviso de contenido sensible, desmarca «Marcar el contenido multimedia que publicas como material que puede ser sensible» en X → Configuración y privacidad → Privacidad y seguridad → Tus publicaciones. Es un ajuste de tu cuenta de X; Kefy no puede cambiarlo al publicar.',
      xSensitiveLink: 'Abrir ajustes de X',
      autoConnecting: 'Conectando {network}…',
      autoConnectUnknownPlatform: 'El enlace de conexión apunta a una red que Kefy no admite. Elige una de la lista.',
      autoConnectBrandNotFound: 'La marca del enlace no está entre tus marcas, así que no se conectó ninguna cuenta.',
      autoConnectBrandSwitchError: 'No se pudo cambiar a la marca del enlace. Inténtalo de nuevo.',
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
      xSensitiveHint: 'If your images show up on X behind a sensitive-content warning, untick “Mark media you post as having material that may be sensitive” in X → Settings and privacy → Privacy and safety → Your posts. It’s a setting on your X account; Kefy can’t override it when publishing.',
      xSensitiveLink: 'Open X settings',
      autoConnecting: 'Connecting {network}…',
      autoConnectUnknownPlatform: 'The connection link points to a network Kefy doesn’t support. Pick one from the list.',
      autoConnectBrandNotFound: 'The link’s brand isn’t one of your brands, so no account was connected.',
      autoConnectBrandSwitchError: 'Couldn’t switch to the link’s brand. Please try again.',
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

  async function handleConnectPlatform(platform: string): Promise<boolean> {
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
      return true;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : t.unknownError);
      setConnecting(null);
      return false;
    }
  }

  // ── Enlace directo: /{lang}/dashboard/settings?connect=<red>&brand=<id> ────
  // Lo generan el asistente, la API REST y el MCP. El callback de OAuth asocia
  // la cuenta a la marca ACTIVA (cookie), así que si el enlace trae otra marca
  // hay que terminar de cambiar a ella antes de pedir la URL de OAuth.
  useEffect(() => {
    if (!autoConnectFromQuery || autoConnectHandled.current) return;

    const platform = searchParams.get('connect');
    if (!platform) return;
    const brandId = searchParams.get('brand');

    // Para validar la marca hace falta la lista: se espera a que cargue (el
    // efecto se vuelve a ejecutar cuando cambia `brandsLoading`).
    if (brandId && brandsLoading) return;

    autoConnectHandled.current = true;

    // Quitar `connect` y `brand` de la URL para que recargar la página o volver
    // del OAuth no repita la conexión. El resto de parámetros se conserva.
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('connect');
    rest.delete('brand');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);

    if (!CONNECTABLE_PLATFORMS.has(platform)) {
      setConnectError(t.autoConnectUnknownPlatform);
      return;
    }

    if (brandId && !brands.some((b) => b.id === brandId)) {
      setConnectError(t.autoConnectBrandNotFound);
      return;
    }

    setAutoConnecting(platform);
    setConnectError(null);
    // Bloquea los botones también mientras se cambia de marca.
    setConnecting(platform);

    void (async () => {
      if (brandId && brandId !== activeBrand?.id) {
        try {
          await switchBrand(brandId);
        } catch (err) {
          console.error('[social connect link] switchBrand failed:', err);
          setConnectError(t.autoConnectBrandSwitchError);
          setAutoConnecting(null);
          setConnecting(null);
          return;
        }
      }

      const ok = await handleConnectPlatform(platform);
      // Si arrancó bien, el navegador ya va camino de Zernio: el aviso se queda.
      if (!ok) setAutoConnecting(null);
    })();
  // handleConnectPlatform y los textos no cambian el resultado: el enlace se
  // procesa una sola vez, con los valores del momento en que se procesa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectFromQuery, searchParams, brandsLoading, brands, activeBrand, switchBrand, router, pathname]);

  async function handleDisconnect(accountId: string) {
    if (!confirm(t.confirmDisconnect)) return;
    await fetch(`/api/social/accounts/${accountId}`, { method: 'DELETE', credentials: 'include' });
    const next = accounts.filter((a) => a.id !== accountId);
    setAccounts(next);
    onAccountsChange?.(next.length);
  }

  return (
    <>
      {autoConnecting && !connectError && (
        <p role="status" style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          {t.autoConnecting.replace('{network}', CHANNEL_LABELS[autoConnecting as Channel] ?? autoConnecting)}
        </p>
      )}
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
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    {/* Zernio's API has no sensitivity flag — X decides from the
                        account's own "may be sensitive" setting, so point the
                        user at it instead of leaving them stuck. */}
                    {acc.platform === 'twitter' && (
                      <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--muted)', marginTop: 8 }}>
                        {t.xSensitiveHint}{' '}
                        <a
                          href="https://x.com/settings/safety"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t.xSensitiveLink}
                        </a>
                      </p>
                    )}
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
