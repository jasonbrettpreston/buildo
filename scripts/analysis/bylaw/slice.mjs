// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id, clauses[], unit id
//            `regulation_id#clause_path`, verified_against_sha256 = sha of the unit's normalized text),
//            §6.4 rules 1, 6, 11, §6.5 (unit table, number words, anti-vacuity exclusions), §9 G-TEXT,
//            §10 stage 2 (Slice); docs/specs/01-pipeline/69_mcbylaw_policy.md M-2, M-47 (+ S3 notes);
//            docs/reports/mcbylaw-phase1-plan.md S4.
//
// Stage 2 of the McBylaw generator: cut the adopted normalized pages into regulations and clauses,
// and extract literals, amendment tags (with the clause they follow) and cross-references.
// Every function here is PURE except loadSnapshotPages() (reads the committed seeds; no clock,
// no network, no locale API). The page TOC (parsed from the raw page) is the authority for which
// headings a page holds; the body text is the normalized page (the verbatim source).
//
// Ids (Spec 68 §6):
//   regulation_id   `<article>(<n>)`; a definition `800.50(<n>)`; an article with no numbered regulation
//                   `<article>#article`; a section page with no article (995.50) uses the section as article.
//   clause_path     the full bracket path, e.g. `(3)(A)(i)`; `` for an `#article` row's root.
//   unit_id         `regulation_id#clause_path` of every LEAF clause.
// The by-law's own numbering (1.20.1(2)): (25) regulation · (A) upper-case letter · (i) lower-case
// Roman numeral · (a) lower-case letter.
// Unit text (the sha input) = the ancestors' lead-in segments + the leaf's own segment, joined by one
// space, so a change to a lead-in ("may be converted if:") marks its leaves stale.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { decodePage, parseToc, sha256 } from './snapshot.mjs';

export const SLICER_VERSION = 'slice-v1';

/**
 * The slicer's declared configuration lives in `scripts/seeds/bylaw/vocab.json` `slicer` (Spec 68 §6.5: the
 * anti-vacuity exclusions, the unit table and the definition matcher are vocabulary; moved here from code at S5).
 * Read once, at import, from the committed seed; nothing else in this module does I/O at import.
 */
const SLICER = createRequire(import.meta.url)('../../seeds/bylaw/vocab.json').slicer;

/** Sections sliced as numbered defined terms `(n) Term means ...` instead of articles + regulations. */
export const DEFINITION_SECTIONS = Object.freeze([...SLICER.definition_sections]);

/**
 * The declared definition-head matcher (Spec 68 §6.4 rule 11, §9 G-TEXT): case-insensitive verb.
 * The Phase 0 matcher (case-sensitive, no `includes`) missed 800.50 (410) "Lawfully Existing Means:"
 * and (695) "Residential Building includes".
 */
export const DEFINITION_MATCHER = Object.freeze({ verbs: Object.freeze([...SLICER.definition_head_matcher.verbs]), caseInsensitive: SLICER.definition_head_matcher.case_insensitive === true });
export const PHASE0_DEFINITION_MATCHER = Object.freeze({ verbs: ['means', 'has the same meaning', 'is defined'], caseInsensitive: false });

/**
 * Characters that may appear in body text: printable ASCII plus vocab `slicer.allowed_extra_chars`. Anything else
 * in a row is a counted `source_defect` disclosure (Spec 68 §9 G-TEXT), never a failure. The encoding dash
 * (U+0096) is the City's cp1252 en-dash served under a declared iso-8859-1 charset (normalizer v1 keeps it); it
 * is allowed, not a defect (a normalizer v2 mapping it to '-' is a proposed S3 follow-up).
 */
const reClass = (s) => s.replace(/[\\\]^-]/g, '\\$&');
const ALLOWED_CHAR = new RegExp(`[\\x20-\\x7e${reClass(SLICER.allowed_extra_chars)}]`);
const ENCODING_DASH = SLICER.encoding_dash;

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv', 'xxvi', 'xxvii', 'xxviii', 'xxix', 'xxx', 'xxxi', 'xxxii', 'xxxiii', 'xxxiv', 'xxxv', 'xxxvi', 'xxxvii', 'xxxviii', 'xxxix', 'xl'];
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
/** Clause levels below the regulation, in order (1.20.1(2)). */
const LEVELS = [UPPER, ROMAN, LOWER];

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isWs = (s) => /^\s*$/.test(s);

/** Defect characters in a string: [{index, char, code}] (index relative to the string). PURE. */
export function defectChars(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ENCODING_DASH || ALLOWED_CHAR.test(c)) continue;
    out.push({ index: i, char: c, code: `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` });
  }
  return out;
}

