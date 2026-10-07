// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 6 (anti-vacuity), §6.5 (unit table, number
//            words, anti-vacuity exclusions), §9 G-TEXT (source defects are counted disclosures; inline lists
//            inside one cell are the only text-pattern split, Spec 69 M-57), §10 stage 2 (extract literals,
//            units, tags with clause path, refs); docs/reports/mcbylaw-phase1-plan.md S4.
//
// Text-level helpers of the slicer, all PURE: the inline-list parser (used only inside one HTML cell or an
// enacting-text regulation), the defect-character scan, and the literal / tag / cross-reference extractors
// with the anti-vacuity scan. The structure itself comes from the HTML (slice.mjs + html.mjs).

/**
 * Characters that may appear in body text. Anything else in a row is a counted `source_defect`
 * disclosure (Spec 68 §9 G-TEXT), never a failure. U+0096 is the City's cp1252 en-dash served under
 * a declared iso-8859-1 charset (normalizer v1 keeps it); it is allowed, not a defect (a normalizer v2
 * mapping it to '-' is a proposed S3 follow-up).
 */
const ALLOWED_CHAR = /[\x20-\x7eçé²§°½×≤≥]/;
const ENCODING_DASH = '\u0096';

export const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv', 'xxvi', 'xxvii', 'xxviii', 'xxix', 'xxx', 'xxxi', 'xxxii', 'xxxiii', 'xxxiv', 'xxxv', 'xxxvi', 'xxxvii', 'xxxviii', 'xxxix', 'xl'];
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
/** Clause levels below the regulation, in order (1.20.1(2)). */
export const LEVELS = [UPPER, ROMAN, LOWER];

export const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

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
export function breakBefore(prefix) {
  const tail = prefix.slice(-8);
  if (BREAK_BEFORE.test(tail)) return true;
  const ch = prefix.slice(-2, -1);
  return ch !== '' && /\s$/.test(prefix) && defectChars(ch).length > 0;
}

/** Text after a marker that makes it a reference, not a division: `(a) to (d) above`, `(B) and (C)`. */
/** A reference word before a bracketed symbol ("regulation (B)", "despite (A)") makes it a reference. */
export const REF_BEFORE = /(?:regulations?|clauses?|with|of|in|under|and|or|to|see|despite)\s$/i;
export const REF_AFTER =/^(?:(?:to|and|or|through)\s+\(|(?:inclusive|above|below)\b)|^[,)]/;

/**
 * Parse the clause tree of one regulation's verbatim. Returns {nodes, repeats, typos}: nodes in text
 * order, each {path, start, end, depth, leaf}, whose own segments partition [0, text.length);
 * `repeats` = list-break markers re-using a symbol of an open level (tables, duplicated City text:
 * kept inside the preceding leaf, disclosed); `typos` = "(I)" read as (i). `rootPath` is the
 * regulation's own path (`(3)`, or `` for an `#article` row). Options: `startLevel` = index in LEVELS of the
 * first level below the root (0 = (A) under a regulation, 1 = (i) under an (A), 2 = (a)); `atStart` = a
 * marker may open the text (a table cell that begins "(A) ..."). PURE.
 */
