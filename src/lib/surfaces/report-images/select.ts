// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-38: single image per option),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths; the FE-05 scan covers this directory).
//
// MF-38 · McFrontend queue · lane MF-38. The pure report image selection (operator 2026-11-09 "targeted scenario images": a closed selector list,
// most specific matching set wins, step-wise fallback to the scenario default; thresholds are logic_variables values, injected). O-1 b: the
// chosen set yields ONE image, its lowest position. Comparisons only: no arithmetic, no threshold literal. No I/O. Not wired yet: the server
// read that loads media_assets sets and the lot facts is deferred (v1 ships default images only).

/* eslint-disable @typescript-eslint/no-explicit-any -- the data file is committed JSON of a declared shape; the lock reads it */
type Json = Record<string, any>;
export interface ImageRef { asset_id: string; alt: string; caption?: string; position: number }
export interface ImageSet { rule: Record<string, unknown> | null; images: ImageRef[] }
export interface ImageFacts { storeys: number | null; corner: boolean | null; frontage_m: number | null }
export interface FrontageEdges { narrow_max: number; wide_min: number }

export class ImageSelectError extends Error {
  constructor(message: string) { super(message); this.name = 'ImageSelectError'; }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const PLACEHOLDER = /[{}]/;

// The band of a frontage: < narrow_max narrow, >= wide_min wide, else standard (comparisons only).
const bandOf = (frontage: number | null, edges: FrontageEdges, ids: string[]): string | null => {
  if (frontage === null) return null;
  if (frontage < edges.narrow_max) return ids[0] as string;
  if (frontage >= edges.wide_min) return ids.at(-1) as string;
  return ids[1] as string;
};

// A rule in canonical form: its keys in the ordered selector list (so {a,b} and {b,a} are the same rule).
const canon = (rule: Record<string, unknown>, order: string[]): string => JSON.stringify(order.filter((k) => k in rule).map((k) => [k, rule[k]]));

export const selectImage = (sets: ImageSet[], facts: ImageFacts, edges: FrontageEdges, cfg: Json): ImageRef | null => {
  const order: string[] = (cfg.selectors as Json[]).map((s) => String(s.id));
  const deferred: string[] = cfg.deferred ?? [];
  const bandIds: string[] = cfg.bands.frontage.ids;
  // narrow_max == wide_min is allowed (plan: narrow_max <= wide_min); the standard band is then empty, by design.
  if (!isNum(edges?.narrow_max) || !isNum(edges?.wide_min) || edges.wide_min < edges.narrow_max) throw new ImageSelectError('frontage edges: two numbers with narrow_max <= wide_min are required');
  if (facts.frontage_m !== null && !isNum(facts.frontage_m)) throw new ImageSelectError(`frontage_m: ${String(facts.frontage_m)} is not a finite number or null`);
  if (facts.storeys !== null && !isNum(facts.storeys)) throw new ImageSelectError(`storeys: ${String(facts.storeys)} is not a finite number or null`);

  const value: Record<string, unknown> = { storeys: facts.storeys, corner: facts.corner, frontage_band: bandOf(facts.frontage_m, edges, bandIds) };
  const seen = new Set<string>();
  let fallback: ImageSet | null = null;
  for (const s of sets) {
    const rule = s.rule ?? {};
    for (const k of Object.keys(rule)) {
      if (deferred.includes(k)) throw new ImageSelectError(`rule key ${k}: a deferred selector has no resolver yet`);
      if (!order.includes(k)) throw new ImageSelectError(`rule key ${k}: not a selector (${order.join(', ')})`);
    }
    // OUTPUT panel fold (code reviewer LOW-2): a value of the wrong type (or null) would never match and say nothing, so it throws.
    if ('storeys' in rule && !isNum(rule.storeys)) throw new ImageSelectError(`rule storeys ${String(rule.storeys)}: not a finite number`);
    if ('corner' in rule && typeof rule.corner !== 'boolean') throw new ImageSelectError(`rule corner ${String(rule.corner)}: not a boolean`);
    if ('frontage_band' in rule && !bandIds.includes(String(rule.frontage_band))) throw new ImageSelectError(`frontage_band ${String(rule.frontage_band)}: not a declared band`);
    const key = canon(rule, order);
    if (seen.has(key)) throw new ImageSelectError(key === '[]' ? 'two default sets for one scenario key' : `two sets with identical rules: ${key}`);
    seen.add(key);
    const positions = new Set<number>();
    for (const im of s.images) {
      if (typeof im.alt !== 'string' || im.alt.trim() === '' || PLACEHOLDER.test(im.alt)) throw new ImageSelectError(`image ${String(im.asset_id)}: alt is required, non-blank and concrete`);
      if (positions.has(im.position)) throw new ImageSelectError(`image ${String(im.asset_id)}: duplicate position ${String(im.position)}`);
      positions.add(im.position);
    }
    if (key === '[]') fallback = s;
  }

  // Precedence is lexicographic over the ordered selector list: compare which selectors a rule names, most important first.
  const names = (s: ImageSet): boolean[] => order.map((k) => k in (s.rule ?? {}));
  const beats = (a: ImageSet, b: ImageSet): boolean => {
    const x = names(a);
    const y = names(b);
    const at = x.findIndex((v, i) => v !== y[i]);
    return at >= 0 && x[at] === true;
  };
  let best: ImageSet | null = null;
  for (const s of sets) {
    const rule = s.rule ?? {};
    if (Object.keys(rule).length === 0 || s.images.length === 0) continue;
    const match = Object.keys(rule).every((k) => value[k] !== null && value[k] === rule[k]);
    if (match && (best === null || beats(s, best))) best = s;
  }
  const chosen = best ?? (fallback && fallback.images.length ? fallback : null);
  if (!chosen) return null;
  let first = chosen.images[0] as ImageRef;
  for (const im of chosen.images) if (im.position < first.position) first = im;
  return first;
};
