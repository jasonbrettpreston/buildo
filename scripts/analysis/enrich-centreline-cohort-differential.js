#!/usr/bin/env node
/**
 * enrich-centreline-cohort-differential — the batch-2 row 3.10 `enrich_centreline` committed
 * perturbation cohort (plan Fold A9 + Fold RC-1; assessment §9 / §12.3), the centreline analogue
 * of scripts/analysis/massing-cohort-differential.js.
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.11, §9
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS
 *
 * WHY A COHORT AT ALL (R-AS). `parcels.centreline_dataset_version_when_enriched` is BOTH the
 * §3.11 version-skip gate's input AND the column the step stamps in its own WHERE clause
 * (`centreline_dataset_version_when_enriched IS DISTINCT FROM $1`). A forced FULL re-run on
 * unchanged source data therefore writes rows ONLY because the stamp says so — it proves
 * NOTHING about value equivalence. The R-AS instrument is a COMMITTED PERTURBATION COHORT:
 * `docs/reports/golden/enrich_centreline/cohort.json` records, for 2,000 deterministically
 * sampled parcels (four strata, below), the STORED baseline literal of the five columns the
 * step writes plus the stamp. The run half (brief x2: --backup / --run / --restore) perturbs
 * those rows, runs the REAL step through capture-step-golden.js, and compares the step's
 * output against the SAME literals — never against the live pre-run value (Fold A9: a `NOT x`
 * perturbation computed from the CURRENT row would be void after any prior partial run, so the
 * literal is captured once, here, and replayed).
 *
 * WHAT --derive DOES (this file, part 1). SELECTs only, every one of them inside a
 * `BEGIN READ ONLY` transaction — --derive never writes to the database. It:
 *   a. reads the §3.11 producer/consumer contract through the CONVERTED step's own
 *      `scripts/lib/compute/enrich-centreline.js#readCentrelineContract` (required, never
 *      re-implemented here) and REFUSES unless the run would be `incremental`
 *      (mode === 'incremental' AND lastVersion === sourceDatasetVersion). `full`/`skip` mean
 *      "re-load the centreline / nothing to do" and no cohort taken in that state is meaningful.
 *   b. RC-1 ABSORPTION GATE: counts valid-geom parcels whose stamp is `IS DISTINCT FROM` the
 *      version AND that are within the seeded `enrich_centreline_proximity_m` radius of a
 *      centreline — i.e. rows the step WILL write that this cohort cannot hold in its literal
 *      BASELINE (its stamp is not the version). Any > 0 REFUSES with the legacy-run remedy.
 *   c. samples four strata (corner 500, through 300, laneway 500, plain 700 = 2,000) by a
 *      seeded `ORDER BY md5(p.id::text || ':' || $2)` (deterministic, independent of the table's
 *      physical order), refusing when ANY stratum is short, and asserts the four id sets are
 *      pairwise disjoint.
 *   d. records the toronto_centreline identity (count / min / max / id-set md5), a
 *      negative control (valid-geom, never-stamped parcels NOT in the cohort: count + projected
 *      hash) and `baseline_hash` — the SAME projected hash capture-step-golden.js's narrow-table
 *      path computes, built from the harness's OWN `rowTextExpr`/`orderByClause` exports so the
 *      two can never drift.
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; resolve-db refuses unsafe targets and,
 * per its own contract, no `PG_*` env is read directly here):
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --help
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --self-test
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --derive --seed=<s> [--overwrite]
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --backup --backup-table=<t>
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --run --side=pre|post \
 *       --backup-table=<t> --chain=sources|none --out=<capture json> [--force-full] [--legacy-ref=<ref>]
 *   node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --restore --backup-table=<t>
 * (--backup/--run/--restore are the brief-x2 half; see the ec2-x2 stub block below.)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createResolvedPool } = require('../lib/resolve-db');
// The capture harness's OWN hash builders (RULING R-C shape: ONE definition, never a second
// hand-typed copy). `rowTextExpr` quotes each identifier as "col"; `orderByClause` renders the
// ORDER BY list. Reaching into another module's source text is forbidden here — if the harness
// ever changes the narrow-path hash, this file inherits the change (that is the point).
const { rowTextExpr, orderByClause } = require('./capture-step-golden.js');
// fx9 (idempotency lens, 2026-10-02): the sanctioned advisory-lock entry point (Spec 47 §5). The
// bracket's mutual exclusion is taken through `pipeline.withAdvisoryLock` — a TRANSACTION-level
// `pg_try_advisory_xact_lock` on its own client — never a hand-rolled session lock here.
const pipeline = require('../lib/pipeline');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/enrich_centreline/cohort.json');
const LOGIC_VARIABLES_PATH = path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json');

const TABLE = 'parcels';
const TABLE_ALIAS = 't';
const PRODUCER_VERSION = '1.1'; // scripts/lib/compute/enrich-centreline.js#SPEC_VERSION (§9 frozen block)

/**
 * fx6 (idempotency lens, 2026-10-02): the BRACKET's own advisory lock.
 *
 * The bracket (--run) does three things no other mode does: it rewrites 2,000 rows, it spawns the
 * real step, and it restores from a before-image. Two concurrent `--run`s (or a chain run whose own
 * pre-perturbation repair walks the same rows) can therefore interleave — run B's step (3) repair
 * would undo run A's perturbation BEFORE A's capture, and A's capture would record B's output. The
 * perturbation is only meaningful if the bracket owns the table for its whole duration, so the
 * bracket takes a lock of its own and REFUSES rather than queues when another bracket already holds
 * it. A refusal is right here and a wait is not: both runs would write the SAME committed literals,
 * so serialising them buys nothing a refusal does not, and a silent wait would hold a pool client
 * for another bracket's whole capture.
 *
 * WHAT IT DOES NOT COVER (fx8, 2026-10-02 — be honest about the boundary): this lock excludes OTHER
 * cohort brackets ONLY. It is not a general table lock, and it is NOT held by the step, the chain
 * runner, or load_centreline. A concurrent chain run, a concurrent run of the step itself, or a
 * producer writing parcels/toronto_centreline while this bracket is open is NOT prevented by it.
 * Those interferences are caught AFTER THE FACT, by the step (6) asserts — the
 * `records_updated === cohort size` check and the post-run hash / negative-control / lastVersion
 * comparisons (plus the step (2) centreline-identity and contract guards). Treat the lock as mutual
 * exclusion among brackets, not as isolation from every writer.
 *
 * fx9 (idempotency lens, 2026-10-02): taken through the SANCTIONED helper, not by hand. The lock IS
 * a transaction-level try-lock — `pipeline.withAdvisoryLock(pool, COHORT_BRACKET_LOCK_ID, …)` opens
 * its own `BEGIN`, issues `pg_try_advisory_xact_lock($1)` on its OWN dedicated client (never the
 * pool the queries use, so the lock lives exactly as long as the enclosing transaction) and COMMITs
 * to release it; a killed backend drops the transaction and the lock with it, so no zombie lock can
 * form and no explicit unlock is needed (Spec 47 §5). The whole bracket body from the identity guard
 * through the restore runs inside the callback, so the table it reasons about cannot be moved by a
 * second bracket between acquiring the lock and the perturbation's COMMIT. `runSide` refuses
 * (`{acquired:false}`) rather than queues; `{ skipEmit: false }` keeps the helper from emitting a
 * PIPELINE_SUMMARY skip payload, which would be wrong for an analysis script that is not a step.
 *
 * The VALUE collides with nothing. Chosen by grepping the live tree for every advisory-lock literal:
 *   grep -rnE 'ADVISORY_LOCK_ID\s*=\s*[0-9]+|pg_advisory|pg_try_advisory' scripts/ src/
 * → the per-step registry occupies 2, 5, 11, 12, 30, 40, 44-46, 53, 55-66, 76, 78, 80-99, 102-126,
 *   195, 4201-4205; the chain/namespace locks live in the 2-arg keyspace
 *   (the 2-argument chain advisory lock keyed on hashtext of "chain_<id>", Spec 40) and cannot collide with a 1-arg
 *   lock id. A six-digit id in the 9xxxxx range is unused by construction, and NOTABLY it is NOT the
 *   step's own lock 64 (scripts/enrich-centreline.js) — taking 64 here would make the spawn at step
 *   (5) self-skip on the bracket's own lock, turning every capture into a void differential.
 */
const COHORT_BRACKET_LOCK_ID = 902001;

// The five columns the step WRITES (plus the stamp that selects the work set). PROJ MUST equal
// the projection the capture is later run with (`--table-columns=parcels:<these>`), or the two
// hashes are not comparable — 486,530 rows × 6 projected cols = 2.9M cells, comfortably under
// capture-step-golden.js's WIDE_TABLE_CELL_THRESHOLD (10M), so the harness takes its UNCHANGED
// narrow path (single `string_agg(ROW(...)::text, '|' ORDER BY …)`) — the one reproduced here.
const PROJ = [
  'id',
  'is_corner_lot',
  'is_through_lot',
  'primary_frontage_street_name',
  'abuts_laneway',
  'centreline_dataset_version_when_enriched',
];
// The five step-written VALUE columns (PROJ minus the id and the stamp) — the keys of each row's
// stored `baseline` literal (Fold A9).
const BASELINE_COLS = PROJ.filter((c) => c !== 'id' && c !== 'centreline_dataset_version_when_enriched');
// The projected row hash of `table`'s PK-ordered rows, in the harness's narrow-table form.
// `hashOf(TABLE)` is `HASH_SQL` below; `hashOf('parcels_backup_…')` hashes a --backup copy
// (brief x2) so the two tables can be proven byte-identical before a destructive bracket.
const rowText = rowTextExpr(PROJ);
const orderBy = orderByClause({ orderColumns: ['id'], pkColumns: [], allColumns: [] });
const HASH_SQL = `SELECT md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS h FROM ${TABLE} ${TABLE_ALIAS}`;
function hashOf(table) {
  if (!/^[a-z_][a-z0-9_]*$/.test(String(table))) throw new Error(`refusing to build a hash for table name ${JSON.stringify(table)}`);
  return `SELECT md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS h FROM ${table} ${TABLE_ALIAS}`;
}

