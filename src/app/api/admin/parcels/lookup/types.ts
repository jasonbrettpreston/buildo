// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (the frozen contract)
//
// Request/Response contract for the Parcel Cost Model Tool lookup — defined BEFORE implementation
// (WF1 Contract Definition). Read-only: the response is a re-organization of existing parcels
// columns + a nearby coa_applications list. Tier-3 `groups` values are `unknown` BY DESIGN
// (data-transparency tool — Spec 89 §3 records the §11 stable-names decision).
//
// Degradation policy (Spec 89 §2.4): tier shapes are validated INDEPENDENTLY with safeParse by the
// assembler; a drifted tier degrades to null + a warnings[] entry — never a whole-payload 500.

import { z } from 'zod';

// ── Request ──────────────────────────────────────────────────────────────────
// Exactly one of q | parcelId (400 otherwise — enforced by superRefine).
export const ParcelLookupQuerySchema = z
  .object({
    q: z.string().trim().min(3, 'address must be at least 3 characters').max(120).optional(),
    parcelId: z.string().trim().min(1).max(32).optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.q) === Boolean(v.parcelId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'provide exactly one of q or parcelId' });
    }
  });
export type ParcelLookupQuery = z.infer<typeof ParcelLookupQuerySchema>;

// ── Tier 1 — the proprietary cost payload (Spec 88 §2.3–2.4) ────────────────
// A menu line that is ABSENT means "not computable"; fits:false means "computed, doesn't fit".
// The UI must render these distinctly (Spec 89 §2.3). passthrough() tolerates additive drift;
// hard shape drift is caught by safeParse and degrades per §2.4.
export const CostLineSchema = z
  .object({
    total: z.number().nullable().optional(),
    per_sqm: z.number().nullable().optional(),
    area: z.number().nullable().optional(),
    area_confidence: z.string().nullable().optional(),
    fits: z.boolean().optional(),
    norm_basis: z.string().nullable().optional(),
  })
  .passthrough();
export type CostLine = z.infer<typeof CostLineSchema>;

export const CostMenuSchema = z.record(z.string(), z.union([CostLineSchema, z.number(), z.string()]));
export type CostMenu = z.infer<typeof CostMenuSchema>; // _schema_version rides as a number entry

export const CostScalarsSchema = z.record(z.string(), z.number().nullable());
export type CostScalars = z.infer<typeof CostScalarsSchema>;

export const AreaHeadlinesSchema = z.record(z.string(), z.union([z.number(), z.string()]).nullable());
export type AreaHeadlines = z.infer<typeof AreaHeadlinesSchema>;

// ── Tier 2 — the neighbourhood ───────────────────────────────────────────────
// Minimal-contract validation: exactly the fields the UI renders; passthrough for the rest.
export const NearbyBuildsSummarySchema = z
  .object({
    headline: z.string(),
    basis: z.string(),
    coa_approval_rate: z.union([z.number(), z.string()]).nullable().optional(),
    typical_fsi: z.number().nullable().optional(),
    comp_fsi_basis: z.string().nullable().optional(),
  })
  .passthrough();
export type NearbyBuildsSummary = z.infer<typeof NearbyBuildsSummarySchema>;

export const CoaProjectSchema = z.object({
  applicationNumber: z.string().nullable(),
  address: z.string().nullable(),
  status: z.string().nullable(),
  decision: z.string().nullable(),
  decisionDate: z.string().nullable(),
  hearingDate: z.string().nullable(),
  description: z.string().nullable(),
  projectType: z.string().nullable(),
  modeledGfaSqm: z.number().nullable(),
  estimatedCost: z.number().nullable(),
});
export type CoaProject = z.infer<typeof CoaProjectSchema>;

export const ComparableBuildSchema = z
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
  .passthrough();
export type ComparableBuild = z.infer<typeof ComparableBuildSchema>;

export const CompStatsSchema = z.object({
  compCount: z.number().nullable(),
  compDominantBuild: z.string().nullable(),
  compBuildRatioP50: z.number().nullable(),
  compFsiP50: z.number().nullable(),
  neighbourhoodId: z.number().nullable(),
  neighbourhoodCostPremium: z.number().nullable(),
});
export type CompStats = z.infer<typeof CompStatsSchema>;

// ── Tier 3 — everything else (Spec 89 §4 normative mapping) ─────────────────
export const GROUP_KEYS = [
  'identity',
  'lot_address',
  'zoning',
  'heritage_ravine_centreline',
  'existing_structure',
  'max_build',
  'scenarios',
  'accessory',
  'optimal_config',
] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

// ── The response ─────────────────────────────────────────────────────────────
export const ParcelMatchSchema = z.object({
  parcelId: z.string(),
  matchType: z.enum(['exact', 'typeahead', 'direct']),
  address: z.string(),
});
export type ParcelMatch = z.infer<typeof ParcelMatchSchema>;

export const ParcelCandidateSchema = z.object({ parcelId: z.string(), address: z.string() });
export type ParcelCandidate = z.infer<typeof ParcelCandidateSchema>;

export const ParcelPayloadSchema = z.object({
  costMenu: z.object({ menu: CostMenuSchema.nullable(), scalars: CostScalarsSchema.nullable() }),
  areas: AreaHeadlinesSchema,
  neighbourhood: z.object({
    summary: NearbyBuildsSummarySchema.nullable(),
    coaProjects: z.array(CoaProjectSchema),
    comparableBuilds: z.array(ComparableBuildSchema).nullable(),
    compStats: CompStatsSchema,
  }),
  groups: z.record(z.enum(GROUP_KEYS), z.record(z.string(), z.unknown())),
});
export type ParcelPayload = z.infer<typeof ParcelPayloadSchema>;

export const ParcelLookupResponseSchema = z.object({
  match: ParcelMatchSchema.nullable(),
  candidates: z.array(ParcelCandidateSchema),
  warnings: z.array(z.string()),
  parcel: ParcelPayloadSchema.nullable(),
});
export type ParcelLookupResponse = z.infer<typeof ParcelLookupResponseSchema>;
