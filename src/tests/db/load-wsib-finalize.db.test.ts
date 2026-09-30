// SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Commit E (B3 output-panel remediation, E#1) — the standalone load_wsib run's
// pipeline_runs 'running' row had no try/finally: any throw mid-run left it wedged
// forever. Since link-wsib.js's UPSTREAM_SLUGS includes load_wsib, a stranded row
// silently disables the B3 run-ledger gate's savings for link_wsib (it always sees
// non-completed upstream activity → always RUN) — invisible unless a human loads the
// admin dashboard (the only thing that ever reaped it).
//
// Commit E's fence (1ffa7478) now lives in the RUNNER, not the shell: the conversion
// retired the freeze's spawnable invocation (WS-D4, D1(A) — the shell reads no argv, so
// `node scripts/load-wsib.js --file <csv>` no longer selects the file). The runner opens
// the standalone pipeline_runs row (`ledger.js` owns it when `chainId` is null) and
// finalizes it on EVERY terminal, including a thrown compute (step/index.js's
// `finally` → finalizeLedgerRow → finalizeStrandedRun). This file therefore drives the
// CONVERTED invocation IN PROCESS — the real `step(descriptor, compute).run({pool})`
// lifecycle against the real test pool and the library's real acquire→shape→score
// phases — which is exactly the code path the fence is now a property of.
// (Descriptor deviations[6], `.cursor/batch2_load_wsib_active_task.md` §2 row 14.)
//
// E-R1 (this file): a real throw mid-run (CSV row missing a required header column, so
// compute.shapeRecord's carried "Schema drift" check fires — deviations[1]) still
// finalizes the standalone pipeline_runs row to a terminal status ('failed').
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/load-wsib-finalize.db.test.ts --no-file-parallelism

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS runner + compute */
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');

const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step')) as {
  step: (descriptor: unknown, compute: unknown) => { run: (ctx: { pool: unknown; chainId: string | null }) => Promise<{ status: string }> };
};
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-wsib.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// `/data/` is gitignored (.gitignore, "data files (large datasets — never commit)"), so
// the clone's one external can read a test-owned directory and never the operator's own
// data/BusinessClassificationDetails*.csv.
const TEST_DIR_REL = 'data/.load-wsib-finalize-test';
const TEST_DIR_ABS = path.join(REPO_ROOT, TEST_DIR_REL);
const FIXTURE_CSV = path.join(TEST_DIR_ABS, 'BusinessClassificationDetails(9999).csv');

describe.skipIf(!dbAvailable())('load-wsib — Commit E finalize (real runner, standalone no CHAIN_ID)', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (enrich-parcels-incremental.db.test.ts pattern, verbatim rationale) ──
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to run the real runner against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'load-wsib-finalize.db.test.ts drives scripts/lib/step against a real pool and inserts/finalizes ' +
      'pipeline_runs rows. Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true).',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to run a mutating step against non-loopback host "${dbUrl.hostname}".`);
  }

  beforeAll(() => {
    fs.mkdirSync(TEST_DIR_ABS, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TEST_DIR_ABS, { recursive: true, force: true });
  });

  afterEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline = 'load_wsib'`);
  });

  /**
   * The descriptor under test — a clone of the REAL load_wsib descriptor, with exactly
   * ONE change: `inputs.reads.externals[0].path` is re-pointed at the test-owned,
   * gitignored directory (same id/kind/format/key_property/csv_options/cache). Both
   * tests then exercise the real acquire → shape → score → finalize path; only the
   * presence of the matching file differs.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, re-read per call
  const descriptorJson = require('../../../scripts/load-wsib.descriptor.json');

  function D(): Record<string, unknown> {
    const d = JSON.parse(JSON.stringify(descriptorJson)) as {
      inputs: { reads: { externals: Array<Record<string, unknown>> } };
    };
    d.inputs.reads.externals[0]!.path = `${TEST_DIR_REL}/BusinessClassificationDetails*.csv`;
    return d as Record<string, unknown>;
  }

  function clearTestDir(): void {
    fs.rmSync(TEST_DIR_ABS, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR_ABS, { recursive: true });
  }

  it('E-R1: a CSV row missing a required header column throws mid-parse, and the runner STILL finalizes the row to a terminal status (not left running)', async () => {
    // Missing 'Legal name' (a required header) — the pre-conversion scenario, restored at the
    // ② panel fold (F3): compute.coerceKey throws the legacy "Schema drift: missing column
    // \"Legal name\"" while acquire.js parses the key, i.e. inside the runner's try block, before
    // any write.
    fs.writeFileSync(FIXTURE_CSV, 'Predominant class,Mailing Address\nG1,123 Test St\n', 'utf8');

    // chainId null = standalone: the runner OWNS the ledger row (ledger.js ownsLedgerRow
    // = `!chainId`), so it opens AND finalizes it. The halt must still propagate — the
    // compute throw is NOT swallowed.
    await expect(stepLib.step(D(), compute).run({ pool, chainId: null })).rejects.toThrow(/Schema drift/);

    const { rows } = await pool!.query(
      `SELECT status, completed_at FROM pipeline_runs WHERE pipeline = 'load_wsib' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(rows.length, 'the runner must have opened its own pipeline_runs row (standalone, no CHAIN_ID)').toBe(1);
    // THE fix: pre-Commit-E this row would still read status='running', completed_at=NULL forever.
    expect(rows[0].status).not.toBe('running');
    expect(rows[0].status).toBe('failed');
    expect(rows[0].completed_at).not.toBeNull();
  }, 30_000);

  it('a genuinely missing source file lands the declared COMPLETED skip (never a running row)', async () => {
    clearTestDir();

    // The declared tier-1 outcome (deviations[0]): an absent file is skipped_no_source_file
    // with status 'completed'. The legacy shell threw "File not found" here; the converted
    // runner instead opens its row, takes the skip, and finalizes it COMPLETED.
    const out = await stepLib.step(D(), compute).run({ pool, chainId: null });
    expect(out.status).toBe('completed');

    const { rows } = await pool!.query(
      `SELECT status FROM pipeline_runs WHERE pipeline = 'load_wsib' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(rows.length, 'the runner must have opened its own pipeline_runs row (standalone, no CHAIN_ID)').toBe(1);
    expect(rows[0].status).toBe('completed');
    // The fence: a terminal run never leaves its row `running`.
    expect(rows[0].status).not.toBe('running');
  }, 30_000);
});
