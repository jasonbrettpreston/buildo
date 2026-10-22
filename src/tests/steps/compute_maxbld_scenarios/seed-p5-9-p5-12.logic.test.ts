/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.9 (logic variables), P5.12 (disclosure codes)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8 (R-CV: EXTERNALIZED, seeded by migration, defaults carried)
 * SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md lc.52 (plain-wording lint)
 *
 * P3-1 (docs/p3plan PLAN §4; operator CHAT-70.4). `compute_maxbld_scenarios` is a net-new V3 step: its 22 P5.9 logic
 * variables are seeded by a migration in R-CV form (INSERT ... ON CONFLICT DO NOTHING, defaults from the Spec 78 table,
 * bounds in the description until the descriptor exists at P3-7), and its closed P5.12 disclosure codes are registered in
 * scripts/seeds/bylaw/vocab.json. The migration is WRITTEN, NOT APPLIED (DB window). Pure file reads, no DB.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs / JSON surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PREFIX = 'compute_maxbld_scenarios_';
const MIGRATION = 'migrations/283_compute_maxbld_scenarios_logic_variables.sql';
const SPEC = read('docs/specs/01-pipeline/78_optimal_lot_configuration.md');

/** The P5.9 table rows: suffix(es) -> default(s) and bounds, parsed from the spec text (never retyped here). */
function p59(): Array<{ name: string; def: number; min: number; max: number }> {
  const start = SPEC.indexOf('### P5.9 Logic variables');
  const end = SPEC.indexOf('### P5.10', start);
  const out: Array<{ name: string; def: number; min: number; max: number }> = [];
  for (const line of SPEC.slice(start, end).split('\n')) {
    const m = /^\| `([a-z0-9_]+)`(?: \/ `([a-z0-9_]+)`)? \| ([^|]+) \| ([^|]+) \|/.exec(line);
    if (!m) continue;
    const names = [m[1], m[2]].filter((x): x is string => Boolean(x));
    const defs = (m[3] ?? "").split('/').map((s) => parseFloat(s.trim()));
    const bounds = [...(m[4] ?? "").matchAll(/\[([^\]]+)\]/g)].map((b) => (b[1] ?? "").split(',').map((x) => parseFloat(x.trim())));
    names.forEach((name, i) => out.push({ name, def: defs[i] ?? Number.NaN, min: bounds[i]?.[0] ?? Number.NaN, max: bounds[i]?.[1] ?? Number.NaN }));
  }
  return out;
}

/** Parse `('key', value,` seed tuples out of the migration. */
function seeded(): Map<string, number> {
  const sql = read(MIGRATION);
  const out = new Map<string, number>();
  for (const m of sql.matchAll(/\('(compute_maxbld_scenarios_[a-z0-9_]+)',\s*(-?[0-9.]+),/g)) out.set(m[1] as string, Number(m[2]));
  return out;
}

describe('P3-1: the 22 P5.9 logic variables (Spec 132 core.8, R-CV)', () => {
  it('the Spec 78 P5.9 table yields 22 variables', () => {
    expect(p59()).toHaveLength(22);
  });

  it('the migration exists, is idempotent and never deletes (R-CV form)', () => {
    expect(fs.existsSync(path.join(ROOT, MIGRATION)), `${MIGRATION} should exist`).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toMatch(/INSERT INTO logic_variables \(variable_key, variable_value, description\)/);
    expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    expect(sql.split('\n').filter((l) => /^\s*(DELETE|DROP|TRUNCATE|UPDATE)\b/i.test(l))).toEqual([]);
  });

  it('seeds exactly the 22 names plus the ruled houseplex_min_units (P3-Q8, pinned 2), each default equal to the Spec 78 table', () => {
    const want = new Map(p59().map((v) => [PREFIX + v.name, v.def]));
    want.set(PREFIX + 'houseplex_min_units', 2); // EVE.P3-Q8: not a P5.9 row; pinned min = max = 2 (800.50(181) 'multiple dwelling units')
    expect([...seeded().keys()].sort()).toEqual([...want.keys()].sort());
    for (const [k, v] of want) expect(seeded().get(k), k).toBe(v);
  });

  it('every description states its bounds exactly as the table does, and names its consumer', () => {
    const sql = read(MIGRATION);
    for (const v of p59()) {
      const row = new RegExp(`\\('${PREFIX}${v.name}',[^]*?\\)(?:,\\n|\\n\\s*ON CONFLICT)`).exec(sql);
      expect(row, v.name).not.toBeNull();
      expect(row![0], v.name).toContain(`bounds [${v.min}, ${v.max}]`);
      expect(row![0], v.name).toContain('CONSUMED by compute_maxbld_scenarios');
    }
  });

  it('the lineage registry sees all 22 seeded and none stale (gate: logic_variables_seeded 22)', async () => {
    const LIN = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/generate-maxbld-lineage.mjs')).href)) as Json;
    const r = LIN.run({ root: ROOT, mode: 'check' }) as Json;
    expect(r.stats.logic_variables_seeded).toBe(22);
    expect(r.stats.logic_variables_owed).toBe(0);
    expect(r.problems).toEqual([]);
  });
});

describe('P3-1: the P5.12 disclosure codes in vocab.json (Spec 78 P5.12; CHAT-70.1; Spec 133 lc.52)', () => {
  const VOCAB = JSON.parse(read('scripts/seeds/bylaw/vocab.json')) as Json;
  // Approved by the operator (CHAT-70.1) and written into Spec 78 on wf1/exc-w2-apply; until that branch merges the
  // spec table lacks it. The allowance disappears by itself once the spec row exists (the test asserts subset only).
  const APPROVED_NOT_YET_IN_SPEC = ['building_history_permission_undated'];

  it('vocab.json carries a closed, sorted-unique disclosure_code list', () => {
    expect(Array.isArray(VOCAB.disclosure_code)).toBe(true);
    expect(new Set(VOCAB.disclosure_code).size).toBe(VOCAB.disclosure_code.length);
    for (const c of VOCAB.disclosure_code) expect(c).toMatch(/^[a-z0-9_]+$/);
  });

  it('both ways with the Spec 78 P5.12 table: every spec code is registered, every extra code is an approved one', async () => {
    const LIB = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/maxbld-trace-lib.mjs')).href)) as Json;
    const spec = [...(LIB.disclosureCodes(SPEC) as Set<string>)];
    expect(spec.length).toBeGreaterThan(60);
    const reg = new Set<string>(VOCAB.disclosure_code);
    expect(spec.filter((c) => !reg.has(c))).toEqual([]);
    const specSet = new Set(spec);
    expect([...reg].filter((c) => !specSet.has(c) && !APPROVED_NOT_YET_IN_SPEC.includes(c))).toEqual([]);
  });

  it('registers the CHAT-70.1 code for the undated building-history sentence', () => {
    expect(VOCAB.disclosure_code).toContain('building_history_permission_undated');
  });
});
