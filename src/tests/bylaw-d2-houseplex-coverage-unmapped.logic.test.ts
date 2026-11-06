// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-182 (dated note 2026-11-06, Q-D2 a), M-75 (the correction route);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5
//
// MB-27 increment 3 (the Layer 2 night) · D2 · RED FIRST. Q-D2 a: "unit 10.20.30.40(1)#(1)(D) gains the `mapped(LC)` condition, so on
// an unmapped lot (D) does not apply and (B) answers (unregulated)". The change is data: one COR-…/condition adjudication per unit
// (10.20.30.40(1)#(1)(D) and its RT copy 10.60.30.40(1)#(1)(D)), the generated Layer 1 input re-written. Every assertion reads the
// production path (the generated input through the real-lot assembly).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const A = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT);
const INPUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8'));
const ADJ: Json[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/adjudications.json'), 'utf8')).adjudications
  ?? JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/adjudications.json'), 'utf8'));

const UNITS = { RD: '10.20.30.40(1)#(1)(D)', RT: '10.60.30.40(1)#(1)(D)' } as const;
const lot = (zone: string, bt: string, overlays: Json): Json => ({
  zone, exception: null, label: {}, overlays, map_areas: [], building_type: bt,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, has_secondary_suite: bt === 'house_with_secondary_suite' },
  vars: { lot_frontage_m: 12, lot_depth_m: 36, lot_area_m2: 432, dwelling_units: bt === 'detached_houseplex' ? 4 : 1 },
});
const eff = (l: Json): Json => A.E.effective(l, 'lot_coverage_pct', A.E.loadCandidates(l, A.units).candidates, A.C);
const win = (r: Json): string | null => (r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null);

describe('Q-D2 a: (D) gains mapped(LC) (data, M-75)', () => {
  it.each(Object.values(UNITS))('%s: the generated unit carries the mapped(LC) condition', (id) => {
    const u = (INPUT.body.units as Json[]).find((x) => x.unit_id === id) as Json;
    expect(String(u.condition && u.condition.if)).toMatch(/mapped\(LC\)/);
  });
  it.each(Object.values(UNITS))('%s: one COR-…/condition adjudication, kind correction', (id) => {
    const list = (Array.isArray(ADJ) ? ADJ : []).filter((a: Json) => a.id === `COR-${id}/condition`);
    expect(list.map((a: Json) => [a.kind, a.field, a.unit])).toEqual([['correction', 'condition', id]]);
  });
});

describe('Q-D2 a on the production path', () => {
  it.each(['RD', 'RT'])('%s detached_houseplex on an unmapped lot: (D) does not apply and (B) answers unregulated', (z) => {
    const r = eff(lot(z, 'detached_houseplex', {}));
    expect([r.status, r.value, r.reason ?? null]).toEqual(['value', 'unregulated', null]);
    expect(win(r)).toMatch(/30\.40\(1\)#\(1\)\(B\)$/);
  });
  it('RD detached_houseplex on a mapped LC 35 lot: (D) still answers 45 % (the arm is kept where the value is mapped and below 45 %; green on both trees)', () => {
    const r = eff(lot('RD', 'detached_houseplex', { LC: 35 }));
    expect([r.status, r.value, win(r)]).toEqual(['value', 45, UNITS.RD]);
  });
});
