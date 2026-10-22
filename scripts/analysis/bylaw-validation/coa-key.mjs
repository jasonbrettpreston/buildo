// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.305 (CoA tools live in scripts/analysis/bylaw-validation/coa-*; values only), m.115, m.118
// SPEC LINK: pending row (CHAT-63.C1) one answer key; pending row (CHAT-63.C2) values-only fixtures committed
//
// The CoA answer key (oracle C). ONE values-only row per variance item, in one shape, from every source:
//   - the 2017 decision allotment (coa_notice_variances, read-only export), and
//   - parser-shaped notices (coa-parse.cjs records), one batch per intake.
// A row holds figures, clause, decision, date, document type, batch and a lot reference (the file number). It NEVER holds
// purpose text, requirement or proposal wording, addresses or names (those can carry removed-name markers).
// Pure functions + file IO for the fixtures folder; the runner (oracle-c-run.mjs) and the tests import this.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const KEY_DIR_REL = 'scripts/seeds/bylaw/validation/coa-key';
export const KEY_FIELDS = Object.freeze(['file_number', 'item', 'clause', 'required_value', 'required_unit', 'proposed_value', 'proposed_unit',
  'decision', 'decision_date', 'doc_type', 'source_batch', 'lot_ref']);
// 2017 rows also carry the parse columns the table comparison reads (derived values; no text).
// stored as a positional array in this order (variance_key is derived: toronto_ca_decision_pdf|file|item)
export const TABLE_FIELDS = Object.freeze(['cited_bylaw', 'citation_kind', 'regulation_id_as_cited', 'exception_ref', 'zoning_as_stated',
  'target', 'target_status', 'bound', 'parse_status', 'parse_confidence', 'qualified', 'extractor_version', 'vocab_version']);
export const DECISIONS = Object.freeze(['approved', 'approved_with_conditions', 'refused', 'pending', 'unknown']);
export const DOC_TYPES = Object.freeze(['decision_notice', 'hearing_notice']);
// canonical units = the database vocabulary; the parser's spellings map onto it once, here
export const UNITS = Object.freeze(['m', 'm2', 'pct', 'ratio', 'storeys', 'units', 'spaces']);
const PARSER_UNIT = Object.freeze({ 'm²': 'm2', '%': 'pct', '× lot area': 'ratio', 'parking spaces': 'spaces' });
const unit = (u) => (u == null ? null : PARSER_UNIT[u] || u);
export const BATCH_2017 = 'coa-2017-decisions';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const num = (x) => (x == null || x === '' ? null : Number(x));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

/** A DB row of coa_notice_variances → a key row (2017 allotment). */
export function keyRowFromDb(r) {
  return {
    file_number: r.application_number, item: r.item_ordinal, clause: r.regulation_id_as_cited ?? null,
    required_value: num(r.required_value), required_unit: r.required_unit ?? null, proposed_value: num(r.proposed_value), proposed_unit: r.proposed_unit ?? null,
    decision: r.decision === 'approved_with_conditions' || r.decision === 'approved' || r.decision === 'refused' ? r.decision : 'unknown',
    decision_date: String(r.hearing_date).slice(0, 10), doc_type: 'decision_notice', source_batch: BATCH_2017, lot_ref: r.application_number,
    table: TABLE_FIELDS.map((k) => r[k] ?? null),
  };
}

function noticeDecision(n, v) {
  if (v.result === 'refused') return 'refused';
  const o = String(n.outcome || '');
  if (/^Approved on Condition/i.test(o)) return 'approved_with_conditions';
  if (/^Approved/i.test(o)) return 'approved';
  if (/^Refused/i.test(o)) return 'refused';
  if (/^Pending/i.test(o)) return 'pending';
  return 'unknown';
}

/** Parser-shaped notices (coa-parse.cjs) → key rows for one batch. */
export function keyRowsFromNotices(notices, batch) {
  const out = [];
  for (const n of notices) {
    for (const v of n.variances) {
      out.push({
        file_number: n.file_number, item: v.n, clause: v.clause ?? null,
        required_value: num(v.required && v.required.value), required_unit: unit(v.required && v.required.unit),
        proposed_value: num(v.proposed && v.proposed.value), proposed_unit: unit(v.proposed && v.proposed.unit),
        decision: noticeDecision(n, v), decision_date: n.hearing_date || null, doc_type: n.kind === 'hearing' ? 'hearing_notice' : 'decision_notice',
        source_batch: batch, lot_ref: n.file_number, table: null,
      });
    }
  }
  return out;
}

