// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (web_landing, dated note 2026-11-11 MF-76), §11b.2 (goldens),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-33, FE-37.
//
// MF-76 · the landing test fixture: an in-memory database (never a real one) that answers the landing's declared reads, in four modes:
// `ok` (the stored citywide row, the allowances, the pace settings), `no_row` (no stored citywide row), `zero` (one stored value is 0) and
// `throws` (every query throws). Values are synthetic, chosen only to be distinct; the pace values are the seed defaults.
import { REPORT_CHECK_KEYS } from '@/lib/parcels/report-check-pace';
import type { Queryable } from '@/lib/entitlements';

export type FixtureMode = 'ok' | 'no_row' | 'zero' | 'throws';

export const FIXTURE_ROW = {
  parcels_total: 496536, building_footprints_total: 512300, permits_active_distinct: 41200, coa_total: 17800, map_areas_total: 9120,
  zoning_layer_version: '2026-10-01', permits_last_seen_at: '2026-11-10', coa_last_seen_at: '2026-11-09',
};
export const FIXTURE_LIMITS = { parcel_tool_report_limit_trial: 20, parcel_tool_report_limit_plan: 25 };
export const FIXTURE_PACE = { [REPORT_CHECK_KEYS.minMs]: 23000, [REPORT_CHECK_KEYS.skipAfterMs]: 0, [REPORT_CHECK_KEYS.readyHoldMs]: 1500 };

/** A Queryable over the fixture; `calls` records each SQL text (the read count of T14). */
export function fixtureDb(mode: FixtureMode, opts: { pace?: Record<string, number | undefined>; paceThrows?: boolean } = {}): Queryable & { calls: string[] } {
  const calls: string[] = [];
  const query = async (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
    calls.push(sql);
    if (mode === 'throws') throw new Error('fixture: the database is unreachable');
    if (/FROM data_quality_snapshots/.test(sql)) {
      if (mode === 'no_row') return { rows: [] };
      return { rows: [mode === 'zero' ? { ...FIXTURE_ROW, map_areas_total: 0 } : FIXTURE_ROW] };
    }
    if (/FROM logic_variables/.test(sql)) {
      const keys = (params?.[0] ?? []) as string[];
      if (opts.paceThrows && keys.includes(REPORT_CHECK_KEYS.minMs)) throw new Error('fixture: the pace read failed');
      const pace = { ...FIXTURE_PACE, ...(opts.pace ?? {}) };
      const all: Record<string, number> = { ...FIXTURE_LIMITS };
      for (const [k, v] of Object.entries(pace)) if (v !== undefined) all[k] = v;
      return { rows: keys.filter((k) => k in all).map((k) => ({ variable_key: k, variable_value: String(all[k]) })) };
    }
    throw new Error(`fixture: unexpected query ${sql.slice(0, 40)}`);
  };
  return { query: query as unknown as Queryable['query'], calls };
}
