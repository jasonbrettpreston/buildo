// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 12 (R-B runtime reader)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md R-B (LW-D20 / LG-19)
//
// The BEHAVIOURAL half of Rule 12's checkInterruptedPostureTruthful (Spec 124 §2
// Rule 12, WF2 "Rules 10/11/12 mechanical checkers", C3). scripts/analysis/
// step-validate.mjs's static half proves the runner's SOURCE reaches
// detectInterruptedRetraction; this proves the REAL, LIVE behaviour matches it: a
// genuinely killed link_wsib process (the CASCADE archetype whose live
// kill-and-rerun originally produced LW-D20/LG-19) leaves its `pipeline_runs` row
// stuck "running", and the NEXT `selectMode` call for the SAME descriptor
// unconditionally resolves FULL, `reason:"recover_interrupted_retraction"` — i.e.
// the DECLARED posture (`recovery.interrupted:"force_full_on_next_run"`) matches
// MEASURED runtime behaviour, not just source-code reachability.
//
// ONE archetype (CASCADE via link_wsib), not five — deliberately scoped (the plan's
// own "expensive, scoped" framing): no `spawn(` + real-kill precedent existed
// anywhere in this suite before this file (grepped, WF2 grounding table row 13),
// so this is genuinely new DB-tier machinery, not an extension of an existing one.
// The other four shapes with a destructive-retraction-capable runner (link,
// link_keyed, materialize, ingest/backfill/recorder in the abstract) are filed as
// `scripts/steps/_schema/programme-items.json`'s `CRASH-BEHAV` (nice_to_have).
//
// No SIGTERM handler exists anywhere in this codebase (grepped scripts/lib/*.js +
// scripts/lib/step/*.js) — Node's default disposition for an un-handled SIGTERM
// terminates the process immediately, abandoning any in-flight `finally`-block
// work (including `finalizeLedgerRow`). That is exactly the crash class this test
// manufactures: `openLedgerRow`'s INSERT already committed (a separate, unwrapped
// statement — LG-15/index.js `runWithPool`), so a SIGTERM delivered any time after
// it, and before `finalizeLedgerRow`'s UPDATE lands, leaves the row "running"
// forever, exactly the shape `detectInterruptedRetraction` (scripts/lib/step/
// staleness.js) exists to detect on the NEXT run.
//
// ⚠️ BLOCKED — `describe.skip`, not `describe.skipIf(!dbAvailable())`. Measured
// live 2026-09-03 building this file: a REAL step script spawned against the
// ephemeral BUILDO_TEST_DB testcontainer ALWAYS refuses at `assertDbTarget`
// (`scripts/lib/resolve-db.js:292`) — `[link_wsib] REFUSING: connected to
// database "buildo_test", expected one of "postgres"`. `setup-testcontainer.ts`
// names its container `buildo_test`; every converted descriptor's
// `database.assert_current_database` is the single literal `"postgres"` with NO
// env-var override, and `link-wsib.js:36`'s `require('./link-wsib.descriptor.json')`
// is a plain, frozen-shape require with no test-only path override either (unlike
// `check-step-shape.mjs`'s `BUILDO_COMPUTE_DIR` / `generate-schema-baseline.mjs`'s
// `BUILDO_SCHEMA_PATH`). This is a deliberate PRODUCTION safety fence (Spec 122
// §P0) that this WF2 is not authorized to weaken under time pressure — filed
// HIGH in `docs/reports/review_followups.md` ("WF2 Rule 12 behavioural half — no
// db.test.ts can spawn a REAL converted step against the ephemeral test
// container", 2026-09-03) as its own scoped WF2/WF3: a genuine, reviewed
// test-context escape hatch on `assertDbTarget` (an additional allowed-database-
// names source, inert by default). Un-skip this file once that lands.
// `programme-items.json`'s `CRASH-BEHAV` item cites this followup as its
// blocker. The mechanism below is otherwise complete and was proven correct up
// to that wall (spawn/poll/kill plumbing all measured working) — kept committed
// rather than deleted so the follow-on WF has a working starting point.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Pool } from 'pg';
import { getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const staleness = require(path.join(REPO_ROOT, 'scripts/lib/step/staleness.js')) as {
  detectInterruptedRetraction: (pool: Pool, descriptor: unknown, opts: { ownRunId?: number | null }) => Promise<{ interrupted: boolean; row: { id: number; pipeline: string; status: string } | null }>;
  selectMode: (args: { descriptor: unknown; pool: Pool; prior: unknown; argv?: string[]; env?: NodeJS.ProcessEnv; ownRunId?: number | null }) => Promise<{ mode: string; reason: string }>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- descriptor is a data-only sibling JSON
const descriptor = require(path.join(REPO_ROOT, 'scripts/link-wsib.descriptor.json'));

const PIPELINE = 'link_wsib';

/** Poll `pipeline_runs` until a "running" row for `pipeline` appears, or `deadlineMs` passes. */
async function waitForRunningRow(pool: Pool, pipeline: string, deadlineMs: number): Promise<{ id: number } | null> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const res = await pool.query(
      `SELECT id FROM pipeline_runs WHERE pipeline = $1 AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
      [pipeline],
    );
    if (res.rows[0]) return res.rows[0] as { id: number };
    await new Promise((r) => setTimeout(r, 2));
  }
  return null;
}

describe.skip('Rule 12 behavioural half — a genuinely killed link_wsib leaves a truthfully-recoverable posture (live DB) — BLOCKED, see file header', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterEach(async () => {
    // Test hygiene: never leave the manufactured stuck "running" row behind for
    // another test (or a stray real run against this container) to trip over —
    // this is the same cleanup production's own reconcile reaper (Spec 122 §7.4)
    // would eventually perform, done here directly since this test is the
    // FIXTURE that manufactures the stuck row on purpose.
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = $1 AND status = 'running'`, [PIPELINE]);
  });

  it('SIGTERM mid-run leaves the ledger row "running"; the NEXT selectMode call resolves FULL, reason:recover_interrupted_retraction', async () => {
    const child = spawn('node', [path.join(REPO_ROOT, 'scripts/link-wsib.js')], {
      cwd: REPO_ROOT,
      // scripts/lib/pipeline.js's own createPool() (what pipeline.run — and so
      // every step script — actually connects with) checks SUPABASE_DATABASE_URL
      // or the discrete PG_* vars, NOT bare DATABASE_URL — a DIFFERENT lookup
      // than scripts/lib/resolve-db.js's createResolvedPool. setup-testcontainer.ts
      // only exposes the ephemeral container via DATABASE_URL (for THIS test
      // process's own getTestPool()), so the child needs it translated.
      env: { ...process.env, SUPABASE_DATABASE_URL: process.env.DATABASE_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let spawnError: Error | null = null;
    let childOutput = '';
    let childExited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.once('error', (err) => { spawnError = err; });
    child.stdout?.on('data', (d) => { childOutput += String(d); });
    child.stderr?.on('data', (d) => { childOutput += String(d); });
    child.once('exit', (code, signal) => { childExited = { code, signal }; });

    const running = await waitForRunningRow(pool, PIPELINE, 10_000);
    expect(spawnError, `child process failed to spawn: ${String(spawnError)}`).toBeNull();
    expect(
      running,
      `${PIPELINE} never reached a "running" pipeline_runs row within 10s — the kill window was missed ` +
        `(see this file's header for the seeding note if this proves flaky). ` +
        `childExited=${JSON.stringify(childExited)}\nchild output:\n${childOutput.slice(0, 4000)}`,
    ).not.toBeNull();

    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(resolve, 5_000); // no SIGTERM handler exists anywhere in this codebase, so exit is expected promptly — this is a ceiling, not the expected wait
    });

    const stuck = await pool.query(`SELECT id, status FROM pipeline_runs WHERE id = $1`, [running!.id]);
    expect(stuck.rows[0]?.status, 'the killed run\'s ledger row must still read "running" — a clean finalize would defeat this test\'s premise (the kill landed too late, or a handler intercepted it)').toBe('running');

    const interruptedRetraction = await staleness.detectInterruptedRetraction(pool, descriptor, {});
    expect(interruptedRetraction.interrupted, 'detectInterruptedRetraction did not see the stuck "running" row').toBe(true);
    expect(interruptedRetraction.row?.id).toBe(running!.id);

    // The declared posture (recovery.interrupted:"force_full_on_next_run") in
    // practice, over the SAME descriptor and pool: the NEXT selectMode call
    // wins UNCONDITIONALLY on the interrupted-retraction reader (staleness.js),
    // regardless of any other signal.
    const gate = await staleness.selectMode({ descriptor, pool, prior: null, argv: [], env: process.env, ownRunId: null });
    expect(gate.mode).toBe('full');
    expect(gate.reason).toBe('recover_interrupted_retraction');
  }, 30_000);
});
