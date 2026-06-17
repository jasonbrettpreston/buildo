// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//   + docs/specs/00_engineering_standards.md §10.3 (typed request/response contract)

import { z } from 'zod';

/** Request query params for GET /api/admin/pipeline/step-output. */
export const StepOutputQuerySchema = z.object({
  slug: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  filterField: z.string().min(1).optional(),
  filterValue: z.string().optional(),
});
export type StepOutputQuery = z.infer<typeof StepOutputQuerySchema>;

/** Response payload — Zod-parsed at the route boundary (Spec 33 §13). */
export const StepOutputSchema = z.object({
  columns: z.array(z.string()),
  filterableColumns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.coerce.number().int(),
  approxTotal: z.boolean(),
});
export type StepOutputResponse = z.infer<typeof StepOutputSchema>;
