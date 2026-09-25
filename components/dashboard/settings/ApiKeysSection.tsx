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

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/dashboard/content/Modal';
import { useBrand } from '@/lib/brand-context';

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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains), monospace',
  fontSize: 12,
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: 'var(--accent)', color: '#0A0A0C', border: 'none', borderRadius: 8,
  padding: '9px 18px', fontWeight: 600, fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

const secondaryBtn = (disabled = false): React.CSSProperties => ({
  background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 14px', fontWeight: 600, fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

const dangerBtn = (disabled: boolean): React.CSSProperties => ({
  background: 'rgba(255,107,107,0.12)', color: '#ff6b6b',
  border: '1px solid rgba(255,107,107,0.35)', borderRadius: 8,
  padding: '9px 18px', fontWeight: 600, fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

const errorStyle: React.CSSProperties = { color: '#ff6b6b', fontSize: 13 };

const warningBox: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
  background: 'rgba(255,176,32,0.10)', border: '1px solid rgba(255,176,32,0.35)',
  color: 'var(--text)',
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatDate(iso: string, lang: 'es' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
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
    <button
      type="button"
      onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
      style={{ ...secondaryBtn(), flexShrink: 0, padding: '6px 12px' }}
    >
      {state === 'copied' ? t.copied : state === 'failed' ? t.copyFailed : t.copy}
    </button>
  );
}

function CodeBlock({ code, t }: { code: string; t: Copy }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 10px 10px 14px',
    }}>
      <pre style={{
        ...monoStyle, margin: 0, flex: 1, minWidth: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text)', lineHeight: 1.6,
      }}>
        {code}
      </pre>
      <CopyButton text={code} t={t} />
    </div>
  );
}

// ─── Badge de scope ───────────────────────────────────────────────────────────

function ScopeBadge({ scope, t }: { scope: Scope; t: Copy }) {
  const publish = scope === 'publish';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: publish ? 'rgba(255,176,32,0.12)' : 'rgba(198,255,75,0.10)',
      border: `1px solid ${publish ? 'rgba(255,176,32,0.4)' : 'rgba(198,255,75,0.35)'}`,
      color: 'var(--text)', whiteSpace: 'nowrap',
    }}>
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
    else meta.push(active ? t.expiresOn(formatDate(k.expires_at, lang)) : t.expiredOn(formatDate(k.expires_at, lang)));
  }

  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--bg)', border: '1px solid var(--border)',
      opacity: active ? 1 : 0.6,
    }}>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{k.name}</span>
          <code style={{ ...monoStyle, color: 'var(--muted)' }}>{k.key_prefix}…</code>
          {!active && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              {k.status === 'revoked' ? t.statusRevoked : t.statusExpired}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCOPES.filter((s) => k.scopes.includes(s)).map((s) => (
            <ScopeBadge key={s} scope={s} t={t} />
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          {meta.join(' · ')}
        </p>
      </div>
      {active && (
        <button type="button" onClick={() => onRevoke(k)} style={secondaryBtn()}>
          {t.revoke}
        </button>
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
      // Con el secreto a la vista no se cierra por un clic fuera: solo con el
      // botón explícito (o la ✕ de la cabecera).
      dismissable={!submitting && !created}
    >
      {created ? (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={warningBox}>{t.secretWarning}</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 8,
            padding: '10px 10px 10px 14px',
          }}>
            <code style={{
              ...monoStyle, fontSize: 13, flex: 1, minWidth: 0,
              wordBreak: 'break-all', userSelect: 'all', color: 'var(--text)',
            }}>
              {created.secret}
            </code>
            <CopyButton text={created.secret} t={t} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={primaryBtn(false)}>{t.done}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label htmlFor="api-key-name" style={labelStyle}>{t.nameLabel}</label>
            <input
              id="api-key-name"
              style={inputStyle}
              value={name}
              maxLength={100}
              autoFocus
              required
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
            />
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={labelStyle}>{t.scopesLabel}</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SCOPES.map((s) => (
                <label key={s} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${scopes.includes(s) ? 'rgba(198,255,75,0.35)' : 'var(--border)'}`,
                  background: scopes.includes(s) ? 'rgba(198,255,75,0.05)' : 'transparent',
                }}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.scopes[s].label}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{t.scopes[s].hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {scopes.includes('publish') && (
              <div role="alert" style={{ ...warningBox, marginTop: 10 }}>⚠ {t.publishWarning}</div>
            )}
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label htmlFor="api-key-brand" style={labelStyle}>{t.brandLabel}</label>
              <select
                id="api-key-brand"
                style={inputStyle}
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              >
                <option value="">{t.allBrands}</option>
                {activeBrands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="api-key-expiry" style={labelStyle}>{t.expiryLabel}</label>
              <select
                id="api-key-expiry"
                style={inputStyle}
                value={expiry}
                onChange={(e) => setExpiry(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d === 0 ? t.expiryNever : t.expiryDays(d)}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-8px 0 0' }}>{t.brandHint}</p>

          {error && <p role="alert" style={{ ...errorStyle, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={secondaryBtn(submitting)}>
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || scopes.length === 0}
              style={primaryBtn(submitting || !name.trim() || scopes.length === 0)}
            >
              {submitting ? t.creating : t.submit}
            </button>
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
      dismissable={!revoking}
    >
      {target && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{t.revokeBody(target.name)}</p>
          <code style={{ ...monoStyle, color: 'var(--muted)' }}>{target.key_prefix}…</code>
          {error && <p role="alert" style={{ ...errorStyle, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} disabled={revoking} style={secondaryBtn(revoking)}>
              {t.cancel}
            </button>
            <button type="button" onClick={handleRevoke} disabled={revoking} style={dangerBtn(revoking)}>
              {revoking ? t.revoking : t.revokeConfirm}
            </button>
          </div>
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

  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (!origin) return null;
  const snippets = buildSnippets(origin);

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
        {t.connectTitle}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
        {t.connectIntro}
      </p>

      <span style={labelStyle}>{t.mcpUrlLabel}</span>
      <CodeBlock code={`${origin}/api/mcp`} t={t} />

      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '18px 0 10px' }}>
        {SNIPPET_TABS.map(({ key, label }) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: selected ? 'rgba(198,255,75,0.12)' : 'transparent',
                border: `1px solid ${selected ? 'rgba(198,255,75,0.45)' : 'var(--border)'}`,
                color: selected ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>{t.snippetHints[tab]}</p>
      <CodeBlock code={snippets[tab]} t={t} />
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5, flex: '1 1 300px' }}>
          {t.intro}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={keys === null || atLimit}
          style={primaryBtn(keys === null || atLimit)}
        >
          + {t.create}
        </button>
      </div>

      {keys === null ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loading}</p>
      ) : (
        <>
          {loadError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={errorStyle}>{t.loadError}</span>
              <button type="button" onClick={load} style={secondaryBtn()}>{t.retry}</button>
            </div>
          )}

          {!loadError && active.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{t.empty}</p>
          )}

          {active.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {active.map((k) => (
                <KeyRow key={k.id} k={k} t={t} lang={lang} brandName={brandLabel(k.brand_id)} onRevoke={setRevokeTarget} />
              ))}
            </ul>
          )}

          {atLimit && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>{t.limitNote(MAX_ACTIVE_KEYS)}</p>
          )}

          {inactive.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                aria-expanded={showInactive}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showInactive ? t.hideInactive : t.showInactive(inactive.length)}
              </button>
              {showInactive && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
