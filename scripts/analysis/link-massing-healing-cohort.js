#!/usr/bin/env node
/**
 * link-massing-healing-cohort — the HEALING COHORT bracket that closes link_massing's two
 * gate G #38 rows (`nonzero:parcel_buildings`, `nonzero:parcels`).
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-AS, R-BA (gate G), R-BC(b)
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (link_massing)
 * PLAN: .cursor/wf2_link_massing_nonzero_close_active_task.md D3/D4 (operator-approved 2026-10-06)
 *
 * WHY. Every link_massing POST capture is a steady-state re-derive that writes 0 rows, so no
 * capture can prove a write to either of its two tables. This bracket perturbs a small, frozen,
 * declared set that the step's OWN guards must heal, runs the REAL step through the capture
 * harness, asserts the exact PER-TARGET counts (records_meta keys from `written.e1..e4`), and
 * restores unconditionally to the byte-identical baseline.
 *
 *   Arm U (proves parcel_buildings, e2): N_U non-primary centroid_in_parcel links get
 *     `confidence := confidence - U_DECREMENT` (a guard column). The guarded upsert must
 *     rewrite exactly N_U (`links_updated`); their linked_at moves to the run clock.
 *   Arm X (proves parcels, e4, and e3): N_X phantom links (P, B), B's centroid NOT inside P,
 *     P primary-matched and massing_enriched_at NOT NULL. The keyed delete must remove exactly
 *     N_X (`links_deleted`) and the lost-link flag must NULL massing_enriched_at on exactly N_X
 *     parcels (`parcels_flagged_lost_link`).
 *
 * The match / stale / flag / delete SQL is the COMPUTE's own (`buildMatchSql`), never re-typed;
 * the classifier is the compute's own `classifyMatches`; the hash builder is the capture
 * harness's own `rowTextExpr` (RULING R-C shape). This file holds no domain SQL beyond its own
 * selection predicates.
 *
 * NEGATIVE CONTROL (fold X-1). A full-diff restore erases collateral writes before any hash is
 * taken, so the post-restore hash proves only the RESTORE. The step itself is judged by a
 * PRE-RESTORE diff against the two full-table backups, taken after the harness child exits (so
 * after run 2): parcel_buildings 0 extra, 0 missing, changed rows == exactly the U keys (guard
 * columns equal to the backup, only linked_at moved); parcels changed == exactly the X parcels
 * (NOT NULL -> NULL). Any other set is a STOP (the restore still runs; exit 1).
 *
 * RESTORE PROOF (operator ruling 2026-10-06, R-AS (ii)): after the full-diff restore, the STRICT
 * whole-table hash — every column, linked_at and id included — of parcel_buildings AND of
 * parcels must equal the baseline recorded at --backup. `restored: true` only then.
 *
 * SAFETY (the reviewed shape of ingestor-forced-cohort.js): loopback-only target asserted
 * before any query (`assertLocalTarget`); the cluster pinned by `system_identifier` (fold R-1);
 * single-mode argv; backup names validated before any DDL (fold F-10); two FULL-table backups
 * created and verified before any perturb (folds F-4/F-5); the perturbation in ONE transaction
 * with `perturbed = true` latched immediately before COMMIT; the bracket lock 902004 through
 * `pipeline.withAdvisoryLock` (fold I-3); SIGINT/SIGTERM forwarded to the harness child, then
 * any lingering link_massing backend cancelled, then restore (fold F-11); no process.exit().
 *
 * MODES (exactly one):
 *   --self-test   No DB. Exercises every pure helper; prints 'self-test PASSED'.
 *   --derive      READ ONLY. Selects the U keys and the X (P,B) phantoms, proves (a) every P is
 *                 primary-matched, (b) (P,B) is not derived, (c) (P,B) is not stored, and that
 *                 every touched parcel's stored links equal the compute's derived links (0
 *                 drift, so the expected counts are EXACT). Writes the frozen recipe
 *                 (docs/reports/golden/link_massing/healing/recipe.json).
 *   --backup      CREATE TABLE <base>_pb AS SELECT * FROM parcel_buildings and <base>_pm AS
 *                 SELECT id, massing_enriched_at FROM parcels; verifies both against live;
 *                 records the strict baseline hashes + the cluster identity in the recipe.
 *   --run         Perturb, spawn the harness POST capture, assert, pre-restore diff, restore.
 *   --restore     Full-diff restore from the backups + strict-hash verification.
 *   --help        This text.
 *
 * Usage (LOCAL dev DB only):
 *   node scripts/analysis/link-massing-healing-cohort.js --self-test
 *   node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --derive
 *   node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --backup --backup-table=link_massing_cohort_bak_<yyyymmddthhmmz>
 *   node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --run --backup-table=<same> [--chain=sources] [--out=docs/reports/golden/link_massing/post/cohort-heal.json]
 *   node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --restore --backup-table=<same>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');
const { resolveConfig } = require('../lib/step/config');
const pipeline = require('../lib/pipeline');
const compute = require('../lib/compute/link-massing.js');
// The capture harness's OWN row-text builder (RULING R-C shape: one definition).
const { rowTextExpr } = require('./capture-step-golden.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS = 'scripts/analysis/capture-step-golden.js';
const STEP_SCRIPT = 'scripts/link-massing.js';
const DESCRIPTOR_REL = 'scripts/link-massing.descriptor.json';
const RECIPE_REL = 'docs/reports/golden/link_massing/healing/recipe.json';
const CAPTURE_REL = 'docs/reports/golden/link_massing/post/cohort-heal.json';
const POST_DIR_REL = 'docs/reports/golden/link_massing/post/';

/**
 * Fold I-3: the bracket's own advisory lock, held across the harness spawn. The three other cohort
 * brackets' ids are taken (git grep -nE "LOCK[A-Z_]* *= *[0-9]{5,}" -- scripts); 91 is the step's own lock,
 * which the spawned step must still be able to take (no self-skip).
 */
const COHORT_LOCK_ID = 902004;
/** The cohort (plan D3, Q3): a proof, not a finding — below the 100-row materiality line by design. */
const N_U = 50;
const N_X = 25;
/** Arm U's perturbation of the guard column `confidence`. */
const U_DECREMENT = 0.01;
/** How many qualifying parcels past the N_X-th the B walk may look ahead (no wrap-around). */
const CANDIDATE_LOOKAHEAD = 35;
/** Arm X's phantom row: non-primary, so neither the E1 clear nor the one-primary index is in play. */
const PHANTOM = Object.freeze({
  is_primary: false,
  structure_type: 'other',
  match_type: 'centroid_in_parcel',
  linked_at: '2000-01-01T00:00:00.000Z',
});
/** parcel_buildings' columns, in table order (verified against information_schema at --backup). */
const PB_COLUMNS = ['id', 'parcel_id', 'building_id', 'is_primary', 'structure_type', 'linked_at', 'match_type', 'confidence'];
/** The before-image base name (fold F-10). `_pb`/`_pm` are constant suffixes appended AFTER validation (X-14). */
const BACKUP_BASE_RE = /^link_massing_cohort_bak_\d{8}t\d{4}z$/;
/** Loopback only, on the RESOLVED description (connection-string `@host:` or discrete `host:port/`). */
const LOCAL_HOST_RE = /(^|@)(127\.0\.0\.1|localhost)[:/]/;
/** Lists returned by the pre-restore diff are capped; a list that long is a STOP regardless. */
const DIFF_LIST_CAP = 1000;
/** Lingering-backend cancel: polls and the wait between them. */
const CANCEL_POLLS = 30;
const CANCEL_POLL_MS = 1000;

const MODES = ['self-test', 'derive', 'backup', 'run', 'restore', 'help'];

// ── argv (pure) ──────────────────────────────────────────────────────────────
/** Validate the backup base name and derive the two table names. Pure; throws on a bad name. */
function backupNames(base) {
  if (typeof base !== 'string' || !BACKUP_BASE_RE.test(base)) {
    throw new Error(`--backup-table must match ${BACKUP_BASE_RE} (got ${JSON.stringify(base)})`);
  }
  return { pb: `${base}_pb`, pm: `${base}_pm` };
}

