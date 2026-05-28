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
