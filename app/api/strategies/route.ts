import { NextResponse } from 'next/server';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getStrategyCatalog } from '@/lib/services/strategy';

// GET /api/strategies
// Public — returns the full objectives + industries catalog for the selector UI
export async function GET() {
  try {
    return NextResponse.json(await getStrategyCatalog());
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies' });
  }
}
