// ─── Estado vacío ────────────────────────────────────────────────────────────
// Icono + título + pista + acción opcional. Es el patrón que ya usaba
// Conversaciones, compartido para que todas las listas vacías digan qué hacer.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({ icon, title, hint, action, compact, className }: EmptyStateProps) {
  return (
    <div className={['ui-empty', compact ? 'ui-empty--compact' : '', className].filter(Boolean).join(' ')}>
      {icon && <div className="ui-empty-icon" aria-hidden="true">{icon}</div>}
      <p className="ui-empty-title">{title}</p>
      {hint && <p className="ui-empty-hint">{hint}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
