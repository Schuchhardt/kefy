'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Modal from './Modal';
import DateTimePicker from './DateTimePicker';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { PostPreview } from '@/components/dashboard/PostPreview';
import { CarouselPreview } from '@/components/dashboard/CarouselPreview';
import { StoryPreview } from '@/components/dashboard/StoryPreview';
import FormatExample from './FormatExample';
import type { ContentItem, BrandKitInfo, CarouselSlide, ContentType, ContentRendition } from '@/types/content';
import type { SocialAccount } from '@/types/social';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const ALL_FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => null },
);

interface ScheduleModalProps {
  open:             boolean;
  onClose:          () => void;
  /** Pre-selected content item. If null, the modal shows a content picker. */
  initialItem?:     ContentItem | null;
  /** Pre-selected date (e.g. when clicking a calendar day). */
  initialDate?:     Date;
  brandKit?:        BrandKitInfo | null;
  lang:             'es' | 'en';
  onSuccess?:       (mode: 'now' | 'scheduled') => void;
}

const T = { es: esT.scheduleModal, en: enT.scheduleModal } as const;

export default function ScheduleModal({
  open, onClose, initialItem, initialDate, brandKit, lang, onSuccess,
}: ScheduleModalProps) {
  const t = T[lang];

  const [selectedItem,  setSelectedItem]  = useState<ContentItem | null>(initialItem ?? null);
  const [availableItems, setAvailableItems] = useState<ContentItem[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'now' | 'scheduled'>(initialDate ? 'scheduled' : 'now');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(initialDate ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Track video_url for reels rendered inside this modal
  const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);

  // ── Format picker: publish the same topic as post/carousel/reel/story,
  // generating whichever alternate format hasn't been made yet ──────────────
  const [selectedFormat, setSelectedFormat]   = useState<ContentType | null>(null);
  const [renditions, setRenditions]           = useState<ContentRendition[]>([]);
  const [renditionsLoading, setRenditionsLoading] = useState(false);
  const [renditionGenerating, setRenditionGenerating] = useState(false);
  const [renditionError, setRenditionError]   = useState<string | null>(null);

  // Reset state when reopened
  useEffect(() => {
    if (!open) return;
    setSelectedItem(initialItem ?? null);
    setSelectedAccountIds([]);
    setMode(initialDate ? 'scheduled' : 'now');
    setScheduledAt(initialDate ?? null);
    setError(null);
    setSuccess(false);
    setReelVideoUrl(null);
    setSelectedFormat(initialItem?.content_type ?? null);
    setRenditions([]);
    setRenditionError(null);
  }, [open, initialItem, initialDate]);

  // Fetch the topic's alternate-format renditions whenever the selected item changes
  useEffect(() => {
    if (!open || !selectedItem) return;
    setSelectedFormat(selectedItem.content_type);
    setRenditionError(null);
    setRenditionsLoading(true);
    fetch(`/api/content/${selectedItem.id}/renditions`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { renditions?: ContentRendition[] }) => setRenditions(d.renditions ?? []))
      .catch(() => setRenditions([]))
      .finally(() => setRenditionsLoading(false));
  }, [open, selectedItem]);

  const activeRendition = useMemo(
    () => renditions.find((r) => r.format === selectedFormat) ?? null,
    [renditions, selectedFormat],
  );

  async function handleGenerateRendition(format: ContentType) {
    if (!selectedItem) return;
    setRenditionGenerating(true);
    setRenditionError(null);
    try {
      const res = await fetch(`/api/content/${selectedItem.id}/renditions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const d = await res.json() as { rendition?: ContentRendition; error?: string };
      if (!res.ok || !d.rendition) throw new Error(d.error ?? 'Error');
      setRenditions((prev) => [...prev.filter((r) => r.format !== format), d.rendition as ContentRendition]);
    } catch (err) {
      setRenditionError(err instanceof Error ? err.message : 'Error');
    } finally {
      setRenditionGenerating(false);
    }
  }

  // Fetch accounts when opening
  useEffect(() => {
    if (!open) return;
    setLoadingAccounts(true);
    fetch('/api/social/accounts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { accounts?: SocialAccount[] }) => setAccounts(d.accounts ?? []))
      .catch(() => {/* ignore */})
      .finally(() => setLoadingAccounts(false));
  }, [open]);

  // Fetch picker items if no initialItem
  useEffect(() => {
    if (!open || initialItem) return;
    fetch('/api/content?limit=50', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { items?: ContentItem[] }) => {
        const items = (d.items ?? []).filter((i) => i.status !== 'archived');
        setAvailableItems(items);
      })
      .catch(() => setAvailableItems([]));
  }, [open, initialItem]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'active'),
    [accounts],
  );

  const isPrimaryFormat = !!selectedItem && selectedFormat === selectedItem.content_type;
  const renditionReady  = isPrimaryFormat || activeRendition?.status === 'ready';

  /* eslint-disable react-hooks/purity */
  const canSubmit = !!selectedItem
    && !!selectedFormat
    && renditionReady
    && selectedAccountIds.length > 0
    && (mode === 'now' || (mode === 'scheduled' && scheduledAt && scheduledAt.getTime() > Date.now()));
  /* eslint-enable react-hooks/purity */

  const handleSubmit = useCallback(async () => {
    if (!selectedItem || !selectedFormat || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Reels always need a finished video. Stories can be image-only, so only
      // block them while a video render is actively in progress.
      const activeVideoUrl     = isPrimaryFormat ? selectedItem.video_url        : (activeRendition?.video_url ?? null);
      const activeMuxId        = isPrimaryFormat ? selectedItem.mux_playback_id  : (activeRendition?.mux_playback_id ?? null);
      const activeRenderStatus = isPrimaryFormat ? selectedItem.render_status    : (activeRendition?.render_status ?? null);
      const hasVideo  = !!activeVideoUrl || !!activeMuxId || !!reelVideoUrl;
      const reelReady = selectedFormat === 'reel' ? hasVideo
        : selectedFormat === 'story' ? activeRenderStatus !== 'rendering'
        : true;
      if (!reelReady) {
        throw new Error(lang === 'en'
          ? 'The video is still being generated. Please wait until it finishes.'
          : 'El video se está generando, espera a que termine antes de publicar.');
      }

      if (mode === 'scheduled' && scheduledAt) {
        const res = await fetch('/api/social/schedule', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_item_id:    selectedItem.id,
            social_account_ids: selectedAccountIds,
            scheduled_at:       scheduledAt.toISOString(),
            format:             selectedFormat,
          }),
        });
        const d = await res.json() as { error?: string };
        if (!res.ok) throw new Error(d.error ?? 'Error scheduling');
      } else {
        const res = await fetch('/api/social/publish', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_item_id:    selectedItem.id,
            social_account_ids: selectedAccountIds,
            format:             selectedFormat,
          }),
        });
        const d = await res.json() as { error?: string };
        if (!res.ok) throw new Error(d.error ?? 'Error publishing');
      }

      setSuccess(true);
      onSuccess?.(mode);
      // Close after a short delay so the user sees the success state
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  }, [selectedItem, selectedFormat, isPrimaryFormat, activeRendition, canSubmit, mode, scheduledAt, selectedAccountIds, lang, reelVideoUrl, onClose, onSuccess]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'now' ? t.titleNow : t.titleSched}
      maxWidth={620}
      dismissable={!submitting}
    >
      <div style={{ padding: '20px 24px 24px' }}>
        {success ? (
          <p style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: 'var(--accent)', padding: '24px 0' }}>
            {mode === 'now' ? t.successNow : t.successSched}
          </p>
        ) : !selectedItem ? (
          <ContentPicker items={availableItems} brandKit={brandKit} onPick={setSelectedItem} lang={lang} />
        ) : (
          <>
            {/* Preview */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                  {t.preview}
                </p>
                {!initialItem && (
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                    }}
                  >
                    {t.back}
                  </button>
                )}
              </div>

              {/* Format — publish this same topic as post/carousel/reel/story */}
              <FormatPicker
                lang={lang}
                selected={selectedFormat}
                primaryFormat={selectedItem.content_type}
                renditions={renditions}
                loading={renditionsLoading}
                onSelect={setSelectedFormat}
              />

              {selectedFormat && (
                <FormatPreview
                  item={selectedItem}
                  format={selectedFormat}
                  rendition={activeRendition}
                  brandKit={brandKit}
                  generating={renditionGenerating}
                  error={renditionError}
                  lang={lang}
                  onGenerate={() => handleGenerateRendition(selectedFormat)}
                  onReelRenderDone={(_id, url) => {
                    setReelVideoUrl(url);
                    if (!isPrimaryFormat) {
                      setRenditions((prev) => prev.map((r) =>
                        r.format === selectedFormat ? { ...r, video_url: url, render_status: 'ready' } : r,
                      ));
                    }
                  }}
                />
              )}
            </div>

            {/* Accounts — choose where to publish before picking now/schedule */}
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t.accounts}
            </p>
            {loadingAccounts ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>{t.loadingAccounts}</p>
            ) : activeAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 13, color: 'var(--muted)' }}>
                {t.noAccounts}{' '}
                <a href={`/${lang}/dashboard/social`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                  {t.connectAccounts}
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {activeAccounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountIds((prev) =>
                        isSelected ? prev.filter((id) => id !== acc.id) : [...prev, acc.id],
                      )}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(198,255,75,0.10)' : 'var(--surface)',
                        transition: 'all 0.12s',
                        color: isSelected ? 'var(--accent)' : 'var(--text)',
                      }}
                    >
                      <ChannelIcon name={acc.platform} size={18} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>@{acc.username}</span>
                      {isSelected && <span style={{ fontSize: 13 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mode toggle — only relevant once at least one account is picked */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <ToggleBtn active={mode === 'now'}      onClick={() => setMode('now')}      label={t.publishNow} />
              <ToggleBtn active={mode === 'scheduled'} onClick={() => setMode('scheduled')} label={t.schedule} />
            </div>

            {mode === 'scheduled' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {t.when}
                </label>
                <DateTimePicker value={scheduledAt} onChange={setScheduledAt} lang={lang} />
              </div>
            )}

            {error && (
              <p style={{ fontSize: 13, color: '#ff6b6b', marginBottom: 12 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                style={{
                  flex: 1, background: 'var(--accent)', color: '#000', border: 'none',
                  borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700,
                  cursor: (!canSubmit || submitting) ? 'not-allowed' : 'pointer',
                  opacity: (!canSubmit || submitting) ? 0.55 : 1,
                }}
              >
                {submitting ? t.publishing : (mode === 'now' ? t.confirmNow : t.confirmSched)}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg)', color: 'var(--muted)', fontSize: 13, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {t.cancel}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(198,255,75,0.12)' : 'var(--bg)',
        color: active ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      {label}
    </button>
  );
}

// ─── ContentPicker (when no item preselected) ───────────────────────────────

function ContentPicker({
  items, brandKit, onPick, lang,
}: {
  items: ContentItem[] | null;
  brandKit?: BrandKitInfo | null;
  onPick: (item: ContentItem) => void;
  lang: 'es' | 'en';
}) {
  const t = T[lang];
  if (items === null) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>…</p>;
  if (items.length === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.noItems}</p>;

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {t.pickContent}
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8,
        maxHeight: 360, overflowY: 'auto', paddingRight: 4,
      }}>
        {items.map((item) => {
          const thumb = itemThumbnail(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '100%', aspectRatio: '1/1', overflow: 'hidden',
                background: `linear-gradient(135deg, ${brandKit?.accent_color ?? '#c6ff4b'}20, ${brandKit?.primary_color ?? '#888'}10)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 24, opacity: 0.5 }}>
                    {item.content_type === 'reel' ? '▶' : item.content_type === 'carousel' ? '▦' : item.content_type === 'story' ? '◎' : '✦'}
                  </span>
                )}
              </div>
              <div style={{ padding: '6px 8px' }}>
                <p style={{
                  fontSize: 11, margin: 0, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title ?? item.body?.slice(0, 30) ?? '—'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function itemThumbnail(item: ContentItem): string | null {
  if (item.content_type === 'reel' && item.video_url) return null; // use <video> in grid, skip gif
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.slides) && item.slides.length > 0) {
    const first = item.slides[0] as { image_url?: string | null };
    return first.image_url ?? null;
  }
  return null;
}

