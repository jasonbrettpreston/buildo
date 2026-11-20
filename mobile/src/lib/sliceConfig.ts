// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md P4 (tunables are data), docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (every page setting is a registered logic variable with bounds and an on_invalid posture)
//
// FIX.TUNE (task-378) and FIX.CONFIG-BOUNDS (task-395): the one reader of a number the phone takes from a generated surface slice (scripts/surfaces/emit-mobile-surfaces.mjs).
// The slice carries each number's registered bounds beside it (`bounds.<key>` = min, max, on_invalid, copied from its seed row). The reader applies them: in range, the value; out of
// range, the stated failure behaviour (fail throws, clamp returns the nearest bound and warns, naming the key and both values: a clamp is never silent). A key that is missing, not a
// finite number, without a bounds entry, or whose entry is null or malformed throws, naming the key: a silent undefined would reach a timer or a query option and fail later and far from the cause.

/** One key's bounds as the slice carries them; on_invalid is checked here, so the generated JSON (a plain string) fits. */
export type SliceBound = { min: number; max: number; on_invalid: string };
/** The part of a generated slice the reader needs. */
export type SliceNumbers = { readonly config: Readonly<Record<string, unknown>>; readonly bounds?: Readonly<Record<string, SliceBound>> };

/** The number at `key` of a slice's config, held to the bounds the slice declares for it. */
export function sliceNumber(slice: SliceNumbers, key: string): number {
  const v = slice.config[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`surface config "${key}" is missing or not a finite number`);
  const b = slice.bounds?.[key];
  if (b === undefined || b === null || typeof b !== 'object' || typeof b.min !== 'number' || typeof b.max !== 'number' || !(b.min <= b.max)) throw new Error(`surface config "${key}" has no valid bounds (min <= max) in its slice`);
  if (b.on_invalid !== 'fail' && b.on_invalid !== 'clamp') throw new Error(`surface config "${key}" has an unknown on_invalid "${String(b.on_invalid)}"`);
  if (v >= b.min && v <= b.max) return v;
  if (b.on_invalid === 'clamp') {
    const clamped = Math.min(b.max, Math.max(b.min, v));
    console.warn(`surface config "${key}" is ${v}, outside its bounds ${b.min} to ${b.max}; clamped to ${clamped}`);
    return clamped;
  }
  throw new Error(`surface config "${key}" is ${v}, outside its bounds ${b.min} to ${b.max} (on_invalid fail)`);
}
