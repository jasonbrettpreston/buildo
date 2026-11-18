// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-67 arm L, R-LA shrink-only); docs/specs/01-pipeline/69a_mcbylaw_register.md M-403, M-415
// MB-27 increment 6 C2a (operator 'recommendation accepted move them in incr 6', 2026-11-16): the by-law ids, candidate kinds and epsilons that split.js held as literals
// are read from the building-types.json `split` declaration, and the MB-67 baseline entries for them are gone. Behaviour is pinned by the increment-5 split tests.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = process.cwd();
const readText = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string): Json => JSON.parse(readText(rel));
const SPLIT = 'scripts/lib/compute/maxbld/split.js';
const code = (): string => readText(SPLIT).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const decl = (): Json => readJson('scripts/seeds/bylaw/building-types.json').split as Json;

describe('increment 6 C2a: split.js reads its by-law words and tolerances from the declaration', () => {
  it('the declaration carries the path word, the three kinds and the range end, the two epsilons and the five binding ids', () => {
    const d = decl();
    expect(d.path_a).toBe('A');
    expect(d.kinds).toEqual({ range_end: 'range_end', range_min_end: 'min', row: 'row', crossing: 'crossing' });
    expect(d.crossing).toEqual({ min_interval: 1e-9, nudge_factor: 1e-7 });
    expect(d.binding_ids).toEqual({ lt_main: 'suite_gfa_lt_main', cap: 'suite_gfa_cap', ancillary: 'ancillary_coverage', lot_coverage: 'lot_coverage', region: 'suite_region' });
    for (const id of Object.values(d.binding_ids as Json)) expect(Object.keys(d.outputs.binding_words)).toContain(id);
  });
  it('split.js holds none of the 14 literals (2 numbers, 12 strings) outside comments', () => {
    const src = code();
    for (const n of ['1e-9', '1e-7']) expect([n, src.includes(n)]).toEqual([n, false]);
    for (const s of ['range_end', 'min', 'row', 'crossing', 'suite_gfa_lt_main', 'suite_gfa_cap', 'ancillary_coverage', 'lot_coverage', 'suite_region', 'A']) {
      expect([s, new RegExp(`['"\`]${s}['"\`]`).test(src)]).toEqual([s, false]);
    }
  });
  it('split.js reads each through the declaration', () => {
    const src = code();
    for (const k of ['decl.path_a', 'decl.kinds.row', 'decl.kinds.crossing', 'decl.kinds.range_end', 'decl.kinds.range_min_end', 'decl.crossing.min_interval', 'decl.crossing.nudge_factor', 'decl.binding_ids.region']) expect([k, src.includes(k)]).toEqual([k, true]);
  });
  it('the MB-67 baseline for split.js no longer lists them (shrink-only)', () => {
    const b = readJson('mcbylaws/literal-allow.json').baseline[SPLIT] as Json;
    expect(b.numbers).toEqual({});
    expect(Object.keys(b.strings).sort()).toEqual(['/', 'base']);
  });
});
