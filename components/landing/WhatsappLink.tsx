import type { ReactNode } from 'react';
import { whatsappHref } from '@/lib/contact';

/**
 * Enlace a WhatsApp de ventas con el primer mensaje escrito. Abre en otra
 * pestaña (en móvil, la app): se avisa a los lectores de pantalla.
 */
export default function WhatsappLink({
  text, className, newTabLabel, children,
}: {
  text: string;
  className?: string;
  newTabLabel: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={whatsappHref(text)} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> {newTabLabel}</span>
    </a>
  );
}
