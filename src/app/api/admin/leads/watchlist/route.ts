// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §3 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §11 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §5.1 + §7.1
//
// Flight Center watchlist routes:
//   GET    — the flight list (admin_watchlist ⋈ permits/coa_applications ⋈
//            trade_forecasts), UNION ALL of a permit arm and a coa arm each
//            producing the SAME column interface ([PF7]); paginated LIMIT 50
//            + offset with total in meta ([PF4]).
//   POST   — bulk save (per-item safeParse [PF5]; idempotent
//            ON CONFLICT DO NOTHING; {added, skipped_existing, failed}).
//   DELETE — bulk delete (ids scoped to admin_uid).
//
// Auth: verifyAdminAuth FIRST line. MUTATIONS additionally require
// authMethod === 'session' — 'admin_key' writes → 403 (CI/scripts have no
// personal watchlist); 'dev_bypass' writes permitted (dev-local sentinel
// rows). Reads allowed on all three. [PF1]
//
// Forecast join: ON tf.lead_id = admin_watchlist.lead_key — trade_forecasts
// PK is (trade_slug, lead_id) with permit_num/revision_num NULLABLE, so
// lead_id is the ONE uniform key covering permit AND coa rows ([ORC3]).
// Project-level expected start = the EARLIEST predicted_start row across the
// lead's ACTIVE trades ([PF-G3]): permit arm via permit_trades.is_active,
// coa arm via lead_trades.is_active (the coa classifier's output table).
// opportunity_score is FROM THE SAME earliest-start row (same-row semantics —
// start and score are consistent, never from two different forecast rows;
// see Spec 36 §4). temporal_group is computed server-side via the
// computeWatchlistTemporalGroup aggregation wrapper — the shared
// computeTemporalGroup stays untouched ([ORC4]/[PF12]).

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo, logWarn } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { buildLeadKey } from '@/features/leads/lib/record-lead-view';
import { computeWatchlistTemporalGroup } from '@/lib/admin/watchlist-temporal';
import {
  WATCHLIST_PAGE_SIZE,
  WatchlistQuerySchema,
  WatchlistItemSchema,
  BulkSaveBodySchema,
  WatchlistSaveItemSchema,
  BulkSaveResponseSchema,
  BulkDeleteBodySchema,
  BulkDeleteResponseSchema,
  type BulkSaveResponse,
  type WatchlistSaveItem,
} from '@/lib/admin/watchlist-schemas';

const TAG = '[api/admin/watchlist]';
const SLOW_QUERY_MS = 500; // Spec 33 §12

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

/**
 * [PF1] session-write guard. Mutations require the stable per-admin session
 * uid; the shared 'admin-key' sentinel gets 403 FORBIDDEN. dev_bypass writes
 * are permitted (single-dev local; rows land under 'dev-user').
 */
function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key mutation rejected — watchlist writes require a session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Watchlist mutations require a session admin (admin_key writes are not permitted)', 403);
  }
  return null;
}

/** Spec 35 §7.3 — PostHog gets a HASHED uid, never the raw one. */
function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// GET — the flight list
// ---------------------------------------------------------------------------

interface WatchlistRow {
  id: number;
  lead_type: 'permit' | 'coa';
  lead_key: string;
  permit_num: string | null;
  revision_num: string | null;
  coa_application_number: string | null;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
  saved_at: string;
}

