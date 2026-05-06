// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §7
//
// Published response contract for GET /api/admin/app-health. Per Spec 33
// §7 the route handler types live next to the route, NOT in a hand-
// written interface — types are derived from the Zod schema in
// src/lib/admin/healthSchema.ts via z.infer (Spec 33 §13). This file
// just re-exports them for the route's import convenience.
//
// Future Cross-Domain Scenario B consumer (e.g., a separate admin web
// repo) would import these types via the published `_contracts.json`
// boundary — same precedent as src/app/api/leads/detail/[id]/types.ts.

export type {
  AppHealthResponse,
  AppHealthTiles,
  CrashRate24hPayload,
  AuthConversion7dPayload,
  LeadSaveFunnel7dPayload,
  PaywallConversion7dPayload,
  CacheInvalidation24hPayload,
  TileResult,
} from '@/lib/admin/healthSchema';
