// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.1 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//
// Admin User Management — directory + account creation (P24-24B).
//   GET  — paginated directory. Search email/phone/name/company; filter by
//          preset / trade_slug (primary OR override) / subscription_status.
//   POST — supplier/enterprise provisioning: Supabase admin.createUser +
//          password reset link + profile insert. Rolls back the Supabase
//          user on DB failure; idempotent re-create on an existing email.
//
// Auth: verifyAdminAuth FIRST line. POST requires an attributable session admin.

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { withTransaction } from '@/lib/db/client';
import { LEAD_GEN_ENTITLEMENT_JOIN, upsertEntitlementStatus } from '@/lib/entitlements';
import {
  USER_DIRECTORY_PAGE_SIZE,
  UserDirectoryQuerySchema,
  CreateUserBodySchema,
} from '@/lib/admin/user-management-schemas';

const TAG = '[api/admin/users]';

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

// Entitlements swap (`.cursor/phase1_plan.md` Item 4 R5): the directory's
// subscription_status column/filter derives from the lead_gen `entitlements`
// row (LEFT JOIN — a zero-entitlement user shows null, as the legacy nullable
// column did). All user_profiles columns are `up.`-qualified because
// entitlements shares `user_id`/`created_at` names.
const DIRECTORY_COLUMNS = `
  up.user_id, up.email, up.phone_number, up.full_name, up.company_name,
  up.trade_slug, up.trade_slugs_override, up.account_preset,
  e.status AS subscription_status, up.onboarding_complete, up.account_deleted_at, up.created_at
`;

