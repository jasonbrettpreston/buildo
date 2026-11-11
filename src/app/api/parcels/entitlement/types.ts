// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-11; FE-05)
//
// Response contract for the parcel_tool entitlement read (MF-45). Every value is computed on the server
// (src/lib/entitlements/index.ts readParcelToolUsage); a client binds to them and does no maths. `.strict()`: an
// unlisted key fails the boundary parse. All null = no parcel_tool plan (a legal state, never an error).

import { z } from 'zod';
import { ENTITLEMENT_STATUSES } from '@/lib/entitlements';

export const ParcelToolEntitlementResponseSchema = z
  .object({
    status: z.enum(ENTITLEMENT_STATUSES).nullable(),
    reportsUsed: z.number().int().nonnegative().nullable(),
    reportsLimit: z.number().int().positive().nullable(),
    reportsLeft: z.number().int().nonnegative().nullable(),
    reportsLimitReached: z.boolean().nullable(),
    resetsOn: z.string().datetime().nullable(), // the billing-month end, ISO-8601; the page formats it
  })
  .strict();
export type ParcelToolEntitlementResponse = z.infer<typeof ParcelToolEntitlementResponseSchema>;
