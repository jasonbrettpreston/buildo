// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (134:35 the class catalogue; the population zone list);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-223(4), M-160, M-173, M-297, M-298;
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IR (classes), R-IV (exception chapters), R-IN (cellKey);
//            docs/reports/2026-10-21-layer2-build-plan.md OQ-7, OQ-11, PIN L2-PREREQ, PIN L2-KEY-READPATHS
//
// Layer 2 prerequisites that are vocab data (the by-law fix lane, M-297, M-298):
//   L2-CHAPTERS  vocab.exception_chapter maps a zone to its Chapter 900 article; locked both ways against the authored
//                exception ids and against the zone vocabulary and the Layer 2 population list (no literal map in code);
//   L2-CLASSES   vocab.scenario_class_units carries the full six-field vector for the five Spec 78 P5.1 classes
//                (garden and laneway suites are structures, not classes), pinned by sha; a class change moves the cellKey.
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs / .cjs module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const data = (o: Json): Json => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$')));
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));

describe('L2-CHAPTERS: vocab.exception_chapter (M-297)', () => {
  const chapters = data(PVOCAB.exception_chapter ?? {});
  it('maps exactly the evaluator zones, each to its Chapter 900 article number', () => {
    expect(chapters).toEqual({ R: 2, RD: 3, RS: 4, RT: 5, RM: 6 });
    expect(Object.keys(chapters).sort()).toEqual([...PVOCAB.zone].sort());
  });
  it('covers every zone of the Layer 2 population list (resolve_bylaws_population_zone_classes)', () => {
    // the lock follows the file (integrate-21): pending 280 was folded into migration 282 at resolve_bylaws commit ① (L2-SLICES Q-J, CHAT-80.QP)
    const rel = 'migrations/282_resolve_bylaws.sql';
    expect(fs.existsSync(path.join(ROOT, rel)), 'migration 282 declares the population list').toBe(true);
    const sql = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const m = /'resolve_bylaws_population_zone_classes',\s*0,\s*'(\[[^\]]*\])'::jsonb/.exec(sql);
    expect(m, 'the population list is declared in migration 282').not.toBeNull();
    const population: string[] = JSON.parse((m as RegExpExecArray)[1] as string);
    for (const z of population) expect(Object.keys(chapters), `zone ${z} has a Chapter 900 article`).toContain(z);
  });
  it('both ways against the authored exception ids: every authored 900.<n>.10(<id>) chapter is mapped, every mapped chapter has authored exceptions', () => {
    const seen = new Set<number>();
    for (const s of AU.loadAuthored(ROOT) as Json[]) {
      for (const kind of ['a', 'b'] as const) {
        for (const u of (s[kind]?.units ?? []) as Json[]) {
          const mm = /^900\.(\d+)\.\d+\(/.exec(String(u.exception ?? u.regulation_id ?? u.unit_id));
          if (mm && Number(mm[1]) !== 1) seen.add(Number(mm[1]));
        }
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Object.values(chapters).sort((a: number, b: number) => a - b));
  });
  it('the oracle puller reads the map from vocab and holds no literal zone-to-chapter table (G-EXC-LIT)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/pull-oracle.cjs'), 'utf8');
    expect(src).not.toMatch(/R:\s*2\s*,\s*RD:\s*3/);
    expect(src).toMatch(/exception_chapter/);
  });
});

// The five Spec 78 P5.1 classes (OQ-7 (ii)); the older classes stay (M-160, M-173) and gain the same fields.
const FIVE = ['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house', 'house_with_secondary_suite'];
const VECTOR = ['building_type', 'has_secondary_suite', 'has_garden_suite', 'has_laneway_suite', 'house_units', 'ancillary_units'];

