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
import { fetchLeadInspect } from '@/lib/leads/lead-inspect-query';

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

    if (parsed.kind === 'coa') {
      // CoA inspect is recognized but not yet implemented — same precedent
      // as /api/leads/detail/:id (Spec 91 §4.3.1 mobile contract).
      return notFound('CoA lead inspect is not yet supported');
    }

    const result = await fetchLeadInspect(pool, {
      permit_num: parsed.permit_num,
      revision_num: parsed.revision_num,
      adminUid: adminCtx.uid,
    });
    if (!result) return notFound();

    return ok(result);
  } catch (cause) {
    return internalError(cause, {
      route: 'GET /api/admin/leads/inspect/[id]',
      id,
    });
  }
});
