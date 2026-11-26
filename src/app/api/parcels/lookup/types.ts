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
    // SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): the semi question page sets this on its Continue fetch, so an unsure lot counts like any lot once it is answered.
    semi: z.literal('answered').optional(),
    // task-267 LOAD.2 (PLAN-267-v2 step 2, O1-A2; RR-0497 Q-e A; the semi=answered precedent): the fast read the report screen sends first, at the pick. It
    // returns the stored page or the What we checked view (whatWeChecked) and runs no compute. It belongs to parcelId and is never sent with semi.
    fast: z.literal('1').optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.q) === Boolean(v.parcelId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'provide exactly one of q or parcelId' });
    }
    if (v.semi !== undefined && !v.parcelId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'semi belongs to a known lot: send it with parcelId' });
    }
    if (v.fast !== undefined && (!v.parcelId || v.semi !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fast belongs to a known lot: send it with parcelId and without semi' });
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
    frontageStreet: z.string().nullable(), // parcels.primary_frontage_street_name (SRCH.LOTCARD, RR-0284): the card says which street the lot faces
    hasFootprint: z.boolean(), // a parcel_buildings row exists for the lot (the massing join): the map draws it and the card says "has the house"
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
// SEMI-B (Spec 78 O-4 + the doubt rule, operator "semi all y" / "semi ask a", 2026-11-13): the lot's form from the view parcel_lot_form (migration 320).
// `unsure` is the ask band: the app shows the one-question page before the report. The evidence columns of the view are not sent.
export const LOT_FORM_BASES = ['o4_two_parcel_abut', 'doubt_multi_parcel_abut', 'o4_not_met'] as const;
export const ConsumerLotFormSchema = z
  .object({
    detected: z.enum(['semi_half', 'detached']), // parcel_lot_form.lot_form_detected
    basis: z.enum(LOT_FORM_BASES), // parcel_lot_form.lot_form_basis
    unsure: z.boolean(), // parcel_lot_form.unsure
  })
  .strict();
export type ConsumerLotForm = z.infer<typeof ConsumerLotFormSchema>;
export const RESOLUTIONS = ['unique', 'text_candidates', 'multi_parcel', 'unlinked', 'no_match'] as const;
export const MAP_RESOLUTIONS: readonly string[] = ['multi_parcel', 'unlinked'];

// MF-48 Stage B (Spec 100 §3.2 dated note 2026-11-12; operator 2026-11-12 "Ball y", B-3 a): the mobile report page VIEW, built on the server by
// MF-57's core (pageViewOf(buildPage(response), {target: 'mobile'}), src/lib/parcels/report-page.ts) from the lot's producer response; null while no
// producer has the lot (every customer lot until MB-44). Every level is .strict(): the keys are the core's own projection (core.ts pageViewOf), so a
// stray key fails the boundary parse. The texts are server-formatted page parts; the app looks them up by section id, part index and role.
const Pt = z.array(z.number());
const LotDrawingSchema = z
  .object({ state: z.string(), outline: z.array(Pt), edges: z.array(z.object({ class: z.string(), line: z.array(Pt) }).strict()), envelope: z.array(Pt).optional(), footprint: z.array(Pt).optional() })
  .strict();
const PagePartSchema = z
  .object({
    role: z.string(),
    brief: z.string(),
    kind: z.enum(['value', 'content', 'pending', 'ref', 'drawing']),
    text: z.string(),
    field: z.string().optional(),
    content: z.string().optional(),
    pending: z.string().optional(),
    key: z.string().optional(),
    rule: z.string().optional(),
    option: z.string().optional(), // MF-83 (FE-41): a summary part's option section id
    ref: z.string().optional(), // MF-83: the role of the option part a summary part shows
    drawing: LotDrawingSchema.optional(), // MF-83 group 2 (FE-42): the server-built lot view, validated again by the core
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
    layout: z.object({ columns: z.number(), details: z.string(), details_view: z.string(), meta: z.string(), page_break: z.string() }).strict(),
    sections: z.array(PageSectionSchema),
  })
  .strict();
export type ReportPageView = z.infer<typeof ReportPageViewSchema>;

// task-267 LOAD.2 (PLAN-267-v2 step 2; X-4 a, operator "x-4 a" 2026-11-11, .cursor/MCFRONTEND-QUEUE.md:367): the What we checked view of the fast read, the
// core's ViewChecked (src/lib/surfaces/report/core.ts: CheckedTree plus paced and href) built on the server by buildTree and viewOf from readWhatWeChecked
// (src/lib/parcels/what-we-checked.ts). Every text is a server-filled content template (FE-05); the pace is integer milliseconds. href is always null here
// (no Skip is drawn: RR-0176 "always runs to completion"). Every level is .strict(), so a stray key fails the boundary parse.
const Ms = z.number().int().nonnegative();
export const CheckedViewSchema = z
  .object({
    summary: z.string(),
    groups: z.array(z.object({
      key: z.string(),
      lines: z.array(z.object({ key: z.string(), text: z.string(), verb: z.string(), delay_ms: Ms, done_ms: Ms }).strict()),
    }).strict()),
    dates: z.object({ text: z.string(), delay_ms: Ms }).strict().optional(),
    skip: z.object({ text: z.string(), after_ms: Ms }).strict(),
    ready: z.object({ text: z.string(), at_ms: Ms }).strict(),
    open: z.object({ text: z.string() }).strict(),
    min_ms: Ms,
    paced: z.boolean(),
    href: z.null(),
  })
  .strict();
export type CheckedView = z.infer<typeof CheckedViewSchema>;

export const ConsumerParcelLookupResponseSchema = z
  .object({
    match: ParcelMatchSchema.nullable(),
    candidates: z.array(ParcelCandidateSchema),
    warnings: z.array(z.string()),
    parcel: ConsumerParcelSchema.nullable(),
    resolution: z.enum(RESOLUTIONS),
    map: ConsumerLotMapSchema.nullable(),
    page: ReportPageViewSchema.nullable(), // MF-48 Stage B: a page only with a parcel (the refine below)
    lotForm: ConsumerLotFormSchema.nullable().default(null), // SEMI-B: the lot form, only with a parcel (the refine below)
    whatWeChecked: CheckedViewSchema.nullable().default(null), // task-267: the fast read's checked view, only with a parcel and no page (the refine below)
  })
  .strict()
  .refine((r) => r.page === null || r.parcel !== null, { message: 'page is present only with a parcel (a hit)', path: ['page'] })
  .refine((r) => r.lotForm === null || r.parcel !== null, { message: 'lotForm is present only with a parcel (a hit)', path: ['lotForm'] })
  .refine((r) => r.whatWeChecked === null || (r.parcel !== null && r.page === null), { message: 'whatWeChecked is present only with a parcel and no page', path: ['whatWeChecked'] })
  .refine((r) => (r.map !== null) === MAP_RESOLUTIONS.includes(r.resolution), {
    message: 'map is present exactly when resolution is multi_parcel or unlinked',
    path: ['map'],
  });
export type ConsumerParcelLookupResponse = z.infer<typeof ConsumerParcelLookupResponseSchema>;