describe('L2-CLASSES: vocab.scenario_class_units (M-298)', () => {
  const classes = data(PVOCAB.scenario_class_units);
  it('holds the five classes; the only class new against the six that existed is house_with_secondary_suite', () => {
    for (const c of FIVE) expect(Object.keys(classes), c).toContain(c);
    expect(Object.keys(classes)).toEqual(['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex', 'townhouse', 'detached_houseplex_5_6', 'house_with_secondary_suite']);
  });
  it('garden and laneway suites are structures, never classes', () => {
    expect(Object.keys(classes)).not.toContain('garden_suite');
    expect(Object.keys(classes)).not.toContain('laneway_suite');
    expect(PVOCAB.building_type.garden_suite.structure).toBe('suite');
    expect(PVOCAB.building_type.laneway_suite.structure).toBe('suite');
  });
  it('every class carries all six vector fields; building_type is an evaluator building type; the suite flags are booleans', () => {
    for (const [name, v] of Object.entries(classes) as [string, Json][]) {
      for (const f of VECTOR) expect(Object.keys(v), `${name}.${f}`).toContain(f);
      expect(Object.keys(PVOCAB.building_type), name).toContain(v.building_type);
      for (const f of ['has_secondary_suite', 'has_garden_suite', 'has_laneway_suite']) expect(typeof v[f], `${name}.${f}`).toBe('boolean');
    }
  });
  it('vectors: a house with a secondary suite is the detached house with two units in the house and the suite flag set', () => {
    expect(classes.detached_house).toMatchObject({ building_type: 'detached_house', has_secondary_suite: false, has_garden_suite: false, has_laneway_suite: false, house_units: 1, ancillary_units: 0 });
    expect(classes.house_with_secondary_suite).toMatchObject({ building_type: 'detached_house', has_secondary_suite: true, has_garden_suite: false, has_laneway_suite: false, house_units: 2, ancillary_units: 0 });
    expect(classes.semi_detached_houseplex.building_type).toBe('semi_detached_houseplex');
    expect(classes.detached_houseplex.house_units).toEqual({ min: 2, max: 4, evaluated_at: 4 });
  });
  it('the catalogue is pinned by sha (an edit to any vector changes it, so it is a reviewed change)', () => {
    expect(crypto.createHash('sha256').update(stable(classes)).digest('hex')).toBe('bcb00d6a971ae571c27f9e084b5d1b27b1cad231650cd267b5d542450b0dc510');
  });
});

describe('PIN L2-KEY-READPATHS: a class change moves the cellKey', () => {
  const rb = req('./scripts/lib/bylaw-resolution.js') as Json;
  const C = E.makeContext(VO.evaluatorVocab(PVOCAB), { absences: ABS.rulings });
  const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
  const base: Json = read('scripts/seeds/bylaw/eval-vectors.json').vectors.find((v: Json) => v.lot && v.lot.zone === 'RD').lot;
  const classes = data(PVOCAB.scenario_class_units);
  const units = (n: unknown): number => (typeof n === 'number' ? n : (n as Json).evaluated_at);
  // the class vector reaches the evaluator as the lot's building type, secondary-suite flag and unit counts
  const lotFor = (c: Json): Json => ({ ...base, building_type: c.building_type, flags: { ...base.flags, has_secondary_suite: c.has_secondary_suite }, vars: { ...base.vars, house_units: units(c.house_units), ancillary_units: units(c.ancillary_units) } });
  const keyFor = (name: string, target: string): { id: string; inputs: string[] } => {
    const lot = lotFor(classes[name]);
    const r = E.effective(lot, target, E.loadCandidates(lot, UNITS).candidates, C);
    return { id: rb.cellKey(lot, r.inputs, { structure: 'principal', target }).cell_id, inputs: r.inputs };
  };
  it('houseplex vs house: building_type is in the read paths, and the keys differ', () => {
    const a = keyFor('detached_house', 'height_m'); const b = keyFor('detached_houseplex', 'height_m');
    expect(a.inputs).toContain('building_type');
    expect(a.id).not.toBe(b.id);
  });
  it('house vs house with a secondary suite: same building type, the suite flag moves the key for a target that reads it', () => {
    const a = keyFor('detached_house', 'lot_coverage_pct'); const b = keyFor('house_with_secondary_suite', 'lot_coverage_pct');
    expect(a.inputs).toContain('flags.has_secondary_suite');
    expect(a.id).not.toBe(b.id);
  });
  it('a read set without building_type merges a house and a houseplex into one key (the R-IR hazard the full read set avoids)', () => {
    const lotA = lotFor(classes.detached_house); const lotB = lotFor(classes.detached_houseplex);
    const without = ['vars.lot_area_m2'];
    expect(rb.cellKey(lotA, without, { structure: 'principal', target: 'height_m' }).cell_id).toBe(rb.cellKey(lotB, without, { structure: 'principal', target: 'height_m' }).cell_id);
  });
});
