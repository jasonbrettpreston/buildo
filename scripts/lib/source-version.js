'use strict';
/**
 * source-version.js — the single source of truth for source-version gating
 * (Phase B B1; docs/reports/2026-08-04-sources-incremental-architecture.md §6 item 11).
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10/§R11
 *
 * What lives here (and why):
 *
 * 1. readPriorRunMeta(pool, pipelineName) — the PRODUCER SELF-HISTORY reader:
 *    the latest COMPLETED run's records_meta for a pipeline slug,
 *    `ORDER BY started_at DESC` — STANDARDIZED. All four loader gate sites
 *    (load-ravines / load-heritage / load-centreline / load-zoning) order by
 *    started_at, never completed_at, so a long-running older run that finishes
 *    late can never shadow the newest baseline.
 *
 *    EXCLUDED from this standardization (deliberate, per the Phase B v4 State
 *    Verification ruling) — the two CONSUMER-side completed_at readers:
 *      - scripts/lib/massing-full-gate.js  (evaluateMassingFullGate)
 *      - scripts/enrich-permits.js         (assertCentrelineEnriched)
 *    Those read CHAIN-CONSUMER semantics ("has a completed producer run landed,
 *    and when did it FINISH relative to another producer"), not producer
 *    self-history; they keep `ORDER BY completed_at DESC` / max(completed_at).
 *
 * 2. skipCheckDecision(input, options) — the four previously copy-pasted
 *    divergent variants unified. Divergence is now VISIBLE OPTIONS at each call
 *    site, not copy-paste drift:
 *      - ravines-style / heritage-style: validator equality (Last-Modified →
 *        ETag → content-hash tiers); contentHash NOT considered in the
 *        no-validators bail.
 *      - centreline-style: same, but contentHash IS a validator in the
 *        no-validators bail (options.contentHashInNoValidatorsBail = true).
 *      - zoning-style: CKAN-metadata equality (Date.parse) + a max-age
 *        force-reload window (options.forceReloadMaxAgeDays, e.g. 730).
 *    Decisions are byte-identical to the pre-B1 copies ({ skip, reason }).
 *
 * 3. The THREE distinguishable outcomes + classifyOutcome(): 'skip_unchanged' |
 *    'load_changed' | 'load_fail_safe'. FAIL-SAFE RULE: a check error (CKAN
 *    unreachable), no prior meta, or malformed meta ALL classify as a
 *    fail-safe LOAD — never a skip. Only a positive change signal ('changed')
 *    is 'load_changed'; every other non-skip (no_prior_run / no_prior_version /
 *    no_validators / cache_stale_force_reload / garbage) is 'load_fail_safe'.
 *
 * 3b. contentHashDecision(...) — the TIER-2 gate (D3). Tier-1 (above) compares
 *    metadata before the download; tier-2 compares the bytes after it. See its
 *    own docblock for why it fixes contentHashInNoValidatorsBail=true.
 *
 * 4. streamFileHash(path, algorithm) — STREAMED hash (crypto.createHash fed by
 *    fs.createReadStream). A ~327MB parcels CSV must hash without ever being
 *    buffered in memory; whole-file buffered reads are banned from this module
 *    (source-locked by src/tests/source-version.logic.test.ts). Callers pass
 *    'md5' where they must stay comparable to an existing content_hash baseline
 *    (all three shapefile loaders) — the algorithm is theirs to pin, not ours.
 *
 * 5. buildSkipReEmitMeta({ skeleton, priorMeta, pins }) — the skip-path
 *    re-emit-prior-meta merge. DS4 condition: a version-skip run STILL emits a
 *    COMPLETED pipeline_runs summary row re-stamping the prior version meta,
 *    because downstream HALT gates (e.g. enrich-permits' centreline recency
 *    gate) read completed rows. Merge order skeleton ← prior ← pins, with pins
 *    applied LAST so spec_version is pinned to CURRENT after the prior spread
 *    (the load-ravines BUG-2 rule — a future version bump must never re-emit a
 *    stale spec_version on a skip).
 *
 * 6. runLedgerGateDecision(pool, { ownSlugs, upstreamSlugs, now }) — Phase B B3.
 *    A CONSUMER-side gate (own script deciding whether to run at all, not a
 *    version-string comparison) for scripts with no dataset-version signal of
 *    their own: "has anything happened upstream since MY OWN last completed
 *    run that I haven't accounted for?" This is the THIRD completed_at-DESC
 *    reader in the codebase (joining massing-full-gate.js and enrich-permits.js
 *    assertCentrelineEnriched, named in item 1 above) — it lives inside this
 *    file (not a fourth loader-style call site) because B3's three callers
 *    (link-wsib, link-parcel-addresses, compute-parcel-cost-estimates) share
 *    the identical any-status-since-own-last-completed-run shape.
 *
 *    Own-last anchor: the most recently COMPLETED run across ownSlugs (a
 *    slug SET, always caller-supplied — massing-full-gate.js IN-list
 *    precedent — never hardcoded here; callers own their own chain-scoped /
 *    unscoped slug variants). No completed own run ever → fail-safe RUN
 *    (reason 'no_prior_completed_run' — a scoped run has never landed, so
 *    there is nothing to compare against).
 *
 *    Upstream window: every pipeline_runs row across upstreamSlugs whose
 *    COALESCE(completed_at, 'infinity') > own's last-completed run's
 *    started_at — i.e. everything that finished (or is still running/failed/
 *    deferred, hence never finished) AFTER own last started. ANY non-'completed'
 *    status in that window (running / failed / cancelled / skipped /
 *    deferred_to_full — deliberately inclusive, a fail-safe: an upstream run
 *    whose outcome we cannot positively confirm as "completed, no changes"
 *    must never be read as "safe to skip") forces RUN. `deferred_to_full` is
 *    excluded from ever counting as a completed-with-changes row purely by
 *    virtue of not being 'completed' — it still forces RUN via the
 *    non-completed count, which is correct: a deferred upstream backlog is
 *    exactly the kind of unresolved state this gate exists to never hide.
 *
 *    SKIP fires iff: own has completed at least once, AND zero non-completed
 *    upstream rows in the window, AND zero completed-with-changes upstream
 *    rows in the window (records_new + records_updated both 0 on every
 *    completed row since own_started). Otherwise RUN.
 *
 *    Callers MUST still emit a COMPLETED pipeline_runs summary on the skip
 *    path (DS4 — the same rule as buildSkipReEmitMeta above) so the NEXT
 *    evaluation's own-last anchor advances forward instead of re-comparing
 *    against a stale started_at forever.
 */

