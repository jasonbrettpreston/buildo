// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7 amendment)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.3
//             docs/specs/01-pipeline/83_lead_cost_model.md §3 + §4
//
// GET /api/admin/leads/inspect/:id — admin-only diagnostic surface.
//
// Mirrors the field-coverage matrix in scripts/quality/assert-global-coverage.js
// (step 27 of permits chain) so an operator can audit every input that
// produced any output for a given permit. Decoupled from the public
// /api/leads/detail/:id contract (mobile-shared per Cross-Domain Scenario B)
// — that one stays unchanged.
//
// Auth: verifyAdminAuth FIRST line (Spec 33 §5). No `lead_views.saved=true`
// LATERAL gate (admin can inspect any permit, not just saved ones).
//
// Status code matrix:
//   200 — success, returns LeadInspect envelope (8 panels)
//   400 — malformed id (badRequestInvalidId)
//   401 — verifyAdminAuth returned null
//   404 — id parsed but no permit row
//   500 — unexpected error (logged via logError, sanitized envelope)

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import {
  badRequestInvalidId,
  internalError,
  notFound,
} from '@/features/leads/api/error-mapping';
import { parseLeadId } from '@/lib/leads/parse-lead-id';
import { fetchLeadInspect, fetchLeadInspectByCoaLeadId } from '@/lib/leads/lead-inspect-query';
import { LeadInspectSchema } from '@/lib/admin/lead-schemas';

export const GET = withApiEnvelope(async function GET(
  request: NextRequest,
  context?: unknown,
) {
  // Spec 33 §5 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      {
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Admin auth required' },
        meta: null,
      },
      { status: 401 },
    );
  }

  // SAFETY: Next.js App Router always passes { params } in context for dynamic segments.
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  try {
    const parsed = parseLeadId(id);
    if (parsed === null) return badRequestInvalidId();

    // F.4 v4.1: CoA-prefix leads route to coa_applications fetcher (Spec 76 §3.5 Cycle 8).
    // The URL encoding is `COA-${application_number}`; the DB lead_id format is
    // `coa:${application_number}` — construct it here at the boundary.
    // Contract: fetchLeadInspectByCoaLeadId always resolves to a 200+coa:null+source-stub
    // envelope when the CoA row is missing — no 404 path for primary-CoA inspections.
    if (parsed.kind === 'coa') {
      const result = await fetchLeadInspectByCoaLeadId(pool, {
        coaLeadId: `coa:${parsed.application_number}`,
        adminUid: adminCtx.uid,
      });
      // Spec 33 §13: Zod-parse response payload at the route boundary — catches query-layer
      // schema drift before it ships to the admin client.
      return ok(LeadInspectSchema.parse(result));
    }

    const result = await fetchLeadInspect(pool, {
      permit_num: parsed.permit_num,
      revision_num: parsed.revision_num,
      adminUid: adminCtx.uid,
    });
    if (!result) return notFound();

    return ok(LeadInspectSchema.parse(result));
  } catch (cause) {
    return internalError(cause, {
      route: 'GET /api/admin/leads/inspect/[id]',
      id,
    });
  }
});
