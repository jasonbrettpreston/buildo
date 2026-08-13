// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4
// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
//
// C4 — per-site halt-classification gate for assert-network-health.js. THE
// RED-FIRST PROOF (`.cursor/active_task.md` §"C4 — WF2 v2 (2026-08-13)").
//
// The defect this pins: the script's ONE threshold-derived push
// (`proxy_error_rate`, criterion-(1) accepted per the panel — it IS
// threshold-derived AND unambiguously means "the scrape did not work", but
// converting it anyway is cheaper than the 4 steps it strands, incl. the
// OTHER two quality asserts on this chain) throws at the bottom of the file
// unconditionally on `errors.length > 0`. The fix (NOT landed by this file —
// tests are red-first) is a ONE-LINE deletion of that throw; unlike
// assert-data-bounds this script has no `try`/`catch` anywhere, so every
// exception is a raw throw that bypasses `emitSummary` entirely and there is
// no `fatalErrors[]` split to build — the `:36` logicVars Zod throw stays
// fatal for free, by construction, not by a second array.
//
// ⛔ TRAP ② — THE SCRIPT SKIPS BY DEFAULT. An unseeded testcontainer has no
// `inspections` pipeline_runs row, so `scTel` is falsy, the script logs SKIP,
// emits a `verdict: 'SKIP'` audit_table, and exits 0 WITHOUT ever reaching
// the throw. A test that asserts "exit 0" without first seeding a
// `pipeline_runs` row proves nothing — it would pass identically whether the
// halt-classification fix landed or not. EVERY case below seeds first.
//
//   Case A — proxy_error_rate threshold breach: RED NOW (script throws),
//            GREEN AFTER (exit 0 AND the `proxy_error_rate` row is FAIL —
//            same accepted-cost caveat as C4's data-bounds sibling: this now
//            reports on a scrape that failed to collect the data it's
//            judging, and the 4 previously-stranded steps run on that same
//            failed-scrape data. Both stated in the eventual script header,
//            not re-derived here).
//   Case B — a bad-but-parseable logic var (RED NOW AND AFTER): the `:36`
//            Zod throw fires BEFORE `loadMarketplaceConfigs` even returns
//            control past validation — before ANY `emitSummary` call exists
//            in the function body reachable from there. Zero verdict
//            representation by construction, and untouched by the fix
//            (the fix only deletes the LAST line of the file).
//
// ⛔ TRAP ① — WRITTEN INTO CASE B VERBATIM, PER THE PLAN: the provocation
// MUST be an `UPDATE ... SET variable_value = '2.5'`, NEVER a `DELETE`. If
// the row is deleted, `config-loader.js:216-243` never sees a
// `scraper_empty_streak_warn` key in `lvRows`, `logicVars` keeps its
// structuredClone of `FALLBACK_LOGIC_VARS` (the JSON default, `20`, an
// already-valid int) — and the script runs GREEN. `'2.5'` survives
// `config-loader.js`'s own sanitiser (`scraper_empty_streak_warn` is in
// neither `ZERO_IS_INVALID` nor `NEGATIVE_IS_INVALID`, and `parseFloat('2.5')`
// is finite and non-zero) and is assigned into `logicVars` as the number
// `2.5` — which then fails `z.coerce.number().finite().positive().int()` at
// the Zod boundary. A future editor "simplifying" this to a DELETE gets a
// false green; the reason is recorded here so it isn't repeated.
//
// This file spawns the REAL script as a child process against TODAY'S code —
// same rationale as the data-bounds sibling file: a pure-function test
// cannot be the red-first proof (pre-fix it would fail on a missing import,
// not on the behaviour).
//
// OVERALL CEILING (v1, restated): no exported pure helper exists for either
// script in this WF — the two-array split (data-bounds) or the one-line
// deletion (this file) IS the classification. A same-behaviour re-merge is
// caught only via the exit-code/verdict change these tests assert, never via
// a unit-level lock on an internal function. Accepted cost of the ONE-layer
// ruling (Spec 30 §5.4.1).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/assert-network-health-halt.db.test.ts

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/quality/assert-network-health.js');

const LOGIC_VAR_KEY = 'scraper_empty_streak_warn';

