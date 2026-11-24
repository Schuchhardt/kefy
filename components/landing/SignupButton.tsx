'use client';

import type { ReactNode } from 'react';
import { useSignup } from '@/components/ui/SignupContext';

/**
 * Botón que lleva al registro (`/{lang}/access`). Para usarlo dentro de
 * secciones que son componentes de servidor: solo el botón se hidrata.
 */
export default function SignupButton({ className, children }: { className?: string; children: ReactNode }) {
  const goToRegister = useSignup();
  return (
    <button type="button" className={className} onClick={goToRegister}>
      {children}
    </button>
  );
}