const crypto = require('crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Outcomes (three-way, distinguishable)
// ---------------------------------------------------------------------------
const OUTCOME_SKIP_UNCHANGED = 'skip_unchanged';
const OUTCOME_LOAD_CHANGED = 'load_changed';
const OUTCOME_LOAD_FAIL_SAFE = 'load_fail_safe';

// Styles (the visible divergence axis of skipCheckDecision)
const STYLE_VALIDATOR_EQUALITY = 'validator-equality';
const STYLE_CKAN_METADATA = 'ckan-metadata';

// ---------------------------------------------------------------------------
// 1. Prior-run reader (producer self-history; started_at DESC — see header)
// ---------------------------------------------------------------------------
/**
 * Latest completed run's records_meta for a pipeline slug, or null when none
 * exists (or the row carries no records_meta). Throws on query errors — callers
 * decide whether "reader failed" degrades to "no baseline" (they typically
 * .catch() → warn → null, which classifyOutcome treats as fail-safe LOAD).
 */
async function readPriorRunMeta(pool, pipelineName) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'completed'
      ORDER BY started_at DESC LIMIT 1`,
    [pipelineName],
  );
  return res.rows[0] ? (res.rows[0].records_meta || null) : null;
}

// ---------------------------------------------------------------------------
// 2. Unified skip-check decision
// ---------------------------------------------------------------------------
/**
 * @param {object} input
 *   Validator-equality styles: { lastModified, etag, contentHash, priorMeta }
 *     — priorMeta is the prior run's version sub-block (e.g. records_meta.ravine_load,
 *       or a heritage per-dataset sub-block passed directly).
 *   CKAN-metadata style: { lastModified, etag, storedVersion, nowMs }.
 * @param {object} options — the FOUR variants, as explicit parameters:
 *   style: STYLE_VALIDATOR_EQUALITY (default) | STYLE_CKAN_METADATA
 *   contentHashInNoValidatorsBail: false (ravines/heritage) | true (centreline)
 *   forceReloadMaxAgeDays: required for STYLE_CKAN_METADATA (zoning: 730)
 * @returns {{ skip: boolean, reason: string }} — byte-identical to the pre-B1 copies.
 */
function skipCheckDecision(input, options = {}) {
  const style = options.style || STYLE_VALIDATOR_EQUALITY;
  if (style === STYLE_CKAN_METADATA) return ckanMetadataDecision(input, options);
  return validatorEqualityDecision(input, options);
}

/** Ravines / heritage / centreline: tiered cache-validator equality. */
function validatorEqualityDecision({ lastModified = null, etag = null, contentHash = null, priorMeta = null }, options) {
  // Malformed prior meta (non-object) is treated as ABSENT — fail-safe LOAD, never a skip.
  const pm = priorMeta && typeof priorMeta === 'object' ? priorMeta : null;
  if (!pm) return { skip: false, reason: 'no_prior_run' };
  const noValidators = options.contentHashInNoValidatorsBail
    ? (!lastModified && !etag && !contentHash)
    : (!lastModified && !etag);
  if (noValidators) return { skip: false, reason: 'no_validators' };
  if (lastModified && pm.last_modified && lastModified === pm.last_modified) return { skip: true, reason: 'unchanged_last_modified' };
  if (etag && pm.etag && etag === pm.etag) return { skip: true, reason: 'unchanged_etag' };
  if (contentHash && pm.content_hash && contentHash === pm.content_hash) return { skip: true, reason: 'unchanged_content_hash' };
  return { skip: false, reason: 'changed' };
}

/** Zoning: CKAN `package_show` metadata equality + max-age force-reload (R2-11 / F-M4). */
function ckanMetadataDecision({ lastModified = null, etag = null, storedVersion = null, nowMs }, options) {
  const maxAgeDays = options.forceReloadMaxAgeDays;
  if (!Number.isFinite(maxAgeDays)) {
    throw new Error('[source-version] ckan-metadata style requires options.forceReloadMaxAgeDays (the force-reload window is a visible parameter, not a hidden default)');
  }
  if (!storedVersion) return { skip: false, reason: 'no_prior_version' };
  if (!lastModified && !etag) return { skip: false, reason: 'no_validators' };
  const storedMs = Date.parse(storedVersion);
  if (!Number.isNaN(storedMs) && nowMs - storedMs > maxAgeDays * 86400000) {
    return { skip: false, reason: 'cache_stale_force_reload' };
  }
  if (lastModified && Date.parse(lastModified) === storedMs) return { skip: true, reason: 'unchanged' };
  return { skip: false, reason: 'changed' };
}

/**
 * TIER-2 (D3): the post-download content-hash gate. Tier-1 compares CKAN/HTTP
 * metadata BEFORE the download; tier-2 compares the actual bytes AFTER it, and
 * is the only tier that can eat the daily-regeneration noise class (CKAN
 * re-stamps last_modified on files whose content never changed — measured on
 * centreline/address-points/parcels; report §6 item 11 + §9.5).
 *
 * Deliberately NOT the loaders' tier-1 options: tier-2 passes ONLY the content
 * hash, so `contentHashInNoValidatorsBail` is true here for EVERY caller — the
 * no-validators bail means "no way to tell", which is false once the bytes have
 * been hashed. Every non-match direction (no prior meta, no hash, different
 * hash) is a non-skip, so the gate is fail-safe LOAD like the rest of B1.
 *
 * @param {{ contentHash: string|null, priorMeta: object|null }} input
 * @returns {{ skip: boolean, reason: string }} — 'unchanged_content_hash' when it fires.
 */
function contentHashDecision({ contentHash = null, priorMeta = null } = {}) {
  return skipCheckDecision(
    { lastModified: null, etag: null, contentHash, priorMeta },
    { style: STYLE_VALIDATOR_EQUALITY, contentHashInNoValidatorsBail: true },
  );
}

// ---------------------------------------------------------------------------
// 3. Outcome classification (fail-safe LOAD rule — see header)
// ---------------------------------------------------------------------------
/**
 * @param {{ decision?: {skip:boolean, reason:string}|null, checkError?: Error|null }} args
 * @returns one of OUTCOME_SKIP_UNCHANGED | OUTCOME_LOAD_CHANGED | OUTCOME_LOAD_FAIL_SAFE
 */
function classifyOutcome({ decision = null, checkError = null } = {}) {
  if (checkError) return OUTCOME_LOAD_FAIL_SAFE; // CKAN/HEAD unreachable → load
  if (!decision || typeof decision.skip !== 'boolean' || typeof decision.reason !== 'string') {
    return OUTCOME_LOAD_FAIL_SAFE; // malformed decision → load, never skip
  }
  if (decision.skip) return OUTCOME_SKIP_UNCHANGED;
  return decision.reason === 'changed' ? OUTCOME_LOAD_CHANGED : OUTCOME_LOAD_FAIL_SAFE;
}

// ---------------------------------------------------------------------------
// 4. Streamed content hash
// ---------------------------------------------------------------------------
/**
 * sha256 of a file, STREAMED (constant memory) — never buffer the file
 * (the parcels CSV is ~327MB). Resolves the lowercase hex digest.
 */
function streamFileHash(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// ---------------------------------------------------------------------------
// 5. Skip-path re-emit-prior-meta merge (DS4 — see header)
// ---------------------------------------------------------------------------
/**
 * Build the records_meta version sub-block a SKIP run re-emits. The caller must
 * still emit it through pipeline.emitSummary so a COMPLETED pipeline_runs row
 * lands (downstream HALT gates read completed rows — DS4).
 * Merge order: skeleton ← priorMeta ← pins (pins LAST: BUG-2 spec_version rule).
 */
function buildSkipReEmitMeta({ skeleton = {}, priorMeta = null, pins = {} } = {}) {
  const pm = priorMeta && typeof priorMeta === 'object' ? priorMeta : {};
  return { ...skeleton, ...pm, ...pins };
}

// ---------------------------------------------------------------------------
// 6. Run-ledger gate (Phase B B3) — see header item 6 for the full contract.
// ---------------------------------------------------------------------------
/**
 * @param {import('pg').Pool | {query: Function}} pool
 * @param {object} input
 * @param {string[]} input.ownSlugs      REQUIRED, non-empty. Caller-owned slug set
 *   (e.g. ['sources:link_wsib','permits:link_wsib','link_wsib','link-wsib']) —
 *   never hardcoded in this file (T2: slug sets are always parameters).
 * @param {string[]} input.upstreamSlugs REQUIRED, non-empty. The producer(s) this
 *   script depends on, same slug-set convention.
 * @param {Date|string} [input.now] — RUN_AT (Spec 47 §R3.5 DB clock). Not
 *   consulted by the predicate itself (the window is anchored on own's last
 *   completed run, not wall-clock "now"); callers pass their own RUN_AT
 *   directly into their own audit-row stamping (Commit B — the `evaluatedAt`
 *   field that used to carry it back out of this function was deleted: it was
 *   RUN_AT ≈ now, duplicating pipeline_runs.started_at, with zero consumers).
 * @returns {Promise<{
 *   skip: boolean, reason: string,
 *   ownStarted: Date|null, ownCompleted: Date|null, ownLastRecordsMeta: object|null,
 *   nonCompleted: number, completedWithChanges: number,
 * }>}
 */
// `now` is accepted for caller-side compatibility (every caller still passes its
// RUN_AT) but is no longer echoed back — Commit B deleted the unused evaluatedAt field.
async function runLedgerGateDecision(pool, { ownSlugs, upstreamSlugs, now = null } = {}) {
  if (!Array.isArray(ownSlugs) || ownSlugs.length === 0) {
    throw new Error('[source-version] runLedgerGateDecision requires a non-empty ownSlugs array (T2: slug sets are always parameters)');
  }
  if (!Array.isArray(upstreamSlugs) || upstreamSlugs.length === 0) {
    throw new Error('[source-version] runLedgerGateDecision requires a non-empty upstreamSlugs array (T2: slug sets are always parameters)');
  }

  const res = await pool.query(
    `WITH own_last AS (
       SELECT started_at, completed_at, records_meta
         FROM pipeline_runs
        WHERE pipeline = ANY($1::text[])
          AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
     ),
     -- 'skipped' rows ⇒ RUN, deliberately: ANY status other than 'completed'
     -- in the upstream window counts toward non_completed, including a
     -- literal status='skipped' row (a lock-contention self-skip, or a
     -- legacy pre-DS4 skip that never re-stamped 'completed'). We cannot
     -- positively confirm such a row changed nothing, so the fail-safe is
     -- RUN — "the first post-scoped-run never skips" (header item 6).
     upstream_since AS (
       SELECT
         COUNT(*) FILTER (WHERE p.status <> 'completed')                                            AS non_completed,
         COUNT(*) FILTER (WHERE p.status = 'completed'
                             AND (COALESCE(p.records_new, 0) + COALESCE(p.records_updated, 0)) > 0)  AS completed_with_changes
         FROM pipeline_runs p
         CROSS JOIN own_last o
        WHERE p.pipeline = ANY($2::text[])
          AND COALESCE(p.completed_at, 'infinity'::timestamptz) > o.started_at
     )
     SELECT
       (SELECT started_at    FROM own_last)              AS own_started,
       (SELECT completed_at  FROM own_last)               AS own_completed,
       (SELECT records_meta  FROM own_last)               AS own_last_records_meta,
       (SELECT non_completed FROM upstream_since)          AS non_completed,
       (SELECT completed_with_changes FROM upstream_since) AS completed_with_changes`,
    [ownSlugs, upstreamSlugs],
  );

  const row = res.rows[0] || {};
  const ownStarted = row.own_started ?? null;
  const ownCompleted = row.own_completed ?? null;
  const ownLastRecordsMeta = row.own_last_records_meta ?? null;
  const nonCompleted = Number(row.non_completed ?? 0);
  const completedWithChanges = Number(row.completed_with_changes ?? 0);

  // Commit B — evaluatedAt (== `now`, i.e. RUN_AT) deleted: it duplicated
  // pipeline_runs.started_at and had zero consumers (two independent WF3
  // review seats ruled it should go, not gain one).
  const base = { ownStarted, ownCompleted, ownLastRecordsMeta, nonCompleted, completedWithChanges };

  // No-completed-run-ever arm — fail-safe RUN (never skip on an absent baseline).
  if (!ownCompleted) {
    return { skip: false, reason: 'no_prior_completed_run', ...base };
  }
  // ANY non-completed upstream activity since own last ran (running / failed /
  // cancelled / skipped / deferred_to_full) → RUN. deferred_to_full is excluded
  // structurally from ever satisfying the skip (it is not 'completed').
  if (nonCompleted > 0) {
    return { skip: false, reason: 'upstream_activity_since_last_run', ...base };
  }
  // Every completed upstream run in the window reported zero changes → SKIP.
  if (completedWithChanges === 0) {
    return { skip: true, reason: 'no_upstream_changes', ...base };
  }
  return { skip: false, reason: 'upstream_changed', ...base };
}

// ---------------------------------------------------------------------------
// 7. Skip-path records_meta builder for the run-ledger gate (Commit B, B3
//    output-panel remediation) — see docs/specs/01-pipeline/48_pipeline_observability.md §3.7.
// ---------------------------------------------------------------------------
/**
 * Build a run-ledger-gate SKIP's records_meta. The remedy pattern is
 * enrich-heritage.js's emitHeritageResults(): a skip must keep its FAIL/WARN
 * coverage gates and a REAL row-derived verdict, never a bare hardcoded PASS —
 * a gate that goes green just because it didn't look is worse than no gate.
 *
 * - Carries forward the named audit rows from the own-last completed run's
 *   audit_table (so a WARN/FAIL coverage row the skip is masking stays
 *   visible on the SKIP's own verdict cascade).
 * - Stamps own_started (this run's RUN_AT) + a carried-forward last_full_run_at
 *   (the prior meta's own last_full_run_at if it had one — i.e. this run was
 *   ALSO a skip — else the own-last run's completed_at, i.e. that run WAS the
 *   last full run). An operator can reconstruct "days since last real
 *   execution" from last_full_run_at alone (B-R2).
 * - Tracks consecutive_skips: reset to 1 when the own-last run was itself a
 *   REAL run, incremented when the own-last run was itself a skip (detected
 *   via its carried 'status'/'SKIPPED' row) — free from the same read.
 * - Stamps gated_skip:true so duration-anomaly baselines (src/lib/quality/types.ts
 *   detectDurationAnomalies via the /api/quality route) can exclude a gate
 *   skip's near-zero duration from a pipeline's historical average (B5) — a
 *   `d > 0` filter alone cannot distinguish a genuine fast run from a gate
 *   skip; both measure non-zero milliseconds.
 * - verdict is ROW-DERIVED (never a hardcoded 'PASS') so a carried FAIL/WARN
 *   row, or consecutive_skips crossing its own WARN threshold, propagates.
 *
 * @param {object} args
 * @param {{reason:string, nonCompleted:number, completedWithChanges:number, ownCompleted:Date|string|null, ownLastRecordsMeta:object|null}} args.gate
 * @param {Date|string} args.runAt — this run's RUN_AT (Spec 47 §R3.5 DB clock)
 * @param {{phase:number, name:string}} args.auditMeta
 * @param {string[]} [args.carryMetricNames] — exact audit-row metric names to carry forward
 * @param {string[]} [args.carryMetricPrefixes] — prefix-matched metric names to carry forward
 * @param {number} [args.consecutiveSkipsWarnAt=4] — WARN threshold for consecutive_skips
 * @returns {object} records_meta ready for pipeline.emitSummary
 */
function buildSkipGateRecordsMeta({
  gate,
  runAt,
  auditMeta,
  carryMetricNames = [],
  carryMetricPrefixes = [],
  consecutiveSkipsWarnAt = 4,
}) {
  const priorMeta = gate.ownLastRecordsMeta && typeof gate.ownLastRecordsMeta === 'object' ? gate.ownLastRecordsMeta : null;
  const priorAuditTable = priorMeta && priorMeta.audit_table && typeof priorMeta.audit_table === 'object' ? priorMeta.audit_table : null;
  const priorRows = Array.isArray(priorAuditTable?.rows) ? priorAuditTable.rows : [];
  const priorWasSkip = priorRows.some((r) => r.metric === 'status' && r.value === 'SKIPPED');
  const priorConsecutiveSkips = Number(priorMeta?.consecutive_skips ?? 0);
  const consecutiveSkips = priorWasSkip && Number.isFinite(priorConsecutiveSkips) && priorConsecutiveSkips > 0
    ? priorConsecutiveSkips + 1
    : 1;
  const carriedRows = priorRows.filter(
    (r) => carryMetricNames.includes(r.metric) || carryMetricPrefixes.some((p) => String(r.metric).startsWith(p)),
  );
  const rows = [
    { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
    { metric: 'reason', value: gate.reason, threshold: null, status: 'INFO' },
    { metric: 'non_completed_upstream', value: gate.nonCompleted, threshold: null, status: 'INFO' },
    { metric: 'completed_with_changes_upstream', value: gate.completedWithChanges, threshold: null, status: 'INFO' },
    {
      metric: 'consecutive_skips',
      value: consecutiveSkips,
      threshold: `< ${consecutiveSkipsWarnAt}`,
      status: consecutiveSkips >= consecutiveSkipsWarnAt ? 'WARN' : 'INFO',
    },
    ...carriedRows,
  ];
  const verdict = rows.some((r) => r.status === 'FAIL') ? 'FAIL' : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
  // last_full_run_at: carried forward from a prior SKIP's own last_full_run_at
  // (this run is skipping too, so the last REAL execution hasn't moved), else
  // the own-last completed run's completed_at (that run WAS the last full run).
  const lastFullRunAt = priorMeta?.last_full_run_at ?? gate.ownCompleted;

  return buildSkipReEmitMeta({
    skeleton: {},
    priorMeta,
    pins: {
      own_started: runAt,
      last_full_run_at: lastFullRunAt,
      consecutive_skips: consecutiveSkips,
      gated_skip: true,
      audit_table: { phase: auditMeta.phase, name: auditMeta.name, verdict, rows },
    },
  });
}

module.exports = {
  OUTCOME_SKIP_UNCHANGED,
  OUTCOME_LOAD_CHANGED,
  OUTCOME_LOAD_FAIL_SAFE,
  STYLE_VALIDATOR_EQUALITY,
  STYLE_CKAN_METADATA,
  readPriorRunMeta,
  skipCheckDecision,
  contentHashDecision,
  classifyOutcome,
  streamFileHash,
  buildSkipReEmitMeta,
  runLedgerGateDecision,
  buildSkipGateRecordsMeta,
};
