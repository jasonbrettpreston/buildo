// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated notes 2026-11-11, MF-62 and its follow-up),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35; docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (values as data).
//
// MF-62 · McFrontend queue · lane E. The pace of the report processing screen, three admin-editable logic_variables in group "MaxBLD Report":
//   report_check_min_ms         the whole sequence; the report opens at this time (migration 306 inserted it, 312 set it);
//   report_check_skip_after_ms  when the quiet "Skip" shows (0 = from the start, WCAG 2.2.2);
//   report_check_ready_hold_ms  how long the ready line holds before the report opens (migration 312).
// Operator 2026-11-11 ("Mf-62 - yes", D-2 a; then the processing sequence: "after the each fact runs - we need to paude and then have somet the
// possibilities report for the address is ready and then transisiton"). Read-only. A missing or out-of-bounds value, a skip delay above the
// minimum, or a hold not below the minimum is reported back (never thrown): the producer (what-we-checked.ts) then skips the screen.
export interface Queryable { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> }

export const REPORT_CHECK_KEYS = { minMs: 'report_check_min_ms', skipAfterMs: 'report_check_skip_after_ms', readyHoldMs: 'report_check_ready_hold_ms' } as const;
/** Mirrors scripts/seeds/logic_variables.json min/max for the three keys (pinned equal by report-checked-producer.logic.test.ts). */
export const REPORT_CHECK_BOUNDS: Record<string, { min: number; max: number }> = {
  report_check_min_ms: { min: 1000, max: 30000 },
  report_check_skip_after_ms: { min: 0, max: 10000 },
  report_check_ready_hold_ms: { min: 500, max: 5000 },
};

export interface ReportCheckPace { minMs: number; skipAfterMs: number; readyHoldMs: number }

/** The pace settings, or the offending keys when any is missing or out of bounds, the skip delay exceeds the minimum, or the hold is not below it. */
export async function readReportCheckPace(db: Queryable): Promise<ReportCheckPace | { bad: string[] }> {
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
  const readyHoldMs = read(REPORT_CHECK_KEYS.readyHoldMs);
  if (bad.length === 0 && skipAfterMs > minMs) bad.push(REPORT_CHECK_KEYS.skipAfterMs);
  if (bad.length === 0 && readyHoldMs >= minMs) bad.push(REPORT_CHECK_KEYS.readyHoldMs);
  return bad.length ? { bad } : { minMs, skipAfterMs, readyHoldMs };
}
