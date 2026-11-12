// SPEC LINK: docs/specs/00-architecture/13_authentication.md §2, §3.3
//
// Same-origin path guard for the ?redirect= bounce target, the one guard for
// every caller (src/app/login/page.tsx, src/app/auth/callback/route.ts).
// Rejects absolute URLs, protocol-relative (`//evil`), AND backslash variants
// (`/\evil` — some browsers normalize \ to /, a classic open-redirect filter
// bypass flagged by the commit security review).
//
// WF3 (MF-46 plan security seat F1, HIGH): it also rejects any control
// character. `?redirect=/%09/evil.com` arrives as `/<TAB>/evil.com`; the URL
// parser strips tab/CR/LF, so the target became `//evil.com` and the router
// left the site. The same checks run on the value decoded once more (a
// double-encoded `%2509` or `%252F`), and the final target must resolve to
// the same origin. A valid internal path is returned unchanged. A pathname
// with an encoded backslash (`%5C`), an encoded `//` or a malformed percent
// sequence also falls back, losing only the deep link (fails safe).
//
// MF-46 (Spec 126 §11b.3 `web_login`: on the MaxBLD host the post-login target is the MaxBLD search page, never `/dashboard`;
// DECISIONS-v2 D-8): the MaxBLD branch. With `{ maxbld: true }` a target that passes every check above is kept only when its path is a
// row of the maxbld.ca host table (src/lib/auth/host-policy.ts); anything else falls back to the MaxBLD search page. The Buildo
// behaviour (no option) is unchanged.
import { MAXBLD_POST_LOGIN, matchMaxbldRoute } from './host-policy';

const FALLBACK = '/dashboard';
const PROBE_ORIGIN = 'https://same-origin.invalid';

/** One leading `/`, then not `/` or `\`; no backslash and no control character anywhere. */
function isLocalPath(s: string): boolean {
  if (s[0] !== '/' || s[1] === '/' || s.includes('\\')) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return false;
  }
  return true;
}

function decodeOnce(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null; // malformed percent-encoding: not a path we produced
  }
}

export function safeRedirectPath(raw: string | null | undefined, opts: { maxbld?: boolean } = {}): string {
  const fallback = opts.maxbld ? MAXBLD_POST_LOGIN : FALLBACK;
  if (!raw || !isLocalPath(raw)) return fallback;
  const decoded = decodeOnce(raw);
  if (decoded === null || !isLocalPath(decoded)) return fallback;
  // Backstop: unreachable while isLocalPath holds; kept so a future edit to
  // the string checks cannot reopen an off-site target.
  if (new URL(raw, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
  if (opts.maxbld && matchMaxbldRoute(new URL(raw, PROBE_ORIGIN).pathname) === null) return fallback;
  return raw;
}
