import type { SseEvent } from '../../../lib/assistant/types';

export type { SseEvent };

/**
 * Respuestas mock compartidas para todos los tests E2E.
 * Se usan con page.route() para interceptar llamadas a la API.
 */

export const MOCK_USER = {
  id: 'user-test-1',
  email: 'test@kefy.com',
  name: 'Test User',
};

export const MOCK_ORG_ID = 'org-test-1';

export const MOCK_BRAND = {
  id: 'brand-test-1',
  org_id: MOCK_ORG_ID,
  name: 'Test Brand',
  slug: 'test-brand',
  avatar_url: null,
  archived: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const MOCK_BRAND_KIT = {
  id: 'kit-test-1',
  brand_id: 'brand-test-1',
  org_id: MOCK_ORG_ID,
  name: 'Test Brand',
  tagline: 'Testing made easy',
  primary_color: '#C6FF4B',
  secondary_color: '#1A1A1A',
  accent_color: null,
  tone: ['professional', 'friendly'],
  company_size: '1-10',
  language: 'es',
  uses_emojis: true,
};

export const MOCK_SOCIAL_ACCOUNTS = [
  {
    id: 'sa-1',
    platform: 'instagram',
    external_id: 'ig-user-1',
    username: '@testbrand',
    avatar_url: null,
    zernio_account_id: 'z-acc-1',
    status: 'active',
    token_expires_at: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const MOCK_CONTENT_ITEMS = [
  {
    id: 'c1',
    channel: 'instagram',
    content_type: 'post',
    status: 'draft',
    title: 'Post de prueba',
    body: 'Contenido del post de prueba',
    image_url: null,
    hashtags: ['#test'],
    slides: null,
    video_url: null,
    created_by: 'user-test-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

export const MOCK_ANALYTICS = {
  impressions: 1000,
  reach: 800,
  likes: 50,
  comments: 10,
  shares: 5,
  engagementRate: 6.5,
};

export const LOGIN_SUCCESS_RESPONSE = {
  user: MOCK_USER,
  orgId: MOCK_ORG_ID,
};

export const REGISTER_SUCCESS_RESPONSE = {
  user: MOCK_USER,
  orgId: MOCK_ORG_ID,
};

// Mapa de rutas API → respuesta mock (método GET)
export const API_MOCK_MAP: Record<string, unknown> = {
  '/api/social/accounts': { accounts: MOCK_SOCIAL_ACCOUNTS },
  '/api/brand-kit': { kit: MOCK_BRAND_KIT },
  '/api/content': { items: MOCK_CONTENT_ITEMS, total: 1 },
  '/api/analytics': { analytics: MOCK_ANALYTICS },
  '/api/auth/me': { user: MOCK_USER, orgId: MOCK_ORG_ID },
  '/api/brands': { brands: [MOCK_BRAND] },
  '/api/automations': { rules: [] },
  '/api/autopilot': { rules: [] },
  '/api/messaging': { threads: [] },
  '/api/comments': { comments: [] },
  '/api/reviews': { reviews: [] },
  '/api/strategies': { strategies: [] },
};

// ─── Asistente IA ────────────────────────────────────────────────────────────
//
// El chat y las decisiones responden `text/event-stream`. `sseBody` arma el
// cuerpo con el mismo framing que createSseStream (lib/assistant/sse.ts):
//
//   event: <type>\ndata: <json>\n\n
//
// y un `: ping` opcional para comprobar que el cliente ignora los comentarios.


export function sseBody(events: SseEvent[], { ping = false } = {}): string {
  const frames = events.map((evt) => `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
  return (ping ? ': ping\n\n' : '') + frames.join('');
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
};

export const MOCK_ASSISTANT_USAGE = { used: 10, limit: 200, remaining: 190, period: '2026-09' };

export const MOCK_ASSISTANT_CONVERSATIONS = [
  {
    id: 'conv-1',
    title: 'Ideas para el lanzamiento',
    last_message_at: '2026-09-22T10:00:00Z',
    brand_id: 'brand-test-1',
  },
  {
    id: 'conv-2',
    title: 'Métricas de septiembre',
    last_message_at: '2026-09-20T10:00:00Z',
    brand_id: 'brand-test-1',
  },
];

export const MOCK_ASSISTANT_CONVERSATION_2 = {
  conversation: {
    id: 'conv-2',
    title: 'Métricas de septiembre',
    brand_id: 'brand-test-1',
    last_message_at: '2026-09-20T10:00:00Z',
    created_at: '2026-09-20T09:58:00Z',
  },
  messages: [
    {
      id: 'm-1',
      role: 'user',
      text: '¿Cómo van mis publicaciones?',
      createdAt: '2026-09-20T09:58:00Z',
      tools: [],
    },
    {
      id: 'm-2',
      role: 'assistant',
      text: 'Este mes llevas **1.000 impresiones**.',
      createdAt: '2026-09-20T09:58:10Z',
      tools: [{ toolUseId: 'tu-hist-1', name: 'get_analytics_overview', status: 'done' }],
    },
  ],
  pendingActions: [],
};

export interface MockApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ('read' | 'write' | 'publish')[];
  brand_id: string | null;
  created_by: string | null;
  created_by_user: { name: string | null; email: string | null } | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: 'active' | 'revoked' | 'expired';
}

export function mockApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  return {
    id: 'key-1',
    name: 'Claude Code',
    key_prefix: 'kefy_sk_ab12',
    scopes: ['read', 'write'],
    brand_id: null,
    created_by: 'u1',
    created_by_user: { name: 'Test User', email: 'test@kefy.com' },
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-09-01T10:00:00Z',
    status: 'active',
    ...overrides,
  };
}
