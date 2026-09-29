'use client';

// ─── Vista de detalle de un contenido ────────────────────────────────────────
//
// Antes "ver contenido" solo existía como el modal de publicar (ContentActions
// → onView → ScheduleModal) — no había una URL propia, permanente, para un
// item puntual. Esta página cubre eso: /dashboard/content/<id>.
//
// Se comporta distinto según el estado:
//   - No publicado (draft/approved/scheduled/archived): se puede seguir
//     editando y publicando — mismos modales que ya existían.
//   - Publicado: de solo lectura (nada de editar un post que ya salió) más
//     sus estadísticas reales, y un atajo para generar contenido nuevo con el
//     mismo tema ("crear uno similar").

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { NetworkPreview, NET_LABEL } from '@/components/dashboard/NetworkPreview';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button, { ButtonLink } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon, { type IconName } from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toLocale } from '@/lib/i18n';
import ScheduleModal from '@/components/dashboard/content/ScheduleModal';
import EditContentModal from '@/components/dashboard/content/EditContentModal';
import type { ContentItem, ContentType, CarouselSlide, ReelScene, BrandKitInfo } from '@/types/content';
import esT from '@/locales/es/dashboard/content-detail';
import enT from '@/locales/en/dashboard/content-detail';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './page.module.css';

const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => null },
);

const T = { es: esT, en: enT } as const;
const COMMON = { es: esCommon, en: enCommon } as const;
const PUBLISH = { es: esPublish, en: enPublish } as const;

const FORMAT_ICONS: Record<ContentType, IconName> = { post: 'post', carousel: 'carousel', reel: 'video', story: 'story' };

/** Alto máximo de la vista previa vertical (reel, story, TikTok). Lo fija
 *  page.module.css: `min(640px, 75dvh)` en escritorio y 55dvh en el móvil,
 *  para que «Publicar» no quede una pantalla y media más abajo. */
const PREVIEW_MAX_H = 'var(--preview-max-h)';

interface PerformanceEntry {
  scheduled_post_id: string;
  platform: string | null;
  published_at: string | null;
  latest_metrics: {
    measured_at: string; impressions: number; reach: number; likes: number;
    comments: number; shares: number; clicks: number; saves: number; engagement_rate: number;
  } | null;
}

