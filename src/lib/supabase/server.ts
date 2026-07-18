// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.1, §3.2
//            docs/specs/00-architecture/113_supabase_infrastructure.md §3 (key contract)
//
// Server-side Supabase client factory — Route Handlers, Server Components,
// Server Actions. `.cursor/phase1_plan.md` Item 1 [panel-fold: GT+Security
// BLOCKING]: `cookieOptions` is passed EXPLICITLY here (httpOnly/secure/
// sameSite) — `@supabase/ssr`'s own DEFAULT_COOKIE_OPTIONS ships
// `httpOnly: false` (confirmed via Context7 against the installed
// @supabase/ssr@0.12.3 source, src/utils/constants.ts), which would produce
// a JS-readable session cookie if left unset. Every `createServerClient(...)`
// call site in this plan (this file, `middleware.ts`, `actions.ts`) repeats
// the explicit cookieOptions — it is NOT a one-time global default.
//
// A NEW client MUST be created per request (never module-cached) — the
// cookie jar is request-scoped.
//
// Next.js 15+: `cookies()` from `next/headers` is async (confirmed via
// installed `next@15.1`'s type declarations) — this factory is async and
// callers MUST `await createClient()`.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // [panel-fold: GT+Security BLOCKING] — mandatory at every
      // createServerClient call site. See file header + Item 1.
      cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `cookies().set()` throws when called from a Server Component
            // render (cookies are read-only there — only Route Handlers and
            // Server Actions may write them). This is expected and benign:
            // `src/lib/supabase/middleware.ts`'s `updateSession` runs on
            // every matched request and refreshes the session cookie from
            // the one place that CAN always write it. A Server Component
            // that only reads a stale-but-still-valid session between
            // middleware passes is not a correctness bug.
          }
        },
      },
    },
  );
}
