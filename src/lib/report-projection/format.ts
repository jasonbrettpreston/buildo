// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (every number from McBylaws; no maths in the UI: the SERVER
//            formats), FE-34 (the v21 page contract: a value part is a server-formatted string); docs/specs/02-web-admin/126_maxbld_surface_standard.md
//            11a.7; Spec 128 rule 16 (the server projects, the UI is glass).
//
// MB-93 · the FE-05 server formatter of the five v21 page rules (`area_sqft`, `area_m2`, `area_sqft_m2_paren`, `area_sqft_m2_dot`, `int`), written
// against the v21 synthetic golden strings ("2,670" / "sq ft" / "248 m²" / "2,670 sq ft (248 m²)" / "3,057 sq ft · 284 m²" / "3").
// Plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md 9.2-9.3 (RG H1, Code HIGH-1, RG M1): it lives OUTSIDE the four directories the no-maths lock scans
// (src/tests/surfaces/report-no-maths.logic.test.ts), imports nothing, pins the digit grouping (a comma every three digits, the en-CA form) instead
// of an unpinned toLocaleString(), and returns the number and its unit as separate outputs (D-J). It shares only the 10.7639 factor and the
// half-up rounding of mobile/src/lib/parcelCostFormat.ts (left untouched; a parity test pins the two). Honest refusals: a non-finite or negative
// number, an `int` value that is not a whole number, or an unknown rule format to null (the page shows the ruled null dash).

/** Square feet per square metre (the factor of mobile/src/lib/parcelCostFormat.ts SQM_TO_SQFT). */
export const SQFT_PER_M2 = 10.7639;
export const PAGE_RULES = ['area_sqft', 'area_m2', 'area_sqft_m2_paren', 'area_sqft_m2_dot', 'int'] as const;
export type PageRule = (typeof PAGE_RULES)[number];
/** One formatted value: `value` is the text of a value part; `unit` is the text of a `.unit` part (area_sqft only, D-J). */
export interface Formatted { value: string; unit?: string }

/** A whole, non-negative number with a comma every three digits ("1076" -> "1,076"). */
const grouped = (whole: number): string => {
  const digits = String(whole);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const left = digits.length - i;
    out += digits[i];
    if (left > 1 && left % 3 === 1) out += ',';
  }
  return out;
};

/** The rule's text for one stored number (square metres for the area rules; a count for `int`), or null when it is refused. */
export function formatPageRule(rule: string, n: number): Formatted | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  const sqft = grouped(Math.round(n * SQFT_PER_M2));
  const m2 = `${grouped(Math.round(n))} m²`;
  switch (rule) {
    case 'area_sqft':
      return { value: sqft, unit: 'sq ft' };
    case 'area_m2':
      return { value: m2 };
    case 'area_sqft_m2_paren':
      return { value: `${sqft} sq ft (${m2})` };
    case 'area_sqft_m2_dot':
      return { value: `${sqft} sq ft · ${m2}` };
    case 'int':
      return Number.isInteger(n) ? { value: grouped(n) } : null;
    default:
      return null;
  }
}

/** K2 (operator 2026-11-13, "a new yes/no page rule ... the existing formatter pattern"): the closed TEXT rules. A text rule formats one stored
 *  non-number (a yes/no column; a confidence word of a stored reading) to the text of a value part; an unknown rule, or a value of the wrong
 *  kind, is refused (null: the page shows the ruled dash, Spec 78 section 6.6 rule 5). */
export const TEXT_RULES = ['yes_no', 'confidence'] as const;
const CONFIDENCE_WORDS: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', 'medium-low': 'Medium-low confidence', low: 'Low confidence' };
/** The weakest first (M-481 words), so the weakest of several stored readings is the one shown. */
export const CONFIDENCE_ORDER = ['low', 'medium-low', 'medium', 'high'] as const;
export function formatTextRule(rule: string, v: unknown): string | null {
  if (rule === 'yes_no') return v === true ? 'Yes' : v === false ? 'No' : null;
  if (rule === 'confidence') return typeof v === 'string' && Object.hasOwn(CONFIDENCE_WORDS, v) ? (CONFIDENCE_WORDS[v] as string) : null;
  return null;
}
