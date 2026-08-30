// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10 (the verdict is ALWAYS derived
//            from the declared checks' rows — never a parallel boolean, never a hardcoded literal)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.1 (deriveVerdict(rows))
//
// Peel 8b (verdict/audit) — pilot 6 (`compute_centroids`). Fold C's S-2 finding named the exact
// construct this pilot's pre-conversion script carried at `compute-centroids.js:214`:
//
//   const hasWarns = failed > 0 || safeParseFloat(computeRate, 'compute_rate') < 98;
//   ...
//   verdict: hasWarns ? 'WARN' : 'PASS'
//
// — a hand-rolled parallel boolean, the exact shape Rule 10 bans. The frozen shape (commit 7) never
// ported this construct at all: `compute.js` reports observations via `ctx.report()` and the RUNNER
// (`scripts/lib/step/verdict.js buildAuditTable`/`deriveVerdict`) computes the cascade — there is no
// step-owned verdict logic left to peel out (test #199 in violations.test.ts already proves the
// absence). What this peel adds is the thing #199 could not: a MUST-FAIL SABOTAGE BATTERY exercising
// BOTH non-INFO checks (T1 `failed_geometries`, T2 `compute_rate`) through the REAL compute check
// functions + the REAL library cascade, and — the part that makes "same predicate" a provable claim
// rather than an assertion — a fixture where the OLD `hasWarns` formula and the NEW row-derived
// cascade would have DIVERGED, so Rule 10 is shown to matter here, not merely to restate the old
// behaviour under a new name.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const verdictLib = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/compute-centroids.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/compute-centroids.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

type Observation = { violations?: number; value?: number; detail?: unknown; error?: unknown };

/** Drive one compute check function directly, capturing what it reports via ctx.report(). */
function observe(checkId: string, matched: Record<string, unknown>): Observation {
  let captured: Observation | undefined;
  const ctx = {
    matched,
    report(id: string, obs: Observation) {
      if (id === checkId) captured = obs;
    },
  };
  const fn = compute.checks[checkId] as (c: typeof ctx) => void;
  fn(ctx);
  expect(captured, `${checkId} must call ctx.report()`).toBeDefined();
  return captured as Observation;
}

/**
 * The RETIRED pre-conversion formula, recomputed here ONLY to prove where it agrees and
 * diverges from the new cascade — never a step in the shipped code path (report §2/PH-3 cites
 * this construct by name; test #199-provenance in violations.test.ts independently confirms it
 * genuinely existed). Mirrors `compute-centroids.js:197-214`'s own defaulting behaviour exactly:
 * `failed`/`computeRate` read from `matched`, defaulting to values that make a MISSING or
 * UNMEASURED signal look clean — the defect class this peel's divergence fixture exposes.
 */
function oldHasWarnsVerdict(matched: { failed_geometries?: number; parcels_processed?: number; centroids_computed?: number }): 'PASS' | 'WARN' {
  const failed = matched.failed_geometries || 0;
  const processed = matched.parcels_processed || 0;
  const computed = matched.centroids_computed || 0;
  const computeRate = processed > 0 ? (computed / processed) * 100 : 100;
  const hasWarns = failed > 0 || computeRate < 98;
  return hasWarns ? 'WARN' : 'PASS';
}

/** Build the two non-INFO checks' rows via the real compute functions + the real cascade. */
function buildRows(matched: Record<string, unknown>, overrideObservations: Partial<Record<string, Observation>> = {}) {
  const observations: Record<string, Observation> = {
    failed_geometries: overrideObservations.failed_geometries ?? observe('failed_geometries', matched),
    compute_rate: overrideObservations.compute_rate ?? observe('compute_rate', matched),
  };
  const only = new Set(['failed_geometries', 'compute_rate']);
  return verdictLib.buildAuditTable(DESCRIPTOR, 'sources', observations, [], null, only);
}

