// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (max-build / massing passes)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (enrich_parcels step)
// SPEC LINK: migrations/240_phase_b_massing_watermark_and_pass3_scope.sql (D1'/D4' schema)
//
// B2 — D1' (massing watermark) + D4' (pass-3→pass-5 crash-safe scope hand-off) +
// the citywide-defer scenario + the comps/opt_aor zero-baseline audit rows + the
// geometry-change invalidation fence. BINDING:
// `.cursor/phase_b_active_task_INPROGRESS.md` "B0 ITEM 7" red-first suite table,
// AS AMENDED by "v6.1 CORRECTIONS" — most importantly:
//   B-1 (BLOCKING): every defer decision must be made BEFORE `withTransaction`
//     (pre-txn only) — an in-txn defer that commits pass 1's zoning watermark
//     before deferring would permanently hide those parcels from passes 2-4.
//     ⑦a therefore also asserts ZERO watermark stamps + ZERO scope rows written
//     by a deferring run.
//   S-2: the pass-5 consumed_at flip has no shared txn with the scope write
//     (autocommit 500-row batches) — work-before-stamp; ③ asserts that after a
//     simulated mid-stream crash, the unprocessed remainder's consumed_at
//     IS NULL (never flipped-before-stream).
//   X-5: ⑦a and ③ are UPGRADED to BEHAVIORAL reds via the C1 child-process
//     pattern — seed real state, spawn the REAL script, read the REAL DB/stdout
//     afterward. Every other case in this file stays lighter-weight (source-scan
//     or a direct SQL probe) because the plan does not require the child-process
//     upgrade for them, and a full child run has real preconditions (Spec 58 §9
//     zoning-producer contract + the neighbourhood_build_norms citywide backstop)
//     that would otherwise have to be re-justified per case for no diagnostic gain.
//
// Migration 240 objects verified present in migrations/ on this branch (git ls):
// parcels.massing_enriched_at, enrich_parcels_pass3_scope(run_id, parcel_id,
// consumed_at, created_at) — applied automatically by setup-testcontainer.ts's
// `node scripts/migrate.js` (001..NNN in order) before any test in this file runs.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/enrich-parcels-incremental.db.test.ts --no-file-parallelism

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/enrich-parcels.js');
const SCRIPT_SRC = () => fs.readFileSync(SCRIPT, 'utf8');

/** Fixture key prefix — every seeded row is deleted by prefix. */
const FX = 'B2INCR';
const FX_PARCEL_ID = (n: number) => `${FX}${n}`;