const BREAK_BEFORE = /(?:[.:;,\])]|[;,] (?:and|or)|^)\s$/;

/**
 * Is the text before a marker a list break? `; and `, `: `, `. `, `] `, `, ` … or a defect character
 * (the City garble in 600.60.40(3)(A) eats the punctuation before (B)).
 */
function breakBefore(prefix) {
  const tail = prefix.slice(-8);
  if (BREAK_BEFORE.test(tail)) return true;
  const ch = prefix.slice(-2, -1);
  return ch !== '' && /\s$/.test(prefix) && defectChars(ch).length > 0;
}

/** Text after a marker that makes it a reference, not a division: `(a) to (d) above`, `(B) and (C)`. */
const REF_AFTER = /^(?:(?:to|and|or|through)\s+\(|(?:inclusive|above|below)\b)|^[,)]/;

/**
 * Parse the clause tree of one regulation's verbatim. Returns {nodes, repeats, typos}: nodes in text
 * order, each {path, start, end, depth, leaf}, whose own segments partition [0, text.length);
 * `repeats` = list-break markers re-using a symbol of an open level (tables, duplicated City text:
 * kept inside the preceding leaf, disclosed); `typos` = "(I)" read as (i). `rootPath` is the
 * regulation's own path (`(3)`, or `` for an `#article` row). PURE.
 */
export function parseClauses(text, rootPath) {
  const re = /(?<=\s)\(([A-Z]|[ivxl]{1,7}|[a-z])\)(?= )/g;
  const accepted = []; // {at, depth, symbol}
  const stack = []; // per depth: index into LEVELS[d] of the open division
  const repeats = []; // a list break + a division symbol already used at an open level (tables, duplicated City text)
  const typos = []; // "(I)" where the lower-case Roman (i) is due (230.5.1.10(4), 2.1.1(4))
  let m;
  while ((m = re.exec(text))) {
    let sym = m[1];
    const after = text.slice(m.index + m[0].length + 1, m.index + m[0].length + 40);
    if (after.startsWith('[') && !after.startsWith('[Deleted')) continue; // "(A) [bracketed upper-case letter]" (1.20.1(2))
    if (REF_AFTER.test(after)) continue;
    const prefix = text.slice(Math.max(0, m.index - 12), m.index);
    // Candidate interpretations, deepest first: a first child, then a next sibling at each open depth.
    let pick = null;
    const childDepth = stack.length;
    if (childDepth < LEVELS.length && LEVELS[childDepth][0] === sym) pick = { depth: childDepth, idx: 0, first: true };
    for (let d = stack.length - 1; d >= 0 && !pick; d--) {
      const idx = LEVELS[d].indexOf(sym);
      if (idx === stack[d] + 1) pick = { depth: d, idx, first: false };
    }
    if (!pick && sym === 'I' && childDepth === 1 && breakBefore(prefix)) {
      pick = { depth: 1, idx: 0, first: true };
      typos.push({ at: m.index, symbol: 'I', as: 'i' });
      sym = 'i';
    }
    if (!pick) {
      if (breakBefore(prefix) && stack.some((open, d) => LEVELS[d].indexOf(sym) >= 0 && LEVELS[d].indexOf(sym) <= open)) repeats.push({ at: m.index, symbol: sym });
      continue;
    }
    // A sibling needs a list break before it; a first child may follow a title ("(1) Height (A) ...").
    if (!pick.first && !breakBefore(prefix)) continue;
    if (pick.first && !breakBefore(prefix) && /(?:regulations?|clauses?|with|of|in|under|and|or|to|see)\s$/i.test(prefix)) continue;
    stack.length = pick.depth;
    stack.push(pick.idx);
    accepted.push({ at: m.index, depth: pick.depth, symbol: sym });
  }
  // Build paths and own segments.
  const nodes = [{ path: rootPath, start: 0, end: accepted.length ? accepted[0].at : text.length, depth: -1, leaf: accepted.length === 0 }];
  const pathStack = [];
  for (let i = 0; i < accepted.length; i++) {
    const a = accepted[i];
    pathStack.length = a.depth;
    pathStack.push(`(${a.symbol})`);
    const next = accepted[i + 1];
    nodes.push({ path: rootPath + pathStack.join(''), start: a.at, end: next ? next.at : text.length, depth: a.depth, leaf: !next || next.depth <= a.depth });
  }
  return { nodes, repeats, typos };
}

// ---------------------------------------------------------------- extractors

const WORD_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD_RE = `(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(?:one|two|three|four|five|six|seven|eight|nine)|${Object.keys(WORD_NUM).join('|')})`;
const NUM_RE = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';

