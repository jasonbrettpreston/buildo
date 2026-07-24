/**
 * Dashboard stats payload contract + validation.
 *
 * SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §4.4 (API envelope)
 *
 * Lives outside `src/app/dashboard/page.tsx` because Next.js App Router pages may
 * only export a default component + a fixed set of framework names — a stray
 * named export fails the build.
 */

export interface DashboardStats {
  total_permits: number;
  active_permits: number;
  permits_this_week: number;
  coa_total: number;
  coa_linked: number;
  coa_upcoming: number;
}

/**
 * Type-guard for the /api/admin/stats payload. The route returns a flat stats
 * object on success but a truthy error envelope on failure
 * (`{ error }` or `{ data: null, error, meta }`, HTTP 500). Without this check,
 * an error envelope passes the `stats ?` existence guard and every
 * `stats.<field>.toLocaleString()` throws on `undefined` — crashing the whole
 * client component to a white screen. Reject anything without numeric fields so
 * the cards degrade to `--` instead. (WF3: dashboard white-screen null-guard.)
 */
export function isValidDashboardStats(data: unknown): data is DashboardStats {
  if (data == null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.total_permits === 'number' &&
    typeof d.active_permits === 'number' &&
    typeof d.permits_this_week === 'number' &&
    typeof d.coa_total === 'number' &&
    typeof d.coa_linked === 'number' &&
    typeof d.coa_upcoming === 'number'
  );
}
