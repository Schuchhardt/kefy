'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import ChannelIcon         from '@/components/ui/ChannelIcon';
import ContentActions      from '@/components/dashboard/content/ContentActions';
import ScheduleModal       from '@/components/dashboard/content/ScheduleModal';
import EditContentModal    from '@/components/dashboard/content/EditContentModal';
import ManualCreateModal   from '@/components/dashboard/content/ManualCreateModal';
import RecommendModal      from '@/components/dashboard/content/RecommendModal';
import type { ContentItem, ContentType, ContentStatus, ReelScene, CarouselSlide } from '@/types/content';
import type { Channel } from '@/types/channels';
import type { Locale } from '@/types/i18n';
import type { RecSource, Recommendation, StrategyMeta } from '@/types/strategy';
import { CHANNELS as ALL_CHANNELS } from '@/lib/channels';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;

// Modals own their own preview/publish/regen logic now — no need for SocialAccount or MuxReelPlayer here.

// ─── Constants ────────────────────────────────────────────────────────────────

// Channels are imported from lib/channels — CHANNELS_BASE removed

const CONTENT_TYPES_BASE: { value: ContentType; label: string }[] = [
  { value: 'post',     label: 'Post'     },
  { value: 'carousel', label: 'Carrusel' },
  { value: 'reel',     label: 'Reel'     },
  { value: 'story',    label: 'Story'    },
];

const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  post:     '✦',
  carousel: '▦',
  reel:     '▶',
  story:    '◎',
};

