'use client';

import Icon from '@/components/ui/icons';
import { toLocale } from '@/lib/i18n';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';
import styles from './ContentActions.module.css';

interface ContentActionsProps {
  onView:   () => void;
  onEdit:   () => void;
  onDelete: () => void;
  /** Suppresses parent click bubbling (the row card). */
  stopPropagation?: boolean;
  /** `sm` 36px (sobre la miniatura de la cuadrícula), `md` 40px (lista). */
  size?: 'sm' | 'md';
  lang?: 'es' | 'en';
  /** Qué pieza es (p. ej. el comienzo del texto): distingue «Editar» de una
   *  tarjeta de la de al lado para quien navega por botones. */
  itemLabel?: string;
}

export default function ContentActions({
  onView, onEdit, onDelete, stopPropagation = true, size = 'sm', lang = 'es', itemLabel,
}: ContentActionsProps) {
  const labels = (toLocale(lang) === 'en' ? enT : esT).cardActions;
  const iconSize = size === 'md' ? 18 : 16;

  const wrap = (handler: () => void) => (e: React.MouseEvent) => {
    if (stopPropagation) { e.stopPropagation(); e.preventDefault(); }
    handler();
  };

  const name = (label: string) => (itemLabel ? `${label}: ${itemLabel}` : label);
  const cls = (...extra: string[]) => [styles.btn, size === 'md' ? styles.md : '', ...extra].filter(Boolean).join(' ');

  return (
    <div className={styles.actions} onClick={(e) => stopPropagation && e.stopPropagation()}>
      <button type="button" onClick={wrap(onView)} title={labels.view} aria-label={name(labels.view)} className={cls(styles.view)}>
        <Icon name="eye" size={iconSize} />
      </button>
      <button type="button" onClick={wrap(onEdit)} title={labels.edit} aria-label={name(labels.edit)} className={cls()}>
        <Icon name="edit" size={iconSize} />
      </button>
      <button type="button" onClick={wrap(onDelete)} title={labels.delete} aria-label={name(labels.delete)} className={cls(styles.danger)}>
        <Icon name="trash" size={iconSize} />
      </button>
    </div>
  );
}
