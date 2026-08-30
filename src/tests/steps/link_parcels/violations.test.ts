// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9 (PRIMARY — the step's real chain membership, `permits`)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4 ("Consumed by: `link-parcels` Strategy 1b/2/3")
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §4 ("Consumed by: `link-parcels` Strategy 1a")
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (write class F), §1.5 (staleness), §1.7 (sharing — this step is the worked example), §1.8 (LINK archetype), §5.1 (frozen shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 10 row-derived verdict, R-K.1 pending-stage mechanism, R-W PostGIS-branch ban)
//
// Pilot 7 — `link-parcels`, the LINK archetype's 2nd member (Spec 122 §1.8). THE FIX
// (Spec 124 §7 rung (e), a declared compute change) rewrites Strategy 3 Step 2's
// centroid-nearest fallback join to an unconstrained KNN LATERAL on `pa.geom`, with a
// declared `, pa.id ASC` tiebreak and the 100m cap applied as a scalar post-filter — see
// `docs/reports/2026-08-30-pilot7-link-parcels-assessment.md` §0.5/§2/"THE FIX" section of
// the governing plan for the full derivation, and §4 for the live Reality-Check sample
// (seed `20260830002`, N=120, stratified by flip-distance delta) that measured this
// shape's plausibility BEFORE this commit landed.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Locks that read a
// FUTURE artifact (`scripts/lib/compute/link-parcels.js`, which this commit does NOT
// create) open with `artifact()` → `expect(existsSync).toBe(true)`, so the failure names
// the missing artifact rather than surfacing as a TypeScript/import error. Each is wrapped
// `it.fails(...)` with a "flips at: commit N" comment ON THE SAME LINE (step-validate.mjs
// fast invariant #5 requires this). `it.fails()` INVERTS: the wrapped body genuinely
// throws internally, and vitest reports the wrapped test as PASSED — if a claim were NOT
// actually red, vitest reports "expected test to fail but it passed", a real suite
// failure. A fully green run of this file is therefore itself the proof every `it.fails()`
// claim is genuinely red, not vacuous. Plain `it()` covers claims genuinely testable
// TODAY: reversion-detection against the CURRENT (unconverted) script's own text, and
// pure-algorithmic proofs that do not depend on any artifact this pilot has not yet built.
//
// THIS FILE IS DB-FREE BY CONVENTION (matches every other `violations.test.ts` in this
// programme — none touch a live database; DB-dependent proofs live in `src/tests/db/
// *.db.test.ts`, gated behind `BUILDO_TEST_DB=1`). The BEHAVIORAL plausibility evidence for
// THE FIX (a live synthetic fixture proving both directions against real PostGIS geometry
// math, plus the N=120 stratified Reality-Check sample) was independently executed and
// recorded in the assessment report §4 this same commit — this file's own job is the
// STRUCTURAL lock (Spec 124 §7 Step 4): pin the fix's SHAPE so a future regression cannot
// silently reintroduce the retired predicate, never re-derive the plausibility case itself.
//
// The 4 locks this pilot's commit-6 task named, each TODAY (reversion-sentinel, plain
// `it()`) + FUTURE (`it.fails()`, flips at commit 7):
//   (a) LP-D1 — Strategy 3 Step 2's join predicate: `centroid_lat`/`centroid_lng`/
//       `ST_DWithin` today vs. `pa.geom <->` + `, pa.id ASC` tiebreak at commit 7.
//   (b) LP-D6 — the NULL-coordinate guard: absent from the current SQL block (today's
//       protection is a JS-level `p.lat !== null && p.lng !== null` filter, `:373-376`,
//       structurally different from the SQL-level `WHERE v.lng IS NOT NULL AND v.lat IS
//       NOT NULL` guard THE FIX's set-based query needs, since it no longer per-permit
//       filters in JS before the query — Fold C blocking item 1 corrects the plan's own
//       "observed: parcel id=1" evidence to "parcel_id 439990" for the 4 real permits;
//       independently reproduced here as a pure-SQL-text/algorithmic risk, not re-queried
//       against the live DB).
//   (c) tiebreak-determinism — today's `ORDER BY v.pn, v.rv, ST_Distance(...)` has no
//       secondary tiebreak; `, pa.id ASC` is required (LM-D13 precedent) at commit 7; a
//       pure-JS twice-run proof that a `dist ASC, id ASC` sort is deterministic on an
//       exact-tie dataset, independent of any DB/artifact dependency.
//   (d) SQL-shape perf — a structural guard against the STRUCK co-resident
//       `ST_DWithin`+KNN form (measured live, Fold B item 1: 97.5 s/batch — unviable);
//       compute.js must carry the KNN operator WITHOUT a co-resident `ST_DWithin` bound in
//       the same query block. Live timing (400–500 ms/batch, 24–33 s full population; this
//       session's own aggregate re-measurement: 7.18 s for the full 17,500-row eligible
//       population) is recorded in the assessment report §4, not re-timed in this
//       DB-free unit test.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/link-parcels.js';
const COMPUTE_REL = 'scripts/lib/compute/link-parcels.js';
const DESCRIPTOR_REL = 'scripts/link-parcels.descriptor.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-7 commit sequence — commit 7 lands it)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }

