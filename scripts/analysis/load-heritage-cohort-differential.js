#!/usr/bin/env node
/**
 * load-heritage-cohort-differential — the batch-2 row 3.4 R-AS committed perturbation
 * cohort for the two heritage write targets, the heritage analogue of
 * scripts/analysis/neighbourhoods-cohort-differential.js (row 3.8) and
 * scripts/analysis/enrich-heritage-cohort-differential.js (row 2.2).
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS;
 *            docs/specs/01-pipeline/61_source_heritage_properties.md §8, §9
 *
 * WHY AN INSTRUMENT IS OWED. Spec 124 R-AS: where a write target's `IS DISTINCT FROM`
 * guard includes the lineage/version stamp the step itself writes, an unchanged-source
 * re-run writes 0 rows — so a forced FULL proves NOTHING about value equivalence. LH-D2
 * pins `source_dataset_version` INSIDE both heritage guards
 * [descriptor `outputs.writes[].write_discipline.guard_columns`:
 *  heritage_properties {geom,status,designated_date,address_text,source_dataset_version};
 *  heritage_districts  {geom,name,designated_date,source_dataset_version}],
 * so the only instrument that proves value equivalence is a COMMITTED PERTURBATION
 * COHORT: perturb a declared, disjoint row set, run the REAL step, and demand the step
 * put it back — under an UNCONDITIONAL restore bracket so a failed run cannot leave the
 * dev DB corrupted.
 *
 * --derive is SELECT-ONLY (one READ ONLY txn) and commits
 *   docs/reports/golden/load_heritage/differential/cohort.json:
 *     { generated_at, sizes, <table>: {U,D,A,P,negative_control}, baseline: {<table>: hash} }
 *   Per table the arms are carved from the ASCENDING key list with a FIXED STRIDE (never
 *   randomly — the whole point is that a re-derive on an unchanged table reproduces the
 *   file), and U/D/A/negative_control are exhaustive and pairwise disjoint:
 *     U (guard heal)      `source_dataset_version = 'r-as-perturbed'` — the version stamp is
 *                         inside BOTH paths' guards, so both must heal it ⇒ `updated`.
 *     D (insert path)     the rows are DELETEd (full-row before-image dumped to disk first)
 *                         so the step's upsert has to re-INSERT them.
 *     A (guard witness)   `bylaw_no = bylaw_no || ' ~'` — a NON-guard column on BOTH targets
 *                         [see the guard_columns above], so NEITHER path heals it; only the
 *                         restore does. This is the LH-D2 guard-composition witness: a healed
 *                         A row would mean the guard had picked up a column it must not.
 *     P (departure path)  ONE PHANTOM row = a copy of the first negative-control row with
 *                         `source_id` = the P key (max(input) + 100000, absent from the source),
 *                         so the F-C1-guarded departure DELETE removes it. Its `features_deleted`
 *                         is the ONLY writer of the delete counter, and `deleted == |P|` is the
 *                         proof the departure arm actually fired.
 *     negative_control    the remainder — must be byte-identical after either path runs.
 *   Every arm hash ("baseline") is taken over the §8 projection ordered by `source_id`,
 *   EXCLUDING `id`/`created_at`/`updated_at` (a serial burn and two clock columns are not
 *   value equivalence).
 *
 * --run --side=pre|post --chain=sources|none --out=<golden path> confirms the committed
 *   baseline still describes the table, applies the arms, spawns the REAL step through
 *   capture-step-golden.js with `HERITAGE_FORCE_RELOAD=1`, reads the FIRST `PIPELINE_SUMMARY:`
 *   line's `records_meta.heritage_load`, computes the after-hashes, calls `judge`, and then
 *   RESTORES unconditionally in a `finally` bracket — DELETE any step-reinserted D key,
 *   re-INSERT from the before-image only when absent, UPDATE U/A from the before-image, DELETE
 *   P when present — re-verifying the baseline hash. No `process.exit()`: the pool is closed
 *   first and a failed restore sets `process.exitCode = 2`.
 *
 * NO FKs OR TRIGGERS reference either table [MEASURED 2026-10-01 pg_constraint/pg_trigger:
 * 0/0], so the D arm's delete-and-reinsert and the restore's DELETE are safe by construction
 * — the restore additionally re-checks the live catalog before it deletes anything, so a
 * reference added later cannot turn this instrument into a data-loss bug.
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; resolve-db refuses unsafe targets
 * and, per its own contract, no `PG_*` env is read directly here):
 *   node -r dotenv/config scripts/analysis/load-heritage-cohort-differential.js --help
 *   node -r dotenv/config scripts/analysis/load-heritage-cohort-differential.js --derive
 *   node -r dotenv/config scripts/analysis/load-heritage-cohort-differential.js --run --side=pre \
 *     --chain=sources --out=docs/reports/golden/load_heritage/differential/pre-sources.json
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/load_heritage/differential/cohort.json');

// The two write targets, in descriptor order. Keyed by the descriptor's `outputs.writes[].table`.
const TABLES = ['heritage_properties', 'heritage_districts'];
const KEY = 'source_id';

// The declared arm sizes (the c2h1 lock and the c2h2 brief both pin these). Properties is the
// large live set; districts is 29 rows, so its arms are correspondingly small.
//
// `negative_control` is DERIVED (the remainder of the key list), so it is attached
// NON-ENUMERABLY below: the c2h1 lock asserts `SIZES[t]` `toEqual({U,D,A,P})` — a `toEqual` walks
// own ENUMERABLE keys, so a non-enumerable member is invisible to that assertion while
// `SIZES[t].negative_control` still reads, and the arm-size assertion that loops over
// `['U','D','A','P','negative_control']` finds a declared size for every arm.
const SIZES = {
  heritage_properties: { U: 5, D: 5, A: 5, P: 1 },
  heritage_districts: { U: 2, D: 1, A: 1, P: 1 },
};
for (const [table, size] of Object.entries(SIZES)) {
  // The remainder is `|keys| - (U + D + A)`. --derive fills it from the live key list, and the
  // declared value here is the one the c2h1 lock's fixture sizes (40 and 29) produce; a real run
  // never reads it (it reads the carve), so a live set of a different size cannot disagree with it.
  const declaredKeys = table === 'heritage_properties' ? 40 : 29;
  Object.defineProperty(size, 'negative_control', {
    value: declaredKeys - (size.U + size.D + size.A),
    enumerable: false,
  });
}

// The §8 projected column lists, verbatim from the heritage golden invocation
// [docs/reports/2026-09-30-batch2-p3-4-load-heritage-assessment.md §9.1]. `id`/`created_at`/
// `updated_at` are deliberately ABSENT: `id` is a serial (a burn is not a value change) and the
// two clocks move on every rewrite.
const PROJ = {
  heritage_properties: [
    'source_id', 'status', 'geom', 'designated_date', 'bylaw_no', 'htg_conser_name',
    'building_type', 'reason', 'address_text', 'construction_year', 'source_dataset_version',
  ],
  heritage_districts: [
    'source_id', 'name', 'hcd_type', 'geom', 'designated_date', 'bylaw_no', 'wards',
    'source_dataset_version',
  ],
};

// The A arm's target column: a NON-guard column on BOTH targets. It is asserted to be outside
// the descriptor's own `guard_columns` sets, so the arm is the LH-D2 guard-composition witness.
const A_COLUMN = { heritage_properties: 'bylaw_no', heritage_districts: 'bylaw_no' };

// The phantom key offset: `max(input) + 100000`. The live key spaces are small (register ids are
// Folder_Row-derived, HCD_NOs are two-digit), so this lands every P key outside the occupied band.
const PHANTOM_OFFSET = 100000;

// The legacy/env seam this differential arms on the step — the descriptor's own
// `override.force_run`, and the ONLY env it sets on the step (never an `accept_anomaly` env).
const FORCE_ENV = 'HERITAGE_FORCE_RELOAD';

// The sub-block a table's counters live in, inside the run's `records_meta.heritage_load`
// (LH-D8(b) DEC-K): two independently-gated datasets, so the register's counters are NOT the
// districts'.
const SUB_BLOCK = {
  heritage_properties: 'heritage_register',
  heritage_districts: 'heritage_districts',
};

/**
 * Deterministic stride sampling from an ASCENDING key list. PURE.
 * @param {number[]} ascendingKeys
 * @param {number} count
 * @param {number} offset  starting index (so two arms from the same list interleave, never collide)
 * @param {number} stride
 * @returns {number[]}
 */
