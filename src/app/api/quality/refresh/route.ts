import { NextResponse } from 'next/server';
import { captureDataQualitySnapshot } from '@/lib/quality/metrics';

/**
 * POST /api/quality/refresh - Trigger a manual data quality snapshot capture.
 */
export async function POST() {
  try {
    const snapshot = await captureDataQualitySnapshot();
    return NextResponse.json({ snapshot });
  } catch (err) {
    console.error('[api/quality/refresh] Error capturing snapshot:', err);
    return NextResponse.json(
      {
        error: 'Failed to capture data quality snapshot',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
