// 🔗 SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.3
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// GET /api/admin/suppliers/leads — admin-only, READ-ONLY supplier lead feed
// (Spec 87 v1). Serves a supplier's FULL trade set (M-scope) from the live
// trade-keyed lead layer: lead_trades ⋈ trade_forecasts, filtered to the
// supplier's supplier_trades footprint.
//
// TWO CONSCIOUS FENCES (Spec 87 v1.3):
//   1. Principal: this is NOT a single-trade user_profiles principal. v1 is an
//      ADMIN-facing supplier VIEW — the route requires verifyAdminAuth + an
//      explicit `supplier_id` param. External supplier-account auth is v2.
//   2. CoA exposure: coa: leads are included ONLY behind the same
//      LEAD_FEED_DISABLE_COA killswitch the main feed reads. Default keeps CoA
//      leads off (permit leads only) until the admin deployment opts in.
//
// Status: 200 ok · 400 bad params · 401 no admin · 404 unknown supplier · 500 logged.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo } from '@/lib/logger';
import { getSupplierLeads } from '@/lib/admin/supplier-leads';
import { SupplierLeadsQuerySchema } from './types';

const TAG = '[api/admin/suppliers/leads]';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Fence 1 — admin boundary FIRST line (Spec 33 §5; defense-in-depth atop route-guard.ts).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const parsed = SupplierLeadsQuerySchema.safeParse({
    supplier_id: sp.get('supplier_id') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  });
  if (!parsed.success) return badRequestZod(parsed.error);
  const { supplier_id, limit, offset } = parsed.data;

  // Fence 2 — CoA-exposure gate, mirroring the main feed's killswitch read.
  // `LEAD_FEED_DISABLE_COA=1` (the deploy default) keeps coa: leads off; the
  // admin deployment sets it to '0' to surface CoA supplier leads.
  const disableCoa = process.env.LEAD_FEED_DISABLE_COA !== '0';

  try {
    const result = await getSupplierLeads(pool, { supplierId: supplier_id, disableCoa, limit, offset });
    if (result === null) {
      return err('NOT_FOUND', `Supplier ${supplier_id} not found`, 404);
    }

    logInfo(TAG, 'supplier lead feed', {
      uid: adminCtx.uid,
      supplier_id,
      trade_count: result.trades.length,
      result_count: result.leads.length,
      coa_included: !disableCoa,
    });

    return ok(result, {
      count: result.leads.length,
      limit,
      offset,
      coa_included: !disableCoa,
    });
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/suppliers/leads', supplier_id });
  }
});
