'use client';

import { useState } from 'react';
import Modal from './Modal';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { CHANNELS } from '@/lib/channels';
import type { ContentItem, ContentType, CarouselSlide, ReelScene } from '@/types/content';

interface ManualCreateModalProps {
  open:    boolean;
  onClose: () => void;
  lang:    'es' | 'en';
  onCreated: (item: ContentItem) => void;
}

const T = {
  es: {
    title: 'Crear contenido manual', subtitle: 'Sin IA — escribe y sube todo tú',
    typeLabel: 'Tipo', channelLabel: 'Canal',
    titleField: 'Título', bodyField: 'Texto', bodyPlaceholder: 'Escribe tu post…',
    hashtagsField: 'Hashtags', hashtagsHint: 'Separados por espacio o coma',
    imageField: 'Imagen', uploadImage: 'Subir imagen',
    videoField: 'Video', uploadVideo: 'Subir video',
    slidesField: 'Slides', addSlide: '+ Añadir slide',
    scenesField: 'Escenas', addScene: '+ Añadir escena',
    slideTitle: 'Título del slide', slideBody: 'Cuerpo del slide',
    sceneDuration: 'Duración (s)', remove: 'Eliminar',
    create: 'Crear', creating: 'Creando…', cancel: 'Cancelar',
    uploadError: 'Error al subir', requireSlides: 'Añade al menos 1 slide',
    requireVideoOrScenes: 'Sube un video o añade al menos 1 escena',
  },
  en: {
    title: 'Create content manually', subtitle: 'No AI — write and upload everything yourself',
    typeLabel: 'Type', channelLabel: 'Channel',
    titleField: 'Title', bodyField: 'Body', bodyPlaceholder: 'Write your post…',
    hashtagsField: 'Hashtags', hashtagsHint: 'Separated by space or comma',
    imageField: 'Image', uploadImage: 'Upload image',
    videoField: 'Video', uploadVideo: 'Upload video',
    slidesField: 'Slides', addSlide: '+ Add slide',
    scenesField: 'Scenes', addScene: '+ Add scene',
    slideTitle: 'Slide title', slideBody: 'Slide body',
    sceneDuration: 'Duration (s)', remove: 'Remove',
    create: 'Create', creating: 'Creating…', cancel: 'Cancel',
    uploadError: 'Upload failed', requireSlides: 'Add at least 1 slide',
    requireVideoOrScenes: 'Upload a video or add at least 1 scene',
  },
};

const TYPE_OPTIONS: { value: ContentType; icon: string; label: { es: string; en: string } }[] = [
  { value: 'post',     icon: '✦', label: { es: 'Post',     en: 'Post'     } },
  { value: 'carousel', icon: '▦', label: { es: 'Carrusel', en: 'Carousel' } },
  { value: 'reel',     icon: '▶', label: { es: 'Reel',     en: 'Reel'     } },
];

