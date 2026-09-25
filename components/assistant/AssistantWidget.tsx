'use client';

// ─── Asistente flotante del dashboard ────────────────────────────────────────
//
// Burbuja abajo a la derecha (estilo Intercom) que abre el panel del chat. El
// panel se monta la primera vez que se abre; después solo se oculta, así la
// conversación sobrevive a cerrar el panel y a navegar por el dashboard. Si
// estaba abierto, sigue abierto al recargar (sessionStorage).
//
// No aparece sin sesión ni durante el onboarding (?onboarding=1, o el que se
// abre solo para una cuenta nueva). En la página de leads, que tiene un panel
// lateral a la derecha, se ancla a la izquierda, junto al sidebar.
//
// Esc lo cierra solo con el foco dentro del panel (o en el lanzador): así no
// se cierra al pulsar Esc en otro panel de la página. Al cerrarlo con Esc o
// con la X, el foco vuelve al lanzador.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';
import { useAuth } from '@/lib/auth-context';
import { useOnboardingVisible } from '@/lib/onboarding-visibility';
import AssistantPanel from '@/components/assistant/AssistantPanel';
import { ASSISTANT_OPEN_EVENT, type AssistantOpenDetail } from '@/lib/assistant/open';

const T = { es: esT, en: enT } as const;
const OPEN_KEY = 'kefy-assistant-open';

const noopSubscribe = () => () => {};

/**
 * false en el servidor y durante la hidratación, true después. El widget
 * depende de `user`, que en el servidor siempre es null: si /api/auth/me
 * responde antes de que se hidrate su Suspense (pasa en Safari al tocar la
 * página mientras carga), el primer render del cliente pintaría el lanzador
 * sobre un HTML vacío y React lanzaría un error de hidratación.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function storeOpen(open: boolean): void {
  try {
    if (open) sessionStorage.setItem(OPEN_KEY, '1');
    else sessionStorage.removeItem(OPEN_KEY);
  } catch {
    // Sin almacenamiento: solo no se recuerda.
  }
}

export default function AssistantWidget({ lang }: { lang: string }) {
  const locale: 'es' | 'en' = lang === 'en' ? 'en' : 'es';
  const t = T[locale];
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? '';
  const onboardingVisible = useOnboardingVisible();
  const hydrated = useHydrated();
  const launcherRef = useRef<HTMLButtonElement>(null);

  const [open, setOpenState] = useState(false);
  const [mounted, setMounted] = useState(false);

  const setOpen = useCallback((value: boolean) => {
    setOpenState(value);
    if (value) setMounted(true);
    storeOpen(value);
  }, []);

  // Reabrir si estaba abierto en esta pestaña.
  useEffect(() => {
    let wasOpen = false;
    try { wasOpen = sessionStorage.getItem(OPEN_KEY) === '1'; } catch { wasOpen = false; }
    if (wasOpen) {
      setOpenState(true);
      setMounted(true);
    }
  }, []);

  // Otra página pide abrir el asistente, quizá con un mensaje ya escrito
  // (openAssistant de lib/assistant/open). `id` cambia en cada petición para
  // que el panel la aplique aunque el texto se repita.
  const [draftRequest, setDraftRequest] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    function onOpen(e: Event) {
      const draft = (e as CustomEvent<AssistantOpenDetail>).detail?.draft;
      setOpen(true);
      if (draft) setDraftRequest((prev) => ({ id: (prev?.id ?? 0) + 1, text: draft }));
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, [setOpen]);

  // Cerrar desde el panel (Esc, la X): el panel se oculta con el foco dentro,
  // así que se devuelve al lanzador para no perder el sitio.
  const onClose = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  // Esc cierra el panel si el foco está en él o en el lanzador, no mientras se
  // compone texto con un IME ni con un modal abierto (el Modal compartido
  // bloquea el scroll del body y maneja su propio Esc).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing || document.body.style.overflow === 'hidden') return;
      const active = document.activeElement;
      const inside = active instanceof Element
        && (active === launcherRef.current || !!active.closest('.assistant-panel'));
      if (inside) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!hydrated || !user || onboardingVisible || searchParams.get('onboarding') === '1') return null;

  const alignLeft = pathname.includes('/automations/leads');

  return (
    <>
      {mounted && <AssistantPanel lang={locale} open={open} alignLeft={alignLeft} onClose={onClose} draftRequest={draftRequest} />}
      <button
        ref={launcherRef}
        type="button"
        className={`assistant-launcher${alignLeft ? ' assistant-launcher--left' : ''}${open ? ' assistant-launcher--open' : ''}`}
        aria-label={open ? t.closeLauncherLabel : t.launcherLabel}
        aria-expanded={open}
        title={open ? t.closeLauncherLabel : t.launcherLabel}
        onClick={() => setOpen(!open)}
        style={{
          // A la izquierda, el `left` lo pone .assistant-launcher--left (globals.css)
          // según el ancho del sidebar.
          position: 'fixed', bottom: 24, ...(alignLeft ? {} : { right: 24 }),
          width: 56, height: 56, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: 'var(--accent)', color: '#0A0A0C', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
          transition: 'transform 0.15s ease',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
            <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth="2.6" />
          </svg>
        )}
      </button>
    </>
  );
}
