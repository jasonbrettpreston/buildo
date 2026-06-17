// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//             docs/specs/01-pipeline/40_pipeline_system.md (manifest telemetry_tables)
//
// GET /api/admin/pipeline/step-output — admin-only, read-only row browser for a pipeline
// step's main output table (manifest telemetry_tables[0], table/step axis). Lean: child-table
// rows deep-link to the per-record Lead Detail Inspector from the UI.
//
// Auth: verifyAdminAuth FIRST line (Spec 33 §5; also blanket-guarded by route-guard.ts).
// Injection fences: table from manifest allow-list, filterField ∈ information_schema columns +
// filterable, identifiers quoteIdent-wrapped, value bound, ORDER BY 1, ctid (step-output-query.ts).
//
// Status: 200 ok · 400 bad params / non-filterable filterField · 401 no admin · 404 no inspectable
// table for slug · 500 logged + sanitized.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError, notFound } from '@/features/leads/api/error-mapping';
import { logInfo } from '@/lib/logger';
import { getStepTelemetryTable, fetchTableColumns, isFilterable } from '@/lib/admin/manifest-utils';
import { fetchStepOutput } from '@/lib/admin/step-output-query';
import { StepOutputQuerySchema, StepOutputSchema } from '@/lib/admin/types';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §5 admin auth boundary — FIRST line (defense-in-depth atop route-guard.ts).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const parsed = StepOutputQuerySchema.safeParse({
    slug: sp.get('slug') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
    filterField: sp.get('filterField') ?? undefined,
    filterValue: sp.get('filterValue') ?? undefined,
  });
  if (!parsed.success) return badRequestZod(parsed.error);
  const { slug, limit, offset, filterField, filterValue } = parsed.data;

  try {
    const table = getStepTelemetryTable(slug);
    if (!table) return notFound(`Step '${slug}' has no inspectable output table`);

    const columns = await fetchTableColumns(table);
    if (columns.length === 0) return notFound(`Table for step '${slug}' has no columns`);

    if (filterField) {
      const col = columns.find((c) => c.name === filterField);
      if (!col || !isFilterable(col)) {
        return err('VALIDATION_FAILED', `filterField '${filterField}' is not a filterable column of ${table}`, 400);
      }
    }

    const result = await fetchStepOutput(table, {
      columns,
      filterField: filterField ?? null,
      filterValue: filterValue ?? null,
      limit,
      offset,
    });

    // Spec 33 §13.3 — audit trail of which admin browsed which step/table.
    logInfo('[api/step-output]', 'step-output fetched', {
      uid: adminCtx.uid, slug, table, limit, offset, filtered: Boolean(filterField),
    });

    // Spec 33 §13 — Zod-parse the payload at the boundary (catches query-layer drift).
    return ok(StepOutputSchema.parse(result));
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/pipeline/step-output', slug });
  }
});
