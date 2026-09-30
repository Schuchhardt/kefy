'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';
import Button, { ButtonLink } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { CHANNELS, CHANNEL_LABELS } from '@/lib/channels';
import { useBrand } from '@/lib/brand-context';
import type { Channel } from '@/types/channels';
import type { SocialAccount } from '@/types/social';
import esT from '@/locales/es/dashboard/social';
import enT from '@/locales/en/dashboard/social';
import styles from './SocialConnectionPanel.module.css';

type Locale = 'es' | 'en';
type Mode = 'settings' | 'onboarding';

const T = { es: esT, en: enT } as const;

/** Redes que el panel ofrece conectar: las mismas que los botones. */
const CONNECTABLE = CHANNELS.filter((ch) => ch.group === 'organic');
const CONNECTABLE_PLATFORMS = new Set<string>(CONNECTABLE.map((ch) => ch.value));

/** Nombre legible de una red: «googlebusiness» → «Google Business». */
function networkLabel(platform: string): string {
  return CHANNEL_LABELS[platform as Channel] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

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
  const { confirm, dialog } = useConfirm();
  const t = T[locale] ?? T.es;

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  // Estado del enlace directo `?connect=`: la red que se está preparando.
  const [autoConnecting, setAutoConnecting] = useState<string | null>(null);
  // Evita que el enlace se procese dos veces (efectos dobles de StrictMode,
  // re-renders al cambiar la URL o al terminar de cargar las marcas).
  const autoConnectHandled = useRef(false);

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

  // Vuelta del OAuth: ?connected=<red> o ?error=…
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
    setDisconnectError(null);

    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      const res = await fetch(
        `/api/social/oauth/url?platform=${platform}&state=${state}&returnTo=${encodeURIComponent(pathname)}`,
        { credentials: 'include' },
      );
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        // El detalle técnico (Zernio, perfil…) llega en inglés: va a la
        // consola; a la persona, la copy de su idioma.
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      window.location.href = data.url;
      return true;
    } catch (err) {
      console.error('[social oauth] could not get the authorization URL:', err);
      setConnectError(t.connectError);
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

  async function handleDisconnect(account: SocialAccount) {
    const network = networkLabel(account.platform);
    const ok = await confirm({
      title: t.confirmDisconnectTitle(account.username || network),
      message: t.confirmDisconnectBody,
      confirmLabel: t.confirmDisconnect,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;

    setDisconnecting(account.id);
    setDisconnectError(null);
    setConnectSuccess(null);
    try {
      const res = await fetch(`/api/social/accounts/${account.id}`, { method: 'DELETE', credentials: 'include' });
      // 404: ya no estaba (otra pestaña, otra persona). El resultado es el
      // mismo que se pedía. Cualquier otro fallo deja la cuenta en la lista:
      // antes se quitaba igual y la interfaz decía que ya no estaba conectada.
      if (!res.ok && res.status !== 404) {
        setDisconnectError(res.status === 403 ? t.disconnectForbidden : t.disconnectError);
        return;
      }
      const next = accounts.filter((a) => a.id !== account.id);
      setAccounts(next);
      onAccountsChange?.(next.length);
    } catch {
      setDisconnectError(t.disconnectError);
    } finally {
      setDisconnecting(null);
    }
  }

  const platformGrid = (
    <ul
      className={`auto-grid ${styles.platforms}`}
      style={{ '--min': '130px', '--gap': '8px' } as CSSProperties}
    >
      {CONNECTABLE.map(({ value: platform }) => {
        const label = networkLabel(platform);
        const already = accounts.some((a) => a.platform === platform);
        const redirecting = connecting === platform;
        return (
          <li key={platform}>
            <button
              type="button"
              className={styles.platform}
              data-connected={already || undefined}
              onClick={() => void handleConnectPlatform(platform)}
              disabled={connecting !== null}
              aria-busy={redirecting || undefined}
              aria-label={redirecting ? t.redirecting : already ? t.connectAgainAria(label) : t.connectAria(label)}
            >
              <span className={styles.platformIcon} aria-hidden="true">
                <ChannelIcon name={platform} size={16} />
              </span>
              <span className={styles.platformName}>{redirecting ? t.redirecting : label}</span>
              {already && <Icon name="check" size={14} strokeWidth={2.4} className={styles.platformCheck} />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div className={styles.notices}>
        {autoConnecting && !connectError && (
          <Notice tone="info">{t.autoConnecting(networkLabel(autoConnecting))}</Notice>
        )}
        {connectError && <Notice tone="danger">{connectError}</Notice>}
        {disconnectError && <Notice tone="danger">{disconnectError}</Notice>}
        {connectSuccess && (
          <Notice tone="success" icon={<Icon name="check-circle" size={16} />}>
            {t.connectedOk(networkLabel(connectSuccess))}
          </Notice>
        )}
      </div>

      {mode === 'onboarding' ? (
        accounts.length > 0 ? (
          <div className={styles.cta}>
            <p className={styles.title}>{t.ctaTitle}</p>
            <p className={styles.desc}>{t.ctaDesc}</p>
            <ButtonLink
              href={contentHref ?? '/dashboard/content'}
              variant="primary"
              icon={<Icon name="sparkles" size={16} />}
            >
              {t.ctaButton}
            </ButtonLink>
          </div>
        ) : (
          <>
            <p className={styles.title}>{t.connectTitle}</p>
            <p className={styles.desc}>{t.connectDesc}</p>
            {platformGrid}
          </>
        )
      ) : (
        <>
          {!loadingAccounts && accounts.length > 0 && (
            <div className={styles.block}>
              <h3 className={styles.heading}>{t.connected}</h3>
              <ul className={styles.accounts}>
                {accounts.map((acc) => {
                  const network = networkLabel(acc.platform);
                  const meta = [
                    network,
                    acc.status ? (t.accountStatus[acc.status] ?? acc.status) : null,
                    acc.token_expires_at
                      ? t.expires(new Date(acc.token_expires_at).toLocaleDateString(t.dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }))
                      : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <li key={acc.id} className={styles.account}>
                      <div className={styles.accountRow}>
                        <span className={styles.accountIcon} aria-hidden="true">
                          <ChannelIcon name={acc.platform} size={18} />
                        </span>
                        <div className={styles.accountInfo}>
                          <p className={styles.accountName}>{acc.username || network}</p>
                          <p className={styles.accountMeta}>{meta}</p>
                        </div>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          className={styles.accountAction}
                          onClick={() => void handleDisconnect(acc)}
                          loading={disconnecting === acc.id}
                          disabled={disconnecting !== null}
                          aria-label={t.disconnectAria(acc.username || network, network)}
                        >
                          {t.disconnect}
                        </Button>
                      </div>
                      {/* Zernio's API has no sensitivity flag — X decides from the
                          account's own "may be sensitive" setting, so point the
                          user at it instead of leaving them stuck. */}
                      {acc.platform === 'twitter' && (
                        <p className={styles.hint}>
                          {t.xSensitiveHint}{' '}
                          <a
                            href="https://x.com/settings/safety"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            {t.xSensitiveLink}
                          </a>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <h3 className={styles.heading}>{t.connectNew}</h3>
          {platformGrid}
        </>
      )}

      {dialog}
    </>
  );
}
