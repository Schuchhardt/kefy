'use client';

// ─── API keys y conexión MCP ─────────────────────────────────────────────────
//
// Gestión de las API keys de la organización (MCP y /api/v1) desde Ajustes.
// Solo lo ve el dueño o un administrador: la página no monta este componente
// para los miembros y /api/api-keys responde 403 igualmente.
//
// El secreto en claro llega una única vez, en la respuesta del POST: se
// muestra en el modal de creación y se olvida al cerrarlo. Después solo queda
// el prefijo. Ver docs/assistant.md.
//
// No se importa nada de lib/assistant/api-keys.ts: usa node:crypto y no puede
// entrar en el bundle del navegador. Los scopes se repiten aquí.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import Modal from '@/components/ui/Modal';
import Button, { Spinner } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/icons';
import { useBrand } from '@/lib/brand-context';
import styles from './ApiKeysSection.module.css';

import esT from '@/locales/es/dashboard/settings';
import enT from '@/locales/en/dashboard/settings';

const T = { es: esT.apiKeys, en: enT.apiKeys } as const;
type Copy = (typeof T)['es'];

type Scope = 'read' | 'write' | 'publish';
const SCOPES: readonly Scope[] = ['read', 'write', 'publish'];

/** Igual que MAX_ACTIVE_API_KEYS de lib/assistant/api-keys.ts. */
const MAX_ACTIVE_KEYS = 10;

const EXPIRY_OPTIONS = [0, 30, 90, 365] as const;

type KeyStatus = 'active' | 'revoked' | 'expired';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: Scope[];
  brand_id: string | null;
  created_by: string | null;
  created_by_user: { name: string | null; email: string | null } | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: KeyStatus;
}

interface CreatedKey {
  name: string;
  prefix: string;
  secret: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatDate(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** «hace 3 horas» / «3 hours ago». */
function formatRelative(iso: string, lang: 'es' | 'en'): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
    ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(0, 'minute');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Botón copiar ─────────────────────────────────────────────────────────────

function CopyButton({ text, t }: { text: string; t: Copy }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <Button
      size="sm"
      variant="secondary"
      icon={state === 'copied' ? <Icon name="check" size={14} /> : undefined}
      onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
      style={{ flexShrink: 0 }}
    >
      {state === 'copied' ? t.copied : state === 'failed' ? t.copyFailed : t.copy}
    </Button>
  );
}

function CodeBlock({ code, t }: { code: string; t: Copy }) {
  return (
    <div className={styles.code}>
      <pre className={`${styles.mono} ${styles.codeText}`}>
        {code}
      </pre>
      <CopyButton text={code} t={t} />
    </div>
  );
}

// ─── Badge de scope ───────────────────────────────────────────────────────────

function ScopeBadge({ scope, t }: { scope: Scope; t: Copy }) {
  // Publicar es el permiso con riesgo (actúa sin confirmación humana).
  const style = (scope === 'publish'
    ? { '--badge-color': 'var(--warning)', '--badge-bg': 'var(--warning-soft)' }
    : { '--badge-color': 'var(--accent-text)', '--badge-bg': 'var(--accent-soft)' }) as CSSProperties;
  return (
    <span className="ui-badge" style={style}>
      {t.scopes[scope].label}
    </span>
  );
}

// ─── Fila de una key ──────────────────────────────────────────────────────────

function KeyRow({
  k, t, lang, brandName, onRevoke,
}: {
  k: ApiKeyRow;
  t: Copy;
  lang: 'es' | 'en';
  brandName: string;
  onRevoke: (k: ApiKeyRow) => void;
}) {
  const active = k.status === 'active';
  const creator = k.created_by_user?.name || k.created_by_user?.email || null;

  const meta: string[] = [brandName];
  if (creator) meta.push(t.createdBy(creator));
  meta.push(k.last_used_at ? t.lastUsed(formatRelative(k.last_used_at, lang)) : t.neverUsed);
  // En una revocada la caducidad ya no importa: basta con el badge de estado.
  if (k.status !== 'revoked') {
    if (!k.expires_at) meta.push(t.noExpiry);
    else meta.push(active ? t.expiresOn(formatDate(k.expires_at, t.dateLocale)) : t.expiredOn(formatDate(k.expires_at, t.dateLocale)));
  }

  return (
    <li className={styles.key} data-inactive={!active || undefined}>
      <div className={styles.keyMain}>
        <div className={styles.keyTitle}>
          <span className={styles.keyName}>{k.name}</span>
          <code className={`${styles.mono} ${styles.prefix}`}>{k.key_prefix}…</code>
          {!active && (
            <span className="ui-badge">
              {k.status === 'revoked' ? t.statusRevoked : t.statusExpired}
            </span>
          )}
        </div>
        <div className={styles.badges}>
          {SCOPES.filter((s) => k.scopes.includes(s)).map((s) => (
            <ScopeBadge key={s} scope={s} t={t} />
          ))}
        </div>
        <p className={styles.meta}>{meta.join(' · ')}</p>
      </div>
      {active && (
        <Button size="sm" variant="danger-ghost" className={styles.keyAction} onClick={() => onRevoke(k)}>
          {t.revoke}
        </Button>
      )}
    </li>
  );
}

// ─── Modal de creación ────────────────────────────────────────────────────────

function CreateKeyModal({
  open, onClose, onCreated, t, lang,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  t: Copy;
  lang: 'es' | 'en';
}) {
  const { brands } = useBrand();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [brandId, setBrandId] = useState('');
  const [expiry, setExpiry] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);