export default function ContentDetailPage() {
  const { lang, itemId } = useParams<{ lang: string; itemId: string }>();
  const router = useRouter();
  const locale = toLocale(lang);
  const t = T[locale];
  const common = COMMON[locale];
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const { confirm, dialog } = useConfirm();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKitInfo | null>(null);
  const [performance, setPerformance] = useState<PerformanceEntry[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** `silent`: recarga sin volver al esqueleto (tras publicar, con el modal
   *  mostrando el resultado encima). */
  const fetchItem = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    fetch(`/api/content/${encodeURIComponent(itemId)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { if (!silent) setNotFound(true); return; }
        const data = await res.json() as { item?: ContentItem };
        if (data.item) setItem(data.item); else if (!silent) setNotFound(true);
      })
      .catch(() => { if (!silent) setNotFound(true); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [itemId]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { kit?: BrandKitInfo }) => { if (d.kit) setBrandKit(d.kit); })
      .catch(() => {/* non-critical */});
  }, []);

  const fetchPerformance = useCallback((id: string) => {
    fetch(`/api/analytics/posts?content_id=${encodeURIComponent(id)}&limit=50`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { data?: PerformanceEntry[] }) => setPerformance(d.data ?? []))
      .catch(() => {/* non-critical */});
  }, []);

  useEffect(() => {
    if (!item || item.status !== 'published') return;
    fetchPerformance(item.id);
  // Solo depende de id/status a propósito: editar el body/hashtags no debe
  // re-disparar el fetch de métricas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.status]);

  // Redes a las que este contenido ya salió — la preview debe abrir mostrando
  // una de estas, no la primera de la lista genérica (antes mostraba Instagram
  // por defecto aunque el post solo se hubiera publicado en LinkedIn, porque
  // `channel` de los drafts nuevos es 'generic').
  const publishedNetworks = Array.from(new Set(
    performance.map((p) => p.platform).filter((p): p is string => !!p),
  ));

  useEffect(() => {
    if (previewChannel || publishedNetworks.length === 0) return;
    setPreviewChannel(publishedNetworks[0]);
  // Solo se recalcula cuando llegan las métricas; una vez fijado el canal no
  // se debe pisar aunque el usuario haya cambiado de pestaña.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance]);

  function handleUpdate(patch: Partial<ContentItem>) {
    setItem((prev) => prev ? { ...prev, ...patch } : prev);
  }

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: t.deleteConfirmTitle,
      message: common.confirm.irreversible,
      confirmLabel: t.delete,
      cancelLabel: common.actions.cancel,
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/content/${item.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      router.push(`/${lang}/dashboard/content/create`);
    } catch {
      setActionError(t.deleteError);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SkeletonBlock width={140} height={13} style={{ marginBottom: 20 }} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <SkeletonBlock width={70} height={22} borderRadius={4} />
          <SkeletonBlock width={90} height={22} borderRadius={4} />
          <SkeletonBlock width={80} height={22} borderRadius={4} />
        </div>
        <SkeletonBlock width="60%" height={24} style={{ marginBottom: 24 }} />
        <div className={styles.layout}>
          <SkeletonBlock height={520} borderRadius={12} />
          <SkeletonBlock height={220} borderRadius={12} />
        </div>
      </div>
    );
  }
  if (notFound || !item) {
    return (
      <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <EmptyState
          icon={<Icon name="search" size={28} />}
          title={t.notFound}
          hint={t.notFoundHint}
          action={(
            <ButtonLink href={`/${lang}/dashboard/content/create`} variant="secondary" icon={<Icon name="arrow-left" size={16} />}>
              {t.back}
            </ButtonLink>
          )}
        />
      </div>
    );
  }

  const isPublished = item.status === 'published';
  const isAutopilot = item.metadata?.autopilot === true;
  const creatorLabel = isAutopilot ? t.autopilot : (item.created_by_name ? t.createdBy(item.created_by_name) : null);
  const originKey = !isAutopilot ? item.metadata?.created_via : undefined;
  const originLabel = originKey ? t.via(t.origin[originKey] ?? originKey) : null;
  const slides = (Array.isArray(item.slides) ? item.slides : []) as Array<CarouselSlide | ReelScene>;
  const topic = item.title || (item.body ?? '').slice(0, 120);
  const similarHref = `/${lang}/dashboard/content/create?topic=${encodeURIComponent(topic)}&type=${item.content_type}`;
  const bodyExcerpt = (item.body ?? '').trim().replace(/\s+/g, ' ');
  const heading = item.title?.trim()
    || (bodyExcerpt.length > 90 ? `${bodyExcerpt.slice(0, 90)}…` : bodyExcerpt)
    || t.untitled;
  const channelLabel = item.channel === 'generic' ? t.channelGeneric : (NET_LABEL[item.channel] ?? item.channel);
  const numberFormat = new Intl.NumberFormat(dateLocale);

  return (
    <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Link href={`/${lang}/dashboard/content/create`} className={styles.back}>
        <Icon name="arrow-left" size={16} />
        {t.back}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.badges}>
            <span className={`ui-badge ${styles.typeBadge}`}>
              <Icon name={FORMAT_ICONS[item.content_type]} size={12} />
              {t.contentType[item.content_type]}
            </span>
            <span className={styles.channel}>
              <ChannelIcon name={item.channel} size={14} /> {channelLabel}
            </span>
            <StatusBadge status={item.status} lang={locale} />
          </div>
          <h1 className={styles.title}>{heading}</h1>
        </div>
        <div className={styles.meta}>
          <time dateTime={item.created_at}>
            {t.createdOn(new Date(item.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }))}
          </time>
          {(creatorLabel || originLabel) && (
            <span>{[creatorLabel, originLabel].filter(Boolean).join(' · ')}</span>
          )}
        </div>
      </header>

      {actionError && <div style={{ marginBottom: 16 }}><Notice tone="danger">{actionError}</Notice></div>}

      <div className={styles.layout}>
        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div className={styles.previewCol}>
          {item.content_type === 'reel' ? (
            <div style={{ borderRadius: 12, overflow: 'hidden' }}>
              <MuxReelPlayer
                itemId={item.id}
                videoUrl={item.video_url}
                muxPlaybackId={!item.video_url ? item.mux_playback_id ?? null : null}
                renderStatus={item.video_url ? 'ready' : (item.render_status ?? 'not_rendered')}
                height={640}
                maxHeight={PREVIEW_MAX_H}
                autoPlay={!!item.video_url}
                accentColor={brandKit?.accent_color ?? undefined}
                lang={locale}
                onRenderDone={(_id, url) => handleUpdate({ video_url: url, render_status: 'ready' })}
              />
            </div>
          ) : (
            <>
              <NetworkPreview
                contentType={item.content_type}
                defaultChannel={item.channel}
                body={item.body}
                imageUrl={item.image_url}
                videoUrl={item.content_type === 'story' ? item.video_url : null}
                hashtags={item.hashtags}
                slides={slides}
                activeSlide={activeSlide}
                onActiveSlideChange={setActiveSlide}
                username={brandKit?.name ?? PUBLISH[locale].preview.defaultUsername}
                logoUrl={brandKit?.logo_url ?? undefined}
                imagePending={!item.image_url && item.image_status === 'generating'}
                accentColor={brandKit?.accent_color ?? undefined}
                brandFont={brandKit?.font_heading}
                publishedNetworks={isPublished ? publishedNetworks : undefined}
                channel={isPublished ? (previewChannel ?? undefined) : undefined}
                onChannelChange={isPublished ? setPreviewChannel : undefined}
                lang={locale}
                frameMaxHeight={PREVIEW_MAX_H}
              />
              {isPublished && previewChannel && !publishedNetworks.includes(previewChannel) && (
                <Button
                  variant="secondary"
                  block
                  className={styles.publishOn}
                  icon={<Icon name="send" size={16} />}
                  onClick={() => { setPublishTarget(previewChannel); setScheduleOpen(true); }}
                >
                  {t.publishOn(NET_LABEL[previewChannel] ?? previewChannel)}
                </Button>
              )}
            </>
          )}
        </div>

        {/* ── Detalle / acciones ───────────────────────────────────────── */}
        <div className={styles.side}>
          {!isPublished ? (
            <section className="ui-card">
              <p className={styles.draftNotice}>{t.draftNotice}</p>
              <div className={styles.actions}>
                <Button variant="primary" size="lg" block icon={<Icon name="send" size={16} />} onClick={() => setScheduleOpen(true)}>
                  {t.publish}
                </Button>
                <Button variant="secondary" block icon={<Icon name="edit" size={16} />} onClick={() => setEditOpen(true)}>
                  {t.edit}
                </Button>
                <Button
                  variant="danger-ghost"
                  block
                  icon={<Icon name="trash" size={16} />}
                  loading={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? common.actions.deleting : t.delete}
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section className="ui-card" aria-labelledby="content-stats-title">
                <div className="ui-card-head">
                  <h2 id="content-stats-title" className="ui-card-title">{t.statsTitle}</h2>
                </div>
                {performance.length === 0 ? (
                  <p className={styles.muted}>{t.noStatsYet}</p>
                ) : (
                  <ul className={styles.statsList}>
                    {performance.map((p) => (
                      <li key={p.scheduled_post_id}>
                        <div className={styles.metricsNet}>
                          <ChannelIcon name={p.platform ?? item.channel} size={14} />
                          <span className={styles.metricsNetName}>{p.platform ? (NET_LABEL[p.platform] ?? p.platform) : channelLabel}</span>
                          {p.published_at && (
                            <span className={styles.metricsDate}>
                              {t.publishedOn(new Date(p.published_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }))}
                            </span>
                          )}
                        </div>
                        {p.latest_metrics ? (
                          <div className="auto-grid" style={{ '--min': '110px', '--gap': '8px' } as React.CSSProperties}>
                            {([
                              [t.impressions, numberFormat.format(p.latest_metrics.impressions)],
                              [t.reach, numberFormat.format(p.latest_metrics.reach)],
                              [t.likes, numberFormat.format(p.latest_metrics.likes)],
                              [t.comments, numberFormat.format(p.latest_metrics.comments)],
                              [t.shares, numberFormat.format(p.latest_metrics.shares)],
                              [t.engagementRate, `${(p.latest_metrics.engagement_rate * 100).toFixed(1)}%`],
                            ] as const).map(([label, value]) => (
                              <div key={label} className={styles.metric}>
                                <p className={styles.metricValue}>{value}</p>
                                <p className={styles.metricLabel}>{label}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.muted}>{t.noStatsYet}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <ButtonLink href={similarHref} variant="primary" size="lg" block icon={<Icon name="sparkles" size={16} />}>
                {t.createSimilar}
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      {/* ── Modales ──────────────────────────────────────────────────────── */}
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setPublishTarget(null); }}
        initialItem={item}
        initialPlatform={publishTarget ?? undefined}
        brandKit={brandKit}
        lang={locale}
        onSuccess={() => {
          // El modal sigue abierto con el resultado: se recarga sin esqueleto.
          fetchItem({ silent: true });
          fetchPerformance(item.id);
          router.refresh();
        }}
      />
      <EditContentModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        item={item}
        brandKit={brandKit}
        lang={locale}
        onUpdate={handleUpdate}
      />
      {dialog}
    </div>
  );
}
