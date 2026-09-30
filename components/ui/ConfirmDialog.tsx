'use client';

// ─── Confirmación con el modal de la app ─────────────────────────────────────
// Sustituye a `window.confirm()`, que en móvil sale como alerta del sistema
// sin estilo, no se puede traducir el botón y bloquea el hilo.
//
//   const { confirm, dialog } = useConfirm();
//   if (await confirm({ title: '¿Eliminar?', danger: true })) …
//   return <>{…}{dialog}</>;

import { useCallback, useRef, useState, type ReactNode } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function defaultLabels() {
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return en ? { confirm: 'Confirm', cancel: 'Cancel' } : { confirm: 'Confirmar', cancel: 'Cancelar' };
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(opts);
  }), []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const labels = defaultLabels();
  const dialog = (
    <Modal
      open={options !== null}
      onClose={() => settle(false)}
      title={options?.title}
      maxWidth={420}
      role="alertdialog"
      sheet={false}
      centered
      padded={Boolean(options?.message)}
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>{options?.cancelLabel ?? labels.cancel}</Button>
          <Button
            variant={options?.danger ? 'danger' : 'primary'}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? labels.confirm}
          </Button>
        </>
      }
    >
      {options?.message && <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55 }}>{options.message}</div>}
    </Modal>
  );

  return { confirm, dialog };
}