describe('peel 8b — the must-fail sabotage battery (T1 failed_geometries, T2 compute_rate), against the REAL compute check functions + the REAL row-derived cascade', () => {
  it('HEALTHY fixture: 0 failed, 100% compute rate — both checks PASS, verdict PASS, no warnings[]', () => {
    const matched = { failed_geometries: 0, parcels_processed: 10, centroids_computed: 10 };
    const built = buildRows(matched);
    expect(built.audit_table.verdict).toBe('PASS');
    expect(built.warnings).toEqual([]);
    expect(built.errors).toEqual([]);
    // "same predicate" — the retired formula agrees on the healthy case (it must: both read
    // the same two conditions when nothing errors).
    expect(oldHasWarnsVerdict(matched)).toBe('PASS');
  });

  it('T1 SABOTAGE — failed_geometries > 0 (default bound) reads WARN (never FAIL — R-H: a malformed geometry is a data-quality signal, not a reason to halt)', () => {
    const matched = { failed_geometries: 3, parcels_processed: 10, centroids_computed: 7 };
    const built = buildRows(matched);
    const row = built.rows.find((r: { metric: string }) => r.metric === 'failed_geometries');
    expect(row.status).toBe('WARN');
    expect(row.value).toBe(3);
    expect(built.audit_table.verdict).toBe('WARN');
    // LM-D16 — warnings[] renders the check id + the primitive value.
    expect(built.warnings).toContain('failed_geometries: 3');
    expect(oldHasWarnsVerdict(matched), 'same predicate on the sabotaged case too — both read failed>0').toBe('WARN');
  });

  it('T2 SABOTAGE — compute_rate < 98% (default bound) reads WARN, independent of failed_geometries being 0', () => {
    const matched = { failed_geometries: 0, parcels_processed: 100, centroids_computed: 90 };
    const built = buildRows(matched);
    const row = built.rows.find((r: { metric: string }) => r.metric === 'compute_rate');
    expect(row.status).toBe('WARN');
    expect(row.value).toBe('90%');
    expect(built.audit_table.verdict).toBe('WARN');
    expect(built.warnings).toContain('compute_rate: 90%');
    expect(oldHasWarnsVerdict(matched)).toBe('WARN');
  });

  it('BOTH SABOTAGED — verdict is still WARN (the lattice caps at WARN, never double-counts), both warnings[] entries present in check-declaration order', () => {
    const matched = { failed_geometries: 5, parcels_processed: 50, centroids_computed: 40 };
    const built = buildRows(matched);
    expect(built.audit_table.verdict).toBe('WARN');
    expect(built.warnings).toEqual(['failed_geometries: 5', 'compute_rate: 80%']);
  });

  it('DIVERGENCE FIXTURE — a check that ERRORS: the retired hasWarns formula silently reads PASS (missing signal defaults to 0/100%), the row-derived cascade correctly escalates to the check\'s DECLARED severity (WARN) — this is the concrete case Rule 10 exists to close (verdict.js\'s own header: "a check the library could not evaluate NEVER reads as PASS")', () => {
    // matched carries NO failed_geometries/parcels_processed/centroids_computed at all — the
    // shape a thrown query would leave ctx.matched in (only backlog_count survives a mid-phase
    // exception in runBackfillPhase's own try/catch-free single-statement path).
    const matched = {};
    // The OLD formula, run over this exact matched shape:
    expect(oldHasWarnsVerdict(matched as never), 'the retired formula silently reads PASS on a missing signal — defaulting failed=0, computeRate=100 vacuously').toBe('PASS');
    // The NEW cascade, told explicitly that failed_geometries ERRORED (never silently PASS):
    const erroredObservation: Observation = { error: new Error('post_sql query threw') };
    const built = buildRows(matched, { failed_geometries: erroredObservation });
    const row = built.rows.find((r: { metric: string }) => r.metric === 'failed_geometries');
    expect(row.status, 'an errored check reads at its DECLARED severity (WARN for T1), never PASS').toBe('WARN');
    expect(String(row.value)).toMatch(/^check errored: /);
    expect(built.audit_table.verdict, 'DIVERGENCE: the retired formula said PASS, the row-derived cascade correctly says WARN').toBe('WARN');
    expect(built.warnings[0]).toMatch(/^failed_geometries: check errored: /);
  });

  it('every non-INFO check this step declares is covered by the battery above (T1, T2 — no third WARN/FAIL check exists to miss)', () => {
    const nonInfo = DESCRIPTOR.checks.filter((c: { severity: string }) => c.severity !== 'INFO').map((c: { id: string }) => c.id);
    expect(nonInfo.sort()).toEqual(['compute_rate', 'failed_geometries']);
  });
});
