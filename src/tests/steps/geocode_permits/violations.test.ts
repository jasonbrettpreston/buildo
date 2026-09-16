// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Geocode Permits" (PRIMARY — the only spec with a behavioural section for this file)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 8 (the `permits` chain, 8 of 33)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 4 (the `sources` chain, 4 of 28)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (advisory lock 5), §11 (the Counter Semantic Contract — which names THIS STEP TWICE)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ENRICHER), §5.1 (frozen shape), §5.5 (compute shape), §8 (the shape freeze)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN, do not fix), §6.1 (G4d both-directions locks), §7 (the nine commits)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict, Rule 12 crash posture, R-K.1 pending stages, R-M before-image)
//
// ============================================================================
// I5 — `geocode_permits`, the ENRICHER archetype's SECOND member and the commit that makes
// the archetype compressed-eligible. FULL nine-commit form (R-AH eligibility NOT met at
// plan time: ENRICHER had exactly one converted member).
//
// THIS FILE IS **RED FIRST** (Spec 123 §7, PH-7). At the folded commit 5 it carries
// `it.fails(...)` claims about artifacts later commits have not yet produced — the compute
// module (7c), the frozen shell (7d), the `converted[]` registration (9). Each is a REAL
// assertion that REALLY fails; vitest reports a failing `it.fails` as a pass and, crucially,
// as a FAILURE the moment the claim comes true, so each flips to a plain `it()` in the commit
// that earns it and a premature flip reddens the suite.
//
// THIS FILE IS DB-FREE BY CONVENTION (matches every other `violations.test.ts` in this
// programme). Every live number cited below was measured against the local dev DB on
// 2026-09-16 and recorded, with its query, in
// `docs/reports/2026-09-16-batch2-i5-geocode-permits-assessment.md`. This file's job is the
// STRUCTURAL lock, never a re-derivation of the measurement.
//
// THE FOUR FENCES (notes.json `fences[]`; G4d requires lock-count >= fence-count):
//   F1. d24c964c — the `CASE WHEN … THEN …::INTEGER END` cast guard, which exists because
//       PostgreSQL may reorder WHERE conditions and evaluate the cast before the regex.
//       LIVE, not theoretical: 6 rows carry a non-numeric `geo_id` today.
//   F2. 32da93c5 — the IS DISTINCT FROM guard covers latitude+longitude and NOT geocoded_at
//       (the LG-9 run-clock trap: `geocoded_at` is `source:"run_at"`, DISTINCT FROM its
//       stored value every run, so a widened guard rewrites 246,416 rows per run).
//   F3. 3e44218a — both UPDATEs share ONE transaction. `d24c964c` had REMOVED a
//       one-statement wrapper as "redundant" twelve days earlier; the restoration carries
//       the measurement.
//   F4. d24c964c — the retraction is narrowed by `geocoded_at IS NOT NULL`, "to avoid wiping
//       other geocoding sources". Load-bearing even with no second source in tree today.
//
// ⚠️ WHY THIS FILE CARRIES MORE WEIGHT THAN USUAL. The golden differential is VACUOUS on the
// write for this step: W1's guard admits 0 rows and W2's target population is 0 on the dev
// database (both measured), so all three capture pairs record `zombies_cleaned: 0` and a
// clean diff WHETHER OR NOT the conversion works. The proof that the destructive half still
// behaves is here — the class-O lifecycle test below — and nowhere else.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/geocode-permits.js';
const COMPUTE_REL = 'scripts/lib/compute/geocode-permits.js';
const DESCRIPTOR_REL = 'scripts/geocode-permits.descriptor.json';
const NOTES_REL = 'scripts/geocode-permits.notes.json';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const descriptor: any = JSON.parse(read(DESCRIPTOR_REL));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notes: any = JSON.parse(read(NOTES_REL));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- exercising the real CJS library
const write: any = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));

