'use client';

// ─── Publicar / programar ────────────────────────────────────────────────────
// Elegir contenido → formato → cuentas → ahora o fecha → confirmar.
//
// - «Publicar» explica por qué no se puede pulsar (sin cuentas, sin cuenta
//   elegida, video sin terminar, fecha pasada…) junto al botón. El botón queda
//   con `aria-disabled` y no `disabled`: así sigue siendo enfocable y el motivo
//   se anuncia como su descripción.
// - Al terminar no se cierra solo: muestra el resultado y el usuario decide
//   (cerrar o ir al calendario).
// - Las acciones viven en el pie fijo del modal, y el cuerpo es un <form>.

import { useEffect, useState, useMemo, useId, useRef } from 'react';
import dynamic from 'next/dynamic';
import Modal from '@/components/ui/Modal';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import Icon, { type IconName } from '@/components/ui/icons';
import ChannelIcon from '@/components/ui/ChannelIcon';
import DateTimePicker from './DateTimePicker';
import { NetworkPreview } from '@/components/dashboard/NetworkPreview';
import FormatExample from './FormatExample';
import { RenditionGenerating } from './RenditionGenerating';
import { notifyLocal, requestNotificationPermission, shouldNotify } from '@/lib/notify';
import type { ContentItem, BrandKitInfo, CarouselSlide, ContentType, ContentRendition, ReelScene } from '@/types/content';
import type { SocialAccount } from '@/types/social';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './ScheduleModal.module.css';

const ALL_FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

const FORMAT_ICONS: Record<ContentType, IconName> = { post: 'post', carousel: 'carousel', reel: 'video', story: 'story' };

/** Alto máximo de las vistas previas verticales (reel, story, TikTok). */
const PREVIEW_MAX_H = 'min(560px, 50dvh)';

/** Only an http(s) URL is a video we can actually publish (a Mux playback id is not). */
function isVideoUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => null },
);

type Copy = typeof esPublish;
const COPY: Record<'es' | 'en', Copy> = { es: esPublish, en: enPublish };

interface ScheduleModalProps {
  open:             boolean;
  onClose:          () => void;
  /** Pre-selected content item. If null, the modal shows a content picker. */
  initialItem?:     ContentItem | null;
  /** Pre-selected date (e.g. when clicking a calendar day). */
  initialDate?:     Date;
  /** Pre-checks the active account(s) on this platform (e.g. the detail page's
   *  "publish on this network too" shortcut for a network the item hasn't
   *  gone out to yet). */
  initialPlatform?: string;
  brandKit?:        BrandKitInfo | null;
  lang:             'es' | 'en';
  /** Se llama en cuanto la publicación o programación sale bien (para que el
   *  padre recargue sus datos). El modal sigue abierto mostrando el resultado. */
  onSuccess?:       (mode: 'now' | 'scheduled') => void;
  /** Ofrece «Ver en el calendario» tras programar. `false` desde el propio
   *  calendario. */
  showCalendarLink?: boolean;
}

/** Resultado de /api/social/publish y /api/social/schedule por cuenta. */
interface PublishResult {
  social_account_id: string;
  platform?:         string | null;
  status:            'published' | 'scheduled' | 'failed' | string;
  error?:            string;
}

interface SuccessState {
  mode:   'now' | 'scheduled';
  ok:     number;
  failed: string[];
  when:   Date | null;
}

