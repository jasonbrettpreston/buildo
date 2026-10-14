/**
 * CoA ZONING_DESIGNATION parser + CoA->parcel zone-class check - PURE (no I/O).
 * SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (zoning_designation)
 * SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (C2, C4)
 * The loader stores the string raw; this module is the only parser. Replaces the ad-hoc regex in
 * .cursor/mcbylaw/zoning-validation/parse-coa.js. Never guesses: a string with no 569-2013 class
 * token gets a closed status (former_bylaw | unparsed), never a class.
 */
'use strict';

// Closed status set. Order is the contract order:
//  - 'full_569'    a 569-2013 class with a lowercase-letter+digit parameter group (e.g. "RM (f12.0; u4)");
//  - 'class_only'  a 569-2013 class but no parameter group (e.g. "RD (ZR)");
//  - 'former_bylaw' no 569-2013 class token, but a former by-law code or "By-law" text (e.g. "Zoning By-law 438-86");
//  - 'long_name'   a prose name ("Residential Detached (RD) Zone") - the class is taken from the code inside it;
//  - 'unparsed'    neither a class token nor by-law text was found;
//  - 'null'        null/undefined/blank input.
const STATUSES = Object.freeze(['full_569', 'class_only', 'former_bylaw', 'long_name', 'unparsed', 'null']);

// Closed answer set for the CoA->parcel zone-class check (contract order).
const LINK_ANSWERS = Object.freeze([
  'class_match',
  'class_mismatch',
  'component_mismatch_dated',
  'not_comparable',
]);

// 569-2013 zone class codes, longest-first within each family (so e.g. "RM" is tried before "R",
// "CRE" before "CR" before "R", "IPW"/"IH"/"IE"/"IS" before "I").
const CLASS_CODES = Object.freeze([
  'RAC', 'RA', 'RD', 'RS', 'RT', 'RM', 'R',
  'CRE', 'CR',
  'CL',
  'EH', 'EL', 'EO', 'E',
  'ON', 'OR', 'OG', 'OC', 'OM', 'O',
  'UT',
  'IPW', 'IH', 'IE', 'IS', 'I',
]);

// Parenthesised tags that are recognised as such; any other "(word)" is left in place (it is
// probably a parameter group, not a tag).
const PAREN_TAGS = new Set(['ZR', 'ZZC', 'ZAP', 'ZPR', 'BLD', 'WAIVER', 'WAV', 'PSP', 'W']);

// The class-code alternation, escaped/joined once at module load.
const CLASS_ALTERNATION = CLASS_CODES.join('|');
// One component regex per key, built once at module load (see `num` below).
const COMPONENT_KINDS = ['f', 'a', 'u', 'd'];
const COMPONENT_RES = Object.freeze(
  COMPONENT_KINDS.reduce((acc, k) => {
    // Match a `(`, `;`, `,` or whitespace boundary, then the key, then a number (comma decimal ok).
    acc[k] = new RegExp(String.raw`[(;,\s]` + k + String.raw`\s*([0-9]+(?:[.,][0-9]+)?)`);
    return acc;
  }, {}),
);

/**
 * Parse a raw CoA ZONING_DESIGNATION string.
 * @param {*} raw
 * @returns {{class:(string|null), f:(number|null), a:(number|null), u:(number|null),
 *            d:(number|null), x:(number|null), tags:string[], status:string}}
 */
