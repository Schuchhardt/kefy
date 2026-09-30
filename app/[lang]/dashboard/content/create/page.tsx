'use client';

// ─── «Mis contenidos»: generar con IA y la lista de piezas ─────────────────
//
// Flujo (auditoría UX, 5.3 «Crear contenido» y Sprint 4.6):
//   1. El formulario está abierto si no hay contenido o si se llega con
//      ?new=1 (botón «Crear contenido» del sidebar), ?topic= o ?refImage=.
//      Ocultarlo no borra lo escrito ni las referencias.
//   2. Un solo lugar de feedback: el bloque de estado bajo el formulario
//      muestra el progreso y, al terminar, el resultado con el siguiente paso
//      explícito («Revisar y publicar», «Programar»).
//   3. La lista «Mis contenidos» tiene su propio encabezado; cada tarjeta es
//      un enlace a /dashboard/content/<id> operable con teclado.

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import ChannelIcon         from '@/components/ui/ChannelIcon';
import GenerationLoader    from '@/components/ui/GenerationLoader';
import Button, { ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import EmptyState          from '@/components/ui/EmptyState';
import Notice              from '@/components/ui/Notice';
import StatusBadge         from '@/components/ui/StatusBadge';
import Icon, { type IconName } from '@/components/ui/icons';
import { useConfirm }      from '@/components/ui/ConfirmDialog';
import ContentActions      from '@/components/dashboard/content/ContentActions';
import EditContentModal    from '@/components/dashboard/content/EditContentModal';
import ManualCreateModal   from '@/components/dashboard/content/ManualCreateModal';
import RecommendModal      from '@/components/dashboard/content/RecommendModal';
import ContentLibraryModal from '@/components/dashboard/content/ContentLibraryModal';
import ScheduleModal       from '@/components/dashboard/content/ScheduleModal';
import { ESTIMATED_MS }    from '@/components/dashboard/content/RenditionGenerating';
import type { BrandKitInfo, ContentItem, ContentType, ContentStatus, ReelScene, CarouselSlide } from '@/types/content';
import type { LibraryItemWithIndustry } from '@/types/content-library';
import type { Channel } from '@/types/channels';
import type { Locale } from '@/types/i18n';
import type { RecSource, Recommendation, StrategyMeta } from '@/types/strategy';
import { CHANNELS as ALL_CHANNELS } from '@/lib/channels';
import { useDataChanged } from '@/lib/data-events';
import { useBrand } from '@/lib/brand-context';
import { toLocale } from '@/lib/i18n';
import styles from './page.module.css';

import esT, { type ContentCopy } from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';
import esCommon, { type DashboardCommonCopy as CommonCopy } from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentType[] = ['post', 'carousel', 'reel', 'story'];
const CONTENT_STATUSES: ContentStatus[] = ['draft', 'approved', 'scheduled', 'published', 'archived'];

const TYPE_ICON: Record<ContentType, IconName> = {
  post:     'post',
  carousel: 'carousel',
  reel:     'video',
  story:    'story',
};

function parseType(value: string | null | undefined): ContentType {
  return CONTENT_TYPES.includes(value as ContentType) ? value as ContentType : 'post';
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Primeras palabras de un texto, para nombres accesibles cortos. */
function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Gradient palette for carousel slides without images (mirrors CarouselPreview.tsx).
// Son placeholders de imagen, no colores de estado.
const CAROUSEL_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
];

// A cover image whose generation started longer ago than this is treated as
// abandoned (serverless timeout, tab closed mid-request…): the card renders
// normally instead of skeletoning forever, so the user can still edit/delete it.
const IMAGE_PENDING_MAX_MS = 10 * 60 * 1000;

// Typical wall-clock for the whole post flow (copy + cover image). Neither
// step reports real progress — /api/content/image is a single POST that only
// answers when it is done — so the bar is estimated from elapsed time. The
// other formats are one request each and take what a conversion to that
// format takes (RenditionGenerating's measurements).
const POST_ESTIMATED_MS = 60_000;

function creationEstimateMs(type: ContentType): number {
  return type === 'post' ? POST_ESTIMATED_MS : ESTIMATED_MS[type];
}

/** Near-linear up to the typical duration, then asymptotic towards 99 %: the
 *  bar must never reach 100 % while the server is still working. */
function estimateProgress(elapsedMs: number, estimatedMs = POST_ESTIMATED_MS): number {
  const t = Math.max(0, elapsedMs);
  if (t < estimatedMs) return 0.9 * (t / estimatedMs);
  return 0.9 + 0.09 * (1 - Math.exp(-(t - estimatedMs) / estimatedMs));
}

/** Re-renders while a skeleton is on screen so its progress bar advances. */
function useElapsedMs(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** Resolve once the browser actually has the bitmap. Swapping a card out of
 *  its loading state before this would show an empty <img> frame for as long
 *  as the freshly-uploaded (so uncached) file takes to download. */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload  = () => resolve();
    img.onerror = () => resolve();  // show the card anyway; a broken thumb beats an endless skeleton
    img.src = url;
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Lleva un elemento a la vista (y opcionalmente le da el foco). */
function reveal(el: HTMLElement | null, opts: { focus?: boolean; block?: ScrollLogicalPosition } = {}) {
  if (!el) return;
  if (opts.focus) el.focus({ preventScroll: true });
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: opts.block ?? 'center' });
  }
}

/** Miniatura de una pieza: la portada, o la primera escena/slide con imagen. */
function thumbOf(item: Pick<ContentItem, 'content_type' | 'slides' | 'image_url'>): string | null {
  if (item.content_type === 'reel' && Array.isArray(item.slides))
    return (item.slides as ReelScene[])[0]?.image_url ?? null;
  if (item.content_type === 'carousel' && Array.isArray(item.slides))
    return (item.slides as CarouselSlide[])[0]?.image_url ?? null;
  return item.image_url ?? null;
}

// ─── Generation run (the single feedback place) ──────────────────────────────

interface GenRun {
  id:        number;
  type:      ContentType;
  topic:     string;
  slides:    number;
  /** Referencias con las que se lanzó (para reintentar la imagen igual). */
  refs:      string[];
  startedAt: number;
  stage:     'writing' | 'ready' | 'error';
  error?:    string;
  /** Piezas creadas: 2 cuando son variantes de reel. */
  itemIds:   string[];
  excerpt?:  string;
  /** Slides del carrusel o escenas del reel. */
  count?:    number;
  thumbUrl?: string | null;
  /** Portada del post: la genera una segunda petición. */
  image:     'none' | 'pending' | 'ready' | 'error';
  imagePrompt?: string;
}

// ─── Skeleton card ───────────────────────────────────────────────────────────
// Shown while a card is still incomplete (its cover image has not finished
// generating) or while the list loads. A post only leaves this state once text
// *and* image are ready, so the card never appears half-built. Without
// `startedAt` it is a quiet placeholder: the item being generated right now
// reports its progress in the status block, not here.

