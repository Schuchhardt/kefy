'use client';

import type { Brand } from '@/lib/brand-context';

/**
 * Imagen que identifica a una marca en el selector.
 *
 * Orden de preferencia:
 *   1. `avatar_url` — la imagen que el usuario subió para la marca.
 *   2. `kit_logo_url` — el logo de su Brand Kit. Así una marca que ya definió
 *      su identidad aparece con su logo sin tener que subir la misma imagen
 *      otra vez.
 *   3. La inicial sobre un color derivado del id, estable entre sesiones.
 */
export function brandImage(brand: Brand | null): string | null {
  if (!brand) return null;
  return brand.avatar_url || brand.kit_logo_url || null;
}

function brandInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

const COLORS = ['#C6FF4B', '#4B8FFF', '#FF6B4B', '#B44BFF', '#4BFFD8', '#FF4BD0'];

/** Color estable por marca: la misma marca siempre sale del mismo color. */
export function brandColor(id: string): string {
  return COLORS[id.charCodeAt(0) % COLORS.length];
}

export default function BrandAvatar({
  brand,
  size = 28,
}: {
  brand: Brand | null;
  size?: number;
}) {
  const src = brandImage(brand);

  if (!brand) {
    return (
      <span style={{
        width: size, height: size, borderRadius: 7, flexShrink: 0,
        background: 'var(--accent)', color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.42, lineHeight: 1,
      }}>?</span>
    );
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={brand.name}
        width={size}
        height={size}
        style={{ borderRadius: 7, objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    );
  }

  return (
    <span style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0,
      background: brandColor(brand.id), color: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.42, lineHeight: 1,
    }}>
      {brandInitial(brand.name)}
    </span>
  );
}
