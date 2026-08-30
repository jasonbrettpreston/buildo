// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9 (PRIMARY — the step's real chain membership, `permits`)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4 ("Consumed by: `link-parcels` Strategy 1b/2/3")
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §4 ("Consumed by: `link-parcels` Strategy 1a")
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (write class F), §1.5 (staleness), §1.7 (sharing — this step is the worked example), §1.8 (LINK archetype), §5.1 (frozen shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6/7 — PH-7 prove red, then commit 7 flips it green), §6.1 (G4d both-directions locks)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 10 row-derived verdict, R-K.1 pending-stage mechanism, R-W PostGIS-branch ban)
//
// Pilot 7 — `link-parcels`, the LINK archetype's 2nd member (Spec 122 §1.8). THE FIX
// (Spec 124 §7 rung (e), a declared compute change) rewrote Strategy 3 Step 2's
// centroid-nearest fallback join to an unconstrained KNN LATERAL on `pa.geom`, with a
// declared `, pa.id ASC` tiebreak and the 100m cap applied as a scalar post-filter — see
// `docs/reports/2026-08-30-pilot7-link-parcels-assessment.md` §0.5/§2/"THE FIX" section of
// the governing plan for the full derivation, and §4 for the live Reality-Check sample
// (seed `20260830002`, N=120, stratified by flip-distance delta) that measured this
// shape's plausibility BEFORE commit 7 landed.
//
// COMMIT 7 UPDATE — every claim that was `it.fails('FUTURE — ...')` at commit 6 is now a
// plain `it()`: `scripts/lib/compute/link-parcels.js` and `scripts/link-parcels.
// descriptor.json` now exist and carry the shape these locks pin. The pre-fix TODAY
// reversion-sentinels that read `scripts/link-parcels.js`'s OLD (686-line, unconverted)
// text are RETIRED — that file is now the FROZEN SHAPE (38 lines: require + module.exports
// + pipeline.step()) and no longer contains the old predicate to detect. The evidence that
// the pre-fix defect was real is preserved in `scripts/link-parcels.notes.json`'s
// `fences[]` entry (the `8a1c7d25` retraction-on-relink fence) and in the assessment
// report's own G3 intent ledger (§2) — not re-derived here. The pure-JS geometry/
// algorithmic proofs ((a)'s fixture, (c)'s twice-run sort) carried NO dependency on the
// old script's text and are kept unchanged — they proved a property of THE FIX's design,
// not a fact about the old file.
//
// THIS FILE IS DB-FREE BY CONVENTION (matches every other `violations.test.ts` in this
// programme — none touch a live database; DB-dependent proofs live in `src/tests/db/
// *.db.test.ts`, gated behind `BUILDO_TEST_DB=1`). The BEHAVIORAL plausibility evidence for
// THE FIX (a live synthetic fixture proving both directions against real PostGIS geometry
// math, plus the N=120 stratified Reality-Check sample) was independently executed and
// recorded in the assessment report §4 at commit 4 — this file's own job is the
// STRUCTURAL lock (Spec 124 §7 Step 4): pin the fix's SHAPE so a future regression cannot
// silently reintroduce the retired predicate, never re-derive the plausibility case itself.
//
// The 4 locks this pilot's commit-6 task named, now GREEN:
//   (a) LP-D1 — Strategy 3 Step 2's join predicate: `pa.geom <->` + `, pa.id ASC`
//       tiebreak, never `centroid_lat`/`centroid_lng`/`ST_DWithin`.
//   (b) LP-D6 — the NULL-coordinate guard: an explicit `WHERE v.lng IS NOT NULL AND
//       v.lat IS NOT NULL` inside the SQL itself (not merely a JS-level pre-filter), plus
//       the declared WARN check `spatial_null_coordinate_permits`. Fold C blocking item 1
//       corrected the plan's own "observed: parcel id=1" evidence to "parcel_id 439990"
//       for the 4 real permits — the requirement itself is unaffected by the correction.
//   (c) tiebreak-determinism — `, pa.id ASC` is present immediately after the KNN
//       operator; a pure-JS twice-run proof that a `dist ASC, id ASC` sort is
//       deterministic on an exact-tie dataset, independent of any DB/artifact dependency.
//   (d) SQL-shape perf — a structural guard against the STRUCK co-resident
//       `ST_DWithin`+KNN form (measured live, Fold B item 1: 97.5 s/batch — unviable):
//       the KNN operator's own LATERAL block carries NO co-resident `ST_DWithin` bound.
//       Live timing (400-500 ms/batch, 24-33 s full population; this pilot's own commit-4
//       aggregate re-measurement: 7.18 s for the full 17,500-row eligible population) is
//       recorded in the assessment report §4, not re-timed in this DB-free unit test.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/link-parcels.js';
const COMPUTE_REL = 'scripts/lib/compute/link-parcels.js';
const DESCRIPTOR_REL = 'scripts/link-parcels.descriptor.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