// [PF7] UNION ALL — the permit arm and the coa arm each SELECT the same
// column interface. Source tables are LEFT JOINed so a watchlist row whose
// underlying permit/coa row disappears still renders from address_snapshot
// (no-auto-eviction contract, Spec 36 §4a). The single fc LATERAL per arm
// gates through the lead's ACTIVE trades ([PF-G3]) — permit_trades for
// permits, lead_trades for coa (both trade-id keyed; trades.slug bridges to
// tf.trade_slug) — and supplies predicted_start, p25/p75 AND
// opportunity_score from the SAME earliest-start row (same-row semantics:
// a lead whose only active forecasts lack predicted_start reads a null
// score — non-actionable anyway; Spec 36 §4).
const WATCHLIST_SQL = `
  SELECT * FROM (
    SELECT
      aw.id,
      aw.lead_type,
      aw.lead_key,
      aw.permit_num,
      aw.revision_num,
      aw.coa_application_number,
      COALESCE(
        NULLIF(aw.address_snapshot, ''),
        TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')),
        ''
      ) AS address,
      p.lifecycle_phase,
      COALESCE(p.lifecycle_stalled, false) AS lifecycle_stalled,
      fc.predicted_start,
      fc.p25_days,
      fc.p75_days,
      fc.opportunity_score,
      aw.saved_at::text AS saved_at
    FROM admin_watchlist aw
    LEFT JOIN permits p
      ON p.permit_num = aw.permit_num
      AND p.revision_num = aw.revision_num
    LEFT JOIN LATERAL (
      SELECT tf.predicted_start::text AS predicted_start, tf.p25_days, tf.p75_days, tf.opportunity_score
      FROM trade_forecasts tf
      WHERE tf.lead_id = aw.lead_key
        AND tf.predicted_start IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM permit_trades pt
          JOIN trades t ON t.id = pt.trade_id
          WHERE pt.permit_num = aw.permit_num
            AND pt.revision_num = aw.revision_num
            AND pt.is_active = true
            AND t.slug = tf.trade_slug
        )
      ORDER BY tf.predicted_start ASC
      LIMIT 1
    ) fc ON true
    WHERE aw.admin_uid = $1
      AND aw.lead_type = 'permit'

    UNION ALL

    SELECT
      aw.id,
      aw.lead_type,
      aw.lead_key,
      aw.permit_num,
      aw.revision_num,
      aw.coa_application_number,
      COALESCE(NULLIF(aw.address_snapshot, ''), c.address, '') AS address,
      c.lifecycle_phase,
      COALESCE(c.lifecycle_stalled, false) AS lifecycle_stalled,
      fc.predicted_start,
      fc.p25_days,
      fc.p75_days,
      fc.opportunity_score,
      aw.saved_at::text AS saved_at
    FROM admin_watchlist aw
    LEFT JOIN coa_applications c
      ON c.application_number = aw.coa_application_number
    LEFT JOIN LATERAL (
      SELECT tf.predicted_start::text AS predicted_start, tf.p25_days, tf.p75_days, tf.opportunity_score
      FROM trade_forecasts tf
      WHERE tf.lead_id = aw.lead_key
        AND tf.predicted_start IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM lead_trades lt
          JOIN trades t ON t.id = lt.trade_id
          WHERE lt.lead_id = aw.lead_key
            AND lt.is_active = true
            AND t.slug = tf.trade_slug
        )
      ORDER BY tf.predicted_start ASC
      LIMIT 1
    ) fc ON true
    WHERE aw.admin_uid = $1
      AND aw.lead_type = 'coa'
  ) board
  ORDER BY board.saved_at DESC, board.id DESC
  LIMIT $2 OFFSET $3
`;

const WATCHLIST_COUNT_SQL = `
  SELECT COUNT(*)::int AS total FROM admin_watchlist WHERE admin_uid = $1
`;

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const parsed = WatchlistQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return badRequestZod(parsed.error);
  const { offset } = parsed.data;

  const t0 = Date.now();
  try {
    const [rowsRes, countRes] = await Promise.all([
      pool.query<WatchlistRow>(WATCHLIST_SQL, [adminCtx.uid, WATCHLIST_PAGE_SIZE, offset]),
      pool.query<{ total: number }>(WATCHLIST_COUNT_SQL, [adminCtx.uid]),
    ]);

    const now = new Date();
    const items = rowsRes.rows.map((row) => ({
      ...row,
      temporal_group: computeWatchlistTemporalGroup(row, now),
    }));

    const duration_ms = Date.now() - t0;
    logInfo(TAG, 'watchlist read', {
      uid: adminCtx.uid,
      rows: items.length,
      offset,
      duration_ms,
    });
    if (duration_ms > SLOW_QUERY_MS) {
      logWarn(TAG, 'slow_query', { duration_ms, offset });
      Sentry.addBreadcrumb({
        category: 'slow_query',
        data: { route: 'GET /api/admin/leads/watchlist', duration_ms },
      });
    }

    // Spec 33 §13 — Zod-parse the response payload at the boundary.
    return ok(z.array(WatchlistItemSchema).parse(items), {
      total: countRes.rows[0]?.total ?? 0,
      limit: WATCHLIST_PAGE_SIZE,
      offset,
    });
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/leads/watchlist' });
  }
});

