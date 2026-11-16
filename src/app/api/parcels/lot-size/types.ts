// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (user inputs, dated notes 2026-11-11 and 2026-11-15), §11a.4 (provenance)
//
// MF-19 · request and response contract of POST /api/parcels/lot-size (the sibling-route pattern of /api/parcels/lookup/types.ts, plan fold F5).
// Plan v3 (operator 2026-11-15 "R-1 thru R-6 recommendations approved", amendment "b"): TWO bodies, kept in MF-42's keyword subset without conditionals.
// route_request = the width/depth form + parcel_id; route_area_request = the area form + parcel_id (a test pins each = its form schema + parcel_id).
// parseLotSizeBody reads the KEYS first (width_value present = the width path, lot_area_value present = the area path, both or neither = one 400 message),
// then runs ONE strict parse of the chosen schema. Each validator adds the rule a JSON Schema in the subset cannot say: a finite number and at most 2
// decimals. The response is the stored-entry projection, .strict(): never entered_by, never a typed value.
import { z } from 'zod';
// OUTPUT fold S-3: this module reads the contract JSON only, never src/lib/parcels/lot-size-entry.ts (which imports the whole logic-variable
// seed), so a client that imports these types (the admin revert hook today, the user form at the flip) does not bundle the seed.
import CONTRACT from '../../../../../scripts/surfaces/_schema/lot-size-entry-contract.json';

type Schema = Parameters<typeof z.fromJSONSchema>[0];
const atMostTwoDecimals = (n: number): boolean => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export interface LotSizeDimsRequest { parcel_id: string; width_value: number; depth_value: number; dims_unit: 'ft' | 'm' }
export interface LotSizeAreaRequest { parcel_id: string; lot_area_value: number; lot_area_unit: 'sqft' | 'm2' }
export type LotSizeEntryRequest = LotSizeDimsRequest | LotSizeAreaRequest;

const dimsBase = z.fromJSONSchema(CONTRACT.route_request as unknown as Schema) as unknown as z.ZodType<LotSizeDimsRequest>;
const areaBase = z.fromJSONSchema(CONTRACT.route_area_request as unknown as Schema) as unknown as z.ZodType<LotSizeAreaRequest>;
export const LotSizeDimsRequestSchema = dimsBase
  .refine((b) => atMostTwoDecimals(b.width_value), { message: 'width_value must be a finite number with at most 2 decimals', path: ['width_value'] })
  .refine((b) => atMostTwoDecimals(b.depth_value), { message: 'depth_value must be a finite number with at most 2 decimals', path: ['depth_value'] });
export const LotSizeAreaRequestSchema = areaBase.refine((b) => atMostTwoDecimals(b.lot_area_value), {
  message: 'lot_area_value must be a finite number with at most 2 decimals',
  path: ['lot_area_value'],
});

export type ParsedLotSizeBody =
  | { ok: true; body: LotSizeEntryRequest }
  | { ok: false; zod: z.ZodError | null; message: string };

export const BODY_KEYS_MESSAGE = 'Send the width and depth (width_value, depth_value, dims_unit) or the area (lot_area_value, lot_area_unit), not both and not neither';

/** Keys first, then ONE strict parse. A body that is not a plain object, has both key sets or neither is refused with one message; nothing else is read. */
export function parseLotSizeBody(raw: unknown): ParsedLotSizeBody {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, zod: null, message: BODY_KEYS_MESSAGE };
  const widthPath = Object.hasOwn(raw, 'width_value');
  const areaPath = Object.hasOwn(raw, 'lot_area_value');
  if (widthPath === areaPath) return { ok: false, zod: null, message: BODY_KEYS_MESSAGE };
  const parsed = widthPath ? LotSizeDimsRequestSchema.safeParse(raw) : LotSizeAreaRequestSchema.safeParse(raw);
  return parsed.success ? { ok: true, body: parsed.data } : { ok: false, zod: parsed.error, message: 'Invalid request body' };
}

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
