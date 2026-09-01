import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';

// Endpoint público y sin cache: el cliente lo consulta al entrar (o al volver a
// la pestaña) para saber si está corriendo una versión vieja de la app.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
  );
}
