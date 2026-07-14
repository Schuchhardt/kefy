'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Modal from './Modal';
import { PostPreview } from '@/components/dashboard/PostPreview';
import { CarouselPreview } from '@/components/dashboard/CarouselPreview';
import { StoryPreview } from '@/components/dashboard/StoryPreview';
import type { ContentItem, BrandKitInfo, CarouselSlide, ReelScene } from '@/types/content';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => null },
);

interface EditContentModalProps {
  open:      boolean;
  onClose:   () => void;
  item:      ContentItem | null;
  brandKit?: BrandKitInfo | null;
  lang:      'es' | 'en';
  onUpdate:  (patch: Partial<ContentItem>) => void;
}

const T = { es: esT.editContentModal, en: enT.editContentModal } as const;

export default function EditContentModal({
  open, onClose, item, brandKit, lang, onUpdate,
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
  const [regenSlideImageLoadingIdx, setRegenSlideImageLoadingIdx] = useState<number | null>(null);
  const [storyVideoScriptLoading, setStoryVideoScriptLoading] = useState(false);
  const [storyVideoError, setStoryVideoError] = useState<string | null>(null);
  const [storyHasScript, setStoryHasScript] = useState(false);

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
    setStoryVideoError(null);
    setStoryHasScript(Array.isArray(item.slides) && item.slides.length > 0);
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
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: item.content_type === 'story' ? '1024x1536' : '1024x1024', quality: 'medium', itemId: item.id }),
      });
      const d = await res.json() as { image?: { url: string }; error?: string };
      if (!res.ok) throw new Error(d.error);
      if (d.image?.url) {
        setImageUrl(d.image.url);
        onUpdate({ image_url: d.image.url });
      }
      setRegenImageFeedback('');
    } finally {
      setRegenImageLoading(false);
    }
  }

  async function handleRegenSlideImage(idx: number, feedback: string) {
    const slide = slides[idx] as CarouselSlide | ReelScene;
    setRegenSlideImageLoadingIdx(idx);
    try {
      const context = [slide.title, slide.body].filter(Boolean).join('. ');
      const prompt = feedback.trim()
        ? `${context ? context + '. ' : ''}${feedback.trim()}`
        : context || (lang === 'en' ? 'image for slide' : 'imagen para slide');
      // Carousel slides are infographic-style: bake the slide's title/body
      // back onto the regenerated image (reel scene backgrounds must stay
      // clean — Remotion overlays that text dynamically at render time).
      const compositePayload = item!.content_type !== 'reel'
        ? { compositeTitle: slide.title ?? '', compositeBody: slide.body ?? '' }
        : {};
      const res = await fetch('/api/content/image', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: '1024x1024', quality: 'medium', ...compositePayload }),
      });
      const d = await res.json() as { image?: { url: string }; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Error');
      if (d.image?.url) {
        updateSlide(idx, { image_url: d.image.url });
      }
    } finally {
      setRegenSlideImageLoadingIdx(null);
    }
  }

  // Writes a short (1-3 scene) vertical script + background images into
  // `slides`, so mounting <MuxReelPlayer> right after can render it through
  // the same Remotion pipeline used for reels.
  async function handleGenerateStoryVideoScript() {
    if (!item) return;
    setStoryVideoScriptLoading(true);
    setStoryVideoError(null);
    try {
      const res = await fetch('/api/content/story', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const d = await res.json() as { scenes?: ReelScene[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setSlides((d.scenes ?? []) as unknown as (CarouselSlide | ReelScene)[]);
      onUpdate({ slides: (d.scenes ?? []) as unknown as ReelScene[] });
      setStoryHasScript(true);
    } catch (err) {
      setStoryVideoError(err instanceof Error ? err.message : 'Error');
    } finally {
      setStoryVideoScriptLoading(false);
    }
  }

  const isPost     = item.content_type === 'post';
  const isCarousel = item.content_type === 'carousel';
  const isReel     = item.content_type === 'reel';
  const isStory    = item.content_type === 'story';

  const saveBadge = saveState === 'saving' ? t.saving
    : saveState === 'saved' ? `✓ ${t.saved}`
    : saveState === 'error' ? '⚠' : '';

  // Same hashtag normalization as onTagsChange, kept in sync for the live preview
  const previewHashtags = tagsText
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((s) => `#${s}`);

  return (
    <Modal open={open} onClose={onClose} title={t.title} subtitle={saveBadge || t.subtitle} maxWidth={960}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '20px 24px 24px' }}>
        {/* ── Live Instagram-style preview ─────────────────────────────── */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ position: 'sticky', top: 0 }}>
            <p style={{
              fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              {t.previewLabel}
            </p>
            {isPost && (
              <PostPreview
                channel="instagram"
                body={bodyText}
                imageUrl={imageUrl}
                hashtags={previewHashtags}
                username={brandKit?.name ?? 'tu_marca'}
                logoUrl={brandKit?.logo_url ?? undefined}
              />
            )}
            {isCarousel && (
              slides.length > 0 ? (
                <CarouselPreview
                  slides={slides as CarouselSlide[]}
                  username={brandKit?.name ?? undefined}
                  logoUrl={brandKit?.logo_url ?? undefined}
                  description={bodyText || title || undefined}
                />
              ) : (
                <EmptyPreview lang={lang} />
              )
            )}
            {isReel && (
              <ReelEditPreview
                videoUrl={videoUrl}
                scenes={slides as ReelScene[]}
                caption={bodyText || title}
                username={brandKit?.name ?? 'tu_marca'}
                logoUrl={brandKit?.logo_url ?? undefined}
              />
            )}
            {isStory && (
              <StoryPreview
                imageUrl={imageUrl}
                videoUrl={videoUrl}
                caption={bodyText || title}
                username={brandKit?.name ?? 'tu_marca'}
                logoUrl={brandKit?.logo_url ?? undefined}
                height={420}
              />
            )}
          </div>
        </div>

        {/* ── Editable fields ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 280 }}>
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

        {/* Body (post & story) */}
        {(isPost || isStory) && (
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

        {/* Image (post, carousel cover & story) */}
        {(isPost || isCarousel || isStory) && (
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

        {/* Video (reel) — scenes already carry background images + text from
            generation, but the text only gets baked in when Remotion renders
            them into a video. Auto-trigger that render here, same as Story. */}
        {isReel && (
          <Field label={t.videoField}>
            {videoUrl ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <video src={videoUrl} controls style={{ width: 140, height: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', background: '#000' }} />
                <UploadBtn label={t.changeVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
              </div>
            ) : slides.length > 0 ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <MuxReelPlayer
                  itemId={item.id}
                  renderStatus={item.render_status ?? 'not_rendered'}
                  height={200}
                  onRenderDone={(_id, url) => {
                    setVideoUrl(url);
                    onUpdate({ video_url: url });
                  }}
                />
                <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
              </div>
            ) : (
              <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
            )}
          </Field>
        )}

        {/* Video (story — optional, generated on demand or uploaded manually) */}
        {isStory && (
          <Field label={t.videoField}>
            {videoUrl ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <video src={videoUrl} controls style={{ width: 140, height: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', background: '#000' }} />
                <UploadBtn label={t.changeVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
              </div>
            ) : storyHasScript ? (
              <MuxReelPlayer
                itemId={item.id}
                renderStatus="not_rendered"
                height={200}
                onRenderDone={(_id, url) => {
                  setVideoUrl(url);
                  onUpdate({ video_url: url });
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleGenerateStoryVideoScript}
                  disabled={storyVideoScriptLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                    padding: '9px 16px', borderRadius: 8, border: '1px solid var(--accent)',
                    background: 'rgba(198,255,75,0.08)', color: 'var(--accent)',
                    fontSize: 13, fontWeight: 700, cursor: storyVideoScriptLoading ? 'not-allowed' : 'pointer',
                    opacity: storyVideoScriptLoading ? 0.6 : 1,
                  }}
                >
                  {storyVideoScriptLoading ? t.regenerating : `🎬 ${lang === 'en' ? 'Generate video for this story' : 'Generar video de esta story'}`}
                </button>
                <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} loading={uploading} />
              </div>
            )}
            {storyVideoError && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8 }}>{storyVideoError}</p>}
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
                  onRegenSlideImage={(feedback) => { void handleRegenSlideImage(idx, feedback); }}
                  regenSlideImageLoading={regenSlideImageLoadingIdx === idx}
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

        {/* AI Regen — text (post, carousel & story) */}
        {(isPost || isCarousel || isStory) && (
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

        {/* AI Regen — image (post, carousel & story) */}
        {(isPost || isCarousel || isStory) && (
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
  onToggle, onUpdate, onMove, onDelete, onUploadImage, onRegenSlideImage, regenSlideImageLoading,
}: {
  slide:    CarouselSlide | ReelScene;
  idx:      number;
  isLast:   boolean;
  expanded: boolean;
  isReel:   boolean;
  t:        (typeof T)['es'];
  uploading: boolean;
  onToggle:          () => void;
  onUpdate:          (patch: Partial<CarouselSlide & ReelScene>) => void;
  onMove:            (dir: -1 | 1) => void;
  onDelete:          () => void;
  onUploadImage:     (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRegenSlideImage: (feedback: string) => void;
  regenSlideImageLoading: boolean;
}) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState('');
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {slide.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={slide.image_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <UploadBtn label={slide.image_url ? t.changeImage : t.uploadImage} accept="image/*" onChange={onUploadImage} loading={uploading} />
                <button
                  type="button"
                  onClick={() => setRegenOpen((o) => !o)}
                  disabled={regenSlideImageLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '7px 12px', borderRadius: 8, border: '1px solid var(--accent)',
                    background: regenOpen ? 'rgba(198,255,75,0.12)' : 'rgba(198,255,75,0.06)',
                    fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: regenSlideImageLoading ? 'not-allowed' : 'pointer',
                    opacity: regenSlideImageLoading ? 0.6 : 1,
                  }}
                >
                  {regenSlideImageLoading ? t.regenSlideImageLoading : t.regenSlideImageBtn}
                </button>
              </div>
            </div>
            {regenOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  value={regenFeedback}
                  onChange={(e) => setRegenFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && regenFeedback.trim()) {
                      onRegenSlideImage(regenFeedback);
                      setRegenFeedback(''); setRegenOpen(false);
                    }
                  }}
                  placeholder={t.regenSlideImagePlaceholder}
                  style={{ ...inputStyle, fontSize: 12, padding: '8px 12px' }}
                />
                <button
                  type="button"
                  onClick={() => { onRegenSlideImage(regenFeedback); setRegenFeedback(''); setRegenOpen(false); }}
                  style={{
                    background: 'rgba(198,255,75,0.08)', border: '1px solid var(--accent)',
                    color: 'var(--accent)', borderRadius: 8, padding: '8px 0',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t.regenSlideImageBtn}
                </button>
              </div>
            )}
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

function EmptyPreview({ lang }: { lang: 'es' | 'en' }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '1 / 1', borderRadius: 10,
      border: '1px dashed var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20,
    }}>
      {lang === 'en' ? 'Add a slide to see the preview' : 'Añade un slide para ver la vista previa'}
    </div>
  );
}

/** Instagram Reels-style live preview (vertical 9:16) used while editing a reel. */
function ReelEditPreview({
  videoUrl, scenes, caption, username, logoUrl,
}: {
  videoUrl:  string | null;
  scenes:    ReelScene[];
  caption:   string;
  username:  string;
  logoUrl?:  string;
}) {
  const scene = scenes[0];
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', background: '#000' }}>
        {videoUrl ? (
          <video src={videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : scene?.image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scene.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.75) 100%)',
            }} />
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #080810 0%, #0d0d1c 45%, #080814 100%)' }} />
        )}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {scene?.title && (
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>
              {scene.title}
            </p>
          )}
          {scene?.body && (
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
              {scene.body}
            </p>
          )}
        </div>
        <span style={{
          position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 800,
          background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 4, padding: '2px 6px',
        }}>▶ REEL</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{username[0]?.toUpperCase()}</span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700 }}>{username} </span>
          {caption}
        </p>
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
