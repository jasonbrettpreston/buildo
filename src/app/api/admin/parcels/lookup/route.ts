// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §12 + §13
//
// GET /api/admin/parcels/lookup — admin-only, READ-ONLY lookup for the Parcel Cost Model Tool.
// ?q=<address> (free-text → exact | ≤10 candidates) XOR ?parcelId=<id> (direct — candidate click).
// A miss is a valid 200 result (match:null), NOT an error (Spec 89 §2.5).
//
// Auth: verifyAdminAuth FIRST line (Spec 33 §5; also blanket-guarded by route-guard.ts).
// SQL: parameterized only; explicit projection (never star-select; geometry blobs excluded by design).
// Degradation: tier-stratified safeParse in the assembler — a drifted secondary JSONB degrades to
// null + warnings[], never a whole-payload 500 (Spec 89 §2.4).
//
// Status: 200 ok (hit, candidates, or miss) · 400 bad params · 401 no admin · 500 logged+sanitized.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { ok } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo, logWarn } from '@/lib/logger';
import {
  resolveAddress,
  fetchParcelById,
  fetchCoaProjects,
  assembleParcelPayload,
} from '@/lib/admin/parcel-lookup';
import { ParcelLookupQuerySchema, ParcelLookupResponseSchema, type ParcelLookupResponse } from './types';

const TAG = '[api/parcel-lookup]';
const SLOW_QUERY_MS = 500; // Spec 33 §12

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
  const parsed = ParcelLookupQuerySchema.safeParse({
    q: sp.get('q') ?? undefined,
    parcelId: sp.get('parcelId') ?? undefined,
  });
  if (!parsed.success) return badRequestZod(parsed.error);
  const { q, parcelId } = parsed.data;

  const t0 = Date.now();
  try {
    // Resolution: direct id (candidate click) bypasses address parsing (Spec 89 §3.4).
    const resolution = parcelId
      ? { match: { parcelId, matchType: 'direct' as const, address: '' }, candidates: [] }
      : await resolveAddress(q!);

    let response: ParcelLookupResponse = {
      match: resolution.match,
      candidates: resolution.candidates,
      // >10 parcels share the address (large condo) — tell the admin the list is not complete.
      warnings: resolution.truncated ? ['more matches exist — refine the address (e.g. add a unit number)'] : [],
      parcel: null,
    };

    if (resolution.match) {
      const row = await fetchParcelById(resolution.match.parcelId);
      if (!row) {
        // A dangling id (direct path) is a miss, not an error.
        response = { match: null, candidates: [], warnings: [], parcel: null };
      } else {
        const nbhdId = row.neighbourhood_id == null ? null : Number(row.neighbourhood_id);
        const coaProjects = await fetchCoaProjects(nbhdId); // NULL-neighbourhood → []
        const { payload, warnings } = assembleParcelPayload(row, coaProjects);
        response = {
          match: { ...resolution.match, address: resolution.match.address || String(row.__display_address ?? '') },
          candidates: [],
          warnings,
          parcel: payload,
        };
      }
    }

    // Spec 33 §13.3 — audit trail (public cadastral address, not PII) + duration.
    const duration_ms = Date.now() - t0;
    logInfo(TAG, 'parcel lookup', {
      uid: adminCtx.uid,
      q: q ?? null,
      parcelId: parcelId ?? response.match?.parcelId ?? null,
      matchType: response.match?.matchType ?? (response.candidates.length ? 'candidates' : 'miss'),
      duration_ms,
    });
    if (duration_ms > SLOW_QUERY_MS) {
      // Spec 33 §12 — slow-query WARN + Sentry breadcrumb.
      logWarn(TAG, 'slow_query', { duration_ms, q: q ?? null, parcelId: parcelId ?? null });
      Sentry.addBreadcrumb({ category: 'slow_query', data: { route: 'GET /api/admin/parcels/lookup', duration_ms } });
    }

    // Boundary validation of OUR OWN assembled shape (tier drift already degraded upstream).
    return ok(ParcelLookupResponseSchema.parse(response));
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/parcels/lookup', q: q ?? null, parcelId: parcelId ?? null });
  }
});