  // Cada apertura empieza de cero; el secreto no sobrevive al cierre.
  useEffect(() => {
    if (!open) return;
    setName(''); setScopes(['read']); setBrandId(''); setExpiry(0);
    setSubmitting(false); setError(null); setCreated(null);
  }, [open]);

  const activeBrands = brands.filter((b) => !b.archived);

  function toggleScope(s: Scope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (scopes.length === 0) { setError(t.scopesRequired); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes: SCOPES.filter((s) => scopes.includes(s)),
          ...(brandId ? { brand_id: brandId } : {}),
          ...(expiry > 0 ? { expires_in_days: expiry } : {}),
          lang,
        }),
      });
      const data = await res.json().catch(() => ({})) as {
        key?: { name: string; prefix: string };
        secret?: string;
        error?: string;
      };
      if (res.ok && data.secret && data.key) {
        setCreated({ name: data.key.name, prefix: data.key.prefix, secret: data.secret });
        onCreated();
        return;
      }
      // 402/503 (suscripción) traen un mensaje ya traducido al `lang` pedido.
      // 404 (marca) y 409 (límite de keys) llegan en inglés: copy propia.
      // 422 es un fallo de validación con detalles técnicos.
      if (res.status === 422) setError(t.invalidInput);
      else if (res.status === 404) setError(t.brandNotFound);
      else if (res.status === 409) setError(t.keyLimitReached(MAX_ACTIVE_KEYS));
      else if (typeof data.error === 'string' && [402, 503].includes(res.status)) setError(data.error);
      else setError(t.createError);
    } catch {
      setError(t.createError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? t.secretTitle : t.createTitle}
      subtitle={created ? `${created.name} · ${created.prefix}…` : undefined}
      maxWidth={520}
      closeLabel={t.close}
      padded
      // Con el secreto a la vista no se cierra por un clic fuera ni con Esc:
      // solo con el botón explícito.
      dismissable={!submitting && !created}
    >
      {created ? (
        <div className={styles.stack}>
          <Notice tone="warning" icon={<Icon name="alert" size={16} />}>{t.secretWarning}</Notice>
          <div className={styles.secret}>
            <code className={`${styles.mono} ${styles.secretText}`}>{created.secret}</code>
            <CopyButton text={created.secret} t={t} />
          </div>
          <div className={styles.actions}>
            <Button variant="primary" onClick={onClose}>{t.done}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          <Field label={t.nameLabel}>
            <Input
              value={name}
              maxLength={100}
              autoFocus
              required
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
            />
          </Field>

          <fieldset className={styles.fieldset}>
            <legend className={`ui-label ${styles.legend}`}>{t.scopesLabel}</legend>
            <div className={styles.scopes}>
              {SCOPES.map((s) => (
                <label key={s} className={styles.scope} data-checked={scopes.includes(s) || undefined}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                  <span className={styles.scopeText}>
                    <span className={styles.scopeLabel}>{t.scopes[s].label}</span>
                    <span className={styles.scopeHint}>{t.scopes[s].hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {/* role="alert" y no el status de Notice: es un aviso de riesgo que
                tiene que oírse en cuanto se marca la casilla. */}
            {scopes.includes('publish') && (
              <div role="alert" className={`ui-notice ui-notice--warning ${styles.warning}`}>
                <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, marginTop: 2 }}>
                  <Icon name="alert" size={16} />
                </span>
                <div style={{ minWidth: 0 }}>{t.publishWarning}</div>
              </div>
            )}
          </fieldset>

          <div className="auto-grid" style={{ '--min': '180px', '--gap': '16px' } as CSSProperties}>
            <Field label={t.brandLabel} hint={t.brandHint}>
              <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">{t.allBrands}</option>
                {activeBrands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.expiryLabel}>
              <Select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d === 0 ? t.expiryNever : t.expiryDays(d)}</option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <Notice tone="danger">{error}</Notice>}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!name.trim() || scopes.length === 0}
            >
              {submitting ? t.creating : t.submit}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Modal de revocación ──────────────────────────────────────────────────────

function RevokeKeyModal({
  target, onClose, onRevoked, t,
}: {
  target: ApiKeyRow | null;
  onClose: () => void;
  onRevoked: () => void;
  t: Copy;
}) {
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) { setRevoking(false); setError(null); }
  }, [target]);

  async function handleRevoke() {
    if (!target) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      // 404: ya estaba revocada (otra pestaña, otro admin). El resultado es el
      // mismo que se pedía.
      if (res.ok || res.status === 404) {
        onRevoked();
        onClose();
        return;
      }
      setError(t.revokeError);
    } catch {
      setError(t.revokeError);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={t.revokeTitle}
      maxWidth={440}
      closeLabel={t.close}
      padded
      dismissable={!revoking}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={revoking}>
            {t.cancel}
          </Button>
          <Button variant="danger" onClick={handleRevoke} loading={revoking}>
            {revoking ? t.revoking : t.revokeConfirm}
          </Button>
        </>
      }
    >
      {target && (
        <div className={styles.stack}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{t.revokeBody(target.name)}</p>
          <code className={`${styles.mono} ${styles.prefix}`}>{target.key_prefix}…</code>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}

// ─── Conexión MCP ─────────────────────────────────────────────────────────────

type SnippetKey = 'claudeCode' | 'cursor' | 'claudeDesktop' | 'curl';

const SNIPPET_TABS: { key: SnippetKey; label: string }[] = [
  { key: 'claudeCode', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'claudeDesktop', label: 'Claude Desktop' },
  { key: 'curl', label: 'curl' },
];

function buildSnippets(origin: string): Record<SnippetKey, string> {
  const mcpUrl = `${origin}/api/mcp`;
  return {
    claudeCode:
      `claude mcp add --transport http kefy ${mcpUrl} \\\n  --header "Authorization: Bearer kefy_sk_..."`,
    cursor: JSON.stringify({
      mcpServers: {
        kefy: { url: mcpUrl, headers: { Authorization: 'Bearer kefy_sk_...' } },
      },
    }, null, 2),
    // `Authorization:Bearer` sin espacio a propósito: algunos lanzadores parten
    // los argumentos por espacios (ver docs/assistant.md §7).
    claudeDesktop: JSON.stringify({
      mcpServers: {
        kefy: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization:Bearer ${KEFY_API_KEY}'],
          env: { KEFY_API_KEY: 'kefy_sk_...' },
        },
      },
    }, null, 2),
    curl: `curl -s "${origin}/api/v1/tools" \\\n  -H "Authorization: Bearer kefy_sk_..."`,
  };
}

