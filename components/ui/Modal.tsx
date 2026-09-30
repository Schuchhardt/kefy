'use client';

// ─── Modal único de la app ───────────────────────────────────────────────────
//
// Sustituye a las cuatro implementaciones que había (content/Modal, el
// onboarding del home, el hilo de Conversaciones y el panel de Leads). Hace lo
// que ninguna hacía completo:
//
// - Se monta en un portal sobre <body> con z-index --z-modal: nada del
//   dashboard (BottomNav, selectores fijos) queda por encima ni se puede tocar
//   con el diálogo abierto.
// - `aria-labelledby`/`aria-describedby` con el título y el subtítulo.
// - Atrapa el foco (Tab y Shift+Tab ciclan dentro) y lo devuelve al elemento
//   que lo abrió al cerrar. Escape cierra si `dismissable`.
// - En móvil es una hoja inferior con `100dvh` y safe-area; el botón de
//   cerrar mide 44×44.

import {
  useCallback, useEffect, useId, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/** Modales abiertos, en orden de apertura: Escape solo cierra el último. */
const openModals: symbol[] = [];

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])', 'textarea:not([disabled])',
  'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0);
}

function closeLabelFor(): string {
  if (typeof document === 'undefined') return 'Cerrar';
  return document.documentElement.lang === 'en' ? 'Close' : 'Cerrar';
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Nombre accesible cuando no hay título visible. */
  ariaLabel?: string;
  /** Ancho máximo en escritorio, en px. */
  maxWidth?: number;
  children: ReactNode;
  /** Acciones fijas al pie: siguen visibles aunque el cuerpo haga scroll. */
  footer?: ReactNode;
  /** false: ni Escape ni el fondo cierran (estados de carga). */
  dismissable?: boolean;
  /** Elemento que recibe el foco al abrir. Por defecto, el primero enfocable del cuerpo. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** En móvil se abre como hoja inferior (por defecto). false: diálogo centrado. */
  sheet?: boolean;
  /** Cuerpo con relleno estándar (20px). Por defecto no: cada vista decide. */
  padded?: boolean;
  /** Centrado vertical en escritorio (por defecto, anclado arriba). */
  centered?: boolean;
  closeLabel?: string;
  /** Oculta la X (diálogos que se cierran solo con sus acciones). */
  hideClose?: boolean;
  className?: string;
  role?: 'dialog' | 'alertdialog';
}

export default function Modal({
  open, onClose, title, subtitle, ariaLabel, maxWidth = 560, children, footer,
  dismissable = true, initialFocusRef, sheet = true, padded = false, centered = false,
  closeLabel, hideClose = false, className, role = 'dialog',
}: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Solo en el cliente: el portal necesita document.body.
  useEffect(() => { setMounted(true); }, []);

  // Última versión de onClose sin re-suscribir los efectos en cada render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Foco: entra al abrir, vuelve al que abrió al cerrar.
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const target = initialFocusRef?.current
        ?? focusables(dialog).find((el) => !el.classList.contains('ui-modal-close'))
        ?? dialog;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, mounted, initialFocusRef]);

  // Escape y bloqueo del scroll del fondo. AssistantWidget no se cierra con
  // Escape mientras body tiene overflow hidden. Con dos modales abiertos (una
  // confirmación sobre un formulario) solo reacciona el de arriba: todos
  // escuchan en `window` y stopPropagation no los separa, así que cada uno
  // comprueba que es el último de la pila.
  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    openModals.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || !dismissable) return;
      if (openModals[openModals.length - 1] !== token) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openModals.lastIndexOf(token);
      if (i !== -1) openModals.splice(i, 1);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissable]);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = focusables(dialog);
    if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }, []);

  if (!open || !mounted) return null;

  const hasHeader = Boolean(title || subtitle);
  const overlayClass = ['ui-modal-overlay', sheet ? 'is-sheet' : '', centered ? 'is-centered' : ''].filter(Boolean).join(' ');
  const label = closeLabel ?? closeLabelFor();

  const closeButton = hideClose ? null : (
    <button
      type="button"
      className={`ui-modal-close${hasHeader ? '' : ' ui-modal-close--floating'}`}
      onClick={() => onCloseRef.current()}
      aria-label={label}
      disabled={!dismissable}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );

  return createPortal(
    <div
      className={overlayClass}
      onMouseDown={(e) => {
        // mousedown y no click: arrastrar una selección de texto desde dentro
        // y soltar fuera no debe cerrar el diálogo.
        if (dismissable && e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className={['ui-modal', className].filter(Boolean).join(' ')}
        style={{ '--modal-w': `${maxWidth}px` } as CSSProperties}
        onKeyDown={trapTab}
      >
        {hasHeader ? (
          <div className="ui-modal-header">
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && <h2 id={titleId} className="ui-modal-title">{title}</h2>}
              {subtitle && <p id={subtitleId} className="ui-modal-subtitle">{subtitle}</p>}
            </div>
            {closeButton}
          </div>
        ) : closeButton}

        <div className={`ui-modal-body${padded ? ' ui-modal-body--padded' : ''}`}>
          {children}
        </div>

        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
