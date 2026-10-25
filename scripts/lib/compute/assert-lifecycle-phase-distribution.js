/**
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ, R-DC, R-DE, R-DF, R-EP
 *
 * Lifecycle Phase Distribution (Tier 3 CQA) — THE DOMAIN LOGIC ONLY.
 *
 * Ported from `scripts/quality/assert-lifecycle-phase-distribution.js` (pre-conversion, 930 L) per
 * `docs/reports/2026-10-19-batch5-p1-4-assert-lifecycle-phase-distribution-assessment.md`. The runner owns the
 * lock (identity.lock 109), the config (config.logic_variables, step-owned names, R-DE (v)), the verdict (the
 * declared check bounds compare; compute never compares a config value, R-BZ G7 / R-DC), the halt (blocking
 * checks), the audit table and the emits.
 *
 * Reads (all read-only over the declared relations, R-CA (i)): the two phase GROUP BYs, the per-seq
 * classification (one statement over universal_stream_catalog × the permits/coa_applications lifecycle_seq
 * UNION ALL × the declared bands), the two seq-unclassified and two phase-unclassified counts, the two drain-lag
 * breakouts, bid_value coverage and the three cross checks — every SQL body except the classification is the
 * legacy text verbatim.
 *
 * Per-seq bands (R-DC "the fix is the declared check's limit_from_config or check SQL"): the band comparison
 * and each kind's posture flag are evaluated in SEQ_CLASSIFY_SQL with the resolved bands as parameters, so this
 * module only counts the rows the statement returns. Each seq gets exactly one kind (ALPD-D5: a banded seq with
 * no data is expected_data_missing only, never also a band_violation).
 *
 * Checks (descriptor order — the §5.5 dispatch table below mirrors it). Context rows (INFO) follow them: one
 * lifecycle_seq_NN_count row per banded catalog seq, seq_bands_passing, seq_bands_null_catalog_count, the three
 * posture flags, bid_value_coverage, phase_distribution and seq_distribution.
 */
'use strict';

const { DEAD_STATUS_ARRAY, NORMALIZED_DEAD_DECISIONS_ARRAY } = require('../lifecycle-phase');

const SLUG = 'assert_lifecycle_phase_distribution';
const BAND_MIN_RE = new RegExp(`^${SLUG}_seq_band_(\\d+)_min$`);
const FLAG = {
  band_violation: `${SLUG}_seq_band_promote_to_fail_band_violation`,
  no_band_configured: `${SLUG}_seq_band_promote_to_fail_no_band_configured`,
  expected_data_missing: `${SLUG}_seq_band_promote_to_fail_expected_data_missing`,
};
const VIOLATION_KINDS = ['band_violation', 'no_band_configured', 'expected_data_missing'];

// Phases that roll into the P9-P17 aggregate bucket (`:101-103`, Spec 84 §3.4).
const ACTIVE_SUBPHASES = ['P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17'];

// ── verbatim legacy SQL ─────────────────────────────────────────────────────
const PERMIT_PHASES_SQL = `SELECT lifecycle_phase, COUNT(*)::int AS n
         FROM permits
        GROUP BY lifecycle_phase`;
const COA_PHASES_SQL = `SELECT lifecycle_phase, COUNT(*)::int AS n
         FROM coa_applications
        GROUP BY lifecycle_phase`;
const SEQ_UNCLASSIFIED_PERMITS_SQL = `SELECT COUNT(*)::int AS n FROM permits
        WHERE lifecycle_seq IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''`;
const SEQ_UNCLASSIFIED_COA_SQL = `SELECT COUNT(*)::int AS n FROM coa_applications
        WHERE lifecycle_seq IS NULL
          AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
              <> ALL($1::text[])
          AND decision IS NOT NULL
          AND TRIM(decision) <> ''`;
const UNCLASSIFIED_PERMITS_SQL = `SELECT COUNT(*)::int AS n
         FROM permits
        WHERE lifecycle_phase IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''`;
// Diff-review v4 fence (pinned L4): the phase-keyed CoA count KEEPS `linked_permit_num IS NULL`.
const UNCLASSIFIED_COA_SQL = `SELECT COUNT(*)::int AS n
         FROM coa_applications
        WHERE lifecycle_phase IS NULL
          AND linked_permit_num IS NULL
          AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
              <> ALL($1::text[])
          AND decision IS NOT NULL
          AND TRIM(decision) <> ''`;
