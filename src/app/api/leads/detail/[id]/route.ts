// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
//
// GET /api/leads/detail/:id — single-lead detail view powered by the
// permits + cost_estimates + neighbourhoods + trade_forecasts join.
//
// Status code matrix:
//   200 — success, returns LeadDetail envelope
//   400 — malformed id (badRequestInvalidId)
//   401 — no session / no profile
//   404 — id parsed but no permit row
//   500 — unexpected error (logged via logError, sanitized envelope)
//
// CoA leads (id prefix `COA-`) are recognised by the parser but currently
// return 404 with a stable code; the rich CoA detail join is out of scope
// for this milestone (tracked in active_task — Out of Scope).
//
// Auth: Bearer token (mobile) or session cookie (web admin). The middleware
// at src/middleware.ts checks JWT shape; this handler calls
// getCurrentUserContext to resolve the verified Firebase UID + trade_slug.

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
import {
  LEAD_DETAIL_SQL,
  toLeadDetail,
  type LeadDetailRow,
} from '@/lib/leads/lead-detail-query';

export const GET = withApiEnvelope(async function GET(
  request: NextRequest,
  context?: unknown,
) {
  // SAFETY: Next.js App Router always passes { params } in context for dynamic segments.
  // The unknown cast keeps the withApiEnvelope signature generic.
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  try {
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    const parsed = parseLeadId(id);
    if (parsed === null) return badRequestInvalidId();

    if (parsed.kind === 'coa') {
      // CoA detail is recognised but not yet implemented — see active_task
      // Out of Scope. Return 404 (not 501) so existing mobile clients show
      // the standard "Lead not found" UX instead of a new error class.
      return notFound('CoA lead detail is not yet supported');
    }

    const result = await pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, [
      parsed.permit_num,
      parsed.revision_num,
      ctx.trade_slug,
      ctx.uid,
    ]);
    // Belt-and-braces — rowCount === 0 SHOULD short-circuit, but the explicit
    // guard satisfies noUncheckedIndexedAccess without a non-null assertion.
    const row = result.rows[0];
    if (!row) return notFound();

    return ok(toLeadDetail(row));
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/leads/detail/[id]', id });
  }
});
