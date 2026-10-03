#!/usr/bin/env node
/**
 * massing-cohort-differential — the batch-2 row 3.6 committed forced-change cohort
 * differential (Folder SF-5 / Spec 124 R-AS), the massing analogue of
 * scripts/analysis/compute-parcel-cost-cohort-differential.js and
 * scripts/analysis/enrich-heritage-cohort-differential.js.
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2;
 *            docs/specs/01-pipeline/124_step_standard_policy.md R-AS
 *
 * --derive commits docs/reports/golden/massing/forced/cohort.json: a deterministic
 *   sample of building_footprints rows picked ONLY so that its perturbation is a
 *   valid R-AS forced change:
 *     D = 200 since 2026-10-02 (operator ruling; was 500 per fold SF-5 — only 227 rows
 *         qualified after link_massing run 2184).
 *     D = 200 rows that (a) are referenced by NO parcel_buildings row (so the
 *         DELETE cannot hit parcel_buildings' FK to building_footprints.id, which
 *         has NO cascade), (b) have a stored geom byte-identical to a fresh legacy
 *         re-derivation, (c) have both areas equal to that re-derivation, and
 *         (d) are ST_IsValid. (b)/(c) are Fold SF-5 (2026-09-24): 13 / 10 / 1 of
 *         the plan's raw unreferenced sample carry geom / sqft / sqm drift, and a
 *         re-insert of a drifted row cannot return the table hash to BASELINE.
 *     U = 200 rows with a non-null max_height_m (perturbed +1, which also forces
 *         estimated_stories), not in D.
 *     E = 50 rows with a non-null elev_z, not in D ∪ U (perturbed +1 — the M-D4
 *         witness: elev_z is NOT in the legacy guard, so a legacy run leaves it
 *         at +1 and only the script's restore bracket can put it back).
 *     negative_control = every NOT ST_IsValid(geom) row (expect 17; asserted).
 *   --exclude=<probe json> drops, from D/U/E, every source_id that the resolver can
 *   find in the P-M probe (probe.duplicate_key_groups[].source_id, nested groups,
 *   probe.missing_lat_or_lng_ids), so M-D3 cross-batch self-overwrite churn cannot
 *   move the differential's counters for reasons unrelated to the conversion.
 *   ONLY `SELECT`s run (inside one READ ONLY txn) — --derive never writes.
 *
 * --run --side=pre|post --step=<script> --out=<capture json> applies the committed
 *   perturbation, spawns the LEGACY or CONVERTED step through the capture harness
 *   (capture-step-golden.js, --step=<script>), and asserts the R-AS claims against
 *   the harness summary:
 *     (i)   records_new   === |D|
 *     (ii)  records_updated >= |U|   (legacy: |U| + M-D3 churn; converted: |U|)
 *     (iii) every E row is still elev_z +1 (M-D4 witness) — then restored sideways
 *           from the before-image, because legacy cannot repair it
 *     (iv)  the negative-control hash is unchanged
 *     (v)   the table hash returns to cohort.baseline_hash exactly
 *   Restore is UNCONDITIONAL: the `finally` bracket re-inserts every D row still
 *   missing (from the full-column before-image, `id`/`created_at` included), resets
 *   the U and E columns, re-hashes, prints `restored: true|false`, and sets
 *   process.exitCode = 1 on any failed assertion or unrestored state. No
 *   `process.exit()` — the pool is closed first.
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; resolve-db refuses unsafe
 * targets and, per its own contract, no `PG_*` env is read directly here):
 *   node -r dotenv/config scripts/analysis/massing-cohort-differential.js --help
 *   node -r dotenv/config scripts/analysis/massing-cohort-differential.js --derive [--exclude=<probe.json>]
 *   node -r dotenv/config scripts/analysis/massing-cohort-differential.js --run --side=pre --step=scripts/load-massing.js --out=docs/reports/golden/massing/forced/pre.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/massing/forced/cohort.json');
const TABLE = 'building_footprints';
const PK = 'source_id';

// The capture harness's NARROW path for this table (427,077 rows × 11 projected cols
// = 4.7M cells < WIDE_TABLE_CELL_THRESHOLD 10M — capture-step-golden.js:221-231,475-487
// hashes `md5(string_agg(ROW(<projection>)::text, '|' ORDER BY <order>))`).
// PROJ MUST equal the projection the capture is run with, or the two hashes are not
// comparable. Keep the cell count under the threshold if this ever grows.
const PROJ = [
  'source_id', 'geometry', 'footprint_area_sqm', 'footprint_area_sqft', 'max_height_m',
  'min_height_m', 'elev_z', 'estimated_stories', 'centroid_lat', 'centroid_lng', 'geom',
];
const HASH_SQL = `SELECT md5(string_agg(ROW(${PROJ.join(', ')})::text, '|' ORDER BY ${PK})) AS h FROM ${TABLE}`;
const NEG_SQL = `SELECT md5(string_agg(ROW(${PROJ.join(', ')})::text, '|' ORDER BY ${PK})) AS h
                   FROM ${TABLE} WHERE NOT ST_IsValid(geom)`;

// The legacy geom/area expression, verbatim from scripts/load-massing.js (S7/S8): the
// 3857 GeoJSON re-projected to 4326, and the geodesic area at the legacy 2-dp scale.
const LEGACY_GEOM = `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)`;
const LEGACY_AREA = `ROUND(ST_Area((${LEGACY_GEOM})::geography)::numeric, 2)`;
const LEGACY_AREA_FT = `ROUND((ST_Area((${LEGACY_GEOM})::geography) * 10.7639104167)::numeric, 2)`;

const SIDES = ['pre', 'post'];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`massing-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor exemption
  // (src/tests/resolve-db.logic.test.ts); this read/restore harness has no reason to run below it.
  return createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
}

function parseArgs(argv) {
  const out = { derive: false, run: false, exclude: null, side: null, step: 'scripts/load-massing.js', out: null };
  for (const a of argv) {
    if (a === '--derive') out.derive = true;
    else if (a === '--run') out.run = true;
    else if (a.startsWith('--exclude=')) out.exclude = a.slice('--exclude='.length);
    else if (a.startsWith('--side=')) out.side = a.slice('--side='.length);
    else if (a.startsWith('--step=')) out.step = a.slice('--step='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
  }
  return out;
}

/** Resolve a repo-relative path against REPO_ROOT (absolute paths pass through). */
function resolveRepoPath(p) {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

function quoteLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Query (optionally parameterized) on a dedicated client inside `BEGIN READ ONLY` — --derive can never write. */
async function readOnlyQuery(pool, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(text, params);
    await client.query('ROLLBACK');
    return res.rows;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw e;
  } finally {
    client.release();
  }
}

