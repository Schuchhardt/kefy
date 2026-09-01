import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { uploadBase64Image } from '@/lib/storage';
import { reportError } from '@/lib/observability';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Lado del avatar tras normalizar. El selector lo pinta a 22–28 px, y en
 * pantallas densas se ve al doble: 256 basta de sobra y evita guardar la foto
 * original de varios megas para mostrarla del tamaño de una uña.
 */
const AVATAR_SIZE = 256;

// ─── POST /api/brands/[id]/avatar ────────────────────────────────────────────
// Sube la imagen de una marca. Es lo que identifica a la marca en el selector.
//
// Espera multipart/form-data con un campo "file".

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = createSupabaseServer();

  // El filtro por org_id es lo que impide cambiarle el avatar a la marca de
  // otra organización conociendo su id.
  const { data: brand } = await db
    .from('kefy_brands')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!brand) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

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

  let publicUrl: string;
  try {
    const input = Buffer.from(await file.arrayBuffer());

    // Se normaliza a un cuadrado: el selector la pinta redondeada y una imagen
    // muy alargada saldría recortada de forma impredecible. `rotate()` aplica
    // la orientación EXIF antes de recortar — las fotos de móvil vienen
    // giradas con un tag y si no, el recorte se calcula sobre el eje erróneo.
    const normalized = await sharp(input)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer();

    publicUrl = await uploadBase64Image(
      normalized.toString('base64'),
      auth.orgId,
      `brand-${id}-${Date.now()}.webp`,
    );
  } catch (err) {
    reportError(err, {
      route: 'POST /api/brands/[id]/avatar', auth, extra: { brandId: id },
    });
    return NextResponse.json({ error: 'No se pudo procesar la imagen' }, { status: 500 });
  }

  const { data: updated, error } = await db
    .from('kefy_brands')
    .update({ avatar_url: publicUrl })
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, org_id, name, slug, avatar_url, archived, created_at, updated_at')
    .maybeSingle();

  if (error || !updated) {
    reportError(new Error(error?.message ?? 'update failed'), {
      route: 'POST /api/brands/[id]/avatar', auth, service: 'supabase', extra: { brandId: id },
    });
    return NextResponse.json({ error: 'No se pudo guardar la imagen' }, { status: 500 });
  }

  return NextResponse.json({ brand: updated });
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
  const db = createSupabaseServer();

  const { data: updated, error } = await db
    .from('kefy_brands')
    .update({ avatar_url: null })
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, org_id, name, slug, avatar_url, archived, created_at, updated_at')
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'DELETE /api/brands/[id]/avatar', auth, service: 'supabase', extra: { brandId: id },
    });
    return NextResponse.json({ error: 'No se pudo quitar la imagen' }, { status: 500 });
  }

  if (!updated) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

  return NextResponse.json({ brand: updated });
}
