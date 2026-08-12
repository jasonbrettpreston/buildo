// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §8 Distribution Health Bands
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4/E.5
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10
//
// C1 / D1 — per-failure halt classification. THE RED-FIRST PROOF.
//
// The outage this pins: assert-lifecycle-phase-distribution.js:836-838 throws on
// `failures.length > 0` — class-blind. `failures[]` has 7 push sites in exactly 3
// classes (halting: E.5 bands :385/:410/:439 + unclassified_count hard limit :549;
// NON-halting: cross_check_* :624/:645/:665). A cross-check-only FAIL therefore
// kills the chain at run-chain.js:622-623, skipping 10 steps INCLUDING backup_db.
//
// This file spawns the REAL script as a child process against TODAY'S code — no
// refactor, no import of a not-yet-existing export. That is deliberate: a pure-
// function test cannot be the red-first proof, because pre-fix it would fail on a
// missing import (the incidental-failure trap) rather than on the behaviour.
//
//   Case A — cross-check-only FAIL:  RED NOW (script throws), green after
//            (exit 0 AND audit_table.verdict === 'FAIL' — non-halting, still red).
//   Case B — unclassified_count over the hard limit: RED NOW **AND RED AFTER**.
//            A naive per-SCRIPT "just drop the throw" flips Case B green and
//            silently defangs the unclassified_count hard limit (:549).
//   Case C — E.5 band violation with the promote-to-FAIL posture ARMED: RED NOW
//            **AND RED AFTER**. Case B alone pins only 1 of the 4 halting push
//            sites; an implementation that wires :549 correctly but drops or
//            mis-copies the identical edit at :385/:410/:439 would pass A and B
//            unchanged. Case C covers :385 (`band_violation`).
//
// COVERAGE CEILING — state it plainly rather than overclaim: of the 4 halting
// sites, this file pins :549 (Case B) and :385 (Case C). The other two E.5 kinds,
// :410 `no_band_configured` and :439 `expected_data_missing`, are gated by their
// own separate posture flags and are NOT exercised here — they are covered by the
// deferred post-refactor `assert-lifecycle-phase-distribution.logic.test.ts`
// four-quadrant lock. Until that lands, those two sites ship verified by review
// only. (Code Reviewer finding, 2026-08-11: the earlier header claimed this file
// defended "the E.5 band contract" when it exercised none of it.)
//
// Case B also asserts the PIPELINE_SUMMARY line is present on a HALTING run. That
// is the load-bearing behaviour retired from
// src/tests/assert-lifecycle-phase-distribution.infra.test.ts:457-468 ("emitSummary
// precedes the throw so the audit row survives a FAIL"). The regex test asserted the
// old `if (failures.length > 0) { throw }` SHAPE and so had to be deleted rather than
// amended; the fence it defended is re-erected here BEHAVIOURALLY.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/assert-lifecycle-phase-distribution-halt.db.test.ts

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
// DeepSeek LOW fold: absolute, so the spawn cannot ENOENT when vitest is invoked
// from an IDE / a different --root than the repo root.
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/quality/assert-lifecycle-phase-distribution.js');

/** Fixture key prefix — every seeded row is deleted by prefix in beforeEach. */
const FX = 'C1HALT';

