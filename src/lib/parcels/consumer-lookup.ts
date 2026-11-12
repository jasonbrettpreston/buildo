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
import type { ParcelRow } from '@/lib/admin/parcel-lookup';
import {
  NearbyBuildsSummarySchema,
  CoaProjectSchema,
  ConsumerComparableBuildSchema,
  type CoaProject,
  type ConsumerComparableBuild,
  type ConsumerParcel,
  LotOutlineSchema,
  type ConsumerLotMap,
} from '@/app/api/parcels/lookup/types';
import type { LotMapRows } from '@/lib/parcels/lot-map';
import { areaSqftM2Dot, len1 } from '@/lib/parcels/display-rules';

type LotOutline = NonNullable<ConsumerLotMap['lots'][number]['outline']>;

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

// EI-D1 (operator 2026-11-12, "D all as recommended - please ensure this is addedd to the McFrontend decisions"; Spec 135
// FE-38; Spec 100 §3.2 dated note 2026-11-12; Spec 69a M-367 dated note, R-1): the legacy size headlines are WITHHELD — sent
// as null, never as a value. They are legacy Phase 1 sizes, wrong by -47 % to +75 % on the golden 25. The keys stay in the
// whitelist above, so every installed app and every declaration that names them still parses, and shows its null branch.
// Data, not code: one list. Lock: src/tests/consumer-parcel-lookup-legacy-hide.logic.test.ts. Hidden until MB-43.
export const CONSUMER_WITHHELD_LEGACY_COLS: ReadonlySet<string> = new Set([
  'opt_aor_gfa_sqm', 'opt_aor_storeys',
  'opt_coa_gfa_sqm', 'opt_coa_storeys',
  'max_buildable_gfa_sqm',
  'max_build_stories', 'max_build_fsi', 'coa_fsi',
  'max_newbuild_coa_gfa_sqm',
]);

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

  // ── Tier 1 — cost menu and cost scalars: SENT AS NULL (EI-D1, Spec 135 FE-38; Spec 100 §3.2 dated note 2026-11-12). ──
  // The 13 legacy Spec 88 lines and the 12 scalars price the legacy sizes. Both are sent as null (the key shape is kept, so
  // every installed app parses and shows its existing "not yet computed" branch) until MB-94 binds the engine cost on the
  // declared report. Hidden until MB-43 deletes them (Spec 69a M-367 dated note 2026-11-12).

  // Tier 1 headline areas — whitelist only; non-numeric strings (ranges/reasons) preserved verbatim.
  const areas: Record<string, number | string | null> = {};
  for (const c of CONSUMER_HEADLINE_COLS) {
    const v = row[c];
    if (v == null || CONSUMER_WITHHELD_LEGACY_COLS.has(c)) { areas[c] = null; continue; }
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
      costMenu: { menu: null, scalars: null },
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

// ── MF-53 · the map block (Spec 100 §3.2 dated note 2026-11-11; D-2 a, DECISIONS-v3 item 1, Q8) ─────────────────────────────────────
// Assembly only (no SQL here: the read is src/lib/parcels/lot-map.ts). Every value is server-formatted (FE-05): area and frontage through the
// report's display rules, the start view as a box. A GeoJSON outline that fails the strict schema is dropped to null (no polygon drawn) with
// one logWarn naming the parcel, never a blank response.

/** The smallest start-view span in degrees (about 30 m), so a pin alone or a sliver lot still opens at street scale (PLAN panel CR F-5). */
export const FIT_MIN_SPAN_DEG = 0.0003;

const coordsOf = (o: LotOutline | null): Array<[number, number]> =>
  o === null ? [] : o.type === 'Polygon' ? o.coordinates.flat() : o.coordinates.flat(2);

function parseOutline(raw: string | null, parcelId: string): LotOutline | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const parsed = LotOutlineSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  logWarn(TAG, 'outline-drift', { parcelId });
  return null;
}

/** The box around every outline and the pin, widened to FIT_MIN_SPAN_DEG; null when there is nothing to show. */
export function fitOf(outlines: Array<LotOutline | null>, pin: { lat: number; lng: number } | null): ConsumerLotMap['fit'] {
  const pts = [...outlines.flatMap(coordsOf), ...(pin ? [[pin.lng, pin.lat] as [number, number]] : [])];
  if (pts.length === 0) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const widen = (lo: number, hi: number): [number, number] => {
    const pad = Math.max(0, FIT_MIN_SPAN_DEG - (hi - lo)) / 2;
    return [lo - pad, hi + pad];
  };
  const [south, north] = widen(Math.min(...lats), Math.max(...lats));
  const [west, east] = widen(Math.min(...lngs), Math.max(...lngs));
  return { north, south, east, west };
}

export function assembleLotMap(rows: LotMapRows): ConsumerLotMap {
  const lots = rows.lots.map((l) => {
    const lat = num(l.centroid_lat);
    const lng = num(l.centroid_lng);
    return {
      parcelId: String(l.parcel_id),
      area: areaSqftM2Dot(l.lot_size_sqm),
      frontage: len1(l.frontage_m),
      zoning: l.zoning_zn_string == null || l.zoning_zn_string === '' ? null : String(l.zoning_zn_string),
      centroid: lat !== null && lng !== null ? { lat, lng } : null,
      outline: parseOutline(l.outline, String(l.parcel_id)),
    };
  });
  // A neighbour is only an outline: one whose outline is missing, drifted or over the cap is dropped (it could not be drawn or tapped;
  // OUTPUT panel code reviewer LOW-2). A matched lot keeps its card without an outline.
  const neighbours = rows.neighbours
    .map((n) => ({ parcelId: String(n.parcel_id), outline: parseOutline(n.outline, String(n.parcel_id)) }))
    .filter((n) => n.outline !== null);
  return {
    address: rows.address,
    pin: rows.pin,
    fit: fitOf([...lots.map((l) => l.outline), ...neighbours.map((n) => n.outline)], rows.pin),
    truncated: rows.truncated,
    lots,
    neighbours,
  };
}