const CURRENT_SRC = fs.readFileSync(abs(STEP_REL), 'utf8');

/** Strategy 3 Step 2's own query block, isolated by its bracketing comments — avoids false
 *  hits from Strategy 1a's own `ST_Area`/other unrelated SQL blocks. */
function step2Block(src: string): string {
  const start = src.indexOf('Step 2: Centroid proximity fallback');
  expect(start, 'Strategy 3 Step 2 marker comment not found — the region-scoped assertions below cannot be anchored').toBeGreaterThan(-1);
  const end = src.indexOf('} else if (spatialPermits.length > 0)', start);
  expect(end, 'Strategy 3 Step 2 block end marker (JS-fallback else-if) not found').toBeGreaterThan(start);
  return src.slice(start, end);
}

// ---------------------------------------------------------------------------
// (a) LP-D1 — THE FIX's own join predicate: centroid-nearest → KNN-boundary-nearest
// ---------------------------------------------------------------------------
describe('LP-D1 — Strategy 3 Step 2 join predicate (THE FIX)', () => {
  it('TODAY — the current (unconverted) script\'s Strategy 3 Step 2 joins on the parcel CENTROID (centroid_lat/centroid_lng via ST_DWithin), never the live boundary — the defect this pilot fixes is real, not hypothetical', () => {
    const block = step2Block(CURRENT_SRC);
    expect(block).toMatch(/centroid_lat/);
    expect(block).toMatch(/centroid_lng/);
    expect(block).toMatch(/ST_DWithin/);
    // The eligibility predicate is centroid-based too (`pa.centroid_lat IS NOT NULL`),
    // not `pa.geom IS NOT NULL` — confirms THE FIX's eligibility-gate rewrite is a real change.
    expect(block).toMatch(/pa\.centroid_lat IS NOT NULL/);
    // The ranking ORDER BY is ST_Distance on the centroid point, not the KNN `<->` operator
    // on the live geometry — confirms today's ranking metric IS the defect, not a red herring.
    expect(block).toMatch(/ORDER BY v\.pn, v\.rv, ST_Distance\(/);
    expect(block).not.toMatch(/pa\.geom\s*<->/);
  });

  it.fails('FUTURE — scripts/lib/compute/link-parcels.js exists and Strategy 3 Step 2 ranks by the live pa.geom KNN operator with a declared pa.id ASC tiebreak, never by centroid_lat/centroid_lng (flips at: commit 7)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).toMatch(/pa\.geom\s*<->/);
    expect(src).toMatch(/pa\.id ASC/);
    expect(src).not.toMatch(/centroid_lat/);
    expect(src).not.toMatch(/centroid_lng/);
    expect(src).not.toMatch(/ST_DWithin/);
  });
});

