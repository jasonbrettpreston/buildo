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

/**
 * extractValues(sentence) → [{value, unit, index}] in text order.
 * `unit` is the relabelled canonical unit, or null when no key matches.
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
  return out;
}

// --- side classification ----------------------------------------------------------------------

/** Count whole-phrase, case-insensitive, word-bounded hits of `phrase` in `text`. */
function countPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  const m = text.match(re);
  return m ? m.length : 0;
}

/** classifySide(sentence) → 'proposed' | 'required' | null. */
function classifySide(sentence) {
  if (typeof sentence !== 'string' || sentence === '') return null;
  let proposed = 0;
  let required = 0;
  for (const p of vocab.side_lexicon.proposed) proposed += countPhrase(sentence, p);
  for (const p of vocab.side_lexicon.required) required += countPhrase(sentence, p);
  if (proposed > 0 && required === 0) return 'proposed';
  if (required > 0 && proposed === 0) return 'required';
  return null;
}

// --- pair splitting ---------------------------------------------------------------------------

/**
 * splitPair(body) → {required, proposed, method, reversed}.
 * Normal order is proposed-before, required-after.
 */
function splitPair(body) {
  if (typeof body !== 'string') {
    return { required: null, proposed: null, method: null, reversed: false };
  }
  const b = collapseWs(body);

  const whereas = /\bwhereas\b/i.exec(b);
  if (whereas) {
    const before = b.slice(0, whereas.index).trim();
    const after = b.slice(whereas.index + whereas[0].length).trim();
    const reversed = classifySide(before) === 'required' || classifySide(after) === 'proposed';
    return { required: after, proposed: before, method: 'whereas', reversed };
  }

  const sentences = b.split(/(?<=[.;])\s+(?=[A-Z])/);
  let required = null;
  let proposed = null;
  for (const s of sentences) {
    const side = classifySide(s);
    if (!required && side === 'required') required = s;
    if (!proposed && side === 'proposed') proposed = s;
  }
  const method = required !== null || proposed !== null ? 'sentences' : null;
  return { required, proposed, method, reversed: false };
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

/** isCompound(sentence) → true on multiple united values, or a genuine compound marker. */
function isCompound(sentence) {
  if (typeof sentence !== 'string' || sentence === '') return false;
  const values = extractValues(sentence).filter((v) => v.unit !== null);
  if (values.length > 1) return true;

  for (const marker of vocab.compound_markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    let m;
    while ((m = re.exec(sentence)) !== null) {
      // `by` never matches when followed by `-law` or `law` (By-law / Zoning By-law).
      if (marker.toLowerCase() === 'by') {
        const tail = sentence.slice(m.index + m[0].length);
        if (/^\s*-?\s*law\b/i.test(tail)) continue;
      }
      return true;
    }
  }
  return false;
}

/** isQualified(text) → true when any vocab.qualified_markers phrase occurs (substring). */
function isQualified(text) {
  if (typeof text !== 'string' || text === '') return false;
  const lower = text.toLowerCase();
  return vocab.qualified_markers.some((marker) => lower.includes(marker.toLowerCase()));
}

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

  return { cited_bylaw, citation_kind, regulation_id_as_cited, exception_ref, clause_count };
}

// --- item classification ----------------------------------------------------------------------

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

  const finish = (status) => {
    result.parse_status = status;
    result.qualified = isQualified(s.required || body);
    result.bound = detectBound(s.required || '');
    if (status === 'pair') {
      const high =
        req.length === 1 && citation.citation_kind === 'chapter_regulation' && !result.qualified;
      result.parse_confidence = high ? 'high' : 'medium';
    } else {
      result.parse_confidence = 'low';
    }
    return result;
  };

  // no side found at all
  if (s.required === null && s.proposed === null) {
    return finish('no_split');
  }

  if (s.reversed) {
    return finish('side_ambiguous');
  }

  if (s.method === 'sentences') {
    if (s.required !== null && classifySide(s.required) !== 'required') {
      return finish('side_ambiguous');
    }
    if (s.proposed !== null && classifySide(s.proposed) !== 'proposed') {
      return finish('side_ambiguous');
    }
  }

  const req = extractValues(s.required === null ? '' : s.required).filter((v) => v.unit !== null);
  const prop = extractValues(s.proposed === null ? '' : s.proposed).filter((v) => v.unit !== null);

  if (req.length === 0) return finish('no_required_value');
  if (prop.length === 0) return finish('no_proposed_value');

  const r0 = req[0];
  const rf = unitFamily(r0.unit);
  const p0 = prop.find((v) => unitFamily(v.unit) === rf) || prop[0];

  result.required_value = r0.value;
  result.required_unit = r0.unit;
  result.proposed_value = p0.value;
  result.proposed_unit = p0.unit;

  if (isCompound(s.required)) return finish('multi_value_ambiguous');

  const pf = unitFamily(p0.unit);
  if (pf !== rf) return finish('unit_family_mismatch');

  return finish('pair');
}

// --- target mapping ---------------------------------------------------------------------------

const lowerWs = (text) => (typeof text === 'string' ? text.toLowerCase().replace(/\s+/g, ' ').trim() : '');

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
    return { target: matched[0], target_status: 'mapped', matched: [matched[0]] };
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