function ConnectPanel({ t }: { t: Copy }) {
  // window solo existe en el cliente: el origen se resuelve tras montar para
  // no desalinear el HTML del servidor.
  const [origin, setOrigin] = useState('');
  const [tab, setTab] = useState<SnippetKey>('claudeCode');
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<SnippetKey, HTMLButtonElement | null>>>({});

  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (!origin) return null;
  const snippets = buildSnippets(origin);
  const tabId = (key: SnippetKey) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;

  // Pestañas ARIA: flechas, Inicio y Fin mueven la selección y el foco.
  function onTabsKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = SNIPPET_TABS.findIndex((s) => s.key === tab);
    const last = SNIPPET_TABS.length - 1;
    const next =
      e.key === 'ArrowRight' ? (current === last ? 0 : current + 1)
      : e.key === 'ArrowLeft' ? (current === 0 ? last : current - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    const key = SNIPPET_TABS[next].key;
    setTab(key);
    tabRefs.current[key]?.focus();
  }

  return (
    <div className={styles.connect}>
      <h3 className={styles.connectTitle}>{t.connectTitle}</h3>
      <p className={styles.connectIntro}>{t.connectIntro}</p>

      <p className={styles.label}>{t.mcpUrlLabel}</p>
      <CodeBlock code={`${origin}/api/mcp`} t={t} />

      <div role="tablist" aria-label={t.snippetsLabel} className={styles.tabs} onKeyDown={onTabsKeyDown}>
        {SNIPPET_TABS.map(({ key, label }) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              ref={(el) => { tabRefs.current[key] = el; }}
              id={tabId(key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(key)}
              className={styles.tab}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
        <p className={styles.snippetHint}>{t.snippetHints[tab]}</p>
        <CodeBlock code={snippets[tab]} t={t} />
      </div>
    </div>
  );
}

// ─── Sección ──────────────────────────────────────────────────────────────────

export default function ApiKeysSection({ lang }: { lang: 'es' | 'en' }) {
  const t = T[lang] ?? T.es;
  const { brands } = useBrand();

  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const inactiveId = useId();

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/api-keys', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { keys?: ApiKeyRow[] };
      setKeys(data.keys ?? []);
    } catch {
      setLoadError(true);
      setKeys((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const closeRevoke = useCallback(() => setRevokeTarget(null), []);

  const active = (keys ?? []).filter((k) => k.status === 'active');
  const inactive = (keys ?? []).filter((k) => k.status !== 'active');
  const atLimit = active.length >= MAX_ACTIVE_KEYS;

  function brandLabel(brandId: string | null): string {
    if (!brandId) return t.allBrands;
    return brands.find((b) => b.id === brandId)?.name ?? t.unknownBrand;
  }

  return (
    <div>
      <div className={styles.header}>
        <p className={styles.intro}>{t.intro}</p>
        <Button
          variant="primary"
          icon={<Icon name="plus" size={16} />}
          onClick={() => setCreateOpen(true)}
          disabled={keys === null || atLimit}
        >
          {t.create}
        </Button>
      </div>

      {keys === null ? (
        <p className={styles.loading}><Spinner size={14} /> {t.loading}</p>
      ) : (
        <>
          {loadError && (
            <Notice tone="danger">
              <span className={styles.inline}>
                <span>{t.loadError}</span>
                <Button size="sm" variant="secondary" onClick={() => void load()}>{t.retry}</Button>
              </span>
            </Notice>
          )}

          {!loadError && active.length === 0 && (
            <EmptyState compact icon={<Icon name="link" size={24} />} title={t.empty} />
          )}

          {active.length > 0 && (
            <ul className={styles.list}>
              {active.map((k) => (
                <KeyRow key={k.id} k={k} t={t} lang={lang} brandName={brandLabel(k.brand_id)} onRevoke={setRevokeTarget} />
              ))}
            </ul>
          )}

          {atLimit && <p className={styles.note}>{t.limitNote(MAX_ACTIVE_KEYS)}</p>}

          {inactive.length > 0 && (
            <div className={styles.more}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowInactive((v) => !v)}
                aria-expanded={showInactive}
                aria-controls={showInactive ? inactiveId : undefined}
                icon={<Icon name={showInactive ? 'chevron-up' : 'chevron-down'} size={14} />}
              >
                {showInactive ? t.hideInactive : t.showInactive(inactive.length)}
              </Button>
              {showInactive && (
                <ul id={inactiveId} className={styles.list}>
                  {inactive.map((k) => (
                    <KeyRow key={k.id} k={k} t={t} lang={lang} brandName={brandLabel(k.brand_id)} onRevoke={setRevokeTarget} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <ConnectPanel t={t} />

      <CreateKeyModal open={createOpen} onClose={closeCreate} onCreated={load} t={t} lang={lang} />
      <RevokeKeyModal target={revokeTarget} onClose={closeRevoke} onRevoked={load} t={t} />
    </div>
  );
}
