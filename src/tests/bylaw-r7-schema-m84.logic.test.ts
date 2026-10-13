// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-84; docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-SHAPE
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SH = await load('scripts/analysis/bylaw/shape.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');

const codesOf = (r: Json) => r.violations.map((x: Json) => x.code);

describe('M-84 — keyer B unit keys outside the boundary are ignored and counted (G-SHAPE schema arm)', () => {
  const fx: Json[] = FX.shapeFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p))!;
  const fixture = () => {
    const f = byName('good twin: M-84 — a generated field in a .b draft is ignored (counted)');
    expect(f, 'fixture').toBeTruthy();
    return f.input;
  };
  const B_KEYS = ['not_modelled_reason', 'evidence', 'term'];

  it('a: the three B keys in a .b are ignored and counted (b_schema_ignored === 3), no schema_invalid', () => {
    const input = structuredClone(fixture());
    const doc = input.shards[0].b;
    for (const k of B_KEYS) doc.units[0][k] = 'x';
    const r = SH.checkShape(input);
    expect(codesOf(r).filter((c: string) => c === 'schema_invalid')).toEqual([]);
    expect(r.counts.b_schema_ignored).toBe(3);
  });

  it('b: the same three keys on the .a unit still fail schema_invalid (unknown key)', () => {
    const input = structuredClone(fixture());
    const a = input.shards[0].a ||= { schema: input.shards[0].b.schema, shard: input.shards[0].b.shard, keyer: 'A', units: input.shards[0].b.units.map((u: Json) => ({ ...u })), rows: {} };
    for (const k of B_KEYS) a.units[0][k] = 'x';
    const r = SH.checkShape(input);
    const bad = r.violations.filter((x: Json) => x.code === 'schema_invalid');
    expect(bad.length).toBe(3);
    for (const x of bad) expect(x.detail).toContain('unknown key');
  });

  it('c: an unknown key frobnicate in a .b still fails exactly once; b_schema_ignored stays 0', () => {
    const input = structuredClone(fixture());
    input.shards[0].b.units[0].frobnicate = 1;
    const r = SH.checkShape(input);
    const bad = r.violations.filter((x: Json) => x.code === 'schema_invalid');
    expect(bad.map((x: Json) => x.detail)).toEqual([`unit ${input.shards[0].b.units[0].unit_id}: unknown key frobnicate`]);
    expect(r.counts.b_schema_ignored).toBe(0);
  });

  it('d: selfTest passes', () => {
    expect(SH.selfTest().pass).toBe(true);
  });
});
