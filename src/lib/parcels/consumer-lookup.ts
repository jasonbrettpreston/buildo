// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API) + §3.2 (the whitelist)
//
// CONSUMER assembly for the mobile Parcel Cost Tool. The route stays thin; this lib:
//   - REUSES the Spec 89 admin resolver internals verbatim (resolveAddress / fetchParcelById /
//     fetchCoaProjects) — the normalizers are NOT forked (a third copy would diverge from the
//     JOIN keys; Spec 89 Known Failure Modes).
//   - assembleConsumerPayload() — the Tier-1 (cost menu + scalars + headline areas) + Tier-2
//     (neighbourhood) WHITELIST, with the Spec 89 §2.4 tier-stratified safeParse degradation.
//     The Spec 89 diagnostic Tier-3 `groups` are NOT included (Spec 100 §2.2).
//
// READ-ONLY: no writes, no derivation — the pick-by-name assembler is the whitelist (Spec 100 §3.2).

import { logWarn } from '@/lib/logger';
import {
  T1_COST_SCALAR_COLS,
  type ParcelRow,
} from '@/lib/admin/parcel-lookup';
import {
  CostMenuSchema,
  NearbyBuildsSummarySchema,
  CoaProjectSchema,
  ConsumerComparableBuildSchema,
  type CoaProject,
  type ConsumerComparableBuild,
  type ConsumerParcel,
} from '@/app/api/parcels/lookup/types';

const TAG = '[api/parcel-lookup]';

// ── The Tier-1 headline whitelist (Spec 100 §3.2 — CONSUMER_HEADLINE_COLS). ────
// Lot / envelope / optimal-config headline figures ONLY. The remaining max_build_* diagnostic
// columns and every zoning/heritage/existing/scenario/accessory column stay EXCLUDED.
export const CONSUMER_HEADLINE_COLS = [
  'lot_size_sqm', 'lot_size_sqft',
  'opt_aor_gfa_sqm', 'opt_aor_storeys',
  'opt_coa_gfa_sqm', 'opt_coa_storeys',
  'max_buildable_gfa_sqm', 'max_buildable_footprint_sqm',
  'max_build_stories', 'max_build_fsi', 'coa_fsi', 'realized_fsi_p90',
  'cur_floor_gfa_sqm', 'max_newbuild_coa_gfa_sqm',
  'envelope_constrained', 'envelope_constraint_reason',
] as const;

// The comparable_builds JSONB fields the consumer exposes (explicit pick — no passthrough).
const CONSUMER_COMPARABLE_FIELDS = [
  'address', 'lot_sqm', 'frontage_m', 'distance_m', 'work_type', 'permit_gfa_sqm',
  'permit_fsi', 'storeys', 'coa_decision', 'build_ratio', 'structure_family',
] as const;

const MAX_COMPARABLE_EXAMPLES = 12;

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * Assemble the CONSUMER whitelist payload from a fetched parcel row + nearby CoA list.
 * Tier-stratified degradation (Spec 100 §2.5): each JSONB tier safeParses independently; a
 * drifted tier degrades to null + a warnings[] entry — the Tier-1 payload never blanks on a
 * Tier-2 drift. Diagnostic Tier-3 columns are never read into the response.
 */
export function assembleConsumerPayload(
  row: ParcelRow,
  coaProjects: CoaProject[],
): { payload: ConsumerParcel; warnings: string[] } {
  const warnings: string[] = [];
  const parcelId = String(row.parcel_id ?? '');

  // ── Tier 1 — cost menu (deep-validated; drift degrades to null). ───────────
  let menu: ConsumerParcel['costMenu']['menu'] = null;
  if (row.parcel_cost_menu != null) {
    const parsed = CostMenuSchema.safeParse(row.parcel_cost_menu);
    if (parsed.success) menu = parsed.data;
    else {
      warnings.push('cost menu unavailable (data shape drift — logged)');
      logWarn(TAG, 'jsonb-drift', { field: 'parcel_cost_menu', parcelId });
    }
  }
  const scalars: Record<string, number | null> = {};
  for (const c of T1_COST_SCALAR_COLS) scalars[c] = num(row[c]);

  // Tier 1 headline areas — whitelist only; non-numeric strings (ranges/reasons) preserved verbatim.
  const areas: Record<string, number | string | null> = {};
  for (const c of CONSUMER_HEADLINE_COLS) {
    const v = row[c];
    if (v == null) { areas[c] = null; continue; }
    if (typeof v === 'boolean') { areas[c] = String(v); continue; }
    if (typeof v === 'string') { areas[c] = Number.isNaN(Number(v)) ? v : num(v); continue; }
    areas[c] = num(v);
  }

  // ── Tier 2 — neighbourhood. ────────────────────────────────────────────────
  let summary: ConsumerParcel['neighbourhood']['summary'] = null;
  if (row.nearby_builds_summary != null) {
    const parsed = NearbyBuildsSummarySchema.safeParse(row.nearby_builds_summary);
    if (parsed.success) summary = parsed.data;
    else {
      warnings.push('neighbourhood summary unavailable (data shape drift — logged)');
      logWarn(TAG, 'jsonb-drift', { field: 'nearby_builds_summary', parcelId });
    }
  }

  const validCoa: CoaProject[] = [];
  for (const p of coaProjects) {
    const parsed = CoaProjectSchema.safeParse(p);
    if (parsed.success) validCoa.push(parsed.data);
  }
  if (validCoa.length < coaProjects.length) {
    warnings.push('some nearby CoA projects unavailable (data shape drift — logged)');
    logWarn(TAG, 'jsonb-drift', { field: 'coa_projects', parcelId });
  }

  // comparable_builds — explicit field pick per example (strict schema; no passthrough leak).
  let comparableBuilds: ConsumerComparableBuild[] | null = null;
  if (Array.isArray(row.comparable_builds)) {
    const picked: ConsumerComparableBuild[] = [];
    let dropped = 0;
    for (const raw of (row.comparable_builds as unknown[]).slice(0, MAX_COMPARABLE_EXAMPLES)) {
      const src = (raw ?? {}) as Record<string, unknown>;
      const candidate: Record<string, unknown> = {};
      for (const f of CONSUMER_COMPARABLE_FIELDS) {
        candidate[f] = f === 'work_type' || f === 'address' || f === 'coa_decision' || f === 'structure_family'
          ? str(src[f])
          : num(src[f]);
      }
      const parsed = ConsumerComparableBuildSchema.safeParse(candidate);
      if (parsed.success) picked.push(parsed.data);
      else dropped += 1;
    }
    comparableBuilds = picked;
    if (dropped > 0) {
      warnings.push('some comparable builds unavailable (data shape drift — logged)');
      logWarn(TAG, 'jsonb-drift', { field: 'comparable_builds', parcelId });
    }
  }

  return {
    payload: {
      costMenu: { menu, scalars },
      areas,
      neighbourhood: {
        summary,
        compStats: {
          compCount: num(row.comp_count),
          compDominantBuild: str(row.comp_dominant_build),
          compBuildRatioP50: num(row.comp_build_ratio_p50),
          compFsiP50: num(row.comp_fsi_p50),
          neighbourhoodId: num(row.neighbourhood_id),
          neighbourhoodCostPremium: num(row.neighbourhood_cost_premium),
        },
        coaProjects: validCoa,
        comparableBuilds,
      },
    },
    warnings,
  };
}
