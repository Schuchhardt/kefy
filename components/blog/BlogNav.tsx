'use client';

import Nav from '@/components/landing/Nav';
import WaitlistModal from '@/components/ui/WaitlistModal';
import { useWaitlist } from '@/hooks/useWaitlist';
import type { KefyCopy } from '@/lib/content';

interface BlogNavProps {
  lang: string;
  nav: KefyCopy['nav'];
  waitlist: KefyCopy['waitlist'];
}

export default function BlogNav({ lang, nav, waitlist }: BlogNavProps) {
  const { isOpen, open, close } = useWaitlist();

  return (
    <>
      <Nav lang={lang} copy={nav} />
      <WaitlistModal isOpen={isOpen} onClose={close} copy={waitlist} />
    </>
  );
}
