#!/usr/bin/env node
/**
 * neighbourhoods-cohort-differential — the batch-2 row 3.8 committed forced-change
 * cohort differential (Fold CF-5/CF-6 / Spec 124 R-AS), the neighbourhoods
 * analogue of scripts/analysis/massing-cohort-differential.js and
 * scripts/analysis/enrich-heritage-cohort-differential.js.
 * SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md;
 *            docs/specs/01-pipeline/124_step_standard_policy.md R-AS
 *
 * --derive commits docs/reports/golden/neighbourhoods/forced/cohort.json: a
 *   deterministic sample of neighbourhoods rows picked ONLY so that its
 *   perturbation is a valid R-AS forced change:
 *     I = 5 rows whose neighbourhood_id is SHIFTED (+100000). The FKs from
 *         permits (ON DELETE SET NULL, 240,947 linked), neighbourhood_build_norms
 *         (CASCADE, 452) and neighbourhood_storey_norms all reference
 *         `neighbourhoods.id`, NEVER `neighbourhood_id` — so the shift orphans
 *         nothing, and no PRE-EXISTING row is ever deleted (a DELETE of one would
 *         fire SET NULL on real permits). The only DELETE is the restore's, of the
 *         rows the step itself inserted, after proving no FK references them. The loader
 *         then INSERTs 5 new rows and the legacy INSERT arm leaves their `geom`
 *         NULL (N-D1 — the ONE declared POST diff).
 *     N = 5 rows whose `name` is perturbed (`name || ' ~'`) — the legacy guard
 *         names `name`, so BOTH paths must heal the column.
 *     G = 5 rows whose `geometry` (jsonb) AND `geom` are translated 1e-4 deg —
 *         the jsonb and the WKB stay consistent, so the guard fires on both
 *         columns and both paths rewrite both.
 *     C = 10 rows perturbed in census columns ONLY (avg_household_income + 1,
 *         married_pct = NULL, period_of_construction = 'x'). Fold CF-5 (N-D18):
 *         a census-only change fires the CONVERTED merged guard, whose SET also
 *         rewrites `geom` — the legacy, by contrast, leaves `geom` alone on its
 *         census UPDATEs.
 *     Q = 5 rows whose `geom` (WKB) ALONE is translated 1e-4 deg — the
 *         guard-composition witness. NEITHER path names `geom` in its guard (the
 *         legacy guard is `name, geometry`; the converted guard is
 *         `name, geometry, …census`), so neither heals it and only its
 *         before-image restore can put it back.
 *     negative_control = the OTHER 128 rows (158 − 5 − 5 − 5 − 10 − 5), which must
 *         be byte-identical after either path runs.
 *   C and Q are DISJOINT by construction (they are carved from disjoint slices of
 *   the ordered key list) AND asserted disjoint anyway — see cohort.disjointness.
 *   ONLY `SELECT`s run (inside one READ ONLY txn) — --derive never writes.
 *
 * --run --side=pre|post --step=<script> --out=<capture json> applies the committed
 *   perturbation, spawns the LEGACY or CONVERTED step through the capture harness
 *   (capture-step-golden.js, --step=<script>), and asserts the R-AS claims against
 *   the harness summary and the table. Restore is UNCONDITIONAL: the `finally`
 *   bracket re-shifts I, restores N/G/C/Q from the full-row before-image, re-hashes
 *   and reports. No `process.exit()` — the pool is closed first.
 *   Restore order (restoreAndVerify): FK-safety check → DELETE the
 *   cohort-INSERTed rows at the I keys → full-row UPDATE from the before-image →
 *   verify the hashes and the 158-row count.
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; resolve-db refuses unsafe
 * targets and, per its own contract, no `PG_*` env is read directly here):
 *   node -r dotenv/config scripts/analysis/neighbourhoods-cohort-differential.js --help
 *   node -r dotenv/config scripts/analysis/neighbourhoods-cohort-differential.js --derive
 *   node -r dotenv/config scripts/analysis/neighbourhoods-cohort-differential.js --run --side=pre --step=scripts/load-neighbourhoods.js --out=docs/reports/golden/neighbourhoods/forced/pre.json
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/neighbourhoods/forced/cohort.json');
const TABLE = 'neighbourhoods';
const KEY = 'neighbourhood_id';

// The key-shift magnitude. 158 live keys (all < 1000) + 100000 lands every I row
// outside the occupied band; the loaders then insert NEW rows at those keys.
const SHIFT = 100000;

// The 14 census columns the converted upsert writes with `on_empty:"preserve_null"`
// (plan §4 / assessment §1.2 — "17 written columns"). Kept in the descriptor's own
// column order so the hash projection is a statement of that contract.
const CENSUS = [
  'avg_household_income', 'median_household_income', 'avg_individual_income',
  'low_income_pct', 'tenure_owner_pct', 'tenure_renter_pct', 'period_of_construction',
  'couples_pct', 'lone_parent_pct', 'married_pct', 'university_degree_pct',
  'immigrant_pct', 'visible_minority_pct', 'english_knowledge_pct',
];

// The capture harness's NARROW path for this table (158 rows × 20 projected cols —
// capture-step-golden.js hashes
// `md5(string_agg(ROW(<projection>)::text, '|' ORDER BY <order>))`).
// PROJ MUST equal the projection the PRE golden is captured with (plan §6 ①):
//   --table-columns=neighbourhoods:neighbourhood_id,name,geometry,geom,<14 census>,census_year,top_mother_tongue
//   --table-order=neighbourhoods:neighbourhood_id
// ORDER BY `neighbourhood_id`, never `id`: the `id` serial is non-deterministic
// (serial burn) and is deliberately OUT of the projection (plan §8).
const PROJ = [
  'neighbourhood_id', 'name', 'geometry', 'geom',
  ...CENSUS,
  'census_year', 'top_mother_tongue',
];

/** The table hash over PROJ, optionally restricted by a WHERE clause (an arm's keys). */
function hashSql(where) {
  return `SELECT md5(string_agg(ROW(${PROJ.join(', ')})::text, '|' ORDER BY ${KEY})) AS h`
    + ` FROM ${TABLE} ${where || ''}`;
}
const HASH_SQL = hashSql();

