'use client';

// ─── Cambiar la fecha de una publicación programada ──────────────────────────
//
// Lo usan el calendario y la página de detalle del contenido. PATCH
// /api/social/schedule/[postId] cambia la fecha en Zernio y en Kefy.

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import DateTimePicker from './DateTimePicker';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';

const COPY = { es: esPublish, en: enPublish } as const;

/** «lunes, 4 de noviembre, 19:00»; con el año si no es el actual. */
export function formatScheduledDate(iso: string, lang: 'es' | 'en'): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  });
}

interface RescheduleModalProps {
  open: boolean;
  onClose: () => void;
  /** La publicación a mover (null con el modal cerrado). */
  post: { id: string; scheduled_at: string | null } | null;
  lang: 'es' | 'en';
  onSuccess: (scheduledAt: string) => void;
}

export default function RescheduleModal({ open, onClose, post, lang, onSuccess }: RescheduleModalProps) {
  const t = COPY[lang].scheduled;
  const [value, setValue] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !post) return;
    setValue(post.scheduled_at ? new Date(post.scheduled_at) : null);
    setError(null);
    setSaving(false);
  }, [open, post]);

  async function save() {
    if (!post) return;
    if (!value || value.getTime() <= Date.now()) {
      setError(t.reschedulePast);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/schedule/${post.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: value.toISOString() }),
      });
      const d = await res.json().catch(() => ({})) as { scheduled_at?: string };
      if (!res.ok || !d.scheduled_at) throw new Error(`reschedule ${res.status}`);
      onSuccess(d.scheduled_at);
      onClose();
    } catch {
      setError(t.rescheduleError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.rescheduleTitle}
      subtitle={post?.scheduled_at ? t.rescheduleCurrent(formatScheduledDate(post.scheduled_at, lang)) : undefined}
      maxWidth={520}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t.rescheduleCancel}</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>{t.rescheduleSave}</Button>
        </>
      )}
    >
      <DateTimePicker value={value} onChange={setValue} minDate={new Date()} lang={lang} />
      {error && <div style={{ marginTop: 12 }}><Notice tone="danger">{error}</Notice></div>}
    </Modal>
  );
}
