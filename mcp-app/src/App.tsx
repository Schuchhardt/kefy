// Raíz de la vista de Kefy (un solo bundle para las dos vistas).
//
// El host monta el iframe al llamar el modelo a una herramienta con
// `_meta.ui.resourceUri`, y entrega los argumentos (ontoolinput) y el
// resultado (ontoolresult). La vista elige qué pintar por
// `structuredContent.view.kind`: 'content' → Vista 1, 'video' → Vista 2. La
// Vista 1 puede abrir la 2 («Producir video») y volver.
//
// Tema, variables de estilo y fuentes son los del host (useHostStyles). En
// modo inline el alto máximo es 600 px con scroll interno; «Expandir» pide
// fullscreen al host solo si el usuario lo toca.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import type { ContentItemView, ContentView, VideoView } from '@/lib/mcp-app/contract';
import { COPY, EnvContext, type ToastKind, type ViewEnv } from './context';
import { createHost, type Host } from './host';
import { pickLang } from './format';
import { ContentReview } from './views/ContentReview';
import { VideoPlan } from './views/VideoPlan';
import { Button, Notice, Spinner } from './components/ui';

const VIDEO_TOOLS = new Set(['get_video_plan', 'produce_video', 'get_video_status']);

interface ToolResultLike {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

interface Toast { id: number; message: string; kind: ToastKind }

let toastSeq = 0;

/** Host sin conexión: los botones existen pero no hacen nada hasta conectar. */
const OFFLINE_HOST: Host = {
  callTool: async () => ({ ok: false, code: 'not_connected', message: '', timeout: false }),
  sendMessage: async () => false,
  updateModelContext: async () => {},
  openLink: async () => {},
  requestDisplayMode: async () => null,
};

/** item_id del resultado o de la entrada, para recargar si el servidor no mandó vista. */
function itemIdFrom(args: Record<string, unknown> | null, data: unknown): string | null {
  if (typeof args?.item_id === 'string') return args.item_id;
  const d = (data ?? {}) as { item_id?: unknown; variants?: Array<{ item_id?: unknown }> };
  if (typeof d.item_id === 'string') return d.item_id;
  const v = d.variants?.[0]?.item_id;
  return typeof v === 'string' ? v : null;
}

export function KefyApp() {
  const [hostCtx, setHostCtx] = useState<McpUiHostContext | undefined>();
  const [toolArgs, setToolArgs] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ToolResultLike | null>(null);
  const [content, setContent] = useState<ContentView | null>(null);
  const [video, setVideo] = useState<VideoView | null>(null);
  const [screen, setScreen] = useState<'content' | 'video' | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [tornDown, setTornDown] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'kefy', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (a) => {
      // Se registran antes de conectar: el host no manda nada antes de initialized.
      a.ontoolinput = (p) => setToolArgs((p.arguments ?? null) as Record<string, unknown> | null);
      a.ontoolresult = (r) => setResult(r as ToolResultLike);
      a.ontoolcancelled = () => setFatal('cancelled');
      a.onhostcontextchanged = (c) => setHostCtx((prev) => ({ ...(prev ?? {}), ...c }));
      // Al cerrar la tarjeta se desmonta todo: así se detiene el polling de video.
      a.onteardown = async () => { setTornDown(true); return {}; };
    },
  });
  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    if (app && isConnected) setHostCtx((prev) => ({ ...(app.getHostContext() ?? {}), ...(prev ?? {}) }));
  }, [app, isConnected]);

  const host: Host | null = useMemo(() => (app ? createHost(app) : null), [app]);
  const lang = pickLang(hostCtx?.locale, content?.language ?? video?.language);
  const t = COPY[lang];

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastSeq;
    setToasts((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 6000);
  }, []);

  const showView = useCallback((v: unknown): boolean => {
    const view = v as ContentView | VideoView | null;
    if (view?.kind === 'content') { setContent(view); setScreen('content'); return true; }
    if (view?.kind === 'video') { setVideo(view); setScreen('video'); return true; }
    return false;
  }, []);

  // Resultado de la herramienta que abrió la vista.
  useEffect(() => {
    if (!result || !host) return;
    if (result.isError) {
      const text = (result.content ?? []).map((c) => c.text ?? '').join('\n').trim();
      setFatal(text || 'error');
      return;
    }
    const sc = result.structuredContent ?? {};
    if (showView(sc.view)) return;
    // Sin vista (no se pudo armar): se pide con la pieza del resultado.
    const itemId = itemIdFrom(toolArgs, sc.data);
    if (!itemId) { setFatal('no_item'); return; }
    const toolName = (hostCtx?.toolInfo?.tool as { name?: string } | undefined)?.name ?? '';
    const brand = typeof toolArgs?.brand_id === 'string' ? { brand_id: toolArgs.brand_id } : {};
    void host.callTool(VIDEO_TOOLS.has(toolName) ? 'get_video_plan' : 'review_content', { item_id: itemId, ...brand })
      .then((r) => {
        if (!r.ok) setFatal(`${r.code}: ${r.message}`);
        else if (!showView(r.view)) setFatal('no_view');
      });
  }, [result, host]); // eslint-disable-line react-hooks/exhaustive-deps

  const openVideo = useCallback(async (item: ContentItemView) => {
    if (!host || !content) return;
    const args = { brand_id: content.brand.id, item_id: item.id };
    // Una story sin guion no tiene plan todavía: el estado trae needs_script.
    const r = item.content_type === 'story' && !item.has_video_script
      ? await host.callTool('get_video_status', args)
      : await host.callTool('get_video_plan', args);
    if (!r.ok) { toast(`${t.errorPrefix} ${r.code}: ${r.message}`, 'error'); return; }
    const v = r.view as VideoView | null;
    if (v?.kind === 'video') { setVideo(v); setScreen('video'); }
  }, [host, content, toast, t]);

  const backToContent = useCallback(async () => {
    setScreen('content');
    if (!host || !content) return;
    // Al volver, la pieza puede tener video nuevo.
    const current = video?.item.id;
    if (!current) return;
    const r = await host.callTool('review_content', { brand_id: content.brand.id, item_id: current });
    if (r.ok && (r.view as ContentView | null)?.kind === 'content') {
      const fresh = (r.view as ContentView).items[0];
      setContent((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === fresh.id ? fresh : it)) });
    }
  }, [host, content, video]);

  const displayMode = hostCtx?.displayMode ?? 'inline';
  const canFullscreen = (hostCtx?.availableDisplayModes ?? []).includes('fullscreen');

  const env: ViewEnv = useMemo(() => ({
    host: host ?? OFFLINE_HOST, t, lang, locale: hostCtx?.locale ?? lang, timeZone: hostCtx?.timeZone, toast,
  }), [host, t, lang, hostCtx?.locale, hostCtx?.timeZone, toast]);

  if (tornDown) return null;

  const connected = !!host && isConnected;
  let body: ReactNode;
  if (error) body = <Notice tone="danger">{t.connectError}</Notice>;
  else if (!connected) body = <p className="k-center"><Spinner /> {t.connecting}</p>;
  else if (fatal) body = <Notice tone="danger">{fatal === 'cancelled' || fatal === 'no_item' || fatal === 'no_view' ? t.toolFailed : fatal}</Notice>;
  else if (screen === 'video' && video) {
    body = <VideoPlan view={video} onView={(u) => setVideo((prev) => (prev ? u(prev) : prev))}
      onBack={content ? () => void backToContent() : undefined} />;
  } else if (screen === 'content' && content) {
    body = <ContentReview view={content} onView={(u) => setContent((prev) => (prev ? u(prev) : prev))} onOpenVideo={openVideo} />;
  } else body = <p className="k-center"><Spinner /> {t.waitingResult}</p>;

  return (
    <EnvContext.Provider value={env}>
      <main className={`k-root k-root--${displayMode === 'fullscreen' ? 'fullscreen' : 'inline'}`} lang={lang}>
        {canFullscreen && connected ? (
          <div className="k-topbar">
            {displayMode === 'fullscreen' ? (
              <Button variant="ghost" icon="collapse" label={t.collapse} onClick={() => void env.host.requestDisplayMode('inline')} />
            ) : (
              <Button variant="ghost" icon="expand" label={t.expand} onClick={() => void env.host.requestDisplayMode('fullscreen')} />
            )}
          </div>
        ) : null}
        {body}
        <div className="k-toasts" aria-live="polite" role="status">
          {toasts.map((x) => <div key={x.id} className={`k-toast k-toast--${x.kind}`}>{x.message}</div>)}
        </div>
      </main>
    </EnvContext.Provider>
  );
}