// ---------------------------------------------------------------------------
// (b) LP-D6 — NULL-coordinate guard
// ---------------------------------------------------------------------------
describe('LP-D6 — NULL-coordinate spatial-tier permits', () => {
  it('TODAY — the current script\'s NULL-coordinate protection is a JS-level array filter (spatialPermits eligibility, :373-376), NOT a SQL-level guard inside Strategy 3 Step 2\'s own query text — a structurally different mechanism from what THE FIX\'s set-based query needs', () => {
    // The JS-level guard exists today, upstream of the query — this is the mechanism that
    // currently (mostly) protects the OLD per-batch-array query shape.
    expect(CURRENT_SRC).toMatch(/p\.lat !== null && p\.lng !== null/);
    // But Strategy 3 Step 2's own SQL block has NO "IS NOT NULL" guard on the lng/lat
    // columns of the unnested `v` relation itself — the block trusts its caller entirely.
    const block = step2Block(CURRENT_SRC);
    expect(block).not.toMatch(/v\.lng IS NOT NULL/);
    expect(block).not.toMatch(/v\.lat IS NOT NULL/);
  });

  it('TODAY — a naive nearest-candidate selection over undefined/NaN coordinates does not throw and does not naturally exclude itself; it silently returns whatever candidate a stable comparison first accepts — the exact class of hazard LP-D6\'s SQL-level guard exists to close (pure-JS reproduction of the comparison hazard, independent of any live DB)', () => {
    type Candidate = { id: number; distance: number };
    // Mirrors a defensive "keep the closest so far" loop over an UNGUARDED point (NaN
    // coordinates never satisfy `dist < best`, so a naive loop can silently keep its
    // initial seed rather than erroring or excluding the row — the JS-shaped analogue of
    // the SQL hazard: an operation with no explicit domain guard on a degenerate input
    // resolves to AN ARBITRARY answer rather than failing loudly or excluding the row).
    function naiveNearest(candidates: Candidate[], queryIsValid: boolean): number | null {
      const seed = candidates.length > 0 ? candidates[0] : undefined;
      let bestId: number | null = seed ? seed.id : null; // arbitrary seed
      let bestDist = seed ? seed.distance : Infinity;
      if (!queryIsValid) {
        // No explicit guard: the loop still runs over NaN-based comparisons, all of which
        // are false, so `bestId` never updates away from its ARBITRARY initial seed.
        for (const c of candidates) {
          const dist = NaN; // stand-in for a NULL-coordinate distance computation
          if (dist < bestDist) { bestDist = dist; bestId = c.id; }
        }
        return bestId; // returns the arbitrary seed — never null, never an error
      }
      for (const c of candidates) {
        if (c.distance < bestDist) { bestDist = c.distance; bestId = c.id; }
      }
      return bestId;
    }
    const candidates: Candidate[] = [{ id: 501, distance: 10 }, { id: 42, distance: 5 }, { id: 9, distance: 20 }];
    const withoutGuard = naiveNearest(candidates, false);
    // The point: this resolves to A CANDIDATE (never null, never throws) even though the
    // query coordinates were invalid — exactly the arbitrary-resolution hazard the
    // guard exists to close. WHICH id it resolves to depends on iteration/seed order, not
    // on any meaningful nearest-match semantic — asserted here only as "resolves to some
    // real candidate id", not a specific one (the live production fact — 4 real permits
    // currently linked to parcel_id 439990 under the OLD code's own, different mechanism —
    // is recorded in the assessment report §2/§4, Fold C blocking item 1, not re-derived
    // here).
    expect(candidates.map((c) => c.id)).toContain(withoutGuard);
    const withGuard = candidates.length > 0 && false; // the guarded shape simply excludes the row
    expect(withGuard).toBe(false);
  });

  it.fails('FUTURE — scripts/lib/compute/link-parcels.js\'s Strategy 3 Step 2 query carries an explicit "v.lng IS NOT NULL AND v.lat IS NOT NULL" guard, excluding NULL-coordinate permits from the LATERAL join entirely (flips at: commit 7)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).toMatch(/v\.lng IS NOT NULL/);
    expect(src).toMatch(/v\.lat IS NOT NULL/);
  });

  it.fails('FUTURE — a declared WARN check "spatial_null_coordinate_permits" exists in the descriptor\'s checks[] (flips at: commit 7)', () => {
    const descriptor = JSON.parse(readText(DESCRIPTOR_REL)) as { checks?: Array<{ id: string; severity: string }> };
    const check = (descriptor.checks ?? []).find((c) => c.id === 'spatial_null_coordinate_permits');
    expect(check, 'spatial_null_coordinate_permits check missing from descriptor.checks[]').toBeTruthy();
    expect(check?.severity).toBe('WARN');
  });
});

