// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (the frozen consumer contract)
//
// Request/Response contract for the CONSUMER Parcel Cost Tool lookup (mobile). Read-only.
// The response is an EXPLICIT WHITELIST (Spec 100 §3.2): the proprietary cost menu + headline
// areas (Tier 1) and the neighbourhood picture (Tier 2). The Spec 89 diagnostic Tier-3 `groups`
// are EXCLUDED BY DESIGN — the parcel object is `.strict()`, so a `groups` key (or any other
// unlisted field) fails the boundary parse. Degradation is tier-stratified (Spec 100 §2.5): a
// drifted secondary JSONB degrades to null + a warnings[] entry, never a whole-payload 500.

import { z } from 'zod';
// Reuse the Spec 89 admin schemas verbatim where the shape is identical — never fork them.
import {
  CostMenuSchema,
  CostScalarsSchema,
  AreaHeadlinesSchema,
  NearbyBuildsSummarySchema,
  CoaProjectSchema,
  CompStatsSchema,
  ParcelMatchSchema,
  ParcelCandidateSchema,
  type CostMenu,
  type CostScalars,
  type NearbyBuildsSummary,
  type CoaProject,
  type CompStats,
} from '@/app/api/admin/parcels/lookup/types';

export {
  CostMenuSchema,
  CostScalarsSchema,
  AreaHeadlinesSchema,
  NearbyBuildsSummarySchema,
  CoaProjectSchema,
  CompStatsSchema,
};
export type { CostMenu, CostScalars, NearbyBuildsSummary, CoaProject, CompStats };

// ── Request ──────────────────────────────────────────────────────────────────
// Exactly one of q | parcelId (400 otherwise — enforced by superRefine). Mirrors Spec 89 §3.
export const ConsumerParcelLookupQuerySchema = z
  .object({
    q: z.string().trim().min(3, 'address must be at least 3 characters').max(120).optional(),
    parcelId: z.string().trim().min(1).max(32).optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.q) === Boolean(v.parcelId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'provide exactly one of q or parcelId' });
    }
  });
export type ConsumerParcelLookupQuery = z.infer<typeof ConsumerParcelLookupQuerySchema>;

// ── Tier 2 — comparable build (STRICT — no passthrough, unlike the admin ComparableBuild). ──
// Each field is explicitly picked (Spec 100 §3.2 whitelist); `permit_fsi` (FSI) and
// `structure_family`/`work_type` (build type) are the prominent presentation fields (§1).
export const ConsumerComparableBuildSchema = z
  .object({
    address: z.string().nullable(),
    lot_sqm: z.number().nullable(),
    frontage_m: z.number().nullable(),
    distance_m: z.number().nullable(),
    work_type: z.string().nullable(),
    permit_gfa_sqm: z.number().nullable(),
    permit_fsi: z.number().nullable(),
    storeys: z.number().nullable(),
    coa_decision: z.string().nullable(),
    build_ratio: z.number().nullable(),
    structure_family: z.string().nullable(),
  })
  .strict();
export type ConsumerComparableBuild = z.infer<typeof ConsumerComparableBuildSchema>;

// ── The consumer parcel payload (Tier 1 + Tier 2; NO Tier-3 `groups`). ──────────
// `.strict()` on both objects is the WHITELIST enforcement: any unlisted key (e.g. a leaked
// `groups`, or a future Tier-3 column) fails the boundary parse in the route.
export const ConsumerParcelSchema = z
  .object({
    costMenu: z.object({
      menu: CostMenuSchema.nullable(),
      scalars: CostScalarsSchema.nullable(),
    }),
    areas: AreaHeadlinesSchema,
    neighbourhood: z
      .object({
        summary: NearbyBuildsSummarySchema.nullable(),
        compStats: CompStatsSchema,
        coaProjects: z.array(CoaProjectSchema),
        comparableBuilds: z.array(ConsumerComparableBuildSchema).nullable(),
      })
      .strict(),
  })
  .strict();
export type ConsumerParcel = z.infer<typeof ConsumerParcelSchema>;

