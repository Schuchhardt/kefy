'use client';

import { useEffect, useState } from 'react';

/**
 * Imagen del avatar de la marca en las vistas previas por red.
 *
 * Las redes recortan el avatar en un círculo: una imagen cuadrada lo llena
 * bien, pero un logo apaisado queda cortado. Por eso recibe las imágenes
 * candidatas de la marca (la subida, el logo del Brand Kit…) y:
 *   1. usa la primera que sea cuadrada, a sangre;
 *   2. si ninguna lo es, muestra la primera que cargue entera y más pequeña,
 *      centrada sobre fondo claro, para que nunca quede cortada.
 */
export type AvatarSource = string | ReadonlyArray<string | null | undefined> | null | undefined;

/** Proporción que se considera cuadrada (logos de 500×490 incluidos). */
const SQUARE_TOLERANCE = 0.05;

export function avatarCandidates(src: AvatarSource): string[] {
  const list = typeof src === 'string' ? [src] : (src ?? []);
  return [...new Set(list.filter((s): s is string => Boolean(s)))];
}

export function hasAvatar(src: AvatarSource): boolean {
  return avatarCandidates(src).length > 0;
}

function measure(url: string): Promise<{ url: string; square: boolean } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      // Un SVG sin dimensiones intrínsecas llega como 0×0: no se puede saber.
      const square = w > 0 && h > 0 && Math.abs(w / h - 1) <= SQUARE_TOLERANCE;
      resolve({ url, square });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function PreviewAvatarImage({ src, alt = '' }: { src: AvatarSource; alt?: string }) {
  const candidates = avatarCandidates(src);
  const key = candidates.join('\n');
  const [choice, setChoice] = useState<{ key: string; url: string; square: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls = key ? key.split('\n') : [];
    Promise.all(urls.map(measure)).then((results) => {
      if (cancelled) return;
      const loaded = results.filter((r): r is { url: string; square: boolean } => r !== null);
      const pick = loaded.find((r) => r.square) ?? loaded[0];
      setChoice(pick ? { key, ...pick } : null);
    });
    return () => { cancelled = true; };
  }, [key]);

  // Mientras se mide (o si ninguna carga) queda el fondo del contenedor.
  if (!choice || choice.key !== key) return null;

  if (choice.square) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={choice.url}
        alt={alt}
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    );
  }

  return (
    <span style={{
      width: '100%', height: '100%', borderRadius: '50%', background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={choice.url}
        alt={alt}
        style={{ width: '70%', height: '70%', objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}
