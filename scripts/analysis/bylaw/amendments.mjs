// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 `amendments[]` ({bylaw, clause_path} per
//            `[ By-law: … ]` tag, bound to the clause it follows; status once per by-law in amendments.json,
//            default `not_verified`), §9 G-PROV (amendment arm: every tag has an amendments.json entry and a
//            clause_path; per-page tag counts pinned, two-directional), §10 artifacts;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-36, P-1, P-6; docs/reports/mcbylaw-phase1-plan.md S10
//
// The amendment layer of the McBylaw generator. Tags are read from the ADOPTED pages (pages/<key>.htm for
// the structure that binds a tag to its clause; pages/<key>.txt for the cross-check), never fetched.
//
// amendments.json has two halves:
//   statuses   AUTHORED, once per amending instrument: {bylaw, status, enacted_on, in_force_on,
//              in_force_trigger, source_url, source_sha256, verified_on, basis}. A rebuild carries an authored
//              entry forward (projected onto those nine fields) and gives every newly tagged instrument the
//              default `not_verified` (every other field null). A tribunal order cited without a by-law number
//              is its own instrument, keyed by its literal tag text.
//   the rest   GENERATED from the pages: adoption_id, generator_version, per-page counts (singular
//              `[ By-law: … ]` tags = manifest tag_count; plural `[ By-laws: … ]` lists pinned separately),
//              tags[] (id = page:clause_path#ordinal-within-that-clause), per-instrument counts, totals.
//              A status never changes row_status in Phase 1 (Spec 68 §6).
//
// Build refusals (AmendmentsError; nothing written): manifest_missing, page_missing, not_a_tag, tag_empty,
// tag_ambiguous (a part naming two by-law numbers), tag_text_mismatch (structure vs normalized text, or a
// `[ By-law` prefix no parsed tag accounts for), tag_count_mismatch (singular tags vs manifest tag_count).
//
// G-PROV amendment-arm reason codes (closed set; `checked` = recorded tags examined):
//   amendments_missing   no amendments.json (or no manifest.json to check it against)
//   amendments_invalid   amendments.json is not the expected shape (statuses / tags / pages)
//   amendments_stale     amendments.json was built against another adoption than manifest.json's
//   amendments_drift     amendments.json differs from a rebuild of the adopted pages (generated half edited, or
//                        the pages no longer build — the build refusal is quoted)
//   tag_count_mismatch   a page's pinned singular count differs from manifest.json, or a page is pinned in one only
//   tag_unrecorded       a tag on an adopted page has no amendments.json entry (same id, text and clause)
//   tag_not_on_page      an amendments.json tag is not on its (present) adopted page
//   tag_unbound          a tag with no clause_path (it precedes every article heading)
//   status_missing       a tagged instrument has no status entry
//   status_orphan        a status entry for an instrument no tag references
//   status_invalid       a status outside the closed set, a malformed field, or a verified status without its source

import fs from 'node:fs';
import path from 'node:path';
import { decodePage, normalize, stableStringify } from './snapshot.mjs';

export const AMENDMENTS_GENERATOR_VERSION = 'amendments-v1';

/** Spec 68 §6: the closed status set (default `not_verified`). */
export const STATUSES = Object.freeze(['in_force', 'under_appeal', 'partially_in_force', 'repealed', 'not_verified', 'in_force_not_in_consolidation']);

const STATUS_FIELDS = Object.freeze(['basis', 'bylaw', 'enacted_on', 'in_force_on', 'in_force_trigger', 'source_sha256', 'source_url', 'status', 'verified_on']);
/** A status other than not_verified is a research claim: it must say where and when it was verified, and under which ruling. */
const VERIFIED_REQUIRES = Object.freeze(['source_url', 'source_sha256', 'verified_on', 'basis']);