describe.skipIf(!dbAvailable())('assert-lifecycle-phase-distribution — per-failure halt classification (C1/D1)', () => {
  if (!pool) return;

  // PG_* env for the child — derived from DATABASE_URL (set by setup-testcontainer).
  //
  // These names are NOT a typo for the standard PGHOST/PGPORT set, and they are
  // SAFETY-CRITICAL here: pipeline.js createPool() (:99-112) branches on PG_HOST
  // FIRST and only falls back to SUPABASE_DATABASE_URL. Without PG_HOST set, a
  // SUPABASE_DATABASE_URL inherited from .env would point this child at a REAL
  // database — which this test then seeds, deletes from, and rewrites
  // logic_variables in. Setting PG_HOST is what pins the child to the container.
  // (DeepSeek raised the PGHOST naming as a defect; refuted against createPool.)
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn the child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);

  // ── HARD ISOLATION GUARD (Integration finding, 2026-08-11 — REFUTED premise) ──
  // `setup-testcontainer.ts:41-46` returns EARLY when DATABASE_URL is set, BEFORE it
  // ever looks at BUILDO_TEST_DB (:49). So BUILDO_TEST_DB=1 does NOT force an
  // ephemeral container — an ambient exported DATABASE_URL silently wins, and
  // `dbAvailable()` keys on DATABASE_URL alone. That means plain `npm run test`
  // (which Husky runs pre-commit) would execute this file against whatever database
  // that variable names.
  //
  // The blast radius is not the 3 fixture rows — those are prefix-scoped and
  // recoverable. It is the 9 UPSERTed logic_variables sentinels: `afterAll`'s
  // restore only runs on a CLEAN exit, so a timeout, crash, or Ctrl-C would strand
  // `lifecycle_unclassified_max = 0` and red the next real chain_permits run.
  //
  // Two conditions, both required:
  //   1. Explicit opt-in — BUILDO_TEST_DB=1 locally, or CI (which sets DATABASE_URL
  //      to an ephemeral service container without setting BUILDO_TEST_DB).
  //   2. Loopback host — the only databases either safe path uses. This is what
  //      makes it impossible to point the mutation at a cloud/Supabase instance.
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'assert-lifecycle-phase-distribution-halt.db.test.ts mutates global logic_variables. ' +
      'Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient ' +
      'DATABASE_URL is NOT sufficient, because setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(
      `Refusing to seed fixtures and rewrite logic_variables on non-loopback host "${dbUrl.hostname}". ` +
      'This test is only ever safe against an ephemeral local container or a CI service container.',
    );
  }
  // Gemini MED fold: fail loudly on a path-less DATABASE_URL rather than passing
  // PG_DATABASE='' to the child, which surfaces as a cryptic connection error and
  // masks the real cause.
  if (dbUrl.pathname.length <= 1) {
    throw new Error(`DATABASE_URL has no database path: ${dbUrl.protocol}//${dbUrl.host}${dbUrl.pathname}`);
  }
  // Spec 00 §8.2: NODE_ENV is literal-typed; bypass via Record cast (convention in this dir).
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
  };

  interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    verdict: string | null;
    summaryEmitted: boolean;
    rows: Array<{ metric: string; value: unknown; threshold: string; status: string }>;
    /** Every audit metric at FAIL. DeepSeek MED fold — see the exact-set assertions. */
    failMetrics: string[];
  }

  /**
   * Spawn the real script. Never throws on non-zero exit — the exit code IS the
   * assertion. Reads the verdict off the PIPELINE_SUMMARY stdout line, i.e. the
   * exact channel run-chain.js consumes.
   */
  function runScript(): RunResult {
    // DeepSeek MED fold: spawnSync blocks the event loop, so vitest's own per-test
    // timeout CANNOT fire on a hung child (advisory-lock wait, stalled connection).
    // The child needs its own kill timer, and a truncated stdout would silently
    // break the summary parse — so bound maxBuffer explicitly too.
    const r = spawnSync('node', [SCRIPT], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
    const stdout = r.stdout ?? '';
    // Gemini MED fold: take the LAST summary line, not the first. The SDK can emit a
    // second (SKIP) summary on the lock-not-acquired path; the final line is the one
    // run-chain.js acts on.
    const line = stdout.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    const summary = line ? JSON.parse(line.slice('PIPELINE_SUMMARY:'.length)) : null;
    const audit = summary?.records_meta?.audit_table ?? null;
    return {
      status: r.status,
      stdout,
      stderr: r.stderr ?? '',
      verdict: audit?.verdict ?? null,
      summaryEmitted: Boolean(line),
      rows: audit?.rows ?? [],
      failMetrics: (audit?.rows ?? [])
        .filter((x: { status: string }) => x.status === 'FAIL')
        .map((x: { metric: string }) => x.metric),
    };
  }

  async function setLogicVars(vars: Record<string, number>): Promise<void> {
    const keys = Object.keys(vars);
    await pool!.query(
      `INSERT INTO logic_variables (variable_key, variable_value, description)
       SELECT k, v, 'C1 halt-classification test seed'
         FROM unnest($1::text[], $2::numeric[]) AS t(k, v)
       ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value`,
      [keys, keys.map((k) => vars[k])],
    );
  }

  /**
   * Neutralise every failure class EXCEPT the one under test, so each case
   * isolates a single `failures.push` class. The three per-seq posture flags
   * are the E.5 promote-to-FAIL switches (:130-132) — 0 keeps band violations
   * WARN-only, which is the live posture and keeps the seeded permits table
   * from contributing band failures.
   */
  const QUIET = {
    lifecycle_seq_band_promote_to_fail_band_violation: 0,
    lifecycle_seq_band_promote_to_fail_no_band_configured: 0,
    lifecycle_seq_band_promote_to_fail_expected_data_missing: 0,
    lifecycle_cross_active_inspection_threshold: 999_999,
    lifecycle_cross_issued_threshold: 999_999,
    lifecycle_live_status_null_warn_count: 999_999,
    lifecycle_seq_unclassified_max: 999_999,
  };

  /**
   * Gemini HIGH fold — logic_variables is GLOBAL state shared by every file in the
   * testcontainer run. Snapshot the keys this suite overwrites and put them back,
   * so a later file reads migration-seeded values, not our 999_999 sentinels.
   */
  const TOUCHED_KEYS = [
    ...Object.keys(QUIET),
    'lifecycle_cross_stalled_threshold',
    'lifecycle_unclassified_max',
  ];
  let savedVars: Array<{ variable_key: string; variable_value: string }> = [];

  beforeAll(async () => {
    const r = await pool!.query<{ variable_key: string; variable_value: string }>(
      `SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1::text[])`,
      [TOUCHED_KEYS],
    );
    savedVars = r.rows;
  });

  // Gemini NIT fold: parameterised, so the pattern stays safe if FX ever becomes dynamic.
  async function clearFixtures(): Promise<void> {
    await pool!.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${FX}%`]);
    await pool!.query(`DELETE FROM coa_applications WHERE application_number LIKE $1`, [`${FX}%`]);
  }

  beforeEach(clearFixtures);
  // DeepSeek LOW fold: also clear on the way OUT, so an interrupted or failing last
  // test cannot leave C1HALT rows behind for another file's aggregate assertions.
  afterEach(clearFixtures);

  afterAll(async () => {
    if (!pool) return;
    // Drop our overwrites, then restore the pre-suite values. A key we invented
    // (absent pre-suite) is simply left deleted — on the next load it falls back to
    // FALLBACK_LOGIC_VARS, derived from scripts/seeds/logic_variables.json
    // (config-loader.js:63-66,85). Integration correction: that registry JSON, NOT
    // the migration seed, is the fallback authority.
    await pool.query(`DELETE FROM logic_variables WHERE variable_key = ANY($1::text[])`, [TOUCHED_KEYS]);
    if (savedVars.length > 0) {
      await pool.query(
        `INSERT INTO logic_variables (variable_key, variable_value, description)
         SELECT k, v, 'restored by C1 halt test teardown'
           FROM unnest($1::text[], $2::numeric[]) AS t(k, v)`,
        [savedVars.map((v) => v.variable_key), savedVars.map((v) => v.variable_value)],
      );
    }
    await clearFixtures();
    await pool.end();
  });

  it('Case A — cross-check-only FAIL must NOT halt the chain (RED until C1 lands)', async () => {
    // 3 permits: enriched_status=Stalled, lifecycle_stalled left at its column DEFAULT
    // false → cross_check_stalled = 3. lifecycle_phase is NON-NULL so these rows
    // contribute ZERO to unclassified_count — the isolation that makes this case
    // "cross-check only".
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, lifecycle_phase)
       SELECT $1 || g::text, '00', 'Under Review', 'Stalled', 'P8'
         FROM generate_series(1, 3) g`,
      [FX],
    );
    await setLogicVars({
      ...QUIET,
      lifecycle_cross_stalled_threshold: 2, // 3 >= 2 → failures.push at :624
      lifecycle_unclassified_max: 999_999, // hard limit NOT tripped
    });

    const r = runScript();

    // The audit must still go red — C1 changes the HALT, never the verdict (:794).
    expect(r.summaryEmitted, `no PIPELINE_SUMMARY on stdout.\nstderr:\n${r.stderr}`).toBe(true);
    // DeepSeek MED fold: assert the EXACT set of failing metrics, not just that the
    // intended one failed. QUIET can only suppress the failure classes known at
    // authoring time; if any other class trips, this case is no longer "cross-check
    // only" and neither its red-now nor its green-after means what it claims.
    expect(
      r.failMetrics.sort(),
      'Case A must be cross-check-ONLY. Any other FAIL metric breaks the isolation this case depends on.',
    ).toEqual(['cross_check_stalled']);
    expect(r.verdict, 'verdict must stay FAIL so check-chain-verdict.js:104 stays red').toBe('FAIL');

    // THE red-first assertion. Today the class-blind throw at :836-838 fires and the
    // chain dies at step 25/33, skipping backup_db. After C1, a cross_check_* failure
    // is non-halting: the step exits 0, the chain runs to completion, and the FAIL is
    // carried by the verdict alone.
    expect(
      r.status,
      `Expected exit 0 (non-halting cross-check FAIL). Got ${r.status}.\nstderr:\n${r.stderr}`,
    ).toBe(0);
  }, 60_000);

  it('Case B — unclassified_count over the hard limit MUST STILL HALT (red now AND after C1)', async () => {
    // 3 permits with NULL lifecycle_phase and a LIVE status (not in DEAD_STATUS_ARRAY)
    // → unclassified_count = 3 against a hard limit of 0. No enriched_status, so no
    // cross-check contaminates the case.
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, lifecycle_phase)
       SELECT $1 || g::text, '00', 'Under Review', NULL
         FROM generate_series(1, 3) g`,
      [FX],
    );
    await setLogicVars({
      ...QUIET,
      lifecycle_cross_stalled_threshold: 999_999, // cross-checks silent
      lifecycle_unclassified_max: 0, // 3 > 0 → failures.push at :549 (HALTING class)
    });

    const r = runScript();

    expect(
      r.summaryEmitted,
      'emitSummary (:803) must precede the throw (:836) — the audit row has to survive a halting FAIL. This is the fence retired from infra.test.ts:457-468.',
    ).toBe(true);
    // DeepSeek MED fold: exact set. Without this, a future latent halting class could
    // keep the exit code non-zero while unclassified_count had quietly gone
    // non-halting — the test would pass while the hard limit was already defanged.
    expect(
      r.failMetrics.sort(),
      'Case B must trip the unclassified_count hard limit and NOTHING else, or the halt it proves is not the halt it claims.',
    ).toEqual(['unclassified_count']);
    expect(r.verdict).toBe('FAIL');

    // Gemini CRITICAL fold: `.not.toBe(0)` alone passes on ANY non-zero exit — a
    // syntax error, a dead connection, an unrelated throw — which would let a broken
    // script masquerade as a working halt. Pin the halt to its CAUSE first: the thrown
    // message must name the unclassified_count hard limit, and must NOT be the
    // cross-check class. Only then is the exit code meaningful.
    // Observability sub-threshold fold: match the MESSAGE, not the count. The
    // testcontainer is shared by every db.test.ts in the run, and beforeEach only
    // clears FX-prefixed rows — a sibling file leaving a permit with NULL
    // lifecycle_phase + a live status would push the count past 3 and red this
    // assertion for a reason that has nothing to do with the halt being tested.
    expect(
      r.stderr,
      `Exit was non-zero but not for the unclassified_count hard limit — the halt came from somewhere else.\nstderr:\n${r.stderr}`,
    ).toMatch(/unclassified_count \d+ exceeds hard limit 0/);
    // Integration fold: match the FAIL-only text. Both the FAIL (:624) and the WARN
    // (:626) branches contain 'lifecycle_stalled=false', and pipeline.log.warn writes
    // to stderr — so the looser check would red spuriously if any other db test ever
    // seeded a Stalled permit. Only the FAIL branch ends in '(exceeds N threshold)'.
    expect(r.stderr, 'a cross_check_* failure must not be what halted this case').not.toMatch(/exceeds \d+ threshold/);

    // Invariant across the refactor. If this ever goes green, C1 was implemented
    // per-SCRIPT instead of per-FAILURE and the hard limit has been silently retired.
    expect(
      r.status,
      `unclassified_count over the hard limit MUST halt. Exit was ${r.status} — if this is 0, the per-failure split has defanged the halting class.`,
    ).not.toBe(0);
    // Gemini LOW fold: 60s, not 120s — tight enough to catch a runtime regression in a
    // script that currently completes in ~1.5s, loose enough for a cold cloud runner.
  }, 60_000);

  it('Case C — an ARMED E.5 band violation MUST STILL HALT (red now AND after C1)', async () => {
    // Code Reviewer fold: Case B pins only :549. This pins :385 — the E.5
    // `band_violation` halting site — by ARMING its promote-to-FAIL posture flag.
    // With the permits table holding no lifecycle_seq rows, every catalog seq sits
    // below its band minimum, so the violation is produced by the script's own
    // comparison rather than by a hand-tuned fixture.
    await setLogicVars({
      ...QUIET,
      lifecycle_seq_band_promote_to_fail_band_violation: 1, // ARM the E.5 halting class
      lifecycle_cross_stalled_threshold: 999_999,
      lifecycle_unclassified_max: 999_999, // Case B's halting class stays silent
    });

    const r = runScript();

    expect(r.summaryEmitted, 'the audit row must survive an E.5 halting FAIL too').toBe(true);
    // Cause-pinned exactly as Case B: prove WHICH class halted before trusting the code.
    expect(
      r.stderr,
      `Expected an E.5 band-violation halt. stderr:\n${r.stderr}`,
    ).toMatch(/outside expected band/);
    expect(r.stderr, 'unclassified_count must not be what halted Case C').not.toMatch(/exceeds hard limit/);
    expect(r.stderr, 'a cross_check_* failure must not be what halted Case C').not.toContain('lifecycle_stalled=false');
    expect(r.verdict).toBe('FAIL');

    // The invariant: an armed band violation is a HALTING class and must stay one.
    expect(
      r.status,
      `An armed E.5 band violation MUST halt. Exit was ${r.status} — if 0, the per-failure split dropped the :385 halting edit.`,
    ).not.toBe(0);
  }, 60_000);
});
