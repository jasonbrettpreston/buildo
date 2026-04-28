// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §5 State & API Flow
//
// GET /api/leads/flight-board — returns the authenticated user's saved
// permits grouped and sorted for the temporal CRM view. Auto-archives
// permits whose lifecycle_phase has passed the trade's work_phase index.
// Computes temporal_group in TypeScript using PHASE_INDEX + TRADE_TARGET_PHASE.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import { internalError, unauthorized } from '@/features/leads/api/error-mapping';
import { TRADE_TARGET_PHASE } from '@/lib/classification/lifecycle-phase';

// Mirrors the PHASE_INDEX used in get-lead-feed.ts — must stay in sync.
const PHASE_INDEX: Readonly<Record<string, number>> = {
  P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6,
  P7a: 7, P7b: 8, P7c: 9, P7d: 10,
  P8: 11, P9: 12, P10: 13, P11: 14, P12: 15,
  P13: 16, P14: 17, P15: 18, P16: 19, P17: 20,
  P18: 21, P19: 22, P20: 23,
};

type TemporalGroup = 'action_required' | 'departing_soon' | 'on_the_horizon';

interface FlightBoardRow {
  permit_num: string;
  revision_num: string;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
}

const FLIGHT_BOARD_SQL = `
  SELECT
    lv.permit_num,
    lv.revision_num,
    TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
    p.lifecycle_phase,
    p.lifecycle_stalled,
    tf.predicted_start::text AS predicted_start,
    tf.p25_days,
    tf.p75_days
  FROM lead_views lv
  INNER JOIN permits p
    ON p.permit_num = lv.permit_num
    AND p.revision_num = lv.revision_num
  LEFT JOIN trade_forecasts tf
    ON tf.permit_num = lv.permit_num
    AND tf.revision_num = lv.revision_num
    AND tf.trade_slug = $2
  WHERE lv.user_id = $1
    AND lv.saved = true
    AND lv.lead_type = 'permit'
  ORDER BY lv.saved_at DESC NULLS LAST
`;

function computeTemporalGroup(
  row: FlightBoardRow,
  now: Date,
): TemporalGroup {
  if (row.lifecycle_stalled) return 'action_required';
  if (!row.predicted_start) return 'on_the_horizon';
  const start = new Date(row.predicted_start);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return 'action_required'; // past due
  if (diffDays <= 14) return 'departing_soon';
  return 'on_the_horizon';
}

const GROUP_ORDER: Record<TemporalGroup, number> = {
  action_required: 0,
  departing_soon: 1,
  on_the_horizon: 2,
};

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    const result = await pool.query<FlightBoardRow>(FLIGHT_BOARD_SQL, [
      ctx.uid,
      ctx.trade_slug,
    ]);

    const tradeTarget = TRADE_TARGET_PHASE[ctx.trade_slug];
    const workPhaseIdx = tradeTarget ? (PHASE_INDEX[tradeTarget.work_phase] ?? 999) : 999;

    const now = new Date();
    const data = result.rows
      // Auto-archive: drop permits whose lifecycle has advanced past the
      // trade's work_phase (the work is already done — no point tracking it).
      .filter((row) => {
        if (!row.lifecycle_phase) return true;
        const currentIdx = PHASE_INDEX[row.lifecycle_phase] ?? 0;
        return currentIdx <= workPhaseIdx;
      })
      .map((row) => ({
        permit_num: row.permit_num,
        revision_num: row.revision_num,
        address: row.address || `${row.permit_num}--${row.revision_num}`,
        lifecycle_phase: row.lifecycle_phase,
        lifecycle_stalled: row.lifecycle_stalled,
        predicted_start: row.predicted_start,
        p25_days: row.p25_days,
        p75_days: row.p75_days,
        temporal_group: computeTemporalGroup(row, now),
      }))
      .sort((a, b) => {
        const groupDiff = GROUP_ORDER[a.temporal_group] - GROUP_ORDER[b.temporal_group];
        if (groupDiff !== 0) return groupDiff;
        // Within group: ascending predicted_start (null floats to bottom)
        if (!a.predicted_start && !b.predicted_start) return 0;
        if (!a.predicted_start) return 1;
        if (!b.predicted_start) return -1;
        return a.predicted_start.localeCompare(b.predicted_start);
      });

    return ok(data);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/leads/flight-board' });
  }
});
