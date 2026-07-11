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

export const ConsumerParcelLookupResponseSchema = z
  .object({
    match: ParcelMatchSchema.nullable(),
    candidates: z.array(ParcelCandidateSchema),
    warnings: z.array(z.string()),
    parcel: ConsumerParcelSchema.nullable(),
  })
  .strict();
export type ConsumerParcelLookupResponse = z.infer<typeof ConsumerParcelLookupResponseSchema>;
