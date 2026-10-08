/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5 (red baseline)
 *
 * THE RED BASELINE — the P2-12a spike parser's value behaviour (`.cursor/mcbylaw/coa-spike/parse.mjs`,
 * 2026-10-07, not committed: its folder is git-excluded), ported to the API of
 * `scripts/lib/coa-notices/parse-values.js` so every T-PARSE case can be run against it and shown RED
 * (Spec 08 §11.4 — a lock is proven both directions). Selected by `COA_PARSE_IMPL=spike`.
 *
 * Carries the spike's defects ON PURPOSE: the decimal-split bug (`0 .357` → 357), the comma-as-decimal
 * read (`1,200 m²` → 1.2), no unit relabel (`metres` stays `metres`), no unit-family check on a pair,
 * no compound-sentence detection, no side lexicon, a non-digit-initial by-law token, the exception
 * dropped when a regulation is cited, no qualified-rule flag, no bound. NEVER import this from scripts/.
 */
'use strict';

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`\s*(m²|m2|m�|square metres|sq\.? ?m|metres|m\b|%|storeys?|times|spaces?|cm)`;
const VAL_RE = new RegExp(NUM + UNIT, 'i');

function spikeUnit(u) { return u.replace('m�', 'm²').replace('m2', 'm²').toLowerCase(); }

function relabelUnit(raw) { return typeof raw === 'string' ? spikeUnit(raw) : null; }

function unitFamily(u) {
  if (u == null) return null;
  return (u === 'm²' || /square|sq/.test(u)) ? 'area' : u === '%' ? 'pct' : u === 'times' ? 'times' : /^m$|metres|cm/.test(u) ? 'len' : u;
}

function extractValues(s) {
  const re = new RegExp(VAL_RE.source, 'gi');
  const out = [];
  let m;
  while (s && (m = re.exec(s))) out.push({ value: Number(m[1].replace(',', '.')), unit: spikeUnit(m[2]), index: m.index });
  return out;
}

function classifySide() { return null; }
function detectBound() { return null; }
function isCompound() { return false; }
function isQualified() { return false; }

function splitPair(body) {
  const b = String(body || '').replace(/\s+/g, ' ');
  const wm = b.match(/^(.*?)\bwhereas\b(.*)$/i);
  if (wm) return { required: wm[2].trim(), proposed: wm[1].trim(), method: 'whereas', reversed: false };
  const sents = b.split(/(?<=[.;])\s+(?=[A-Z])/);
  let req = null; let prop = null;
  for (const s of sents) {
    if (!req && /\b(maximum|minimum|required|permitted|shall|must|not exceed|may (?:encroach|project))\b/i.test(s) && !/\bproposed\b|in this case|will (?:be|have)|\bis proposed\b/i.test(s)) req = s;
    else if (!prop && /\bproposed\b|in this case|will (?:be|have|encroach|project|cover|contain)|\bthe (?:altered|new|existing)\b.*\b(?:is|has|will)\b/i.test(s)) prop = s;
  }
  return { required: req, proposed: prop, method: req || prop ? 'sentences' : null, reversed: false };
}

function parseCitation(head, groupBylaw) {
  const h = String(head || '');
  const bylaw = (h.match(/By-?law(?: No\.?)?\s*([0-9A-Z-]+)/i) || [])[1] || groupBylaw || null;
  const m = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\.?\s*(\(\s*\d+\s*\))?/);
  if (!m) {
    const x = h.match(/\b900\.\d+\.\d+\.?\s*\(\s*(\d+)\s*\)/);
    return { cited_bylaw: bylaw, citation_kind: x ? 'exception_clause' : (bylaw ? 'former_bylaw_section' : 'none'), regulation_id_as_cited: null, exception_ref: x ? x[1] : null, clause_count: 0 };
  }
  return { cited_bylaw: bylaw, citation_kind: 'chapter_regulation', regulation_id_as_cited: m[2] ? `${m[1]}${m[2].replace(/\s/g, '')}` : m[1], exception_ref: null, clause_count: 1 };
}

function classifyItem({ head, body, groupBylaw }) {
  const c = parseCitation(head, groupBylaw);
  const p = splitPair(body);
  const req = extractValues(p.required)[0] || null;
  let prop = extractValues(p.proposed)[0] || null;
  if (req && p.proposed) {
    const same = extractValues(p.proposed).find((v) => unitFamily(v.unit) === unitFamily(req.unit));
    if (same) prop = same;
  }
  let status = 'pair';
  if (!p.required && !p.proposed) status = 'no_split';
  else if (!req) status = 'no_required_value';
  else if (!prop) status = 'no_proposed_value';
  return {
    ...c,
    required_value: req ? req.value : null,
    required_unit: req ? req.unit : null,
    proposed_value: prop ? prop.value : null,
    proposed_unit: prop ? prop.unit : null,
    parse_status: status,
    parse_confidence: status === 'pair' ? 'high' : 'low',
    bound: null,
    qualified: false,
  };
}

