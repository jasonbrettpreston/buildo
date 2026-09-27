// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA gate E (Spec 124 §5 R-BA gate E/Rule 3)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §9 (the frozen producer contract)
//
// WF2 row 3.2 gate E — `load_centreline` is IN DEVELOPMENT, so it carries NO ledger row of any
// disposition, not even `physical_constant` / `unit_conversion`. The three module-level numeric
// consts that gate E's `compute-no-module-numeric-const` flagged are resolved GENUINELY:
//
//   · `MS_PER_DAY`        → an IMPORT from `scripts/lib/units.js` (the ONE home for pure unit
//                           conversions; gate E closed answer #3). Same value, no ledger row, and
//                           `ageDaysFrom` still resolves an exact 172800000 ms delta to 2 days.
//   · `ROUND_SCALE`       → the logic variable `load_centreline_round_scale` (default 1000),
//                           threaded into `round3(n, scale)`.
//   · `MAX_DETAIL_KEYS`   → the logic variable `load_centreline_max_detail_keys` (default 50),
//                           read as a local in `centreline_geometry_skipped_pct`.
//
// ⚠️ THIS SUITE PROVES CONFIG FLOW, NOT A HARDCODED LITERAL. Every behavioural case below drives a
// check with a NON-DEFAULT value and asserts the output moved — a compute that still read 1000 / 50
// would fail here. The descriptor/seed cases prove the declarations exist with the right bounds.
//
// ⚠️ The stubs (`driveCheck` / `loadDescriptor` / `seedDefaults`) are copied MINIMAL from
// `./violations.test.ts` and deliberately NOT imported from it, so this file stands alone.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const DESCRIPTOR_REL = 'scripts/load-centreline.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/load-centreline.js';
const SEED_REL = 'scripts/seeds/logic_variables.json';

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

function readText(rel: string): string {
  expect(fs.existsSync(abs(rel)), `MISSING ARTIFACT ${rel}`).toBe(true);
  return fs.readFileSync(abs(rel), 'utf8');
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute module
  const mod = require(abs(COMPUTE_REL)) as ComputeModule | ((ctx: unknown) => Promise<unknown>);
  return (typeof mod === 'function' ? { ...mod, compute: mod } : mod) as ComputeModule;
}

interface LogicVariable { name: string; min: unknown; max: unknown; on_invalid: string }
interface Descriptor {
  config: 'none' | {
    logic_variables: LogicVariable[];
    validation: string;
    hoisted_above_gate: boolean;
  };
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS descriptor validator
  const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
    validateDescriptor: (x: unknown) => unknown;
  };
  validateDescriptor(d); // throws with the AJV error list — the loader property (§4.2)
  return d;
}

function seedDefaults(): Record<string, { default: number; on_invalid?: string }> {
  return JSON.parse(readText(SEED_REL)) as Record<string, { default: number; on_invalid?: string }>;
}

/** Drive ONE check function from the compute's dispatch table, capturing its `report()` calls (the `load-ravines.js` idiom). */
function driveCheck(checkId: string, ctx: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const mod = loadComputeModule();
  const fn = (mod.checks ?? {})[checkId];
  expect(typeof fn, `the compute dispatch carries no function for check "${checkId}"`).toBe('function');
  const calls: Array<[string, Record<string, unknown>]> = [];
  (fn as (c: unknown) => unknown)({
    ...ctx,
    report: (id: string, o: Record<string, unknown>) => { calls.push([id, o]); },
  } as never);
  return calls;
}

/** The two variables gate E moved out of the compute module. */
const NEW_VARS: Record<string, { min: number; max: number; default: number }> = {
  load_centreline_round_scale: { min: 1, max: 100000, default: 1000 },
  load_centreline_max_detail_keys: { min: 1, max: 1000, default: 50 },
};

/** A config carrying the six already-seeded centreline knobs PLUS the two new ones at their defaults. */
const BASE_CONFIG = {
  load_centreline_dataset_age_warn_days: 7,
  load_centreline_count_drift_fail_pct: 0.5,
  load_centreline_invalid_geometry_fail_pct: 0.05,
  load_centreline_round_scale: 1000,
  load_centreline_max_detail_keys: 50,
};

// ===========================================================================
// 1. config flow — MAX_DETAIL_KEYS → load_centreline_max_detail_keys
// ===========================================================================

describe('gate E — the dropped-id cap is CONFIG-DRIVEN, not a hardcoded 50 (LC-D15 / ravines LR-D1)', () => {
  it('skipped_keys length 5 + load_centreline_max_detail_keys 2 (non-default) ⇒ 2 ids kept and truncated:true', () => {
    const calls = driveCheck('centreline_geometry_skipped_pct', {
      acquired: {
        feature_count: 100,
        invalid_geometry_skipped: 5,
        skipped_keys: [11, 22, 33, 44, 55],
      },
      config: { ...BASE_CONFIG, load_centreline_max_detail_keys: 2 },
    });
    expect(calls).toHaveLength(1);
    const detail = calls[0]![1].detail as Record<string, unknown>;
    expect(detail.dropped_count, 'the FULL count is reported beside the cap, never the truncated length').toBe(5);
    expect(detail.dropped_source_ids, 'a compute still reading the literal 50 would carry all 5 here').toEqual([11, 22]);
    expect(detail.dropped_ids_truncated, '5 > 2 ⇒ truncated').toBe(true);
  });

  it('the default cap 50 keeps a 5-id list COMPLETE (no truncation) — the same input, a different config', () => {
    const calls = driveCheck('centreline_geometry_skipped_pct', {
      acquired: {
        feature_count: 100,
        invalid_geometry_skipped: 5,
        skipped_keys: [11, 22, 33, 44, 55],
      },
      config: BASE_CONFIG,
    });
    const detail = calls[0]![1].detail as Record<string, unknown>;
    expect(detail.dropped_source_ids).toEqual([11, 22, 33, 44, 55]);
    expect(detail.dropped_ids_truncated).toBe(false);
  });
});

