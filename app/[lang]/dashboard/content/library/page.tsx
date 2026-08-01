'use client';

import { useRouter, useParams } from 'next/navigation';
import ContentLibraryBrowser from '@/components/dashboard/content/ContentLibraryBrowser';
import type { LibraryItemWithIndustry } from '@/types/content-library';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;

export default function ContentLibraryPage() {
  const router = useRouter();
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang: 'es' | 'en' = rawLang === 'en' ? 'en' : 'es';
  const t = T[lang];

  function handleSelect(item: LibraryItemWithIndustry) {
    const params = new URLSearchParams({ topic: item.title, type: item.content_type });
    if (item.image_url) params.set('refImage', item.image_url);
    router.push(`/${lang}/dashboard/content/create?${params}`);
  }

  return (
    <div style={{ padding: '40px 32px', overflowY: 'auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>
          {t.libraryModalTitle}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {t.libraryModalSubtitle}
        </p>
      </div>

      <ContentLibraryBrowser lang={lang} onSelect={handleSelect} />
    </div>
  );
}
