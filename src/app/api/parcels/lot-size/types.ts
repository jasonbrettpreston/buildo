// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (user inputs, dated note 2026-11-11), §11a.4 (provenance)
//
// MF-19 · request and response contract of POST /api/parcels/lot-size (the sibling-route pattern of /api/parcels/lookup/types.ts, plan fold F5).
// The request validator is built from route_request in scripts/surfaces/_schema/lot-size-entry-contract.json (the FORM schema plus parcel_id; a
// test pins route_request = entry_request + parcel_id) and adds the two rules a JSON Schema in MF-42's keyword subset cannot say: a finite number
// and at most 2 decimals. The response is the stored-entry projection, .strict(): never entered_by, never the typed value.
import { z } from 'zod';
// OUTPUT fold S-3: this module reads the contract JSON only, never src/lib/parcels/lot-size-entry.ts (which imports the whole logic-variable
// seed), so a client that imports these types (the admin revert hook today, the user form at the flip) does not bundle the seed.
import CONTRACT from '../../../../../scripts/surfaces/_schema/lot-size-entry-contract.json';

const UNITS = ['sqft', 'm2'] as const;

type Schema = Parameters<typeof z.fromJSONSchema>[0];
const base = z.fromJSONSchema(CONTRACT.route_request as unknown as Schema) as unknown as z.ZodType<LotSizeEntryRequest>;
const atMostTwoDecimals = (n: number): boolean => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export interface LotSizeEntryRequest { parcel_id: string; lot_area_value: number; lot_area_unit: (typeof UNITS)[number] }
export const LotSizeEntryRequestSchema = base.refine((b) => atMostTwoDecimals(b.lot_area_value), {
  message: 'lot_area_value must be a finite number with at most 2 decimals',
  path: ['lot_area_value'],
});

export const LotSizeEntryViewSchema = z
  .object({
    sqm: z.number().positive(),
    display: z.string().min(1),
    entered_at: z.string().min(1),
    entered_at_display: z.string().min(1),
    source: z.literal('user'),
  })
  .strict();
export const LotSizeEntryResponseSchema = z.object({ lot_size: LotSizeEntryViewSchema }).strict();
export type LotSizeEntryResponse = z.infer<typeof LotSizeEntryResponseSchema>;

/** PUT /api/admin/parcels/lot-size/revert (D-4): the reverted entry, the same projection. */
export const LotSizeRevertResponseSchema = z.object({ parcel_id: z.string().min(1), reverted: LotSizeEntryViewSchema }).strict();