// Proves every FK TARGET (`permits.neighbourhood_id` → `neighbourhoods.id`,
// `neighbourhood_{build,storey}_norms` likewise) still resolves to a row carrying
// the SAME key: the I-arm moves `neighbourhood_id` while `id` must not move.
const ID_HASH_SQL =
  `SELECT md5(string_agg(id || ':' || ${KEY}, '|' ORDER BY id)) AS h FROM ${TABLE}`;

// The legacy SET expression for `geom`, verbatim from scripts/load-neighbourhoods.js
// (S4: `geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)`).
// `derive` compares it to the stored `geom` byte-for-byte, so a drifted row cannot
// make the G/C arms' premise (the converted SET is a no-op on clean rows) false.
const DERIVED_GEOM = 'ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)';

// The two legacy acquisition inputs, for the PRE/post source-identity check
// (Fold CF-6 (iv)): legacy reads its `data/` cache while the converted step
// re-downloads live, so the differential is VOID unless both content hashes match
// between the two captures.
const SOURCES = [
  { name: 'geojson', file: 'data/neighbourhoods-4326.geojson' },
  { name: 'xlsx', file: 'data/neighbourhood-profiles-2021.xlsx' },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`neighbourhoods-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor exemption
  // (src/tests/resolve-db.logic.test.ts); this read/restore harness has no reason to run below it.
  return createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
}

function parseArgs(argv) {
  const out = { derive: false, run: false, side: null, step: 'scripts/load-neighbourhoods.js', out: null };
  for (const a of argv) {
    if (a === '--derive') out.derive = true;
    else if (a === '--run') out.run = true;
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

/** {sha256, md5, bytes} of a repo-relative file, or null when it is absent. Pure. */
function fileDigests(rel) {
  const abs = resolveRepoPath(rel);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return {
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    md5: crypto.createHash('md5').update(buf).digest('hex'),
    bytes: buf.length,
  };
}

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive(args) {
  const pool = makePool('neighbourhoods-cohort-differential:derive');
  try {
    // 1. Every candidate key, plus the two facts that decide whether the cohort is a
    //    valid forced change at all: the stored `geom` is byte-identical to a fresh
    //    legacy re-derivation of `geometry`, and every census column is non-null.
    const rows = await readOnlyQuery(
      pool,
      `SELECT ${KEY}, num_nulls(${CENSUS.join(', ')}) AS census_nulls,`
      + ` (ST_AsBinary(geom) = ST_AsBinary(${DERIVED_GEOM})) AS geom_ok`
      + ` FROM ${TABLE} ORDER BY ${KEY}`,
    );

    // 2. Refuse before building a cohort nobody can use. Each refusal NAMES itself.
    if (rows.length !== 158) {
      throw new Error(`refusing to derive: ${TABLE} has ${rows.length} rows, expected 158 (the live City boundary set)`);
    }
    const shifted = rows.filter((r) => r[KEY] >= SHIFT);
    if (shifted.length !== 0) {
      throw new Error(`refusing to derive: ${shifted.length} row(s) already sit at or above SHIFT ${SHIFT} (e.g. ${shifted[0][KEY]}) — the I arm would collide`);
    }
    const notNum = rows.filter((r) => !Number.isInteger(r[KEY]));
    if (notNum.length !== 0) {
      throw new Error(`refusing to derive: ${notNum.length} row(s) have a non-integer ${KEY} (e.g. ${JSON.stringify(notNum[0][KEY])}) — the key-shift arm needs integer keys`);
    }
    const badGeom = rows.filter((r) => r.geom_ok !== true);
    if (badGeom.length !== 0) {
      throw new Error(`refusing to derive: ${badGeom.length} row(s) have a stored geom that differs from ${DERIVED_GEOM} (e.g. ${KEY}=${badGeom[0][KEY]}) — the C arm's premise (the converted SET is a no-op on a clean row) would be false`);
    }
    const nullCensus = rows.filter((r) => Number(r.census_nulls) !== 0);
    if (nullCensus.length !== 0) {
      throw new Error(`refusing to derive: ${nullCensus.length} row(s) carry a NULL census column (e.g. ${KEY}=${nullCensus[0][KEY]}) — Fold CF-5 proves the census fold on a FULLY populated table`);
    }
    // Belt and braces: the same fact as `rows.length === 158` + `shifted.length === 0`,
    // asked of the TABLE rather than of the fetch (so a LIMIT added to the query above
    // could never turn this guarantee vacuous).
    const above = await readOnlyQuery(pool, `SELECT count(*)::int AS n FROM ${TABLE} WHERE ${KEY} >= $1`, [SHIFT]);
    if (Number(above[0].n) !== 0) {
      throw new Error(`refusing to derive: ${above[0].n} row(s) with ${KEY} >= ${SHIFT} (counted on the table) — the I arm would collide`);
    }

    // 3. Carve the arms out of the ORDER BY ${KEY} list [plan §6 ① / assessment §9].
    //    Disjoint BY CONSTRUCTION (disjoint index slices), and asserted so below.
    const k = rows.map((r) => r[KEY]);
    const pick = (from, to) => k.slice(from, to);
    const I = pick(0, 5);
    const N = pick(5, 10);
    const G = pick(10, 15);
    const C = pick(15, 25);
    const Q = pick(25, 30);
    const negativeControl = pick(30); // k[30..] — the other 128 rows
    const arms = { I, N, G, C, Q, negative_control: negativeControl };
    for (const [name, ids] of Object.entries(arms)) {
      if (ids.length === 0) throw new Error(`refusing to derive: arm ${name} is empty (the key list is shorter than the plan assumes)`);
    }
    const total = Object.values(arms).reduce((n, ids) => n + ids.length, 0);
    if (total !== rows.length) {
      throw new Error(`refusing to derive: arms cover ${total} of ${rows.length} rows — the carve must be exhaustive`);
    }
    const union = new Set();
    for (const [name, ids] of Object.entries(arms)) for (const id of ids) union.add(id);
    if (union.size !== rows.length) {
      throw new Error(`refusing to derive: arms are not disjoint — ${rows.length - union.size} duplicate key(s) across I/N/G/C/Q/negative_control`);
    }

    // 4. Hashes. The baseline is the whole table; every arm hash is the arm alone, so
    //    a POST capture can prove the NEGATIVE CONTROL did not move.
    const baselineHash = (await readOnlyQuery(pool, HASH_SQL))[0].h;
    const baselineIdHash = (await readOnlyQuery(pool, ID_HASH_SQL))[0].h;
    const armHashes = {};
    for (const [name, ids] of Object.entries(arms)) {
      armHashes[name] = (await readOnlyQuery(pool, hashSql(`WHERE ${KEY} = ANY($1::int[])`), [ids]))[0].h;
    }

    // 5. Source identity (Fold CF-6 (iv)): the convert now re-downloads while legacy
    //    reads this cache, so the differential is VOID unless both agree.
    const sources = SOURCES.map((s) => ({ ...s, digest: fileDigests(s.file) }));

    const cohort = {
      generated_at: new Date().toISOString(),
      shift: SHIFT,
      perturbations: {
        I: `${KEY} += ${SHIFT} (the legacy loader then INSERTs 5 new rows; the legacy INSERT arm leaves their geom NULL — N-D1, the ONE declared POST diff)`,
        N: `name = name || ' ~' (the legacy guard names 'name', so BOTH paths must heal it)`,
        G: `geometry = ST_Translate(jsonb, 1e-4, 1e-4, 0) AND geom = ST_Translate(geom, 1e-4, 1e-4) — the jsonb and WKB move together`,
        C: `avg_household_income += 1, married_pct = NULL, period_of_construction = 'x' — census-only; the CONVERTED merged guard rewrites geom too (N-D18)`,
        Q: `geom = ST_Translate(geom, 1e-4, 1e-4) — geom ONLY; neither guard names geom, so NEITHER path heals it`,
        negative_control: `untouched — must be byte-identical after either path runs`,
      },
      disjointness: 'C and Q are disjoint (Fold CF-5 / N-D18): a census-only change rewrites geom under the converted SET, so a C∩Q row would destroy the Q witness',
      I,
      N,
      G,
      C,
      Q,
      negative_control: negativeControl,
      baseline_hash: baselineHash,
      baseline_id_hash: baselineIdHash,
      arm_hashes: armHashes,
      sources,
    };
    fs.mkdirSync(path.dirname(COHORT_PATH), { recursive: true });
    fs.writeFileSync(COHORT_PATH, JSON.stringify(cohort, null, 2) + '\n');
    console.log(`[differential] cohort written: ${COHORT_PATH}`);
    console.log(`[differential]   I=${I.length} N=${N.length} G=${G.length} C=${C.length} Q=${Q.length} negative_control=${negativeControl.length}`);
    console.log(`[differential]   baseline_hash=${baselineHash}`);
    console.log(`[differential]   baseline_id_hash=${baselineIdHash}`);
    for (const [name, h] of Object.entries(armHashes)) console.log(`[differential]   arm_hash.${name}=${h}`);
    for (const s of sources) console.log(`[differential]   source ${s.name} ${s.file}: ${s.digest ? s.digest.sha256 : 'ABSENT'}`);
  } finally {
    await pool.end();
  }
}

