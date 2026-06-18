'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Modal from './Modal';
import type { ContentItem, BrandKitInfo, CarouselSlide, ReelScene } from './types';

interface EditContentModalProps {
  open:      boolean;
  onClose:   () => void;
  item:      ContentItem | null;
  brandKit?: BrandKitInfo | null;
  lang:      'es' | 'en';
  onUpdate:  (patch: Partial<ContentItem>) => void;
}

const T = {
  es: {
    title: 'Editar contenido', subtitle: 'Auto-guardado al modificar',
    titleField: 'Título', bodyField: 'Texto',
    hashtagsField: 'Hashtags', hashtagsHint: 'Separados por espacio o coma',
    imageField: 'Imagen', uploadImage: 'Subir imagen', changeImage: 'Cambiar imagen', removeImage: 'Eliminar',
    videoField: 'Video', uploadVideo: 'Subir video', changeVideo: 'Cambiar video',
    slidesTitle: 'Slides', addSlide: '+ Añadir slide',
    sceneTitle: 'Escenas', addScene: '+ Añadir escena',
    regenText: 'Regenerar texto con IA', regenImage: 'Regenerar imagen con IA',
    feedbackPlaceholder: 'Feedback opcional (qué cambiar)…', regenerate: 'Regenerar',
    regenerating: 'Generando…', saving: 'Guardando…', saved: 'Guardado',
    uploading: 'Subiendo…', uploadError: 'Error al subir',
    slideTitle: 'Título', slideBody: 'Cuerpo', sceneDuration: 'Duración (s)',
    moveUp: '↑', moveDown: '↓', delete: 'Eliminar slide',
    close: 'Listo',
  },
  en: {
    title: 'Edit content', subtitle: 'Auto-saved on change',
    titleField: 'Title', bodyField: 'Body',
    hashtagsField: 'Hashtags', hashtagsHint: 'Separated by space or comma',
    imageField: 'Image', uploadImage: 'Upload image', changeImage: 'Change image', removeImage: 'Remove',
    videoField: 'Video', uploadVideo: 'Upload video', changeVideo: 'Change video',
    slidesTitle: 'Slides', addSlide: '+ Add slide',
    sceneTitle: 'Scenes', addScene: '+ Add scene',
    regenText: 'Regenerate text with AI', regenImage: 'Regenerate image with AI',
    feedbackPlaceholder: 'Optional feedback (what to change)…', regenerate: 'Regenerate',
    regenerating: 'Generating…', saving: 'Saving…', saved: 'Saved',
    uploading: 'Uploading…', uploadError: 'Upload failed',
    slideTitle: 'Title', slideBody: 'Body', sceneDuration: 'Duration (s)',
    moveUp: '↑', moveDown: '↓', delete: 'Delete slide',
    close: 'Done',
  },
};

