// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 5-6 (dated notes 2026-11-10), §11a.10
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-12 (one audit row per admin mutation), R-17, R-34
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22 (targeting only on declared database keys)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §11 + §13
//
// MF-40 · the offer write routes (plan section 3.3 and section 12 folds 3-8; plan delta 1 section 5; the four trims):
//   PUT   — create or edit one offer (offer_request). Schema (400 VALIDATION_FAILED: an income, user-entered, zone_class or unknown key never
//           passes), then the route rules (400 with the rule's code: per-placement targeting, the scenario_card pair, flight order, horizon),
//           then ONE transaction: the advertiser exists and is active (400), the offer row FOR UPDATE; an existing row updates only WHERE
//           updated_at = the value the form read (else 409 STALE_OFFER), a new row is inserted INACTIVE (an updated_at sent for a missing row is
//           404); one admin_audit_log row offer_schedule. An audit failure rolls the offer back and fails the request (R-12).
//   PATCH — the list-row toggle (toggle_request): the same updated_at check (409), active set, one audit row offer_activate or
//           offer_deactivate; the over_cap warning is returned and logged, never silent (fold 8).
// A refusal writes no row and no audit row. Policy-relevant refusals (a targeting rule) log a structured warn with the reason.
// Auth: verifyAdminAuth FIRST line; mutations need authMethod === 'session' (audit admin_uid is a UUID FK).

import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { sessionRequired, unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo, logWarn } from '@/lib/logger';
import { offerRuleProblems, offerValidator, readPlacementLimits, toggleValidator, type OfferBody } from '@/lib/placements/contract';
import { PlacementRefusal, isStaleCast, isUniqueViolation } from '@/lib/placements/refusal';
import { OfferToggleResponseSchema, OfferUpsertResponseSchema } from '../types';

const TAG = '[api/admin/placements/offers]';
const ROUTE = '/api/admin/placements/offers';

type OfferSnapshot = {
  advertiser_id: string; placement_key: string; targeting: Record<string, string>; flight_start: string | null; flight_end: string | null;
  active: boolean; creative_text: string; creative_asset_id: string | null;
};

const targetingOf = (b: OfferBody): Record<string, string> =>
  Object.fromEntries((['building_type', 'design_option'] as const).flatMap((k) => (b[k] !== undefined ? [[k, b[k] as string]] : [])));

const readJson = async (request: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false }> => {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
};

const refused = (cause: unknown) => (cause instanceof PlacementRefusal ? err(cause.code, cause.message, cause.status) : null);

export const PUT = withApiEnvelope(async function PUT(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line (CSRF Origin gate inside the guard).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  // Spec 33 section 8.1: shared credentials cannot be audited (admin_audit_log.admin_uid is a UUID FK).
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, ROUTE);

  const t0 = Date.now();
  const raw = await readJson(request);
  if (!raw.ok) return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  const parsed = offerValidator.safeParse(raw.value);
  if (!parsed.success) {
    logWarn(TAG, 'offer refused by the contract schema', { stage: 'offer_schedule', reason: 'VALIDATION_FAILED' });
    return badRequestZod(parsed.error);
  }
  const body = parsed.data;
  const limits = await readPlacementLimits(pool);
  const problems = offerRuleProblems(body, { maxHorizonDays: limits.max_horizon_days, now: new Date() });
  const first = problems[0];
  if (first) {
    logWarn(TAG, 'offer refused by a placement rule', { stage: 'offer_schedule', reason: first.code, placement_key: body.placement_key });
    return err(first.code, first.message, 400);
  }

  Sentry.addBreadcrumb({ category: 'admin_action', message: 'offer_schedule', data: { target: 'offers', placement_key: body.placement_key } });
  const targeting = targetingOf(body);
  try {
    const out = await withTransaction(async (client) => {
      const adv = await client.query<{ active: boolean }>('SELECT active FROM advertisers WHERE advertiser_id = $1', [body.advertiser_id]);
      if (adv.rows.length === 0) throw new PlacementRefusal(400, 'ADVERTISER_UNKNOWN', 'That advertiser does not exist');
      if (adv.rows[0]?.active !== true) throw new PlacementRefusal(400, 'ADVERTISER_INACTIVE', 'That advertiser is not active');
      const before = await client.query<OfferSnapshot>(`SELECT advertiser_id, placement_key, targeting, to_char(flight_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_start,
              to_char(flight_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_end, active, creative_text, creative_asset_id
         FROM offers WHERE offer_id = $1 FOR UPDATE`, [body.offer_id]);
      const prior = before.rows[0];
      const values = [body.offer_id, body.advertiser_id, body.placement_key, JSON.stringify(targeting), body.flight_start ?? null, body.flight_end ?? null, body.creative_text];
      let updatedAt: string;
      if (prior) {
        if (body.updated_at === undefined) throw new PlacementRefusal(409, 'STALE_OFFER', 'That offer already exists; reload it before saving');
        const upd = await client.query<{ updated_at: string }>(
          `UPDATE offers SET advertiser_id = $2, placement_key = $3, targeting = $4::jsonb,
                  flight_start = ($5::date)::timestamp AT TIME ZONE 'UTC', flight_end = ($6::date)::timestamp AT TIME ZONE 'UTC',
                  creative_text = $7, updated_at = now()
            WHERE offer_id = $1 AND updated_at = $8::timestamptz RETURNING updated_at::text AS updated_at`,
          [...values, body.updated_at],
        );
        if (upd.rows.length === 0) throw new PlacementRefusal(409, 'STALE_OFFER', 'That offer changed since you opened it; reload it before saving');
        updatedAt = String(upd.rows[0]?.updated_at);
      } else {
        if (body.updated_at !== undefined) throw new PlacementRefusal(404, 'NOT_FOUND', 'That offer does not exist');
        const ins = await client.query<{ updated_at: string }>(
          `INSERT INTO offers (offer_id, advertiser_id, placement_key, targeting, flight_start, flight_end, creative_text, active)
           VALUES ($1, $2, $3, $4::jsonb, ($5::date)::timestamp AT TIME ZONE 'UTC', ($6::date)::timestamp AT TIME ZONE 'UTC', $7, false)
           RETURNING updated_at::text AS updated_at`,
          values,
        );
        updatedAt = String(ins.rows[0]?.updated_at);
      }
      const next = { advertiser_id: body.advertiser_id, placement_key: body.placement_key, targeting, flight_start: body.flight_start ?? null,
        flight_end: body.flight_end ?? null, active: prior?.active ?? false, creative_text: body.creative_text, creative_asset_id: prior?.creative_asset_id ?? null };
      await writeAdminAudit(
        { adminUid: adminCtx.uid, action: 'offer_schedule', targetUid: body.offer_id, oldValue: prior ?? null, newValue: next, reason: 'admin offer schedule' },
        client,
      );
      return { offer_id: body.offer_id, updated_at: updatedAt, created: !prior };
    });
    logInfo(TAG, 'offer saved', { offer_id: out.offer_id, created: out.created, duration_ms: Date.now() - t0 });
    return ok(OfferUpsertResponseSchema.parse(out));
  } catch (cause) {
    const r = refused(cause);
    if (r) return r;
    if (isStaleCast(cause) || isUniqueViolation(cause)) return err('STALE_OFFER', 'That offer changed since you opened it; reload it before saving', 409);
    return internalError(cause, { route: `PUT ${ROUTE}`, offer_id: body.offer_id });
  }
});

