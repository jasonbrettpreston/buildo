// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §3, §7.2
// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
//
// WF3 F2 (2026-08-15) — THE BEHAVIOURAL PROOF, end to end: a real `node
// scripts/run-chain.js <chain>` child process, a real fixture chain (one step: a
// sleep stub with step_timeout_minutes armed), a real DB. Not the real manifest.json
// (F2's manifest change is scoped to refresh_snapshot ONLY — this file exercises the
// mechanism via `--manifest=<tmp fixture>`, a test-only CLI override that never
// touches production chains).
//
// Proves the FULL chain: ceiling elapses -> child killed -> spawnStepChild rejects
// (err.stepTimedOut) -> the existing catch path writes the step row `failed` with
// `records_meta.reason = 'step_timeout'` -> failedStep is set (unconditionally, same
// as any other step failure) -> the chain row is `failed` -> run-chain.js exits 1.
// This is the settled W5 design: a ceiling kill is HALTING (Spec 30 §5.4.1
// criterion 1 — "I could not run this step" is exception-class), not the C1
// non-halting cross-check posture.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/run-chain-step-timeout.db.test.ts

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const RUN_CHAIN = path.join(REPO_ROOT, 'scripts/run-chain.js');
const CHAIN_ID = 'fxsteptimeout';

describe.skipIf(!dbAvailable())('run-chain.js — WF3 F2 step-timeout end-to-end (real child, real chain, real DB)', () => {
  const pool = getTestPool();
  if (!pool) return;

  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn the child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error('run-chain-step-timeout.db.test.ts spawns a real run-chain.js child against a live DB. Refusing without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true).');
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to run against non-loopback host "${dbUrl.hostname}".`);
  }
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
    // Fire-and-forget observer spawn is irrelevant noise for this fixture chain.
    OBSERVABILITY_ENABLED: '0',
  };

  let tmpDir: string;
  let manifestPath: string;

  /** Writes a fixture manifest with ONE step whose sleep duration + ceiling are caller-controlled. */
  function writeFixtureManifest(opts: { sleepMs: number; stepTimeoutMinutes: number }) {
    const scriptPath = path.join(tmpDir, 'sleep-step.js');
    writeFileSync(
      scriptPath,
      `setTimeout(() => { console.log('PIPELINE_SUMMARY:' + JSON.stringify({records_total: 0})); process.exit(0); }, ${opts.sleepMs});\n`,
    );
    const manifest = {
      version: 1,
      scripts: {
        sleep_step: {
          file: scriptPath,
          supports_full: false,
          supports_dry_run: false,
          step_timeout_minutes: opts.stepTimeoutMinutes,
        },
      },
      chains: { [CHAIN_ID]: ['sleep_step'] },
      chain_gates: {},
    };
    manifestPath = path.join(tmpDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  function runChainChild(): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync('node', [RUN_CHAIN, CHAIN_ID, '', `--manifest=${manifestPath}`], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  async function stepRow() {
    const { rows } = await pool!.query(
      `SELECT status, records_meta FROM pipeline_runs WHERE pipeline = $1 ORDER BY id DESC LIMIT 1`,
      [`${CHAIN_ID}:sleep_step`],
    );
    return rows[0];
  }
  async function chainRow() {
    const { rows } = await pool!.query(
      `SELECT status FROM pipeline_runs WHERE pipeline = $1 ORDER BY id DESC LIMIT 1`,
      [`chain_${CHAIN_ID}`],
    );
    return rows[0];
  }

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'wf3-f2-'));
  });

  beforeEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline = $1 OR pipeline = $2`, [`chain_${CHAIN_ID}`, `${CHAIN_ID}:sleep_step`]);
  });

  afterAll(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline = $1 OR pipeline = $2`, [`chain_${CHAIN_ID}`, `${CHAIN_ID}:sleep_step`]);
    rmSync(tmpDir, { recursive: true, force: true });
    await pool!.end();
  });

  it('a step sleeping past its ceiling is KILLED, marked failed with reason=step_timeout, and the CHAIN HALTS (exit 1)', () => {
    // Ceiling 0.02min = 1.2s; the step sleeps 8s — it can never finish on its own.
    writeFixtureManifest({ sleepMs: 8000, stepTimeoutMinutes: 0.02 });
    const start = Date.now();
    const result = runChainChild();
    const elapsedMs = Date.now() - start;

    expect(result.status, `expected exit 1 (chain halted). stderr:\n${result.stderr}`).toBe(1);
    // The kill fired near the 1.2s ceiling, not after the step's own 8s sleep.
    expect(elapsedMs, 'run-chain.js should exit well before the sleep step would finish on its own').toBeLessThan(6000);

    return Promise.all([stepRow(), chainRow()]).then(([step, chain]) => {
      expect(step, 'step row must exist').toBeTruthy();
      expect(step.status).toBe('failed');
      expect(step.records_meta?.reason).toBe('step_timeout');
      expect(step.records_meta?.step_timeout_minutes).toBe(0.02);

      expect(chain, 'chain row must exist').toBeTruthy();
      expect(chain.status).toBe('failed');
    });
  }, 30_000);

  it('a step finishing WELL under its ceiling completes normally (no false-positive kill)', () => {
    // Ceiling 1min; the step sleeps 200ms — comfortably under.
    writeFixtureManifest({ sleepMs: 200, stepTimeoutMinutes: 1 });
    const result = runChainChild();

    expect(result.status, `expected exit 0. stderr:\n${result.stderr}`).toBe(0);
    return stepRow().then((step) => {
      expect(step.status).toBe('completed');
      expect(step.records_meta?.reason).toBeUndefined();
    });
  }, 30_000);
});