/**
 * F3 (idempotency lens, 2026-10-02): the precondition for perturbing ANY row. A perturbation is
 * only reversible if a before-image exists AND its projected hash equals the baseline we intend to
 * leave behind — otherwise a capture would write 2,000 live rows with nothing provably restorable.
 * PURE: no DB, no reads — the caller resolves `exists` and `backupHash`, and this decides.
 * Plan Fold A9: "before EVERY capture: restore => assert hash == baseline".
 */
function backupPrecondition({ exists, backupHash, baseline }) {
  if (!exists) {
    return {
      ok: false,
      reason: '--backup-table does not exist — take --backup first; refusing to perturb without a before-image',
    };
  }
  if (backupHash !== baseline) {
    return {
      ok: false,
      reason: `--backup-table hash ${JSON.stringify(backupHash)} != cohort baseline ${JSON.stringify(baseline)} — ` +
        'the before-image does not describe the state we are about to overwrite; re-take --backup',
    };
  }
  return { ok: true };
}

/**
 * F4 (idempotency lens, 2026-10-02): is `a` the same source as `b`, ignoring line-ending style?
 * PURE. A git object stores LF, so `git show <ref>:path` never carries CRLF, while the working
 * tree MAY (core.autocrlf) — an exact string compare would refuse a tree that genuinely holds the
 * legacy step. Normalise every CRLF to LF first, then compare.
 */
function sameSource(a, b) {
  return String(a).replace(/\r\n/g, '\n') === String(b).replace(/\r\n/g, '\n');
}

/**
 * N5 (idempotency lens, 2026-10-02): is `ref` a plain git ref, safe to hand to `git show <ref>:path`?
 * PURE, no git, no DB. A value beginning with `-` is parsed by git as an OPTION, not a revision:
 * `--legacy-ref=--output=/tmp/x` turns the PRE precondition's argument vector into
 * `git show --output=/tmp/x:scripts/enrich-centreline.js`, which either fails in a confusing way or
 * (worse, for other option shapes) makes git act on something the operator never named. The ref is
 * entirely operator-supplied and is interpolated BY US into an execFile argv, so refuse a leading
 * dash and any character git refs cannot legally carry, HERE, before the spawn. Allowed: the git ref
 * grammar's unreserved set — letters, digits, `_ . / ~ ^ -` — with the FIRST character additionally
 * forbidden from being `-`. (git further forbids `..`, `@{`, trailing `.lock`, etc.; those are
 * rejected by git itself with a clear message, so validating them here would only duplicate it.)
 */
function validLegacyRef(ref) {
  return typeof ref === 'string' && /^[A-Za-z0-9_.\/~^][A-Za-z0-9_.\/~^-]*$/.test(ref);
}

/**
 * F4 (idempotency lens, 2026-10-02): the converted step's marker. PURE. A step authored through the
 * descriptor/pipeline contract is `pipeline.step(...)`; the legacy hand-written step is not. This is
 * the predicate runSide's PRE/POST preconditions consult so PRE can never record the converted
 * shim's output as the legacy golden (a void differential) and POST can never run the legacy file.
 */
function isConvertedShim(text) {
  return String(text).includes('pipeline.step(');
}

// The four strata. A SAMPLING PLAN, NOT TUNABLES: the sizes below are what the committed cohort
// IS, and the mix is what makes the differential speak to every output column —
//   corner/through/plain exercise the three classifier booleans (and their cross terms),
//   laneway exercises `abuts_laneway` (§8d), and all four carry a non-null
//   `primary_frontage_street_name` for most rows (the name-coverage half of the step).
// They partition the stamped + valid-geom population exactly; the four predicates are mutually
// exclusive, so the disjointness assertion below can only fail on an id-duplication bug.
const STRATA = [
  { name: 'corner', n: 500, where: 'p.is_corner_lot' },
  { name: 'through', n: 300, where: 'p.is_through_lot AND NOT p.is_corner_lot' },
  { name: 'laneway', n: 500, where: 'p.abuts_laneway AND NOT p.is_corner_lot AND NOT p.is_through_lot' },
  { name: 'plain', n: 700, where: 'NOT p.is_corner_lot AND NOT p.is_through_lot AND NOT p.abuts_laneway' },
];
const COHORT_SIZE = STRATA.reduce((n, s) => n + s.n, 0); // 2,000

