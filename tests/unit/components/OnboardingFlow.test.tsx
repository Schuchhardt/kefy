import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// ─── Onboarding «pega tu web → 3 posts» ──────────────────────────────────────
// Dice lo que cuesta antes de gastar, muestra los 3 posts en cuanto llega el
// texto, pide las imágenes una a una y lleva a conectar Instagram.

import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

function json(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const STARTER = {
  brandName: 'Café Andes', filled: ['industry'], failed: 0,
  posts: [
    { id: 'p1', angle: 'intro', body: 'Somos Café Andes', hashtags: ['cafe'] },
    { id: 'p2', angle: 'tip', body: 'Muele justo antes', hashtags: [] },
    { id: 'p3', angle: 'benefit', body: 'Ven a probarlo', hashtags: [] },
  ],
};

let starterResponse: () => Response;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === '/api/auth/me') return json({ usage: { used: 0, limit: 150, remaining: 150 } });
  if (url === '/api/onboarding/starter') return starterResponse();
  if (url === '/api/content/image') {
    const body = JSON.parse(String(init?.body)) as { itemId: string };
    return json({ image: { url: `https://cdn.example.com/${body.itemId}.png` } }, 201);
  }
  return json({});
});

beforeEach(() => {
  starterResponse = () => json(STARTER, 201);
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('OnboardingFlow', () => {
  it('dice cuántos créditos usa antes de gastar (13 con web, 12 sin ella)', async () => {
    render(<OnboardingFlow lang="es" />);
    expect(await screen.findByText('Usa unos 12 créditos (te quedan 150 este mes).')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Web de tu negocio'), { target: { value: 'cafeandes.cl' } });
    expect(screen.getByText('Usa unos 13 créditos (te quedan 150 este mes).')).toBeInTheDocument();
  });

  it('sin web ni descripción no envía nada', async () => {
    render(<OnboardingFlow lang="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear mis 3 posts' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pega tu web o describe tu negocio en una frase.');
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/onboarding/starter')).toBe(false);
  });

  it('muestra los 3 posts, pide una imagen por post y ofrece conectar Instagram', async () => {
    render(<OnboardingFlow lang="es" />);
    fireEvent.change(screen.getByLabelText('Tu negocio en una frase'), { target: { value: 'Café de especialidad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mis 3 posts' }));

    expect(await screen.findByRole('heading', { name: 'Tus primeros 3 posts' })).toHaveFocus();
    expect(screen.getByText('Somos Café Andes')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    const imageCalls = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/content/image');
    expect(imageCalls.map(([, i]) => JSON.parse(String((i as RequestInit).body)).itemId)).toEqual(['p1', 'p2', 'p3']);

    expect(screen.getByRole('link', { name: 'Conectar Instagram' }))
      .toHaveAttribute('href', '/es/dashboard/settings?connect=instagram');
    expect(screen.getAllByRole('link', { name: 'Editar' })[0]).toHaveAttribute('href', '/es/dashboard/content/p1');
  });

  it('sin suscripción muestra el motivo del servidor y el enlace a planes', async () => {
    starterResponse = () => json({ error: 'Tu mes gratis terminó.', subscriptionRequired: true }, 402);
    render(<OnboardingFlow lang="es" />);
    fireEvent.change(screen.getByLabelText('Tu negocio en una frase'), { target: { value: 'Café' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mis 3 posts' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tu mes gratis terminó.');
    expect(screen.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/es/dashboard/settings#billing');
  });
});