const LIVE_STATUS_NULL_SQL = `SELECT COUNT(*)::int AS n FROM permits
        WHERE lifecycle_phase IS NULL
          AND matched_rule IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''`;
const NEVER_CLASSIFIED_SQL = `SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_classified_at IS NULL`;
const BID_COVERAGE_SQL = `SELECT
         (SELECT COUNT(*)::int FROM permits) AS p_total,
         (SELECT COUNT(bid_value)::int FROM permits) AS p_cov,
         (SELECT COUNT(*)::int FROM coa_applications) AS c_total,
         (SELECT COUNT(bid_value)::int FROM coa_applications) AS c_cov`;
const CROSS_STALLED_SQL = `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'stalled' AND lifecycle_stalled IS NOT TRUE`;
const CROSS_ACTIVE_SQL = `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'active inspection'
          AND (lifecycle_phase NOT IN (
            'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
            'O1','O2','O3'
          ) OR lifecycle_phase IS NULL)`;
const CROSS_ISSUED_SQL = `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'permit issued'
          AND (lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8','P18',
               'O1','O2','O3')
               OR lifecycle_phase IS NULL)`;

/**
 * The per-seq classification: one row per seq that is in the catalog, in the data or carries a declared band.
 * $1/$2/$3 are the declared bands (seq, min, max), $4/$5/$6 the three posture flags. A band counts only for a
 * catalog seq (legacy `seqBands` was keyed off the catalog, `:244-254`); a declared band for a seq outside a
 * non-empty catalog is an orphan (legacy threw, `:261-292`). A missing catalog table throws here, so the run
 * fails instead of reading PASS (ALPD-D4; execution.on_check_error fail_step).
 */
const SEQ_CLASSIFY_SQL = `
  WITH bands AS (
    SELECT seq, band_min, band_max
      FROM unnest($1::int[], $2::float8[], $3::float8[]) AS b(seq, band_min, band_max)
  ),
  cat AS (
    SELECT seq, rows_count FROM universal_stream_catalog
  ),
  dist AS (
    SELECT lifecycle_seq AS seq, COUNT(*)::int AS n
      FROM (
        SELECT lifecycle_seq FROM permits          WHERE lifecycle_seq IS NOT NULL
        UNION ALL
        SELECT lifecycle_seq FROM coa_applications WHERE lifecycle_seq IS NOT NULL
      ) u
     GROUP BY lifecycle_seq
  ),
  classified AS (
    SELECT s.seq,
           COALESCE(d.n, 0) AS actual,
           (c.seq IS NOT NULL) AS in_catalog,
           (b.seq IS NOT NULL) AS banded,
           (d.seq IS NOT NULL) AS has_data,
           b.band_min, b.band_max,
           CASE
             WHEN b.seq IS NOT NULL AND c.seq IS NULL AND (SELECT COUNT(*) FROM cat) > 0 THEN 'orphan_band'
             WHEN b.seq IS NOT NULL AND c.seq IS NOT NULL AND COALESCE(c.rows_count, 0) = 0 THEN 'catalog_null'
             WHEN b.seq IS NOT NULL AND c.seq IS NOT NULL AND d.seq IS NULL AND b.band_min > 0 THEN 'expected_data_missing'
             WHEN b.seq IS NOT NULL AND c.seq IS NOT NULL
                  AND COALESCE(d.n, 0) >= b.band_min
                  AND (b.band_max IS NULL OR COALESCE(d.n, 0) <= b.band_max) THEN 'in_band'
             WHEN b.seq IS NOT NULL AND c.seq IS NOT NULL THEN 'band_violation'
             WHEN d.seq IS NOT NULL THEN 'no_band_configured'
             WHEN c.seq IS NOT NULL THEN 'unbanded'
             ELSE 'inert'
           END AS kind
      FROM (SELECT seq FROM bands UNION SELECT seq FROM cat UNION SELECT seq FROM dist) s
      LEFT JOIN bands b ON b.seq = s.seq
      LEFT JOIN cat   c ON c.seq = s.seq
      LEFT JOIN dist  d ON d.seq = s.seq
  )
  SELECT seq, actual, in_catalog, banded, has_data, band_min, band_max, kind,
         CASE kind
           WHEN 'band_violation'        THEN CASE WHEN $4::int = 1 THEN 'fail' ELSE 'warn' END
           WHEN 'no_band_configured'    THEN CASE WHEN $5::int = 1 THEN 'fail' ELSE 'warn' END
           WHEN 'expected_data_missing' THEN CASE WHEN $6::int = 1 THEN 'fail' ELSE 'warn' END
         END AS posture
    FROM classified
   ORDER BY seq`;

