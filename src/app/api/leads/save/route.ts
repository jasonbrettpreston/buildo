// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1 + §4.1
//             docs/specs/03-mobile/91_mobile_lead_feed.md §3.2 (Save Mutation)
//
// POST /api/leads/save — save / unsave a lead (permit or builder) for the
// current user. Adopts the lead_id-shaped body pattern that the mobile app
// already uses everywhere (`{lead_id, lead_type, saved}`), translating
// internally to the action-shaped `recordLeadView` contract.
//
// Why this endpoint exists separately from /api/leads/view:
//   - /api/leads/view requires the caller to know the user's `trade_slug`
//     and the canonical `permit_num` + `revision_num` split. The mobile
//     client (and the admin Flight Center) carries lead_ids verbatim from
//     /api/leads/feed responses, never the deconstructed parts.
//   - This endpoint accepts the lead_id as a single token, parses it
//     server-side, pulls trade_slug from `getCurrentUserContext` (the
//     authoritative source — never trust a body trade_slug from a save
//     call where the only signal is "user wants to save THIS lead"), and
//     calls the same `recordLeadView` lib that /view uses.
//
// Body contract:
//   { lead_id: string, lead_type: 'permit'|'builder', saved: boolean }
//
// Lead_id format (Spec 91 §4.3.1 canonical):
//   permits  : `${permit_num}--${revision_num}`  (e.g., `20-101234--00`)
//   builders : `builder-${entity_id}`             (e.g., `builder-12345`)
//
// Status codes (mirror /api/leads/view contract):
//   200 success · 400 INVALID_JSON|VALIDATION_FAILED|INVALID_LEAD_ID
//   401 UNAUTHORIZED · 415 INVALID_CONTENT_TYPE · 429 RATE_LIMITED · 500

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import {
  badRequestInvalidId,
  badRequestZod,
  internalError,
  rateLimited,
  unauthorized,
} from '@/features/leads/api/error-mapping';
import { logRequestComplete } from '@/features/leads/api/request-logging';
import {
  recordLeadView,
  type RecordLeadViewInput,
} from '@/features/leads/lib/record-lead-view';
import { parseLeadId } from '@/lib/leads/parse-lead-id';

const RATE_LIMIT_PER_MIN = 60;
const RATE_LIMIT_WINDOW_SEC = 60;

const saveBodySchema = z
  .object({
    // `.trim()` runs in the schema so `'  permit-num--01  '` flows
    // cleanly through the parser; without it the surrounding spaces
    // would pollute permit_num/revision_num and cause silent DB-lookup
    // failures downstream.
    lead_id: z.string().trim().min(1).max(100),
    lead_type: z.enum(['permit', 'builder']),
    saved: z.boolean(),
  })
  .strict();

interface ParsedPermitId {
  kind: 'permit';
  permit_num: string;
  revision_num: string;
}

interface ParsedBuilderId {
  kind: 'builder';
  entity_id: number;
}

/**
 * Parse the canonical lead_id into the discriminated permit/builder form
 * that `recordLeadView` expects. Returns null on any format violation;
 * the caller maps null to 400 INVALID_LEAD_ID.
 *
 * Permit branch: delegates to the canonical `parseLeadId` (single source
 * of truth — used by /api/leads/detail and /api/leads/flight-board/detail
 * for the URL-path lead_id parameter). Adds a `--`-uniqueness guard so
 * malformed-but-parseable inputs like `permit_num--01--extra-junk` (which
 * the canonical parser would silently slice into `permit_num--01` /
 * `extra-junk`) get rejected loudly with INVALID_LEAD_ID.
 *
 * Builder branch: not handled by parseLeadId (URL-path encoding doesn't
 * include builders today; builders only flow through the save endpoint).
 * Inline parsing for that branch.
 */
function parseSaveLeadId(
  leadId: string,
  leadType: 'permit' | 'builder',
): ParsedPermitId | ParsedBuilderId | null {
  if (leadType === 'permit') {
    // Reject ambiguous inputs: more than one `--` means either the client
    // sent garbage or the permit_num itself contains `--` (which the
    // canonical parser preserves verbatim — fine for URL parsing where
    // the UI controls input, but unsafe at the open save endpoint where
    // any client can post).
    const first = leadId.indexOf('--');
    if (first === -1 || first !== leadId.lastIndexOf('--')) return null;
    const parsed = parseLeadId(leadId);
    if (!parsed || parsed.kind !== 'permit') return null;
    return {
      kind: 'permit',
      permit_num: parsed.permit_num,
      revision_num: parsed.revision_num,
    };
  }
  // Builder branch — inline since canonical parseLeadId doesn't cover it.
  if (!leadId.startsWith('builder-')) return null;
  const tail = leadId.slice('builder-'.length);
  if (tail.length === 0) return null;
  // Strict integer parse — `Number('12abc')` returns NaN here because
  // we use `Number(tail)` not parseInt(). Positive-int double-check for
  // fast 400; the `lead_views` FK constraint enforces it again at the DB.
  const entity_id = Number(tail);
  if (!Number.isInteger(entity_id) || entity_id <= 0) return null;
  return { kind: 'builder', entity_id };
}

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    // 1. Auth — first, so unauthenticated requests get 401 even on bad bodies.
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    // 2. Content-Type validation — same defensive guard as /api/leads/view.
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return err(
        'INVALID_CONTENT_TYPE',
        'Content-Type must be application/json',
        415,
      );
    }

    // 3. Parse JSON body.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    const parsed = saveBodySchema.safeParse(raw);
    if (!parsed.success) return badRequestZod(parsed.error);
    const body = parsed.data;

    // 4. Rate limit. Independent bucket from `leads-view:` so a noisy save
    //    flow can't starve a hot view-counter loop and vice versa.
    const rateLimit = await withRateLimit(request, {
      key: `leads-save:${ctx.uid}`,
      limit: RATE_LIMIT_PER_MIN,
      windowSec: RATE_LIMIT_WINDOW_SEC,
    });
    if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

    // 5. Parse lead_id into the discriminated shape recordLeadView wants.
    const parsedId = parseSaveLeadId(body.lead_id, body.lead_type);
    if (!parsedId) return badRequestInvalidId();

    // 6. Build the recordLeadView input from the parsed id + ctx.
    //    Action is derived from `saved` — the body never expresses 'view'
    //    via this endpoint (use /api/leads/view for views).
    const action: 'save' | 'unsave' = body.saved ? 'save' : 'unsave';
    const input: RecordLeadViewInput =
      parsedId.kind === 'permit'
        ? {
            user_id: ctx.uid,
            trade_slug: ctx.trade_slug,
            action,
            lead_type: 'permit',
            permit_num: parsedId.permit_num,
            revision_num: parsedId.revision_num,
          }
        : {
            user_id: ctx.uid,
            trade_slug: ctx.trade_slug,
            action,
            lead_type: 'builder',
            entity_id: parsedId.entity_id,
          };

    const result = await recordLeadView(input, pool);
    if (!result.ok) {
      return internalError(undefined, {
        route: 'POST /api/leads/save',
        stage: 'recordLeadView',
      });
    }

    // 7. Structured log — mirrors /api/leads/view fields plus saved flag.
    logRequestComplete(
      '[api/leads/save]',
      {
        user_id: ctx.uid,
        trade_slug: ctx.trade_slug,
        action,
        lead_type: body.lead_type,
        competition_count: result.competition_count,
      },
      start,
    );

    return ok({ competition_count: result.competition_count });
  } catch (cause) {
    return internalError(cause, { route: 'POST /api/leads/save' });
  }
});
