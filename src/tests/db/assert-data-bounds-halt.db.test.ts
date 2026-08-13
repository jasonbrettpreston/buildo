// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
//
// C4 — per-site halt-classification gate for assert-data-bounds.js. THE
// RED-FIRST PROOF (`.cursor/active_task.md` §"C4 — WF2 v2 (2026-08-13)").
//
// The defect this pins: `:999` throws on `errors.length > 0` — every
// threshold-derived push in the file is class-blind fatal, including sites
// whose own audit row never leaves PASS/WARN territory that the operator
// intended as non-actionable (the `cost_outliers` fence, `f238b814`). The
// fix (NOT landed by this file — tests are red-first) adds a `fatalErrors[]`
// populated ONLY by the 3 exception-derived pushes (wsibErr / inspErr / the
// outer catch) and guards the throw on that array alone instead of the full
// `errors[]`.
//
// ⛔ CRITICAL HARNESS REQUIREMENT — PIPELINE_CHAIN=permits in the child env.
// Unlike the C1 harness (`assert-lifecycle-phase-distribution-halt.db.test.ts`),
// which spawns a script that only ever runs against the `permits` table, THIS
// script branches on `PIPELINE_CHAIN` (`:51` `CHAIN_ID = process.env.PIPELINE_CHAIN`)
// into FOUR independent check blocks (permits/coa/sources/deep_scrapes). Left
// unset, the script runs in "standalone" mode and executes ALL FOUR blocks —
// including the sources-scoped magnitude floors (`address_points >= 500000`,
// `parcels >= 460000`, `building_footprints >= 400000`, `neighbourhoods >= 158`).
// An empty testcontainer REDS every one of those floors, which (a) pollutes
// Case A's exact-`failMetrics`-set assertion with 4+ unrelated FAIL rows that
// have nothing to do with the Pre-Permit seed under test, and (b) makes Case
// C's "no `errors` entry" assertion unsatisfiable — the sources floors ALWAYS
// push regardless of what we seed. Cross-read finding #10 (2026-08-13
// re-verify round) restored this requirement after v1 dropped it; it is
// re-stated here as the load-bearing WHY, not just the what.
//
// This file spawns the REAL script as a child process against TODAY'S code —
// no refactor, no import of a not-yet-existing `fatalErrors` export. A
// pure-function test cannot be the red-first proof here either, for the same
// reason the C1 header gives: pre-fix it would fail on a missing import
// (the incidental-failure trap), not on the behaviour.
//
//   Case A — Pre-Permit threshold breach: RED NOW (script throws), GREEN
//            AFTER (exit 0 AND the `permits_pre_permit_count` audit row is
//            FAIL — the fix changes the HALT, never the verdict).
//   Case B — permit_trades renamed out from under the orphan-trades query
//            (THE LOAD-BEARING CASE): RED NOW **AND RED AFTER**. Exceptions
//            stay fatal for a MECHANICAL reason (not prudence): the block
//            structure only assigns `permitsAuditTable` at the END of the
//            `if (runPermitChecks)` block (`:241`). A mid-block exception
//            (orphan-trades query on a renamed-away table) jumps straight to
//            the outer `catch` (`:942`) and `permitsAuditTable` is NEVER
//            assigned — the chain-aware selector (`:958-969`) has nothing to
//            select for `CHAIN_ID === 'permits'`. ⚠ CORRECTED from the plan's
//            "no audit_table key" wording (found running this suite
//            red-first): `pipeline.js`'s `emitSummary()` (`:336-340`)
//            unconditionally back-fills a PLACEHOLDER `audit_table` —
//            `{ phase: 0, name: 'Auto', verdict: 'UNKNOWN', rows: [sys_* only] }`
//            — whenever the caller's own `records_meta` has no `audit_table`,
//            and this script's outer catch does not re-throw immediately; it
//            falls through to its own unconditional `emitSummary` call. So
//            the key is never literally absent — it is the pipeline-level
//            placeholder standing in for the never-built domain table. Zero
//            verdict representation BY CONSTRUCTION still holds (verdict
//            UNKNOWN, no domain row), it just isn't proven by key-absence.
//            A naive "drop the throw" (implementing the fix per-SCRIPT
//            instead of per-SITE) flips this green and silently defangs the
//            entire exception class — this is the single most important
//            assertion in the file.
//   Case C — `cost_outliers` regression lock (row-level, panel-ruled branch
//            (c) — demote the push to `warnings.push`, ALIGN the demoted
//            condition to the existing row threshold `>= 20`, never touch
//            row `:212` itself): RED NOW at the no-throw assertion, GREEN
//            AFTER. Distinguishes 1-19 (row PASS, zero entries in either
//            `errors`/`warnings`) from the =20 boundary (row WARN + a
//            `warnings` entry, still no throw) — pins that the demoted push
//            condition is `>= 20`, not `> 0` (a `> 0` warn-push would
//            silently recreate the [1,19] push/row disagreement one severity
//            down, plus spam the `f238b814` "not actionable" baseline).
//
// COVERAGE CEILING — stated plainly. `:680` (wsibErr) and `:811` (inspErr)
// are NOT behaviourally reachable in this file: both live inside a
// `catch` whose `if (err.message.includes('does not exist'))` branch routes
// every cheap provocation (dropped table, wrong type) to a `console.log`
// SKIP, not to the push. Only the outer catch (`:942`, exercised by Case B)
// is provable by DDL. The two unreachable sites are covered here ONLY by a
// static source assertion that their current shape targets `errors.push` —
// it proves nothing about post-fix `fatalErrors` routing, because that array
// does not exist in today's file; it exists solely so a future edit that
// silently drops one of these three sites from the fatal set is caught by a
// diff, not silently merged. State what it cannot catch: it cannot prove the
// POST-FIX dual-push shape, only that TODAY's single push exists verbatim.
//
// NOTE: the static source assertion pins today's `errors.push(<var>.message)`
// shape deliberately; the fix commit EXTENDS it to also require
// `fatalErrors.push` at the same three sites (post-fix lock).
//
// CEILING: no exported pure helper exists, so a same-behaviour re-merge of
// the errors/fatalErrors arrays is caught only via exit-code/verdict change —
// accepted cost of the ONE-layer ruling.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/assert-data-bounds-halt.db.test.ts

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/quality/assert-data-bounds.js');