export default function ManualCreateModal({ open, onClose, lang, onCreated }: ManualCreateModalProps) {
  const t = T[lang];

  const [type, setType]     = useState<ContentType>('post');
  const [channel, setChannel] = useState('generic');
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [tagsText, setTagsText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [scenes, setScenes] = useState<ReelScene[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  function reset() {
    setType('post');
    setChannel('generic');
    setTitle(''); setBody(''); setTagsText('');
    setImageUrl(null); setVideoUrl(null);
    setSlides([]); setScenes([]);
    setError(null);
  }

  async function uploadFile(file: File): Promise<{ url: string; type: 'image' | 'video' }> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/content/upload-media', { method: 'POST', credentials: 'include', body: fd });
    const d = await res.json() as { url?: string; type?: 'image' | 'video'; error?: string };
    if (!res.ok || !d.url || !d.type) throw new Error(d.error ?? 'upload failed');
    return { url: d.url, type: d.type };
  }

  async function handleUpload(target: 'cover' | 'video' | { kind: 'slide'; idx: number }, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const { url } = await uploadFile(file);
      if (target === 'cover') setImageUrl(url);
      else if (target === 'video') setVideoUrl(url);
      else {
        if (type === 'carousel') {
          setSlides((prev) => prev.map((s, i) => i === target.idx ? { ...s, image_url: url } : s));
        } else {
          setScenes((prev) => prev.map((s, i) => i === target.idx ? { ...s, image_url: url } : s));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.uploadError);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function addSlide() {
    setSlides((prev) => [...prev, { slide_order: prev.length + 1, title: '', body: '', image_url: null }]);
  }
  function addScene() {
    setScenes((prev) => [...prev, { scene_order: prev.length + 1, title: '', body: '', image_url: null, duration_seconds: 3 }]);
  }

  function handleClose() {
    if (creating) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    if (type === 'carousel' && slides.length === 0) { setError(t.requireSlides); return; }
    if (type === 'reel' && !videoUrl && scenes.length === 0) { setError(t.requireVideoOrScenes); return; }

    setCreating(true);
    try {
      const tags = tagsText
        .split(/[\s,]+/)
        .map((s) => s.trim().replace(/^#+/, ''))
        .filter(Boolean)
        .map((s) => `#${s}`);

      const payload: Record<string, unknown> = {
        channel,
        content_type: type,
        title: title.trim() || null,
        body:  body.trim()  || null,
        hashtags: tags,
      };
      if (type === 'post')      payload.image_url = imageUrl;
      if (type === 'carousel')  payload.slides    = slides.map((s, i) => ({ ...s, slide_order: i + 1 }));
      if (type === 'reel') {
        if (scenes.length > 0)  payload.slides    = scenes.map((s, i) => ({ ...s, scene_order: i + 1, slide_order: i + 1 }));
        if (videoUrl)           payload.video_url = videoUrl;
        if (imageUrl)           payload.image_url = imageUrl;
      }

      const res = await fetch('/api/content', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json() as { item?: ContentItem; error?: string };
      if (!res.ok || !d.item) throw new Error(d.error ?? 'create failed');
      onCreated(d.item);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t.title} subtitle={t.subtitle} maxWidth={620} dismissable={!creating}>
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Type */}
        <Field label={t.typeLabel}>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${type === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: type === opt.value ? 'rgba(198,255,75,0.10)' : 'var(--bg)',
                  color: type === opt.value ? 'var(--accent)' : 'var(--text)',
                  fontWeight: type === opt.value ? 700 : 500,
                }}
              >
                {opt.icon} {opt.label[lang]}
              </button>
            ))}
          </div>
        </Field>

        {/* Channel */}
        <Field label={t.channelLabel}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CHANNELS.filter((c) => c.group !== 'ads').map((c) => {
              const sel = channel === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 999,
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    background: sel ? 'rgba(198,255,75,0.10)' : 'var(--surface)',
                    color: sel ? 'var(--accent)' : 'var(--text)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {c.value !== 'generic' && <ChannelIcon name={c.value} size={14} />}
                  {c.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Title (optional) */}
        <Field label={t.titleField}>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Field>

        {/* Body */}
        {(type === 'post' || type === 'reel') && (
          <Field label={t.bodyField}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t.bodyPlaceholder}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        )}

        {/* Hashtags */}
        <Field label={t.hashtagsField} hint={t.hashtagsHint}>
          <input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)} style={inputStyle} placeholder="#marketing #branding" />
        </Field>

        {/* Cover image (post) */}
        {type === 'post' && (
          <Field label={t.imageField}>
            <UploadPreview
              url={imageUrl}
              kind="image"
              label={t.uploadImage}
              onUpload={(e) => handleUpload('cover', e)}
              onRemove={() => setImageUrl(null)}
              uploading={uploading}
            />
          </Field>
        )}

        {/* Video (reel) */}
        {type === 'reel' && (
          <Field label={t.videoField}>
            <UploadPreview
              url={videoUrl}
              kind="video"
              label={t.uploadVideo}
              onUpload={(e) => handleUpload('video', e)}
              onRemove={() => setVideoUrl(null)}
              uploading={uploading}
            />
          </Field>
        )}

        {/* Slides (carousel) */}
        {type === 'carousel' && (
          <Field label={t.slidesField}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slides.map((s, idx) => (
                <SlideRow
                  key={idx}
                  idx={idx}
                  isReel={false}
                  title={s.title ?? ''}
                  body={s.body ?? ''}
                  imageUrl={s.image_url ?? null}
                  t={t}
                  uploading={uploading}
                  onTitle={(v) => setSlides((p) => p.map((x, i) => i === idx ? { ...x, title: v } : x))}
                  onBody={(v)  => setSlides((p) => p.map((x, i) => i === idx ? { ...x, body: v } : x))}
                  onUpload={(e) => handleUpload({ kind: 'slide', idx }, e)}
                  onRemove={() => setSlides((p) => p.filter((_, i) => i !== idx))}
                />
              ))}
              <button type="button" onClick={addSlide} style={dashedBtn}>{t.addSlide}</button>
            </div>
          </Field>
        )}

        {/* Scenes (reel — optional if no video) */}
        {type === 'reel' && !videoUrl && (
          <Field label={t.scenesField}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scenes.map((s, idx) => (
                <SlideRow
                  key={idx}
                  idx={idx}
                  isReel
                  title={s.title}
                  body={s.body}
                  imageUrl={s.image_url ?? null}
                  duration={s.duration_seconds}
                  t={t}
                  uploading={uploading}
                  onTitle={(v) => setScenes((p) => p.map((x, i) => i === idx ? { ...x, title: v } : x))}
                  onBody={(v)  => setScenes((p) => p.map((x, i) => i === idx ? { ...x, body: v } : x))}
                  onDuration={(v) => setScenes((p) => p.map((x, i) => i === idx ? { ...x, duration_seconds: v } : x))}
                  onUpload={(e) => handleUpload({ kind: 'slide', idx }, e)}
                  onRemove={() => setScenes((p) => p.filter((_, i) => i !== idx))}
                />
              ))}
              <button type="button" onClick={addScene} style={dashedBtn}>{t.addScene}</button>
            </div>
          </Field>
        )}

        {error && <p style={{ fontSize: 13, color: '#ff6b6b', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating}
            style={{
              flex: 1, background: 'var(--accent)', color: '#000', border: 'none',
              borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700,
              cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? t.creating : t.create}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={creating}
            style={{
              padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--muted)', fontSize: 13, fontWeight: 600,
              cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, opacity: 0.75 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function UploadPreview({
  url, kind, label, onUpload, onRemove, uploading,
}: {
  url: string | null;
  kind: 'image' | 'video';
  label: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  if (!url) {
    return (
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderRadius: 8, border: '1px dashed var(--border)',
        background: 'var(--surface)', fontSize: 13, fontWeight: 600,
        cursor: uploading ? 'wait' : 'pointer',
      }}>
        {uploading ? '…' : `+ ${label}`}
        <input type="file" accept={kind === 'image' ? 'image/*' : 'video/*'} hidden onChange={onUpload} disabled={uploading} />
      </label>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {kind === 'image' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
      ) : (
        <video src={url} controls style={{ width: 140, height: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', background: '#000' }} />
      )}
      <button type="button" onClick={onRemove} style={{
        padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,107,107,0.4)',
        background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      }}>×</button>
    </div>
  );
}

function SlideRow({
  idx, isReel, title, body, imageUrl, duration, t, uploading,
  onTitle, onBody, onDuration, onUpload, onRemove,
}: {
  idx: number;
  isReel: boolean;
  title: string;
  body: string;
  imageUrl: string | null;
  duration?: number;
  t: (typeof T)['es'];
  uploading: boolean;
  onTitle:   (v: string) => void;
  onBody:    (v: string) => void;
  onDuration?: (v: number) => void;
  onUpload:  (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove:  () => void;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>#{idx + 1}</span>
        <button type="button" onClick={onRemove} style={{
          marginLeft: 'auto', background: 'none', border: 'none', color: '#ff6b6b',
          cursor: 'pointer', fontSize: 14, padding: 0,
        }} title={t.remove}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flexShrink: 0 }}>
          {imageUrl ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
            </div>
          ) : (
            <label style={{
              width: 80, height: 80, borderRadius: 6, border: '1px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: uploading ? 'wait' : 'pointer', color: 'var(--muted)',
              background: 'var(--bg)', fontSize: 22,
            }}>
              {uploading ? '…' : '+'}
              <input type="file" accept="image/*" hidden onChange={onUpload} disabled={uploading} />
            </label>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="text" value={title} onChange={(e) => onTitle(e.target.value)} placeholder={t.slideTitle} style={smallInput} />
          <textarea value={body} onChange={(e) => onBody(e.target.value)} rows={2} placeholder={t.slideBody} style={{ ...smallInput, resize: 'vertical', fontFamily: 'inherit' }} />
          {isReel && onDuration && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t.sceneDuration}</label>
              <input
                type="number" min={1} max={30}
                value={duration ?? 3}
                onChange={(e) => onDuration(Math.max(1, Math.min(30, Number(e.target.value) || 3)))}
                style={{ ...smallInput, width: 70 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

const smallInput: React.CSSProperties = {
  ...inputStyle,
  padding: '7px 10px',
  fontSize: 13,
};

const dashedBtn: React.CSSProperties = {
  background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 8,
  padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer',
};