const SIDES = ['pre', 'post'];
const CHAINS = ['sources', 'none'];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`enrich-centreline-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor
  // exemption (src/tests/resolve-db.logic.test.ts). This read-only/restore harness has no
  // reason to run below it. `expectDatabase` pins the target so a half-set PG_* triple cannot
  // silently land on the pre-cutover DB the resolver exists to refuse.
  return createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    derive: false,
    backup: false,
    run: false,
    restore: false,
    selfTest: false,
    help: false,
    seed: null,
    side: null,
    chain: 'sources',
    out: null,
    backupTable: null,
    forceFull: false,
    legacyRef: null,
    overwrite: false,
  };
  for (const a of argv) {
    if (a === '--derive') out.derive = true;
    else if (a === '--backup') out.backup = true;
    else if (a === '--run') out.run = true;
    else if (a === '--restore') out.restore = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--force-full') out.forceFull = true;
    else if (a === '--overwrite') out.overwrite = true;
    else if (a.startsWith('--seed=')) out.seed = a.slice('--seed='.length);
    else if (a.startsWith('--side=')) out.side = a.slice('--side='.length);
    else if (a.startsWith('--chain=')) out.chain = a.slice('--chain='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a.startsWith('--backup-table=')) out.backupTable = a.slice('--backup-table='.length);
    else if (a.startsWith('--legacy-ref=')) out.legacyRef = a.slice('--legacy-ref='.length);
    else throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
  }
  // F5 (idempotency lens, 2026-10-02): EXACTLY ONE mode per invocation. Previously several modes
  // could be set at once and main() silently ran only the first, so `--derive --run` derived and
  // dropped the run (and `--derive --backup` orphaned the intended before-image). Count the modes
  // and refuse a multi-mode argv here, at the single point every entry path parses through.
  const MODES = ['derive', 'backup', 'run', 'restore', 'selfTest'];
  const modeCount = MODES.filter((m) => out[m]).length;
  if (modeCount > 1) {
    throw new Error('pass exactly one of --derive|--backup|--run|--restore|--self-test');
  }
  if (out.side !== null && !SIDES.includes(out.side)) {
    throw new Error(`--side must be one of ${SIDES.join('|')}, got ${JSON.stringify(out.side)}`);
  }
  if (out.chain !== null && !CHAINS.includes(out.chain)) {
    throw new Error(`--chain must be one of ${CHAINS.join('|')}, got ${JSON.stringify(out.chain)}`);
  }
  // A forced FULL recompute and a PRE capture are mutually exclusive: PRE must record the state
  // the step actually starts from, and `ENRICH_CENTRELINE_FORCE_FULL` rewrites every stamped
  // parcel (not the cohort's rows) — the pair would produce a PRE that no longer describes the
  // differential's baseline. Refuse rather than silently ignore one of them.
  if (out.forceFull && out.side === 'pre') {
    throw new Error('--force-full cannot be combined with --side=pre: PRE must capture the un-forced starting state');
  }
  return out;
}

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

/**
 * The R-AS perturbation of one row, computed from the STORED baseline literal (Fold A9) — never
 * from the row's current values. Pure. Each boolean is negated, the two non-boolean columns are
 * nulled: a re-run that re-derives the exact same values must return the hash to `baseline_hash`.
 */
function perturbedOf(b) {
  return {
    is_corner_lot: !b.is_corner_lot,
    is_through_lot: !b.is_through_lot,
    abuts_laneway: !b.abuts_laneway,
    primary_frontage_street_name: null,
    centreline_dataset_version_when_enriched: null,
  };
}

/** The seeded `enrich_centreline_proximity_m` default (§8h logic variable — NEVER a new literal here). */
function readProximityDefault() {
  const doc = JSON.parse(fs.readFileSync(LOGIC_VARIABLES_PATH, 'utf8'));
  const v = doc.enrich_centreline_proximity_m;
  if (!v || typeof v.default !== 'number' || !Number.isFinite(v.default)) {
    throw new Error(`scripts/seeds/logic_variables.json has no numeric enrich_centreline_proximity_m.default — refusing to invent a radius`);
  }
  return v.default;
}

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive(args) {
  // F5 (idempotency lens, 2026-10-02): an explicit seed is required — the old UTC-date default made
  // the sampling stream silently change at midnight, so a re-derive could pick a different cohort
  // than the one recorded. Refuse rather than default.
  if (args.seed === null || args.seed === '') {
    throw new Error('--derive requires an explicit --seed=<value>');
  }
  const seed = args.seed;
  // F5: never silently replace cohort.json. The committed cohort is a golden artefact; a re-derive
  // that overwrote it would orphan the matching before-image / PRE capture. --overwrite is the
  // operator's explicit consent.
  if (fs.existsSync(COHORT_PATH) && !args.overwrite) {
    throw new Error(
      `${path.relative(REPO_ROOT, COHORT_PATH)} already exists — refusing to overwrite the committed cohort ` +
      `(a re-derive would orphan the matching before-image / PRE capture). Pass --overwrite to replace it.`,
    );
  }
  const proximityM = readProximityDefault();
  const c = require('../lib/compute/enrich-centreline');

  const pool = makePool('enrich-centreline-cohort-differential:derive');
  console.log(`[cohort] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  console.log(`[cohort] seed=${seed} proximity_m=${proximityM} (seeds/logic_variables.json default)`);
  try {
    // (a) The §3.11 contract, read through the CONVERTED step's own reader (one definition).
    const probe = await pool.connect();
    let contract;
    try {
      contract = await c.readCentrelineContract(probe);
    } finally {
      probe.release();
    }
    console.log(`[cohort] contract: mode=${contract.mode} lastVersion=${contract.lastVersion} sourceDatasetVersion=${contract.sourceDatasetVersion} staleCount=${contract.staleCount}`);
    if (contract.mode !== 'incremental' || contract.lastVersion !== contract.sourceDatasetVersion) {
      throw new Error(
        `refusing to derive: the next enrich_centreline run would be mode=${contract.mode} ` +
        `(lastVersion=${JSON.stringify(contract.lastVersion)} vs sourceDatasetVersion=${JSON.stringify(contract.sourceDatasetVersion)}). ` +
        `The cohort must be taken against an INCREMENTAL state — run the producer/consumer chain to completion ` +
        `(node -r dotenv/config scripts/run-chain.js --chain=sources), then re-derive.`,
      );
    }
    const version = contract.sourceDatasetVersion;

    // (b) RC-1 absorption: rows the step WILL write whose stamp is NOT the version are outside
    // this cohort's literal BASELINE, so a run over them moves the hash for a reason the
    // differential does not model. Any such row ⇒ refuse (the legacy run drains exactly this set).
    const absorption = await readOnlyQuery(
      pool,
      `SELECT count(*)::int AS n FROM parcels p
        WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)
          AND p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1
          AND EXISTS (SELECT 1 FROM toronto_centreline c
                       WHERE ST_DWithin(p.geom::geography, c.geom::geography, $2))`,
      [version, proximityM],
    );
    const staleCount = absorption[0].n;
    console.log(`[cohort] RC-1 absorption (stale stamp within ${proximityM} m): ${staleCount}`);
    if (staleCount > 0) {
      throw new Error(
        `refusing to derive: ${staleCount} valid-geom parcel(s) carry a stamp != ${version} yet sit within ` +
        `${proximityM} m of a centreline — the next run would rewrite them and move the table hash outside this ` +
        `cohort's BASELINE. Remedy: run \`node -r dotenv/config scripts/enrich-centreline.js\` (legacy) once, then re-derive.`,
      );
    }

    // (c) Four strata, seeded and deterministic. `ORDER BY md5(p.id::text || ':' || $2)` is a
    // function of (id, seed) only, so the same seed re-derives the same rows on any host.
    const rows = [];
    const seenIds = new Set();
    for (const s of STRATA) {
      const picked = await readOnlyQuery(
        pool,
        `SELECT p.id, ${BASELINE_COLS.map((col) => `p.${col}`).join(', ')}
           FROM parcels p
          WHERE p.centreline_dataset_version_when_enriched = $1
            AND p.geom IS NOT NULL AND ST_IsValid(p.geom)
            AND ${s.where}
          ORDER BY md5(p.id::text || ':' || $2)
          LIMIT ${s.n}`,
        [version, seed],
      );
      if (picked.length < s.n) {
        throw new Error(`stratum ${s.name} is SHORT: sampled ${picked.length} of ${s.n} (predicate: ${s.where}) — the stamped population cannot support this cohort; re-derive after the next incremental run.`);
      }
      for (const r of picked) {
        if (seenIds.has(r.id)) throw new Error(`cohort id ${r.id} appears in more than one stratum — the four predicates must partition the population`);
        seenIds.add(r.id);
        rows.push({
          id: r.id,
          stratum: s.name,
          baseline: Object.fromEntries(BASELINE_COLS.map((col) => [col, r[col]])),
        });
      }
      console.log(`[cohort] stratum ${s.name}: ${picked.length}/${s.n}`);
    }
    if (rows.length !== COHORT_SIZE) throw new Error(`cohort has ${rows.length} rows, expected ${COHORT_SIZE}`);

    // (d) Anchor facts. `cohortIds` goes to the negative control as a `bigint[]` (never a text
    // array — `parcels.id` is bigint, so a text array would not compare).
    const cohortIds = rows.map((r) => r.id);
    const centreline = (
      await readOnlyQuery(
        pool,
        `SELECT count(*)::int AS count, min(id) AS min_id, max(id) AS max_id,
                md5(string_agg(id::text, ',' ORDER BY id)) AS ids_md5
           FROM toronto_centreline`,
      )
    )[0];
    const negative = (
      await readOnlyQuery(
        pool,
        `SELECT count(*)::int AS count, md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS hash
           FROM parcels ${TABLE_ALIAS}
          WHERE centreline_dataset_version_when_enriched IS NULL
            AND NOT (id = ANY($1::bigint[]))`,
        [cohortIds],
      )
    )[0];
    const baseline = (await readOnlyQuery(pool, HASH_SQL))[0].h;
    if (!baseline) throw new Error('baseline_hash is null — the parcels table is empty?');

    const cohort = {
      generated_at: new Date().toISOString(),
      seed,
      producer_version: PRODUCER_VERSION,
      last_enriched_version: contract.lastVersion,
      // F5 (idempotency lens, 2026-10-02): runSide's §7 guard compares
      // `readCentrelineContract().sourceDatasetVersion` (readContract → readCentrelineContract)
      // against `cohort.source_dataset_version`. derive previously never wrote this key, so
      // `cohort.source_dataset_version != null` was always false and the guard was DEAD. Write the
      // SAME value the guard reads — `contract.sourceDatasetVersion`, the very field assert (b)'s
      // incremental gate already requires to equal lastVersion — so the guard is live.
      source_dataset_version: contract.sourceDatasetVersion,
      stale_count: contract.staleCount,
      proximity_m: proximityM,
      predicates: { hash: HASH_SQL, strata: STRATA.map((s) => ({ name: s.name, n: s.n, where: s.where })) },
      centreline: {
        count: centreline.count,
        min_id: centreline.min_id,
        max_id: centreline.max_id,
        ids_md5: centreline.ids_md5,
      },
      negative_control: { count: negative.count, hash: negative.hash },
      baseline_hash: baseline,
      rows: rows.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    };
    fs.mkdirSync(path.dirname(COHORT_PATH), { recursive: true });
    fs.writeFileSync(COHORT_PATH, JSON.stringify(cohort, null, 2) + '\n');
    console.log(`[cohort] written: ${COHORT_PATH}`);
    console.log(`[cohort]   rows=${cohort.rows.length} (${STRATA.map((s) => `${s.name}:${s.n}`).join(' ')})`);
    console.log(`[cohort]   toronto_centreline=${centreline.count} (min ${centreline.min_id} / max ${centreline.max_id} / ${centreline.ids_md5})`);
    console.log(`[cohort]   negative_control=${negative.count} rows, hash ${negative.hash}`);
    console.log(`[cohort]   baseline_hash=${baseline}`);
  } finally {
    await pool.end();
  }
}

// ── ec2-x2: --backup / --run / --restore ─────────────────────────────────────
//
// The R-AS capture bracket (Fold A9 + RC-1, assessment §9 step 4). A capture is a
// PRODUCTION WRITE (lessons.md 2026-10-01) — the step itself recomputes the perturbed
// cohort — so the restore is not optional and runs UNCONDITIONALLY in `finally`. The
// shape is the massing-cohort-differential.js `run()` bracket: assert baseline → apply
// the STORED perturbation → assert != baseline → capture → assert → restore → re-hash.
//
// Every argument is validated BEFORE a pool is created (the brief's Stop clause): a
// mistyped `--side`/`--out`/`--backup-table` must cost seconds and touch NO database,
// never a 2,000-row write followed by a refusal.

const BACKUP_TABLE_RE = /^parcels_centreline_bak_\d{8}t\d{4}z$/;
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden/enrich_centreline');

/**
 * The five columns the restore bracket must put back — the restore's SET list AND its
 * `IS DISTINCT FROM` guard, in PROJ order. This is `PROJ` minus `id`, NOT `BASELINE_COLS`: the
 * perturbation (~:648) NULLs `centreline_dataset_version_when_enriched` too, and `HASH_SQL`
 * projects it, so a 4-column SET would leave the stamp NULL and the row could never return to
 * baseline_hash — every later --run would then refuse. The column set is exactly what the
 * projected hash measures, so restore ≠ baseline is impossible by construction.
 */
const RESTORE_SET_COLS = PROJ.filter((c) => c !== 'id');

/**
 * `docs/reports/golden/enrich_centreline/<side>/<name>.json` — the ONLY capture location this
 * harness accepts. Resolved (absolute) with every separator normalised to `/` so a Windows
 * backslash path is validated exactly like a POSIX one (the harness's own `isPostCapturePath`
 * does the same).
 */
