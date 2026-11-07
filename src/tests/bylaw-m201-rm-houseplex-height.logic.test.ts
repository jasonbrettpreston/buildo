// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-201 ("on an unlabelled RM lot (B)(ii) gives the houseplex 12.0 m";
//            dated note 2026-11-06, Q12 a, Q12-S a), M-75, M-180
//
// MB-27 increment 3 (the Layer 2 night) · Q12 · RED FIRST. Q12-S a: "10.80.40.10(1)(C) gains the `mapped(HT)` condition that (A) has,
// matching the text "despite (A)"". Data: one COR-10.80.40.10(1)#(1)(C)/condition adjudication. On the production path.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const A = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT);
const INPUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8'));
const C_UNIT = '10.80.40.10(1)#(1)(C)';
const lot = (bt: string, overlays: Json, units = 4): Json => ({
  zone: 'RM', exception: null, label: { u: 4 }, overlays, map_areas: [], building_type: bt,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false },
  vars: { lot_frontage_m: 12, lot_depth_m: 36, lot_area_m2: 432, dwelling_units: units },
});
const eff = (l: Json): Json => A.E.effective(l, 'height_m', A.E.loadCandidates(l, A.units).candidates, A.C);
const win = (r: Json): string | null => (r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null);

describe('Q12-S a: (C) gains mapped(HT) (data, M-75)', () => {
  it('the generated (C) unit carries the mapped(HT) condition', () => {
    const u = (INPUT.body.units as Json[]).find((x) => x.unit_id === C_UNIT) as Json;
    expect(String(u.condition && u.condition.if)).toMatch(/mapped\(HT\)/);
  });
});

describe('M-201 on the production path', () => {
  it.each(['detached_houseplex', 'semi_detached_houseplex'])('unlabelled RM lot, %s: (B)(ii) gives 12.0 m, not max(HT, 10)', (bt) => {
    const r = eff(lot(bt, {}));
    expect([r.status, r.value, win(r)]).toEqual(['value', 12, '10.80.40.10(1)#(1)(B)']);
  });
  it('unlabelled RM lot, detached_house: (B)(i) 10.0 m (green on both trees)', () => {
    expect(eff(lot('detached_house', {}, 1)).value).toBe(10);
  });
  it('mapped HT 13 RM lot, detached_houseplex: (C) still applies (green on both trees)', () => {
    const r = eff(lot('detached_houseplex', { HT: 13 }));
    expect([r.value, win(r)]).toEqual([13, C_UNIT]);
  });
});