/**
 * Parse argv into `{mode, backupBase, out, chain}`. Pure. Exactly ONE mode; --backup, --run and
 * --restore need a valid --backup-table (validated HERE, before any connect).
 */
function parseArgs(argv) {
  const out = { mode: null, backupBase: null, out: CAPTURE_REL, chain: 'sources' };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
    const [, name, value] = m;
    if (MODES.includes(name) && value === undefined) {
      if (out.mode !== null) throw new Error(`pass exactly one mode (got --${out.mode} and --${name})`);
      out.mode = name;
      continue;
    }
    if (name === 'backup-table' && value !== undefined) { out.backupBase = value; continue; }
    if (name === 'out' && value !== undefined) { out.out = value; continue; }
    if (name === 'chain' && value !== undefined) { out.chain = value; continue; }
    throw new Error(`unknown flag --${name} (try --help)`);
  }
  if (out.mode === null) throw new Error(`nothing to do: pass one of ${MODES.map((x) => `--${x}`).join('|')}`);
  if (['backup', 'run', 'restore'].includes(out.mode)) backupNames(out.backupBase);
  if (!/^[a-z_]+$/.test(out.chain)) throw new Error(`--chain must be a chain id (got ${JSON.stringify(out.chain)})`);
  const norm = String(out.out).split(path.sep).join('/');
  if (!norm.startsWith(POST_DIR_REL) || !norm.endsWith('.json') || norm.includes('..')) {
    throw new Error(`--out must be a .json under ${POST_DIR_REL} (got ${JSON.stringify(out.out)})`);
  }
  out.out = norm;
  return out;
}

/** F1 (cloud risk): throw unless the RESOLVED target description is loopback. Pure. */
function assertLocalTarget(description) {
  if (typeof description !== 'string' || !LOCAL_HOST_RE.test(description)) {
    throw new Error(`REFUSING: the resolved DB target ${JSON.stringify(description)} is not a loopback host — `
      + 'this bracket PERTURBS and RESTORES real rows and is a LOCAL dev instrument only');
  }
  return description;
}

/** Fold R-1: the recorded cluster identity must equal the live one. Pure. */
function identityCheck(recorded, live) {
  if (!recorded || !live) return { ok: false, reason: 'no recorded cluster identity (take --backup first)' };
  if (recorded.database !== live.database) {
    return { ok: false, reason: `database ${JSON.stringify(live.database)} != recorded ${JSON.stringify(recorded.database)}` };
  }
  if (String(recorded.system_identifier) !== String(live.system_identifier)) {
    return { ok: false, reason: `system_identifier ${live.system_identifier} != recorded ${recorded.system_identifier} — a different cluster` };
  }
  return { ok: true };
}

function abortIfInterrupted(state) {
  if (state && state.interrupted) throw new Error('interrupted by a signal — aborting before the next write');
}

/** 2 = the restore failed (the table is suspect); 1 = a claim failed or the restore did not verify; else 0. Pure. */
function exitCodeFor({ asserted, restored, restoreFailed }) {
  if (restoreFailed) return 2;
  if (!asserted || !restored) return 1;
  return 0;
}

// ── selection (pure) ─────────────────────────────────────────────────────────
function pairKey(parcelId, buildingId) {
  return `${Number(parcelId)}:${Number(buildingId)}`;
}

function keyOf(r) {
  return { parcel_id: Number(r.parcel_id), building_id: Number(r.building_id) };
}

/**
 * Arm X's phantoms (folds F-1/F-2/F-3). P = each of the first `n` candidates (ordered by parcel
 * id). B = walk FORWARD from P's position and take the first later candidate's primary building
 * whose (P,B) is neither DERIVED (the compute's own primary_match_sql would re-create it) nor
 * STORED (the UNIQUE constraint would abort the INSERT). No wrap-around: a short walk refuses.
 */
function selectPhantoms({ candidates, derivedPairs, storedPairs, n }) {
  if (!Array.isArray(candidates) || candidates.length < n) {
    throw new Error(`only ${Array.isArray(candidates) ? candidates.length : 0} candidate parcel(s), need ${n}`);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = Number(candidates[i].parcel_id);
    let found = null;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = Number(candidates[j].primary_building_id);
      const key = pairKey(p, b);
      if (derivedPairs.has(key) || storedPairs.has(key)) continue;
      found = { parcel_id: p, building_id: b };
      break;
    }
    if (!found) throw new Error(`no phantom building found for parcel ${p} in the ${candidates.length - i - 1} candidate(s) after it (no wrap-around)`);
    out.push(found);
  }
  return out;
}

function guardEqual(a, b) {
  return a.is_primary === b.is_primary
    && a.structure_type === b.structure_type
    && a.match_type === b.match_type
    && Number(a.confidence) === Number(b.confidence);
}

/**
 * Stored links vs the compute's derived links over the touched parcels. `ok` iff the key sets
 * are equal and every guard column agrees (numeric confidence). This is the basis for EXACT
 * expected counts: with 0 drift, only the perturbation can move a row. Pure.
 */
