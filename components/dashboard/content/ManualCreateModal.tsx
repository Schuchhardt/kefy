'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import Icon, { type IconName } from '@/components/ui/icons';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { CHANNELS } from '@/lib/channels';
import { toLocale } from '@/lib/i18n';
import type { ContentItem, ContentType, CarouselSlide, ReelScene } from '@/types/content';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';
import styles from './ManualCreateModal.module.css';

interface ManualCreateModalProps {
  open:    boolean;
  onClose: () => void;
  lang:    'es' | 'en';
  onCreated: (item: ContentItem) => void;
}

type ManualCopy = typeof esT.manualCreate;

const TYPE_OPTIONS: { value: ContentType; icon: IconName }[] = [
  { value: 'post',     icon: 'post'     },
  { value: 'carousel', icon: 'carousel' },
  { value: 'reel',     icon: 'video'    },
  { value: 'story',    icon: 'story'    },
];

export default function ManualCreateModal({ open, onClose, lang, onCreated }: ManualCreateModalProps) {
  const copy = toLocale(lang) === 'en' ? enT : esT;
  const t = copy.manualCreate;
  const formId = `manual-create-${useId().replace(/:/g, '')}`;

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
    const d = await res.json().catch(() => ({})) as { url?: string; type?: 'image' | 'video'; error?: string };
    if (!res.ok || !d.url || !d.type) throw new Error(d.error || t.uploadError);
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
      setError(err instanceof Error && err.message ? err.message : t.uploadError);
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (creating) return;
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
      if (type === 'story') {
        if (imageUrl) payload.image_url = imageUrl;
        if (videoUrl) payload.video_url = videoUrl;
      }

      const res = await fetch('/api/content', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({})) as { item?: ContentItem; error?: string };
      if (!res.ok || !d.item) throw new Error(d.error || t.createError);
      onCreated(d.item);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.createError);
    } finally {
      setCreating(false);
    }
  }

  const channels = CHANNELS
    .filter((c) => c.group !== 'ads')
    .map((c) => (c.value === 'generic' ? { ...c, label: copy.channelGeneric } : c));

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t.title}
      subtitle={t.subtitle}
      maxWidth={620}
      dismissable={!creating}
      padded
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={creating}>{t.cancel}</Button>
          <Button type="submit" form={formId} variant="primary" loading={creating}>
            {creating ? t.creating : t.create}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className={styles.stack} noValidate>
        {/* Type */}
        <Group label={t.typeLabel}>
          <div className={styles.typeOptions}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={type === opt.value}
                onClick={() => setType(opt.value)}
                className={styles.typeOption}
              >
                <Icon name={opt.icon} size={16} />
                {copy.typeLabels[opt.value]}
              </button>
            ))}
          </div>
        </Group>

        {/* Channel */}
        <Group label={t.channelLabel}>
          <div className="ui-segmented">
            {channels.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={channel === c.value}
                onClick={() => setChannel(c.value)}
                className={styles.channelBtn}
              >
                {c.value !== 'generic' && <ChannelIcon name={c.value} size={14} />}
                {c.label}
              </button>
            ))}
          </div>
        </Group>

        {/* Title (optional) */}
        <Field label={t.titleField} hint={t.titleHint}>
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {/* Body */}
        {(type === 'post' || type === 'reel' || type === 'story') && (
          <Field label={t.bodyField}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t.bodyPlaceholder}
            />
          </Field>
        )}

        {/* Hashtags */}
        <Field label={t.hashtagsField} hint={t.hashtagsHint}>
          <Input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="#marketing #branding" />
        </Field>

        {/* Cover image (post / story) */}
        {(type === 'post' || type === 'story') && (
          <Group label={t.imageField}>
            <UploadPreview
              url={imageUrl}
              kind="image"
              t={t}
              onUpload={(e) => handleUpload('cover', e)}
              onRemove={() => setImageUrl(null)}
              uploading={uploading}
            />
          </Group>
        )}

        {/* Video (reel / story) */}
        {(type === 'reel' || type === 'story') && (
          <Group label={t.videoField}>
            <UploadPreview
              url={videoUrl}
              kind="video"
              t={t}
              onUpload={(e) => handleUpload('video', e)}
              onRemove={() => setVideoUrl(null)}
              uploading={uploading}
            />
          </Group>
        )}

        {/* Slides (carousel) */}
        {type === 'carousel' && (
          <Group label={t.slidesField}>
            <div className={styles.slides}>
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
              <Button variant="secondary" block className={styles.addBtn} icon={<Icon name="plus" size={16} />} onClick={addSlide}>
                {t.addSlide}
              </Button>
            </div>
          </Group>
        )}

        {/* Scenes (reel — optional if no video) */}
        {type === 'reel' && !videoUrl && (
          <Group label={t.scenesField} hint={t.scenesHint}>
            <div className={styles.slides}>
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
              <Button variant="secondary" block className={styles.addBtn} icon={<Icon name="plus" size={16} />} onClick={addScene}>
                {t.addScene}
              </Button>
            </div>
          </Group>
        )}

        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </Modal>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Grupo de controles con su etiqueta (botones, subidas): no son un único
 *  campo, así que la etiqueta nombra el grupo en vez de un `htmlFor`. */