/** The unit table (Spec 68 §6.5), longest form first; declared in vocab.json `slicer.unit_table`. */
export const UNIT_TABLE = Object.freeze(SLICER.unit_table.map(([w, u]) => Object.freeze([w, u])));
const UNIT_RE = UNIT_TABLE.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

function wordValue(w) {
  const k = w.toLowerCase();
  if (k in WORD_NUM) return WORD_NUM[k];
  const [t, o] = k.split('-');
  return WORD_NUM[t] + WORD_NUM[o];
}
const numValue = (raw) => (/^\d/.test(raw) ? Number(raw.replace(/,/g, '')) : wordValue(raw));
const unitOf = (u) => (u ? UNIT_TABLE.find(([w]) => w === u.toLowerCase() || w === u)[1] : null);

/**
 * Spans excluded from the anti-vacuity scan (Spec 68 §6.5 "declared patterns"): clause and regulation
 * ids, by-law numbers, dates, zone labels / map codes, diagram / schedule / map numbers, tags. PURE.
 * Declared in vocab.json `slicer.anti_vacuity_exclusions` (moved at S5). Returns [{start, end, kind}].
 */
export function exclusionSpans(text) {
  const pats = SLICER.anti_vacuity_exclusions.map((x) => [x.kind, new RegExp(x.pattern, x.flags)]);
  const out = [];
  for (const [kind, re] of pats) for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, kind });
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

const inSpans = (spans, s, e) => spans.some((x) => x.start <= s && e <= x.end);

/**
 * Numeric literals: value + unit on token boundaries (6 m ≡ 6.0 m), number words → numerals; a number
 * followed by `to|or|and` + a number WITH a unit inherits that unit ("1.0 to 1.5 metres", "five or six
 * dwelling units"). Numbers inside exclusion spans are not literals. Offsets are relative to `text`. PURE.
 */
export function extractLiterals(text) {
  const excl = exclusionSpans(text);
  const re = new RegExp(`(?<![\\w.,-])(${NUM_RE}|${WORD_RE})(?:\\s?(${UNIT_RE})(?![\\w²]))?(?![\\w]|\\.\\d|-(?:half|halves|thirds?|quarters?)\\b)`, 'gi'); // "one-half" is not 1 (left uncovered); "one-way" counts
  const raw = [];
  for (const m of text.matchAll(re)) {
    const s = m.index;
    const numEnd = s + m[1].length;
    if (inSpans(excl, s, numEnd)) continue;
    raw.push({ start: s, end: s + m[0].length, numEnd, raw: m[0], numRaw: m[1], unitRaw: m[2] || null });
  }
  // Unit inheritance across `to | or | and` (right to left so chains inherit).
  for (let i = raw.length - 2; i >= 0; i--) {
    const a = raw[i];
    const b = raw[i + 1];
    const bUnit = b.unitRaw || b.inherited;
    if (a.unitRaw || !bUnit) continue;
    const gap = text.slice(a.end, b.start);
    if (/^(?:\s*,)?\s+(?:to|or|and)\s+$/.test(gap) || /^\s*,\s*$/.test(gap) || /^\s*-\s*$/.test(gap)) a.inherited = bUnit;
  }
  return raw.map((r) => ({
    end: r.end,
    inherited_unit: Boolean(r.inherited),
    raw: r.raw,
    start: r.start,
    unit: unitOf(r.unitRaw || r.inherited || null),
    value: numValue(r.numRaw),
  }));
}

/**
 * The anti-vacuity scan (Spec 68 §6.4 rule 6): every digit run and number word in `text` lies inside
 * an extracted literal or a declared exclusion span. Returns {tokens, uncovered[]}. PURE.
 */
export function scanNumbers(text, literals = extractLiterals(text)) {
  const excl = exclusionSpans(text);
  const tokRe = new RegExp(`\\d+|\\b${WORD_RE}\\b`, 'gi');
  let tokens = 0;
  const uncovered = [];
  for (const m of text.matchAll(tokRe)) {
    tokens++;
    const s = m.index;
    const e = s + m[0].length;
    if (literals.some((l) => l.start <= s && e <= l.end) || inSpans(excl, s, e)) continue;
    uncovered.push({ start: s, end: e, token: m[0], context: text.slice(Math.max(0, s - 30), e + 30) });
  }
  return { tokens, uncovered };
}

/**
 * Amendment tags `[ By-law: … ]` / `[ By-laws: … ]` / `[By-law: …]` and bare `[103-2016]` / `[OMB PL… ]`.
 * Each tag → {start, end, raw, entries:[{raw, bylaw|null, qualifier|null}]}. PURE.
 */
