// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §2 (price ids; migration 219 pattern; dated note 2026-11-14, MF-47)
//            docs/specs/02-web-admin/128_surface_standard_policy.md §2 rule 3 (a tunable is a registered setting)
//
// MF-47 (RULED 2026-11-14, C-1) · the ONE source of the MaxBLD plan <-> Stripe price link: the two admin settings
// stripe_price_id_parcel_tool_basic and stripe_price_id_parcel_tool_pro (migration 322, empty until the operator sets them). The plan of a
// subscription is found by matching its price ids against these two settings; there is no second price -> plan map. Pure helpers plus one read;
// no Stripe call, no logging (the callers log, with their own tag).
import { PLAN_KEYS, type PlanKey, type Queryable } from '@/lib/entitlements';

/** The setting that holds each plan's Stripe price id (the key name carries the plan key). */
export const PLAN_PRICE_KEYS: Readonly<Record<PlanKey, string>> = {
  basic: 'stripe_price_id_parcel_tool_basic',
  pro: 'stripe_price_id_parcel_tool_pro',
};

/** Each plan's price id; '' when the setting is unset or is not a `price_...` string (the migration 219 rule). */
export type PlanPriceIds = Record<PlanKey, string>;

export async function readPlanPriceIds(db: Queryable): Promise<PlanPriceIds> {
  const res = await db.query<{ variable_key: string; variable_value_json: unknown }>(
    `SELECT variable_key, variable_value_json FROM logic_variables WHERE variable_key = ANY($1::text[])`,
    [PLAN_KEYS.map((k) => PLAN_PRICE_KEYS[k])],
  );
  const byKey = new Map(res.rows.map((r) => [r.variable_key, r.variable_value_json]));
  const idOf = (plan: PlanKey): string => {
    const v = byKey.get(PLAN_PRICE_KEYS[plan]);
    return typeof v === 'string' && v.startsWith('price_') ? v : '';
  };
  return { basic: idOf('basic'), pro: idOf('pro') };
}

export type PlanResolution =
  | { kind: 'matched'; plan: PlanKey }
  | { kind: 'unset' } // neither setting holds a price id yet: the operator has not configured MaxBLD (an info line, not an error)
  | { kind: 'unmatched' } // settings are set but no subscription price is one of them
  | { kind: 'ambiguous' }; // the two settings hold the same id, or two plan prices sit on one subscription

/** Finds the plan of a subscription from ALL its item price ids (never items[0]: the overage row adds a second item). */
export function resolvePlanFromPrices(ids: PlanPriceIds, priceIds: readonly string[]): PlanResolution {
  if (ids.basic === '' && ids.pro === '') return { kind: 'unset' };
  if (ids.basic !== '' && ids.basic === ids.pro) return { kind: 'ambiguous' };
  const hits = PLAN_KEYS.filter((p) => ids[p] !== '' && priceIds.includes(ids[p]));
  if (hits.length > 1) return { kind: 'ambiguous' };
  return hits.length === 1 ? { kind: 'matched', plan: hits[0]! } : { kind: 'unmatched' };
}