describe.skipIf(!dbAvailable())('enrich-parcels — B2 incremental (massing watermark + pass3 scope + defer)', () => {
  if (!pool) {
    // C1/C4 pattern: throw ONLY when opted in — a missing pool there is a real
    // defect, not the designed plain-mode skip.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1/C4/C7 pattern, verbatim rationale) ──
  // setup-testcontainer.ts:41-46 returns EARLY on an ambient DATABASE_URL before
  // ever consulting BUILDO_TEST_DB, so dbAvailable() alone does not prove this is
  // a disposable container. This suite spawns child processes that write parcels/
  // parcel_buildings/pipeline_runs/logic_variables and mutates enrich_parcels_pass3_scope
  // directly — refusing to run against anything but an explicit opt-in + loopback
  // host is what keeps a stray DATABASE_URL from pointing this at a real database.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn a child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'enrich-parcels-incremental.db.test.ts spawns scripts/enrich-parcels.js against a real pool, seeds ' +
      'parcels/parcel_buildings/pipeline_runs, and rewrites logic_variables. Refusing to run without an ' +
      'explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient, because ' +
      'setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to seed fixtures and spawn a mutating child against non-loopback host "${dbUrl.hostname}".`);
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
  // Global preconditions (Spec 58 §9/§11 producer contract + the optimal-config
  // citywide backstop) — required for ANY full child run of enrich-parcels.js to
  // reach its 5th pass instead of throwing during readZoningContract()/
  // enrichOptimalConfig()'s own precondition checks. Seeded once; idempotent
  // (ON CONFLICT / existence-checked), never torn down (harmless baseline state
  // other db.test.ts files in a full-suite run may also rely on).
  // ---------------------------------------------------------------------
  async function seedGlobalPreconditions(): Promise<void> {
    const zoningProducer = await pool!.query(
      `SELECT 1 FROM pipeline_runs WHERE pipeline = 'sources:load_zoning' AND status = 'completed'
         AND jsonb_typeof(records_meta -> 'zoning_layers_loaded') = 'object' LIMIT 1`,
    );
    if (zoningProducer.rowCount === 0) {
      await pool!.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_meta)
         VALUES ('sources:load_zoning', NOW() - interval '1 hour', NOW(), 'completed',
                 '{"zoning_layers_loaded": {"base": true}}'::jsonb)`,
      );
    }
    const backstop = await pool!.query(
      `SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all' LIMIT 1`,
    );
    if (backstop.rowCount === 0) {
      await pool!.query(
        `INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family) VALUES (NULL, 'all')`,
      );
    }
  }

  // Small, REALISTICALLY-SIZED polygon (~30m x 30m, a plausible urban lot) far out
  // in the Atlantic (nowhere near Toronto, so it can never intersect a real zoning
  // fixture) — guarantees a clean "gap" parcel (no zoning match) so pass 1 completes
  // cleanly. Degree-scale boxes like the sibling enrich-parcels.db.test.ts's
  // box(0,0,10,10) are fine for a single-pass (enrichParcels-only) test, but a FULL
  // main() run also exercises enrichExistingStructure/optimal-config, whose dimension
  // math (ST_XMax-ST_XMin etc., feeding DECIMAL columns) overflows on a ~1,110 km-wide
  // "parcel" — first found running this suite red-first (numeric field overflow at
  // enrich-parcels.js:961), fixed by shrinking to a real-world scale.
  function farBox(n: number): string {
    const x0 = -40 + n * 0.001;
    const y0 = 40 + n * 0.001;
    const d = 0.0003; // ~30m at this latitude
    return JSON.stringify({
      type: 'Polygon',
      coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]],
    });
  }

  async function insParcel(pid: string, geomJson: string | null): Promise<number> {
    const geomExpr = geomJson ? `ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326)` : 'NULL';
    const geometryExpr = geomJson ? `$2::jsonb` : 'NULL';
    const { rows } = await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ($1, 'TEST', ${geometryExpr}, ${geomExpr}) RETURNING id`,
      geomJson ? [pid, geomJson] : [pid],
    );
    return rows[0].id as number;
  }

  async function insBuildingFootprint(sourceId: string): Promise<number> {
    const { rows } = await pool!.query(
      `INSERT INTO building_footprints (source_id, geometry, footprint_area_sqm, estimated_stories, max_height_m)
       VALUES ($1, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'::jsonb, 100, 2, 6)
       RETURNING id`,
      [sourceId],
    );
    return rows[0].id as number;
  }

  async function linkParcelBuilding(parcelId: number, buildingId: number, linkedAt?: Date): Promise<void> {
    await pool!.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, linked_at)
       VALUES ($1, $2, true, COALESCE($3, NOW()))`,
      [parcelId, buildingId, linkedAt ?? null],
    );
  }

  async function clearFixtures(): Promise<void> {
    // Order matters: FKs point parcel_buildings -> parcels/building_footprints.
    await pool!.query(
      `DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE $1)`,
      [`${FX}%`],
    );
    await pool!.query(`DELETE FROM building_footprints WHERE source_id LIKE $1`, [`${FX}%`]);
    await pool!.query(
      `DELETE FROM enrich_parcels_pass3_scope WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE $1)`,
      [`${FX}%`],
    );
    await pool!.query(`DELETE FROM parcels WHERE parcel_id LIKE $1`, [`${FX}%`]);
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}:%`]);
  }

  const TOUCHED_LOGIC_VAR_KEYS = ['enrich_parcels_defer_threshold_rows'];
  let savedVars: Array<{ variable_key: string; variable_value: string }> = [];

  beforeAll(async () => {
    await seedGlobalPreconditions();
    const r = await pool!.query<{ variable_key: string; variable_value: string }>(
      `SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1::text[])`,
      [TOUCHED_LOGIC_VAR_KEYS],
    );
    savedVars = r.rows;
  });
  // 30s hook budget: clearFixtures deletes the ⑦a defer scenario's 1,001-row
  // set-based fixture; the default 10s hookTimeout cascaded timeouts through
  // sibling tests when the delete ran against a busy container (2026-08-14).
  beforeEach(clearFixtures, 30_000);
  afterEach(clearFixtures, 30_000);
  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM logic_variables WHERE variable_key = ANY($1::text[])`, [TOUCHED_LOGIC_VAR_KEYS]);
    if (savedVars.length > 0) {
      await pool.query(
        `INSERT INTO logic_variables (variable_key, variable_value, description)
         SELECT k, v, 'restored by B2 incremental test teardown'
           FROM unnest($1::text[], $2::numeric[]) AS t(k, v)`,
        [savedVars.map((v) => v.variable_key), savedVars.map((v) => v.variable_value)],
      );
    }
    await clearFixtures();
    await pool.end();
  });

  interface ChildResult {
    status: number | null;
    stdout: string;
    stderr: string;
    summary: { records_meta?: Record<string, unknown> } | null;
  }

  /**
   * ⑦a defer scenario: threshold at its LEGAL FLOOR (registry min 1000 — the
   * Zod schema mirrors it and FAILS LOUDLY below; the original threshold=1
   * fixture was structurally illegal) + 1,001 never-enriched parcels via one
   * set-based INSERT, scope 1,001 > 1,000. Called by ALL THREE ⑦a sub-tests —
   * clearFixtures runs between them, so each must reseed or its child runs the
   * FULL pipeline and times out (the 2026-08-14 cascade).
   */
  async function seedDeferScenario(): Promise<void> {
    await pool!.query(
      `INSERT INTO logic_variables (variable_key, variable_value, description)
       VALUES ('enrich_parcels_defer_threshold_rows', 1000, 'B2 incremental test seed — legal floor')
       ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value`,
    );
    await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       SELECT '${FX}DEFER' || gs::text, 'TEST',
              '{"type":"Polygon","coordinates":[[[0,0],[0.0003,0],[0.0003,0.0003],[0,0.0003],[0,0]]]}'::jsonb,
              ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[0,0],[0.0003,0],[0.0003,0.0003],[0,0.0003],[0,0]]]}'),4326)
       FROM generate_series(1, 1001) gs`,
    );
  }

  function runEnrichParcels(): ChildResult {
    const r = spawnSync('node', [SCRIPT], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
    const stdout = r.stdout ?? '';
    const line = stdout.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    let summary = null;
    if (line) {
      try { summary = JSON.parse(line.slice('PIPELINE_SUMMARY:'.length)); } catch { /* leave null */ }
    }
    return { status: r.status, stdout, stderr: r.stderr ?? '', summary };
  }

  // =========================================================================
  // ① — Massing gate NULL-arm / linked_at scope-builder (ⓔ, net-new export)
  // =========================================================================
  describe('① massing-scope predicate builder (ⓔ — net-new export, D1\')', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../scripts/enrich-parcels.js') as Record<string, unknown>;

    it(
      'enrich-parcels.js does not yet export a massing-scope predicate builder ' +
        '(export-absence IS the diagnostic; exact name UNDETERMINED pre-impl — guessed as ' +
        'buildMassingScopeWhere per the D1\' predicate `massing_enriched_at IS NULL OR ' +
        'EXISTS(SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND ' +
        'pb.linked_at > p.massing_enriched_at)` documented in migration 240\'s header comment)',
      () => {
        expect(typeof mod.buildMassingScopeWhere).toBe('function');
      },
    );

    const HAS = typeof mod.buildMassingScopeWhere === 'function';
    type ScopeBuilder = (opts: { full: boolean }) => string;

    it.skipIf(!HAS)('P1 — a parcel with massing_enriched_at IS NULL is IN scope (never-enriched first-run)', async () => {
      const buildMassingScopeWhere = mod.buildMassingScopeWhere as ScopeBuilder;
      const where = buildMassingScopeWhere({ full: false });
      const pid = await insParcel(FX_PARCEL_ID(1), farBox(1));
      const bid = await insBuildingFootprint(`${FX}BLDG1`);
      await linkParcelBuilding(pid, bid, new Date());
      const { rows } = await pool!.query(`SELECT p.id FROM parcels p WHERE p.id = $1 AND (${where})`, [pid]);
      expect(rows).toHaveLength(1);
    });

    it.skipIf(!HAS)('P2 — a parcel whose parcel_buildings.linked_at is NEWER than massing_enriched_at is IN scope', async () => {
      const buildMassingScopeWhere = mod.buildMassingScopeWhere as ScopeBuilder;
      const where = buildMassingScopeWhere({ full: false });
      const pid = await insParcel(FX_PARCEL_ID(2), farBox(2));
      await pool!.query(`UPDATE parcels SET massing_enriched_at = NOW() - interval '2 days' WHERE id = $1`, [pid]);
      const bid = await insBuildingFootprint(`${FX}BLDG2`);
      await linkParcelBuilding(pid, bid, new Date()); // linked_at = now, newer than the stamp
      const { rows } = await pool!.query(`SELECT p.id FROM parcels p WHERE p.id = $1 AND (${where})`, [pid]);
      expect(rows).toHaveLength(1);
    });

    it.skipIf(!HAS)('P3 — a parcel whose parcel_buildings.linked_at is OLDER than massing_enriched_at is OUT of scope', async () => {
      const buildMassingScopeWhere = mod.buildMassingScopeWhere as ScopeBuilder;
      const where = buildMassingScopeWhere({ full: false });
      const pid = await insParcel(FX_PARCEL_ID(3), farBox(3));
      const bid = await insBuildingFootprint(`${FX}BLDG3`);
      await linkParcelBuilding(pid, bid, new Date(Date.now() - 5 * 24 * 3600 * 1000)); // linked 5 days ago
      await pool!.query(`UPDATE parcels SET massing_enriched_at = NOW() WHERE id = $1`, [pid]); // stamped AFTER
      const { rows } = await pool!.query(`SELECT p.id FROM parcels p WHERE p.id = $1 AND (${where})`, [pid]);
      expect(rows).toHaveLength(0);
    });

    it.skipIf(!HAS)('--full ignores the watermark entirely (scope = TRUE-equivalent)', async () => {
      const buildMassingScopeWhere = mod.buildMassingScopeWhere as ScopeBuilder;
      const where = buildMassingScopeWhere({ full: true });
      const pid = await insParcel(FX_PARCEL_ID(4), farBox(4));
      await pool!.query(`UPDATE parcels SET massing_enriched_at = NOW() WHERE id = $1`, [pid]);
      const { rows } = await pool!.query(`SELECT p.id FROM parcels p WHERE p.id = $1 AND (${where})`, [pid]);
      expect(rows).toHaveLength(1);
    });
  });

  // =========================================================================
  // ② — Zero-link ghost WARN row (✓red, row-absence via source-scan)
  // =========================================================================
  describe('② zero-link ghost WARN row (✓red — row-absence)', () => {
    it(
      'no audit metric names a zero-link ("ghost") parcel today — the D1\' backfill comment documents ' +
        'day-one value 0 (measured) as forward-looking, but no code emits the row at all (row-absence, ' +
        'not a value check — a full-run assertion on auditRows would be a weaker proof of the SAME fact)',
      () => {
        expect(SCRIPT_SRC()).toMatch(/massing_zero_link_ghost|zero_link_ghost/);
      },
    );
  });

  // =========================================================================
  // ③ — Scope cascade (BEHAVIORAL RED, child-process pattern per v6.1 X-5)
  // =========================================================================
  describe('③ scope cascade — crashed run\'s unconsumed rows unioned by the next run (BEHAVIORAL RED)', () => {
    it(
      'a prior run\'s unconsumed enrich_parcels_pass3_scope rows are consumed (consumed_at set) by the ' +
        'NEXT completing run — RED TODAY (nothing in enrich-parcels.js reads or writes this table at all)',
      async () => {
        // "Run A" — crashed, leaving unconsumed scope rows for a real parcel.
        const pid = await insParcel(FX_PARCEL_ID(10), farBox(10));
        const crashedRun = await pool!.query(
          `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status)
           VALUES ('${FX}:enrich_parcels', NOW() - interval '1 hour', NOW() - interval '55 minutes', 'failed')
           RETURNING id`,
        );
        const runAId = crashedRun.rows[0].id as number;
        await pool!.query(
          `INSERT INTO enrich_parcels_pass3_scope (run_id, parcel_id, consumed_at) VALUES ($1, $2, NULL)`,
          [runAId, pid],
        );

        // "Run B" — the real script, spawned fresh, must complete cleanly.
        const r = runEnrichParcels();
        expect(r.status, `enrich-parcels.js child did not exit 0.\nstderr:\n${r.stderr}`).toBe(0);

        const after = await pool!.query(
          `SELECT consumed_at FROM enrich_parcels_pass3_scope WHERE run_id = $1 AND parcel_id = $2`,
          [runAId, pid],
        );
        expect(after.rows).toHaveLength(1);
        // THE red-first assertion. Today pass 5 never reads enrich_parcels_pass3_scope
        // at all, so this row is never touched — consumed_at stays NULL forever.
        expect(
          after.rows[0].consumed_at,
          'run A\'s scope row should have been unioned into run B\'s pass 5 and marked consumed — it was not (D4\' not yet wired).',
        ).not.toBeNull();
      },
      60_000,
    );

    it(
      'post-impl lock — the pass-5 recovery read targets "consumed_at IS NULL" (S-2: work-before-stamp, ' +
        'never flip-before-stream — a mid-stream crash must leave the unprocessed remainder NULL). ' +
        'RED TODAY: the clause does not exist anywhere in the file yet.',
      () => {
        expect(SCRIPT_SRC()).toMatch(/consumed_at IS NULL/);
      },
    );

    it(
      'g/b — enrich_parcels_pass3_scope is a LOGGED table (not UNLOGGED), so a crash-recovery scan can ' +
        'trust it survived (migration 240 comment: an UNLOGGED table is truncated on crash recovery, ' +
        'destroying exactly the unconsumed-scope evidence this table exists to preserve)',
      async () => {
        const { rows } = await pool!.query(
          `SELECT relpersistence FROM pg_class WHERE relname = 'enrich_parcels_pass3_scope'`,
        );
        expect(rows[0]?.relpersistence).toBe('p'); // 'p' = permanent/logged, 'u' = unlogged
      },
    );
  });

  // =========================================================================
  // ④ — Decision-scope keyed on linked_at (✓red/ⓔ — resolves at impl)
  // =========================================================================
  describe('④ decision-scope keyed on linked_at (ⓔ — resolves at impl; exact mechanism UNDETERMINED pre-B2)', () => {
    // D4′ (active_task.md / phase_b doc) names "linked_at-keyed decision scope" without
    // pinning which pass it governs or the export name. The plan itself marks this case
    // "resolve at impl" — meaning its own red-first classification (✓red vs ⓔ) is not yet
    // decidable. Treated here as ⓔ (the conservative reading: no such export exists today
    // under ANY plausible name), so export-absence is the diagnostic, exactly as it is for
    // case ①. A late-backfilled decision_date (on a coa_applications/permits row) must
    // still be caught by a scope keyed on linked_at rather than decision_date directly —
    // that is the invariant this export must eventually prove; it cannot be proven against
    // code that does not exist.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../scripts/enrich-parcels.js') as Record<string, unknown>;

    it(
      'a decision-scope predicate builder should be exported under one of its plausible names — RED TODAY ' +
        '(consistent with case ①\'s convention: the desired post-impl truth is asserted directly, so absence ' +
        'reds rather than passing vacuously on a negative check)',
      () => {
        const plausibleNames = ['buildDecisionScopeWhere', 'buildDecisionScopePredicate', 'decisionScopeWhere'];
        const found = plausibleNames.filter((n) => typeof mod[n] === 'function');
        expect(found.length, `expected one of ${plausibleNames.join(', ')} to exist; found: ${JSON.stringify(found)}`).toBeGreaterThan(0);
      },
    );
  });

  // =========================================================================
  // ⑤ — (covered in run-chain-defer.logic.test.ts — enrich-parcels.js:1378 is a
  // pure source-scan, no DB needed; not duplicated here.)
  // =========================================================================

  // =========================================================================
  // ⑥ — opt_aor_without_max_gfa zero-baseline row (✓red, row-absence via source-scan)
  // =========================================================================
  describe('⑥ opt_aor_without_max_gfa zero-baseline row (✓red — row-absence)', () => {
    it(
      'no audit metric names the opt_aor_without_max_gfa invariant today (B0 item 4\'s measured 0/437,305 ' +
        'companion check — "opt_aor_gfa_sqm IS NOT NULL AND max_buildable_gfa_sqm IS NULL" — is ruled to ' +
        'SHIP as a new gated zero-baseline audit row in B2; row-absence proven the same way as case ②)',
      () => {
        expect(SCRIPT_SRC()).toMatch(/opt_aor_without_max_gfa/);
      },
    );

    it('g/b — the underlying invariant predicate is not accidentally already covered by a differently-named row', () => {
      // Guards against a false green: if some OTHER row already encodes the exact
      // predicate under a different name, the ⓔ finding above would be misleading.
      const src = SCRIPT_SRC();
      expect(src).not.toMatch(/opt_aor_gfa_sqm IS NOT NULL AND.*max_buildable_gfa_sqm IS NULL/);
    });
  });

  // =========================================================================
  // ⑦a — Citywide scope → clean defer marker (BEHAVIORAL RED, child-process)
  // =========================================================================
  describe('⑦a citywide-scope defer marker (BEHAVIORAL RED, child-process pattern per v6.1 X-5)', () => {
    it(
      'a scope that exceeds a (seeded, low) pass-scope threshold produces a clean defer marker ' +
        '{step, scope_count, threshold, ratio} on stdout and the child exits 0 — RED TODAY (no defer ' +
        'mechanism exists; the marker never appears, and the child simply runs the full normal pipeline)',
      async () => {
        // Seed the threshold at its LEGAL FLOOR. The registry bounds
        // (seeds/logic_variables.json: min 1000, max 500000) are mirrored by
        // enrich-parcels.js's Zod schema, which FAILS LOUDLY on out-of-bounds
        // operator overrides — the original fixture's threshold=1 was therefore
        // structurally illegal (the child crashed at validation, never reaching
        // the defer check). Fixture corrected 2026-08-14: floor threshold +
        // a generate_series scope that exceeds it.
        await seedDeferScenario();

        const r = runEnrichParcels();
        expect(r.status, `enrich-parcels.js child did not exit 0.\nstderr:\n${r.stderr}`).toBe(0);

        const meta = r.summary?.records_meta as Record<string, unknown> | undefined;
        const auditRows =
          (meta?.audit_table as { rows?: Array<{ metric: string; value: unknown }> } | undefined)?.rows ?? [];
        // THE red-first assertion. Search both records_meta (a top-level defer_marker /
        // step_completeness.deferred_at key) and the audit rows for ANY trace of a defer
        // decision — today there is none, under any shape.
        const hasDeferMarker =
          meta != null &&
          (JSON.stringify(meta).includes('deferred_to_full') ||
            JSON.stringify(meta).includes('scope_count') ||
            auditRows.some((row) => String(row.metric).includes('defer')));
        expect(
          hasDeferMarker,
          `expected a defer marker {step, scope_count, threshold, ratio} somewhere in records_meta; ` +
            `got: ${JSON.stringify(meta)}`,
        ).toBe(true);
      },
      60_000,
    );

    it(
      'B-1 pin, asserted on the SAME scenario as the primary red above — zero watermark stamps are ' +
        'written by a deferring run (pre-txn defer decisions only; passes 2-4 must never see a partially ' +
        'stamped pass-1 watermark). Holds VACUOUSLY today (nothing stamps massing_enriched_at at all yet) ' +
        '— documented as a post-impl lock, not evidence of correct defer behavior today.',
      async () => {
        await seedDeferScenario(); // clearFixtures wiped the primary's — reseed or the child full-runs
        const pid = await insParcel(FX_PARCEL_ID(30), farBox(30));
        const bid = await insBuildingFootprint(`${FX}BLDG30`);
        await linkParcelBuilding(pid, bid, new Date());

        const r = runEnrichParcels();
        expect(r.status).toBe(0);

        const after = await pool!.query(`SELECT massing_enriched_at FROM parcels WHERE id = $1`, [pid]);
        expect(after.rows[0].massing_enriched_at).toBeNull();
      },
      60_000,
    );

    it(
      'B-1 pin — zero enrich_parcels_pass3_scope rows are written by a deferring run. ' +
        'Holds VACUOUSLY today for the same reason as the watermark check above.',
      async () => {
        await seedDeferScenario(); // clearFixtures wiped the primary's — reseed or the child full-runs
        const pid = await insParcel(FX_PARCEL_ID(31), farBox(31));
        const bid = await insBuildingFootprint(`${FX}BLDG31`);
        await linkParcelBuilding(pid, bid, new Date());

        const before = await pool!.query(`SELECT count(*)::int AS n FROM enrich_parcels_pass3_scope`);
        const r = runEnrichParcels();
        expect(r.status).toBe(0);
        const after = await pool!.query(`SELECT count(*)::int AS n FROM enrich_parcels_pass3_scope`);
        expect(after.rows[0].n).toBe(before.rows[0].n);
      },
      60_000,
    );
  });

  // =========================================================================
  // ⑨ — Geometry-change NULLs the massing stamp (✓red — column exists, no fence writes it)
  // =========================================================================
  describe('⑨ geometry-change invalidates massing_enriched_at (✓red)', () => {
    it(
      'a parcel geometry change nulls massing_enriched_at — RED TODAY (the column exists per migration ' +
        '240 but is written ONLY by that migration\'s one-time backfill; no loader, trigger, or fence ' +
        'anywhere touches it in response to a geometry change)',
      async () => {
        const pid = await insParcel(FX_PARCEL_ID(40), farBox(40));
        await pool!.query(`UPDATE parcels SET massing_enriched_at = NOW() WHERE id = $1`, [pid]);
        const before = await pool!.query(`SELECT massing_enriched_at FROM parcels WHERE id = $1`, [pid]);
        expect(before.rows[0].massing_enriched_at).not.toBeNull();

        // The geometry-change event, in its most literal form: the parcel's own geom moves.
        await pool!.query(
          `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb WHERE id = $1`,
          [pid, farBox(41)],
        );

        const after = await pool!.query(`SELECT massing_enriched_at FROM parcels WHERE id = $1`, [pid]);
        // THE red-first assertion — a bare UPDATE has no trigger/fence behind it today,
        // so the stamp survives unchanged.
        expect(
          after.rows[0].massing_enriched_at,
          'a parcel geometry change should invalidate (NULL) the massing watermark — it did not (no fence exists yet).',
        ).toBeNull();
      },
    );

    it('g/b — the column itself exists and accepts NULL (migration 240 landed; no schema gap)', async () => {
      const { rows } = await pool!.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'massing_enriched_at'`,
      );
      expect(rows[0]?.is_nullable).toBe('YES');
    });
  });
});
