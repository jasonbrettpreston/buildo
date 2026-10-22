/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2b (values-only batch family), §3, §5
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md ingestor.3 (one library path per source form), core.9 (pure compute)
 *
 * The CoA VALUES-ONLY BATCH family (`aic_values_batch`) — a PURE CommonJS module (no fs, env, clock, network).
 *
 * The 2026 Application Information Centre notices (decision, hearing, zoning) cannot be fetched by the
 * pipeline (captcha; operator drops, CHAT-63.C6), so a lane extracts VALUES and commits them as a batch file
 * pinned by sha256 in `scripts/seeds/coa-notices/manifest-aic-values.json` (CHAT-71.2). This module owns:
 *   · the closed sets and `validateValuesManifest` / `validateBatch` (fail closed: an unknown key, a string
 *     outside a closed set or identifier pattern, or an out-of-range number is a problem sentence);
 *   · `mapNotice` — the OFFLINE builder's mapping of one coa-parse/1 notice to a batch notice (it sees the
 *     requirement sentence in memory to call `mapTarget`; the sentence is never returned);
 *   · `shapeBatch` — the step's mapping of a validated batch to `shapeDocument`-shaped results, so the one
 *     `reconcileNotices` dedupes both families (Spec 129 §5 Dedup).
 * Nothing here returns notice text, an owner/agent name or a drawing (Spec 129 §3).
 */
'use strict';

const P = require('./parse-values');
const VOCAB = require('./vocab.json');
const TARGET_MAP = require('./target-map.json');

const SOURCE_FAMILY = 'aic_values_batch';
const CITED_BYLAW_RE = /^[0-9][0-9-]*[A-Z]?$/;

/** Frozen closed sets of the batch family. */
const VALUES_CONTRACT = Object.freeze({
  source_family: SOURCE_FAMILY,
  manifest_schema: 'coa-values-manifest-1',
  batch_schema: 'coa-values-batch-1',
  batch_dir: 'scripts/seeds/coa-notices/aic-values/',
  batch_id_re: /^coa-\d{4}-[a-z]$/,
  application_re: /^A\d{3,5}\/\d{2}[A-Z]{2,4}$/,
  doc_types: Object.freeze(['decision_notice', 'hearing_notice']),
  decisions: Object.freeze(['approved', 'approved_with_conditions', 'refused', 'pending', 'unknown']),
  excluded_reasons: Object.freeze(['hearing_date_unread', 'in_pdf_allotment', 'operator_excluded']),
});

/** The coa-parse/1 unit labels that are not already vocab labels. */
const PARSER_UNIT = Object.freeze({ '²': 'm2', 'm²': 'm2', '%': 'pct', '× lot area': 'ratio', 'parking spaces': 'spaces' });

const NOTICE_KEYS = Object.freeze(['application_number', 'doc_type', 'hearing_date', 'zoning_as_stated', 'decision', 'items']);
const ITEM_KEYS = Object.freeze([
  'item_ordinal', 'cited_bylaw', 'citation_kind', 'regulation_id_as_cited', 'exception_ref', 'target', 'target_status',
  'bound', 'required_value', 'required_unit', 'proposed_value', 'proposed_unit', 'parse_status', 'parse_confidence',
  'qualified', 'decision',
]);
const BATCH_KEYS = Object.freeze(['schema', 'batch_id', 'parser_version', 'vocab_version', 'target_map_version', 'notices']);
const MANIFEST_KEYS = Object.freeze(['schema', 'source_family', 'batches', 'excluded']);
const BATCH_ENTRY_KEYS = Object.freeze(['batch_id', 'path', 'sha256', 'notices', 'items', 'captured_on']);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isIso = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const unknownKeys = (o, allowed, who) => Object.keys(o).filter((k) => !allowed.includes(k)).map((k) => `${who}: key "${k}" is not in the contract`);

/** The batch file's repo path for a batch id. */
function batchPathFor(batchId) {
  return `${VALUES_CONTRACT.batch_dir}${batchId}.json`;
}

