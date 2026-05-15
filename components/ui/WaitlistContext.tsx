'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import WaitlistModal from '@/components/ui/WaitlistModal';
import type { KefyCopy } from '@/lib/content';

interface WaitlistCtxValue {
  open: () => void;
}

const WaitlistCtx = createContext<WaitlistCtxValue>({ open: () => {} });

export function WaitlistProvider({
  copy,
  children,
}: {
  copy: KefyCopy['waitlist'];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <WaitlistCtx.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <WaitlistModal copy={copy} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </WaitlistCtx.Provider>
  );
}

export function useWaitlistOpen(): () => void {
  return useContext(WaitlistCtx).open;
}
