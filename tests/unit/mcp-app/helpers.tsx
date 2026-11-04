// Host falso y vistas de prueba para los componentes de mcp-app/.
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import es from '@/locales/es/mcp-app';
import { EnvContext, type ViewEnv } from '@/mcp-app/src/context';
import type { Host, ToolOutcome } from '@/mcp-app/src/host';
import type { ContentItemView, ContentView, VideoView } from '@/lib/mcp-app/contract';

export const BRAND = '00000000-0000-4000-8000-000000000020';
export const ITEM = '00000000-0000-4000-8000-000000000286';

export type ToolHandler = (args: Record<string, unknown>) => ToolOutcome | Promise<ToolOutcome>;

export function fakeHost(handlers: Record<string, ToolHandler> = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const host = {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const h = handlers[name];
      return h ? h(args) : ({ ok: true, data: null, view: null } as ToolOutcome);
    }),
    sendMessage: vi.fn(async () => true),
    updateModelContext: vi.fn(async () => {}),
    openLink: vi.fn(async () => {}),
    requestDisplayMode: vi.fn(async () => 'fullscreen'),
  } satisfies Host;
  return { host, calls };
}

export function renderWithEnv(ui: ReactElement, host: Host) {
  const toast = vi.fn();
  const env: ViewEnv = { host, t: es, lang: 'es', locale: 'es-CL', timeZone: 'America/Santiago', toast };
  return { toast, ...render(<EnvContext.Provider value={env}>{ui}</EnvContext.Provider>) };
}

export function makeItem(over: Partial<ContentItemView> = {}): ContentItemView {
  return {
    id: ITEM,
    content_type: 'post',
    channel: 'generic',
    status: 'draft',
    title: 'Lanzamiento',
    body: 'Llega la nueva colección',
    hashtags: ['#Kefy'],
    image_url: 'https://kefy-test.supabase.co/storage/v1/object/public/img.jpg',
    image_status: 'ready',
    image_error: null,
    video_url: null,
    render_status: null,
    slides: [],
    scheduled_posts: [],
    renditions: [],
    has_video_script: false,
    created_at: '2026-11-04T12:00:00Z',
    updated_at: '2026-11-04T12:00:00Z',
    actions: {
      approve: true, unapprove: false, archive: true, edit: true, regenerate_image: true,
      convert: true, produce_video: false, publish: false,
    },
    publish_blocked: 'not_approved',
    default_image_size: '1024x1024',
    link: `https://kefy.app/es/dashboard/content/create?item=${ITEM}`,
    ...over,
  };
}

export function makeView(items: ContentItemView[], over: Partial<ContentView> = {}): ContentView {
  return {
    kind: 'content',
    version: 1,
    language: 'es',
    brand: { id: BRAND, name: 'Kefy', avatar_url: null },
    items,
    variant_group_id: null,
    permissions: { write: true, publish: true },
    credits: { remaining: 100, image: 3, story_script: 1, convert: { post: 4, carousel: 16, reel: 16, story: 4 } },
    image_sizes: ['1024x1024', '1536x1024', '1024x1536', '1080x1080', '1024x1792'],
    ...over,
  };
}

export function makeVideoView(over: Partial<VideoView> = {}): VideoView {
  return {
    kind: 'video',
    version: 1,
    language: 'es',
    brand: { id: BRAND, name: 'Kefy', avatar_url: null },
    item: {
      id: ITEM, content_type: 'reel', status: 'draft', title: 'Reel de lanzamiento', body: null, hashtags: [],
      image_url: null, video_url: null, render_status: 'not_rendered', link: 'https://kefy.app/x',
    },
    format: 'reel',
    needs_script: false,
    plan: {
      motion: 'key', credits: 30, credits_by_motion: { none: 12, key: 30, full: 55 }, duration_seconds: 16,
      shots: [{ order: 1, kind: 'still', speaker: 'narrator', line: 'Hola', on_screen_text: null, image_url: null, duration_seconds: 3, tools: ['generate_image'] }],
      tools: [], notes: [],
    },
    plan_error: null,
    production: null,
    permissions: { write: true, publish: true },
    credits: { remaining: 100, story_script: 1 },
    actions: { approve: false, publish: false },
    ...over,
  };
}

/** Componente con estado para que las recargas (onView) se vean en el DOM. */
export function Stateful<V>({ initial, children }: { initial: V; children: (v: V, set: (u: (prev: V) => V) => void) => ReactElement }) {
  const [v, setV] = useState(initial);
  return children(v, (u) => setV((prev) => u(prev)));
}
