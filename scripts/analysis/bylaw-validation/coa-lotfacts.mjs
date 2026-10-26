// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.326 (order of authority), m.308 (survey preferred, >5 % parcel flag), m.313 (curved front), m.333 (plan facts are not calculator input)
// SPEC LINK: decision log wf1/rulings-rec3@d8306917:docs/reports/decisions/2026-10-25-batch-g.json#CHAT-156.M326-EXAMINED-FALLBACK (amends 2026-10-25-batch-c#CHAT-145.PLANFACT-CDE C for the scorer only); wf1/rulings-rec3@f84fd3ca:docs/reports/decisions/2026-10-26-batch-h.json#CHAT-163.M326-SITE-PLAN, #CHAT-165.HELD-UNREAD-DISCLOSED
// Lot figures for the CoA scorer, from one plan-facts record. Pure: no file, environment or argument reads.
// CHAT-156 as amended by CHAT-163: survey, then zoning notice, plan statistics, site plan, decision notice; a figure with an unknown or missing
// source is not read (CHAT-164 round). Each plan-facts record holds one source per field, so on today's data the order works as a membership
// gate; the rank between two held figures cannot be reached on data. CHAT-117 (notice beats plan statistics) is applied at keying (one source
// per field); CHAT-163 ranks site_plan after plan_statistics and before decision_notice; the rank is locked on the order (T-0).
export const LOT_SOURCE_ORDER = Object.freeze(['survey', 'zoning_notice', 'plan_statistics', 'site_plan', 'decision_notice']);
export const LOT_KEYS = Object.freeze([['frontage_m', 'lot_frontage_m'], ['depth_m', 'lot_depth_m'], ['area_m2', 'lot_area_m2'], ['corner', 'corner_lot']].map((pair) => Object.freeze(pair)));
const PARCEL_KEY = { frontage_m: 'frontage_m', depth_m: 'depth_m', area_m2: 'lot_size_sqm', corner: 'is_corner_lot' };
export const SURVEY_TOL = 0.05; // M-308: one tolerance
// CHAT-46 / M-313 / By-law 800.50(445): a frontage measured along a curved front lot line is not the by-law measure.
export const CURVED_FRONT_RE = /\bfrontage\b[^.;]*\barc\b|\bfront arc\b|\bcurved frontage\b|\bstreet line\b[^.;]*\barc\b/i;
export function lotFigures(pf) {
  if (!pf) return null;
  const ls = pf.lot_source || {};
  const ranked = (pk) => LOT_SOURCE_ORDER.includes(ls[pk]);
  const num = (pk) => (ranked(pk) && typeof pf[pk] === 'number' && pf[pk] > 0 ? pf[pk] : null);
  const curvedFront = CURVED_FRONT_RE.test(String(pf.lot_shape_note || ''));
  const sv = { frontage_m: curvedFront ? null : num('lot_frontage_m'), curved_front: curvedFront, depth_m: num('lot_depth_m'), area_m2: num('lot_area_m2'),
    corner: ranked('corner_lot') && typeof pf.corner_lot === 'boolean' ? pf.corner_lot : null };
  sv.source = Object.fromEntries(LOT_KEYS.map(([k, pk]) => [k, sv[k] != null ? ls[pk] : null]));
  // M-313 OBSERVABLE: a curved front is kept on the record even when no other figure is held (frontage_m null, curved_front true).
  return curvedFront || LOT_KEYS.some(([k]) => sv[k] != null) ? sv : null;
}
export function lotCheck(sv, p) {
  if (!sv || !p) return { held: sv, flag: false, disagree: [] };
  const dis = [];
  for (const [k, label] of [['frontage_m', 'frontage'], ['depth_m', 'depth'], ['area_m2', 'area']]) {
    const pv = p[PARCEL_KEY[k]];
    if (sv[k] != null && pv != null && Math.abs(pv - sv[k]) / sv[k] > SURVEY_TOL) dis.push(`${label} parcel ${pv} vs ${sv.source[k]} ${sv[k]} (${Math.round(((pv - sv[k]) / sv[k]) * 1000) / 10}%)`);
  }
  if (sv.corner != null && p.is_corner_lot != null && !!p.is_corner_lot !== sv.corner) dis.push(`corner parcel ${!!p.is_corner_lot} vs ${sv.source.corner} ${sv.corner}`);
  return { held: sv, flag: dis.length > 0, disagree: dis };
}
// lot_source per key: the ranked source of the figure read; 'parcel' when the parcel holds that value and it is used; else null.
// No parcel: the scorer applies no figure (runNotice base = null), so every key is null and nothing is disclosed.
export function lotSourceOf(sv, p) {
  if (!p) return Object.fromEntries(LOT_KEYS.map(([k]) => [k, null]));
  return Object.fromEntries(LOT_KEYS.map(([k]) => [k, sv && sv[k] != null ? sv.source[k] : (p[PARCEL_KEY[k]] != null ? 'parcel' : null)]));
}
// CHAT-156 "a non-survey figure is disclosed": plan figures not from a survey. Parcel use is recorded in lot_source, not disclosed here.
export function lotDisclosure(ls) {
  const ns = LOT_KEYS.filter(([k]) => ls[k] && ls[k] !== 'survey' && ls[k] !== 'parcel').map(([k]) => `${k} ${ls[k]}`);
  return ns.length ? 'lot figure not from a survey: ' + ns.join(', ') : null;
}
// CHAT-165: plan-facts figures held but not read, values only (key, value, why). Why: the source is outside LOT_SOURCE_ORDER, or (frontage) a curved front (M-313 / CHAT-162).
// No class or value is derived from this. No parcel: every held figure is shown with the reason no parcel, since none is read (CHAT-165; the operator answer is cited in the commit message).
const SOURCE_TOKEN_RE = /^[a-z_]{1,32}$/; // values only: a source is printed only as a classification token (Spec 129 §2c)
export function lotHeldUnread(pf, p) {
  if (!pf) return null;
  const ls = pf.lot_source || {}; const curved = CURVED_FRONT_RE.test(String(pf.lot_shape_note || ''));
  const out = [];
  for (const [k, pk] of LOT_KEYS) {
    const v = pf[pk]; const held = k === 'corner' ? typeof v === 'boolean' : typeof v === 'number' && v > 0;
    if (!held) continue;
    if (!p) out.push(`${k} ${v} (no parcel)`);
    else if (!LOT_SOURCE_ORDER.includes(ls[pk])) out.push(`${k} ${v} (source ${ls[pk] == null || ls[pk] === '' ? 'not recorded' : SOURCE_TOKEN_RE.test(ls[pk]) ? ls[pk] : 'unrecognised'})`);
    else if (k === 'frontage_m' && curved) out.push(`${k} ${v} (curved front)`);
  }
  return out.length ? 'lot figure held, not read: ' + out.join(', ') : null;
}
export const surveyRead = (sv) => !!sv && LOT_KEYS.some(([k]) => sv.source[k] === 'survey');
