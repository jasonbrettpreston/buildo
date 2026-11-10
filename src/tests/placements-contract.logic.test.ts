// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10), §11a.10 (ad slots)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22 (targeting only on declared database keys), FE-23 (ad slots)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-17, R-34
//
// MF-40 · the placements contract (scripts/surfaces/_schema/placements-contract.json) and its validators (src/lib/placements/contract.ts).
// (1) Join lock, both ways (plan delta 1 section 5: literal enums, joined; the landed ad-targeting-keys lock is not edited): the placement_key enum
//     equals ad-contract.json slots and report-presentation.json ad_placements keys; building_type x design_option equals the scenario_fields keys;
//     the two targeting fields are ad-contract targeting_keys and no field is an income or user-entered key; every request schema uses only the
//     keyword subset; the limits name seeded keys.
// (2) The offer validator (queue done-condition "an income or user-entered targeting key is RED"; plan section 3.5 lock 1, folds 6 and 7): each
//     planted payload is refused with its named code; the clean payloads pass.
// Each RED plant is an in-memory copy, never a file edit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRACT,
  LIMIT_KEYS,
  schemaKeywordViolations,
  contractJoinProblems,
  offerValidator,
  toggleValidator,
  advertiserValidator,
  offerRuleProblems,
  type OfferBody,
} from '@/lib/placements/contract';

const read = (p: string): unknown => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8'));
const SEED = read('scripts/seeds/logic_variables.json') as Record<string, unknown>;
const OFFER = '0b5d3c3e-6f0a-4c39-9d8e-2b7a0f4a1c11';
const ADV = '4f2b8c11-2d3e-4a5b-8c6d-7e8f9a0b1c2d';
const NOW = new Date('2026-11-10T12:00:00Z');
const base: OfferBody = { offer_id: OFFER, placement_key: 'detail_footer', advertiser_id: ADV, creative_text: 'Example sponsor offer (detail footer)' };
const parse = (v: unknown): boolean => offerValidator.safeParse(v).success;
const rules = (b: Partial<OfferBody>) => offerRuleProblems({ ...base, ...b } as OfferBody, { maxHorizonDays: 365, now: NOW }).map((p) => p.code);

describe('MF-40 placements contract: the join lock (both ways)', () => {
  it('joins clean against ad-contract.json and report-presentation.json', () => {
    expect(contractJoinProblems(CONTRACT)).toEqual([]);
  });

  it('RED plants: an extra slot, a dropped slot, a design option outside the scenario keys, a third targeting field, an income field', () => {
    const plant = (f: (c: Record<string, any>) => void): string[] => { // eslint-disable-line @typescript-eslint/no-explicit-any -- a JSON copy
      const c = structuredClone(CONTRACT) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- a JSON copy
      f(c);
      return contractJoinProblems(c as unknown as typeof CONTRACT);
    };
    expect(plant((c) => c.offer_request.properties.placement_key.enum.push('banner_top'))).toEqual(expect.arrayContaining([expect.stringMatching(/placement_key enum/)]));
    expect(plant((c) => c.offer_request.properties.placement_key.enum.pop())).toEqual(expect.arrayContaining([expect.stringMatching(/placement_key enum/)]));
    expect(plant((c) => c.offer_request.properties.design_option.enum.push('mansard'))).toEqual(expect.arrayContaining([expect.stringMatching(/scenario/)]));
    expect(plant((c) => { c.offer_request.properties.zone_class = { type: 'string', enum: ['r'] }; })).toEqual(expect.arrayContaining([expect.stringMatching(/targeting field zone_class/)]));
    expect(plant((c) => { c.offer_request.properties.income_band = { type: 'string' }; })).toEqual(expect.arrayContaining([expect.stringMatching(/income_band/)]));
  });

  it('every request schema stays in the keyword subset; the limits name seeded keys', () => {
    for (const k of ['offer_request', 'toggle_request', 'advertiser_request'] as const) expect(schemaKeywordViolations(CONTRACT[k])).toEqual([]);
    expect(schemaKeywordViolations({ ...CONTRACT.offer_request, if: {} })).toEqual(['#: if']);
    expect(CONTRACT.limits).toEqual(LIMIT_KEYS);
    for (const k of Object.values(LIMIT_KEYS)) expect(SEED[k], `${k} is not seeded`).toBeDefined();
  });
});

