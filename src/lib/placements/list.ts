// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10)
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 (server reads; the page and the GET share one function)
//
// MF-40 · the admin placements read: every offer (with its advertiser's name, its two targeting values, its flight days, its active flag, the
// over_cap flag and whether its target resolves to a report scenario), the active advertisers (the offer form's options_from), and the form's
// flight defaults. The GET /api/admin/placements handler and the RSC page call this same function (MF-37 list pattern).
// over_cap (plan fold 8): from the ONE group definition, src/lib/placements/over-cap.ts readOverCaps (OUTPUT panel MEDIUM-2: the offer route runs
// the same constant). All arithmetic is on the server, never in a binding (FE-05).

import { pool } from '@/lib/db/client';
import type { Queryable } from '@/lib/entitlements';
import adContractJson from '../../../scripts/surfaces/_schema/ad-contract.json';
import { readPlacementLimits, type PlacementLimits } from './contract';
import { readOverCaps } from './over-cap';

const SCENARIOS = new Set(Object.keys((adContractJson as { scenario_fields: Record<string, string> }).scenario_fields));

/** One offer row as the list shows it (booleans as 'true'/'false', the LIST binding's option values). */
export interface OfferRow {
  offer_id: string;
  placement_key: string;
  advertiser_id: string;
  advertiser_name: string;
  building_type: string | null;
  design_option: string | null;
  creative_text: string;
  flight_start: string | null;
  flight_end: string | null;
  active: 'true' | 'false';
  over_cap: 'true' | 'false';
  resolvable: 'true' | 'false';
  updated_at: string;
}
export interface AdvertiserOption { advertiser_id: string; name: string }
export interface PlacementsRead {
  offers: OfferRow[];
  advertisers: AdvertiserOption[];
  defaults: { flight_start: string; flight_end: string };
}

const flag = (b: boolean): 'true' | 'false' => (b ? 'true' : 'false');
const day = (d: Date): string => d.toISOString().slice(0, 10);

/** Whether an offer's target names something the report can show: any non-scenario placement, or a scenario_card pair in scenario_fields. */
export function resolvable(placementKey: string, buildingType: string | null, designOption: string | null): boolean {
  return placementKey !== 'scenario_card' || (buildingType !== null && designOption !== null && SCENARIOS.has(`${buildingType}/${designOption}`));
}

export async function listPlacements(opts: { db?: Queryable; limits?: PlacementLimits; now?: Date } = {}): Promise<PlacementsRead> {
  const db = opts.db ?? pool;
  const limits = opts.limits ?? (await readPlacementLimits(db));
  const now = opts.now ?? new Date();
  const offers = await db.query<{
    offer_id: string; placement_key: string; advertiser_id: string; advertiser_name: string; building_type: string | null; design_option: string | null;
    creative_text: string; flight_start: string | null; flight_end: string | null; active: boolean; updated_at: string;
  }>(
    `SELECT o.offer_id, o.placement_key, o.advertiser_id, a.name AS advertiser_name,
            o.targeting->>'building_type' AS building_type, o.targeting->>'design_option' AS design_option, o.creative_text,
            to_char(o.flight_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_start,
            to_char(o.flight_end AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS flight_end,
            o.active,
            o.updated_at::text AS updated_at
       FROM offers o
       JOIN advertisers a ON a.advertiser_id = o.advertiser_id
      ORDER BY o.created_at DESC, o.offer_id`,
  );
  const caps = await readOverCaps(db);
  const advertisers = await db.query<AdvertiserOption>('SELECT advertiser_id, name FROM advertisers WHERE active ORDER BY name, advertiser_id');
  return {
    offers: offers.rows.map((r) => ({
      ...r,
      active: flag(r.active),
      over_cap: flag(caps.get(r.offer_id) === true),
      resolvable: flag(resolvable(r.placement_key, r.building_type, r.design_option)),
    })),
    advertisers: advertisers.rows,
    defaults: { flight_start: day(now), flight_end: day(new Date(now.getTime() + limits.default_flight_days * 86_400_000)) },
  };
}
