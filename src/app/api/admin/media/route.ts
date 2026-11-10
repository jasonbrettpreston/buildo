// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated note 2026-11-09)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §11 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §7.3
//
// Admin media library (MF-37; plan ~/Buildo-scratch/mcfrontend/MF-37/plan.v3.md §3.3):
//   GET  — the list (src/lib/media/list.ts; the RSC page calls the same function). Cache-Control private.
//   POST — upload one image: content-length precheck (413) → JSON → contract validator (400) → strict
//          decode (400) → size (413) → duplicate (scenario_key, NULL rule, position) precheck (409) →
//          breadcrumb + track (intent) → withTransaction { INSERT, writeAdminAudit, storage upload }.
//          Storage failure inside the transaction rolls the row back (502, or 403 when the storage call
//          itself was refused 401/403). A throw after the upload returned (COMMIT failed) removes the object
//          best-effort. 23505 → 409 POSITION_TAKEN (a race the precheck lost; not an error log).
// Auth: verifyAdminAuth FIRST line; mutations need authMethod === 'session' (audit admin_uid is a UUID FK).
// Failed attempts are not audit rows; they are logError/track(result:'error') only.

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { sessionRequired, unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logInfo } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { hashAdminUid } from '@/lib/media/hash-admin-uid';
import {
  MediaDecodeError,
  decodeDataUrl,
  maxRequestBytes,
  pathFor,
  readMediaLimits,
  requestValidator,
} from '@/lib/media/contract';
import { listMedia } from '@/lib/media/list';
import { MediaStorageError, sessionMediaStorage } from '@/lib/media/storage';
import { MediaListMetaSchema, MediaListResponseSchema, MediaUploadResponseSchema } from './types';

export const maxDuration = 30;

const TAG = '[api/admin/media]';
const ACTION = 'media_upload';
const TARGET = 'media_assets';


/** 411: the upload needs a numeric Content-Length (outside the envelope helper's status union; same body shape). */
function lengthRequired(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'LENGTH_REQUIRED', message: 'The upload needs a Content-Length header' }, meta: null },
    { status: 411 },
  );
}

/** 413 is outside the envelope helper's status union; same body shape. */
function tooLarge(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'FILE_TOO_LARGE', message: 'The file is larger than the upload limit' }, meta: null },
    { status: 413 },
  );
}