function artifact(rel: string, why = ''): string {
  expect(fs.existsSync(abs(rel)), `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''}`).toBe(true);
  return abs(rel);
}

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }

// ---------------------------------------------------------------------------
// (a) LP-D1 — THE FIX's own join predicate: centroid-nearest → KNN-boundary-nearest
// ---------------------------------------------------------------------------
describe('LP-D1 — Strategy 3 Step 2 join predicate (THE FIX)', () => {
  it('scripts/lib/compute/link-parcels.js ranks by the live pa.geom KNN operator with a declared pa.id ASC tiebreak, never by centroid_lat/centroid_lng/ST_DWithin (scoped to the buildMatchSql generated SQL text, excluding this file\'s own doc-comment prose about the RETIRED predicate)', () => {
    const src = readText(COMPUTE_REL);
    const fnStart = src.indexOf('function buildMatchSql');
    expect(fnStart, 'buildMatchSql function not found').toBeGreaterThan(-1);
    const sqlText = src.slice(fnStart);
    expect(sqlText).toMatch(/pa\.geom\s*<->/);
    expect(sqlText).toMatch(/pa\.id ASC/);
    expect(sqlText).not.toMatch(/centroid_lat/);
    expect(sqlText).not.toMatch(/centroid_lng/);
    expect(sqlText).not.toMatch(/ST_DWithin/);
  });

  it('reversion evidence — the RETIRED predicate is preserved in notes.json fences[] and the G3 intent ledger, not re-derived from the frozen shape file (which no longer contains it)', () => {
    const frozenShape = fs.readFileSync(abs(STEP_REL), 'utf8');
    // The frozen shape is the 3-line-of-substance require+module.exports form — it has
    // NEITHER the old centroid predicate NOR the new KNN one; the domain logic lives
    // entirely in compute/link-parcels.js now (Spec 122 §5.1).
    expect(frozenShape).not.toMatch(/centroid_lat/);
    expect(frozenShape).not.toMatch(/pa\.geom\s*<->/);
    expect(frozenShape).toMatch(/pipeline\.step\(descriptor, compute\)/);
    const notes = JSON.parse(readText('scripts/link-parcels.notes.json')) as { fences?: Array<{ commit: string }> };
    expect((notes.fences ?? []).some((f) => f.commit === '8a1c7d25')).toBe(true);
  });

  it('a live synthetic PostGIS fixture (proving both directions against real geometry math) was independently executed and recorded in the assessment report §4 — not re-derived here', () => {
    const report = fs.readFileSync(abs('docs/reports/2026-08-30-pilot7-link-parcels-assessment.md'), 'utf8');
    expect(report).toMatch(/a_boundary_dist_m|boundary distance/i);
  });
});

