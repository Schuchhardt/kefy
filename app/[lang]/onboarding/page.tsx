'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();

  useEffect(() => {
    router.replace(`/${lang}/dashboard?onboarding=1`);
  }, [lang, router]);

  return null;
}
