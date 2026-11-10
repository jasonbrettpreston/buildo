// SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated note 2026-11-09)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5
//
// The storage seam for the private `surface-media` bucket. It runs on the SESSION Supabase client, so the
// three `surface_media_*_admin` storage policies (migration 300) are the gate, never a service key. Each call
// is bounded by AbortSignal.timeout(media_storage_timeout_ms). storage-js 2.x upload/remove/createSignedUrls
// take no signal, so the bound is a race: the caller stops waiting; the HTTP request itself is not cancelled.
// Errors carry the storage HTTP `status` when present (401/403 → the route's STORAGE_SESSION_REQUIRED).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { CONTRACT } from '@/lib/media/contract';

export interface MediaStorage {
  upload(path: string, bytes: Buffer, mime: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** One batch call; the result is index-aligned with `paths`, null where a URL was not minted. */
  signMany(paths: string[], ttlSeconds: number): Promise<Array<string | null>>;
}

export class MediaStorageError extends Error {
  constructor(
    readonly op: 'upload' | 'remove' | 'sign',
    readonly status: number | null,
    cause?: unknown,
  ) {
    super(`storage ${op} failed${status === null ? '' : ` (status ${status})`}`, { cause });
    this.name = 'MediaStorageError';
  }
}

function statusOf(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}

async function bounded<T>(op: MediaStorageError['op'], timeoutMs: number, run: () => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new MediaStorageError(op, null, signal.reason)), { once: true });
  });
  try {
    return await Promise.race([run(), timedOut]);
  } catch (e) {
    throw e instanceof MediaStorageError ? e : new MediaStorageError(op, statusOf(e), e);
  }
}

/** The seam over any Supabase client (tests pass a fake client or replace the factory below). */
export function createMediaStorage(client: SupabaseClient, timeoutMs: number): MediaStorage {
  const bucket = () => client.storage.from(CONTRACT.bucket.id);
  return {
    upload: (path, bytes, mime) =>
      bounded('upload', timeoutMs, async () => {
        const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: false });
        if (error) throw new MediaStorageError('upload', statusOf(error), error);
      }),
    remove: (path) =>
      bounded('remove', timeoutMs, async () => {
        const { error } = await bucket().remove([path]);
        if (error) throw new MediaStorageError('remove', statusOf(error), error);
      }),
    signMany: (paths, ttlSeconds) =>
      bounded('sign', timeoutMs, async () => {
        const { data, error } = await bucket().createSignedUrls(paths, ttlSeconds);
        if (error) throw new MediaStorageError('sign', statusOf(error), error);
        const byPath = new Map(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
        return paths.map((p) => byPath.get(p) ?? null);
      }),
  };
}

/** The production factory: the request's session client. */
export async function sessionMediaStorage(timeoutMs: number): Promise<MediaStorage> {
  return createMediaStorage(await createClient(), timeoutMs);
}