/** The declared variable names, read off the descriptor (never scanned from the DB). */
function declaredNames(descriptor) {
  const vars = (descriptor && descriptor.config && descriptor.config.logic_variables) || [];
  return vars.map((v) => v.name);
}

/** The declared per-seq band family: every seq with a declared `_min` (a `_max` is declared only for a bounded seq). */
function declaredBandSeqs(descriptor) {
  const seqs = [];
  for (const name of declaredNames(descriptor)) {
    const m = BAND_MIN_RE.exec(name);
    if (m) seqs.push(Number(m[1]));
  }
  return seqs.sort((a, b) => a - b);
}

/**
 * The bind parameters of SEQ_CLASSIFY_SQL — resolved config values, passed through, compared against nothing here.
 * A seq with no declared `_max` binds NULL: "no upper bound" (the 33 catalog rows_count NULL/0 seqs, migration 148
 * :86), since a logic variable is always a finite number.
 */
function classifyParams(ctx) {
  const declared = new Set(declaredNames(ctx.descriptor));
  const seqs = declaredBandSeqs(ctx.descriptor);
  const mins = seqs.map((s) => ctx.config[`${SLUG}_seq_band_${s}_min`]);
  const maxs = seqs.map((s) => (declared.has(`${SLUG}_seq_band_${s}_max`) ? ctx.config[`${SLUG}_seq_band_${s}_max`] : null));
  return [seqs, mins, maxs, ctx.config[FLAG.band_violation], ctx.config[FLAG.no_band_configured], ctx.config[FLAG.expected_data_missing]];
}

/** The single `n` of a COUNT row. */
const nOf = (res) => res.rows[0].n;

// One round trip per statement per run regardless of how many checks read it (the assert_parcel_sanity
// SCAN_MEMO pattern).
const SCAN_MEMO = new WeakMap();
function getScan(ctx) {
  if (!SCAN_MEMO.has(ctx)) SCAN_MEMO.set(ctx, runScan(ctx));
  return SCAN_MEMO.get(ctx);
}

async function runScan(ctx) {
  const pool = ctx.pool;
  const { rows: permitRows } = await pool.query(PERMIT_PHASES_SQL);
  const { rows: coaRows } = await pool.query(COA_PHASES_SQL);
  const { rows: seqRows } = await pool.query(SEQ_CLASSIFY_SQL, classifyParams(ctx));
  const seqUnclassified = nOf(await pool.query(SEQ_UNCLASSIFIED_PERMITS_SQL, [DEAD_STATUS_ARRAY]))
    + nOf(await pool.query(SEQ_UNCLASSIFIED_COA_SQL, [NORMALIZED_DEAD_DECISIONS_ARRAY]));
  const unclassified = nOf(await pool.query(UNCLASSIFIED_PERMITS_SQL, [DEAD_STATUS_ARRAY]))
    + nOf(await pool.query(UNCLASSIFIED_COA_SQL, [NORMALIZED_DEAD_DECISIONS_ARRAY]));
  const liveStatusNull = nOf(await pool.query(LIVE_STATUS_NULL_SQL, [DEAD_STATUS_ARRAY]));
  const neverClassified = nOf(await pool.query(NEVER_CLASSIFIED_SQL));
  const bid = (await pool.query(BID_COVERAGE_SQL)).rows[0];
  const crossStalled = nOf(await pool.query(CROSS_STALLED_SQL));
  const crossActive = nOf(await pool.query(CROSS_ACTIVE_SQL));
  const crossIssued = nOf(await pool.query(CROSS_ISSUED_SQL));
  return {
    phaseDistribution: phaseDistribution(permitRows, coaRows),
    seqRows: seqRows.map(shapeSeqRow),
    seqUnclassified,
    unclassified,
    liveStatusNull,
    neverClassified,
    bid,
    crossStalled,
    crossActive,
    crossIssued,
  };
}

