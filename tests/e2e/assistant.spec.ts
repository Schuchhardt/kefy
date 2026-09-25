import type { Page, Request, Route } from '@playwright/test';
import { test, expect } from './fixtures/auth';
import {
  MOCK_ASSISTANT_CONVERSATIONS,
  MOCK_ASSISTANT_CONVERSATION_2,
  MOCK_ASSISTANT_USAGE,
  SSE_HEADERS,
  sseBody,
  type SseEvent,
} from './fixtures/api-mocks';

// ─── Asistente IA (widget flotante del dashboard) ────────────────────────────
//
// El chat y las decisiones sobre acciones son streams SSE. Los mocks devuelven
// el cuerpo entero de una vez con el mismo framing que lib/assistant/sse.ts; el
// cliente (lib/assistant/client.ts) lo parte en frames igual que si llegara de
// a trozos.

const ES = {
  launcher: 'Abrir el asistente de Kefy',
  closeLauncher: 'Cerrar el asistente',
  title: 'Asistente Kefy',
  placeholder: 'Pídele algo al asistente…',
  confirmTitle: 'Necesito tu confirmación',
};

const EN = {
  launcher: 'Open the Kefy assistant',
  title: 'Kefy assistant',
  placeholder: 'Ask the assistant anything…',
  confirmTitle: 'I need your confirmation',
};

/** Dentro de una hora: la tarjeta de confirmación no vence durante el test. */
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function fulfillSse(route: Route, events: SseEvent[]) {
  return route.fulfill({ status: 200, headers: SSE_HEADERS, body: sseBody(events, { ping: true }) });
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Mockea POST /api/assistant/chat y guarda los cuerpos recibidos. */
async function mockChat(
  page: Page,
  respond: (route: Route, body: Record<string, unknown>, n: number) => Promise<void>,
) {
  const bodies: Record<string, unknown>[] = [];
  await page.route('/api/assistant/chat', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    await respond(route, body, bodies.length);
  });
  return bodies;
}

/** Mockea POST /api/assistant/actions/{id}?lang=… y guarda las peticiones. */
async function mockActions(page: Page, respond: (route: Route, req: Request) => Promise<void>) {
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  await page.route(/\/api\/assistant\/actions\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    requests.push({ url: new URL(req.url()), body: req.postDataJSON() as Record<string, unknown> });
    await respond(route, req);
  });
  return requests;
}

async function openAssistant(page: Page, copy: { launcher: string; title: string } = ES) {
  const launcher = page.getByRole('button', { name: copy.launcher });
  await expect(launcher).toBeVisible({ timeout: 15000 });
  await launcher.click();
  const panel = page.getByRole('dialog', { name: copy.title });
  await expect(panel).toBeVisible();
  return panel;
}

async function sendMessage(page: Page, text: string, placeholder = ES.placeholder) {
  const input = page.getByRole('textbox', { name: placeholder });
  await input.fill(text);
  await input.press('Enter');
}

/** Turno que pide confirmación para publicar, con datos de terceros envueltos. */
function confirmationTurn(actionId = 'act-1'): SseEvent[] {
  return [
    { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
    { type: 'text_delta', text: 'Preparé la publicación.' },
    { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
    {
      type: 'confirmation_required',
      actionId,
      toolUseId: 'tu-pub',
      name: 'publish_content',
      summary: 'Publicar «<untrusted_content>Post de prueba</untrusted_content>» en @testbrand ahora',
      preview: {
        title: '<untrusted_content>Post de prueba</untrusted_content>',
        accounts: ['@testbrand'],
        text: '<untrusted_content source="content">Hola <b>mundo</b></untrusted_content>',
      },
      credits: 0,
      expiresAt: inAnHour(),
    },
    { type: 'done', reason: 'awaiting_confirmation', usage: { used: 11, limit: 200, remaining: 189 } },
  ];
}

/** Guarda en la página cada `kefy:data-changed` que emita el widget. */
async function recordDataChanged(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __dataChanged: string[][] };
    w.__dataChanged = [];
    window.addEventListener('kefy:data-changed', (e) => {
      w.__dataChanged.push((e as CustomEvent<{ entities: string[] }>).detail.entities);
    });
  });
}

function dataChangedEvents(page: Page) {
  return page.evaluate(() => (window as unknown as { __dataChanged: string[][] }).__dataChanged);
}

/**
 * Chat con stream controlado desde el test. page.route solo entrega el cuerpo
 * entero de una vez; para ver el estado intermedio (chip girando, texto a
 * medias, «Detener») se reemplaza fetch en la página solo para
 * /api/assistant/chat con un ReadableStream al que el test va empujando
 * trozos. El resto del cliente (lib/assistant/client.ts) corre igual.
 */
