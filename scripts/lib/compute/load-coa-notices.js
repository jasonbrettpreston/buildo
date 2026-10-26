/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5, §D9, §D10, §5 (j) notes, :49 (refused wins per item)
 * SPEC LINK: decision log 2026-10-25-batch-g#CHAT-157.SPLIT-DECISION-ROUND; 2026-10-26-batch-j#CHAT-169.SPLIT-THREE-FAMILIES
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (compute shape)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, Rule 10
 *
 * Toronto Committee of Adjustment decision notices → `coa_notice_variances` — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ PII (Spec 129 §D3). `shapeDocument` is the ONLY place raw notice text exists, and only for the
 * duration of one call: the text arrives in memory from the acquisition seam, is segmented, and every
 * value this file returns is either a closed-set value, a number, a file/regulation identifier or the
 * notice's zone label. No text sentence, no owner/agent line (the header is never read), no name ever
 * leaves this file. Thrown errors carry a closed code + doc id + page, never text.
 *
 * Seams the runner calls by name (pure; no I/O, no clock, no env, no SQL):
 *   · shapeDocument(doc, cfg)        — one document's text → notices + their parsed items + counts
 *   · shapeValuesBatch(batch)        — one values-only AIC batch (Spec 129 §2b, no text) → the same shape
 *   · reconcileNotices(docs, {config}) — all documents → dedup per application → rows + stats
 *   · shapeRecord(record)            — a reconciled row → the write columns, or a drop reason
 *   · coerceKey / dedupeBySourceId / validatorCounterDelta / shouldSkipDelete
 * and one observer per declared check (`fn.name === check.id`), gathered in CHECKS in descriptor order.
 *
 * The pure value extractors live in `../coa-notices/parse-values.js` (and are fingerprinted with this
 * file); the closed sets in `../coa-notices/vocab.json`; the target phrases in
 * `../coa-notices/target-map.json`. This file never reads McBylaw's evaluator or provisions (T-IND).
 */
'use strict';

const P = require('../coa-notices/parse-values');
const VOCAB = require('../coa-notices/vocab.json');
const TARGET_MAP = require('../coa-notices/target-map.json');
const AIC = require('../coa-notices/aic-values');

/** Hand-bumped whenever an answer this file (or parse-values.js) produces changes (pairs with logic_version, gate #48). */
const EXTRACTOR_VERSION = 'coa-extractor-4';
const SOURCE_FAMILY = 'toronto_ca_decision_pdf';
const BATCH_FAMILY = AIC.SOURCE_FAMILY; // Spec 129 §2b: the values-only batch family (CHAT-71.2)
const CHAPTER_BYLAW = '569-2013';

const DOC_STATUSES = VOCAB.emits_only.doc_status;
const NOTICE_STATUSES = VOCAB.emits_only.notice_status;
const PARSE_STATUSES = VOCAB.check_backed.parse_status;
const TARGET_STATUSES = VOCAB.check_backed.target_status;
const CONFIDENCES = VOCAB.check_backed.parse_confidence;
const DROP_REASONS = ['duplicate_superseded', 'duplicate_same_date_conflict'];

/** The write columns `shapeRecord` returns — exactly the step-written columns of the descriptor (T-PII-2). */
const ROW_COLUMNS = Object.freeze([
  'variance_key', 'source_family', 'application_number', 'item_ordinal', 'hearing_date',
  'decision_mailed_on', 'decision', 'decision_source', 'cited_bylaw', 'citation_kind',
  'regulation_id_as_cited', 'exception_ref', 'zoning_as_stated', 'target', 'target_status', 'bound',
  'required_value', 'required_unit', 'proposed_value', 'proposed_unit', 'parse_status',
  'parse_confidence', 'qualified', 'source_sha256', 'source_page', 'extractor_version', 'vocab_version',
  'doc_type', 'source_batch',
]);

/** Spec 129 §2c: the derived plan-facts target and its write columns (exactly the descriptor's step-written columns). */
const PLAN_FACTS_TABLE = 'coa_plan_facts';
const PLAN_FACT_COLUMNS = Object.freeze([...AIC.PLAN_FACT_KEYS, 'source_batch', 'source_sha256']);

/**
 * The C12 target-aware plausibility ranges: which logic-variable pair bounds the REQUIRED value of a
 * mapped target. Names only — every number lives in logic_variables.json (Rule 3).
 */
const REQUIRED_RANGE_VARS = Object.freeze({
  side_setback_m: 'coa_notices_req_side_setback_m',
  side_setback_street_m: 'coa_notices_req_side_setback_m',
  front_setback_m: 'coa_notices_req_front_setback_m',
  rear_setback_m: 'coa_notices_req_rear_setback_m',
  height_m: 'coa_notices_req_height_m',
  main_wall_height_m: 'coa_notices_req_main_wall_height_m',
  building_length_m: 'coa_notices_req_building_length_depth_m',
  building_depth_m: 'coa_notices_req_building_length_depth_m',
  required_lot_frontage_m: 'coa_notices_req_lot_frontage_m',
  lot_coverage_pct: 'coa_notices_req_lot_coverage_pct',
  required_lot_area_m2: 'coa_notices_req_lot_area_m2',
  fsi: 'coa_notices_req_fsi',
});

/** canonical dsl unit → unit family (the McBylaw units carried on target-map entries). */
const DSL_UNIT_FAMILY = Object.freeze({ m: 'length', m2: 'area', pct: 'pct', ratio: 'ratio', storeys: 'storeys', units: 'count' });
const TARGET_FAMILY = Object.freeze(Object.fromEntries(TARGET_MAP.entries.map((e) => [e.target, DSL_UNIT_FAMILY[e.unit] || null])));

// ===========================================================================
// Text segmentation (raw text in memory only)
// ===========================================================================

