// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3, §4
//            .cursor/phase1_plan.md Item 1
//
// OAuth code-exchange callback. `LoginForm.tsx`'s Google button kicks off
// `signInWithOAuth` via the BROWSER client (`src/lib/supabase/browser.ts`),
// which navigates to Google and writes no session cookie itself — Google
// redirects back here with a `?code=` param. This route exchanges it for a
// session using the SERVER client (`src/lib/supabase/server.ts`) — the same
// httpOnly-`cookieOptions` client `updateSession`/Server Actions use — so
// the resulting `Set-Cookie` is genuinely httpOnly (Item 1's whole point:
// the browser client never produces the session cookie for any flow).
//
// Added beyond `.cursor/phase1_plan.md`'s literal file list because the
// Google-OAuth redirect Item 1 mandates does not complete without a code-
// exchange endpoint to land on — flagged in the P1 close-out report as a
// necessary companion to the `browser.ts`/`LoginForm.tsx` OAuth wiring, not
// a scope-creep addition. Required `route-guard.ts` PUBLIC_PATHS entry for
// `/auth/callback` — see that file's comment for why.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const redirectParam = searchParams.get('redirect');
  // Only allow a same-origin relative redirect target — never forward an
  // absolute/external URL from a query param (open-redirect guard).
  const redirectTo = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
      logError('[auth/callback]', error, { stage: 'exchangeCodeForSession' });
    } catch (err) {
      logError('[auth/callback]', err, { stage: 'exchangeCodeForSession' });
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_callback_failed`);
}
