import { NextResponse } from 'next/server';
import { TRADES } from '@/lib/classification/trades';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

export const GET = withApiEnvelope(async function GET() {
  return NextResponse.json({ trades: TRADES });
});
