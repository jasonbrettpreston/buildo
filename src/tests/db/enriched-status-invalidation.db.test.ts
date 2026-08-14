// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
//
// C7 — status-writer invalidation for `enriched_status`. THE RED-FIRST PROOF
// for sites 1-3 of 4 (`.cursor/active_task.md` "C7 — WF2 PLAN v1" as amended
// by the "⚖ v2 FOLD" + "✅ FOLD-VALIDATION ROUND" blocks — those supersede the
// v1 text). Site 4 (`src/lib/sync/process.ts`) is a separate db-INTEGRATION
// test — see `sync-enriched-invalidation.db.test.ts`.
//
// The mechanism: `load-permits.js:357` `status = EXCLUDED.status` (inside a
// hash-guarded `DO UPDATE ... WHERE permits.data_hash IS DISTINCT FROM
// EXCLUDED.data_hash`) moves a permit's `status` while `enriched_status`
// (deliberately absent from the SET list — `classify-permit-phase.js:10-12`'s
// documented never-clobber fence) stays whatever the AIC scraper last wrote.
// `close-stale-permits.js` has TWO more `permits.status` UPDATE sites that
// were missed by every prior pass: `:127-134` (`-> Pending Closed` for rows
// that left the feed) and `:145-152` (`Pending Closed -> Closed` after
// `pending_closed_grace_days`) — table-wide UPDATEs with no `enriched_status`
// term at all. Spec 41 `:129` documents this AS IF it already clears
// `enriched_status` — git-proven false-from-birth (arrived `2bdcb429`, 4 days
// post-script, zero `enriched_status` hits in close-stale's entire history).
//
// The rule the fix enforces (not yet landed — this file is red-first):
// `enriched_status = CASE WHEN <new status> IS DISTINCT FROM 'Inspection'
// THEN NULL ELSE <old value> END` at every basis-mover. `IS DISTINCT FROM`
// is mandatory, not `<>` — `permits.status` is nullable (2 live NULL rows)
// and `<>` evaluates to UNKNOWN against NULL, silently falling through to
// the ELSE (preserve) branch forever. Case D pins this.
//
// This file spawns the REAL scripts as child processes against TODAY'S
// code — no refactor, no import of a not-yet-existing CASE expression. A
// pure-function test cannot be the red-first proof here either, for the same
// reason the C1/C4 headers give: pre-fix it would fail on a missing export
// (the incidental-failure trap), not on the behaviour.
//
//   Case A          — loader status MOVE off Inspection: RED NOW, GREEN AFTER.
//   Case B sub-1     — loader never-clobber fence, single genuine DO UPDATE
//                       with EXCLUDED.status='Inspection': GREEN NOW AND AFTER.
//   Case B sub-2/E-main — loader identical-payload replay (hash-guard SKIP,
//                       0 rows via the guarded UPDATE): GREEN NOW AND AFTER.
//   Case C          — close-stale-permits, BOTH sites (:127-134 AND
//                       :145-152) asserted in one run: RED NOW, GREEN AFTER.
//   Case D          — NULL incoming status: RED NOW (pins IS DISTINCT FROM
//                       over the naive `<>`), GREEN AFTER.
//   Case E-variant   — a status-MOVE payload run twice: pass 2 is a genuine
//                       hash-guard skip (idempotency, not the invalidation
//                       rule itself): GREEN NOW AND AFTER.
//   Case F          — C3's drift predicate (`status IS DISTINCT FROM
//                       'Inspection' AND enriched_status IS NOT NULL`) reads
//                       0 over the fixtures Case F itself moved: RED NOW,
//                       GREEN AFTER. Stated ceiling: proves the predicate
//                       over 2 scoped rows, not a full assert-global-coverage
//                       run and not that the nightly WARN row retires.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/enriched-status-invalidation.db.test.ts --no-file-parallelism

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT_LOADER = path.join(REPO_ROOT, 'scripts/load-permits.js');
const SCRIPT_CLOSE_STALE = path.join(REPO_ROOT, 'scripts/close-stale-permits.js');

/** Fixture key prefix — every seeded permits row is deleted by prefix. */
const FX = 'C7ENR';

