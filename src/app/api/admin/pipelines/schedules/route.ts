import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

/**
 * GET /api/admin/pipelines/schedules - Return all pipeline schedules.
 */
export async function GET() {
  try {
    const rows = await query<{ pipeline: string; cadence: string; cron_expression: string | null; enabled: boolean; updated_at: string }>(
      `SELECT pipeline, cadence, cron_expression, enabled, updated_at FROM pipeline_schedules ORDER BY pipeline`
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

/**
 * PATCH /api/admin/pipelines/schedules - Toggle a pipeline's enabled state.
 * Body: { pipeline: string, enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { pipeline, enabled } = body;

    if (!pipeline || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'pipeline (string) and enabled (boolean) are required' }, { status: 400 });
    }

    // WF3-02 (H-W19): after migration 095, the unique constraint is an
    // EXPRESSION index `(pipeline, COALESCE(chain_id, '__ALL__'))`.
    // Postgres matches ON CONFLICT via INDEX INFERENCE when the same
    // expression is supplied here — `ON CONFLICT ON CONSTRAINT <index>`
    // does NOT work because bare CREATE UNIQUE INDEX does not register
    // a catalog constraint. Mirrors the pattern used by migration 087
    // + compute-timing-calibration-v2.js for phase_calibration.
    // Admin UI continues to write chain_id = NULL (global); explicit
    // per-chain scoping is future WF1 scope.
    const result = await query<{ pipeline: string; enabled: boolean }>(
      `INSERT INTO pipeline_schedules (pipeline, cadence, enabled, updated_at)
       VALUES ($2, 'Daily', $1, NOW())
       ON CONFLICT (pipeline, COALESCE(chain_id, '__ALL__'))
         DO UPDATE SET enabled = $1, updated_at = NOW()
       RETURNING pipeline, enabled`,
      [enabled, pipeline]
    );

    return NextResponse.json({ updated: result[0] });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'PATCH' });
    return NextResponse.json({ error: 'Failed to toggle pipeline' }, { status: 500 });
  }
}
