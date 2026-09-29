'use client';

// ─── Botón de la app ─────────────────────────────────────────────────────────
//
// Antes el botón primario existía en cuatro variantes con colores de texto
// distintos sobre el acento (#000, #0A0A0C, var(--bg) —beige sobre lima en
// tema claro— y #fff). Aquí el texto sobre el acento es siempre --on-accent.
// `loading` muestra un spinner y deja el botón deshabilitado, en vez de
// volverlo gris como si estuviera inactivo.

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ancho completo. */
  block?: boolean;
  /** Solo icono: cuadrado. Requiere aria-label. */
  iconOnly?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function buttonClass({
  variant = 'secondary', size = 'md', block, iconOnly, className,
}: CommonProps & { className?: string }): string {
  return [
    'ui-btn',
    `ui-btn--${variant}`,
    size !== 'md' ? `ui-btn--${size}` : '',
    block ? 'ui-btn--block' : '',
    iconOnly ? 'ui-btn--icon' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
}

export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span
      className="ui-spinner"
      style={{ ['--spinner' as string]: `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
}

export default function Button({
  variant, size, block, iconOnly, icon, loading = false, className, children, disabled, type = 'button', ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> {
  href: string;
  /** Enlace externo o mailto: usa <a> y no el router. */
  external?: boolean;
}

export function ButtonLink({
  variant, size, block, iconOnly, icon, className, children, href, external, ...rest
}: ButtonLinkProps) {
  const cls = buttonClass({ variant, size, block, iconOnly, className });
  if (external) {
    return <a href={href} className={cls} {...rest}>{icon}{children}</a>;
  }
  return <Link href={href} className={cls} {...rest}>{icon}{children}</Link>;
}