/** Problems of a values manifest (empty = valid). Pure, fail closed. */
function validateValuesManifest(m) {
  const problems = [];
  if (!isObj(m)) return ['manifest is not an object'];
  problems.push(...unknownKeys(m, MANIFEST_KEYS, 'manifest'));
  if (m.schema !== VALUES_CONTRACT.manifest_schema) problems.push(`manifest.schema must be ${VALUES_CONTRACT.manifest_schema}`);
  if (m.source_family !== SOURCE_FAMILY) problems.push(`manifest.source_family must be ${SOURCE_FAMILY}`);
  if (!Array.isArray(m.batches) || m.batches.length === 0) {
    problems.push('manifest.batches must be a non-empty array');
  } else {
    const seen = new Set();
    m.batches.forEach((b, i) => {
      const who = `batches[${i}]`;
      if (!isObj(b)) { problems.push(`${who} is not an object`); return; }
      problems.push(...unknownKeys(b, BATCH_ENTRY_KEYS, who));
      if (typeof b.batch_id !== 'string' || !VALUES_CONTRACT.batch_id_re.test(b.batch_id)) problems.push(`${who}.batch_id must match ${VALUES_CONTRACT.batch_id_re}`);
      else if (seen.has(b.batch_id)) problems.push(`duplicate batch_id ${b.batch_id}`);
      else seen.add(b.batch_id);
      if (b.path !== batchPathFor(b.batch_id)) problems.push(`${who}.path must be ${batchPathFor(String(b.batch_id))}`);
      if (typeof b.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(b.sha256)) problems.push(`${who}.sha256 must be 64 lowercase hex`);
      for (const k of ['notices', 'items']) {
        if (!Number.isInteger(b[k]) || b[k] < 0) problems.push(`${who}.${k} must be a non-negative integer`);
      }
      if (!isIso(b.captured_on)) problems.push(`${who}.captured_on must be a real ISO date`);
    });
  }
  if (m.excluded !== undefined) {
    if (!Array.isArray(m.excluded)) problems.push('manifest.excluded must be an array');
    else {
      const seenEx = new Set();
      m.excluded.forEach((e, i) => {
        const who = `excluded[${i}]`;
        if (!isObj(e)) { problems.push(`${who} is not an object`); return; }
        problems.push(...unknownKeys(e, ['application_number', 'batch_id', 'reason'], who));
        if (typeof e.application_number !== 'string' || !VALUES_CONTRACT.application_re.test(e.application_number)) problems.push(`${who}.application_number is not a file number`);
        if (typeof e.batch_id !== 'string' || !VALUES_CONTRACT.batch_id_re.test(e.batch_id)) problems.push(`${who}.batch_id is not a batch id`);
        if (!VALUES_CONTRACT.excluded_reasons.includes(e.reason)) problems.push(`${who}.reason not in contract: ${JSON.stringify(e.reason)}`);
        const k = `${e.batch_id}|${e.application_number}`;
        if (seenEx.has(k)) problems.push(`duplicate excluded ${k}`);
        seenEx.add(k);
      });
    }
  }
  return problems;
}

const inSet = (v, set) => set.includes(v);
const nonNegNum = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

