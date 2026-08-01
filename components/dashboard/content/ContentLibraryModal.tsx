'use client';

import Modal from './Modal';
import ContentLibraryBrowser from './ContentLibraryBrowser';
import type { LibraryItemWithIndustry } from '@/types/content-library';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;

interface ContentLibraryModalProps {
  open:       boolean;
  onClose:    () => void;
  lang:       'es' | 'en';
  onSelect:   (item: LibraryItemWithIndustry) => void;
}

export default function ContentLibraryModal({ open, onClose, lang, onSelect }: ContentLibraryModalProps) {
  const t = T[lang];

  return (
    <Modal open={open} onClose={onClose} title={t.libraryModalTitle} subtitle={t.libraryModalSubtitle} maxWidth={820}>
      <div style={{ padding: '16px 24px 24px' }}>
        <ContentLibraryBrowser lang={lang} onSelect={onSelect} />
      </div>
    </Modal>
  );
}
