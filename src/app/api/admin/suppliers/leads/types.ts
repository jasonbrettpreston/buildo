// 🔗 SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.3
//
// Request/response contract for GET /api/admin/suppliers/leads (Spec 87 v1,
// admin-guarded supplier lead feed). v1 is an ADMIN-facing supplier view;
// external supplier-account auth is v2.

import { z } from 'zod';

export const SupplierLeadsQuerySchema = z.object({
  // The marketplace account whose trade footprint we serve. v1 requires it
  // explicitly (admin-guarded); v2 resolves it from a supplier principal.
  supplier_id: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type SupplierLeadsQuery = z.infer<typeof SupplierLeadsQuerySchema>;