function driftCheck({ stored, derived }) {
  const d = new Map(derived.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  const s = new Map(stored.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  const extra = stored.filter((r) => !d.has(pairKey(r.parcel_id, r.building_id))).map(keyOf);
  const missing = derived.filter((r) => !s.has(pairKey(r.parcel_id, r.building_id))).map(keyOf);
  const guardDiff = stored
    .filter((r) => d.has(pairKey(r.parcel_id, r.building_id)) && !guardEqual(r, d.get(pairKey(r.parcel_id, r.building_id))))
    .map(keyOf);
  return { ok: extra.length === 0 && missing.length === 0 && guardDiff.length === 0, extra, missing, guardDiff };
}

/**
 * Every selection proof over a read-only snapshot, for a FROZEN recipe. Pure.
 * state = {derived: [link rows], stored: [link rows], enrichedNotNull: [parcel ids]}.
 */
function selectionProofs({ state, uKeys, xPairs, confidence }) {
  const reasons = [];
  const drift = driftCheck({ stored: state.stored, derived: state.derived });
  if (!drift.ok) {
    reasons.push(`drift on the touched parcels: ${drift.extra.length} stored-not-derived, ${drift.missing.length} derived-not-stored, ${drift.guardDiff.length} guard-diff`);
  }
  const derivedParcels = new Set(state.derived.map((r) => Number(r.parcel_id)));
  const derivedPairs = new Set(state.derived.map((r) => pairKey(r.parcel_id, r.building_id)));
  const storedByKey = new Map(state.stored.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  const touched = new Set([...uKeys, ...xPairs].map((k) => Number(k.parcel_id)));
  const unmatched = [...touched].filter((p) => !derivedParcels.has(p));
  if (unmatched.length > 0) reasons.push(`(a) ${unmatched.length} touched parcel(s) not primary-matched (would reach the fallback): ${unmatched.slice(0, 10).join(',')}`);
  const xDerived = xPairs.filter((x) => derivedPairs.has(pairKey(x.parcel_id, x.building_id)));
  if (xDerived.length > 0) reasons.push(`(b) ${xDerived.length} phantom pair(s) ARE derived — the step would re-create them`);
  const xStored = xPairs.filter((x) => storedByKey.has(pairKey(x.parcel_id, x.building_id)));
  if (xStored.length > 0) reasons.push(`(c) ${xStored.length} phantom pair(s) already stored — the INSERT would collide`);
  const enriched = new Set((state.enrichedNotNull || []).map(Number));
  const notEnriched = xPairs.filter((x) => !enriched.has(Number(x.parcel_id)));
  if (notEnriched.length > 0) reasons.push(`${notEnriched.length} X parcel(s) have massing_enriched_at NULL — the flag could not move them`);
  const badU = uKeys.filter((u) => {
    const r = storedByKey.get(pairKey(u.parcel_id, u.building_id));
    return !r || r.is_primary !== false || r.match_type !== 'centroid_in_parcel' || Number(r.confidence) !== Number(confidence);
  });
  if (badU.length > 0) reasons.push(`${badU.length} U key(s) are no longer stored as non-primary centroid_in_parcel @ ${confidence}`);
  return {
    ok: reasons.length === 0,
    reasons,
    counts: {
      touched_parcels: touched.size,
      drift_extra: drift.extra.length,
      drift_missing: drift.missing.length,
      drift_guard_diff: drift.guardDiff.length,
      x_primary_matched: xPairs.filter((x) => derivedParcels.has(Number(x.parcel_id))).length,
      x_pairs_derived: xDerived.length,
      x_pairs_stored: xStored.length,
    },
  };
}

// ── claims (pure) ────────────────────────────────────────────────────────────
/**
 * The EXACT per-target counts of run 1 (the capture's `summary`). Never a `>=`: the basis is the
 * measured steady state of 0 drift, so any extra count is a STOP. Pure.
 */
function countsClaim(summary, recipe) {
  const nU = recipe.u_keys.length;
  const nX = recipe.x_pairs.length;
  const s = summary && typeof summary === 'object' ? summary : null;
  if (!s) return { ok: false, reasons: ['no summary in the capture'], expected: null };
  const meta = s.records_meta && typeof s.records_meta === 'object' ? s.records_meta : {};
  const expected = {
    records_new: 0,
    records_updated: nU,
    links_updated: nU,
    links_inserted: 0,
    primary_cleared: 0,
    links_deleted: nX,
    parcels_flagged_lost_link: nX,
  };
  const got = {
    records_new: s.records_new,
    records_updated: s.records_updated,
    links_updated: meta.links_updated,
    links_inserted: meta.links_inserted,
    primary_cleared: meta.primary_cleared,
    links_deleted: meta.links_deleted,
    parcels_flagged_lost_link: meta.parcels_flagged_lost_link,
  };
  const reasons = Object.keys(expected)
    .filter((k) => typeof got[k] !== 'number' || got[k] !== expected[k])
    .map((k) => `${k}: expected ${expected[k]}, got ${JSON.stringify(got[k])}`);
  return { ok: reasons.length === 0, reasons, expected, got };
}

/** Run 2 (the harness's automatic rerun proof) wrote 0: parcels `zero`, parcel_buildings `drift_declared`|`zero`. Pure. */
function rerunClaim(doc) {
  const rp = doc && doc.rerun_proof;
  const rows = rp && Array.isArray(rp.rows) ? rp.rows : null;
  if (!rows) return { ok: false, reasons: ['no rerun_proof.rows in the capture'] };
  const reasons = [];
  const pbRow = rows.find((r) => r && r.table === 'parcel_buildings');
  const pRow = rows.find((r) => r && r.table === 'parcels');
  if (!pbRow || !['drift_declared', 'zero'].includes(pbRow.answer)) reasons.push(`parcel_buildings run-2 answer ${JSON.stringify(pbRow && pbRow.answer)}`);
  if (!pRow || pRow.answer !== 'zero') reasons.push(`parcels run-2 answer ${JSON.stringify(pRow && pRow.answer)}`);
  if (!rp.run2 || rp.run2.exit_code !== 0) reasons.push(`run 2 exit_code ${JSON.stringify(rp.run2 && rp.run2.exit_code)}`);
  return { ok: reasons.length === 0, reasons };
}

/** Fold I-4: descriptor-derived invariants (no --invariants file), count read from the descriptor. Pure. */
function captureShapeClaim(doc, descriptor) {
  const reasons = [];
  if (!doc || typeof doc !== 'object') return { ok: false, reasons: ['no capture document'] };
  if (doc.exit_code !== 0) reasons.push(`run 1 exit_code ${JSON.stringify(doc.exit_code)}`);
  if (doc.invariants_file !== null) reasons.push(`invariants_file ${JSON.stringify(doc.invariants_file)} (expected null: descriptor-derived)`);
  const want = (Array.isArray(descriptor.invariants) ? descriptor.invariants.length : 0)
    + (Array.isArray(descriptor.plausibility) ? descriptor.plausibility.length : 0);
  const have = Array.isArray(doc.invariants) ? doc.invariants.length : -1;
  if (have !== want) reasons.push(`invariants ${have} (expected ${want} from the descriptor)`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Fold X-1 — the NEGATIVE CONTROL. Judges the pre-restore diff (step alone, after run 2) against
 * the frozen recipe. Exact sets; anything else is a STOP. Pure.
 */
function judgePreRestore({ diff, recipe }) {
  const reasons = [];
  const uSet = new Set(recipe.u_keys.map((k) => pairKey(k.parcel_id, k.building_id)));
  const xParcels = new Set(recipe.x_pairs.map((k) => Number(k.parcel_id)));
  if (diff.pb.extra.length !== 0) reasons.push(`parcel_buildings: ${diff.pb.extra.length} row(s) live but not in the backup (a phantom survived, or a new link)`);
  if (diff.pb.missing.length !== 0) reasons.push(`parcel_buildings: ${diff.pb.missing.length} backup row(s) missing live (a collateral delete)`);
  const changed = new Set(diff.pb.changed.map((c) => pairKey(c.parcel_id, c.building_id)));
  const strayChanged = [...changed].filter((k) => !uSet.has(k));
  const unhealed = [...uSet].filter((k) => !changed.has(k));
  if (strayChanged.length > 0) reasons.push(`parcel_buildings: ${strayChanged.length} changed row(s) outside the U keys: ${strayChanged.slice(0, 10).join(',')}`);
  if (unhealed.length > 0) reasons.push(`parcel_buildings: ${unhealed.length} U key(s) not rewritten by the step`);
  const guardMoved = diff.pb.changed.filter((c) => c.guard_equal !== true);
  if (guardMoved.length > 0) reasons.push(`parcel_buildings: ${guardMoved.length} changed row(s) whose guard columns differ from the backup (not healed)`);
  const clockStill = diff.pb.changed.filter((c) => c.linked_at_moved !== true);
  if (clockStill.length > 0) reasons.push(`parcel_buildings: ${clockStill.length} changed row(s) whose linked_at did not move`);
  if (diff.pm.extra !== 0 || diff.pm.missing !== 0) reasons.push(`parcels: ${diff.pm.extra} extra / ${diff.pm.missing} missing id(s) vs the backup`);
  const pmChanged = new Set(diff.pm.changed.map((c) => Number(c.id)));
  const strayParcels = [...pmChanged].filter((id) => !xParcels.has(id));
  const unflagged = [...xParcels].filter((id) => !pmChanged.has(id));
  if (strayParcels.length > 0) reasons.push(`parcels: ${strayParcels.length} changed parcel(s) outside the X set: ${strayParcels.slice(0, 10).join(',')}`);
  if (unflagged.length > 0) reasons.push(`parcels: ${unflagged.length} X parcel(s) not flagged`);
  const wrongFlag = diff.pm.changed.filter((c) => c.before === null || c.after !== null);
  if (wrongFlag.length > 0) reasons.push(`parcels: ${wrongFlag.length} change(s) that are not massing_enriched_at NOT NULL -> NULL`);
  return { ok: reasons.length === 0, reasons };
}

// ── restore plan (pure mirror of the restore SQL, for the self-test / T7) ────
function rowText(r) {
  return PB_COLUMNS.map((c) => String(r[c])).join('|');
}

/** Extra -> delete; missing -> insert (original id); changed -> update to the backup row. Pure. */
function restorePlan(live, backup) {
  const b = new Map(backup.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  const l = new Map(live.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  return {
    del: live.filter((r) => !b.has(pairKey(r.parcel_id, r.building_id))).map(keyOf),
    ins: backup.filter((r) => !l.has(pairKey(r.parcel_id, r.building_id))),
    upd: backup.filter((r) => l.has(pairKey(r.parcel_id, r.building_id)) && rowText(l.get(pairKey(r.parcel_id, r.building_id))) !== rowText(r)),
  };
}

/** Apply a restorePlan to an in-memory row set. Pure. */
function applyRestorePlan(live, plan) {
  const del = new Set(plan.del.map((k) => pairKey(k.parcel_id, k.building_id)));
  const upd = new Map(plan.upd.map((r) => [pairKey(r.parcel_id, r.building_id), r]));
  const kept = live
    .filter((r) => !del.has(pairKey(r.parcel_id, r.building_id)))
    .map((r) => upd.get(pairKey(r.parcel_id, r.building_id)) || r);
  return [...kept, ...plan.ins];
}

// ── SQL builders (pure; table names are module constants or validated backup names) ──
const ENRICHED_ELIGIBLE = `SELECT id FROM parcels WHERE ${compute.PARCEL_ELIGIBILITY} AND geom IS NOT NULL`;

function uSelectSql() {
  return 'SELECT pb.parcel_id, pb.building_id, pb.confidence::text AS confidence, pb.linked_at::text AS linked_at\n'
    + '  FROM parcel_buildings pb\n'
    + " WHERE pb.match_type = 'centroid_in_parcel' AND pb.is_primary = false AND pb.confidence = $1\n"
    + `   AND pb.parcel_id IN (${ENRICHED_ELIGIBLE})\n`
    + ' ORDER BY pb.parcel_id, pb.building_id\n'
    + ' LIMIT $2';
}

function xCandidatesSql() {
  return 'SELECT pb.parcel_id, pb.building_id AS primary_building_id\n'
    + '  FROM parcel_buildings pb\n'
    + ' WHERE pb.is_primary = true\n'
    + `   AND pb.parcel_id IN (${ENRICHED_ELIGIBLE} AND massing_enriched_at IS NOT NULL)\n`
    + "   AND EXISTS (SELECT 1 FROM parcel_buildings c WHERE c.parcel_id = pb.parcel_id AND c.match_type = 'centroid_in_parcel')\n"
    + ' ORDER BY pb.parcel_id\n'
    + ' LIMIT $1';
}

const STORED_LINKS_SQL = 'SELECT parcel_id, building_id, is_primary, structure_type, match_type, confidence::text AS confidence\n'
  + '  FROM parcel_buildings WHERE parcel_id = ANY($1::int[])';
const ENRICHED_SQL = 'SELECT id FROM parcels WHERE id = ANY($1::int[]) AND massing_enriched_at IS NOT NULL';
const IDENTITY_SQL = 'SELECT current_database() AS database, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier';
const PB_COLUMNS_SQL = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parcel_buildings' ORDER BY ordinal_position";
const TABLE_EXISTS_SQL = 'SELECT to_regclass($1) IS NOT NULL AS exists';

/**
 * The strict whole-table hash (operator ruling 2026-10-06, R-AS (ii)): every column, via the
 * harness's own `rowTextExpr` (the whole row when no projection), per-row md5 then an ordered
 * aggregate (bounded memory on wide tables). `columns` null = every column.
 */
function hashSql(table, orderCols, columns) {
  const sub = orderCols.map((c) => `sub."${c}"`).join(', ');
  const sel = orderCols.map((c) => `t."${c}"`).join(', ');
  return `SELECT count(*)::bigint AS n, md5(string_agg(sub.rh, '|' ORDER BY ${sub})) AS h\n`
    + `  FROM (SELECT ${sel}, md5(${rowTextExpr(columns)}) AS rh FROM "${table}" t) sub`;
}

const PB_ORDER = ['parcel_id', 'building_id'];
const PARCELS_ORDER = ['id'];
const PM_COLUMNS = ['id', 'massing_enriched_at'];

function backupCreateSqls(names) {
  return [
    `CREATE TABLE "${names.pb}" AS SELECT * FROM parcel_buildings`,
    `CREATE TABLE "${names.pm}" AS SELECT id, massing_enriched_at FROM parcels`,
  ];
}

function perturbSqls() {
  return {
    u: 'UPDATE parcel_buildings pb SET confidence = pb.confidence - $3::numeric\n'
      + '  FROM unnest($1::int[], $2::int[]) AS u(parcel_id, building_id)\n'
      + ' WHERE pb.parcel_id = u.parcel_id AND pb.building_id = u.building_id\n'
      + "   AND pb.is_primary = false AND pb.match_type = 'centroid_in_parcel' AND pb.confidence = $4::numeric",
    x: 'INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, linked_at, match_type, confidence)\n'
      + 'SELECT x.parcel_id, x.building_id, $3::boolean, $4::text, $5::timestamptz, $6::text, $7::numeric\n'
      + '  FROM unnest($1::int[], $2::int[]) AS x(parcel_id, building_id)',
  };
}

function preRestoreDiffSqls(names) {
  const pb = `"${names.pb}"`;
  const pm = `"${names.pm}"`;
  const onKey = 'b.parcel_id = l.parcel_id AND b.building_id = l.building_id';
  return {
    pbExtra: `SELECT l.parcel_id, l.building_id FROM parcel_buildings l WHERE NOT EXISTS (SELECT 1 FROM ${pb} b WHERE ${onKey}) ORDER BY 1, 2 LIMIT ${DIFF_LIST_CAP}`,
    pbMissing: `SELECT b.parcel_id, b.building_id FROM ${pb} b WHERE NOT EXISTS (SELECT 1 FROM parcel_buildings l WHERE ${onKey}) ORDER BY 1, 2 LIMIT ${DIFF_LIST_CAP}`,
    pbChanged: 'SELECT l.parcel_id, l.building_id,\n'
      + '       ((l.is_primary, l.structure_type, l.match_type, l.confidence) IS NOT DISTINCT FROM (b.is_primary, b.structure_type, b.match_type, b.confidence)) AS guard_equal,\n'
      + '       (l.linked_at IS DISTINCT FROM b.linked_at) AS linked_at_moved\n'
      + `  FROM parcel_buildings l JOIN ${pb} b ON ${onKey}\n`
      + ` WHERE l::text IS DISTINCT FROM b::text ORDER BY 1, 2 LIMIT ${DIFF_LIST_CAP}`,
    pmExtra: `SELECT count(*)::int AS n FROM parcels p WHERE NOT EXISTS (SELECT 1 FROM ${pm} b WHERE b.id = p.id)`,
    pmMissing: `SELECT count(*)::int AS n FROM ${pm} b WHERE NOT EXISTS (SELECT 1 FROM parcels p WHERE p.id = b.id)`,
    pmChanged: 'SELECT p.id, b.massing_enriched_at::text AS before, p.massing_enriched_at::text AS after\n'
      + `  FROM parcels p JOIN ${pm} b ON b.id = p.id\n`
      + ` WHERE p.massing_enriched_at IS DISTINCT FROM b.massing_enriched_at ORDER BY p.id LIMIT ${DIFF_LIST_CAP}`,
  };
}

/** The full-diff restore, in the order it runs inside ONE transaction (F-4/F-5). Pure. */
function restoreSqls(names) {
  const pb = `"${names.pb}"`;
  const pm = `"${names.pm}"`;
  const onKey = 'b.parcel_id = l.parcel_id AND b.building_id = l.building_id';
  const setCols = PB_COLUMNS.filter((c) => c !== 'parcel_id' && c !== 'building_id').map((c) => `${c} = b.${c}`).join(', ');
  return [
    { label: 'parcel_buildings extra -> DELETE', text: `DELETE FROM parcel_buildings l WHERE NOT EXISTS (SELECT 1 FROM ${pb} b WHERE ${onKey})` },
    { label: 'parcel_buildings changed -> UPDATE', text: `UPDATE parcel_buildings l SET ${setCols} FROM ${pb} b WHERE ${onKey} AND l::text IS DISTINCT FROM b::text` },
    {
      label: 'parcel_buildings missing -> INSERT (original id)',
      text: `INSERT INTO parcel_buildings (${PB_COLUMNS.join(', ')}) SELECT ${PB_COLUMNS.map((c) => `b.${c}`).join(', ')} FROM ${pb} b`
        + ' WHERE NOT EXISTS (SELECT 1 FROM parcel_buildings l WHERE l.parcel_id = b.parcel_id AND l.building_id = b.building_id)',
    },
    { label: 'parcels.massing_enriched_at -> backup value', text: `UPDATE parcels p SET massing_enriched_at = b.massing_enriched_at FROM ${pm} b WHERE b.id = p.id AND p.massing_enriched_at IS DISTINCT FROM b.massing_enriched_at` },
  ];
}

/**
 * Fold F-11: a killed node client does NOT cancel its running Postgres query (tasks/lessons.md).
 * Any non-idle client backend still touching link_massing's tables after the child exited.
 */
const LINGERING_SQL = "SELECT pid, state, left(query, 120) AS query FROM pg_stat_activity\n"
  + " WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'\n"
  + "   AND state <> 'idle'\n"
  + "   AND query !~* 'pg_stat_activity|pg_try_advisory_xact_lock|link_massing_cohort_bak_'\n"
  + "   AND query ~* '(parcel_buildings|massing_enriched_at|building_footprints)'";

// ── DB plumbing ──────────────────────────────────────────────────────────────
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`link-massing-healing-cohort: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  const pool = createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
  assertLocalTarget(pool.buildoTarget && pool.buildoTarget.description);
  return pool;
}

async function inReadOnly(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const out = await fn(client);
    await client.query('ROLLBACK');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw e;
  } finally {
    client.release();
  }
}

async function inTxn(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw e;
  } finally {
    client.release();
  }
}

async function tableExists(q, name) {
  const r = await q.query(TABLE_EXISTS_SQL, [`public.${name}`]);
  return r.rows[0].exists === true;
}

async function liveIdentity(q) {
  const r = await q.query(IDENTITY_SQL);
  return { database: r.rows[0].database, system_identifier: String(r.rows[0].system_identifier) };
}

async function hashOf(q, table, orderCols, columns) {
  const t0 = Date.now();
  const r = await q.query(hashSql(table, orderCols, columns));
  return { rows: Number(r.rows[0].n), hash: r.rows[0].h, ms: Date.now() - t0 };
}

/** The two STRICT whole-table hashes (every column) the restore is judged against. */
async function strictHashes(q) {
  return {
    parcel_buildings: await hashOf(q, 'parcel_buildings', PB_ORDER, null),
    parcels: await hashOf(q, 'parcels', PARCELS_ORDER, null),
  };
}

function sameHash(a, b) {
  return Boolean(a && b && a.rows === b.rows && a.hash === b.hash);
}

function loadDescriptor() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, DESCRIPTOR_REL), 'utf8'));
}

function readRecipe() {
  const p = path.join(REPO_ROOT, RECIPE_REL);
  if (!fs.existsSync(p)) throw new Error(`${RECIPE_REL} does not exist — run --derive first`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeRecipe(recipe) {
  const p = path.join(REPO_ROOT, RECIPE_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(recipe, null, 2)}\n`);
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** The centroid confidence the U pool and the phantom rows use, via the descriptor's own config resolution. */
async function resolveConfidence(pool, descriptor) {
  const { values } = await resolveConfig(pool, descriptor);
  const conf = values.link_massing_centroid_confidence;
  if (typeof conf !== 'number' || !Number.isFinite(conf)) {
    throw new Error(`link_massing_centroid_confidence resolved to ${JSON.stringify(conf)} — refusing`);
  }
  return { values, conf };
}

/** Stored links, the compute's derived links and the enriched P ids for a parcel set (read only). */
async function readSelectionState(client, descriptor, config, parcelIds) {
  const match = compute.buildMatchSql(descriptor, config, 'full');
  const primary = await client.query(match.primary_match_sql, [parcelIds]);
  const derived = compute.classifyMatches(primary.rows, config).rows;
  const stored = (await client.query(STORED_LINKS_SQL, [parcelIds])).rows;
  const enrichedNotNull = (await client.query(ENRICHED_SQL, [parcelIds])).rows.map((r) => Number(r.id));
  return { derived, stored, enrichedNotNull };
}

function touchedIds(uKeys, xPairs) {
  return [...new Set([...uKeys, ...xPairs].map((k) => Number(k.parcel_id)))].sort((a, b) => a - b);
}

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive() {
  const existing = path.join(REPO_ROOT, RECIPE_REL);
  if (fs.existsSync(existing)) {
    const prior = JSON.parse(fs.readFileSync(existing, 'utf8'));
    if (prior.backup && !prior.backup.dropped_at) {
      throw new Error(`${RECIPE_REL} has a live backup (${prior.backup.base}) taken against its frozen lists — --restore it before re-deriving`);
    }
  }
  const descriptor = loadDescriptor();
  const pool = makePool('link-massing-healing-cohort:derive');
  try {
    console.log(`[lm-cohort:derive] db target: ${pool.buildoTarget.description}`);
    const { values, conf } = await resolveConfidence(pool, descriptor);
    const recipe = await inReadOnly(pool, async (client) => {
      const uRows = (await client.query(uSelectSql(), [conf, N_U])).rows;
      if (uRows.length < N_U) throw new Error(`only ${uRows.length} U candidate link(s) @ ${conf}, need ${N_U}`);
      const cands = (await client.query(xCandidatesSql(), [N_X + CANDIDATE_LOOKAHEAD])).rows;
      if (cands.length < N_X + 1) throw new Error(`only ${cands.length} X candidate parcel(s), need > ${N_X}`);
      const uKeys = uRows.map((r) => ({ parcel_id: Number(r.parcel_id), building_id: Number(r.building_id), confidence: r.confidence, linked_at: r.linked_at }));
      const pIds = cands.slice(0, N_X).map((c) => Number(c.parcel_id));
      const state = await readSelectionState(client, descriptor, values, touchedIds(uKeys, pIds.map((p) => ({ parcel_id: p }))));
      const xPairs = selectPhantoms({
        candidates: cands,
        derivedPairs: new Set(state.derived.map((r) => pairKey(r.parcel_id, r.building_id))),
        storedPairs: new Set(state.stored.map((r) => pairKey(r.parcel_id, r.building_id))),
        n: N_X,
      });
      const proofs = selectionProofs({ state, uKeys, xPairs, confidence: conf });
      if (!proofs.ok) throw new Error(`selection proofs FAILED: ${proofs.reasons.join('; ')}`);
      return {
        contract_version: 1,
        step: 'link_massing',
        plan: '.cursor/wf2_link_massing_nonzero_close_active_task.md D3',
        derived_at: new Date().toISOString(),
        git_head: gitHead(),
        config: { link_massing_centroid_confidence: conf },
        n_u: N_U,
        n_x: N_X,
        u_decrement: U_DECREMENT,
        candidate_lookahead: CANDIDATE_LOOKAHEAD,
        phantom: PHANTOM,
        lock_id: COHORT_LOCK_ID,
        u_keys: uKeys,
        x_pairs: xPairs,
        proofs: proofs.counts,
        backup: null,
        last_run: null,
      };
    });
    writeRecipe(recipe);
    console.log(`[lm-cohort:derive] recipe written: ${RECIPE_REL} — U ${recipe.u_keys.length} key(s), X ${recipe.x_pairs.length} phantom(s); proofs ${JSON.stringify(recipe.proofs)}`);
  } finally {
    await pool.end();
  }
}

// ── --backup ─────────────────────────────────────────────────────────────────
async function backup(o) {
  const names = backupNames(o.backupBase);
  const recipe = readRecipe();
  if (recipe.backup && !recipe.backup.dropped_at) {
    throw new Error(`the recipe already records a live backup (${recipe.backup.base}) — --restore it first`);
  }
  const pool = makePool('link-massing-healing-cohort:backup');
  try {
    console.log(`[lm-cohort:backup] db target: ${pool.buildoTarget.description}`);
    const identity = await liveIdentity(pool);
    const cols = (await pool.query(PB_COLUMNS_SQL)).rows.map((r) => r.column_name);
    if (JSON.stringify(cols) !== JSON.stringify(PB_COLUMNS)) {
      throw new Error(`parcel_buildings columns ${JSON.stringify(cols)} != the bracket's ${JSON.stringify(PB_COLUMNS)} — refusing`);
    }
    for (const t of [names.pb, names.pm]) {
      if (await tableExists(pool, t)) throw new Error(`${t} already exists — refusing to overwrite a before-image`);
    }
    const t0 = Date.now();
    await inTxn(pool, async (client) => {
      for (const sql of backupCreateSqls(names)) await client.query(sql);
    });
    console.log(`[lm-cohort:backup] created ${names.pb} + ${names.pm} in ${Date.now() - t0} ms`);
    const baseline = await strictHashes(pool);
    const pbBackup = await hashOf(pool, names.pb, PB_ORDER, null);
    const pmLive = await hashOf(pool, 'parcels', PARCELS_ORDER, PM_COLUMNS);
    const pmBackup = await hashOf(pool, names.pm, PARCELS_ORDER, PM_COLUMNS);
    const ok = sameHash(baseline.parcel_buildings, pbBackup) && sameHash(pmLive, pmBackup);
    console.log(`[lm-cohort:backup] verify: parcel_buildings live ${baseline.parcel_buildings.rows}/${baseline.parcel_buildings.hash} (${baseline.parcel_buildings.ms} ms) vs backup ${pbBackup.rows}/${pbBackup.hash}; `
      + `parcels(id,massing_enriched_at) live ${pmLive.rows}/${pmLive.hash} vs backup ${pmBackup.rows}/${pmBackup.hash}; parcels strict ${baseline.parcels.rows}/${baseline.parcels.hash} (${baseline.parcels.ms} ms)`);
    if (!ok) {
      for (const t of [names.pb, names.pm]) await pool.query(`DROP TABLE IF EXISTS "${t}"`);
      throw new Error('the backups do not match live — dropped them; nothing was perturbed');
    }
    recipe.backup = {
      base: o.backupBase,
      pb: names.pb,
      pm: names.pm,
      created_at: new Date().toISOString(),
      database: identity.database,
      system_identifier: identity.system_identifier,
      baseline: {
        parcel_buildings: { rows: baseline.parcel_buildings.rows, hash: baseline.parcel_buildings.hash, columns: 'all' },
        parcels: { rows: baseline.parcels.rows, hash: baseline.parcels.hash, columns: 'all' },
        parcels_pm: { rows: pmLive.rows, hash: pmLive.hash, columns: PM_COLUMNS },
      },
      dropped_at: null,
    };
    writeRecipe(recipe);
    console.log(`[lm-cohort:backup] VERIFIED; baseline recorded in ${RECIPE_REL}`);
  } finally {
    await pool.end();
  }
}

// ── restore + diff (shared by --run and --restore) ───────────────────────────
async function preRestoreDiff(pool, names) {
  const s = preRestoreDiffSqls(names);
  return inReadOnly(pool, async (client) => ({
    pb: {
      extra: (await client.query(s.pbExtra)).rows.map(keyOf),
      missing: (await client.query(s.pbMissing)).rows.map(keyOf),
      changed: (await client.query(s.pbChanged)).rows.map((r) => ({ ...keyOf(r), guard_equal: r.guard_equal, linked_at_moved: r.linked_at_moved })),
    },
    pm: {
      extra: (await client.query(s.pmExtra)).rows[0].n,
      missing: (await client.query(s.pmMissing)).rows[0].n,
      changed: (await client.query(s.pmChanged)).rows.map((r) => ({ id: Number(r.id), before: r.before, after: r.after })),
    },
  }));
}

async function fullRestore(pool, names) {
  return inTxn(pool, async (client) => {
    const counts = {};
    for (const st of restoreSqls(names)) {
      const r = await client.query(st.text);
      counts[st.label] = r.rowCount;
    }
    return counts;
  });
}

async function verifyRestored(pool, baseline) {
  const now = await strictHashes(pool);
  const ok = sameHash(now.parcel_buildings, baseline.parcel_buildings) && sameHash(now.parcels, baseline.parcels);
  return { ok, now };
}

async function dropBackups(pool, names) {
  for (const t of [names.pb, names.pm]) await pool.query(`DROP TABLE IF EXISTS "${t}"`);
}

async function cancelLingering(pool) {
  let cancelled = 0;
  for (let i = 0; i < CANCEL_POLLS; i++) {
    const rows = (await pool.query(LINGERING_SQL)).rows;
    if (rows.length === 0) return cancelled;
    for (const r of rows) {
      console.error(`[lm-cohort] cancelling lingering backend ${r.pid} (${r.state}): ${r.query}`);
      await pool.query('SELECT pg_cancel_backend($1)', [r.pid]);
      cancelled += 1;
    }
    await new Promise((resolve) => { setTimeout(resolve, CANCEL_POLL_MS); });
  }
  throw new Error(`backends still touching link_massing tables after ${CANCEL_POLLS} cancel polls — restore NOT attempted`);
}

// ── signals + the harness child ──────────────────────────────────────────────
function installSignalHandlers(state) {
  const on = (signal) => {
    state.interrupted = true;
    console.error(`[lm-cohort] signal ${signal} — forwarding to the harness child, then restoring`);
    if (state.child && state.child.exitCode === null) state.child.kill(signal);
  };
  process.on('SIGINT', on);
  process.on('SIGTERM', on);
}

function removeSignalHandlers() {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
}

function harnessArgv(o) {
  return ['-r', 'dotenv/config', HARNESS, `--step=${STEP_SCRIPT}`, `--chain=${o.chain}`, '--args=--full', `--out=${o.out}`, '--overwrite'];
}

function runChild(argv, state) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: REPO_ROOT, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    state.child = child;
    child.on('error', (err) => resolve({ code: null, signal: null, error: err.message }));
    child.on('exit', (code, signal) => resolve({ code, signal, error: null }));
  });
}

function readGolden(abs) {
  return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
}

function putGoldenBack(abs, before) {
  if (before === null) {
    if (fs.existsSync(abs)) fs.rmSync(abs);
    return;
  }
  fs.writeFileSync(abs, before);
}

// ── --run ────────────────────────────────────────────────────────────────────
async function run(o) {
  const names = backupNames(o.backupBase);
  const recipe = readRecipe();
  const descriptor = loadDescriptor();
  if (!recipe.backup || recipe.backup.dropped_at || recipe.backup.base !== o.backupBase) {
    throw new Error(`the recipe records no live backup named ${o.backupBase} — take --backup first`);
  }
  const argv = harnessArgv(o);
  const outAbs = path.join(REPO_ROOT, o.out);
  const pool = makePool('link-massing-healing-cohort:run');
  const state = { interrupted: false, child: null };
  const result = { started_at: new Date().toISOString(), git_head: gitHead(), capture: o.out, chain: o.chain };
  let perturbed = false;
  let asserted = false;
  let restored = false;
  let restoreFailed = false;
  installSignalHandlers(state);
  try {
    console.log(`[lm-cohort:run] db target: ${pool.buildoTarget.description}`);
    const res = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      const id = identityCheck(recipe.backup, await liveIdentity(pool));
      if (!id.ok) throw new Error(`cluster identity: ${id.reason}`);
      for (const t of [names.pb, names.pm]) {
        if (!(await tableExists(pool, t))) throw new Error(`${t} does not exist — refusing to perturb without a before-image`);
      }
      const live = await strictHashes(pool);
      if (!sameHash(live.parcel_buildings, recipe.backup.baseline.parcel_buildings) || !sameHash(live.parcels, recipe.backup.baseline.parcels)) {
        throw new Error('live tables no longer equal the --backup baseline — refusing to perturb (take a fresh backup)');
      }
      const { values, conf } = await resolveConfidence(pool, descriptor);
      if (conf !== recipe.config.link_massing_centroid_confidence) {
        throw new Error(`link_massing_centroid_confidence is ${conf}, the recipe froze ${recipe.config.link_massing_centroid_confidence}`);
      }
      const proofs = await inReadOnly(pool, async (client) => selectionProofs({
        state: await readSelectionState(client, descriptor, values, touchedIds(recipe.u_keys, recipe.x_pairs)),
        uKeys: recipe.u_keys,
        xPairs: recipe.x_pairs,
        confidence: conf,
      }));
      if (!proofs.ok) throw new Error(`selection proofs FAILED at --run: ${proofs.reasons.join('; ')}`);
      const goldenBefore = readGolden(outAbs);
      let claimsOk = false;
      try {
        abortIfInterrupted(state);
        const p = perturbSqls();
        const uP = recipe.u_keys.map((k) => k.parcel_id);
        const uB = recipe.u_keys.map((k) => k.building_id);
        const xP = recipe.x_pairs.map((k) => k.parcel_id);
        const xB = recipe.x_pairs.map((k) => k.building_id);
        await inTxn(pool, async (client) => {
          const u = await client.query(p.u, [uP, uB, recipe.u_decrement, conf]);
          if (u.rowCount !== uP.length) throw new Error(`arm U wrote ${u.rowCount} row(s), expected ${uP.length}`);
          const x = await client.query(p.x, [xP, xB, PHANTOM.is_primary, PHANTOM.structure_type, PHANTOM.linked_at, PHANTOM.match_type, conf]);
          if (x.rowCount !== xP.length) throw new Error(`arm X inserted ${x.rowCount} row(s), expected ${xP.length}`);
          console.log(`[lm-cohort:run] perturbation about to COMMIT (U ${u.rowCount}, X ${x.rowCount}) — recover by hand with: `
            + `node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --restore --backup-table=${o.backupBase}`);
          perturbed = true;
        });
        abortIfInterrupted(state);
        console.log(`[lm-cohort:run] running the real step: node ${argv.join(' ')}`);
        const exit = await runChild(argv, state);
        result.harness_exit = exit;
        if (exit.code !== 0 || state.interrupted) {
          result.cancelled_backends = await cancelLingering(pool);
          throw new Error(`the harness exited ${JSON.stringify(exit)}${state.interrupted ? ' after a signal' : ''}`);
        }
        const doc = JSON.parse(fs.readFileSync(outAbs, 'utf8'));
        const shape = captureShapeClaim(doc, descriptor);
        const counts = countsClaim(doc.summary, recipe);
        const rerun = rerunClaim(doc);
        result.claims = { shape, counts, rerun };
        console.log(`[lm-cohort:run] claims: shape ${shape.ok ? 'PASS' : `FAIL ${shape.reasons.join('; ')}`}; counts ${counts.ok ? 'PASS' : `FAIL ${counts.reasons.join('; ')}`} ${JSON.stringify(counts.got)}; rerun ${rerun.ok ? 'PASS' : `FAIL ${rerun.reasons.join('; ')}`}`);
        claimsOk = shape.ok && counts.ok && rerun.ok;
      } catch (err) {
        result.error = err.message;
        console.error(`[lm-cohort:run] ERROR: ${err.message}`);
      } finally {
        if (perturbed) {
          try {
            const diff = await preRestoreDiff(pool, names);
            const judged = judgePreRestore({ diff, recipe });
            result.pre_restore_diff = {
              parcel_buildings: { extra: diff.pb.extra.length, missing: diff.pb.missing.length, changed: diff.pb.changed.length, guard_changed: diff.pb.changed.filter((c) => c.guard_equal !== true).length },
              parcels: { extra: diff.pm.extra, missing: diff.pm.missing, changed: diff.pm.changed.length },
              judged,
              unexpected: judged.ok ? null : diff,
            };
            console.log(`[lm-cohort:run] pre-restore diff (negative control): ${judged.ok ? 'PASS' : `FAIL ${judged.reasons.join('; ')}`} ${JSON.stringify(result.pre_restore_diff.parcel_buildings)} ${JSON.stringify(result.pre_restore_diff.parcels)}`);
            asserted = claimsOk && judged.ok;
          } catch (err) {
            result.diff_error = err.message;
            console.error(`[lm-cohort:run] pre-restore diff FAILED: ${err.message}`);
          }
          try {
            result.restore_counts = await fullRestore(pool, names);
            const v = await verifyRestored(pool, recipe.backup.baseline);
            restored = v.ok;
            result.post_restore = { parcel_buildings: v.now.parcel_buildings, parcels: v.now.parcels };
            console.log(`[lm-cohort:run] restore ${JSON.stringify(result.restore_counts)}; strict hashes ${restored ? 'EQUAL to baseline' : 'DIFFER from baseline'}`);
            if (!restored) restoreFailed = true;
          } catch (err) {
            restoreFailed = true;
            result.restore_error = err.message;
            console.error(`[lm-cohort:run] RESTORE FAILED: ${err.message} — recover with --restore --backup-table=${o.backupBase}`);
          }
        } else {
          restored = true;
          console.log('[lm-cohort:run] this run never perturbed; the tables are left as found');
        }
        if (!asserted || !restored) {
          putGoldenBack(outAbs, goldenBefore);
          console.log(`[lm-cohort:run] the capture ${o.out} was put back to its pre-run state (the claim did not hold)`);
        }
      }
      return null;
    }, { skipEmit: false });
    if (!res.acquired) throw new Error(`another cohort bracket holds advisory lock ${COHORT_LOCK_ID}`);
  } catch (err) {
    result.error = result.error || err.message;
    console.error(`[lm-cohort:run] ERROR: ${err.message}`);
  } finally {
    result.asserted = asserted;
    result.restored = restored;
    result.finished_at = new Date().toISOString();
    try {
      if (perturbed && asserted && restored) {
        await dropBackups(pool, names);
        recipe.backup.dropped_at = result.finished_at;
        console.log(`[lm-cohort:run] verified restore — dropped ${names.pb} + ${names.pm}`);
      } else if (perturbed) {
        console.log(`[lm-cohort:run] backups KEPT for investigation / --restore: ${names.pb}, ${names.pm}`);
      }
      recipe.last_run = result;
      writeRecipe(recipe);
    } catch (err) {
      console.error(`[lm-cohort:run] could not finalise the recipe: ${err.message}`);
    }
    console.log(`[lm-cohort:run] asserted: ${asserted} restored: ${restored}`);
    process.exitCode = exitCodeFor({ asserted, restored, restoreFailed });
    removeSignalHandlers();
    await pool.end();
  }
}

// ── --restore ────────────────────────────────────────────────────────────────
async function restore(o) {
  const names = backupNames(o.backupBase);
  const recipe = readRecipe();
  if (!recipe.backup || recipe.backup.base !== o.backupBase) throw new Error(`the recipe records no backup named ${o.backupBase}`);
  const pool = makePool('link-massing-healing-cohort:restore');
  let restored = false;
  try {
    console.log(`[lm-cohort:restore] db target: ${pool.buildoTarget.description}`);
    const res = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      const id = identityCheck(recipe.backup, await liveIdentity(pool));
      if (!id.ok) throw new Error(`cluster identity: ${id.reason}`);
      for (const t of [names.pb, names.pm]) {
        if (!(await tableExists(pool, t))) throw new Error(`${t} does not exist — nothing to restore from`);
      }
      await cancelLingering(pool);
      const counts = await fullRestore(pool, names);
      const v = await verifyRestored(pool, recipe.backup.baseline);
      restored = v.ok;
      console.log(`[lm-cohort:restore] ${JSON.stringify(counts)}; strict hashes ${restored ? 'EQUAL to baseline' : 'DIFFER from baseline'}`);
      if (restored) {
        await dropBackups(pool, names);
        recipe.backup.dropped_at = new Date().toISOString();
        writeRecipe(recipe);
        console.log(`[lm-cohort:restore] dropped ${names.pb} + ${names.pm}`);
      }
      return null;
    }, { skipEmit: false });
    if (!res.acquired) throw new Error(`another cohort bracket holds advisory lock ${COHORT_LOCK_ID}`);
  } finally {
    process.exitCode = restored ? 0 : 2;
    await pool.end();
  }
}

