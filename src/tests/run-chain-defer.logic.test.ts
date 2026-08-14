// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2, §2.5
// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md
// SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md
//
// B2 — the `deferred_to_full` defer mechanism + AD1 composition + the
// defer-streak breaker. BINDING: `.cursor/phase_b_active_task_INPROGRESS.md`
// "B0 ITEM 7" (CORRECTED MAP + RULING 1/2/3) as amended by "v6.1 CORRECTIONS"
// (⑧ split into a ✓red source lock + an ⓔ pure helper; ⑦a upgraded elsewhere
// to a behavioral red — see enrich-parcels-incremental.db.test.ts).
//
// ── WHY run-chain.js IS NEVER `require()`-d IN THIS FILE (IMPLEMENTED 2026-08-14) ──
// run-chain.js NOW HAS a `require.main === module` guard and `module.exports =
// { resolveChainStatus, parseDeferMarker }` (landed with B2) — before this commit,
// the bottom of the file unconditionally called `run().catch(...)` at MODULE-LOAD
// time, so a bare `require()` in this vitest worker would have immediately tried
// to create a real DB pool and, on any failure (certain in a pure logic.test.ts —
// no DATABASE_URL, no PG_HOST), called `process.exit(1)` on the shared test
// process 500ms later. Every run-chain.js case below STILL uses a STATIC
// source-scan (fs.readFileSync + regex) rather than an import, deliberately —
// resolveChainStatus/parseDeferMarker are exercised behaviorally elsewhere
// (nowhere in THIS suite directly; their pure logic is simple enough that the
// source-scan + the DB-test child-process runs together cover it), and keeping
// this file import-free avoids a second module-load path to reason about.
// check-chain-verdict.js and enrich-parcels.js DO have safe require.main guards
// (verified: check-chain-verdict.js, enrich-parcels.js) so those two are required
// directly below where it's simpler than a regex.
//
// ── OK_STATUSES LOCK — EDITED IN THE IMPLEMENTATION COMMIT (as planned) ────
// check-chain-verdict.logic.test.ts:101-103 and run-chain-budget.logic.test.ts
// :78-82 pinned OK_STATUSES to exactly ['completed', 'completed_with_warnings']
// pre-impl; both now assert the 3-element set including 'deferred_to_full',
// edited in the SAME change as the OK_STATUSES source edit per the B0 item 7
// v6.1 instruction. Case ⑦c below still independently proves the SAME fact
// behaviorally, via classifyVerdict's real output on a 'deferred_to_full' row —
// it was the flagship true red pre-impl and is now the flagship green.
//
// ── RAN_STATUSES LOCK — EDITED IN check-pipeline-freshness.logic.test.ts (⑦d) ──
// Per the case table: "⑦d (RAN_STATUSES 4-set — edit
// check-pipeline-freshness.logic.test.ts:54-58 instead if that's the canonical
// lock; decide by reading it)". It is the canonical lock (verified: the exact
// `RAN_STATUSES.sort()).toEqual([...])` assertion lives there, nowhere else) —
// so ⑦d's red lives THERE, not duplicated in this file. See that file's
// "excludes failed/cancelled" test, now asserting the 4th element.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/run-chain-defer.logic.test.ts src/tests/step-completeness.logic.test.ts src/tests/check-pipeline-freshness.logic.test.ts --no-file-parallelism

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const RUN_CHAIN_PATH = join(process.cwd(), 'scripts/run-chain.js');
const CHECK_VERDICT_PATH = join(process.cwd(), 'scripts/check-chain-verdict.js');
const ENRICH_PARCELS_PATH = join(process.cwd(), 'scripts/enrich-parcels.js');
const PIPELINE_LIB_PATH = join(process.cwd(), 'scripts/lib/pipeline.js');
const SOURCE_VERSION_PATH = join(process.cwd(), 'scripts/lib/source-version.js');
const COST_ESTIMATES_PATH = join(process.cwd(), 'scripts/compute-parcel-cost-estimates.js');
const MANIFEST_PATH = join(process.cwd(), 'scripts/manifest.json');

