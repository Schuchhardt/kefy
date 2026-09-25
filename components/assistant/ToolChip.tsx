'use client';

// ─── Chip de progreso de una herramienta ─────────────────────────────────────
//
// «Creando carrusel…» con un spinner mientras corre, y luego un check o una
// cruz. Si la herramienta devolvió enlaces (el contenido creado, la
// conversación…), un botón «Abrir» lleva al primero. Los href vienen del
// servidor (lib/assistant/links.ts) y además se exige que sean internos.

import { useRouter } from 'next/navigation';
import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';
import type { ToolLink } from '@/lib/assistant/types';
import type { ToolPartStatus } from '@/lib/assistant/use-assistant';

const T = { es: esT, en: enT } as const;

export function isInternalHref(href: string | undefined, lang: 'es' | 'en'): href is string {
  if (!href) return false;
  const prefix = `/${lang}/dashboard`;
  return href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`);
}

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <>
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
          border: '2px solid rgba(198,255,75,0.25)', borderTopColor: 'var(--accent)',
          animation: 'kefy-assistant-spin 0.9s linear infinite',
        }}
      />
      <style>{'@keyframes kefy-assistant-spin { to { transform: rotate(360deg); } }'}</style>
    </>
  );
}

function StatusIcon({ status }: { status: ToolPartStatus }) {
  // Solo gira lo que tiene un stream que lo va a cerrar. Lo pendiente o sin
  // resultado del historial lleva un reloj quieto.
  if (status === 'running') return <Spinner />;
  if (status === 'pending' || status === 'unsettled') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden
        stroke="var(--muted)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
    );
  }
  const ok = status === 'done';
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden
      stroke={ok ? 'var(--assistant-accent-text)' : 'var(--muted)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

export default function ToolChip({
  lang,
  name,
  status,
  links,
  error,
  onNavigate,
}: {
  lang: 'es' | 'en';
  name: string;
  status: ToolPartStatus;
  links?: ToolLink[];
  error?: string;
  onNavigate?: () => void;
}) {
  const t = T[lang];
  const router = useRouter();
  const label = (t.toolLabels as Record<string, string>)[name] ?? name;
  const extra =
    status === 'rejected' ? t.toolStatus.rejected
    : status === 'expired' ? t.toolStatus.expired
    : status === 'pending' ? t.toolStatus.pending
    : status === 'unsettled' ? t.toolStatus.unsettled
    : status === 'error' ? t.toolStatus.error
    : null;
  const link = links?.find((l) => isInternalHref(l.href, lang));
  // En pasado, sin los puntos suspensivos, cuando ya terminó.
  const shown = status === 'running' ? label : label.replace(/…$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <div
        role="status"
        title={error}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%',
          padding: '5px 6px 5px 10px', borderRadius: 999,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: 12, color: status === 'error' ? 'var(--muted)' : 'var(--text)',
        }}
      >
        <StatusIcon status={status} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shown}{extra ? ` · ${extra}` : ''}
        </span>
        {link && status === 'done' ? (
          <button
            type="button"
            onClick={() => { router.push(link.href); onNavigate?.(); }}
            style={{
              padding: '2px 9px', borderRadius: 999, border: '1px solid rgba(198,255,75,0.35)',
              background: 'rgba(198,255,75,0.10)', color: 'var(--assistant-accent-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t.open}
          </button>
        ) : <span style={{ width: 4 }} />}
      </div>
      {status === 'error' && error ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)', paddingLeft: 10, maxWidth: '100%' }}>{error}</span>
      ) : status === 'unsettled' ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)', paddingLeft: 10, maxWidth: '100%' }}>{t.toolStatus.unsettledHint}</span>
      ) : null}
    </div>
  );
}