export function extractTags(text) {
  const out = [];
  for (const m of text.matchAll(/\[\s*(By-laws?:\s*)?([^\]]*?)\s*\]/g)) {
    const body = m[2];
    const isTag = Boolean(m[1]) || /^\d{1,5}-\d{2,4}$/.test(body) || /^(?:OMB|LPAT|OLT)\b/.test(body);
    if (!isTag) continue;
    const entries = body.split(/\s*;\s*/).filter(Boolean).map((e) => {
      const b = /^(\d{1,5}-\d{2,4})\s*(.*)$/.exec(e);
      return { bylaw: b ? b[1] : null, qualifier: b ? b[2].trim() || null : e, raw: e };
    });
    out.push({ end: m.index + m[0].length, entries, raw: m[0], start: m.index });
  }
  return out;
}

const levelOf = (sym) => (/^\d+$/.test(sym) ? 'N' : /^[A-Z]$/.test(sym) ? 'U' : /^[ivxl]+$/.test(sym) && ROMAN.includes(sym) ? 'r' : 'l');
const groupsOf = (p) => [...p.matchAll(/\(([0-9A-Za-z]{1,7})\)/g)].map((x) => x[1]);

/** Replace the tail of a base path with continuation groups, aligned on the first group's level. */
function continuePath(baseGroups, cont) {
  const lv = levelOf(cont[0]);
  let at = -1;
  for (let i = baseGroups.length - 1; i >= 0; i--) {
    if (levelOf(baseGroups[i]) === lv) {
      at = i;
      break;
    }
  }
  return at < 0 ? [...baseGroups, ...cont] : [...baseGroups.slice(0, at), ...cont];
}

/**
 * Cross-references to by-law divisions: dotted ids with attached bracket groups, plus the continuation
 * forms `… (1) and (2)`, `… (3)(B) and (C)`, `… (1) to (4)` (a range: from/to). `skip` = spans that
 * are not references (tags, accepted clause markers). Returns [{start, end, raw, citation, id, path,
 * via: direct|and|range_to}]. PURE.
 */
export function extractRefs(text, skip = []) {
  const out = [];
  const re = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){1,3})((?:\([0-9A-Za-z]{1,7}\))*)/g;
  for (const m of text.matchAll(re)) {
    const s = m.index;
    if (inSpans(skip, s, s + m[0].length)) continue;
    const id = m[1];
    const dots = id.split('.').length - 1;
    const before = text.slice(Math.max(0, s - 40), s);
    // A one-dot number is a section id only after a division word ("Section 600.60", "Sections 900.2 to 900.50").
    if (dots === 1 && !m[2] && !/(?:Sections?|Chapters?)\s+(?:[\d.]+(?:\s*,\s*|\s+(?:and|or|to)\s+))*$/i.test(before)) continue;
    let base = groupsOf(m[2]);
    out.push({ citation: id + m[2], end: s + m[0].length, id, path: m[2], raw: m[0], start: s, via: 'direct' });
    // Continuations.
    let pos = s + m[0].length;
    for (;;) {
      const c = /^(\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+|\s+to\s+)((?:\([0-9A-Za-z]{1,7}\))+)(?![\w(])/.exec(text.slice(pos));
      if (!c || !base.length) break;
      const cs = pos + c[1].length;
      if (inSpans(skip, cs, cs + c[2].length)) break;
      const groups = continuePath(base, groupsOf(c[2]));
      const p = groups.map((g) => `(${g})`).join('');
      const via = /to/.test(c[1]) ? 'range_to' : 'and';
      out.push({ citation: id + p, end: cs + c[2].length, id, path: p, raw: c[2], start: cs, via });
      base = groups;
      pos = cs + c[2].length;
    }
  }
  // Chapter references ("Chapter 800").
  for (const m of text.matchAll(/\bChapter\s+(\d{1,3})\b(?!\.)/g)) {
    if (inSpans(skip, m.index, m.index + m[0].length)) continue;
    out.push({ citation: `Chapter ${m[1]}`, end: m.index + m[0].length, id: m[1], path: '', raw: m[0], start: m.index, via: 'direct' });
  }
  return out.sort((a, b) => a.start - b.start || cmpStr(a.citation, b.citation));
}

// ---------------------------------------------------------------- page slicing