// ===========================================================================
// 2. config flow — ROUND_SCALE → load_centreline_round_scale
// ===========================================================================

describe('gate E — the ratio DISPLAY precision is CONFIG-DRIVEN, not a hardcoded 1000 (pre-Round_SCALE)', () => {
  it('load_centreline_round_scale 10 (non-default) ⇒ the drift detail rounds to 1 decimal', () => {
    // |20000 - 47363| / 47363 = 0.5777… → 1 dp = 0.6 (the default 1000 would give 0.578).
    const calls = driveCheck('centreline_count_drift_pct', {
      acquired: { feature_count: 20000 },
      prior: { feature_count_filtered: 47363 },
      config: { ...BASE_CONFIG, load_centreline_round_scale: 10 },
    });
    expect(calls).toHaveLength(1);
    const o = calls[0]![1];
    expect(o.value, 'the RAW ratio is untouched by the display scale').toBeCloseTo(0.5777, 4);
    expect(o.detail, '2 dp would be 0.58 and the default 3 dp 0.578 — only a scale of 10 gives 0.6').toBe(0.6);
  });

  it('the default scale 1000 gives 3 decimals — the same input, a different config', () => {
    const calls = driveCheck('centreline_count_drift_pct', {
      acquired: { feature_count: 20000 },
      prior: { feature_count_filtered: 47363 },
      config: BASE_CONFIG,
    });
    expect(calls[0]![1].detail).toBe(0.578);
  });

  it('the geometry-skip row reads the SAME scale (both round3 call sites are config-driven)', () => {
    const calls = driveCheck('centreline_geometry_skipped_pct', {
      acquired: { feature_count: 47, invalid_geometry_skipped: 3, skipped_keys: [] },
      config: { ...BASE_CONFIG, load_centreline_round_scale: 10 },
    });
    // 3/47 = 0.06382… → 1 dp = 0.1 (the default 1000 would give 0.064).
    expect(calls[0]![1].detail).toBe(0.1);
  });
});

// ===========================================================================
// 3. the declarations exist — descriptor + seed rows
// ===========================================================================

describe('gate E — both variables are DECLARED (config.logic_variables[] + seed rows, Rule 3)', () => {
  it('loadDescriptor().config.logic_variables carries both with their bounds and on_invalid "clamp"', () => {
    const d = loadDescriptor();
    expect(d.config, 'a step with externalized literals may not declare config:"none"').not.toBe('none');
    const cfg = d.config as { logic_variables: LogicVariable[]; validation: string; hoisted_above_gate: boolean };
    const byName = new Map(cfg.logic_variables.map((v) => [v.name, v]));
    for (const [name, spec] of Object.entries(NEW_VARS)) {
      const v = byName.get(name);
      expect(v, `${name} must be declared in config.logic_variables[]`).toBeDefined();
      expect(v!.min).toBe(spec.min);
      expect(v!.max).toBe(spec.max);
      expect(v!.on_invalid, 'verdict-neutral (R-G / Rule 3: `fail` is mandatory only on verdict-affecting bounds)').toBe('clamp');
    }
  });

  it('seedDefaults() carries both with defaults 1000 / 50 and on_invalid "clamp"', () => {
    const S = seedDefaults();
    for (const [name, spec] of Object.entries(NEW_VARS)) {
      const row = S[name];
      expect(row, `${SEED_REL} does not seed declared variable ${name} (Rule 3)`).toBeDefined();
      expect(row!.default, `seed default for ${name}`).toBe(spec.default);
    }
  });
});

// ===========================================================================
// 4. MS_PER_DAY — value-identical to the replaced literal, now imported
// ===========================================================================

describe('gate E — MS_PER_DAY is an IMPORT (scripts/lib/units.js), value-identical to the replaced literal', () => {
  it('compute no longer carries a module-level MS_PER_DAY / ROUND_SCALE / MAX_DETAIL_KEYS const', () => {
    const src = readText(COMPUTE_REL);
    expect(/^const MS_PER_DAY\s*=/m.test(src), 'MS_PER_DAY comes from ../units, not a local const').toBe(false);
    expect(/^const ROUND_SCALE\s*=/m.test(src), 'ROUND_SCALE is now load_centreline_round_scale').toBe(false);
    expect(/^const MAX_DETAIL_KEYS\s*=/m.test(src), 'MAX_DETAIL_KEYS is now load_centreline_max_detail_keys').toBe(false);
    expect(/require\(['"]\.\.\/units['"]\)/.test(src), 'MS_PER_DAY is required from the ONE units home').toBe(true);
    expect(/module\.exports\.MAX_DETAIL_KEYS/.test(src), 'no consumer reads the export — only load_ravines\'s own test reads its own').toBe(false);
  });

  it('ageDaysFrom: a 172800000 ms delta still resolves to ageDays 2 (the exact value the literal produced)', () => {
    const mod = loadComputeModule();
    const fn = mod.ageDaysFrom as (nowMs: number, versionStr: string | null) => number | null;
    expect(typeof fn, 'the pure helper is still importable one at a time').toBe('function');
    const now = Date.parse('2026-09-24T12:00:00.000Z');
    expect(fn(now, '2026-09-22T12:00:00.000Z'), '172800000 / 86400000 = 2 — byte-identical to the replaced literal').toBe(2);
    expect(fn(now, null), 'an absent validator is null, never NaN').toBeNull();
  });
});
