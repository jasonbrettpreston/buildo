/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5
 *
 * CoA decision-notice value extractors — a PURE CommonJS module.
 *
 * It reads ONLY `./vocab.json` (the closed sets of the ingestor). It never touches `fs`,
 * `child_process`, `process.env`, `Date`, `Math.random` or the network, so a static scan can
 * prove purity. Every returned string is either a value of a vocab closed set or a value
 * derived from the input by the rules in §D5.
 */
'use strict';

const vocab = require('./vocab.json');

// --- unit relabelling -------------------------------------------------------------------------

const RELABEL_KEYS = Object.keys(vocab.unit_relabel).sort((a, b) => b.length - a.length);

/** Collapse whitespace around a unit string: trim + one space between words. */
function collapseWs(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * relabelUnit(raw) → canonical unit string or null.
 * Lower-case, trim, collapse internal whitespace, then look up vocab.unit_relabel.
 */
function relabelUnit(raw) {
  if (typeof raw !== 'string') return null;
  const key = collapseWs(raw).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(vocab.unit_relabel, key)) {
    return vocab.unit_relabel[key];
  }
  return null;
}

/** unitFamily(unit) → vocab.unit_family[unit] or null. */
function unitFamily(unit) {
  if (typeof unit !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(vocab.unit_family, unit)
    ? vocab.unit_family[unit]
    : null;
}

// --- value extraction -------------------------------------------------------------------------

// A number token: thousands-separated (comma + exactly 3 digits) or a plain run of digits,
// with an optional fractional part. The lookbehind blocks a match that starts inside a longer
// number, after a decimal point, after a hyphen (by-law numbers like 569-2013) or after a letter (a zone
// label such as R2 or an exception x804 is not a measured value).
const NUMBER_RE = /(?<![\d.,A-Za-z-])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;

const isLetter = (ch) => ch !== undefined && /[A-Za-z]/.test(ch);

/** Whether a unit-key match at `at` is anchored: an alpha key needs a non-letter/end boundary. */
function unitBoundaryOk(text, key, at) {
  if (/^[a-z]$/.test(key) || /[a-z]/.test(key)) {
    const after = text[at + key.length];
    if (isLetter(after)) return false;
  }
  return true;
}

/** The longest vocab.unit_relabel key matching case-insensitively at position `at`, or null. */
function longestUnitAt(text, at) {
  const lower = text.toLowerCase();
  for (const key of RELABEL_KEYS) {
    if (lower.startsWith(key, at) && unitBoundaryOk(lower, key, at)) return key;
  }
  return null;
}

const NUMBER_WORDS = Object.keys(vocab.number_words).join('|');
// A number word ("two", "No") counts only when a unit key follows it directly.
const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS})\\s+`, 'gi');
// "the number of storeys is 3": the unit precedes the number.
const COUNT_OF_RE = new RegExp(
  `\\bnumber of (storeys|parking spaces|dwelling units|units)\\s+(?:is|are|will be|shall be)\\s+(\\d+|${NUMBER_WORDS})\\b`,
  'gi',
);

/**
 * extractValues(sentence) → [{value, unit, index}] in text order.
 * `unit` is the relabelled canonical unit, or null when no key matches.
 * Three sources (fold LCN-D4): numeric tokens; a vocab.number_words word directly followed by a
 * unit ("two parking spaces", "No parking spaces" = 0); and "number of <unit> is <n>", where the
 * unit precedes the number.
 */
function extractValues(sentence) {
  if (typeof sentence !== 'string') return [];
  const out = [];
  NUMBER_RE.lastIndex = 0;
  let m;
  while ((m = NUMBER_RE.exec(sentence)) !== null) {
    const digits = m[1];
    const frac = m[2] === undefined ? '' : m[2];
    const endOfNumber = m.index + digits.length + frac.length;

    // Reject a token immediately followed by whitespace then `.digit` (`0 .357 times`).
    if (/^\s\.\d/.test(sentence.slice(endOfNumber))) continue;
    // Reject `-` + digit immediately after the token.
    if (/^-\d/.test(sentence.slice(endOfNumber))) continue;
    // Reject a token immediately preceded by digit + `-` (by-law numbers).
    if (/\d-$/.test(sentence.slice(0, m.index))) continue;

    // Parse: a comma followed by exactly 3 digits is a thousands separator (already enforced by
    // the pattern group); any other comma ends the number (so we never get here with a stray one).
    const value = Number(digits.replace(/,/g, '') + frac);
    if (!Number.isFinite(value) || value < 0) continue;

    let unit = null;
    const rest = sentence.slice(endOfNumber);
    const mWs = rest.match(/^\s*/);
    const after = endOfNumber + mWs[0].length;
    const key = longestUnitAt(sentence, after);
    if (key !== null) unit = vocab.unit_relabel[key];

    out.push({ value, unit, index: m.index });
  }

  // number words: only when a unit key follows directly (else "one for the suite" would count)
  NUMBER_WORD_RE.lastIndex = 0;
  while ((m = NUMBER_WORD_RE.exec(sentence)) !== null) {
    const after = m.index + m[0].length;
    const key = longestUnitAt(sentence, after);
    if (key === null) continue;
    out.push({
      value: vocab.number_words[m[1].toLowerCase()],
      unit: vocab.unit_relabel[key],
      index: m.index,
    });
  }

  // "number of storeys is 3": the unit precedes the number
  COUNT_OF_RE.lastIndex = 0;
  while ((m = COUNT_OF_RE.exec(sentence)) !== null) {
    const unit = relabelUnit(m[1]);
    const raw = m[2].toLowerCase();
    const value = /^\d+$/.test(raw) ? Number(raw) : vocab.number_words[raw];
    if (unit === null || value === undefined) continue;
    const numberAt = m.index + m[0].length - m[2].length;
    // the numeric pass saw this token with no unit: replace that entry
    const dup = out.findIndex((v) => v.index === numberAt);
    if (dup >= 0) out.splice(dup, 1);
    out.push({ value, unit, index: numberAt });
  }

  return out.sort((a, b) => a.index - b.index);
}

// --- side classification ----------------------------------------------------------------------

/** Count whole-phrase, case-insensitive, word-bounded hits of `phrase` in `text`. */
function countPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  const m = text.match(re);
  return m ? m.length : 0;
}

/** Remove vocab.adjectival_required phrases ("the required front yard"): an adjective, not a side. */
function dropAdjectivalRequired(text) {
  let t = text;
  for (const phrase of vocab.adjectival_required) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }
  return t;
}

/** classifySide(sentence) → 'proposed' | 'required' | null. */
function classifySide(sentence) {
  if (typeof sentence !== 'string' || sentence === '') return null;
  const count = (t) => {
    let proposed = 0;
    let required = 0;
    for (const p of vocab.side_lexicon.proposed) proposed += countPhrase(t, p);
    for (const p of vocab.side_lexicon.required) required += countPhrase(t, p);
    return { proposed, required };
  };
  let c = count(sentence);
  // "the required <noun>" is read as an adjective only to break a tie: "51% of the required front
  // yard landscaping will be maintained" is proposed, while "The required front yard setback is
  // 6 metres" (no proposed word) stays required.
  if (c.proposed > 0 && c.required > 0) c = count(dropAdjectivalRequired(sentence));
  if (c.proposed > 0 && c.required === 0) return 'proposed';
  if (c.required > 0 && c.proposed === 0) return 'required';
  return null;
}

// --- pair splitting ---------------------------------------------------------------------------

// Sentence boundaries: `;` + space; `.` + space before a capital, a digit or `(` (never after `No.`); a
// boundary the PDF lost its period at: a value + unit, a space, then a sentence-opening word.
const SENTENCE_RE = new RegExp(
  [
    '(?<=;)\\s+',
    '(?<=\\.)(?<!\\bNo\\.)\\s+(?=[A-Z0-9(])',
    '(?<=\\d(?:\\.\\d+)?\\s?(?:m|m2|m²|m�|%|metres))\\s+(?=(?:The|In this case|A|An|No|There|This)\\s)',
  ].join('|'),
);

const hasUnitedValue = (s) => extractValues(s).some((v) => v.unit !== null);

/**
 * splitPair(body) → {required, proposed, method, reversed, swapped}.
 * Normal `whereas` order is proposed-before, required-after. A `whereas` whose BOTH halves read
 * the other way round is swapped (`swapped: true`); a one-sided signal is `reversed` (refused).
 * In sentence mode, when one sentence reads `required` and none reads `proposed`, the first other
 * sentence holding a united value and no side words is the proposed side ("4.7 m² is within 4 m").
 */
function splitPair(body) {
  if (typeof body !== 'string') {
    return {
      required: null,
      proposed: null,
      method: null,
      reversed: false,
      swapped: false,
    };
  }
  const b = collapseWs(body);

  const whereas = /\bwhereas\b/i.exec(b);
  if (whereas) {
    const before = b.slice(0, whereas.index).trim();
    const after = b.slice(whereas.index + whereas[0].length).trim();
    const sb = classifySide(before);
    const sa = classifySide(after);
    if (sb === 'required' && sa === 'proposed') {
      return {
        required: before,
        proposed: after,
        method: 'whereas',
        reversed: false,
        swapped: true,
      };
    }
    const reversed = sb === 'required' || sa === 'proposed';
    return {
      required: after,
      proposed: before,
      method: 'whereas',
      reversed,
      swapped: false,
    };
  }

  const sentences = b.split(SENTENCE_RE).filter((s) => s !== undefined && s.trim() !== '');
  let required = null;
  let proposed = null;
  for (const s of sentences) {
    const side = classifySide(s);
    if (!required && side === 'required') required = s;
    if (!proposed && side === 'proposed') proposed = s;
  }
  if (required !== null && proposed === null) {
    proposed =
      sentences.find((s) => s !== required && classifySide(s) === null && hasUnitedValue(s)) ||
      null;
  }
  const method = required !== null || proposed !== null ? 'sentences' : null;
  return { required, proposed, method, reversed: false, swapped: false };
}

// --- bound detection --------------------------------------------------------------------------

/** detectBound(sentence) → 'min' | 'max' | 'exact' | null (phrases of >1 family → null). */
function detectBound(sentence) {
  if (typeof sentence !== 'string' || sentence === '') return null;
  const found = [];
  for (const family of Object.keys(vocab.bound_phrases)) {
    for (const phrase of vocab.bound_phrases[family]) {
      if (countPhrase(sentence, phrase) > 0) {
        found.push(family);
        break;
      }
    }
  }
  return found.length === 1 ? found[0] : null;
}

// --- compound / qualified ---------------------------------------------------------------------

/** First word-bounded, case-insensitive hit of any `phrases` entry in `text`, or -1. */
function firstPhraseAt(text, phrases) {
  let best = -1;
  for (const phrase of phrases) {
    const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`\\b${escaped}\\b`, 'i').exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

/**
 * isCompound(sentence) → true when the requirement is a FORMULA (vocab.formula_markers:
 * "plus", "for each", "for every"): its value is computed, so no single required value exists.
 * Lists, alternatives and dimension pairs are not compound here; classifyItem aligns them.
 */
function isCompound(sentence) {
  if (typeof sentence !== 'string' || sentence === '') return false;
  return firstPhraseAt(sentence, vocab.formula_markers) >= 0;
}

/** isQualified(text) → true when any vocab.qualified_markers phrase occurs (substring). */
function isQualified(text) {
  if (typeof text !== 'string' || text === '') return false;
  const lower = text.toLowerCase();
  return vocab.qualified_markers.some((marker) => lower.includes(marker.toLowerCase()));
}

/** Whether position `at` of `text` sits inside an open parenthesis. */
function inParens(text, at) {
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && depth > 0) depth--;
  }
  return depth > 0;
}

/**
 * sideValues(text, {conditional}) → {main, cond, dropped}.
 * United values only. A parenthetical value is an equivalent ("33% of the lot area (130.4 m²)")
 * and is dropped when a value outside parentheses exists. With `conditional`, values after the
 * first vocab.conditional_markers phrase ("if", "provided that") are conditions, kept apart.
 */
function sideValues(text, opts) {
  const all = extractValues(text || '').filter((v) => v.unit !== null);
  const outside = all.filter((v) => !inParens(text, v.index));
  const kept = outside.length > 0 ? outside : all;
  const condAt =
    opts && opts.conditional ? firstPhraseAt(text || '', vocab.conditional_markers) : -1;
  const main = condAt < 0 ? kept : kept.filter((v) => v.index < condAt);
  const cond = condAt < 0 ? [] : kept.filter((v) => v.index >= condAt);
  return {
    main,
    cond,
    condText: condAt < 0 ? '' : text.slice(condAt),
    dropped: kept.length !== all.length,
  };
}

// "<value> <unit> from the north side lot line": a distance-to-lot-line proposal.
const LOT_LINE_AFTER_RE = /^[\d.,]+\s*\S*\s+(?:from|to)\b[^.;]{0,40}?\blot lines?\b/i;

// Values in a list are coordinated: at most vocab.segmentation.coordinated_max_words words lie
// between two of them ("136.4 m² floor area or 0.6 times", "1.2 metres on the east side and (ii)
// 0.9 metres").
const coordinated = (text, values) =>
  values.every(
    (v, i) =>
      i === 0 ||
      text
        .slice(values[i - 1].index, v.index)
        .trim()
        .split(/\s+/).length <= vocab.segmentation.coordinated_max_words,
  );

const sameValue = (a, b) => a.value === b.value && a.unit === b.unit;

// --- citation parsing -------------------------------------------------------------------------

const BYLAW_RE = /By-?law(?:\s+No\.?)?\s*([0-9][0-9A-Z-]*)/i;
const REG_ID_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\.?\s*((?:\(\s*[0-9A-Za-z]{1,4}\s*\))*)/g;
const EXCEPTION_RE = /\bException\s+(?:No\.?\s*)?([A-Z]{1,3}\s*\d+)/i;
const EXCEPTION_900_RE = /\b900\.\d+\.\d+\.?\s*\(\s*(\d+)\s*\)/;

const stripWs = (s) => s.replace(/\s+/g, '');

/** parseCitation(head, groupBylaw) → the citation field group. */
function parseCitation(head, groupBylaw) {
  const h = typeof head === 'string' ? head : '';

  let cited_bylaw = null;
  const bylawMatch = BYLAW_RE.exec(h);
  if (bylawMatch) {
    cited_bylaw = bylawMatch[1];
  } else if (typeof groupBylaw === 'string' && /^[0-9][0-9A-Z-]*$/.test(groupBylaw)) {
    cited_bylaw = groupBylaw;
  }

  // regulation ids
  const ids = [];
  const firstClause = new Map();
  REG_ID_RE.lastIndex = 0;
  let rm;
  while ((rm = REG_ID_RE.exec(h)) !== null) {
    const id = rm[1];
    if (!firstClause.has(id)) firstClause.set(id, rm[2] || '');
    if (!ids.includes(id)) ids.push(id);
  }
  const clause_count = ids.length;
  const regulation_id_as_cited =
    ids.length > 0 ? `${ids[0]}${stripWs(firstClause.get(ids[0]))}` : null;

  // exception ref
  let exception_ref = null;
  const ex = EXCEPTION_RE.exec(h);
  if (ex) {
    exception_ref = stripWs(ex[1]);
  } else {
    const ex900 = EXCEPTION_900_RE.exec(h);
    if (ex900) exception_ref = stripWs(ex900[0]);
  }

  // citation kind
  let citation_kind;
  if (regulation_id_as_cited !== null && cited_bylaw === '569-2013') {
    citation_kind = 'chapter_regulation';
  } else if (exception_ref !== null) {
    citation_kind = 'exception_clause';
  } else if (cited_bylaw !== null) {
    citation_kind = 'former_bylaw_section';
  } else {
    citation_kind = 'none';
  }

  return {
    cited_bylaw,
    citation_kind,
    regulation_id_as_cited,
    exception_ref,
    clause_count,
  };
}

// --- item classification ----------------------------------------------------------------------

const STOP_WORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'than',
  'into',
  'will',
  'have',
  'shall',
  'must',
  'been',
  'each',
  'there',
  'case',
  'zoning',
]);
const LEXICON_WORDS = new Set(
  [
    ...vocab.side_lexicon.proposed,
    ...vocab.side_lexicon.required,
    ...Object.values(vocab.bound_phrases).flat(),
  ]
    .join(' ')
    .toLowerCase()
    .split(/\s+/),
);
const contentWords = (text) =>
  new Set(
    (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(
      (w) => !STOP_WORDS.has(w) && !LEXICON_WORDS.has(w),
    ),
  );

/**
 * namedProposal(same, {requiredText, proposedText}) → the one proposal whose own words share the
 * most content words with the requirement, or null on a tie / no overlap. A value's own words sit
 * on ONE side of it, read from the first value: when the words before the first value already
 * name the measure ("The proposed driveway width is 3.51m and the parking space width is 3.3m")
 * each value owns the text before it; otherwise ("located 0.61 m from the north side lot line")
 * each value owns the text after it.
 */
function namedProposal(same, ctx) {
  const reqWords = contentWords(ctx.requiredText || '');
  const text = ctx.proposedText || '';
  const starts = extractValues(text).map((v) => v.index);
  const shared = (t) =>
    [...contentWords(t.replace(/^[\d.,]+\s*\S*/, ''))].filter((w) => reqWords.has(w)).length;
  const before = (at) => {
    const prev = starts.filter((i) => i < at).pop();
    return text.slice(prev === undefined ? 0 : prev, at);
  };
  const after = (at) => {
    const next = starts.find((i) => i > at);
    return text.slice(at, next === undefined ? text.length : next);
  };
  const nounFirst = starts.length > 0 && shared(before(starts[0])) > 0;
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const v of same) {
    const score = shared(nounFirst ? before(v.index) : after(v.index));
    if (score > bestScore) {
      best = v;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return best !== null && !tie ? best : null;
}

/**
 * alignPair(req, prop, bound, ctx) → {status, r, p, resolved}.
 * The compound-sentence parse (fold LCN-D4). `req`/`prop` are the united values left after
 * sideValues and the shared-context removal; `bound` is the required side's bound.
 *   one requirement:  the proposals in its unit family; one → pair; several → the one the
 *                     requirement names (namedProposal), else the one that deviates most along
 *                     the bound (min → smallest, max → largest), else multi_value_ambiguous;
 *                     none → unit_family_mismatch.
 *   several:          coordinated requirements (a list: at most vocab.segmentation.coordinated_max_words words
 *                     apart) and the same count on both sides with families equal position by
 *                     position (lists, "long by wide", "X or Y times the lot area") → pair on the first
 *                     position (R1, 2026-10-09: mixed-family lists pair the unique position in the
 *                     mapped target's family, else multi_value_ambiguous); else the first requirement
 *                     pairs when it is the only one of its family and exactly one proposal shares that
 *                     family; else multi_value_ambiguous.
 */
function alignPair(req, prop, bound, ctx) {
  const r0 = req[0];
  const fam = (v) => unitFamily(v.unit);
  if (req.length === 1) {
    const same = prop.filter((v) => fam(v) === fam(r0));
    if (same.length === 0)
      return {
        status: 'unit_family_mismatch',
        r: r0,
        p: prop[0],
        resolved: false,
      };
    if (same.length === 1) return { status: 'pair', r: r0, p: same[0], resolved: prop.length > 1 };
    const named = ctx ? namedProposal(same, ctx) : null;
    if (named) return { status: 'pair', r: r0, p: named, resolved: true };
    if (bound === 'min' || bound === 'max') {
      const pick = same.reduce((a, b) =>
        (bound === 'min' ? b.value < a.value : b.value > a.value) ? b : a,
      );
      return { status: 'pair', r: r0, p: pick, resolved: true };
    }
    return {
      status: 'multi_value_ambiguous',
      r: r0,
      p: same[0],
      resolved: true,
    };
  }
  const listed = !ctx || coordinated(ctx.requiredText, req);
  if (listed && prop.length === req.length && req.every((v, i) => fam(v) === fam(prop[i]))) {
    // R1 (operator ruling 2026-10-09): when the list positions are of MIXED families and a target
    // family is known, pair the unique position in that family (else multi_value_ambiguous). When
    // every position shares one family, or no target family is given, position 0 is unchanged.
    const targetFamily = ctx ? ctx.targetFamily : null;
    if (targetFamily && new Set(req.map(fam)).size > 1) {
      const at = req.map((v, i) => (fam(v) === targetFamily ? i : -1)).filter((i) => i >= 0);
      if (at.length === 1) {
        return { status: 'pair', r: req[at[0]], p: prop[at[0]], resolved: true };
      }
      return { status: 'multi_value_ambiguous', r: r0, p: prop[0], resolved: true };
    }
    return { status: 'pair', r: r0, p: prop[0], resolved: true };
  }
  const reqSame = req.filter((v) => fam(v) === fam(r0));
  const propSame = prop.filter((v) => fam(v) === fam(r0));
  if (reqSame.length === 1 && propSame.length === 1) {
    return { status: 'pair', r: r0, p: propSame[0], resolved: true };
  }
  const p0 = propSame[0] || prop[0];
  return { status: 'multi_value_ambiguous', r: r0, p: p0, resolved: true };
}

/**
 * classifyItem({head, body, groupBylaw}) → the full item shape.
 * Non-string `head` or `body` throws `Error('COA_PARSE_E_BAD_INPUT')` (the code ONLY).
 */
function classifyItem(item) {
  const head = item ? item.head : null;
  const body = item ? item.body : null;
  const groupBylaw = item ? item.groupBylaw : null;
  if (typeof head !== 'string' || typeof body !== 'string') {
    throw new Error('COA_PARSE_E_BAD_INPUT');
  }

  const citation = parseCitation(head, groupBylaw);
  const s = splitPair(body);

  const result = {
    ...citation,
    required_value: null,
    required_unit: null,
    proposed_value: null,
    proposed_unit: null,
    parse_status: 'no_split',
    parse_confidence: 'low',
    bound: null,
    qualified: false,
  };

  let single = false; // exactly one united required value, nothing resolved: the `high` shape
  const finish = (status) => {
    result.parse_status = status;
    result.qualified = result.qualified || isQualified(s.required || body);
    result.bound = detectBound(s.required || '');
    if (status === 'pair') {
      const high = single && citation.citation_kind === 'chapter_regulation' && !result.qualified;
      result.parse_confidence = high ? 'high' : 'medium';
    } else {
      result.parse_confidence = 'low';
    }
    return result;
  };

  if (s.required === null && s.proposed === null) return finish('no_split');
  if (s.reversed) return finish('side_ambiguous');

  const rv = sideValues(s.required, { conditional: true });
  const pv = sideValues(s.proposed, { conditional: false });
  let req = rv.main;
  let cond = rv.cond;
  let prop = pv.main;

  // a condition ("provided they are no closer than 0.3 m to a lot line") always qualifies the item
  if (cond.length > 0) result.qualified = true;

  if (req.length === 0 && cond.length === 0) return finish('no_required_value');
  if (prop.length === 0) return finish('no_proposed_value');

  // shared context: a proposal stated identically on the requirement side, in its main clause or
  // its condition ("within 4 m of the front main wall"), qualifies the measure and is not the
  // variance, while both sides keep a value
  let resolved = rv.dropped || pv.dropped || s.swapped;
  const isShared = (v, list) => list.some((x) => sameValue(v, x));
  const sharedProp = prop.filter((p) => isShared(p, [...req, ...cond]));
  if (sharedProp.length > 0) {
    const prop2 = prop.filter((p) => !isShared(p, sharedProp));
    const req2 = req.filter((r) => !isShared(r, sharedProp));
    const cond2 = cond.filter((c) => !isShared(c, sharedProp));
    if (prop2.length > 0 && req2.length + cond2.length > 0) {
      prop = prop2;
      req = req2;
      cond = cond2;
      resolved = true;
    }
  }

  let a = null;
  // a lot-line condition answers a lot-line proposal: "may project 0.9 m provided they are no
  // closer than 0.3 m to a lot line" against "the eaves will be located 0 m from the lot line"
  if (cond.length === 1 && /\blot lines?\b/i.test(rv.condText)) {
    const toLine = prop.filter(
      (p) =>
        unitFamily(p.unit) === unitFamily(cond[0].unit) &&
        LOT_LINE_AFTER_RE.test(s.proposed.slice(p.index)),
    );
    if (toLine.length === 1) a = { status: 'pair', r: cond[0], p: toLine[0], resolved: true };
  }
  if (a === null) {
    if (req.length === 0) {
      req = cond; // the condition holds the only requirement value
      resolved = true;
    }
    a = alignPair(req, prop, detectBound(s.required || ''), {
      requiredText: s.required || '',
      proposedText: s.proposed || '',
      targetFamily: item ? item.targetFamily : null,
    });
  }
  result.required_value = a.r.value;
  result.required_unit = a.r.unit;
  result.proposed_value = a.p.value;
  result.proposed_unit = a.p.unit;

  if (isCompound(s.required)) return finish('multi_value_ambiguous');
  single = req.length === 1 && !resolved && !a.resolved;
  return finish(a.status);
}

// --- target mapping ---------------------------------------------------------------------------

const lowerWs = (text) =>
  typeof text === 'string' ? text.toLowerCase().replace(/\s+/g, ' ').trim() : '';

/** mapTarget(text, entries) → {target, target_status, matched}. No tiebreak. */
function mapTarget(text, entries) {
  const hay = lowerWs(text);
  const list = Array.isArray(entries) ? entries : [];
  const matched = [];
  for (const entry of list) {
    if (!entry || !Array.isArray(entry.any)) continue;
    const anyHit = entry.any.some((p) => typeof p === 'string' && hay.includes(p.toLowerCase()));
    if (!anyHit) continue;
    const noneHit = (Array.isArray(entry.none) ? entry.none : []).some(
      (p) => typeof p === 'string' && hay.includes(p.toLowerCase()),
    );
    if (noneHit) continue;
    matched.push(entry.target);
  }
  if (matched.length === 1) {
    return {
      target: matched[0],
      target_status: 'mapped',
      matched: [matched[0]],
    };
  }
  if (matched.length > 1) {
    const sorted = matched.slice().sort();
    return { target: 'ambiguous', target_status: 'ambiguous', matched: sorted };
  }
  return { target: 'unmapped', target_status: 'unmapped', matched: [] };
}

module.exports = {
  relabelUnit,
  unitFamily,
  extractValues,
  classifySide,
  detectBound,
  isCompound,
  isQualified,
  splitPair,
  parseCitation,
  classifyItem,
  mapTarget,
};
