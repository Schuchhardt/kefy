'use client';

// ─── Imagen de la marca ──────────────────────────────────────────────────────
//
// Es lo que identifica a la marca en el selector, no en el contenido generado.
// Si no se sube ninguna, el selector usa el logo del Brand Kit; y si tampoco
// hay logo, la inicial sobre un color. Por eso el texto de ayuda explica de
// dónde sale la imagen que se está viendo: sin eso, quien ya subió un logo no
// entiende por qué aquí no aparece nada.
//
// Se guarda sola al subirla, sin esperar al «Guardar» del formulario: por eso
// la página la pinta fuera del <form>. El progreso («Subiendo…», «Imagen
// actualizada») va en una región `role="status"` que siempre está montada, y
// los errores en un aviso visible con `role="alert"`.

import { useId, useRef, useState } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import SectionCard from '@/components/ui/SectionCard';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function BrandImageField({ locale }: { locale: 'es' | 'en' }) {
  const { activeBrand, refresh } = useBrand();
  const t = (locale === 'en' ? enT : esT).brandImage;
  const helpId = `brand-image-${useId().replace(/:/g, '')}`;

  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [done, setDone] = useState<'uploaded' | 'removed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeBrand) return null;
  const brandId = activeBrand.id;

  async function handleUpload(file: File) {
    setError(null);
    setDone(null);

    // Se valida en el cliente para dar el error al instante, pero la ruta
    // vuelve a comprobarlo: esto es comodidad, no seguridad.
    if (!ALLOWED.includes(file.type)) { setError(t.badType); resetInput(); return; }
    if (file.size > MAX_BYTES) { setError(t.tooBig); resetInput(); return; }

    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/brands/${brandId}/avatar`, { method: 'POST', body: fd });
      if (!res.ok) { setError(t.failed); return; }
      await refresh();
      setDone('uploaded');
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
      resetInput();
    }
  }

  async function handleRemove() {
    setBusy('remove');
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/avatar`, { method: 'DELETE' });
      if (!res.ok) { setError(t.removeFailed); return; }
      await refresh();
      setDone('removed');
    } catch {
      setError(t.removeFailed);
    } finally {
      setBusy(null);
    }
  }

  function resetInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  const hasAvatar = Boolean(activeBrand.avatar_url);
  const usingKitLogo = !hasAvatar && Boolean(activeBrand.kit_logo_url);

  const status =
    busy === 'upload' ? t.uploading
      : busy === 'remove' ? t.removing
        : done === 'uploaded' ? t.uploaded
          : done === 'removed' ? t.removed
            : '';

  return (
    <SectionCard title={t.title} subtitle={t.help}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <BrandAvatar brand={activeBrand} size={56} />

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(',')}
          hidden
          aria-label={t.fileLabel}
          aria-describedby={helpId}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
        />

        <Button
          variant="secondary"
          icon={<Icon name="upload" size={16} />}
          loading={busy === 'upload'}
          disabled={busy !== null}
          aria-describedby={helpId}
          onClick={() => inputRef.current?.click()}
        >
          {hasAvatar ? t.replace : t.upload}
        </Button>

        {hasAvatar && (
          <Button
            variant="danger-ghost"
            icon={<Icon name="trash" size={16} />}
            loading={busy === 'remove'}
            disabled={busy !== null}
            onClick={() => { void handleRemove(); }}
          >
            {t.remove}
          </Button>
        )}
      </div>

      <p id={helpId} className="ui-hint" style={{ marginTop: 10 }}>
        {t.formats}
        {usingKitLogo && <> {t.usingKitLogo}</>}
        {!hasAvatar && !usingKitLogo && <> {t.usingInitial}</>}
      </p>

      <p role="status" className="ui-hint" style={{ marginTop: status ? 6 : 0 }}>{status}</p>

      {error && (
        <div style={{ marginTop: 10 }}>
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{error}</Notice>
        </div>
      )}
    </SectionCard>
  );
}
