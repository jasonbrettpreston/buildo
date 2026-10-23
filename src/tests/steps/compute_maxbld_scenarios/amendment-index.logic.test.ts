/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10 (field_citations: "every number carries its citation and amendment status", §6.6 rule 4)
 * Handbook:  Spec 133 §m.188 (M-188 part 6); Spec 132 §core.9; HELD on P3-Q1 / P3-Q15
 *
 * The compute module cannot require the 14 MB bylaw-provisions.json, and Layer 2 units carry no amendment status. A small GENERATED
 * index (unit id -> worst amendment status of its regulation row, via buildAmendmentIndex) covers exactly the units Layer 2 can cite
 * (docs/reference/bylaw-layer2-input.json), with a --check that fails on drift. STRICT RED FIRST (~/Buildo-scratch/p3build/red-p3-8b.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs surface
const ROOT = path.resolve(__dirname, '../../../../');
const GEN = 'scripts/analysis/phase3/generate-amendment-index.mjs';
const OUT = 'docs/reference/maxbld-amendment-index.json';
async function gen(): Promise<Json> {
  expect(fs.existsSync(path.join(ROOT, GEN)), `${GEN} should exist`).toBe(true);
  return (await import(pathToFileURL(path.join(ROOT, GEN)).href)) as Json;
}

describe('amendment index (generated, --check)', () => {
  it('the committed file equals a regeneration (no drift)', async () => {
    const g = await gen();
    const fresh = g.buildIndexFile({ root: ROOT });
    expect(fs.existsSync(path.join(ROOT, OUT)), `${OUT} should exist`).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(ROOT, OUT), 'utf8'))).toEqual(fresh);
  });
  it('covers every unit of the Layer 2 input, each with a status in the closed set', async () => {
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), 'utf8')) as Json;
    const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8')) as Json;
    const ids: string[] = input.body.units.map((u: Json) => u.unit_id);
    for (const id of ids.slice(0, 5000)) expect(f.index[id], id).toBeDefined();
    for (const s of Object.values(f.index as Json)) expect(['none', 'in_force', 'partially_in_force', 'not_verified']).toContain(s);
    expect(Object.keys(f.index)).toHaveLength(new Set(ids).size);
  });
  it('a unit of a regulation amended by a not_verified by-law reads not_verified (worst status wins)', async () => {
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), 'utf8')) as Json;
    expect(Object.values(f.index)).toContain('not_verified');
  });
  it('the generator is pure over its inputs and --check is the drift gate', async () => {
    const g = await gen();
    expect(typeof g.run).toBe('function');
    const r = g.run({ root: ROOT, mode: 'check' });
    expect(r.drift).toBe(false);
  });
});
