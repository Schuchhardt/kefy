'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import SectionTabs from '@/components/dashboard/SectionTabs';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function ContentLayout({ children }: { children: ReactNode }) {
  const { lang } = useParams<{ lang: string }>();
  const t = (lang === 'en' ? enCommon : esCommon).sections.content;
  const base = `/${lang}/dashboard/content`;

  return (
    <SectionTabs
      ariaLabel={t.aria}
      defaultKey="create"
      tabs={[
        { key: 'create', label: t.create, href: `${base}/create` },
        { key: 'calendar', label: t.calendar, href: `${base}/calendar` },
        { key: 'library', label: t.library, href: `${base}/library` },
      ]}
    >
      {children}
    </SectionTabs>
  );
}