describe('geocode_permits — fence locks (G4d: one per notes.json fences[])', () => {
  it('notes.json declares exactly the four fences this file locks — a fifth fence added without a lock is the gap G4d exists to catch', () => {
    expect(notes.fences).toHaveLength(4);
    const consts = notes.fences.map((f: { const: string }) => f.const).join(' | ');
    expect(consts).toMatch(/CASE WHEN/);
    expect(consts).toMatch(/IS DISTINCT FROM/);
    expect(consts).toMatch(/ONE transaction/);
    expect(consts).toMatch(/geocoded_at IS NOT NULL/);
  });

  // ── F1 ────────────────────────────────────────────────────────────────────
  it('F1 (d24c964c) — buildGeocodeSql() carries the CASE cast guard VERBATIM, beside the sibling regex predicate [flipped at commit 7c]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the CJS compute module this commit is about
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    const sql = compute.buildGeocodeSql();
    // BOTH halves, and the order matters: the sibling regex predicate is what the CASE
    // exists to make un-reorderable. A generator that emitted only `p.geo_id::INTEGER`
    // guarded by the sibling predicate reproduces the crash the fence retired.
    expect(sql).toContain("AND p.geo_id ~ '^[0-9]+$'");
    expect(sql).toContain("ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END");
    // The bare cast, unguarded by a CASE, must NOT appear anywhere.
    expect(sql).not.toMatch(/=\s*p\.geo_id::INTEGER/);
  });

  // ── F2 ────────────────────────────────────────────────────────────────────
  it('F2 (32da93c5) — the DESCRIPTOR half: guard_columns is exactly [latitude, longitude] and never includes geocoded_at, which is source:"run_at"', () => {
    const w0 = descriptor.outputs.writes[0];
    expect(w0.write_discipline.guard).toBe('is_distinct_from');
    expect(w0.write_discipline.guard_columns).toEqual(['latitude', 'longitude']);
    expect(w0.write_discipline.guard_columns).not.toContain('geocoded_at');
    // The trap this fence exists for, asserted from the declaration itself: geocoded_at is
    // the run clock, so including it would make the guard fire on every row every run.
    const geocodedAt = w0.columns.find((c: { name: string }) => c.name === 'geocoded_at');
    expect(geocodedAt.source).toBe('run_at');
    // `all_declared` would silently re-include it — the one value this field must never take.
    expect(w0.write_discipline.guard_columns).not.toBe('all_declared');
  });

  it('F2 (32da93c5) — the SQL half: the statement guards latitude and longitude and mentions geocoded_at only as a SET target [flipped at commit 7c]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the CJS compute module this commit is about
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    const sql = compute.buildGeocodeSql();
    expect(sql).toContain('p.latitude IS DISTINCT FROM ap.latitude');
    expect(sql).toContain('p.longitude IS DISTINCT FROM ap.longitude');
    expect(sql).not.toMatch(/geocoded_at\s+IS DISTINCT FROM/);
    // geocoded_at appears exactly once, in the SET clause, bound to the run clock.
    expect((sql.match(/geocoded_at/g) || []).length).toBe(1);
    expect(sql).toContain('geocoded_at = $1::timestamptz');
  });

  // ── F3 ────────────────────────────────────────────────────────────────────
  it('F3 (3e44218a) — both phases share ONE transaction: txn_scope "step", both phases txn "shared", and NO post_commit anywhere', () => {
    expect(descriptor.execution.txn_scope).toBe('step');
    const phases = descriptor.execution.phases;
    expect(phases).toHaveLength(2);
    expect(phases.map((p: { name: string }) => p.name)).toEqual(['geocode', 'zombie_cleanup']);
    expect(phases.map((p: { order: number }) => p.order)).toEqual([1, 2]);
    for (const p of phases) expect(p.txn).toBe('shared');
    // The shape is ONE FIELD away from wrong: enrich_parcels, the only prior ENRICHER,
    // declares post_commit on its pass 5. A post_commit here would retire B-4 silently.
    expect(JSON.stringify(phases)).not.toContain('post_commit');
    // ⚠️ THIS ASSERTION CAUGHT ITS OWN AUTHOR. Its first cut read `.toBe('none')`, because on
    // STATE alone that is the truth: one shared transaction means a killed run leaves no
    // half-retracted state, so there is nothing for a next run to recover. It went RED at
    // commit 7c when `recovery.interrupted` moved to `force_full_on_next_run` — the right
    // outcome, and the reason the value is pinned here at all. The posture is the STRONGER
    // one and was verified REACHABLE before being adopted (runEnrichPhase folds
    // staleness.detectInterruptedRetraction into the full/incremental decision before any
    // pass runs) and ACCURATE (this step has no incremental scope: every run re-joins every
    // permit carrying a numeric geo_id, so "the next run does a full pass" is kept
    // unconditionally). `recovery.interrupted_why` carries both halves; §9.7 of the
    // assessment carries the checker gap underneath it.
    expect(descriptor.recovery.interrupted).toBe('force_full_on_next_run');
    // What the transaction fence itself guarantees, and what must NOT drift: the posture may
    // be the stronger one, but it must never become the excuse for splitting the two writes.
    expect(descriptor.execution.txn_scope).toBe('step');
    expect(descriptor.recovery.interrupted_why.text).toMatch(/no half-retracted state/i);
  });

  // ── F4 ────────────────────────────────────────────────────────────────────
  it('F4 (d24c964c) — the retraction is narrowed by geocoded_at IS NOT NULL, so it can only clear coordinates THIS step wrote', () => {
    const w1 = descriptor.outputs.writes[1];
    expect(w1.write_discipline.class).toBe('set_based_null_retract');
    expect(w1.write_discipline.scope).toContain('geocoded_at IS NOT NULL');
    expect(w1.write_discipline.scope).toContain("(geo_id IS NULL OR geo_id = '')");
    // R-M: a destructive retraction without a before image is refused by ctx.retract itself.
    expect(descriptor.recovery.before_image).toBe('generated');
  });
});

