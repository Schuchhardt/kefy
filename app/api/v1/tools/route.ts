import { NextRequest, NextResponse } from 'next/server';
import { listTools, toolJsonSchema } from '@/lib/assistant/registry';
import { withApiKey } from '@/lib/assistant/http';

// ─── GET /api/v1/tools ───────────────────────────────────────────────────────
// Herramientas que puede llamar esta API key (por scopes, rol del creador y
// marca atada) con el JSON Schema de su entrada. Las exclusivas del chat
// (open_page) no aparecen.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'GET /api/v1/tools', async (ctx) => {
    const tools = listTools(ctx).map((t) => ({
      name: t.name,
      title: t.title?.en ?? t.name,
      description: t.description,
      kind: t.kind,
      input_schema: toolJsonSchema(t, ctx),
    }));
    return NextResponse.json({ tools });
  });
}
