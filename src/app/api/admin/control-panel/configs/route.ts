/**
 * GET  /api/admin/control-panel/configs — Load full MarketplaceConfig.
 * PUT  /api/admin/control-panel/configs — Apply a diff payload.
 *
 * Auth: `verifyAdminAuth` is the FIRST statement of BOTH exports (Spec 33 §8 —
 * "per-route guard, NOT middleware").
 *
 * REPLACES the header line this file carried until 2026-09-15: "Both routes
 * are admin-gated by src/middleware.ts (no per-route check needed)." That was
 * a deliberate, documented and WRONG decision. The middleware's admin/API arm
 * (`src/middleware.ts:115`) performs no authorization at all — only a
 * PRESENCE check: `if (!hasValidSession && !request.headers.get('x-admin-key'))
 * return 401`. `hasSupabaseSessionCookie` passes on ANY non-empty
 * `sb-*-auth-token` cookie, and the `x-admin-key` arm is presence-only BY
 * DESIGN (the P1-F4 break-glass transport decision, 2026-07-19 — the secret
 * comparison lives solely in `verify-admin.ts` mode 2). So
 * `curl -X PUT -H 'x-admin-key: anything'` reached `applyConfigUpdate` here
 * and rewrote `logic_variables` plus three more tunable tables. The route
 * guard is the gate; the middleware is a pre-filter.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 *            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
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
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

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
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/control-panel/configs');

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
    // Audit BEFORE the apply. `applyConfigUpdate` opens and owns its OWN
    // transaction (`pool.connect()` + BEGIN inside control-panel.ts), so the
    // audit row cannot be enclosed by it without changing that module — out
    // of this WF3's boundary. Writing first keeps the failure direction safe:
    // a recorded intent with no mutation, never a mutation with no record.
    await writeAdminAudit(
      {
        adminUid: adminCtx.uid,
        action: 'control_panel_config_update',
        targetUid: null,
        newValue: {
          logic_variable_keys: parsed.data.logicVariables?.map((lv) => lv.key) ?? [],
          section_keys: Object.keys(parsed.data).filter((k) => k !== 'logicVariables'),
        },
        reason: 'Admin applied a control-panel config diff',
      },
      pool,
    );

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
