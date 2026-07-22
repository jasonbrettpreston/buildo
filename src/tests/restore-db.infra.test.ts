// SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §4.3, §9, §10
//
// Infra test for scripts/restore-db.js's real pg_dump/pg_restore mechanics —
// gated like src/tests/db/*.db.test.ts (dbAvailable()/getTestPool(), the
// CI-service-container-or-BUILDO_TEST_DB=1-testcontainer harness), PLUS an
// additional pg_dump/pg_restore binary-availability check: the harness
// guarantees a live Postgres *server*, not that the runner host has the
// client *tools* on PATH (a separate concern from Spec 112 §5's minimum
// client-VERSION rule, which this file deliberately does not exercise —
// see below).
//
// Exercises the 3 behaviors Spec 112 §10 mandates for this file against a
// REAL pg_dump/pg_restore process and a REAL target database, not synthetic
// fixtures (those are covered by src/tests/restore-db.logic.test.ts):
//   1. stderr-gated wrapper — "any stderr = fail" against real binary output
//   2. TOC preflight — parseTocTables/checkTocCoversScope against REAL
//      `pg_restore --list` output for a dump that's missing a scoped table
//   3. --single-transaction atomicity — a restore that fails partway through
//      (PK violation) leaves the target's pre-existing rows completely
//      untouched, not partially overwritten
//
// Deliberately calls restore-db.js's exported LOW-LEVEL functions
// (spawnCapture/buildPgDumpArgs/buildPgRestoreArgs/parseTocTables/
// checkTocCoversScope) rather than the top-level `run()` CLI entrypoint —
// `run()` reads process.argv and calls checkClientVersion() (Spec 112 §5,
// requires a >=17 client), neither of which this test wants to depend on;
// self-dump/self-restore against the SAME test-harness Postgres exercises
// the exact mechanics under test regardless of the client's major version.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const restoreDb = require('../../scripts/restore-db.js') as {
  spawnCapture: (
    cmd: string,
    args: string[],
    env?: Record<string, string>
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  buildPgDumpArgs: (a: {
    tables: string[];
    outFile: string;
    source: { host: string; port: number; user: string; database: string };
  }) => string[];
  buildPgRestoreArgs: (a: { dumpPath: string; targetConnectionString: string }) => string[];
  stderrGateDecision: (a: { exitCode: number; stderr: string }) => { pass: boolean; reason: string };
  parseTocTables: (listOutput: string) => Set<string>;
  checkTocCoversScope: (tocTables: Set<string>, scopedTables: string[]) => { covered: boolean; missing: string[] };
  countTableRowsSafe: (pool: Pool, tableExpr: string) => Promise<number | null>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gatesLib = require('../../scripts/validation/supabase-load-gates.js') as {
  getAuthLinkedTables: (pool: Pool) => Promise<string[]>;
};

function pgToolsAvailable(): boolean {
  try {
    const dump = spawnSync('pg_dump', ['--version']);
    const restore = spawnSync('pg_restore', ['--version']);
    return dump.status === 0 && restore.status === 0;
  } catch {
    return false;
  }
}

const RUN = dbAvailable() && pgToolsAvailable();

describe.skipIf(!RUN)('scripts/restore-db.js — infra (real pg_dump/pg_restore against a live DB)', () => {
  let pool: Pool;
  let conn: { host: string; port: number; user: string; password: string; database: string };
  const TABLE_A = '_restore_infra_a';
  const TABLE_B = '_restore_infra_b';

  beforeAll(async () => {
    pool = getTestPool() as Pool;
    const url = new URL(process.env.DATABASE_URL as string);
    conn = {
      host: url.hostname,
      port: Number(url.port || '5432'),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    };
    await pool.query(`CREATE TABLE IF NOT EXISTS public.${TABLE_A} (id int PRIMARY KEY, val text)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS public.${TABLE_B} (id int PRIMARY KEY, val text)`);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DROP TABLE IF EXISTS public.${TABLE_A}`);
    await pool.query(`DROP TABLE IF EXISTS public.${TABLE_B}`);
    // Belt-and-suspenders: if the stderr-gate test's timeout/crash ever
    // interrupts its rename-back `finally`, the renamed table would otherwise
    // persist and poison the NEXT run's beforeAll (CREATE IF NOT EXISTS
    // recreates TABLE_A alongside the orphan) — observed 2026-07-20 after a
    // hard session crash mid-suite.
    await pool.query(`DROP TABLE IF EXISTS public._restore_infra_a_renamed`);
    // Belt for the C2 auth-derivation test's probe table (its own finally
    // normally drops it; a mid-test crash would otherwise orphan it).
    await pool.query(`DROP TABLE IF EXISTS public._authlink_probe`);
    await pool.end();
  });

  function targetConnectionString(): string {
    return `postgresql://${conn.user}:${conn.password}@${conn.host}:${conn.port}/${conn.database}`;
  }

  async function dumpTable(table: string, outFile: string) {
    const result = await restoreDb.spawnCapture(
      'pg_dump',
      restoreDb.buildPgDumpArgs({ tables: [table], outFile, source: conn }),
      { PGPASSWORD: conn.password }
    );
    expect(restoreDb.stderrGateDecision(result).pass).toBe(true);
    return result;
  }

  it('stderr-gated wrapper: a real pg_restore failure (relation renamed out from under the dump) is rejected via non-empty stderr, matching Spec 112 §9\'s "no stderr output is the pass condition" rule', async () => {
    await pool.query(`TRUNCATE public.${TABLE_A}`);
    await pool.query(`INSERT INTO public.${TABLE_A} (id, val) VALUES (1, 'x')`);

    const dumpPath = join(tmpdir(), `restore-infra-stderr-${Date.now()}.dump`);
    await dumpTable(TABLE_A, dumpPath);

    // Rename the table out from under the dump so pg_restore's data-load
    // statement targets a relation that no longer exists — a real binary
    // failure, not a synthetic stderrGateDecision() fixture.
    await pool.query(`ALTER TABLE public.${TABLE_A} RENAME TO _restore_infra_a_renamed`);
    try {
      const restoreResult = await restoreDb.spawnCapture(
        'pg_restore',
        restoreDb.buildPgRestoreArgs({ dumpPath, targetConnectionString: targetConnectionString() }),
        {}
      );
      const gate = restoreDb.stderrGateDecision(restoreResult);
      expect(gate.pass).toBe(false);
      expect(restoreResult.stderr.length).toBeGreaterThan(0);
    } finally {
      await pool.query(`ALTER TABLE public._restore_infra_a_renamed RENAME TO ${TABLE_A}`);
      unlinkSync(dumpPath);
    }
    // 30s timeout: spawns real pg_dump + pg_restore binaries — under full-suite
    // parallel load the 5s vitest default times out MID-TEST (observed
    // 2026-07-20), aborting between the rename and the rename-back finally and
    // cascading failures into the two tests below (missing-relation).
  }, 30_000);

  it('TOC preflight: a dump missing a scoped table is correctly flagged as not-covered by parseTocTables/checkTocCoversScope against REAL pg_restore --list output', async () => {
    await pool.query(`TRUNCATE public.${TABLE_A}, public.${TABLE_B}`);
    await pool.query(`INSERT INTO public.${TABLE_A} (id, val) VALUES (1, 'a')`);
    await pool.query(`INSERT INTO public.${TABLE_B} (id, val) VALUES (1, 'b')`);

    const dumpPath = join(tmpdir(), `restore-infra-toc-${Date.now()}.dump`);
    try {
      // Crafted minimal dump: only TABLE_A — simulating a stale or
      // wrong-scope dump handed to a restore that intends to touch both A
      // and B (restore-db.js's real run() would compute `tables` from the
      // source/target intersection, which here would include both).
      await dumpTable(TABLE_A, dumpPath);

      const listResult = await restoreDb.spawnCapture('pg_restore', ['--list', dumpPath], {});
      expect(listResult.exitCode).toBe(0);

      const toc = restoreDb.parseTocTables(listResult.stdout);
      const check = restoreDb.checkTocCoversScope(toc, [TABLE_A, TABLE_B]);
      expect(check.covered).toBe(false);
      expect(check.missing).toEqual([TABLE_B]);

      // A scope the dump DOES fully cover passes.
      expect(restoreDb.checkTocCoversScope(toc, [TABLE_A]).covered).toBe(true);

      // The real run() flow throws on this exact check BEFORE issuing any
      // TRUNCATE — assert TABLE_B's row is still present because nothing in
      // this test ever truncated it (mirroring "nothing was touched").
      const bRows = await pool.query(`SELECT count(*)::int AS n FROM public.${TABLE_B}`);
      expect(bRows.rows[0].n).toBe(1);
    } finally {
      unlinkSync(dumpPath);
    }
  }, 30_000);

  it('countTableRowsSafe (C1): a real count for an existing table, 0 for a missing relation, null (fail-closed) for a malformed probe', async () => {
    await pool.query(`TRUNCATE public.${TABLE_A}`);
    await pool.query(`INSERT INTO public.${TABLE_A} (id, val) VALUES (1, 'x'), (2, 'y')`);

    // existing relation → real count
    expect(await restoreDb.countTableRowsSafe(pool, `public.${TABLE_A}`)).toBe(2);
    // 42P01 undefined_table → genuinely absent, counts as 0 (a table that
    // does not exist cannot hold data — NOT the fail-open bug class)
    expect(await restoreDb.countTableRowsSafe(pool, 'public._restore_infra_definitely_absent')).toBe(0);
    // 3F000 invalid_schema_name → same
    expect(await restoreDb.countTableRowsSafe(pool, '_no_such_schema_.users')).toBe(0);
    // any OTHER probe failure (here: a syntax error) → null → the guard
    // FAILS CLOSED on it (the old code returned 0 here — the C1 CRITICAL)
    expect(await restoreDb.countTableRowsSafe(pool, 'public.broken syntax here')).toBeNull();
  }, 30_000);

  it('getAuthLinkedTables (C2): [] without an auth schema; derives exactly the FK-into-auth.users tables when one exists', async () => {
    // NEVER create/drop the auth schema when the harness DB already has one
    // (DATABASE_URL may point at a REAL local Supabase stack — destroying its
    // auth schema would be catastrophic). The full create-and-derive path runs
    // only on an auth-less harness DB (CI service container / testcontainer).
    const authSchemaExisted =
      ((await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'auth'`)).rowCount ?? 0) > 0;
    const before = await gatesLib.getAuthLinkedTables(pool);
    expect(before).not.toContain('_authlink_probe');

    if (authSchemaExisted) {
      // Real Supabase stack: just assert the derivation runs cleanly and
      // returns only public-table names (no schema qualifiers, no errors).
      expect(Array.isArray(before)).toBe(true);
      for (const t of before) expect(t).not.toContain('.');
      return;
    }

    // Auth-less harness: no auth schema → empty derivation, no error…
    expect(before).toEqual([]);
    // …then build a minimal auth.users + one linked table and assert the
    // derivation returns exactly the linked one (everything created here is
    // ours to drop — the schema did not exist).
    await pool.query(`CREATE SCHEMA auth`);
    try {
      await pool.query(`CREATE TABLE auth.users (id uuid PRIMARY KEY)`);
      await pool.query(
        `CREATE TABLE public._authlink_probe (id int PRIMARY KEY, user_id uuid REFERENCES auth.users(id))`
      );
      const linked = await gatesLib.getAuthLinkedTables(pool);
      expect(linked).toEqual(['_authlink_probe']);
      expect(linked).not.toContain(TABLE_A); // no FK → not derived
    } finally {
      await pool.query(`DROP TABLE IF EXISTS public._authlink_probe`);
      await pool.query(`DROP SCHEMA IF EXISTS auth CASCADE`);
    }
  }, 30_000);

  it('single-transaction atomicity: a restore that fails partway (PK violation on the 2nd row) leaves the target\'s pre-existing rows completely untouched', async () => {
    // Dump source state: two rows.
    await pool.query(`TRUNCATE public.${TABLE_A}`);
    await pool.query(`INSERT INTO public.${TABLE_A} (id, val) VALUES (1, 'row1'), (2, 'row2')`);

    const dumpPath = join(tmpdir(), `restore-infra-broken-${Date.now()}.dump`);
    await dumpTable(TABLE_A, dumpPath);

    try {
      // Mutate target to a state that WILL conflict: remove id=1 (so, absent
      // atomicity, the restore's insert of id=1 would succeed) but keep a
      // pre-existing id=2 row with a DIFFERENT value, forcing a PK violation
      // partway through the same table-data load statement.
      await pool.query(`DELETE FROM public.${TABLE_A} WHERE id = 1`);
      await pool.query(`UPDATE public.${TABLE_A} SET val = 'pre-existing' WHERE id = 2`);

      const restoreResult = await restoreDb.spawnCapture(
        'pg_restore',
        restoreDb.buildPgRestoreArgs({ dumpPath, targetConnectionString: targetConnectionString() }),
        {}
      );
      const gate = restoreDb.stderrGateDecision(restoreResult);
      expect(gate.pass).toBe(false); // PK violation -> failure, not a silent partial success

      // --single-transaction means the whole restore rolled back: id=1 must
      // NOT have been inserted (proving atomicity, not just "the row that
      // conflicted didn't land") and id=2 must be unchanged from its
      // pre-restore value.
      const rows = await pool.query(`SELECT id, val FROM public.${TABLE_A} ORDER BY id`);
      expect(rows.rows).toEqual([{ id: 2, val: 'pre-existing' }]);
    } finally {
      unlinkSync(dumpPath);
    }
  }, 30_000);
});
