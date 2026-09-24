// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md (the source producer contract; As-built)
// SPEC LINK: docs/specs/01-pipeline/121_assessment_and_verification_methodology.md §4.3 (the rule for a DEFECT — a defect the conversion itself introduced is FIXED inside its own commit; a carried legacy behaviour is PINNED)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md RE-FREEZE #19 (`columns[].on_empty:"preserve"|"preserve_null"` — the declared empty/NULL-preservation axis, executed by the shared codegen in scripts/lib/step/write.js)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md 0o (the generic runner counters `acquired.rows_shaped` / `acquired.column_nulls.<column>` a check reads instead of a per-step dead field)
//
// Row 3.1 post-conversion fixes — AP-D7 (empty/NULL preservation dropped by the conversion's
// default codegen) and AP-D8 (`null_address_number_pct` reading two `ctx.acquired` fields no
// runner ever populates). Both are DEFECTS the CONVERSION introduced (Spec 121 §4.3), not
// carried legacy behaviour: the pre-conversion loader preserved an already-populated value when
// the source shipped a blank/NULL (`git show 120b2b99:scripts/load-address-points.js:192-243`),
// and the legacy audit row genuinely surfaced the null-address fraction. The converted step
// silently lost both. Fixed in this commit with the shared, DECLARED axes — never a
// per-step compute-authored statement.
//
// ⚠️ EVERY `it` BELOW COMMENTS ITS RED VALUE, measured before the fix (2026-09-24): the
// descriptor declares no `columns[].on_empty` and the compute reads the never-populated
// `attempted_address_number_rows` / `null_address_number_rows`.

import { describe, it, expect } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/load-address-points.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/load-address-points.js';
const WRITE_REL = 'scripts/lib/step/write.js';

/** The 10 TEXT columns the legacy loader preserves with `COALESCE(NULLIF(EXCLUDED.x, ''), x)`. */
const TEXT10 = [
  'address_number', 'linear_name_full', 'address_full', 'maint_stage', 'address_status',
  'address_class_desc', 'class_family_desc', 'place_name', 'addr_num_normalized',
  'linear_name_normalized',
];
/** The 2 non-text columns the legacy loader preserves with the NULL-form `COALESCE(EXCLUDED.x, x)`. */
const NULL2 = ['lo_num', 'hi_num'];
/** The 12 declared preservation columns — TEXT10 + NULL2. */
const ON_EMPTY_12 = [...TEXT10, ...NULL2];
/** The 3 columns that stay BARE — the legacy fence: wrapping lat/lng/geom would suppress coordinate moves. */
const BARE = ['latitude', 'longitude', 'geom'];

interface ComputeModule { checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

function loadComputeModule(): ComputeModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute module
  const mod = require(path.join(REPO_ROOT, COMPUTE_REL)) as ComputeModule | ((ctx: unknown) => Promise<unknown>);
  return (typeof mod === 'function' ? { ...mod, compute: mod } : mod) as ComputeModule;
}

function loadDescriptor(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real converted descriptor
  return require(path.join(REPO_ROOT, DESCRIPTOR_REL)) as Record<string, unknown>;
}

/** Drive ONE check function from the compute's dispatch table, capturing its report() calls. */
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

/** Build the real write plan for the descriptor's single write target via the shared codegen. */
function buildPlan(): Record<string, unknown> {
  const d = loadDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write library
  const writeLib = require(path.join(REPO_ROOT, WRITE_REL)) as {
    buildWritePlan: (w: unknown, d: unknown) => Record<string, unknown>;
  };
  const writes = (d.outputs as { writes: Array<Record<string, unknown>> }).writes;
  return writeLib.buildWritePlan(writes[0], d);
}

const CFG = {
  sources_address_points_floor: 500000,
  address_points_skip_rate_max_pct: 5,
  address_points_null_address_number_max_pct: 0.1,
  address_points_download_timeout_ms: 60000,
};

// ===========================================================================
// AP-D7 — the empty/NULL preservation is DECLARED (RE-FREEZE #19, the 0m axis)
// ===========================================================================