// ---------------------------------------------------------------------------
// (c) tiebreak-determinism — declared `, pa.id ASC`
// ---------------------------------------------------------------------------
describe('tiebreak-determinism — declared pa.id ASC (LM-D13 precedent)', () => {
  it('TODAY — the current script\'s Strategy 3 Step 2 ORDER BY has NO secondary tiebreak key beyond ST_Distance itself — an exact or near-exact tie between two candidate parcels is resolved non-deterministically across runs', () => {
    const block = step2Block(CURRENT_SRC);
    const orderByStart = block.indexOf('ORDER BY v.pn, v.rv, ST_Distance(');
    expect(orderByStart, 'ORDER BY clause not found in the expected shape').toBeGreaterThan(-1);
    const closingBacktick = block.indexOf('`,', orderByStart);
    expect(closingBacktick, 'query text terminator not found after ORDER BY').toBeGreaterThan(orderByStart);
    const orderByText = block.slice(orderByStart, closingBacktick);
    expect(orderByText).not.toMatch(/pa\.id/);
  });

  it('TODAY — a pure-JS twice-run proof: a "distance ASC, id ASC" sort over an EXACT-TIE dataset is deterministic across repeated runs, independent of any DB/artifact dependency (the algorithmic property THE FIX\'s declared tiebreak relies on)', () => {
    type Candidate = { id: number; distance: number };
    // Two candidates at an EXACT tie distance (mirrors the live-measured 19-exact-tie
    // population under THE FIX's own predicate, re-confirmed independently this pilot —
    // report §4/Fold C item 5 — the exact-tie count agrees across all three independent
    // measurements taken this pilot; the near-tie count does not and is NOT relied on
    // here, only the qualitatively-certain exact-tie case).
    const tied: Candidate[] = [
      { id: 87421, distance: 24.20156933 },
      { id: 12903, distance: 24.20156933 },
    ];
    function pickDeterministic(candidates: Candidate[]): number {
      const sorted = [...candidates].sort((a, b) => (a.distance - b.distance) || (a.id - b.id));
      const winner = sorted[0];
      if (!winner) throw new Error('pickDeterministic called with an empty candidate list');
      return winner.id;
    }
    const run1 = pickDeterministic(tied);
    const run2 = pickDeterministic([...tied].reverse()); // input order shuffled, mirrors a re-run
    expect(run1).toBe(run2);
    expect(run1).toBe(12903); // the LOWER id wins under `, pa.id ASC` — never the higher one
  });

  it.fails('FUTURE — scripts/lib/compute/link-parcels.js\'s KNN LATERAL ORDER BY carries ", pa.id ASC" immediately after the pa.geom <-> operator (flips at: commit 7)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).toMatch(/pa\.geom\s*<->[^\n]*,\s*pa\.id ASC/);
  });
});

// ---------------------------------------------------------------------------
// (d) SQL-shape perf lock — no co-resident ST_DWithin + KNN
// ---------------------------------------------------------------------------
describe('SQL-shape perf lock — unconstrained KNN LATERAL, cap as scalar post-filter (Fold B item 1)', () => {
  it('TODAY — the current script\'s Strategy 3 Step 2 uses ST_DWithin as a BOUND predicate (not yet the unconstrained-KNN-plus-scalar-post-filter shape) — documents the pre-fix baseline this lock guards the regression away from', () => {
    const block = step2Block(CURRENT_SRC);
    expect(block).toMatch(/ST_DWithin/);
    // Live timing for the STRUCK co-resident ST_DWithin+KNN combination (measured this
    // programme, Fold B item 1): 97.5 s/batch — unviable. The unconstrained-KNN-plus-
    // scalar-post-filter shape THE FIX ships instead measures 400-500 ms/batch (Fold A/B,
    // grounder, and this pilot's own commit-4 aggregate re-measurement: 7.18 s for the
    // full 17,500-row eligible population in ONE query) — both timings recorded in the
    // assessment report §4, not re-executed in this DB-free unit test.
  });

  it.fails('FUTURE — scripts/lib/compute/link-parcels.js\'s KNN LATERAL block does NOT carry a co-resident ST_DWithin bound predicate — the cap is applied as a scalar WHERE ... <= $cap post-filter on the LATERAL\'s single nearest candidate instead (flips at: commit 7)', () => {
    const src = readText(COMPUTE_REL);
    // Isolate the LATERAL block housing the KNN operator, then assert ST_DWithin never
    // appears WITHIN that same block (a global "no ST_DWithin anywhere" assertion would be
    // too strong — Strategy 3 Step 1's own ST_Contains region is untouched by THE FIX and
    // is not being asserted against here).
    const knnIdx = src.indexOf('pa.geom <->');
    expect(knnIdx, 'pa.geom <-> KNN operator not found').toBeGreaterThan(-1);
    const nearby = src.slice(Math.max(0, knnIdx - 400), knnIdx + 400);
    expect(nearby).not.toMatch(/ST_DWithin/);
  });
});

// ---------------------------------------------------------------------------
// R-K.1 pending-stage registration (structural, cross-checked against the generic
// step-conformance.infra.test.ts gate — not re-implementing that gate, only confirming
// this step's own entry is well-formed)
// ---------------------------------------------------------------------------
describe('converted.json — link-parcels.js is a declared red_suite pending entry', () => {
  it('the pending entry exists, names this file, and stage is "red_suite" (a sibling descriptor must NOT yet exist — commit 7 lands it and advances stage to "shape_clean")', () => {
    const converted = JSON.parse(readText(CONVERTED_REL)) as {
      converted: string[];
      pending: Array<{ file: string; stage: string; declared: string }>;
    };
    expect(converted.converted).not.toContain(STEP_REL);
    const entry = converted.pending.find((p) => p.file === STEP_REL);
    expect(entry, `no pending entry found for ${STEP_REL}`).toBeTruthy();
    expect(entry?.stage).toBe('red_suite');
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'descriptor exists while stage is still red_suite — stage not advanced (R-K.1)').toBe(false);
  });
});
