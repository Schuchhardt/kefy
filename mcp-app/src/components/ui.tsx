// Piezas básicas de la vista: botón con estado de carga, panel inline,
// aviso, chip, íconos SVG (nada de emojis) y la confirmación de costo.
//
// Los paneles van en el flujo de la tarjeta, no como modales fijos: el iframe
// del host se ajusta a la altura del contenido y un overlay quedaría cortado.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useEnv } from '../context';

type IconName =
  | 'check' | 'undo' | 'archive' | 'edit' | 'image' | 'chat' | 'convert' | 'video' | 'send'
  | 'external' | 'expand' | 'collapse' | 'close' | 'prev' | 'next' | 'back' | 'reload' | 'alert';

const PATHS: Record<IconName, string> = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  archive: 'M4 7h16M5 7l1 13h12l1-13M9 11h6M3 3h18v4H3z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  chat: 'M4 5h16v11H9l-5 4V5z',
  convert: 'M7 7h11l-3-3M17 17H6l3 3',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  back: 'M10 6l-6 6 6 6M4 12h16',
  reload: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  alert: 'M12 8v5M12 16.5v.5M10.3 4h3.4L21 19H3z',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="k-spinner" role={label ? 'status' : undefined} aria-label={label} />;
}

type ButtonProps = {
  children?: ReactNode;
  onClick?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  /** Obligatorio si el botón es solo ícono. */
  label?: string;
  pressed?: boolean;
};

export function Button({
  children, onClick, icon, variant = 'secondary', busy, disabled, type = 'button', label, pressed,
}: ButtonProps) {
  const { t } = useEnv();
  return (
    <button
      type={type}
      className={`k-btn k-btn--${variant}${children ? '' : ' k-btn--icon'}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={label}
      aria-pressed={pressed}
      title={!children ? label : undefined}
    >
      {busy ? <Spinner label={t.loading} /> : icon ? <Icon name={icon} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }) {
  return <span className={`k-chip k-chip--${tone}`}>{children}</span>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success' }) {
  return (
    <div className={`k-notice k-notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {tone === 'danger' || tone === 'warning' ? <Icon name="alert" size={16} /> : null}
      <div>{children}</div>
    </div>
  );
}

/** Panel inline con título y botón de cerrar; enfoca su primer campo al abrirse. */
export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useEnv();
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button:not([data-close])');
    first?.focus();
  }, []);
  return (
    <section
      ref={ref}
      className="k-panel"
      aria-labelledby={id}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <header className="k-panel__head">
        <h3 id={id}>{title}</h3>
        <button type="button" data-close className="k-btn k-btn--ghost k-btn--icon" onClick={onClose} aria-label={t.close} title={t.close}>
          <Icon name="close" />
        </button>
      </header>
      {children}
    </section>
  );
}

/**
 * Confirmación del costo antes de una acción que gasta créditos. El botón se
 * desactiva si los créditos del mes no alcanzan (cuando se conocen).
 */
export function CreditConfirm({
  credits, remaining, onConfirm, onCancel, busy, confirmLabel, extra,
}: {
  credits: number;
  remaining: number | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  confirmLabel?: string;
  extra?: ReactNode;
}) {
  const { t } = useEnv();
  const notEnough = remaining !== null && credits > remaining;
  return (
    <div className="k-confirm" role="group" aria-label={t.credits.confirmTitle}>
      <p className="k-confirm__title">{t.credits.confirmTitle}</p>
      <p>{t.credits.confirmBody(credits)}{remaining !== null ? ` ${t.credits.remaining(remaining)}` : ''}</p>
      {extra}
      {notEnough ? <Notice tone="warning">{t.credits.notEnough}</Notice> : null}
      <div className="k-row">
        <Button variant="primary" icon="check" onClick={onConfirm} busy={busy} disabled={notEnough}>
          {confirmLabel ?? t.confirm}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t.cancel}</Button>
      </div>
    </div>
  );
}

export function Field({ label, help, children, htmlFor }: { label: string; help?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="k-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help ? <p className="k-help" id={`${htmlFor}-help`}>{help}</p> : null}
    </div>
  );
}