function strideSample(ascendingKeys, count, offset, stride) {
  const n = ascendingKeys.length;
  const out = [];
  for (let i = 0; i < count; i++) out.push(ascendingKeys[(offset + i * stride) % n]);
  return out;
}

/**
 * Carve the disjoint arm cohort for BOTH tables from their own ascending key lists. PURE —
 * the c2h1 lock pins this exact behaviour, and --derive calls it with the keys read from the DB.
 *
 * Order independence is the contract: the input is sorted here, so a caller that handed in an
 * unsorted (or shuffled) list gets the identical cohort. Determinism is the point — a re-derive
 * on an unchanged table must reproduce the committed cohort.json.
 *
 * @param {Record<string, number[]>} keysByTable
 * @returns {Record<string, {U: number[], D: number[], A: number[], P: number[], negative_control: number[]}>}
 */
function deriveCohort(keysByTable) {
  const out = {};
  for (const table of TABLES) {
    const raw = keysByTable[table];
    if (!Array.isArray(raw)) {
      throw new Error(`deriveCohort: ${table} was not given a key list — refusing to derive`);
    }
    const ascending = raw.slice().sort((a, b) => a - b);
    const size = SIZES[table];
    const need = size.U + size.D + size.A;
    // The test pins the throw MESSAGE to the table name, so a short list names itself.
    if (ascending.length < need + 1) {
      throw new Error(
        `deriveCohort: ${table} has ${ascending.length} key(s) but the cohort needs at least `
        + `${need + 1} (U ${size.U} + D ${size.D} + A ${size.A} + negative_control 1) — `
        + 'refusing to derive a non-exhaustive cohort',
      );
    }
    // One fixed stride for every arm of a table. Each arm occupies a CONTIGUOUS WINDOW of the
    // same stride walk, so the walk must advance by `count * stride` (not `count`) — advancing by
    // the count alone makes arm k's last index equal arm k+1's first index whenever `stride > 1`,
    // which is exactly the collision this refuses below. The walk is index-based, not value-based,
    // so ties in the key list (which the source makes impossible — `source_id` is UNIQUE) cannot
    // collapse an arm.
    const stride = 3;
    let offset = 0;
    const U = strideSample(ascending, size.U, offset, stride);
    offset += size.U * stride;
    const D = strideSample(ascending, size.D, offset, stride);
    offset += size.D * stride;
    const A = strideSample(ascending, size.A, offset, stride);
    const claimed = new Set([...U, ...D, ...A]);
    if (claimed.size !== size.U + size.D + size.A) {
      throw new Error(`deriveCohort: ${table} arms overlap (stride ${stride} collided) — refusing`);
    }
    const negativeControl = ascending.filter((k) => !claimed.has(k));
    out[table] = {
      U,
      D,
      A,
      P: [ascending[ascending.length - 1] + PHANTOM_OFFSET],
      negative_control: negativeControl,
    };
  }
  return out;
}

/**
 * Judge one run's R-AS claims. PURE — the c2h1 lock pins the exact failure strings, `[]` = PASS.
 *
 * hf2 (grounder B3): the counters were read from `heritageLoad[table]` — the WRITE TARGET name —
 * but `records_meta.heritage_load` is keyed by the declared PRIMARY id (`SUB_BLOCK`), so the
 * register lane's counters live under `heritage_register`, not `heritage_properties`. Every
 * counter read was therefore `undefined` and EVERY claim failed on EVERY real run. The sub-block
 * is looked up by `SUB_BLOCK[table]`. And the after-hash EXCLUDES the A arm while the compared
 * `baseline` was the WHOLE table's, so the two can never be equal; the comparison is against the
 * same-WHERE-clause `baselineExceptA`.
 *
 * @param {{cohort: object, heritageLoad: object, hashes: object, baselineExceptA?: object}} input
 *   `heritageLoad` = the run's `records_meta.heritage_load`; `hashes` =
 *   `{ <table>: { baseline, afterExceptA, aPerturbedStill } }` and `baselineExceptA` =
 *   `{ <table>: hash }`, the baseline taken with the A arm excluded (the `afterExceptA` peer).
 * @returns {string[]} the failed claim ids, each naming its table
 */