export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line (CSRF Origin gate inside the guard).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, ROUTE);

  const raw = await readJson(request);
  if (!raw.ok) return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  const parsed = toggleValidator.safeParse(raw.value);
  if (!parsed.success) return badRequestZod(parsed.error);
  const body = parsed.data;
  const action = body.active ? 'offer_activate' : 'offer_deactivate';

  Sentry.addBreadcrumb({ category: 'admin_action', message: action, data: { target: 'offers' } });
  try {
    const out = await withTransaction(async (client) => {
      const before = await client.query<OfferSnapshot>(`SELECT advertiser_id, placement_key, targeting, to_char(flight_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_start,
              to_char(flight_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_end, active, creative_text, creative_asset_id
         FROM offers WHERE offer_id = $1 FOR UPDATE`, [body.offer_id]);
      const prior = before.rows[0];
      if (!prior) throw new PlacementRefusal(404, 'NOT_FOUND', 'That offer does not exist');
      const upd = await client.query<{ updated_at: string }>(
        'UPDATE offers SET active = $3, updated_at = now() WHERE offer_id = $1 AND updated_at = $2::timestamptz RETURNING updated_at::text AS updated_at',
        [body.offer_id, body.updated_at, body.active],
      );
      if (upd.rows.length === 0) throw new PlacementRefusal(409, 'STALE_OFFER', 'That offer changed since you opened it; reload the list');
      const cap = await client.query<{ over: boolean }>(
        `SELECT (count(*) > max(p.max_slots)) AS over
           FROM offers o JOIN placements p ON p.placement_key = o.placement_key
          WHERE o.active AND o.placement_key = $1
            AND ($1 <> 'scenario_card' OR (o.targeting->>'building_type' IS NOT DISTINCT FROM $2 AND o.targeting->>'design_option' IS NOT DISTINCT FROM $3))`,
        [prior.placement_key, prior.targeting.building_type ?? null, prior.targeting.design_option ?? null],
      );
      await writeAdminAudit(
        { adminUid: adminCtx.uid, action, targetUid: body.offer_id, oldValue: { active: prior.active }, newValue: { active: body.active }, reason: `admin ${action.replace('_', ' ')}` },
        client,
      );
      return { offer_id: body.offer_id, active: body.active, updated_at: String(upd.rows[0]?.updated_at), over_cap: body.active && cap.rows[0]?.over === true };
    });
    if (out.over_cap) logWarn(TAG, 'active offers exceed the placement max_slots', { stage: action, reason: 'over_cap', offer_id: out.offer_id });
    return ok(OfferToggleResponseSchema.parse(out));
  } catch (cause) {
    const r = refused(cause);
    if (r) return r;
    if (isStaleCast(cause)) return err('STALE_OFFER', 'That offer changed since you opened it; reload the list', 409);
    return internalError(cause, { route: `PATCH ${ROUTE}`, offer_id: body.offer_id });
  }
});