function resolveCaptureOut(out, side) {
  if (typeof out !== 'string' || out.length === 0) throw new Error('--run requires --out=<path under docs/reports/golden/enrich_centreline/<side>/>');
  const abs = resolveRepoPath(out);
  const norm = abs.split('\\').join('/');
  const expectedDir = `${GOLDEN_ROOT.split('\\').join('/')}/${side}/`;
  if (!norm.startsWith(expectedDir)) {
    throw new Error(`--out must live under docs/reports/golden/enrich_centreline/${side}/ (got ${out}) — the capture slug and the pre/post pair are fixed by Fold A9`);
  }
  if (!norm.endsWith('.json') || norm.length <= expectedDir.length + '.json'.length) {
    throw new Error(`--out must name a <name>.json file directly under docs/reports/golden/enrich_centreline/${side}/ (got ${out})`);
  }
  return abs;
}

/** A `--backup-table` name, or refuse. Validated before any pool/work. */
function requireBackupTableArg(t) {
  if (typeof t !== 'string' || !BACKUP_TABLE_RE.test(t)) {
    throw new Error(`--backup-table must match /^parcels_centreline_bak_\\d{8}t\\d{4}z$/ (got ${JSON.stringify(t)}) — it names a before-image that must be identifiable and disposable`);
  }
  return t;
}

/** The 5-column `SET` list, `p.`-qualified on the left and `b.`-qualified on the right. */
function restoreAssignments() {
  return RESTORE_SET_COLS.map((c) => `${c} = b.${c}`).join(', ');
}

/** The `ROW(p.<5 cols>) IS DISTINCT FROM ROW(b.<5 cols>)` guard — restores ONLY the moved rows. */
function restoreDifferenceGuard() {
  const left = RESTORE_SET_COLS.map((c) => `p.${c}`).join(', ');
  const right = RESTORE_SET_COLS.map((c) => `b.${c}`).join(', ');
  return `ROW(${left}) IS DISTINCT FROM ROW(${right})`;
}

/**
 * F2 (idempotency lens, 2026-10-02): a restore may ONLY touch the cohort rows. This is the guard
 * that makes that structural: an empty/missing id array would silently mean "no predicate", i.e.
 * a whole-table UPDATE against the before-image — derived, NOT an assertion.
 */
function assertRestoreIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(
      `assertRestoreIds: refusing to restore with ${Array.isArray(ids) ? 'an empty' : 'a non-array'} id list — ` +
      'a restore without cohort ids would revert every row the backup happens to hold',
    );
  }
}

/**
 * fx7 (idempotency lens, 2026-10-02): the signal FENCE, as a pure function of the run's signal state.
 *
 * fx6 installs handlers so a Ctrl-C does not kill the parent outright — but until this gate existed the
 * handler only LOGGED. A signal delivered BEFORE the step is spawned (while the identity guard, the
 * before-image hash or the baseline repair is in flight) therefore did not stop the run: control walked
 * on to the perturbation's COMMIT and to `execFileSync`, so the operator's abort became a durable write
 * followed by a spawned step. This helper is the fence: `runSide` calls it immediately before the
 * perturbation's `BEGIN` and again immediately before `execFileSync`, so a signal observed at either
 * point throws out through the SAME `finally` that restores. It is pure and string-free of state so the
 * self-test can assert both branches without a database or a real signal.
 *
 * Deliberate: only `interrupted === true` aborts. A missing/undefined state is a no-op, so the call is
 * safe on any path that never installed the flag.
 */
function abortIfInterrupted(state) {
  if (state && state.interrupted === true) {
    throw new Error('interrupted by signal before the perturbation/step — nothing further will run');
  }
}

/**
 * The EXACT `UPDATE` text `restoreFromBackup` runs, as a pure function of the before-image table.
 *
 * F2 (idempotency lens, 2026-10-02): the `p.id = ANY($1::bigint[])` predicate is the whole point —
 * the previous form restored EVERY parcels row that differed from a full-table backup, so a run that
 * threw BEFORE perturbing (identity guards) still reverted rows a legitimate load/enrich had rewritten
 * since the backup. Scoping to the cohort ids makes the restore a no-op for every other row, so the
 * bracket can only ever undo its own perturbation.
 */
function restoreSql(table) {
  return `UPDATE ${TABLE} p SET ${restoreAssignments()}
       FROM ${table} b
      WHERE p.id = b.id
        AND p.id = ANY($1::bigint[])
        AND (${restoreDifferenceGuard()})`;
}

/**
 * The negative control (`--derive` step d): valid-geom, never-stamped parcels NOT in the cohort.
 * `{count, hash}` — both must be unchanged across the bracket, or the run wrote rows OUTSIDE the
 * cohort for a reason the differential does not model.
 */
async function negativeControl(pool, cohortIds) {
  const rows = await pool.query(
    `SELECT count(*)::int AS count, md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS hash
       FROM parcels ${TABLE_ALIAS}
      WHERE centreline_dataset_version_when_enriched IS NULL
        AND NOT (id = ANY($1::bigint[]))`,
    [cohortIds],
  );
  return { count: rows.rows[0].count, hash: rows.rows[0].hash };
}

/**
 * N3 (idempotency lens, 2026-10-02): the projected row hash of the COHORT rows ONLY —
 * `id = ANY($1::bigint[])` — so the bracket's log can state "cohort restored" and "non-cohort drift"
 * as two SEPARATE facts. The full-table hash conflates them: a mismatch after a restore is
 * ambiguous between "the cohort was not put back" and "some other writer changed parcels outside the
 * cohort since --derive", and the refusal at step (3) exists precisely because the second case is
 * real. Same machinery as HASH_SQL / negativeControl (rowText/orderBy), only the id predicate differs.
 */
async function cohortHash(pool, cohortIds) {
  const rows = await pool.query(
    `SELECT md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS h
       FROM ${TABLE} ${TABLE_ALIAS}
      WHERE ${TABLE_ALIAS}.id = ANY($1::bigint[])`,
    [cohortIds],
  );
  return rows.rows[0].h;
}

/** The live `toronto_centreline` identity — the §7 producer-stability witness. */
async function centrelineIdentity(pool) {
  const rows = await pool.query(
    `SELECT count(*)::int AS count, min(id) AS min_id, max(id) AS max_id,
            md5(string_agg(id::text, ',' ORDER BY id)) AS ids_md5
       FROM toronto_centreline`,
  );
  return rows.rows[0];
}

/** Read the §3.11 contract through the CONVERTED step's own reader (one definition, never a copy). */
async function readContract(pool) {
  const client = await pool.connect();
  try {
    return await require('../lib/compute/enrich-centreline').readCentrelineContract(client);
  } finally {
    client.release();
  }
}

function loadCohort() {
  if (!fs.existsSync(COHORT_PATH)) {
    throw new Error(`no cohort at ${COHORT_PATH} — run --derive first (and commit the file before the first capture)`);
  }
  const cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
  if (!Array.isArray(cohort.rows) || cohort.rows.length !== COHORT_SIZE) {
    throw new Error(`cohort has ${Array.isArray(cohort.rows) ? cohort.rows.length : 'no'} rows, expected ${COHORT_SIZE} — re-derive`);
  }
  if (typeof cohort.baseline_hash !== 'string' || !cohort.baseline_hash) {
    throw new Error('cohort.baseline_hash is missing — re-derive');
  }
  return cohort;
}

/**
 * --backup: freeze the cohort's columns into a disposable before-image table.
 *
 * Refuses (all BEFORE a pool exists where the args can be judged statically): a
 * `--backup-table` that is not the `parcels_centreline_bak_<yyyymmddthhmmz>` shape. Refuses
 * (after connecting, because both are facts about the DB) a name that already resolves, and a
 * live hash that is not the cohort's baseline (there is nothing to back up that is known-good).
 */
async function backup(args) {
  const table = requireBackupTableArg(args.backupTable);
  const cohort = loadCohort();
  const pool = makePool('enrich-centreline-cohort-differential:backup');
  console.log(`[cohort:backup] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    const exists = (await pool.query('SELECT to_regclass($1) AS r', [table])).rows[0].r;
    if (exists !== null) {
      throw new Error(`--backup-table ${table} already exists (${exists}) — refusing to overwrite a before-image; pick a fresh <yyyymmddthhmmz> name`);
    }
    const live = (await pool.query(HASH_SQL)).rows[0].h;
    if (live !== cohort.baseline_hash) {
      throw new Error(`refusing to back up: live parcels hash ${live} !== cohort.baseline_hash ${cohort.baseline_hash} — re-derive (--derive) first; a backup of an unknown state cannot certify a bracket`);
    }
    await pool.query(`CREATE TABLE ${table} AS SELECT ${PROJ.join(', ')} FROM ${TABLE}`);
    await pool.query(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`);
    const copied = (await pool.query(hashOf(table))).rows[0].h;
    if (copied !== cohort.baseline_hash) {
      throw new Error(`backup ${table} hash ${copied} !== cohort.baseline_hash ${cohort.baseline_hash} — the copy is not byte-identical to the baseline; DROP ${table} and investigate`);
    }
    console.log(`[cohort:backup] wrote ${table} (${PROJ.length} cols, hash ${copied} = baseline)`);
    console.log(`[cohort:backup] ${table}`);
  } finally {
    await pool.end();
  }
}

/**
 * Put the cohort's five columns back from the before-image, in ONE transaction, ONLY where a row
 * differs (`IS DISTINCT FROM`) so a no-op restore writes nothing and preserves every other column's
 * xmin, and ONLY for `ids` (F2) so a restore can never revert parcels outside the cohort. Returns the
 * number of rows restored. Shared by --restore and the --run `finally`.
 */
async function restoreFromBackup(pool, table, ids) {
  assertRestoreIds(ids);
  const res = await pool.query(restoreSql(table), [ids]);
  return res.rowCount;
}

