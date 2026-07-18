// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3
//            docs/specs/00-architecture/113_supabase_infrastructure.md §3 (key contract)
//
// Browser Supabase client — Phase 1 Item 1 [panel-fold: GT+Security BLOCKING].
//
// SCOPE NARROWED BY DESIGN, not an oversight: this client is consumed ONLY by
// `LoginForm.tsx`'s Google-OAuth button (`signInWithOAuth`), which navigates
// the browser away to Google and writes no session cookie itself — the
// session is established server-side when the OAuth callback route exchanges
// the code via the SERVER client (`server.ts`). Email/password sign-in and
// sign-up NEVER use this client — they post to the Server Actions in
// `actions.ts`, whose explicit `cookieOptions: { httpOnly: true, ... }` on
// the SERVER client are what actually write the session cookie.
//
// Why: `@supabase/ssr`'s browser-writes-cookies-directly pattern relies on
// `document.cookie`, and a JS-set cookie can never be `httpOnly` by
// definition (httpOnly is a `Set-Cookie` response-header property).
// Using the browser client for credentialed sign-in would produce a
// JS-readable refresh-token cookie — a long-lived account-takeover primitive
// on any XSS. See `.cursor/phase1_plan.md` Item 1 for the full rationale.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Singleton per module — mirrors the retired `auth/config.ts`'s `let app`
// caching pattern. A browser client is safe to share across the page's
// lifetime (unlike the server client, which must be constructed fresh per
// request — see server.ts).
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}
