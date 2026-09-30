// ─── Aviso en línea ──────────────────────────────────────────────────────────
// Éxito, error, advertencia o información con los tokens semánticos. Los
// errores se anuncian (role="alert") y el resto como estado (role="status"):
// antes «Guardado» y los errores aparecían sin avisar a los lectores de
// pantalla.

import type { ReactNode } from 'react';

export type NoticeTone = 'danger' | 'success' | 'warning' | 'info' | 'accent' | 'neutral';

export default function Notice({
  tone = 'neutral', children, icon, className, live = true, role: roleOverride,
}: {
  tone?: NoticeTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** false: no se anuncia (avisos permanentes que no son consecuencia de una acción). */
  live?: boolean;
  /**
   * Fuerza el rol. Por defecto `alert` para `danger` y `status` para el resto;
   * un aviso de riesgo en tono warning que deba interrumpir usa `alert`.
   */
  role?: 'alert' | 'status';
}) {
  const role = !live ? undefined : roleOverride ?? (tone === 'danger' ? 'alert' : 'status');
  return (
    <div role={role} className={['ui-notice', tone !== 'neutral' ? `ui-notice--${tone}` : '', className].filter(Boolean).join(' ')}>
      {icon && <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, marginTop: 2 }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
