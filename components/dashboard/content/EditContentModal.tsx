'use client';

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Modal from '@/components/ui/Modal';
import Button, { Spinner, buttonClass } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { NetworkPreview } from '@/components/dashboard/NetworkPreview';
import { ImageGeneratingSpinner } from '@/components/dashboard/ImageGeneratingSpinner';
import type { ContentItem, BrandKitInfo, CarouselSlide, ReelScene } from '@/types/content';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './EditContentModal.module.css';

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

const COPY = { es: esPublish, en: enPublish } as const;
type EditCopy = typeof esPublish.edit;

/** Alto máximo de la vista previa vertical (reel/story/TikTok). */
const PREVIEW_MAX_H = 'min(560px, 55dvh)';

/** Mensaje de un error de la IA: el del servidor si lo trae, si no el genérico. */
function aiMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function EditContentModal({
  open, onClose, item, brandKit, lang, onUpdate,
}: EditContentModalProps) {
  const copy = COPY[lang];
  const t = copy.edit;

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
  const [previewSlide, setPreviewSlide] = useState(0);
  const [regenSlideImageLoadingIdx, setRegenSlideImageLoadingIdx] = useState<number | null>(null);
  const [regenSlideTextLoadingIdx, setRegenSlideTextLoadingIdx] = useState<number | null>(null);
  const [storyVideoScriptLoading, setStoryVideoScriptLoading] = useState(false);
  const [storyVideoError, setStoryVideoError] = useState<string | null>(null);
  const [storyHasScript, setStoryHasScript] = useState(false);
  // Fallos de la IA, junto a la acción que los provocó (antes se perdían en
  // una promesa rechazada sin aviso).
  const [regenTextError, setRegenTextError] = useState<string | null>(null);
  const [regenImageError, setRegenImageError] = useState<string | null>(null);
  const [slideError, setSlideError] = useState<{ idx: number; message: string } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<{ itemId: string; patch: Partial<ContentItem> } | null>(null);
  const lastSentRef = useRef<string>('');
  // Always-fresh ref so the unmount flush below (registered once, empty deps)
  // never calls a stale onUpdate closure.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

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
    setPreviewSlide(0);
    setStoryVideoError(null);
    setStoryHasScript(Array.isArray(item.slides) && item.slides.length > 0);
    setRegenTextError(null);
    setRegenImageError(null);
    setSlideError(null);
    setUploadError(null);
    lastSentRef.current = '';
  }, [item?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendPatch = useCallback((itemId: string, patch: Partial<ContentItem>) => {
    const payload = JSON.stringify(patch);
    if (payload === lastSentRef.current) return;
    lastSentRef.current = payload;
    setSaveState('saving');
    fetch(`/api/content/${itemId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).then(async (res) => {
      const d = await res.json() as { item?: ContentItem; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'PATCH failed');
      setSaveState('saved');
      onUpdateRef.current(patch);
      setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 1500);
    }).catch(() => setSaveState('error'));
  }, []);

  // Debounced auto-save
  const scheduleSave = useCallback((patch: Partial<ContentItem>) => {
    if (!item) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = { itemId: item.id, patch };
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      pendingSaveRef.current = null;
      sendPatch(item.id, patch);
    }, 700);
  }, [item, sendPatch]);

  // Flush a still-pending debounced save when this component actually
  // unmounts (e.g. navigating away mid-edit) instead of silently discarding
  // the last edit — closing the modal alone doesn't unmount it (only its
  // internal <Modal> does), so this only matters for real navigation.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (pendingSaveRef.current) {
      sendPatch(pendingSaveRef.current.itemId, pendingSaveRef.current.patch);
      pendingSaveRef.current = null;
    }
  }, [sendPatch]);

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
    if (!res.ok || !d.url || !d.type) throw new Error(d.error ?? t.uploadError);
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
      setUploadError(aiMessage(err, t.uploadError));
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
      setUploadError(aiMessage(err, t.uploadError));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeImage() {
    setImageUrl(null);
    scheduleSave({ image_url: null });
  }

  // ── Slide handlers (carousel + reel/story share the same slides column) ────

  // A reel/story's rendered video bakes in each scene's image AND its title/body
  // (Remotion overlays the text at render time), so any scene edit makes the
  // existing video stale. POST /api/content/reel/render short-circuits and
  // returns the cached video whenever video_url is still set, so the new
  // slides + the invalidated video_url/render_status must land in the DB
  // *before* MuxReelPlayer mounts and auto-triggers a re-render — this is
  // why the invalidating case bypasses the normal debounced scheduleSave
  // (which could still be pending when MuxReelPlayer's mount effect fires).
  async function saveSlides(normalized: CarouselSlide[] | ReelScene[]) {
    const isVideoFormat = item!.content_type === 'reel' || item!.content_type === 'story';
    const hasExistingRender = isVideoFormat && (!!videoUrl || item!.render_status === 'ready' || item!.render_status === 'rendering');

    if (!hasExistingRender) {
      scheduleSave({ slides: normalized });
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    pendingSaveRef.current = null;
    setSaveState('saving');
    const patch: Partial<ContentItem> = { slides: normalized, video_url: null, render_status: 'not_rendered' };
    try {
      const res = await fetch(`/api/content/${item!.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('PATCH failed');
      setSaveState('saved');
      onUpdate(patch);
      // Only now is it safe to flip local state — this is what mounts
      // MuxReelPlayer, and by this point the DB already reflects the edit.
      setVideoUrl(null);
    } catch {
      setSaveState('error');
    }
  }

  function updateSlide(idx: number, patch: Partial<CarouselSlide & ReelScene>) {
    const isReel = item!.content_type === 'reel';
    const next = (slides as Array<CarouselSlide | ReelScene>).map((s, i) => i === idx ? { ...s, ...patch } : s);
    setSlides(next as CarouselSlide[] | ReelScene[]);
    const normalized = next.map((s, i) => isReel
      ? { ...(s as ReelScene), scene_order: i + 1, slide_order: i + 1 }
      : { ...(s as CarouselSlide), slide_order: i + 1 },
    );
    saveSlides(normalized as CarouselSlide[] | ReelScene[]);
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
    saveSlides(normalized as CarouselSlide[] | ReelScene[]);
  }

  function deleteSlide(idx: number) {
    const arr = slides.filter((_, i) => i !== idx);
    setSlides(arr);
    const isReel = item!.content_type === 'reel';
    const normalized = arr.map((s, i) => isReel
      ? { ...(s as ReelScene), scene_order: i + 1, slide_order: i + 1 }
      : { ...(s as CarouselSlide), slide_order: i + 1 },
    );
    saveSlides(normalized as CarouselSlide[] | ReelScene[]);
  }

  function addSlide() {
    const isReel = item!.content_type === 'reel';
    const newSlide = isReel
      ? { scene_order: slides.length + 1, slide_order: slides.length + 1, title: '', body: '', duration_seconds: 3, image_url: null }
      : { slide_order: slides.length + 1, title: '', body: '', image_url: null };
    const arr = [...slides, newSlide as unknown as (CarouselSlide | ReelScene)];
    setSlides(arr as CarouselSlide[] | ReelScene[]);
    saveSlides(arr as CarouselSlide[] | ReelScene[]);
  }

  async function uploadSlideImage(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const { url } = await uploadFile(file);
      updateSlide(idx, { image_url: url });
    } catch (err) {
      setUploadError(aiMessage(err, t.uploadError));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // Regenerate the title/body of a single slide/scene with AI (per-slide button).
  async function handleRegenSlideText(idx: number, feedback: string) {
    if (!item) return;
    const slide = slides[idx] as CarouselSlide | ReelScene;
    setRegenSlideTextLoadingIdx(idx);
    setSlideError(null);
    try {
      const res = await fetch('/api/content/slide-text', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind:     item.content_type === 'reel' ? 'reel' : 'carousel',
          channel:  item.channel,
          title:    slide.title ?? '',
          body:     slide.body ?? '',
          feedback: feedback.trim() || undefined,
          language: lang,
        }),
      });
      const d = await res.json() as { title?: string; body?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Error');
      updateSlide(idx, { title: d.title ?? slide.title, body: d.body ?? slide.body });
    } catch (err) {
      setSlideError({ idx, message: aiMessage(err, t.aiError) });
    } finally {
      setRegenSlideTextLoadingIdx(null);
    }
  }

  // ── AI regen ──────────────────────────────────────────────────────────────
  async function handleRegenText() {
    if (!item) return;
    setRegenTextLoading(true);
    setRegenTextError(null);
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
    } catch (err) {
      setRegenTextError(aiMessage(err, t.aiError));
    } finally {
      setRegenTextLoading(false);
    }
  }

  async function handleRegenImage() {
    if (!item) return;
    setRegenImageLoading(true);
    setRegenImageError(null);
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
    } catch (err) {
      setRegenImageError(aiMessage(err, t.aiError));
    } finally {
      setRegenImageLoading(false);
    }
  }

  async function handleRegenSlideImage(idx: number, feedback: string) {
    const slide = slides[idx] as CarouselSlide | ReelScene;
    setRegenSlideImageLoadingIdx(idx);
    setSlideError(null);
    try {
      const context = [slide.title, slide.body].filter(Boolean).join('. ');
      const prompt = feedback.trim()
        ? `${context ? context + '. ' : ''}${feedback.trim()}`
        : context || t.slideImagePrompt;
      // La imagen se regenera limpia, sin texto quemado: el título/cuerpo se
      // dibujan encima como HTML en la vista previa y se componen sobre los
      // píxeles al publicar (los reels ni siquiera eso: Remotion pinta el
      // texto al renderizar el video).
      const res = await fetch('/api/content/image', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: '1024x1024', quality: 'medium' }),
      });
      const d = await res.json() as { image?: { url: string }; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Error');
      if (d.image?.url) {
        updateSlide(idx, { image_url: d.image.url, text_baked: false });
      }
    } catch (err) {
      setSlideError({ idx, message: aiMessage(err, t.aiError) });
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
      if (!res.ok) throw new Error(d.error ?? t.aiError);
      setSlides((d.scenes ?? []) as unknown as (CarouselSlide | ReelScene)[]);
      onUpdate({ slides: (d.scenes ?? []) as unknown as ReelScene[] });
      setStoryHasScript(true);
    } catch (err) {
      setStoryVideoError(aiMessage(err, t.aiError));
    } finally {
      setStoryVideoScriptLoading(false);
    }
  }

  const isPost     = item.content_type === 'post';
  const isCarousel = item.content_type === 'carousel';
  const isReel     = item.content_type === 'reel';
  const isStory    = item.content_type === 'story';


  const saveStatus: ReactNode = saveState === 'saving' ? <><Spinner size={12} /> {t.saving}</>
    : saveState === 'saved' ? <><Icon name="check" size={14} /> {t.saved}</>
    : saveState === 'error' ? <span className={`${styles.saveStatus} ${styles.saveError}`}><Icon name="alert" size={14} /> {t.saveError}</span>
    : t.subtitle;

  // Same hashtag normalization as onTagsChange, kept in sync for the live preview
  const previewHashtags = tagsText
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((s) => `#${s}`);

  const uploadProps = { loading: uploading, uploadingLabel: t.uploading };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.title}
      subtitle={<span role="status" className={styles.saveStatus}>{saveStatus}</span>}
      maxWidth={960}
      footer={<Button variant="primary" onClick={onClose}>{t.close}</Button>}
    >
      <div className={styles.layout}>
        {/* ── Live preview ─────────────────────────────────────────────── */}
        <div className={styles.previewCol}>
          <div className={styles.previewSticky}>
            <h3 className={styles.label}>{t.previewLabel}</h3>
            <NetworkPreview
              contentType={item.content_type}
              defaultChannel={item.channel}
              body={bodyText || title || ''}
              imageUrl={imageUrl}
              videoUrl={videoUrl}
              hashtags={previewHashtags}
              slides={slides}
              activeSlide={previewSlide}
              onActiveSlideChange={setPreviewSlide}
              username={brandKit?.name ?? copy.preview.defaultUsername}
              logoUrl={brandKit?.logo_url ?? undefined}
              imagePending={item.image_status === 'generating'}
              accentColor={brandKit?.accent_color ?? undefined}
              brandFont={brandKit?.font_heading}
              lang={lang}
              frameMaxHeight={PREVIEW_MAX_H}
            />
          </div>
        </div>

        {/* ── Editable fields ──────────────────────────────────────────── */}
        <div className={styles.fields}>
          {/* Title — hidden for carousel: each slide carries its own content */}
          {!isCarousel && (
            <Field label={t.titleField}>
              <Input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="—" />
            </Field>
          )}

          {/* Body (post & story) */}
          {(isPost || isStory) && (
            <Field label={t.bodyField}>
              <Textarea value={bodyText} onChange={(e) => onBodyChange(e.target.value)} rows={5} />
            </Field>
          )}

          {/* Hashtags — hidden for carousel: each slide carries its own content */}
          {!isCarousel && (
            <Field label={t.hashtagsField} hint={t.hashtagsHint}>
              <Input type="text" value={tagsText} onChange={(e) => onTagsChange(e.target.value)} placeholder="#marketing #branding" />
            </Field>
          )}

          {/* Image (post & story) — carousel uses per-slide images instead */}
          {(isPost || isStory) && (
            <Group label={t.imageField}>
              {imageUrl ? (
                <div className={styles.row}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className={styles.thumb} />
                  <div className={styles.stack}>
                    <UploadBtn label={t.changeImage} accept="image/*" onChange={onImageUpload} {...uploadProps} />
                    <Button variant="danger-ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={removeImage}>
                      {t.removeImage}
                    </Button>
                  </div>
                </div>
              ) : item.image_status === 'generating' ? (
                <div style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden' }}>
                  <ImageGeneratingSpinner label={t.generatingImage} height={120} accentColor={brandKit?.accent_color ?? undefined} />
                </div>
              ) : (
                <UploadBtn label={t.uploadImage} accept="image/*" onChange={onImageUpload} {...uploadProps} />
              )}
            </Group>
          )}

          {/* Video (reel) — scenes already carry background images + text from
              generation, but the text only gets baked in when Remotion renders
              them into a video. Auto-trigger that render here, same as Story. */}
          {isReel && (
            <Group label={t.videoField}>
              {videoUrl ? (
                <div className={styles.row}>
                  <video src={videoUrl} controls className={styles.video} />
                  <UploadBtn label={t.changeVideo} accept="video/*" onChange={onVideoUpload} {...uploadProps} />
                </div>
              ) : slides.length > 0 ? (
                <div className={styles.row}>
                  <MuxReelPlayer
                    itemId={item.id}
                    renderStatus={item.render_status ?? 'not_rendered'}
                    height={200}
                    lang={lang}
                    onRenderDone={(_id, url) => {
                      setVideoUrl(url);
                      onUpdate({ video_url: url });
                    }}
                  />
                  <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} {...uploadProps} />
                </div>
              ) : (
                <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} {...uploadProps} />
              )}
            </Group>
          )}

          {/* Video (story — optional, generated on demand or uploaded manually) */}
          {isStory && (
            <Group label={t.videoField}>
              {videoUrl ? (
                <div className={styles.row}>
                  <video src={videoUrl} controls className={styles.video} />
                  <UploadBtn label={t.changeVideo} accept="video/*" onChange={onVideoUpload} {...uploadProps} />
                </div>
              ) : storyHasScript ? (
                <MuxReelPlayer
                  itemId={item.id}
                  renderStatus="not_rendered"
                  height={200}
                  lang={lang}
                  onRenderDone={(_id, url) => {
                    setVideoUrl(url);
                    onUpdate({ video_url: url });
                  }}
                />
              ) : (
                <div className={styles.stack}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Icon name="video" size={14} />}
                    loading={storyVideoScriptLoading}
                    onClick={handleGenerateStoryVideoScript}
                  >
                    {storyVideoScriptLoading ? t.regenerating : t.generateStoryVideo}
                  </Button>
                  <UploadBtn label={t.uploadVideo} accept="video/*" onChange={onVideoUpload} {...uploadProps} />
                </div>
              )}
              {storyVideoError && <Notice tone="danger">{storyVideoError}</Notice>}
            </Group>
          )}

          {uploadError && <Notice tone="danger">{uploadError}</Notice>}

          {/* Slides (carousel & reel) */}
          {(isCarousel || isReel) && (
            <Group label={isReel ? t.sceneTitle : t.slidesTitle}>
              <ol className={styles.slides}>
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
                    error={slideError?.idx === idx ? slideError.message : null}
                    onToggle={() => { setPreviewSlide(idx); setEditingSlide(editingSlide === idx ? null : idx); }}
                    onUpdate={(p) => updateSlide(idx, p)}
                    onMove={(dir) => moveSlide(idx, dir)}
                    onDelete={() => deleteSlide(idx)}
                    onUploadImage={(e) => uploadSlideImage(idx, e)}
                    onRegenSlideImage={(feedback) => { void handleRegenSlideImage(idx, feedback); }}
                    regenSlideImageLoading={regenSlideImageLoadingIdx === idx}
                    onRegenSlideText={(feedback) => { void handleRegenSlideText(idx, feedback); }}
                    regenSlideTextLoading={regenSlideTextLoadingIdx === idx}
                  />
                ))}
              </ol>
              <Button variant="secondary" block icon={<Icon name="plus" size={16} />} onClick={addSlide}>
                {isReel ? t.addScene : t.addSlide}
              </Button>
            </Group>
          )}

          {/* AI Regen — text. For post/story it's the whole copy; for carousel
              it's the single global post caption (the per-slide text buttons
              handle the copy baked onto each slide image). Reel regenerates
              per-scene only. */}
          {(isPost || isStory || isCarousel) && (
            <RegenBlock
              title={isCarousel ? t.regenCaption : t.regenText}
              placeholder={t.feedbackPlaceholder}
              feedback={regenTextFeedback}
              onChange={setRegenTextFeedback}
              onRegen={handleRegenText}
              loading={regenTextLoading}
              error={regenTextError}
              t={t}
            />
          )}

          {/* AI Regen — image (post & story) — carousel regenerates per-slide instead */}
          {(isPost || isStory) && (
            <RegenBlock
              title={t.regenImage}
              placeholder={t.feedbackPlaceholder}
              feedback={regenImageFeedback}
              onChange={setRegenImageFeedback}
              onRegen={handleRegenImage}
              loading={regenImageLoading}
              error={regenImageError}
              t={t}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Grupo de controles con título (imagen, video, slides): no es un único campo
 *  que se pueda asociar con <label>. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={styles.group}>
      <p id={id} className="ui-label" style={{ margin: 0 }}>{label}</p>
      {children}
    </div>
  );
}