describe('geocode_permits — the class-O lifecycle the golden differential CANNOT prove', () => {
  // W2's target population is 0 on the dev DB (measured 2026-09-16), so `zombies_cleaned`
  // reads 0 in every capture pair and a retraction that silently never fires is
  // indistinguishable from one that fires correctly. This is the test that tells them apart.
  it('R-M — buildWritePlan → writeBeforeImage → executeSetBasedClear runs in STRICT order, and the before image is read BEFORE the retraction is issued', async () => {
    const plan = write.buildWritePlan(descriptor.outputs.writes[1], descriptor);
    expect(plan.mechanic).toBe('set_based_null_retract');
    expect(plan.table).toBe('permits');
    expect(plan.clear_sql).toBeTruthy();

    const issued: string[] = [];
    const fakeClient = {
      query: async (sql: string) => {
        issued.push((sql.trim().split(/\s+/)[0] ?? '').toUpperCase());
        return { rows: [], rowCount: 0 };
      },
    };

    // A fixture slug keeps the artifact out of this step's own golden directory; the
    // mechanism under test is the ORDER and the SQL, not the file path.
    const FIXTURE_SLUG = 'fixture_geocode_permits_lock';
    const runAt = new Date('2026-09-16T00:00:00.000Z');
    const bi = await write.writeBeforeImage(fakeClient, plan, [], FIXTURE_SLUG, runAt);
    const retracted = await write.executeSetBasedClear(fakeClient, plan, []);

    // THE assertion: the SELECT was issued first, the UPDATE second. A retraction that ran
    // before its own before-image would leave the prior coordinate recoverable from nowhere.
    expect(issued).toEqual(['SELECT', 'UPDATE']);
    expect(retracted).toBe(0);
    expect(bi.written).toBe(true);

    // Clean up the fixture artifact this test necessarily creates (persistBeforeImageRows
    // writes the file even for zero rows, by design — an empty file is itself evidence the
    // mechanism ran).
    const dir = path.join(REPO_ROOT, 'docs/reports/golden', FIXTURE_SLUG);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('DECLARED DIVERGENCE — the before-image SELECT is a SUPERSET of the retraction, because buildBeforeImageSelectSql reads plan.scope ONLY and the guard clause lives outside it', () => {
    const plan = write.buildWritePlan(descriptor.outputs.writes[1], descriptor);
    // The retraction's own statement carries the guard; the before-image SELECT does not.
    expect(plan.clear_sql).toMatch(/latitude IS DISTINCT FROM null/i);
    expect(plan.scope).not.toMatch(/latitude/i);
    // Locked so the divergence cannot change silently in either direction. It is harmless
    // today (the population is 0 either way, measured) and is declared in the descriptor's
    // guard_columns_why + the assessment rather than quietly tolerated. If a future commit
    // moves `latitude IS NOT NULL` back into `scope`, this test reds and the divergence note
    // must be retired in the same commit.
    expect(descriptor.outputs.writes[1].write_discipline.guard_columns).toEqual(['latitude']);
  });
});

describe('geocode_permits — Spec 47 §11, which names this step twice', () => {
  it('records_total and records_updated resolve against a root that ACTUALLY RESOLVES — matched.compute.*, never a bare compute.* (the ENRICHER null-counter trap)', () => {
    const c = descriptor.counters;
    // A bare `compute.*` resolves NULL for every ENRICHER — enrich_parcels' own three
    // counters have read null since its conversion for exactly that reason (filed HIGH
    // 2026-09-16). The runner resolves against {matched, written, records_meta}.
    for (const slot of ['records_total', 'records_new', 'records_updated']) {
      expect(c[slot].source).toMatch(/^(matched\.|written\.|records_meta\.)/);
      expect(c[slot].source).not.toMatch(/^compute\./);
    }
    expect(c.records_total.source).toBe('matched.compute.newly_geocoded');
    expect(c.records_updated.source).toBe('matched.compute.records_updated_aggregate');
  });

  it('records_total is W1\'s rowCount and NEVER the pre-run backlog, and W2\'s rowCount is excluded from records_updated and carried on its own audit row', () => {
    // §11: "Pre-run backlog sizes — e.g. `before.to_geocode` in `geocode-permits` … MUST NOT
    // be used as records_total." The only source naming a backlog would contain the word.
    expect(descriptor.counters.records_total.source).not.toMatch(/backlog|to_geocode/);
    // §11: "Cleanup operations — e.g. zombie coordinate resets in `geocode-permits`. Goes in
    // audit_table as zombies_cleaned." The retraction's rowCount must NOT reach the counters.
    expect(descriptor.counters.records_updated.source).not.toMatch(/zombie|retract/);
    const ids = descriptor.checks.map((c: { id: string }) => c.id);
    expect(ids).toContain('zombies_cleaned');
    expect(ids).toContain('backlog_remaining');
    // All eight pre-conversion audit rows survive BY ID — a rename is a consumer break
    // (src/lib/admin/funnel.ts:39 binds `geocode_coverage` as an auditMetric).
    expect(ids).toEqual([
      'total_permits', 'already_geocoded', 'newly_geocoded', 'total_geocoded',
      'geocode_coverage', 'no_geo_id', 'zombies_cleaned', 'backlog_remaining',
    ]);
  });

  it('Rule 10 — the coverage bound is declared ONCE, as limit_from_config, so the two literals whose five-day disagreement is GP-D1 cannot exist again', () => {
    const cov = descriptor.checks.find((c: { id: string }) => c.id === 'geocode_coverage');
    expect(cov.kind).toBe('bound');
    expect(cov.limit_from_config).toBe('geocode_permits_coverage_warn_pct');
    expect(cov.severity).toBe('WARN');
    // R-H: a metric expected to stand permanently below its bound is WARN WITH a declared
    // retighten condition, never INFO and never an un-narrated WARN.
    expect(cov.retighten_when).toBeTruthy();
    expect(cov.retighten_when).toMatch(/91\.2816/);
    const names = descriptor.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).toContain('geocode_permits_coverage_warn_pct');
    // Rule 3 / R-G: a verdict-affecting variable is on_invalid "fail", never default/clamp.
    const v = descriptor.config.logic_variables.find((x: { name: string }) => x.name === 'geocode_permits_coverage_warn_pct');
    expect(v.on_invalid).toBe('fail');
    expect(descriptor.config.hoisted_above_gate).toBe(true);
  });

  it('the ENRICHER profile\'s two required from-config fields name REAL logic variables, not the literal "none" (declaring "none" for the heartbeat re-creates the ER-D1 silence 0.10 closed)', () => {
    const e = descriptor.execution;
    expect(e.heartbeat_minutes_from_config).toBe('geocode_permits_heartbeat_minutes');
    expect(e.lock_timeout_ms_from_config).toBe('geocode_permits_lock_timeout_ms');
    expect(e.heartbeat_minutes_from_config).not.toBe('none');
    expect(e.lock_timeout_ms_from_config).not.toBe('none');
    const names = descriptor.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).toContain('geocode_permits_heartbeat_minutes');
    expect(names).toContain('geocode_permits_lock_timeout_ms');
    expect(descriptor.config.logic_variables).toHaveLength(3);
    // 0.10b's seam: the step-level post-phase observation block, declared by NAME so a
    // mis-declared hook throws BEFORE any work rather than TypeError-ing after COMMIT.
    expect(descriptor.execution.enrich_hooks.post_phase).toBe('computePostPhase');
  });
});