/** Violations of the closed shape (empty = valid). Refuses any extra field, text-like value, or unknown vocabulary. */
export function validateKeyRows(rows) {
  const v = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `row ${i} (${r && r.file_number}#${r && r.item})`;
    const extra = Object.keys(r).filter((k) => ![...KEY_FIELDS, 'table'].includes(k));
    if (extra.length) v.push(`${at}: field not in the key: ${extra.join(', ')}`);
    for (const k of KEY_FIELDS) if (!(k in r)) v.push(`${at}: missing ${k}`);
    if (!/^A\d{4}\/\d{2}[A-Z]{1,3}$/.test(String(r.file_number)) && !/^[A-Z]\d{3,5}\/\d{2}[A-Z]{1,3}$/.test(String(r.file_number))) v.push(`${at}: file_number shape`);
    if (!Number.isInteger(r.item) || r.item < 1) v.push(`${at}: item`);
    if (r.clause != null && !(/^(\d|Exception )[0-9A-Za-z.()#~@&, \-]{0,79}$/.test(r.clause) && (r.clause.replace(/Exception|Part/g, '').match(/[A-Za-z]{4,}/g) || []).length === 0)) v.push(`${at}: clause is not a bare clause reference`);
    for (const k of ['required_value', 'proposed_value']) if (r[k] != null && !Number.isFinite(r[k])) v.push(`${at}: ${k} not a number`);
    for (const k of ['required_unit', 'proposed_unit']) if (r[k] != null && !UNITS.includes(r[k])) v.push(`${at}: ${k} ${JSON.stringify(r[k])} not in the unit set`);
    if (r.required_value != null && r.required_unit == null) v.push(`${at}: required figure without a unit`);
    if (r.proposed_value != null && r.proposed_unit == null) v.push(`${at}: proposed figure without a unit`);
    if (!DECISIONS.includes(r.decision)) v.push(`${at}: decision`);
    if (r.decision_date != null && !isDate(r.decision_date)) v.push(`${at}: decision_date`);
    if (!DOC_TYPES.includes(r.doc_type)) v.push(`${at}: doc_type`);
    if (!/^[a-z0-9-]+$/.test(String(r.source_batch))) v.push(`${at}: source_batch`);
    if (r.lot_ref !== r.file_number) v.push(`${at}: lot_ref must be the file number`);
    if (r.table != null) {
      if (!Array.isArray(r.table) || r.table.length !== TABLE_FIELDS.length) v.push(`${at}: table must be ${TABLE_FIELDS.length} positional values`);
      else if (r.table.some((x) => typeof x === 'string' && x.length > 60)) v.push(`${at}: table value too long to be a code`);
    }
    const id = `${r.source_batch}|${r.file_number}|${r.item}`;
    if (seen.has(id)) v.push(`${at}: duplicate`);
    seen.add(id);
  });
  return v;
}

export const sortRows = (rows) => [...rows].sort((a, b) => cmp(a.source_batch, b.source_batch) || cmp(a.file_number, b.file_number) || a.item - b.item);
const lf = (s) => s.replace(/\r\n/g, '\n');
export const sha256 = (s) => crypto.createHash('sha256').update(lf(s)).digest('hex');
/** One row per line so a diff shows rows. */
export const serialize = (rows) => `[\n${sortRows(rows).map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;

/** Write one batch file and refresh the manifest ({batch: {rows, files, sha256}}). */
export function writeBatch(root, batch, rows) {
  const dir = path.join(root, KEY_DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  const bad = validateKeyRows(rows);
  if (bad.length) throw new Error(`coa-key: ${bad.length} violations, first: ${bad[0]}`);
  const text = serialize(rows);
  fs.writeFileSync(path.join(dir, `${batch}.json`), text);
  const mp = path.join(dir, 'manifest.json');
  const m = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, 'utf8')) : { schema: 'coa-key-manifest-v1', batches: {} };
  m.batches[batch] = { rows: rows.length, files: new Set(rows.map((r) => r.file_number)).size, sha256: sha256(text) };
  m.batches = Object.fromEntries(Object.keys(m.batches).sort(cmp).map((k) => [k, m.batches[k]]));
  fs.writeFileSync(mp, `${JSON.stringify(m, null, 1)}\n`);
  return m.batches[batch];
}

/** Read the key (every batch in the manifest, or the named ones). Returns {rows, manifest}. */
export function readKey(root, batches = null) {
  const dir = path.join(root, KEY_DIR_REL);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const ids = batches || Object.keys(manifest.batches);
  const rows = [];
  for (const b of ids) {
    if (!manifest.batches[b]) throw new Error(`coa-key: batch ${b} is not in the manifest`);
    rows.push(...JSON.parse(fs.readFileSync(path.join(dir, `${b}.json`), 'utf8')));
  }
  return { rows, manifest };
}

/** A key row of the 2017 allotment back to the shape oracle-c-run.mjs reads from the database (table comparison input). */
export function dbShapeFromKey(r) {
  const t = Object.fromEntries(TABLE_FIELDS.map((k, i) => [k, r.table[i]]));
  return {
    variance_key: `toronto_ca_decision_pdf|${r.file_number}|${r.item}`, application_number: r.file_number, item_ordinal: r.item, hearing_date: r.decision_date, decision: r.decision,
    cited_bylaw: t.cited_bylaw, citation_kind: t.citation_kind, regulation_id_as_cited: t.regulation_id_as_cited, exception_ref: t.exception_ref,
    zoning_as_stated: t.zoning_as_stated, target: t.target, target_status: t.target_status, bound: t.bound, required_value: r.required_value,
    required_unit: r.required_unit, parse_status: t.parse_status, parse_confidence: t.parse_confidence, qualified: t.qualified,
    extractor_version: t.extractor_version, vocab_version: t.vocab_version,
  };
}