describe.skipIf(!dbAvailable())('assert-network-health — per-site halt-classification gate (C4)', () => {
  if (!pool) {
    // Same guard as the data-bounds sibling (:115-126 there): in an OPTED-IN run a
    // missing pool means silently registering zero tests (false-green); in a plain
    // run it is the C1 model's designed silent skip. Parity fold — output-panel
    // Code Reviewer caught this file missing it.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1 pattern, same rationale as the data-bounds
  // sibling file — see that file's header for the full setup-testcontainer.ts
  // short-circuit explanation). This suite seeds pipeline_runs rows and
  // rewrites a logic_variables row; it must never run against an ambient
  // DATABASE_URL that isn't provably disposable.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn the child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'assert-network-health-halt.db.test.ts seeds pipeline_runs and mutates logic_variables. ' +
      'Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient ' +
      'DATABASE_URL is NOT sufficient, because setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to seed fixtures and rewrite logic_variables on non-loopback host "${dbUrl.hostname}".`);
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
  };

  interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    verdict: string | null;
    summaryEmitted: boolean;
    rows: Array<{ metric: string; value: unknown; threshold: string | null; status: string }>;
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
    const audit = summary?.records_meta?.audit_table ?? null;
    return {
      status: r.status,
      stdout,
      stderr: r.stderr ?? '',
      summary,
      parseError,
      verdict: audit?.verdict ?? null,
      summaryEmitted: Boolean(line),
      rows: audit?.rows ?? [],
    };
  }

  // Snapshot/restore the ONE logic_variables key this suite mutates (C1
  // pattern, scoped down — this file only ever touches one key via a raw
  // UPDATE rather than the QUIET-dict UPSERT idiom, so restore is a single
  // UPDATE back to the pre-suite value rather than a delete+reseed).
  let savedValue: string | null = null;
  beforeAll(async () => {
    const r = await pool!.query<{ variable_value: string }>(
      `SELECT variable_value::text FROM logic_variables WHERE variable_key = $1`,
      [LOGIC_VAR_KEY],
    );
    savedValue = r.rows[0]?.variable_value ?? null;
  });

  const seededRunIds: number[] = [];

  beforeEach(async () => {
    // Belt-and-suspenders restore before every test too, in case a prior
    // crashed run left the sentinel in place.
    if (savedValue !== null) {
      await pool!.query(`UPDATE logic_variables SET variable_value = $1 WHERE variable_key = $2`, [savedValue, LOGIC_VAR_KEY]);
    }
  });
  afterEach(async () => {
    if (seededRunIds.length > 0) {
      await pool!.query(`DELETE FROM pipeline_runs WHERE id = ANY($1::int[])`, [seededRunIds]);
      seededRunIds.length = 0;
    }
    if (savedValue !== null) {
      await pool!.query(`UPDATE logic_variables SET variable_value = $1 WHERE variable_key = $2`, [savedValue, LOGIC_VAR_KEY]);
    }
  });

  // C1 model file pattern (assert-lifecycle-phase-distribution-halt.db.test.ts
  // :235-253) — every sibling ends its pool.
  afterAll(async () => {
    if (!pool) return;
    await pool.end();
  });

  it('Case A — proxy_error_rate threshold breach must eventually be non-halting (RED until C4 lands)', async () => {
    // TRAP ② discharge: seed a real `inspections` pipeline_runs row with
    // scraper_telemetry, or this reads as an unseeded SKIP and proves
    // nothing. 10/10 proxy_errors = 100% >= the live 5% warn-pct default.
    const telemetry = {
      scraper_telemetry: {
        permits_attempted: 10,
        proxy_errors: 10,
      },
    };
    const ins = await pool!.query<{ id: number }>(
      `INSERT INTO pipeline_runs (pipeline, started_at, status, records_meta)
       VALUES ('inspections', NOW(), 'completed', $1::jsonb) RETURNING id`,
      [JSON.stringify(telemetry)],
    );
    seededRunIds.push(ins.rows[0]!.id);

    const r = runScript();

    // The audit row must reach FAIL both before and after the fix — this
    // part of the code is untouched by C4 (the fix deletes only the final
    // throw line). Asserted first so a failure isolates to the exit-code
    // check below, not this one.
    expect(r.summaryEmitted, `no PIPELINE_SUMMARY on stdout.\nstderr:\n${r.stderr}`).toBe(true);
    const proxyRow = r.rows.find((x) => x.metric === 'proxy_error_rate');
    expect(proxyRow, `no proxy_error_rate row: ${JSON.stringify(r.rows)}`).toBeDefined();
    expect(proxyRow?.status).toBe('FAIL');
    expect(r.verdict).toBe('FAIL');

    // THE red-first assertion. Today the unconditional throw at the bottom
    // of the file fires on ANY non-empty `errors[]`, stranding the 4
    // downstream deep_scrapes steps (incl. the other two quality asserts).
    // After C4 (a one-line deletion, no fatalErrors split needed — this
    // script has no try/catch, so errors[] is already threshold-only), the
    // step exits 0 and the FAIL is carried by the verdict alone.
    expect(
      r.status,
      `Expected exit 0 (non-halting threshold FAIL). Got ${r.status}.\nstderr:\n${r.stderr}`,
    ).toBe(0);
  }, 60_000);

  it('Case B — a bad-but-parseable logic var MUST STILL HALT before any summary is emitted (red now AND after C4)', async () => {
    // TRAP ① — see file header. UPDATE to a value that SURVIVES
    // config-loader.js's sanitiser but FAILS the script's own Zod
    // `.int()` bound, never DELETE (which would silently fall back to the
    // valid default and run green).
    await pool!.query(`UPDATE logic_variables SET variable_value = '2.5' WHERE variable_key = $1`, [LOGIC_VAR_KEY]);

    const r = runScript();

    // Cause-pinned: prove the halt is the Zod validation error, not some
    // unrelated crash that would also satisfy a bare "non-zero exit".
    expect(
      r.stderr,
      `Expected a logicVars validation failure naming ${LOGIC_VAR_KEY}. stderr:\n${r.stderr}`,
    ).toMatch(new RegExp(`logicVars validation failed.*${LOGIC_VAR_KEY}`, 's'));

    // The exception fires before the function reaches ANY emitSummary call —
    // unlike Case A (and unlike assert-data-bounds' Case B, which DOES emit a
    // summary sans audit_table), this script has no code path that emits a
    // partial summary ahead of this throw. No PIPELINE_SUMMARY line at all.
    expect(
      r.summaryEmitted,
      'no PIPELINE_SUMMARY line should exist on stdout — the Zod throw fires before any emitSummary call is reachable.',
    ).toBe(false);

    // Invariant across the fix. The one-line deletion this WF ships touches
    // only the LAST line of the file; this throw is untouched. If this ever
    // goes 0, something broader than the intended fix landed.
    expect(
      r.status,
      `A logicVars validation failure MUST halt. Exit was ${r.status} — the fix should never have touched this path.`,
    ).not.toBe(0);
  }, 60_000);
});