/** Numbered regulation heads in an article body (Phase 0 rule + the sequence check). PURE. */
function regulationHeads(body) {
  const heads = [];
  const repeats = []; // a head-shaped `(k)` with k <= the last number (200.15.1 prints (1) twice): disclosed
  let last = 0;
  for (const m of body.matchAll(/(?<=^|\s)\((\d{1,3})\) (?=[A-Z(\[])/g)) {
    const k = Number(m[1]);
    if (heads.length === 0) {
      // The first head is (1), at the start of the article body or after a sentence (a preamble before
      // it is then reported as text_before_first_regulation, never silently absorbed).
      if (k === 1 && (isWs(body.slice(0, m.index)) || breakBefore(body.slice(Math.max(0, m.index - 12), m.index)))) {
        heads.push({ n: k, at: m.index });
        last = k;
      }
      continue;
    }
    const brk = breakBefore(body.slice(Math.max(0, m.index - 12), m.index));
    if (k > last && k <= last + 12 && brk) {
      heads.push({ n: k, at: m.index });
      last = k;
    } else if (k <= last && brk && /^\(\d+\) [A-Z]/.test(body.slice(m.index, m.index + 8))) repeats.push(m.index);
  }
  heads.repeats = repeats;
  return heads;
}

/** Defined-term heads `(n) Term <verb>` under a matcher (Spec 68 §6.4 rule 11). PURE. */
export function definitionHeads(body, matcher = DEFINITION_MATCHER) {
  const verbs = matcher.verbs.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
  // The term never crosses a sentence end or the next numbered head (a short definition must not lend
  // its verb to the head before it).
  const re = new RegExp(`(?<=^|\\s)\\((\\d{1,4})\\) ([A-Z](?:(?!\\(\\d)[^.;:]){0,90}?)\\s+(?:${verbs})\\b`, matcher.caseInsensitive ? 'gi' : 'g');
  const heads = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    // [A-Z] under the `i` flag also matches lower case: the term itself must start upper-case.
    if (!/^[A-Z]/.test(m[2])) continue;
    const k = Number(m[1]);
    if (k <= last) continue;
    if (heads.length && !breakBefore(body.slice(Math.max(0, m.index - 12), m.index))) continue;
    heads.push({ n: k, at: m.index, term: m[2].trim() });
    last = k;
  }
  return heads;
}

/**
 * The numbering-sequence check (Spec 68 §9 G-TEXT): every `(n) Head` in a body whose number fits
 * between its accepted neighbours (prev < n < next; after the last head, n ≤ prev + 12) must itself be
 * an accepted head. Returns {unsliced[], gaps[]} (gaps are counted, never failures: the by-law reserves
 * numbers, 1.20.1(3)). PURE.
 */
export function numberingCheck(body, heads, { definitions = false } = {}) {
  const unsliced = [];
  const gaps = [];
  const at = new Set(heads.map((h) => h.at));
  // Definitions are numbered sparsely by design (5, 10, 15, ...): only regulation gaps are counted.
  if (!definitions) for (let i = 1; i < heads.length; i++) if (heads[i].n !== heads[i - 1].n + 1) gaps.push({ after: heads[i - 1].n, next: heads[i].n });
  for (const m of body.matchAll(/(?<=^|\s)\((\d{1,4})\) (?=[A-Z(\[])/g)) {
    if (at.has(m.index)) continue;
    // A head candidate follows a list break (a use-table footnote "Day Nursery (4) Eating" does not).
    if (heads.length > 0 && m.index > 0 && !breakBefore(body.slice(Math.max(0, m.index - 12), m.index))) continue;
    const k = Number(m[1]);
    let prev = null;
    let next = null;
    for (const h of heads) {
      if (h.at < m.index) prev = h;
      else if (next === null) next = h;
    }
    // No accepted head yet: a head-shaped (1) the slicer refused is unsliced (the article would
    // otherwise collapse silently into one `#article` row). After the last head there is no window.
    const fits = prev ? k > prev.n && (next ? k < next.n : true) : k === 1;
    if (fits) unsliced.push({ n: k, at: m.index, context: body.slice(Math.max(0, m.index - 40), m.index + 50) });
  }
  return { unsliced, gaps };
}

/** Normalize a TOC title the way the page body reads (collapse whitespace). */
const tocTitle = (t) => t.replace(/\s+/g, ' ').trim();

/**
 * Slice one section page. Input {key, section, file, html, normalized, status?, ruling?, carve_in?}.
 * Returns {key, rows[], spans[], problems[], numbering:{unsliced[], gaps[]}}; offsets are page offsets
 * into `normalized`. PURE.
 */
export function slicePage(input) {
  const { key, section, file, html, normalized: t } = input;
  const problems = [];
  const spans = [];
  const rows = [];
  const numbering = { unsliced: [], gaps: [] };
  const toc = parseToc(html);
  const chapter = section.split('.')[0];
  const chRow = toc.find((r) => r.level === 'chapter' && r.id === chapter);
  const secRow = toc.find((r) => r.id === section);
  if (!chRow || !secRow) {
    problems.push(`toc_missing_section: ${key} TOC lacks Chapter ${chapter} or ${section}`);
    return { key, numbering, problems, rows, spans };
  }
  const sectionHead = `Chapter ${chapter} ${tocTitle(chRow.title)} ${section} ${tocTitle(secRow.title)}`;
  const bodyStart = t.lastIndexOf(`${sectionHead} `);
  const footer = t.lastIndexOf(' &copy;City of Toronto');
  if (footer < 0) problems.push(`footer_not_found: ${key}`);
  if (!file) problems.push(`page_file_missing: ${key}`);
  const end = footer >= 0 ? footer : t.length;
  if (bodyStart < 0) {
    problems.push(`body_not_found: ${key} has no "${sectionHead}" heading`);
    return { key, numbering, problems, rows, spans };
  }
  spans.push({ end: bodyStart, kind: 'header_toc', start: 0 });
  spans.push({ end: bodyStart + sectionHead.length, kind: 'section_heading', start: bodyStart });
  if (footer >= 0) spans.push({ end: t.length, kind: 'footer', start: footer + 1 });

  const seen = new Set();
  const own = toc.filter((r) => r.level !== 'chapter' && r.id.startsWith(`${section}.`) && (r.href.startsWith('#') || r.href.startsWith(`${file}#`)) && !seen.has(r.id) && seen.add(r.id));
  const ids = own.map((r) => r.id);
  // Locate every own heading in TOC order: `id title `.
  let cur = bodyStart + sectionHead.length;
  const heads = [];
  for (const r of own) {
    const needle = `${r.id} ${tocTitle(r.title)}`;
    const at = t.indexOf(`${needle} `, cur);
    if (at < 0 || at >= end) {
      problems.push(`heading_not_found: ${key} ${r.id} "${tocTitle(r.title)}"`);
      continue;
    }
    heads.push({ id: r.id, title: tocTitle(r.title), at, headEnd: at + needle.length, leaf: !ids.some((x) => x.startsWith(`${r.id}.`)) });
    cur = at + needle.length;
  }
  // A body heading the page TOC omits (200.5.200.50 on the 200.5 page) is still an article; it is
  // sliced and disclosed as a `heading_not_in_toc` source defect on its first row.
  const known = new Set(toc.map((r) => r.id));
  const bodyFrom = bodyStart + sectionHead.length;
  for (const m of t.slice(bodyFrom, end).matchAll(/(?<=[.\]:;)] )(\d{1,3}(?:\.\d{1,3}){1,3}) (?=[A-Z])/g)) {
    const id = m[1];
    if (!id.startsWith(`${section}.`) || known.has(id)) continue;
    const at = bodyFrom + m.index;
    const one = t.indexOf(' (1) ', at);
    if (one < 0 || one - at > 160) continue;
    heads.push({ id, title: t.slice(at + id.length + 1, one), at, headEnd: one, leaf: true, untracked: true });
  }
  heads.sort((a, b) => a.at - b.at);
  const carve = input.carve_in?.length ? new Set(input.carve_in) : null;
  if (carve) for (const c of carve) if (!heads.some((h) => h.id === c && h.leaf)) problems.push(`carve_in_not_found: ${key} ${c}`);

  // Articles: TOC leaves; a page with no article sections slices the section itself as one article.
  const articles = [];
  if (heads.length === 0) {
    if (!carve || carve.has(section)) articles.push({ id: section, title: tocTitle(secRow.title), bodyFrom: bodyStart + sectionHead.length, bodyTo: end });
    else spans.push({ end, kind: 'outside_carve_in', start: bodyStart + sectionHead.length });
  }
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const to = i + 1 < heads.length ? heads[i + 1].at : end;
    // A heading with child headings is a part heading, unless text follows it: then it is also an
    // article (200.5.1 "General" holds regulations (1)..(4) before its child 200.5.1.10).
    if (!h.leaf && isWs(t.slice(h.headEnd, to))) {
      spans.push({ end: h.headEnd, kind: 'part_heading', start: h.at });
      continue;
    }
    if (carve && !carve.has(h.id)) {
      spans.push({ end: to, kind: 'outside_carve_in', start: h.at });
      continue;
    }
    spans.push({ end: h.headEnd, kind: 'article_heading', start: h.at });
    articles.push({ id: h.id, title: h.title, bodyFrom: h.headEnd, bodyTo: to, headAt: h.at, untracked: Boolean(h.untracked) });
  }

  const definitions = DEFINITION_SECTIONS.includes(section);
  for (const a of articles) {
    const body = t.slice(a.bodyFrom, a.bodyTo);
    const lead = body.length - body.trimStart().length;
    const hs = definitions ? definitionHeads(body, input.definitionMatcher || DEFINITION_MATCHER) : regulationHeads(body);
    const nc = numberingCheck(body, hs, { definitions });
    for (const u of nc.unsliced) numbering.unsliced.push({ article: a.id, key, n: u.n, context: u.context });
    for (const g of nc.gaps) numbering.gaps.push({ article: a.id, key, ...g });
    if (hs.length === 0) {
      if (isWs(body)) {
        problems.push(`empty_article: ${key} ${a.id}`);
        continue;
      }
      rows.push(makeRow({ input, article: a, id: `${a.id}#article`, n: null, rootPath: '', from: a.bodyFrom + lead, to: a.bodyFrom + body.trimEnd().length, t, definition: definitions }));
      continue;
    }
    if (!isWs(body.slice(0, hs[0].at))) problems.push(`text_before_first_regulation: ${key} ${a.id}`);
    for (let i = 0; i < hs.length; i++) {
      const from = a.bodyFrom + hs[i].at;
      const rawTo = i + 1 < hs.length ? a.bodyFrom + hs[i + 1].at : a.bodyTo;
      const to = from + t.slice(from, rawTo).trimEnd().length;
      const repeatsAt = (hs.repeats || []).map((x) => a.bodyFrom + x).filter((x) => x >= from && x < to);
      rows.push(makeRow({ input, article: a, id: `${a.id}(${hs[i].n})`, n: hs[i].n, term: hs[i].term, rootPath: `(${hs[i].n})`, from, to, t, definition: definitions, repeatsAt }));
    }
  }
  for (const a of articles) {
    if (!a.untracked) continue;
    const first = rows.find((r) => r.article === a.id);
    if (first) first.defects.push({ clause_path: first.clauses[0].path, code: null, context: t.slice(a.headAt, a.headAt + 80), index: 0, kind: 'heading_not_in_toc' });
  }
  return { key, numbering, problems, rows, spans };
}