export class AmendmentsError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** The one tag grammar (case-sensitive, as the City writes it). A `[ By-law` prefix it does not match is a refusal, not a skip. */
const TAG_SRC = String.raw`\[\s*By-laws?\s*:[^[\]]*\]`;
const TAG_PREFIX_RE = /\[\s*by-?laws?\s*:/gi;
const BYLAW_RE = /^0*(\d{1,4})-(\d{4})\s*(.*)$/;
const BYLAW_SHAPE_RE = /\b\d{1,4}-\d{4}\b/;

const own = (obj, k) => obj !== null && typeof obj === 'object' && Object.hasOwn(obj, k);

/** Parse one tag's text into {form, refs[]}. PURE. Throws not_a_tag / tag_empty / tag_ambiguous. */
export function parseTag(raw) {
  const m = /^\[\s*By-law(s?)\s*:([^[\]]*)\]$/.exec(String(raw).trim());
  if (!m) throw new AmendmentsError('not_a_tag', String(raw));
  const refs = [];
  for (const part of m[2].split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    const b = BYLAW_RE.exec(part);
    if (b) {
      const note = b[3].replace(/^\((.*)\)$/, '$1').trim();
      if (BYLAW_SHAPE_RE.test(note)) throw new AmendmentsError('tag_ambiguous', `"${part}" names more than one by-law number`);
      refs.push({ bylaw: `${Number(b[1])}-${b[2]}`, kind: 'bylaw', note: note || null });
    } else {
      // A tribunal order cited without a by-law number (e.g. "OMB PL130592 February 7, 2017") is its own
      // instrument; its literal text is its id — never canonicalized into a guessed by-law.
      if (BYLAW_SHAPE_RE.test(part)) throw new AmendmentsError('tag_ambiguous', `"${part}" holds a by-law number this grammar cannot read`);
      refs.push({ bylaw: part, kind: 'tribunal_order', note: null });
    }
  }
  if (refs.length === 0) throw new AmendmentsError('tag_empty', String(raw));
  return { form: m[1] ? 'list' : 'single', refs };
}

/** The tag texts in a normalized page text, in order. PURE. */
export function tagsInText(normText) {
  return String(normText).match(new RegExp(TAG_SRC, 'g')) || [];
}

const ARTICLE_RE = /^\d+(\.\d+)+$/;
const REG_ANCHOR_RE = /^(\d+(?:\.\d+)+)(\(\d+[A-Za-z]?\))$/;
const LABEL_RE = /^\((?:\d{1,4}[A-Za-z]?|[A-Z]{1,2}|[a-z]{1,2}|[ivxlc]{1,6}|[IVXLC]{1,6})\)$/;

/**
 * Bind every tag on a City page to the clause it follows, from the page structure: article ids from the
 * `<A Name="a.b.c.d">` heading anchors; the regulation from `<A Name="a.b.c.d(n)">`; clause and sub-clause
 * labels from the right-aligned label cells, one per table-nesting depth. A tag's clause_path is the article
 * plus the labels open at the tag's depth. A tag before any article is unbound (null), never guessed.
 * Throws structure_unbalanced when the page's tables do not nest (depth would be meaningless). PURE.
 */
export function extractPageTags(html, pageKey) {
  const s = String(html);
  const out = [];
  let article = null;
  let depth = 0;
  const labels = new Map(); // depth -> label
  const truncate = (d) => {
    for (const k of [...labels.keys()]) if (k > d) labels.delete(k);
  };
  const setRegulation = (name) => {
    const reg = REG_ANCHOR_RE.exec(name);
    if (!reg) return false;
    article = reg[1];
    truncate(depth);
    labels.set(depth, reg[2]);
    return true;
  };
  const tokenRe = new RegExp(String.raw`<TABLE\b[^>]*>|<\/TABLE\s*>|<A\s+Name="([^"]+)"[^>]*>|<TD\b[^>]*ALIGN\s*=\s*"?RIGHT"?[^>]*>([\s\S]*?)<\/TD>|${TAG_SRC}`, 'gi');
  let m;
  while ((m = tokenRe.exec(s))) {
    const tok = m[0];
    if (/^<TABLE/i.test(tok)) depth++;
    else if (/^<\/TABLE/i.test(tok)) {
      if (depth === 0) throw new AmendmentsError('structure_unbalanced', `${pageKey}: </TABLE> with no open table`);
      depth--;
      truncate(depth);
    } else if (m[1] !== undefined) {
      const name = m[1].trim();
      if (ARTICLE_RE.test(name)) {
        article = name;
        labels.clear();
      } else setRegulation(name);
    } else if (m[2] !== undefined) {
      if (/<TABLE\b|\[\s*By-law/i.test(m[2])) throw new AmendmentsError('structure_unbalanced', `${pageKey}: a label cell holds a table or a tag`);
      const a = /<A\s+Name="([^"]+)"/i.exec(m[2]);
      if (!(a && setRegulation(a[1].trim()))) {
        const label = normalize(m[2]);
        if (LABEL_RE.test(label)) {
          truncate(depth);
          labels.set(depth, label);
        }
      }
    } else {
      const raw = tok.replace(/\s+/g, ' ');
      const parsed = parseTag(raw);
      const open = [...labels.entries()].filter(([d]) => d <= depth).sort(([x], [y]) => x - y).map(([, l]) => l);
      out.push({ page: pageKey, clause_path: article ? article + open.join('') : null, form: parsed.form, raw, refs: parsed.refs });
    }
  }
  if (depth !== 0) throw new AmendmentsError('structure_unbalanced', `${pageKey}: ${depth} table(s) left open`);
  const seen = new Map();
  for (const t of out) {
    const k = `${t.page}:${t.clause_path}`;
    seen.set(k, (seen.get(k) || 0) + 1);
    t.id = `${k}#${seen.get(k)}`;
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const defaultStatus = (bylaw) => Object.fromEntries(STATUS_FIELDS.map((f) => [f, f === 'bylaw' ? bylaw : f === 'status' ? 'not_verified' : null]));

/** Tags of every adopted page, cross-checked against the normalized text and the manifest count. */
function adoptedTags(seeds, manifest) {
  const byPage = {};
  for (const p of manifest.pages) {
    const htm = path.join(seeds, 'pages', `${p.key}.htm`);
    const txt = path.join(seeds, 'pages', `${p.key}.txt`);
    if (!fs.existsSync(htm) || !fs.existsSync(txt)) throw new AmendmentsError('page_missing', `${p.key}: pages/${p.key}.htm or .txt`);
    const tags = extractPageTags(decodePage(fs.readFileSync(htm)), p.key);
    const text = fs.readFileSync(txt, 'utf8');
    const fromText = tagsInText(text).map((t) => t.replace(/\s+/g, ' '));
    const prefixes = (text.match(TAG_PREFIX_RE) || []).length;
    if (fromText.join('\n') !== tags.map((t) => t.raw).join('\n') || prefixes !== fromText.length) {
      throw new AmendmentsError('tag_text_mismatch', `${p.key}: ${tags.length} tags in the structure, ${fromText.length} in the normalized text, ${prefixes} "[ By-law" prefixes`);
    }
    const single = tags.filter((t) => t.form === 'single').length;
    if (single !== p.tag_count) throw new AmendmentsError('tag_count_mismatch', `${p.key}: ${single} singular tags, manifest pins ${p.tag_count}`);
    byPage[p.key] = tags;
  }
  return byPage;
}

/**
 * Build amendments.json from the adopted pages (manifest.json + pages/) and the prior file's authored
 * statuses. Deterministic: same inputs, byte-identical output under stableStringify. Throws AmendmentsError.
 */
export function buildAmendments({ seeds, prior = null }) {
  const manifestPath = path.join(seeds, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new AmendmentsError('manifest_missing', manifestPath);
  const manifest = readJson(manifestPath);
  const byPage = adoptedTags(seeds, manifest);
  const pages = {};
  const tags = [];
  const counts = new Map();
  for (const p of manifest.pages) {
    const t = byPage[p.key];
    pages[p.key] = { list_tag_count: t.filter((x) => x.form === 'list').length, normalized_sha256: p.normalized_sha256, tag_count: t.filter((x) => x.form === 'single').length };
    for (const tag of t) {
      tags.push(tag);
      for (const b of new Set(tag.refs.map((r) => r.bylaw))) {
        if (!counts.has(b)) counts.set(b, { tags: 0, clauses: new Set() });
        counts.get(b).tags++;
        if (tag.clause_path) counts.get(b).clauses.add(`${tag.page}:${tag.clause_path}`);
      }
    }
  }
  const bylaws = [...counts.keys()].sort();
  const priorStatuses = prior && prior.statuses && typeof prior.statuses === 'object' ? prior.statuses : {};
  const statuses = {};
  for (const b of bylaws) {
    const p = own(priorStatuses, b) && priorStatuses[b] && typeof priorStatuses[b] === 'object' ? priorStatuses[b] : {};
    statuses[b] = Object.fromEntries(STATUS_FIELDS.map((f) => [f, f === 'bylaw' ? b : own(p, f) ? p[f] : defaultStatus(b)[f]]));
  }
  return {
    adoption_id: manifest.adoption_id,
    bylaw_tag_counts: Object.fromEntries(bylaws.map((b) => [b, { clauses: counts.get(b).clauses.size, tags: counts.get(b).tags }])),
    generator_version: AMENDMENTS_GENERATOR_VERSION,
    pages,
    statuses,
    tags,
    totals: {
      article_level_tags: tags.filter((t) => t.clause_path && !t.clause_path.includes('(')).length,
      bylaws: bylaws.length,
      list_tags: tags.filter((t) => t.form === 'list').length,
      pages: manifest.pages.length,
      tags: tags.filter((t) => t.form === 'single').length,
    },
  };
}

/** Authored statuses a rebuild dropped because no tag references the instrument any more. PURE. */
export function droppedStatuses(prior, next) {
  const before = prior && prior.statuses && typeof prior.statuses === 'object' ? prior.statuses : {};
  const after = next && next.statuses && typeof next.statuses === 'object' ? next.statuses : {};
  return Object.keys(before).filter((b) => !own(after, b)).sort();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate one status entry filed under `key`; returns a list of problems (empty = valid). PURE. */
export function statusProblems(entry, key = entry && entry.bylaw) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['entry is not an object'];
  const problems = [];
  if (entry.bylaw !== key) problems.push(`bylaw "${entry.bylaw}" is filed under "${key}"`);
  const extra = Object.keys(entry).filter((f) => !STATUS_FIELDS.includes(f));
  if (extra.length) problems.push(`unknown field(s) ${extra.join(', ')}`);
  if (entry.source_sha256 && !/^[0-9a-f]{64}$/.test(entry.source_sha256)) problems.push('source_sha256 is not a sha256');
  if (entry.source_url && !/^https:\/\//.test(entry.source_url)) problems.push('source_url is not https');
  for (const f of ['enacted_on', 'in_force_on', 'verified_on']) if (entry[f] && !ISO_DATE_RE.test(entry[f])) problems.push(`${f} is not an ISO date`);
  if (!STATUSES.includes(entry.status)) problems.push(`status "${entry.status}" is not in the closed set`);
  else if (entry.status !== 'not_verified') {
    const missing = VERIFIED_REQUIRES.filter((f) => !entry[f]);
    if (missing.length) problems.push(`${entry.status} requires ${missing.join(', ')}`);
  }
  return problems;
}

/** G-PROV amendment arm over a seeds directory. Returns {pass, violations, checked}. Never throws on bad data. */
export function checkAmendments({ seeds }) {
  const violations = [];
  let checked = 0;
  const file = path.join(seeds, 'amendments.json');
  const manifestPath = path.join(seeds, 'manifest.json');
  if (!fs.existsSync(file)) return { pass: false, violations: ['amendments_missing: amendments.json'], checked };
  if (!fs.existsSync(manifestPath)) return { pass: false, violations: ['amendments_missing: manifest.json (nothing to check amendments.json against)'], checked };
  let doc;
  let manifest;
  try {
    doc = readJson(file);
    manifest = readJson(manifestPath);
  } catch (err) {
    return { pass: false, violations: [`amendments_invalid: ${err && err.message ? err.message : String(err)}`], checked };
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(doc) || !isObj(doc.statuses) || !isObj(doc.pages) || !Array.isArray(doc.tags) || !doc.tags.every((t) => isObj(t) && Array.isArray(t.refs) && t.refs.every(isObj))) {
    return { pass: false, violations: ['amendments_invalid: expected {statuses: {}, pages: {}, tags: [{refs: [{}]}]}'], checked };
  }
  if (doc.adoption_id !== manifest.adoption_id) violations.push(`amendments_stale: built against ${doc.adoption_id}, manifest is ${manifest.adoption_id}`);
  try {
    const rebuilt = buildAmendments({ seeds, prior: doc });
    if (stableStringify(rebuilt) !== stableStringify(doc)) violations.push('amendments_drift: amendments.json differs from a rebuild of the adopted pages (run the amendments rebuild)');
  } catch (err) {
    if (!(err instanceof AmendmentsError)) throw err;
    violations.push(`amendments_drift: the adopted pages do not build — ${err.message}`);
  }

  const pinned = doc.pages;
  for (const p of manifest.pages) {
    if (!own(pinned, p.key)) violations.push(`tag_count_mismatch: ${p.key} is in manifest.json but not pinned in amendments.json`);
    else if (!isObj(pinned[p.key]) || pinned[p.key].tag_count !== p.tag_count) violations.push(`tag_count_mismatch: ${p.key} pins ${isObj(pinned[p.key]) ? pinned[p.key].tag_count : 'nothing'}, manifest ${p.tag_count}`);
  }
  for (const k of Object.keys(pinned)) if (!manifest.pages.some((p) => p.key === k)) violations.push(`tag_count_mismatch: ${k} is pinned in amendments.json but not in manifest.json`);

  // Re-read the tags from the adopted pages present on disk (a missing page is the page arm's finding, once).
  const onPages = new Map();
  const present = new Set();
  for (const p of manifest.pages) {
    const htmPath = path.join(seeds, 'pages', `${p.key}.htm`);
    if (!fs.existsSync(htmPath)) continue;
    present.add(p.key);
    try {
      for (const t of extractPageTags(decodePage(fs.readFileSync(htmPath)), p.key)) onPages.set(t.id, t);
    } catch (err) {
      if (!(err instanceof AmendmentsError)) throw err;
      violations.push(`tag_unrecorded: ${p.key} cannot be read — ${err.message}`);
    }
  }
  const recorded = new Map(doc.tags.map((t) => [t.id, t]));
  for (const [id, t] of onPages) {
    const r = recorded.get(id);
    if (!r || r.raw !== t.raw || r.clause_path !== t.clause_path) violations.push(`tag_unrecorded: ${id} ${t.raw}`);
  }
  for (const [id, r] of recorded) {
    checked++;
    if (present.has(r.page) && !onPages.has(id)) violations.push(`tag_not_on_page: ${id} ${r.raw}`);
    if (!r.clause_path) violations.push(`tag_unbound: ${id} ${r.raw}`);
  }

  const statuses = doc.statuses;
  const referenced = new Set([...recorded.values()].flatMap((t) => t.refs.map((x) => x.bylaw)));
  for (const b of [...referenced].sort()) if (!own(statuses, b)) violations.push(`status_missing: ${b}`);
  for (const b of Object.keys(statuses).sort()) {
    if (!referenced.has(b)) violations.push(`status_orphan: ${b} has a status but no tag references it`);
    for (const pr of statusProblems(statuses[b], b)) violations.push(`status_invalid: ${b} ${pr}`);
  }
  return { pass: violations.length === 0, violations, checked };
}
