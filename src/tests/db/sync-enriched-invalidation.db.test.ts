// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
//
// C7 Case C2 — `src/lib/sync/process.ts` status-writer invalidation for
// `enriched_status`. THE RED-FIRST PROOF for site 4 of 4
// (`.cursor/active_task.md` "C7 — WF2 PLAN v1" §"⚖ C7 PANEL VERDICTS + v2
// FOLD" item 1 — a LIVE fourth writer the plan's original scripts-only grep
// missed). Sites 1-3 (`load-permits.js`, `close-stale-permits.js` x2) are
// covered by `enriched-status-invalidation.db.test.ts`.
//
// `runSync()`'s "Changed permit" branch (process.ts:213-224) UPDATEs
// `permits.status` via its own hash check (computePermitHash over the whole
// raw record) with NO `enriched_status` term in the SET list — the same
// never-clobber-but-never-invalidate gap as the other three sites. This tool
// is exported via `runSync` and reachable from two live API routes
// (`/api/sync`, `/api/admin/sync`), so it is a real production writer, not
// dead legacy code.
//
// RECHARACTERIZED per fold-validation (a)/#4: this is a db-INTEGRATION test,
// not a fixture-pool unit test like the sibling file. `runSync(filePath)`
// takes NO pool argument — its connection is the `src/lib/db/client.ts`
// MODULE-LOAD-TIME singleton, resolved once via
// `resolveRuntimeConnectionString()` = `POSTGRES_URL || DATABASE_URL`.
// POSTGRES_URL OUTRANKS DATABASE_URL there (client.ts:34-56, Spec 113 §3 —
// the Vercel<->Supabase native integration alias). This test calls
// `runSync()`, which INSERTs into `permits`/`permit_trades`/`permit_history`/
// `sync_runs` and DELETEs from `permit_trades` on every "Changed" record — an
// ambient POSTGRES_URL (a leftover exported shell var, a loaded .env with a
// cloud connection string) would silently point every one of those writes at
// whatever POSTGRES_URL names. `POSTGRES_URL` is therefore explicitly deleted
// at MODULE SCOPE below, before this file's own imports of
// `./setup-testcontainer` finish evaluating and long before the dynamic
// import of `@/lib/sync/process` in `beforeAll` — the only point in this
// file where `client.ts`'s connection string is ever resolved.
//
// Reference tables (trades, trade_mapping_rules, permit_type_classifications)
// are NOT seeded by this file — they are populated by the ordinary migration
// seed data (`004_trades.sql`, `005_trade_mapping_rules.sql`,
// `118_realtor_trade.sql`, `120_permit_type_classifications.sql`) that
// `setup-testcontainer.ts` already applies to every fresh container via
// `scripts/migrate.js`. `sync_runs` is self-created by `runSync()`'s own
// INSERT; `permit_history`/`permit_trades` need no pre-seeding, only
// post-test cleanup (both FK to `permits(permit_num, revision_num)` —
// `permit_history` CASCADEs on permits delete per migration 109, but
// `permit_trades`' FK has no ON DELETE action, so it must be deleted first).
//
//   Case C2 — RED NOW, GREEN AFTER: seed an existing permit with
//   status='Inspection' + enriched_status set + a sentinel data_hash (so the
//   hash check always treats the fed record as Changed), feed runSync() a
//   record for the same PK with STATUS moved off 'Inspection'. Assert the
//   UPDATE moved status AND (post-fix) cleared enriched_status. Today
//   process.ts:213-224 has no enriched_status term at all — the column
//   survives. Spec 41:129 documents the invalidation as though it already
//   existed for ANY status-writer, including this one — it does not
//   (git-proven false-from-birth on the close-stale sites; this site was
//   never even in scope for that claim until this plan's fourth-writer find).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/sync-enriched-invalidation.db.test.ts --no-file-parallelism

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// ⛔ MUST run before ANY import that transitively touches src/lib/db/client.ts
// (module scope — before this file's other imports finish, and long before
// the dynamic import in beforeAll below). client.ts resolves its connection
// string exactly ONCE, at module-load time; deleting POSTGRES_URL here is
// what guarantees DATABASE_URL (the testcontainer/CI service container) wins
// instead of an ambient POSTGRES_URL a shell or .env might carry.
delete process.env.POSTGRES_URL;

const pool = getTestPool();
const FX = 'C7SYNC';

