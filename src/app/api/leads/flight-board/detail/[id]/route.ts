// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3 Detailed Investigation View
//
// GET /api/leads/flight-board/detail/:id — single saved permit by id.
//
// Powers the cold-boot path on /(app)/[flight-job] when a push notification
// opens the app from a closed state: useFlightBoard's cache is empty, so
// the screen calls this endpoint with the permit id from the deep link.
//
// Auth: same as the list endpoint — Bearer token (mobile) or session cookie.
// Authorization: row is only returned when lead_views.user_id = ctx.uid AND
// saved = true AND lead_type = 'permit'. A permit the user does not have
// saved (or has since removed) returns 404 — by the natural WHERE filter,
// not via a separate auth branch.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import {
  badRequestInvalidId,
  internalError,
  notFound,
  unauthorized,
} from '@/features/leads/api/error-mapping';
import { parseLeadId } from '@/lib/leads/parse-lead-id';
import { computeTemporalGroup } from '@/lib/leads/flight-board-temporal';
import type { FlightBoardDetail } from './types';

interface FlightBoardDetailRow {
  permit_num: string;
  revision_num: string;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  updated_at: string;
}

const FLIGHT_BOARD_DETAIL_SQL = `
  SELECT
    lv.permit_num,
    lv.revision_num,
    TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
    p.lifecycle_phase,
    p.lifecycle_stalled,
    tf.predicted_start::text AS predicted_start,
    tf.p25_days,
    tf.p75_days,
    p.updated_at::text AS updated_at
  FROM lead_views lv
  INNER JOIN permits p
    ON p.permit_num = lv.permit_num
    AND p.revision_num = lv.revision_num
  LEFT JOIN trade_forecasts tf
    ON tf.permit_num = lv.permit_num
    AND tf.revision_num = lv.revision_num
    AND tf.trade_slug = $4
  WHERE lv.user_id = $1
    AND lv.permit_num = $2
    AND lv.revision_num = $3
    AND lv.saved = true
    AND lv.lead_type = 'permit'
  LIMIT 1
`;

export const GET = withApiEnvelope(async function GET(
  request: NextRequest,
  context?: unknown,
) {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  try {
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    const parsed = parseLeadId(id);
    if (parsed === null) return badRequestInvalidId();
    // Flight board only tracks permit-kind leads (lead_views.lead_type = 'permit').
    // A CoA id is a malformed request for this endpoint.
    if (parsed.kind !== 'permit') return badRequestInvalidId();

    const result = await pool.query<FlightBoardDetailRow>(
      FLIGHT_BOARD_DETAIL_SQL,
      [ctx.uid, parsed.permit_num, parsed.revision_num, ctx.trade_slug],
    );
    // Belt-and-braces — rowCount === 0 SHOULD short-circuit, but the explicit
    // guard satisfies noUncheckedIndexedAccess without a non-null assertion.
    const row = result.rows[0];
    if (!row) return notFound('Job not on your flight board');

    const detail: FlightBoardDetail = {
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      address: row.address || `${row.permit_num}--${row.revision_num}`,
      lifecycle_phase: row.lifecycle_phase,
      lifecycle_stalled: row.lifecycle_stalled,
      predicted_start: row.predicted_start,
      p25_days: row.p25_days,
      p75_days: row.p75_days,
      temporal_group: computeTemporalGroup(row, new Date()),
      updated_at: row.updated_at,
    };
    return ok(detail);
  } catch (cause) {
    return internalError(cause, {
      route: 'GET /api/leads/flight-board/detail/[id]',
      id,
    });
  }
});