describe('address_points AP-D7 — the declared on_empty preservation axis (RE-FREEZE #19)', () => {
  it('L1 — each of the 10 TEXT columns renders the legacy COALESCE(NULLIF...) SET form AND the NULLIF-guarded WHERE form (RED: no on_empty declared, so `col = EXCLUDED.col` today)', () => {
    // RED value before the fix: `address_number = EXCLUDED.address_number` and
    // `address_points.address_number IS DISTINCT FROM EXCLUDED.address_number` — the legacy
    // preservation (`git show 120b2b99:scripts/load-address-points.js:192-243`) is absent.
    const sql = buildPlan().upsertSqlFor as (n: number) => string;
    const text = sql(1);
    for (const col of TEXT10) {
      expect(text, `${col}: the empty-preserving SET form`).toContain(
        `${col} = COALESCE(NULLIF(EXCLUDED.${col}, ''), address_points.${col})`,
      );
      expect(text, `${col}: the NULLIF-guarded WHERE form`).toContain(
        `(NULLIF(EXCLUDED.${col}, '') IS NOT NULL AND address_points.${col} IS DISTINCT FROM EXCLUDED.${col})`,
      );
    }
  });

  it('L2 — lo_num/hi_num render the NULL-form COALESCE(EXCLUDED...) with NO NULLIF (RED: bare `col = EXCLUDED.col` today)', () => {
    // RED value before the fix: `lo_num = EXCLUDED.lo_num` / `hi_num = EXCLUDED.hi_num`, and
    // the guard `address_points.lo_num IS DISTINCT FROM EXCLUDED.lo_num` — the legacy NULL-form
    // (`COALESCE(EXCLUDED.lo_num, address_points.lo_num)`) is absent.
    const text = (buildPlan().upsertSqlFor as (n: number) => string)(1);
    for (const col of NULL2) {
      expect(text, `${col}: the NULL-preserving SET form (no NULLIF)`).toContain(
        `${col} = COALESCE(EXCLUDED.${col}, address_points.${col})`,
      );
      expect(text, `${col}: the NULL-guarded WHERE form (no NULLIF)`).toContain(
        `(EXCLUDED.${col} IS NOT NULL AND address_points.${col} IS DISTINCT FROM EXCLUDED.${col})`,
      );
      expect(text, `${col}: preserve_null carries NO NULLIF`).not.toContain(`NULLIF(EXCLUDED.${col}`);
    }
  });

  it('L3 (GREEN both) — latitude/longitude/geom stay BARE: the legacy fence, wrapping them suppresses coordinate moves', () => {
    const text = (buildPlan().upsertSqlFor as (n: number) => string)(1);
    for (const col of BARE) {
      expect(text, `${col}: the SET stays bare`).toContain(`${col} = EXCLUDED.${col}`);
      expect(text, `${col}: the guard stays bare`).toContain(`address_points.${col} IS DISTINCT FROM EXCLUDED.${col}`);
      expect(text, `${col}: NEVER wrapped`).not.toContain(`NULLIF(EXCLUDED.${col}`);
    }
  });

  it('L4 — plan.on_empty_columns is exactly the 12 declared names (RED: [] today)', () => {
    // RED value before the fix: `plan.on_empty_columns` is `[]`.
    const plan = buildPlan();
    expect((plan.on_empty_columns as string[]).slice().sort()).toEqual([...ON_EMPTY_12].sort());
  });
});

// ===========================================================================
// AP-D8 — null_address_number_pct reads the generic 0o runner counters
// ===========================================================================

describe('address_points AP-D8 — null_address_number_pct reads the 0o counters', () => {
  it('L5a — rows_shaped 100 / column_nulls.address_number 20 ⇒ one violation (RED: reads a dead field ⇒ 0)', () => {
    // RED value before the fix: `attempted`/`nullRows` read `attempted_address_number_rows` /
    // `null_address_number_rows`, which no runner writes ⇒ the compute's `numberOrNull(...) == null`
    // guard short-circuits to `violations: 0` forever. 0.20 > 0.10 ⇒ 1.
    const calls = driveCheck('null_address_number_pct', {
      acquired: { rows_shaped: 100, column_nulls: { address_number: 20 } }, config: CFG,
    });
    expect(calls[0]![1].violations, '0.20 > 0.10 ⇒ violation').toBe(1);
  });

  it('L5b — rows_shaped 100 / column_nulls.address_number 1 ⇒ zero violations (RED: 0 both ways today, but for the WRONG reason)', () => {
    const calls = driveCheck('null_address_number_pct', {
      acquired: { rows_shaped: 100, column_nulls: { address_number: 1 } }, config: CFG,
    });
    expect(calls[0]![1].violations, '0.01 < 0.10 ⇒ clean').toBe(0);
  });

  it('L5c — an unmeasured run reports violations 0 and detail null, and never throws', () => {
    const calls = driveCheck('null_address_number_pct', { acquired: {}, config: CFG });
    expect(calls[0]![1].violations).toBe(0);
    expect(calls[0]![1].detail).toBeNull();
  });

  it('L5d (source lock) — the compute no longer names the dead `attempted_address_number_rows` field', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute module
    const src = require('fs').readFileSync(path.join(REPO_ROOT, COMPUTE_REL), 'utf8') as string;
    expect(src.includes('attempted_address_number_rows'), 'the never-populated legacy field must be gone').toBe(false);
  });
});