describe.skipIf(!dbAvailable())('load-permits / close-stale-permits — enriched_status invalidation (C7 sites 1-3)', () => {
  if (!pool) {
    // C4 pattern: throw ONLY when opted in (a missing pool there is a real
    // defect, not the designed plain-mode skip).
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1/C4 pattern, verbatim rationale) ──
  // setup-testcontainer.ts:41-46 returns EARLY on an ambient DATABASE_URL
  // before ever consulting BUILDO_TEST_DB, so dbAvailable() alone does not
  // prove this is a disposable container. This suite spawns child processes
  // that write permits/pipeline_runs/logic_variables — refusing to run
  // against anything but an explicit opt-in + loopback host is what keeps a
  // stray DATABASE_URL from pointing this at a real database.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn a child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'enriched-status-invalidation.db.test.ts spawns load-permits.js / close-stale-permits.js ' +
      'against a real pool and rewrites logic_variables. Refusing to run without an explicit ' +
      'opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient, because ' +
      'setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to seed fixtures and spawn mutating children against non-loopback host "${dbUrl.hostname}".`);
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

  // ---------------------------------------------------------------------
  // Fixture builder — CKAN-shaped raw record (mapRecord, load-permits.js
  // :142-192). Every field load-permits.js's CRITICAL_FIELDS names
  // (PERMIT_NUM, REVISION_NUM, STREET_NUM, STREET_NAME, RESIDENTIAL) is
  // populated even though the --file path's own abort check (:244-251) only
  // runs inside fetchFromCKAN, not this local-file branch — the plan's
  // invocation ruling states the requirement as a fidelity floor for the
  // CKAN shape, not a proven abort site in this mode, so we hold to it
  // rather than relying on the narrower guarantee.
  // ---------------------------------------------------------------------
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
      DESCRIPTION: 'C7 fixture permit',
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
      RESIDENTIAL: '100',
      INTERIOR_ALTERATIONS: '',
      ASSEMBLY: '',
      INSTITUTIONAL: '',
      MERCANTILE: '',
      INDUSTRIAL: '',
      BUSINESS_AND_PERSONAL_SERVICES: '',
      ...overrides,
    };
  }

  interface LoaderAuditRow { metric: string; value: unknown; threshold: string | null; status: string; }
  interface LoaderRunResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    verdict: string | null;
    auditRows: LoaderAuditRow[];
  }

  /**
   * Spawn the REAL loader against a temp CKAN-shaped `--file`. Every seed
   * row in this suite is inserted with a sentinel `data_hash` that can never
   * equal a real sha256 digest, so the FIRST loader pass against any payload
   * always clears the hash guard and genuinely executes the DO UPDATE — the
   * mechanism Case B sub-1 and the first pass of every two-pass case rely on.
   */
  function runLoader(records: Record<string, string>[]): LoaderRunResult {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c7-loader-'));
    const filePath = path.join(tmpDir, 'permits.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(records));
      const r = spawnSync('node', [SCRIPT_LOADER, '--file', filePath], {
        env: childEnv as NodeJS.ProcessEnv,
        encoding: 'utf8',
        timeout: 45_000,
        maxBuffer: 32 * 1024 * 1024,
      });
      expect(r.error, `loader child failed to run/complete: ${r.error?.message}`).toBeUndefined();
      const stdout = r.stdout ?? '';
      // Last summary line — a lock-not-acquired SKIP path can print a second
      // one (C1 precedent).
      const line = stdout.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
      const summary = line ? JSON.parse(line.slice('PIPELINE_SUMMARY:'.length)) : null;
      const audit = summary?.records_meta?.audit_table ?? null;
      return {
        exitCode: r.status,
        stdout,
        stderr: r.stderr ?? '',
        verdict: audit?.verdict ?? null,
        auditRows: audit?.rows ?? [],
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  interface ScriptRunResult { exitCode: number | null; stdout: string; stderr: string; }

  /**
   * Spawn the REAL close-stale-permits.js. NOTE: unlike load-permits.js,
   * this script has NO `require.main === module` guard — its top-level
   * `pipeline.run(...)` fires at require time, so a module-route (requiring
   * it in-process) is not available; child-process is the only option
   * (Q4 invocation ruling).
   */
  function runCloseStale(): ScriptRunResult {
    const r = spawnSync('node', [SCRIPT_CLOSE_STALE], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(r.error, `close-stale child failed to run/complete: ${r.error?.message}`).toBeUndefined();
    return { exitCode: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  // ---------------------------------------------------------------------
  // logic_variables is GLOBAL state shared by every db.test.ts file in the
  // run (C1 lesson). close-stale-permits.js Zod-requires BOTH
  // `stale_closure_abort_pct` and `pending_closed_grace_days`
  // (close-stale-permits.js:31-34) — snapshot + restore both.
  // ---------------------------------------------------------------------
  const CLOSE_STALE_KEYS = ['stale_closure_abort_pct', 'pending_closed_grace_days'];
  let savedVars: Array<{ variable_key: string; variable_value: string }> = [];
  const createdPipelineRunIds: number[] = [];

  beforeAll(async () => {
    const r = await pool!.query<{ variable_key: string; variable_value: string }>(
      `SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1::text[])`,
      [CLOSE_STALE_KEYS],
    );
    savedVars = r.rows;
  });

  async function setCloseStaleVars(vars: Record<string, number>): Promise<void> {
    const keys = Object.keys(vars);
    await pool!.query(
      `INSERT INTO logic_variables (variable_key, variable_value, description)
       SELECT k, v, 'C7 enriched-status-invalidation test seed'
         FROM unnest($1::text[], $2::numeric[]) AS t(k, v)
       ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value`,
      [keys, keys.map((k) => vars[k])],
    );
  }

  async function clearFixtures(): Promise<void> {
    await pool!.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${FX}%`]);
    if (createdPipelineRunIds.length > 0) {
      await pool!.query(`DELETE FROM pipeline_runs WHERE id = ANY($1::int[])`, [createdPipelineRunIds]);
      createdPipelineRunIds.length = 0;
    }
  }

  beforeEach(clearFixtures);
  afterEach(clearFixtures);

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM logic_variables WHERE variable_key = ANY($1::text[])`, [CLOSE_STALE_KEYS]);
    if (savedVars.length > 0) {
      await pool.query(
        `INSERT INTO logic_variables (variable_key, variable_value, description)
         SELECT k, v, 'restored by C7 enriched-status-invalidation test teardown'
           FROM unnest($1::text[], $2::numeric[]) AS t(k, v)`,
        [savedVars.map((v) => v.variable_key), savedVars.map((v) => v.variable_value)],
      );
    }
    await clearFixtures();
    await pool.end();
  });

  // =====================================================================
  // Case A — loader status MOVE off Inspection
  // =====================================================================
  it('Case A — loader upsert clears enriched_status on a status MOVE off Inspection (RED until C7 lands)', async () => {
    const pn = `${FX}A1`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_A1')`,
      [pn],
    );

    const r = runLoader([ckanRecord({ PERMIT_NUM: pn, STATUS: 'Revision Issued' })]);
    expect(r.exitCode, `loader child did not exit cleanly.\nstderr:\n${r.stderr}`).toBe(0);
    expect(
      r.auditRows.find((x) => x.metric === 'records_updated')?.value,
      'the DO UPDATE must genuinely have fired (seed data_hash differs from the real computed hash)',
    ).toBe(1);

    const dbRow = await pool!.query(
      `SELECT status, enriched_status FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(dbRow.rows[0].status).toBe('Revision Issued');

    // THE red-first assertion. Today load-permits.js:357's SET list has no
    // enriched_status term at all — the column survives every status move.
    expect(
      dbRow.rows[0].enriched_status,
      'enriched_status must be cleared when status moves off Inspection — today it survives untouched.',
    ).toBeNull();
  }, 30_000);

  // =====================================================================
  // Case B sub-1 — never-clobber fence, single genuine DO UPDATE
  // =====================================================================
  it('Case B sub-1 — never-clobber fence: a genuine DO UPDATE with EXCLUDED.status=Inspection preserves enriched_status (GREEN now AND after)', async () => {
    const pn = `${FX}B1`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash, description)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_B1', 'old description')`,
      [pn],
    );

    const r = runLoader([ckanRecord({ PERMIT_NUM: pn, STATUS: 'Inspection', DESCRIPTION: 'changed description' })]);
    expect(r.exitCode, `loader child did not exit cleanly.\nstderr:\n${r.stderr}`).toBe(0);
    expect(
      r.auditRows.find((x) => x.metric === 'records_updated')?.value,
      'DO UPDATE must genuinely fire — a NON-status hashed field (description) changed against the dummy seed hash',
    ).toBe(1);

    const dbRow = await pool!.query(
      `SELECT status, enriched_status, description FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(dbRow.rows[0].status).toBe('Inspection');
    // Proves the DO UPDATE genuinely wrote this row (not a hash-guard skip).
    expect(dbRow.rows[0].description).toBe('changed description');

    // The fence: EXCLUDED.status === 'Inspection' -> preserved, both today
    // (the column is simply absent from the SET list) and post-fix (the
    // CASE's ELSE branch returns permits.enriched_status unchanged).
    expect(dbRow.rows[0].enriched_status).toBe('Active Inspection');
  }, 30_000);

  // =====================================================================
  // Case B sub-2 / E-main — identical-payload replay: hash-guard skip
  // =====================================================================
  it('Case B sub-2 / E-main — identical-payload replay: hash-guard skip, 0 rows via the guarded UPDATE, enriched_status preserved (GREEN now AND after)', async () => {
    const pn = `${FX}B2`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_B2')`,
      [pn],
    );
    const record = ckanRecord({ PERMIT_NUM: pn, STATUS: 'Inspection' });

    const r1 = runLoader([record]);
    expect(r1.exitCode, `pass 1: loader child did not exit cleanly.\nstderr:\n${r1.stderr}`).toBe(0);
    expect(
      r1.auditRows.find((x) => x.metric === 'records_updated')?.value,
      'pass 1 must genuinely update — dummy seed hash never equals the real computed hash',
    ).toBe(1);

    const afterPass1 = await pool!.query(
      `SELECT enriched_status, data_hash FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(afterPass1.rows[0].enriched_status).toBe('Active Inspection');

    // Pass 2 — the SAME record object, re-serialised fresh. Because pass 1
    // wrote data_hash = computeHash(mapRecord(record)) for real, pass 2's
    // EXCLUDED.data_hash is byte-identical to what's now in the row — the
    // WHERE guard fails and the DO UPDATE genuinely touches 0 rows.
    const r2 = runLoader([record]);
    expect(r2.exitCode, `pass 2: loader child did not exit cleanly.\nstderr:\n${r2.stderr}`).toBe(0);
    expect(
      r2.auditRows.find((x) => x.metric === 'records_updated')?.value,
      'an identical-payload replay must affect 0 rows via the guarded UPDATE',
    ).toBe(0);
    expect(r2.auditRows.find((x) => x.metric === 'records_unchanged')?.value).toBe(1);

    const afterPass2 = await pool!.query(
      `SELECT status, enriched_status, data_hash FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(afterPass2.rows[0].status).toBe('Inspection');
    expect(
      afterPass2.rows[0].enriched_status,
      'a guard-skip pass touches neither status nor enriched_status',
    ).toBe('Active Inspection');
    expect(afterPass2.rows[0].data_hash).toBe(afterPass1.rows[0].data_hash);
  }, 30_000);

  // =====================================================================
  // Case C — close-stale-permits, BOTH sites
  // =====================================================================
  it('Case C — close-stale-permits clears enriched_status at BOTH status-writer sites (RED until C7 lands)', async () => {
    const pnSite1 = `${FX}C1`; // Inspection -> Pending Closed (:127-134)
    const pnSite2 = `${FX}C2`; // Pending Closed -> Closed (:145-152)

    // The cutoff row close-stale-permits.js:50-56 reads (most recent
    // 'completed' permits load). Our own row is guaranteed most-recent —
    // nothing else in this fresh container writes a pipeline_runs row for
    // 'permits:permits'/'permits' with a later started_at. Cleaned up by id
    // in afterEach.
    const cutoffRes = await pool!.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status) VALUES ('permits:permits', NOW(), 'completed') RETURNING id, started_at`,
    );
    createdPipelineRunIds.push(cutoffRes.rows[0].id);
    const cutoff = cutoffRes.rows[0].started_at;

    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash, last_seen_at, completed_date)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_C1', $2::timestamptz - INTERVAL '1 day', NULL)`,
      [pnSite1, cutoff],
    );
    // Already Pending Closed (bypasses site 1's WHERE status NOT IN
    // ('Pending Closed','Closed')) with a completed_date far past any
    // reasonable grace period, so ONLY site 2 fires for this row.
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash, last_seen_at, completed_date)
       VALUES ($1, '00', 'Pending Closed', 'Active Inspection', 'FXSEED_DUMMY_HASH_C2', NOW(), NOW() - INTERVAL '30 days')`,
      [pnSite2],
    );

    // abortPct absurdly high — this container's whole permits table holds
    // only our 2 fixture rows (+ whatever residue a prior test in this same
    // file left, itself scoped by the FX prefix and cleared by beforeEach);
    // the safety guard is not under test here. grace_days small so
    // pnSite2's 30-day-old completed_date is unambiguously past it.
    await setCloseStaleVars({ stale_closure_abort_pct: 100000, pending_closed_grace_days: 3 });

    const r = runCloseStale();
    expect(r.exitCode, `close-stale child did not exit cleanly.\nstderr:\n${r.stderr}`).toBe(0);

    const rows = await pool!.query(
      `SELECT permit_num, status, enriched_status FROM permits WHERE permit_num = ANY($1::text[]) ORDER BY permit_num`,
      [[pnSite1, pnSite2]],
    );
    const bySite1 = rows.rows.find((x) => x.permit_num === pnSite1);
    const bySite2 = rows.rows.find((x) => x.permit_num === pnSite2);

    expect(bySite1?.status, 'site 1 (:127-134) must move Inspection -> Pending Closed').toBe('Pending Closed');
    expect(bySite2?.status, 'site 2 (:145-152) must promote Pending Closed -> Closed past the grace period').toBe('Closed');

    // THE red-first assertions — BOTH sites, per the fold's "both sites
    // asserted" ruling. Pre-fix, close-stale-permits.js never touches
    // enriched_status at either site; Spec 41:129 documents this AS IF it
    // already happened — it does not (see this file's header).
    expect(bySite1?.enriched_status, 'site 1 must clear enriched_status when it moves the permit off Inspection').toBeNull();
    expect(bySite2?.enriched_status, 'site 2 must clear enriched_status too (defense-in-depth, lessons :30)').toBeNull();
  }, 30_000);

  // =====================================================================
  // Case D — NULL incoming status (IS DISTINCT FROM discriminator)
  // =====================================================================
  it('Case D — NULL incoming status clears enriched_status via IS DISTINCT FROM, not <> (RED until C7 lands)', async () => {
    const pn = `${FX}D1`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_D1')`,
      [pn],
    );

    // STATUS omitted entirely -> mapRecord(): `raw.STATUS || null` ->
    // mapped.status = null (matches the 2 live NULL-status permits cited in
    // the plan's evidence base).
    const record = ckanRecord({ PERMIT_NUM: pn });
    delete (record as Record<string, string | undefined>).STATUS;

    const r = runLoader([record]);
    expect(r.exitCode, `loader child did not exit cleanly.\nstderr:\n${r.stderr}`).toBe(0);
    expect(r.auditRows.find((x) => x.metric === 'records_updated')?.value).toBe(1);

    const dbRow = await pool!.query(
      `SELECT status, enriched_status FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(dbRow.rows[0].status).toBeNull();

    // THE red-first assertion — pins IS DISTINCT FROM over the naive `<>`.
    // `NULL <> 'Inspection'` evaluates to UNKNOWN, which a CASE WHEN
    // treats as false, silently falling to the ELSE (preserve) branch
    // forever on any NULL-status row. `NULL IS DISTINCT FROM 'Inspection'`
    // is TRUE, which is the correct clear.
    expect(
      dbRow.rows[0].enriched_status,
      'a NULL incoming status must be treated as "not Inspection" and clear enriched_status.',
    ).toBeNull();
  }, 30_000);

  // =====================================================================
  // Case E-variant — status-MOVE payload run twice (CASE-level idempotency)
  // =====================================================================
  it('Case E-variant — a status-move upsert run TWICE: pass 2 is a genuine hash-guard skip (GREEN now AND after)', async () => {
    const pn = `${FX}E1`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       VALUES ($1, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_E1')`,
      [pn],
    );
    const record = ckanRecord({ PERMIT_NUM: pn, STATUS: 'Revision Issued' });

    const r1 = runLoader([record]);
    expect(r1.exitCode, `pass 1: loader child did not exit cleanly.\nstderr:\n${r1.stderr}`).toBe(0);
    expect(r1.auditRows.find((x) => x.metric === 'records_updated')?.value).toBe(1);

    const afterPass1 = await pool!.query(
      `SELECT status, enriched_status, data_hash FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(afterPass1.rows[0].status).toBe('Revision Issued');
    // Deliberately NOT asserted to a literal here — that claim belongs to
    // Case A. This test's job is the idempotency invariant: whatever pass 1
    // leaves behind, an identical pass 2 must not change it, true both
    // BEFORE and AFTER C7 lands (the WHERE guard this proves is untouched
    // by the fix — only the SET list's CASE term is new).
    const enrichedAfterPass1 = afterPass1.rows[0].enriched_status;

    const r2 = runLoader([record]);
    expect(r2.exitCode, `pass 2: loader child did not exit cleanly.\nstderr:\n${r2.stderr}`).toBe(0);
    expect(
      r2.auditRows.find((x) => x.metric === 'records_updated')?.value,
      'a byte-identical status-move payload run twice must affect 0 rows on the SECOND pass',
    ).toBe(0);

    const afterPass2 = await pool!.query(
      `SELECT status, enriched_status, data_hash FROM permits WHERE permit_num=$1 AND revision_num='00'`,
      [pn],
    );
    expect(afterPass2.rows[0].status).toBe('Revision Issued');
    expect(afterPass2.rows[0].enriched_status).toBe(enrichedAfterPass1);
    expect(afterPass2.rows[0].data_hash).toBe(afterPass1.rows[0].data_hash);
    // NOT asserted: last_seen_at / updated_at byte-identity. Both are
    // touched UNCONDITIONALLY on every batch pass regardless of the hash
    // guard — the always-touch last_seen_at UPDATE (load-permits.js
    // :386-403) and migration 115's unscoped `set_updated_at` trigger (fires
    // on ANY UPDATE, including that always-touch one). Asserting they stay
    // fixed across passes would be the incidental-failure trap this plan's
    // Case E correction explicitly warns against.
  }, 30_000);

  // =====================================================================
  // Case F — C3's drift predicate reads 0 over the moved fixtures
  // =====================================================================
  it('Case F — the drift predicate (status IS DISTINCT FROM Inspection AND enriched_status NOT NULL) reads 0 over fixtures this case moved (RED until C7 lands)', async () => {
    const pn1 = `${FX}F1`;
    const pn2 = `${FX}F2`;
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, status, enriched_status, data_hash)
       SELECT x.pn, '00', 'Inspection', 'Active Inspection', 'FXSEED_DUMMY_HASH_F'
         FROM unnest($1::text[]) AS x(pn)`,
      [[pn1, pn2]],
    );

    const r = runLoader([
      ckanRecord({ PERMIT_NUM: pn1, STATUS: 'Permit Issued' }),
      ckanRecord({ PERMIT_NUM: pn2, STATUS: 'Closed' }),
    ]);
    expect(r.exitCode, `loader child did not exit cleanly.\nstderr:\n${r.stderr}`).toBe(0);
    expect(r.auditRows.find((x) => x.metric === 'records_updated')?.value).toBe(2);

    // C3's own drift predicate (backfill-smeared-enriched-status.js /
    // assert-global-coverage.js §4.9), scoped to this case's fixture prefix
    // only. Stated ceiling: this proves the fix's structural NULL satisfies
    // the SAME query the nightly WARN row reads over 2 rows — it does not
    // run a full assert-global-coverage pass and does not prove the WARN
    // row itself retires (that needs the next real chain_permits run).
    const drift = await pool!.query(
      `SELECT count(*)::int AS n FROM permits
        WHERE permit_num LIKE $1
          AND enriched_status IS NOT NULL
          AND status IS DISTINCT FROM 'Inspection'`,
      [`${FX}F%`],
    );

    // THE red-first assertion.
    expect(
      Number(drift.rows[0].n),
      'the drift predicate must read 0 across every fixture row this case moved off Inspection.',
    ).toBe(0);
  }, 30_000);
});
