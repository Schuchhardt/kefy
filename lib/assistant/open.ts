'use client';

// ─── Abrir el asistente desde cualquier página ───────────────────────────────
//
// Una página del dashboard puede abrir el panel del asistente con un mensaje
// ya escrito (sin enviarlo): el widget escucha este evento, abre el panel y
// pone el texto en el compositor si estaba vacío. Si el widget no está montado
// (sin sesión, onboarding), el evento simplemente no hace nada.

export const ASSISTANT_OPEN_EVENT = 'kefy:assistant-open';

export interface AssistantOpenDetail {
  /** Texto para el compositor. No reemplaza lo que el usuario ya escribió. */
  draft?: string;
}

export function openAssistant(draft?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AssistantOpenDetail>(ASSISTANT_OPEN_EVENT, { detail: { draft } }));
}
