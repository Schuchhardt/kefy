'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import WaitlistModal from '@/components/ui/WaitlistModal';
import type { KefyCopy } from '@/types/locales';

interface WaitlistCtxValue {
  open: () => void;
  openWithEmail: (email: string) => void;
}

const WaitlistCtx = createContext<WaitlistCtxValue>({ open: () => {}, openWithEmail: () => {} });

export function WaitlistProvider({
  copy,
  children,
}: {
  copy: KefyCopy['waitlist'];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState('');

  function open() {
    setPrefillEmail('');
    setIsOpen(true);
  }

  function openWithEmail(email: string) {
    setPrefillEmail(email);
    setIsOpen(true);
  }

  return (
    <WaitlistCtx.Provider value={{ open, openWithEmail }}>
      {children}
      <WaitlistModal copy={copy} isOpen={isOpen} onClose={() => setIsOpen(false)} initialEmail={prefillEmail} />
    </WaitlistCtx.Provider>
  );
}

export function useWaitlistOpen(): () => void {
  return useContext(WaitlistCtx).open;
}

export function useWaitlistOpenWithEmail(): (email: string) => void {
  return useContext(WaitlistCtx).openWithEmail;
}