/** Fixture key prefix — every seeded permits row is deleted by prefix. */
const FX = 'C4DBHALT';
/** Rename target for Case B — never DROP, see the file-level comment. */
const BAK_TABLE = '_c4_permit_trades_bak';

describe.skipIf(!dbAvailable())('assert-data-bounds — per-site halt-classification gate (C4)', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run (BUILDO_TEST_DB/CI) — there a missing pool
    // means silently registering zero tests (the DeepSeek false-green trap). In a
    // plain `npm run test` (no opt-in) dbAvailable() can be true off an ambient
    // DATABASE_URL while getTestPool() correctly refuses — that is the C1 model's
    // designed silent skip, not a defect. (Found when the panel fold redded the
    // plain Husky run — a fold×environment collision, recorded in the WF.)
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1 pattern) ──
  // Mirrors assert-lifecycle-phase-distribution-halt.db.test.ts:74-117 verbatim
  // rationale: setup-testcontainer.ts:41-46 returns EARLY on an ambient
  // DATABASE_URL before ever consulting BUILDO_TEST_DB, so dbAvailable() alone
  // does not prove this is a disposable container. This suite renames a table
  // and rewrites permits rows — refusing to run against anything but an
  // explicit opt-in + loopback host is what keeps a stray DATABASE_URL from
  // pointing this at a real database.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn the child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'assert-data-bounds-halt.db.test.ts renames permit_trades and seeds permits rows. ' +
      'Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient ' +
      'DATABASE_URL is NOT sufficient, because setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to mutate schema on non-loopback host "${dbUrl.hostname}".`);
  }
  if (dbUrl.pathname.length <= 1) {
    throw new Error(`DATABASE_URL has no database path: ${dbUrl.protocol}//${dbUrl.host}${dbUrl.pathname}`);
  }
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
    // ⛔ See the file-level "CRITICAL HARNESS REQUIREMENT" comment above —
    // without this, Case A and Case C both red for the WRONG reason (sources
    // magnitude floors on an empty container), not the one under test.
    PIPELINE_CHAIN: 'permits',
  };

  interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    verdict: string | null;
    hasAuditTable: boolean;
    rows: Array<{ metric: string; value: unknown; threshold: string; status: string }>;
    errorsArr: string[];
    warningsArr: string[];
    failMetrics: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: any;
    parseError: string | null;
  }

  function runScript(): RunResult {
    const r = spawnSync('node', [SCRIPT], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
    const stdout = r.stdout ?? '';
    const line = stdout.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    // A malformed/truncated PIPELINE_SUMMARY line must not crash the harness
    // with an opaque SyntaxError — surface it as summary:null + parseError so
    // callers can assert summary presence explicitly where they depend on it.
    let summary = null;
    let parseError: string | null = null;
    if (line) {
      try {
        summary = JSON.parse(line.slice('PIPELINE_SUMMARY:'.length));
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
    }
    const recordsMeta = summary?.records_meta ?? null;
    const audit = recordsMeta?.audit_table ?? null;
    return {
      status: r.status,
      stdout,
      stderr: r.stderr ?? '',
      summary,
      parseError,
      verdict: audit?.verdict ?? null,
      // Diagnostic only — NOT a Case B discriminator. `pipeline.js`'s
      // emitSummary() (`:336-340`) unconditionally back-fills a placeholder
      // audit_table whenever the caller omits one, so this is TRUE on every
      // run that reaches an emitSummary call, real audit table or not. Case
      // B distinguishes the placeholder from a real one via `verdict` +
      // `rows` (see that test's comment), not via this flag.
      hasAuditTable: Boolean(recordsMeta && Object.prototype.hasOwnProperty.call(recordsMeta, 'audit_table')),
      rows: audit?.rows ?? [],
      errorsArr: recordsMeta?.errors ?? [],
      warningsArr: recordsMeta?.warnings ?? [],
      failMetrics: (audit?.rows ?? [])
        .filter((x: { status: string }) => x.status === 'FAIL')
        .map((x: { metric: string }) => x.metric),
    };
  }

  async function clearFixtures(): Promise<void> {
    await pool!.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${FX}%`]);
  }

  /**
   * Idempotent rename-back-if-exists. Runs in BOTH beforeEach (recovers from
   * a prior crashed run that left permit_trades renamed — cross-read #14)
   * and afterEach (restores immediately after Case B within this run). Safe
   * no-op when permit_trades is already present under its real name.
   */
  async function restorePermitTradesIfRenamed(): Promise<void> {
    await pool!.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${BAK_TABLE}')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permit_trades') THEN
          ALTER TABLE ${BAK_TABLE} RENAME TO permit_trades;
        END IF;
      END
      $$;
    `);
  }

  beforeEach(async () => {
    await restorePermitTradesIfRenamed();
    await clearFixtures();
  });
  afterEach(async () => {
    // Exception-safe teardown order: restore the rename FIRST, so a throw
    // out of clearFixtures() (or any earlier failure) still leaves
    // permit_trades under its real name for the next test / suite, instead
    // of stranding it renamed if clearFixtures() throws first.
    await restorePermitTradesIfRenamed();
    await clearFixtures();
  });

  // C1 model file pattern (assert-lifecycle-phase-distribution-halt.db.test.ts
  // :235-253) — every sibling ends its pool.
  afterAll(async () => {
    if (!pool) return;
    await restorePermitTradesIfRenamed();
    await clearFixtures();
    await pool.end();
  });

  it('Case A — Pre-Permit threshold breach must eventually be non-halting (RED until C4 lands)', async () => {
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, status)
       VALUES ($1, '00', 'Pre-Permit', 'Under Review')`,
      [`${FX}1`],
    );

    // PRECONDITION — the script queries `permits` container-wide (no FX
    // scoping), so a leaked Pre-Permit row from a crashed prior run (or a
    // sibling suite) would inflate this count silently and this case would
    // "pass" for the wrong reason. Fail loudly, naming the cause.
    const preCheck = await pool!.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    expect(
      Number(preCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 1, found ${preCheck.rows[0].count}`,
    ).toBe(1);

    const r = runScript();

    // The audit row for the pre-permit metric must be FAIL both before and
    // after the fix — C4 changes the HALT, never the verdict (mirrors C1's
    // ":794" invariant for this script's ":??" equivalent). This assertion
    // is ALREADY true today (the row-status logic at `:229-234` is untouched
    // by the fix) — it is here to prove the seed landed and to isolate the
    // failure to the exit-code assertion below, not this one.
    const preRow = r.rows.find((x) => x.metric === 'permits_pre_permit_count');
    expect(preRow, `no permits_pre_permit_count row in audit_table.rows: ${JSON.stringify(r.rows)}`).toBeDefined();
    expect(preRow?.status).toBe('FAIL');

    // DeepSeek-idiom exact-set: prove this seed is disjoint from Case C's
    // cost_outliers seed. Any other FAIL metric breaks the isolation both
    // cases depend on to mean what they claim.
    expect(
      r.failMetrics.sort(),
      'Case A must be Pre-Permit-ONLY. Any other FAIL metric means PIPELINE_CHAIN scoping or fixture isolation broke.',
    ).toEqual(['permits_pre_permit_count']);

    // the verdict is the SOLE red channel post-C4 — run-chain lifts
    // audit_table.verdict into step_verdicts; check-chain-verdict reds on
    // literal 'FAIL' (C1 precedent :284)
    expect(r.verdict).toBe('FAIL');

    // THE red-first assertion. Today the class-blind throw at `:999` fires
    // on ANY non-empty `errors[]`, including this purely threshold-derived
    // site — the chain dies, stranding 11 downstream permits-chain steps
    // incl. backup_db. After C4, a threshold-only failure is non-halting:
    // the step exits 0, `pipeline_runs.status` still writes 'failed' (the
    // stated, accepted status/exit divergence — `:947` untouched), and the
    // FAIL is carried by the verdict alone.
    expect(
      r.status,
      `Expected exit 0 (non-halting threshold FAIL). Got ${r.status}.\nstderr:\n${r.stderr}`,
    ).toBe(0);
  }, 60_000);

  it('Case B — an exception mid-permit-block MUST STILL HALT, with zero verdict representation (red now AND after C4)', async () => {
    // Provoke: permit_trades renamed out from under the orphan-trades LEFT
    // JOIN (`:172-176`). This is NOT a `DROP ... CASCADE` — the table survives
    // under a new name, so every FK on it follows the OID and the operation
    // is fully reversible in afterEach. The outer catch (`:942`) has no
    // 'does not exist' filter (only the WSIB/inspection/heritage/ravines/
    // centreline/cost_estimates inner catches do), so this is NOT routed to
    // a SKIP branch — it reaches the fatal path.
    await pool!.query(`ALTER TABLE permit_trades RENAME TO ${BAK_TABLE}`);

    const r = runScript();

    // Cause-pinned: prove the halt came from the orphan-trades query dying on
    // a missing relation, not from some unrelated crash that would also
    // satisfy a bare ".not.toBe(0)".
    expect(
      r.stderr,
      `Expected a "permit_trades" does not exist error. stderr:\n${r.stderr}`,
    ).toMatch(/permit_trades[\s\S]*does not exist/);

    // THE single most important assertion in this file — CORRECTED from the
    // plan's literal "no audit_table key" wording after running this suite
    // red-first and finding it red for the WRONG reason. `pipeline.js`'s
    // `emitSummary()` (`:336-340`) unconditionally BACK-FILLS a placeholder
    // `audit_table: { phase: 0, name: 'Auto', verdict: 'UNKNOWN', rows: [] }`
    // plus two `sys_*` INFO rows whenever the caller's `records_meta` has no
    // `audit_table` of its own — a Spec 48 §3.5 behaviour the C1 model file
    // never exercises, because its script's exception fires BEFORE its one
    // `emitSummary` call is ever reached. This script's outer catch (`:942`)
    // is different: it does NOT re-throw immediately — execution falls
    // through to the unconditional `emitSummary` call near the bottom of the
    // file (`:984`), which DOES run, with `permitsAuditTable` still null. So
    // `records_meta.audit_table` is never literally ABSENT; it is the
    // pipeline-level placeholder standing in for the missing domain table.
    // The correct proof of "zero verdict representation by construction" is
    // that the placeholder — not `permits_pre_permit_count` or
    // `cost_outliers` or any other permits-domain metric — is what shipped:
    // verdict UNKNOWN (not FAIL, not PASS — a state check-chain-verdict.js
    // and FreshnessTimeline.tsx both treat as "nothing to show"), and every
    // row is a `sys_*` telemetry row, never a domain row. A naive "just drop
    // the throw at :999" (fixing this per-SCRIPT instead of per-SITE) would
    // flip this test green while leaving a fatal error surfaced only as this
    // same UNKNOWN placeholder and no halt — defanging the entire exception
    // class in one edit.
    expect(r.verdict, `expected the pipeline.js auto-injected UNKNOWN placeholder, got verdict=${r.verdict}`).toBe('UNKNOWN');
    expect(
      r.rows.every((row) => row.metric.startsWith('sys_')),
      `expected ONLY sys_* placeholder rows (no domain audit table built), got: ${JSON.stringify(r.rows)}`,
    ).toBe(true);

    // Invariant across the fix. If this ever goes 0, C4 was implemented
    // per-SCRIPT instead of per-SITE and exceptions have been silently
    // demoted to non-fatal alongside the threshold sites.
    expect(
      r.status,
      `An exception mid-permit-block MUST halt. Exit was ${r.status} — if 0, the per-site split has defanged the exception class.`,
    ).not.toBe(0);
  }, 60_000);

  it('Case C — cost_outliers regression lock: 1-19 is silent, =20 is WARN, NEITHER throws (red now at the no-throw assertion)', async () => {
    // 5 permits over the live $2B ceiling (cost_outlier_ceiling_cad default,
    // scripts/seeds/logic_variables.json) — inside the [1,19] band.
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, est_const_cost, status)
       SELECT $1 || g::text, '00', 2000000001, 'Under Review'
         FROM generate_series(1, 5) g`,
      [FX],
    );

    // PRECONDITION — the script's cost_outliers query is container-wide
    // (`est_const_cost < 0 OR est_const_cost > costOutlierCeiling`, `:115`),
    // not FX-scoped. Sibling residue (a crashed prior run, another suite's
    // leaked row) would silently inflate the count this case's [1,19]-band
    // claim depends on. Also confirm no Pre-Permit residue, so a FAIL from
    // Case A's metric can't leak into this case's isolation claim.
    const costCheck = await pool!.query(
      `SELECT COUNT(*) FROM permits
        WHERE est_const_cost < 0
           OR est_const_cost > (SELECT variable_value::numeric FROM logic_variables WHERE variable_key = 'cost_outlier_ceiling_cad')`,
    );
    expect(
      Number(costCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 5, found ${costCheck.rows[0].count}`,
    ).toBe(5);
    const prePermitCheck = await pool!.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    expect(
      Number(prePermitCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 0, found ${prePermitCheck.rows[0].count}`,
    ).toBe(0);

    const r = runScript();

    // Row-level semantics at `:212` are UNCHANGED by the fix (branch (c)
    // ships the row exactly as-is, only demotes the PUSH) — this is TRUE
    // TODAY. It is asserted first so the test isolates its failure to the
    // no-throw expectation below, not here.
    const costRow = r.rows.find((x) => x.metric === 'cost_outliers');
    expect(costRow, `no cost_outliers row: ${JSON.stringify(r.rows)}`).toBeDefined();
    expect(costRow?.status).toBe('PASS');
    expect(costRow?.value).toBe(5);

    // Isolation: no other FAIL/errors/warnings entry from this seed — proves
    // this is disjoint from Case A's Pre-Permit seed.
    expect(r.failMetrics).toEqual([]);
    // Broadened from /cost.*outlier/i — the live push message at `:120` reads
    // "X permits with cost out of bounds (negative or > ...)", not "outlier";
    // the narrower regex never matches the actual string and would leave the
    // =20 test RED under the exact planned fix.
    expect(r.warningsArr.some((w) => /cost.*(outlier|out of bounds)/i.test(w))).toBe(false);

    // THE red-first assertion. TODAY `:120` pushes unconditionally at
    // `costOutliers > 0`, so 5 outliers already halts the chain — pins
    // correction "(c)": post-fix the push condition ALIGNS to the row's
    // existing `>= 20` threshold, so 1-19 produces NEITHER an errors NOR a
    // warnings entry and the script does not throw.
    expect(
      r.status,
      `Expected exit 0 for a sub-threshold (1-19) cost-outlier count. Got ${r.status}.\nstderr:\n${r.stderr}`,
    ).toBe(0);
    expect(r.errorsArr.some((e) => /cost.*(outlier|out of bounds)/i.test(e))).toBe(false);
  }, 60_000);

  it('Case C boundary — exactly 20 cost outliers: row WARN + a warnings entry, still no throw (red now at the no-throw assertion)', async () => {
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, est_const_cost, status)
       SELECT $1 || g::text, '00', 2000000001, 'Under Review'
         FROM generate_series(1, 20) g`,
      [FX],
    );

    const r = runScript();

    const costRow = r.rows.find((x) => x.metric === 'cost_outliers');
    expect(costRow, `no cost_outliers row: ${JSON.stringify(r.rows)}`).toBeDefined();
    // Unchanged row semantics — already true today.
    expect(costRow?.status).toBe('WARN');
    expect(costRow?.value).toBe(20);
    // closes the cascade end-to-end — a WARN row must roll up to a WARN
    // verdict, not silently stay PASS or jump to FAIL.
    expect(r.verdict).toBe('WARN');

    // THE red-first assertion — today this throws (the push fires at >0
    // regardless of the count being exactly at the WARN boundary).
    expect(
      r.status,
      `Expected exit 0 at the =20 boundary (demoted to WARN, non-fatal). Got ${r.status}.\nstderr:\n${r.stderr}`,
    ).toBe(0);

    // Post-fix shape check: the demoted push lands in `warnings`, never
    // `errors` — pins that branch (c) shipped, not branch (b) (escalate to
    // FAIL) or a naive `> 0` warn-push (which would re-create the band
    // disagreement one severity down).
    expect(r.warningsArr.some((w) => /cost.*(outlier|out of bounds)/i.test(w))).toBe(true);
    expect(r.errorsArr.some((e) => /cost.*(outlier|out of bounds)/i.test(e))).toBe(false);
  }, 60_000);

  it('source assertion — the 3 exception-derived pushes target their catch\'s error object verbatim (stated ceiling)', () => {
    // Static, not behavioural. Today's file has no `fatalErrors[]` array —
    // this proves nothing about post-fix dual-push routing, only that TODAY
    // these 3 sites exist in the exact shape Case B's mechanism argument
    // depends on. `:680` (wsibErr) and `:811` (inspErr) are NOT
    // behaviourally reachable by this suite: both live behind an
    // `if (err.message.includes('does not exist'))` filter that routes every
    // cheap provocation (a renamed/missing table) to a SKIP console.log, not
    // to the push — only a real, non-"does not exist" failure inside those
    // blocks would reach them, and this repo has no such provokable failure
    // without corrupting the schema itself. Only `:942` (the outer catch,
    // Case B) is provable by DDL. A future edit that silently drops one of
    // these three from the eventual `fatalErrors[]` split is NOT caught by
    // this test — it is caught only by re-running this suite after the fix
    // lands and confirming Case B still reds on a naive per-script edit.
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src, 'wsibErr push (unreachable — does-not-exist filtered)').toMatch(/errors\.push\(wsibErr\.message\)/);
    expect(src, 'inspErr push (unreachable — does-not-exist filtered)').toMatch(/errors\.push\(inspErr\.message\)/);
    expect(src, 'outer-catch push (the ONLY one of the 3 this suite proves — see Case B)').toMatch(/errors\.push\(err\.message\)/);
    // POST-FIX LOCK (extended in the fix commit, per the test-panel adjudication of
    // DeepSeek's "cannot distinguish a missing fatal push"): all 3 exception sites
    // must ALSO dual-push to fatalErrors[]. Silently dropping one from the split is
    // exactly the per-site-gate regression Spec 30 §5.4.1 exists to prevent — and
    // :680/:811 have no behavioural cover (see ceiling above), so this regex is the
    // only lock they have.
    expect(src, 'wsibErr fatal dual-push (§5.4.1 lock)').toMatch(/fatalErrors\.push\(wsibErr\.message\)/);
    expect(src, 'inspErr fatal dual-push (§5.4.1 lock)').toMatch(/fatalErrors\.push\(inspErr\.message\)/);
    expect(src, 'outer-catch fatal dual-push (§5.4.1 lock)').toMatch(/fatalErrors\.push\(err\.message\)/);
    // And the throw gates on the fatal array alone — not on errors[]/hasErrors.
    expect(src, 'throw gates on fatalErrors only').toMatch(/if \(fatalErrors\.length > 0\) throw/);
    expect(src, 'the old errors-gated throw is gone').not.toMatch(/if \(hasErrors\) throw/);
  });
});