function shapeSeqRow(r) {
  return {
    seq: Number(r.seq),
    actual: Number(r.actual),
    in_catalog: r.in_catalog === true,
    banded: r.banded === true,
    has_data: r.has_data === true,
    band_min: r.band_min === null || r.band_min === undefined ? null : Number(r.band_min),
    band_max: r.band_max === null || r.band_max === undefined ? null : Number(r.band_max),
    kind: r.kind,
    posture: r.posture || null,
  };
}

/** WF3 Bug #6 (`:331-342`): permits and CoA phase counts are SUMMED per shared key, then the P9-P17 aggregate. */
function phaseDistribution(permitRows, coaRows) {
  const all = {};
  for (const r of [...permitRows, ...coaRows]) {
    const key = r.lifecycle_phase === null ? 'null' : r.lifecycle_phase;
    all[key] = (all[key] || 0) + r.n;
  }
  all['P9-P17'] = ACTIVE_SUBPHASES.reduce((sum, p) => sum + (all[p] || 0), 0);
  return all;
}

/** The violations of one posture, as legacy's seq_violations entries, sliced to the R-EP cap (truncation read from the slice). */
function violationsOf(ctx, seqRows, posture) {
  const all = seqRows
    .filter((r) => VIOLATION_KINDS.includes(r.kind) && r.posture === posture)
    .map((r) => ({
      seq: r.seq,
      actual: r.actual,
      band_min: r.kind === 'no_band_configured' ? null : r.band_min,
      band_max: r.kind === 'no_band_configured' ? null : r.band_max,
      kind: r.kind,
      posture,
    }));
  const shown = all.slice(0, ctx.config[`${SLUG}_max_detail_keys`]);
  return { count: all.length, detail: { seq_violations: shown, seq_violations_truncated: shown.length < all.length } };
}

// ── checks (descriptor order; Spec 122 §5.5 (1), (4)) ────────────────────────

/** ALPD-D7: an empty dead-status vocabulary makes `<> ALL('{}')` vacuously true; legacy threw at import (`:106-111`). */
function dead_status_vocabulary_present(ctx) {
  const empty = [['DEAD_STATUS_ARRAY', DEAD_STATUS_ARRAY], ['NORMALIZED_DEAD_DECISIONS_ARRAY', NORMALIZED_DEAD_DECISIONS_ARRAY]]
    .filter(([, arr]) => !Array.isArray(arr) || !arr.length)
    .map(([name]) => name);
  ctx.report('dead_status_vocabulary_present', { violations: empty.length, ...(empty.length ? { detail: `empty: ${empty.join(', ')}` } : {}) });
}

async function unclassified_count(ctx) {
  ctx.report('unclassified_count', { value: (await getScan(ctx)).unclassified });
}

async function live_status_null_count(ctx) {
  ctx.report('live_status_null_count', { value: (await getScan(ctx)).liveStatusNull });
}

async function never_classified_count(ctx) {
  ctx.report('never_classified_count', { value: (await getScan(ctx)).neverClassified });
}

async function seq_bands_total(ctx) {
  const { seqRows } = await getScan(ctx);
  const catalog = seqRows.filter((r) => r.in_catalog);
  const unbanded = catalog.filter((r) => !r.banded).length;
  const banded = catalog.length - unbanded;
  // An empty catalog (the table exists, mig 129 seed not applied) is one violation (`:723-728`, ALPD-D4).
  const violations = unbanded + (catalog.length ? 0 : 1);
  ctx.report('seq_bands_total', {
    violations,
    detail: catalog.length
      ? `${banded}/${catalog.length} catalog seqs carry a declared band`
      : '0 rows in universal_stream_catalog — verify mig 129 seed applied',
  });
}

async function seq_band_orphan_count(ctx) {
  const orphans = (await getScan(ctx)).seqRows.filter((r) => r.kind === 'orphan_band').map((r) => r.seq);
  ctx.report('seq_band_orphan_count', { violations: orphans.length, ...(orphans.length ? { detail: { orphan_seqs: orphans } } : {}) });
}

async function seq_bands_warn(ctx) {
  const v = violationsOf(ctx, (await getScan(ctx)).seqRows, 'warn');
  ctx.report('seq_bands_warn', { violations: v.count, ...(v.count ? { detail: v.detail } : {}) });
}

async function seq_bands_failing(ctx) {
  const v = violationsOf(ctx, (await getScan(ctx)).seqRows, 'fail');
  ctx.report('seq_bands_failing', { violations: v.count, ...(v.count ? { detail: v.detail } : {}) });
}

