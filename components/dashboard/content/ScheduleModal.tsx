'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Modal from './Modal';
import DateTimePicker from './DateTimePicker';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { PostPreview } from '@/components/dashboard/PostPreview';
import { CarouselPreview } from '@/components/dashboard/CarouselPreview';
import type { ContentItem, BrandKitInfo, CarouselSlide, ReelScene } from '@/types/content';
import type { SocialAccount } from '@/types/social';

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

const T = {
  es: {
    titleNow: 'Publicar contenido', titleSched: 'Programar publicación',
    pickContent: 'Selecciona el contenido', noItems: 'No hay contenido disponible. Crea uno primero.',
    preview: 'Vista previa', accounts: '¿En qué cuentas publicar?',
    noAccounts: 'No hay cuentas conectadas.', connectAccounts: 'Conectar cuentas →',
    loadingAccounts: 'Cargando cuentas…',
    publishNow: 'Publicar ahora', schedule: 'Programar',
    when: '¿Cuándo publicar?', confirmNow: 'Publicar ahora',
    confirmSched: 'Confirmar programación', publishing: 'Procesando…',
    cancel: 'Cancelar', successNow: '✓ Publicado correctamente',
    successSched: '¡Programado correctamente', back: '← Cambiar contenido',
  },
  en: {
    titleNow: 'Publish content', titleSched: 'Schedule publication',
    pickContent: 'Pick the content', noItems: 'No content available. Create one first.',
    preview: 'Preview', accounts: 'Where to publish?',
    noAccounts: 'No connected accounts.', connectAccounts: 'Connect accounts →',
    loadingAccounts: 'Loading accounts…',
    publishNow: 'Publish now', schedule: 'Schedule',
    when: 'When to publish?', confirmNow: 'Publish now',
    confirmSched: 'Confirm schedule', publishing: 'Processing…',
    cancel: 'Cancel', successNow: '✓ Published successfully',
    successSched: '✓ Scheduled successfully', back: '← Change content',
  },
};

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
  const [slideIdx, setSlideIdx] = useState(0);

  // Reset state when reopened
  useEffect(() => {
    if (!open) return;
    setSelectedItem(initialItem ?? null);
    setSelectedAccountIds([]);
    setMode(initialDate ? 'scheduled' : 'now');
    setScheduledAt(initialDate ?? null);
    setError(null);
    setSuccess(false);
    setSlideIdx(0);
  }, [open, initialItem, initialDate]);

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

  const canSubmit = !!selectedItem
    && selectedAccountIds.length > 0
    && (mode === 'now' || (mode === 'scheduled' && scheduledAt && scheduledAt.getTime() > Date.now()));

  const handleSubmit = useCallback(async () => {
    if (!selectedItem || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // For unrendered reels, render first
      if (selectedItem.content_type === 'reel' && !selectedItem.mux_playback_id) {
        const renderRes = await fetch('/api/content/reel/render', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: selectedItem.id }),
        });
        const renderData = await renderRes.json() as { mux_playback_id?: string; error?: string };
        if (!renderRes.ok) throw new Error(renderData.error ?? 'Error rendering reel');
        if (!renderData.mux_playback_id) {
          throw new Error(lang === 'en'
            ? 'Video is processing. Try again in a moment.'
            : 'El video está procesándose. Intenta de nuevo en un momento.');
        }
      }

      if (mode === 'scheduled' && scheduledAt) {
        const res = await fetch('/api/social/schedule', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_item_id:    selectedItem.id,
            social_account_ids: selectedAccountIds,
            scheduled_at:       scheduledAt.toISOString(),
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
  }, [selectedItem, canSubmit, mode, scheduledAt, selectedAccountIds, lang, onClose, onSuccess]);

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
              <ItemPreviewSlider
                item={selectedItem}
                brandKit={brandKit}
                slideIdx={slideIdx}
                setSlideIdx={setSlideIdx}
              />
            </div>

            {/* Mode toggle */}
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

            {/* Accounts */}
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
                    {item.content_type === 'reel' ? '▶' : item.content_type === 'carousel' ? '▦' : '✦'}
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
  if (item.content_type === 'reel' && item.mux_playback_id) {
    return `https://image.mux.com/${item.mux_playback_id}/animated.gif?width=200&fps=10&end=4`;
  }
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.slides) && item.slides.length > 0) {
    const first = item.slides[0] as { image_url?: string | null };
    return first.image_url ?? null;
  }
  return null;
}