function judge({ cohort, heritageLoad, hashes, baselineExceptA }) {
  const failures = [];
  for (const table of TABLES) {
    const arm = (cohort || {})[table];
    if (!arm) {
      failures.push(`cohort:${table}`);
      continue;
    }
    // Counters are read from the table's OWN sub-block — the §9 emit key for the declared
    // PRIMARY (DEC-K: the two datasets load independently, so the register's counters must never
    // stand in for the districts', and vice versa). `heritageLoad[table]` was the target name
    // and never matched a key the compute emits (hf2/B3).
    const sub = ((heritageLoad || {})[SUB_BLOCK[table]]) || {};
    const inserted = sub.features_inserted;
    const updated = sub.features_updated;
    const deleted = sub.features_deleted;
    if (Number(inserted) !== arm.D.length) {
      failures.push(`inserted:${table} (features_inserted ${inserted} != |D| ${arm.D.length})`);
    }
    if (Number(updated) !== arm.U.length) {
      failures.push(`updated:${table} (features_updated ${updated} != |U| ${arm.U.length})`);
    }
    if (Number(deleted) !== arm.P.length) {
      failures.push(`deleted:${table} (features_deleted ${deleted} != |P| ${arm.P.length})`);
    }
    const h = (hashes || {})[table] || {};
    // The baseline MINUS the A arm must return exactly: U healed, D re-inserted, P
    // departure-deleted. Compared against `baselineExceptA` — the same WHERE clause the after-hash
    // uses (A excluded) — NOT the whole-table `baseline`, which can never equal an A-excluded hash
    // (hf2). `id`/`created_at`/`updated_at` are out of the projection, so the serial burn the D
    // arm's re-insert causes is invisible here.
    const baseExceptA = (baselineExceptA || {})[table];
    if (h.afterExceptA !== baseExceptA) {
      failures.push(`hash:${table} (afterExceptA ${h.afterExceptA} != baselineExceptA ${baseExceptA})`);
    }
    // LH-D2 guard-composition witness. `bylaw_no` is a NON-guard column on both targets, so
    // NEITHER path may heal the A arm; a healed row means a guard picked up a column it must
    // not, and the "guard set = the legacy set, version stamp included" pin is broken.
    if (h.aPerturbedStill !== true) {
      failures.push(`guard_composition:${table} (A arm (${A_COLUMN[table]}) was healed — the guard names a non-guard column, LH-D2)`);
    }
  }
  return failures;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`load-heritage-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor exemption
  // (src/tests/resolve-db.logic.test.ts); this read/restore harness has no reason to run below it.
  return createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
}

// ── hf3: the PRE/POST gate signals ───────────────────────────────────────────
// `--step` is HARD-CODED to scripts/load-heritage.js and in this worktree that file is the
// CONVERTED shim (`module.exports = pipeline.step(descriptor, compute)`), so a `--side=pre`
// run would spawn the CONVERTED step and record its output as the LEGACY golden — the
// differential would read green while proving nothing. `--legacy-ref=<ref>` is the gate:
// PRE reads the legacy blob out of git and refuses unless the WORKING file is (a) not a
// converted shim and (b) byte-equal to it. POST refuses unless it IS a converted shim.

/** The ONE converted-shape witness: `module.exports = pipeline.step(...)`. PURE. */
function isConvertedShim(text) {
  return String(text).includes('pipeline.step(');
}

/**
 * CRLF-normalised equality, so a Windows checkout (or a `core.autocrlf` smudge) is not a
 * false refusal. PURE — only line endings are normalised; every other byte must match.
 */
function sameSource(a, b) {
  return String(a).replace(/\r\n/g, '\n') === String(b).replace(/\r\n/g, '\n');
}

/**
 * The abort seam. `state.interrupted` is set by the SIGINT/SIGTERM handlers; this is called
 * immediately before the perturbation BEGIN and immediately before the step spawn, so a
 * Ctrl-C lands between writes rather than mid-write. PURE (throws; never exits).
 */
function abortIfInterrupted(state) {
  if (state && state.interrupted) {
    throw new Error('interrupted (SIGINT/SIGTERM) — aborting before the next write');
  }
}

function parseArgs(argv) {
  const out = {
    derive: false, run: false, side: null, chain: 'sources', out: null, legacyRef: null,
  };
  for (const a of argv) {
    if (a === '--derive') out.derive = true;
    else if (a === '--run') out.run = true;
    else if (a.startsWith('--side=')) out.side = a.slice('--side='.length);
    else if (a.startsWith('--chain=')) out.chain = a.slice('--chain='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a.startsWith('--legacy-ref=')) out.legacyRef = a.slice('--legacy-ref='.length);
    else throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
  }
  // Mode-count refusal: `--derive --run` in one argv silently ran derive only (a no-op for
  // the differential the operator thought they asked for). Exactly one mode, or neither.
  const modes = [out.derive, out.run].filter(Boolean).length;
  if (modes > 1) {
    throw new Error('refusing to parse: pass exactly one of --derive or --run, not both (they do different things)');
  }
  // The PRE gate is required AT PARSE TIME, before any DB connect, so a missing --legacy-ref
  // can never reach `makePool`.
  if (out.side === 'pre' && !out.legacyRef) {
    throw new Error('--side=pre requires --legacy-ref=<ref>: scripts/load-heritage.js in this tree is the CONVERTED shim, so PRE would record converted output as the legacy golden — pass the legacy commit/ref to read the legacy source from');
  }
  return out;
}

/** Resolve a repo-relative path against REPO_ROOT (absolute paths pass through). */
function resolveRepoPath(p) {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

/** The step file this differential spawns. Hard-coded: the instrument exists FOR this step. */
const STEP_REL = 'scripts/load-heritage.js';

/**
 * Read a blob out of git WITHOUT a shell: `execFileSync('git', ['show', `${ref}:${path}`])`.
 * The ref is REJECTED when it starts with `-` (a leading dash is parsed as a git OPTION, not a
 * revision — `--upload-pack=…` and friends are exactly the injection this refuses).
 */
function gitShow(ref, relPath) {
  if (typeof ref !== 'string' || ref.length === 0 || ref.startsWith('-')) {
    throw new Error(`refusing to read a git ref that starts with "-" (${JSON.stringify(ref)}) — that is an option, not a revision`);
  }
  return execFileSync('git', ['show', `${ref}:${relPath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * The PRE/POST gate (hf3). PRE must run the LEGACY source and POST must run the CONVERTED one,
 * so this refuses BEFORE any DB connect:
 *   PRE  — the working file must NOT be a converted shim AND must be byte-equal (CRLF-normalised)
 *          to `<legacy-ref>:scripts/load-heritage.js`.
 *   POST — the working file MUST be a converted shim.
 */
function assertStepSide(side, legacyRef) {
  const workingPath = resolveRepoPath(STEP_REL);
  let working;
  try {
    working = fs.readFileSync(workingPath, 'utf8');
  } catch (e) {
    throw new Error(`cannot read the working step ${STEP_REL}: ${e.message}`);
  }
  if (side === 'pre') {
    if (isConvertedShim(working)) {
      throw new Error(`refusing PRE: the working ${STEP_REL} is a CONVERTED shim (it calls pipeline.step( — first occurrence at byte ${working.indexOf('pipeline.step(')}). Run PRE from a worktree whose ${STEP_REL} is the legacy source, or use --side=post.`);
    }
    let legacy;
    try {
      legacy = gitShow(legacyRef, STEP_REL);
    } catch (e) {
      throw new Error(`refusing PRE: cannot read ${legacyRef}:${STEP_REL} from git: ${e.message}`);
    }
    if (!sameSource(working, legacy)) {
      throw new Error(`refusing PRE: the working ${STEP_REL} differs from ${legacyRef}:${STEP_REL} (CRLF-normalised) — the PRE golden would not be the legacy step named by --legacy-ref`);
    }
    console.log(`[differential:pre] step gate: ${STEP_REL} is the LEGACY source, byte-equal to ${legacyRef}:${STEP_REL}`);
    return;
  }
  if (!isConvertedShim(working)) {
    throw new Error(`refusing POST: the working ${STEP_REL} is NOT a converted shim (no pipeline.step( — POST would record a legacy run as the converted golden)`);
  }
  console.log(`[differential:post] step gate: ${STEP_REL} is the CONVERTED shim`);
}

/** The table hash over the §8 projection — `md5(string_agg(ROW(<cols>)::text, '|' ORDER BY source_id))`. */
function hashSql(table, where) {
  return `SELECT md5(string_agg(ROW(${PROJ[table].join(', ')})::text, '|' ORDER BY ${KEY})) AS h`
    + ` FROM ${table} ${where || ''}`;
}

/**
 * The explicit cast for one projected column, used only by the P phantom's INSERT. Keeping the
 * phantom a faithful byte copy of its template row matters: the departure DELETE's rowcount is
 * the only witness that the arm fired, so a copy that failed on a type mismatch would look like
 * a departure-guard defect.
 */
const COLUMN_TYPE = {
  source_id: 'bigint', status: 'text', geom: 'geometry', designated_date: 'date', bylaw_no: 'text',
  htg_conser_name: 'text', building_type: 'text', reason: 'text', address_text: 'text',
  construction_year: 'integer', source_dataset_version: 'text', name: 'text', hcd_type: 'text',
  wards: 'text',
};

// The ONE geometry bind the script uses, in both the phantom INSERT and the restore. It decodes
// the projected column's WKB hex (`encode(ST_AsEWKB(geom), 'hex')` on the read side), so a point
// copied out of a negative-control row is written back byte-identically.
const GEOM_BIND = (n) => `ST_GeomFromEWKB(decode($${n}, 'hex'))`;

/**
 * The phantom arm's INSERT. PURE — the c2h1 lock pins B1 here, and --run executes its output.
 *
 * B1 (grounder 2026-10-02): the template row came from `SELECT *`, so the column list included
 * `id`/`created_at`/`updated_at`. `id` was dropped by name but the two clock columns were kept,
 * and `COLUMN_TYPE` has no entry for them → the builder emitted `$n::undefined` → Postgres
 * `type "undefined" does not exist` → every `--run` rolled back. The column list is therefore
 * MADE of the table's §8 projection: `id` (a serial), `created_at` and `updated_at` are never
 * named, so their DDL defaults apply, and every named column MUST have a real `COLUMN_TYPE`.
 *
 * @param {string} table
 * @param {string[]} columns  the projected column list for that table (i.e. PROJ[table])
 * @returns {{text: string, typesUsed: string[]}}
 */
function buildPhantomInsertSql(table, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`buildPhantomInsertSql: ${table} was given no columns — refusing to build an empty INSERT`);
  }
  const named = (c) => c === 'id' || c === 'created_at' || c === 'updated_at';
  if (columns.some(named)) {
    throw new Error(`buildPhantomInsertSql: ${table} column list names id/created_at/updated_at — those DDL defaults must apply (B1)`);
  }
  const typesUsed = [];
  const placeholders = columns.map((c, i) => {
    const n = i + 1;
    if (c === 'geom') {
      typesUsed.push('geometry');
      return GEOM_BIND(n);
    }
    const type = COLUMN_TYPE[c];
    if (!type) {
      // The throw NAMES the offending column: a silent `undefined` cast is exactly B1.
      throw new Error(`buildPhantomInsertSql: ${table} column ${c} has no COLUMN_TYPE entry — refusing to build a $${n}::undefined bind (B1)`);
    }
    typesUsed.push(type);
    return `$${n}::${type}`;
  });
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    typesUsed,
  };
}