export default function ScheduleModal({
  open, onClose, initialItem, initialDate, initialPlatform, brandKit, lang, onSuccess,
  showCalendarLink = true,
}: ScheduleModalProps) {
  const copy = COPY[lang];
  const t = copy.schedule;
  const formId = useId();
  const reasonId = useId();
  const accountsLabelId = useId();

  const [selectedItem,  setSelectedItem]  = useState<ContentItem | null>(initialItem ?? null);
  const [availableItems, setAvailableItems] = useState<ContentItem[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'now' | 'scheduled'>(initialDate ? 'scheduled' : 'now');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(initialDate ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  // Track video_url for reels rendered inside this modal
  const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);

  // ── Format picker: publish the same topic as post/carousel/reel/story,
  // generating whichever alternate format hasn't been made yet ──────────────
  const [selectedFormat, setSelectedFormat]   = useState<ContentType | null>(null);
  const [renditions, setRenditions]           = useState<ContentRendition[]>([]);
  const [renditionsLoading, setRenditionsLoading] = useState(false);
  const [renditionGenerating, setRenditionGenerating] = useState(false);
  const [renditionError, setRenditionError]   = useState<string | null>(null);

  // Reset state each time the modal opens. Only on the closed → open edge: the
  // parent may refetch the item after a successful publish (new object, same
  // content) and that must not wipe the success view.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!opening) return;
    setSelectedItem(initialItem ?? null);
    setSelectedAccountIds([]);
    setMode(initialDate ? 'scheduled' : 'now');
    setScheduledAt(initialDate ?? null);
    setError(null);
    setSuccess(null);
    setReelVideoUrl(null);
    setSelectedFormat(initialItem?.content_type ?? null);
    setRenditions([]);
    setRenditionError(null);
  }, [open, initialItem, initialDate]);

  // Fetch the topic's alternate-format renditions whenever the selected item changes
  useEffect(() => {
    if (!open || !selectedItem) return;
    setSelectedFormat(selectedItem.content_type);
    // Never carry a render result over to another item — it would make the
    // publish guard believe this item already has a video.
    setReelVideoUrl(null);
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

    // El permiso se pide dentro del click: iOS ignora la petición fuera de un
    // gesto del usuario, y con la PWA instalada esta es la única vía de avisar
    // cuando la generación termina con la app en segundo plano.
    const canNotify = await requestNotificationPermission();

    const notify = (title: string, body: string) => {
      if (!canNotify || !shouldNotify()) return;
      void notifyLocal({
        title,
        body,
        tag: `rendition-${selectedItem.id}-${format}`,
        url: `/${lang}/dashboard/content`,
      });
    };

    try {
      const res = await fetch(`/api/content/${selectedItem.id}/renditions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const d = await res.json() as { rendition?: ContentRendition; error?: string };
      if (!res.ok || !d.rendition) throw new Error(d.error ?? t.errors.rendition);
      setRenditions((prev) => [...prev.filter((r) => r.format !== format), d.rendition as ContentRendition]);
      notify(t.renditionDoneTitle(copy.formats[format]), t.renditionDoneBody);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : t.errors.rendition;
      setRenditionError(msg);
      notify(t.renditionFailedTitle(copy.formats[format]), msg);
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

  // Pre-check the account(s) on `initialPlatform` once they've loaded — only
  // while nothing else has been picked yet, so it never fights a manual choice.
  useEffect(() => {
    if (!open || !initialPlatform || selectedAccountIds.length > 0) return;
    const matches = activeAccounts.filter((a) => a.platform === initialPlatform).map((a) => a.id);
    if (matches.length > 0) setSelectedAccountIds(matches);
  }, [open, initialPlatform, activeAccounts, selectedAccountIds.length]);

  // La vista previa se ciñe a las redes elegidas: cada una recorta y tapa el
  // contenido a su manera, así que mostrar sólo las que aplican evita aprobar
  // algo que en el destino real se ve distinto.
  const selectedPlatforms = useMemo(
    () => Array.from(new Set(
      activeAccounts.filter((a) => selectedAccountIds.includes(a.id)).map((a) => a.platform),
    )),
    [activeAccounts, selectedAccountIds],
  );

  const isPrimaryFormat = !!selectedItem && selectedFormat === selectedItem.content_type;
  const renditionReady  = isPrimaryFormat || activeRendition?.status === 'ready';

  // Reels always need a finished video. Stories can be image-only, so only
  // block them while a video render is actively in progress.
  // Only a real http(s) video URL counts: a legacy Mux playback id is not
  // publishable, and letting it through made the server publish the reel
  // *cover image* instead of the video.
  const activeVideoUrl     = isPrimaryFormat ? selectedItem?.video_url     : (activeRendition?.video_url ?? null);
  const activeRenderStatus = isPrimaryFormat ? selectedItem?.render_status : (activeRendition?.render_status ?? null);
  const hasVideo   = isVideoUrl(activeVideoUrl) || isVideoUrl(reelVideoUrl);
  const videoReady = selectedFormat === 'reel' ? hasVideo
    : selectedFormat === 'story' ? activeRenderStatus !== 'rendering'
    : true;

  // Motivo por el que todavía no se puede publicar, en el orden en que el
  // usuario recorre el formulario. `null` = se puede.
  const formatLabel = selectedFormat ? copy.formats[selectedFormat] : '';
  /* eslint-disable react-hooks/purity */
  const blockReason: string | null = !selectedItem || !selectedFormat ? null
    : renditionGenerating ? t.reasons.renditionPending(formatLabel)
    : !renditionReady ? t.reasons.needsRendition(formatLabel)
    : !videoReady ? t.reasons.videoPending
    : loadingAccounts && activeAccounts.length === 0 ? t.reasons.loadingAccounts
    : activeAccounts.length === 0 ? t.reasons.noAccounts
    : selectedAccountIds.length === 0 ? t.reasons.noSelection
    : mode === 'scheduled' && !scheduledAt ? t.reasons.noDate
    : mode === 'scheduled' && scheduledAt && scheduledAt.getTime() <= Date.now() ? t.reasons.pastDate
    : null;
  /* eslint-enable react-hooks/purity */
  const canSubmit = !!selectedItem && !!selectedFormat && blockReason === null;

  function accountLabel(id: string, platform?: string | null): string {
    const acc = accounts.find((a) => a.id === id);
    return acc ? `@${acc.username}` : (platform ?? id);
  }

  async function handleSubmit() {
    if (!selectedItem || !selectedFormat || !canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const scheduling = mode === 'scheduled' && !!scheduledAt;
      const res = await fetch(scheduling ? '/api/social/schedule' : '/api/social/publish', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_item_id:    selectedItem.id,
          social_account_ids: selectedAccountIds,
          ...(scheduling ? { scheduled_at: scheduledAt!.toISOString() } : {}),
          format:             selectedFormat,
        }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; results?: PublishResult[] };
      if (!res.ok) {
        // Si fallaron todas las cuentas el servidor responde 502 con el motivo
        // de cada una en `results` y sin `error`.
        const firstFailure = d.results?.find((r) => r.status === 'failed')?.error;
        throw new Error(d.error ?? firstFailure ?? (scheduling ? t.errors.schedule : t.errors.publish));
      }

      const results = d.results ?? [];
      const failed  = results.filter((r) => r.status === 'failed');
      setSuccess({
        mode:   scheduling ? 'scheduled' : 'now',
        ok:     results.length > 0 ? results.length - failed.length : selectedAccountIds.length,
        failed: failed.map((r) => accountLabel(r.social_account_id, r.platform)),
        when:   scheduling ? scheduledAt : null,
      });
      onSuccess?.(scheduling ? 'scheduled' : 'now');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : (mode === 'scheduled' ? t.errors.schedule : t.errors.publish));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Pie fijo del modal ─────────────────────────────────────────────────────
  let footer: React.ReactNode;
  if (success) {
    footer = (
      <>
        {success.mode === 'scheduled' && showCalendarLink && (
          <ButtonLink
            href={`/${lang}/dashboard/content/calendar`}
            variant="secondary"
            icon={<Icon name="calendar" size={16} />}
          >
            {t.success.viewCalendar}
          </ButtonLink>
        )}
        <Button variant="primary" onClick={onClose}>{t.success.close}</Button>
      </>
    );
  } else if (!selectedItem) {
    footer = <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>;
  } else {
    footer = (
      <>
        {blockReason && (
          <p id={reasonId} className={styles.reason} aria-live="polite">
            <Icon name="info" size={14} />
            <span>{blockReason}</span>
          </p>
        )}
        <Button variant="ghost" className={styles.footerCancel} onClick={onClose} disabled={submitting}>{t.cancel}</Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          icon={<Icon name={mode === 'now' ? 'send' : 'calendar'} size={16} />}
          loading={submitting}
          aria-disabled={!canSubmit || undefined}
          aria-describedby={blockReason ? reasonId : undefined}
        >
          {mode === 'now' ? t.confirmNow : t.confirmSched}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'now' ? t.titleNow : t.titleSched}
      maxWidth={620}
      dismissable={!submitting}
      footer={footer}
    >
      {success ? (
        <SuccessView success={success} copy={copy} lang={lang} />
      ) : !selectedItem ? (
        <div className={styles.body}>
          <ContentPicker items={availableItems} brandKit={brandKit} onPick={setSelectedItem} lang={lang} copy={copy} />
        </div>
      ) : (
        <form
          id={formId}
          className={styles.body}
          noValidate
          onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
        >
          {/* Preview + format */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.label}>
                {t.preview}
                {renditionsLoading && <Spinner size={12} />}
              </h3>
              {!initialItem && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="arrow-left" size={14} />}
                  onClick={() => setSelectedItem(null)}
                >
                  {t.changeContent}
                </Button>
              )}
            </div>

            {/* Format — publish this same topic as post/carousel/reel/story */}
            <FormatPicker
              copy={copy}
              selected={selectedFormat}
              primaryFormat={selectedItem.content_type}
              renditions={renditions}
              onSelect={(f) => {
                // A render result belongs to the format it was rendered for.
                if (f !== selectedFormat) setReelVideoUrl(null);
                setSelectedFormat(f);
              }}
            />

            {selectedFormat && (
              <div className={styles.preview}>
                <FormatPreview
                  item={selectedItem}
                  format={selectedFormat}
                  rendition={activeRendition}
                  brandKit={brandKit}
                  generating={renditionGenerating}
                  error={renditionError}
                  lang={lang}
                  copy={copy}
                  networks={selectedPlatforms}
                  onGenerate={() => handleGenerateRendition(selectedFormat)}
                  onReelRenderDone={(_id, url) => {
                    // MuxReelPlayer reports a Mux playback id for legacy items —
                    // that is not a publishable video URL, so ignore it here.
                    if (!isVideoUrl(url)) return;
                    setReelVideoUrl(url);
                    if (!isPrimaryFormat) {
                      setRenditions((prev) => prev.map((r) =>
                        r.format === selectedFormat ? { ...r, video_url: url, render_status: 'ready' } : r,
                      ));
                    }
                  }}
                />
              </div>
            )}
          </section>

          {/* Accounts — choose where to publish before picking now/schedule */}
          <fieldset className={styles.fieldset}>
            <legend id={accountsLabelId} className={styles.label}>{t.accounts}</legend>
            {loadingAccounts && activeAccounts.length === 0 ? (
              <p className={styles.muted}><Spinner size={12} /> {t.loadingAccounts}</p>
            ) : activeAccounts.length === 0 ? (
              <EmptyState
                compact
                icon={<Icon name="link" size={24} />}
                title={t.noAccounts}
                hint={t.noAccountsHint}
                action={(
                  <ButtonLink
                    href={`/${lang}/dashboard/settings#social`}
                    variant="secondary"
                    size="sm"
                    icon={<Icon name="plus" size={14} />}
                  >
                    {t.connectAccounts}
                  </ButtonLink>
                )}
              />
            ) : (
              <div className={styles.accounts}>
                {activeAccounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      className={styles.account}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedAccountIds((prev) =>
                        isSelected ? prev.filter((id) => id !== acc.id) : [...prev, acc.id],
                      )}
                    >
                      <ChannelIcon name={acc.platform} size={18} />
                      <span className={styles.accountName}>@{acc.username}</span>
                      {isSelected && <Icon name="check" size={14} strokeWidth={2.4} />}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* When: now or at a date */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>{t.when}</legend>
            <div className={styles.modeToggle}>
              <button type="button" className={styles.modeBtn} aria-pressed={mode === 'now'} onClick={() => setMode('now')}>
                <Icon name="send" size={16} />
                {t.publishNow}
              </button>
              <button type="button" className={styles.modeBtn} aria-pressed={mode === 'scheduled'} onClick={() => setMode('scheduled')}>
                <Icon name="clock" size={16} />
                {t.schedule}
              </button>
            </div>
            {mode === 'scheduled' && (
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} lang={lang} />
            )}
          </fieldset>

          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      )}
    </Modal>
  );
}