function makeRow({ input, article, id, n, term, rootPath, from, to, t, definition = false, repeatsAt = [] }) {
  const verbatim = t.slice(from, to);
  const { nodes, repeats, typos } = parseClauses(verbatim, rootPath);
  const tags = extractTags(verbatim);
  const markers = nodes.filter((x) => x.depth >= 0).map((x) => ({ start: x.start, end: verbatim.indexOf(')', x.start) + 1 }));
  const refs = extractRefs(verbatim, [...tags, ...markers]);
  const literals = extractLiterals(verbatim);
  const scan = scanNumbers(verbatim, literals);
  const nodeAt = (pos) => {
    let hit = nodes[0];
    for (const x of nodes) if (x.start <= pos) hit = x;
    return hit;
  };
  const clauses = nodes.map((x) => ({ end: x.end, leaf: x.leaf, path: x.path, start: x.start, text: verbatim.slice(x.start, x.end) }));
  const defects = defectChars(verbatim).map((d) => ({ clause_path: nodeAt(d.index).path, code: d.code, context: verbatim.slice(Math.max(0, d.index - 40), d.index + 10), index: d.index, kind: 'garbled_character' }));
  for (const c of clauses) {
    if (!c.leaf) continue;
    const own = c.text.replace(/\[[^\]]*\]/g, '').trim();
    if (own.endsWith(':')) defects.push({ clause_path: c.path, code: null, context: own.slice(-60), index: c.end, kind: 'lead_in_without_items' });
  }
  // Repeated divisions are disclosed once per row (with their count), never split into duplicate ids.
  if (repeats.length) defects.push({ clause_path: nodeAt(repeats[0].at).path, code: null, context: verbatim.slice(repeats[0].at, repeats[0].at + 60), count: repeats.length, index: repeats[0].at, kind: 'division_repeat' });
  for (const ty of typos) defects.push({ clause_path: nodeAt(ty.at).path, code: null, context: verbatim.slice(ty.at, ty.at + 40), index: ty.at, kind: 'marker_typo' });
  for (const at of repeatsAt) defects.push({ clause_path: nodeAt(at - from).path, code: null, context: t.slice(at, at + 60), index: at - from, kind: 'numbering_repeat' });
  const withPath = (x) => ({ ...x, clause_path: nodeAt(x.start).path });
  return {
    article: article.id,
    article_title: article.title,
    carve_in: Boolean(input.carve_in?.length),
    clauses,
    defects,
    end: to,
    kind: definition ? 'definition' : n === null ? 'article' : 'regulation',
    literals: literals.map(withPath),
    number: n,
    page: input.key,
    refs: refs.map(withPath),
    regulation_id: id,
    retired: input.status === 'retired',
    ...(input.status === 'retired' ? { retired_ruling: input.ruling } : {}),
    section: input.section,
    sha256: sha256(Buffer.from(verbatim, 'utf8')),
    start: from,
    tags: tags.map(withPath),
    ...(term !== undefined ? { term } : {}),
    uncovered_numbers: scan.uncovered.map(withPath),
    verbatim,
  };
}