function SkeletonCard({ mode, label, startedAt, t, accentColor }: {
  mode:         'list' | 'grid';
  label?:       string;
  /** Epoch ms when the generation started — drives the progress bar. */
  startedAt?:   number;
  t:            ContentCopy;
  accentColor?: string;
}) {
  const elapsed  = useElapsedMs(startedAt ?? null);
  const progress = estimateProgress(elapsed);
  // Sin color explícito GenerationLoader usa `var(--accent)`, que sigue al tema.
  const accent   = accentColor;

  const remainingMs = POST_ESTIMATED_MS - elapsed;
  const eta = startedAt === undefined ? undefined
    : remainingMs > 0 ? t.progressEta(Math.ceil(remainingMs / 1000))
    : t.progressAlmost;

  if (mode === 'grid') return (
    <div data-testid="content-card-skeleton" className={styles.skeleton} aria-hidden={startedAt === undefined || undefined}>
      <div style={{
        width: '100%', aspectRatio: '1/1', background: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}>
        {startedAt !== undefined && (
          <GenerationLoader
            progress={progress}
            label={label}
            hint={eta}
            size={36}
            tone="surface"
            accentColor={accent}
          />
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div className={styles.skeletonBlock} style={{ height: 9, marginBottom: 6, width: '60%' }} />
        <div className={styles.skeletonBlock} style={{ height: 8, width: '80%' }} />
      </div>
    </div>
  );

  return (
    <div
      data-testid="content-card-skeleton"
      className={styles.skeleton}
      aria-hidden={startedAt === undefined || undefined}
      style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}
    >
      {/* 56px leaves no room for the bar — the ring alone marks the slot */}
      <div style={{
        width: 56, height: 56, borderRadius: 8, background: 'var(--border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {startedAt !== undefined && (
          <GenerationLoader
            progress={progress}
            size={24}
            tone="surface"
            showBar={false}
            showPercent={false}
            accentColor={accent}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.skeletonBlock} style={{ height: 10, marginBottom: 8, width: '55%' }} />
        {startedAt !== undefined ? (
          <GenerationLoader
            progress={progress}
            label={label}
            hint={eta}
            tone="surface"
            accentColor={accent}
            showSpinner={false}
            fullWidthBar
            size={24}
            style={{ alignItems: 'stretch', gap: 6 }}
          />
        ) : (
          <div className={styles.skeletonBlock} style={{ height: 9, width: '75%' }} />
        )}
      </div>
    </div>
  );
}

// ─── Progress of the generation in flight ────────────────────────────────────

function GenerationProgress({ startedAt, estimateMs, label, t, accentColor }: {
  startedAt:    number;
  estimateMs:   number;
  label:        string;
  t:            ContentCopy;
  accentColor?: string;
}) {
  const elapsed  = useElapsedMs(startedAt);
  const progress = estimateProgress(elapsed, estimateMs);
  const pct      = Math.round(progress * 100);
  const accent   = accentColor;
  const remainingMs = estimateMs - elapsed;
  const eta = remainingMs > 0 ? t.progressEta(Math.ceil(remainingMs / 1000)) : t.progressAlmost;

  return (
    <div className={styles.progress} data-testid="generation-progress">
      <div className={styles.progressRing} aria-hidden="true">
        <GenerationLoader progress={progress} size={28} tone="surface" showBar={false} showPercent={false} accentColor={accent} />
      </div>
      <div className={styles.progressBody}>
        <p className={styles.progressLabel}>{label}</p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% · ${eta}`}
        >
          <GenerationLoader
            progress={progress}
            hint={eta}
            tone="surface"
            showSpinner={false}
            fullWidthBar
            size={24}
            accentColor={accent}
            style={{ alignItems: 'stretch', gap: 6 }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Library Reference Grid (for reference images tab) ───────────────────────

function LibraryReferenceGrid({ lang, referenceImages, onToggle, t, common }: {
  lang: Locale;
  referenceImages: string[];
  onToggle: (url: string) => void;
  t: ContentCopy;
  common: CommonCopy;
}) {
  const [thumbs, setThumbs] = useState<{ id: string; url: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/content-library?limit=12&language=${lang}`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { items: Array<{ id: string; image_url: string | null }> };
        if (!cancelled) {
          setThumbs(data.items.filter((i) => i.image_url).map((i) => ({ id: i.id, url: i.image_url! })));
        }
      } catch { /* non-critical */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [lang]);

  if (!loaded) return <p className={styles.smallText} role="status">{common.actions.loading}</p>;
  if (thumbs.length === 0) return <p className={styles.smallText}>{t.referenceNoLibrary}</p>;

  return (
    <ReferenceThumbs thumbs={thumbs} referenceImages={referenceImages} onToggle={onToggle} t={t} />
  );
}

function ReferenceThumbs({ thumbs, referenceImages, onToggle, t }: {
  thumbs: { id: string; url: string }[];
  referenceImages: string[];
  onToggle: (url: string) => void;
  t: ContentCopy;
}) {
  const full = referenceImages.length >= 3;
  return (
    <div className={styles.refThumbs}>
      {thumbs.map((p, i) => {
        const selected = referenceImages.includes(p.url);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.url)}
            aria-pressed={selected}
            aria-label={t.referenceThumb(i + 1)}
            disabled={full && !selected}
            className={styles.refThumb}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" />
            {selected && (
              <span className={styles.refCheck} aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Content card (grid / list) ──────────────────────────────────────────────

function ContentCard({
  item, mode, lang, t, href, brandKit, perf, typeLabel, channelLabel, dateLabel,
  onView, onEdit, onDelete,
}: {
  item: ContentItem;
  mode: 'list' | 'grid';
  lang: Locale;
  t: ContentCopy;
  href: string;
  brandKit: BrandKitInfo | null;
  perf?: { impressions: number; likes: number };
  typeLabel: string;
  channelLabel: string;
  dateLabel: string;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const thumbUrl = thumbOf(item);
  // Carousel without images: gradient + title fallback
  const firstSlide = !thumbUrl && item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0
    ? (item.slides as CarouselSlide[])[0]
    : null;
  const carouselFallback = firstSlide
    ? { title: firstSlide.title ?? '', gradient: CAROUSEL_GRADIENTS[(Math.max(1, firstSlide.slide_order) - 1) % CAROUSEL_GRADIENTS.length] }
    : null;
  // Brand colours are the user's own choice; without a kit, the app accent.
  const placeholder = `linear-gradient(135deg, color-mix(in srgb, ${brandKit?.accent_color ?? 'var(--accent)'} 13%, transparent), color-mix(in srgb, ${brandKit?.primary_color ?? 'var(--muted)'} 6%, transparent))`;

  const text = excerpt(item.body ?? item.title ?? t.noText, 160) || t.noText;
  const actions = (
    <ContentActions
      lang={lang}
      size={mode === 'grid' ? 'sm' : 'md'}
      itemLabel={excerpt(text, 40)}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
  const typeBadge = (
    <span className={`ui-badge ${styles.typeBadge}`}>
      <Icon name={TYPE_ICON[item.content_type]} size={12} />
      {typeLabel}
    </span>
  );
  const date = <time className={styles.date} dateTime={item.created_at}>{dateLabel}</time>;
  const link = (
    <Link href={href} className={styles.cardLink}>
      <span className={styles.cardText}>{text}</span>
    </Link>
  );

  if (mode === 'grid') return (
    <article className={styles.card} data-testid="content-card">
      <div
        className={styles.gridThumb}
        style={{
          aspectRatio: item.content_type === 'reel' ? '3/4' : '4/5',
          background: (thumbUrl || carouselFallback) ? 'transparent' : placeholder,
        }}
      >
        {thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={thumbUrl} alt="" />
        ) : carouselFallback ? (
          <div className={styles.fallbackTitle} style={{ background: carouselFallback.gradient, padding: '10px 10px 34px' }}>
            <span style={{ fontSize: 12, lineHeight: 1.3, WebkitLineClamp: 3 }}>{carouselFallback.title}</span>
          </div>
        ) : (
          <Icon name={TYPE_ICON[item.content_type]} size={36} className={styles.fallbackIcon} />
        )}
        {item.mux_playback_id && <span className={styles.muxBadge}>MUX</span>}
        <StatusBadge
          status={item.status}
          lang={lang}
          style={{ position: 'absolute', bottom: 6, right: 6, background: 'var(--bg)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
        />
        {item.status === 'published' && perf && (
          <span className={styles.photoBadge} style={{ bottom: 6, left: 6 }}>
            <Icon name="eye" size={12} />
            {fmtCompact(perf.impressions)}
            <span className="sr-only"> {t.impressions}</span>
          </span>
        )}
      </div>
      <div className={styles.gridInfo}>
        <div className={styles.meta}>
          {typeBadge}
          {item.channel !== 'generic' && (
            <span className={styles.channelBadge} title={channelLabel}>
              <ChannelIcon name={item.channel} size={11} />
              <span className="sr-only">{channelLabel}</span>
            </span>
          )}
          {date}
        </div>
        {link}
      </div>
      <div className={styles.gridActions}>{actions}</div>
    </article>
  );

  return (
    <article className={`${styles.card} ${styles.row}`} data-testid="content-card">
      <div className={styles.rowThumb} style={{ background: thumbUrl ? 'transparent' : placeholder }}>
        {thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={thumbUrl} alt="" />
        ) : carouselFallback ? (
          <div className={styles.fallbackTitle} style={{ background: carouselFallback.gradient, padding: '4px 5px' }}>
            <span style={{ fontSize: 9, lineHeight: 1.25, WebkitLineClamp: 2 }}>{carouselFallback.title}</span>
          </div>
        ) : (
          <Icon name={TYPE_ICON[item.content_type]} size={22} className={styles.fallbackIcon} />
        )}
        {item.content_type === 'reel' && thumbUrl && (
          <span className={styles.rowPlay} aria-hidden="true"><Icon name="play" size={14} style={{ fill: 'currentColor' }} /></span>
        )}
        {item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0 && (
          <span className={styles.photoBadge} style={{ bottom: 2, right: 2, padding: '0 4px' }} aria-hidden="true">
            {item.slides.length}
          </span>
        )}
        {item.mux_playback_id && <span className={styles.muxBadge} style={{ top: 2, left: 2 }}>MUX</span>}
      </div>

      <div className={styles.rowBody}>
        <div className={styles.meta}>
          {typeBadge}
          {item.channel !== 'generic' && (
            <span className={styles.channelBadge}>
              <ChannelIcon name={item.channel} size={13} />
              {channelLabel}
            </span>
          )}
          <StatusBadge status={item.status} lang={lang} />
          {item.status === 'published' && perf && (
            <span className={styles.metrics}>
              <Icon name="eye" size={12} />{fmtCompact(perf.impressions)}<span className="sr-only"> {t.impressions}</span>
              <span aria-hidden="true">·</span>
              <Icon name="heart" size={12} />{fmtCompact(perf.likes)}<span className="sr-only"> {t.likes}</span>
            </span>
          )}
          {date}
        </div>
        {link}
      </div>

      <div className={styles.rowActions}>{actions}</div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ContentPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang = toLocale(rawLang);
  const t: ContentCopy = lang === 'en' ? enT : esT;
  const common: CommonCopy = lang === 'en' ? enCommon : esCommon;

  const CHANNELS = ALL_CHANNELS.map((c) =>
    c.value === 'generic' ? { ...c, label: t.channelGeneric } : c
  );
  const channelLabel = (value: string) => CHANNELS.find((c) => c.value === value)?.label ?? value;
  // En la lista, un reel se muestra como «Video», igual que en el selector.
  const listTypeLabel = (ct: ContentType) => (ct === 'reel' ? t.kindVideoLabel : t.typeLabels[ct]);

  const { confirm, dialog: confirmDialog } = useConfirm();

  // La marca activa vive en BrandContext (cookie httpOnly, actualizada por
  // BrandSwitcher). fetchItems debe depender de su id: si no, cambiar de marca
  // no dispara un refetch y la lista se queda con el contenido de la marca
  // anterior hasta que algo más (otro efecto) la refresque de casualidad.
  const { activeBrand } = useBrand();

  const [items, setItems]           = useState<ContentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [listError, setListError]   = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('');
  const [filterStatus, setFilterStatus]   = useState<ContentStatus | ''>('');
  const [brandKit, setBrandKit]     = useState<BrandKitInfo | null>(null);
  const [perfByContentId, setPerfByContentId] = useState<Map<string, { impressions: number; likes: number; engagement_rate: number }>>(new Map());
  const [viewMode, setViewMode]     = useState<'list' | 'grid'>('grid');

  // Generate form — pre-populate from ?topic=Y&type=Z (strategy page deep-link).
  // Channel/language/images are no longer user-controlled: content is
  // channel-agnostic (Zernio adapts per platform) and images are always-on.
  // Visibilidad del formulario: 'open'/'closed' cuando alguien lo decidió (un
  // enlace, un botón, generar); `null` = automático: abierto solo si la lista
  // está vacía. Se deriva en el render (ver `showGenerate`) para que no
  // aparezca un instante después del estado vacío.
  const [formPref, setFormPref] = useState<'open' | 'closed' | null>(() =>
    (searchParams?.get('topic') || searchParams?.get('refImage') || searchParams?.get('new') === '1') ? 'open' : null);
  const [genType, setGenType] = useState<ContentType>(() => parseType(searchParams?.get('type')));
  // Carrusel y story no tienen botón propio en el selector (se crean como
  // «Imagen»/«Video» y el formato exacto se elige al publicar), pero pueden
  // llegar sugeridos por un enlace, una recomendación o una idea: entonces se
  // añaden como tercera opción para que el selector diga la verdad.
  const [suggestedType, setSuggestedType] = useState<ContentType | null>(() => {
    const initial = parseType(searchParams?.get('type'));
    return initial === 'carousel' || initial === 'story' ? initial : null;
  });
  const [genTopic, setGenTopic]     = useState(() => searchParams?.get('topic') ?? '');
  const [genSlides, setGenSlides]   = useState(5);
  const [generating, setGenerating] = useState(false);
  const [run, setRun]               = useState<GenRun | null>(null);
  const runSeq = useRef(0);
  const [announcement, setAnnouncement] = useState('');
  const [keywordRulesCount, setKeywordRulesCount] = useState(0);
  const [ctaBannerDismissed, setCtaBannerDismissed] = useState(false);

  // ── Smart content recommendations (calendar-driven + AI fallback) ──────────
  const [recs, setRecs]               = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]     = useState<string | null>(null);
  const [recsOffset, setRecsOffset]   = useState(0);
  const [recsSource, setRecsSource]   = useState<RecSource | null>(null);
  const [recsMeta, setRecsMeta]       = useState<StrategyMeta | null>(null);
  const [recsHint, setRecsHint]       = useState('');
  const [recommendModalOpen, setRecommendModalOpen] = useState(false);

  // Reference images for AI-guided image generation — pre-populate from
  // ?refImage=Y (library page deep-link).
  const [referenceImages, setReferenceImages]   = useState<string[]>(() => {
    const refImage = searchParams?.get('refImage');
    return refImage ? [refImage] : [];
  });
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError]     = useState<string | null>(null);
  const [referenceSource, setReferenceSource]   = useState<'upload' | 'previous' | 'library'>('upload');
  const referenceInputRef = useRef<HTMLInputElement>(null);

  // Advanced config (slide/scene count, reference images) — open by default
  // when a reference image was deep-linked in, collapsed otherwise.
  const [advancedOpen, setAdvancedOpen] = useState(() => !!searchParams?.get('refImage'));

  // Modals
  const [editItem,     setEditItem]     = useState<ContentItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<ContentItem | null>(null);
  const [manualOpen,   setManualOpen]   = useState(false);
  const [libraryOpen,  setLibraryOpen]  = useState(false);

  // Track items whose cover image is being generated in background
  const [imagePending, setImagePending] = useState<Set<string>>(new Set());
  // When each in-flight creation started, so the progress bar survives the
  // handoff from the status block to the item's own card after a reload.
  const [imageStartedAt, setImageStartedAt] = useState<Record<string, number>>({});

  // Foco y scroll: se piden con un contador y se aplican en un efecto, cuando
  // lo que hay que enfocar ya está montado.
  const topicRef  = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [focusTopicReq, setFocusTopicReq]     = useState(0);
  const [revealStatusReq, setRevealStatusReq] = useState(0);
  useEffect(() => { if (focusTopicReq > 0) reveal(topicRef.current, { focus: true }); }, [focusTopicReq]);
  useEffect(() => { if (revealStatusReq > 0) reveal(statusRef.current, { block: 'nearest' }); }, [revealStatusReq]);

  const openGenerateForm = useCallback(() => {
    setFormPref('open');
    setFocusTopicReq((n) => n + 1);
  }, []);

  function hideGenerateForm() {
    // Solo se oculta: el tema, el tipo y las referencias se conservan.
    setFormPref('closed');
    requestAnimationFrame(() => document.getElementById('generate-open-btn')?.focus());
  }

  const isFiltered = !!filterChannel || !!filterStatus;
  // Sin contenido, el formulario es lo primero que hay que ver.
  const listIsEmpty = !loading && !listError && items.length === 0 && !isFiltered;
  const showGenerate = formPref === 'open' || (formPref === null && listIsEmpty);
  // Filtros y vista solo cuando hay algo que filtrar (o ya hay un filtro puesto).
  const showListTools = items.length > 0 || isFiltered;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterChannel) params.set('channel', filterChannel);
    if (filterStatus)  params.set('status', filterStatus);

    try {
      const res = await fetch(`/api/content?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { items: data } = await res.json() as { items?: ContentItem[] };
      setItems(data ?? []);
      setListError(null);
    } catch {
      setListError(common.errors.load);
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus, common.errors.load, setItems, setLoading, setListError]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // «Crear contenido» del sidebar enlaza aquí con ?new=1: abre el formulario y
  // enfoca el tema. Se quita el parámetro para que el mismo botón funcione
  // otra vez estando ya en esta página.
  const wantsNew = searchParams?.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    openGenerateForm();
    const rest = new URLSearchParams(searchParams?.toString() ?? '');
    rest.delete('new');
    const qs = rest.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [wantsNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar de marca activa (BrandSwitcher) actualiza la cookie httpOnly que
  // /api/content lee en el servidor, pero eso no dispara por sí solo un
  // refetch en el cliente: sin este efecto la lista se queda mostrando el
  // contenido de la marca anterior hasta que otra cosa (cambiar un filtro,
  // un evento `content` del asistente) refresque de casualidad.
  //
  // Cerrar los modales de ver/editar es tan importante como el refetch: si
  // quedaban abiertos sobre un item de la marca anterior (p. ej. un reel),
  // cambiar de marca refrescaba la lista de fondo (ya vacía, correcta) pero el
  // modal seguía mostrando ese reel encima — se veía como "el contenido de
  // esta marca (sin reels) muestra el reel de la otra marca", aunque los datos
  // en la base siempre estuvieron bien separados por brand_id. Lo mismo con el
  // resultado de la última generación, salvo que siga en curso.
  useEffect(() => {
    if (!activeBrand?.id) return;
    void fetchItems();
    setEditItem(null);
    setScheduleItem(null);
    setRun((prev) => (prev && (prev.stage === 'writing' || prev.image === 'pending') ? prev : null));
  }, [activeBrand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El asistente creó o editó contenido: se recarga la lista.
  useDataChanged(['content'], () => { void fetchItems(); });

  // Enlace profundo ?item=<id> (lo generan los enlaces del asistente): abre el
  // contenido en el modal de edición.
  const deepItemId = searchParams?.get('item') ?? null;
  useEffect(() => {
    if (!deepItemId) return;
    let cancelled = false;
    fetch(`/api/content/${encodeURIComponent(deepItemId)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { item?: ContentItem };
        if (!cancelled && data.item) setEditItem(data.item);
      })
      .catch(() => {/* non-critical */});
    return () => { cancelled = true; };
  }, [deepItemId]);

  const closeEditItem = useCallback(() => {
    setEditItem(null);
    // Se quita ?item= para que el modal no se reabra al recargar. Next
    // sincroniza history.replaceState con useSearchParams.
    if (searchParams?.get('item')) {
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete('item');
      const qs = rest.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { kit?: BrandKitInfo }) => {
        if (d.kit) setBrandKit(d.kit);
      })
      .catch(() => {/* non-critical */});
  }, []);

  // Métricas de los items ya publicados, para mostrar "cómo le está yendo"
  // directo en la tarjeta — sin esto, publicar era una puerta de un solo
  // sentido: no había forma de ver el resultado sin salir a Analíticas.
  useEffect(() => {
    fetch('/api/analytics/posts?limit=100', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { data?: Array<{ content: { id: string | null }; latest_metrics: { impressions: number; likes: number; engagement_rate: number } | null }> }) => {
        const map = new Map<string, { impressions: number; likes: number; engagement_rate: number }>();
        for (const row of d.data ?? []) {
          if (row.content.id && row.latest_metrics) map.set(row.content.id, row.latest_metrics);
        }
        setPerfByContentId(map);
      })
      .catch(() => {/* non-critical */});
  }, []);

  // Apply patches from EditContentModal (and the cover-image job) back into local state
  const handleItemUpdate = useCallback((id: string, patch: Partial<ContentItem>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
    setEditItem((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }, [setItems, setEditItem]);

  /** Portada de un post recién escrito: segunda petición, en segundo plano. */
  const generateCover = useCallback((runId: number, itemId: string, prompt: string, startedAt: number, refs: string[]) => {
    setImagePending((prev) => new Set(prev).add(itemId));
    setImageStartedAt((prev) => ({ ...prev, [itemId]: startedAt }));
    // fetchItems() ran before the image route flipped the row to
    // 'generating', so the freshly-fetched item still carries a stale
    // status — mark it locally so the poll fallback is armed too.
    handleItemUpdate(itemId, { image_status: 'generating' });

    const settle = (image: 'ready' | 'error', thumbUrl?: string) => {
      setRun((prev) => {
        if (!prev || prev.id !== runId || prev.itemIds[0] !== itemId) return prev;
        return { ...prev, image, thumbUrl: thumbUrl ?? prev.thumbUrl };
      });
    };

    fetch('/api/content/image', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size: '1024x1024', quality: 'medium', itemId, reference_image_urls: refs }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then(async (d: { image?: { url?: string } } | null) => {
        const imageUrl = d?.image?.url;
        if (!imageUrl) {
          handleItemUpdate(itemId, { image_status: 'error' });
          settle('error');
          return;
        }
        await preloadImage(imageUrl);
        handleItemUpdate(itemId, { image_url: imageUrl, image_status: 'ready' });
        settle('ready', imageUrl);
      })
      .catch(() => {
        // non-fatal: the result card offers a retry, and the editor an upload
        handleItemUpdate(itemId, { image_status: 'error' });
        settle('error');
      })
      .finally(() => {
        setImagePending((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
      });
  }, [handleItemUpdate]);

  // `opts` lets callers (e.g. the recommendation modal) trigger a generation
  // immediately with explicit values, without waiting for genTopic/genType
  // state to catch up via setState — avoids a stale-state click-and-wait.
  async function handleGenerate(
    e: React.FormEvent | null,
    opts?: { topic: string; type: ContentType; slides?: number; refs?: string[] },
  ) {
    e?.preventDefault();
    const topic  = opts?.topic ?? genTopic;
    const type   = opts?.type ?? genType;
    const slides = opts?.slides ?? genSlides;
    const refs   = opts?.refs ?? referenceImages;
    if (!topic.trim()) {
      openGenerateForm();
      return;
    }
    const runId = ++runSeq.current;
    const startedAt = Date.now();
    // Abierto «en automático» (lista vacía): se fija, para que no desaparezca
    // cuando la primera pieza llegue a la lista.
    setFormPref((prev) => prev ?? 'open');
    setRun({ id: runId, type, topic, slides, refs, startedAt, stage: 'writing', itemIds: [], image: 'none' });
    setAnnouncement(t.announceStart);
    setGenerating(true);
    setCtaBannerDismissed(false);

    try {
      let url = '/api/content/generate';
      const language: Locale = lang;
      // Note: channel is omitted on purpose — backend defaults to 'generic'
      // (Zernio adapts per platform at publish time). Images are always-on.
      let payload: Record<string, unknown> = {
        topic,
        language,
        save: true,
      };

      if (type === 'carousel') {
        url = '/api/content/carousel';
        payload = { topic, language, slide_count: slides, save: true };
      } else if (type === 'reel') {
        url = '/api/content/reel';
        // 2 variantes: se comparan directo en la lista (ambas quedan
        // guardadas, no hay picker aparte) en vez de forzar a elegir a ciegas
        // con una sola opción generada.
        payload = { topic, language, scene_count: slides, variant_count: 2, reference_image_urls: refs };
      } else if (type === 'story') {
        url = '/api/content/story';
        payload = { topic, language, save: true };
      }

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error(common.errors.network);
      }
      // `/api/content/generate` devuelve el texto dentro de `result`, no en la
      // raíz. Se aceptan ambas formas por si otra ruta responde plano.
      const data = await res.json().catch(() => ({})) as {
        itemId?: string;
        result?: { body?: string; hashtags?: string[] };
        body?: string; hook?: string; description?: string; hashtags?: string[];
        slides?: CarouselSlide[]; scenes?: ReelScene[]; image_url?: string | null; error?: string;
        // /api/content/reel con variant_count > 1: cada variante es su propio
        // item ya guardado (ver lib/services/reel.ts) — no hay nada más que
        // "elegir" desde acá, fetchItems() más abajo las trae a la lista.
        variants?: Array<{ itemId?: string; scenes?: ReelScene[]; hook?: string }>;
        requested_variant_count?: number;
      };
      if (!res.ok) throw new Error(data.error || t.errorGenerate);

      let itemIds: string[] = data.itemId ? [data.itemId] : [];
      let resultExcerpt: string | undefined;
      let count: number | undefined;
      let thumbUrl: string | null = null;
      if (type === 'post') {
        resultExcerpt = data.result?.body ?? data.body;
      } else if (type === 'carousel') {
        count = (data.slides ?? []).length;
        resultExcerpt = data.description ?? data.slides?.[0]?.title;
        thumbUrl = data.slides?.[0]?.image_url ?? null;
      } else if (type === 'reel') {
        if (data.variants) {
          itemIds = data.variants.map((v) => v.itemId).filter((id): id is string => !!id);
          resultExcerpt = data.variants[0]?.hook ?? data.variants[0]?.scenes?.[0]?.title;
          thumbUrl = data.variants[0]?.scenes?.[0]?.image_url ?? null;
        } else {
          count = (data.scenes ?? []).length;
          resultExcerpt = data.hook ?? data.scenes?.[0]?.title;
          thumbUrl = data.scenes?.[0]?.image_url ?? null;
        }
      } else {
        resultExcerpt = data.body;
        thumbUrl = data.image_url ?? null;
      }

      // For posts the cover image is a second, background request. Mark the
      // item as pending *before* the list refetch, so it never flashes as a
      // finished card with an empty thumbnail.
      const coverItemId = type === 'post' ? itemIds[0] : undefined;
      if (coverItemId) {
        setImagePending((prev) => new Set(prev).add(coverItemId));
        setImageStartedAt((prev) => ({ ...prev, [coverItemId]: startedAt }));
      }

      // Check for active keyword rules to show the leads CTA
      fetch('/api/automations/engagement/rules?limit=200', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { rules: [] })
        .then((d: { rules?: Array<{ trigger_type: string; is_active: boolean }> }) => {
          const n = (d.rules ?? []).filter(r => r.trigger_type === 'comment_contains_keyword' && r.is_active).length;
          setKeywordRulesCount(n);
        })
        .catch(() => {});

      await fetchItems();

      const imagePrompt = (data.body ?? topic).slice(0, 900);
      setRun((prev) => (prev?.id !== runId ? prev : {
        ...prev,
        stage: 'ready',
        itemIds,
        excerpt: resultExcerpt,
        count,
        thumbUrl,
        image: coverItemId ? 'pending' : 'none',
        imagePrompt,
      }));
      if (!coverItemId) {
        setAnnouncement(itemIds.length > 1 ? t.resultVariantsTitle(itemIds.length) : t.resultTitles[type]);
      }

      // For posts: kick off background image generation so the user sees the image
      // appear without needing to open the editor manually.
      if (coverItemId) generateCover(runId, coverItemId, imagePrompt, startedAt, refs);

      // Clear form so user can start a new generation immediately
      setGenTopic('');
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t.errorUnknown;
      setRun((prev) => (prev?.id !== runId ? prev : { ...prev, stage: 'error', error: message }));
    } finally {
      setGenerating(false);
    }
  }

  // Aviso a lectores de pantalla cuando termina la portada.
  useEffect(() => {
    if (!run || run.stage !== 'ready' || run.type !== 'post') return;
    if (run.image === 'ready') setAnnouncement(t.resultTitles.post);
    if (run.image === 'error') setAnnouncement(`${t.resultTitles.post}. ${t.imageFailed}`);
  }, [run?.image]); // eslint-disable-line react-hooks/exhaustive-deps

  function retryGeneration() {
    if (!run) return;
    setRevealStatusReq((n) => n + 1);
    void handleGenerate(null, { topic: run.topic, type: run.type, slides: run.slides, refs: run.refs });
  }

  function retryCover() {
    if (!run || run.type !== 'post' || !run.itemIds[0]) return;
    const startedAt = Date.now();
    setRun({ ...run, image: 'pending', startedAt });
    generateCover(run.id, run.itemIds[0], run.imagePrompt ?? run.topic, startedAt, run.refs);
  }

  function createAnother() {
    setRun(null);
    openGenerateForm();
  }

  async function openSchedule(id: string) {
    const known = items.find((i) => i.id === id);
    if (known) { setScheduleItem(known); return; }
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(id)}`, { credentials: 'include' });
      const data = await res.json() as { item?: ContentItem };
      if (res.ok && data.item) setScheduleItem(data.item);
    } catch { /* the detail page is still one click away */ }
  }

  // ─── Smart recommendations ────────────────────────────────────────────────
  const fetchRecommendations = useCallback(async (offset: number, hint: string) => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        lang,
      });
      const trimmedHint = hint.trim();
      if (trimmedHint.length > 0) params.set('hint', trimmedHint.slice(0, 500));
      const res  = await fetch(`/api/content/recommend?${params}`, { credentials: 'include' });
      const data = await res.json() as {
        recommendations?: Recommendation[];
        source?:          RecSource;
        strategy_meta?:   StrategyMeta | null;
        error?:           string;
      };
      if (!res.ok) throw new Error(data.error ?? t.recommendError);
      setRecs(data.recommendations ?? []);
      setRecsSource(data.source ?? null);
      setRecsMeta(data.strategy_meta ?? null);
    } catch (err) {
      setRecsError(err instanceof Error ? err.message : t.recommendError);
      setRecs([]);
    } finally {
      setRecsLoading(false);
    }
  }, [lang, t.recommendError]);

  function handleRecommendClick() {
    setRecommendModalOpen(true);
    setRecsOffset(0);
    fetchRecommendations(0, recsHint);
  }

  function handleSearchRecommendations() {
    setRecsOffset(0);
    fetchRecommendations(0, recsHint);
  }

  function handleRotateRecommendations() {
    const next = recsOffset + 3;
    setRecsOffset(next);
    fetchRecommendations(next, recsHint);
  }

  function applyType(type: ContentType) {
    setGenType(type);
    if (type === 'carousel' || type === 'story') setSuggestedType(type);
  }

  // Picking a recommendation card generates it immediately — no extra click.
  function handleSelectRecommendation(r: Recommendation) {
    const slides = r.content_type === 'carousel' && r.slide_count
      ? Math.min(10, Math.max(3, r.slide_count))
      : 5;

    setFormPref('open');
    applyType(r.content_type);
    setGenTopic(r.topic);
    setGenSlides(slides);
    setRecommendModalOpen(false);
    // The modal disappears and the status block (progress, then the result)
    // is where the user has to look — scroll it into view.
    setRevealStatusReq((n) => n + 1);

    void handleGenerate(null, { topic: r.topic, type: r.content_type, slides });
  }

  function handleSelectLibraryItem(item: LibraryItemWithIndustry) {
    setFormPref('open');
    applyType(item.content_type);
    setGenTopic(item.title);
    setLibraryOpen(false);

    let refs = referenceImages;
    if (item.image_url && !refs.includes(item.image_url)) {
      refs = [...refs, item.image_url].slice(0, 3);
      setReferenceImages(refs);
      setAdvancedOpen(true);
    }

    setRevealStatusReq((n) => n + 1);
    // The idea's image goes as a reference in this very generation (before,
    // the stale state only included it from the next one).
    void handleGenerate(null, { topic: item.title, type: item.content_type, refs });
  }

  async function handleReferenceImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setReferenceUploading(true);
    setReferenceError(null);
    try {
      const urls: string[] = [];
      let failed = false;
      for (const file of files.slice(0, 3 - referenceImages.length)) {
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res  = await fetch('/api/content/upload-reference', { method: 'POST', credentials: 'include', body: fd });
          const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
          if (res.ok && data.url) urls.push(data.url);
          else failed = true;
        } catch {
          failed = true;
        }
      }
      setReferenceImages((prev) => [...prev, ...urls].slice(0, 3));
      if (failed) setReferenceError(t.referenceUploadError);
    } finally {
      setReferenceUploading(false);
      e.target.value = '';
    }
  }

  function togglePreviousPostReference(url: string) {
    setReferenceImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : (prev.length < 3 ? [...prev, url] : prev),
    );
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: t.deleteConfirmTitle,
      message: common.confirm.irreversible,
      confirmLabel: common.actions.delete,
      cancelLabel: common.actions.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/content/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setEditItem((prev) => (prev?.id === id ? null : prev));
      setRun((prev) => (prev?.itemIds.includes(id) ? null : prev));
      setListError(null);
    } catch {
      setListError(t.errorDelete);
    }
  }

  // Cover-image generation is a background job on the server (can take
  // several minutes) — `imagePending` only covers the same-tab, same-load
  // window where handleGenerate's fetch is still in flight. If the user
  // reloads or comes back later, the item's own `image_status` (persisted
  // in the DB) is the only remaining signal, so poll it until it settles.
  useEffect(() => {
    const pending = items.filter((i) => i.image_status === 'generating');
    if (pending.length === 0) return;

    // Give up on generations that can no longer be in flight (serverless
    // timeout, tab closed mid-request) — otherwise their cards would stay in
    // the loading state forever, with no way to edit or delete them.
    const stale = pending.filter((i) => Date.now() - new Date(i.created_at).getTime() > IMAGE_PENDING_MAX_MS);
    stale.forEach((i) => handleItemUpdate(i.id, { image_status: 'error' }));

    const pendingIds = pending.filter((i) => !stale.includes(i)).map((i) => i.id);
    if (pendingIds.length === 0) return;
    const interval = setInterval(() => {
      pendingIds.forEach((id) => {
        fetch(`/api/content/${id}`, { credentials: 'include' })
          .then((r) => r.ok ? r.json() : null)
          .then(async (d: { item?: ContentItem } | null) => {
            if (!d?.item || d.item.image_status === 'generating') return;
            const { image_url, image_status } = d.item;
            if (image_url) await preloadImage(image_url);
            handleItemUpdate(id, { image_url, image_status });
          })
          .catch(() => {/* retry on next tick */});
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [items, handleItemUpdate]);

  // Blurb explaining where the current recommendations came from
  const recsSourceText = (() => {
    if (!recsSource) return '';
    if ((recsSource === 'strategy' || recsSource === 'industry_fallback') && recsMeta) {
      return t.recommendSourceStrategy(recsMeta.framework_name, recsMeta.kpi_primary, recsMeta.current_week, recsMeta.total_weeks);
    }
    if (recsSource === 'ai_only') return t.recommendSourceAI;
    return '';
  })();

  // Thumbnails of previous posts with an image, offered as reference-photo picks
  const previousPostThumbs = items
    .map((it) => {
      const url = thumbOf(it);
      return url ? { id: it.id, url } : null;
    })
    .filter((x): x is { id: string; url: string } => !!x)
    .slice(0, 12);

  // Content kind selector — image vs. video; carousel/story appear only when
  // suggested (see `suggestedType`). The exact publish format is picked later.
  const kindOptions: { value: ContentType; label: string; icon: IconName }[] = [
    { value: 'post', label: t.kindImageLabel, icon: 'image' },
    { value: 'reel', label: t.kindVideoLabel, icon: 'video' },
    ...(suggestedType
      ? [{ value: suggestedType, label: suggestedType === 'carousel' ? t.kindCarouselLabel : t.kindStoryLabel, icon: TYPE_ICON[suggestedType] }]
      : []),
  ];

  const topicPlaceholder =
    genType === 'reel' ? t.topicPlaceholderReel
    : genType === 'carousel' ? t.topicPlaceholderCarousel
    : genType === 'story' ? t.topicPlaceholderStory
    : t.topicPlaceholderPost;

  // References guide the post's cover and the reel's scenes; the carousel and
  // story routes don't take them, so they're not offered there.
  const acceptsReferences = genType === 'post' || genType === 'reel';
  const hasAdvanced = genType === 'post' || genType === 'carousel' || genType === 'reel';
  const detailHref = (id: string) => `/${lang}/dashboard/content/${id}`;
  const accentColor = brandKit?.accent_color ?? undefined;

  // ── Status block: progress, error or result — the only feedback place ─────
  function renderStatus() {
    if (!run) return null;

    if (run.stage === 'writing' || (run.stage === 'ready' && run.image === 'pending')) {
      const label = run.stage === 'ready' ? t.progressImage
        : run.type === 'carousel' ? t.progressCarousel
        : run.type === 'reel' ? t.progressReel
        : run.type === 'story' ? t.progressStory
        : t.progressWriting;
      return (
        <GenerationProgress
          startedAt={run.startedAt}
          estimateMs={creationEstimateMs(run.type)}
          label={label}
          t={t}
          accentColor={accentColor}
        />
      );
    }

    if (run.stage === 'error') {
      return (
        <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
          <p style={{ margin: 0, fontWeight: 600 }}>{t.errorGenerate}</p>
          {run.error && run.error !== t.errorGenerate && <p style={{ margin: '2px 0 0' }}>{run.error}</p>}
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={retryGeneration}>
              {common.actions.retry}
            </Button>
          </div>
        </Notice>
      );
    }

    const isVariants = run.itemIds.length > 1;
    const primaryId = run.itemIds[0];
    const primaryItem = primaryId ? items.find((i) => i.id === primaryId) : undefined;
    const thumb = (primaryItem && thumbOf(primaryItem)) || run.thumbUrl || null;
    const title = isVariants ? t.resultVariantsTitle(run.itemIds.length) : t.resultTitles[run.type];
    const meta = [
      run.count ? (run.type === 'carousel' ? t.resultSlides(run.count) : t.resultScenes(run.count)) : null,
      isVariants ? t.resultVariantsHint : t.resultSaved,
    ].filter(Boolean).join(' · ');

    return (
      <section className={`ui-card ${styles.result}`} aria-labelledby="gen-result-title" data-testid="generation-result">
        <div className={styles.resultMain}>
          <div className={styles.resultThumb}>
            {thumb
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={thumb} alt="" />
              : <Icon name={TYPE_ICON[run.type]} size={28} />}
          </div>
          <div className={styles.resultText}>
            <h2 id="gen-result-title" className={styles.resultTitle}>
              <Icon name="check-circle" size={18} />
              {title}
            </h2>
            <p className={styles.resultMeta}>{meta}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={common.actions.close}
            icon={<Icon name="close" size={16} />}
            onClick={() => setRun(null)}
          />
        </div>
        {run.excerpt && <p className={styles.resultExcerpt}>{run.excerpt}</p>}

        {run.image === 'error' && (
          <Notice tone="warning" icon={<Icon name="image" size={16} />}>
            <div className={styles.noticeRow}>
              <span>{t.imageFailed}</span>
              <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={retryCover}>
                {t.retryImage}
              </Button>
            </div>
          </Notice>
        )}

        <div className={styles.resultActions}>
          {isVariants ? (
            run.itemIds.map((id, i) => (
              <ButtonLink
                key={id}
                href={detailHref(id)}
                variant={i === 0 ? 'primary' : 'secondary'}
                icon={<Icon name="play" size={16} />}
              >
                {t.reviewVariant(i + 1)}
              </ButtonLink>
            ))
          ) : primaryId ? (
            <>
              <ButtonLink href={detailHref(primaryId)} variant="primary" icon={<Icon name="send" size={16} />}>
                {t.reviewPublish}
              </ButtonLink>
              <Button variant="secondary" icon={<Icon name="calendar" size={16} />} onClick={() => void openSchedule(primaryId)}>
                {t.scheduleBtn}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" icon={<Icon name="plus" size={16} />} onClick={createAnother}>
            {t.createAnother}
          </Button>
        </div>

        {keywordRulesCount > 0 && !ctaBannerDismissed && (
          <Notice tone="accent" icon={<Icon name="target" size={16} />}>
            <div className={styles.dismissRow}>
              <span>
                {t.leadsCta(keywordRulesCount)}{' '}
                <Link href={`/${lang}/dashboard/automations/leads`} className={styles.inlineLink}>{t.leadsCtaLink}</Link>
              </span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t.leadsCtaDismiss}
                icon={<Icon name="close" size={14} />}
                onClick={() => setCtaBannerDismissed(true)}
              />
            </div>
          </Notice>
        )}
      </section>
    );
  }

  // ── List body ───────────────────────────────────────────────────────────────
  function renderList() {
    if (items.length === 0) {
      // Primera pieza en camino: el bloque de estado ya informa, aquí basta
      // con decir dónde aparecerá (sin una tanda de esqueletos debajo).
      const firstInFlight = !!run && (run.stage === 'writing' || run.image === 'pending') && !isFiltered;
      if (loading && !firstInFlight) {
        return (
          <div className={viewMode === 'grid' ? styles.grid : styles.list} aria-busy="true">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} mode={viewMode} t={t} />)}
          </div>
        );
      }
      if (listError) return null;
      if (firstInFlight) {
        return <EmptyState compact icon={<Icon name="sparkles" size={24} />} title={t.noContentGenerating} />;
      }
      if (isFiltered) {
        return (
          <EmptyState
            icon={<Icon name="filter" size={28} />}
            title={t.noResults}
            hint={t.noResultsHint}
            action={
              <Button variant="secondary" onClick={() => { setFilterChannel(''); setFilterStatus(''); }}>
                {t.clearFilters}
              </Button>
            }
          />
        );
      }
      return (
        <EmptyState
          icon={<Icon name="content" size={32} />}
          title={t.noContent}
          hint={t.noContentHint}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" icon={<Icon name="sparkles" size={16} />} onClick={openGenerateForm}>
                {t.noContentAction}
              </Button>
              <Button variant="secondary" icon={<Icon name="edit" size={16} />} onClick={() => setManualOpen(true)}>
                {t.manualBtn}
              </Button>
            </div>
          }
        />
      );
    }

    return (
      <div
        className={`${viewMode === 'grid' ? styles.grid : styles.list}${loading ? ` ${styles.busy}` : ''}`}
        aria-busy={loading || undefined}
      >
        {items.map((item) => {
          const hasThumb = !!thumbOf(item)
            || (item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0);

          // Cover image still on its way: keep the whole card in its
          // loading state rather than showing text next to an empty
          // thumbnail. `image_url` is only set once the file is preloaded,
          // so the swap to the real card never flashes a blank image.
          const waitingForImage =
            !hasThumb
            && (imagePending.has(item.id) || item.image_status === 'generating')
            && Date.now() - new Date(item.created_at).getTime() < IMAGE_PENDING_MAX_MS;

          if (waitingForImage) {
            // The item being generated right now reports its progress in the
            // status block: here it only holds its place.
            const tracked = run?.image === 'pending' && run.itemIds.includes(item.id);
            return tracked
              ? <SkeletonCard key={item.id} mode={viewMode} t={t} />
              : (
                <SkeletonCard
                  key={item.id}
                  mode={viewMode}
                  t={t}
                  startedAt={imageStartedAt[item.id] ?? new Date(item.created_at).getTime()}
                  accentColor={accentColor}
                  label={t.progressImage}
                />
              );
          }

          const perf = perfByContentId.get(item.id);
          return (
            <ContentCard
              key={item.id}
              item={item}
              mode={viewMode}
              lang={lang}
              t={t}
              href={detailHref(item.id)}
              brandKit={brandKit}
              perf={perf}
              typeLabel={listTypeLabel(item.content_type)}
              channelLabel={channelLabel(item.channel)}
              dateLabel={new Date(item.created_at).toLocaleDateString(t.dateLocale, { day: '2-digit', month: 'short' })}
              onView={() => router.push(detailHref(item.id))}
              onEdit={() => setEditItem(item)}
              onDelete={() => void handleDelete(item.id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="page page--wide">
      {/* Anuncios para lectores de pantalla (inicio y fin de la generación). */}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <Button variant="secondary" icon={<Icon name="edit" size={16} />} onClick={() => setManualOpen(true)}>
            {t.manualBtn}
          </Button>
          <Button
            id="generate-open-btn"
            variant="primary"
            icon={<Icon name="sparkles" size={16} />}
            onClick={openGenerateForm}
            aria-controls={showGenerate ? 'generate-panel' : undefined}
          >
            {t.generateBtn}
          </Button>
        </div>
      </header>

      {/* ── Generate form ─────────────────────────────────────────────── */}
      {showGenerate && (
        <section id="generate-panel" className={`ui-card ${styles.panel}`} aria-labelledby="generate-title">
          <div className="ui-card-head">
            <h2 id="generate-title" className="ui-card-title">{t.generateFormTitle}</h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon name="chevron-up" size={16} />}
              className={styles.hideBtn}
              onClick={hideGenerateForm}
              aria-label={t.hideFormLabel}
              title={t.hideFormLabel}
            >
              {t.hideFormBtn}
            </Button>
          </div>

          <form onSubmit={handleGenerate} className={styles.form}>
            {/* Content kind — image vs. video (plus the suggested format, if any) */}
            <div className="ui-field">
              <span id="gen-kind-label" className="ui-label">{t.typeLabel}</span>
              <div role="group" aria-labelledby="gen-kind-label" className={styles.kindOptions}>
                {kindOptions.map((ck) => (
                  <button
                    key={ck.value}
                    type="button"
                    aria-pressed={genType === ck.value}
                    onClick={() => setGenType(ck.value)}
                    className={styles.kindOption}
                  >
                    <Icon name={ck.icon} size={16} />
                    {ck.label}
                  </button>
                ))}
              </div>
              <p className="ui-hint">{t.kindHint}</p>
            </div>

            {/* Topic — the one field; ideas are secondary helpers next to it */}
            <div>
              <Field label={t.topicLabel} id="gen-topic-textarea" required>
                <Textarea
                  ref={topicRef}
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder={topicPlaceholder}
                  rows={3}
                  required
                />
              </Field>
              <div className={styles.topicHelpers}>
                <span className={styles.topicHelpersLabel}>{t.topicHelpersLabel}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon name="sparkles" size={14} />}
                  onClick={handleRecommendClick}
                  loading={recsLoading}
                  aria-haspopup="dialog"
                >
                  {t.recommendInlineBtn}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon name="library" size={14} />}
                  onClick={() => setLibraryOpen(true)}
                  aria-haspopup="dialog"
                >
                  {t.libraryBtn}
                </Button>
              </div>
            </div>

            {/* Advanced config — slide/scene count + reference images */}
            {hasAdvanced && (
              <>
                <button
                  type="button"
                  className={styles.advancedToggle}
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                  aria-controls="gen-advanced"
                >
                  <Icon name="settings" size={16} />
                  {t.advancedConfigShow}
                  <Icon name="chevron-down" size={16} className={styles.chevron} />
                </button>

                {advancedOpen && (
                  <div id="gen-advanced" className={styles.advanced}>
                    {/* Slides / Scenes count — only for carousel/reel, which have multiple frames */}
                    {(genType === 'carousel' || genType === 'reel') && (
                      <div className="ui-field">
                        <label htmlFor="gen-slides" className="ui-label">
                          {genType === 'carousel' ? t.slidesLabel : t.scenesLabel}
                          <output htmlFor="gen-slides" className={styles.rangeValue}>{genSlides}</output>
                        </label>
                        <input
                          id="gen-slides"
                          type="range"
                          min={3}
                          max={genType === 'reel' ? 8 : 10}
                          value={genSlides}
                          onChange={(e) => setGenSlides(Number(e.target.value))}
                          className={styles.range}
                        />
                        <div className={styles.rangeScale} aria-hidden="true">
                          <span>3</span>
                          <span>{genType === 'reel' ? 8 : 10}</span>
                        </div>
                      </div>
                    )}

                    {/* Reference images — upload or pick from a previous post */}
                    {acceptsReferences && (
                      <div className={styles.refGroup} role="group" aria-labelledby="gen-refs-label">
                        <div>
                          <p id="gen-refs-label" className="ui-label" style={{ margin: 0 }}>{t.referenceImagesLabel}</p>
                          <p className="ui-hint">{t.referenceImagesHint}</p>
                        </div>

                        {referenceImages.length > 0 && (
                          <ul className={styles.refList}>
                            {referenceImages.map((url, i) => (
                              <li key={url} className={styles.refItem}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={t.referenceAlt(i + 1)} />
                                <button
                                  type="button"
                                  className={styles.refRemove}
                                  onClick={() => setReferenceImages((p) => p.filter((_, j) => j !== i))}
                                  aria-label={t.referenceRemove(i + 1)}
                                >
                                  <span className={styles.refRemoveDot}><Icon name="close" size={12} strokeWidth={2.5} /></span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="ui-segmented" role="group" aria-label={t.referenceSourceLabel}>
                          {(['upload', 'previous', 'library'] as const).map((src) => (
                            <button
                              key={src}
                              type="button"
                              aria-pressed={referenceSource === src}
                              onClick={() => setReferenceSource(src)}
                            >
                              {src === 'upload' ? t.referenceTabUpload : src === 'previous' ? t.referenceTabPrevious : t.referenceTabLibrary}
                            </button>
                          ))}
                        </div>

                        {referenceImages.length >= 3 && <p className={styles.smallText}>{t.referenceMax}</p>}

                        {referenceSource === 'upload' ? (
                          referenceImages.length < 3 && (
                            <div>
                              <button
                                type="button"
                                className={styles.refUpload}
                                onClick={() => referenceInputRef.current?.click()}
                                disabled={referenceUploading}
                                aria-label={referenceUploading ? t.referenceUploading : t.referenceUploadBtn}
                                aria-busy={referenceUploading || undefined}
                              >
                                <Icon name={referenceUploading ? 'clock' : 'upload'} size={20} />
                              </button>
                              <input
                                ref={referenceInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                hidden
                                tabIndex={-1}
                                disabled={referenceUploading}
                                onChange={handleReferenceImageUpload}
                              />
                            </div>
                          )
                        ) : referenceSource === 'previous' ? (
                          previousPostThumbs.length === 0 ? (
                            <p className={styles.smallText}>{t.referenceNoPrevious}</p>
                          ) : (
                            <ReferenceThumbs
                              thumbs={previousPostThumbs}
                              referenceImages={referenceImages}
                              onToggle={togglePreviousPostReference}
                              t={t}
                            />
                          )
                        ) : (
                          <LibraryReferenceGrid
                            lang={lang}
                            referenceImages={referenceImages}
                            onToggle={togglePreviousPostReference}
                            t={t}
                            common={common}
                          />
                        )}

                        {referenceError && <Notice tone="danger">{referenceError}</Notice>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={generating}
                icon={<Icon name="sparkles" size={16} />}
                className={styles.submit}
              >
                {generating ? t.generating : t.generateType(t.typeLabels[genType])}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* ── Generation status: progress, then the result and its next step ── */}
      {run && (
        <div ref={statusRef} className={styles.status}>
          {renderStatus()}
        </div>
      )}

      {/* ── My content ────────────────────────────────────────────────── */}
      <section aria-labelledby="my-content-title">
        <div className={styles.listHead}>
          <h2 id="my-content-title" className={styles.listTitle}>{t.listTitle}</h2>
          {showListTools && (
            <>
              <div role="group" aria-label={t.viewModeLabel} className={styles.viewToggle}>
                {(['list', 'grid'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    aria-label={mode === 'list' ? t.viewList : t.viewGrid}
                    title={mode === 'list' ? t.viewList : t.viewGrid}
                    className={styles.viewBtn}
                  >
                    <Icon name={mode === 'list' ? 'menu' : 'content'} size={16} />
                  </button>
                ))}
              </div>
              <div className={styles.listTools}>
                <Select
                  aria-label={t.filterChannelLabel}
                  className={styles.filter}
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value as Channel | '')}
                >
                  <option value="">{t.allChannels}</option>
                  {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
                <Select
                  aria-label={t.filterStatusLabel}
                  className={styles.filter}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ContentStatus | '')}
                >
                  <option value="">{t.allStatuses}</option>
                  {CONTENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{common.status[s]}</option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </div>

        {listError && (
          <div style={{ marginBottom: 16 }}>
            <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
              <div className={styles.noticeRow}>
                <span>{listError}</span>
                <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => void fetchItems()}>
                  {common.actions.retry}
                </Button>
              </div>
            </Notice>
          </div>
        )}

        {renderList()}
      </section>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <EditContentModal
        open={!!editItem}
        onClose={closeEditItem}
        item={editItem}
        brandKit={brandKit ?? undefined}
        lang={lang}
        onUpdate={(patch) => {
          if (editItem) handleItemUpdate(editItem.id, patch as Partial<ContentItem>);
        }}
      />

      <ScheduleModal
        open={!!scheduleItem}
        onClose={() => setScheduleItem(null)}
        initialItem={scheduleItem}
        brandKit={brandKit}
        lang={lang}
        onSuccess={() => { void fetchItems(); }}
      />

      <ManualCreateModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        lang={lang}
        onCreated={(item) => {
          setItems((prev) => [item as ContentItem, ...prev]);
          setManualOpen(false);
        }}
      />

      <RecommendModal
        open={recommendModalOpen}
        onClose={() => setRecommendModalOpen(false)}
        lang={lang}
        recs={recs}
        loading={recsLoading}
        error={recsError}
        sourceText={recsSourceText}
        onSelect={handleSelectRecommendation}
        onRotate={handleRotateRecommendations}
        hint={recsHint}
        onHintChange={setRecsHint}
        onSearch={handleSearchRecommendations}
      />

      <ContentLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        lang={lang}
        onSelect={handleSelectLibraryItem}
      />

      {confirmDialog}
    </div>
  );
}

export default function ContentPage() {
  const { lang } = useParams<{ lang: string }>();
  const common = toLocale(lang) === 'en' ? enCommon : esCommon;
  return (
    <Suspense fallback={<div className="page" role="status" style={{ color: 'var(--muted)', fontSize: 14 }}>{common.actions.loading}</div>}>
      <ContentPageInner />
    </Suspense>
  );
}