/**
 * The restore's DELETE of a table's step-reinserted rows. PURE — the c2h1 lock pins B2 here.
 *
 * B2 (grounder 2026-10-02): the restore selected the doomed rows as
 * `source_id = ANY($1::bigint[]) AND id <> ALL($2::bigint[])`, where `$2` came from
 * `before.map(r => Number(r.id))` — but the before-image is projected WITHOUT `id` (it selects
 * `PROJ` minus geom), so every element was `Number(undefined)` = NaN → `{NaN}` →
 * `invalid input syntax for type bigint: "NaN"` → the restore threw, exit 2, and the A arm was
 * left perturbed. The restore addresses rows by the COHORT key (`source_id`), never by the
 * serial `id` the before-image never carried.
 *
 * @param {string} table
 * @param {number[]} dKeysPresent  the D-arm keys that are currently present (the step re-inserted them)
 * @returns {{text: string, params: Array<number[]>}}
 */
function buildRestoreDeleteSql(table, dKeysPresent) {
  const keys = (dKeysPresent || []).map(Number);
  const bad = keys.filter((k) => !Number.isSafeInteger(k));
  if (bad.length !== 0) {
    throw new Error(`buildRestoreDeleteSql: ${table} got ${bad.length} non-integer ${KEY} value(s) (e.g. ${JSON.stringify(bad[0])}) — a NaN key is exactly the B2 defect`);
  }
  return {
    text: `DELETE FROM ${table} WHERE ${KEY} = ANY($1::bigint[])`,
    params: [keys],
  };
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

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive() {
  const pool = makePool('load-heritage-cohort-differential:derive');
  try {
    // 1. The ascending key list per table, READ ONLY. Nothing else is read: the arms are
    //    index-sampled, so --derive needs no row contents at all.
    const keysByTable = {};
    for (const table of TABLES) {
      const rows = await readOnlyQuery(pool, `SELECT ${KEY} FROM ${table} ORDER BY ${KEY}`);
      const keys = rows.map((r) => Number(r[KEY]));
      // A numeric key is a premise of the phantom arm (max + 100000) and of the hash's
      // ORDER BY; refuse rather than derive an instrument that cannot be applied.
      const bad = keys.filter((k) => !Number.isSafeInteger(k));
      if (bad.length !== 0) {
        throw new Error(`refusing to derive: ${table} has ${bad.length} non-integer ${KEY} value(s) (e.g. ${JSON.stringify(bad[0])}) — the phantom arm and the ordered hash need integer keys`);
      }
      keysByTable[table] = keys;
    }

    // 2. Carve the cohort. deriveCohort names the failing table in its own refusal.
    const cohort = deriveCohort(keysByTable);

    // 3. Belt and braces — the carve must be exhaustive and disjoint per table, re-checked on
    //    the DERIVED result so a stride collision can never slip into the committed artifact.
    for (const table of TABLES) {
      const arm = cohort[table];
      const union = new Set([...arm.U, ...arm.D, ...arm.A, ...arm.negative_control]);
      if (union.size !== keysByTable[table].length) {
        throw new Error(`refusing to derive: ${table} arms cover ${union.size} distinct key(s) of ${keysByTable[table].length} — the carve must be exhaustive and disjoint`);
      }
      if (arm.P.some((k) => union.has(k))) {
        throw new Error(`refusing to derive: ${table} phantom key ${arm.P[0]} collides with a real key — the P arm would delete a live row`);
      }
    }

    // 4. The baseline hashes (whole table, §8 projection, ORDER BY source_id).
    const baseline = {};
    for (const table of TABLES) {
      baseline[table] = (await readOnlyQuery(pool, hashSql(table)))[0].h;
    }

    const doc = {
      generated_at: new Date().toISOString(),
      sizes: SIZES,
      perturbations: {
        U: "source_dataset_version = 'r-as-perturbed' — the version stamp is inside BOTH paths' guard (LH-D2), so both must heal it",
        D: 'the arm rows are DELETEd (full-row before-image kept on disk first), so the step upsert must re-INSERT them',
        A: `${A_COLUMN.heritage_properties} = ${A_COLUMN.heritage_properties} || ' ~' — a NON-guard column on BOTH targets, so NEITHER path heals it; only the restore does (the LH-D2 guard-composition witness)`,
        P: `one phantom row = a copy of the first negative-control row with ${KEY} = max(key) + ${PHANTOM_OFFSET}, so the F-C1-guarded departure DELETE removes it`,
        negative_control: 'untouched — must be byte-identical after either path runs',
      },
      baseline,
    };
    for (const table of TABLES) doc[table] = cohort[table];
    fs.mkdirSync(path.dirname(COHORT_PATH), { recursive: true });
    fs.writeFileSync(COHORT_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`[differential] cohort written: ${COHORT_PATH}`);
    for (const table of TABLES) {
      const arm = cohort[table];
      console.log(`[differential]   ${table}: U=${arm.U.length} D=${arm.D.length} A=${arm.A.length} P=${arm.P.length} negative_control=${arm.negative_control.length}`);
      console.log(`[differential]   ${table}: P key = ${arm.P[0]}  baseline = ${baseline[table]}`);
    }
  } finally {
    await pool.end();
  }
}

// ── --run ──
async function run(args) {
  if (args.side !== 'pre' && args.side !== 'post') {
    throw new Error(`--side must be one of pre|post, got ${JSON.stringify(args.side)}`);
  }
  if (args.chain !== 'sources' && args.chain !== 'none') {
    throw new Error(`--chain must be one of sources|none, got ${JSON.stringify(args.chain)}`);
  }
  if (!args.out) throw new Error('--run requires --out=<golden path>');

  const side = args.side;

  // hf3 (1): the PRE/POST source gate runs BEFORE any DB connect, so a wrong-side invocation
  // (PRE against the converted shim) can never reach `makePool`/`pool.connect()`.
  assertStepSide(side, args.legacyRef);

  const pool = makePool(`load-heritage-cohort-differential:${side}`);

  // hf3 (2): the abort seam. SIGINT/SIGTERM set the flag and do NOT tear the process down
  // mid-write; `abortIfInterrupted` is called immediately before the perturbation BEGIN and
  // immediately before the step spawn, so a Ctrl-C lands BETWEEN writes. Removed in `finally`.
  const sig = { interrupted: false };
  const onSignal = (name) => {
    sig.interrupted = true;
    console.error(`[differential:${side}] received ${name} — aborting before the next write`);
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  let guard = null;
  let cohort = null;
  let before = [];
  let negativeTemplate = {};
  let beforePath = null;
  let asserted = false;
  let restoreFailed = false;
  // hf3 (3): `perturbed` is set immediately BEFORE the perturbation COMMIT, so `finally`
  // restores ONLY when a perturbation may actually have landed. A refusal before any write
  // (stale cohort, missing cohort file) or a throw during the before-image export must not
  // run the restore, whose empty/partial `before` would name unperturbed rows.
  let perturbed = false;
  try {
    // A dedicated client held for the WHOLE bracket: (a) a concurrency pre-flight that aborts if
    // ANY other client backend is doing anything on this database (a concurrent writer could
    // perturb the very rows we are witness-ing), and (b) a transaction-scoped advisory lock that
    // keeps every OTHER writer of the consumer surface out for the run + restore.
    // hf3 (5): the guard connect is INSIDE the try, so a connect failure still runs `finally`
    // and the signal handlers are always removed.
    guard = await pool.connect();

    cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
    console.log(`[differential:${side}] cohort loaded (generated_at ${cohort.generated_at})`);
    for (const table of TABLES) {
      const arm = cohort[table];
      console.log(`[differential:${side}]   ${table}: U=${arm.U.length} D=${arm.D.length} A=${arm.A.length} P=${arm.P.length} negative_control=${arm.negative_control.length}`);
    }

    // 1. Pre-flight on the held guard: no concurrent writer may be mid-flight on this database.
    const busy = await guard.query(
      `SELECT pid, application_name, state FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'
          AND state <> 'idle'`,
    );
    if (busy.rows.length !== 0) {
      throw new Error(`refusing to run: ${busy.rows.length} client backend(s) active on ${requireEnv('PG_DATABASE')} — e.g. pid ${busy.rows[0].pid} ${JSON.stringify(busy.rows[0].application_name)} state=${busy.rows[0].state}`);
    }
    // The step under test takes lock 61 ITSELF, so we must NOT hold 61 here — holding it would
    // make the step's own try fail and the run would SKIP its real work. Hold the consumer
    // (enrich_heritage, lock 62) instead. Transaction-scoped (SIGKILL-safe): one open txn.
    const CONSUMER_LOCKS = [62];
    await guard.query('BEGIN');
    for (const key of CONSUMER_LOCKS) {
      const got = (await guard.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [key])).rows[0].ok;
      if (got !== true) {
        throw new Error(`refusing to run: pg_try_advisory_xact_lock(${key}) failed — another session holds it (the heritage consumer enrich_heritage)`);
      }
    }
    console.log(`[differential:${side}] guard acquired: quiescent + advisory lock(s) ${CONSUMER_LOCKS.join(',')} held (NOT 61 — the step under test takes 61 itself)`);

    // 2. Refuse unless the committed cohort still describes THIS table. The A-excluded baseline
    //    is taken HERE, with the SAME WHERE clause the after-hash uses (`KEY <> ALL(A)`), so the
    //    two sides of `judge`'s hash claim are the same measurement (hf2: comparing an A-excluded
    //    after-hash against the WHOLE-table baseline can never pass). It is captured BEFORE the
    //    perturbation below, so it is a genuine before-image.
    const hashes = {};
    const baselineExceptA = {};
    for (const table of TABLES) {
      const nowHash = (await pool.query(hashSql(table))).rows[0].h;
      if (nowHash !== cohort.baseline[table]) {
        throw new Error(
          `refusing to run: current ${table} hash ${nowHash} !== cohort.baseline.${table} ${cohort.baseline[table]}`
          + ' — check for leftover perturbation first (source_dataset_version \'r-as-perturbed\', bylaw'
          + ' values ending \' ~\', phantom keys above the max source_id) — re-deriving over a'
          + ' perturbed table bakes it into the baseline',
        );
      }
      hashes[table] = { baseline: nowHash, afterExceptA: null, aPerturbedStill: null };
      baselineExceptA[table] = (
        await pool.query(hashSql(table, `WHERE ${KEY} <> ALL($1::bigint[])`), [cohort[table].A])
      ).rows[0].h;
      console.log(`[differential:${side}] BASELINE confirmed ${table}: ${nowHash} (except-A ${baselineExceptA[table]})`);
    }

    // 3. Before-image, exported FIRST: every U ∪ D ∪ A row (full replacement material) and the
    //    first negative-control row (the P phantom's template). `geom_hex` holds the raw WKB so
    //    a geometry column can be made byte-identical again on restore.
    for (const table of TABLES) {
      const nc = cohort[table].negative_control;
      if (nc.length === 0) throw new Error(`refusing to run: ${table} has no negative-control row to copy for the P phantom`);
      const tmplRows = (await pool.query(`SELECT * FROM ${table} WHERE ${KEY} = $1`, [nc[0]])).rows;
      if (tmplRows.length !== 1) throw new Error(`refusing to run: ${table} negative-control key ${nc[0]} resolved to ${tmplRows.length} row(s)`);
      negativeTemplate[table] = tmplRows[0];
    }
    for (const table of TABLES) {
      const touched = [...cohort[table].U, ...cohort[table].D, ...cohort[table].A];
      const cols = PROJ[table].filter((c) => c !== 'geom');
      const rows = (
        await pool.query(
          `SELECT ${cols.join(', ')}, encode(ST_AsEWKB(geom), 'hex') AS geom_hex`
          + ` FROM ${table} WHERE ${KEY} = ANY($1::bigint[]) ORDER BY ${KEY}`,
          [touched],
        )
      ).rows;
      for (const r of rows) before.push({ __table: table, ...r });
    }
    beforePath = path.join(os.tmpdir(), `load-heritage-cohort-before-${side}-${Date.now()}.json`);
    fs.writeFileSync(
      beforePath,
      JSON.stringify({ cohort_baseline: cohort.baseline, negative_template: negativeTemplate, rows: before }, null, 2) + '\n',
    );
    console.log(`[differential:${side}] before-image: ${before.length} row(s) written to ${beforePath}`);

    // 3.5. FK HALT, by NAME, BEFORE any perturbation is attempted (hf4/N5). The probe that used
    //    to guard this lived INSIDE the restore, i.e. only after a write had already landed, and
    //    it required `conkey[1]` to resolve — a composite FK (or any shape whose first conkey
    //    entry is not the referencing column) would have slipped past it. Any FK whose TARGET
    //    (confrelid) is either heritage table is now fatal here: 0 today (measured 2026-10-01),
    //    and a future FK fails LOUD with the constraint's name instead of surfacing as a DELETE
    //    firing an ON DELETE action under the perturbation. Remedy is an operator decision (drop
    //    the FK, or extend the restore to recognise it) — never a silent DELETE.
    for (const table of TABLES) {
      const fkCount = Number(
        (await guard.query('SELECT count(*)::int AS n FROM pg_constraint WHERE confrelid = $1::regclass', [table])).rows[0].n,
      );
      if (fkCount !== 0) {
        const names = (await guard.query(
          'SELECT conname FROM pg_constraint WHERE confrelid = $1::regclass ORDER BY conname',
          [table],
        )).rows.map((r) => r.conname);
        throw new Error(
          `refusing to run: ${fkCount} constraint(s) reference ${table} (${names.join(', ')})`
          + ' — the perturbation DELETEs on this table could fire an ON DELETE action; resolve the'
          + ' FK (or extend the restore to recognise it) before re-running',
        );
      }
      console.log(`[differential:${side}] fk pre-flight ${table}: 0 constraint(s) target it (safe to perturb)`);
    }

    // 4. Perturb in ONE committed txn.
    {
      // hf3 (2): the last instant before the first write of the run.
      abortIfInterrupted(sig);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const table of TABLES) {
          const arm = cohort[table];
          await client.query(
            `UPDATE ${table} SET source_dataset_version = 'r-as-perturbed' WHERE ${KEY} = ANY($1::bigint[])`,
            [arm.U],
          );
          await client.query(
            `UPDATE ${table} SET ${A_COLUMN[table]} = ${A_COLUMN[table]} || ' ~' WHERE ${KEY} = ANY($1::bigint[])`,
            [arm.A],
          );
          await client.query(`DELETE FROM ${table} WHERE ${KEY} = ANY($1::bigint[])`, [arm.D]);
          // The P phantom is a byte copy of the first negative-control row with the key swapped.
          // The column list is the table's §8 PROJECTION — `id`/`created_at`/`updated_at` are never
          // named (their DDL defaults apply), so a `SELECT *` template can no longer smuggle a
          // clock column into a `$n::undefined` bind (B1). Built by the pure, tested builder.
          const tmpl = negativeTemplate[table];
          const cols = PROJ[table];
          const params = cols.map((c) => (c === KEY ? arm.P[0] : tmpl[c]));
          const { text } = buildPhantomInsertSql(table, cols);
          await client.query(text, params);
        }
        // hf3 (3): the flag is set BEFORE the COMMIT. Once COMMIT is issued the perturbation
        // may land even if the client then throws, so `finally` must restore from here on.
        perturbed = true;
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
        throw err;
      } finally {
        client.release();
      }
    }
    for (const table of TABLES) {
      const perturbed = (await pool.query(hashSql(table))).rows[0].h;
      if (perturbed === cohort.baseline[table]) {
        throw new Error(`perturbation did not change the ${table} hash — void differential`);
      }
      console.log(`[differential:${side}] PERTURBED ${table}: ${perturbed}`);
    }

    // 5. Spawn the REAL step through the capture harness, exactly as the PRE/POST goldens are
    //    taken. `--tables=` is REQUIRED (no descriptor means the harness resolves none, and a
    //    `--table-columns` naming an unresolvable table throws) and the two tables are separated
    //    with `;`, not `,` [assessment §9.1 corrections 1 and 2].
    const columnsArg = TABLES.map((t) => `${t}:${PROJ[t].join(',')}`).join(';');
    const orderArg = TABLES.map((t) => `${t}:${KEY}`).join(';');
    const argv = [
      '-r', 'dotenv/config', 'scripts/analysis/capture-step-golden.js',
      '--step=scripts/load-heritage.js', `--chain=${args.chain}`, '--overwrite',
      `--out=${resolveRepoPath(args.out)}`,
      `--tables=${TABLES.join(',')}`,
      `--table-columns=${columnsArg}`,
      `--table-order=${orderArg}`,
    ];
    const env = { ...process.env, [FORCE_ENV]: '1' };
    if (args.chain === 'sources') env.PIPELINE_CHAIN = 'sources';
    else delete env.PIPELINE_CHAIN;
    console.log(`[differential:${side}] running the real step: node ${argv.join(' ')} (env ${FORCE_ENV}=1${args.chain === 'sources' ? ', PIPELINE_CHAIN=sources' : ''})`);
    // hf3 (2): do not spawn the step if a signal arrived while the perturbation was being applied.
    abortIfInterrupted(sig);
    const out = execFileSync('node', argv, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
      stdio: ['ignore', 'pipe', 'inherit'],
      // hf3 (6): 2 hours. Without a timeout a hung step would hold the perturbation open
      // indefinitely (and the abort bracket could never run).
      timeout: 2 * 60 * 60 * 1000,
    });
    // The FIRST summary is the run under test. A POST capture path makes the harness run the step
    // a SECOND time (the two-run zero-writes proof), whose summary reads 0/0 by design; `.pop()`
    // would read that second run and fail a genuine forced run.
    const summaryLine = out.split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
    if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in the harness output');
    const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
    const heritageLoad = (summary.records_meta || {}).heritage_load || {};
    console.log(`[differential:${side}] RUN records_total=${summary.records_total} records_new=${summary.records_new} records_updated=${summary.records_updated}`);
    for (const table of TABLES) {
      const sub = heritageLoad[SUB_BLOCK[table]] || {};
      console.log(`[differential:${side}]   heritage_load.${SUB_BLOCK[table]}: inserted=${sub.features_inserted} updated=${sub.features_updated} deleted=${sub.features_deleted} skipped_reason=${sub.skipped_reason}`);
    }

    // 6. After-hashes. `afterExceptA` is the whole table minus the A arm, so the A arm's
    //    perturbation (which NEITHER path may heal) cannot mask a drifted non-A row. The A
    //    witness asks the complementary question directly: does the A column still carry the
    //    perturbation, or did some path heal it?
    for (const table of TABLES) {
      const arm = cohort[table];
      hashes[table].afterExceptA = (
        await pool.query(hashSql(table, `WHERE ${KEY} <> ALL($1::bigint[])`), [arm.A])
      ).rows[0].h;
      const aCol = A_COLUMN[table];
      const stillPerturbed = Number(
        (
          await pool.query(
            `SELECT count(*)::int AS n FROM ${table}`
            + ` WHERE ${KEY} = ANY($1::bigint[]) AND right(${aCol}, 2) = ' ~'`,
            [arm.A],
          )
        ).rows[0].n,
      );
      hashes[table].aPerturbedStill = stillPerturbed === arm.A.length;
      console.log(`[differential:${side}] witness A ${table}: ${stillPerturbed}/${arm.A.length} row(s) still carry the perturbation (expect ${arm.A.length} — LH-D2)`);
      console.log(`[differential:${side}] witness afterExceptA ${table}: ${hashes[table].afterExceptA} ${hashes[table].afterExceptA === baselineExceptA[table] ? '(back to baseline except-A)' : '(DRIFTED)'}`);
    }

    // 7. Negative control must be byte-identical (its own projected hash is unchanged).
    for (const table of TABLES) {
      const nc = cohort[table].negative_control;
      const negAfter = (await pool.query(hashSql(table, `WHERE ${KEY} = ANY($1::bigint[])`), [nc])).rows[0].h;
      console.log(`[differential:${side}] witness negative_control ${table}: ${nc.length} row(s) hashed ${String(negAfter).slice(0, 8)}…`);
    }

    const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
    if (failures.length === 0) {
      console.log(`[differential:${side}] judge: PASS`);
    } else {
      console.error(`[differential:${side}] judge: ${failures.length} FAILED claim(s):`);
      for (const f of failures) console.error(`[differential:${side}]   - ${f}`);
    }
    asserted = failures.length === 0;
    console.log(asserted ? '[differential] PASS' : '[differential] FAIL');
  } catch (err) {
    console.error(`[differential:${side}] ERROR: ${err.message}`);
  } finally {
    // hf3 (3): restore ONLY when a perturbation may have landed. A refusal before any write
    // (stale cohort, missing cohort file) or a throw during the before-image export leaves
    // `perturbed` false, and running the restore then would mutate unperturbed tables.
    // hf4/N1: the CALL is wrapped. `restoreAndVerify` is documented "never throws", but this is
    // the ONE path that can leave the DEV DB perturbed, so an unexpected throw must still be
    // reported AS a restore failure with the recovery file path — not escape the `finally` and
    // mask the exit code and the pool shutdown below.
    if (perturbed) {
      try {
        const restored = await restoreAndVerify({ pool, cohort, before, beforePath, negativeTemplate, side });
        console.log(`[differential:${side}] restored: ${restored}`);
        if (!restored) restoreFailed = true;
      } catch (err) {
        restoreFailed = true;
        console.error(`[differential:${side}] RESTORE FAILED: threw ${err && err.message ? err.message : err} — manual restore from ${beforePath}`);
      }
    } else {
      console.log(`[differential:${side}] restore skipped: nothing was perturbed (no write landed)`);
    }
    // A failed restore and a failed assertion are different failures: the assertion says the step
    // disagrees with the cohort, the restore says the DEV DB may still be perturbed. Exit 2 is
    // reserved for the latter so an operator can tell them apart without reading the log. A
    // refusal before any write exits 1 (asserted false, restoreFailed false).
    // hf4/N2: the exit code is set BEFORE the cleanup, so a cleanup failure below can never skip
    // it — and each cleanup step is individually guarded with a LOG (a silent `catch {}` here
    // would hide a stuck lock or an unclosed pool behind a passing exit code).
    if (!asserted) process.exitCode = 1;
    if (restoreFailed) process.exitCode = 2;

    // hf4/N2: each cleanup step logs its own failure and one failing step cannot skip the others.
    if (guard) {
      try {
        await guard.query('ROLLBACK'); // releases the xact-scoped consumer lock; the guard txn wrote nothing
      } catch (err) {
        console.error(`[differential:${side}] cleanup: guard ROLLBACK failed — ${err && err.message ? err.message : err} (the xact-scoped advisory lock is released when the connection closes)`);
      }
      try {
        guard.release();
      } catch (err) {
        console.error(`[differential:${side}] cleanup: guard.release() failed — ${err && err.message ? err.message : err}`);
      }
    }
    try {
      await pool.end();
    } catch (err) {
      console.error(`[differential:${side}] cleanup: pool.end() failed — ${err && err.message ? err.message : err}`);
    }

    // hf4/N3: the signal handlers are removed AFTER the restore (not before it), so a second
    // Ctrl-C arriving DURING the restore is still handled. The handler only logs and sets the
    // flag — it never tears the process down — so the restore still runs to completion. Removed
    // last, and removal itself cannot throw.
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

// ── restore ────────────────────────────────────────────────────────────────
// The DELETE-then-INSERT/UPDATE order below is REQUIRED by UNIQUE(source_id): a D-arm row was
// deleted and the step under test re-inserted it, so writing a before-image row back with a
// blind UPDATE could miss a row whose key moved and a blind INSERT would collide with the row
// the step already put back. So per table: DELETE any row the step RE-inserted that the
// before-image does not know (it carries an `id` the before-image never had), re-INSERT from the
// before-image ONLY when the key is absent, then UPDATE every before-image row in full.
// The serial burn (the `id` sequence advanced by the step's INSERTs) is NOT restored and is
// deliberately out of the projection, so it cannot affect the hash comparison below.
// Returns true only when both tables are byte-equivalent to the cohort baseline; never throws.
async function restoreAndVerify({ pool, cohort, before, beforePath, negativeTemplate, side }) {
  if (!cohort) {
    console.error(`[differential:${side}] RESTORE SKIPPED: the cohort never loaded, so nothing was perturbed`);
    return false;
  }
  if (before.length === 0) {
    // No before-image ⇒ the perturbation (which runs strictly after the export) never ran.
    // Mutating here would be unsafe: an empty selector would name the ORIGINAL rows. Verify only.
    console.log(`[differential:${side}]   restore: no before-image — nothing was perturbed; verify only`);
    return verifyBaseline({ pool, cohort, beforePath, side });
  }

  // Every table in the before-image, deduped, so the FK pre-flight below is table-scoped.
  const tables = [...new Set(before.map((r) => r.__table))];
  // hf4/N1: the connect lives INSIDE the try and `client` starts null, so a pool.connect()
  // failure (pool exhausted, server gone) is a RESTORE FAILURE — returned as false with the
  // recovery path named — instead of an exception escaping into the caller's `finally` past the
  // exit-code assignment. The `finally` release is null-guarded for the same reason.
  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1. FK SAFETY, re-checked against the LIVE catalog rather than trusted from the 2026-10-01
    //    measurement. If a FK appeared since, a DELETE on this table could fire an ON DELETE
    //    action — so discover every FK whose target is this table, then count referencing rows
    //    for every key we are about to delete. Zero today; the check is what makes that a fact
    //    instead of an assumption.
    for (const table of tables) {
      const delKeys = [...cohort[table].D, ...cohort[table].P];
      const fks = (
        await client.query(
          `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
             FROM pg_constraint c
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            WHERE c.confrelid = $1::regclass AND c.contype = 'f'`,
          [table],
        )
      ).rows;
      for (const fk of fks) {
        // `tbl` is already rendered by regclass (hence correctly schema-quoted); the column name
        // is a raw catalog value, so it is quoted by hand.
        const n = Number(
          (await client.query(`SELECT count(*)::int AS n FROM ${fk.tbl} WHERE "${fk.col}" = ANY($1::bigint[])`, [delKeys])).rows[0].n,
        );
        console.log(`[differential:${side}]   fk ${table} <- ${fk.tbl}.${fk.col}: ${n}`);
        if (n > 0) {
          await client.query('ROLLBACK');
          console.error(`[differential:${side}] HALT: FK reference to a cohort-inserted key — manual restore from ${beforePath}`);
          return false;
        }
      }
    }

    for (const table of tables) {
      const rows = before.filter((r) => r.__table === table);

      // 2. Any row present at a cohort-instrumented key the step RE-INSERTED (the D arm's rows,
      //    which the before-image knows) must be deleted so the before-image can be written back
      //    without a unique collision; the P phantom is always a to-delete row regardless of arm
      //    bookkeeping. The D-arm delete is addressed by the COHORT key (`source_id`) — the
      //    before-image is projected WITHOUT `id`, so a `Number(r.id)` selector was `{NaN}` and
      //    every restore threw `invalid input syntax for type bigint: "NaN"` (B2). Built by the
      //    pure, tested builder; the P delete keeps its own explicit `source_id = ANY(...)`.
      const reinsertedKeys = cohort[table].D;
      const doomedPresent = (
        await client.query(`SELECT ${KEY} FROM ${table} WHERE ${KEY} = ANY($1::bigint[])`, [reinsertedKeys])
      ).rows.map((r) => Number(r[KEY]));
      const phantomPresent = (
        await client.query(`SELECT ${KEY} FROM ${table} WHERE ${KEY} = ANY($1::bigint[])`, [cohort[table].P])
      ).rows.map((r) => Number(r[KEY]));
      const toDeleteKeys = [...new Set([...doomedPresent, ...phantomPresent])];
      if (toDeleteKeys.length > 0) {
        const del = buildRestoreDeleteSql(table, toDeleteKeys);
        const res = await client.query(del.text, del.params);
        console.log(`[differential:${side}]   restore: deleted ${res.rowCount} step-inserted/phantom row(s) on ${table}`);
      } else {
        console.log(`[differential:${side}]   restore: no step-inserted/phantom row(s) to delete on ${table}`);
      }

      // 3. Re-INSERT from the before-image ONLY where the key is absent (a D-arm row the step did
      //    NOT put back — e.g. a skipped lane). A present key is handled by the full UPDATE below.
      const cols = PROJ[table];
      let inserted = 0;
      let updated = 0;
      for (const r of rows) {
        const exists = Number(
          (await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${KEY} = $1`, [Number(r[KEY])])).rows[0].n,
        );
        if (exists === 0) {
          // `negativeTemplate` is not needed here: the before-image row carries every projected
          // column, and the omitted `id`/`updated_at` fall back to their DDL defaults — neither is
          // in the projection, so neither can move the hash.
          const placeholders = cols.map((c, i) => (c === 'geom' ? `ST_GeomFromEWKB(decode($${i + 1}, 'hex'))` : `$${i + 1}::${COLUMN_TYPE[c]}`));
          const params = cols.map((c) => (c === 'geom' ? r.geom_hex : r[c]));
          const res = await client.query(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
            params,
          );
          inserted += res.rowCount;
        } else {
          // Full-row UPDATE from the before-image: the U arm's version stamp, the A arm's
          // `bylaw_no`, and every other projected column, bound as-is (geom from its WKB hex).
          const setClause = cols.filter((c) => c !== KEY)
            .map((c, i) => (c === 'geom' ? `geom = ST_GeomFromEWKB(decode($${i + 2}, 'hex'))` : `${c} = $${i + 2}::${COLUMN_TYPE[c]}`))
            .join(', ');
          const params = [Number(r[KEY]), ...cols.filter((c) => c !== KEY).map((c) => (c === 'geom' ? r.geom_hex : r[c]))];
          const res = await client.query(
            `UPDATE ${table} SET ${setClause} WHERE ${KEY} = $1`,
            params,
          );
          updated += res.rowCount;
        }
      }
      console.log(`[differential:${side}]   restore: ${table} re-inserted ${inserted}/${rows.length}, updated ${updated}/${rows.length}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    // hf4/N1: `client` may be null (the connect itself failed) — guard the ROLLBACK attempt, and
    // still report the recovery path so the operator always has the before-image named.
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    }
    console.error(`[differential:${side}] RESTORE FAILED: ${err.message} — manual restore from ${beforePath}`);
    return false;
  } finally {
    if (client) client.release();
  }

  // 4. Verify on the pool, once the restore txn has committed.
  return verifyBaseline({ pool, cohort, beforePath, side });
}

/** Both tables' hashes against the cohort baseline; never throws. */
async function verifyBaseline({ pool, cohort, beforePath, side }) {
  try {
    let ok = true;
    for (const table of TABLES) {
      const h = (await pool.query(hashSql(table))).rows[0].h;
      const n = Number((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      const hOk = h === cohort.baseline[table];
      if (!hOk) ok = false;
      console.log(`[differential:${side}]   verify ${table}: hash ${h} ${hOk ? '(OK)' : `(MISMATCH — baseline ${cohort.baseline[table]})`} count ${n}`);
    }
    return ok;
  } catch (err) {
    console.error(`[differential:${side}] RESTORE FAILED: verification query threw ${err.message} — manual restore from ${beforePath}`);
    return false;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const HELP = `load-heritage-cohort-differential — heritage_properties/heritage_districts (batch-2 row 3.4) R-AS cohort differential

Usage:
  node -r dotenv/config scripts/analysis/load-heritage-cohort-differential.js --derive
  node -r dotenv/config scripts/analysis/load-heritage-cohort-differential.js --run --side=pre|post \\
      --legacy-ref=<ref> [--chain=sources|none] --out=<golden path>

  --derive   SELECT-only (one READ ONLY txn). Writes ${path.relative(REPO_ROOT, COHORT_PATH)}:
             per table a DISJOINT, EXHAUSTIVE carve of the ascending source_id list — U (guard
             heal: source_dataset_version), D (insert path: the rows are DELETEd), A (the
             guard-composition witness: bylaw_no, a NON-guard column), P (one phantom row at
             max(key)+${PHANTOM_OFFSET} for the F-C1 departure DELETE) and the negative_control
             remainder — plus the projected baseline hash per table.
  --run      Requires a committed cohort whose baseline still matches BOTH tables (else it
             refuses: check for a LEFTOVER PERTURBATION FIRST — re-deriving over a perturbed
             table bakes it into the baseline). Applies the arms, spawns the REAL step
             (scripts/load-heritage.js) through capture-step-golden.js with
             ${FORCE_ENV}=1, reads the FIRST PIPELINE_SUMMARY line's records_meta.heritage_load,
             computes the after-hashes, calls judge(), then RESTORES when (and only when) a
             perturbation landed and re-verifies. Exit 1 = a refusal before any write, or a
             claim failed; exit 2 = the restore failed (manual restore from the before-image
             path it prints).
  --legacy-ref=<ref>
             REQUIRED for --side=pre. scripts/load-heritage.js is the CONVERTED shim in this
             tree, so PRE would record converted output as the legacy golden: PRE reads
             <ref>:scripts/load-heritage.js out of git and refuses unless the WORKING file is
             NOT a converted shim AND is byte-equal to it (CRLF-normalised). POST refuses
             unless the working file IS a converted shim.
  --help     This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv);
  if (args.derive) return derive();
  if (args.run) return run(args);
  throw new Error('nothing to do: pass --derive or --run (see --help)');
}

module.exports = {
  SIZES, deriveCohort, judge, TABLES, PROJ, A_COLUMN, PHANTOM_OFFSET,
  buildPhantomInsertSql, buildRestoreDeleteSql, COLUMN_TYPE, GEOM_BIND,
  // hf3: the PRE/POST gate signals and the abort surface (the c2h1 lock + this test read them).
  sameSource, isConvertedShim, abortIfInterrupted, parseArgs, STEP_REL,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('[differential] ERROR:', err.message);
    process.exitCode = process.exitCode || 1;
  });
}
