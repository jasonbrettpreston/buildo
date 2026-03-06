import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

/**
 * GET /api/admin/pipelines/schedules - Return all pipeline schedules.
 */
export async function GET() {
  try {
    const rows = await query<{ pipeline: string; cadence: string; cron_expression: string | null; updated_at: string }>(
      `SELECT pipeline, cadence, cron_expression, updated_at FROM pipeline_schedules ORDER BY pipeline`
    );
    return NextResponse.json({ schedules: rows });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'GET' });
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/pipelines/schedules - Update a pipeline's cadence.
 * Body: { pipeline: string, cadence: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { pipeline, cadence } = body;

    if (!pipeline || !cadence) {
      return NextResponse.json({ error: 'pipeline and cadence are required' }, { status: 400 });
    }

    const validCadences = ['Daily', 'Quarterly', 'Annual'];
    if (!validCadences.includes(cadence)) {
      return NextResponse.json({ error: `cadence must be one of: ${validCadences.join(', ')}` }, { status: 400 });
    }

    const result = await query<{ pipeline: string; cadence: string }>(
      `UPDATE pipeline_schedules SET cadence = $1, updated_at = NOW()
       WHERE pipeline = $2
       RETURNING pipeline, cadence`,
      [cadence, pipeline]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: `Pipeline "${pipeline}" not found` }, { status: 404 });
    }

    return NextResponse.json({ updated: result[0] });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'PUT' });
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}