async function installControlledChat(page: Page) {
  await page.addInitScript(() => {
    type Ctl = {
      calls: Record<string, unknown>[];
      aborted: number;
      push: (chunk: string) => void;
      close: () => void;
    };
    const w = window as unknown as { __chat: Ctl };
    const realFetch = window.fetch.bind(window);
    const enc = new TextEncoder();
    w.__chat = { calls: [], aborted: 0, push: () => {}, close: () => {} };
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (new URL(raw, location.href).pathname !== '/api/assistant/chat') return realFetch(input, init);
      w.__chat.calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      let ctrl!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
      w.__chat.push = (chunk) => ctrl.enqueue(enc.encode(chunk));
      w.__chat.close = () => ctrl.close();
      init?.signal?.addEventListener('abort', () => {
        w.__chat.aborted += 1;
        try { ctrl.error(new DOMException('The operation was aborted.', 'AbortError')); } catch { /* ya cerrado */ }
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  return {
    push: (chunk: string) => page.evaluate((c) => (window as unknown as { __chat: { push: (s: string) => void } }).__chat.push(c), chunk),
    close: () => page.evaluate(() => (window as unknown as { __chat: { close: () => void } }).__chat.close()),
    calls: () => page.evaluate(() => (window as unknown as { __chat: { calls: Record<string, unknown>[] } }).__chat.calls),
    aborted: () => page.evaluate(() => (window as unknown as { __chat: { aborted: number } }).__chat.aborted),
  };
}

/** Una respuesta que el test suelta cuando quiere (para ver el estado «en curso»). */
function deferred() {
  let release!: () => void;
  const released = new Promise<void>((r) => { release = r; });
  return { release, released };
}

test.describe('Asistente IA', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Cuota del mes al montar el panel. Cada test puede sobrescribirla.
    await page.route('/api/assistant/usage', (route) => fulfillJson(route, 200, MOCK_ASSISTANT_USAGE));
  });

  // ─── Lanzador y panel ──────────────────────────────────────────────────────

  test('muestra el lanzador del asistente en el dashboard', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    const launcher = page.getByRole('button', { name: ES.launcher });
    await expect(launcher).toBeVisible({ timeout: 15000 });
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');
    // El panel no se monta hasta abrirlo.
    await expect(page.getByRole('dialog', { name: ES.title })).toHaveCount(0);
  });

  test('no provoca errores de hidratación al tocar la página mientras carga', async ({ authenticatedPage: page }) => {
    // En el servidor no hay usuario y el widget no pinta nada. Si /api/auth/me
    // respondía antes de hidratarse su Suspense (Safari, al hacer clic en la
    // página mientras carga), el cliente pintaba el lanzador sobre un HTML
    // vacío. Se repite porque depende del orden de llegada.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (let i = 0; i < 4; i++) {
      await page.goto('/es/dashboard/automations/autopilot');
      await page.getByRole('button', { name: /Nueva regla/ }).click();
      await expect(page.getByRole('button', { name: ES.launcher })).toBeVisible({ timeout: 15000 });
    }
    expect(errors.filter((m) => /hydrat/i.test(m))).toEqual([]);
  });

  test('abre y cierra el panel con el botón y con Escape, devolviendo el foco al lanzador', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await expect(panel.getByText('¿En qué te ayudo hoy?')).toBeVisible();
    await expect(page.getByRole('button', { name: ES.closeLauncher })).toHaveAttribute('aria-expanded', 'true');

    // Cerrar con la X del encabezado.
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(panel).toBeHidden();
    const launcher = page.getByRole('button', { name: ES.launcher });
    await expect(launcher).toBeFocused();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    // Reabrir y cerrar con Escape con el foco en el compositor.
    await launcher.click();
    await expect(panel).toBeVisible();
    const input = panel.getByRole('textbox', { name: ES.placeholder });
    await input.focus();
    await input.press('Escape');
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test('Escape con el foco fuera del panel no lo cierra', async ({ authenticatedPage: page, isMobile }) => {
    // En móvil el panel tapa toda la página: no hay «fuera» donde poner el foco.
    test.skip(isMobile, 'solo escritorio');
    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await page.locator('body').focus();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
  });

  // ─── Streaming ─────────────────────────────────────────────────────────────

  test('envía un mensaje y pinta la respuesta en streaming con markdown y chips de herramientas', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
      { type: 'tool_start', toolUseId: 'tu-1', name: 'list_content' },
      { type: 'tool_end', toolUseId: 'tu-1', name: 'list_content', ok: true, links: [{ label: 'Contenido', href: '/es/dashboard/content' }] },
      { type: 'text_delta', text: '\n\nTienes **3 borradores** ' },
      { type: 'text_delta', text: 'listos. Más ideas en [la guía](https://www.example.com/guia).' },
      { type: 'done', reason: 'end_turn', usage: { used: 11, limit: 200, remaining: 189 } },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, '¿Qué borradores tengo?');

    // Burbuja del usuario.
    await expect(panel.getByLabel('Tú')).toHaveText('¿Qué borradores tengo?');

    // Chip de la herramienta terminada: en pasado y con «Abrir».
    const chip = panel.getByRole('status').filter({ hasText: 'Buscando contenidos' });
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText('…');
    await expect(chip.getByRole('button', { name: 'Abrir' })).toBeVisible();

    // Markdown: negrita como <strong>, sin asteriscos crudos.
    const reply = panel.getByLabel('Asistente', { exact: true });
    await expect(reply.locator('strong', { hasText: '3 borradores' })).toBeVisible();
    await expect(reply).not.toContainText('**');

    // Enlace externo: pestaña nueva y el dominio a la vista.
    const link = reply.getByRole('link', { name: 'la guía' });
    await expect(link).toHaveAttribute('href', 'https://www.example.com/guia');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(reply.getByText('(example.com)')).toBeVisible();

    // Petición: idioma, página y sin conversación previa.
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ message: '¿Qué borradores tengo?', language: 'es', brandId: 'brand-test-1' });
    expect(bodies[0].conversationId).toBeUndefined();
    expect(String(bodies[0].page)).toContain('/es/dashboard');
    expect(typeof bodies[0].timezone).toBe('string');

    // El siguiente mensaje sigue la conversación que abrió message_start.
    await sendMessage(page, 'Gracias');
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies[1].conversationId).toBe('conv-new');
  });

  test('muestra los mensajes restantes del mes y los actualiza con done.usage', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
      { type: 'text_delta', text: 'Hola.' },
      { type: 'done', reason: 'end_turn', usage: { used: 11, limit: 200, remaining: 189 } },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await expect(panel.getByText('190 / 200 mensajes')).toBeVisible();

    await sendMessage(page, 'Hola');
    await expect(panel.getByText('189 / 200 mensajes')).toBeVisible();
    await expect(panel.getByText('190 / 200 mensajes')).toHaveCount(0);
  });

  // ─── Confirmaciones ────────────────────────────────────────────────────────

  test('pide confirmación con resumen y vista previa sin etiquetas untrusted_content, y confirma', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillSse(route, confirmationTurn()));
    const decisions = await mockActions(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
      { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
      {
        type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: true,
        links: [{ label: 'Calendario', href: '/es/dashboard/content/calendar' }],
      },
      { type: 'data_changed', entities: ['scheduled'] },
      { type: 'text_delta', text: 'Listo, quedó **publicado**.' },
      { type: 'done', reason: 'end_turn', usage: { used: 12, limit: 200, remaining: 188 } },
    ]));

    await recordDataChanged(page);
    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Publica el post de prueba');

    const card = panel.getByRole('group', { name: ES.confirmTitle });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Publicar «Post de prueba» en @testbrand ahora');
    // Mientras está pendiente no se ejecutó nada.
    expect(decisions).toHaveLength(0);
    await expect(card).toContainText('Post de prueba');
    await expect(card).toContainText('@testbrand');
    // El texto de terceros sale como texto: sin etiquetas y sin HTML interpretado.
    await expect(card).toContainText('Hola <b>mundo</b>');
    await expect(card.locator('b')).toHaveCount(0);
    await expect(panel).not.toContainText('untrusted_content');
    // El chip «Publicando…» se convirtió en la tarjeta.
    await expect(panel.getByRole('status').filter({ hasText: 'Publicando' })).toHaveCount(0);

    await card.getByRole('button', { name: 'Confirmar' }).click();

    await expect.poll(() => decisions.length).toBe(1);
    expect(decisions[0].url.pathname).toBe('/api/assistant/actions/act-1');
    expect(decisions[0].url.searchParams.get('lang')).toBe('es');
    expect(decisions[0].body).toEqual({ decision: 'confirm' });

    // Stream reanudado: la tarjeta queda confirmada y llega el texto nuevo.
    const done = panel.getByRole('group', { name: ES.confirmTitle });
    await expect(done).toContainText('Confirmado');
    await expect(done.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
    await expect(done.getByRole('button', { name: 'Abrir' })).toBeVisible();
    await expect(panel.locator('strong', { hasText: 'publicado' })).toBeVisible();
    await expect(panel.getByText('188 / 200 mensajes')).toBeVisible();
    // data_changed avisa a las páginas abiertas para que recarguen.
    expect(await dataChangedEvents(page)).toEqual([['scheduled']]);
  });

  test('rechaza una acción pendiente y la marca como cancelada', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillSse(route, confirmationTurn('act-2')));
    const decisions = await mockActions(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
      {
        type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: false,
        error: { code: 'rejected', status: 409, message: 'Acción cancelada.' },
      },
      { type: 'text_delta', text: 'Entendido, no lo publico.' },
      { type: 'done', reason: 'end_turn', usage: { used: 12, limit: 200, remaining: 188 } },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Publica el post de prueba');

    const card = panel.getByRole('group', { name: ES.confirmTitle });
    await card.getByRole('button', { name: 'Cancelar' }).click();

    await expect.poll(() => decisions.length).toBe(1);
    expect(decisions[0].url.pathname).toBe('/api/assistant/actions/act-2');
    expect(decisions[0].body).toEqual({ decision: 'reject' });

    await expect(card).toContainText('Cancelado');
    await expect(card.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
    await expect(card).not.toContainText('No se pudo completar');
    await expect(panel.getByText('Entendido, no lo publico.')).toBeVisible();
  });

  // ─── Tarjetas de bloqueo de la guardia ─────────────────────────────────────

  test('muestra la tarjeta de cuota del asistente agotada (429)', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillJson(route, 429, {
      error: 'Usaste tus 200 mensajes del asistente de este mes. Mejora tu plan para seguir conversando.',
      assistantQuotaExhausted: true,
      limit: 200,
      used: 200,
    }));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Hola');

    const alert = panel.getByRole('alert');
    await expect(alert).toContainText('Usaste tus 200 mensajes del asistente de este mes');
    // No es la tarjeta de créditos de IA.
    await expect(alert).not.toContainText('créditos');
    const plans = alert.getByRole('link', { name: 'Ver planes' });
    await expect(plans).toHaveAttribute('href', '/es/dashboard/settings');
    await expect(alert.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  });

  test('muestra la tarjeta de suscripción requerida (402)', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillJson(route, 402, {
      error: 'Tu periodo de prueba terminó.',
      subscriptionRequired: true,
      reason: 'trial_expired',
      status: 'trialing',
    }));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Hola');

    const alert = panel.getByRole('alert');
    await expect(alert).toContainText('Tu suscripción no está activa. Reactívala para seguir usando el asistente.');
    await expect(alert.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/es/dashboard/settings');
  });

  // ─── Historial ─────────────────────────────────────────────────────────────

  test('lista el historial de conversaciones y carga una', async ({ authenticatedPage: page }) => {
    await page.route(/\/api\/assistant\/conversations(\?.*)?$/, (route) => fulfillJson(route, 200, {
      conversations: MOCK_ASSISTANT_CONVERSATIONS,
      usage: { used: 20, limit: 200, remaining: 180 },
    }));
    await page.route('/api/assistant/conversations/conv-2', (route) => fulfillJson(route, 200, MOCK_ASSISTANT_CONVERSATION_2));
    const bodies = await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-2', turnId: 'turn-2' },
      { type: 'text_delta', text: 'Sigue subiendo.' },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await panel.getByRole('button', { name: 'Historial' }).click();

    await expect(panel.getByRole('button', { name: /Ideas para el lanzamiento/ })).toBeVisible();
    await expect(panel.getByText('180 / 200 mensajes')).toBeVisible();
    await panel.getByRole('button', { name: /Métricas de septiembre/ }).click();

    // Vuelve al chat con los mensajes guardados.
    await expect(panel.getByLabel('Tú')).toHaveText('¿Cómo van mis publicaciones?');
    await expect(panel.locator('strong', { hasText: '1.000 impresiones' })).toBeVisible();
    await expect(panel.getByRole('status').filter({ hasText: 'Revisando métricas' })).toBeVisible();

    // Un mensaje nuevo continúa esa conversación.
    await sendMessage(page, '¿Y la semana pasada?');
    await expect(panel.getByText('Sigue subiendo.')).toBeVisible();
    expect(bodies[0].conversationId).toBe('conv-2');
  });

  // ─── Inglés ────────────────────────────────────────────────────────────────

  test('usa el copy en inglés en /en y pide las decisiones con lang=en', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-en', turnId: 'turn-1' },
      { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
      {
        type: 'confirmation_required', actionId: 'act-en', toolUseId: 'tu-pub', name: 'publish_content',
        summary: 'Publish «Test post» on @testbrand now',
        preview: { title: 'Test post', accounts: ['@testbrand'] },
        credits: 0, expiresAt: inAnHour(),
      },
      { type: 'done', reason: 'awaiting_confirmation', usage: { used: 11, limit: 200, remaining: 189 } },
    ]));
    const decisions = await mockActions(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-en', turnId: 'turn-1' },
      { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
      { type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: true },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/en/dashboard');
    const panel = await openAssistant(page, EN);
    await expect(panel.getByText('How can I help today?')).toBeVisible();
    await expect(panel.getByText('190 / 200 messages')).toBeVisible();

    await sendMessage(page, 'Publish the test post', EN.placeholder);
    const card = panel.getByRole('group', { name: EN.confirmTitle });
    await expect(card).toContainText('Publish «Test post» on @testbrand now');
    expect(bodies).toHaveLength(1);
    await expect(card.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await card.getByRole('button', { name: 'Confirm' }).click();

    await expect(card).toContainText('Confirmed');
    expect(bodies[0].language).toBe('en');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].url.searchParams.get('lang')).toBe('en');
  });

  test('muestra la tarjeta de cuota agotada en inglés', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillJson(route, 429, {
      error: "You've used all 50 assistant messages for this month. Upgrade your plan to keep chatting.",
      assistantQuotaExhausted: true,
      limit: 50,
      used: 50,
    }));

    await page.goto('/en/dashboard');
    const panel = await openAssistant(page, EN);
    await sendMessage(page, 'Hello', EN.placeholder);
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText("You've used all 50 assistant messages for this month.");
    await expect(alert.getByRole('link', { name: 'View plans' })).toHaveAttribute('href', '/en/dashboard/settings');
  });

  // ─── Móvil ─────────────────────────────────────────────────────────────────

  test('en móvil el panel ocupa toda la pantalla por encima del BottomNav', async ({ authenticatedPage: page, isMobile }) => {
    test.skip(!isMobile, 'solo móvil');
    await page.goto('/es/dashboard');

    const nav = page.locator('nav.bottom-nav');
    await expect(nav).toBeVisible({ timeout: 15000 });
    const navBox = (await nav.boundingBox())!;

    // Cerrado, el lanzador flota por encima de la barra inferior sin taparla.
    const launcher = page.getByRole('button', { name: ES.launcher });
    await expect(launcher).toBeVisible();
    const launcherBox = (await launcher.boundingBox())!;
    expect(launcherBox.y + launcherBox.height).toBeLessThanOrEqual(navBox.y);

    const panel = await openAssistant(page);
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(viewport.width);
    expect(box.height).toBe(viewport.height);

    // Lo que se ve en la franja del BottomNav y sobre el botón de enviar es el
    // panel, no la barra.
    const send = panel.getByRole('button', { name: 'Enviar' });
    const sendBox = (await send.boundingBox())!;
    expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(viewport.height);
    const hits = await page.evaluate(([nx, ny, sx, sy]) => {
      const inPanel = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('.assistant-panel');
      return { navArea: inPanel(nx, ny), sendButton: inPanel(sx, sy) };
    }, [navBox.x + navBox.width / 2, navBox.y + navBox.height / 2, sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2]);
    expect(hits).toEqual({ navArea: true, sendButton: true });

    // Se puede escribir y enviar sin que nada tape el compositor.
    await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-m', turnId: 't' },
      { type: 'text_delta', text: 'Hola desde el móvil.' },
      { type: 'done', reason: 'end_turn' },
    ]));
    await panel.getByRole('textbox', { name: ES.placeholder }).fill('Hola');
    await send.click();
    await expect(panel.getByText('Hola desde el móvil.')).toBeVisible();
  });
});

