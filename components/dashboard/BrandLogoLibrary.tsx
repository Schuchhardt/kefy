'use client';

// ─── Logos e íconos de la marca ──────────────────────────────────────────────
//
// Una marca puede tener varias versiones de su logo (horizontal, vertical, para
// fondo claro u oscuro) y varios íconos. Se suben varios a la vez con
// type 'auto': el servidor mide cada archivo y lo clasifica
// (lib/services/brand-assets.ts); aquí se enseña esa propuesta y se corrige con
// «Editar». «Crear ícono» recorta un ícono cuadrado de un logo (IconCropModal).
//
// La biblioteca se guarda sola (cada subida, edición o borrado va al servidor
// al momento). El logo principal, en cambio, es un campo del Brand Kit:
// «Usar como principal» lo cambia en el formulario y se aplica al guardar,
// igual que antes al subir el logo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataChanged } from '@/lib/data-events';
import type { BrandAssetView } from '@/lib/services/brand-assets';
import type { AssetType, LogoBackground, LogoVariant } from '@/types/brand-kit';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import { Field, Input, Select } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import Icon from '@/components/ui/icons';
import IconCropModal from '@/components/dashboard/IconCropModal';
import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';
import styles from './BrandLogoLibrary.module.css';

// Lo mismo que acepta /api/brand-kit/assets (lib/brand-kit.ts).
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;
const LIBRARY_TYPES = new Set<AssetType>(['logo', 'icon']);

type Draft = { label: string; type: AssetType; variant: LogoVariant | ''; background: LogoBackground | '' };

