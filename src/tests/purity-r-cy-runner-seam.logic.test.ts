// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CY — runner seam for the last CP-PLANA rows; R-BZ G7/G12, R-CE)
//
// R-CY (McDonald's Airtight V3, operator y 2026-10-17). Three runner seams close the 8 blocked CP-PLANA rows:
//   Y1  `ctx.withinLimit(checkId, value)` (scripts/lib/step/verdict.js makeWithinLimit): a §9 emit field that
//       restates a declared check's outcome (drift_check_passed, mass_delete_check_passed, the centreline
//       cascade arms) is decided by THAT check's declared bound, never by compute comparing ctx.config (G7).
//       load_ravines ×2, load_heritage ×2 (per lane), load_centreline ×2.
//   Y2  the descriptor travels IN — `ctx.descriptor`, and the shapeRecord / buildLookup seams' `descriptor` —
//       so load_neighbourhoods and load_zoning no longer require their own descriptor (G12).
//   Y3  runRecorderPhase hands compute.buildReads the resolved config AND the run clock (R-CE).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const readJson = (rel: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

type WithinLimit = (id: string, value: number) => boolean;
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + compute modules */
const verdict = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  makeWithinLimit?: (descriptor: unknown, config: unknown) => WithinLimit;
  checkRow: (check: unknown, observation: unknown, onCheckError: string, config?: unknown) => { status: string } | null;
};
const runner = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
  STEP_CTX_KEYS: readonly string[];
  runRecorderPhase: (args: Record<string, unknown>) => Promise<{ writeSkipped: boolean }>;
};
/** One named export of a compute module, refused loudly when absent. */
function fn(rel: string, name: string): (...a: unknown[]) => unknown {
  const f = (require(path.join(REPO_ROOT, rel)) as Record<string, unknown>)[name];
  if (typeof f !== 'function') throw new Error(`${rel} exports no ${name}()`);
  return f as (...a: unknown[]) => unknown;
}
/* eslint-enable @typescript-eslint/no-require-imports */

type Descriptor = { checks: Array<{ id: string; limit_from_config?: string; severity: string }>; inputs: { reads: { externals: Array<{ id: string }> } } };
const D = {
  ravines: readJson('scripts/load-ravines.descriptor.json') as unknown as Descriptor,
  heritage: readJson('scripts/load-heritage.descriptor.json') as unknown as Descriptor,
  centreline: readJson('scripts/load-centreline.descriptor.json') as unknown as Descriptor,
  zoning: readJson('scripts/load-zoning.descriptor.json') as unknown as Descriptor,
};

/** The six restated checks and their own `limit_from_config` variables. */
const RESTATED: Array<[keyof typeof D, string, string]> = [
  ['ravines', 'ravine_count_drift_pct', 'load_ravines_count_drift_fail_pct'],
  ['ravines', 'ravine_mass_delete_pct', 'load_ravines_mass_delete_fail_pct'],
  ['heritage', 'heritage_count_drift_pct', 'load_heritage_count_drift_fail_pct'],
  ['heritage', 'heritage_mass_delete_pct', 'load_heritage_mass_delete_fail_pct'],
  ['centreline', 'centreline_count_drift_pct', 'load_centreline_count_drift_fail_pct'],
  ['centreline', 'centreline_geometry_skipped_pct', 'load_centreline_invalid_geometry_fail_pct'],
];

