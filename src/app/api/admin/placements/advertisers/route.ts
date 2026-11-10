// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 4 (dated notes 2026-11-10)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-12 (one audit row per admin mutation)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §13
//
// MF-40 · PUT /api/admin/placements/advertisers: create one advertiser (D-3: the minimal entry on the placements page; trim 4: created active,
// no deactivation and no rename in v1). The page generates advertiser_id, so a double submit is one row: the same id and name again is a no-op
// (no mutation, no audit row, created false); the same id with another name is 409. A new row writes one admin_audit_log row advertiser_upsert
// in the same transaction; an audit failure rolls it back (R-12). contact_user_id is not written (and never enters the audit values).
// Auth: verifyAdminAuth FIRST line; mutations need authMethod === 'session'.

import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { sessionRequired, unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { withTransaction } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo } from '@/lib/logger';
import { advertiserValidator } from '@/lib/placements/contract';
import { PlacementRefusal } from '@/lib/placements/refusal';
import { AdvertiserUpsertResponseSchema } from '../types';

const TAG = '[api/admin/placements/advertisers]';
const ROUTE = '/api/admin/placements/advertisers';

export const PUT = withApiEnvelope(async function PUT(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line (CSRF Origin gate inside the guard).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, ROUTE);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = advertiserValidator.safeParse(raw);
  if (!parsed.success) return badRequestZod(parsed.error);
  const body = parsed.data;
  const name = body.name.trim();
  if (name === '') return err('VALIDATION_FAILED', 'The advertiser name is empty', 400);

  Sentry.addBreadcrumb({ category: 'admin_action', message: 'advertiser_upsert', data: { target: 'advertisers' } });
  try {
    const out = await withTransaction(async (client) => {
      const ins = await client.query<{ advertiser_id: string }>(
        'INSERT INTO advertisers (advertiser_id, name, active) VALUES ($1, $2, true) ON CONFLICT (advertiser_id) DO NOTHING RETURNING advertiser_id',
        [body.advertiser_id, name],
      );
      if (ins.rows.length === 0) {
        const had = await client.query<{ name: string }>('SELECT name FROM advertisers WHERE advertiser_id = $1', [body.advertiser_id]);
        if (had.rows[0]?.name !== name) throw new PlacementRefusal(409, 'ADVERTISER_ID_TAKEN', 'That advertiser id is already used by another name');
        return { advertiser_id: body.advertiser_id, created: false };
      }
      await writeAdminAudit(
        { adminUid: adminCtx.uid, action: 'advertiser_upsert', targetUid: body.advertiser_id, oldValue: null, newValue: { name, active: true }, reason: 'admin advertiser entry' },
        client,
      );
      return { advertiser_id: body.advertiser_id, created: true };
    });
    logInfo(TAG, 'advertiser saved', { advertiser_id: out.advertiser_id, created: out.created });
    return ok(AdvertiserUpsertResponseSchema.parse(out));
  } catch (cause) {
    if (cause instanceof PlacementRefusal) return err(cause.code, cause.message, cause.status);
    return internalError(cause, { route: `PUT ${ROUTE}`, advertiser_id: body.advertiser_id });
  }
});