function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === '23505';
}

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  const t0 = Date.now();
  try {
    const limits = await readMediaLimits(pool);
    const { rows, meta } = await listMedia({ db: pool, limits });
    logInfo(TAG, 'media list read', { rows: rows.length, unsigned: meta.unsigned, duration_ms: Date.now() - t0 });
    const res = ok(MediaListResponseSchema.parse(rows), MediaListMetaSchema.parse(meta));
    res.headers.set('Cache-Control', `private, max-age=${limits.list_cache_seconds}`);
    return res;
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/media' });
  }
});

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line (CSRF Origin gate inside the guard).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  // Spec 33 section 8.1: shared credentials cannot be audited (admin_audit_log.admin_uid is a UUID FK).
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/media');

  const t0 = Date.now();
  const distinctId = hashAdminUid(adminCtx.uid);
  const outcome = (result: 'ok' | 'error', reason: string | null) =>
    void track(distinctId, 'admin_action_performed', {
      action: ACTION,
      target: TARGET,
      auth_method: adminCtx.authMethod,
      result,
      reason,
      duration_ms: Date.now() - t0,
    });

  const limits = await readMediaLimits(pool);
  // Security OUTPUT seat F2: a missing or non-numeric Content-Length is refused (411) so the JSON parse below never reads an uncapped body.
  const header = request.headers.get('content-length');
  const declared = header === null || header.trim() === '' ? Number.NaN : Number(header);
  if (!Number.isFinite(declared) || declared < 0) return lengthRequired();
  if (declared > maxRequestBytes(limits)) return tooLarge();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = requestValidator.safeParse(raw);
  if (!parsed.success) return badRequestZod(parsed.error);
  const body = parsed.data;

  let decoded: ReturnType<typeof decodeDataUrl>;
  try {
    decoded = decodeDataUrl(body.file);
  } catch (e) {
    if (e instanceof MediaDecodeError) return err('INVALID_FILE', `The file is not a valid image (${e.reason})`, 400);
    throw e;
  }
  if (decoded.bytes.length > limits.max_bytes) return tooLarge();

  const scenarioKey = body.scenario_key ?? null;
  const position = body.position ?? null;
  if (body.kind === 'report_image') {
    const dup = await pool.query(
      `SELECT 1 FROM media_assets WHERE kind = 'report_image' AND scenario_key = $1 AND rule IS NULL AND position = $2 LIMIT 1`,
      [scenarioKey, position],
    );
    if (dup.rows.length > 0) return err('POSITION_TAKEN', 'That position is already taken for this scenario', 409);
  }

  const assetId = randomUUID();
  const path = pathFor(body.kind, assetId, decoded.mime);
  const storage = await sessionMediaStorage(limits.storage_timeout_ms);

  // Spec 35 §7.1 — breadcrumb + track BEFORE the write (intent capture).
  Sentry.addBreadcrumb({ category: 'admin_action', message: ACTION, data: { target: TARGET, kind: body.kind } });
  void track(distinctId, 'admin_action_performed', { action: ACTION, target: TARGET, auth_method: adminCtx.authMethod });

  let uploaded = false;
  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO media_assets (asset_id, kind, path, mime, bytes, alt, scenario_key, position, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [assetId, body.kind, path, decoded.mime, decoded.bytes.length, body.alt, scenarioKey, position, adminCtx.uid],
      );
      await writeAdminAudit(
        {
          adminUid: adminCtx.uid,
          action: 'media_upload',
          targetUid: assetId,
          newValue: {
            kind: body.kind,
            path,
            mime: decoded.mime,
            bytes: decoded.bytes.length,
            alt: body.alt,
            scenario_key: scenarioKey,
            position,
            uploaded_by: adminCtx.uid,
          },
          reason: 'admin media upload',
        },
        client,
      );
      await storage.upload(path, decoded.bytes, decoded.mime);
      uploaded = true;
    });
  } catch (cause) {
    if (uploaded) {
      // COMMIT failed after the object landed: the row is gone, so the object must go too.
      logError(TAG, cause, { stage: 'media_upload_commit', asset_id: assetId });
      try {
        await storage.remove(path);
      } catch (removeErr) {
        logError(TAG, removeErr, { stage: 'media_upload_compensate_failed', asset_id: assetId, path });
      }
      outcome('error', 'commit_failed');
      return err('INTERNAL_ERROR', 'The upload could not be saved', 500);
    }
    if (isUniqueViolation(cause)) {
      outcome('error', 'position_taken');
      return err('POSITION_TAKEN', 'That position is already taken for this scenario', 409);
    }
    if (cause instanceof MediaStorageError) {
      if (cause.status === 401 || cause.status === 403) {
        logError(TAG, cause, { stage: 'storage_session', asset_id: assetId, status: cause.status });
        outcome('error', 'storage_session');
        return err('STORAGE_SESSION_REQUIRED', 'Storage refused the session; sign in again', 403);
      }
      logError(TAG, cause, { stage: 'media_upload_storage', asset_id: assetId, status: cause.status });
      if (cause.status === null) {
        // A timeout does not cancel the HTTP upload (storage-js takes no AbortSignal), so the object may still land after the rollback:
        // remove it best-effort (code-reviewer F1, security F5). A failed remove is logged; the object is private and no row points to it.
        try {
          await storage.remove(path);
        } catch (removeErr) {
          logError(TAG, removeErr, { stage: 'media_upload_timeout_orphan', asset_id: assetId, path });
        }
      }
      outcome('error', 'storage_upload_failed');
      return err('STORAGE_UPLOAD_FAILED', 'The file could not be stored', 502);
    }
    outcome('error', 'internal');
    return internalError(cause, { route: 'POST /api/admin/media', asset_id: assetId });
  }

  outcome('ok', null);
  logInfo(TAG, 'media uploaded', { asset_id: assetId, kind: body.kind, bytes: decoded.bytes.length, duration_ms: Date.now() - t0 });
  return ok(
    MediaUploadResponseSchema.parse({ asset_id: assetId, kind: body.kind, path, mime: decoded.mime, bytes: decoded.bytes.length }),
  );
});
