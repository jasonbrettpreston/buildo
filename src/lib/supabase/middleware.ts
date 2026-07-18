// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.2, §3.5
//            docs/specs/00-architecture/13_authentication.md §4a (JWKS fetch failure)
//
// `@supabase/ssr` canonical middleware helper — refreshes the Supabase
// session cookie transparently on each matched request. `.cursor/
// phase1_plan.md` Item 1 design note ("why middleware calls getClaims() at
// all, and why it fails open"):
//
//   1. `getClaims()`, not `getUser()` — Spec 13 §3.2's cost rule: local JWKS
//      verification (no network round-trip once cached) vs a live network
//      call on every invocation. Middleware runs on every matched request —
//      paying getUser()'s round-trip there is the double-cost Spec 13 §3.2
//      exists to avoid. This deliberately diverges from `@supabase/ssr`'s
//      own Next.js template default (getUser()) — Spec 13 §3.2 supersedes it
//      for this codebase.
//   2. Called at all, even though its RESULT is never read for routing —
//      `@supabase/ssr`'s token-refresh is a SIDE EFFECT of calling
//      getClaims()/getUser(): stale access token -> SDK uses the refresh
//      token -> mints a new session -> invokes `setAll` with new cookies,
//      transparently. Skipping this call means sessions silently go stale
//      until hard-expiry with no code change to blame.
//   3. Fails open — see the CONTRACT comment on the try/catch below.
//
// Routing decisions (public/authenticated/admin) are NEVER derived from this
// call's result — that stays `classifyRoute`'s job in `src/middleware.ts`,
// unchanged from the Firebase era (Spec 13 §3.5: middleware does not perform
// cryptographic verification; the verification here is refresh-plumbing).
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { logWarn } from '@/lib/logger';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // [panel-fold: GT+Security BLOCKING] — same explicit cookieOptions as
      // server.ts/actions.ts. See server.ts's header for the rationale.
      cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate the INCOMING request cookies so downstream Server
          // Components/Route Handlers in THIS pass see the refreshed
          // session (mirrors the existing DEV_MODE pattern at
          // src/middleware.ts:40-58 — the mutate-request-then-rebuild-
          // response ordering is load-bearing there too).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          // AND set on the outgoing response so the browser persists the
          // refreshed cookie for subsequent navigations.
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // CONTRACT: this call exists ONLY to trigger @supabase/ssr's refresh side
  // effect. Its result is never read for authorization. On failure (JWKS
  // fetch error, network partition, Supabase Auth outage) this middleware
  // pass MUST fail OPEN — log and continue — never block or redirect. Route
  // handlers are the real authorization boundary (`getClaimsUid`/
  // `getVerifiedUid`, src/lib/auth/get-user.ts) and re-verify independently.
  // See Spec 13 §3.5 and phase1_plan.md Item 1 design note.
  try {
    await supabase.auth.getClaims();
  } catch (err) {
    logWarn('[supabase/middleware]', 'getClaims refresh check failed, failing open', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return response;
}