const STATUS_COLORS: Record<ContentStatus, string> = {
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function ContentPageInner() {
  const searchParams = useSearchParams();
  const { lang: rawLang } = useParams<{ lang: string }>();
  const lang: 'es' | 'en' = rawLang === 'en' ? 'en' : 'es';
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  const CHANNELS = ALL_CHANNELS.map((c) =>
    c.value === 'generic' ? { ...c, label: t.channelGeneric } : c
  );
  const CONTENT_TYPES = CONTENT_TYPES_BASE.map((ct) => ({
    ...ct,
    desc: t.contentDescs[ct.value] ?? '',
  }));
  const STATUS_LABELS = t.statusLabels as Record<ContentStatus, string>;


  const [items, setItems]           = useState<ContentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('');
  const [filterStatus, setFilterStatus]   = useState<ContentStatus | ''>('');
  const [brandKit, setBrandKit]     = useState<{ name: string | null; logo_url: string | null; primary_color: string | null; accent_color: string | null; font_heading: string | null } | null>(null);

  // Generate form — pre-populate from ?topic=Y&type=Z (strategy page deep-link).
  // Channel/language/images are no longer user-controlled: content is
  // channel-agnostic (Zernio adapts per platform) and images are always-on.
  const [showGenerate, setShowGenerate] = useState(() => !!(searchParams?.get('topic')));
  const [genType, setGenType]           = useState<ContentType>(() => {
    const t = searchParams?.get('type') ?? '';
    const valid: ContentType[] = ['post', 'carousel', 'reel', 'story'];
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
  const [recsHint, setRecsHint]       = useState('');
  const [recommendModalOpen, setRecommendModalOpen] = useState(false);

  // Reference images for AI-guided image generation
  const [referenceImages, setReferenceImages]   = useState<string[]>([]);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceSource, setReferenceSource]   = useState<'upload' | 'previous'>('upload');

  // Advanced config (slide/scene count, reference images) collapsed by default
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Modals
  const [viewItem,    setViewItem]    = useState<ContentItem | null>(null);
  const [editItem,    setEditItem]    = useState<ContentItem | null>(null);
  const [manualOpen,  setManualOpen]  = useState(false);

  // Track items whose cover image is being generated in background
  const [imagePending, setImagePending] = useState<Set<string>>(new Set());

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

  // `opts` lets callers (e.g. the recommendation modal) trigger a generation
  // immediately with explicit values, without waiting for genTopic/genType
  // state to catch up via setState — avoids a stale-state click-and-wait.
  async function handleGenerate(e: React.FormEvent | null, opts?: { topic: string; type: ContentType; slides?: number }) {
    e?.preventDefault();
    const topic  = opts?.topic ?? genTopic;
    const type   = opts?.type ?? genType;
    const slides = opts?.slides ?? genSlides;
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGenResult(null);

    try {
      let url = '/api/content/generate';
      const language: 'es' | 'en' = lang;
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
        payload = { topic, language, scene_count: slides, save: true, reference_image_urls: referenceImages };
      } else if (type === 'story') {
        url = '/api/content/story';
        payload = { topic, language, save: true };
      }

      const res  = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { itemId?: string; body?: string; hook?: string; hashtags?: string[]; slides?: unknown[]; scenes?: unknown[]; image_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al generar');

      if (type === 'post')     setGenResult(data.body ?? '');
      if (type === 'carousel') setGenResult(`Carrusel generado con ${(data.slides ?? []).length} slides ✓`);
      if (type === 'reel')     setGenResult(`Reel generado con ${(data.scenes ?? []).length} escenas ✓`);
      if (type === 'story')    setGenResult('Story generada ✓');

      // Check for active keyword rules to show CTA banner
      setCtaBannerDismissed(false);
      fetch('/api/automations/engagement/rules?limit=200', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { rules: [] })
        .then((d: { rules?: Array<{ trigger_type: string; is_active: boolean }> }) => {
          const count = (d.rules ?? []).filter(r => r.trigger_type === 'comment_contains_keyword' && r.is_active).length;
          setKeywordRulesCount(count);
        })
        .catch(() => {});

      await fetchItems();

      // For posts: kick off background image generation so the user sees the image
      // appear in the list without needing to open the modal manually.
      if (type === 'post' && data.itemId) {
        const newItemId = data.itemId;
        setImagePending((prev) => { const n = new Set(prev); n.add(newItemId); return n; });
        const imagePrompt = (data.body ?? topic).slice(0, 900);
        fetch('/api/content/image', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: imagePrompt, size: '1024x1024', quality: 'medium', itemId: newItemId }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((d: { url?: string } | null) => {
            if (d?.url) {
              setItems((prev) => prev.map((i) => i.id === newItemId ? { ...i, image_url: d.url ?? i.image_url } : i));
              setViewItem((prev) => prev?.id === newItemId ? { ...prev, image_url: d.url ?? prev.image_url } : prev);
              setEditItem((prev) => prev?.id === newItemId ? { ...prev, image_url: d.url ?? prev.image_url } : prev);
            }
          })
          .catch(() => {/* non-fatal: user can regenerate from Edit modal */})
          .finally(() => {
            setImagePending((prev) => { const n = new Set(prev); n.delete(newItemId); return n; });
          });
      }

      // Clear form so user can start a new generation immediately
      setGenTopic('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Smart recommendations ────────────────────────────────────────────────
  const fetchRecommendations = useCallback(async (offset: number, hint: string) => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        lang:   lang === 'en' ? 'en' : 'es',
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

  function handleRotateRecommendations() {
    const next = recsOffset + 3;
    setRecsOffset(next);
    fetchRecommendations(next, recsHint);
  }

  // Picking a recommendation card generates it immediately — no extra click.
  function handleSelectRecommendation(r: Recommendation) {
    const slides = r.content_type === 'carousel' && r.slide_count
      ? Math.min(10, Math.max(3, r.slide_count))
      : 5;

    setShowGenerate(true);
    setGenType(r.content_type);
    setGenTopic(r.topic);
    setGenSlides(slides);
    setGenError(null);
    setGenResult(null);
    setRecommendModalOpen(false);

    handleGenerate(null, { topic: r.topic, type: r.content_type, slides });
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

  function togglePreviousPostReference(url: string) {
    setReferenceImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : (prev.length < 3 ? [...prev, url] : prev),
    );
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este contenido?')) return;
    await fetch(`/api/content/${id}`, { method: 'DELETE', credentials: 'include' });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (viewItem?.id === id) setViewItem(null);
    if (editItem?.id === id) setEditItem(null);
  }

  // Apply patches from EditContentModal back into local state
  function handleItemUpdate(id: string, patch: Partial<ContentItem>) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
    setEditItem((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
    setViewItem((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  // Content type display label (no "Genérico")
  const contentTypeLabel = (ct: ContentType) =>
    ct === 'reel' ? 'Video' : CONTENT_TYPES_BASE.find((x) => x.value === ct)?.label ?? ct;

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
      const url = it.content_type === 'reel' && Array.isArray(it.slides)
        ? (it.slides as ReelScene[])[0]?.image_url
        : it.content_type === 'carousel' && Array.isArray(it.slides)
        ? (it.slides as CarouselSlide[])[0]?.image_url
        : it.image_url;
      return url ? { id: it.id, url } : null;
    })
    .filter((x): x is { id: string; url: string } => !!x)
    .slice(0, 12);

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setManualOpen(true)}
              style={{
                background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              {lang === 'en' ? 'Create manually' : 'Crear sin IA'}
            </button>
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
        </div>

        {/* Generate form — recommendations, topic, and advanced settings all in one flow */}
        {showGenerate && (
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

            {/* Topic — write it yourself, or get a recommendation right here */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{t.topicLabel}</label>
                <button
                  type="button"
                  onClick={handleRecommendClick}
                  disabled={recsLoading}
                  style={{
                    background: 'rgba(198,255,75,0.1)', color: 'var(--accent)',
                    border: '1px solid rgba(198,255,75,0.4)', borderRadius: 999,
                    padding: '5px 12px', fontWeight: 700, fontSize: 12,
                    cursor: recsLoading ? 'wait' : 'pointer', opacity: recsLoading ? 0.7 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  {recsLoading ? t.recommendLoading : t.recommendInlineBtn}
                </button>
              </div>
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
                    : genType === 'story'
                    ? t.topicPlaceholderStory
                    : t.topicPlaceholderPost
                }
                required
              />
              <input
                type="text"
                value={recsHint}
                onChange={(e) => setRecsHint(e.target.value.slice(0, 500))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !recsLoading) { e.preventDefault(); handleRecommendClick(); }
                }}
                placeholder={t.recommendHintPlaceholder}
                maxLength={500}
                disabled={recsLoading}
                style={{ ...inputStyle, marginTop: 8, fontSize: 12.5, padding: '7px 12px' }}
              />
              {recsError && <p style={{ color: '#ff6b6b', fontSize: 12.5, marginTop: 6 }}>{recsError}</p>}
            </div>

            {/* Advanced config — slide/scene count + reference images (collapsed by default) */}
            {(genType === 'carousel' || genType === 'reel') && (
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--muted)',
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {advancedOpen ? t.advancedConfigHide : t.advancedConfigShow}
                </button>

                {advancedOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    {/* Slides / Scenes count */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                        {genType === 'carousel' ? t.slidesLabel : t.scenesLabel}
                        <span style={{ fontWeight: 400, marginLeft: 8 }}>{genSlides}</span>
                      </label>
                      <input
                        type="range"
                        min={3}
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

                    {/* Reference images — upload or pick from a previous post */}
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                        {t.referenceImagesLabel}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— {t.referenceImagesHint}</span>
                      </label>

                      {referenceImages.length > 0 && (
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
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {(['upload', 'previous'] as const).map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => setReferenceSource(src)}
                            style={{
                              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${referenceSource === src ? 'var(--accent)' : 'var(--border)'}`,
                              background: referenceSource === src ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                              color: referenceSource === src ? 'var(--accent)' : 'var(--text)',
                            }}
                          >
                            {src === 'upload' ? t.referenceTabUpload : t.referenceTabPrevious}
                          </button>
                        ))}
                      </div>

                      {referenceSource === 'upload' ? (
                        referenceImages.length < 3 && (
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
                        )
                      ) : (
                        previousPostThumbs.length === 0 ? (
                          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.referenceNoPrevious}</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {previousPostThumbs.map((p) => {
                              const selected = referenceImages.includes(p.url);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => togglePreviousPostReference(p.url)}
                                  title={selected ? t.referenceSelected : undefined}
                                  style={{
                                    position: 'relative', width: 56, height: 56, padding: 0, borderRadius: 8,
                                    overflow: 'hidden', cursor: 'pointer',
                                    border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  {selected && (
                                    <span style={{
                                      position: 'absolute', inset: 0, background: 'rgba(198,255,75,0.28)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: '#000', fontWeight: 800, fontSize: 14,
                                    }}>✓</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
        )}

        {/* Filters + view toggle */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterChannel} onChange={(e) => setFilterChannel(e.target.value as Channel | '')}>
            <option value="">{t.allChannels}</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ContentStatus | '')}>
            <option value="">{t.allStatuses}</option>
            {(Object.keys(STATUS_LABELS) as ContentStatus[]).map((s) => (
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
                if (item.content_type === 'reel' && Array.isArray(item.slides))
                  return (item.slides as ReelScene[])[0]?.image_url ?? null;
                if (item.content_type === 'carousel' && Array.isArray(item.slides))
                  return (item.slides as CarouselSlide[])[0]?.image_url ?? null;
                return item.image_url ?? null;
              })();
              const isAnimatedPreview = false;
              const gridThumbUrl = thumbUrl;
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
                  onClick={() => setViewItem(item)}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${viewItem?.id === item.id ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    transition: 'border-color 0.15s', position: 'relative',
                  }}
                >
                  {/* Action buttons */}
                  <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 2, backdropFilter: 'blur(4px)' }}>
                    <ContentActions
                      lang={lang}
                      size="sm"
                      onView={() => setViewItem(item)}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => handleDelete(item.id)}
                    />
                  </div>
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
                    ) : imagePending.has(item.id) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                        <span style={{ fontSize: 28, animation: 'pulse 1.6s ease-in-out infinite' }}>✨</span>
                        <span style={{ fontSize: 11 }}>{lang === 'en' ? 'Generating image…' : 'Generando imagen…'}</span>
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
                onClick={() => setViewItem(item)}
                style={{
                  background: 'var(--surface)', border: `1px solid ${viewItem?.id === item.id ? 'var(--accent)' : 'var(--border)'}`,
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
                  ) : imagePending.has(item.id) ? (
                    <span style={{ fontSize: 18, opacity: 0.6, animation: 'pulse 1.6s ease-in-out infinite' }}>✨</span>
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

                {/* Action buttons */}
                <div style={{ flexShrink: 0 }}>
                  <ContentActions
                    lang={lang}
                    size="md"
                    onView={() => setViewItem(item)}
                    onEdit={() => setEditItem(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <ScheduleModal
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        initialItem={viewItem as ContentItem | null}
        brandKit={brandKit ? {
          name: brandKit.name ?? null,
          logo_url: brandKit.logo_url ?? null,
          accent_color: brandKit.accent_color ?? null,
          primary_color: brandKit.primary_color ?? null,
          font_heading: brandKit.font_heading ?? null,
        } : undefined}
        lang={lang}
        onSuccess={() => {
          fetchItems();
          setViewItem(null);
        }}
      />

      <EditContentModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        item={editItem as ContentItem | null}
        brandKit={brandKit ? {
          name: brandKit.name ?? null,
          logo_url: brandKit.logo_url ?? null,
          accent_color: brandKit.accent_color ?? null,
          primary_color: brandKit.primary_color ?? null,
          font_heading: brandKit.font_heading ?? null,
        } : undefined}
        lang={lang}
        onUpdate={(patch) => {
          if (editItem) handleItemUpdate(editItem.id, patch as Partial<ContentItem>);
        }}
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
      />

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