// ── MF-53 the map fields (Spec 100 §3.2 dated note 2026-11-11; D-2 a and DECISIONS-v3 item 1): present ONLY when resolution is
// multi_parcel or unlinked. Every level is .strict(); each value names its parcels / address_points column in the Spec 100 note.
const LatLngSchema = z.object({ lat: z.number(), lng: z.number() }).strict();
const Ring = z.array(z.tuple([z.number(), z.number()]));
/** ST_AsGeoJSON(parcels.geom, 6): a Polygon or MultiPolygon, no crs / bbox passthrough (security M-1). */
export const LotOutlineSchema = z.union([
  z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(Ring)) }).strict(),
]);
export const ConsumerMapLotSchema = z
  .object({
    parcelId: z.string(), // parcels.parcel_id
    area: z.string().nullable(), // parcels.lot_size_sqm, rule area_sqft_m2_dot (the report's lot.size rule)
    frontage: z.string().nullable(), // parcels.frontage_m, rule len1
    zoning: z.string().nullable(), // parcels.zoning_zn_string, verbatim
    centroid: LatLngSchema.nullable(), // parcels.centroid_lat / centroid_lng (the letter marker)
    outline: LotOutlineSchema.nullable(), // parcels.geom
  })
  .strict();
export const ConsumerMapNeighbourSchema = z.object({ parcelId: z.string(), outline: LotOutlineSchema.nullable() }).strict();
export const ConsumerLotMapSchema = z
  .object({
    address: z.string().nullable(), // address_points.address_full of the unlinked address (the message names it)
    pin: LatLngSchema.nullable(), // address_points.latitude / longitude
    fit: z.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() }).strict().nullable(), // the start view
    truncated: z.boolean(), // more than 10 lots on one address: no lots are sent
    lots: z.array(ConsumerMapLotSchema),
    neighbours: z.array(ConsumerMapNeighbourSchema), // unlinked with a pin only (faint, tappable)
  })
  .strict();
export type ConsumerLotMap = z.infer<typeof ConsumerLotMapSchema>;
export const RESOLUTIONS = ['unique', 'text_candidates', 'multi_parcel', 'unlinked', 'no_match'] as const;
export const MAP_RESOLUTIONS: readonly string[] = ['multi_parcel', 'unlinked'];

// MF-48 Stage B (Spec 100 §3.2 dated note 2026-11-12; operator 2026-11-12 "Ball y", B-3 a): the mobile report page VIEW, built on the server by
// MF-57's core (pageViewOf(buildPage(response), {target: 'mobile'}), src/lib/parcels/report-page.ts) from the lot's producer response; null while no
// producer has the lot (every customer lot until MB-44). Every level is .strict(): the keys are the core's own projection (core.ts pageViewOf), so a
// stray key fails the boundary parse. The texts are server-formatted page parts; the app looks them up by section id, part index and role.
const PagePartSchema = z
  .object({
    role: z.string(),
    brief: z.string(),
    kind: z.enum(['value', 'content', 'pending']),
    text: z.string(),
    field: z.string().optional(),
    content: z.string().optional(),
    pending: z.string().optional(),
    key: z.string().optional(),
    rule: z.string().optional(),
  })
  .strict();
const PageAdSchema = z
  .object({ field: z.string(), slot: z.string(), source: z.string(), label: z.string(), value: z.string(), disclosure: z.string(), scenario: z.string().optional() })
  .strict();
const PageSectionSchema = z
  .object({ kind: z.string(), id: z.string(), brief: z.string().optional(), scenario: z.string().optional(), ad: PageAdSchema.optional(), parts: z.array(PagePartSchema) })
  .strict();
export const ReportPageViewSchema = z
  .object({
    target: z.literal('mobile'),
    layout: z.object({ columns: z.number(), details: z.string(), meta: z.string(), page_break: z.string() }).strict(),
    sections: z.array(PageSectionSchema),
  })
  .strict();
export type ReportPageView = z.infer<typeof ReportPageViewSchema>;

export const ConsumerParcelLookupResponseSchema = z
  .object({
    match: ParcelMatchSchema.nullable(),
    candidates: z.array(ParcelCandidateSchema),
    warnings: z.array(z.string()),
    parcel: ConsumerParcelSchema.nullable(),
    resolution: z.enum(RESOLUTIONS),
    map: ConsumerLotMapSchema.nullable(),
    page: ReportPageViewSchema.nullable(), // MF-48 Stage B: a page only with a parcel (the refine below)
  })
  .strict()
  .refine((r) => r.page === null || r.parcel !== null, { message: 'page is present only with a parcel (a hit)', path: ['page'] })
  .refine((r) => (r.map !== null) === MAP_RESOLUTIONS.includes(r.resolution), {
    message: 'map is present exactly when resolution is multi_parcel or unlinked',
    path: ['map'],
  });
export type ConsumerParcelLookupResponse = z.infer<typeof ConsumerParcelLookupResponseSchema>;