function UploadBtn({
  label, accept, onChange, loading, uploadingLabel,
}: {
  label:    string;
  accept:   string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading:  boolean;
  uploadingLabel: string;
}) {
  return (
    <label
      className={`${buttonClass({ variant: 'secondary', size: 'sm' })} ${styles.upload}`}
      data-loading={loading || undefined}
    >
      {loading ? <Spinner size={12} /> : <Icon name="upload" size={14} />}
      {loading ? uploadingLabel : label}
      <input type="file" accept={accept} className="sr-only" onChange={onChange} disabled={loading} />
    </label>
  );
}

function SlideEditor({
  slide, idx, isLast, expanded, isReel, t, uploading, error,
  onToggle, onUpdate, onMove, onDelete, onUploadImage,
  onRegenSlideImage, regenSlideImageLoading, onRegenSlideText, regenSlideTextLoading,
}: {
  slide:    CarouselSlide | ReelScene;
  idx:      number;
  isLast:   boolean;
  expanded: boolean;
  isReel:   boolean;
  t:        EditCopy;
  uploading: boolean;
  error:    string | null;
  onToggle:          () => void;
  onUpdate:          (patch: Partial<CarouselSlide & ReelScene>) => void;
  onMove:            (dir: -1 | 1) => void;
  onDelete:          () => void;
  onUploadImage:     (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRegenSlideImage: (feedback: string) => void;
  regenSlideImageLoading: boolean;
  onRegenSlideText:  (feedback: string) => void;
  regenSlideTextLoading: boolean;
}) {
  const panelId = useId();
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState('');
  const [textRegenOpen, setTextRegenOpen] = useState(false);
  const [textFeedback, setTextFeedback] = useState('');
  const itemLabel = isReel ? t.sceneN(idx + 1) : t.slideN(idx + 1);

  function submitTextRegen() {
    onRegenSlideText(textFeedback);
    setTextFeedback('');
    setTextRegenOpen(false);
  }
  function submitImageRegen() {
    onRegenSlideImage(regenFeedback);
    setRegenFeedback('');
    setRegenOpen(false);
  }

  return (
    <li className={styles.slide}>
      <div className={styles.slideHead}>
        <button
          type="button"
          className={styles.slideToggle}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
        >
          <span className={styles.slideThumb} aria-hidden="true">
            {slide.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={slide.image_url} alt="" />
            ) : (
              idx + 1
            )}
          </span>
          <span className={styles.slideText}>
            <span className={styles.slideTitle}>{slide.title || itemLabel}</span>
            <span className={styles.slideBody}>{slide.body || '—'}</span>
          </span>
        </button>
        <div className={styles.slideActions}>
          <button type="button" className={styles.iconBtn} onClick={() => onMove(-1)} disabled={idx === 0} aria-label={t.moveUp(itemLabel)}>
            <Icon name="chevron-up" size={18} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => onMove(1)} disabled={isLast} aria-label={t.moveDown(itemLabel)}>
            <Icon name="chevron-down" size={18} />
          </button>
          <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete} aria-label={t.remove(itemLabel)}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className={styles.slidePanel}>
          <Field label={t.slideTitle}>
            <Input type="text" value={slide.title ?? ''} onChange={(e) => onUpdate({ title: e.target.value })} />
          </Field>
          <Field label={t.slideBody}>
            <Textarea value={slide.body ?? ''} onChange={(e) => onUpdate({ body: e.target.value })} rows={3} />
          </Field>
          {isReel && 'duration_seconds' in slide && (
            <Field label={t.sceneDuration}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                className={styles.duration}
                value={(slide as ReelScene).duration_seconds ?? 3}
                onChange={(e) => onUpdate({ duration_seconds: Math.max(1, Math.min(30, Number(e.target.value) || 3)) })}
              />
            </Field>
          )}

          {/* Per-slide AI text regen (title + body of THIS slide) */}
          <div className={styles.stack}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="sparkles" size={14} />}
              loading={regenSlideTextLoading}
              aria-expanded={textRegenOpen}
              onClick={() => setTextRegenOpen((o) => !o)}
            >
              {regenSlideTextLoading ? t.regenSlideTextLoading : t.regenSlideTextBtn}
            </Button>
            {textRegenOpen && (
              <div className={styles.stack} style={{ alignSelf: 'stretch' }}>
                <Field label={t.regenSlideTextBtn} hideLabel className={styles.group}>
                  <Input
                    type="text"
                    value={textFeedback}
                    onChange={(e) => setTextFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !regenSlideTextLoading) submitTextRegen();
                    }}
                    placeholder={t.regenSlideTextPlaceholder}
                  />
                </Field>
                <Button variant="primary" size="sm" block disabled={regenSlideTextLoading} onClick={submitTextRegen}>
                  {t.regenSlideTextBtn}
                </Button>
              </div>
            )}
          </div>

          <div className={styles.stack}>
            <div className={styles.row}>
              {slide.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={slide.image_url} alt="" className={styles.slideImage} />
              )}
              <div className={styles.stack}>
                <UploadBtn
                  label={slide.image_url ? t.changeImage : t.uploadImage}
                  accept="image/*"
                  onChange={onUploadImage}
                  loading={uploading}
                  uploadingLabel={t.uploading}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icon name="sparkles" size={14} />}
                  loading={regenSlideImageLoading}
                  aria-expanded={regenOpen}
                  onClick={() => setRegenOpen((o) => !o)}
                >
                  {regenSlideImageLoading ? t.regenSlideImageLoading : t.regenSlideImageBtn}
                </Button>
              </div>
            </div>
            {regenOpen && (
              <div className={styles.stack} style={{ alignSelf: 'stretch' }}>
                <Field label={t.regenSlideImageBtn} hideLabel className={styles.group}>
                  <Input
                    type="text"
                    value={regenFeedback}
                    onChange={(e) => setRegenFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && regenFeedback.trim()) submitImageRegen();
                    }}
                    placeholder={t.regenSlideImagePlaceholder}
                  />
                </Field>
                <Button variant="primary" size="sm" block onClick={submitImageRegen}>
                  {t.regenSlideImageBtn}
                </Button>
              </div>
            )}
          </div>

          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </li>
  );
}

function RegenBlock({
  title, placeholder, feedback, onChange, onRegen, loading, error, t,
}: {
  title: string;
  placeholder: string;
  feedback: string;
  onChange: (v: string) => void;
  onRegen: () => void;
  loading: boolean;
  error: string | null;
  t: EditCopy;
}) {
  return (
    <div className={styles.regen}>
      <Field label={title}>
        <Textarea rows={2} value={feedback} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </Field>
      <Button variant="secondary" block icon={<Icon name="sparkles" size={16} />} loading={loading} onClick={onRegen}>
        {loading ? t.regenerating : t.regenerate}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
