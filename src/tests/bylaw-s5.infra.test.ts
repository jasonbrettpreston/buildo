// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rules 1-2, 5, 11, §6.5, §9 G-UNIVERSE, G-READ
//            (definitions arm), G-SHAPE (feeds totality), §10 (determinism: sorted keys, LF);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-26, M-31, M-37, M-47 (+ S3 note), M-50, M-52;
//            docs/reports/mcbylaw-phase1-plan.md S5
//
// S5 locks over the COMMITTED seeds and the REAL snapshot (offline, no DB): vocab.json is closed and internally
// consistent; the slicer reads its declared config from vocab.json; every pinned page's TOC entry maps to a page or a
// page rule; every sliced row matches exactly one scope rule; retired Ch.230 rows are out of scope with their ruled
// reasons, visible and counted; every mapped Ch.800 measurement definition carries input fidelity; the Lane B fixture
// vocabulary reconciles with vocab.json through a declared rename map. Counts are computed, never hard-coded here:
// the S4 re-slice will move them (universe.lock.json pins them after the operator's ruling).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const V = await load('scripts/analysis/bylaw/vocab.mjs');
const D = await load('scripts/analysis/bylaw/definitions.mjs');
const U = await load('scripts/analysis/bylaw/universe.mjs');
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const SEEDS = path.join(ROOT, 'scripts/seeds/bylaw');
const readSeed = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const VOCAB = readSeed('vocab.json');

const snap = SL.loadSnapshotPages ? SL.loadSnapshotPages(SEEDS) : { pages: [] };
const slice = SL.sliceSnapshot ? SL.sliceSnapshot(snap) : { rows: [] };
const inputs = U.universeInputs ? U.universeInputs({ root: ROOT, slice, pages: snap.pages, adoptionId: snap.adoption_id }) : {};
const result: Json = U.checkUniverse ? U.checkUniverse(inputs) : { violations: ['universe.mjs missing'], scoped: [], counts: {}, toc: [] };

describe('vocab.json (Spec 68 §6.5)', () => {
  it('is closed and internally consistent (checkVocab passes)', () => {
    const r = V.checkVocab(VOCAB);
    expect(r.violations).toEqual([]);
  });
  it('is LF and parses; every dsl_target has a unit + aspect, every building_type a structure (the M-52 maps)', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'vocab.json'), 'utf8');
    expect(text.includes('\r')).toBe(false);
    for (const [k, t] of Object.entries(VOCAB.dsl_target as Json)) expect([k, VOCAB.feeds.aspect.includes(t.aspect), VOCAB.dsl_unit.includes(t.unit)]).toEqual([k, true, true]);
    for (const [k, t] of Object.entries(VOCAB.building_type as Json)) expect([k, VOCAB.feeds.structure.includes(t.structure)]).toEqual([k, true]);
  });
  it('the Lane F targets keep their names (separation_m, lot_coverage_pct, fsi) with the units S12b binds', () => {
    expect([VOCAB.dsl_target.separation_m?.unit, VOCAB.dsl_target.lot_coverage_pct?.unit, VOCAB.dsl_target.fsi?.unit]).toEqual(['m', 'pct', 'ratio']);
  });
  it('not_evaluated_reason equals the evaluator closed set, both directions', () => {
    expect([...VOCAB.not_evaluated_reason].sort()).toEqual([...E.NOT_EVALUATED_CODES].sort());
  });
  it('the evaluator runs on the derived view: M-50 list = Lane B list; parents; thresholds', () => {
    const ev = V.evaluatorVocab(VOCAB);
    const lane = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/bylaw/eval-vocab.json'), 'utf8'));
    expect([...ev.building_type_residential].sort()).toEqual([...lane.building_type_residential].sort());
    expect(ev.building_type_parent).toEqual(lane.building_type_parent);
    for (const t of lane.lot_condition_threshold) expect(ev.lot_condition_threshold).toContain(t);
    const ctx = E.makeContext(ev);
    expect(E.evaluate('height_m = max(10.0 m; label(f)) @(1)(A)', { zone: 'RD', label: { f: 12.0 } }, ctx).value).toBe(12);
  });
  it('Lane B fixture vocabulary reconciles with vocab.json through the declared renames (S5 conflict list)', () => {
    const lane = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/bylaw/eval-vocab.json'), 'utf8'));
    const RENAMED: Json = { lot_frontage_min_m: 'required_lot_frontage_m' };
    for (const t of Object.keys(lane.dsl_target)) {
      const name = RENAMED[t] || t;
      expect([t, Object.hasOwn(VOCAB.dsl_target, name)]).toEqual([t, true]);
      expect([t, VOCAB.dsl_target[name].unit]).toEqual([t, lane.dsl_target[t].unit]);
    }
    for (const t of Object.keys(lane.dsl_input)) if (!Object.hasOwn(RENAMED, t)) expect([t, Object.hasOwn(VOCAB.dsl_input, t) || Object.hasOwn(VOCAB.dsl_target, t)]).toEqual([t, true]);
    for (const k of ['label_letter', 'overlay_code']) for (const [c, x] of Object.entries(lane[k] as Json)) expect([k, c, VOCAB[k][c]?.unit]).toEqual([k, c, x.unit]);
    expect([...VOCAB.user_input].sort()).toEqual([...lane.user_input].sort());
    expect(VOCAB.zone).toEqual(lane.zone);
  });
  it('the Lane B fixture units resolve feeds under vocab.json except the declared renames and Phase 2 tokens', () => {
    const units = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/bylaw/eval-units.json'), 'utf8')).units;
    const r = V.checkFeedsTotality(units, VOCAB);
    const left = r.violations.filter((x: string) => !/target lot_frontage_min_m$/.test(x));
    expect(left).toEqual([]);
    for (const u of units) for (const t of u.condition?.tokens || []) if (t !== 'complies_with_omb_order') expect([u.unit_id, t, Object.hasOwn(VOCAB.lot_condition, t)]).toEqual([u.unit_id, t, true]);
  });
});

