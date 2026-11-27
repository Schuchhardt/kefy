/**
 * zernio-webhook-events.ts
 *
 * Revisa que el webhook de Kefy en Zernio tenga suscritos todos los eventos que
 * Kefy necesita (lib/zernio-webhook-events.ts) y, con --apply, añade los que
 * falten sin quitar ninguno. Zernio solo entrega los eventos listados: un
 * webhook sin account.disconnected deja cuentas desconectadas como «Activas».
 *
 * Necesita la API key de Zernio de producción en ZERNIO_API_KEY (y, si aplica,
 * ZERNIO_API_URL). No imprime el secreto del webhook.
 *
 * Uso:
 *   ZERNIO_API_KEY=… npx tsx scripts/zernio-webhook-events.ts          # solo revisa
 *   ZERNIO_API_KEY=… npx tsx scripts/zernio-webhook-events.ts --apply  # añade los que faltan
 *
 * Ver docs/zernio.md («Eventos suscritos»).
 */

import { REQUIRED_ZERNIO_WEBHOOK_EVENTS } from '../lib/zernio-webhook-events';

const BASE = process.env.ZERNIO_API_URL ?? 'https://zernio.com/api/v1';
const KEY = process.env.ZERNIO_API_KEY;
const KEFY_URL = /kefy\.app\/api\/webhooks\/zernio/;

interface WebhookSetting {
  _id?: string;
  id?: string;
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
  disabledReason?: string | null;
}

async function zernio<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  if (!KEY) throw new Error('Falta ZERNIO_API_KEY');
  const apply = process.argv.includes('--apply');

  const res = await zernio<{ webhooks?: WebhookSetting[] } | WebhookSetting[]>('GET', '/webhooks/settings');
  const all = Array.isArray(res) ? res : res.webhooks ?? [];
  const hooks = all.filter((w) => KEFY_URL.test(w.url ?? ''));
  if (hooks.length === 0) {
    console.error(`Ningún webhook apunta a kefy.app/api/webhooks/zernio (hay ${all.length}).`);
    process.exit(1);
  }

  let missingAny = false;
  for (const hook of hooks) {
    const id = hook.id ?? hook._id;
    const events = hook.events ?? [];
    const missing = REQUIRED_ZERNIO_WEBHOOK_EVENTS.filter((e) => !events.includes(e));
    console.log(`\nWebhook «${hook.name ?? id}» → ${hook.url}`);
    console.log(`  activo: ${hook.isActive !== false}${hook.disabledReason ? ` (pausado: ${hook.disabledReason})` : ''}`);
    if (!/^https:\/\/www\.kefy\.app\//.test(hook.url ?? '')) {
      console.log('  ⚠ La URL debería ser https://www.kefy.app/… (con www): sin www Vercel responde 308.');
    }
    console.log(`  suscritos: ${events.length}`);
    if (missing.length === 0) {
      console.log('  ✓ Tiene todos los eventos que Kefy necesita.');
      continue;
    }
    missingAny = true;
    console.log(`  ✗ Faltan: ${missing.join(', ')}`);
    if (apply && id) {
      await zernio('PUT', '/webhooks/settings', { webhookId: id, events: [...new Set([...events, ...missing])] });
      console.log('  → Añadidos. Pruébalo con POST /v1/webhooks/test.');
    }
  }

  if (missingAny && !apply) {
    console.log('\nVuelve a correrlo con --apply para añadir los que faltan.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
