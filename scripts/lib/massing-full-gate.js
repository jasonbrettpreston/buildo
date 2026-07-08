'use strict';
/**
 * link_massing --full gate (WF2 P11-2).
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md
 *
 * The `--full` chain_arg (0031f37) served the one-time b16c036 ghost-link cleanup
 * + re-link; leaving it always-on costs ~21.9 min every quarterly sources run even
 * when nothing changed. This gate makes a full relink conditional on a real change:
 *   (1) DATA: the building_footprints corpus count changed since the last run
 *       (a quarterly reload that added/removed footprints) — a stable, churn-free
 *       signal (load-massing carries no dataset-version in its meta; records_updated
 *       is a constant 4-row churn, so neither is usable directly).
 *   (2) CODE: the matching predicate/logic changed — bump LINK_MASSING_CODE_VERSION.
 *       (A pure data gate would have silently skipped the b16c036 predicate FLIP
 *       itself, leaving ghost links.) Recorded in meta + compared next run.
 * Missing prior signals (pre-P11 runs) are treated as UNCHANGED: the last completed
 * sources run WAS a full relink with the current predicate, so an incremental run now
 * is correct. Escape hatch: LINK_MASSING_FORCE_FULL=1 forces a full relink uncondit.
 */

// Bump on ANY change to the matching predicate / structure-classification / ghost-
// cleanup logic (the b16c036-class guard) — forces a full relink on the next run.
const LINK_MASSING_CODE_VERSION = 'v2-building-centroid-in-parcel';

/**
 * Pure decision: full only when the chain PERMITS it (--full) AND the gate saw a
 * change — OR an explicit operator force. Exported for the regression lock.
 */
function decideMassingFull({ explicitFull, forceFull, gateChanged }) {
  return Boolean(forceFull) || (Boolean(explicitFull) && Boolean(gateChanged));
}

/**
 * Reads the building_footprints count + the last completed link_massing run's
 * recorded (count, code_version). Returns { changed, reason, buildingCount }.
 */
async function evaluateMassingFullGate(pool) {
  const buildingCount = String(
    (await pool.query('SELECT COUNT(*)::bigint AS n FROM building_footprints')).rows[0].n,
  );
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs
       WHERE pipeline IN ('sources:link_massing','permits:link_massing','link_massing','link-massing')
         AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
  );
  if (res.rows.length === 0) return { changed: true, reason: 'no_prior_run', buildingCount };
  const meta = res.rows[0].records_meta || {};
  const prevCode = meta.code_version;
  const prevCount = meta.building_footprints_count;
  if (prevCode !== undefined && prevCode !== LINK_MASSING_CODE_VERSION) {
    return { changed: true, reason: `code_version_changed(${prevCode}->${LINK_MASSING_CODE_VERSION})`, buildingCount };
  }
  if (prevCount !== undefined && String(prevCount) !== buildingCount) {
    return { changed: true, reason: `massing_count_changed(${prevCount}->${buildingCount})`, buildingCount };
  }
  return { changed: false, reason: 'unchanged', buildingCount };
}

module.exports = { LINK_MASSING_CODE_VERSION, decideMassingFull, evaluateMassingFullGate };