// ── --run ──
async function run(args) {
  if (args.side !== 'pre' && args.side !== 'post') {
    throw new Error(`--side must be one of pre|post, got ${JSON.stringify(args.side)}`);
  }
  if (!args.out) throw new Error('--run requires --out=<capture json>');

  const side = args.side;
  const pool = makePool(`neighbourhoods-cohort-differential:${side}`);

  // A dedicated client held for the WHOLE bracket: (a) a CF-6 (i) pre-flight that
  // aborts if ANY other client backend is doing anything on this database, and
  // (b) transaction-scoped advisory locks (held in one open transaction on this client; released by ROLLBACK after the restore or automatically on disconnect) that close the FK-reference write window
  // for the duration of the run + restore.
  const guard = await pool.connect();

  let cohort = null;
  let before = [];
  let beforePath = null;
  let asserted = false;
  let restored = false;
  try {
    cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
    console.log(`[differential:${side}] cohort loaded: I=${cohort.I.length} N=${cohort.N.length} G=${cohort.G.length} C=${cohort.C.length} Q=${cohort.Q.length} negative-control=${cohort.negative_control.length}`);

    // 1. Preamble on the held guard: no concurrent writer may be mid-flight on this
    //    database, and the FK-ref writers' session locks must be ours alone.
    const busy = await guard.query(
      `SELECT pid, application_name, state FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'
          AND state <> 'idle'`,
    );
    if (busy.rows.length !== 0) {
      // CF-6 (i): the differential is only meaningful on a quiescent database —
      // any live client backend could perturb the very rows we are witness-ing.
      throw new Error(`refusing to run: ${busy.rows.length} client backend(s) active on ${requireEnv('PG_DATABASE')} (CF-6 (i)) — e.g. pid ${busy.rows[0].pid} ${JSON.stringify(busy.rows[0].application_name)} state=${busy.rows[0].state}`);
    }
    // link_neighbourhoods (92), neighbourhood build/storey norms (78, 195) are the
    // steps that WRITE the FKs referencing neighbourhoods.id; holding their locks
    // keeps those writers out of the reference window.
    // NOT 57: the step under test takes lock 57 ITSELF, via pg_try_advisory_xact_lock —
    // holding 57 here would make that try fail and the run would SKIP its real work.
    const CONSUMER_LOCKS = [92, 78, 195];
    // Transaction-scoped (SIGKILL-safe) — the footgun[direct-advisory-lock] intent; withAdvisoryLock is
    // single-key, this bracket needs three held across the run + restore, so the guard holds one open txn.
    await guard.query('BEGIN');
    for (const key of CONSUMER_LOCKS) {
      const got = (await guard.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [key])).rows[0].ok;
      if (got !== true) {
        throw new Error(`refusing to run: pg_try_advisory_xact_lock(${key}) failed — another session holds it (the FK-ref writer for neighbourhoods)`);
      }
    }
    console.log(`[differential:${side}] guard acquired: quiescent + advisory locks ${CONSUMER_LOCKS.join(',')} held (NOT 57 — the step under test takes 57 itself)`);

    // 2. Refuse unless the committed cohort still describes THIS table.
    const nowHash = (await pool.query(HASH_SQL)).rows[0].h;
    if (nowHash !== cohort.baseline_hash) {
      throw new Error(`refusing to run: current table hash ${nowHash} !== cohort.baseline_hash ${cohort.baseline_hash} — re-derive (--derive) first`);
    }
    const nowIdHash = (await pool.query(ID_HASH_SQL)).rows[0].h;
    if (nowIdHash !== cohort.baseline_id_hash) {
      throw new Error(`refusing to run: current id hash ${nowIdHash} !== cohort.baseline_id_hash ${cohort.baseline_id_hash} — re-derive (--derive) first`);
    }
    console.log(`[differential:${side}] BASELINE hash confirmed: ${cohort.baseline_hash}`);

    // 3. BEFORE-IMAGE, exported FIRST: every I ∪ N ∪ G ∪ C ∪ Q row, full replacement
    //    material for the restore. `geometry::text` holds the jsonb as text
    //    and `geom_hex` the raw WKB, so both columns can be made byte-identical again.
    const touched = [...cohort.I, ...cohort.N, ...cohort.G, ...cohort.C, ...cohort.Q];
    before = (
      await pool.query(
        `SELECT id, ${KEY}, name, geometry::text AS geometry,
                encode(ST_AsEWKB(geom), 'hex') AS geom_hex,
                ${CENSUS.join(', ')}
           FROM ${TABLE} WHERE ${KEY} = ANY($1::int[]) ORDER BY ${KEY}`,
        [touched],
      )
    ).rows;
    beforePath = path.join(os.tmpdir(), `neighbourhoods-cohort-before-${side}-${Date.now()}.json`);
    fs.writeFileSync(beforePath, JSON.stringify({ cohort_baseline_hash: cohort.baseline_hash, rows: before }, null, 2) + '\n');
    console.log(`[differential:${side}] before-image: ${before.length} row(s) written to ${beforePath}`);

    // 4. Perturb in ONE committed txn.
    {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE ${TABLE} SET ${KEY} = ${KEY} + $2::int WHERE ${KEY} = ANY($1::int[])`, [cohort.I, SHIFT]);
        await client.query(`UPDATE ${TABLE} SET name = name || ' ~' WHERE ${KEY} = ANY($1::int[])`, [cohort.N]);
        await client.query(
          `UPDATE ${TABLE} SET geometry = ST_AsGeoJSON(ST_Translate(ST_GeomFromGeoJSON(geometry::text), 1e-4, 1e-4))::jsonb,`
          + ` geom = ST_Translate(geom, 1e-4, 1e-4) WHERE ${KEY} = ANY($1::int[])`,
          [cohort.G],
        );
        await client.query(
          `UPDATE ${TABLE} SET avg_household_income = avg_household_income + 1, married_pct = NULL,`
          + ` period_of_construction = 'x' WHERE ${KEY} = ANY($1::int[])`,
          [cohort.C],
        );
        await client.query(`UPDATE ${TABLE} SET geom = ST_Translate(geom, 1e-4, 1e-4) WHERE ${KEY} = ANY($1::int[])`, [cohort.Q]);
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
        throw err;
      } finally {
        client.release();
      }
    }
    const perturbed = (await pool.query(HASH_SQL)).rows[0].h;
    if (perturbed === cohort.baseline_hash) {
      throw new Error('perturbation did not change the hash — void differential');
    }
    console.log(`[differential:${side}] PERTURBED hash: ${perturbed}`);

    // 5. Source identity (Fold CF-6 (iv)). Side `pre` runs the LEGACY step, which reads
    //    its `data/` cache, so the differential is VOID unless that cache is byte-identical
    //    to the digests the cohort was derived against. Side `post` runs the CONVERTED step,
    //    which re-downloads live: the proof there is that the harness summary itself carries,
    //    per source, a `content_hash` string equal to its sha256 OR md5.
    if (side === 'pre') {
      for (const s of cohort.sources) {
        const d = fileDigests(s.file);
        if (!s.digest || !d || d.sha256 !== s.digest.sha256) {
          throw new Error(`VOID: source ${s.name} (${s.file}) ${d ? d.sha256 : 'ABSENT'} !== cohort.sources digest ${s.digest ? s.digest.sha256 : 'ABSENT'} — legacy reads that cache`);
        }
      }
      console.log(`[differential:${side}] source identity confirmed: ${cohort.sources.length} cached source(s) byte-identical to the cohort`);
    }

    // 6. Spawn the REAL step through the capture harness, exactly as the PRE/POST
    //    goldens are taken.
    const stepPath = path.relative(REPO_ROOT, resolveRepoPath(args.step)) || args.step;
    const argv = [
      '-r', 'dotenv/config', 'scripts/analysis/capture-step-golden.js',
      // A re-run of an already-committed side is a deliberate recapture, not an accident
      // (git history restores the prior one); the harness guard stays in force for every other caller.
      `--step=${stepPath}`, '--chain=sources', '--overwrite', `--out=${resolveRepoPath(args.out)}`,
      `--tables=${TABLE}`, `--table-columns=${TABLE}:${PROJ.join(',')}`, `--table-order=${TABLE}:${KEY}`,
      '--invariants=docs/reports/golden/neighbourhoods/invariants.json',
    ];
    console.log(`[differential:${side}] running the real step: node ${argv.join(' ')}`);
    const out = execFileSync('node', argv, {
      cwd: REPO_ROOT,
      env: { ...process.env, PIPELINE_CHAIN: 'sources' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    // The FIRST summary is the run under test. A POST capture path makes the harness run
    // the step a SECOND time (the two-run zero-writes proof), whose summary reads 0/0 by
    // design; `.pop()` would read that second run and fail a genuine forced run.
    const summaryLine = out.split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
    if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in the harness output');
    const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
    console.log(`[differential:${side}] RUN records_total=${summary.records_total} records_new=${summary.records_new} records_updated=${summary.records_updated}`);

    if (side === 'post') {
      // Fold CF-6 (iv): every string under a `content_hash` key, ANYWHERE in the summary,
      // must witness both live-downloaded sources.
      const hashes = [];
      (function collect(node) {
        if (node === null || typeof node !== 'object') return;
        for (const [k, v] of Object.entries(node)) {
          if (k === 'content_hash' && typeof v === 'string') hashes.push(v);
          else collect(v);
        }
      })(summary);
      // The CONVERTED runner is the second witness. It prints its acquisition into the run
      // log — `acquired 158 feature(s) (2141269 bytes, md5 3d3895fe…)` and `acquired lookup
      // "ckan:nbhd-2021-census-profile": 2603 row(s) … (1763175 bytes, md5 6ffe6838…)`,
      // anchored in scripts/lib/step/acquire.js — but keeps the acquired block OUT of
      // records_meta, and neither POST summary carries a `content_hash` at all. So scanning
      // the harness-echoed stdout is what actually ties a live download to the cohort.
      // Prefix + exact byte count is the strongest statement a 1-line log allows (the full
      // sha256 is not printed); the orchestrator additionally re-downloads both files and
      // compares full sha256 after each POST run (report §9), so this is a corroborating,
      // not sole, witness.
      const logWitnesses = [];
      for (const m of out.matchAll(/\((\d+) bytes, (sha256|md5) ([0-9a-f]{8})…\)/g)) {
        logWitnesses.push({ bytes: Number(m[1]), alg: m[2], prefix: m[3] });
      }
      for (const s of cohort.sources) {
        const want = s.digest ? [s.digest.sha256, s.digest.md5] : [];
        let kind = null;
        if (want.some((h) => hashes.includes(h))) kind = 'summary';
        if (!kind && s.digest) {
          const w = logWitnesses.find((x) => x.bytes === s.digest.bytes
            && x.prefix === (s.digest[x.alg] || '').slice(0, 8));
          if (w) kind = `log ${w.alg} ${w.prefix} ${w.bytes}B`;
        }
        if (!kind) {
          throw new Error(`VOID: no summary content_hash matches source ${s.name} (${s.file}) sha256/md5 ${want.join('|')} and no acquisition log line witnesses it (log witnesses seen: ${logWitnesses.map((w) => `${w.alg} ${w.prefix} ${w.bytes}B`).join(', ') || 'none'}) — live download cannot be tied to the cohort`);
        }
        console.log(`[differential:${side}] source identity witnessed for ${s.name} (${s.file}): ${kind}`);
      }
      console.log(`[differential:${side}] source identity confirmed: ${cohort.sources.length} live source(s) witnessed (${hashes.length} summary content_hash value(s), ${logWitnesses.length} acquisition log line(s))`);
    }

    // 7. Witnesses. `newRows` are the loader's I-arm INSERTs: keys that were only
    //    revealed by the shift, so they had no `id` in the before-image.
    const beforeIds = new Set(before.map((r) => Number(r.id)));
    const newRows = (
      await pool.query(
        `SELECT ${KEY}, id, name, (geom IS NULL) AS geom_null,
                (ST_AsBinary(geom) = ST_AsBinary(${DERIVED_GEOM})) AS geom_derived
           FROM ${TABLE} WHERE ${KEY} = ANY($1::int[]) ORDER BY ${KEY}`,
        [cohort.I],
      )
    ).rows.filter((r) => !beforeIds.has(Number(r.id)));
    const newGeomNull = newRows.filter((r) => r.geom_null === true).length;
    const newGeomDerived = newRows.filter((r) => r.geom_derived === true).length;
    console.log(`[differential:${side}] witness newRows: ${newRows.length}/${cohort.I.length} (expect ${cohort.I.length})`);
    if (side === 'pre') {
      // N-D1: the legacy INSERT arm leaves `geom` NULL on the 5 freshly inserted rows.
      console.log(`[differential:${side}] witness newGeomNull: ${newGeomNull}/${newRows.length} (expect ${cohort.I.length} — N-D1)`);
    } else {
      console.log(`[differential:${side}] witness newGeomNull: ${newGeomNull}/${newRows.length} (expect 0); newGeomDerived: ${newGeomDerived}/${newRows.length} (expect ${cohort.I.length})`);
    }

    const shiftedStill = Number(
      (await pool.query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE ${KEY} = ANY($1::int[])`, [cohort.I.map((k) => k + SHIFT)])).rows[0].n,
    );
    console.log(`[differential:${side}] witness shifted keys still present: ${shiftedStill}/${cohort.I.length} (expect ${cohort.I.length})`);

    // N, G and C must all be healed on BOTH sides. The Q arm (geom-only 1e-4 translate) is
    // the guard-composition witness, and its expectation is SIDE-DEPENDENT (N-D20): the
    // LEGACY guard (side `pre`) is name/geometry only, so Q is NOT healed; the CONVERTED
    // guard ALSO names `geom` (N-D20), so the converted step HEALS Q.
    const healed = {};
    for (const arm of ['N', 'G', 'C']) {
      healed[arm] = (await pool.query(hashSql(`WHERE ${KEY} = ANY($1::int[])`), [cohort[arm]])).rows[0].h;
      console.log(`[differential:${side}] witness healed.${arm}: ${healed[arm]} ${healed[arm] === cohort.arm_hashes[arm] ? '(arm_hash OK)' : '(ARM HASH MISMATCH)'}`);
    }
    const qUnhealed = Number(
      (await pool.query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE ${KEY} = ANY($1::int[]) AND ST_AsBinary(geom) <> ST_AsBinary(${DERIVED_GEOM})`, [cohort.Q])).rows[0].n,
    );
    console.log(`[differential:${side}] witness Q not healed: ${qUnhealed}/${cohort.Q.length} geom rows still ≠ ${DERIVED_GEOM} (expect ${side === 'pre' ? cohort.Q.length : '0 — N-D20 heals geom-only drift'})`);

    const negAfter = (await pool.query(hashSql(`WHERE ${KEY} = ANY($1::int[])`), [cohort.negative_control])).rows[0].h;
    console.log(`[differential:${side}] witness negative_control hash: ${negAfter} ${negAfter === cohort.arm_hashes.negative_control ? '(arm_hash OK)' : '(ARM HASH MISMATCH)'}`);

    // N-D1 — the "N-D1 is the ONLY difference" witness (plan §6 ②). The whole point of the
    // forced change is that the converted end state equals the LEGACY end state EXCEPT the one
    // declared key: `geom` on the 5 I-arm rows (legacy NULL; converted ST_SetSRID(...)). So
    // re-hash the post-run table with `geom` NULLed on EXACTLY the step-inserted rows and demand
    // it equal the legacy end-state table hash — itself recorded (same harness, same ROW()/md5
    // formula as hashSql()) in the legacy forced capture forced/pre.json table_state[0].content_hash.
    // The CASE returns the `geom` column's OWN type, so its ROW()::text form is unchanged when
    // non-NULL (no cast, no added parentheses) and only the 5 new rows' text becomes NULL.
    let nd1OnlyHash = null; let nd1OnlyOk = true;
    if (side === 'post') {
      // hash a table rebuilt from the post-run state: geom NULLed on exactly the new I-arm
      // rows (ids not in the before-image), and geom RE-TRANSLATED 1e-4 on exactly the Q rows.
      // N-D1+N-D20: the LEGACY end state carries BOTH diffs. N-D1 leaves the new rows' geom
      // NULL. N-D20: the legacy guard (name/geometry) never fires on the Q arm, so the legacy
      // Q rows' geom keeps the perturbation's 1e-4 translate — while the CONVERTED step has
      // healed them (`geom` joined the converted guard), so on a healed Q row geom = its
      // derivation = the baseline geom (ST_AsBinary(geom) = ST_AsBinary(geometry-derived),
      // 158/158 by --derive's `geom_ok` premise) and translating it again reproduces the
      // legacy Q state EXACTLY. The hash must still equal forced/pre.json's table
      // content_hash — the same ROW()/md5 formula as hashSql(), so the rebuild is exact.
      const newIds = newRows.map((r) => Number(r.id));
      const proj = PROJ.map((c) => (c === 'geom'
        ? `CASE WHEN id = ANY($1::int[]) THEN NULL WHEN ${KEY} = ANY($2::int[]) THEN ST_Translate(geom, 1e-4, 1e-4) ELSE geom END`
        : c)).join(', ');
      nd1OnlyHash = (await pool.query(`SELECT md5(string_agg(ROW(${proj})::text, '|' ORDER BY ${KEY})) AS h FROM ${TABLE}`, [newIds, cohort.Q])).rows[0].h;
      const preCapture = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/golden/neighbourhoods/forced/pre.json'), 'utf8'));
      const legacyHash = preCapture.table_state[0].content_hash;
      nd1OnlyOk = nd1OnlyHash === legacyHash;
      console.log(`[differential:${side}] witness N-D1+N-D20-only: post table with the ${newIds.length} new rows' geom NULLed and the ${cohort.Q.length} Q rows' geom re-translated = ${nd1OnlyHash} ${nd1OnlyOk ? '== legacy forced end state (OK)' : `!= legacy forced end state ${legacyHash} (MISMATCH)`}`);
    }

    const healedAll = ['N', 'G', 'C'].every((arm) => healed[arm] === cohort.arm_hashes[arm]);
    if (side === 'pre') {
      console.log(`[differential:${side}] counters records_total=${summary.records_total} (expect 158)`);
    } else {
      console.log(`[differential:${side}] counters records_new=${summary.records_new} (expect ${cohort.I.length}), records_updated=${summary.records_updated} (expect ${cohort.N.length + cohort.G.length + cohort.C.length + cohort.Q.length} — N+G+C+Q, the converted guard now names geom (N-D20), so Q is healed)`);
    }

    asserted = newRows.length === cohort.I.length
      && shiftedStill === cohort.I.length
      && healedAll
      // The Q witness is SIDE-DEPENDENT (N-D20): the legacy guard (name/geometry) leaves
      // geom-only drift, the converted guard also names geom and heals it.
      && qUnhealed === (side === 'pre' ? cohort.Q.length : 0)
      && negAfter === cohort.arm_hashes.negative_control
      && nd1OnlyOk // true on the pre side (the N-D1-only witness only runs post); the required POST claim
      && (side === 'pre'
        ? newGeomNull === cohort.I.length && Number(summary.records_total) === 158
        : newGeomNull === 0 && newGeomDerived === newRows.length
          && Number(summary.records_new) === cohort.I.length
          && Number(summary.records_updated) === cohort.N.length + cohort.G.length + cohort.C.length + cohort.Q.length);
    console.log(asserted ? '[differential] PASS' : '[differential] FAIL');
  } catch (err) {
    console.error(`[differential:${side}] ERROR: ${err.message}`);
  } finally {
    restored = await restoreAndVerify({ pool, cohort, before, beforePath, side });
    console.log(`[differential:${side}] restored: ${restored}`);
    try {
      await guard.query('ROLLBACK'); // releases the three xact-scoped consumer locks; the guard txn wrote nothing
    } finally {
      guard.release();
    }
    if (!asserted || !restored) process.exitCode = 1;
    await pool.end();
  }
}

