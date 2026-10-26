import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { clearBrandAvatar, setBrandAvatar } from '@/lib/services/brands';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── POST /api/brands/[id]/avatar ────────────────────────────────────────────
// Sube la imagen de una marca. Es lo que identifica a la marca en el selector.
// La normalización y la subida viven en setBrandAvatar.
//
// Espera multipart/form-data con un campo "file".

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart request' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 422 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Formato no admitido. Usa JPG, PNG o WebP.' },
      { status: 422 },
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `La imagen supera los ${Math.round(MAX_SIZE_BYTES / (1024 * 1024))} MB.` },
      { status: 422 },
    );
  }

  const ctx = serviceContext(auth, id, 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await setBrandAvatar(ctx, id, Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/brands/[id]/avatar', auth });
  }
}

// ─── DELETE /api/brands/[id]/avatar ──────────────────────────────────────────
// Quita la imagen. La marca vuelve a mostrarse con el logo de su Brand Kit, y
// si tampoco lo tiene, con su inicial.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ctx = serviceContext(auth, id, 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await clearBrandAvatar(ctx, id));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/brands/[id]/avatar', auth });
  }
}