// ── --self-test (no DB) ──────────────────────────────────────────────────────
function selfTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(`self-test FAILED: ${msg}`); };
  const throws = (fn, msg) => {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, msg);
  };
  // argv + safety
  assert(parseArgs(['--self-test']).mode === 'self-test', 'self-test mode');
  throws(() => parseArgs(['--derive', '--run']), 'two modes refused');
  throws(() => parseArgs([]), 'no mode refused');
  throws(() => parseArgs(['--run']), '--run without --backup-table refused');
  throws(() => parseArgs(['--run', '--backup-table=x', '--out=docs/reports/golden/link_massing/post/a.json']), 'bad backup name refused');
  throws(() => parseArgs(['--derive', '--out=../x.json']), 'out outside the post dir refused');
  assert(backupNames('link_massing_cohort_bak_20261006t2200z').pm === 'link_massing_cohort_bak_20261006t2200z_pm', 'backup names');
  throws(() => backupNames('link_massing_cohort_bak_20261006t2200z_pb'), 'suffixed base refused');
  throws(() => assertLocalTarget('postgres://u:***@db.example.com:5432/postgres'), 'non-loopback refused');
  assert(assertLocalTarget('127.0.0.1:54322/postgres') === '127.0.0.1:54322/postgres', 'discrete loopback accepted');
  assert(identityCheck({ database: 'd', system_identifier: '1' }, { database: 'd', system_identifier: '2' }).ok === false, 'identity pin');
  assert(COHORT_LOCK_ID === 902004 && COHORT_LOCK_ID !== 91, 'lock id');
  // selection
  const cands = [1, 2, 3].map((p) => ({ parcel_id: p, primary_building_id: p * 100 }));
  const got = selectPhantoms({ candidates: cands, derivedPairs: new Set([pairKey(1, 200)]), storedPairs: new Set(), n: 1 });
  assert(got.length === 1 && got[0].building_id === 300, 'phantom walk skips a derived pair');
  throws(() => selectPhantoms({ candidates: cands.slice(0, 1), derivedPairs: new Set(), storedPairs: new Set(), n: 1 }), 'no wrap-around');
  const link = { parcel_id: 1, building_id: 10, is_primary: false, structure_type: 'other', match_type: 'centroid_in_parcel', confidence: '0.95' };
  assert(driftCheck({ stored: [link], derived: [{ ...link, confidence: 0.95 }] }).ok, 'numeric confidence compare');
  assert(!driftCheck({ stored: [link], derived: [] }).ok, 'drift extra');
  const sp = selectionProofs({
    state: { derived: [{ ...link }, { ...link, building_id: 11 }], stored: [link, { ...link, building_id: 11 }], enrichedNotNull: [1] },
    uKeys: [{ parcel_id: 1, building_id: 10 }],
    xPairs: [{ parcel_id: 1, building_id: 11 }],
    confidence: 0.95,
  });
  assert(!sp.ok && sp.reasons.some((r) => r.startsWith('(b)')) && sp.reasons.some((r) => r.startsWith('(c)')), 'selection proofs (b)/(c)');
  // claims
  const recipe = { u_keys: [{ parcel_id: 1, building_id: 10 }], x_pairs: [{ parcel_id: 5, building_id: 77 }] };
  const meta = { links_updated: 1, links_inserted: 0, primary_cleared: 0, links_deleted: 1, parcels_flagged_lost_link: 1 };
  assert(countsClaim({ records_new: 0, records_updated: 1, records_meta: meta }, recipe).ok, 'exact counts pass');
  assert(!countsClaim({ records_new: 0, records_updated: 1, records_meta: { ...meta, links_deleted: 2 } }, recipe).ok, 'off-by-one is a STOP');
  assert(!countsClaim({ records_new: 0, records_updated: 1, records_meta: { ...meta, parcels_flagged_lost_link: null } }, recipe).ok, 'null is a STOP');
  assert(rerunClaim({ rerun_proof: { rows: [{ table: 'parcel_buildings', answer: 'drift_declared' }, { table: 'parcels', answer: 'zero' }], run2: { exit_code: 0 } } }).ok, 'rerun claim');
  assert(!captureShapeClaim({ exit_code: 0, invariants_file: 'x', invariants: [] }, { invariants: [], plausibility: [] }).ok, 'invariants file refused');
  // negative control
  const diff = () => ({
    pb: { extra: [], missing: [], changed: [{ parcel_id: 1, building_id: 10, guard_equal: true, linked_at_moved: true }] },
    pm: { extra: 0, missing: 0, changed: [{ id: 5, before: '2026-09-01', after: null }] },
  });
  assert(judgePreRestore({ diff: diff(), recipe }).ok, 'expected diff passes');
  const d1 = diff(); d1.pb.changed.push({ parcel_id: 9, building_id: 90, guard_equal: true, linked_at_moved: true });
  assert(!judgePreRestore({ diff: d1, recipe }).ok, 'stray changed row fails');
  const d2 = diff(); d2.pb.changed[0].guard_equal = false;
  assert(!judgePreRestore({ diff: d2, recipe }).ok, 'unhealed guard fails');
  const d3 = diff(); d3.pm.changed.push({ id: 6, before: '2026-09-01', after: null });
  assert(!judgePreRestore({ diff: d3, recipe }).ok, 'stray parcel fails');
  // restore plan reproduces the backup
  const row = (id, p, b, over) => ({ id, parcel_id: p, building_id: b, is_primary: false, structure_type: 'other', match_type: 'centroid_in_parcel', confidence: '0.95', linked_at: 't0', ...over });
  const backupRows = [row(1, 1, 10), row(2, 1, 11), row(3, 2, 20)];
  const liveRows = [row(1, 1, 10), row(2, 1, 11, { confidence: '0.94', linked_at: 't1' }), row(99, 5, 77)];
  const back = applyRestorePlan(liveRows, restorePlan(liveRows, backupRows)).map(rowText).sort();
  assert(JSON.stringify(back) === JSON.stringify(backupRows.map(rowText).sort()), 'restore plan reproduces the backup');
  // SQL shapes
  const r = restoreSqls(backupNames('link_massing_cohort_bak_20261006t2200z'));
  assert(r.length === 4 && r[0].text.startsWith('DELETE FROM parcel_buildings') && r[3].text.startsWith('UPDATE parcels'), 'restore order');
  assert(hashSql('parcel_buildings', PB_ORDER, null).includes('md5(t::text)'), 'strict hash covers every column');
  assert(exitCodeFor({ asserted: true, restored: false, restoreFailed: true }) === 2, 'exit 2 on a failed restore');
  throws(() => abortIfInterrupted({ interrupted: true }), 'interrupt fence');
}