describe('Y1 — ctx.withinLimit: the declared check decides a restating emit (R-CY, R-BZ G7)', () => {
  it('the runner exposes withinLimit on every step ctx (STEP_CTX_KEYS)', () => {
    expect(runner.STEP_CTX_KEYS).toContain('withinLimit');
    expect(typeof verdict.makeWithinLimit).toBe('function');
  });

  for (const [step, checkId, varName] of RESTATED) {
    it(`${checkId}: withinLimit agrees with the check's own row, over the bound from config (${varName}), boundary inclusive`, () => {
      const d = D[step];
      const check = d.checks.find((c) => c.id === checkId)!;
      expect(check.limit_from_config, 'the restated check carries its bound from config').toBe(varName);
      const config = { [varName]: 0.2 };
      const within = verdict.makeWithinLimit!(d, config);
      for (const value of [0, 0.1999, 0.2, 0.2001, 0.9]) {
        const row = verdict.checkRow(check, { value }, 'fail_step', config)!;
        expect(within(checkId, value), `value ${value}: the emit and the audit row agree`).toBe(row.status === 'PASS');
        expect(within(checkId, value)).toBe(value <= 0.2); // the comparison the compute used to make itself
      }
      expect(within(checkId, Number.NaN), 'an unevaluable value is never "within" (NaN <= x was false too)').toBe(false);
      expect(verdict.makeWithinLimit!(d, { [varName]: 0.95 })(checkId, 0.9), 'the bound is the CONFIG value, not the literal').toBe(true);
    });
  }

  it('an undeclared check id throws (the declaration is the only source of a bound)', () => {
    expect(() => verdict.makeWithinLimit!(D.ravines, {})('ravine_no_such_check', 0)).toThrow(/not a declared check/);
  });

  const deny: WithinLimit = () => false;
  const allow: WithinLimit = () => true;

  it('load_ravines buildLoadMeta: both restating fields are the runner\'s answer, whatever ctx.config says', () => {
    const buildLoadMeta = fn('scripts/lib/compute/load-ravines.js', 'buildLoadMeta');
    const ctx = (withinLimit: WithinLimit) => ({
      descriptor: D.ravines, acquired: { feature_count: 10 }, written: { deleted: 0, updated: 0 },
      prior: null, config: { load_ravines_count_drift_fail_pct: 1, load_ravines_mass_delete_fail_pct: 1 }, withinLimit,
    });
    const no = buildLoadMeta(ctx(deny)) as Record<string, unknown>;
    expect([no.drift_check_passed, no.mass_delete_check_passed]).toEqual([false, false]);
    const yes = buildLoadMeta(ctx(allow)) as Record<string, unknown>;
    expect([yes.drift_check_passed, yes.mass_delete_check_passed]).toEqual([true, true]);
  });

  it('load_heritage: each lane asks with ITS OWN value (per-lane drift, not the worst-of row)', () => {
    const buildLoadMeta = fn('scripts/lib/compute/load-heritage.js', 'buildLoadMeta');
    const asked: Array<[string, number]> = [];
    const spy: WithinLimit = (id, v) => { asked.push([id, v]); return v <= 0.5; };
    const meta = buildLoadMeta({
      descriptor: D.heritage, withinLimit: spy, config: { load_heritage_round_scale: 1000 }, overrides: {},
      acquired: { primaries: {
        heritage_register: { outcome: 'loaded', feature_count: 10, content_hash: 'a', source_dataset_version: 'a' },
        heritage_districts: { outcome: 'loaded', feature_count: 30, content_hash: 'b', source_dataset_version: 'b' },
      } },
      written: { by_target: { heritage_properties: { deleted: 0 }, heritage_districts: { deleted: 0 } } },
      prior: { heritage_register: { feature_count: 10 }, heritage_districts: { feature_count: 10 } },
    }) as { heritage_load: Record<string, Record<string, unknown>> };
    const drift = asked.filter(([id]) => id === 'heritage_count_drift_pct').map(([, v]) => v);
    expect(drift.length).toBeGreaterThanOrEqual(2);
    expect(new Set(drift).size, 'two lanes, two different measured values').toBeGreaterThan(1);
    expect(meta.heritage_load.heritage_register!.drift_check_passed).toBe(true);
    expect(meta.heritage_load.heritage_districts!.drift_check_passed).toBe(false);
  });

  it('load_centreline: the drift cascade arm follows the runner\'s answer for centreline_count_drift_pct', () => {
    const buildLoadMeta = fn('scripts/lib/compute/load-centreline.js', 'buildLoadMeta');
    const ctx = (withinLimit: WithinLimit) => ({
      descriptor: D.centreline, withinLimit, overrides: {}, prior: null,
      config: { load_centreline_count_drift_fail_pct: 1, load_centreline_invalid_geometry_fail_pct: 1 },
      acquired: { rows_read: 5, feature_count: 5, invalid_geometry_skipped: 0 },
      written: { inserted: 5, deleted: 0, replace_skipped_empty_guard: false },
    });
    expect((buildLoadMeta(ctx(deny)) as Record<string, unknown>).drift_check_passed).toBe(false);
    expect((buildLoadMeta(ctx(allow)) as Record<string, unknown>).drift_check_passed).toBe(true);
  });
});

describe('Y2 — the descriptor travels in: no compute requires its own descriptor (R-CY, R-BZ G12)', () => {
  for (const rel of ['scripts/lib/compute/load-neighbourhoods.js', 'scripts/lib/compute/load-zoning.js']) {
    it(`${rel} holds no require of a descriptor`, () => {
      expect(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')).not.toMatch(/require\([^)]*descriptor\.json/);
    });
  }

  it('load_neighbourhoods: shapeRecord / buildLookup read the lookup id off the seam\'s descriptor', () => {
    const rel = 'scripts/lib/compute/load-neighbourhoods.js';
    const buildLookup = fn(rel, 'buildLookup');
    const d = readJson('scripts/load-neighbourhoods.descriptor.json');
    expect(() => buildLookup('ckan:not-the-lookup', [], { config: {}, descriptor: d })).toThrow(/not the declared lookup/);
    const lookupId = fn(rel, 'lookupIdOf')(d) as string;
    expect((buildLookup(lookupId, [], { config: {}, descriptor: d }) as { map: unknown }).map).toEqual({});
  });

  it('load_zoning: the vocabulary\'s layer keys are the declared primaries, in declared order', () => {
    const layers = (fn('scripts/lib/compute/load-zoning.js', 'layersOf')(D.zoning) as Array<{ key: string }>).map((l) => l.key);
    expect(layers).toEqual(D.zoning.inputs.reads.externals.map((e) => e.id));
  });
});

describe('Y3 — runRecorderPhase hands compute.buildReads the config AND the run clock (R-CY, R-CE)', () => {
  it('buildReads receives (the resolved config object, the runner\'s clockNow)', async () => {
    const descriptor = readJson('scripts/refresh-snapshot.descriptor.json');
    const config = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 1 : undefined) });
    const clockNow = new Date('2026-10-17T09:00:00Z');
    const seen: unknown[][] = [];
    const answer = async (sql: string) => (/pg_backend_pid/.test(sql) ? { rows: [{ pid: 1 }] } : { rows: [] });
    const pool = { query: answer, connect: async () => ({ query: answer, release: () => {} }) };
    const compute = {
      buildReads: (...args: unknown[]) => { seen.push(args); return { main: [], optional: [] }; },
      buildRow: () => ({ row: {}, matched: { optional_query_failed: [] } }),
      buildWriteSql: () => ({ sql: 'SELECT 1', params: [] }),
    };
    const out = await runner.runRecorderPhase({
      descriptor, pool, compute, config, chainId: null, log: silentLog, tag: '[refresh_snapshot]', clockNow,
      preWriteGate: async () => ({ abort: true, failed: ['probe'] }),
    });
    expect(out.writeSkipped).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]![0], 'the SAME resolved config object').toBe(config);
    expect(seen[0]![1], 'the runner\'s own run clock, never a compute Date.now()').toBe(clockNow);
  });
});
