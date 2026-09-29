import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import { PLAN_PRICES_USD, planHighlights } from '@/lib/plans';

// ─── Ajustes ──────────────────────────────────────────────────────────────────
//
// Fija lo que la auditoría UX (docs/auditoria-ux.md §5.2/5.3) encontró roto:
// precios y features inventados en el locale, siete secciones sin índice,
// claves crudas del scoring de leads y el nombre editable en dos sitios.
// Los paneles hijos (redes, equipo, API keys) tienen sus propios tests.

let lang = 'es';
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang }),
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/${lang}/dashboard/settings`,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

type Sub = {
  canCreate: boolean;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  isTrialing: boolean;
  periodEnd: string | null;
  trialDaysLeft: number | null;
  reason: 'trial_expired' | 'payment_failed' | 'canceled' | 'no_subscription' | null;
};

const refresh = vi.fn(async () => {});
let auth: {
  user: { id: string; email: string; name: string | null } | null;
  org: { id: string; name: string; slug: string; plan: 'starter' | 'pro' | 'business' } | null;
  role: string | null;
  plan: string | null;
  subscription: Sub | null;
  loading: boolean;
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ ...auth, usage: null, refresh, logout: vi.fn() }),
}));

vi.mock('@/components/dashboard/SocialConnectionPanel', () => ({ default: () => <p>panel de redes</p> }));
vi.mock('@/components/dashboard/TeamPanel', () => ({ default: () => <p>panel de equipo</p> }));
vi.mock('@/components/dashboard/settings/ApiKeysSection', () => ({ default: () => <p>panel de API keys</p> }));

import SettingsPage from '@/app/[lang]/dashboard/settings/page';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const ACTIVE: Sub = { canCreate: true, status: 'active', isTrialing: false, periodEnd: null, trialDaysLeft: null, reason: null };
const TRIAL: Sub = { canCreate: true, status: 'trialing', isTrialing: true, periodEnd: null, trialDaysLeft: 12, reason: null };

let fetchMock: ReturnType<typeof vi.fn>;
const originalLocation = window.location;
let hrefSet: string[] = [];

beforeEach(() => {
  lang = 'es';
  params = new URLSearchParams();
  refresh.mockClear();
  auth = {
    user: { id: 'u1', email: 'ana@example.com', name: 'Ana Pérez' },
    org: { id: 'o1', name: 'Café Andes', slug: 'cafe-andes', plan: 'starter' },
    role: 'owner',
    plan: 'starter',
    subscription: ACTIVE,
    loading: false,
  };
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/automations/leads/scoring') {
      // Postgres devuelve el JSONB con las claves reordenadas.
      return jsonResponse(200, {
        config: {
          defaults: { dm: 15, click: 2, follow: 3, manual: 0, review: 10, comment: 5, mention: 8, share: 12 },
          thresholds: { tibio: 20, caliente: 50, contactado: 70, convertido: 100 },
        },
      });
    }
    if (url === '/api/billing/checkout') return jsonResponse(200, { url: 'https://stripe.test/checkout' });
    if (url === '/api/billing/portal') return jsonResponse(200, { url: 'https://stripe.test/portal' });
    return jsonResponse(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  hrefSet = [];
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...originalLocation,
      pathname: `/${lang}/dashboard/settings`,
      hash: '',
      get href() { return hrefSet.at(-1) ?? 'http://localhost/es/dashboard/settings'; },
      set href(v: string) { hrefSet.push(v); },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

async function renderPage() {
  const view = render(<SettingsPage />);
  // Espera a que el scoring termine de cargar.
  await screen.findByRole('group', { name: 'Puntos por tipo de interacción' });
  return view;
}

function planCard(name: string) {
  const heading = screen.getByRole('heading', { level: 3, name });
  return heading.closest('li') as HTMLElement;
}

// ─── Índice ───────────────────────────────────────────────────────────────────

describe('Ajustes — índice de secciones', () => {
  it('enlaza a cada sección por su id estable, incluida #social', async () => {
    await renderPage();
    const nav = screen.getByRole('navigation', { name: 'Secciones de ajustes' });
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#profile', '#org', '#billing', '#social', '#team', '#api-keys', '#lead-scoring']);
    for (const href of hrefs) {
      expect(document.getElementById(href!.slice(1))).not.toBeNull();
    }
    expect(document.getElementById('social')).toHaveTextContent('panel de redes');
  });

  it('sin API keys para un miembro: ni sección ni entrada en el índice', async () => {
    auth.role = 'member';
    await renderPage();
    const nav = screen.getByRole('navigation', { name: 'Secciones de ajustes' });
    expect(within(nav).queryByRole('link', { name: 'API y MCP' })).toBeNull();
    expect(document.getElementById('api-keys')).toBeNull();
    expect(screen.queryByText('panel de API keys')).toBeNull();
  });
});

// ─── Plan y facturación ──────────────────────────────────────────────────────

describe('Ajustes — planes desde lib/plans.ts', () => {
  it('muestra los precios y topes reales, no los $19/$69 ni «Marcas ilimitadas» de antes', async () => {
    await renderPage();
    const billing = document.getElementById('billing')!;

    for (const [plan, name] of [['starter', 'Starter'], ['pro', 'Pro'], ['business', 'Business']] as const) {
      const card = planCard(name);
      expect(card).toHaveTextContent(`$${PLAN_PRICES_USD[plan]}`);
      for (const line of planHighlights(plan, 'es')) expect(card).toHaveTextContent(line);
    }
    expect(billing.textContent).not.toMatch(/\$19\b|\$69\b/);
    expect(billing.textContent).not.toMatch(/ilimitad/i);
    expect(billing).toHaveTextContent('Todos los planes incluyen');
  });

  it('el badge «Más popular» va dentro de la tarjeta de Pro y «Plan actual» en la del plan actual', async () => {
    await renderPage();
    expect(within(planCard('Pro')).getByText('Más popular')).toBeInTheDocument();
    expect(within(planCard('Starter')).getByText('Plan actual')).toBeInTheDocument();
    expect(within(planCard('Business')).queryByText('Más popular')).toBeNull();
  });

  it('con una suscripción activa, el plan actual se gestiona en el portal de Stripe', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(within(planCard('Starter')).getByRole('button', { name: 'Gestionar suscripción' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/portal', expect.objectContaining({ method: 'POST' }));
    expect(hrefSet).toEqual(['https://stripe.test/portal']);
    // Los demás planes siguen yendo al checkout.
    expect(within(planCard('Pro')).getByRole('button', { name: 'Mejorar a Pro' })).toBeInTheDocument();
  });

  it('en el mes gratis, el plan actual se contrata con el checkout (el portal no tiene nada que gestionar)', async () => {
    auth.subscription = TRIAL;
    await renderPage();
    expect(screen.getByText(/te quedan 12 días/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(planCard('Starter')).getByRole('button', { name: 'Suscribirme a Starter' }));
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => u === '/api/billing/checkout')!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ plan: 'starter', lang: 'es' });
    expect(hrefSet).toEqual(['https://stripe.test/checkout']);
  });

  it('bajar de plan no se anuncia como «Mejorar»', async () => {
    auth.plan = 'business';
    await renderPage();
    expect(within(planCard('Starter')).getByRole('button', { name: 'Cambiar a Starter' })).toBeInTheDocument();
    expect(within(planCard('Pro')).getByRole('button', { name: 'Cambiar a Pro' })).toBeInTheDocument();
  });

  it('un fallo del portal muestra la copy del idioma, no el inglés del servidor', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/billing/portal') return jsonResponse(400, { error: 'No Stripe customer found. Please subscribe first.' });
      return jsonResponse(200, { config: null });
    });
    render(<SettingsPage />);
    await act(async () => {
      fireEvent.click(within(planCard('Starter')).getByRole('button', { name: 'Gestionar suscripción' }));
    });
    expect(await screen.findByText('Todavía no tienes una suscripción de pago. Elige un plan para suscribirte.')).toBeInTheDocument();
    expect(screen.queryByText(/No Stripe customer/)).toBeNull();
    expect(hrefSet).toEqual([]);
  });

  it('un miembro ve los planes pero no los botones de pago', async () => {
    auth.role = 'member';
    await renderPage();
    const billing = document.getElementById('billing')!;
    expect(within(billing).queryAllByRole('button')).toHaveLength(0);
    expect(billing).toHaveTextContent('Solo el dueño o un administrador pueden cambiar el plan.');
  });

  it('la vuelta del checkout avisa con el tono de éxito y refresca la sesión', async () => {
    params = new URLSearchParams('billing=success');
    await renderPage();
    expect(screen.getByText('Plan actualizado. ¡Gracias por suscribirte!').closest('.ui-notice')).toHaveClass('ui-notice--success');
    expect(refresh).toHaveBeenCalled();
  });
});

// ─── Perfil y organización ───────────────────────────────────────────────────

describe('Ajustes — perfil y organización', () => {
  it('el nombre de la persona no se edita aquí: se muestra con un enlace a Mi perfil', async () => {
    await renderPage();
    const profile = document.getElementById('profile')!;
    expect(profile).toHaveTextContent('Ana Pérez');
    expect(profile).toHaveTextContent('ana@example.com');
    expect(within(profile).queryByRole('textbox')).toBeNull();
    expect(within(profile).getByRole('link', { name: 'Editar en tu perfil' })).toHaveAttribute('href', '/es/dashboard/profile');
  });

  it('el nombre de la organización se guarda con su propia etiqueta', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/me') return jsonResponse(200, { org: {} });
      return jsonResponse(200, { config: null });
    });
    render(<SettingsPage />);
    const input = screen.getByLabelText('Nombre de la organización');
    expect(input).toHaveValue('Café Andes');
    fireEvent.change(input, { target: { value: 'Café Andes SpA' } });
    await act(async () => { fireEvent.click(within(document.getElementById('org')!).getByRole('button', { name: 'Guardar' })); });

    const [, init] = fetchMock.mock.calls.find(([u]) => u === '/api/auth/me')!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ org_name: 'Café Andes SpA' });
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(within(document.getElementById('org')!).getByRole('status')).toHaveTextContent('Nombre guardado'));
  });

  it('un miembro ve el nombre de la organización sin poder editarlo', async () => {
    auth.role = 'member';
    await renderPage();
    const org = document.getElementById('org')!;
    expect(within(org).queryByRole('textbox')).toBeNull();
    expect(org).toHaveTextContent('Café Andes');
  });
});

// ─── Scoring de leads ────────────────────────────────────────────────────────

describe('Ajustes — scoring de leads', () => {
  it('muestra etiquetas legibles, no las claves internas, en un orden fijo', async () => {
    await renderPage();
    const points = screen.getByRole('group', { name: 'Puntos por tipo de interacción' });
    const sliders = within(points).getAllByRole('slider');
    expect(sliders.map((s) => s.getAttribute('aria-valuetext'))).toEqual(
      ['5 puntos', '15 puntos', '8 puntos', '10 puntos', '12 puntos', '3 puntos', '2 puntos', '0 puntos'],
    );
    expect(within(points).getByLabelText('Comentario')).toHaveValue('5');
    expect(within(points).getByLabelText('Mensaje directo')).toHaveValue('15');
    expect(points.textContent).not.toMatch(/\bdm\b|\bcomment\b/);

    const stages = screen.getByRole('group', { name: 'Puntaje mínimo de cada etapa' });
    expect(within(stages).getByLabelText('Tibio')).toHaveValue(20);
    expect(within(stages).getByLabelText('Caliente')).toHaveValue(50);
    expect(stages.textContent).not.toMatch(/tibio|caliente/);
  });

  it('guarda con las mismas claves internas', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Mensaje directo'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Caliente'), { target: { value: '60' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar scoring' })); });

    const [, init] = fetchMock.mock.calls.find(([u, i]) =>
      u === '/api/automations/leads/scoring' && (i as RequestInit | undefined)?.method === 'PATCH')!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.defaults.dm).toBe(20);
    expect(body.thresholds.caliente).toBe(60);
    expect(Object.keys(body.thresholds).sort()).toEqual(['caliente', 'contactado', 'convertido', 'tibio']);
  });

  it('en inglés las etapas también se traducen', async () => {
    lang = 'en';
    render(<SettingsPage />);
    const stages = await screen.findByRole('group', { name: 'Minimum score for each stage' });
    expect(within(stages).getByLabelText('Warm')).toHaveValue(20);
    expect(within(stages).getByLabelText('Hot')).toHaveValue(50);
    expect(screen.getByLabelText('Direct message')).toBeInTheDocument();
  });
});
