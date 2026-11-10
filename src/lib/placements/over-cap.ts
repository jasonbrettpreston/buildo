// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 5-6 (dated notes 2026-11-10; max_slots home: the placements table)
//            docs/specs/02-web-admin/128_surface_standard_policy.md R-34 (i)
//
// MF-40 · ONE definition of oversubscription (plan fold 8; OUTPUT panel MEDIUM-2): per offer, over_cap is true when the offer is active and its group
// holds more active offers than its placement's max_slots. The group is the placement and, for scenario_card only, the scenario pair. A static
// query (no interpolation), run only by readOverCaps below: the list read and the offer route both call it and pick their rows; locked by src/tests/placements-over-cap.logic.test.ts
// and executed in the operator DB job (src/tests/db/admin-placements.db.test.ts arm (i)). All arithmetic stays on the server (FE-05).

import type { Queryable } from '@/lib/entitlements';

export const OVER_CAP_QUERY = `SELECT o.offer_id,
       (o.active AND count(*) FILTER (WHERE o.active) OVER (
          PARTITION BY o.placement_key,
            CASE WHEN o.placement_key = 'scenario_card' THEN o.targeting->>'building_type' END,
            CASE WHEN o.placement_key = 'scenario_card' THEN o.targeting->>'design_option' END
        ) > p.max_slots) AS over_cap
  FROM offers o
  JOIN placements p ON p.placement_key = o.placement_key`;

export interface OverCapRow { offer_id: string; over_cap: boolean }

/** offer_id -> over_cap for every offer, from the one query (the list read and the offer route call this; no SQL at their call sites). */
export async function readOverCaps(db: Queryable): Promise<Map<string, boolean>> {
  const res = await db.query<OverCapRow>(OVER_CAP_QUERY);
  return new Map(res.rows.map((r) => [r.offer_id, r.over_cap === true]));
}

/** The group terms the query must hold (the lock reads this; a missing term is a named problem). */
export function overCapGroupProblems(sql: string): string[] {
  const part = /PARTITION BY([\s\S]*?)\)\s*>\s*p\.max_slots/.exec(sql)?.[1] ?? '';
  const out: string[] = [];
  if (!/\bo\.placement_key\b/.test(part.split(',')[0] ?? '')) out.push('the partition does not start with the placement');
  for (const k of ['building_type', 'design_option']) {
    if (!new RegExp(`CASE WHEN o\\.placement_key = 'scenario_card' THEN o\\.targeting->>'${k}' END`).test(part)) out.push(`the partition lacks the scenario_card ${k} term`);
  }
  if (!/FILTER \(WHERE o\.active\)/.test(sql) || !/\(o\.active AND/.test(sql)) out.push('the count or the flag is not limited to active offers');
  if (!/JOIN placements p ON p\.placement_key = o\.placement_key/.test(sql)) out.push('max_slots is not read from the placements table');
  return out;
}
