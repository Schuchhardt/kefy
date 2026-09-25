'use client';

// ─── Avisos de «estos datos cambiaron» entre componentes del dashboard ──────
//
// Cuando el asistente crea un contenido, publica o edita la marca, el widget
// emite `kefy:data-changed` con las entidades tocadas. Las páginas abiertas
// se suscriben con useDataChanged y vuelven a cargar sus datos, sin que el
// usuario tenga que refrescar.

import { useEffect, useRef } from 'react';
import type { Entity } from '@/lib/assistant/types';

export const DATA_CHANGED_EVENT = 'kefy:data-changed';

export interface DataChangedDetail {
  entities: Entity[];
}

export function emitDataChanged(entities: Entity[]): void {
  if (typeof window === 'undefined' || entities.length === 0) return;
  window.dispatchEvent(new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, { detail: { entities } }));
}

/**
 * Llama a `cb` cada vez que cambie alguna de `entities`. Usa siempre la
 * última versión de `cb` (no hace falta memorizarla).
 */
export function useDataChanged(entities: Entity[], cb: () => void): void {
  const cbRef = useRef(cb);
  useEffect(() => { cbRef.current = cb; });

  // La lista suele venir como literal: se compara por contenido.
  const key = [...entities].sort().join(',');

  useEffect(() => {
    const watched = new Set(key.split(',').filter(Boolean));
    function onChange(e: Event) {
      const changed = (e as CustomEvent<DataChangedDetail>).detail?.entities ?? [];
      if (changed.some((entity) => watched.has(entity))) cbRef.current();
    }
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [key]);
}