// ─── ItemPreviewSlider ──────────────────────────────────────────────────────

function ItemPreviewSlider({
  item, brandKit, slideIdx, setSlideIdx,
}: {
  item: ContentItem;
  brandKit?: BrandKitInfo | null;
  slideIdx: number;
  setSlideIdx: (n: number) => void;
}) {
  if (item.content_type === 'post') {
    return (
      <PostPreview
        channel={item.channel}
        body={item.body}
        imageUrl={item.image_url}
        hashtags={item.hashtags}
        username={brandKit?.name ?? 'tu_marca'}
        logoUrl={brandKit?.logo_url ?? undefined}
      />
    );
  }

  if (item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0) {
    return (
      <CarouselPreview
        slides={item.slides as CarouselSlide[]}
        username={brandKit?.name ?? undefined}
        logoUrl={brandKit?.logo_url ?? undefined}
      />
    );
  }

  if (item.content_type === 'reel' && Array.isArray(item.slides) && item.slides.length > 0) {
    return (
      <ReelSlider
        scenes={item.slides as ReelScene[]}
        idx={slideIdx}
        setIdx={setSlideIdx}
        playbackId={item.mux_playback_id ?? null}
        itemId={item.id}
        brandKit={brandKit}
      />
    );
  }

  return null;
}

function ReelSlider({
  scenes, idx, setIdx, playbackId, itemId, brandKit,
}: {
  scenes: ReelScene[];
  idx: number;
  setIdx: (n: number) => void;
  playbackId: string | null;
  itemId: string;
  brandKit?: BrandKitInfo | null;
}) {
  // If we have a rendered video, show it. Otherwise show a sliding scene preview.
  if (playbackId) {
    const muxScenes = scenes.map((s) => ({ ...s, image_url: s.image_url ?? undefined }));
    return (
      <div style={{ borderRadius: 10, overflow: 'hidden' }}>
        <MuxReelPlayer
          itemId={itemId}
          scenes={muxScenes}
          muxPlaybackId={playbackId}
          renderStatus="ready"
          height={360}
          hideRenderButton
          autoPlay
          brandName={brandKit?.name ?? undefined}
          accentColor={brandKit?.accent_color ?? brandKit?.primary_color ?? undefined}
          primaryColor={brandKit?.primary_color ?? undefined}
          fontHeading={brandKit?.font_heading ?? undefined}
          logoUrl={brandKit?.logo_url ?? undefined}
        />
      </div>
    );
  }

  const scene = scenes[Math.min(idx, scenes.length - 1)];
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ aspectRatio: '9/16', background: '#000', position: 'relative', overflow: 'hidden' }}>
        {scene?.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={scene.image_url} alt={scene.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, opacity: 0.5 }}>
            ▶ {scene?.title}
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px 16px 16px', color: '#fff',
          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{scene?.title}</p>
          <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.9 }}>{scene?.body}</p>
        </div>
      </div>
      <SliderControls idx={idx} total={scenes.length} setIdx={setIdx} />
    </div>
  );
}

function SliderControls({ idx, total, setIdx }: { idx: number; total: number; setIdx: (n: number) => void }) {
  if (total <= 1) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setIdx(Math.max(0, idx - 1))}
        disabled={idx === 0}
        style={navBtn('left')}
        aria-label="Anterior"
      >‹</button>
      <button
        type="button"
        onClick={() => setIdx(Math.min(total - 1, idx + 1))}
        disabled={idx === total - 1}
        style={navBtn('right')}
        aria-label="Siguiente"
      >›</button>
      <div style={{
        position: 'absolute', bottom: 8, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 4,
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === idx ? 18 : 6, height: 6, borderRadius: 3,
              background: i === idx ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
              border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.15s',
            }}
          />
        ))}
      </div>
    </>
  );
}

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 8, width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
  } as React.CSSProperties;
}