describe('the slicer reads its declared config from vocab.json (S4 proposed patch, folded at S5)', () => {
  it('definition sections and the unit table come from vocab.slicer', () => {
    expect([...SL.DEFINITION_SECTIONS]).toEqual(VOCAB.slicer.definition_sections);
    // R1 (Spec 69 M-57): defined terms are the HTML title cells; the slicer has no definition-head matcher any more.
    expect(SL.UNIT_TABLE.map((x: string[]) => [...x])).toEqual(VOCAB.slicer.unit_table);
  });
  it('the anti-vacuity exclusions are the vocab patterns (statute citations included)', () => {
    const kinds = SL.exclusionSpans('R.S.O. 1990, c. P.13 on May 9, 2013 [ By-law: 1-2020 ]').map((x: Json) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['statute_citation', 'date', 'tag']));
    expect(VOCAB.slicer.anti_vacuity_exclusions.map((x: Json) => x.kind)).toContain('statute_citation');
  });
});

describe('G-UNIVERSE on the real snapshot (Spec 68 §9)', () => {
  it('no violation: every TOC entry is mapped, every row matches exactly one rule, every judgment row has evidence', () => {
    expect(result.violations).toEqual([]);
  });
  it('state is not_run until the operator pins the universe (--accept --ruling); never a silent pass', () => {
    if (!inputs.lock) {
      expect(result.status).toBe('not_run');
      expect(result.notes.join(' ')).toMatch(/universe_lock_absent/);
    } else expect(result.status).toBe('pass');
  });
  it('the retired Ch.230 pages are visible and counted: every row out of scope with its ruled reason (M-47 S3 note)', () => {
    const want: Json = { ch230_20: 'apartment_building_only', ch230_30: 'non_residential_zone_parking', ch230_40: 'non_residential_zone_parking', ch230_50: 'non_residential_zone_parking', ch230_60: 'non_residential_zone_parking', ch230_80: 'non_residential_zone_parking' };
    for (const [page, reason] of Object.entries(want)) {
      const rows = result.scoped.filter((x: Json) => x.page === page);
      expect([page, rows.length > 0]).toEqual([page, true]);
      for (const x of rows) expect([x.regulation_id, x.scope, x.reason, x.ruling]).toEqual([x.regulation_id, 'out_of_scope', reason, 'M-47']);
    }
  });
  it('every row is accounted for exactly once; counts are computed from the slice', () => {
    expect(result.scoped.length).toBe(slice.rows.length);
    const c = result.counts;
    const out = Object.values(c.out_of_scope as Json).reduce((s: number, n) => s + Number(n), 0);
    const aw = Object.values(c.awaiting_ruling as Json).reduce((s: number, n) => s + Number(n), 0);
    expect(c.in_scope + out + aw).toBe(slice.rows.length);
    expect(c.toc.unmapped).toBe(0);
  });
  it('an awaiting row carries its proposed closed reason and >= 2 words of evidence from its verbatim', () => {
    const verb = new Map(slice.rows.map((r: Json) => [r.regulation_id, r.verbatim.toLowerCase()]));
    for (const x of result.scoped.filter((r: Json) => r.scope === 'awaiting_ruling')) {
      expect([x.regulation_id, Object.hasOwn(VOCAB.scope.out_of_scope_reason, x.reason)]).toEqual([x.regulation_id, true]);
      expect([x.regulation_id, (x.evidence || '').trim().split(/\s+/).length >= 2, (verb.get(x.regulation_id) as string).includes(String(x.evidence).toLowerCase())]).toEqual([x.regulation_id, true, true]);
    }
  });
  it('deterministic: two runs give the same counts and scope', () => {
    const again = U.checkUniverse(U.universeInputs({ root: ROOT, slice, pages: snap.pages, adoptionId: snap.adoption_id }));
    expect(JSON.stringify(again.counts)).toBe(JSON.stringify(result.counts));
    expect(JSON.stringify(again.scoped)).toBe(JSON.stringify(result.scoped));
  });
});

describe('G-READ definitions arm on the real seeds (Spec 68 §9; Spec 69 M-26)', () => {
  it('the dsl_input -> Ch.800 map is total; every mapped definition is in scope and carries input fidelity', () => {
    const inScope = new Set(result.scoped.filter((x: Json) => x.scope === 'in_scope').map((x: Json) => x.regulation_id));
    const r = D.checkDefinitions({ rows: slice.rows, vocab: VOCAB, fidelity: D.loadFidelity(ROOT), inScopeIds: inScope });
    expect(r.violations).toEqual([]);
  });
  it('input-fidelity.json is LF, and differs/unknown is never silently upgraded (statuses from the closed set)', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'input-fidelity.json'), 'utf8');
    expect(text.includes('\r')).toBe(false);
    for (const [id, rec] of Object.entries(JSON.parse(text).records as Json)) expect([id, VOCAB.input_fidelity_status.includes(rec.status)]).toEqual([id, true]);
  });
});

describe('universe.json is the rules, not the counts', () => {
  it('is LF and carries no count field (counts live in universe.lock.json, computed)', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'universe.json'), 'utf8');
    expect(text.includes('\r')).toBe(false);
    expect(text).not.toMatch(/"(in_scope|count|rows)"\s*:\s*\d/);
  });
});