export default function BrandLogoLibrary({
  locale, canEdit, primaryUrl, onPrimaryChange, refreshKey = 0,
}: {
  locale: 'es' | 'en';
  canEdit: boolean;
  /** logo_url del formulario (puede no estar guardado aún). */
  primaryUrl: string | null;
  onPrimaryChange: (url: string | null) => void;
  /** Cambia cuando la página añadió logos por su cuenta (los de la web). */
  refreshKey?: number;
}) {
  const t = (locale === 'en' ? enT : esT).logos;
  const { confirm, dialog } = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<BrandAssetView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [cropping, setCropping] = useState<BrandAssetView | null>(null);
  const [editing, setEditing] = useState<BrandAssetView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/brand-kit/assets', { credentials: 'include' });
      if (!res.ok) { setLoadError(true); return; }
      const body = await res.json() as { assets: BrandAssetView[] };
      setAssets(body.assets.filter((a) => LIBRARY_TYPES.has(a.type)));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);
  // El asistente también sube, reclasifica y recorta.
  useDataChanged(['brand-kit'], () => { void load(); });

  async function handleFiles(files: File[]) {
    setStatus('');
    const problems: string[] = [];
    const valid = files.filter((f) => {
      // El servidor vuelve a validarlo: esto es para avisar al instante.
      if (!ALLOWED.includes(f.type)) { problems.push(t.badType(f.name)); return false; }
      if (f.size > MAX_BYTES) { problems.push(t.tooBig(f.name)); return false; }
      return true;
    });
    setErrors(problems);
    if (inputRef.current) inputRef.current.value = '';
    if (valid.length === 0) return;

    let uploaded = 0;
    setProgress({ done: 0, total: valid.length });
    for (const [i, file] of valid.entries()) {
      setProgress({ done: i + 1, total: valid.length });
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', 'auto');
        fd.append('label', file.name.replace(/\.[^.]+$/, ''));
        const res = await fetch('/api/brand-kit/assets', { method: 'POST', credentials: 'include', body: fd });
        if (!res.ok) { problems.push(t.failed(file.name)); continue; }
        const { asset } = await res.json() as { asset: BrandAssetView };
        uploaded++;
        setAssets((prev) => [asset, ...(prev ?? [])]);
        // La primera vez, el primer logo pasa a ser el principal.
        if (!primaryUrl && uploaded === 1 && asset.type === 'logo') onPrimaryChange(asset.public_url);
      } catch {
        problems.push(t.failed(file.name));
      }
    }
    setProgress(null);
    setErrors([...problems]);
    if (uploaded > 0) setStatus(t.uploaded(uploaded));
  }

  async function handleDelete(asset: BrandAssetView) {
    const isPrimary = asset.public_url === primaryUrl;
    const ok = await confirm({
      title: t.deleteTitle,
      message: isPrimary ? t.deletePrimaryMessage : t.deleteMessage,
      confirmLabel: t.delete,
      danger: true,
    });
    if (!ok) return;
    setErrors([]);
    try {
      const res = await fetch(`/api/brand-kit/assets/${asset.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { setErrors([t.deleteFailed]); return; }
      setAssets((prev) => (prev ?? []).filter((a) => a.id !== asset.id));
      if (isPrimary) onPrimaryChange(null);
      setStatus(t.deleted);
    } catch {
      setErrors([t.deleteFailed]);
    }
  }

  function openEdit(asset: BrandAssetView) {
    setEditing(asset);
    setDraft({
      label: asset.label ?? '',
      type: asset.type,
      variant: asset.variant ?? '',
      background: asset.background ?? '',
    });
  }

  async function saveEdit() {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brand-kit/assets/${editing.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: draft.label || null,
          type: draft.type,
          variant: draft.variant || null,
          background: draft.background || null,
        }),
      });
      if (!res.ok) { setErrors([t.saveFailed]); return; }
      const { asset } = await res.json() as { asset: BrandAssetView };
      setAssets((prev) => (prev ?? []).map((a) => (a.id === asset.id ? asset : a)));
      setStatus(t.saved);
      setErrors([]);
      setEditing(null);
    } catch {
      setErrors([t.saveFailed]);
    } finally {
      setSaving(false);
    }
  }

  const statusText = progress ? t.uploading(progress.done, progress.total) : status;

  return (
    <div className="ui-field">
      <span className="ui-label">{t.title}</span>
      <p className="ui-hint" id="brand-logos-help">{t.help}</p>

      {canEdit && (
        <div className={styles.toolbar}>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={ALLOWED.join(',')}
            aria-label={t.fileLabel}
            onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void handleFiles(files); }}
          />
          <Button
            variant="secondary"
            icon={<Icon name="upload" size={16} />}
            loading={progress !== null}
            aria-describedby="brand-logos-formats"
            onClick={() => inputRef.current?.click()}
          >
            {t.upload}
          </Button>
          <span className="ui-hint" id="brand-logos-formats">{t.formats}</span>
        </div>
      )}

      <p role="status" className={statusText ? 'ui-hint' : 'sr-only'}>{statusText}</p>
      {errors.length > 0 && (
        <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
          {errors.length === 1 ? errors[0] : <ul className={styles.errorList}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Notice>
      )}
      {loadError && <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{t.loadFailed}</Notice>}

      {assets && assets.length === 0 && !loadError && (
        <EmptyState compact icon={<Icon name="image" size={20} />} title={t.empty} />
      )}

      {assets && assets.length > 0 && (
        <ul className={`auto-grid ${styles.grid}`} style={{ ['--min' as string]: '200px' }}>
          {assets.map((asset) => {
            const isPrimary = asset.public_url === primaryUrl;
            const name = asset.label || t.untitled;
            return (
              <li key={asset.id} className={styles.card}>
                <div className={`${styles.thumb} ${asset.background === 'dark' ? styles.canvasDark : styles.canvasLight}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.public_url} alt={name} loading="lazy" />
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardName} title={name}>{name}</p>
                  <div className={styles.badges}>
                    {isPrimary && <span className="ui-badge" style={{ ['--badge-color' as string]: 'var(--accent-text)', ['--badge-bg' as string]: 'var(--accent-soft)' }}>{t.primary}</span>}
                    <span className="ui-badge">{t.types[asset.type] ?? asset.type}</span>
                    {asset.variant && <span className="ui-badge">{t.variants[asset.variant]}</span>}
                    {asset.background && <span className="ui-badge">{t.backgrounds[asset.background]}</span>}
                  </div>
                  {asset.source_asset_id && <p className="ui-hint">{t.fromLogo}</p>}
                </div>
                {canEdit && (
                  <div className={styles.actions}>
                    {!isPrimary && asset.type === 'logo' && (
                      <Button size="sm" variant="secondary" onClick={() => { onPrimaryChange(asset.public_url); setStatus(t.madePrimary); }}>
                        {t.usePrimary}
                      </Button>
                    )}
                    {asset.type === 'logo' && (
                      <Button size="sm" variant="ghost" icon={<Icon name="image" size={14} />} onClick={() => setCropping(asset)}>
                        {t.createIcon}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<Icon name="edit" size={14} />} onClick={() => openEdit(asset)}>
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      icon={<Icon name="trash" size={14} />}
                      aria-label={t.deleteLabel(name)}
                      onClick={() => { void handleDelete(asset); }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {primaryUrl && <p className="ui-hint">{t.primaryHint}</p>}

      <IconCropModal
        asset={cropping}
        locale={locale}
        onClose={() => setCropping(null)}
        onCreated={(icon) => {
          setAssets((prev) => [icon, ...(prev ?? [])]);
          setCropping(null);
          setStatus(t.cropCreated);
        }}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dismissable={!saving}
        title={t.editTitle}
        maxWidth={440}
        padded
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>{t.cancel}</Button>
            <Button variant="primary" loading={saving} onClick={() => { void saveEdit(); }}>{t.save}</Button>
          </>
        }
      >
        {draft && (
          <div className={styles.editForm}>
            <Field label={t.nameLabel}>
              <Input value={draft.label} maxLength={100} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </Field>
            <Field label={t.typeLabel}>
              <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as AssetType })}>
                <option value="logo">{t.types.logo}</option>
                <option value="icon">{t.types.icon}</option>
              </Select>
            </Field>
            <Field label={t.variantLabel}>
              <Select value={draft.variant} onChange={(e) => setDraft({ ...draft, variant: e.target.value as LogoVariant | '' })}>
                <option value="">{t.unknown}</option>
                {(['horizontal', 'vertical', 'square'] as const).map((v) => <option key={v} value={v}>{t.variants[v]}</option>)}
              </Select>
            </Field>
            <Field label={t.backgroundLabel}>
              <Select value={draft.background} onChange={(e) => setDraft({ ...draft, background: e.target.value as LogoBackground | '' })}>
                <option value="">{t.unknown}</option>
                {(['light', 'dark', 'any'] as const).map((v) => <option key={v} value={v}>{t.backgrounds[v]}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