// ── restore ────────────────────────────────────────────────────────────────
// The DELETE-then-UPDATE order below is REQUIRED by UNIQUE(${KEY}) (Fold CF-6 (iii)):
// the I arm shifted the original rows to key+SHIFT, and the step under test then
// INSERTed new rows at the original keys. Moving an original back to its recorded key
// would collide with that still-present step-inserted row, so the step's insertions are
// DELETEd first, THEN every before-image row is rewritten in full. The serial burn (the
// `id` sequence advanced by the step's INSERTs) is NOT restored and is deliberately OUT
// of the projection (PROJ excludes `id`, and the two paths burn identically), so it
// cannot affect the hash comparison below.
// Returns true only when the table is byte-equivalent to the cohort baseline; never throws.
async function restoreAndVerify({ pool, cohort, before, beforePath, side }) {
  if (!cohort) {
    console.error(`[differential:${side}] RESTORE SKIPPED: the cohort never loaded, so nothing was perturbed`);
    return false;
  }
  if (before.length === 0) {
    // No before-image ⇒ the perturbation (which runs strictly after the export) never ran.
    // Mutating here would be unsafe: `id <> ALL('{}')` is TRUE for every row, so the
    // "step-inserted" selector below would name the ORIGINAL I rows. Verify only.
    console.log(`[differential:${side}]   restore: no before-image — nothing was perturbed; verify only`);
    return verifyBaseline({ pool, cohort, beforePath, side });
  }
  const beforeIds = before.map((r) => Number(r.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. The rows the step INSERTED at the I keys: present at a key in cohort.I but
    //    carrying an `id` the before-image never had (the originals keep their ids).
    const del = (
      await client.query(
        `SELECT id FROM ${TABLE} WHERE ${KEY} = ANY($1::int[]) AND id <> ALL($2::int[])`,
        [cohort.I, beforeIds],
      )
    ).rows.map((r) => Number(r.id));

    // 2. FK SAFETY. A DELETE on `neighbourhoods` fires permits.neighbourhood_id
    //    (ON DELETE SET NULL) / neighbourhood_{build,storey}_norms (ON DELETE CASCADE),
    //    so we must PROVE no referencing row points at a to-be-deleted id before we
    //    delete it. Discover every FK whose target is this table, then count refs.
    const fks = (
      await client.query(
        `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
           FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          WHERE c.confrelid = '${TABLE}'::regclass AND c.contype = 'f'`,
      )
    ).rows;
    for (const fk of fks) {
      // `tbl` is already rendered by regclass (hence correctly schema-quoted); the
      // column name is a raw catalog value, so it is quoted by hand.
      const n = Number(
        (await client.query(`SELECT count(*)::int AS n FROM ${fk.tbl} WHERE "${fk.col}" = ANY($1::int[])`, [del])).rows[0].n,
      );
      console.log(`[differential:${side}]   fk ${fk.tbl}.${fk.col}: ${n}`);
      if (n > 0) {
        await client.query('ROLLBACK');
        console.error(`[differential:${side}] HALT: FK reference to a cohort-inserted id — manual restore from ${beforePath}`);
        return false;
      }
    }

    // 3. DELETE the cohort insertions (skip entirely when the step inserted nothing —
    //    e.g. a legacy run that skipped its work — so the DELETE never fires an FK action).
    if (del.length > 0) {
      const res = await client.query(`DELETE FROM ${TABLE} WHERE id = ANY($1::int[])`, [del]);
      console.log(`[differential:${side}]   restore: deleted ${res.rowCount} cohort-inserted row(s)`);
    } else {
      console.log(`[differential:${side}]   restore: no cohort-inserted row(s) to delete`);
    }

    // 4. Rewrite every before-image row from its FULL before-image, binding every value
    //    as-is: the jsonb as text, the WKB as hex. CENSUS is written in the descriptor's order.
    const censusSet = CENSUS.map((c, i) => `${c} = $${6 + i}`).join(', ');
    let updated = 0;
    for (const r of before) {
      const params = [Number(r.id), r[KEY], r.name, r.geometry, r.geom_hex, ...CENSUS.map((c) => r[c])];
      const res = await client.query(
        `UPDATE ${TABLE} SET ${KEY} = $2, name = $3, geometry = $4::jsonb,`
        + ` geom = ST_GeomFromEWKB(decode($5, 'hex')), ${censusSet} WHERE id = $1`,
        params,
      );
      updated += res.rowCount;
    }
    console.log(`[differential:${side}]   restore: updated ${updated}/${before.length} before-image row(s)`);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    console.error(`[differential:${side}] RESTORE FAILED: ${err.message} — manual restore from ${beforePath}`);
    return false;
  } finally {
    client.release();
  }

  // 5. Verify on the pool, once the restore txn has committed.
  return verifyBaseline({ pool, cohort, beforePath, side });
}

/** Whole-table hash, id↔key map hash and row count against the cohort baseline; never throws. */
async function verifyBaseline({ pool, cohort, beforePath, side }) {
  try {
    const h = (await pool.query(HASH_SQL)).rows[0].h;
    const idh = (await pool.query(ID_HASH_SQL)).rows[0].h;
    const n = Number((await pool.query(`SELECT count(*)::int AS n FROM ${TABLE}`)).rows[0].n);
    const hOk = h === cohort.baseline_hash;
    const idOk = idh === cohort.baseline_id_hash;
    const nOk = n === 158;
    console.log(`[differential:${side}]   verify hash: ${h} ${hOk ? '(OK)' : `(MISMATCH — baseline ${cohort.baseline_hash})`}`);
    console.log(`[differential:${side}]   verify id hash: ${idh} ${idOk ? '(OK)' : `(MISMATCH — baseline ${cohort.baseline_id_hash})`}`);
    console.log(`[differential:${side}]   verify count: ${n} ${nOk ? '(OK)' : '(MISMATCH — expected 158)'}`);
    return hOk && idOk && nOk;
  } catch (err) {
    console.error(`[differential:${side}] RESTORE FAILED: verification query threw ${err.message} — manual restore from ${beforePath}`);
    return false;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const HELP = `neighbourhoods-cohort-differential — neighbourhoods (batch-2 row 3.8) R-AS forced-change cohort differential

Usage:
  node -r dotenv/config scripts/analysis/neighbourhoods-cohort-differential.js --derive
  node -r dotenv/config scripts/analysis/neighbourhoods-cohort-differential.js --run --side=pre|post \\
      [--step=scripts/load-neighbourhoods.js] --out=<capture json>

  --derive   SELECT-only (READ ONLY txn). Writes ${path.relative(REPO_ROOT, COHORT_PATH)}:
             I=5 key-shifted rows (+${SHIFT}; the loader INSERTs 5, DELETE-free because the
             FKs reference id, not ${KEY}); N=5 name rows; G=5 geometry+geom rows; C=10
             census rows; Q=5 geom-only rows (the guard-composition witness); negative_control
             = the other 128 rows. C and Q are disjoint (Fold CF-5 / N-D18). Refuses unless
             the table is the 158-row live set with no NULL census column, no key at or above
             the shift, and every stored geom byte-identical to ${DERIVED_GEOM}.
  --run      Requires a committed cohort whose baseline_hash still matches the table. Applies
             the perturbation, spawns a real legacy-or-converted run through
             capture-step-golden.js, asserts the R-AS claims, then restores unconditionally.
             Restore order: FK-safety check → DELETE the cohort-INSERTed rows → full-row
             UPDATE from the before-image → verify the hashes and the 158-row count.
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
