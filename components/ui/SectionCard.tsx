// ─── Tarjeta de sección ──────────────────────────────────────────────────────
// Título, subtítulo opcional, acciones a la derecha y contenido. Sustituye a
// las tres `SectionCard` copiadas en las páginas de Mi marca.

import type { ReactNode } from 'react';

export interface SectionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  /** Nivel del encabezado (por defecto h2). */
  as?: 'h2' | 'h3';
}

export default function SectionCard({ title, subtitle, actions, children, id, className, as: Heading = 'h2' }: SectionCardProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={['ui-card', className].filter(Boolean).join(' ')}
    >
      {(title || actions) && (
        <div className="ui-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <Heading id={headingId} className="ui-card-title">{title}</Heading>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