export function parseClauses(text, rootPath, { startLevel = 0, atStart = false, cell = false } = {}) {
  const LV = LEVELS.slice(startLevel);
  const re = atStart ? /(?<=^|\s)\(([A-Z]|[ivxl]{1,7}|[a-z])\)(?= )/g : /(?<=\s)\(([A-Z]|[ivxl]{1,7}|[a-z])\)(?= )/g;
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
    if (childDepth < LV.length && LV[childDepth][0] === sym) pick = { depth: childDepth, idx: 0, first: true };
    for (let d = stack.length - 1; d >= 0 && !pick; d--) {
      const idx = LV[d].indexOf(sym);
      if (idx === stack[d] + 1) pick = { depth: d, idx, first: false };
    }
    if (!pick && sym === 'I' && LV[childDepth] === ROMAN && breakBefore(prefix)) {
      pick = { depth: 1, idx: 0, first: true };
      typos.push({ at: m.index, symbol: 'I', as: 'i' });
      sym = 'i';
    }
    if (!pick) {
      if (breakBefore(prefix) && stack.some((open, d) => LV[d].indexOf(sym) >= 0 && LV[d].indexOf(sym) <= open)) repeats.push({ at: m.index, symbol: sym });
      continue;
    }
    // A sibling needs a list break before it; a first child may follow a title ("(1) Height (A) ...").
    // Inside ONE table cell a list sibling may follow without punctuation ("... dwelling unit (B) In Parking
    // Zone B", 200.15.10.5), unless a reference word precedes it ("in (B)").
    if (!pick.first && m.index > 0 && !breakBefore(prefix) && (!cell || REF_BEFORE.test(prefix))) continue;
    if (pick.first && !breakBefore(prefix) && REF_BEFORE.test(prefix)) continue;
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

const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?';
const WORD_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD_RE = `(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(?:one|two|three|four|five|six|seven|eight|nine)|${Object.keys(WORD_NUM).join('|')})`;
const NUM_RE = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';

/** The unit table (Spec 68 §6.5), longest form first. */
export const UNIT_TABLE = Object.freeze([
  ['square metres', 'm2'], ['square metre', 'm2'], ['sq. m', 'm2'], ['m²', 'm2'], ['m2', 'm2'],
  ['metres', 'm'], ['metre', 'm'], ['m', 'm'],
  ['per cent', 'pct'], ['percent', 'pct'], ['%', 'pct'],
  ['storeys', 'storeys'], ['storey', 'storeys'],
  ['dwelling units', 'units'], ['dwelling unit', 'units'],
]);
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
 * Declared here until S5 moves them to vocab.json (proposed patch). Returns [{start, end, kind}].
 */
export function exclusionSpans(text) {
  const pats = [
    ['tag', /\[[^\]]*\]/g],
    ['id', /(?<![\d.])\d{1,3}(?:\.\d{1,3}){2,3}(?:\([0-9A-Za-z]{1,7}\))*/g],
    ['id', /\b(?:Sections?|Chapters?|Articles?|Clauses?|Regulations?)\s+\d{1,3}(?:\.\d{1,3})*(?:\([0-9A-Za-z]{1,7}\))*(?:(?:\s*,\s*|\s+(?:and|or|to)\s+)\d{1,3}(?:\.\d{1,3})*(?:\([0-9A-Za-z]{1,7}\))*)*/gi],
    ['id', /\(\d{1,4}(?:\s*,\s*\d{1,4})*\)/g],
    ['bylaw_number', /(?<![\w.])\d{1,5}-\d{2,4}(?![\w.])/g],
    ['bylaw_number', /\bBy-laws?\s+(?:No\.?\s*)?\d{1,5}(?:-\d{2,4})?/gi],
    ['bylaw_number', /\bSection\s+\d{1,4}-\d{1,3}(?:\.\d{1,3})?\s+of\s+Chapter\s+\d{1,4}/g],
    // Statute chapter citations ("R.S.O. 1990, c. P.13", "S.O. 2006, c.11", "R.S.C. 1985, Chapter 1 (5th Supp.)").
    ['statute_citation', /\b(?:R\.S\.O|S\.O|R\.S\.C)\.?\s*\d{4},?\s*(?:c\.\s*[A-Z]?\.?\s*\d+|Chapter\s+\d+(?:\s*\(\d+(?:st|nd|rd|th)\s+Supp\.\))?)/g],
    ['date', new RegExp(`\\b${MONTH} \\d{1,2},? \\d{4}`, 'g')],
    ['date', /\b\d{4}-\d{2}-\d{2}\b/g],
    ['label_code', /\b[A-Za-z]{1,3}-?\d+(?:\.\d+)?\b/g],
    // Street numbers and file numbers glued to letters ("25R", "21a", "9A", "A0771/05TEY").
    ['label_code', /\b\d+[A-Za-z]+\b|\b[A-Z]\d+\/\d+[A-Z]*\b/g],
    ['map_number', /\b(?:Diagrams?|Schedules?|Maps?|Figures?|Tables?|Appendix|Appendices|Sheets?)\s+\d+(?:\s*(?:,|and|to|or)\s*\d+)*/g],
  ];
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
  const re = new RegExp(`(?<![\\w.,])(${NUM_RE}|${WORD_RE})(?:\\s?(${UNIT_RE})(?![\\w²]))?(?![\\w]|\\.\\d|-(?:half|halves|thirds?|quarters?)\\b)`, 'gi'); // "one-half" is not 1 (left uncovered); "one-way" counts
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

export const levelOf = (sym) => (/^\d+$/.test(sym) ? 'N' : /^[A-Z]$/.test(sym) ? 'U' : /^[ivxl]+$/.test(sym) && ROMAN.includes(sym) ? 'r' : 'l');
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

