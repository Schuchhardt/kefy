'use client';

// ─── Tarjeta de confirmación de una acción ───────────────────────────────────
//
// Publicar, responder un DM o un comentario, cambiar la marca o gastar muchos
// créditos pasa siempre por aquí. La vista previa trae datos de terceros
// (nombres, comentarios) envueltos en <untrusted_content> para el modelo: se
// quitan esas etiquetas y todo se pinta como texto (React lo escapa).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';
import { stripUntrustedTags } from '@/lib/assistant/summaries';
import type { ToolLink } from '@/lib/assistant/types';
import type { ConfirmState } from '@/lib/assistant/use-assistant';
import { isInternalHref, Spinner } from '@/components/assistant/ToolChip';

const T = { es: esT, en: enT } as const;

/** Campos que se muestran como cita (texto largo, respetando saltos de línea). */
const QUOTED = new Set(['text', 'comment', 'custom_notes', 'slides']);
/** Campos cuyo valor es un estado del contenido o de la publicación. */
const STATUS_KEYS = new Set(['status', 'current_status', 'new_status']);

type Dict = (typeof T)['es'];

function clean(v: string): string {
  return stripUntrustedTags(v).trim();
}

/** Un valor de la vista previa como texto legible, o null si no aporta nada. */
function formatValue(key: string, value: unknown, t: Dict): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? t.yes : t.no;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const s = clean(value);
    if (!s) return null;
    if (STATUS_KEYS.has(key)) return t.statusLabels[s] ?? s;
    if (key === 'frequency') return t.frequencyLabels[s] ?? s;
    return s;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((v) => {
        if (typeof v === 'string' && key === 'fields') return t.fieldLabels[v] ?? v.replace(/_/g, ' ');
        if (typeof v === 'string' && key === 'tone') return t.toneLabels[v] ?? v;
        return formatValue('', v, t);
      })
      .filter((v): v is string => !!v);
    return items.length ? items.join(', ') : null;
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const f = formatValue(k, v, t);
        return f ? `${t.fieldLabels[k] ?? k.replace(/_/g, ' ')}: ${f}` : null;
      })
      .filter((v): v is string => !!v);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

export default function ConfirmationCard({
  lang,
  name,
  summary,
  preview,
  credits,
  expiresAt,
  state,
  links,
  error,
  disabled,
  onConfirm,
  onCancel,
  onNavigate,
}: {
  lang: 'es' | 'en';
  name: string;
  summary: string;
  preview: Record<string, unknown>;
  credits: number;
  expiresAt?: string;
  state: ConfirmState;
  links?: ToolLink[];
  error?: string;
  /** Otro stream está en curso. */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNavigate?: () => void;
}) {
  const t = T[lang];
  const router = useRouter();

  const expiry = expiresAt ? new Date(expiresAt) : null;

  // Pasado el plazo el servidor la rechaza igual (409); se marca vencida sin
  // esperar al clic.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (state !== 'pending' || !expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return;
    const id = setTimeout(() => setTimedOut(true), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [state, expiresAt]);

  const effective: ConfirmState = state === 'pending' && timedOut ? 'expired' : state;
  const canAct = effective === 'pending' && !disabled;

  const rows = Object.entries(preview ?? {})
    .map(([key, value]) => ({ key, label: t.previewLabels[key] ?? key.replace(/_/g, ' '), value: formatValue(key, value, t) }))
    .filter((r): r is { key: string; label: string; value: string } => !!r.value);

  const statusLabel =
    effective === 'working' ? t.confirm.working
    : effective === 'confirmed' ? t.confirm.confirmed
    : effective === 'cancelled' ? t.confirm.cancelled
    : effective === 'expired' ? t.confirm.expired
    : effective === 'failed' ? t.confirm.failed
    : effective === 'unknown' ? t.confirm.unknown
    : null;

  const link = effective === 'confirmed' ? links?.find((l) => isInternalHref(l.href, lang)) : undefined;
  const title = (t.toolLabels as Record<string, string>)[name]?.replace(/…$/, '') ?? name;
  const dim = effective === 'cancelled' || effective === 'expired';

  return (
    <div
      role="group"
      aria-label={t.confirm.title}
      style={{
        border: `1px solid ${dim ? 'var(--border)' : 'var(--accent)'}`,
        background: dim ? 'transparent' : 'rgba(198,255,75,0.06)',
        borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
        opacity: dim ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {effective === 'pending' ? t.confirm.title : title}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{clean(summary)}</span>
      </div>

      {rows.length > 0 && (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <dt style={{ fontSize: 11, color: 'var(--muted)' }}>{r.label}</dt>
              {QUOTED.has(r.key) ? (
                <dd style={{
                  margin: 0, padding: '6px 10px', borderLeft: '3px solid var(--accent)', background: 'var(--surface-2)',
                  borderRadius: '0 6px 6px 0', fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 180, overflowY: 'auto',
                }}>
                  {r.value}
                </dd>
              ) : (
                <dd style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.value}</dd>
              )}
            </div>
          ))}
        </dl>
      )}

      {credits > 0 && (
        <span style={{ fontSize: 11.5, color: 'var(--assistant-accent-text)', fontFamily: 'var(--font-jetbrains), monospace' }}>
          {t.confirm.cost(credits)}
        </span>
      )}

      {effective === 'pending' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!canAct} onClick={onConfirm}>
            {t.confirm.confirm}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canAct} onClick={onCancel}>
            {t.confirm.cancel}
          </button>
          {expiry && !Number.isNaN(expiry.getTime()) && (
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
              {t.confirm.expires(expiry.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-CL', { hour: '2-digit', minute: '2-digit' }))}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          {effective === 'working' && <Spinner />}
          <span style={{ color: effective === 'confirmed' ? 'var(--assistant-accent-text)' : 'var(--muted)' }}>{statusLabel}</span>
          {link && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { router.push(link.href); onNavigate?.(); }}
            >
              {t.open}
            </button>
          )}
        </div>
      )}
      {effective === 'failed' && error ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{clean(error)}</span>
      ) : null}
    </div>
  );
}
