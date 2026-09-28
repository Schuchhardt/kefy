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
import { NetworkPreview } from '@/components/dashboard/NetworkPreview';
import ScheduleModal from '@/components/dashboard/content/ScheduleModal';
import EditContentModal from '@/components/dashboard/content/EditContentModal';
import type { ContentItem, ContentType, ContentStatus, CarouselSlide, ReelScene, BrandKitInfo } from '@/types/content';
import type { Locale } from '@/types/i18n';

const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => null },
);

// ─── i18n (self-contained, como app/[lang]/dashboard/page.tsx) ───────────────

const T = {
  es: {
    back: '← Volver a contenido',
    loading: 'Cargando…',
    notFound: 'No se encontró este contenido.',
    draftNotice: 'Este contenido todavía no se publicó — puedes editarlo y publicarlo cuando esté listo.',
    edit: 'Editar',
    publish: 'Publicar o programar',
    delete: 'Eliminar',
    deleteConfirm: '¿Eliminar este contenido? Esta acción no se puede deshacer.',
    createSimilar: '✦ Crear uno similar',
    statsTitle: 'Rendimiento',
    noStatsYet: 'Todavía no hay métricas para este contenido — pueden tardar un poco en sincronizarse tras publicar.',
    publishedOn: (date: string) => `Publicado el ${date}`,
    impressions: 'Impresiones', reach: 'Alcance', likes: 'Likes', comments: 'Comentarios',
    shares: 'Compartidos', engagementRate: 'Interacción',
    status: { draft: 'Borrador', approved: 'Aprobado', scheduled: 'Programado', published: 'Publicado', archived: 'Archivado' } as Record<ContentStatus, string>,
    contentType: { post: 'Post', carousel: 'Carrusel', reel: 'Reel', story: 'Story' } as Record<ContentType, string>,
  },
  en: {
    back: '← Back to content',
    loading: 'Loading…',
    notFound: "This content couldn't be found.",
    draftNotice: "This content hasn't been published yet — you can still edit and publish it when it's ready.",
    edit: 'Edit',
    publish: 'Publish or schedule',
    delete: 'Delete',
    deleteConfirm: 'Delete this content? This action cannot be undone.',
    createSimilar: '✦ Create a similar one',
    statsTitle: 'Performance',
    noStatsYet: 'No metrics yet for this content — they can take a little while to sync after publishing.',
    publishedOn: (date: string) => `Published on ${date}`,
    impressions: 'Impressions', reach: 'Reach', likes: 'Likes', comments: 'Comments',
    shares: 'Shares', engagementRate: 'Engagement',
    status: { draft: 'Draft', approved: 'Approved', scheduled: 'Scheduled', published: 'Published', archived: 'Archived' } as Record<ContentStatus, string>,
    contentType: { post: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story' } as Record<ContentType, string>,
  },
} as const;

const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: '#888', approved: '#4fc3f7', scheduled: '#ffb74d', published: 'var(--accent)', archived: '#555',
};

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
  const locale: Locale = (lang as Locale) === 'en' ? 'en' : 'es';
  const t = T[locale];
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';

  const [item, setItem] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKitInfo | null>(null);
  const [performance, setPerformance] = useState<PerformanceEntry[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const fetchItem = useCallback(() => {
    setLoading(true);
    fetch(`/api/content/${encodeURIComponent(itemId)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json() as { item?: ContentItem };
        if (data.item) setItem(data.item); else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [itemId]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { kit?: BrandKitInfo }) => { if (d.kit) setBrandKit(d.kit); })
      .catch(() => {/* non-critical */});
  }, []);

  useEffect(() => {
    if (!item || item.status !== 'published') return;
    fetch(`/api/analytics/posts?content_id=${encodeURIComponent(item.id)}&limit=50`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { data?: PerformanceEntry[] }) => setPerformance(d.data ?? []))
      .catch(() => {/* non-critical */});
  // Solo depende de id/status a propósito: editar el body/hashtags no debe
  // re-disparar el fetch de métricas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.status]);

  function handleUpdate(patch: Partial<ContentItem>) {
    setItem((prev) => prev ? { ...prev, ...patch } : prev);
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(t.deleteConfirm)) return;
    await fetch(`/api/content/${item.id}`, { method: 'DELETE', credentials: 'include' });
    router.push(`/${lang}/dashboard/content/create`);
  }

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--muted)' }}>{t.loading}</div>;
  }
  if (notFound || !item) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{t.notFound}</p>
        <Link href={`/${lang}/dashboard/content/create`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t.back}</Link>
      </div>
    );
  }

  const isPublished = item.status === 'published';
  const slides = (Array.isArray(item.slides) ? item.slides : []) as Array<CarouselSlide | ReelScene>;
  const topic = item.title || (item.body ?? '').slice(0, 120);
  const similarHref = `/${lang}/dashboard/content/create?topic=${encodeURIComponent(topic)}&type=${item.content_type}`;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 60px' }}>
      <Link href={`/${lang}/dashboard/content/create`} style={{ display: 'inline-block', marginBottom: 20, color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>
        {t.back}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.05em',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {t.contentType[item.content_type]}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' }}>
          <ChannelIcon name={item.channel} size={14} /> {item.channel}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '3px 8px',
          background: `${STATUS_COLORS[item.status]}22`, color: STATUS_COLORS[item.status],
        }}>
          {t.status[item.status]}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {new Date(item.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: 32 }}>
        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div>
          {item.content_type === 'reel' ? (
            <div style={{ borderRadius: 12, overflow: 'hidden' }}>
              <MuxReelPlayer
                itemId={item.id}
                videoUrl={item.video_url}
                muxPlaybackId={!item.video_url ? item.mux_playback_id ?? null : null}
                renderStatus={item.video_url ? 'ready' : (item.render_status ?? 'not_rendered')}
                height={640}
                autoPlay={!!item.video_url}
                accentColor={brandKit?.accent_color ?? undefined}
                onRenderDone={(_id, url) => handleUpdate({ video_url: url, render_status: 'ready' })}
              />
            </div>
          ) : (
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
              username={brandKit?.name ?? 'tu_marca'}
              logoUrl={brandKit?.logo_url ?? undefined}
              imagePending={!item.image_url && item.image_status === 'generating'}
              accentColor={brandKit?.accent_color ?? undefined}
              brandFont={brandKit?.font_heading}
            />
          )}
        </div>

        {/* ── Detalle / acciones ───────────────────────────────────────── */}
        <div>
          {!isPublished ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
                {t.draftNotice}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  style={{
                    background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: 8,
                    padding: '12px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {t.publish}
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  style={{
                    background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '12px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    background: 'transparent', color: '#e05555', border: '1px solid #e0555555', borderRadius: 8,
                    padding: '12px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {t.delete}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>{t.statsTitle}</h2>
                {performance.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{t.noStatsYet}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {performance.map((p) => (
                      <div key={p.scheduled_post_id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <ChannelIcon name={p.platform ?? item.channel} size={14} />
                          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{p.platform}</span>
                          {p.published_at && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                              {t.publishedOn(new Date(p.published_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }))}
                            </span>
                          )}
                        </div>
                        {p.latest_metrics ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            {([
                              [t.impressions, p.latest_metrics.impressions],
                              [t.reach, p.latest_metrics.reach],
                              [t.likes, p.latest_metrics.likes],
                              [t.comments, p.latest_metrics.comments],
                              [t.shares, p.latest_metrics.shares],
                              [t.engagementRate, `${(p.latest_metrics.engagement_rate * 100).toFixed(1)}%`],
                            ] as const).map(([label, value]) => (
                              <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                                <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px' }}>{value}</p>
                                <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>{label}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{t.noStatsYet}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href={similarHref}
                style={{
                  display: 'block', textAlign: 'center', background: 'var(--accent)', color: '#0A0A0A',
                  borderRadius: 8, padding: '12px 18px', fontWeight: 700, fontSize: 14, textDecoration: 'none',
                }}
              >
                {t.createSimilar}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Modales ──────────────────────────────────────────────────────── */}
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        initialItem={item}
        brandKit={brandKit}
        lang={locale}
        onSuccess={() => {
          setScheduleOpen(false);
          fetchItem();
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
    </div>
  );
}
