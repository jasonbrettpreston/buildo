import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';

/**
 * GET /api/admin/pipelines/schedules - Return all pipeline schedules.
 */
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  try {
    const rows = await query<{ pipeline: string; cadence: string; cron_expression: string | null; enabled: boolean; updated_at: string }>(
      `SELECT pipeline, cadence, cron_expression, enabled, updated_at FROM pipeline_schedules ORDER BY pipeline`
    );
    return NextResponse.json({ schedules: rows });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'GET' });
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
});

/**
 * PUT /api/admin/pipelines/schedules - Update a pipeline's cadence.
 * Body: { pipeline: string, cadence: string }
 */
export const PUT = withApiEnvelope(async function PUT(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/pipelines/schedules');

  try {
    const body = await request.json();
    const { pipeline, cadence } = body;

    if (!pipeline || !cadence) {
      return NextResponse.json({ error: 'pipeline and cadence are required' }, { status: 400 });
    }

    // Spec 115 §6 (P3-G11): 'Weekly' (sources) and 'Weekdays (3x Daily)'
    // (deep_scrapes) added alongside the pipeline_schedules seed — an
    // un-extended enum would make this PUT silently reject those two
    // pipelines' cadence the moment an operator touches them through the
    // admin dashboard.
    // 'Weekdays (1x Daily)' added 2026-08-05: deep_scrapes' cadence was cut from 3 slots to 1
    // (`2fa3b2e7`). '(3x Daily)' is RETAINED, not replaced — an existing pipeline_schedules row
    // may still carry it, and rejecting a value already in the table would break the PUT for a
    // row an operator is merely trying to correct (the failure mode this comment block warns of).
    const validCadences = [
      'Daily',
      'Weekly',
      'Weekdays (1x Daily)',
      'Weekdays (3x Daily)',
      'Quarterly',
      'Annual',
    ];
    if (!validCadences.includes(cadence)) {
      return NextResponse.json({ error: `cadence must be one of: ${validCadences.join(', ')}` }, { status: 400 });
    }

    // The UPDATE and its audit row commit together (Spec 33 §8.1): an update
    // that commits before a failing audit write is an unrecoverable
    // compliance hole (admin-audit.ts:56-58). `writeAdminAudit` takes the
    // transaction client as its executor.
    const result = await withTransaction(async (client) => {
      const before = await client.query<{ cadence: string }>(
        `SELECT cadence FROM pipeline_schedules WHERE pipeline = $1`,
        [pipeline],
      );
      const updated = await client.query<{ pipeline: string; cadence: string }>(
        `UPDATE pipeline_schedules SET cadence = $1, updated_at = NOW()
         WHERE pipeline = $2
         RETURNING pipeline, cadence`,
        [cadence, pipeline],
      );
      if (updated.rows.length > 0) {
        await writeAdminAudit(
          {
            adminUid: adminCtx.uid,
            action: 'pipeline_schedule_cadence_update',
            targetUid: null,
            oldValue: { pipeline, cadence: before.rows[0]?.cadence ?? null },
            newValue: { pipeline, cadence },
            reason: 'Admin changed a pipeline schedule cadence',
          },
          client,
        );
      }
      return updated.rows;
    });

    if (result.length === 0) {
      return NextResponse.json({ error: `Pipeline "${pipeline}" not found` }, { status: 404 });
    }

    return NextResponse.json({ updated: result[0] });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'PUT' });
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
});

/**
 * PATCH /api/admin/pipelines/schedules - Toggle a pipeline's enabled state.
 * Body: { pipeline: string, enabled: boolean }
 */
export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/pipelines/schedules');

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
    // Upsert + audit row commit together (Spec 33 §8.1).
    const result = await withTransaction(async (client) => {
      const before = await client.query<{ enabled: boolean }>(
        `SELECT enabled FROM pipeline_schedules WHERE pipeline = $1`,
        [pipeline],
      );
      const upserted = await client.query<{ pipeline: string; enabled: boolean }>(
        `INSERT INTO pipeline_schedules (pipeline, cadence, enabled, updated_at)
         VALUES ($2, 'Daily', $1, NOW())
         ON CONFLICT (pipeline, COALESCE(chain_id, '__ALL__'))
           DO UPDATE SET enabled = $1, updated_at = NOW()
         RETURNING pipeline, enabled`,
        [enabled, pipeline],
      );
      await writeAdminAudit(
        {
          adminUid: adminCtx.uid,
          action: 'pipeline_schedule_enabled_toggle',
          targetUid: null,
          oldValue: { pipeline, enabled: before.rows[0]?.enabled ?? null },
          newValue: { pipeline, enabled },
          reason: 'Admin toggled a pipeline schedule',
        },
        client,
      );
      return upserted.rows;
    });

    return NextResponse.json({ updated: result[0] });
  } catch (err) {
    logError('[admin/pipelines/schedules]', err, { handler: 'PATCH' });
    return NextResponse.json({ error: 'Failed to toggle pipeline' }, { status: 500 });
  }
});
