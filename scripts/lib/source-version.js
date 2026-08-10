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
};
