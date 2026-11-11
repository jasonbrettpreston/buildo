// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (user inputs; dated note 2026-11-11)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-20 (history kept so a bad entry can be reverted)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-12 (one audit row per admin mutation)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §13
//
// MF-19 · PUT /api/admin/parcels/lot-size/revert: the audited admin revert of a user lot-size entry (D-4, operator 2026-11-11 "all as
// recommmended"). The active entry of the lot flips to reverted (the row stays: history, FE-20) and the City value is the lot size again until a
// new entry; one admin_audit_log row lot_size_revert in the same transaction (an audit failure rolls it back). 404 unknown lot or no active entry;
// 409 when the entry changed under the admin. It does not depend on the entry switch: a revert must work whenever an entry exists.
// Auth: verifyAdminAuth FIRST line (CSRF Origin gate inside the guard); the mutation needs authMethod === 'session'.

import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { sessionRequired, unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { withTransaction } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { logInfo } from '@/lib/logger';
import { CONTRACT, LotSizeRefusal, revertLotSizeEntry } from '@/lib/parcels/lot-size-entry';
import { LotSizeRevertResponseSchema } from '@/app/api/parcels/lot-size/types';

const TAG = '[api/admin/parcels/lot-size/revert]';
const ROUTE = '/api/admin/parcels/lot-size/revert';
type Schema = Parameters<typeof z.fromJSONSchema>[0];
const RevertRequestSchema = z.fromJSONSchema(CONTRACT.revert_request as unknown as Schema) as unknown as z.ZodType<{ parcel_id: string }>;

export const PUT = withApiEnvelope(async function PUT(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, ROUTE);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = RevertRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequestZod(parsed.error);
  const { parcel_id } = parsed.data;

  Sentry.addBreadcrumb({ category: 'admin_action', message: 'lot_size_revert', data: { target: 'parcel_user_inputs' } });
  try {
    const out = await withTransaction(async (client) => {
      const r = await revertLotSizeEntry(client, parcel_id, adminCtx.uid);
      await writeAdminAudit(r.audit, client); // R-12: one audit row in the same transaction; a failure rolls the revert back
      return r.out;
    });
    logInfo(TAG, 'lot size entry reverted', { parcel_id, outcome: 'reverted' });
    return ok(LotSizeRevertResponseSchema.parse(out));
  } catch (cause) {
    if (cause instanceof LotSizeRefusal) {
      logInfo(TAG, 'lot size revert refused', { parcel_id, outcome: cause.code });
      return err(cause.code, cause.message, cause.status);
    }
    return internalError(cause, { route: `PUT ${ROUTE}`, parcel_id });
  }
});