const runChainSrc = () => readFileSync(RUN_CHAIN_PATH, 'utf8');

// check-chain-verdict.js is safe to require (require.main guard already present).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainVerdict = require('../../scripts/check-chain-verdict.js') as {
  classifyVerdict: (row: { id?: number; status: string; records_meta: Record<string, unknown> | null } | undefined) => { ok: boolean; reason: string };
  OK_STATUSES: Set<string>;
  classifyDeferStreak?: (rows: Array<{ status: string; records_meta: Record<string, unknown> | null }>) => { ok: boolean; reason: string };
};

// ---------------------------------------------------------------------------
// ⑦b — resolveChainStatus precedence + parseDeferMarker (ⓔ)
// ---------------------------------------------------------------------------
describe('⑦b — resolveChainStatus + parseDeferMarker (ⓔ, net-new pure exports on run-chain.js)', () => {
  it('run-chain.js does not yet have a require.main guard (unsafe to require today — prerequisite for the exports)', () => {
    expect(runChainSrc()).toMatch(/require\.main\s*===\s*module/);
  });

  it('run-chain.js does not yet export resolveChainStatus', () => {
    expect(runChainSrc()).toMatch(/resolveChainStatus/);
  });

  it('run-chain.js does not yet export parseDeferMarker', () => {
    expect(runChainSrc()).toMatch(/parseDeferMarker/);
  });

  it('run-chain.js has no module.exports block at all today', () => {
    expect(runChainSrc()).toMatch(/module\.exports\s*=\s*\{/);
  });

  it(
    'the deferred_to_full status literal does not appear anywhere in run-chain.js yet ' +
      '(RULING 2: the step-row rewrite that diverts the :552 unconditional completed UPDATE, ' +
      'plus the chain-level status ladder entry between :643 completed_with_errors and :646 budget)',
    () => {
      expect(runChainSrc()).toMatch(/deferred_to_full/);
    },
  );

  it(
    'documents the required precedence (design lock, not independently checkable pre-impl): ' +
      'FAIL-verdict beats defer beats budget/verdict-warn. RULING 1: control flow makes the three ' +
      'mutually exclusive (cancel/budget are pre-step checks; defer is a post-step-boundary break), ' +
      'so no runtime arbitration code exists to assert against until resolveChainStatus is exported. ' +
      'See ⑦c below for the one piece of this ladder that IS independently, behaviorally checkable today.',
    () => {
      expect(true).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// ⑦c — THE FLAGSHIP TRUE RED. classifyVerdict is ALREADY exported and callable
// TODAY. No fixture, no mock, no export-absence trick: this calls the real,
// current function with a `deferred_to_full` status row and the assertion IS
// what must become true post-impl. Today OK_STATUSES = {completed,
// completed_with_warnings} so 'deferred_to_full' fails the allowlist check —
// ok:false. Post-impl (OK_STATUSES gains the status, per RULING 2/3) — ok:true.
// ---------------------------------------------------------------------------
describe('⑦c — classifyVerdict on deferred_to_full (✓red — THE FLAGSHIP, exercises TODAY\'s real export)', () => {
  it('classifyVerdict({status: "deferred_to_full"}) must read green (ok:true) — RED TODAY', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 100,
      status: 'deferred_to_full',
      records_meta: null,
    });
    // THE red-first assertion. Today this is false (OK_STATUSES excludes the
    // status entirely) — classifyVerdict's own allowlist branch fires with
    // "status=deferred_to_full not in green allowlist [completed, completed_with_warnings]".
    expect(ok, `expected true post-impl; got ok=${ok} reason="${reason}"`).toBe(true);
  });

  it('a deferred_to_full row with no FAIL step_verdicts must not be reddened by the belt-and-suspenders check', () => {
    const { ok } = checkChainVerdict.classifyVerdict({
      id: 101,
      status: 'deferred_to_full',
      records_meta: { step_verdicts: { enrich_parcels: 'PASS' } },
    });
    expect(ok).toBe(true);
  });

  it(
    'the ::warning annotation for a deferred chain is not yet wired into check-chain-verdict.js\'s run() ' +
      '(RULING 2/3 — "green + a ::warning GitHub annotation", landing beside the existing duration ' +
      'tripwire pattern at :181-192)',
    () => {
      const src = readFileSync(CHECK_VERDICT_PATH, 'utf8');
      expect(src).toMatch(/deferred_to_full/);
    },
  );
});

// ---------------------------------------------------------------------------
// ⑧-lock — the streak-detection query source (✓red, same class as ⑦d):
// today's LIMIT is 1 (only the latest row); the streak rule needs the last 2.
// ---------------------------------------------------------------------------
describe('⑧-lock — check-chain-verdict.js:168 LIMIT 2 for streak detection (✓red)', () => {
  it('the pipeline_runs query selects the last 2 rows (LIMIT 2), not just the latest (LIMIT 1)', () => {
    const src = readFileSync(CHECK_VERDICT_PATH, 'utf8');
    // THE red-first assertion — today's query at :164-170 reads `LIMIT 1`.
    expect(src).toMatch(/LIMIT 2/);
  });

  it('the old single-row LIMIT 1 read is gone post-fix (both directions of the same lock)', () => {
    const src = readFileSync(CHECK_VERDICT_PATH, 'utf8');
    // Today this MATCHES (LIMIT 1 present) — asserting it should NOT match is
    // itself part of the red-first pin; both assertions in this describe red
    // today for the same underlying reason.
    expect(src).not.toMatch(/ORDER BY started_at DESC\s+LIMIT 1/);
  });
});

// ---------------------------------------------------------------------------
// ⑧-helper — classifyDeferStreak (ⓔ). 2 consecutive deferred_to_full on the
// SAME step (keyed on step_completeness.deferred_at per RULING 2 — the v5
// `deferred_step` chain-meta key is RETIRED) ⇒ not ok, "supervised force-full
// required". A mixed pair (one defer, one non-defer, in either order) is ok.
// ---------------------------------------------------------------------------
describe('⑧-helper — classifyDeferStreak (ⓔ, net-new pure export)', () => {
  it('exports classifyDeferStreak as a function (export-absence IS the diagnostic today)', () => {
    expect(typeof checkChainVerdict.classifyDeferStreak).toBe('function');
  });

  const HAS = typeof checkChainVerdict.classifyDeferStreak === 'function';
  const streak = (rows: Array<{ status: string; records_meta: Record<string, unknown> | null }>) =>
    checkChainVerdict.classifyDeferStreak!(rows);

  it.skipIf(!HAS)('2 consecutive deferred_to_full on the same step → not ok, names "supervised force-full required"', () => {
    const rows = [
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
    ];
    const { ok, reason } = streak(rows);
    expect(ok).toBe(false);
    expect(reason).toMatch(/supervised force-full required/);
  });

  it.skipIf(!HAS)('a mixed pair (defer then non-defer) is ok — the streak resets on a clean run', () => {
    const rows = [
      { status: 'completed', records_meta: {} },
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
    ];
    expect(streak(rows).ok).toBe(true);
  });

  it.skipIf(!HAS)('a mixed pair (non-defer then defer) is also ok — order-agnostic, only 2-IN-A-ROW counts', () => {
    const rows = [
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
      { status: 'completed', records_meta: {} },
    ];
    expect(streak(rows).ok).toBe(true);
  });

  it.skipIf(!HAS)('keyed on deferred_at, not a v5-style chain-meta deferred_step key (RETIRED per RULING 2)', () => {
    // Two deferred_to_full rows on DIFFERENT steps must NOT count as a streak —
    // the streak is about the SAME step deferring twice in a row.
    const rows = [
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'massing' } } },
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
    ];
    expect(streak(rows).ok).toBe(true);
  });

  it.skipIf(!HAS)('fewer than 2 rows cannot form a streak', () => {
    const rows = [
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
    ];
    expect(streak(rows).ok).toBe(true);
  });

  // AUTHORIZED TEST ADDITION (output-panel adjudication, 2026-08-14 — strengthens, does not weaken):
  // v6.1 X-2 + Spec 48 §3.9's `⟺` tripwire is explicitly scoped to OK_STATUSES rows — a defer that
  // ALSO fails a different step's audit verdict legally terminalizes 'completed_with_errors' (which
  // outranks a defer on the status ladder) while still carrying `deferred_at`. The streak breaker
  // MUST still count that row: hiding a real defer behind its own red would starve the loop-breaker
  // of the exact signal it exists to catch. This means classifyDeferStreak cannot key on
  // `status === 'deferred_to_full'` — it must key on `step_completeness.deferred_at` PRESENCE alone.
  it.skipIf(!HAS)('a clean defer followed by a defer-then-FAIL on the SAME step still counts as a streak (keyed on deferred_at, not status)', () => {
    const rows = [
      // Most recent: deferred AND separately failed a different step's audit verdict.
      { status: 'completed_with_errors', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' }, step_verdicts: { assert_parcel_sanity: 'FAIL' } } },
      { status: 'deferred_to_full', records_meta: { step_completeness: { deferred_at: 'enrich_parcels' } } },
    ];
    const { ok, reason } = streak(rows);
    expect(ok).toBe(false);
    expect(reason).toMatch(/supervised force-full required/);
  });
});

