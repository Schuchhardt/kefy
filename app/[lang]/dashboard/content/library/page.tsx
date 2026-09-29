'use client';

import { useRouter, useParams } from 'next/navigation';
import ContentLibraryBrowser from '@/components/dashboard/content/ContentLibraryBrowser';
import { toLocale } from '@/lib/i18n';
import type { LibraryItemWithIndustry } from '@/types/content-library';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

/** Pestaña «Ideas»: catálogo por industria. Elegir una idea lleva al
 *  formulario de «Mis contenidos» con el tema, el formato y la imagen de
 *  referencia ya puestos. */
export default function ContentLibraryPage() {
  const router = useRouter();
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang = toLocale(rawLang);
  const t = lang === 'en' ? enT : esT;

  function handleSelect(item: LibraryItemWithIndustry) {
    const params = new URLSearchParams({ topic: item.title, type: item.content_type });
    if (item.image_url) params.set('refImage', item.image_url);
    router.push(`/${lang}/dashboard/content/create?${params}`);
  }

  return (
    <div className="page page--wide">
      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>{t.libraryModalTitle}</h1>
          <p>{t.libraryModalSubtitle}</p>
        </div>
      </header>

      <ContentLibraryBrowser lang={lang} onSelect={handleSelect} />
    </div>
  );
}
