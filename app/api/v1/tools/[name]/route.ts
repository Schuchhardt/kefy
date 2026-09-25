import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/assistant/registry';
import { absoluteLinks, apiError, toolErrorResponse, withApiKey } from '@/lib/assistant/http';

// ─── POST /api/v1/tools/[name] ───────────────────────────────────────────────
// Ejecuta una herramienta con la API key. El cuerpo es la entrada de la
// herramienta (JSON; vacío equivale a {}), más `brand_id` si la organización
// tiene varias marcas y la key no está atada a una.
//
// Idempotency-Key (opcional, ≤200 caracteres): en herramientas que escriben o
// publican, repetir la misma key con la misma entrada devuelve el resultado
// guardado sin volver a ejecutar; con otra entrada, 422 idempotency_mismatch;
// mientras la primera sigue corriendo, 409 idempotency_in_progress.
//
// Éxito: 200 { ok: true, data, links? }. Error: { ok: false, error: { code,
// message }, ...detalles } con el estado de la herramienta.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_IDEMPOTENCY_KEY = 200;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  return withApiKey(req, `POST /api/v1/tools/${name}`, async (ctx) => {
    let body: unknown = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return apiError('invalid_json', 'The request body is not valid JSON', 400);
      }
    }

    const rawKey = req.headers.get('idempotency-key');
    let idempotencyKey: string | undefined;
    if (rawKey !== null) {
      idempotencyKey = rawKey.trim();
      if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY) {
        return apiError(
          'invalid_idempotency_key',
          `Idempotency-Key must be between 1 and ${MAX_IDEMPOTENCY_KEY} characters`,
          400,
        );
      }
    }

    const r = await executeTool(name, body, ctx, { idempotencyKey });

    if (r.ok === true) {
      const links = absoluteLinks(r.links);
      return NextResponse.json({ ok: true, data: r.data ?? null, ...(links?.length ? { links } : {}) });
    }
    if (r.ok === false) return toolErrorResponse(r.error);

    // 'pending' solo existe en el chat.
    return apiError('internal_error', 'Unexpected pending result', 500);
  });
}