// ─── FormatPicker ───────────────────────────────────────────────────────────
// Publish the same topic as post/carousel/reel/story regardless of which
// format it was originally generated as — pick a format, and it's generated
// on demand (via FormatPreview/GenerateFormatPrompt below) if missing.

const FORMAT_ICONS: Record<ContentType, string> = { post: '✦', carousel: '▦', reel: '▶', story: '◎' };
const FORMAT_LABELS: Record<'es' | 'en', Record<ContentType, string>> = {
  es: { post: 'Post', carousel: 'Carrusel', reel: 'Reel', story: 'Story' },
  en: { post: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story' },
};

function FormatPicker({
  lang, selected, primaryFormat, renditions, loading, onSelect,
}: {
  lang:          'es' | 'en';
  selected:      ContentType | null;
  primaryFormat: ContentType;
  renditions:    ContentRendition[];
  loading:       boolean;
  onSelect:      (f: ContentType) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {ALL_FORMATS.map((f) => {
        const isSelected = selected === f;
        const isReady = f === primaryFormat || renditions.some((r) => r.format === f && r.status === 'ready');
        return (
          <button
            key={f}
            type="button"
            onClick={() => onSelect(f)}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              background: isSelected ? 'rgba(198,255,75,0.10)' : 'var(--bg)',
              color: isSelected ? 'var(--accent)' : 'var(--text)',
              fontWeight: isSelected ? 700 : 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            {FORMAT_ICONS[f]} {FORMAT_LABELS[lang][f]}
            {isReady && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />}
          </button>
        );
      })}
      {loading && <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>…</span>}
    </div>
  );
}

// ─── FormatPreview ──────────────────────────────────────────────────────────
// Renders whichever format is selected — from the item's own columns when
// it's the primary format, or from its rendition row otherwise. Shows a
// "generate this format" prompt when that rendition doesn't exist yet.

function FormatPreview({
  item, format, rendition, brandKit, generating, error, lang, onGenerate, onReelRenderDone,
}: {
  item:       ContentItem;
  format:     ContentType;
  rendition:  ContentRendition | null;
  brandKit?:  BrandKitInfo | null;
  generating: boolean;
  error:      string | null;
  lang:       'es' | 'en';
  onGenerate: () => void;
  onReelRenderDone?: (itemId: string, url: string) => void;
}) {
  const isPrimary = format === item.content_type;

  const body     = isPrimary ? item.body           : rendition?.body ?? null;
  const imageUrl = isPrimary ? item.image_url       : rendition?.image_url ?? null;
  const slides   = isPrimary ? item.slides          : rendition?.slides ?? null;
  const videoUrl = isPrimary ? item.video_url       : rendition?.video_url ?? null;
  const muxId    = (isPrimary ? item.mux_playback_id : rendition?.mux_playback_id) ?? null;
  const hashtags = isPrimary ? item.hashtags        : rendition?.hashtags ?? [];

  const needsGeneration = !isPrimary && (!rendition || rendition.status === 'error');

  if (needsGeneration) {
    return (
      <GenerateFormatPrompt
        format={format} lang={lang} generating={generating}
        error={error ?? rendition?.error_message ?? null}
        onGenerate={onGenerate}
      />
    );
  }

  if (format === 'post') {
    return (
      <PostPreview
        channel={item.channel}
        body={body}
        imageUrl={imageUrl}
        hashtags={hashtags}
        username={brandKit?.name ?? 'tu_marca'}
        logoUrl={brandKit?.logo_url ?? undefined}
      />
    );
  }

  if (format === 'carousel') {
    if (!Array.isArray(slides) || slides.length === 0) {
      return <GenerateFormatPrompt format={format} lang={lang} generating={generating} error={error} onGenerate={onGenerate} />;
    }
    return (
      <CarouselPreview
        slides={slides as CarouselSlide[]}
        username={brandKit?.name ?? undefined}
        logoUrl={brandKit?.logo_url ?? undefined}
        description={body ?? undefined}
      />
    );
  }

  if (format === 'reel') {
    if (!Array.isArray(slides) || slides.length === 0) {
      return <GenerateFormatPrompt format={format} lang={lang} generating={generating} error={error} onGenerate={onGenerate} />;
    }
    return (
      <ReelSlider
        videoUrl={videoUrl}
        muxPlaybackId={!videoUrl ? muxId : null}
        itemId={item.id}
        renderFormat={isPrimary ? undefined : 'reel'}
        brandKit={brandKit}
        onRenderDone={onReelRenderDone}
      />
    );
  }

  // story
  return (
    <StoryPreview
      imageUrl={imageUrl}
      videoUrl={videoUrl}
      caption={body}
      username={brandKit?.name ?? 'tu_marca'}
      logoUrl={brandKit?.logo_url ?? undefined}
      height={420}
    />
  );
}

const GENERATE_PROMPT_T = {
  es: { cta: (label: string) => `Generar versión de ${label}`, loading: 'Generando…' },
  en: { cta: (label: string) => `Generate ${label} version`, loading: 'Generating…' },
};

function GenerateFormatPrompt({
  format, lang, generating, error, onGenerate,
}: {
  format:     ContentType;
  lang:       'es' | 'en';
  generating: boolean;
  error:      string | null;
  onGenerate: () => void;
}) {
  const gt = GENERATE_PROMPT_T[lang];
  return (
    <div style={{
      border: '1px dashed var(--border)', borderRadius: 12, padding: '20px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      <FormatExample format={format} lang={lang} />
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        style={{
          background: 'rgba(198,255,75,0.08)', border: '1px solid var(--accent)',
          color: 'var(--accent)', borderRadius: 8, padding: '9px 18px',
          fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
          opacity: generating ? 0.6 : 1,
        }}
      >
        {generating ? gt.loading : gt.cta(FORMAT_LABELS[lang][format])}
      </button>
      {error && <p style={{ fontSize: 12, color: '#ff6b6b', margin: 0, textAlign: 'center' }}>{error}</p>}
    </div>
  );
}

function ReelSlider({
  videoUrl, muxPlaybackId, itemId, renderFormat, brandKit, onRenderDone,
}: {
  videoUrl:        string | null;
  muxPlaybackId:   string | null;
  itemId:          string;
  /** Set when rendering an alternate-format rendition (e.g. a 'reel' rendition of a 'post'-primary item). */
  renderFormat?:   'reel' | 'story';
  brandKit?:       BrandKitInfo | null;
  onRenderDone?:   (itemId: string, url: string) => void;
}) {
  const hasVideo = !!(videoUrl || muxPlaybackId);
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden' }}>
      <MuxReelPlayer
        itemId={itemId}
        format={renderFormat}
        videoUrl={videoUrl}
        muxPlaybackId={muxPlaybackId}
        renderStatus={hasVideo ? 'ready' : 'not_rendered'}
        height={360}
        autoPlay={hasVideo}
        accentColor={brandKit?.accent_color ?? brandKit?.primary_color ?? undefined}
        onRenderDone={onRenderDone}
      />
    </div>
  );
}
