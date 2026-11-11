// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35; docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (values as data).
//
// MF-62 · McFrontend queue · lane E. The pace of the report loading state "What we checked" (operator 2026-11-11 "Mf-62 - yes", D-2 a: minimum 6 s,
// "Show report" after 2 s, both admin-editable logic_variables, group "MaxBLD Report", migration 306). Read-only. A missing or out-of-bounds value,
// or a skip delay above the minimum, is reported back (never thrown): the producer (what-we-checked.ts) then skips the screen and the report opens.
export interface Queryable { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> }

export const REPORT_CHECK_KEYS = { minMs: 'report_check_min_ms', skipAfterMs: 'report_check_skip_after_ms' } as const;
/** Mirrors scripts/seeds/logic_variables.json min/max for the two keys (pinned equal by report-checked-producer.logic.test.ts). */
export const REPORT_CHECK_BOUNDS: Record<string, { min: number; max: number }> = {
  report_check_min_ms: { min: 1000, max: 20000 },
  report_check_skip_after_ms: { min: 0, max: 10000 },
};

/** The pace settings, or null (with the offending keys) when either is missing, out of bounds, or the skip delay exceeds the minimum. */
export async function readReportCheckPace(db: Queryable): Promise<{ minMs: number; skipAfterMs: number } | { bad: string[] }> {
  const keys = Object.values(REPORT_CHECK_KEYS);
  const res = await db.query<{ variable_key: string; variable_value: string | number | null }>(
    'SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])',
    [keys],
  );
  const byKey = new Map(res.rows.map((r) => [r.variable_key, r.variable_value === null ? Number.NaN : Number(r.variable_value)]));
  const bad: string[] = [];
  const read = (k: string): number => {
    const v = byKey.get(k);
    const b = REPORT_CHECK_BOUNDS[k];
    if (v === undefined || !Number.isInteger(v) || !b || v < b.min || v > b.max) { bad.push(k); return Number.NaN; }
    return v;
  };
  const minMs = read(REPORT_CHECK_KEYS.minMs);
  const skipAfterMs = read(REPORT_CHECK_KEYS.skipAfterMs);
  if (bad.length === 0 && skipAfterMs > minMs) bad.push(REPORT_CHECK_KEYS.skipAfterMs);
  return bad.length ? { bad } : { minMs, skipAfterMs };
}
