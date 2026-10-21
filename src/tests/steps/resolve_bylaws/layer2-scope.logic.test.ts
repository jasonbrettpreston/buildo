// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §1 (v1 scope), §6 (structures), §7 I1;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-233 (structures), M-234 (v1 scope; "join by a pin change");
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-IS (operator chat batch J,
//            2026-10-21-chat-batch-j#CHAT-36.OQ8, approved on the simplicity condition)
//
// The v1 scope seed, scripts/seeds/bylaw/layer2-scope.json, locked both ways against the lineage registry
// (docs/reference/maxbld-field-lineage.json `keyed.layer2_targets`): a target is in `principal` exactly when a lineage
// field that is not a `suite_` field keys it, and in each suite structure exactly when a `suite_` field keys it; a
// lineage target outside every list is `deferred` with a reason. Each target is a vocab.json `dsl_target`.
//
// RED FIRST: committed as it.fails at c038d605, before the seed existed (gate K artifact
// docs/reports/red-evidence/resolve_bylaws/rulings-j-red.json); flipped to it with the seed.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = path.resolve(__dirname, '../../../../');
const SCOPE_REL = 'scripts/seeds/bylaw/layer2-scope.json';
const scope = (): Json => {
  expect(fs.existsSync(path.join(ROOT, SCOPE_REL)), `${SCOPE_REL} should exist`).toBe(true);
  return JSON.parse(fs.readFileSync(path.join(ROOT, SCOPE_REL), 'utf8')) as Json;
};
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
const LINEAGE = read('docs/reference/maxbld-field-lineage.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const fields = (Array.isArray(LINEAGE.fields) ? LINEAGE.fields : Object.entries(LINEAGE.fields).map(([field, v]) => ({ field, ...(v as Json) }))) as Json[];
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
const keyedBy = (pick: (field: string) => boolean): string[] =>
  sorted(fields.filter((f) => pick(String(f.field)) && f.keyed && Array.isArray(f.keyed.layer2_targets)).flatMap((f) => f.keyed.layer2_targets as string[]));
const SUITE = (f: string): boolean => f.startsWith('suite_');

describe('R-IS: the v1 scope seed', () => {
  it('declares the three v1 structures (Spec 134 §6; M-233)', () => {
    expect(scope().structures).toEqual(['principal', 'garden_suite', 'laneway_suite']);
    expect(Object.keys(scope().targets)).toEqual(['principal', 'garden_suite', 'laneway_suite']);
  });

  it('every list is sorted and unique, and every target is a vocab.json dsl_target', () => {
    const s = scope();
    for (const [k, list] of Object.entries(s.targets) as Array<[string, string[]]>) {
      expect(list, k).toEqual(sorted(list));
      for (const t of list) expect(Object.keys(VOCAB.dsl_target), `${k}: ${t}`).toContain(t);
    }
  });

  it('both ways against the lineage registry: principal = targets keyed by a non-suite field; each suite = targets keyed by a suite_ field (minus deferred)', () => {
    const s = scope();
    const deferred = new Set(Object.keys(s.deferred || {}));
    const live = (xs: string[]): string[] => xs.filter((t) => !deferred.has(t));
    expect(s.targets.principal).toEqual(live(keyedBy((f) => !SUITE(f))));
    expect(s.targets.garden_suite).toEqual(live(keyedBy(SUITE)));
    expect(s.targets.laneway_suite).toEqual(live(keyedBy(SUITE)));
  });

  it('every lineage target is in scope or deferred with a reason, and nothing else is listed', () => {
    const s = scope();
    const lineage = keyedBy(() => true);
    expect(lineage.length).toBeGreaterThan(0);
    const listed = sorted([...(Object.values(s.targets) as string[][]).flat(), ...Object.keys(s.deferred || {})]);
    expect(listed).toEqual(lineage);
    for (const [t, why] of Object.entries(s.deferred || {})) expect(typeof why === 'string' && (why as string).length > 0, t).toBe(true);
  });
});