/** Leaf units of a row: {unit_id, regulation_id, clause_path, citation, text, context, sha256}. PURE. */
export function unitsOf(row) {
  const units = [];
  const byPath = new Map(row.clauses.map((c) => [c.path, c]));
  for (const c of row.clauses) {
    if (!c.leaf) continue;
    const ancestors = [];
    for (const [p, x] of byPath) if (p !== c.path && c.path.startsWith(p) && x.start < c.start) ancestors.push(x);
    const context = ancestors.map((x) => x.text.trim());
    const text = c.text.trim();
    const full = [...context, text].join(' ');
    units.push({
      citation: `${row.article}${c.path}`,
      clause_path: c.path,
      context,
      page: row.page,
      regulation_id: row.regulation_id,
      retired: row.retired,
      sha256: sha256(Buffer.from(full, 'utf8')),
      text,
      unit_id: `${row.regulation_id}#${c.path}`,
    });
  }
  return units;
}

/**
 * Slice the whole snapshot. `pages` = [{key, role, section, file, html, normalized, status?, ruling?,
 * carve_in?}] (the toc_root page is not sliced). Returns {slicer_version, rows[], units[], spans{},
 * problems[], numbering, defects[], pages{key: counts}, totals}. Deterministic. PURE.
 */
export function sliceSnapshot({ pages, definitionMatcher }) {
  const rows = [];
  const spans = {};
  const problems = [];
  const numbering = { unsliced: [], gaps: [] };
  const pageCounts = {};
  for (const p of [...pages].sort((a, b) => cmpStr(a.key, b.key))) {
    if (p.role !== 'section') continue;
    pageCounts[p.key] = { defects: 0, definitions: 0, literals: 0, refs: 0, retired_rows: 0, rows: 0, tag_entries: 0, tags: 0, uncovered_numbers: 0, units: 0 };
    const r = slicePage({ ...p, definitionMatcher });
    rows.push(...r.rows);
    spans[p.key] = r.spans.sort((a, b) => a.start - b.start);
    problems.push(...r.problems);
    numbering.unsliced.push(...r.numbering.unsliced);
    numbering.gaps.push(...r.numbering.gaps);
  }
  const units = rows.flatMap(unitsOf);
  const defects = rows.flatMap((r) => r.defects.map((d) => ({ ...d, page: r.page, regulation_id: r.regulation_id })));
  for (const r of rows) {
    const c = (pageCounts[r.page] ||= { defects: 0, definitions: 0, literals: 0, refs: 0, retired_rows: 0, rows: 0, tag_entries: 0, tags: 0, uncovered_numbers: 0, units: 0 });
    c.rows++;
    if (r.kind === 'definition') c.definitions++;
    if (r.retired) c.retired_rows++;
    c.literals += r.literals.length;
    c.refs += r.refs.length;
    c.tags += r.tags.length;
    c.tag_entries += r.tags.reduce((s, x) => s + x.entries.length, 0);
    c.defects += r.defects.length;
    c.uncovered_numbers += r.uncovered_numbers.length;
  }
  for (const u of units) pageCounts[u.page].units++;
  const totals = { pages: Object.keys(pageCounts).length, rows: rows.length, units: units.length };
  for (const k of ['definitions', 'literals', 'refs', 'tags', 'tag_entries', 'defects', 'retired_rows', 'uncovered_numbers']) totals[k] = Object.values(pageCounts).reduce((s, c) => s + c[k], 0);
  return { defects, numbering, pages: pageCounts, problems, rows, slicer_version: SLICER_VERSION, spans, totals, units };
}

/** Read the committed snapshot into sliceSnapshot() input (the one I/O function here). */
export function loadSnapshotPages(seeds) {
  const pageSet = JSON.parse(fs.readFileSync(path.join(seeds, 'page-set.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8'));
  const byKey = new Map(pageSet.pages.map((p) => [p.key, p]));
  const pages = manifest.pages.map((m) => {
    const p = byKey.get(m.key) || {};
    return {
      carve_in: p.carve_in || m.carve_in,
      file: p.file,
      html: decodePage(fs.readFileSync(path.join(seeds, 'pages', `${m.key}.htm`))),
      key: m.key,
      normalized: fs.readFileSync(path.join(seeds, 'pages', `${m.key}.txt`), 'utf8'),
      role: m.role,
      ruling: p.ruling,
      section: m.section,
      status: p.status || m.status,
    };
  });
  return { adoption_id: manifest.adoption_id, normalizer_version: manifest.normalizer_version, pages };
}
