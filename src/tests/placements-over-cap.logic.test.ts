// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 5-6 (dated notes 2026-11-10; max_slots home: the placements table)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-34 (i)
//
// MF-40 · OUTPUT panel MEDIUM-2 (code reviewer): ONE definition of the oversubscription group, src/lib/placements/over-cap.ts OVER_CAP_QUERY: an
// active offer is over_cap when its group holds more active offers than its placement's max_slots, and the group is the placement plus, for
// scenario_card only, the scenario pair (building_type, design_option). The list read and the offer route both call readOverCaps (which runs this constant) and nothing else:
// no other window, partition or max_slots comparison over offers in either file. The SQL itself is executed in the operator DB job
// (src/tests/db/admin-placements.db.test.ts arm (i): two active scenario_card offers on different pairs are not over_cap, on one pair they are).
// RED plant I: the scenario-pair terms removed from the partition.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OVER_CAP_QUERY, overCapGroupProblems } from '@/lib/placements/over-cap';
import { toggleActionOf } from '@/lib/placements/usePlacementWrites';

const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('MF-40 over_cap: one group definition', () => {
  it('the query partitions by placement and, for scenario_card only, by the scenario pair, against placements.max_slots', () => {
    expect(overCapGroupProblems(OVER_CAP_QUERY)).toEqual([]);
  });

  it('RED plant I: the scenario-pair terms dropped from the partition are caught', () => {
    const planted = OVER_CAP_QUERY.replace(/,\s*CASE WHEN o\.placement_key = 'scenario_card' THEN o\.targeting->>'building_type' END/, '')
      .replace(/,\s*CASE WHEN o\.placement_key = 'scenario_card' THEN o\.targeting->>'design_option' END/, '');
    expect(planted).not.toBe(OVER_CAP_QUERY);
    expect(overCapGroupProblems(planted)).toEqual(expect.arrayContaining([expect.stringMatching(/building_type/), expect.stringMatching(/design_option/)]));
  });

  it('the list read and the offer route call readOverCaps and hold no second group definition', () => {
    for (const f of ['src/lib/placements/list.ts', 'src/app/api/admin/placements/offers/route.ts']) {
      const src = read(f);
      expect(src, f).toMatch(/readOverCaps\(/);
      expect(src, f).not.toMatch(/PARTITION BY|max_slots|max\(p\./);
    }
  });

  it('the client toggle names the action the server audits (code reviewer LOW 3)', () => {
    expect([toggleActionOf(true), toggleActionOf(false)]).toEqual(['offer_activate', 'offer_deactivate']);
  });
});