describe.skipIf(!dbAvailable())('src/lib/sync/process.ts runSync — enriched_status invalidation (C7 Case C2)', () => {
  if (!pool) {
    // C4 pattern: throw ONLY when opted in (a missing pool there is a real
    // defect, not the designed plain-mode skip).
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1/C4 pattern, verbatim rationale) ──
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to run against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'sync-enriched-invalidation.db.test.ts calls runSync(), which INSERTs into permits/' +
      'permit_trades/permit_history/sync_runs and DELETEs from permit_trades via the ' +
      'src/lib/db/client.ts singleton pool. Refusing to run without an explicit opt-in ' +
      '(BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient, because ' +
      'setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to run runSync() against non-loopback host "${dbUrl.hostname}".`);
  }
  if (dbUrl.pathname.length <= 1) {
    throw new Error(`DATABASE_URL has no database path: ${dbUrl.protocol}//${dbUrl.host}${dbUrl.pathname}`);
  }

  let runSync: (typeof import('@/lib/sync/process'))['runSync'];
  let clientPool: Pool | undefined;
  const createdSyncRunIds: number[] = [];

  beforeAll(async () => {
    // The ONLY point in this file either module is imported — AFTER the
    // module-scope POSTGRES_URL delete and the isolation guard above, BEFORE
    // any test body runs. client.ts's module-load-time connection string is
    // therefore resolved exactly once, against the pinned env.
    //
    // Explicit 60s timeout: process.ts's dependency graph pulls in the full
    // classification engine (src/lib/classification/classifier.ts and its
    // trade-vocab tables), which vitest/esbuild transforms cold on first
    // import — measured well past the 10s default hook timeout on this
    // machine, not a hang.
    const processMod = await import('@/lib/sync/process');
    runSync = processMod.runSync;
    const clientMod = await import('@/lib/db/client');
    clientPool = clientMod.pool;
  }, 60_000);

  async function clearFixtures(): Promise<void> {
    // FK order: permit_trades has no ON DELETE action against permits, so it
    // must go first. permit_history CASCADEs (migration 109) but deleting it
    // explicitly costs nothing and keeps this file's cleanup self-contained
    // rather than relying on a cascade defined elsewhere.
    await pool!.query(`DELETE FROM permit_trades WHERE permit_num LIKE $1`, [`${FX}%`]);
    await pool!.query(`DELETE FROM permit_history WHERE permit_num LIKE $1`, [`${FX}%`]);
    await pool!.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${FX}%`]);
    if (createdSyncRunIds.length > 0) {
      await pool!.query(`DELETE FROM sync_runs WHERE id = ANY($1::int[])`, [createdSyncRunIds]);
      createdSyncRunIds.length = 0;
    }
  }

  afterEach(clearFixtures);

  afterAll(async () => {
    if (!pool) return;
    await clearFixtures();
    await pool.end();
    // Teardown the client.ts singleton too, or vitest hangs on its open
    // handle after this file's tests complete (fold-validation "both pools"
    // requirement). Guarded — beforeAll may never have run if every test in
    // this describe block was skipped.
    if (clientPool) await clientPool.end().catch(() => {});
  });

  /** CKAN-shaped raw record — RawPermitRecord's uppercase field set. */
  function ckanRecord(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      PERMIT_NUM: '',
      REVISION_NUM: '00',
      PERMIT_TYPE: 'Building (Sfd, Sdd, Row)',
      STRUCTURE_TYPE: 'House (Sfd, Sdd, Row, Mobile)',
      WORK: 'Addition',
      STREET_NUM: '123',
      STREET_NAME: 'Test',
      STREET_TYPE: 'St',
      STREET_DIRECTION: '',
      CITY: 'TORONTO',
      POSTAL: 'M5V1A1',
      GEO_ID: '1',
      BUILDING_TYPE: 'House',
      CATEGORY: 'Building',
      APPLICATION_DATE: '2024-01-01',
      ISSUED_DATE: '',
      COMPLETED_DATE: '',
      STATUS: 'Inspection',
      DESCRIPTION: 'C7 Case C2 fixture permit',
      EST_CONST_COST: '10000',
      BUILDER_NAME: '',
      OWNER: '',
      DWELLING_UNITS_CREATED: '0',
      DWELLING_UNITS_LOST: '0',
      WARD: '01',
      COUNCIL_DISTRICT: '',
      CURRENT_USE: '',
      PROPOSED_USE: '',
      HOUSING_UNITS: '0',
      STOREYS: '1',
      ...overrides,
    };
  }

  it('Case C2 — runSync clears enriched_status when its Changed-permit UPDATE moves status off Inspection (RED until C7 lands)', async () => {
    const pn = `${FX}1`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_C2')`,
      [pn],
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c7-sync-'));
    const filePath = path.join(tmpDir, 'permits.json');
    let syncRun;
    try {
      fs.writeFileSync(filePath, JSON.stringify([ckanRecord({ PERMIT_NUM: pn, STATUS: 'Revision Issued' })]));
      syncRun = await runSync(filePath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    createdSyncRunIds.push(syncRun.id);

    expect(syncRun.status, `runSync did not complete cleanly: ${syncRun.error_message}`).toBe('completed');
    // Proves this went through the "Changed" branch (process.ts:209-275),
    // not "New" (existing was found: our seeded row) or "Unchanged" (the
    // sentinel data_hash never equals the real computed hash).
    expect(syncRun.records_updated, 'expected the Changed-permit branch to run exactly once').toBe(1);
    expect(syncRun.records_new).toBe(0);
    expect(syncRun.records_errors).toBe(0);

    const dbRow = await pool!.query(
      `SELECT status, enriched_status FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(dbRow.rows[0].status).toBe('Revision Issued');

    // THE red-first assertion. process.ts:213-224's UPDATE SET list has no
    // enriched_status term today — the column survives this status move
    // exactly as it does at the other three (now-fixed-elsewhere) sites.
    expect(
      dbRow.rows[0].enriched_status,
      'runSync must clear enriched_status when its Changed-permit branch moves status off Inspection.',
    ).toBeNull();
  }, 30_000);
});
