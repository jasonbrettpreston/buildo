import { NextResponse } from 'next/server';
import { getQualityData } from '@/lib/quality/metrics';

/**
 * GET /api/quality - Return the latest snapshot + last 30 days of trend data.
 */
export async function GET() {
  try {
    const data = await getQualityData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/quality] Error fetching quality data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch data quality metrics' },
      { status: 500 }
    );
  }
}
