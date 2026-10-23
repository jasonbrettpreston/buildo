/**
 * SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CODE (iv) (report-only; "0 open at Phase 3 close", SC-6), §6.3 (model heuristics)
 * SPEC LINK: docs/specs/01-pipeline/68a_mcbylaw_standard_appendix.md (code linkage declared-only until Phase 3)
 * Handbook:  Spec 133 §m.11 (code linkage reports until Phase 3), §m.22 (a code != by-law disagreement is a Phase 3 input); HELD on P3-Q1
 *
 * P3-13 part 1 (PLAN §4; CHAT-73.nohalt): the G-CODE (iv) arm over the Phase 3 modules. It reuses code-link.mjs
 * (createContext, classifyConstants) and adds a registry of the clause literals the modules receive as INPUTS
 * (scripts/analysis/phase3/phase3-literals.json, the machine form of ~/Buildo-scratch/p3build/literals.md). Until commit ①
 * sources an input from its keyed clause, the arm reports it `unmapped`. Mode is `report` (m.11); `blocking` exists for
 * the Phase 3 close switch and is wired nowhere (a ruling is needed). STRICT RED FIRST: ran against the missing module
 * (~/Buildo-scratch/p3build/red-p3-13a.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/analysis/phase3/phase3-code-link.mjs';
const REG_REL = 'scripts/analysis/phase3/phase3-literals.json';
async function mod(): Promise<Json> {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  return (await import(pathToFileURL(path.join(ROOT, REL)).href)) as Json;
}
const PROV = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-provisions.json'), 'utf8')) as Json;
function registry(): Json {
  expect(fs.existsSync(path.join(ROOT, REG_REL)), `${REG_REL} should exist`).toBe(true);
  return JSON.parse(fs.readFileSync(path.join(ROOT, REG_REL), 'utf8')) as Json;
}

describe('P3-13a: the registry of clause literals the Phase 3 modules receive as inputs', () => {
  it('has unique ids and every entry names its module input, kind, regulation id and (for numbers) the value and clause path', () => {
    const reg = registry();
    const ids = reg.literals.map((l: Json) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reg.literals.length).toBeGreaterThanOrEqual(20);
    for (const l of reg.literals as Json[]) {
      expect(['numeric', 'derived_list', 'no_literal', 'identifier'], l.id).toContain(l.kind);
      expect(typeof l.module_input, l.id).toBe('string');
      expect(typeof l.regulation_id, l.id).toBe('string');
      if (l.kind === 'numeric') { expect(Number.isFinite(l.value), l.id).toBe(true); expect(typeof l.clause_path, l.id).toBe('string'); }
    }
  });

  it('every entry matches the bylaw tree: the regulation row exists, its numeric literal has that value at that clause path, its unit ids exist', () => {
    const reg = registry();
    for (const l of reg.literals as Json[]) {
      const row = (PROV.rows as Json[]).find((r) => r.regulation_id === l.regulation_id);
      expect(row, `${l.id}: regulation ${l.regulation_id}`).toBeTruthy();
      if (l.kind === 'numeric') {
        const hit = ((row as Json).numeric_literals as Json[]).filter((x) => x.clause_path === l.clause_path && x.value === l.value);
        expect(hit.length, `${l.id}: ${l.regulation_id} ${l.clause_path} = ${l.value}`).toBeGreaterThan(0);
      }
      const unitIds = new Set((PROV.rows as Json[]).flatMap((r) => (r.units as Json[]).map((u) => u.unit_id)));
      for (const u of l.unit_ids || []) expect(unitIds.has(u), `${l.id}: unit ${u}`).toBe(true);
    }
  });

  it('covers every literal row of literals.md: caps, lift, relief, viability, the M-206 extension in all three zones, the mechanical attic', () => {
    const ids = registry().literals.map((l: Json) => l.module_input) as string[];
    for (const want of ['caps.detached', 'caps.semi', 'caps.detached_600_60', 'caps.lift', 'envelope.reliefFrontageMaxM', 'config.viabilityFrontageMinM', 'extension.extraLengthM', 'extension.maxWidthShare', 'clause.mechanical.share', 'clause.mechanical.max_sqm', 'LIFT_ZONES', 'caps.minUnits']) {
      expect(ids, want).toContain(want);
    }
    const ext = (registry().literals as Json[]).filter((l) => l.module_input === 'extension.extraLengthM').map((l) => l.regulation_id).sort();
    expect(ext).toEqual(['10.20.40.20(2)', '10.40.40.20(2)', '10.80.40.20(2)']);
  });

  it('the two findings are recorded as what they are: LIFT_ZONES a derived list (600.60.40(1)), minUnits with no numeric literal', () => {
    const l = registry().literals as Json[];
    expect(l.find((x) => x.module_input === 'LIFT_ZONES')!.kind).toBe('derived_list');
    expect(l.find((x) => x.module_input === 'caps.minUnits')!.kind).toBe('no_literal');
  });
});

describe('P3-13a: the arm (report-only, m.11)', () => {
  it('reports every registry literal as unmapped until a commit sources it (only caps.minUnits is sourced, P3-Q8); pass stays true in report mode', async () => {
    const m = await mod();
    const r = m.checkPhase3Linkage({ root: ROOT });
    expect(r.mode).toBe('report');
    // caps.minUnits is sourced from the pinned logic variable houseplex_min_units (P3-Q8); every other literal stays unmapped
    expect(r.literals.sourced).toBe(1);
    expect(r.literals.unmapped).toBe(registry().literals.length - 1);
    expect(r.items.filter((i: Json) => i.code === 'phase3_literal_unmapped')).toHaveLength(registry().literals.length - 1);
    expect(r.pass).toBe(true);
  });

  it('a literal with a source is reported sourced and is not an unmapped finding', async () => {
    const m = await mod();
    const reg = registry();
    reg.literals[0].source = 'migrations/999_example.sql#example_key';
    const r = m.checkPhase3Linkage({ root: ROOT, registry: reg });
    expect(r.literals.sourced).toBe(2); // the example plus caps.minUnits (P3-Q8)
    expect(r.literals.unmapped).toBe(reg.literals.length - 2);
  });

  it('blocking mode (the Phase 3 close switch, not wired anywhere) fails while any literal is unmapped, and passes when none is', async () => {
    const m = await mod();
    expect(m.checkPhase3Linkage({ root: ROOT, mode: 'blocking' }).pass).toBe(false);
    const reg = registry();
    for (const l of reg.literals) l.source = 'x#y';
    expect(m.checkPhase3Linkage({ root: ROOT, mode: 'blocking', registry: reg }).literals.unmapped).toBe(0);
  });

  it('a registry that disagrees with the bylaw tree is a drift defect and fails in EVERY mode', async () => {
    const m = await mod();
    const reg = registry();
    reg.literals.find((l: Json) => l.kind === 'numeric').value = 99999;
    const r = m.checkPhase3Linkage({ root: ROOT, registry: reg });
    expect(r.items.some((i: Json) => i.code === 'phase3_literal_registry_drift')).toBe(true);
    expect(r.pass).toBe(false);
  });

  it('reuses the existing G-CODE (iv) constant classification over the Phase 3 modules and reports its unmapped constants', async () => {
    const m = await mod();
    const r = m.checkPhase3Linkage({ root: ROOT });
    expect(m.PHASE3_MODULES).toEqual(expect.arrayContaining(['scripts/lib/maxbld-main-building.js', 'scripts/lib/maxbld-houseplex-units.js', 'src/features/leads/lib/renovation-shared.js']));
    for (const f of m.PHASE3_MODULES) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
    expect(r.constants.counts.total).toBeGreaterThan(0);
    expect(r.constants.counts['by-law']).toBe(0); // no Phase 3 constant is a law number
    expect(r.items.filter((i: Json) => i.code === 'unmapped_constant').length).toBe(r.constants.counts.unmapped);
  });

  it('is wired nowhere: no gate, hook, package script or step file names the Phase 3 arm', () => {
    const hits: string[] = [];
    for (const rel of ['package.json', '.husky/pre-commit', 'scripts/analysis/step-validate.mjs', 'scripts/analysis/bylaw/code-link.mjs']) {
      const p = path.join(ROOT, rel);
      if (fs.existsSync(p) && /phase3-code-link/.test(fs.readFileSync(p, 'utf8'))) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
});