/** source_id values grouped by the duplicate-key groups of a P-M probe JSON. Pure. */
function excludedIds(probe, what) {
  const ids = new Set();
  const seen = new Set();
  const visit = (v) => {
    if (v == null) return;
    if (typeof v === 'string') { ids.add(v); return; }
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (typeof v === 'object') {
      if (seen.has(v)) return;
      seen.add(v);
      if (typeof v.source_id === 'string') ids.add(v.source_id);
      for (const [k, sub] of Object.entries(v)) {
        if (k === 'source_id' || k === 'key') continue;
        if (k.toLowerCase().includes('duplicate')) visit(sub);
      }
    }
  };
  visit(probe);
  if (probe && Array.isArray(probe.missing_lat_or_lng_ids)) visit(probe.missing_lat_or_lng_ids);
  console.log(`[differential] --exclude ${what}: dropping ${ids.size} source_id(s) from D/U/E`);
  return ids;
}

function baseWhere(extra) {
  return `FROM ${TABLE} bf WHERE ${extra}`;
}

function clamp(rows, n) {
  return rows.map((r) => r[PK]).slice(0, n);
}

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive(args) {
  const pool = makePool('massing-cohort-differential:derive');
  try {
    const excludeSet = new Set();
    if (args.exclude) {
      const probePath = resolveRepoPath(args.exclude);
      const probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
      for (const id of excludedIds(probe, probePath)) excludeSet.add(id);
    }

    // The "unreferenced" half is its OWN predicate (not ANDed into dPredicate): MEASURED 2026-09-24,
    // a single query ANDing it with the geom/area drift-free checks below makes Postgres estimate
    // near-zero selectivity for the whole compound predicate (ST_AsBinary equality on a recomputed
    // ST_Transform has no usable statistics) and pick a full-table Filter scan — cost ~27.5M units,
    // >10 minutes wall-clock, confirmed via EXPLAIN and a live run terminated after 13+ min. Splitting
    // it in two lets each half use its own index: the LEFT JOIN anti-pattern below is index-backed
    // (idx_parcel_buildings_building, ~9,392 rows, MEASURED <1s) and the expensive geometry
    // re-derivation then runs ONLY over that small candidate set via `source_id = ANY($1)` (another
    // indexed lookup, MEASURED <1s) — both steps combined MEASURED ~1.1s total.
    const dPredicate = [
      `ST_AsBinary(bf.geom) = ST_AsBinary(${LEGACY_GEOM})`,
      `bf.footprint_area_sqm = ${LEGACY_AREA}`,
      `bf.footprint_area_sqft = ${LEGACY_AREA_FT}`,
      `ST_IsValid(bf.geom)`,
      `bf.geom IS NOT NULL`,
    ].join(' AND ');
    const uPredicate = `bf.max_height_m IS NOT NULL AND ST_IsValid(bf.geom)`;
    const ePredicate = `bf.elev_z IS NOT NULL AND ST_IsValid(bf.geom)`;

    const baseline = (await readOnlyQuery(pool, HASH_SQL))[0].h;
    const unreferenced = await readOnlyQuery(
      pool,
      `SELECT bf.${PK} FROM ${TABLE} bf LEFT JOIN parcel_buildings pb ON pb.building_id = bf.id
         WHERE pb.building_id IS NULL ORDER BY bf.${PK}`,
    );
    const unreferencedIds = unreferenced.map((r) => r[PK]);
    console.log(`[differential] unreferenced building_footprints rows: ${unreferencedIds.length}`);
    const d = (
      await readOnlyQuery(
        pool,
        `SELECT bf.${PK} ${baseWhere(`bf.${PK} = ANY($1::text[]) AND ${dPredicate}`)} ORDER BY bf.${PK} LIMIT 900`,
        [unreferencedIds],
      )
    ).filter((r) => !excludeSet.has(r[PK]));
    // D/U/E MUST stay disjoint, or the DELETE and a +1 UPDATE fight over the same row. Each later
    // set therefore excludes against the ALREADY-CLAMPED members of the earlier ones (never the
    // pre-clamp tail), and every set excludes the --exclude ids (M-D3 churn).
    const dIds = new Set(clamp(d, 200));
    const u = (await readOnlyQuery(pool, `SELECT bf.${PK} ${baseWhere(uPredicate)} ORDER BY bf.${PK} LIMIT 900`))
      .filter((r) => !excludeSet.has(r[PK]) && !dIds.has(r[PK]));
    const uIds = new Set(clamp(u, 200));
    const e = (await readOnlyQuery(pool, `SELECT bf.${PK} ${baseWhere(ePredicate)} ORDER BY bf.${PK} LIMIT 400`))
      .filter((r) => !excludeSet.has(r[PK]) && !dIds.has(r[PK]) && !uIds.has(r[PK]));
    const negative = (await readOnlyQuery(pool, `SELECT bf.${PK} ${baseWhere('NOT ST_IsValid(bf.geom)')} ORDER BY bf.${PK}`))
      .map((r) => r[PK]);

    if (negative.length !== 17) throw new Error(`negative control is ${negative.length} rows, expected 17 (NOT ST_IsValid(geom))`);
    if (d.length < 200) throw new Error(`only ${d.length} drift-free unreferenced rows qualify for D (need 200)`);
    if (u.length < 200) throw new Error(`only ${u.length} rows qualify for U (need 200)`);
    if (e.length < 50) throw new Error(`only ${e.length} rows qualify for E (need 50)`);

    const cohort = {
      generated_at: new Date().toISOString(),
      predicates: {
        hash: HASH_SQL,
        negative_control: NEG_SQL,
        D: `DELETE ... WHERE ${PK} IN (D) — selected by: (unreferenced, i.e. NOT EXISTS a parcel_buildings row) AND ${dPredicate}`,
        U: `UPDATE ... SET max_height_m = max_height_m + 1 WHERE ${PK} IN (U) — selected by: ${uPredicate}`,
        E: `UPDATE ... SET elev_z = elev_z + 1 WHERE ${PK} IN (E) — selected by: ${ePredicate}`,
        legacy_area: LEGACY_AREA,
        legacy_geom: LEGACY_GEOM,
        exclude: args.exclude ? `P-M probe duplicate-key groups from ${args.exclude}` : null,
      },
      D: clamp(d, 200),
      U: clamp(u, 200),
      E: clamp(e, 50),
      negative_control: negative,
      baseline_hash: baseline,
    };
    fs.mkdirSync(path.dirname(COHORT_PATH), { recursive: true });
    fs.writeFileSync(COHORT_PATH, JSON.stringify(cohort, null, 2) + '\n');
    console.log(`[differential] cohort written: ${COHORT_PATH}`);
    console.log(`[differential]   D=${cohort.D.length} U=${cohort.U.length} E=${cohort.E.length} negative_control=${negative.length}`);
    console.log(`[differential]   baseline_hash=${baseline}`);
  } finally {
    await pool.end();
  }
}