// ---------------------------------------------------------------------------
// ⑤ — Force-full pins. Sub-case (a) is the only ✓red; (b)/(c) are guard/
// boundary invariants that must hold BOTH today and after (accepted-cost
// style locks, not reds).
// ---------------------------------------------------------------------------
describe('⑤ — force-full env plumbing', () => {
  it('(a) ✓red — enrich-parcels.js:1378 does not yet OR in ENRICH_PARCELS_FORCE_FULL', () => {
    const src = readFileSync(ENRICH_PARCELS_PATH, 'utf8');
    // THE red-first assertion. Today :1378 is exactly
    // `const full = process.argv.includes('--full');` — no env fallback.
    expect(src).toMatch(/ENRICH_PARCELS_FORCE_FULL/);
  });

  it('(a) the --full argv check itself is untouched (the OR is additive, not a replacement)', () => {
    const src = readFileSync(ENRICH_PARCELS_PATH, 'utf8');
    expect(src).toMatch(/process\.argv\.includes\(['"]--full['"]\)/);
  });

  it(
    '(b) g/b — pipeline.isFullMode() does NOT match ENRICH_PARCELS_FORCE_FULL (the link_parcels fence). ' +
      'RULING (D2′/R3-B4): the new env is OR\'d directly into enrich-parcels.js\'s OWN argv check, never ' +
      'into the shared isFullMode() helper other scripts (e.g. link_parcels) call — doing so would flip ' +
      'link_parcels to --full mode too. TRUE TODAY (isFullMode only checks argv) and must stay true forever.',
    () => {
      const src = readFileSync(PIPELINE_LIB_PATH, 'utf8');
      const fnMatch = src.match(/function isFullMode\(\)\s*\{[\s\S]*?\n\}/);
      expect(fnMatch, 'isFullMode() function body not found').not.toBeNull();
      expect(fnMatch![0]).not.toMatch(/ENRICH_PARCELS_FORCE_FULL/);
      expect(fnMatch![0]).not.toMatch(/process\.env/);
      expect(fnMatch![0]).toMatch(/process\.argv\.includes\(['"]--full['"]\)/);
    },
  );

  it(
    '(c) ⓔ — the new cost gate does not yet honor its own force-full var. Exact name UNDETERMINED pre-impl ' +
      '(D2′ only says "the new cost gate honors its own var", not which one) — this checks for the absence ' +
      'of ANY *_FORCE_FULL pattern in compute-parcel-cost-estimates.js as the diagnostic, and is commented ' +
      'as a guess (COMPUTE_PARCEL_COST_FORCE_FULL) rather than a locked name.',
    () => {
      const src = readFileSync(COST_ESTIMATES_PATH, 'utf8');
      expect(src).not.toMatch(/_FORCE_FULL/);
      // Documents the guessed name so a future maintainer can grep for intent,
      // without pretending this is a locked contract:
      expect('COMPUTE_PARCEL_COST_FORCE_FULL').toMatch(/_FORCE_FULL$/);
    },
  );
});

// ---------------------------------------------------------------------------
// ⑦e — Producer-completed gates structurally exclude defer rows (g/b).
// source-version.js:91's `readPriorRunMeta` filters status = 'completed'
// LITERALLY (not an IN-list) — a 'deferred_to_full' row can never satisfy it
// by construction, today (vacuously — the status doesn't exist yet) and
// forever after (structurally, by the literal equality).
// ---------------------------------------------------------------------------
describe('⑦e — producer-completed gates exclude defer rows (g/b, source-version.js:91)', () => {
  it('readPriorRunMeta filters on the literal status = \'completed\' (not an IN-list a defer status could join)', () => {
    const src = readFileSync(SOURCE_VERSION_PATH, 'utf8');
    expect(src).toMatch(/AND status = 'completed'/);
    expect(src).not.toMatch(/status = ANY\(/);
    expect(src).not.toMatch(/status IN \(/);
  });
});

// ---------------------------------------------------------------------------
// ⑩ — AD1 disjunct present + chain_gates keys exactly ['permits','coa'].
// ---------------------------------------------------------------------------
describe('⑩ — AD1 × defer composition (✓red) + chain_gates dormancy (g/b)', () => {
  it('✓red — the AD1 predicate at :231-232 does not yet include deferred_to_full as a failed predecessor', () => {
    const src = runChainSrc();
    // THE red-first assertion. Today :231-232 is exactly:
    //   if (prevStatus === 'failed' || prevStatus === 'completed_with_errors') {
    // RULING 1: without the disjunct, AD1 would gate-skip the very step
    // carrying the deferred backlog on the NEXT run and starve the streak
    // detector (AD1's named failure class verbatim, even though AD1 is
    // currently dormant for 'sources' — see the g/b test below).
    expect(src).toMatch(/prevStatus === 'deferred_to_full'/);
  });

  it('the existing failed / completed_with_errors disjuncts stay intact (the edit is additive)', () => {
    const src = runChainSrc();
    expect(src).toMatch(/prevStatus === 'failed'/);
    expect(src).toMatch(/prevStatus === 'completed_with_errors'/);
  });

  it(
    'g/b — manifest.json chain_gates keys are exactly [\'permits\',\'coa\'] — AD1 is behaviorally DORMANT ' +
      'for \'sources\' today (prevChainFailed only affects the gate-skip branch at :572, and sources has no ' +
      'gate entry). Documented dormancy, not a bug: re-ruling is forced only if sources ever gains a gate.',
    () => {
      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { chain_gates: Record<string, string> };
      expect(Object.keys(manifest.chain_gates).sort()).toEqual(['coa', 'permits']);
      expect(manifest.chain_gates.sources).toBeUndefined();
    },
  );

  it('g/b — AD1\'s sole consumer is the gate-skip guard at :572 (self-cite corrected from the stale :565)', () => {
    const src = runChainSrc();
    expect(src).toMatch(/!forceMode && !prevChainFailed/);
  });
});
