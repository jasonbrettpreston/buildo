'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §2, §3 (CoA source contract; event_date map)
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md (chain coa, step 2)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute shape)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, R-BZ, R-DF, R-DM, R-DX, R-DY, R-DZ
 *
 * Committee of Adjustment applications — THE DOMAIN LOGIC ONLY (the `coa` INGESTOR, phase-4 commit ②).
 *
 * Ported from the frozen legacy oracle `src/tests/steps/coa/fixtures/legacy-load-coa.js.txt` per
 * `docs/reports/2026-10-17-batch4-p1-2-coa-assessment.md`. The runner owns everything else:
 *   - acquisition: the two CKAN DataStore primaries form ONE union group on coa_applications (R-DX (iii));
 *     Closed is selected in full mode only (R-DX (iv) `externals[].modes`), paged at `coa_page_size`,
 *     retried per `coa_download_retries` / `coa_download_retry_backoff_ms`;
 *   - the advisory lock (identity.lock 95), the run clock (`run_at`, R-CE), the RLS preflight;
 *   - the write: one guarded upsert on application_number (data_hash guard), the `last_seen_at` touch for
 *     every fed key inside the same transaction (R-DZ, closes COA-D4), the prior-status read and the
 *     derived lifecycle_status_history rows with the R-DM rollback point (R-DY, R-DM);
 *   - table maintenance (execution.maintenance, COA-D7) and the verdict (the declared check bounds).
 *
 * PURE (R-BZ): no write, no clock read, no network, no transaction. Every bound is a declared check
 * bound read by the runner (R-DF EXTERNALIZED); the one check SELECT (max_days_stale) reads the declared
 * `checks[].reads` columns only.
 *
 * Behaviour vs the frozen legacy oracle:
 *   - identical mapping, mapped-field hash, skip vocabulary, dedup order and ledger rows;
 *   - COA-D3: decision_date / hearing_date are the CKAN calendar date text 'YYYY-MM-DD', bound into the
 *     DATE columns as text, so the stored date no longer depends on the session TimeZone;
 *   - COA-D11: data_hash takes those dates in the UTC-midnight ISO form, identical to the legacy under a
 *     UTC process (the dev DB session and the measured CKAN date forms, assessment §1.4);
 *   - COA-D6 (operator-ruled behaviour change 2026-10-17): max_days_stale is measured from the newest
 *     hearing ON/BEFORE the run date, never a future-scheduled one;
 *   - the log-only stats SELECT is dropped (operator decision 5).
 */
const crypto = require('crypto');
const { normalizeStreetName } = require('../address');
const { MS_PER_DAY } = require('../units');

/** CKAN fields whose absence is schema drift (legacy load-coa.js:40-47) — publisher vocabulary, not tunables. */
const CRITICAL_FIELDS = Object.freeze([
  'REFERENCE_FILE#',
  'C_OF_A_DESCISION',
  'STATUSDESC',
  'HEARING_DATE',
  'STREET_NUM',
  'STREET_NAME',
]);

/**
 * Spec 51 §3 — the 8 CoA statuses that anchor lifecycle_status_history.event_date to a CKAN source date
 * column (legacy load-coa.js:63-74). Every other status leaves event_date null.
 */
const STATUS_TO_DATE_COLUMN_COA = Object.freeze({
  'Tentatively Scheduled': 'hearing_date',
  'Hearing Scheduled': 'hearing_date',
  'Hearing Rescheduled': 'hearing_date',
  'Conditional Consent': 'decision_date',
  Approved: 'decision_date',
  'Approved with Conditions': 'decision_date',
  Refused: 'decision_date',
  'Await Expiry Date': 'decision_date',
});

/** lifecycle_status_history.detected_by — byte-identical, a CHECK-constrained vocabulary value (migration 127). */
const DETECTED_BY = 'load-coa.js';
/** The lead_id prefix of a CoA lead (Spec 42 §6.6.A.1; the lifecycle_status_history CHECK). */
const LEAD_PREFIX = 'coa:';
const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/;
const LEDGER_TABLE = 'lifecycle_status_history';

/** The mapped record's keys in legacy order (load-coa.js:224-239) — the data_hash input. */
const MAPPED_COLUMNS = Object.freeze([
  'application_number', 'address', 'street_num', 'street_name', 'street_name_normalized', 'ward',
  'status', 'decision', 'decision_date', 'hearing_date', 'description', 'applicant', 'sub_type',
  'zoning_designation',
]);

function trimToNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/**
 * A CKAN date cell → 'YYYY-MM-DD' or null (COA-D3). Active types HEARING_DATE / APPEAL_EXPIRY_DATE as
 * `date` ('YYYY-MM-DD'); Closed FINALDATE arrives 'YYYY-MM-DDT00:00:00' (assessment §1.4). The calendar
 * date is the text's own date part — never re-derived through a Date object, whose parse of a zone-less
 * timestamp depends on the process TimeZone.
 */
function isoDate(v) {
  const t = trimToNull(v);
  if (t === null) return null;
  const m = ISO_DATE_RE.exec(t);
  if (m && !Number.isNaN(Date.parse(`${m[1]}T00:00:00Z`))) return m[1];
  return null;
}

/** The legacy hash representation of a date (JSON of a UTC-midnight Date), COA-D11. */
function hashDate(iso) {
  return iso === null ? null : `${iso}T00:00:00.000Z`;
}

/** sha256 over the MAPPED record with sorted keys (legacy computeHash, load-coa.js:89-95). */
function computeHash(record) {
  const sorted = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/** The key seam: REFERENCE_FILE# trimmed; a blank key is a counted bad key (legacy missing_app_num, :179-180). */
function coerceKey(raw) {
  return trimToNull(raw);
}

/** The CRITICAL fields a raw record lacks (legacy :171-177), in CRITICAL_FIELDS order. */
function missingCriticalFields(keys) {
  const have = new Set(keys || []);
  return CRITICAL_FIELDS.filter((f) => !have.has(f));
}

/**
 * shapeRecord(record, seam) → the coa_applications column values, or the skip reason 'schema_mismatch'
 * for a record missing a CRITICAL field (legacy mapRecord, load-coa.js:168-246). `seam.run_at` is the
 * runner clock the insert stamps as first_seen_at (legacy RUN_AT $16); last_seen_at is the runner's
 * written "seen" column (R-DZ) and is never bound here. `seam.tag('applicant_present')` counts a mapped
 * record carrying CONTACT_NAME (the applicant_names_present observer, pre-dedup like the legacy :634).
 */
function shapeRecord(record, seam) {
  const r = record || {};
  if (missingCriticalFields(Object.keys(r)).length > 0) return 'schema_mismatch';
  const appNum = trimToNull(r['REFERENCE_FILE#']);
  if (!appNum) return 'missing_app_num';

  const streetNum = trimToNull(r.STREET_NUM);
  const streetName = trimToNull(r.STREET_NAME);
  const streetType = trimToNull(r.STREET_TYPE);
  const streetDir = trimToNull(r.STREET_DIRECTION);
  let fullStreetName = streetName || '';
  if (streetType) fullStreetName += ' ' + streetType;
  if (streetDir) fullStreetName += ' ' + streetDir;
  fullStreetName = fullStreetName.trim() || null;
  const address = streetNum && fullStreetName ? `${streetNum} ${fullStreetName}` : fullStreetName || streetNum || null;

  const hearingDate = isoDate(r.HEARING_DATE);
  const decisionDate = isoDate(r.FINALDATE) || isoDate(r.APPEAL_EXPIRY_DATE);
  const mapped = {
    application_number: appNum,
    address,
    street_num: streetNum,
    street_name: fullStreetName,
    street_name_normalized: normalizeStreetName(fullStreetName),
    ward: trimToNull(r.WARD_NUMBER || r.WARD),
    status: trimToNull(r.STATUSDESC),
    decision: trimToNull(r['C_OF_A_DESCISION']),
    decision_date: decisionDate,
    hearing_date: hearingDate,
    description: trimToNull(r.DESCRIPTION),
    applicant: trimToNull(r.CONTACT_NAME),
    sub_type: trimToNull(r.SUB_TYPE),
    zoning_designation: trimToNull(r.ZONING_DESIGNATION),
  };
  const hashInput = {};
  for (const c of MAPPED_COLUMNS) hashInput[c] = mapped[c];
  hashInput.decision_date = hashDate(decisionDate);
  hashInput.hearing_date = hashDate(hearingDate);
  if (mapped.applicant !== null && seam && typeof seam.tag === 'function') seam.tag('applicant_present');
  return {
    ...mapped,
    data_hash: computeHash(hashInput),
    first_seen_at: seam && seam.run_at ? seam.run_at : null,
  };
}

/**
 * Dedup by application_number; a later decision_date replaces the held record (legacy load-coa.js:537-545).
 * The union concatenates Active before Closed (descriptor order), so a tie keeps the Active record.
 */
function dedupeBySourceId(rows) {
  const byAppNum = new Map();
  for (const rec of rows) {
    const existing = byAppNum.get(rec.application_number);
    if (!existing || (rec.decision_date && (!existing.decision_date || rec.decision_date > existing.decision_date))) {
      byAppNum.set(rec.application_number, rec);
    }
  }
  const kept = [...byAppNum.values()];
  return { kept, duplicateCount: rows.length - kept.length };
}

/**
 * R-DY (a)(4) — the status-change ledger rows of one slice (legacy load-coa.js:351-377). `priorByKey` is the
 * runner's read of coa_applications(application_number, status) BEFORE the upsert, in the same transaction
 * (operator decision 2); a new key's prior is undefined, so its from_status is null.
 */
function deriveRows(table, sliceRows, priorByKey, seam) {
  if (table !== LEDGER_TABLE) throw new Error(`load-coa compute: deriveRows has no rows for "${table}"`);
  const rows = [];
  for (const b of sliceRows) {
    const prior = priorByKey.get(seam.keyOf(b));
    const prevStatus = prior ? prior.status : undefined;
    if (prevStatus === b.status) continue;
    const dateColumn = STATUS_TO_DATE_COLUMN_COA[(b.status ?? '').trim()];
    rows.push({
      lead_id: LEAD_PREFIX + b.application_number,
      from_status: prevStatus ?? null,
      to_status: b.status,
      decision: b.decision ?? null,
      decision_date: b.decision_date ?? null,
      transitioned_at: seam.run_at,
      detected_by: DETECTED_BY,
      event_date: dateColumn ? (b[dateColumn] ?? null) : null,
    });
  }
  return rows;
}

/** Class B guarded upsert with `retract: "none"`: there is no departure delete to run. */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Observers — each reports the VALUE a declared check bounds; the descriptor decides (R-BZ G7).
// ===========================================================================

const num = (v) => Number(v) || 0;
const INERT = { value: 0, detail: null, inert: true };
const WRITE_SKIP_PREFIX = 'write_skipped_';

/** The coa_applications primaries in declared order (both members of the one union group, R-DX (iii)). */
const declaredPrimaries = (ctx) => ctx.descriptor.inputs.reads.externals.filter((e) => typeof e.target === 'string');

/**
 * Spec 124 R-EW (operator y 2026-10-20) — the ONE reader of the runner's ctx, in the shape the dispatch for this
 * descriptor actually builds (COA-D13). The descriptor names `externals[].target`, so runWithPool dispatches the step
 * to `ingestPrimaries` (0x), which calls compute twice:
 *   - pre_write pass (`ctx.primary` set, `ctx.written` null): `ctx.acquired` is the group's own flat block —
 *     `rows_read`, `rows_shaped`, `duplicate_key_count`, `bad_key_count` summed over the members, and the
 *     members' own blocks under `acquired.members` (a union) or the block itself (one selected member);
 *   - final pass: `ctx.acquired.primaries[id]` per declared member (`aggregatePrimaries`) and
 *     `ctx.written.by_target.coa_applications` (the target's own counters: inserted, updated, touched (R-DZ),
 *     e1 (R-DY)). A union member's entry is the group's block with the member's OWN acquisition block spread
 *     over it (its `rows_parsed`, `feature_count`, `bad_key_count`, `record_fields`); the group-only counters
 *     (`rows_read`, `rows_shaped`, `duplicate_key_count`, `column_nulls`, `shaped_*`) ride on every member
 *     entry unchanged. An unselected member is `{selected:false, reason:"mode"}` (R-DX (iv)).
 * So: group counters from the first selected entry; the bad keys summed over the selected members; the
 * deduplicated row count as `rows_shaped - duplicate_key_count` (the runner's own kept.length, the same number in
 * both passes); the write counters from the target's own `by_target` entry, never the summed step-level block.
 * PURE.
 * @returns {{group: object, members: Object<string, object>, badKeys: number, written: object|null, writeSkipped: boolean}}
 */
function runView(ctx) {
  const a = ctx.acquired || {};
  const skippedFlag = (w) => !!w && Object.keys(w).some((k) => k.startsWith(WRITE_SKIP_PREFIX) && w[k] === true);
  if (!a.primaries || typeof a.primaries !== 'object') {
    const members = a.members && typeof a.members === 'object' ? a.members : { [ctx.primary || 'primary']: a };
    const w = ctx.written || null;
    return { group: a, members, badKeys: num(a.bad_key_count), written: w, writeSkipped: !w || skippedFlag(w) };
  }
  const primaries = declaredPrimaries(ctx);
  const selected = primaries
    .map((e) => [e.id, a.primaries[e.id]])
    .filter(([, p]) => p && typeof p === 'object' && p.selected !== false);
  const members = Object.fromEntries(selected);
  const group = selected.length > 0 ? selected[0][1] : {};
  const target = primaries.length > 0 ? primaries[0].target : null;
  const byTarget = ctx.written && ctx.written.by_target && typeof ctx.written.by_target === 'object' ? ctx.written.by_target : {};
  const w = target && byTarget[target] && typeof byTarget[target] === 'object' ? byTarget[target] : null;
  return {
    group,
    members,
    badKeys: selected.reduce((n, [, p]) => n + num(p.bad_key_count), 0),
    written: w,
    writeSkipped: !w || skippedFlag(w) || skippedFlag(ctx.written),
  };
}

/** True when the runner refused or skipped the write (its write_skipped_* flags), or reported no write at all. */
const writeSkipped = (ctx) => runView(ctx).writeSkipped;
/** The group's own acquired counters (R-EW). */
const acq = (ctx) => runView(ctx).group;
/** coa_applications' own write counters: written.by_target.coa_applications in the final pass (R-EW). */
const wr = (ctx) => runView(ctx).written || {};

/** Raw CKAN records fetched across the selected members (legacy allRaw.length). */
const fetched = (ctx) => num(acq(ctx).rows_read);
/** Records mapped to a coa_applications row, pre-dedup (legacy mapped.length). */
const mappedCount = (ctx) => num(acq(ctx).rows_shaped);
/** Rows left after the one dedupe (legacy deduped.length): the runner's kept.length, identical in both passes. */
const dedupedCount = (ctx) => Math.max(0, mappedCount(ctx) - num(acq(ctx).duplicate_key_count));
/** Skip reasons in the legacy vocabulary: a blank key is the runner's bad key. */
function skipReasons(ctx) {
  const v = runView(ctx);
  const out = { ...(v.group.shaped_skipped_by_reason || {}) };
  if (v.badKeys > 0) out.missing_app_num = (out.missing_app_num || 0) + v.badKeys;
  return out;
}

/** The CRITICAL fields absent from any selected member's header, plus records shaped as schema_mismatch. */
function schemaDrift(ctx) {
  const v = runView(ctx);
  const missing = new Set();
  for (const m of Object.values(v.members)) {
    if (m && Array.isArray(m.record_fields)) for (const f of missingCriticalFields(m.record_fields)) missing.add(f);
  }
  return { fields: CRITICAL_FIELDS.filter((f) => missing.has(f)), records: num((v.group.shaped_skipped_by_reason || {}).schema_mismatch) };
}

/** The derived lifecycle_status_history counters (R-DY (e): the target's written.e<i>). */
const ledger = (ctx) => wr(ctx).e1 || {};
/**
 * Ledger rows this run wrote — the ONE count behind both the lifecycle_status_history_inserted check row
 * and the lifecycle_status_history_written emit (R-ET: the derived target's #38 count_path, R-DN).
 */
const ledgerWritten = (ctx) => num(ledger(ctx).inserted) + num(ledger(ctx).updated);

function zero_records(ctx) {
  ctx.report('zero_records', { violations: fetched(ctx) === 0 ? 1 : 0, detail: `${fetched(ctx)} records fetched` });
}
function records_fetched(ctx) {
  ctx.report('records_fetched', { violations: 0, value: fetched(ctx) });
}
function records_mapped(ctx) {
  ctx.report('records_mapped', { violations: 0, value: mappedCount(ctx) });
}
function records_skipped(ctx) {
  ctx.report('records_skipped', { violations: 0, value: fetched(ctx) - mappedCount(ctx), detail: skipReasons(ctx) });
}
function skip_rate(ctx) {
  const f = fetched(ctx);
  ctx.report('skip_rate', { value: f > 0 ? ((f - mappedCount(ctx)) * 100) / f : 0 });
}
function records_inserted(ctx) {
  ctx.report('records_inserted', { violations: 0, value: num(wr(ctx).inserted) });
}
function records_updated(ctx) {
  ctx.report('records_updated', { violations: 0, value: num(wr(ctx).updated) });
}
/**
 * Spec 124 R-EX / R-DZ: the keys the runner's seen-column touch rewrote this run (written.touched) — the count the
 * POST rerun proof requires the second run's rewritten rows to equal exactly (declared_drift.liveness names this check).
 */
function records_touched(ctx) {
  ctx.report('records_touched', { violations: 0, value: num(wr(ctx).touched) });
}
function schema_mismatch_count(ctx) {
  const d = schemaDrift(ctx);
  // The legacy value is the distinct missing fields (:631); a record-level miss under a complete header still counts once.
  ctx.report('schema_mismatch_count', { violations: Math.max(d.fields.length, d.records > 0 ? 1 : 0), detail: d.fields });
}
function applicant_names_present(ctx) {
  ctx.report('applicant_names_present', { violations: num((acq(ctx).shaped_tags || {}).applicant_present) });
}
function zoning_designation_null(ctx) {
  const a = acq(ctx);
  const rows = dedupedCount(ctx);
  const nulls = num((a.column_nulls || {}).zoning_designation);
  ctx.report('zoning_designation_null', { violations: rows > 0 && nulls === rows ? 1 : 0, detail: nulls });
}
function lifecycle_status_history_inserted(ctx) {
  ctx.report('lifecycle_status_history_inserted', { violations: 0, value: ledgerWritten(ctx) });
}
function lifecycle_status_history_errors(ctx) {
  ctx.report('lifecycle_status_history_errors', { violations: num(ledger(ctx).errors) });
}

/**
 * COA-D6: the newest hearing ON/BEFORE the run date among the rows this run fed. R-DZ touches every fed
 * key's last_seen_at to the run clock inside the write transaction, so the run's own rows are exactly the
 * rows at MAX(last_seen_at); the run date is that clock's UTC calendar date (the legacy compared UTC-midnight
 * Dates). The date is returned as text, never as a driver Date (no process-TimeZone parse).
 */
const NEWEST_PAST_HEARING_SQL = `
    WITH run AS (SELECT MAX(last_seen_at) AS at FROM coa_applications)
    SELECT to_char(MAX(c.hearing_date), 'YYYY-MM-DD') AS newest_hearing
      FROM coa_applications c, run
     WHERE c.last_seen_at = run.at
       AND c.hearing_date <= (run.at AT TIME ZONE 'UTC')::date
  `;

/** Whole days from a 'YYYY-MM-DD' hearing (UTC midnight) to `nowMs`, rounded (legacy :587-589); null without one. */
function daysSince(isoHearing, nowMs) {
  if (!isoHearing) return null;
  const ms = Date.parse(`${isoHearing}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round((nowMs - ms) / MS_PER_DAY);
}

async function max_days_stale(ctx) {
  if (fetched(ctx) === 0 || writeSkipped(ctx)) {
    // No row was fed this run: zero_records / the pre_write FAIL already says why.
    ctx.report('max_days_stale', { ...INERT, detail: 'inert (no row fed this run)' });
    return;
  }
  const res = await ctx.pool.query(NEWEST_PAST_HEARING_SQL);
  const newest = (res.rows[0] || {}).newest_hearing || null;
  if (newest === null) {
    ctx.report('max_days_stale', { ...INERT, detail: 'inert (no hearing on or before the run date)' });
    return;
  }
  ctx.report('max_days_stale', { value: daysSince(newest, ctx.clock()), detail: newest });
}

const CHECKS = {
  zero_records,
  records_fetched,
  records_mapped,
  records_skipped,
  skip_rate,
  records_inserted,
  records_updated,
  records_touched,
  schema_mismatch_count,
  max_days_stale,
  applicant_names_present,
  zoning_designation_null,
  lifecycle_status_history_inserted,
  lifecycle_status_history_errors,
};

/** §5.5 (2) — run the SELECTED checks, then return the one `coa_load` payload (R-DE (iv)). */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    await check(ctx);
  }
  return {
    records_meta: {
      coa_load: {
        records_fetched: fetched(ctx),
        records_mapped: mappedCount(ctx),
        records_skipped: fetched(ctx) - mappedCount(ctx),
        skip_reasons: skipReasons(ctx),
        records_deduplicated: dedupedCount(ctx),
        schema_mismatch_count: schemaDrift(ctx).fields.length,
      },
      // R-ET: the derived target's own per-table write count — the int emit gate G #38 reads as
      // lifecycle_status_history's cohort.json count_path (R-DN), so its bracket never borrows the
      // step-level records_new/records_updated, which count coa_applications.
      lifecycle_status_history_written: ledgerWritten(ctx),
    },
  };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// Runner seams (§5.5 (1)).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.deriveRows = deriveRows;
module.exports.shouldSkipDelete = shouldSkipDelete;
// Pure domain functions (exported for the parity suite).
module.exports.isoDate = isoDate;
module.exports.hashDate = hashDate;
module.exports.computeHash = computeHash;
module.exports.daysSince = daysSince;
module.exports.missingCriticalFields = missingCriticalFields;
module.exports.NEWEST_PAST_HEARING_SQL = NEWEST_PAST_HEARING_SQL;
module.exports.CRITICAL_FIELDS = CRITICAL_FIELDS;
module.exports.STATUS_TO_DATE_COLUMN_COA = STATUS_TO_DATE_COLUMN_COA;
module.exports.DETECTED_BY = DETECTED_BY;