// ---------------------------------------------------------------------------
// POST — bulk save
// ---------------------------------------------------------------------------

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line (CSRF Origin check for
  // mutating methods happens inside the guard).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    const body = BulkSaveBodySchema.safeParse(raw);
    if (!body.success) return badRequestZod(body.error);

    // [PF5] per-item validation — one bad item lands in failed[], never
    // rejects the batch.
    const valid: Array<{ index: number; item: WatchlistSaveItem; lead_key: string }> = [];
    const failed: BulkSaveResponse['failed'] = [];
    body.data.items.forEach((rawItem, index) => {
      const itemParse = WatchlistSaveItemSchema.safeParse(rawItem);
      if (!itemParse.success) {
        failed.push({
          index,
          reason: itemParse.error.issues.map((i) => i.message).join('; ') || 'invalid item',
        });
        return;
      }
      const item = itemParse.data;
      // [ORC5] ONE canonical key builder — both arms route through buildLeadKey.
      const lead_key =
        item.lead_type === 'permit'
          ? buildLeadKey({
              lead_type: 'permit',
              permit_num: item.permit_num,
              revision_num: item.revision_num,
            })
          : buildLeadKey({
              lead_type: 'coa',
              coa_application_number: item.coa_application_number,
            });
      valid.push({ index, item, lead_key });
    });

    // Spec 35 §7.1 — breadcrumb + track BEFORE the write (intent capture).
    Sentry.addBreadcrumb({
      category: 'admin_action',
      message: 'watchlist_bulk_save',
      data: { target: 'admin_watchlist', item_count: valid.length },
    });
    void track(hashAdminUid(adminCtx.uid), 'admin_action_performed', {
      action: 'watchlist_bulk_save',
      target: 'admin_watchlist',
      auth_method: adminCtx.authMethod,
    });

    let added = 0;
    if (valid.length > 0) {
      // Multi-row parameterized INSERT ... ON CONFLICT DO NOTHING (idempotent;
      // intra-batch duplicates are also absorbed by DO NOTHING).
      const params: unknown[] = [adminCtx.uid];
      const valuesSql = valid
        .map(({ item, lead_key }) => {
          const base = params.length;
          if (item.lead_type === 'permit') {
            params.push(item.lead_type, lead_key, item.permit_num, item.revision_num, null, item.address ?? null);
          } else {
            params.push(item.lead_type, lead_key, null, null, item.coa_application_number, item.address ?? null);
          }
          return `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
        })
        .join(', ');
      const insertRes = await pool.query(
        `INSERT INTO admin_watchlist
           (admin_uid, lead_type, lead_key, permit_num, revision_num, coa_application_number, address_snapshot)
         VALUES ${valuesSql}
         ON CONFLICT (admin_uid, lead_key) DO NOTHING
         RETURNING id`,
        params,
      );
      added = insertRes.rowCount ?? 0;
    }

    const response: BulkSaveResponse = {
      added,
      skipped_existing: valid.length - added,
      failed,
    };
    logInfo(TAG, 'watchlist bulk save', {
      uid: adminCtx.uid,
      ...response,
      failed: response.failed.length,
    });
    return ok(BulkSaveResponseSchema.parse(response));
  } catch (cause) {
    return internalError(cause, { route: 'POST /api/admin/leads/watchlist' });
  }
});

// ---------------------------------------------------------------------------
// DELETE — bulk delete
// ---------------------------------------------------------------------------

export const DELETE = withApiEnvelope(async function DELETE(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    const body = BulkDeleteBodySchema.safeParse(raw);
    if (!body.success) return badRequestZod(body.error);

    // Spec 35 §7.1 — breadcrumb + track BEFORE the write.
    Sentry.addBreadcrumb({
      category: 'admin_action',
      message: 'watchlist_bulk_delete',
      data: { target: 'admin_watchlist', id_count: body.data.ids.length },
    });
    void track(hashAdminUid(adminCtx.uid), 'admin_action_performed', {
      action: 'watchlist_bulk_delete',
      target: 'admin_watchlist',
      auth_method: adminCtx.authMethod,
    });

    // HARD delete, admin_uid-scoped — a guessed foreign id is inert.
    const delRes = await pool.query(
      `DELETE FROM admin_watchlist WHERE admin_uid = $1 AND id = ANY($2::int[]) RETURNING id`,
      [adminCtx.uid, body.data.ids],
    );

    const response = { deleted: delRes.rowCount ?? 0 };
    logInfo(TAG, 'watchlist bulk delete', { uid: adminCtx.uid, ...response });
    return ok(BulkDeleteResponseSchema.parse(response));
  } catch (cause) {
    return internalError(cause, { route: 'DELETE /api/admin/leads/watchlist' });
  }
});
