'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { CarouselPreview } from '@/components/dashboard/CarouselPreview';
import { PostPreview }     from '@/components/dashboard/PostPreview';
import ChannelIcon         from '@/components/ui/ChannelIcon';
import { CHANNELS as ALL_CHANNELS, type Channel } from '@/lib/channels';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

// Channel type is imported from lib/channels
type Status      = 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';
type ContentType = 'post' | 'carousel' | 'reel';

interface ReelScene {
  scene_order:      number;
  title:            string;
  body:             string;
  image_url?:       string;
  duration_seconds: number;
}

interface CarouselSlide {
  slide_order:   number;
  title:         string;
  body:          string;
  image_url?:    string;
}

interface ContentItem {
  id:               string;
  channel:          Channel;
  content_type:     ContentType;
  status:           Status;
  title:            string | null;
  body:             string | null;
  image_url:        string | null;
  hashtags:         string[];
  slides:           ReelScene[] | CarouselSlide[] | null;
  video_url:        string | null;
  mux_playback_id?: string | null;
  mux_asset_id?:    string | null;
  render_status?:   'not_rendered' | 'rendering' | 'ready' | 'error' | null;
  created_at:       string;
}

interface SocialAccount {
  id:                 string;
  platform:           string;
  username:           string;
  avatar_url:         string | null;
  zernio_account_id:  string;
  status:             string;
}

// Lazy-load MuxReelPlayer to avoid SSR issues
const MuxReelPlayer = dynamic(
  () => import('@/components/dashboard/MuxReelPlayer').then((m) => m.MuxReelPlayer),
  { ssr: false, loading: () => <p style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando reproductor…</p> },
);

// ─── Constants ────────────────────────────────────────────────────────────────

// Channels are imported from lib/channels — CHANNELS_BASE removed

const CONTENT_TYPES_BASE: { value: ContentType; label: string }[] = [
  { value: 'post',     label: 'Post'     },
  { value: 'carousel', label: 'Carrusel' },
  { value: 'reel',     label: 'Reel'     },
];

const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  post:     '✦',
  carousel: '▦',
  reel:     '▶',
};

const STATUS_COLORS: Record<Status, string> = {
  draft:     '#888',
  approved:  '#4fc3f7',
  scheduled: '#ffb74d',
  published: 'var(--accent)',
  archived:  '#555',
};

// Gradient palette for carousel slides without images (mirrors CarouselPreview.tsx)
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

// ─── Recommendation types (shared by page + RecommendationBlock) ─────────────

type RecSource = 'strategy' | 'industry_fallback' | 'ai_only';

interface RecRationale {
  source:           RecSource;
  framework_name?:  string;
  kpi_primary?:     string;
  goal?:            string;
  week_num?:        number;
  post_num?:        number;
  rationale_short?: string;
}

interface Recommendation {
  template_id?:    string;
  week_num?:       number;
  post_num?:       number;
  format?:         string;
  topic:           string;
  content_type:    ContentType;
  slide_count?:    number;
  generate_images: true;
  rationale:       RecRationale;
}

interface StrategyMeta {
  framework_name: string;
  kpi_primary:    string;
  current_week:   number;
  total_weeks:    number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ContentPageInner() {
  const searchParams = useSearchParams();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  const CHANNELS = ALL_CHANNELS.map((c) =>
    c.value === 'generic' ? { ...c, label: t.channelGeneric } : c
  );
  const CONTENT_TYPES = CONTENT_TYPES_BASE.map((ct) => ({
    ...ct,
    desc: t.contentDescs[ct.value] ?? '',
  }));
  const STATUS_LABELS = t.statusLabels as Record<Status, string>;


  const [items, setItems]           = useState<ContentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('');
  const [filterStatus, setFilterStatus]   = useState<Status | ''>('');
  const [brandKit, setBrandKit]     = useState<{ name: string | null; logo_url: string | null; primary_color: string | null; accent_color: string | null; font_heading: string | null } | null>(null);

  // Generate form — pre-populate from ?topic=Y&type=Z (strategy page deep-link).
  // Channel/language/images are no longer user-controlled: content is
  // channel-agnostic (Zernio adapts per platform) and images are always-on.
  const [showGenerate, setShowGenerate] = useState(() => !!(searchParams?.get('topic')));
  const [genType, setGenType]           = useState<ContentType>(() => {
    const t = searchParams?.get('type') ?? '';
    const valid: ContentType[] = ['post', 'carousel', 'reel'];
    return (valid.includes(t as ContentType) ? t : 'post') as ContentType;
  });
  const [genTopic, setGenTopic]         = useState(() => searchParams?.get('topic') ?? '');
  const [genSlides, setGenSlides]       = useState(5);
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState<string | null>(null);
  const [genResult, setGenResult]       = useState<string | null>(null);
  const [keywordRulesCount, setKeywordRulesCount] = useState(0);
  const [ctaBannerDismissed, setCtaBannerDismissed] = useState(false);
  const [viewMode, setViewMode]                     = useState<'list' | 'grid'>('list');

  // ── Smart content recommendations (calendar-driven + AI fallback) ──────────
  const [recs, setRecs]               = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]     = useState<string | null>(null);
  const [recsOffset, setRecsOffset]   = useState(0);
  const [recsSource, setRecsSource]   = useState<RecSource | null>(null);
  const [recsMeta, setRecsMeta]       = useState<StrategyMeta | null>(null);

