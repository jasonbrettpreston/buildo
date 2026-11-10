// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated note 2026-11-09)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §11 + §13
//
// DELETE one media asset (MF-37; plan §3.3): withTransaction { SELECT … FOR UPDATE (404), body.confirm must
// equal the row's alt (409 CONFIRM_MISMATCH), DELETE, writeAdminAudit(media_delete, oldValue: row) } → COMMIT
// → storage remove. The row and its audit commit first; a failed object removal is logged (stage
// media_delete_remove) and reported as 200 with meta.object_removed false (an orphan object, never an
// orphan row). Auth: verifyAdminAuth FIRST line; authMethod === 'session' required.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod } from '@/features/leads/api/error-mapping';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { hashAdminUid } from '@/lib/media/hash-admin-uid';
import { deleteValidator, readMediaLimits } from '@/lib/media/contract';
import { sessionMediaStorage } from '@/lib/media/storage';
import { MediaDeleteMetaSchema, MediaDeleteResponseSchema } from '../types';

const TAG = '[api/admin/media/[asset_id]]';
const ACTION = 'media_delete';
const TARGET = 'media_assets';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod !== 'session') {
    logWarn(TAG, 'non-session mutation rejected — media writes require a session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Media mutations require a session admin (shared credentials cannot be audited)', 403);
  }
  return null;
}

interface MediaRow {
  asset_id: string;
  kind: string;
  path: string;
  mime: string;
  bytes: number;
  alt: string;
  scenario_key: string | null;
  position: number | null;
  uploaded_by: string | null;
  created_at: Date | string;
}

type TxOutcome = { kind: 'not_found' } | { kind: 'mismatch' } | { kind: 'deleted'; row: MediaRow };

export const DELETE = withApiEnvelope(async function DELETE(request: NextRequest, context?: unknown) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  const t0 = Date.now();
  const { asset_id: assetId } = await (context as { params: Promise<{ asset_id: string }> }).params;
  if (!UUID_RE.test(assetId)) return err('NOT_FOUND', 'Media asset not found', 404);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const confirm = (raw as { confirm?: unknown } | null)?.confirm;
  const parsed = deleteValidator.safeParse({ asset_id: assetId, confirm });
  if (!parsed.success) return badRequestZod(parsed.error);

  const limits = await readMediaLimits(pool);
  const storage = await sessionMediaStorage(limits.storage_timeout_ms);
  const distinctId = hashAdminUid(adminCtx.uid);

  // Spec 35 §7.1 — breadcrumb + track BEFORE the write (intent capture).
  Sentry.addBreadcrumb({ category: 'admin_action', message: ACTION, data: { target: TARGET } });
  void track(distinctId, 'admin_action_performed', { action: ACTION, target: TARGET, auth_method: adminCtx.authMethod });

  const result = await withTransaction(async (client): Promise<TxOutcome> => {
    const sel = await client.query<MediaRow>(
      `SELECT asset_id, kind, path, mime, bytes, alt, scenario_key, position, uploaded_by, created_at FROM media_assets WHERE asset_id = $1 FOR UPDATE`,
      [assetId],
    );
    const row = sel.rows[0];
    if (!row) return { kind: 'not_found' };
    if (parsed.data.confirm !== row.alt) return { kind: 'mismatch' };
    await client.query(`DELETE FROM media_assets WHERE asset_id = $1`, [assetId]);
    await writeAdminAudit(
      {
        adminUid: adminCtx.uid,
        action: 'media_delete',
        targetUid: assetId,
        oldValue: {
          ...row,
          created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        },
        reason: 'admin media delete',
      },
      client,
    );
    return { kind: 'deleted', row };
  });

  const outcome = (res: 'ok' | 'error', reason: string | null) =>
    void track(distinctId, 'admin_action_performed', {
      action: ACTION,
      target: TARGET,
      auth_method: adminCtx.authMethod,
      result: res,
      reason,
      duration_ms: Date.now() - t0,
    });

  if (result.kind === 'not_found') {
    outcome('error', 'not_found');
    return err('NOT_FOUND', 'Media asset not found', 404);
  }
  if (result.kind === 'mismatch') {
    outcome('error', 'confirm_mismatch');
    return err('CONFIRM_MISMATCH', 'The confirmation text does not match', 409);
  }

  let objectRemoved = true;
  try {
    await storage.remove(result.row.path);
  } catch (cause) {
    objectRemoved = false;
    logError(TAG, cause, { stage: 'media_delete_remove', asset_id: assetId, path: result.row.path });
  }
  outcome('ok', objectRemoved ? null : 'object_not_removed');
  logInfo(TAG, 'media deleted', { asset_id: assetId, object_removed: objectRemoved, duration_ms: Date.now() - t0 });
  return ok(
    MediaDeleteResponseSchema.parse({ asset_id: assetId, deleted: true }),
    MediaDeleteMetaSchema.parse({ object_removed: objectRemoved }),
  );
});