function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = `g${useId().replace(/:/g, '')}`;
  return (
    <div role="group" aria-labelledby={id} className={styles.group}>
      <span id={id} className="ui-label">
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6 }}>— {hint}</span>}
      </span>
      {children}
    </div>
  );
}

function UploadPreview({
  url, kind, t, onUpload, onRemove, uploading,
}: {
  url: string | null;
  kind: 'image' | 'video';
  t: ManualCopy;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  // Un <label> con el input oculto no se podía alcanzar con el teclado: el
  // botón abre el selector de archivos del input.
  const inputRef = useRef<HTMLInputElement>(null);
  if (!url) {
    return (
      <div>
        <Button
          variant="secondary"
          icon={<Icon name="upload" size={16} />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? t.uploading : kind === 'image' ? t.uploadImage : t.uploadVideo}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={kind === 'image' ? 'image/*' : 'video/*'}
          hidden
          tabIndex={-1}
          onChange={onUpload}
          disabled={uploading}
        />
      </div>
    );
  }
  return (
    <div className={styles.preview}>
      {kind === 'image' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className={styles.previewImg} />
      ) : (
        <video src={url} controls className={styles.previewVideo} />
      )}
      <Button variant="danger-ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={onRemove}>
        {kind === 'image' ? t.removeImage : t.removeVideo}
      </Button>
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
  t: ManualCopy;
  uploading: boolean;
  onTitle:   (v: string) => void;
  onBody:    (v: string) => void;
  onDuration?: (v: number) => void;
  onUpload:  (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove:  () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const durationId = `d${useId().replace(/:/g, '')}`;
  const n = idx + 1;
  const name = isReel ? t.sceneNumber(n) : t.slideNumber(n);

  return (
    <div className={styles.slide} role="group" aria-label={name}>
      <div className={styles.slideHead}>
        <span className={styles.slideNum}>{name}</span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={isReel ? t.removeScene(n) : t.removeSlide(n)}
          icon={<Icon name="close" size={16} />}
          onClick={onRemove}
        />
      </div>
      <div className={styles.slideBody}>
        <div className={styles.slideMedia}>
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageUrl} alt="" className={styles.slideImg} />
          ) : (
            <>
              <button
                type="button"
                className={styles.slideUpload}
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                aria-label={isReel ? t.uploadSceneImage(n) : t.uploadSlideImage(n)}
              >
                <Icon name={uploading ? 'clock' : 'plus'} size={22} />
              </button>
              <input ref={inputRef} type="file" accept="image/*" hidden tabIndex={-1} onChange={onUpload} disabled={uploading} />
            </>
          )}
        </div>
        <div className={styles.slideFields}>
          <Input
            type="text"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder={t.slideTitle}
            aria-label={`${t.slideTitle} · ${name}`}
          />
          <Textarea
            value={body}
            onChange={(e) => onBody(e.target.value)}
            rows={2}
            placeholder={t.slideBody}
            aria-label={`${t.slideBody} · ${name}`}
            className={styles.slideText}
          />
          {isReel && onDuration && (
            <div className={styles.duration}>
              <label htmlFor={durationId}>{t.sceneDuration}</label>
              <Input
                id={durationId}
                type="number" min={1} max={30}
                value={duration ?? 3}
                onChange={(e) => onDuration(Math.max(1, Math.min(30, Number(e.target.value) || 3)))}
                className={styles.durationInput}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
