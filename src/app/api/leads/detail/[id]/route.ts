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
// Auth: Bearer token (mobile) or session cookie (web admin). The middleware
// at src/middleware.ts checks JWT shape; this handler calls
// getCurrentUserContext to resolve the verified Firebase UID + trade_slug.
//
// Phase G (Spec 42 §6.11): CoA leads (id prefix `COA-`) are now resolved by
// a dedicated branch reading `coa_applications` directly via `lead_id LIKE
// 'coa:%'`. Pre-Phase G this returned 404.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { isUuid } from '@/lib/entitlements';
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
  COA_LEAD_DETAIL_SQL,
  toLeadDetail,
  toCoaLeadDetail,
  type LeadDetailRow,
  type CoaLeadDetailRow,
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

    // Migration 229 (Supabase Phase 1, D6): lead_views.user_id is UUID (FK
    // auth.users); LEAD_DETAIL_SQL/COA_LEAD_DETAIL_SQL cast the viewer's uid
    // param `::uuid`. `ctx.uid` is a verified Supabase uuid in production,
    // but the dev-bypass path (`getCurrentUserContext`, isDevMode()) can
    // yield the non-uuid 'dev-user' sentinel — binding that raw string to a
    // `::uuid` parameter throws 22P02. Normalize to NULL (the
    // `@/lib/entitlements` no-op convention for non-uuid uids: NULL::uuid
    // never satisfies `=`/`!=`, i.e. "no saved-state row exists").
    const safeUid = isUuid(ctx.uid) ? ctx.uid : null;

    if (parsed.kind === 'coa') {
      // Phase G: dispatch to CoA branch reading coa_applications directly.
      // The DB-canonical lead_id `coa:${application_number}` is constructed
      // INLINE in COA_LEAD_DETAIL_SQL (single conversion point per v2.1).
      const coaResult = await pool.query<CoaLeadDetailRow>(COA_LEAD_DETAIL_SQL, [
        parsed.application_number,
        ctx.trade_slug,
        safeUid,
      ]);
      const coaRow = coaResult.rows[0];
      if (!coaRow) return notFound();
      return ok(toCoaLeadDetail(coaRow));
    }

    const result = await pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, [
      parsed.permit_num,
      parsed.revision_num,
      ctx.trade_slug,
      safeUid,
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
