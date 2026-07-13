// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.1 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//
// Admin User Management — directory + account creation (P24-24B).
//   GET  — paginated directory. Search email/phone/name/company; filter by
//          preset / trade_slug (primary OR override) / subscription_status.
//   POST — supplier/enterprise provisioning: Firebase createUser + password
//          reset link + profile insert. Rolls back the Firebase user on DB
//          failure; idempotent re-create on an existing email.
//
// Auth: verifyAdminAuth FIRST line. POST requires an attributable session admin.

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
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

const DIRECTORY_COLUMNS = `
  user_id, email, phone_number, full_name, company_name,
  trade_slug, trade_slugs_override, account_preset,
  subscription_status, onboarding_complete, account_deleted_at, created_at
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
          `(email ILIKE $${i} OR phone_number ILIKE $${i} OR full_name ILIKE $${i} OR company_name ILIKE $${i})`,
        `%${q}%`,
      );
    }
    if (preset) add((i) => `account_preset = $${i}`, preset);
    if (trade_slug) add((i) => `(trade_slug = $${i} OR $${i} = ANY(trade_slugs_override))`, trade_slug);
    if (subscription_status) add((i) => `subscription_status = $${i}`, subscription_status);
    // P26-26D sweep surface (Spec 21 §6): outstanding delete-time cancel debt.
    // Boolean-valued (no bind param) — IS [NOT] NULL on the marker column.
    if (stripe_cancel_failed !== undefined) {
      where.push(`stripe_cancel_failed_at IS ${stripe_cancel_failed ? 'NOT NULL' : 'NULL'}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM user_profiles ${whereSql}`,
      params,
    );

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rowsRes = await pool.query<Record<string, unknown>>(
      `SELECT ${DIRECTORY_COLUMNS} FROM user_profiles ${whereSql}
       ORDER BY created_at DESC NULLS LAST, user_id
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

  let firebaseUid: string | null = null;
  let firebaseCreated = false; // did WE create it this call (rollback candidate)?
  let resetLink: string | null = null;

  try {
    // 1. Firebase user. Idempotent: an existing email adopts its uid instead of
    //    failing (idempotent re-create). No SDK in dev → synthetic uid so the
    //    DB + audit path is still testable locally (never reached in prod,
    //    where the SDK is initialized and admin.apps.length > 0).
    const admin = await import('firebase-admin');
    if (admin.apps.length > 0) {
      try {
        const created = await admin.auth().createUser({ email: body.email });
        firebaseUid = created.uid;
        firebaseCreated = true;
      } catch (createErr) {
        const code = (createErr as { code?: string }).code;
        if (code === 'auth/email-already-exists') {
          const existing = await admin.auth().getUserByEmail(body.email);
          firebaseUid = existing.uid; // adopt — do NOT mark firebaseCreated (no rollback)
        } else {
          throw createErr;
        }
      }
      try {
        resetLink = await admin.auth().generatePasswordResetLink(body.email);
      } catch (linkErr) {
        // Non-fatal: the account exists; the reset link can be re-issued.
        logError(TAG, linkErr, { stage: 'reset_link' });
      }
    } else {
      firebaseUid = `dev_${body.account_preset}_${createHash('sha256').update(body.email).digest('hex').slice(0, 12)}`;
    }

    // 2. Profile insert (idempotent on user_id). Enterprise/manufacturer +
    //    supplier are admin-managed: no trial, no client onboarding.
    let dbRow: Record<string, unknown>;
    try {
      const insertRes = await pool.query<Record<string, unknown>>(
        `INSERT INTO user_profiles
           (user_id, email, company_name, account_preset, trade_slug, trade_slugs_override,
            radius_cap_km, subscription_status, onboarding_complete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin_managed', false)
         ON CONFLICT (user_id) DO UPDATE
           SET email = EXCLUDED.email,
               company_name = EXCLUDED.company_name,
               account_preset = EXCLUDED.account_preset,
               trade_slug = EXCLUDED.trade_slug,
               trade_slugs_override = EXCLUDED.trade_slugs_override,
               radius_cap_km = EXCLUDED.radius_cap_km,
               updated_at = NOW()
         RETURNING user_id, email, account_preset, trade_slug, trade_slugs_override, subscription_status`,
        [firebaseUid, body.email, body.company_name ?? null, body.account_preset, primaryTrade, override, body.radius_cap_km ?? null],
      );
      dbRow = insertRes.rows[0]!;
    } catch (dbErr) {
      // ROLLBACK the Firebase user if WE created it this call — otherwise a
      // Firebase account with no profile leaks (a login that lands nowhere).
      if (firebaseCreated && firebaseUid) {
        try {
          const admin = await import('firebase-admin');
          if (admin.apps.length > 0) await admin.auth().deleteUser(firebaseUid);
        } catch (rbErr) {
          logError(TAG, rbErr, { stage: 'rollback_firebase', firebaseUid });
        }
      }
      throw dbErr;
    }

    await writeAdminAudit({
      adminUid: adminCtx.uid,
      action: 'create_account',
      targetUid: firebaseUid,
      newValue: { account_preset: body.account_preset, trade_slug: primaryTrade, trade_slugs_override: override, email_provided: true },
      reason: body.reason,
    });

    await track(hashAdminUid(adminCtx.uid), 'admin_user_created', {
      account_preset: body.account_preset,
      auth_method: adminCtx.authMethod,
    });

    return ok(
      { ...dbRow, password_reset_link: resetLink },
      { created: firebaseCreated },
    );
  } catch (cause) {
    return internalError(cause, { route: 'POST /api/admin/users' });
  }
});