// ─── Resultado ──────────────────────────────────────────────────────────────

function SuccessView({ success, copy, lang }: { success: SuccessState; copy: Copy; lang: 'es' | 'en' }) {
  const t = copy.schedule.success;
  const when = success.when?.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className={styles.success} role="status">
      <span className={styles.successIcon}><Icon name="check-circle" size={44} strokeWidth={1.6} /></span>
      <p className={styles.successTitle}>{success.mode === 'now' ? t.nowTitle : t.schedTitle}</p>
      <p className={styles.successDetail}>
        {success.mode === 'scheduled' && when ? t.schedDetail(when, success.ok) : t.nowDetail(success.ok)}
      </p>
      {success.failed.length > 0 && (
        <Notice tone="warning" live={false} icon={<Icon name="alert" size={16} />}>
          {t.partial(success.failed.join(', '))}
        </Notice>
      )}
    </div>
  );
}

// ─── ContentPicker (when no item preselected) ───────────────────────────────

function ContentPicker({
  items, brandKit, onPick, lang, copy,
}: {
  items: ContentItem[] | null;
  brandKit?: BrandKitInfo | null;
  onPick: (item: ContentItem) => void;
  lang: 'es' | 'en';
  copy: Copy;
}) {
  const t = copy.schedule;
  if (items === null) {
    return <p className={styles.muted}><Spinner size={12} /> {t.loadingItems}</p>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="content" size={28} />}
        title={t.noItems}
        hint={t.noItemsHint}
        action={(
          <ButtonLink href={`/${lang}/dashboard/content/create?new=1`} variant="primary" icon={<Icon name="plus" size={16} />}>
            {t.createContent}
          </ButtonLink>
        )}
      />
    );
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.label}>{t.pickContent}</h3>
      <div className={styles.picker}>
        {items.map((item) => {
          const thumb = itemThumbnail(item);
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.pickItem} ui-link-card`}
              onClick={() => onPick(item)}
            >
              <span
                className={styles.pickThumb}
                style={{
                  aspectRatio: item.content_type === 'reel' ? '3/4' : item.content_type === 'story' ? '2/3' : '1/1',
                  background: `linear-gradient(135deg, ${brandKit?.accent_color ?? '#c6ff4b'}20, ${brandKit?.primary_color ?? '#888'}10)`,
                }}
              >
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt="" />
                ) : (
                  <Icon name={FORMAT_ICONS[item.content_type]} size={24} />
                )}
              </span>
              <span className={styles.pickTitle}>
                {item.title || item.body?.slice(0, 40) || t.untitled}
              </span>
            </button>
          );
        })}
      </div>
    </section>
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

function FormatPicker({
  copy, selected, primaryFormat, renditions, onSelect,
}: {
  copy:          Copy;
  selected:      ContentType | null;
  primaryFormat: ContentType;
  renditions:    ContentRendition[];
  onSelect:      (f: ContentType) => void;
}) {
  return (
    <div className={styles.formatPicker} role="group" aria-label={copy.schedule.formatLabel}>
      {ALL_FORMATS.map((f) => {
        const isReady = f === primaryFormat || renditions.some((r) => r.format === f && r.status === 'ready');
        return (
          <button
            key={f}
            type="button"
            className={styles.formatBtn}
            aria-pressed={selected === f}
            onClick={() => onSelect(f)}
          >
            <Icon name={FORMAT_ICONS[f]} size={16} />
            {copy.formats[f]}
            {isReady && (
              <>
                <span className={styles.readyDot} aria-hidden="true" />
                <span className="sr-only">({copy.schedule.formatReady})</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── FormatPreview ──────────────────────────────────────────────────────────
// Renders whichever format is selected — from the item's own columns when
// it's the primary format, or from its rendition row otherwise. Shows a
// "generate this format" prompt when that rendition doesn't exist yet.

function FormatPreview({
  item, format, rendition, brandKit, generating, error, lang, copy, networks, onGenerate, onReelRenderDone,
}: {
  item:       ContentItem;
  format:     ContentType;
  rendition:  ContentRendition | null;
  brandKit?:  BrandKitInfo | null;
  generating: boolean;
  error:      string | null;
  lang:       'es' | 'en';
  copy:       Copy;
  /** Plataformas de las cuentas elegidas; vacío = todas las del formato. */
  networks:   string[];
  onGenerate: () => void;
  onReelRenderDone?: (itemId: string, url: string) => void;
}) {
  const isPrimary = format === item.content_type;
  const [activeSlide, setActiveSlide] = useState(0);

  const body     = isPrimary ? item.body           : rendition?.body ?? null;
  const imageUrl = isPrimary ? item.image_url       : rendition?.image_url ?? null;
  const slides   = isPrimary ? item.slides          : rendition?.slides ?? null;
  const videoUrl = isPrimary ? item.video_url       : rendition?.video_url ?? null;
  const muxId    = (isPrimary ? item.mux_playback_id : rendition?.mux_playback_id) ?? null;
  const hashtags = isPrimary ? item.hashtags        : rendition?.hashtags ?? [];
  const vertical = format === 'reel' || format === 'story';

  // Mientras se genera manda el esqueleto: la petición tarda minutos y el
  // usuario necesita ver que está pasando algo, no un botón deshabilitado.
  if (generating) {
    return (
      <div className={vertical ? styles.verticalCap : undefined}>
        <RenditionGenerating
          format={format}
          lang={lang}
          accentColor={brandKit?.accent_color ?? undefined}
        />
      </div>
    );
  }

  const needsGeneration = !isPrimary && (!rendition || rendition.status === 'error');
  const prompt = (err: string | null) => (
    <GenerateFormatPrompt format={format} lang={lang} copy={copy} generating={generating} error={err} onGenerate={onGenerate} />
  );

  if (needsGeneration) return prompt(error ?? rendition?.error_message ?? null);

  const previewSlides = (Array.isArray(slides) ? slides : []) as Array<CarouselSlide | ReelScene>;

  if (format === 'post' || format === 'carousel' || format === 'story') {
    if (format === 'carousel' && previewSlides.length === 0) return prompt(error);
    return (
      <NetworkPreview
        contentType={format}
        defaultChannel={item.channel}
        networks={networks}
        body={body}
        imageUrl={imageUrl}
        videoUrl={format === 'story' ? videoUrl : null}
        hashtags={hashtags}
        slides={previewSlides}
        activeSlide={activeSlide}
        onActiveSlideChange={setActiveSlide}
        username={brandKit?.name ?? copy.preview.defaultUsername}
        logoUrl={brandKit?.logo_url ?? undefined}
        imagePending={isPrimary && !imageUrl && item.image_status === 'generating'}
        accentColor={brandKit?.accent_color ?? undefined}
        brandFont={brandKit?.font_heading}
        lang={lang}
        frameMaxHeight={PREVIEW_MAX_H}
      />
    );
  }

  if (format === 'reel') {
    if (!Array.isArray(slides) || slides.length === 0) return prompt(error);
    const hasVideo = !!(videoUrl || muxId);
    return (
      <div style={{ borderRadius: 10, overflow: 'hidden' }}>
        <MuxReelPlayer
          itemId={item.id}
          format={isPrimary ? undefined : 'reel'}
          videoUrl={videoUrl}
          muxPlaybackId={!videoUrl ? muxId : null}
          renderStatus={hasVideo ? 'ready' : 'not_rendered'}
          height={560}
          maxHeight="50dvh"
          autoPlay={hasVideo}
          accentColor={brandKit?.accent_color ?? brandKit?.primary_color ?? undefined}
          lang={lang}
          onRenderDone={onReelRenderDone}
        />
      </div>
    );
  }

  return null;
}

function GenerateFormatPrompt({
  format, lang, copy, generating, error, onGenerate,
}: {
  format:     ContentType;
  lang:       'es' | 'en';
  copy:       Copy;
  generating: boolean;
  error:      string | null;
  onGenerate: () => void;
}) {
  const t = copy.schedule;
  return (
    <div className={styles.generate}>
      <FormatExample format={format} lang={lang} />
      <Button
        variant="secondary"
        icon={<Icon name="sparkles" size={16} />}
        loading={generating}
        onClick={onGenerate}
      >
        {generating ? t.generating : t.generateVersion(copy.formats[format])}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
