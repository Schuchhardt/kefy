'use client';

interface ContentActionsProps {
  onView:   () => void;
  onEdit:   () => void;
  onDelete: () => void;
  /** Suppresses parent click bubbling (the row card). */
  stopPropagation?: boolean;
  size?: 'sm' | 'md';
  lang?: 'es' | 'en';
}

export default function ContentActions({
  onView, onEdit, onDelete, stopPropagation = true, size = 'sm', lang = 'es',
}: ContentActionsProps) {
  const px = size === 'md' ? 32 : 28;
  const fs = size === 'md' ? 14 : 13;

  const wrap = (handler: () => void) => (e: React.MouseEvent) => {
    if (stopPropagation) { e.stopPropagation(); e.preventDefault(); }
    handler();
  };

  const labels = lang === 'en'
    ? { view: 'View & publish', edit: 'Edit', del: 'Delete' }
    : { view: 'Ver y publicar', edit: 'Editar', del: 'Eliminar' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => stopPropagation && e.stopPropagation()}>
      <button
        type="button"
        onClick={wrap(onView)}
        title={labels.view}
        aria-label={labels.view}
        style={btnStyle(px, fs, 'var(--accent)')}
      >
        <EyeIcon size={fs + 1} />
      </button>
      <button
        type="button"
        onClick={wrap(onEdit)}
        title={labels.edit}
        aria-label={labels.edit}
        style={btnStyle(px, fs)}
      >
        <PencilIcon size={fs + 1} />
      </button>
      <button
        type="button"
        onClick={wrap(onDelete)}
        title={labels.del}
        aria-label={labels.del}
        style={btnStyle(px, fs, '#ff6b6b')}
      >
        <TrashIcon size={fs + 1} />
      </button>
    </div>
  );
}

function btnStyle(size: number, fs: number, color?: string): React.CSSProperties {
  return {
    width: size, height: size, borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: color ?? 'var(--text)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: fs, lineHeight: 1, padding: 0,
    transition: 'background 0.12s, border-color 0.12s',
  };
}

function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