export default function EditContentModal({
  open, onClose, item, lang, onUpdate,
}: EditContentModalProps) {
  const t = T[lang];

  const [title,    setTitle]    = useState('');
  const [bodyText, setBodyText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [slides,   setSlides]   = useState<Array<CarouselSlide | ReelScene>>([]);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [regenTextLoading, setRegenTextLoading] = useState(false);
  const [regenImageLoading, setRegenImageLoading] = useState(false);
  const [regenTextFeedback, setRegenTextFeedback] = useState('');
  const [regenImageFeedback, setRegenImageFeedback] = useState('');
  const [editingSlide, setEditingSlide] = useState<number | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<string>('');

  // Hydrate state when item changes / modal opens
  useEffect(() => {
    if (!item) return;
    setTitle(item.title ?? '');
    setBodyText(item.body ?? '');
    setTagsText((item.hashtags ?? []).join(' '));
    setImageUrl(item.image_url);
    setVideoUrl(item.video_url);
    setSlides(Array.isArray(item.slides) ? [...item.slides] : []);
    setSaveState('idle');
    setRegenTextFeedback('');
    setRegenImageFeedback('');
    setEditingSlide(null);
    lastSentRef.current = '';
  }, [item?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save
  const scheduleSave = useCallback((patch: Partial<ContentItem>) => {
    if (!item) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload = JSON.stringify(patch);
      if (payload === lastSentRef.current) return;
      lastSentRef.current = payload;
      setSaveState('saving');
      try {
        const res = await fetch(`/api/content/${item.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        const d = await res.json() as { item?: ContentItem; error?: string };
        if (!res.ok) throw new Error(d.error ?? 'PATCH failed');
        setSaveState('saved');
        onUpdate(patch);
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 1500);
      } catch {
        setSaveState('error');
      }
    }, 700);
  }, [item, onUpdate]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  if (!item) return null;

  // ── Field handlers ────────────────────────────────────────────────────────
  function onTitleChange(v: string) {
    setTitle(v);
    scheduleSave({ title: v.trim() || null });
  }

  function onBodyChange(v: string) {
    setBodyText(v);
    scheduleSave({ body: v });
  }

  function onTagsChange(v: string) {
    setTagsText(v);
    const tags = v
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^#+/, ''))
      .filter(Boolean)
      .map((s) => `#${s}`);
    scheduleSave({ hashtags: tags });
  }

  async function uploadFile(file: File): Promise<{ url: string; type: 'image' | 'video' }> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/content/upload-media', {
      method: 'POST', credentials: 'include', body: fd,
    });
    const d = await res.json() as { url?: string; type?: 'image' | 'video'; error?: string };
    if (!res.ok || !d.url || !d.type) throw new Error(d.error ?? 'upload failed');
    return { url: d.url, type: d.type };
  }

  async function onImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const { url } = await uploadFile(file);
      setImageUrl(url);
      scheduleSave({ image_url: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t.uploadError);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const { url } = await uploadFile(file);
      setVideoUrl(url);
      scheduleSave({ video_url: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t.uploadError);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeImage() {
    setImageUrl(null);
    scheduleSave({ image_url: null });
  }

  // ── Slide handlers (carousel + reel use same slides column) ───────────────
  function updateSlide(idx: number, patch: Partial<CarouselSlide & ReelScene>) {
    const isReel = item!.content_type === 'reel';
    const next = (slides as Array<CarouselSlide | ReelScene>).map((s, i) => i === idx ? { ...s, ...patch } : s);
    setSlides(next as CarouselSlide[] | ReelScene[]);
    const normalized = next.map((s, i) => isReel
      ? { ...(s as ReelScene), scene_order: i + 1, slide_order: i + 1 }
      : { ...(s as CarouselSlide), slide_order: i + 1 },
    );
    scheduleSave({ slides: normalized as CarouselSlide[] | ReelScene[] });
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;
    const arr = [...slides];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setSlides(arr);
    const isReel = item!.content_type === 'reel';
    const normalized = arr.map((s, i) => isReel
      ? { ...(s as ReelScene), scene_order: i + 1, slide_order: i + 1 }
      : { ...(s as CarouselSlide), slide_order: i + 1 },
    );
    scheduleSave({ slides: normalized as CarouselSlide[] | ReelScene[] });
  }

  function deleteSlide(idx: number) {
    const arr = slides.filter((_, i) => i !== idx);
    setSlides(arr);
    const isReel = item!.content_type === 'reel';
    const normalized = arr.map((s, i) => isReel
      ? { ...(s as ReelScene), scene_order: i + 1, slide_order: i + 1 }
      : { ...(s as CarouselSlide), slide_order: i + 1 },
    );
    scheduleSave({ slides: normalized as CarouselSlide[] | ReelScene[] });
  }

  function addSlide() {
    const isReel = item!.content_type === 'reel';
    const newSlide = isReel
      ? { scene_order: slides.length + 1, slide_order: slides.length + 1, title: '', body: '', duration_seconds: 3, image_url: null }
      : { slide_order: slides.length + 1, title: '', body: '', image_url: null };
    const arr = [...slides, newSlide as unknown as (CarouselSlide | ReelScene)];
    setSlides(arr as CarouselSlide[] | ReelScene[]);
    scheduleSave({ slides: arr as CarouselSlide[] | ReelScene[] });
  }

  async function uploadSlideImage(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const { url } = await uploadFile(file);
      updateSlide(idx, { image_url: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t.uploadError);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // ── AI regen ──────────────────────────────────────────────────────────────
  async function handleRegenText() {
    if (!item) return;
    setRegenTextLoading(true);
    try {
      const base = bodyText.slice(0, 250) || title || '';
      const topic = regenTextFeedback.trim()
        ? base
          ? `Reescribe este post aplicando: "${regenTextFeedback.trim()}". Actual: ${base}`
          : regenTextFeedback.trim()
        : base || 'contenido de calidad';
      const res = await fetch('/api/content/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: item.channel, topic: topic.slice(0, 480), itemId: item.id, save: true }),
      });
      const d = await res.json() as { body?: string; hashtags?: string[]; error?: string };
      if (!res.ok) throw new Error(d.error);
      if (d.body)     { setBodyText(d.body); lastSentRef.current = ''; }
      if (d.hashtags) { setTagsText(d.hashtags.join(' ')); }
      onUpdate({ body: d.body, hashtags: d.hashtags });
      setRegenTextFeedback('');
    } finally {
      setRegenTextLoading(false);
    }
  }

  async function handleRegenImage() {
    if (!item) return;
    setRegenImageLoading(true);
    try {
      const base = bodyText.slice(0, 350) || title || 'imagen para post';
      const prompt = regenImageFeedback.trim()
        ? `${base}. Estilo: ${regenImageFeedback.trim()}`
        : base;
      const res = await fetch('/api/content/image', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: '1024x1024', quality: 'medium', itemId: item.id }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(d.error);
      if (d.url) {
        setImageUrl(d.url);
        onUpdate({ image_url: d.url });
      }
      setRegenImageFeedback('');
    } finally {
      setRegenImageLoading(false);
    }
  }

  const isPost     = item.content_type === 'post';
  const isCarousel = item.content_type === 'carousel';
  const isReel     = item.content_type === 'reel';

  const saveBadge = saveState === 'saving' ? t.saving
    : saveState === 'saved' ? `✓ ${t.saved}`
    : saveState === 'error' ? '⚠' : '';

  return (
    <Modal open={open} onClose={onClose} title={t.title} subtitle={saveBadge || t.subtitle} maxWidth={640}>
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Title */}
        <Field label={t.titleField}>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={inputStyle}
            placeholder="—"
          />
        </Field>

        {/* Body (only post) */}
        {isPost && (
          <Field label={t.bodyField}>
            <textarea
              value={bodyText}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        )}

        {/* Hashtags */}
        <Field label={t.hashtagsField} hint={t.hashtagsHint}>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => onTagsChange(e.target.value)}
            style={inputStyle}
            placeholder="#marketing #branding"
          />
        </Field>

        {/* Image (post & carousel cover) */}
        {(isPost || isCarousel) && (
          <Field label={t.imageField}>
            {imageUrl ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <UploadBtn label={t.changeImage} accept="image/*" onChange={onImageUpload} loading={uploading} />
                  <button type="button" onClick={removeImage} style={{ ...secondaryBtn, color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.4)' }}>
                    {t.removeImage}
                  </button>
                </div>
              </div>
            ) : (
              <UploadBtn label={t.uploadImage} accept="image/*" onChange={onImageUpload} loading={uploading} />
            )}
          </Field>
        )}

        {/* Video (reel) */}
        {isReel && (
          <Field label={t.videoField}>
            {videoUrl ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <video src={videoUrl} controls style={{ width: 140, height: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', background: '#000' }} />
                <UploadBtn label={t.changeVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
              </div>
            ) : (
              <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
            )}
          </Field>
        )}

        {uploadError && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: -8, marginBottom: 12 }}>{uploadError}</p>}

        {/* Slides (carousel & reel) */}
        {(isCarousel || isReel) && (
          <Field label={isReel ? t.sceneTitle : t.slidesTitle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(slides as Array<CarouselSlide | ReelScene>).map((s, idx) => (
                <SlideEditor
                  key={idx}
                  slide={s}
                  idx={idx}
                  isLast={idx === slides.length - 1}
                  expanded={editingSlide === idx}
                  isReel={isReel}
                  t={t}
                  uploading={uploading}
                  onToggle={() => setEditingSlide(editingSlide === idx ? null : idx)}
                  onUpdate={(p) => updateSlide(idx, p)}
                  onMove={(dir) => moveSlide(idx, dir)}
                  onDelete={() => deleteSlide(idx)}
                  onUploadImage={(e) => uploadSlideImage(idx, e)}
                />
              ))}
              <button type="button" onClick={addSlide} style={{
                background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 8,
                padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer',
              }}>
                {isReel ? t.addScene : t.addSlide}
              </button>
            </div>
          </Field>
        )}

        {/* AI Regen — text (post & carousel) */}
        {(isPost || isCarousel) && (
          <RegenBlock
            title={t.regenText}
            placeholder={t.feedbackPlaceholder}
            feedback={regenTextFeedback}
            onChange={setRegenTextFeedback}
            onRegen={handleRegenText}
            loading={regenTextLoading}
            t={t}
          />
        )}

        {/* AI Regen — image (post & carousel) */}
        {(isPost || isCarousel) && (
          <RegenBlock
            title={t.regenImage}
            placeholder={t.feedbackPlaceholder}
            feedback={regenImageFeedback}
            onChange={setRegenImageFeedback}
            onRegen={handleRegenImage}
            loading={regenImageLoading}
            t={t}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', marginTop: 8, background: 'var(--accent)', color: '#000',
            border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {t.close}
        </button>
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

function UploadBtn({
  label, accept, onChange, loading,
}: {
  label:    string;
  accept:   string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading:  boolean;
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
      background: 'var(--surface)', fontSize: 13, fontWeight: 600,
      cursor: loading ? 'wait' : 'pointer', color: 'var(--text)',
    }}>
      {loading ? '…' : label}
      <input type="file" accept={accept} hidden onChange={onChange} disabled={loading} />
    </label>
  );
}

function SlideEditor({
  slide, idx, isLast, expanded, isReel, t, uploading,
  onToggle, onUpdate, onMove, onDelete, onUploadImage,
}: {
  slide:    CarouselSlide | ReelScene;
  idx:      number;
  isLast:   boolean;
  expanded: boolean;
  isReel:   boolean;
  t:        (typeof T)['es'];
  uploading: boolean;
  onToggle:     () => void;
  onUpdate:     (patch: Partial<CarouselSlide & ReelScene>) => void;
  onMove:       (dir: -1 | 1) => void;
  onDelete:     () => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{
          width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
          background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {slide.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={slide.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{idx + 1}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slide.title || `${isReel ? 'Escena' : 'Slide'} ${idx + 1}`}
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slide.body || '—'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onMove(-1)} disabled={idx === 0} style={iconBtn} title={t.moveUp}>{t.moveUp}</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} style={iconBtn} title={t.moveDown}>{t.moveDown}</button>
          <button type="button" onClick={onDelete} style={{ ...iconBtn, color: '#ff6b6b' }} title={t.delete}>×</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={slide.title ?? ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={t.slideTitle}
            style={inputStyle}
          />
          <textarea
            value={slide.body ?? ''}
            onChange={(e) => onUpdate({ body: e.target.value })}
            rows={3}
            placeholder={t.slideBody}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          {isReel && 'duration_seconds' in slide && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t.sceneDuration}</label>
              <input
                type="number"
                min={1}
                max={30}
                value={(slide as ReelScene).duration_seconds ?? 3}
                onChange={(e) => onUpdate({ duration_seconds: Math.max(1, Math.min(30, Number(e.target.value) || 3)) })}
                style={{ ...inputStyle, width: 80 }}
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {slide.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={slide.image_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
            )}
            <UploadBtn label={slide.image_url ? t.changeImage : t.uploadImage} accept="image/*" onChange={onUploadImage} loading={uploading} />
          </div>
        </div>
      )}
    </div>
  );
}

function RegenBlock({
  title, placeholder, feedback, onChange, onRegen, loading, t,
}: {
  title: string;
  placeholder: string;
  feedback: string;
  onChange: (v: string) => void;
  onRegen: () => void;
  loading: boolean;
  t: (typeof T)['es'];
}) {
  return (
    <div style={{ marginTop: 6, marginBottom: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, letterSpacing: '0.06em' }}>
        {title}
      </p>
      <textarea
        rows={2}
        value={feedback}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
      />
      <button
        type="button"
        onClick={onRegen}
        disabled={loading}
        style={{
          width: '100%', marginTop: 8, background: 'rgba(198,255,75,0.08)',
          border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8,
          padding: '9px 0', fontSize: 13, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? t.regenerating : t.regenerate}
      </button>
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

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 4, border: 'none', background: 'transparent',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};
