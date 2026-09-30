import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AutopilotRule, EngagementRule } from '@/types/automations';

const route = vi.hoisted(() => ({ lang: 'es' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang: route.lang }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ activeBrand: { id: 'brand-1', name: 'Mi marca' } }),
}));

import AutopilotPage from '@/app/[lang]/dashboard/automations/autopilot/page';
import EngagementPage from '@/app/[lang]/dashboard/automations/engagement/page';

const now = new Date().toISOString();

const autopilotRule: AutopilotRule = {
  id: 'ap-1', name: 'Posts semanales', channel: 'linkedin', social_account_ids: [],
  frequency: 'weekly', day_of_week: 1, time_of_day: '09:00', timezone: 'America/Mexico_City',
  ai_model: 'claude', prompt_hint: null, status: 'active', next_run_at: null, last_run_at: null,
  created_at: now,
};

const engagementRule: EngagementRule = {
  id: 'er-1', name: 'Gracias automático', trigger_type: 'new_comment', condition_platform: 'instagram',
  condition_keyword: null, condition_rating: null, action_type: 'reply_comment_ai', action_template: '',
  ai_context: null, delay_minutes: 5, is_active: true, times_triggered: 3, last_triggered_at: now,
  created_at: now,
};

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

beforeEach(() => {
  route.lang = 'es';
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'DELETE') return jsonResponse({ ok: true });
    if (url === '/api/autopilot/rules') return jsonResponse({ data: [autopilotRule] });
    if (url === '/api/social/accounts') return jsonResponse({ accounts: [] });
    if (url === '/api/automations/engagement/rules') return jsonResponse({ rules: [engagementRule] });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const deleteCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

describe('Piloto automático', () => {
  // Era <a href="settings"> relativo: resolvía a /dashboard/automations/settings (404).
  it('sin cuentas, el enlace a Ajustes lleva a la sección de redes', async () => {
    render(<AutopilotPage />);
    await screen.findByText('Posts semanales');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva regla' }));

    expect(screen.getByRole('link', { name: 'Conéctalas en Ajustes' }))
      .toHaveAttribute('href', '/es/dashboard/settings#social');
    // Los campos tienen nombre accesible (antes eran <label> sin htmlFor).
    expect(screen.getByRole('textbox', { name: /Nombre de la regla/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Frecuencia' })).toBeInTheDocument();
  });

  it('eliminar usa el diálogo de la app; cancelar no borra', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    render(<AutopilotPage />);
    await screen.findByText('Posts semanales');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar esta regla?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText('Posts semanales')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Posts semanales')).not.toBeInTheDocument());
    expect(deleteCalls()).toHaveLength(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('Respuestas automáticas', () => {
  it('eliminar usa el diálogo de la app (no window.confirm)', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    render(<EngagementPage />);
    await screen.findByText('Gracias automático');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar esta regla?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByText('Gracias automático')).not.toBeInTheDocument());
    expect(deleteCalls()).toHaveLength(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('en inglés la tarjeta no tiene texto en español', async () => {
    route.lang = 'en';
    render(<EngagementPage />);
    await screen.findByText('Gracias automático');

    expect(screen.getByText(/Ran 3 times/)).toBeInTheDocument();
    expect(screen.queryByText(/ejecutada|última vez/i)).not.toBeInTheDocument();
    expect(screen.getByText('+5 min')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Auto-replies' })).toBeInTheDocument();
  });
});