// ─── Estado en curso, errores, navegación y persistencia ─────────────────────

test.describe('Asistente IA: stream en curso, errores y persistencia', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('/api/assistant/usage', (route) => fulfillJson(route, 200, MOCK_ASSISTANT_USAGE));
  });

  test('pinta el stream a medida que llega: pensando, chip girando, texto parcial y cierre', async ({ authenticatedPage: page }) => {
    const chat = await installControlledChat(page);
    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, '¿Qué borradores tengo?');

    // Antes del primer evento: «Pensando…» y «Detener» en lugar de «Enviar».
    await expect(panel.getByText('Pensando…')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Detener' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Enviar' })).toHaveCount(0);
    expect(await chat.calls()).toHaveLength(1);

    await chat.push(sseBody([
      { type: 'message_start', conversationId: 'conv-live', turnId: 't1' },
      { type: 'tool_start', toolUseId: 'tu-1', name: 'list_content' },
    ], { ping: true }));
    // El chip corre: con puntos suspensivos y sin «Abrir».
    const chip = panel.getByRole('status').filter({ hasText: 'Buscando contenidos' });
    await expect(chip).toHaveText(/Buscando contenidos…/);
    await expect(chip.getByRole('button', { name: 'Abrir' })).toHaveCount(0);
    await expect(panel.getByText('Pensando…')).toHaveCount(0);

    // Mientras responde no se manda otro mensaje: Enter no envía y el borrador queda.
    const input = panel.getByRole('textbox', { name: ES.placeholder });
    await input.fill('Otra cosa');
    await input.press('Enter');
    await expect(input).toHaveValue('Otra cosa');
    expect(await chat.calls()).toHaveLength(1);

    // Un frame partido entre dos trozos se arma igual.
    const frames = sseBody([
      { type: 'tool_end', toolUseId: 'tu-1', name: 'list_content', ok: true, links: [{ label: 'Contenido', href: '/es/dashboard/content' }] },
      { type: 'text_delta', text: 'Tienes **3 borradores**' },
    ]);
    const cut = frames.length - 10;
    await chat.push(frames.slice(0, cut));
    await expect(chip).toHaveText(/Buscando contenidos(?!…)/);
    await expect(panel.getByText('Tienes')).toHaveCount(0);
    await chat.push(frames.slice(cut));
    const reply = panel.getByLabel('Asistente', { exact: true });
    await expect(reply.locator('strong', { hasText: '3 borradores' })).toBeVisible();
    await expect(chip.getByRole('button', { name: 'Abrir' })).toBeVisible();
    // Sigue en curso hasta `done` y el cierre del stream.
    await expect(panel.getByRole('button', { name: 'Detener' })).toBeVisible();

    await chat.push(sseBody([
      { type: 'text_delta', text: ' listos.' },
      { type: 'done', reason: 'end_turn', usage: { used: 11, limit: 200, remaining: 189 } },
    ]));
    await chat.close();
    await expect(reply).toContainText('Tienes 3 borradores listos.');
    await expect(panel.getByRole('button', { name: 'Detener' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Enviar' })).toBeEnabled(); // el borrador «Otra cosa» sigue ahí
    await expect(panel.getByText('189 / 200 mensajes')).toBeVisible();

    // Ahora sí se envía, en la misma conversación.
    await input.press('Enter');
    await expect.poll(async () => (await chat.calls()).length).toBe(2);
    expect((await chat.calls())[1]).toMatchObject({ message: 'Otra cosa', conversationId: 'conv-live' });
  });

  test('Detener corta la respuesta: queda lo recibido, el chip no sigue girando y no hay error', async ({ authenticatedPage: page }) => {
    const chat = await installControlledChat(page);
    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Crea un carrusel');

    await chat.push(sseBody([
      { type: 'message_start', conversationId: 'conv-stop', turnId: 't1' },
      { type: 'text_delta', text: 'Empiezo con el carrusel.' },
      { type: 'tool_start', toolUseId: 'tu-c', name: 'create_carousel' },
    ]));
    const chip = panel.getByRole('status').filter({ hasText: 'Creando carrusel' });
    await expect(chip).toHaveText(/Creando carrusel…/);

    await panel.getByRole('button', { name: 'Detener' }).click();
    await expect.poll(() => chat.aborted()).toBe(1);

    await expect(panel.getByRole('button', { name: 'Detener' })).toHaveCount(0);
    await expect(panel.getByText('Empiezo con el carrusel.')).toBeVisible();
    // El chip que giraba ya no va a terminar: se marca como fallido, sin spinner.
    await expect(chip).toContainText('Creando carrusel · Falló');
    await expect(chip).not.toContainText('…');
    await expect(panel.getByRole('alert')).toHaveCount(0);
  });

  test('Detener antes de la respuesta del servidor aborta la petición sin tarjeta de error', async ({ authenticatedPage: page }) => {
    const gate = deferred();
    const answered = deferred();
    await mockChat(page, async (route) => {
      await gate.released;
      // La página ya abortó el fetch: esta respuesta tardía no debe pintarse.
      await fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-late', turnId: 't1' },
        { type: 'text_delta', text: 'Respuesta tardía.' },
        { type: 'done', reason: 'end_turn' },
      ]).catch(() => {});
      answered.release();
    });
    const failed: string[] = [];
    page.on('requestfailed', (r) => { if (r.url().includes('/api/assistant/chat')) failed.push(r.url()); });

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Hola');
    await expect(panel.getByText('Pensando…')).toBeVisible();
    await panel.getByRole('button', { name: 'Detener' }).click();

    await expect(panel.getByText('Pensando…')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Detener' })).toHaveCount(0);
    await expect(panel.getByLabel('Tú')).toHaveText('Hola');
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => failed.length).toBe(1);

    gate.release();
    await answered.released;
    await expect(panel.getByText('Respuesta tardía.')).toHaveCount(0);
    await expect(panel.getByRole('alert')).toHaveCount(0);
  });

  test('un mensaje nuevo cancela la confirmación pendiente solo si el servidor acepta el turno', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route, _body, n) => {
      if (n === 1) return fulfillSse(route, confirmationTurn('act-sup'));
      if (n === 2) {
        return fulfillJson(route, 429, {
          error: 'Usaste tus 200 mensajes del asistente de este mes.', assistantQuotaExhausted: true, limit: 200, used: 200,
        });
      }
      return fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-3' },
        { type: 'text_delta', text: 'Vale, dejé la publicación de lado.' },
        { type: 'done', reason: 'end_turn' },
      ]);
    });
    const decisions = await mockActions(page, (route) => fulfillSse(route, [{ type: 'done', reason: 'end_turn' }]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Publica el post de prueba');
    const card = panel.getByRole('group', { name: ES.confirmTitle });
    await expect(card.getByRole('button', { name: 'Confirmar' })).toBeEnabled();

    // La guardia rechaza el turno (429): la tarjeta sigue pendiente y usable.
    await sendMessage(page, 'Mejor otra cosa');
    await expect(panel.getByRole('alert')).toContainText('Usaste tus 200 mensajes');
    await expect(card).not.toContainText('Cancelado');
    await expect(card.getByRole('button', { name: 'Confirmar' })).toBeEnabled();

    // El servidor acepta el siguiente (message_start): la tarjeta queda cancelada.
    await sendMessage(page, 'Mejor otra cosa, de verdad');
    await expect(panel.getByText('Vale, dejé la publicación de lado.')).toBeVisible();
    await expect(card).toContainText('Cancelado');
    await expect(card.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
    expect(bodies).toHaveLength(3);
    expect(decisions).toHaveLength(0);
  });

  test('muestra «Ejecutando…» mientras decide y avisa si el stream termina sin resultado', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillSse(route, confirmationTurn('act-cut')));
    const gate = deferred();
    await mockActions(page, async (route) => {
      await gate.released;
      // Se corta sin tool_end: no se sabe si la acción se hizo.
      await fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-new', turnId: 'turn-1' },
        { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
        { type: 'done', reason: 'aborted' },
      ]);
    });

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Publica el post de prueba');
    const card = panel.getByRole('group', { name: ES.confirmTitle });
    await card.getByRole('button', { name: 'Confirmar' }).click();

    await expect(card).toContainText('Ejecutando…');
    await expect(card.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
    // Mientras se decide no se puede escribir otro mensaje.
    await expect(panel.getByRole('button', { name: 'Detener' })).toBeVisible();

    gate.release();
    await expect(card).toContainText('No sabemos si se completó');
    await expect(card).not.toContainText('Ejecutando…');
    await expect(card).not.toContainText('Confirmado');
  });

  test('una confirmación vencida no deja decidir, ni por plazo ni por 409 del servidor', async ({ authenticatedPage: page }) => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await mockChat(page, (route, _body, n) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-new', turnId: `turn-${n}` },
      {
        type: 'confirmation_required', actionId: `act-${n}`, toolUseId: `tu-${n}`, name: 'publish_content',
        summary: `Publicar el post ${n}`, preview: {}, credits: 0, expiresAt: n === 1 ? past : inAnHour(),
      },
      { type: 'done', reason: 'awaiting_confirmation' },
    ]));
    const decisions = await mockActions(page, (route) => fulfillJson(route, 409, { error: 'Action is no longer pending' }));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);

    // 1) Llega ya vencida: sin botones, con el aviso.
    await sendMessage(page, 'Publica el post 1');
    const first = panel.getByRole('group', { name: ES.confirmTitle }).filter({ hasText: 'Publicar el post 1' });
    await expect(first).toContainText('Esta confirmación venció');
    await expect(first.getByRole('button')).toHaveCount(0);

    // 2) Vigente, pero el servidor dice que ya no está pendiente (409).
    await sendMessage(page, 'Publica el post 2');
    const second = panel.getByRole('group', { name: ES.confirmTitle }).filter({ hasText: 'Publicar el post 2' });
    await second.getByRole('button', { name: 'Confirmar' }).click();
    await expect(second).toContainText('Esta confirmación venció');
    await expect(second.getByRole('button')).toHaveCount(0);
    // El 409 no se muestra además como tarjeta de error.
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(decisions.map((d) => d.url.pathname)).toEqual(['/api/assistant/actions/act-2']);
  });

  test('ui_action y «Abrir» navegan solo dentro del dashboard del idioma', async ({ authenticatedPage: page, isMobile }) => {
    await mockChat(page, (route, _body, n) => {
      if (n === 1) {
        return fulfillSse(route, [
          { type: 'message_start', conversationId: 'conv-nav', turnId: 't1' },
          { type: 'ui_action', action: { type: 'navigate', href: 'https://evil.example.com/es/dashboard' } },
          { type: 'ui_action', action: { type: 'navigate', href: '//evil.example.com/es/dashboard' } },
          { type: 'ui_action', action: { type: 'navigate', href: '/es/login' } },
          { type: 'ui_action', action: { type: 'navigate', href: '/en/dashboard/content' } },
          { type: 'ui_action', action: { type: 'navigate', href: '/es/dashboardx' } },
          { type: 'tool_start', toolUseId: 'tu-ext', name: 'list_content' },
          { type: 'tool_end', toolUseId: 'tu-ext', name: 'list_content', ok: true, links: [{ label: 'Fuera', href: 'https://evil.example.com/' }] },
          { type: 'text_delta', text: 'Nada que abrir.' },
          { type: 'done', reason: 'end_turn' },
        ]);
      }
      if (n === 2) {
        return fulfillSse(route, [
          { type: 'message_start', conversationId: 'conv-nav', turnId: 't2' },
          { type: 'tool_start', toolUseId: 'tu-in', name: 'get_brand_profile' },
          { type: 'tool_end', toolUseId: 'tu-in', name: 'get_brand_profile', ok: true, links: [{ label: 'Identidad', href: '/es/dashboard/brand/identity' }] },
          { type: 'done', reason: 'end_turn' },
        ]);
      }
      return fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-nav', turnId: 't3' },
        { type: 'ui_action', action: { type: 'navigate', href: '/es/dashboard/content/calendar' } },
        { type: 'text_delta', text: 'Te llevé al calendario.' },
        { type: 'done', reason: 'end_turn' },
      ]);
    });

    await page.goto('/es/dashboard');
    let panel = await openAssistant(page);

    // 1) Destinos fuera del dashboard (u otro idioma): se ignoran.
    await sendMessage(page, 'Llévame a otro sitio');
    await expect(panel.getByText('Nada que abrir.')).toBeVisible();
    await expect(page).toHaveURL(/\/es\/dashboard$/);
    const extChip = panel.getByRole('status').filter({ hasText: 'Buscando contenidos' });
    await expect(extChip).toBeVisible();
    await expect(extChip.getByRole('button', { name: 'Abrir' })).toHaveCount(0);

    // 2) «Abrir» en el chip lleva al enlace interno.
    await sendMessage(page, '¿Cómo está mi marca?');
    const chip = panel.getByRole('status').filter({ hasText: 'Leyendo el perfil de marca' });
    await chip.getByRole('button', { name: 'Abrir' }).click();
    await expect(page).toHaveURL(/\/es\/dashboard\/brand\/identity$/, { timeout: 20000 });
    if (isMobile) {
      // En móvil el panel tapa la página: al navegar se cierra.
      await expect(panel).toBeHidden();
      panel = await openAssistant(page);
    } else {
      await expect(panel).toBeVisible();
    }
    // La conversación sobrevive a la navegación.
    await expect(panel.getByText('Nada que abrir.')).toBeVisible();

    // 3) ui_action interno: navega solo.
    await sendMessage(page, 'Abre el calendario');
    await expect(page).toHaveURL(/\/es\/dashboard\/content\/calendar$/, { timeout: 20000 });
    if (isMobile) await expect(panel).toBeHidden();
    else await expect(panel.getByText('Te llevé al calendario.')).toBeVisible();
  });

  test('el markdown no convierte en enlace javascript: ni interpreta HTML crudo', async ({ authenticatedPage: page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-md', turnId: 't1' },
      {
        type: 'text_delta',
        text: [
          'Haz [clic aquí](javascript:alert%281%29) o mira [esto](data:text/html,hola).',
          '<img src=x onerror="window.pwned=1"> <script>window.pwned=2</script>',
          'Tu [calendario](/es/dashboard/content/calendar) está al día.',
        ].join('\n\n'),
      },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Hola');

    const reply = panel.getByLabel('Asistente', { exact: true });
    await expect(reply.getByText('clic aquí')).toBeVisible();
    await expect(reply.getByRole('link', { name: 'clic aquí' })).toHaveCount(0);
    await expect(reply.getByRole('link', { name: 'esto' })).toHaveCount(0);
    await expect(reply.locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
    // El HTML sale como texto.
    await expect(reply).toContainText('Haz clic aquí o mira esto.');
    await expect(reply).toContainText('<img src=x onerror="window.pwned=1">');
    await expect(reply).toContainText('<script>window.pwned=2</script>');
    await expect(reply.locator('img, script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
    expect(dialogs).toEqual([]);
    // Los enlaces relativos sí son internos y sin pestaña nueva.
    const internal = reply.getByRole('link', { name: 'calendario' });
    await expect(internal).toHaveAttribute('href', '/es/dashboard/content/calendar');
    await expect(internal).not.toHaveAttribute('target', /.+/);
  });

  test('rate limit: cuenta atrás y «Reintentar» repite el mensaje sin duplicarlo', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route, _body, n) => (n === 1
      ? fulfillJson(route, 429, { error: 'Too many requests', retryAfter: 2 })
      : fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-rl', turnId: 't1' },
        { type: 'text_delta', text: 'Ahora sí, hola.' },
        { type: 'done', reason: 'end_turn' },
      ])));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Hola');

    const alert = panel.getByRole('alert');
    await expect(alert).toContainText(/Vas muy rápido\. Podrás reintentar en [12] s\./);
    const retry = alert.getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeDisabled();
    // No es la tarjeta de cuota ni de suscripción.
    await expect(alert.getByRole('link', { name: 'Ver planes' })).toHaveCount(0);

    await expect(alert).toContainText('Ya puedes reintentar.', { timeout: 5000 });
    await expect(retry).toBeEnabled();
    await retry.click();

    await expect(panel.getByText('Ahora sí, hola.')).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    // El intento fallido se quitó: un solo mensaje del usuario.
    await expect(panel.getByLabel('Tú')).toHaveCount(1);
    expect(bodies.map((b) => b.message)).toEqual(['Hola', 'Hola']);
  });

  test('muestra los errores del stream: red, proveedor, rechazo, créditos y límite de pasos', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route, _body, n) => {
      const start: SseEvent = { type: 'message_start', conversationId: 'conv-err', turnId: `t${n}` };
      switch (n) {
        case 1: return route.abort('failed');
        case 2: return fulfillSse(route, [start, { type: 'error', code: 'provider_error', message: 'El modelo no respondió a tiempo.' }, { type: 'done', reason: 'end_turn' }]);
        case 3: return fulfillSse(route, [start, { type: 'error', code: 'refusal', message: 'refusal' }, { type: 'done', reason: 'refusal' }]);
        case 4: return fulfillSse(route, [
          start,
          { type: 'tool_start', toolUseId: 'tu-img', name: 'generate_content_image' },
          {
            type: 'tool_end', toolUseId: 'tu-img', name: 'generate_content_image', ok: false,
            error: { code: 'credits_exhausted', status: 429, message: 'Sin créditos' },
          },
          { type: 'error', code: 'credits_exhausted', status: 429, message: 'Sin créditos', body: { creditsExhausted: true, limit: 150, used: 150 } },
          { type: 'done', reason: 'end_turn' },
        ]);
        default: return fulfillSse(route, [start, { type: 'text_delta', text: 'Hice varias cosas.' }, { type: 'done', reason: 'step_limit' }]);
      }
    });

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    const alerts = panel.getByRole('alert');

    await sendMessage(page, 'uno');
    await expect(alerts.nth(0)).toHaveText('No pudimos conectar con el asistente. Revisa tu conexión.');

    await sendMessage(page, 'dos');
    await expect(alerts.nth(1)).toHaveText('El modelo no respondió a tiempo.');

    await sendMessage(page, 'tres');
    await expect(alerts.nth(2)).toHaveText('No puedo ayudar con esa solicitud.');

    await sendMessage(page, 'cuatro');
    const credits = alerts.nth(3);
    await expect(credits).toContainText('Usaste los 150 créditos de IA de este mes.');
    await expect(credits.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/es/dashboard/settings');
    const imgChip = panel.getByRole('status').filter({ hasText: 'Generando imagen' });
    await expect(imgChip).toContainText('Falló');
    await expect(panel.getByText('Sin créditos', { exact: true })).toBeVisible();

    await sendMessage(page, 'cinco');
    await expect(alerts.nth(4)).toHaveText('Este pedido necesitó demasiados pasos y me detuve. Dime cómo seguir.');
    await expect(panel.getByText('Hice varias cosas.')).toBeVisible();
    await expect(alerts).toHaveCount(5);
  });

  test('una sesión vencida (401) se renueva y el mensaje se reintenta solo', async ({ authenticatedPage: page }) => {
    let refreshes = 0;
    await page.route('/api/auth/refresh', (route) => { refreshes += 1; return fulfillJson(route, 200, { ok: true }); });
    const bodies = await mockChat(page, (route, _body, n) => (n === 1
      ? fulfillJson(route, 401, { error: 'Unauthorized' })
      : fulfillSse(route, [
        { type: 'message_start', conversationId: 'conv-401', turnId: 't1' },
        { type: 'text_delta', text: 'Sesión renovada, aquí estoy.' },
        { type: 'done', reason: 'end_turn' },
      ])));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    const before = refreshes;
    await sendMessage(page, 'Hola');

    await expect(panel.getByText('Sesión renovada, aquí estoy.')).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].message).toBe('Hola');
    expect(refreshes - before).toBe(1);
    await expect(page).toHaveURL(/\/es\/dashboard$/);
  });

  test('la conversación sigue al cerrar el panel y al recargar la página', async ({ authenticatedPage: page }) => {
    await mockChat(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-keep', turnId: 't1' },
      { type: 'text_delta', text: 'Respuesta que no se pierde.' },
      { type: 'done', reason: 'end_turn' },
    ]));
    const loads: string[] = [];
    await page.route('/api/assistant/conversations/conv-keep', (route) => {
      loads.push(route.request().method());
      return fulfillJson(route, 200, {
        conversation: { id: 'conv-keep', title: 'Guardada', brand_id: 'brand-test-1', last_message_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z' },
        messages: [
          { id: 'm1', role: 'user', text: 'Pregunta guardada', createdAt: '2026-09-22T10:00:00Z', tools: [] },
          { id: 'm2', role: 'assistant', text: 'Respuesta que no se pierde.', createdAt: '2026-09-22T10:00:01Z', tools: [] },
        ],
        pendingActions: [],
      });
    });

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Pregunta guardada');
    await expect(panel.getByText('Respuesta que no se pierde.')).toBeVisible();

    // Cerrar y reabrir: el panel solo se oculta.
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: ES.launcher }).click();
    await expect(panel.getByText('Respuesta que no se pierde.')).toBeVisible();
    expect(loads).toEqual([]);

    // Recargar: el panel vuelve abierto y recupera la conversación de la pestaña.
    await page.reload();
    const reopened = page.getByRole('dialog', { name: ES.title });
    await expect(reopened).toBeVisible({ timeout: 15000 });
    await expect(reopened.getByLabel('Tú')).toHaveText('Pregunta guardada');
    await expect(reopened.getByText('Respuesta que no se pierde.')).toBeVisible();
    // En dev, StrictMode monta el efecto dos veces (la primera carga se aborta):
    // lo que importa es que se pidió esa conversación, y solo tras recargar.
    expect(loads.length).toBeGreaterThanOrEqual(1);
    expect(new Set(loads)).toEqual(new Set(['GET']));
  });

  test('«Nueva conversación» limpia el chat y el siguiente mensaje empieza otra', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route, _body, n) => fulfillSse(route, [
      { type: 'message_start', conversationId: `conv-${n}`, turnId: 't' },
      { type: 'text_delta', text: `Respuesta ${n}.` },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await sendMessage(page, 'Primera');
    await expect(panel.getByText('Respuesta 1.')).toBeVisible();

    await panel.getByRole('button', { name: 'Nueva conversación' }).click();
    await expect(panel.getByText('¿En qué te ayudo hoy?')).toBeVisible();
    await expect(panel.getByText('Respuesta 1.')).toHaveCount(0);

    await sendMessage(page, 'Segunda');
    await expect(panel.getByText('Respuesta 2.')).toBeVisible();
    expect(bodies[0].conversationId).toBeUndefined();
    expect(bodies[1].conversationId).toBeUndefined();
  });

  test('archiva una conversación desde el historial', async ({ authenticatedPage: page }) => {
    await page.route(/\/api\/assistant\/conversations(\?.*)?$/, (route) => fulfillJson(route, 200, {
      conversations: MOCK_ASSISTANT_CONVERSATIONS, usage: null,
    }));
    const deletes: string[] = [];
    await page.route(/\/api\/assistant\/conversations\/conv-[12]$/, (route) => {
      const req = route.request();
      if (req.method() === 'DELETE') {
        deletes.push(new URL(req.url()).pathname);
        return route.fulfill({ status: 204, body: '' });
      }
      return fulfillJson(route, 200, MOCK_ASSISTANT_CONVERSATION_2);
    });

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await panel.getByRole('button', { name: 'Historial' }).click();
    await panel.getByRole('button', { name: /Métricas de septiembre/ }).click();
    await expect(panel.getByText('1.000 impresiones')).toBeVisible();

    await panel.getByRole('button', { name: 'Historial' }).click();
    const row = panel.getByRole('listitem').filter({ hasText: 'Métricas de septiembre' });
    await row.getByRole('button', { name: 'Archivar conversación' }).click();

    await expect(row).toHaveCount(0);
    await expect(panel.getByRole('listitem').filter({ hasText: 'Ideas para el lanzamiento' })).toBeVisible();
    expect(deletes).toEqual(['/api/assistant/conversations/conv-2']);

    // Era la conversación abierta: el chat queda vacío.
    await panel.getByRole('button', { name: 'Volver' }).click();
    await expect(panel.getByText('¿En qué te ayudo hoy?')).toBeVisible();
    await expect(panel.getByText('1.000 impresiones')).toHaveCount(0);
  });

  test('una conversación del historial con una acción pendiente se puede confirmar', async ({ authenticatedPage: page }) => {
    await page.route(/\/api\/assistant\/conversations(\?.*)?$/, (route) => fulfillJson(route, 200, {
      conversations: [{ id: 'conv-p', title: 'Publicación pendiente', last_message_at: '2026-09-22T10:00:00Z', brand_id: 'brand-test-1' }],
      usage: null,
    }));
    await page.route('/api/assistant/conversations/conv-p', (route) => fulfillJson(route, 200, {
      conversation: { id: 'conv-p', title: 'Publicación pendiente', brand_id: 'brand-test-1', last_message_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z' },
      messages: [
        { id: 'm1', role: 'user', text: 'Publica el post', createdAt: '2026-09-22T10:00:00Z', tools: [] },
        { id: 'm2', role: 'assistant', text: 'Te dejo la confirmación.', createdAt: '2026-09-22T10:00:01Z', tools: [{ toolUseId: 'tu-p', name: 'publish_content', status: 'pending' }] },
      ],
      pendingActions: [{
        actionId: 'act-p', toolUseId: 'tu-p', name: 'publish_content', summary: 'Publicar «Post guardado» en @testbrand',
        preview: { title: 'Post guardado' }, credits: 0, expiresAt: inAnHour(),
      }],
    }));
    const decisions = await mockActions(page, (route) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-p', turnId: 't2' },
      { type: 'tool_start', toolUseId: 'tu-p', name: 'publish_content' },
      { type: 'tool_end', toolUseId: 'tu-p', name: 'publish_content', ok: true },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await panel.getByRole('button', { name: 'Historial' }).click();
    await panel.getByRole('button', { name: /Publicación pendiente/ }).click();

    const card = panel.getByRole('group', { name: ES.confirmTitle });
    await expect(card).toContainText('Publicar «Post guardado» en @testbrand');
    // La tarjeta ocupa el lugar del chip: no hay chip «Esperando confirmación».
    await expect(panel.getByRole('status').filter({ hasText: 'Publicando' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Confirmar' }).click();
    await expect(card).toContainText('Confirmado');
    expect(decisions.map((d) => [d.url.pathname, d.body.decision])).toEqual([['/api/assistant/actions/act-p', 'confirm']]);
  });

  test('el compositor: Shift+Enter hace salto de línea, vacío no envía y las sugerencias envían', async ({ authenticatedPage: page }) => {
    const bodies = await mockChat(page, (route, _body, n) => fulfillSse(route, [
      { type: 'message_start', conversationId: 'conv-c', turnId: `t${n}` },
      { type: 'text_delta', text: `Ok ${n}.` },
      { type: 'done', reason: 'end_turn' },
    ]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    const input = panel.getByRole('textbox', { name: ES.placeholder });
    const send = panel.getByRole('button', { name: 'Enviar' });

    // La sugerencia se envía tal cual.
    const suggestion = 'Resume mis mensajes sin leer';
    await panel.getByRole('button', { name: suggestion }).click();
    await expect(panel.getByText('Ok 1.')).toBeVisible();
    expect(bodies[0].message).toBe(suggestion);

    await expect(send).toBeDisabled();
    await input.fill('   ');
    await expect(send).toBeDisabled();
    await input.press('Enter');

    await input.fill('línea 1');
    await input.press('Shift+Enter');
    await input.pressSequentially('línea 2');
    await expect(input).toHaveValue('línea 1\nlínea 2');
    expect(bodies).toHaveLength(1);

    await input.press('Enter');
    await expect(panel.getByText('Ok 2.')).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].message).toBe('línea 1\nlínea 2');
    await expect(panel.getByLabel('Tú').last()).toHaveText('línea 1\nlínea 2');
    await expect(input).toHaveValue('');
  });

  test('con la suscripción inactiva el compositor queda deshabilitado', async ({ authenticatedPage: page }) => {
    await page.route('/api/auth/me', (route) => fulfillJson(route, 200, {
      user: { id: 'user-test-1', email: 'test@kefy.com', name: 'Test User' },
      org: { id: 'org-test-1', name: 'Test Org', slug: 'test-org', plan: 'starter' },
      role: 'owner',
      plan: 'starter',
      subscription: {
        canCreate: false, status: 'trialing', isTrialing: true, periodEnd: null, trialDaysLeft: 0, reason: 'trial_expired',
      },
    }));
    const bodies = await mockChat(page, (route) => fulfillSse(route, [{ type: 'done', reason: 'end_turn' }]));

    await page.goto('/es/dashboard');
    const panel = await openAssistant(page);
    await expect(panel.getByText('Tu suscripción no está activa. Reactívala para seguir usando el asistente.')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Ir a configuración' })).toHaveAttribute('href', '/es/dashboard/settings');
    await expect(panel.getByRole('textbox', { name: ES.placeholder })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Resume mis mensajes sin leer' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(bodies).toHaveLength(0);
  });

  test('no aparece mientras el onboarding está abierto', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard?onboarding=1');
    const onboarding = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Empezar' }) });
    await expect(onboarding).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: ES.launcher })).toHaveCount(0);

    await onboarding.getByRole('button', { name: 'Empezar' }).click();
    await expect(onboarding).toBeHidden();
    await expect(page.getByRole('button', { name: ES.launcher })).toBeVisible();
  });
});