describe('geocode_permits — the artifacts later commits owe (RED FIRST)', () => {
  it('the compute module exists and its passes[] match the declared phases, in order [flipped at commit 7c]', () => {
    expect(exists(COMPUTE_REL)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the CJS compute module this commit is about
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    expect(typeof compute).toBe('function');
    expect(compute.passes.map((p: { name: string }) => p.name))
      .toEqual(descriptor.execution.phases.map((p: { name: string }) => p.name));
    for (const p of compute.passes) expect(p.txn).toBe('shared');
    // The hook the descriptor declares must be exported under exactly that name.
    expect(typeof compute[descriptor.execution.enrich_hooks.post_phase]).toBe('function');
    // Rule 2 — compute is just compute. COMMENT-STRIPPED FIRST, and that is not a
    // convenience: the first cut of this assertion scanned the raw file and reddened on the
    // module's own docblock, which says in prose "No pool creation, no logging, no
    // `process.env`, no wall clock". A banned-token scan that cannot tell code from prose
    // reports the sentence promising the rule as a violation of it — the same class as
    // LG-29's verdict-scanner false positive (`step-validate.mjs#checkNoSecondDerivation`
    // flagging a docblock phrase). The always-blocking enforcement lives in
    // scripts/ast-grep-rules/compute-shape.yml, which parses; this is the cheap sibling
    // lock and it must at least not lie.
    const src = read(COMPUTE_REL)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/require\(['"]\.\.\/pipeline['"]\)/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/console\./);
  });

  it('the shell is FROZEN onto pipeline.step and declares ADVISORY_LOCK_ID 5 as source text [flipped at commit 7d]', () => {
    const src = read(STEP_REL);
    expect(src).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(src).toContain('const ADVISORY_LOCK_ID = 5;');
    expect(descriptor.identity.lock).toBe(5);
    // The pre-conversion body must be gone: no hand-rolled transaction, no emitSummary.
    expect(src).not.toContain('withTransaction');
    expect(src).not.toContain('emitSummary');
    expect(src).not.toContain('UPDATE permits');
  });

  it('the slug is REGISTERED in converted.json and its pending entry is DELETED in the same commit (R-K mutual exclusion) [flipped at commit 9]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: any = JSON.parse(read('scripts/steps/_schema/converted.json'));
    expect(reg.converted).toContain(STEP_REL);
    const stillPending = (reg.pending || []).some((p: { file: string }) => p.file === STEP_REL);
    expect(stillPending).toBe(false);
  });
});
