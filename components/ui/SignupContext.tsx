'use client';

// ─── Acceso al registro desde la landing ─────────────────────────────────────
//
// Durante la beta cerrada todos los CTA abrían un modal de lista de espera.
// Con la beta abierta llevan a `/{lang}/register`.
//
// Sigue siendo un contexto y no un `<Link>` en cada sitio porque los botones ya
// existían como `<button onClick>` repartidos por diez secciones, y porque el
// idioma activo vive en la página: así cada sección pide «llévame al registro»
// sin tener que recibir `lang` por props.

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface SignupCtxValue {
  go: () => void;
  goWithEmail: (email: string) => void;
}

const SignupCtx = createContext<SignupCtxValue>({ go: () => {}, goWithEmail: () => {} });

export function SignupProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const router = useRouter();
  const base = `/${lang}/register`;

  const go = useCallback(() => {
    router.push(base);
  }, [router, base]);

  const goWithEmail = useCallback(
    (email: string) => {
      const trimmed = email.trim();
      // El email del hero se arrastra al formulario para que no haya que
      // escribirlo dos veces.
      router.push(trimmed ? `${base}?email=${encodeURIComponent(trimmed)}` : base);
    },
    [router, base],
  );

  return <SignupCtx.Provider value={{ go, goWithEmail }}>{children}</SignupCtx.Provider>;
}

/** Navega al registro. */
export function useSignup(): () => void {
  return useContext(SignupCtx).go;
}

/** Navega al registro con el email ya rellenado. */
export function useSignupWithEmail(): (email: string) => void {
  return useContext(SignupCtx).goWithEmail;
}
