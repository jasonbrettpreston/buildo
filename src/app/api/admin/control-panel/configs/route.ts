/**
 * GET  /api/admin/control-panel/configs — Load full MarketplaceConfig.
 * PUT  /api/admin/control-panel/configs — Apply a diff payload.
 *
 * Both routes are admin-gated by src/middleware.ts (no per-route check needed).
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 */

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import {
  loadAllConfigs,
  applyConfigUpdate,
  ConfigUpdatePayloadSchema,
} from '@/lib/admin/control-panel';

// Prevent Next.js and any CDN/proxy from caching admin config responses.
// Config data must always reflect the current DB state — staleness is unsafe.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const;

/**
 * GET /api/admin/control-panel/configs
 * Returns the complete current state of all control-panel tables.
 */
export const GET = withApiEnvelope(async function GET() {
  try {
    const config = await loadAllConfigs(pool);
    return NextResponse.json(
      { data: config, meta: { fetched_at: new Date().toISOString() } },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (err) {
    logError('[control-panel/configs]', err, { event: 'get_configs_failed' });
    return NextResponse.json(
      { error: 'Failed to load configs', data: null, meta: null },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/admin/control-panel/configs
 * Validates a diff payload with Zod, then applies it inside a transaction.
 * Returns 400 on validation failure, 500 on DB error.
 */
export const PUT = withApiEnvelope(async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ConfigUpdatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const fieldPath = firstIssue?.path.join('.') ?? 'unknown';
    const message = `${fieldPath}: ${firstIssue?.message ?? 'Invalid value'}`;
    return NextResponse.json(
      { error: message, details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const rowsUpdated = await applyConfigUpdate(pool, parsed.data);
    return NextResponse.json(
      {
        data: { rows_updated: rowsUpdated },
        error: null,
        meta: { updated_at: new Date().toISOString() },
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (err) {
    logError('[control-panel/configs]', err, { event: 'apply_config_failed' });
    return NextResponse.json(
      { error: 'Failed to apply config changes', data: null, meta: null },
      { status: 500 },
    );
  }
});
