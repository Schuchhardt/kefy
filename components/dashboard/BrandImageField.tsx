'use client';

// ─── Imagen de la marca ──────────────────────────────────────────────────────
//
// Es lo que identifica a la marca en el selector, no en el contenido generado.
// Si no se sube ninguna, el selector usa el logo del Brand Kit; y si tampoco
// hay logo, la inicial sobre un color. Por eso el texto de ayuda explica de
// dónde sale la imagen que se está viendo: sin eso, quien ya subió un logo no
// entiende por qué aquí no aparece nada.

import { useState, useRef } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';

const COPY = {
  es: {
    title: 'Imagen de la marca',
    help: 'Es la imagen con la que reconoces esta marca en el selector.',
    usingKitLogo: 'Ahora se está usando el logo del Brand Kit. Sube una imagen si quieres otra distinta.',
    usingInitial: 'Sin imagen ni logo, se muestra la inicial de la marca.',
    upload: '↑ Subir imagen',
    uploading: 'Subiendo...',
    remove: 'Quitar',
    removing: 'Quitando...',
    tooBig: 'La imagen supera los 5 MB.',
    badType: 'Formato no admitido. Usa JPG, PNG o WebP.',
    failed: 'No pudimos subir la imagen.',
  },
  en: {
    title: 'Brand image',
    help: 'This is how you recognise this brand in the switcher.',
    usingKitLogo: "Currently showing your Brand Kit logo. Upload an image if you'd rather use a different one.",
    usingInitial: 'With no image or logo, the brand initial is shown instead.',
    upload: '↑ Upload image',
    uploading: 'Uploading...',
    remove: 'Remove',
    removing: 'Removing...',
    tooBig: 'The image is larger than 5 MB.',
    badType: 'Unsupported format. Use JPG, PNG or WebP.',
    failed: "We couldn't upload the image.",
  },
} as const;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function BrandImageField({ locale }: { locale: 'es' | 'en' }) {
  const { activeBrand, refresh } = useBrand();
  const t = COPY[locale];

  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeBrand) return null;

  async function handleUpload(file: File) {
    setError(null);

    // Se valida en el cliente para dar el error al instante, pero la ruta
    // vuelve a comprobarlo: esto es comodidad, no seguridad.
    if (!ALLOWED.includes(file.type)) { setError(t.badType); return; }
    if (file.size > MAX_BYTES) { setError(t.tooBig); return; }

    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/brands/${activeBrand!.id}/avatar`, { method: 'POST', body: fd });
      if (!res.ok) {
        setError((await res.json()).error ?? t.failed);
        return;
      }
      await refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setBusy('remove');
    setError(null);
    try {
      const res = await fetch(`/api/brands/${activeBrand!.id}/avatar`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json()).error ?? t.failed);
      else await refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
    }
  }

  const tieneAvatar = Boolean(activeBrand.avatar_url);
  const usaLogoDelKit = !tieneAvatar && Boolean(activeBrand.kit_logo_url);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <BrandAvatar brand={activeBrand} size={56} />

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy === 'upload' ? t.uploading : t.upload}
        </button>

        {tieneAvatar && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy !== null}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: '#ff6b6b', fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy === 'remove' ? t.removing : t.remove}
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        {t.help}
        {usaLogoDelKit && <> {t.usingKitLogo}</>}
        {!tieneAvatar && !usaLogoDelKit && <> {t.usingInitial}</>}
      </p>

      {error && <p style={{ fontSize: 12, color: '#ff6b6b', margin: 0 }}>{error}</p>}
    </div>
  );
}
