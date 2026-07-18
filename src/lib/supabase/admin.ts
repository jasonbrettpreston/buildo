// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.7, §4a (service-role key exposure)
//            docs/specs/00-architecture/113_supabase_infrastructure.md §3 (key contract)
//
// Narrowly-scoped service-role client factory — `.cursor/phase1_plan.md`
// Item 6 / Security fold. `SUPABASE_SECRET_KEY` is root-equivalent
// (bypasses RLS, full read/write on every table, Spec 13 §4a "Service-role
// key exposure"). This factory exists ONLY for the `.auth.admin.*` Admin API
// (createUser / deleteUser / generateLink / signOut / listUsers) — the
// Admin-SDK-successor call sites this phase swaps (P1-G5): `user-profile/
// delete/route.ts`, `admin/users/[uid]/route.ts`, `admin/users/route.ts`.
//
// NEVER call `.from(...)` on the client this factory returns. Every table
// read/write in this codebase goes through `src/lib/db/client.ts`'s raw `pg`
// pool (Decision D1) — that is what `verify-admin.ts`'s `profiles.is_admin`
// check and RLS policies are actually built against. A `.from(...)` call on
// this client would silently bypass RLS with no application-layer check in
// front of it. If a future call site needs `.from(...)`, it needs its own
// justification and review, not a reuse of this factory.
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        'createAdminClient: SUPABASE_SECRET_KEY is not set — required for .auth.admin.* operations',
      );
    }
    adminClient = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
      auth: {
        // This client never represents an end-user session — it authenticates
        // as service_role on every call. No session to persist or refresh.
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
