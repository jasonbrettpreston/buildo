// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §13
//
// MF-40 · GET /api/admin/placements: the admin placements read (src/lib/placements/list.ts; the RSC page calls the same function): offers with
// their advertiser, targeting, flight days, active, over_cap and resolvable flags; the active advertisers; the form's flight defaults.
// Auth: verifyAdminAuth FIRST line. Read-only: no audit row. Cache-Control private, no-store (an operator acts on what it shows).

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { ok } from '@/features/leads/api/envelope';
import { internalError } from '@/features/leads/api/error-mapping';
import { logInfo } from '@/lib/logger';
import { listPlacements } from '@/lib/placements/list';
import { PlacementsReadSchema } from './types';

const TAG = '[api/admin/placements]';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  const t0 = Date.now();
  try {
    const read = await listPlacements();
    logInfo(TAG, 'placements read', { offers: read.offers.length, advertisers: read.advertisers.length, duration_ms: Date.now() - t0 });
    const res = ok(PlacementsReadSchema.parse(read));
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/placements' });
  }
});