// ---------------------------------------------------------------------------
// GET — directory
// ---------------------------------------------------------------------------
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const parsed = UserDirectoryQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return badRequestZod(parsed.error);
  const { q, preset, trade_slug, subscription_status, stripe_cancel_failed, offset } = parsed.data;

  try {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (i: number) => string, value: unknown) => {
      params.push(value);
      where.push(clause(params.length));
    };

    if (q) {
      add(
        (i) =>
          `(up.email ILIKE $${i} OR up.phone_number ILIKE $${i} OR up.full_name ILIKE $${i} OR up.company_name ILIKE $${i})`,
        `%${q}%`,
      );
    }
    if (preset) add((i) => `up.account_preset = $${i}`, preset);
    if (trade_slug) add((i) => `(up.trade_slug = $${i} OR $${i} = ANY(up.trade_slugs_override))`, trade_slug);
    // R5: the status filter matches the lead_gen entitlement status (LEFT
    // JOIN — a user with no entitlement row can never match a status value,
    // same as the legacy NULL column never matched one).
    if (subscription_status) add((i) => `e.status = $${i}`, subscription_status);
    // P26-26D sweep surface (Spec 21 §6): outstanding delete-time cancel debt.
    // Boolean-valued (no bind param) — IS [NOT] NULL on the marker column.
    if (stripe_cancel_failed !== undefined) {
      where.push(`up.stripe_cancel_failed_at IS ${stripe_cancel_failed ? 'NOT NULL' : 'NULL'}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    // The join is applied to BOTH queries so the e.status filter (and the
    // count it paginates against) see identical row sets.
    const fromSql = `FROM user_profiles up ${LEAD_GEN_ENTITLEMENT_JOIN}`;

    const countRes = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`,
      params,
    );

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rowsRes = await pool.query<Record<string, unknown>>(
      `SELECT ${DIRECTORY_COLUMNS} ${fromSql} ${whereSql}
       ORDER BY up.created_at DESC NULLS LAST, up.user_id
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, USER_DIRECTORY_PAGE_SIZE, offset],
    );

    return ok(rowsRes.rows, {
      total: countRes.rows[0]?.total ?? 0,
      limit: USER_DIRECTORY_PAGE_SIZE,
      offset,
    });
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/users' });
  }
});

// ---------------------------------------------------------------------------
// POST — supplier / enterprise creation
// ---------------------------------------------------------------------------
function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key create rejected — account creation requires an attributable session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Account creation requires a session admin (admin_key writes are not permitted)', 403);
  }
  return null;
}

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = CreateUserBodySchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const body = parsed.data;

  const [primaryTrade, ...restTrades] = body.trade_slugs;
  const override = restTrades.length > 0 ? restTrades : null;

  let supabaseUid: string | null = null;
  let accountCreated = false; // did WE create it this call (rollback candidate)?
  let resetLink: string | null = null;

  try {
    // 1. Supabase auth user. Idempotent: an existing email adopts its uid
    //    instead of failing (idempotent re-create). No SUPABASE_SECRET_KEY
    //    configured in dev → synthetic uid so the DB + audit path is still
    //    testable locally (never reached in prod, where the secret key is
    //    always configured — Spec 113 §3).
    if (process.env.SUPABASE_SECRET_KEY) {
      const supabaseAdmin = createAdminClient();
      try {
        const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: body.email,
          email_confirm: true,
        });
        if (createErr) throw createErr;
        supabaseUid = data.user!.id;
        accountCreated = true;
      } catch (createErr) {
        const code = (createErr as { code?: string }).code;
        if (code === 'email_exists') {
          // P1-G5 Admin-SDK-successor note: GoTrueAdminApi (confirmed via
          // source read, installed @supabase/supabase-js version) has no
          // dedicated by-email lookup — listUsers() is the only primitive,
          // paginated and unfiltered server-side. Bounded scan; Buildo is
          // pre-launch (zero real users at time of writing) so this is a
          // low-risk stopgap, not a scale-tested path.
          const existing = await findUserByEmail(supabaseAdmin, body.email);
          if (!existing) throw createErr; // truly unexpected — surface it
          supabaseUid = existing.id; // adopt — do NOT mark accountCreated (no rollback)
        } else {
          throw createErr;
        }
      }
      try {
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: body.email,
        });
        if (linkErr) throw linkErr;
        resetLink = linkData?.properties?.action_link ?? null;
      } catch (linkErr) {
        // Non-fatal: the account exists; the reset link can be re-issued.
        logError(TAG, linkErr, { stage: 'reset_link' });
      }
    } else {
      supabaseUid = `dev_${body.account_preset}_${createHash('sha256').update(body.email).digest('hex').slice(0, 12)}`;
    }

    // 2. Profile insert (idempotent on user_id) + the lead_gen entitlement row
    //    (`.cursor/phase1_plan.md` Item 4 R5): enterprise/manufacturer +
    //    supplier are admin-managed — status now lives on `entitlements`
    //    ('admin_managed', product 'lead_gen' in the single-product window).
    //    Both writes ride ONE transaction (R5: "inside the existing — or
    //    newly-added — transaction") so a provisioned profile can never
    //    commit without its entitlement. The response row keeps the
    //    subscription_status field name, echoing the entitlement upsert
    //    (null on the dev-fallback synthetic uid, which is not
    //    entitlements-keyable — dev-only path).
    let dbRow: Record<string, unknown>;
    try {
      dbRow = await withTransaction(async (client) => {
        const insertRes = await client.query<Record<string, unknown>>(
          `INSERT INTO user_profiles
             (user_id, email, company_name, account_preset, trade_slug, trade_slugs_override,
              radius_cap_km, onboarding_complete)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false)
           ON CONFLICT (user_id) DO UPDATE
             SET email = EXCLUDED.email,
                 company_name = EXCLUDED.company_name,
                 account_preset = EXCLUDED.account_preset,
                 trade_slug = EXCLUDED.trade_slug,
                 trade_slugs_override = EXCLUDED.trade_slugs_override,
                 radius_cap_km = EXCLUDED.radius_cap_km,
                 updated_at = NOW()
           RETURNING user_id, email, account_preset, trade_slug, trade_slugs_override`,
          [supabaseUid, body.email, body.company_name ?? null, body.account_preset, primaryTrade, override, body.radius_cap_km ?? null],
        );
        const entitlementRows = await upsertEntitlementStatus(
          client,
          supabaseUid!,
          'lead_gen',
          'admin_managed',
        );
        return {
          ...insertRes.rows[0]!,
          subscription_status: entitlementRows > 0 ? 'admin_managed' : null,
        };
      });
    } catch (dbErr) {
      // ROLLBACK the Supabase user if WE created it this call — otherwise a
      // Supabase account with no profile leaks (a login that lands nowhere).
      if (accountCreated && supabaseUid) {
        try {
          if (process.env.SUPABASE_SECRET_KEY) {
            await createAdminClient().auth.admin.deleteUser(supabaseUid);
          }
        } catch (rbErr) {
          logError(TAG, rbErr, { stage: 'rollback_supabase', supabaseUid });
        }
      }
      throw dbErr;
    }

    await writeAdminAudit({
      adminUid: adminCtx.uid,
      action: 'create_account',
      targetUid: supabaseUid,
      newValue: { account_preset: body.account_preset, trade_slug: primaryTrade, trade_slugs_override: override, email_provided: true },
      reason: body.reason,
    });

    await track(hashAdminUid(adminCtx.uid), 'admin_user_created', {
      account_preset: body.account_preset,
      auth_method: adminCtx.authMethod,
    });

    return ok(
      { ...dbRow, password_reset_link: resetLink },
      { created: accountCreated },
    );
  } catch (cause) {
    return internalError(cause, { route: 'POST /api/admin/users' });
  }
});

/**
 * `GoTrueAdminApi` has no dedicated by-email lookup (P1-G5 note above) —
 * paginate `listUsers()` until a match or exhaustion. Bounded to
 * `MAX_PAGES * PER_PAGE` users; re-evaluate if Buildo's admin-provisioned
 * account volume ever approaches that ceiling.
 */
async function findUserByEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const PER_PAGE = 200;
  const MAX_PAGES = 25; // 5,000 users
  const target = email.toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { id: match.id };
    if (data.users.length < PER_PAGE) break; // last page reached
  }
  return null;
}
