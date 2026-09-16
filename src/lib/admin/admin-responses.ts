// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
//             docs/specs/00_engineering_standards.md §4.4 (envelope) + §6 (logging)
//
// The two refusal envelopes every `/api/admin/**` handler returns, in ONE
// place. Before this module they were copy-pasted into a dozen route files by
// WF3 SEC-1 — twelve chances for one of them to drift into a different code,
// a different status, or (the actual defect this module fixes) to stay silent.
//
// SAFE TO CENTRALISE: the source-scan locks in `src/tests/api.infra.test.ts`
// pin the `verifyAdminAuth(...)` call as the handler's FIRST statement and the
// `authMethod !== 'session'` comparison AT THE CALL SITE — never the shape of
// the response returned afterwards. Moving the envelope builders here changes
// nothing either lock observes.

import { NextResponse } from 'next/server';
import type { AdminContext } from '@/lib/auth/verify-admin';
import { logWarn } from '@/lib/logger';

const TAG = '[admin/session-gate]';

/**
 * Spec 33 §8 — the sanitized 401 for a missing or non-admin credential.
 * Byte-identical to the shape `app-health/route.ts` established.
 *
 * Deliberately NOT logged here: `verifyAdminAuth` already emits the failure
 * REASON (`logWarn` on a non-admin authenticated user, `logError` on a
 * session-verify or profiles-lookup fault). A second line at the call site
 * would double-count every unauthenticated probe without adding a fact.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

/**
 * Spec 33 §8.1 — the 403 for a caller who IS an admin but arrived on a shared
 * credential (`admin_key` → `'admin-key'`, `dev_bypass` → `'dev-user'`).
 * `admin_audit_log.admin_uid` is UUID NOT NULL, so such a mutation could only
 * be written unaudited or raise 22P02 inside the transaction. It is refused.
 *
 * UNLIKE the 401, this one LOGS. A 401 is an unauthenticated stranger; a 403
 * here is a REAL operator or a CI job being turned away mid-task, and the only
 * symptom they see is a button that does nothing. Without this line the
 * refusal was invisible at nine call sites — the operator sees a failure the
 * server never recorded. Matches the idiom
 * `src/app/api/admin/leads/watchlist/route.ts` already used for its own gate.
 *
 * @param ctx   the verified admin context (its `authMethod` is the fact worth recording)
 * @param route the route path, so the log says WHICH mutation was refused
 */
export function sessionRequired(ctx: AdminContext, route: string): NextResponse {
  logWarn(TAG, 'non-session mutation rejected', {
    authMethod: ctx.authMethod,
    route,
  });
  return NextResponse.json(
    {
      data: null,
      error: {
        code: 'SESSION_REQUIRED',
        message: 'This mutation requires a per-admin session (shared credentials cannot be audited)',
      },
      meta: null,
    },
    { status: 403 },
  );
}
