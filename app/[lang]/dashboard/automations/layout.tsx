'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import SectionTabs from '@/components/dashboard/SectionTabs';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function AutomationsLayout({ children }: { children: ReactNode }) {
  const { lang } = useParams<{ lang: string }>();
  const t = (lang === 'en' ? enCommon : esCommon).sections.automations;
  const base = `/${lang}/dashboard/automations`;

  return (
    <SectionTabs
      ariaLabel={t.aria}
      defaultKey="autopilot"
      tabs={[
        { key: 'autopilot', label: t.autopilot, href: `${base}/autopilot` },
        { key: 'engagement', label: t.engagement, href: `${base}/engagement` },
        { key: 'leads', label: t.leads, href: `${base}/leads` },
      ]}
    >
      {children}
    </SectionTabs>
  );
}