function parseZoningDesignation(raw) {
  // 1. Blank/null/undefined => the closed 'null' status, all components null, no tags.
  const out = { class: null, f: null, a: null, u: null, d: null, x: null, tags: [], status: 'null' };
  if (raw == null) return out;
  let s = String(raw).trim();
  if (!s) return out;

  // 2. Lift recognised bracket/brace/paren tags out of the string (they are metadata, not
  //    parameters), recording them once each and replacing them with a space. A "(word)" that is
  //    not in PAREN_TAGS is left in the string (it is a parameter group, not a tag).
  const tags = [];
  s = s.replace(/\[([A-Za-z ]{1,12})\]|\{([A-Za-z ]{1,12})\}|\(([A-Za-z]{1,8})\)/g, (all, b, c, p) => {
    const t = (b || c || p).trim().toUpperCase();
    if (p !== undefined && !PAREN_TAGS.has(t)) return all;
    if (!tags.includes(t)) tags.push(t);
    return ' ';
  });
  out.tags = tags;

  // 3. Normalise whitespace and split-apart decimals: "f12 .0" -> "f12.0".
  s = s.replace(/(\d) +\.(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();

  // 4. Find the first 569-2013 class token, requiring a proper left boundary and a right boundary
  //    that is not an alphanumeric, dot, or "digit.digit" (so "RD" in "RD(f15)" matches but
  //    "MCR" does not yield "CR"). The regex is built per call so its `g`-state never leaks.
  const re = new RegExp(
    String.raw`(?:^|[\s/&(\[,-])(` + CLASS_ALTERNATION + String.raw`)(?=$|[^A-Za-z0-9.]|\d+\.\d)`,
    'g',
  );
  const m = re.exec(s);
  if (!m) {
    // 5a. No 569 class token: close the status - a former by-law code or "By-law"/"by-law" text
    //     stays 'former_bylaw', anything else is 'unparsed'. Never guess a class.
    out.status = /by-?law/i.test(s) || /\b[A-Z]{1,4}\d/.test(s) ? 'former_bylaw' : 'unparsed';
    return out;
  }
  out.class = m[1];

  // 6. Read components only from the class's OWN segment: cut the tail at the first "&", "/",
  //    "and" or "by-law", so a former-by-law tail (e.g. "& R2 Z0.6") can never leak in.
  let tail = s.slice(m.index + m[0].length);
  tail = tail.split(/\s&\s|&|\/|\band\b|by-?law/i)[0];

  // 7. Numeric components: prefix letter + number; comma decimals normalised to dots.
  const num = (k) => {
    const r = tail.match(COMPONENT_RES[k]);
    return r ? Number(r[1].replace(',', '.')) : null;
  };
  out.f = num('f');
  out.a = num('a');
  out.u = num('u');
  out.d = num('d');

  // 8. The "(x123)" cross-reference parameter.
  const xm = tail.match(/\(\s*x\s*(\d+)\s*\)/);
  out.x = xm ? Number(xm[1]) : null;

  // 9. Status: a prose leading name ("Residential Detached (RD) ...") is 'long_name'; otherwise a
  //    parameter group (a letter+digit inside parens, e.g. "(f12.0)") makes it 'full_569', and a
  //    bare class is 'class_only'. A leading capitalised word of 3+ letters ("Residential",
  //    "Single-Family", "Commercial") marks prose.
  const hasParam = /\([^()]*[a-z]\s*\d[^()]*\)/.test(tail);
  if (/^[A-Z][a-z]{2,}/.test(s)) out.status = 'long_name';
  else out.status = hasParam ? 'full_569' : 'class_only';
  return out;
}

/**
 * Compare a filing's ZONING_DESIGNATION against the parcel's ZN string.
 * @param {*} designation
 * @param {*} parcelZnString
 * @returns {string} one of LINK_ANSWERS
 */
function classifyZoneLink(designation, parcelZnString) {
  const a = parseZoningDesignation(designation);
  const b = parseZoningDesignation(parcelZnString);

  // Not comparable: either side failed to yield a class, or the filing itself has no 569 class
  // (null/unparsed/former_bylaw).
  if (a.class === null || b.class === null || ['null', 'unparsed', 'former_bylaw'].includes(a.status)) {
    return 'not_comparable';
  }
  // Different 569 class families cannot be a match.
  if (a.class !== b.class) return 'class_mismatch';

  // Only the components the filing STATES are compared: the filing is as-at-hearing, the parcel is
  // the current snapshot, so a difference is dated evidence, not a class error.
  for (const k of ['f', 'a', 'u', 'd', 'x']) {
    if (a[k] !== null && a[k] !== b[k]) return 'component_mismatch_dated';
  }
  return 'class_match';
}

/**
 * Summarise a list of link answers.
 * @param {string[]} answers
 * @param {number} minShare
 * @param {number} minComparable integer >= 1
 * @returns {{counts: Record<string, number>, comparable: number, class_agree_share: (number|null), status: string}}
 */
function summarizeZoneLink(answers, minShare, minComparable) {
  if (!Array.isArray(answers)) {
    throw new Error('summarizeZoneLink: answers must be an array');
  }
  if (typeof minShare !== 'number' || !Number.isFinite(minShare) || minShare < 0 || minShare > 1) {
    throw new Error('summarizeZoneLink: minShare must be a number in [0,1]');
  }
  if (!Number.isInteger(minComparable) || minComparable < 1) {
    throw new Error('summarizeZoneLink: minComparable must be an integer >= 1');
  }

  // Counts in LINK_ANSWERS order, all four keys always present.
  const counts = {};
  for (const answer of LINK_ANSWERS) counts[answer] = 0;

  for (const a of answers) {
    if (!Object.prototype.hasOwnProperty.call(counts, a)) {
      throw new Error('summarizeZoneLink: unknown answer ' + JSON.stringify(a));
    }
    counts[a] += 1;
  }

  const comparable = counts.class_match + counts.class_mismatch + counts.component_mismatch_dated;
  const class_agree_share =
    comparable === 0 ? null : (counts.class_match + counts.component_mismatch_dated) / comparable;
  // Too few comparable rows is a WARN, never a silent PASS: a share over a handful of rows is not
  // evidence. The share stays null when comparable is 0.
  const status =
    comparable >= minComparable && class_agree_share !== null && class_agree_share >= minShare
      ? 'PASS'
      : 'WARN';

  return { counts, comparable, class_agree_share, status };
}

module.exports = {
  STATUSES,
  LINK_ANSWERS,
  CLASS_CODES,
  parseZoningDesignation,
  classifyZoneLink,
  summarizeZoneLink,
};