  // Reference images for AI-guided image generation
  const [referenceImages, setReferenceImages]   = useState<string[]>([]);
  const [referenceUploading, setReferenceUploading] = useState(false);

  // Selected item
  const [selected, setSelected] = useState<ContentItem | null>(null);

  // Publish / schedule state
  const [publishOpen, setPublishOpen]               = useState(false);
  const [publishScheduled, setPublishScheduled]     = useState(false);
  const [publishDate, setPublishDate]               = useState('');
  const [socialAccounts, setSocialAccounts]         = useState<SocialAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts]       = useState(false);
  const [publishing, setPublishing]                 = useState(false);
  const [publishError, setPublishError]             = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess]         = useState(false);

  // AI re-generation for selected item
  const [regenTextFeedback, setRegenTextFeedback]   = useState('');
  const [regenImageFeedback, setRegenImageFeedback] = useState('');
  const [regenTextLoading, setRegenTextLoading]     = useState(false);
  const [regenImageLoading, setRegenImageLoading]   = useState(false);
  const [regenTextError, setRegenTextError]         = useState<string | null>(null);
  const [regenImageError, setRegenImageError]       = useState<string | null>(null);
  const [regenTextOk, setRegenTextOk]               = useState(false);
  const [regenImageOk, setRegenImageOk]             = useState(false);

  // Reset regen state when selection changes
  useEffect(() => {
    setRegenTextFeedback('');
    setRegenImageFeedback('');
    setRegenTextError(null);
    setRegenImageError(null);
    setRegenTextOk(false);
    setRegenImageOk(false);
    setPublishOpen(false);
    setPublishScheduled(false);
    setPublishDate('');
    setSelectedAccountIds([]);
    setPublishError(null);
    setPublishSuccess(false);
  }, [selected?.id]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterChannel) params.set('channel', filterChannel);
    if (filterStatus)  params.set('status', filterStatus);

    try {
      const res = await fetch(`/api/content?${params}`, { credentials: 'include' });
      const { items: data } = await res.json() as { items: ContentItem[] };
      setItems(data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus, setItems, setLoading]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { kit?: { name: string | null; logo_url: string | null; primary_color: string | null; accent_color: string | null; font_heading: string | null } }) => {
        if (d.kit) setBrandKit(d.kit);
      })
      .catch(() => {/* non-critical */});
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genTopic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGenResult(null);

    try {
      let url = '/api/content/generate';
      const language: 'es' | 'en' = lang === 'en' ? 'en' : 'es';
      // Note: channel is omitted on purpose — backend defaults to 'generic'
      // (Zernio adapts per platform at publish time). Images are always-on.
      let payload: Record<string, unknown> = {
        topic:    genTopic,
        language,
        save:     true,
      };

      if (genType === 'carousel') {
        url = '/api/content/carousel';
        payload = { topic: genTopic, language, slide_count: genSlides, save: true };
      } else if (genType === 'reel') {
        url = '/api/content/reel';
        payload = { topic: genTopic, language, scene_count: genSlides, save: true, reference_image_urls: referenceImages };
      }

      const res  = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { body?: string; hook?: string; slides?: unknown[]; scenes?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al generar');

      if (genType === 'post')     setGenResult(data.body ?? '');
      if (genType === 'carousel') setGenResult(`Carrusel generado con ${(data.slides ?? []).length} slides ✓`);
      if (genType === 'reel')     setGenResult(`Reel generado con ${(data.scenes ?? []).length} escenas ✓`);

      // Check for active keyword rules to show CTA banner
      setCtaBannerDismissed(false);
      fetch('/api/automations/engagement/rules?limit=200', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { rules: [] })
        .then((d: { rules?: Array<{ trigger_type: string; is_active: boolean }> }) => {
          const count = (d.rules ?? []).filter(r => r.trigger_type === 'comment_contains_keyword' && r.is_active).length;
          setKeywordRulesCount(count);
        })
        .catch(() => {});

      fetchItems();
      // Clear form so user can start a new generation immediately
      setGenTopic('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Smart recommendations ────────────────────────────────────────────────
  const fetchRecommendations = useCallback(async (offset: number) => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        lang:   lang === 'en' ? 'en' : 'es',
      });
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
    setRecsOffset(0);
    fetchRecommendations(0);
  }

  function handleRotateRecommendations() {
    const next = recsOffset + 3;
    setRecsOffset(next);
    fetchRecommendations(next);
  }

  function handleApplyRecommendation(r: Recommendation) {
    setGenType(r.content_type);
    setGenTopic(r.topic);
    if (r.content_type === 'carousel' && r.slide_count) {
      setGenSlides(Math.min(10, Math.max(3, r.slide_count)));
    } else if (r.content_type === 'reel') {
      setGenSlides(5);
    }
    setGenError(null);
    setGenResult(null);
    // Scroll the topic textarea into view (smooth)
    setTimeout(() => {
      const el = document.getElementById('gen-topic-textarea');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLTextAreaElement).focus();
      }
    }, 60);
  }

  async function handleReferenceImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setReferenceUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 3 - referenceImages.length)) {
        const fd = new FormData();
        fd.append('file', file);
        const res  = await fetch('/api/content/upload-reference', { method: 'POST', credentials: 'include', body: fd });
        const data = await res.json() as { url?: string; error?: string };
        if (res.ok && data.url) urls.push(data.url);
      }
      setReferenceImages((prev) => [...prev, ...urls].slice(0, 3));
    } catch {
      // non-critical
    } finally {
      setReferenceUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este contenido?')) return;
    await fetch(`/api/content/${id}`, { method: 'DELETE', credentials: 'include' });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function fetchSocialAccounts() {
    if (socialAccounts.length > 0) return;
    setLoadingAccounts(true);
    try {
      const res = await fetch('/api/social/accounts', { credentials: 'include' });
      const data = await res.json() as { accounts?: SocialAccount[] };
      setSocialAccounts(data.accounts ?? []);
    } catch {
      // non-critical
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handlePublish() {
    if (!selected || selectedAccountIds.length === 0) return;
    setPublishing(true);
    setPublishError(null);
    try {
      // Reels: render first if not done yet
      if (selected.content_type === 'reel' && !selected.mux_playback_id) {
        const renderRes = await fetch('/api/content/reel/render', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: selected.id }),
        });
        const renderData = await renderRes.json() as { mux_playback_id?: string; error?: string };
        if (!renderRes.ok) throw new Error(renderData.error ?? 'Error al renderizar el reel');
        if (!renderData.mux_playback_id) {
          throw new Error('El video está siendo procesado. Intenta publicar en unos minutos cuando esté listo.');
        }
        setSelected((prev) => prev ? { ...prev, mux_playback_id: renderData.mux_playback_id, render_status: 'ready' } : prev);
        setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, mux_playback_id: renderData.mux_playback_id, render_status: 'ready' } : i));
      }

      if (publishScheduled && publishDate) {
        const res = await fetch('/api/social/schedule', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_item_id: selected.id, social_account_ids: selectedAccountIds, scheduled_at: publishDate }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Error al programar');
      } else {
        const res = await fetch('/api/social/publish', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_item_id: selected.id, social_account_ids: selectedAccountIds }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Error al publicar');
      }

      const newStatus: Status = publishScheduled ? 'scheduled' : 'published';
      setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, status: newStatus } : i));
      setSelected((prev) => prev ? { ...prev, status: newStatus } : prev);
      setPublishSuccess(true);
      setPublishOpen(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setPublishing(false);
    }
  }

  async function handleRegenText() {
    if (!selected) return;
    setRegenTextLoading(true);
    setRegenTextError(null);
    setRegenTextOk(false);
    try {
      const existingBody = selected.body?.slice(0, 250) ?? selected.title ?? '';
      const topic = regenTextFeedback.trim()
        ? existingBody
          ? `Reescribe este post aplicando el siguiente feedback: "${regenTextFeedback.trim()}". Post actual: ${existingBody}`
          : regenTextFeedback.trim()
        : existingBody || 'contenido de calidad';
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selected.channel, topic: topic.slice(0, 480), itemId: selected.id, save: true }),
      });
      const data = await res.json() as { body?: string; hashtags?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.errorGenerate);
      const patch = { body: data.body ?? selected.body, hashtags: data.hashtags ?? selected.hashtags };
      setSelected((prev) => prev ? { ...prev, ...patch } : prev);
      setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, ...patch } : i));
      setRegenTextOk(true);
      setRegenTextFeedback('');
      setTimeout(() => setRegenTextOk(false), 3000);
    } catch (err) {
      setRegenTextError(err instanceof Error ? err.message : t.errorUnknown);
    } finally {
      setRegenTextLoading(false);
    }
  }

  async function handleRegenImage() {
    if (!selected) return;
    setRegenImageLoading(true);
    setRegenImageError(null);
    setRegenImageOk(false);
    try {
      const base = selected.body?.slice(0, 350) ?? selected.title ?? 'imagen para post de redes sociales';
      const prompt = regenImageFeedback.trim()
        ? `${base}. Estilo visual: ${regenImageFeedback.trim()}`
        : base;
      const res = await fetch('/api/content/image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: '1024x1024', quality: 'medium', itemId: selected.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.errorGenerateImage);
      setSelected((prev) => prev ? { ...prev, image_url: data.url ?? prev.image_url } : prev);
      setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, image_url: data.url ?? i.image_url } : i));
      setRegenImageOk(true);
      setRegenImageFeedback('');
      setTimeout(() => setRegenImageOk(false), 3000);
    } catch (err) {
      setRegenImageError(err instanceof Error ? err.message : t.errorUnknown);
    } finally {
      setRegenImageLoading(false);
    }
  }

  // Content type display label (no "Genérico")
  const contentTypeLabel = (ct: ContentType) =>
    ct === 'reel' ? 'Video' : CONTENT_TYPES_BASE.find((x) => x.value === ct)?.label ?? ct;

  return (
    <>
      {/* ── Main list panel ─────────────────────────────────────────── */}
      <div style={{ padding: '40px 32px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>{t.title}</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{t.subtitle}</p>
          </div>
          <button
            onClick={() => { setShowGenerate(!showGenerate); setGenResult(null); setGenError(null); if (showGenerate) setReferenceImages([]); }}
            style={{
              background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
              padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            {showGenerate ? t.cancelBtn : t.generateBtn}
          </button>
        </div>

        {/* Generate form */}
        {showGenerate && (
          <>
            {/* ─── Smart recommendation block ─────────────────────────────── */}
            <RecommendationBlock
              t={t}
              recs={recs}
              source={recsSource}
              meta={recsMeta}
              loading={recsLoading}
              error={recsError}
              onRecommend={handleRecommendClick}
              onRotate={handleRotateRecommendations}
              onApply={handleApplyRecommendation}
            />
          <form onSubmit={handleGenerate} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 28,
          }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              {t.generateFormTitle}
            </h2>

            {/* Content type selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{t.typeLabel}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.value} type="button" onClick={() => setGenType(ct.value)}
                    title={ct.desc}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${genType === ct.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: genType === ct.value ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                      color: genType === ct.value ? 'var(--accent)' : 'var(--text)',
                      fontWeight: genType === ct.value ? 700 : 400,
                    }}
                  >
                    {CONTENT_TYPE_ICONS[ct.value]} {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              {/* Channel & language pickers were intentionally removed:
                  copy is channel-agnostic (Zernio adapts per platform) and
                  language follows the active dashboard locale. */}
            </div>

            {/* Slides / Scenes count — only for carousel and reel */}
            {(genType === 'carousel' || genType === 'reel') && (
              <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  {genType === 'carousel' ? t.slidesLabel : t.scenesLabel}
                  <span style={{ fontWeight: 400, marginLeft: 8 }}>{genSlides}</span>
                </label>
                <input
                  type="range"
                  min={genType === 'reel' ? 3 : 3}
                  max={genType === 'reel' ? 8 : 10}
                  value={genSlides}
                  onChange={(e) => setGenSlides(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  <span>3</span>
                  <span>{genType === 'reel' ? 8 : 10}</span>
                </div>
              </div>
            )}

            {/* Reference images upload — always shown for reel/carousel (images are always-on) */}
            {(genType === 'reel' || genType === 'carousel') && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Imágenes de referencia{' '}
                  <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— guía el estilo visual de la IA (máx. 3)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {referenceImages.map((url, i) => (
                    <div key={url} style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Ref ${i + 1}`} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <button
                        type="button"
                        onClick={() => setReferenceImages((p) => p.filter((_, j) => j !== i))}
                        style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          borderRadius: '50%', background: '#ff6b6b', color: '#fff', border: 'none',
                          cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                      >×</button>
                    </div>
                  ))}
                  {referenceImages.length < 3 && (
                    <label style={{
                      width: 56, height: 56, borderRadius: 8, border: '1.5px dashed var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: referenceUploading ? 'wait' : 'pointer', color: 'var(--muted)', fontSize: 22,
                      background: 'var(--bg)',
                    }}>
                      {referenceUploading ? '…' : '+'}
                      <input
                        type="file" accept="image/*" multiple hidden
                        disabled={referenceUploading}
                        onChange={handleReferenceImageUpload}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t.topicLabel}</label>
              <textarea
                id="gen-topic-textarea"
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder={
                  genType === 'reel'
                    ? t.topicPlaceholderReel
                    : genType === 'carousel'
                    ? t.topicPlaceholderCarousel
                    : t.topicPlaceholderPost
                }
                required
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="submit" disabled={generating}
                style={{
                  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                  padding: '9px 20px', fontWeight: 600, fontSize: 13,
                  cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? t.generating : t.generateType(CONTENT_TYPES.find(c => c.value === genType)?.label ?? '')}
              </button>
              {genError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{genError}</span>}
            </div>
            {genResult && (
              <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>{t.resultLabel}</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, fontFamily: 'inherit', margin: 0 }}>{genResult}</pre>
              </div>
            )}
            {genResult && keywordRulesCount > 0 && !ctaBannerDismissed && (
              <div style={{
                marginTop: 12, borderRadius: 10,
                background: 'rgba(198,255,75,0.08)', border: '1px solid rgba(198,255,75,0.3)',
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 18 }}>🎯</span>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                  {lang === 'en'
                    ? `Capture leads from this content — you have ${keywordRulesCount} active keyword rule${keywordRulesCount !== 1 ? 's' : ''}.`
                    : `¿Quieres capturar leads de este contenido? Tienes ${keywordRulesCount} regla${keywordRulesCount !== 1 ? 's' : ''} de keyword activa${keywordRulesCount !== 1 ? 's' : ''}.`}
                  {' '}
                  <a
                    href={`/${lang}/dashboard/automations/leads`}
                    style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {lang === 'en' ? 'View pipeline →' : 'Ver pipeline →'}
                  </a>
                </div>
                <button
                  onClick={() => setCtaBannerDismissed(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                >×</button>
              </div>
            )}
          </form>
          </>
        )}

        {/* Filters + view toggle */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterChannel} onChange={(e) => setFilterChannel(e.target.value as Channel | '')}>
            <option value="">{t.allChannels}</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as Status | '')}>
            <option value="">{t.allStatuses}</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['list', 'grid'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                title={mode === 'list' ? 'Vista lista' : 'Vista cuadrícula'}
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  border: `1px solid ${viewMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                  background: viewMode === mode ? 'rgba(198,255,75,0.12)' : 'var(--bg)',
                  color: viewMode === mode ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, lineHeight: 1,
                }}
              >
                {mode === 'list' ? '☰' : '⊞'}
              </button>
            ))}
          </div>
        </div>

        {/* List / Grid */}
        {(loading && !generating) ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</p>
        ) : (!generating && items.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: 15 }}>{t.noContent}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              {t.noContentHint}
            </p>
          </div>
        ) : (
          <div style={viewMode === 'grid'
            ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }
            : { display: 'flex', flexDirection: 'column', gap: 10 }
          }>
            {/* Skeleton card while generating */}
            {generating && viewMode === 'list' && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', gap: 12, alignItems: 'center',
                animation: 'skeletonPulse 1.5s ease-in-out infinite',
              }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, borderRadius: 4, background: 'var(--border)', marginBottom: 8, width: '55%' }} />
                  <div style={{ height: 9, borderRadius: 4, background: 'var(--border)', width: '75%' }} />
                </div>
              </div>
            )}
            {generating && viewMode === 'grid' && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, overflow: 'hidden',
                animation: 'skeletonPulse 1.5s ease-in-out infinite',
              }}>
                <div style={{ width: '100%', aspectRatio: '1/1', background: 'var(--border)' }} />
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ height: 9, borderRadius: 4, background: 'var(--border)', marginBottom: 6, width: '60%' }} />
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', width: '80%' }} />
                </div>
              </div>
            )}
            {items.map((item) => {
              // Determine thumbnail URL for the card
              const thumbUrl = (() => {
                if (item.content_type === 'reel' && item.mux_playback_id)
                  // Animated GIF preview via Mux — autoloops, no extra JS needed
                  return `https://image.mux.com/${item.mux_playback_id}/animated.gif?width=56&fps=10&end=4`;
                if (item.content_type === 'reel' && Array.isArray(item.slides))
                  return (item.slides as ReelScene[])[0]?.image_url ?? null;
                if (item.content_type === 'carousel' && Array.isArray(item.slides))
                  return (item.slides as CarouselSlide[])[0]?.image_url ?? null;
                return item.image_url ?? null;
              })();
              const isAnimatedPreview = item.content_type === 'reel' && !!item.mux_playback_id;
              // In grid mode use a wider GIF for better preview quality
              const gridThumbUrl = item.content_type === 'reel' && item.mux_playback_id
                ? `https://image.mux.com/${item.mux_playback_id}/animated.gif?width=200&fps=10&end=4`
                : thumbUrl;
              // Carousel without images: compute gradient+title fallback
              const firstSlide = !thumbUrl && item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0
                ? (item.slides as CarouselSlide[])[0]
                : null;
              const carouselFallback = firstSlide
                ? { title: firstSlide.title ?? '', gradient: CAROUSEL_GRADIENTS[(firstSlide.slide_order - 1) % CAROUSEL_GRADIENTS.length] }
                : null;

              if (viewMode === 'grid') return (
                <div
                  key={item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${selected?.id === item.id ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* Grid thumbnail */}
                  <div style={{
                    width: '100%',
                    aspectRatio: item.content_type === 'reel' ? '3/4' : '4/5',
                    background: (gridThumbUrl || carouselFallback)
                      ? 'transparent'
                      : `linear-gradient(135deg, ${brandKit?.accent_color ?? '#c6ff4b'}20, ${brandKit?.primary_color ?? '#888'}10)`,
                    overflow: 'hidden', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {gridThumbUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={gridThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : carouselFallback ? (
                      <div style={{ width: '100%', height: '100%', background: carouselFallback.gradient, display: 'flex', alignItems: 'flex-end', padding: '10px 10px' }}>
                        <span style={{
                          color: '#fff', fontWeight: 800, fontSize: 12, lineHeight: 1.3,
                          textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                        }}>{carouselFallback.title}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 36, opacity: 0.4 }}>{CONTENT_TYPE_ICONS[item.content_type as ContentType]}</span>
                    )}
                    {item.mux_playback_id && (
                      <span style={{
                        position: 'absolute', top: 5, left: 5, fontSize: 8, fontWeight: 800,
                        background: 'rgba(198,255,75,0.85)', color: '#000', borderRadius: 3, padding: '1px 4px',
                      }}>MUX</span>
                    )}
                    <span style={{
                      position: 'absolute', bottom: 5, right: 5, fontSize: 10, fontWeight: 600,
                      borderRadius: 4, padding: '2px 6px',
                      background: `${STATUS_COLORS[item.status]}cc`, color: '#fff',
                    }}>{STATUS_LABELS[item.status]}</span>
                  </div>
                  {/* Grid info */}
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, background: 'rgba(198,255,75,0.08)', border: '1px solid rgba(198,255,75,0.22)',
                        borderRadius: 3, padding: '1px 6px', color: 'var(--accent)',
                      }}>
                        {CONTENT_TYPE_ICONS[item.content_type as ContentType]} {contentTypeLabel(item.content_type as ContentType)}
                      </span>
                      {item.channel !== 'generic' && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 3, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <ChannelIcon name={item.channel} size={11} />
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
                        {new Date(item.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, color: 'var(--text)' }}>
                      {item.body ?? item.title ?? t.noText}
                    </p>
                  </div>
                </div>
              );

              return (
              <div
                key={item.id}
                onClick={() => setSelected(selected?.id === item.id ? null : item)}
                style={{
                  background: 'var(--surface)', border: `1px solid ${selected?.id === item.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                  transition: 'border-color 0.15s', display: 'flex', gap: 12, alignItems: 'center',
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                  background: thumbUrl ? 'transparent' : `linear-gradient(135deg, ${brandKit?.accent_color ?? '#c6ff4b'}20, ${brandKit?.primary_color ?? '#888'}10)`,
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {thumbUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : carouselFallback ? (
                    <div style={{ width: '100%', height: '100%', background: carouselFallback.gradient, display: 'flex', alignItems: 'flex-end', padding: '4px 5px' }}>
                      <span style={{
                        color: '#fff', fontWeight: 800, fontSize: 8.5, lineHeight: 1.25,
                        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>{carouselFallback.title}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 20, opacity: 0.5 }}>{CONTENT_TYPE_ICONS[item.content_type]}</span>
                  )}
                  {/* Reel play overlay — skip when showing animated GIF */}
                  {item.content_type === 'reel' && thumbUrl && !isAnimatedPreview && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.25)',
                    }}>
                      <span style={{ fontSize: 14, color: '#fff' }}>▶</span>
                    </div>
                  )}
                  {/* Slide count badge for carousel */}
                  {item.content_type === 'carousel' && Array.isArray(item.slides) && item.slides.length > 0 && (
                    <span style={{
                      position: 'absolute', bottom: 2, right: 2, fontSize: 9, fontWeight: 800,
                      background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 3, padding: '1px 4px',
                    }}>
                      {(item.slides as CarouselSlide[]).length}
                    </span>
                  )}
                  {/* Mux badge */}
                  {item.mux_playback_id && (
                    <span style={{
                      position: 'absolute', top: 2, left: 2, fontSize: 8, fontWeight: 800,
                      background: 'rgba(198,255,75,0.85)', color: '#000', borderRadius: 3, padding: '1px 4px',
                    }}>
                      MUX
                    </span>
                  )}
                </div>

                {/* Text info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {CONTENT_TYPE_ICONS[item.content_type]} {contentTypeLabel(item.content_type)}
                    </span>
                    {item.channel !== 'generic' && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 7px',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                        <ChannelIcon name={item.channel} size={13} />
                        {CHANNELS.find((c) => c.value === item.channel)?.label ?? item.channel}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                      background: `${STATUS_COLORS[item.status]}22`,
                      color: STATUS_COLORS[item.status],
                    }}>
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(item.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, color: 'var(--text)' }}>
                    {item.body ?? item.title ?? t.noText}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail modal ────────────────────────────────────────────── */}
      {selected && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '32px 16px', overflowY: 'auto',
          }}
        >
          <div style={{
            background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 560,
            border: '1px solid var(--border)', flexShrink: 0,
          }}>
            {/* Sticky header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 2,
              background: 'var(--bg)', borderBottom: '1px solid var(--border)',
              padding: '16px 20px', borderRadius: '16px 16px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--accent)', background: 'rgba(198,255,75,0.1)',
                  borderRadius: 4, padding: '2px 7px',
                }}>
                  {contentTypeLabel(selected.content_type)}
                </span>
                <h2 style={{
                  fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700, margin: '6px 0 0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {selected.title ?? selected.body?.slice(0, 60) ?? t.detailTitle}
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                  background: `${STATUS_COLORS[selected.status]}22`,
                  color: STATUS_COLORS[selected.status],
                }}>
                  {STATUS_LABELS[selected.status]}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}
                >✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px 24px 24px' }}>
              {/* Post preview */}
              {selected.content_type === 'post' && (
                <PostPreview
                  channel={selected.channel}
                  body={selected.body}
                  imageUrl={selected.image_url}
                  hashtags={selected.hashtags}
                  username={brandKit?.name ?? 'tu_marca'}
                  logoUrl={brandKit?.logo_url ?? undefined}
                />
              )}

              {/* Carousel/Reel shared: title + body + hashtags */}
              {selected.content_type !== 'post' && (
                <>
                  {selected.title && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{t.titleLabel}</p>
                      <p style={{ fontSize: 14 }}>{selected.title}</p>
                    </div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{t.contentLabel}</p>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 14, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                      {selected.body ?? t.noText}
                    </div>
                  </div>
                  {selected.hashtags.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>{t.hashtagsLabel}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {selected.hashtags.map((h) => (
                          <span key={h} style={{ fontSize: 13, color: 'var(--accent)', background: 'rgba(198,255,75,0.08)', borderRadius: 4, padding: '2px 8px' }}>
                            {h.startsWith('#') ? h : `#${h}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.image_url && selected.content_type !== 'reel' && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>{t.imageLabel}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.image_url} alt="Content" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                    </div>
                  )}
                </>
              )}

              {/* Carousel slides — Instagram-style preview */}
              {selected.content_type === 'carousel' && Array.isArray(selected.slides) && selected.slides.length > 0 && (
                <CarouselPreview
                  key={selected.id}
                  slides={selected.slides as CarouselSlide[]}
                  username={brandKit?.name ?? undefined}
                  logoUrl={brandKit?.logo_url ?? undefined}
                />
              )}

              {/* Reel preview — Mux or Remotion preview, render button hidden */}
              {selected.content_type === 'reel' && Array.isArray(selected.slides) && selected.slides.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>{t.previewReel}</p>
                  <MuxReelPlayer
                    itemId={selected.id}
                    scenes={selected.slides as ReelScene[]}
                    muxPlaybackId={selected.mux_playback_id}
                    renderStatus={selected.render_status}
                    height={400}
                    hideRenderButton
                    autoPlay
                    brandName={brandKit?.name ?? undefined}
                    accentColor={brandKit?.accent_color ?? brandKit?.primary_color ?? undefined}
                    primaryColor={brandKit?.primary_color ?? undefined}
                    fontHeading={brandKit?.font_heading ?? undefined}
                    logoUrl={brandKit?.logo_url ?? undefined}
                    onRenderDone={(itemId, playbackId) => {
                      setItems((prev) => prev.map((i) =>
                        i.id === itemId ? { ...i, mux_playback_id: playbackId, render_status: 'ready' } : i
                      ));
                      setSelected((prev) => prev?.id === itemId
                        ? { ...prev, mux_playback_id: playbackId, render_status: 'ready' }
                        : prev
                      );
                    }}
                    onRenderStart={(itemId) => {
                      setItems((prev) => prev.map((i) =>
                        i.id === itemId ? { ...i, render_status: 'rendering' } : i
                      ));
                    }}
                  />
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{t.scenesCount((selected.slides as ReelScene[]).length)}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(selected.slides as ReelScene[]).map((scene) => (
                        <div key={scene.scene_order} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{scene.scene_order}</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{scene.title}</p>
                            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{scene.body}</p>
                            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0', opacity: 0.6 }}>{scene.duration_seconds}s</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── IA: Regenerar texto ───────────────────── */}
              {(selected.content_type === 'post' || selected.content_type === 'carousel') && (
                <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {t.regenTextTitle}
                  </p>
                  <textarea
                    placeholder={t.regenTextPlaceholder}
                    value={regenTextFeedback}
                    onChange={(e) => setRegenTextFeedback(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  {regenTextError && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{regenTextError}</p>}
                  {regenTextOk && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>{t.regenTextOk}</p>}
                  <button
                    onClick={handleRegenText}
                    disabled={regenTextLoading}
                    style={{
                      width: '100%', marginTop: 8, background: 'rgba(198,255,75,0.08)',
                      border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8,
                      padding: '9px 0', fontSize: 13, fontWeight: 600,
                      cursor: regenTextLoading ? 'not-allowed' : 'pointer', opacity: regenTextLoading ? 0.6 : 1,
                    }}
                  >
                    {regenTextLoading ? t.regenTextLoading : t.regenTextBtn}
                  </button>
                </div>
              )}

              {/* ── IA: Generar / Regenerar imagen ─────────── */}
              {selected.content_type !== 'reel' && (
                <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {selected.image_url ? t.regenImageTitle : t.genImageTitle}
                  </p>
                  <textarea
                    placeholder={t.regenImagePlaceholder}
                    value={regenImageFeedback}
                    onChange={(e) => setRegenImageFeedback(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  {regenImageError && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{regenImageError}</p>}
                  {regenImageOk && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>{t.regenImageOk}</p>}
                  <button
                    onClick={handleRegenImage}
                    disabled={regenImageLoading}
                    style={{
                      width: '100%', marginTop: 8, background: 'rgba(198,255,75,0.05)',
                      border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8,
                      padding: '9px 0', fontSize: 13, fontWeight: 600,
                      cursor: regenImageLoading ? 'not-allowed' : 'pointer', opacity: regenImageLoading ? 0.6 : 1,
                    }}
                  >
                    {regenImageLoading ? t.regenImageLoading : (selected.image_url ? t.regenImageBtn : t.genImageBtn)}
                  </button>
                </div>
              )}

              {/* ── Publicar ──────────────────────────────────── */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
                {publishSuccess ? (
                  <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--accent)', padding: '10px 0' }}>
                    ✓ {publishScheduled ? 'Programado correctamente' : 'Publicado correctamente'}
                  </p>
                ) : !publishOpen ? (
                  <button
                    onClick={() => { setPublishOpen(true); fetchSocialAccounts(); }}
                    style={{
                      width: '100%', background: 'var(--accent)', color: '#000', border: 'none',
                      borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Publicar
                  </button>
                ) : (
                  <div>
                    {/* Toggle publicar ahora / programar */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <button
                        type="button"
                        onClick={() => setPublishScheduled(false)}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${!publishScheduled ? 'var(--accent)' : 'var(--border)'}`,
                          background: !publishScheduled ? 'rgba(198,255,75,0.12)' : 'var(--bg)',
                          color: !publishScheduled ? 'var(--accent)' : 'var(--muted)',
                        }}
                      >
                        Publicar ahora
                      </button>
                      <button
                        type="button"
                        onClick={() => setPublishScheduled(true)}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${publishScheduled ? 'var(--accent)' : 'var(--border)'}`,
                          background: publishScheduled ? 'rgba(198,255,75,0.12)' : 'var(--bg)',
                          color: publishScheduled ? 'var(--accent)' : 'var(--muted)',
                        }}
                      >
                        Programar
                      </button>
                    </div>

                    {/* Date picker when scheduling */}
                    {publishScheduled && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                          Fecha y hora de publicación
                        </label>
                        <input
                          type="datetime-local"
                          value={publishDate}
                          onChange={(e) => setPublishDate(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          style={{ ...inputStyle }}
                        />
                      </div>
                    )}

                    {/* Social accounts */}
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      ¿En qué cuentas publicar?
                    </p>
                    {loadingAccounts ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Cargando cuentas…</p>
                    ) : socialAccounts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--muted)' }}>
                        No hay cuentas conectadas.{' '}
                        <a href={`/${lang}/dashboard/social`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                          Conectar cuentas →
                        </a>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        {socialAccounts.filter(acc => acc.status === 'active').map((acc) => {
                          const isSelected = selectedAccountIds.includes(acc.id);
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => setSelectedAccountIds((prev) =>
                                isSelected ? prev.filter((id) => id !== acc.id) : [...prev, acc.id]
                              )}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                background: isSelected ? 'rgba(198,255,75,0.08)' : 'var(--surface)',
                                transition: 'border-color 0.15s',
                              }}
                            >
                              <ChannelIcon name={acc.platform} size={20} />
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                                  @{acc.username}
                                </p>
                                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '1px 0 0', textTransform: 'capitalize' }}>
                                  {acc.platform}
                                </p>
                              </div>
                              {isSelected && (
                                <span style={{ fontSize: 16, color: 'var(--accent)' }}>✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {publishError && (
                      <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10 }}>{publishError}</p>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handlePublish}
                        disabled={publishing || selectedAccountIds.length === 0 || (publishScheduled && !publishDate)}
                        style={{
                          flex: 1, background: 'var(--accent)', color: '#000', border: 'none',
                          borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700,
                          cursor: (publishing || selectedAccountIds.length === 0 || (publishScheduled && !publishDate)) ? 'not-allowed' : 'pointer',
                          opacity: (publishing || selectedAccountIds.length === 0 || (publishScheduled && !publishDate)) ? 0.55 : 1,
                        }}
                      >
                        {publishing ? 'Procesando…' : publishScheduled ? 'Confirmar programación' : 'Publicar ahora'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPublishOpen(false)}
                        style={{
                          padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(selected.id)}
                style={{
                  width: '100%', background: 'none', border: '1px solid #ff6b6b',
                  color: '#ff6b6b', borderRadius: 8, padding: '9px 0',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 12,
                }}
              >
                {t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, color: 'var(--muted)', fontSize: 14 }}>Loading…</div>}>
      <ContentPageInner />
    </Suspense>
  );
}

// ─── RecommendationBlock ──────────────────────────────────────────────────────

const CONTENT_TYPE_ICONS_LOCAL: Record<ContentType, string> = {
  post:     '✦',
  carousel: '▦',
  reel:     '▶',
};

interface RecommendationBlockProps {
  t:            typeof esT;
  recs:         Recommendation[];
  source:       RecSource | null;
  meta:         StrategyMeta | null;
  loading:      boolean;
  error:        string | null;
  onRecommend:  () => void;
  onRotate:     () => void;
  onApply:      (r: Recommendation) => void;
}

function RecommendationBlock(props: RecommendationBlockProps) {
  const { t, recs, source, meta, loading, error, onRecommend, onRotate, onApply } = props;
  const hasRecs = recs.length > 0;
  const sourceText = (() => {
    if (!source) return '';
    if (source === 'strategy' && meta) {
      return t.recommendSourceStrategy(meta.framework_name, meta.kpi_primary, meta.current_week, meta.total_weeks);
    }
    if (source === 'industry_fallback' && meta) {
      return t.recommendSourceStrategy(meta.framework_name, meta.kpi_primary, meta.current_week, meta.total_weeks);
    }
    if (source === 'ai_only') return t.recommendSourceAI;
    return '';
  })();

  return (
    <section style={{
      background: 'linear-gradient(135deg, rgba(198,255,75,0.06) 0%, rgba(198,255,75,0.02) 100%)',
      border: '1px solid rgba(198,255,75,0.25)',
      borderRadius: 12, padding: '18px 22px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: hasRecs ? 14 : 4 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, margin: 0 }}>
            {t.recommendBlockTitle}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4, margin: 0 }}>
            {t.recommendBlockSubtitle}
          </p>
        </div>
        {!hasRecs && (
          <button
            type="button"
            onClick={onRecommend}
            disabled={loading}
            style={{
              background: 'var(--accent)', color: '#000', border: 'none',
              borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13,
              cursor: loading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? t.recommendLoading : t.recommendBtn}
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
      )}

      {hasRecs && sourceText && (
        <div style={{
          background: 'rgba(0,0,0,0.18)', borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'var(--muted)', marginBottom: 12,
        }}>
          {sourceText}
        </div>
      )}

      {hasRecs && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {recs.map((r, i) => (
              <button
                key={`${r.template_id ?? 'ai'}-${i}`}
                type="button"
                onClick={() => onApply(r)}
                title={r.rationale.goal || r.rationale.rationale_short || t.recCardCtaHint}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: '12px 14px',
                  cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'border-color 120ms ease, transform 120ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                    color: 'var(--accent)', background: 'rgba(198,255,75,0.12)',
                    padding: '2px 8px', borderRadius: 999,
                  }}>
                    {r.week_num && r.post_num
                      ? t.weekBadge(r.week_num, r.post_num)
                      : 'IA'}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    {CONTENT_TYPE_ICONS_LOCAL[r.content_type]}
                  </span>
                </div>
                <p style={{
                  fontSize: 13, lineHeight: 1.4, margin: 0,
                  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {r.topic}
                </p>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 'auto' }}>
                  {t.recCardCtaHint}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              onClick={onRotate}
              disabled={loading}
              style={{
                background: 'transparent', color: 'var(--accent)',
                border: '1px solid rgba(198,255,75,0.4)', borderRadius: 8,
                padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? t.recommendLoading : t.recommendMoreBtn}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