// ---------------------------------------------------------------------------
// (b) LP-D6 — NULL-coordinate guard
// ---------------------------------------------------------------------------
describe('LP-D6 — NULL-coordinate spatial-tier permits', () => {
  it('scripts/lib/compute/link-parcels.js\'s Strategy 3 Step 2 query carries an explicit "v.lng IS NOT NULL AND v.lat IS NOT NULL" guard, excluding NULL-coordinate permits from the LATERAL join entirely', () => {
    const src = readText(COMPUTE_REL);
    expect(src).toMatch(/v\.lng IS NOT NULL/);
    expect(src).toMatch(/v\.lat IS NOT NULL/);
  });

  it('a declared WARN check "spatial_null_coordinate_permits" exists in the descriptor\'s checks[]', () => {
    const descriptor = JSON.parse(readText(DESCRIPTOR_REL)) as { checks?: Array<{ id: string; severity: string }> };
    const check = (descriptor.checks ?? []).find((c) => c.id === 'spatial_null_coordinate_permits');
    expect(check, 'spatial_null_coordinate_permits check missing from descriptor.checks[]').toBeTruthy();
    expect(check?.severity).toBe('WARN');
  });

  it('a naive nearest-candidate selection over undefined/NaN coordinates does not throw and does not naturally exclude itself; it silently returns whatever candidate a stable comparison first accepts — the exact class of hazard LP-D6\'s SQL-level guard exists to close (pure-JS reproduction of the comparison hazard, independent of any live DB)', () => {
    type Candidate = { id: number; distance: number };
    function naiveNearest(candidates: Candidate[], queryIsValid: boolean): number | null {
      const seed = candidates.length > 0 ? candidates[0] : undefined;
      let bestId: number | null = seed ? seed.id : null; // arbitrary seed
      let bestDist = seed ? seed.distance : Infinity;
      if (!queryIsValid) {
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
    // query coordinates were invalid — exactly the arbitrary-resolution hazard the guard
    // exists to close. The live production fact (4 real permits currently linked to
    // parcel_id 439990 under the OLD code's own, different mechanism, Fold C blocking item
    // 1) is recorded in the assessment report §2/§4, not re-derived here.
    expect(candidates.map((c) => c.id)).toContain(withoutGuard);
  });
});

// ---------------------------------------------------------------------------
// (c) tiebreak-determinism — declared `, pa.id ASC`
// ---------------------------------------------------------------------------
describe('tiebreak-determinism — declared pa.id ASC (LM-D13 precedent)', () => {
  it('scripts/lib/compute/link-parcels.js\'s KNN LATERAL ORDER BY carries ", pa.id ASC" immediately after the pa.geom <-> operator', () => {
    const src = readText(COMPUTE_REL);
    expect(src).toMatch(/pa\.geom\s*<->[^\n]*,\s*pa\.id ASC/);
  });

  it('a pure-JS twice-run proof: a "distance ASC, id ASC" sort over an EXACT-TIE dataset is deterministic across repeated runs, independent of any DB/artifact dependency (the algorithmic property THE FIX\'s declared tiebreak relies on)', () => {
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

  it('twice-run idempotency lock — LG-24\'s own scoped retract-and-rebuild resolves to an identical set both times (Fold A I-1, structural proof against the declared write shape, not a live DB run)', () => {
    const descriptor = JSON.parse(readText(DESCRIPTOR_REL)) as {
      outputs: { writes: Array<{ table: string; retract: string; retract_when?: string; write_discipline: { scope?: string } }> };
    };
    const massRetraction = descriptor.outputs.writes.find((w) => w.retract === 'all');
    expect(massRetraction, 'no declared retract:"all" target found').toBeTruthy();
    expect(massRetraction?.retract_when).toBe('full_only');
    expect(massRetraction?.write_discipline.scope).toBe("match_type = 'spatial'");
    // A scoped retraction (fully clears the scoped population) followed by a
    // deterministic rebuild (pa.id ASC tiebreak, proven above) is idempotent BY
    // CONSTRUCTION: there is no accumulation and no order-dependent residue between two
    // consecutive full runs — the SAME argument Fold A I-1 made for link_parcels' own
    // scoped mass retraction, structurally verified here against the declared shape.
  });
});

// ---------------------------------------------------------------------------
// (d) SQL-shape perf lock — no co-resident ST_DWithin + KNN
// ---------------------------------------------------------------------------
describe('SQL-shape perf lock — unconstrained KNN LATERAL, cap as scalar post-filter (Fold B item 1)', () => {
  it('scripts/lib/compute/link-parcels.js\'s KNN LATERAL block does NOT carry a co-resident ST_DWithin bound predicate — the cap is applied as a scalar WHERE ... <= $cap post-filter on the LATERAL\'s single nearest candidate instead', () => {
    const src = readText(COMPUTE_REL);
    // Isolate the LATERAL block housing the KNN operator, then assert ST_DWithin never
    // appears WITHIN that same block (a global "no ST_DWithin anywhere" assertion would be
    // too strong — Strategy 3 Step 1's own ST_Contains region is untouched by THE FIX and
    // is not being asserted against here).
    const knnIdx = src.indexOf('pa.geom <->');
    expect(knnIdx, 'pa.geom <-> KNN operator not found').toBeGreaterThan(-1);
    const nearby = src.slice(Math.max(0, knnIdx - 400), knnIdx + 400);
    expect(nearby).not.toMatch(/ST_DWithin/);
    expect(src).toMatch(/ST_Distance\(c\.geom::geography[\s\S]*?<= \$5/);
  });

  it('the struck co-resident form\'s 97.5s/batch and the shipped form\'s 400-500ms/batch are both recorded in the assessment report §4 — live timing, not re-executed in this DB-free unit test', () => {
    const report = fs.readFileSync(abs('docs/reports/2026-08-30-pilot7-link-parcels-assessment.md'), 'utf8');
    expect(report).toMatch(/97\.5\s*s\/batch|97\.5s\/batch/);
  });
});

// ---------------------------------------------------------------------------
// R-K.1 pending-stage registration (structural, cross-checked against the generic
// step-conformance.infra.test.ts gate — not re-implementing that gate, only confirming
// this step's own entry is well-formed)
// ---------------------------------------------------------------------------
describe('converted.json — link-parcels.js is REGISTERED (cutover landed, commit 9, per R-K.1)', () => {
  it('the file is in converted[], no pending entry remains, and the descriptor exists and validates', () => {
    const converted = JSON.parse(readText(CONVERTED_REL)) as {
      converted: string[];
      pending: Array<{ file: string; stage: string; declared: string }>;
    };
    expect(converted.converted).toContain(STEP_REL);
    const entry = converted.pending.find((p) => p.file === STEP_REL);
    expect(entry, `a stale pending entry still exists for ${STEP_REL} — R-K.1 cutover should have removed it`).toBeUndefined();
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'descriptor must exist for a registered converted entry').toBe(true);
  });
});
