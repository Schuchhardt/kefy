'use client';

import Modal from '@/components/ui/Modal';
import ContentLibraryBrowser from './ContentLibraryBrowser';
import { toLocale } from '@/lib/i18n';
import type { LibraryItemWithIndustry } from '@/types/content-library';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

interface ContentLibraryModalProps {
  open:       boolean;
  onClose:    () => void;
  lang:       'es' | 'en';
  onSelect:   (item: LibraryItemWithIndustry) => void;
}

/** «Ideas por industria»: el mismo catálogo que la pestaña Ideas, abierto
 *  desde el formulario de generar (antes se llamaba «Biblioteca» aquí e
 *  «Librería» en la pestaña). */
export default function ContentLibraryModal({ open, onClose, lang, onSelect }: ContentLibraryModalProps) {
  const t = toLocale(lang) === 'en' ? enT : esT;

  return (
    <Modal open={open} onClose={onClose} title={t.libraryModalTitle} subtitle={t.libraryModalSubtitle} maxWidth={820} padded>
      <ContentLibraryBrowser lang={lang} onSelect={onSelect} />
    </Modal>
  );
}
