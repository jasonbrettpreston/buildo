// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// POST /api/leads/view — record a view/save/unsave action against a lead
// (permit or builder) and return the updated competition_count. Thin route
// handler — every behavior delegates to a Phase 1 lib helper or Phase 2-i
// foundation helper.
//
// Status code matrix (spec 70 §API Endpoints):
//   200 — success
//   400 — malformed JSON (INVALID_JSON) or Zod validation failure (VALIDATION_FAILED)
//   401 — no session, no profile, or auth helper failure
//   403 — body trade_slug doesn't match user's profile trade
//   429 — rate limit exceeded (60 req/min per user)
//   500 — unexpected error (logged via logError + returned as generic envelope)

import type { NextRequest } from 'next/server';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db/client';
import { err, ok } from '@/features/leads/api/envelope';
import {
  badRequestZod,
  forbiddenTradeMismatch,
  internalError,
  rateLimited,
  unauthorized,
} from '@/features/leads/api/error-mapping';
import { logRequestComplete } from '@/features/leads/api/request-logging';
import { leadViewBodySchema } from '@/features/leads/api/schemas';
import { recordLeadView } from '@/features/leads/lib/record-lead-view';

const RATE_LIMIT_PER_MIN = 60;
const RATE_LIMIT_WINDOW_SEC = 60;

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    // 1. Auth — runs first so unauthenticated requests get 401 even when
    //    the body is malformed.
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    // 2. Content-Type validation — reject non-JSON bodies BEFORE parsing.
    //    Without this check, a malicious client sending
    //    `text/plain` or `multipart/form-data` could trip `request.json()`
    //    into throwing a different error class than the INVALID_JSON path
    //    below expects. Caught by Phase 0-3 comprehensive review
    //    (DeepSeek Phase 2 CRIT).
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return err(
        'INVALID_CONTENT_TYPE',
        'Content-Type must be application/json',
        415,
      );
    }

    // 3. Parse JSON body. Malformed JSON gets a distinct INVALID_JSON code
    //    so the client can differentiate "your bytes were unparseable" from
    //    "your shape was wrong" — both are 400 per spec 70 but the code
    //    distinguishes them.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    const parsed = leadViewBodySchema.safeParse(raw);
    if (!parsed.success) return badRequestZod(parsed.error);
    const body = parsed.data;

    // 3. Trade slug authorization — server compares the body trade to the
    //    user's profile trade. Mismatch returns 403 per spec 70.
    if (body.trade_slug !== ctx.trade_slug) {
      return forbiddenTradeMismatch(body.trade_slug, ctx.trade_slug);
    }

    // 4. Rate limit — 60 req/min per user, scoped via the `leads-view:`
    //    key prefix so this bucket is independent from `leads-feed:`.
    const rateLimit = await withRateLimit(request, {
      key: `leads-view:${ctx.uid}`,
      limit: RATE_LIMIT_PER_MIN,
      windowSec: RATE_LIMIT_WINDOW_SEC,
    });
    if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

    // 5. Call the Phase 1 lib helper. Discriminated-union spread is type-safe
    //    because `body` already matches `RecordLeadViewInput` shape modulo
    //    the user_id field which we inject from the auth context (NOT the
    //    body — that would let a client spoof another user).
    const result = await recordLeadView({ ...body, user_id: ctx.uid }, pool);
    if (!result.ok) {
      // Lib helper logged the underlying cause via logError already; we just
      // surface a 500 envelope without re-logging.
      return internalError(undefined, {
        route: 'POST /api/leads/view',
        stage: 'recordLeadView',
      });
    }

    // 6. Structured logging — spec 70 §API Endpoints "Observability".
    logRequestComplete(
      '[api/leads/view]',
      {
        user_id: ctx.uid,
        trade_slug: body.trade_slug,
        action: body.action,
        lead_type: body.lead_type,
        competition_count: result.competition_count,
      },
      start,
    );

    // 7. Return the envelope.
    return ok({ competition_count: result.competition_count });
  } catch (cause) {
    // Defensive — none of the above should throw because every helper is
    // documented as never-throws, but if a regression slips through, this
    // catches it and surfaces a 500 envelope with the cause logged.
    return internalError(cause, { route: 'POST /api/leads/view' });
  }
}
