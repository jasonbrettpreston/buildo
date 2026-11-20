// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md P4 (tunables are data), docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3
//
// FIX.TUNE (task-378): the one reader of a number the phone takes from a generated surface slice (scripts/surfaces/emit-mobile-surfaces.mjs). A key that is
// missing or not a finite number throws, naming the key: a silent undefined would reach a timer or a query option and fail later and far from the cause.

/** The number at `key` of a slice's config; throws by key name when it is absent, not a number, or not finite. */
export function sliceNumber(config: Readonly<Record<string, unknown>>, key: string): number {
  const v = config[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`surface config "${key}" is missing or not a finite number`);
  return v;
}