function mapTarget() { return { target: 'unmapped', target_status: 'unmapped', matched: [] }; }

// ── document level: the spike's parseNotices, re-shaped to the compute's shapeDocument output ──
// Carried defects: the page-number NOISE filter applies to EVERY line (a wrapped `10` is lost); the
// decision is read from the WHOLE block (conditions text included); consent (B-file) items are kept;
// a head ending "By-law No." never takes its token from the next line; no reconciliation (every
// duplicate notice is kept).
const NOISE = /^\s*(Decision Notice - \w+\.doc.*|Page \d+|A\d{4}\/\d\d[A-Z]+\s+\d+|\d+)\s*$/;

function shapeDocument(doc) {
  const text = doc.text_pages.join('\n').replace(/\r/g, '');
  const blocks = text.split(/NOTICE OF DECISION/).slice(1);
  const notices = [];
  for (const b of blocks) {
    if (!/MINOR VARIANCE/.test(b.slice(0, 400))) { notices.push({ application_number: null, notice_status: 'not_minor_variance', items: [], page: 1 }); continue; }
    const file = (b.match(/File Number:\s*(A\d{3,4}\/\d\d[A-Z]+)/) || [])[1];
    if (!file) continue;
    const zone = ((b.match(/File Number:\s*\S+\s+Zoning\s+(.+)/) || [])[1] || '').trim();
    const decision = /is Refused|NOT approved/i.test(b) ? 'refused' : /Approved on Condition|approved .*conditions/i.test(b) ? 'approved_with_conditions' : /is Approved|Application is approved|APPROVED/i.test(b) ? 'approved' : 'unknown';
    const vstart = b.search(/REQUESTED VARIANCE\(S\)/i);
    if (vstart < 0) { notices.push({ application_number: file, notice_status: 'no_variance_section', items: [], page: 1 }); continue; }
    let sec = b.slice(vstart).split(/\n/).slice(1);
    const endIdx = sec.findIndex((l) => /Committee of Adjustment considered|IT WAS THE DECISION|SIGNATURE PAGE|The Committee has considered/i.test(l));
    if (endIdx >= 0) sec = sec.slice(0, endIdx);
    sec = sec.filter((l) => !NOISE.test(l));
    const raw = []; let cur = null; let group = null; const numbered = sec.some((l) => /^\s*\d{1,2}\.\s+/.test(l));
    for (const l of sec) {
      const g = l.match(/^\s*(?:Former )?(?:City of Toronto |North York |Etobicoke |Scarborough |York |East York )?(?:Zoning )?By-?law(?: No\.?)?\s*([0-9A-Z-]+)\s*:?\s*$/i);
      if (g) { group = g[1]; continue; }
      const h = l.match(/^\s*(\d{1,2})\.\s+(.*)$/) || (!numbered && l.match(/^\s*()((?:Chapter|Section|Regulation)s?\s+\d.*By-?law.*)$/i));
      if (h) {
        if (cur) raw.push(cur);
        const cited = /^(Chapter|Section|Regulation|Clause|Exception|By-law)/i.test(h[2]) && /By-?law/i.test(h[2]);
        cur = cited ? { n: Number(h[1]) || raw.length + 1, head: h[2].trim(), body: '', group } : { n: Number(h[1]) || raw.length + 1, head: group ? `By-law ${group}` : '', body: h[2].trim(), group };
      } else if (cur) cur.body += ` ${l.trim()}`;
    }
    if (cur) raw.push(cur);
    const items = raw.map((it) => ({ item_ordinal: it.n, source_page: 1, ...classifyItem({ head: it.head, body: it.body, groupBylaw: it.group }), target: 'unmapped', target_status: 'unmapped' }));
    notices.push({ application_number: file, notice_status: 'variance_section_parsed', zoning_as_stated: zone || null, decision, decision_mailed_on: null, consent_items_skipped: 0, items, page: 1 });
  }
  return { doc_status: blocks.length ? 'parsed' : 'no_notices_found', notices, counts: {} };
}

function reconcileNotices(docResults) {
  const rows = [];
  for (const { doc, result } of docResults || []) {
    if (!result) continue;
    for (const n of result.notices) {
      if (n.notice_status !== 'variance_section_parsed') continue;
      for (const it of n.items) rows.push({ variance_key: `toronto_ca_decision_pdf|${n.application_number}|${it.item_ordinal}`, application_number: n.application_number, source_sha256: doc.sha256, hearing_date: doc.hearing_date, ...it });
    }
  }
  return { rows, stats: {} };
}

module.exports = {
  relabelUnit, unitFamily, extractValues, classifySide, detectBound, isCompound, isQualified,
  splitPair, parseCitation, classifyItem, mapTarget, shapeDocument, reconcileNotices,
};
