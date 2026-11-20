// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8 (a number an admin surface uses is a registered logic variable; unit constants and definitional windows are pinned, min = max);
//            docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.44 (the conversion factor is content/settings, never code).
//
// FIX.PROJ (task-372) · the one reader of a PINNED logic variable (min = max = default) for the pure report projection, which reads no database: a
// pinned value cannot differ from its seed row, so the committed seed (scripts/seeds/logic_variables.json, the lot-view.ts and placements/contract.ts
// precedent) is the value. An absent row, an unpinned row or a non-number throws, naming the variable (fail closed, never a default of its own).

/** The value of the pinned numeric logic variable `key` in `seed`; throws by name when absent or not pinned. */
export function pinnedSetting(seed: Record<string, unknown>, key: string): number {
  const row = seed[key] as { default?: unknown; min?: unknown; max?: unknown; type?: unknown } | undefined;
  if (row === undefined || row === null || typeof row !== 'object') throw new Error(`report-projection: logic variable ${key} is not in the seed`);
  const { default: d, min, max } = row;
  if (row.type !== 'number' || typeof d !== 'number' || !Number.isFinite(d) || min !== d || max !== d) throw new Error(`report-projection: logic variable ${key} is not pinned (type number, min = max = default, finite)`);
  return d;
}
