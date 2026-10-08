// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-PROV ruling-citation arm ("`--accept` entries in
//            `ratchet-exceptions.json` cite a RATIFIED Spec 69 row literally; `deferred_by_ruling:<id>` may cite a PROPOSED row
//            (counted); an adjudication cites its adjudicator, and a `consolidation_mismatch` one cites M-39; a Spec 69 parse
//            that yields 0 rulings FAILS"), §8 rule 7 (literal spec-anchor citation, gates/ledger.mjs semantics);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-39; docs/reports/mcbylaw-phase1-plan.md S8 (wiring)
//
// One known-bad fixture per reason code + the good twin, in memory; plus checkProvAll (page + amendment + enacting arms).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const O = await load('scripts/analysis/bylaw/observable.mjs');

const SPEC69 = ['| **M-39** | x | y | G-PROV | RATIFIED 2026-10-06 |', '| **M-56** | x | y | G-UNIVERSE | RATIFIED 2026-10-07 |', '| **M-90** | x | y | G-UNIVERSE | PROPOSED |'].join('\n');
const good = (): Json => ({
  spec69Text: SPEC69,
  ledger: { rows: [{ kind: 'universe_pin', ruling: 'M-56', anchor: '**M-56**', adjudicated_by: 'operator' }] },
  adjudications: { adjudications: [{ id: 'ADJ-1', kind: 'consolidation_mismatch', adjudicator: 'operator', ruling: 'M-39' }] },
  deferred: ['M-90'],
});
const codes = (r: Json) => [...new Set((r.violations || []).map((v: string) => v.split(':')[0]))];

describe('G-PROV ruling-citation arm (checkRulingCitations)', () => {
  it('good twin passes and counts what it checked', () => {
    const r = O.checkRulingCitations(good());
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(3);
    expect(r.counts.deferred_proposed).toBe(1);
  });
  it.each([
    ['ruling_parse_empty', (g: Json) => { g.spec69Text = 'no rows'; }],
    ['ruling_not_ratified', (g: Json) => { g.ledger.rows[0].ruling = 'M-90'; g.ledger.rows[0].anchor = '**M-90**'; }],
    ['ruling_anchor_missing', (g: Json) => { g.ledger.rows[0].anchor = 'M-56'; }],
    ['adjudicator_missing', (g: Json) => { g.adjudications.adjudications[0].adjudicator = ''; }],
    ['consolidation_ruling_missing', (g: Json) => { g.adjudications.adjudications[0].ruling = 'M-56'; }],
    ['deferred_ruling_unknown', (g: Json) => { g.deferred = ['M-999']; }],
  ])('%s fails for that reason only', (code, mutate) => {
    const g = good();
    mutate(g);
    const r = O.checkRulingCitations(g);
    expect(r.pass).toBe(false);
    expect(codes(r)).toEqual([code]);
  });
  it('absent ledger / adjudication files are not violations (nothing to cite yet)', () => {
    const r = O.checkRulingCitations({ spec69Text: SPEC69, ledger: null, adjudications: null, deferred: [] });
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(0);
  });
  it('selfTest covers every reason code', () => {
    const r = O.selfTest();
    expect(r.results.filter((x: Json) => !x.pass)).toEqual([]);
    expect([...O.RULING_REASON_CODES].sort()).toEqual(['adjudicator_missing', 'consolidation_ruling_missing', 'deferred_ruling_unknown', 'ruling_anchor_missing', 'ruling_not_ratified', 'ruling_parse_empty']);
  });
});

describe('checkProvAll on the committed seeds (page + amendment + enacting arms)', () => {
  it('passes, and checks every arm', () => {
    const r = O.checkProvAll({ seeds: path.join(ROOT, 'scripts/seeds/bylaw') });
    expect(r.violations).toEqual([]);
    expect(r.arms.map((a: Json) => a.name)).toEqual(['page', 'amendment', 'enacting']);
    for (const a of r.arms) expect([a.name, a.checked > 0]).toEqual([a.name, true]);
  });
});