const NOTICE_START_RE = /NOTICE OF DECISION/;
const MINOR_VARIANCE_RE = /MINOR VARIANCE/i;
const FILE_RE = /File Number:\s*(A\d{3,4}\/\d{2}[A-Z]{2,4})\b/;
const CONSENT_FILE_RE = /\bB\d{3,4}\/\d{2}[A-Z]{2,4}\b/;
const ZONE_RE = /File Number:\s*\S+\s+Zoning:?\s+(.+)$/;
const SECTION_START_RE = /REQUESTED VARIANCE\(S\)/i;
const SECTION_END_RE = /Committee of Adjustment considered|IT WAS THE DECISION|SIGNATURE PAGE|The Committee has considered|The Committee of Adjustment has considered/i;
const DECISION_START_RE = /IT WAS THE DECISION OF THE COMMITTEE|DECISION OF THE COMMITTEE OF ADJUSTMENT|The Committee of Adjustment (?:has )?(?:refused|approved)/i;
const MAILED_RE = /DATE DECISION MAILED ON:?\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+)?([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/i;
/** Page furniture: removed ONLY within a page's first/last lines (T-PARSE-f) — a wrapped `10` mid-page survives. */
const NOISE_RE = /^\s*(Decision Notice - \w+\.doc.*|Page \d+( of \d+)?|A\d{4}\/\d\d[A-Z]+\s+\d+|\d+)\s*$/;
const GROUP_RE = /^\s*(?:Former )?(?:City of Toronto |North York |Etobicoke |Scarborough |York |East York )?(?:Zoning )?By-?law(?: No\.?)?\s*([0-9][0-9A-Z-]*)\s*:?\s*$/i;
const NUMBERED_RE = /^\s*(\d{1,2})\.\s+(.*)$/;
const UNNUMBERED_CITED_RE = /^\s*((?:Chapter|Section|Regulation)s?\s+\d.*By-?law.*)$/i;
const CITED_HEAD_RE = /^(Chapter|Section|Regulation|Clause|Exception|By-law)/i;
const DANGLING_BYLAW_RE = /By-?law(?:\s+No\.?)?\s*$/i;
const BYLAW_TOKEN_LINE_RE = /^\s*(\d[\d-]*[A-Z]?)\b\s*,?\s*(.*)$/;
const CITED_BYLAW_CHECK_RE = /^[0-9][0-9-]*[A-Z]?$/;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** Structural layout constants (page-edge lines, head window, decision window, zone-label cap): vocab.json, versioned. */
const SEG = VOCAB.segmentation;
for (const k of ['edge_lines', 'head_window_chars', 'decision_window_lines', 'zone_label_max_chars']) {
  if (!Number.isInteger(SEG && SEG[k]) || SEG[k] < 0) throw new Error(`COA_PARSE_E_VOCAB_SEGMENTATION ${k}`);
}

/** Sanitised, text-free error (D3.3): a closed code + doc id + page. */
function parseError(code, docId, page) {
  const e = new Error(`COA_PARSE_E_${code} doc=${String(docId)} page=${page == null ? '-' : String(page)}`);
  e.code = code;
  return e;
}

/** Pages → `[{text, page}]`, page furniture removed at page boundaries only. */
function pageLines(textPages) {
  const out = [];
  textPages.forEach((pageText, i) => {
    const lines = String(pageText).replace(/\r/g, '').split('\n');
    lines.forEach((text, j) => {
      const atEdge = j < SEG.edge_lines || j >= lines.length - SEG.edge_lines;
      if (atEdge && NOISE_RE.test(text)) return;
      out.push({ text, page: i + 1 });
    });
  });
  return out;
}

/** Days in month `m` (1-12) of year `y`, leap-aware. Pure arithmetic, no clock. */
function daysInMonth(y, m) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/**
 * "Month D, YYYY" → ISO date, or null when the date does not exist (February 30, day 45, a 3-digit
 * year). A non-date must never reach the DATE column: one bad mailed-on line would roll back the
 * whole step-scoped write. A null here is counted as unmeasured lag instead.
 */
function isoFromMonthDay(month, day, year) {
  const m = MONTHS.indexOf(String(month).toLowerCase()) + 1;
  if (m === 0) return null;
  const d = Number(day);
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1000 || y > 9999 || !Number.isInteger(d) || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days from 0000-03-01 (proleptic Gregorian) — date arithmetic without a clock. */
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  const a = mo <= 2 ? 1 : 0;
  y -= a;
  const mm = mo + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
}

/**
 * T-PARSE-j: the decision is read from the decision paragraph ONLY — the anchor line, then each following
 * line in turn (at most `decision_window_lines`), and the FIRST line that names a decision decides. The
 * conditions text that follows ("…if the conditions are not met the approval is refused") is never read HERE. The
 * per-item split of a decision that refuses some items and approves others reads further (splitDecision; CHAT-172, CHAT-183).
 */
function classifyDecision(lines, from) {
  for (let i = from; i < Math.min(lines.length, from + 1 + SEG.decision_window_lines); i++) {
    const text = lines[i].text.toLowerCase();
    for (const decision of ['refused', 'approved_with_conditions', 'approved']) {
      if (VOCAB.decision_lexicon[decision].some((p) => text.includes(p))) return decision;
    }
  }
  return 'unknown';
}

// ===========================================================================
// Split decisions (CHAT-157 / CHAT-169): a decision that refuses some variance items and approves others is read
// per item. Spec 129 :49 refused wins per item; Spec 129 §5 (j) notes (CHAT-172, CHAT-183) state what the split reads.
// ===========================================================================

/**
 * The pre-registered split rule, transcribed literally (L-PARSE PLAN.v4 §1.1; prereg-coa-2017-split.json). These
 * patterns are grammar, not tunables (Spec 132 core.8). The `g` patterns are only ever used through matchAll.
 */
const SPLIT_RX = Object.freeze({
  PARA_END: /signature\s+page|date\s+decision\s+mailed|last\s+date\s+of\s+appeal/i,
  REASONS: /\b[Tt]he\s+reasons?\s+for\s+the\s+decision|\bREASONS?\b/,
  F3_APPROVE: /(?:to|and)\s+approve\s+the\s+following\s+variance/i,
  F3_REFUSE: /to\s+refuse\s+the\s+following\s+variance/i,
  F3_HEADER: /((?:to|and)\s+(?:approve|refuse)\s+the\s+following\s+variance\(?s?\)?:?)/i,
  F3_SEG_END: /for\s+the\s+following\s+reasons|it\s+is\s+the\s+decision/i,
  F3_ITEM: /(?:^|\s)(\d{1,2})\.\s+(?=chapter|section|regulation|by-law|clause|exception)/gi,
  F2_ANY: /minor\s+variance\s+(?:items?|numbers?)(?:\s+no\.?)?[^.:;]*?\b(?:is|are)\s+(approved|refused)\b/gi,
  F2_LIST: /minor\s+variance\s+(?:items?|numbers?)(?:\s+no\.?)?\s+((?:\d|[ ,&-]|\band\b|\bthrough\b)+?)\s*(?:is|are)\s+(approved\s+on\s+condition|approved|refused)\b/gi,
  F1_DETECT: /variance\s+requests?\b[^;]*?\b(?:be|are|is)\s+refused/i,
  VERB_R: /\b(?:be|are|is)\s+refused\b/i,
  VERB_A: /\b(?:be|are|is)\s+approved\b/i,
  F1_CLAUSE_END: /;\s*and\s+2\.|\(B\)/i,
  F1_SCAN: /variance\s+requests?\s+((?:\d{1,2}(?:\s*(?:,|&|and)\s*)?)+)|(?:^|[\s:;])(\d{1,2})\.\s+(?=chapter|section)|by\s*-?\s*law(?:\s+no\.?)?\s+(\d[\d\s-]*\d[A-Z]?|\d)/gi,
  BYLAW_ID: /by\s*-?\s*law(?:\s+no\.?)?\s+(\d[\d\s-]*\d[A-Z]?|\d)/i,
  APPROVAL_STOP: /[:.]/,
  LIST_SPLIT: /\s*(?:,|&|\band\b)\s*/i,
  LIST_TOKEN: /^(\d{1,2})(?:-(\d{1,2}))?$/,
});
const APPROVALS = new Set(['approved', 'approved_with_conditions']);
const all = (re, s) => [...String(s).matchAll(re)];
const normId = (s) => s.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');

/** The decision lexicon in vocab order (refused first), as classifyDecision applies it to one line. */
function lexiconClass(text) {
  const t = text.toLowerCase();
  for (const decision of ['refused', 'approved_with_conditions', 'approved']) {
    if (VOCAB.decision_lexicon[decision].some((p) => t.includes(p))) return decision;
  }
  return 'unknown';
}

/** A printed list ("1, 2 & 4", "1 through 6", "1-5 & 7-10") → its numbers, or null when any token does not parse. */
function splitList(s) {
  const t = s.replace(/\bthrough\b/gi, '-').replace(/\s*-\s*/g, '-').trim().replace(/[\s,&]+$/, '').replace(/\s+and$/i, '');
  const out = [];
  for (const tok of t.split(SPLIT_RX.LIST_SPLIT)) {
    const m = SPLIT_RX.LIST_TOKEN.exec(tok.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b < a) return null;
    for (let k = a; k <= b; k++) out.push(k);
  }
  return out.length ? out : null;
}

/** The operative text: the decision paragraph from the anchor to the first paragraph-end line, cut at the reasons. */
function operativeText(block, at) {
  const rest = block.slice(at);
  const end = rest.findIndex((l, i) => i > 0 && SPLIT_RX.PARA_END.test(l.text));
  const para = (end > 0 ? rest.slice(0, end) : rest).map((l) => l.text).join(' ').replace(/\s+/g, ' ');
  const reasons = SPLIT_RX.REASONS.exec(para);
  return reasons ? para.slice(0, reasons.index) : para;
}

/** A raw item (after the consent skip) → what the split resolves against: ordinal, printed ordinal, by-law id. */
function splitRef(it) {
  const m = SPLIT_RX.BYLAW_ID.exec(it.head || '');
  const id = m ? m[1] : it.group || null;
  return { ord: it.item_ordinal, printed: it.ordinal_printed, bylaw: id ? normId(id) : null };
}

/** A split throw's code: closed (`SPLIT_<CODE>` only for an all-caps code), else SPLIT_THROW. Never text. */
function splitCode(err) {
  return err && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? `SPLIT_${err.code}` : 'SPLIT_THROW';
}

/**
 * The split of one notice. `op` = the operative text (memory only), `raw` = splitRef rows, `noticeDecision` = the
 * notice decision. Returns null when no family matches (not a split), else `{family, refs_unresolved, unknown,
 * decisions}`: `unknown` is a closed reason when the notice fails closed (every item unknown), and `decisions` maps
 * ordinal → decision otherwise. The returned object holds no text.
 */
function splitDecision(op, raw, noticeDecision) {
  const st = { refs: 0, unresolved: 0 };
  const resolve = (pred) => {
    st.refs++;
    const hits = raw.filter(pred);
    if (hits.length !== 1) { st.unresolved++; return null; }
    return hits[0].ord;
  };
  const out = (family, unknown) => ({ family, refs_unresolved: st.unresolved, unknown, decisions: null });
  const refused = new Set();
  let family = null;
  const any = all(SPLIT_RX.F2_ANY, op);
  if (SPLIT_RX.F3_APPROVE.test(op) && SPLIT_RX.F3_REFUSE.test(op)) family = 'F3';
  else if (any.some((x) => /refused/i.test(x[1])) && any.some((x) => /approved/i.test(x[1]))) family = 'F2';
  else if (SPLIT_RX.F1_DETECT.test(op) && SPLIT_RX.VERB_A.test(op)) family = 'F1';
  if (family === null) return null;
  let approvalClass = null;
  if (family !== 'F1') {
    const iR = family === 'F3' ? op.search(SPLIT_RX.F3_REFUSE) : any.find((x) => /refused/i.test(x[1])).index;
    const iA = family === 'F3' ? op.search(SPLIT_RX.F3_APPROVE) : any.find((x) => /approved/i.test(x[1])).index;
    if (iR < iA) return out(family, 'd_order');
    if (!APPROVALS.has(noticeDecision)) return out(family, 'd_notice_class');
  }
  if (family === 'F2') {
    const refusedAny = any.filter((x) => /refused/i.test(x[1])).length;
    const lists = all(SPLIT_RX.F2_LIST, op).filter((x) => /refused/i.test(x[2]));
    if (lists.length !== refusedAny) return out(family, 'b_list');
    for (const x of lists) {
      const ns = splitList(x[1]);
      if (!ns) return out(family, 'b_list');
      for (const n of ns) { const o = resolve((r) => r.printed === n); if (o !== null) refused.add(o); }
    }
  } else if (family === 'F3') {
    const parts = op.split(SPLIT_RX.F3_HEADER);
    for (let k = 1; k < parts.length; k += 2) {
      if (!/refuse/i.test(parts[k])) continue;
      const body = parts[k + 1].split(SPLIT_RX.F3_SEG_END)[0];
      for (const m of all(SPLIT_RX.F3_ITEM, body)) { const o = resolve((r) => r.printed === Number(m[1])); if (o !== null) refused.add(o); }
    }
  } else {
    const v = SPLIT_RX.VERB_R.exec(op);
    const before = op.slice(0, v.index);
    const after = op.slice(v.index);
    const e = SPLIT_RX.F1_CLAUSE_END.exec(after);
    const tailEnd = e ? e.index : after.length;
    const scan = (seg) => {
      const refs = [];
      let pending = [];
      let bad = null;
      for (const m of all(SPLIT_RX.F1_SCAN, seg)) {
        if (m[1]) {
          const ns = splitList(m[1]);
          if (!ns) bad = bad || 'b_list';
          else pending.push(...ns);
        } else if (m[2]) {
          pending.push(Number(m[2]));
        } else if (m[3]) {
          if (!pending.length) bad = bad || 'b_bylaw_pending';
          const id = normId(m[3]);
          for (const n of pending) refs.push({ n, id });
          pending = [];
        }
      }
      if (pending.length) bad = bad || 'b_leftover';
      return { refs, bad };
    };
    let t = scan(before);
    if (!t.refs.length && !t.bad) t = scan(after.slice(0, tailEnd));
    if (t.bad) return out(family, t.bad);
    for (const r of t.refs) { const o = resolve((x) => x.printed === r.n && x.bylaw === r.id); if (o !== null) refused.add(o); }
    const appr = after.slice(tailEnd);
    const va = SPLIT_RX.VERB_A.exec(appr);
    if (!va) return out(family, 'e_no_approval');
    const rest = appr.slice(va.index);
    const stop = SPLIT_RX.APPROVAL_STOP.exec(rest);
    const sentence = appr.slice(0, va.index) + (stop ? rest.slice(0, stop.index) : rest);
    approvalClass = lexiconClass(sentence.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' '));
    if (!APPROVALS.has(approvalClass)) return out(family, 'e_approval_class');
  }
  if (st.unresolved > 0) return out(family, 'a_unresolved');
  if (refused.size === 0) return out(family, 'c_zero_refs');
  const decisions = new Map(raw.map((r) => [r.ord, refused.has(r.ord) ? 'refused' : (family === 'F1' ? approvalClass : noticeDecision)]));
  return { family, refs_unresolved: st.unresolved, unknown: null, decisions };
}

/** The variance section's lines → items `{ordinal_printed, position, head, body, group, page}`. */
function segmentItems(section) {
  const numbered = section.some((l) => NUMBERED_RE.test(l.text));
  const items = [];
  let cur = null;
  let group = null;
  let position = 0;
  for (let i = 0; i < section.length; i++) {
    const l = section[i];
    const g = GROUP_RE.exec(l.text);
    if (g) { group = g[1]; continue; }
    const h = NUMBERED_RE.exec(l.text) || (!numbered && UNNUMBERED_CITED_RE.exec(l.text));
    if (h) {
      if (cur) items.push(cur);
      position++;
      const printed = numbered ? Number(h[1]) : null;
      const rest = (numbered ? h[2] : h[1]).trim();
      const cited = CITED_HEAD_RE.test(rest) && /By-?law/i.test(rest);
      cur = cited
        ? { ordinal_printed: printed, position, head: rest, body: '', group, page: l.page }
        : { ordinal_printed: printed, position, head: group ? `By-law ${group}` : '', body: rest, group, page: l.page };
      // T-PARSE-g: a head that ends "By-law No." takes its token from the next line.
      if (cited && DANGLING_BYLAW_RE.test(rest) && i + 1 < section.length) {
        const t = BYLAW_TOKEN_LINE_RE.exec(section[i + 1].text);
        if (t) { cur.head = `${rest} ${t[1]}`; cur.body = t[2].trim(); i++; }
      }
    } else if (cur) {
      cur.body = `${cur.body} ${l.text.trim()}`.trim();
    }
  }
  if (cur) items.push(cur);
  return items;
}

/** Printed ordinals when they are unique and positive across the section; else positions (counted). */
function assignOrdinals(items) {
  const printed = items.map((it) => it.ordinal_printed);
  const usable = printed.every((n) => Number.isInteger(n) && n > 0) && new Set(printed).size === printed.length;
  items.forEach((it) => { it.item_ordinal = usable ? it.ordinal_printed : it.position; });
  return !usable && items.length > 0;
}

/** One item's parsed values (no text) — every field a closed-set value, a number, or an identifier. */
function parseItem(it) {
  const split = P.splitPair(it.body);
  const mapped = P.mapTarget(split.required || it.body, TARGET_MAP.entries);
  const r = P.classifyItem({
    head: it.head,
    body: it.body,
    groupBylaw: it.group,
    targetFamily: mapped.target ? TARGET_FAMILY[mapped.target] : null,
  });
  let citedBylaw = r.cited_bylaw;
  let bylawRejected = false;
  if (citedBylaw !== null && !CITED_BYLAW_CHECK_RE.test(citedBylaw)) { citedBylaw = null; bylawRejected = true; }
  // Operator ruling 2026-10-09 (Spec 129 §5, Path 2/A): a pair whose parsed unit family differs from
  // its keyword-mapped target's family is NOT claimed as a pair. Its values/units stay as parsed and
  // its target/target_status stay recorded, but the status becomes 'target_unit_mismatch' so the WARN
  // check keeps it visible on every run. C13 stays the FAIL backstop for the pairs that remain.
  let parseStatus = r.parse_status;
  if (parseStatus === 'pair' && mapped.target_status === 'mapped' && P.unitFamily(r.required_unit) !== TARGET_FAMILY[mapped.target]) {
    parseStatus = 'target_unit_mismatch';
  }
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
  return {
    item_ordinal: it.item_ordinal,
    source_page: it.page,
    cited_bylaw: citedBylaw,
    citation_kind: r.citation_kind,
    regulation_id_as_cited: r.regulation_id_as_cited,
    exception_ref: r.exception_ref,
    target: mapped.target,
    target_status: mapped.target_status,
    bound: r.bound,
    required_value: num(r.required_value),
    required_unit: r.required_unit,
    proposed_value: num(r.proposed_value),
    proposed_unit: r.proposed_unit,
    parse_status: parseStatus,
    parse_confidence: r.parse_confidence,
    qualified: r.qualified === true,
    clause_count: r.clause_count,
    bylaw_rejected: bylawRejected,
  };
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/**
 * ONE document's text → its notices. `doc = {doc_id, sha256, hearing_date, kind, revision, session,
 * text_pages: string[]}`. Returns `{doc_status, notices, counts}`; `notices[]` carry parsed items only
 * (no text). Pure: no I/O, clock, env or config read (`cfg` is accepted for the seam's shape).
 */
function shapeDocument(doc, cfg) { // `cfg`: the seam signature (doc, cfg) — unread today
  if (!doc || typeof doc !== 'object') throw parseError('BAD_DOC', null, null);
  if (!Array.isArray(doc.text_pages) || doc.text_pages.some((p) => typeof p !== 'string')) {
    throw parseError('BAD_TEXT_PAGES', doc.doc_id, null);
  }
  const lines = pageLines(doc.text_pages);
  const starts = [];
  lines.forEach((l, i) => { if (NOTICE_START_RE.test(l.text)) starts.push(i); });
  const counts = { notices_by_status: emptyCounts(NOTICE_STATUSES), blocks: starts.length, ordinal_fallback_notices: 0 };
  if (starts.length === 0) return { doc_status: 'no_notices_found', notices: [], counts };

  const notices = [];
  const seenWithSection = new Set();
  for (let b = 0; b < starts.length; b++) {
    const block = lines.slice(starts[b], b + 1 < starts.length ? starts[b + 1] : lines.length);
    const blockText = block.map((l) => l.text).join('\n');
    const fileLine = block.find((l) => FILE_RE.test(l.text));
    const appNo = fileLine ? FILE_RE.exec(fileLine.text)[1] : null;
    const base = { application_number: appNo, page: block[0].page };
    if (!MINOR_VARIANCE_RE.test(blockText.slice(0, SEG.head_window_chars))) {
      notices.push({ ...base, notice_status: 'not_minor_variance', items: [] });
      counts.notices_by_status.not_minor_variance++;
      continue;
    }
    if (appNo === null) {
      // A minor-variance notice whose File Number the parser cannot read is counted in C4's
      // denominator AND numerator (no_variance_section), never hidden as "not a minor variance".
      notices.push({ ...base, notice_status: 'no_variance_section', items: [] });
      counts.notices_by_status.no_variance_section++;
      counts.unreadable_file_number = (counts.unreadable_file_number || 0) + 1;
      continue;
    }
    const zm = ZONE_RE.exec(fileLine.text);
    const zoning = zm ? zm[1].trim().slice(0, SEG.zone_label_max_chars) || null : null;
    const mailedM = MAILED_RE.exec(block.map((l) => l.text).join(' '));
    const decisionAt = block.findIndex((l) => DECISION_START_RE.test(l.text));
    const sStart = block.findIndex((l) => SECTION_START_RE.test(l.text));
    if (sStart < 0) {
      const status = seenWithSection.has(appNo) ? 'signature_page_duplicate' : 'no_variance_section';
      notices.push({ ...base, notice_status: status, items: [] });
      counts.notices_by_status[status]++;
      continue;
    }
    let section = block.slice(sStart + 1);
    const sEnd = section.findIndex((l) => SECTION_END_RE.test(l.text));
    if (sEnd >= 0) section = section.slice(0, sEnd);
    const raw = segmentItems(section);
    if (assignOrdinals(raw)) counts.ordinal_fallback_notices++;
    const items = [];
    const rawKept = [];
    let consentSkipped = 0;
    for (const it of raw) {
      if (CONSENT_FILE_RE.test(`${it.head} ${it.body}`)) { consentSkipped++; continue; }
      rawKept.push(it);
      try {
        items.push(parseItem(it));
      } catch (err) {
        // D3.3: a library throw must never carry item text out of this file.
        throw parseError(`ITEM_${err && err.code ? err.code : 'THROW'}`, doc.doc_id, it.page);
      }
    }
    // CHAT-157 / CHAT-169: every item takes the notice decision; a split decision then decides per item (Spec 129 :49).
    const noticeDecision = decisionAt >= 0 ? classifyDecision(block, decisionAt) : 'unknown';
    for (const item of items) item.decision = noticeDecision;
    let split = null;
    if (decisionAt >= 0) {
      const refs = rawKept.map(splitRef);
      try {
        split = splitDecision(operativeText(block, decisionAt), refs, noticeDecision);
      } catch (err) {
        // D3.3: the split reads notice text; nothing of it may leave in an error.
        throw parseError(splitCode(err), doc.doc_id, block[0].page);
      }
      if (split) items.forEach((item, k) => { item.decision = split.unknown !== null ? 'unknown' : split.decisions.get(refs[k].ord); });
    }
    seenWithSection.add(appNo);
    notices.push({
      ...base,
      notice_status: 'variance_section_parsed',
      zoning_as_stated: zoning,
      decision: noticeDecision,
      split: split ? { refs_unresolved: split.refs_unresolved, unknown: split.unknown !== null } : null,
      decision_mailed_on: mailedM ? isoFromMonthDay(mailedM[1], mailedM[2], mailedM[3]) : null,
      consent_items_skipped: consentSkipped,
      items,
    });
    counts.notices_by_status.variance_section_parsed++;
  }
  return { doc_status: 'parsed', notices, counts };
}

/**
 * ONE values batch (parsed JSON, already sha-verified by the arm) → the same `{doc_status, notices, counts}`
 * as `shapeDocument`. An invalid batch is `extract_error` (C2 FAILs before any write). Pure; the batch holds
 * no text (Spec 129 §2b, `validateBatch` is the values-only gate).
 */
function shapeValuesBatch(batch) {
  const problems = AIC.validateBatch(batch);
  if (problems.length > 0) {
    return { doc_status: 'extract_error', notices: [], counts: { notices_by_status: emptyCounts(NOTICE_STATUSES), blocks: 0, ordinal_fallback_notices: 0 }, problems: problems.length };
  }
  return AIC.shapeBatch(batch);
}

// ===========================================================================
// Reconciliation (all documents) → rows + stats
// ===========================================================================

function itemSignature(n) {
  return JSON.stringify([n.decision, n.items.map((i) => [i.item_ordinal, i.parse_status, i.cited_bylaw, i.regulation_id_as_cited, i.required_value, i.required_unit, i.proposed_value, i.proposed_unit, i.decision])]);
}

/** A PDF notice is always a decision notice; a batch notice carries its own doc_type. */
function docTypeOf(e) {
  return e.notice.doc_type || 'decision_notice';
}
const stageRank = (e) => (docTypeOf(e) === 'decision_notice' ? 1 : 0);
/** The hearing date of a notice: the batch notice's own, else the PDF document's (title-derived). */
const hearingOf = (e) => e.notice.hearing_date || e.doc.hearing_date;

/** Total order for a deterministic winner: revised > original, later hearing, then sha asc, page asc. */
function preferNotice(a, b) {
  // Spec 129 §2b: a decision notice supersedes a hearing notice of the same file (stage first).
  if (stageRank(a) !== stageRank(b)) return stageRank(b) - stageRank(a);
  const rev = (x) => (x.doc.revision === 'revised' ? 1 : 0);
  if (rev(a) !== rev(b)) return rev(b) - rev(a);
  if (hearingOf(a) !== hearingOf(b)) return hearingOf(a) < hearingOf(b) ? 1 : -1;
  if (a.doc.sha256 !== b.doc.sha256) return a.doc.sha256 < b.doc.sha256 ? -1 : 1;
  return a.notice.page - b.notice.page;
}

/**
 * Per application number (Spec 129 §D5 Dedup): keep the block with a variance section; identical item
 * lists are the same notice; a revised document beats the original; otherwise the latest hearing date;
 * differing lists on the same date with neither revised → `duplicate_same_date_conflict`, all dropped.
 */
function dedupNotices(entries) {
  const byApp = new Map();
  for (const e of entries) {
    if (!byApp.has(e.notice.application_number)) byApp.set(e.notice.application_number, []);
    byApp.get(e.notice.application_number).push(e);
  }
  const kept = [];
  const dropped = [];
  for (const group of byApp.values()) {
    if (group.length === 1) { kept.push(group[0]); continue; }
    const sorted = group.slice().sort(preferNotice);
    const top = sorted[0];
    const sameSig = sorted.every((e) => itemSignature(e.notice) === itemSignature(top.notice));
    const contenders = sorted.filter((e) => stageRank(e) === stageRank(top) && e.doc.revision === top.doc.revision && hearingOf(e) === hearingOf(top));
    const conflict = !sameSig && top.doc.revision !== 'revised' && contenders.length > 1
      && contenders.some((e) => itemSignature(e.notice) !== itemSignature(top.notice));
    if (conflict) {
      for (const e of sorted) dropped.push({ ...e, reason: contenders.includes(e) ? 'duplicate_same_date_conflict' : 'duplicate_superseded' });
      continue;
    }
    kept.push(top);
    for (const e of sorted.slice(1)) dropped.push({ ...e, reason: 'duplicate_superseded' });
  }
  return { kept, dropped };
}

const isBatchDoc = (doc) => doc.family === BATCH_FAMILY;

function rowFor(doc, notice, item, drop) {
  const batch = isBatchDoc(doc);
  const family = batch ? BATCH_FAMILY : SOURCE_FAMILY;
  const row = {
    variance_key: `${family}|${notice.application_number}|${item.item_ordinal}`,
    source_family: family,
    application_number: notice.application_number,
    item_ordinal: item.item_ordinal,
    hearing_date: batch ? notice.hearing_date : doc.hearing_date,
    decision_mailed_on: notice.decision_mailed_on,
    decision: item.decision, // CHAT-157: per item for both families (a PDF item carries its notice decision or its split)
    // Spec 129 §2b: the AIC drop does not say committee or delegated; 'unknown' is the honest value.
    decision_source: batch ? 'unknown' : (doc.kind === 'delegated' ? 'delegated' : 'committee'),
    cited_bylaw: item.cited_bylaw,
    citation_kind: item.citation_kind,
    regulation_id_as_cited: item.regulation_id_as_cited,
    exception_ref: item.exception_ref,
    zoning_as_stated: notice.zoning_as_stated,
    target: item.target,
    target_status: item.target_status,
    bound: item.bound,
    required_value: item.required_value,
    required_unit: item.required_unit,
    proposed_value: item.proposed_value,
    proposed_unit: item.proposed_unit,
    parse_status: item.parse_status,
    parse_confidence: item.parse_confidence,
    qualified: item.qualified,
    source_sha256: doc.sha256,
    source_page: item.source_page,
    extractor_version: batch ? doc.parser_version : EXTRACTOR_VERSION,
    vocab_version: batch ? doc.vocab_version : VOCAB.version,
    // Spec 129 §2b: doc_type + source_batch. A PDF notice is a decision notice from the year's allotment.
    doc_type: batch ? notice.doc_type : 'decision_notice',
    source_batch: batch ? doc.doc_id : `coa-${String(doc.hearing_date).slice(0, 4)}-decisions`,
  };
  return drop ? { ...row, drop_reason: drop } : row;
}

function ratio(n, d) {
  return d > 0 ? n / d : null;
}

/**
 * All documents → `{rows, stats}`. `docResults` = `[{doc: {doc_id, sha256, hearing_date, kind, revision}, result}]`
 * where `result` is `shapeDocument`'s output (absent for a document the seam could not parse). Every
 * item of every parsed notice becomes a row; a dropped notice's rows carry `drop_reason`, which
 * `shapeRecord` turns into a counted skip (so `rows_read` = every item is conserved).
 */
function reconcileNotices(docResults, opts) {
  const cfg = (opts && opts.config) || {};
  const entries = [];
  const noticesByStatus = emptyCounts(NOTICE_STATUSES);
  let noticesTotal = 0;
  let consentSkipped = 0;
  let ordinalFallback = 0;
  const lags = { measured: 0, unmeasured: 0, out_of_bounds: null, min: null, max: null };
  const maxLag = cfg.coa_notices_mail_lag_max_days;
  let oob = Number.isFinite(maxLag) ? 0 : null;
  // Spec 129 §2c: plan facts, one row per application; a later batch (manifest order) supersedes an earlier one.
  const planFactsByApp = new Map();
  let planFactsSeen = 0;
  for (const { doc, result } of docResults || []) {
    if (!result) continue;
    for (const f of result.plan_facts || []) {
      planFactsSeen++;
      planFactsByApp.set(f.application_number, { ...f, source_batch: doc.doc_id, source_sha256: doc.sha256 });
    }
    ordinalFallback += result.counts.ordinal_fallback_notices || 0;
    for (const n of result.notices) {
      noticesTotal++;
      noticesByStatus[n.notice_status]++;
      if (n.notice_status !== 'variance_section_parsed') continue;
      consentSkipped += n.consent_items_skipped;
      entries.push({ doc, notice: n });
      const h = dayNumber(n.hearing_date || doc.hearing_date);
      const m = dayNumber(n.decision_mailed_on);
      if (h === null || m === null) { lags.unmeasured++; continue; }
      const lag = m - h;
      lags.measured++;
      lags.min = lags.min === null ? lag : Math.min(lags.min, lag);
      lags.max = lags.max === null ? lag : Math.max(lags.max, lag);
      if (oob !== null && (lag < 0 || lag > maxLag)) oob++;
    }
  }
  lags.out_of_bounds = oob;

  const { kept, dropped } = dedupNotices(entries);
  // The dropped notices were counted as variance_section_parsed above; re-bucket them by reason so
  // Σ notices_by_status === notices_total still holds (C9).
  for (const d of dropped) {
    noticesByStatus.variance_section_parsed--;
    noticesByStatus[d.reason]++;
  }

  const rows = [];
  const byParse = emptyCounts(PARSE_STATUSES);
  const byTarget = emptyCounts(TARGET_STATUSES);
  const byConf = emptyCounts(CONFIDENCES);
  const droppedByReason = emptyCounts(DROP_REASONS);
  let itemsTotal = 0;
  let items569 = 0;
  let pairs569 = 0;
  let citationMulti = 0;
  let qualifiedItems = 0;
  let bylawRejected = 0;
  let unitTargetMismatch = 0;
  let targetUnitMismatchItems = 0;
  const direction = { known: 0, violations: 0 };
  const oobReq = { count: 0, measured: 0, sample_keys: [] };
  const perDoc = {};
  // CHAT-157 counter (Spec 129 §10 Emits): split notices among the KEPT PDF notices, per-reference unresolved, failed closed.
  const splitCounts = { notices: 0, refs_unresolved: 0, notices_unknown: 0 };
  const itemsByFamily = { [SOURCE_FAMILY]: 0, [BATCH_FAMILY]: 0 };
  const batchPairs = {};
  for (const { doc, notice } of kept) {
    if (!isBatchDoc(doc) && notice.split) {
      splitCounts.notices++;
      splitCounts.refs_unresolved += notice.split.refs_unresolved;
      if (notice.split.unknown) splitCounts.notices_unknown++;
    }
    for (const item of notice.items) {
      itemsTotal++;
      itemsByFamily[isBatchDoc(doc) ? BATCH_FAMILY : SOURCE_FAMILY]++;
      byParse[item.parse_status]++;
      byTarget[item.target_status]++;
      byConf[item.parse_confidence]++;
      if (item.clause_count > 1) citationMulti++;
      if (item.qualified) qualifiedItems++;
      if (item.bylaw_rejected) bylawRejected++;
      const row = rowFor(doc, notice, item, null);
      rows.push(row);
      if (isBatchDoc(doc)) {
        // Spec 129 §2b: a values batch has no extractor to regress, so C3/C15 judge the PDF family only.
        const bp = batchPairs[doc.doc_id] || (batchPairs[doc.doc_id] = { items: 0, pairs: 0 });
        bp.items++;
        if (item.parse_status === 'pair') bp.pairs++;
      } else if (item.cited_bylaw === CHAPTER_BYLAW) {
        items569++;
        const pd = perDoc[doc.doc_id] || (perDoc[doc.doc_id] = { items: 0, pairs: 0 });
        pd.items++;
        if (item.parse_status === 'pair') { pairs569++; pd.pairs++; }
      }
      const isPair = item.parse_status === 'pair';
      if (isPair && item.target_status === 'mapped' && P.unitFamily(item.required_unit) !== TARGET_FAMILY[item.target]) unitTargetMismatch++;
      if (item.parse_status === 'target_unit_mismatch') targetUnitMismatchItems++;
      if (isPair && (item.bound === 'max' || item.bound === 'min') && item.required_value !== null && item.proposed_value !== null) {
        direction.known++;
        const onPermittedSide = item.bound === 'max' ? item.proposed_value <= item.required_value : item.proposed_value >= item.required_value;
        if (onPermittedSide) direction.violations++;
      }
      const rangeVar = item.target_status === 'mapped' ? REQUIRED_RANGE_VARS[item.target] : undefined;
      if (rangeVar && item.required_value !== null && P.unitFamily(item.required_unit) === TARGET_FAMILY[item.target]) {
        const lo = cfg[`${rangeVar}_min`];
        const hi = cfg[`${rangeVar}_max`];
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          oobReq.measured++;
          if (item.required_value < lo || item.required_value > hi) {
            oobReq.count++;
            if (oobReq.sample_keys.length < (cfg.coa_notices_oob_sample_max || 0)) oobReq.sample_keys.push(row.variance_key);
          }
        }
      }
    }
  }
  for (const { doc, notice, reason } of dropped) {
    for (const item of notice.items) {
      itemsTotal++;
      itemsByFamily[isBatchDoc(doc) ? BATCH_FAMILY : SOURCE_FAMILY]++;
      byParse[item.parse_status]++;
      byTarget[item.target_status]++;
      byConf[item.parse_confidence]++;
      droppedByReason[reason]++;
      rows.push(rowFor(doc, notice, item, reason));
    }
  }

  const batchPairRates = {};
  for (const [id, bp] of Object.entries(batchPairs)) batchPairRates[id] = ratio(bp.pairs, bp.items);
  const staleBatches = new Set();
  for (const { doc } of docResults || []) {
    if (isBatchDoc(doc) && doc.target_map_version !== TARGET_MAP.version) staleBatches.add(doc.doc_id);
  }
  const docPairRates = {};
  const docItems569 = {};
  for (const [id, pd] of Object.entries(perDoc)) { docPairRates[id] = ratio(pd.pairs, pd.items); docItems569[id] = pd.items; }
  // LCN-D5 (Spec 124 R-DC, McDonald's Airtight V3, 2026-10-17): the population the C15 floor judges is
  // classified HERE (documents with at least coa_notices_doc_pair_rate_min_items 569 items), and the check
  // reports only the lowest eligible rate — the declared bound (limit_from_config
  // coa_notices_doc_pair_rate_floor) decides, never a compute comparison against ctx.config.
  // With no eligible document the minimum is 1, the rate's upper bound (nothing can sit under the floor).
  const docPairRateMin = { rate: 1, doc_id: null, eligible_docs: 0 };
  for (const id of Object.keys(docPairRates).sort()) {
    if (!(docItems569[id] >= cfg.coa_notices_doc_pair_rate_min_items)) continue;
    docPairRateMin.eligible_docs++;
    if (docPairRateMin.doc_id === null || docPairRates[id] < docPairRateMin.rate) { docPairRateMin.rate = docPairRates[id]; docPairRateMin.doc_id = id; }
  }

  const planFactRows = [...planFactsByApp.values()].sort((a, b) => (a.application_number < b.application_number ? -1 : 1));
  const planFactsByBatch = {};
  for (const r of planFactRows) planFactsByBatch[r.source_batch] = (planFactsByBatch[r.source_batch] || 0) + 1;
  return {
    rows,
    // Spec 129 §2c: DATA for the derived coa_plan_facts target (the runner hands it to deriveRows, never via `acquired`).
    derive_inputs: { [PLAN_FACTS_TABLE]: planFactRows },
    stats: {
      plan_facts_total: planFactRows.length,
      plan_facts_superseded: planFactsSeen - planFactRows.length,
      plan_facts_by_batch: planFactsByBatch,
      notices_total: noticesTotal,
      notices_by_status: noticesByStatus,
      items_total: itemsTotal,
      items_by_parse_status: byParse,
      items_by_target_status: byTarget,
      items_by_confidence: byConf,
      items_dropped_by_reason: droppedByReason,
      items_by_family: itemsByFamily,
      batch_pair_rates: batchPairRates,
      batch_target_map_stale: staleBatches.size,
      items_569: items569,
      pairs_569: pairs569,
      pair_rate_569: ratio(pairs569, items569),
      doc_pair_rates: docPairRates,
      doc_items_569: docItems569,
      doc_pair_rate_min_eligible: docPairRateMin,
      citation_multi: citationMulti,
      consent_items_skipped: consentSkipped,
      qualified_items: qualifiedItems,
      cited_bylaw_rejected: bylawRejected,
      ordinal_fallback_notices: ordinalFallback,
      mail_lag: lags,
      unit_target_mismatch: unitTargetMismatch,
      target_unit_mismatch_items: targetUnitMismatchItems,
      direction,
      required_oob: oobReq,
      split_decisions: splitCounts,
    },
  };
}

// ===========================================================================
// The pure seams the runner calls by name
// ===========================================================================

/**
 * Spec 129 §2c (RE-FREEZE #40) — the derived `coa_plan_facts` rows. The plan facts are not a function of the primary
 * slice, so they are emitted ONCE, with slice 0 (the runner passes `slice_index`); later slices return no rows.
 * The primary's prior state is not used. Values only: every column is a number, a boolean, an application number,
 * a batch id or a sha256.
 */
function deriveRows(table, sliceRows, priorByKey, seam) {
  if (table !== PLAN_FACTS_TABLE) throw new Error(`load-coa-notices compute: deriveRows has no rows for "${table}"`);
  if (!seam || seam.slice_index !== 0) return [];
  const rows = (seam.derive_inputs && seam.derive_inputs[PLAN_FACTS_TABLE]) || [];
  return rows.map((r) => {
    const out = {};
    for (const c of PLAN_FACT_COLUMNS) out[c] = r[c] === undefined ? null : r[c];
    return out;
  });
}

/** The key is built by reconcileNotices; a non-string here is a seam defect, refused as null. */
function coerceKey(raw) {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** A reconciled row → exactly the write columns; a dropped row → its reason (a counted skip). */
function shapeRecord(record) {
  if (!record || typeof record !== 'object') return 'malformed_record';
  if (typeof record.drop_reason === 'string') return record.drop_reason;
  const out = {};
  for (const c of ROW_COLUMNS) out[c] = record[c] === undefined ? null : record[c];
  return out;
}

/** Keys are unique by construction (printed or positional ordinals per notice); counted, never assumed. */
function dedupeBySourceId(features) {
  const byKey = new Map();
  for (const f of features) byKey.set(f.variance_key, f);
  const kept = [...byKey.values()];
  return { kept, duplicateCount: features.length - kept.length };
}

/** No geometry: the validator seam is inert. */
function validatorCounterDelta() {
  return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
}

/** No departure DELETE exists (retract "departed_mark" soft-retires through the library). */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

function docSet(ctx) {
  return (ctx.acquired && ctx.acquired.document_set) || null;
}

function stats(ctx) {
  return (ctx.acquired && ctx.acquired.reconcile) || null;
}

function docCount(ctx, statuses) {
  const ds = docSet(ctx);
  if (!ds || !ds.docs_by_status) return null;
  return statuses.reduce((n, s) => n + (Number.isFinite(ds.docs_by_status[s]) ? ds.docs_by_status[s] : 0), 0);
}

/** C1 — a fetched document whose sha256 is not the pinned one. FAIL, viol == 0, pre_write. */
function doc_sha_mismatch(ctx) {
  const n = docCount(ctx, ['sha_mismatch']);
  if (n === null) return ctx.report('doc_sha_mismatch', { error: new Error('document_set block absent') });
  ctx.report('doc_sha_mismatch', { violations: n, detail: n });
}

/** C2 — a document that could not be acquired or extracted. A skipped document would get its rows retired. */
function doc_acquire_failed(ctx) {
  const n = docCount(ctx, ['http_error', 'timeout', 'too_large', 'extract_error', 'no_text_layer']);
  if (n === null) return ctx.report('doc_acquire_failed', { error: new Error('document_set block absent') });
  ctx.report('doc_acquire_failed', { violations: n, detail: n });
}

/** C3 — the 569-2013 pair rate; a null ratio (no 569 items) is unevaluable → the declared FAIL. */
function pair_rate_569(ctx) {
  const s = stats(ctx);
  const r = s ? s.pair_rate_569 : null;
  if (!Number.isFinite(r)) return ctx.report('pair_rate_569', { detail: null });
  ctx.report('pair_rate_569', { value: r, detail: Math.round(r * 1000) / 1000 });
}

/** C4 — minor-variance notices with no variance section, percent of minor-variance notices. */
function notices_without_section_pct(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('notices_without_section_pct', { detail: null });
  const nb = s.notices_by_status;
  const denom = s.notices_total - nb.not_minor_variance - nb.signature_page_duplicate;
  if (denom <= 0) return ctx.report('notices_without_section_pct', { detail: null });
  const pct = (nb.no_variance_section * 100) / denom;
  ctx.report('notices_without_section_pct', { value: pct, detail: Math.round(pct * 100) / 100 });
}

/** C7a — notices whose mailed date is not within [0, max] days of the manifest hearing date. */
function mail_lag_out_of_bounds(ctx) {
  const s = stats(ctx);
  const ml = s ? s.mail_lag : null;
  if (!ml || !Number.isFinite(ml.out_of_bounds)) return ctx.report('mail_lag_out_of_bounds', { detail: null });
  ctx.report('mail_lag_out_of_bounds', { violations: ml.out_of_bounds, detail: { out_of_bounds: ml.out_of_bounds, measured: ml.measured, unmeasured: ml.unmeasured, min: ml.min, max: ml.max } });
}

/** C9 — every by-status map sums to its independently tallied total, at doc, notice and item level. */
function reason_totality(ctx) {
  const ds = docSet(ctx);
  const s = stats(ctx);
  if (!ds || !s) return ctx.report('reason_totality', { error: new Error('document_set or reconcile block absent') });
  const sum = (o) => Object.values(o || {}).reduce((n, v) => n + v, 0);
  const broken = [];
  if (sum(ds.docs_by_status) !== ds.docs_total) broken.push('docs');
  if (sum(s.notices_by_status) !== s.notices_total) broken.push('notices');
  if (sum(s.items_by_parse_status) !== s.items_total) broken.push('items_by_parse_status');
  if (sum(s.items_by_target_status) !== s.items_total) broken.push('items_by_target_status');
  if (sum(s.items_by_confidence) !== s.items_total) broken.push('items_by_confidence');
  ctx.report('reason_totality', { violations: broken.length, detail: broken.length ? broken.join(',') : 0 });
}

/** C13 — `pair` rows mapped to a target whose McBylaw unit family differs from the parsed unit. */
function unit_target_mismatch(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('unit_target_mismatch', { detail: null });
  ctx.report('unit_target_mismatch', { violations: s.unit_target_mismatch, detail: s.unit_target_mismatch });
}

/** TUM — items stored as `target_unit_mismatch` (a pair whose unit family differs from its mapped target). */
function target_unit_mismatch_items(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('target_unit_mismatch_items', { detail: null });
  ctx.report('target_unit_mismatch_items', { violations: s.target_unit_mismatch_items, detail: s.target_unit_mismatch_items });
}

/** BTM — values batches whose target_map_version is not the current map's (their stored targets may be stale). */
function batch_target_map_stale(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('batch_target_map_stale', { detail: null });
  ctx.report('batch_target_map_stale', { violations: s.batch_target_map_stale, detail: s.batch_target_map_stale });
}

/** C15 — the lowest pair rate among documents with enough 569 items; value_min <floor> decides (LCN-D5, R-DC). */
function doc_pair_rate_floor(ctx) {
  const s = stats(ctx);
  const m = s && s.doc_pair_rate_min_eligible;
  if (!m) return ctx.report('doc_pair_rate_floor', { detail: null });
  ctx.report('doc_pair_rate_floor', { value: m.rate, detail: m });
}

/** C16 — a document with no NOTICE OF DECISION block at all. */
function docs_no_notices(ctx) {
  const n = docCount(ctx, ['no_notices_found']);
  if (n === null) return ctx.report('docs_no_notices', { error: new Error('document_set block absent') });
  ctx.report('docs_no_notices', { violations: n, detail: n });
}

/** C17 — the item floor (a near-empty parse). */
function items_total_floor(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('items_total_floor', { detail: null });
  ctx.report('items_total_floor', { value: s.items_total, detail: s.items_total });
}

/** C14 — bound-known pairs whose proposed value sits on the PERMITTED side (a variance that varies nothing). */
function direction_violation_pct(ctx) {
  const s = stats(ctx);
  if (!s || s.direction.known === 0) return ctx.report('direction_violation_pct', { value: 0, detail: null, inert: true });
  const pct = (s.direction.violations * 100) / s.direction.known;
  ctx.report('direction_violation_pct', { value: pct, detail: Math.round(pct * 100) / 100 });
}

/** C12 — required values outside the target-aware plausibility range; sample keys in detail. */
function required_out_of_bounds(ctx) {
  const s = stats(ctx);
  if (!s) return ctx.report('required_out_of_bounds', { detail: null });
  const o = s.required_oob;
  ctx.report('required_out_of_bounds', { violations: o.count, detail: { count: o.count, measured: o.measured, sample_keys: o.sample_keys } });
}

// ---- emits ----

/**
 * The `coa_notices_load` emit block (descriptor `emits[0]`), built only on a load: a skip re-emits the
 * prior block through the library (DS4). `content_hash` is the skip baseline the arm compares; it is
 * stamped ONLY when the write AND the soft retire actually ran, so a run whose write was skipped (or whose MARK the mass guard suppressed) (a pre_write WARN with
 * on_warn skip_write) can never become the baseline that lets the next run skip an unwritten source.
 */
function buildLoadMeta(ctx) {
  const ds = docSet(ctx) || {};
  const s = stats(ctx) || {};
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  const wrote = !!ctx.written && !w.write_skipped_pre_write_warn && !w.write_skipped_pre_write_fail
    && !w.write_skipped_empty_source && !w.write_skipped_schema_drift
    // a run whose MARK the mass-retire guard suppressed must not become the skip baseline: the next
    // run with the same manifest + logic_version re-acquires and retries the retire.
    && !w.retire_suppressed_mass_guard;
  return {
    spec_version: ctx.descriptor && ctx.descriptor.identity ? ctx.descriptor.identity.spec_version : null,
    content_hash: wrote ? (a.content_hash ?? null) : null,
    source_dataset_version: a.source_dataset_version ?? null,
    skipped_reason: null,
    docs_total: ds.docs_total ?? 0,
    docs_by_status: { ...emptyCounts(DOC_STATUSES), ...(ds.docs_by_status || {}) },
    docs_excluded: ds.docs_excluded ?? 0,
    bytes_fetched: ds.bytes_fetched ?? 0,
    notices_by_status: { ...emptyCounts(NOTICE_STATUSES), ...(s.notices_by_status || {}) },
    items_total: s.items_total ?? 0,
    items_by_parse_status: { ...emptyCounts(PARSE_STATUSES), ...(s.items_by_parse_status || {}) },
    items_by_target_status: { ...emptyCounts(TARGET_STATUSES), ...(s.items_by_target_status || {}) },
    items_by_confidence: { ...emptyCounts(CONFIDENCES), ...(s.items_by_confidence || {}) },
    items_by_family: { ...emptyCounts([SOURCE_FAMILY, BATCH_FAMILY]), ...(s.items_by_family || {}) },
    plan_facts_total: s.plan_facts_total ?? 0,
    pair_rate_569: Number.isFinite(s.pair_rate_569) ? s.pair_rate_569 : null,
    doc_pair_rates: s.doc_pair_rates || {},
    citation_multi: s.citation_multi ?? 0,
    consent_items_skipped: s.consent_items_skipped ?? 0,
    qualified_items: s.qualified_items ?? 0,
    split_decisions: { notices: 0, refs_unresolved: 0, notices_unknown: 0, ...(s.split_decisions || {}) },
    manifest_sha256: ds.manifest_sha256 ?? null,
    extractor_version: EXTRACTOR_VERSION,
    vocab_version: VOCAB.version,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  doc_sha_mismatch,
  doc_acquire_failed,
  pair_rate_569,
  notices_without_section_pct,
  mail_lag_out_of_bounds,
  reason_totality,
  unit_target_mismatch,
  target_unit_mismatch_items,
  batch_target_map_stale,
  doc_pair_rate_floor,
  docs_no_notices,
  items_total_floor,
  direction_violation_pct,
  required_out_of_bounds,
};

/** §5.5 (2) — run the SELECTED checks, and nothing else; one throwing observer never hides the next. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.code || 'check_error'}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.written) return { records_meta: {} };
  // Spec 129 §2c: the derived target's own per-table write count (gate G #38 count_path, R-DN), never the step-level
  // records_new / records_updated, which count coa_notice_variances.
  const e1 = (ctx.written && ctx.written.e1) || {};
  return {
    records_meta: {
      coa_notices_load: buildLoadMeta(ctx),
      coa_plan_facts_written: (Number(e1.inserted) || 0) + (Number(e1.updated) || 0),
    },
  };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.shapeDocument = shapeDocument;
// Spec 129 §2b / RE-FREEZE #38: the values-batch seam the arm calls beside shapeDocument.
module.exports.shapeValuesBatch = shapeValuesBatch;
// Spec 129 §2c / RE-FREEZE #40: the derived plan-facts target.
module.exports.deriveRows = deriveRows;
module.exports.PLAN_FACT_COLUMNS = PLAN_FACT_COLUMNS;
module.exports.reconcileNotices = reconcileNotices;
// RE-FREEZE #32: the generic runner seam name (runIngestPhase calls compute.reconcileDocuments).
module.exports.reconcileDocuments = reconcileNotices;
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
module.exports.EXTRACTOR_VERSION = EXTRACTOR_VERSION;
module.exports.ROW_COLUMNS = ROW_COLUMNS;
module.exports.REQUIRED_RANGE_VARS = REQUIRED_RANGE_VARS;