const HELP = `link-massing-healing-cohort — the healing cohort bracket for link_massing gate G #38 (Spec 124 R-AS / R-BA)

Usage (LOCAL dev DB only):
  node scripts/analysis/link-massing-healing-cohort.js --self-test
  node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --derive
  node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --backup --backup-table=link_massing_cohort_bak_<yyyymmddthhmmz>
  node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --run --backup-table=<same> [--chain=sources] [--out=${CAPTURE_REL}]
  node -r dotenv/config scripts/analysis/link-massing-healing-cohort.js --restore --backup-table=<same>

  --derive   READ ONLY: select + prove the frozen U keys and X phantoms; write ${RECIPE_REL}.
  --backup   Full-table backups <base>_pb / <base>_pm, verified; strict baseline hashes recorded.
  --run      Perturb (one txn), run ${STEP_SCRIPT} through ${HARNESS} (POST, --full), assert the
             exact per-target counts + run 2 zero + the pre-restore diff, then restore and verify the
             strict whole-table hashes. Exit 1 = a claim failed (restored); exit 2 = restore failed.
  --restore  Full-diff restore from the backups + strict-hash verification; drops them when verified.
`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.mode === 'help') { process.stdout.write(HELP); return; }
  if (o.mode === 'self-test') { selfTest(); console.log('self-test PASSED'); return; }
  if (o.mode === 'derive') return derive();
  if (o.mode === 'backup') return backup(o);
  if (o.mode === 'run') return run(o);
  if (o.mode === 'restore') return restore(o);
  throw new Error(`unknown mode ${JSON.stringify(o.mode)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[lm-cohort] ERROR:', err.message);
    process.exitCode = process.exitCode || 1;
  });
}

module.exports = {
  COHORT_LOCK_ID,
  N_U,
  N_X,
  U_DECREMENT,
  CANDIDATE_LOOKAHEAD,
  PHANTOM,
  PB_COLUMNS,
  RECIPE_REL,
  CAPTURE_REL,
  BACKUP_BASE_RE,
  LOCAL_HOST_RE,
  parseArgs,
  backupNames,
  assertLocalTarget,
  identityCheck,
  abortIfInterrupted,
  exitCodeFor,
  pairKey,
  selectPhantoms,
  driftCheck,
  selectionProofs,
  countsClaim,
  rerunClaim,
  captureShapeClaim,
  judgePreRestore,
  restorePlan,
  applyRestorePlan,
  hashSql,
  backupCreateSqls,
  perturbSqls,
  preRestoreDiffSqls,
  restoreSqls,
  harnessArgv,
  uSelectSql,
  xCandidatesSql,
  LINGERING_SQL,
  selfTest,
};