/** --restore: the standalone undo. Prints the post-restore hash against the baseline. */
async function restore(args) {
  const table = requireBackupTableArg(args.backupTable);
  const cohort = loadCohort();
  const pool = makePool('enrich-centreline-cohort-differential:restore');
  console.log(`[cohort:restore] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    const exists = (await pool.query('SELECT to_regclass($1) AS r', [table])).rows[0].r;
    if (exists === null) throw new Error(`--backup-table ${table} does not exist — nothing to restore from`);
    // F2: standalone --restore is scoped to the cohort ids exactly as runSide derives them.
    const cohortIds = cohort.rows.map((r) => r.id);
    const restored = await restoreFromBackup(pool, table, cohortIds);
    const live = (await pool.query(HASH_SQL)).rows[0].h;
    const ok = live === cohort.baseline_hash;
    console.log(`[cohort:restore] restored ${restored} row(s) from ${table}`);
    console.log(`[cohort:restore] hash ${live} ${ok ? '(baseline OK)' : `(BASELINE MISMATCH — expected ${cohort.baseline_hash})`}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

/** The standalone undo an operator can run by hand while the bracket is suspended on a signal. */
function recoveryCommand(table) {
  return `node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --restore --backup-table=${table}`;
}

/**
 * fx6 (idempotency lens, 2026-10-02): the Ctrl-C fence.
 *
 * Step (5) spawns the step through a BLOCKING `execFileSync`. Without a signal handler, Ctrl-C
 * kills the PARENT outright: `finally` never runs, the 2,000 perturbed rows stay on disk, and the
 * operator is left holding a table that no longer matches `baseline_hash`.
 *
 * With a handler INSTALLED, Node does NOT take its default action on SIGINT/SIGTERM — the process
 * keeps running. The child (a separate process) dies, the in-flight `execFileSync` throws into the
 * existing catch, and control reaches `finally`, which restores. This is the whole mechanism, and it
 * is deliberate that the handler writes nothing to the database: everything it would need to do is
 * already `finally`'s job, so a second, racing writer here could only corrupt the restore it is
 * trying to protect. Both listeners are removed at the END of `finally` so a second signal is once
 * again fatal — an unrestorable bracket must remain interruptible.
 *
 * fx7: the handler ALSO latches `state.interrupted`, so a signal seen BEFORE the step is spawned is
 * not merely logged — see abortIfInterrupted(), which runSide calls immediately before the
 * perturbation's BEGIN and again immediately before execFileSync.
 */
function onSignal(state, signal) {
  state.interrupted = true;
  console.error(`[cohort] signal received (${signal}) — aborting before the next write; the bracket restores what it changed`);
}

function installSignalHandlers(state) {
  process.on('SIGINT', (signal) => onSignal(state, signal));
  process.on('SIGTERM', (signal) => onSignal(state, signal));
}

function removeSignalHandlers() {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
}

/**
 * --run --side=pre|post: the R-AS capture bracket.
 *
 *   1. refuse any argument that cannot be honoured (side/chain/out/backup-table, and the D2
 *      `--force-full` ⇒ `--side=post` rule) BEFORE a pool exists;
 *   2. §7 identity guard — the producer's centreline identity AND the §3.11 contract must be
 *      EXACTLY what `--derive` recorded, or a producer/self run happened since (re-derive);
 *   3. if the live hash is not baseline, restore from the before-image and re-assert — the
 *      bracket must never start from an unknown state;
 *   4. apply the STORED perturbation (nulls + negated booleans from `cohort.rows[].baseline`,
 *      never `NOT x` on the live row — Fold A9) in ONE committed txn, then assert the hash moved;
 *   5. spawn the REAL step through capture-step-golden.js — `ENRICH_CENTRELINE_FORCE_FULL=1`
 *      only for the D2 POST full-mode proof;
 *   6. assert the R-AS claims against the harness summary and the post-run DB;
 *   7. finally: restore if the hash is not baseline, print `restored:`, set exitCode 1 on any
 *      failed assertion OR an unrestored table, and close the pool (no process.exit()).
 */
async function runSide(args) {
  // ── (1) argument validation — NOTHING here touches a database. ──
  if (!SIDES.includes(args.side)) {
    throw new Error(`--run requires --side=${SIDES.join('|')}, got ${JSON.stringify(args.side)}`);
  }
  if (!CHAINS.includes(args.chain)) {
    throw new Error(`--run requires --chain=${CHAINS.join('|')}, got ${JSON.stringify(args.chain)}`);
  }
  if (args.forceFull && args.side !== 'post') {
    throw new Error('--force-full is the D2 POST full-mode proof and is refused with --side=pre: PRE must capture the un-forced starting state the baseline of the differential describes');
  }
  const table = requireBackupTableArg(args.backupTable);
  const out = resolveCaptureOut(args.out, args.side);
  const chain = args.chain;
  const force = args.forceFull === true;
  const stepPath = 'scripts/enrich-centreline.js';
  // F4 (idempotency lens, 2026-10-02): `stepPath` is hard-coded to scripts/enrich-centreline.js,
  // which in the conversion worktree is the CONVERTED shim. A `--side=pre` run there would record
  // the converted step's output as the PRE golden — a void differential. PRE therefore requires the
  // operator to name (via --legacy-ref) a commit whose scripts/enrich-centreline.js is the legacy
  // step, and this gate proves the WORKING file it is about to run IS that legacy file (load_heritage
  // precedent: run PRE from a tree holding the legacy file). POST is the mirror: it must be the shim.
  // This runs BEFORE makePool() — no DB is touched when the precondition refuses.
  {
    const { execFileSync } = require('child_process');
    const workingPath = path.join(REPO_ROOT, stepPath);
    const working = fs.readFileSync(workingPath, 'utf8');
    if (args.side === 'pre') {
      if (!args.legacyRef) {
        throw new Error('--side=pre requires --legacy-ref=<commit whose scripts/enrich-centreline.js is the legacy step>');
      }
      // N5 (idempotency lens, 2026-10-02): the ref is interpolated into the `git show` argv below, so
      // validate it HERE, BEFORE the spawn. A leading dash would be parsed by git as an OPTION rather
      // than a revision — refuse it with the remedy rather than let `git show` fail obscurely.
      if (!validLegacyRef(args.legacyRef)) {
        throw new Error(`--legacy-ref must be a plain git ref (no leading dash), got ${JSON.stringify(args.legacyRef)} — pass the commit/ref whose scripts/enrich-centreline.js is the legacy step`);
      }
      const legacy = execFileSync(
        'git',
        ['show', `${args.legacyRef}:${stepPath}`],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
      if (isConvertedShim(working) || !sameSource(working, legacy)) {
        throw new Error(`PRE refused: ${stepPath} is not the legacy step at ${args.legacyRef} — run PRE from a tree holding the legacy file`);
      }
    } else if (!isConvertedShim(working)) {
      throw new Error(`POST refused: ${stepPath} is not the converted step`);
    }
  }
  const cohort = loadCohort();

  const pool = makePool(`enrich-centreline-cohort-differential:${args.side}`);
  const rows = cohort.rows;
  const cohortIds = rows.map((r) => r.id);
  const baseline = cohort.baseline_hash;
  console.log(`[cohort:${args.side}] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  console.log(`[cohort:${args.side}] cohort: ${rows.length} rows, chain=${chain}, force-full=${force}, out=${path.relative(REPO_ROOT, out)}`);

  let asserted = false;
  let restored = false;
  // F2 (idempotency lens, 2026-10-02): a restore in `finally` is only legitimate if THIS run
  // actually wrote the table. Set true immediately BEFORE the perturbation's COMMIT — never
  // earlier, and never derived from "the hash moved" (the hash also moves when some OTHER writer
  // did). fx7: setting it before the COMMIT (rather than after) is safe because the restore is
  // cohort-scoped and `IS DISTINCT FROM`-guarded against a hash-verified before-image, so if the
  // COMMIT never landed and the transaction rolled back, the restore matches no row and writes
  // nothing; and it closes the fx6 hole where a COMMIT that SUCCEEDED but whose reply was lost
  // left 2,000 rows perturbed with `perturbed === false`.
  let perturbed = false;
  // fx7: the latched signal state. Created BEFORE the handlers are installed so a signal cannot be
  // observed before there is somewhere to record it; `runSide` consults it via abortIfInterrupted()
  // immediately before the perturbation's BEGIN and again immediately before execFileSync.
  const sig = { interrupted: false };
  installSignalHandlers(sig);
  try {
    // ── (2a) fx9: take the bracket lock BEFORE any read that assumes we own the table. ──
    // The identity guard and the repair at (3) both reason about the table's state; taking the lock
    // first means the state they reason about cannot be moved by a second bracket between here and
    // the perturbation's COMMIT. The lock is the SANCTIONED transaction-level try-lock
    // (pipeline.withAdvisoryLock, Spec 47 §5) — it opens its own transaction on its own client, runs
    // the whole guarded body below inside the callback, and COMMITs to release. Refusing (never
    // waiting) is deliberate — see the constant's comment. `{ skipEmit: false }` keeps the helper
    // from emitting a PIPELINE_SUMMARY skip payload (this is an analysis script, not a step).
    const res = await pipeline.withAdvisoryLock(pool, COHORT_BRACKET_LOCK_ID, async () => {
      // ── (2) §7 identity guard: no producer (load_centreline) and no self run since --derive. ──
      const liveCentreline = await centrelineIdentity(pool);
      const centrelineDiffers = ['count', 'min_id', 'max_id', 'ids_md5'].filter((k) => String(liveCentreline[k]) !== String(cohort.centreline[k]));
      if (centrelineDiffers.length > 0) {
        throw new Error(
          `refusing to run: toronto_centreline identity moved since --derive (${centrelineDiffers.join(', ')}: live ` +
          `${JSON.stringify(centrelineDiffers.map((k) => liveCentreline[k]))} vs cohort ${JSON.stringify(centrelineDiffers.map((k) => cohort.centreline[k]))}) ` +
          `— a producer run happened since --derive: re-derive`,
        );
      }
      const contract = await readContract(pool);
      if (String(contract.lastVersion) !== String(cohort.last_enriched_version)) {
        throw new Error(
          `refusing to run: readCentrelineContract().lastVersion=${JSON.stringify(contract.lastVersion)} !== ` +
          `cohort.last_enriched_version=${JSON.stringify(cohort.last_enriched_version)} — a self run happened since ` +
          `--derive: re-derive`,
        );
      }
      if (cohort.source_dataset_version != null && String(contract.sourceDatasetVersion) !== String(cohort.source_dataset_version)) {
        throw new Error(
          `refusing to run: readCentrelineContract().sourceDatasetVersion=${JSON.stringify(contract.sourceDatasetVersion)} !== ` +
          `cohort.source_dataset_version=${JSON.stringify(cohort.source_dataset_version)} — the producer moved: re-derive`,
        );
      }
      const specVersion = require('../lib/compute/enrich-centreline').SPEC_VERSION;
      if (String(cohort.producer_version) !== String(specVersion)) {
        throw new Error(
          `refusing to run: cohort.producer_version=${JSON.stringify(cohort.producer_version)} !== compute SPEC_VERSION=${JSON.stringify(specVersion)} ` +
          `— the cohort was taken against a different enrich-centreline compute version: re-derive`,
        );
      }
      console.log(`[cohort:${args.side}] identity confirmed: centreline ${liveCentreline.count} (${liveCentreline.ids_md5}), lastVersion ${contract.lastVersion}, mode=${contract.mode}`);

      // ── (3) the bracket must START from the committed baseline. ──
      // F3 (idempotency lens, 2026-10-02): Fold A9's "before EVERY capture: restore => assert hash ==
      // baseline" makes the before-image a precondition, NOT a repair. Previously the backup table was
      // consulted ONLY when live != baseline, so a live-at-baseline run perturbed 2,000 rows with no
      // restorable image if the table was absent. Now the image is resolved and hash-verified FIRST —
      // the repair path below can therefore only run once a verified before-image exists.
      const backupExists = (await pool.query('SELECT to_regclass($1) AS r', [table])).rows[0].r;
      const backupHash = backupExists === null ? null : (await pool.query(hashOf(table))).rows[0].h;
      const backupOk = backupPrecondition({ exists: backupExists !== null, backupHash, baseline });
      if (!backupOk.ok) throw new Error(backupOk.reason);
      console.log(`[cohort:${args.side}] before-image verified: ${table} hash ${backupHash} == baseline ${baseline}`);

      // F2: this repair is scoped to the cohort ids too — if the table already differs from baseline
      // for a reason OUTSIDE the cohort, restoring the whole table would revert a legitimate
      // load/enrich. The re-assert below still refuses an unknown state.
      let live = (await pool.query(HASH_SQL)).rows[0].h;
      if (live !== baseline) {
        console.log(`[cohort:${args.side}] live hash ${live} != baseline ${baseline} — restoring the cohort's ${cohortIds.length} row(s) from ${table} before perturbing`);
        await restoreFromBackup(pool, table, cohortIds);
        live = (await pool.query(HASH_SQL)).rows[0].h;
        if (live !== baseline) {
          throw new Error(`still not at baseline after restoring from ${table}: hash ${live} !== ${baseline} — refusing to perturb an unknown state — non-cohort parcels rows changed since --derive; re-run --derive --seed=<same seed> --overwrite, take a fresh --backup, and redo PRE`);
        }
      }
      console.log(`[cohort:${args.side}] BASELINE hash confirmed: ${baseline}`);

      const negBefore = await negativeControl(pool, cohortIds);
      console.log(`[cohort:${args.side}] negative control before: count=${negBefore.count} hash=${negBefore.hash}`);

      // ── (4) the STORED perturbation, ONE committed transaction. ──
      // fx7: the gate. A Ctrl-C during the identity guard / hashes above latched `sig.interrupted`; if
      // it did, nothing below may run — in particular the BEGIN/COMMIT that would make the abort a write.
      abortIfInterrupted(sig);
      const pert = rows.map((r) => perturbedOf(r.baseline));
      const client = await pool.connect();
      let perturbedRows = 0;
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE ${TABLE} p SET is_corner_lot = u.c, is_through_lot = u.t, abuts_laneway = u.l,
                primary_frontage_street_name = NULL, centreline_dataset_version_when_enriched = NULL
           FROM unnest($1::bigint[], $2::bool[], $3::bool[], $4::bool[]) AS u(id, c, t, l)
          WHERE p.id = u.id`,
          [
            cohortIds,
            pert.map((p) => p.is_corner_lot),
            pert.map((p) => p.is_through_lot),
            pert.map((p) => p.abuts_laneway),
          ],
        );
        perturbedRows = upd.rowCount;
        if (perturbedRows !== rows.length) {
          throw new Error(`perturbation wrote ${perturbedRows} row(s), expected ${rows.length} — a cohort row is missing from ${TABLE}`);
        }
        // fx6 (idempotency lens, 2026-10-02): print the STANDALONE recovery command immediately BEFORE
        // the COMMIT — the exact instant the perturbation becomes durable. Everything that could be
        // lost is lost by the next statement, so the operator must not have to reconstruct the command
        // (or the before-image's name) from a stack trace in order to undo it. This is the ONLY command
        // that puts the cohort back without re-running any capture, and it is validated by
        // requireBackupTableArg() above, so the table name interpolated here is a legal before-image.
        console.log(`[cohort:${args.side}] perturbation about to COMMIT — if this run cannot finish, recover with: ${recoveryCommand(table)}`);
        // fx7: latch BEFORE the COMMIT, not after. If COMMIT succeeds server-side but its reply is
        // lost, the transaction is nevertheless durable; setting the flag afterwards would leave
        // `finally` believing nothing was written and 2,000 rows perturbed. Setting it first can only
        // ever cause a restore to run that matches no row (see the `perturbed` declaration): the
        // restore is cohort-scoped and `IS DISTINCT FROM ROW(<hash-verified before-image>)`-guarded,
        // so a rolled-back transaction restores nothing.
        perturbed = true;
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
        throw err;
      } finally {
        client.release();
      }
      const perturbedHash = (await pool.query(HASH_SQL)).rows[0].h;
      console.log(`[cohort:${args.side}] PERTURBED hash: ${perturbedHash} (${perturbedRows} rows written from stored literals)`);
      if (perturbedHash === baseline) throw new Error('perturbation did not change the hash — void differential');

      // ── (5) spawn the REAL step through the capture harness. ──
      const argv = [
        '-r', 'dotenv/config', 'scripts/analysis/capture-step-golden.js',
        `--step=${stepPath}`, `--chain=${chain}`, '--tables=parcels',
        `--table-columns=parcels:${PROJ.join(',')}`, '--table-order=parcels:id', `--out=${out}`,
      ];
      const env = { ...process.env };
      if (force) env.ENRICH_CENTRELINE_FORCE_FULL = '1';
      else delete env.ENRICH_CENTRELINE_FORCE_FULL; // an inherited value would silently force a FULL run on PRE
      console.log(`[cohort:${args.side}] running the real step: node ${argv.join(' ')}${force ? ' (ENRICH_CENTRELINE_FORCE_FULL=1)' : ''}`);
      // Bound here (not at the top of the file) so the spawn machinery is touched only on the
      // --run path — `--derive`/`--backup`/`--restore`/`--self-test` never need it — and so the
      // whole x2 half stays one self-contained block.
      const { execFileSync } = require('child_process');
      // fx7: the second gate. A signal during the perturbation/COMMIT above latched `sig.interrupted`;
      // spawning the step now would run it against a table the operator asked us to leave alone. Throwing
      // here lands in the same `finally`, which restores the cohort from the verified before-image.
      abortIfInterrupted(sig);
      const stdout = execFileSync('node', argv, {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 64,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      // The FIRST summary is the run under test: a POST capture path makes the harness run the step a
      // SECOND time (the two-run zero-writes proof) whose summary reads 0/0 by design; `.pop()` read
      // that second run and failed a genuine 2,000-row forced run (massing-cohort-differential note).
      const summaryLine = stdout.split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
      if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in the harness output');
      const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
      const metaMode = summary.records_meta && summary.records_meta.centreline_enrich
        ? summary.records_meta.centreline_enrich.mode
        : undefined;
      console.log(`[cohort:${args.side}] RUN records_updated=${summary.records_updated} (expect ${rows.length}), ` +
        `mode=${metaMode} (expect ${force ? 'full' : 'incremental'})`);

      // ── (6) assert the R-AS claims. ──
      const afterHash = (await pool.query(HASH_SQL)).rows[0].h;
      const negAfter = await negativeControl(pool, cohortIds);
      const contractAfter = await readContract(pool);

      const checks = [
        ['records_updated === cohort size', summary.records_updated === rows.length, `${summary.records_updated} vs ${rows.length}`],
        ['mode', metaMode === (force ? 'full' : 'incremental'), `${metaMode} vs ${force ? 'full' : 'incremental'}`],
        ['step restored the cohort (hash === baseline)', afterHash === baseline, `${afterHash} vs ${baseline}`],
        ['negative control unchanged', negAfter.count === negBefore.count && negAfter.hash === negBefore.hash,
          `count ${negAfter.count}/${negBefore.count}, hash ${negAfter.hash}/${negBefore.hash}`],
        ['lastVersion unchanged', String(contractAfter.lastVersion) === String(cohort.last_enriched_version),
          `${contractAfter.lastVersion} vs ${cohort.last_enriched_version}`],
      ];
      for (const [what, ok, detail] of checks) console.log(`[cohort:${args.side}] assert ${ok ? 'PASS' : 'FAIL'} ${what} (${detail})`);
      asserted = checks.every(([, ok]) => ok);
      console.log(asserted ? `[cohort:${args.side}] PASS` : `[cohort:${args.side}] FAIL`);
    }, { skipEmit: false });
    if (!res.acquired) {
      throw new Error(`another cohort bracket holds advisory lock ${COHORT_BRACKET_LOCK_ID}`);
    }
  } catch (err) {
    console.error(`[cohort:${args.side}] ERROR: ${err.message}`);
  } finally {
    // ── (7) restore — but ONLY what this run perturbed (F2). ──
    // fx9: the bracket lock (pipeline.withAdvisoryLock) released with the callback's transaction, so
    // the perturbation/capture above always ran under it and it is already gone here. There is no
    // explicit unlock left to fail or to mask `restored`/`asserted`.
    try {
      const live = (await pool.query(HASH_SQL)).rows[0].h;
      if (perturbed && live !== baseline) {
        const exists = (await pool.query('SELECT to_regclass($1) AS r', [table])).rows[0].r;
        if (exists === null) {
          console.error(`[cohort:${args.side}] POST-RUN hash ${live} != baseline ${baseline} and ${table} is gone — table left UNRESTORED`);
        } else {
          const n = await restoreFromBackup(pool, table, cohortIds);
          console.log(`[cohort:${args.side}] restore: put ${n} row(s) back from ${table}`);
        }
      } else if (!perturbed && live !== baseline) {
        console.log(`[cohort:${args.side}] this run never perturbed; the table is left as found`);
      }
      const finalHash = (await pool.query(HASH_SQL)).rows[0].h;
      restored = finalHash === baseline;
      console.log(`[cohort:${args.side}] POST-RESTORE hash: ${finalHash} ${restored ? '(baseline OK)' : '(BASELINE MISMATCH)'}`);
      // N3 (idempotency lens, 2026-10-02): the cohort-only hash as a SEPARATE fact. The full-table
      // hash above answers "is the table byte-identical to baseline", which conflates "the cohort was
      // not restored" with "something outside the cohort moved since --derive". This second line is
      // diagnostic ONLY — it does not enter `restored`/`asserted`, so no pass/fail logic changes.
      try {
        const cohortOnly = await cohortHash(pool, cohortIds);
        console.log(`[cohort:${args.side}] cohort-only hash: ${cohortOnly ? cohortOnly : '(empty — no cohort rows visible)'}`);
      } catch (err) {
        console.error(`[cohort:${args.side}] cohort-only hash unavailable: ${err.message}`);
      }
    } catch (err) {
      console.error(`[cohort:${args.side}] RESTORE FAILED: ${err.message}`);
      restored = false;
    }
    console.log(`[cohort:${args.side}] restored: ${restored}`);
    if (!asserted || !restored) process.exitCode = 1;
    // fx6: the fence comes down LAST, once the table is restored and the lock is gone. From here a
    // second signal is fatal, which is the correct default for a run with nothing left to protect.
    removeSignalHandlers();
    await pool.end();
  }
}
// ── end ec2-x2 ───────────────────────────────────────────────────────────────

// ── --self-test (no DB) ──────────────────────────────────────────────────────
function selfTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(`self-test FAILED: ${msg}`); };

  assert(HASH_SQL.includes('ROW("id", "is_corner_lot"'), `HASH_SQL is not the harness's projected row text: ${HASH_SQL}`);
  assert(HASH_SQL.includes('ORDER BY "id"'), `HASH_SQL has no explicit id order: ${HASH_SQL}`);
  assert(HASH_SQL.includes(`FROM ${TABLE} ${TABLE_ALIAS}`), `HASH_SQL does not select from ${TABLE}: ${HASH_SQL}`);
  assert(hashOf('zz_probe') === HASH_SQL.replace(`FROM ${TABLE} ${TABLE_ALIAS}`, `FROM zz_probe ${TABLE_ALIAS}`), 'hashOf() does not vary only the table name');

  // fx11: the backup-table name rule and hashOf() must agree on case, or --backup can NEVER
  // succeed. Postgres folds unquoted identifiers to lower case, so a backup name must be
  // lower-case: BACKUP_TABLE_RE accepts it AND hashOf() can build its hash (no quoting anywhere).
  const lowerBak = 'parcels_centreline_bak_20261002t1848z';
  assert(BACKUP_TABLE_RE.test(lowerBak) === true, `BACKUP_TABLE_RE must accept the lower-case backup name ${lowerBak}`);
  assert(hashOf(lowerBak).includes(`FROM ${lowerBak} ${TABLE_ALIAS}`), `hashOf() must build a hash for the backup name ${lowerBak} that BACKUP_TABLE_RE accepts`);

  const perturbed = perturbedOf({ is_corner_lot: true, is_through_lot: false, abuts_laneway: true, primary_frontage_street_name: 'Queen St W', centreline_dataset_version_when_enriched: 'v1' });
  assert(perturbed.is_corner_lot === false && perturbed.is_through_lot === true && perturbed.abuts_laneway === false, 'perturbedOf() did not negate the three booleans');
  assert(perturbed.primary_frontage_street_name === null && perturbed.centreline_dataset_version_when_enriched === null, 'perturbedOf() did not NULL the two non-boolean columns');
  const roundTrip = perturbedOf(perturbationLiteralOf(perturbed));
  assert(roundTrip.is_corner_lot === true && roundTrip.is_through_lot === false && roundTrip.abuts_laneway === true, 'perturbedOf() is not an involution on the booleans');

  assert(COHORT_SIZE === 2000, `STRATA must sum to 2000, got ${COHORT_SIZE}`);

  // F1 (idempotency lens, 2026-10-02): the restore bracket must cover EVERY column the perturbation
  // NULLs and the hash projects — the four step-written VALUE columns AND the stamp. A 4-column
  // RESTORE_SET_COLS can never put a perturbed row back to baseline_hash, so every later --run refuses.
  const expectedRestoreCols = PROJ.filter((c) => c !== 'id');
  assert(
    expectedRestoreCols.length === 5,
    `PROJ minus id must be 5 columns, got ${expectedRestoreCols.length} (${expectedRestoreCols.join(', ')})`,
  );
  assert(
    JSON.stringify(RESTORE_SET_COLS) === JSON.stringify(expectedRestoreCols),
    `RESTORE_SET_COLS must deep-equal PROJ.filter((c) => c !== 'id') in PROJ order (5 cols, stamp included); ` +
      `got ${JSON.stringify(RESTORE_SET_COLS)} vs ${JSON.stringify(expectedRestoreCols)}`,
  );
  assert(
    restoreAssignments().includes('centreline_dataset_version_when_enriched'),
    `restoreAssignments() omits the stamp column: ${restoreAssignments()}`,
  );
  assert(
    restoreDifferenceGuard().includes('centreline_dataset_version_when_enriched'),
    `restoreDifferenceGuard() omits the stamp column: ${restoreDifferenceGuard()}`,
  );

  // F2 (idempotency lens, 2026-10-02): a restore must be scoped to the COHORT ids, never the whole
  // table. Restoring every differing row reverts parcels a legitimate load/enrich rewrote since the
  // backup (possibly ~480K). assertRestoreIds() is the guard; restoreSql() carries the id predicate.
  let threw = false;
  try { assertRestoreIds([]); } catch { threw = true; }
  assert(threw, 'assertRestoreIds([]) did not throw');
  threw = false;
  try { assertRestoreIds(undefined); } catch { threw = true; }
  assert(threw, 'assertRestoreIds(undefined) did not throw');
  assertRestoreIds([1]); // must not throw

  const sql = restoreSql('parcels_centreline_bak_20261002t0000z');
  assert(
    sql.includes('p.id = ANY($1::bigint[])'),
    `restoreSql() has no cohort-id predicate: ${sql}`,
  );
  assert(
    sql.includes('FROM parcels_centreline_bak_20261002t0000z'),
    `restoreSql() does not read from the before-image table: ${sql}`,
  );

  threw = false;
  try { parseArgs(['--nope']); } catch { threw = true; }
  assert(threw, 'parseArgs accepted an unknown flag');
  threw = false;
  try { parseArgs(['--force-full', '--side=pre']); } catch { threw = true; }
  assert(threw, 'parseArgs accepted --force-full together with --side=pre');
  threw = false;
  try { parseArgs(['--side=midway']); } catch { threw = true; }
  assert(threw, 'parseArgs accepted an invalid --side');

  // F3 (idempotency lens, 2026-10-02): a perturbation without a VERIFIED before-image is
  // unrollbackable. backupPrecondition() is the pure gate that step (3) consults AFTER confirming the
  // backup table exists and is hashed — it must refuse a missing image and a drifted image, and accept
  // only an image whose projected hash equals the baseline we are about to overwrite.
  assert(
    backupPrecondition({ exists: false, backupHash: null, baseline: 'a' }).ok === false,
    'backupPrecondition accepted a nonexistent before-image',
  );
  assert(
    backupPrecondition({ exists: true, backupHash: 'b', baseline: 'a' }).ok === false,
    'backupPrecondition accepted an image whose hash != baseline',
  );
  assert(
    backupPrecondition({ exists: true, backupHash: 'a', baseline: 'a' }).ok === true,
    'backupPrecondition rejected a verified before-image',
  );

  // F5 (idempotency lens, 2026-10-02): EXACTLY ONE mode per invocation. The old parseArgs accepted
  // several modes at once and main() silently ran only the first (--derive --run derived and skipped
  // the run). Mode selection is now a counted, single-valued contract — a multi-mode argv THROWS.
  // Coverage of every declared flag is preserved across SEPARATE single-mode calls below.
  threw = false;
  try { parseArgs(['--derive', '--run']); } catch { threw = true; }
  assert(threw, 'parseArgs accepted --derive together with --run (more than one mode)');

  const parsedDerive = parseArgs(['--derive', '--seed=ec2-x', '--overwrite']);
  assert(parsedDerive.derive && parsedDerive.seed === 'ec2-x' && parsedDerive.overwrite === true, 'parseArgs dropped a declared flag or --overwrite');

  const parsedRun = parseArgs(['--run', '--side=post', '--chain=none', '--out=a.json', '--backup-table=parcels_bak', '--force-full', '--legacy-ref=abc']);
  assert(parsedRun.run && parsedRun.forceFull && parsedRun.side === 'post' && parsedRun.chain === 'none' && parsedRun.out === 'a.json' && parsedRun.backupTable === 'parcels_bak' && parsedRun.legacyRef === 'abc', 'parseArgs dropped a declared flag');
  assert(parseArgs(['--backup', '--backup-table=parcels_bak']).backup === true, 'parseArgs dropped --backup');
  assert(parseArgs(['--restore', '--backup-table=parcels_bak']).restore === true, 'parseArgs dropped --restore');
  assert(parseArgs(['--self-test']).selfTest === true, 'parseArgs dropped --self-test');

  // F4 (idempotency lens, 2026-10-02): `--side=pre` must record the LEGACY step, never the
  // converted shim. stepPath is hard-coded `scripts/enrich-centreline.js`; in the conversion
  // worktree that file is the converted shim, so PRE would capture CONVERTED output as the PRE
  // golden — a void differential. sameSource()/isConvertedShim() are the pure predicates the
  // runSide precondition consults, and --legacy-ref is the operator's declaration of the tree
  // that holds the legacy file.
  assert(sameSource('a\r\nb', 'a\nb') === true, 'sameSource() did not treat CRLF and LF as the same source');
  assert(sameSource('a', 'b') === false, 'sameSource() treated two different sources as the same');
  assert(isConvertedShim('module.exports = pipeline.step(descriptor, compute);') === true, 'isConvertedShim() did not detect a converted shim');
  assert(isConvertedShim('legacy') === false, 'isConvertedShim() reported a legacy file as a converted shim');
  assert(parseArgs(['--legacy-ref=abc']).legacyRef === 'abc', 'parseArgs dropped --legacy-ref');

  // N5 (idempotency lens, 2026-10-02): --legacy-ref is operator input interpolated into a `git show`
  // argv. A leading dash makes git read it as an OPTION (`--legacy-ref=--output=x` → `git show
  // --output=x:scripts/enrich-centreline.js`), so validLegacyRef() must refuse it BEFORE the spawn,
  // and must accept the plain refs the PRE path actually uses (full/short sha, remote-tracking ref
  // with a revision operator).
  assert(validLegacyRef('--output=x') === false, 'validLegacyRef accepted a leading-dash option injection');
  assert(validLegacyRef('079a9425') === true, 'validLegacyRef rejected a short sha');
  assert(validLegacyRef('origin/main~1') === true, 'validLegacyRef rejected a remote-tracking ref with ~1');

  // fx6 (idempotency lens, 2026-10-02): the bracket needs an advisory lock of its OWN, and that lock
  // must not be the step's. Two failures are live here. (1) A lock id that is not an integer (or is
  // absent) means pipeline.withAdvisoryLock's `pg_try_advisory_xact_lock($1)` throws or binds NULL —
  // the bracket either cannot start or starts with no mutual exclusion at all, and the perturbation
  // it takes outlives any concurrent bracket's repair. (2) An id of 64 is the step's own lock (scripts/enrich-
  // centreline.js), so the spawn at step (5) finds the lock held BY THIS PROCESS and takes the
  // §R12 self-skip path: the step never runs, records_updated reads 0, and every capture records a
  // "perturbed" table as a golden — a void differential that PASSES its own asserts.
  assert(
    Number.isInteger(COHORT_BRACKET_LOCK_ID) && COHORT_BRACKET_LOCK_ID !== 64,
    `COHORT_BRACKET_LOCK_ID must be an integer and must not be the step's own lock 64 (got ${JSON.stringify(COHORT_BRACKET_LOCK_ID)})`,
  );

  // fx7 (idempotency lens, 2026-10-02): a Ctrl-C delivered BEFORE the step is spawned (during the
  // identity guard or a hash read) must abort the write, not merely be logged. abortIfInterrupted()
  // is the pure gate the run calls immediately before the perturbation's BEGIN and again immediately
  // before execFileSync; an interrupted flag of anything other than `true` must be a no-op.
  let interruptedThrew = false;
  try { abortIfInterrupted({ interrupted: true }); } catch { interruptedThrew = true; }
  assert(interruptedThrew, 'abortIfInterrupted({ interrupted: true }) did not throw');
  let notInterruptedThrew = false;
  try { abortIfInterrupted({ interrupted: false }); } catch { notInterruptedThrew = true; }
  assert(!notInterruptedThrew, 'abortIfInterrupted({ interrupted: false }) threw');
  assert(abortIfInterrupted({ interrupted: false }) === undefined, 'abortIfInterrupted({ interrupted: false }) did not return undefined');
}

/** `perturbedOf` is an involution on its three booleans: feeding the perturbed literal back flips them home. */
function perturbationLiteralOf(p) {
  return {
    is_corner_lot: p.is_corner_lot,
    is_through_lot: p.is_through_lot,
    abuts_laneway: p.abuts_laneway,
    primary_frontage_street_name: p.primary_frontage_street_name,
    centreline_dataset_version_when_enriched: p.centreline_dataset_version_when_enriched,
  };
}

// ── CLI dispatch ─────────────────────────────────────────────────────────────
const HELP = `enrich-centreline-cohort-differential — enrich_centreline (batch-2 row 3.10) R-AS cohort differential

Usage (LOCAL dev DB only):
  node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --derive --seed=<s> [--overwrite]
  node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --backup --backup-table=<t>
  node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --run --side=pre|post \\
      --backup-table=<t> [--chain=sources|none] --out=<capture json> [--force-full] [--legacy-ref=<ref>]
  node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --restore --backup-table=<t>
  node -r dotenv/config scripts/analysis/enrich-centreline-cohort-differential.js --self-test

  --derive      SELECT-only (READ ONLY txn). Reads the §3.11 contract through the converted step's
                own readCentrelineContract, REFUSES unless the run would be incremental, gates on
                RC-1 absorption (stale stamp within the seeded enrich_centreline_proximity_m), then
                samples ${COHORT_SIZE} parcels in 4 strata (${STRATA.map((s) => `${s.name}:${s.n}`).join(' ')}) by
                ORDER BY md5(id||':'||seed). Writes ${path.relative(REPO_ROOT, COHORT_PATH)}
                (seed, ids, BASELINE literals, toronto_centreline identity, negative control, baseline_hash).
                --seed=<s> is REQUIRED (no date default); an existing cohort.json is refused unless
                --overwrite is passed (a re-derive must not silently orphan the matching before-image / PRE).
  --backup      (ec2-x2) copy the cohort's columns aside before a destructive bracket.
                REQUIRES --backup-table=<t>.
  --run         (ec2-x2) perturb the committed cohort, spawn the real step through capture-step-golden.js,
                and assert the R-AS claims against its summary. Restore is unconditional.
                REQUIRES --backup-table=<t> (the verified before-image) and --out=<capture json>.
                --side=pre REQUIRES --legacy-ref=<ref> and refuses unless the working
                scripts/enrich-centreline.js is byte-for-byte the legacy step at <ref>; --side=post
                refuses unless it is the converted shim (F4: PRE must never record converted output).
  --restore     (ec2-x2) put the before-image back and re-verify baseline_hash.
                REQUIRES --backup-table=<t>.
  --self-test   No DB. Asserts the hash/perturbation/strata/parseArgs invariants. Prints 'self-test PASSED'.
  --help        This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv);
  if (args.selfTest) return selfTest();
  if (args.derive) return derive(args);
  if (args.backup) return backup(args);
  if (args.run) return runSide(args);
  if (args.restore) return restore(args);
  throw new Error('nothing to do: pass --derive, --backup, --run, --restore or --self-test (see --help)');
}

if (require.main === module) {
  main()
    .then(() => {
      if (process.argv.includes('--self-test')) console.log('self-test PASSED');
    })
    .catch((err) => {
      console.error('[cohort] ERROR:', err.message);
      process.exitCode = process.exitCode || 1;
    });
}

module.exports = {
  COHORT_PATH,
  PROJ,
  BASELINE_COLS,
  RESTORE_SET_COLS,
  STRATA,
  COHORT_SIZE,
  COHORT_BRACKET_LOCK_ID,
  HASH_SQL,
  hashOf,
  sameSource,
  validLegacyRef,
  isConvertedShim,
  backupPrecondition,
  perturbedOf,
  assertRestoreIds,
  abortIfInterrupted,
  restoreSql,
  readProximityDefault,
  parseArgs,
  readOnlyQuery,
};
