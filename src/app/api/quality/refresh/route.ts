import { NextResponse } from 'next/server';
import { captureDataQualitySnapshot } from '@/lib/quality/metrics';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

/**
 * POST /api/quality/refresh - Trigger a manual data quality snapshot capture.
 */
export const POST = withApiEnvelope(async function POST() {
  try {
    const snapshot = await captureDataQualitySnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    logError('[api/quality/refresh]', err, { handler: 'POST' });
    return NextResponse.json(
      { error: 'Failed to capture data quality snapshot' },
      { status: 500 }
    );
  }
});
