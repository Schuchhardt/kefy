'use client';

// ─── ¿Está abierto el diálogo de onboarding? ─────────────────────────────────
//
// El dashboard abre el onboarding con ?onboarding=1 o, sin tocar la URL, para
// toda cuenta nueva. Lo que flota por encima de todo (el asistente) tiene que
// esconderse en ambos casos: la página lo avisa aquí y el widget lo lee.

import { useSyncExternalStore } from 'react';

let visible = false;
const listeners = new Set<() => void>();

export function setOnboardingVisible(value: boolean): void {
  if (visible === value) return;
  visible = value;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useOnboardingVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible, () => false);
}
