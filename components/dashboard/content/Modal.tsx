'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open:     boolean;
  onClose:  () => void;
  title?:   string;
  subtitle?: string;
  maxWidth?: number;
  children: ReactNode;
  /** When false the user cannot dismiss by overlay click or Esc (use for loading states). */
  dismissable?: boolean;
}

export default function Modal({ open, onClose, title, subtitle, maxWidth = 560, children, dismissable = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '32px 16px',
        animation: 'modalFadeIn 0.15s ease-out',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth,
          border: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 64px)', overflow: 'hidden',
          animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {(title || subtitle) && (
          <div style={{
            background: 'var(--bg)', borderBottom: '1px solid var(--border)',
            padding: '16px 20px', borderRadius: '16px 16px 0 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexShrink: 0,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px',
              }}
            >✕</button>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: '1 1 auto' }}>
          {children}
        </div>
      </div>

      <style jsx global>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