/** Problems of ONE batch notice (values-only contract). */
function validateNotice(n, who) {
  const problems = [];
  if (!isObj(n)) return [`${who} is not an object`];
  problems.push(...unknownKeys(n, NOTICE_KEYS, who));
  if (typeof n.application_number !== 'string' || !VALUES_CONTRACT.application_re.test(n.application_number)) problems.push(`${who}.application_number is not a file number`);
  if (!inSet(n.doc_type, VALUES_CONTRACT.doc_types)) problems.push(`${who}.doc_type not in contract`);
  if (!isIso(n.hearing_date)) problems.push(`${who}.hearing_date must be a real ISO date (a notice without one is excluded at build)`);
  if (!(n.zoning_as_stated === null || (typeof n.zoning_as_stated === 'string' && n.zoning_as_stated.length > 0 && n.zoning_as_stated.length <= VOCAB.segmentation.zone_label_max_chars && /^[A-Za-z0-9 ().,;&/%+*:[\]'-]+$/.test(n.zoning_as_stated)))) {
    problems.push(`${who}.zoning_as_stated must be null or a short label of label characters`);
  }
  if (!inSet(n.decision, VALUES_CONTRACT.decisions)) problems.push(`${who}.decision not in contract`);
  if (!Array.isArray(n.items) || n.items.length === 0) { problems.push(`${who}.items must be a non-empty array`); return problems; }
  const ords = new Set();
  n.items.forEach((it, j) => {
    const at = `${who}.items[${j}]`;
    if (!isObj(it)) { problems.push(`${at} is not an object`); return; }
    problems.push(...unknownKeys(it, ITEM_KEYS, at));
    if (!Number.isInteger(it.item_ordinal) || it.item_ordinal <= 0) problems.push(`${at}.item_ordinal must be a positive integer`);
    else if (ords.has(it.item_ordinal)) problems.push(`${at}.item_ordinal repeats`);
    else ords.add(it.item_ordinal);
    if (!(it.cited_bylaw === null || (typeof it.cited_bylaw === 'string' && CITED_BYLAW_RE.test(it.cited_bylaw)))) problems.push(`${at}.cited_bylaw not an identifier`);
    if (!inSet(it.citation_kind, VOCAB.check_backed.citation_kind)) problems.push(`${at}.citation_kind not in contract`);
    for (const k of ['regulation_id_as_cited', 'exception_ref']) {
      if (!(it[k] === null || (typeof it[k] === 'string' && it[k].length <= 80 && /^[0-9A-Za-z().\-/]+$/.test(it[k])))) problems.push(`${at}.${k} not a clause identifier`);
    }
    if (typeof it.target !== 'string' || !(it.target_status === 'mapped' ? /^[a-z0-9_]+$/.test(it.target) && it.target !== 'unmapped' && it.target !== 'ambiguous' : it.target === it.target_status)) problems.push(`${at}.target/target_status incoherent`);
    if (!inSet(it.target_status, VOCAB.check_backed.target_status)) problems.push(`${at}.target_status not in contract`);
    if (!(it.bound === null || inSet(it.bound, VOCAB.check_backed.bound))) problems.push(`${at}.bound not in contract`);
    for (const k of ['required_value', 'proposed_value']) if (!nonNegNum(it[k])) problems.push(`${at}.${k} must be a non-negative number or null`);
    for (const k of ['required_unit', 'proposed_unit']) if (!(it[k] === null || inSet(it[k], VOCAB.check_backed.unit))) problems.push(`${at}.${k} not in contract`);
    if (!inSet(it.parse_status, VOCAB.check_backed.parse_status)) problems.push(`${at}.parse_status not in contract`);
    if (it.parse_status === 'pair' && (it.required_value === null || it.proposed_value === null || it.required_unit === null || it.proposed_unit === null)) problems.push(`${at} is a pair without both values and units`);
    if (!inSet(it.parse_confidence, VOCAB.check_backed.parse_confidence)) problems.push(`${at}.parse_confidence not in contract`);
    if (typeof it.qualified !== 'boolean') problems.push(`${at}.qualified must be boolean`);
    if (!inSet(it.decision, VALUES_CONTRACT.decisions)) problems.push(`${at}.decision not in contract`);
  });
  return problems;
}

/** Problems of one batch file (empty = valid). */
function validateBatch(b) {
  if (!isObj(b)) return ['batch is not an object'];
  const problems = unknownKeys(b, BATCH_KEYS, 'batch');
  if (b.schema !== VALUES_CONTRACT.batch_schema) problems.push(`batch.schema must be ${VALUES_CONTRACT.batch_schema}`);
  if (typeof b.batch_id !== 'string' || !VALUES_CONTRACT.batch_id_re.test(b.batch_id)) problems.push('batch.batch_id is not a batch id');
  for (const k of ['parser_version', 'vocab_version', 'target_map_version']) {
    if (typeof b[k] !== 'string' || !/^[A-Za-z0-9._/-]{1,40}$/.test(b[k])) problems.push(`batch.${k} is not a version label`);
  }
  if (!Array.isArray(b.notices) || b.notices.length === 0) { problems.push('batch.notices must be a non-empty array'); return problems; }
  const seen = new Set();
  b.notices.forEach((n, i) => {
    problems.push(...validateNotice(n, `notices[${i}]`));
    if (isObj(n) && typeof n.application_number === 'string') {
      if (seen.has(n.application_number)) problems.push(`notices[${i}]: application_number repeats inside the batch`);
      seen.add(n.application_number);
    }
  });
  return problems;
}

// ===========================================================================
// Offline builder mapping (coa-parse/1 notice -> batch notice). Sees the requirement sentence in memory.
// ===========================================================================

const unitOf = (u) => (u == null ? null : (PARSER_UNIT[u] || P.relabelUnit(u)));
const numOf = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) || Number(x) < 0 ? null : Number(x));

/** Decision of one item: a refused item is refused; else the notice outcome (the ORACLE-C coa-key rule). */
function itemDecision(outcome, result) {
  if (result === 'refused') return 'refused';
  const o = String(outcome || '');
  if (/^Approved on Condition/i.test(o)) return 'approved_with_conditions';
  if (/^Approved/i.test(o)) return 'approved';
  if (/^Refused/i.test(o)) return 'refused';
  if (/^Pending/i.test(o)) return 'pending';
  return 'unknown';
}

function mapItem(v, outcome, entries, targetFamily) {
  const bylawTok = /^[0-9][0-9A-Z-]*/.exec(String(v.bylaw || ''));
  const clause = typeof v.clause === 'string' ? v.clause.trim() : '';
  const head = `${clause ? `Chapter ${clause}, ` : ''}By-law ${bylawTok ? bylawTok[0] : ''}`;
  const cit = P.parseCitation(head, null);
  const mapped = P.mapTarget(String(v.requirement || ''), entries);
  const rv = numOf(v.required && v.required.value);
  const ru = unitOf(v.required && v.required.unit);
  const pv = numOf(v.proposed && v.proposed.value);
  const pu = unitOf(v.proposed && v.proposed.unit);
  const qualified = P.isQualified(String(v.requirement || ''));
  let status;
  if (rv === null || ru === null) status = 'no_required_value';
  else if (pv === null || pu === null) status = 'no_proposed_value';
  else if (P.unitFamily(ru) !== P.unitFamily(pu)) status = 'unit_family_mismatch';
  else status = 'pair';
  if (status === 'pair' && mapped.target_status === 'mapped' && P.unitFamily(ru) !== targetFamily[mapped.target]) status = 'target_unit_mismatch';
  const families = new Set((Array.isArray(v.required_all) ? v.required_all : []).map((x) => P.unitFamily(unitOf(x.unit))));
  const high = status === 'pair' && cit.citation_kind === 'chapter_regulation' && !qualified && families.size <= 1 && (v.required_all || []).length <= 1;
  return {
    item_ordinal: v.n,
    cited_bylaw: cit.cited_bylaw && CITED_BYLAW_RE.test(cit.cited_bylaw) ? cit.cited_bylaw : null,
    citation_kind: cit.citation_kind,
    regulation_id_as_cited: cit.regulation_id_as_cited,
    exception_ref: cit.exception_ref,
    target: mapped.target,
    target_status: mapped.target_status,
    bound: v.limit === 'max' || v.limit === 'min' ? v.limit : null,
    required_value: rv,
    required_unit: rv === null ? null : ru,
    proposed_value: pv,
    proposed_unit: pv === null ? null : pu,
    parse_status: status,
    parse_confidence: status === 'pair' ? (high ? 'high' : 'medium') : 'low',
    qualified,
    decision: itemDecision(outcome, v.result),
  };
}

/**
 * One coa-parse/1 notice -> `{notice}` or `{excluded: reason}`. A notice with no readable hearing date
 * is excluded (the table keeps hearing_date NOT NULL; Spec 129 §D8 compares at the hearing date).
 */
function mapNotice(raw, opts) {
  const entries = (opts && opts.targetMap ? opts.targetMap : TARGET_MAP).entries;
  const targetFamily = Object.fromEntries(entries.map((e) => [e.target, P.unitFamily(e.unit)]));
  if (!raw || typeof raw.file_number !== 'string') throw new Error('COA_AIC_E_BAD_NOTICE');
  if (!isIso(raw.hearing_date)) return { excluded: 'hearing_date_unread' };
  const label = raw.zoning && typeof raw.zoning.label === 'string' ? raw.zoning.label.trim().slice(0, VOCAB.segmentation.zone_label_max_chars) : '';
  return {
    notice: {
      application_number: raw.file_number,
      doc_type: raw.kind === 'hearing' ? 'hearing_notice' : 'decision_notice',
      hearing_date: raw.hearing_date,
      zoning_as_stated: label === '' ? null : label,
      decision: itemDecision(raw.outcome, null),
      items: (raw.variances || []).map((v) => mapItem(v, raw.outcome, entries, targetFamily)),
    },
  };
}

// ===========================================================================
// Step-side shaping: batch -> shapeDocument-shaped result for the one reconcileNotices
// ===========================================================================

/**
 * A VALIDATED batch -> `{doc_status, notices, counts}` (the `shapeDocument` result shape). Pure; the batch
 * has no text, so there is nothing to scrub. `ordinal_fallback_notices` is 0 (ordinals are the printed ones).
 */
function shapeBatch(batch) {
  const notices = batch.notices.map((n) => ({
    application_number: n.application_number,
    page: null,
    notice_status: 'variance_section_parsed',
    zoning_as_stated: n.zoning_as_stated,
    decision: n.decision,
    decision_mailed_on: null,
    consent_items_skipped: 0,
    doc_type: n.doc_type,
    hearing_date: n.hearing_date,
    items: n.items.map((it) => ({ ...it, source_page: null, clause_count: it.regulation_id_as_cited ? 1 : 0, bylaw_rejected: false })),
  }));
  const counts = {
    notices_by_status: { variance_section_parsed: notices.length },
    blocks: notices.length,
    ordinal_fallback_notices: 0,
  };
  return { doc_status: 'parsed', notices, counts, target_map_version: batch.target_map_version };
}

module.exports = {
  SOURCE_FAMILY,
  VALUES_CONTRACT,
  batchPathFor,
  validateValuesManifest,
  validateBatch,
  itemDecision,
  mapNotice,
  shapeBatch,
};