// ── --run ────────────────────────────────────────────────────────────────────
async function run(args) {
  if (!SIDES.includes(args.side)) throw new Error(`--side must be one of ${SIDES.join('|')}, got ${JSON.stringify(args.side)}`);
  if (!args.out) throw new Error('--run requires --out=<capture json>');

  const pool = makePool(`massing-cohort-differential:${args.side}`);
  const cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
  const d = cohort.D, u = cohort.U, e = cohort.E, neg = cohort.negative_control;
  console.log(`[differential:${args.side}] cohort loaded: D=${d.length} U=${u.length} E=${e.length} negative-control=${neg.length}`);

  const baseline = cohort.baseline_hash;
  const now = (await pool.query(HASH_SQL)).rows[0].h;
  if (now !== baseline) {
    throw new Error(`refusing to run: current table hash ${now} !== cohort.baseline_hash ${baseline} — re-derive (--derive) first`);
  }
  console.log(`[differential:${args.side}] BASELINE hash confirmed: ${baseline}`);

  // Before-image for the restore bracket: EVERY column of every D ∪ U ∪ E row,
  // through the json -> text path (jsonb/text[]/timestamp columns come back in a
  // re-queryable form, so the insert below restores them byte-for-byte).
  const before = (
    await pool.query(
      `SELECT row_to_json(t)::text AS j FROM ${TABLE} t
        WHERE ${PK} = ANY($1::text[]) ORDER BY ${PK}`,
      [[...d, ...u, ...e]],
    )
  ).rows.map((r) => JSON.parse(r.j));
  console.log(`[differential:${args.side}] dumped ${before.length} before-image rows (restore material, in-memory only)`);

  const negBefore = (await pool.query(NEG_SQL)).rows[0].h;

  async function restoreAndVerify() {
    const client = await pool.connect();
    let restored = false;
    const dSet = new Set(d), uSet = new Set(u), eSet = new Set(e);
    try {
      await client.query('BEGIN');
      // 1. Reconcile every D row against the before-image: re-insert the missing, and correct
      //    the geometry-keyed row an insert-only step may have re-added with drifted content.
      //    ON CONFLICT (source_id) makes this idempotent whichever arm applies.
      const missing = before.filter((r) => dSet.has(r[PK]));
      for (const r of missing) {
        const cols = Object.keys(r);
        await client.query(
          `INSERT INTO ${TABLE} (${cols.join(', ')}) OVERRIDING SYSTEM VALUE
             VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
           ON CONFLICT (${PK}) DO UPDATE SET
             ${cols.filter((c) => c !== PK && c !== 'id').map((c) => `${c}=EXCLUDED.${c}`).join(', ')}`,
          cols.map((c) => r[c]),
        );
      }
      // 2. Reset the perturbed columns of U (height + stories) and E (elev_z).
      const uBefore = before.filter((r) => uSet.has(r[PK]));
      for (const r of uBefore) {
        await client.query(
          `UPDATE ${TABLE} SET max_height_m=$2, estimated_stories=$3 WHERE ${PK}=$1`,
          [r[PK], r.max_height_m, r.estimated_stories],
        );
      }
      const eBefore = before.filter((r) => eSet.has(r[PK]));
      for (const r of eBefore) {
        await client.query(`UPDATE ${TABLE} SET elev_z=$2 WHERE ${PK}=$1`, [r[PK], r.elev_z]);
      }
      await client.query('COMMIT');
      const after = (await pool.query(HASH_SQL)).rows[0].h;
      const negAfter = (await pool.query(NEG_SQL)).rows[0].h;
      restored = after === baseline && negAfter === negBefore;
      console.log(`[differential:${args.side}] restore: reconciled ${missing.length} D row(s), reset ${uBefore.length} U + ${eBefore.length} E row(s)`);
      console.log(`[differential:${args.side}] POST-RESTORE hash: ${after} ${after === baseline ? '(baseline OK)' : '(BASELINE MISMATCH)'}`);
      console.log(`[differential:${args.side}] negative-control hash: ${negAfter} ${negAfter === negBefore ? '(unchanged)' : '(CHANGED)'}`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
      console.error(`[differential:${args.side}] RESTORE FAILED: ${err.message}`);
    } finally {
      client.release();
    }
    return restored;
  }

  let asserted = false;
  let restored = false;
  try {
    // COMMIT the perturbation — D DELETEd, U height+1 (stories follow), E elev_z+1.
    await pool.query(`DELETE FROM ${TABLE} WHERE ${PK} = ANY($1::text[])`, [d]);
    await pool.query(`UPDATE ${TABLE} SET max_height_m = max_height_m + 1, estimated_stories = GREATEST(1, ROUND((max_height_m + 1) / 3.0)) WHERE ${PK} = ANY($1::text[])`, [u]);
    await pool.query(`UPDATE ${TABLE} SET elev_z = elev_z + 1 WHERE ${PK} = ANY($1::text[])`, [e]);
    const perturbed = (await pool.query(HASH_SQL)).rows[0].h;
    console.log(`[differential:${args.side}] PERTURBED hash: ${perturbed}`);
    if (perturbed === baseline) throw new Error('perturbation did not change the hash — void differential');

    // Spawn the REAL step through the capture harness, exactly as the PRE/POST goldens are taken.
    const stepPath = path.relative(REPO_ROOT, resolveRepoPath(args.step)) || args.step;
    const argv = [
      '-r', 'dotenv/config', 'scripts/analysis/capture-step-golden.js',
      `--step=${stepPath}`, '--chain=sources', `--out=${resolveRepoPath(args.out)}`,
      `--tables=${TABLE}`, `--table-columns=${TABLE}:${PROJ.join(',')}`, `--table-order=${TABLE}:${PK}`,
    ];
    console.log(`[differential:${args.side}] running the real step: node ${argv.join(' ')}`);
    const out = execFileSync('node', argv, {
      cwd: REPO_ROOT,
      env: { ...process.env, PIPELINE_CHAIN: 'sources' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    // The FIRST summary is the run under test. A POST capture path (golden/<slug>/post/*.json)
    // makes the harness run the step a SECOND time (the two-run zero-writes proof, conversion-
    // simplification item 7), whose summary reads 0/0 by design; `.pop()` read that second run
    // and failed a genuine 500/200 forced run (measured 2026-09-28, row 3.6 ②) — D lowered to 200 by operator ruling 2026-10-02 (227 qualify after run 2184).
    const summaryLine = out.split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
    if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in the harness output');
    const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
    console.log(`[differential:${args.side}] RUN records_new=${summary.records_new} (expect ${d.length}), ` +
      `records_updated=${summary.records_updated} (expect >= ${u.length}; legacy = U + M-D3 churn, converted = U)`);

    const eAfter = await pool.query(`SELECT ${PK}, elev_z FROM ${TABLE} WHERE ${PK} = ANY($1::text[])`, [e]);
    const beforeById = new Map(before.map((r) => [r[PK], r]));
    // elev_z is a `numeric` column: node-pg returns it as a STRING here (precision-preserving
    // default) while `before` came through row_to_json()->JSON.parse, which yields a JS NUMBER —
    // a bare `===` between the two types would always be false regardless of the real values
    // (MEASURED 2026-09-24: this comparison silently returned kept=0/50 on every run, a false
    // M-D4 reproduction, until both sides were coerced with Number() here).
    const kept = eAfter.rows.filter((r) => {
      const b = beforeById.get(r[PK]);
      return b !== undefined && Number(b.elev_z) + 1 === Number(r.elev_z);
    }).length;
    console.log(`[differential:${args.side}] M-D4 witness: ${kept}/${e.length} E rows still elev_z + 1 after the run (elev_z is not in the legacy guard)`);

    // NOT compared to `baseline` here: by design (M-D4), the run cannot self-heal the E rows'
    // elev_z+1, so a genuinely correct run's post-run hash NEVER equals baseline as long as
    // kept === e.length (the very thing the M-D4 witness above just confirmed). The captured
    // `forced/pre.json`/`forced/post.json` hashes carry this SAME E+1 state "by design" (plan
    // §7 R-AS) and are compared to EACH OTHER at commit ②, never to `baseline`. Post-RESTORE
    // (below, in the always-run `finally`) is the only place a baseline-equality check belongs.
    const after = (await pool.query(HASH_SQL)).rows[0].h;
    const negAfter = (await pool.query(NEG_SQL)).rows[0].h;
    console.log(`[differential:${args.side}] POST-RUN hash: ${after} (baseline was ${baseline}; NOT expected to match — E rows carry +1 by design until restore)`);

    asserted = summary.records_new === d.length
      && summary.records_updated >= u.length
      && kept === e.length
      && negAfter === negBefore;
    console.log(asserted ? '[differential] PASS' : '[differential] FAIL');
  } catch (err) {
    console.error(`[differential:${args.side}] ERROR: ${err.message}`);
  } finally {
    restored = await restoreAndVerify();
    console.log(`[differential:${args.side}] restored: ${restored}`);
    if (!asserted || !restored) process.exitCode = 1;
    await pool.end();
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const HELP = `massing-cohort-differential — massing (batch-2 row 3.6) R-AS forced-change cohort differential

Usage:
  node -r dotenv/config scripts/analysis/massing-cohort-differential.js --derive [--exclude=<probe.json>]
  node -r dotenv/config scripts/analysis/massing-cohort-differential.js --run --side=pre|post \\
      [--step=scripts/load-massing.js] --out=<capture json>

  --derive   SELECT-only (READ ONLY txn). Writes ${path.relative(REPO_ROOT, COHORT_PATH)}:
             D=${'{200}'} unreferenced, geom/area drift-free, valid rows (Fold SF-5);
             U=200 max_height_m rows (+1, forces stories); E=50 elev_z rows (+1, M-D4 witness);
             negative_control = every NOT ST_IsValid(geom) row (asserted 17); baseline_hash.
             --exclude drops the P-M probe's duplicate-key group source_ids (M-D3 churn) from D/U/E.
  --run      Requires a committed cohort whose baseline_hash still matches the table. Deletes D,
             updates U/E in ONE committed txn, spawns a real legacy-or-converted run through
             capture-step-golden.js, then asserts R-AS (i)-(v). Restore is unconditional and
             reported as restored: true|false.
  --help     This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv);
  if (args.derive) return derive(args);
  if (args.run) return run(args);
  throw new Error('nothing to do: pass --derive or --run (see --help)');
}

main().catch((err) => {
  console.error('[differential] ERROR:', err.message);
  process.exitCode = process.exitCode || 1;
});