async function seq_unclassified_count(ctx) {
  ctx.report('seq_unclassified_count', { value: (await getScan(ctx)).seqUnclassified });
}

async function cross_check_stalled(ctx) {
  ctx.report('cross_check_stalled', { violations: (await getScan(ctx)).crossStalled });
}

async function cross_check_active_inspection(ctx) {
  ctx.report('cross_check_active_inspection', { violations: (await getScan(ctx)).crossActive });
}

async function cross_check_permit_issued(ctx) {
  ctx.report('cross_check_permit_issued', { violations: (await getScan(ctx)).crossIssued });
}

const CHECKS = {
  dead_status_vocabulary_present,
  unclassified_count,
  live_status_null_count,
  never_classified_count,
  seq_bands_total,
  seq_band_orphan_count,
  seq_bands_warn,
  seq_bands_failing,
  seq_unclassified_count,
  cross_check_stalled,
  cross_check_active_inspection,
  cross_check_permit_issued,
};

/** A per-seq context row's threshold text, as legacy rendered it (`:404-406`). */
function seqThreshold(r) {
  if (r.kind === 'catalog_null') return 'no upper bound (catalog rows_count=0)';
  if (r.band_max === null) return `>= ${r.band_min} (no upper bound)`;
  return `${r.band_min}..${r.band_max}`;
}

/** bid_value coverage (`:645-660`), honest INFO; the threshold text names no measured count (ALPD-D10). */
function bidCoverage(bid) {
  const pPct = bid.p_total ? (100 * bid.p_cov / bid.p_total) : 0;
  const cPct = bid.c_total ? (100 * bid.c_cov / bid.c_total) : 0;
  return `permits ${pPct.toFixed(1)}% / coa ${cPct.toFixed(1)}%`;
}

/** §5.5 (2) — run the SELECTED checks, then append the legacy INFO rows as context rows. */
async function compute(ctx) {
  for (const checkId of ctx.checks) {
    const fn = CHECKS[checkId];
    if (typeof fn !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${checkId}" with no function in the compute dispatch table`);
    }
    await fn(ctx);
  }
  const s = await getScan(ctx);
  // One row per banded catalog seq (Pass-2 fold 2026-05-19, operator direction "emit for each of the 110 seq
  // bands"). INFO: the PASS/WARN/FAIL of a seq is carried by seq_bands_warn / seq_bands_failing (Rule 10).
  for (const r of s.seqRows.filter((x) => x.in_catalog && x.banded)) {
    ctx.contextRow({ metric: `lifecycle_seq_${String(r.seq).padStart(2, '0')}_count`, value: r.actual, threshold: seqThreshold(r), status: 'INFO' });
  }
  const passing = s.seqRows.filter((r) => r.kind === 'in_band' || r.kind === 'catalog_null').length;
  const nullCatalog = s.seqRows.filter((r) => r.kind === 'catalog_null').length;
  ctx.contextRow({ metric: 'seq_bands_passing', value: passing, threshold: null, status: 'INFO' });
  ctx.contextRow({ metric: 'seq_bands_null_catalog_count', value: nullCatalog, threshold: null, status: 'INFO' });
  for (const kind of VIOLATION_KINDS) {
    ctx.contextRow({
      metric: FLAG[kind],
      value: ctx.config[FLAG[kind]],
      threshold: `0=WARN routing (seq_bands_warn), 1=FAIL routing (seq_bands_failing, halts). Gates \`${kind}\`. See Spec 84 §3.4.`,
      status: 'INFO',
    });
  }
  ctx.contextRow({ metric: 'bid_value_coverage', value: bidCoverage(s.bid), threshold: 'INFO — permits bid_value is an unwired populate gap; coa fully mapped.', status: 'INFO' });
  ctx.contextRow({ metric: 'phase_distribution', value: s.phaseDistribution, threshold: null, status: 'INFO' });
  const seqDistribution = {};
  for (const r of s.seqRows) if (r.has_data) seqDistribution[r.seq] = r.actual;
  ctx.contextRow({ metric: 'seq_distribution', value: seqDistribution, threshold: null, status: 'INFO' });
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.SEQ_CLASSIFY_SQL = SEQ_CLASSIFY_SQL;
module.exports.declaredBandSeqs = declaredBandSeqs;
module.exports.phaseDistribution = phaseDistribution;
