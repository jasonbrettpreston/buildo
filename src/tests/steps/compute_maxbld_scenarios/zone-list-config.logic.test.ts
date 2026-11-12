// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (Phase-5 step identity); docs/specs/01-pipeline/134_resolve_bylaws.md §2
//            (the population zone list); docs/specs/01-pipeline/124_step_standard_policy.md §5 R-FE (W4A-R3: the closed shared list)
//
// MB-35 post-night, decision D-54 (option A, 2026-11-12). The step read the Layer 2 zone list from a declared logic_variables LOOKUP
// (variable_key resolve_bylaws_population_zone_classes). The witness resolver counts logic_variables as runner-owned
// (scripts/lib/sql-witness/resolve.cjs), so no trace or fixture could ever witness that declared read and #44 arm (a) failed on the
// night's capture. The fix: the zone list is a declared config entry, the same shared logic variable resolve_bylaws reads, on the
// closed SHARED_LOGIC_VARIABLES list with both consumers. RED FIRST on f662f2913 (each case flips at the D-54 build commit).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const NAME = 'resolve_bylaws_population_zone_classes';
const STEP = 'compute_maxbld_scenarios';

const D = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
const RB = readJson('scripts/resolve-bylaws.descriptor.json');
const entryOf = (d: Json): Json | undefined => (d.config.logic_variables as Json[]).find((v) => v.name === NAME);

describe('D-54: the zone list is a declared shared config entry, never a logic_variables lookup', () => {
  it('the descriptor declares no logic_variables read (flips at the D-54 build commit)', () => {
    const tables = (D.inputs.reads.tables as Json[]).map((t) => String(t.table));
    expect(tables).not.toContain('logic_variables');
  });

  it('the descriptor declares the zone list with the same closed list_of and bounds as resolve_bylaws (flips at the D-54 build commit)', () => {
    const mine = entryOf(D);
    const theirs = entryOf(RB) as Json;
    expect(theirs).toBeTruthy();
    expect(mine).toEqual(theirs);
  });

  it('the closed shared list names both consumers, and the vocabulary gate passes the entry (flips at the D-54 build commit)', async () => {
    const CB = (await import(path.join(ROOT, 'scripts/analysis/gates/closed-bounds.mjs'))) as Json;
    const shared = CB.SHARED_LOGIC_VARIABLES[NAME] as Json;
    expect(shared).toBeTruthy();
    expect([...shared.consumers].sort()).toEqual([STEP, 'resolve_bylaws']);
    const items = (CB.vocabularyViolations(D, CB.loadVocabularyContext(ROOT)) as Json[]).map((v) => v.item);
    expect(items).not.toContain(`vocab.config.logic_variables.${NAME}`);
  });

  it('the loader takes the zone list from the validated config: no lookup row needed, a missing or non-list value throws by name (flips at the D-54 build commit)', () => {
    const S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    const lv = readJson('scripts/seeds/logic_variables.json');
    const config: Json = Object.fromEntries((D.config.logic_variables as Json[]).map((d) => [d.name, lv[d.name].default]));
    expect(config[NAME]).toEqual(['R', 'RD', 'RS', 'RT', 'RM']);
    const L = S.lookupsFor({}, config) as Json;
    expect(L.layer1Env).toBeTruthy();
    const { [NAME]: _gone, ...short } = config; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => S.lookupsFor({}, short)).toThrow(new RegExp(NAME));
    expect(() => S.lookupsFor({}, { ...config, [NAME]: 'R' })).toThrow(new RegExp(NAME));
  });
});