describe('MF-40 offer validator: planted payloads refused, clean payloads pass', () => {
  it('schema layer: clean create and edit pass; income, user-entered, zone_class and unknown keys are refused', () => {
    expect(parse(base)).toBe(true);
    expect(parse({ ...base, updated_at: '2026-11-10 12:00:00.123456+00', building_type: 'detached_house', design_option: 'pitched', flight_start: '2026-12-01', flight_end: '2026-12-31' })).toBe(true);
    expect(parse({ ...base, income_band: 'high' })).toBe(false);
    expect(parse({ ...base, income: '100000' })).toBe(false);
    expect(parse({ ...base, lot_size_declared: '400' })).toBe(false);
    expect(parse({ ...base, zone_class: 'rd' })).toBe(false);
    expect(parse({ ...base, active: true })).toBe(false);
    expect(parse({ ...base, disclosure_required: false })).toBe(false);
    expect(parse({ ...base, placement_key: 'banner_top' })).toBe(false);
    expect(parse({ ...base, design_option: 'mansard' })).toBe(false);
    expect(parse({ ...base, creative_text: '<b>Sale</b>' })).toBe(false);
    expect(parse({ ...base, creative_text: '' })).toBe(false);
    expect(parse({ ...base, creative_text: 'x'.repeat(281) })).toBe(false);
    expect(parse({ ...base, flight_start: '2026/12/01' })).toBe(false);
    expect(parse({ ...base, offer_id: 'not-a-uuid' })).toBe(false);
  });

  it('route rules: per-placement targeting, the scenario_card pair, the flight order and the horizon', () => {
    expect(rules({})).toEqual([]);
    expect(rules({ building_type: 'detached_house', design_option: 'pitched' })).toEqual([]);
    expect(rules({ placement_key: 'renovation_section', building_type: 'detached_house' })).toEqual(['TARGETING_NOT_ALLOWED']);
    expect(rules({ placement_key: 'scenario_card', building_type: 'detached_house', design_option: 'pitched' })).toEqual([]);
    expect(rules({ placement_key: 'scenario_card', building_type: 'detached_house' })).toEqual(['SCENARIO_REQUIRED']);
    expect(rules({ placement_key: 'scenario_card' })).toEqual(['SCENARIO_REQUIRED']);
    expect(rules({ flight_start: '2026-12-31', flight_end: '2026-12-01' })).toEqual(['FLIGHT_ORDER']);
    expect(rules({ flight_start: '2026-12-01', flight_end: '2026-12-01' })).toEqual([]);
    expect(rules({ flight_end: '2027-12-01' })).toEqual(['FLIGHT_BEYOND_HORIZON']);
    expect(rules({ flight_end: '2026-02-30' })).toEqual(['INVALID_DATE']);
  });

  it('the toggle and advertiser validators', () => {
    expect(toggleValidator.safeParse({ offer_id: OFFER, updated_at: 'x', active: true }).success).toBe(true);
    expect(toggleValidator.safeParse({ offer_id: OFFER, active: true }).success).toBe(false);
    expect(toggleValidator.safeParse({ offer_id: OFFER, updated_at: 'x', active: 'yes' }).success).toBe(false);
    expect(advertiserValidator.safeParse({ advertiser_id: ADV, name: 'Example sponsor' }).success).toBe(true);
    expect(advertiserValidator.safeParse({ advertiser_id: ADV, name: 'Example sponsor', active: false }).success).toBe(false);
    expect(advertiserValidator.safeParse({ advertiser_id: ADV, name: '' }).success).toBe(false);
  });
});
