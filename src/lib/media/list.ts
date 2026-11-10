// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §9 (client sort up to 200 rows)
//            docs/specs/00-architecture/114_rls_policy_catalog.md §6 (signed URLs through the list call)
//
// The admin media list: one owner-connection read capped at media_list_page_max, one batch sign call on
// the session client (TTL media_signed_url_ttl_seconds), per-row `signed_url: null` on failure and ONE
// logError (stage media_sign) per request. Rows are plain JSON (no Date) so the RSC page can pass them to
// a client island; display strings are built here, on the server. Same function serves the page and GET.

import { pool } from '@/lib/db/client';
import type { Queryable } from '@/lib/entitlements';
import { logError } from '@/lib/logger';
import { pathFor, readMediaLimits, type MediaKind, type MediaLimits, type MediaMime } from '@/lib/media/contract';
import { sessionMediaStorage, type MediaStorage } from '@/lib/media/storage';

const TAG = '[lib/media/list]';

// A type alias (not an interface) so rows are assignable to Record<string, unknown> row props.
export type MediaListRow = {
  asset_id: string;
  kind: MediaKind;
  scenario_key: string | null;
  position: number | null;
  alt: string;
  mime: MediaMime;
  bytes: number;
  bytes_display: string;
  created_at: string;
  created_display: string;
  signed_url: string | null;
};

export interface MediaListMeta {
  total: number;
  unsigned: number;
  cap: number;
  partial: boolean;
}

export interface MediaListResult {
  rows: MediaListRow[];
  meta: MediaListMeta;
}

export interface ListMediaDeps {
  db?: Queryable;
  limits?: MediaLimits;
  storage?: MediaStorage;
}

/** Decimal units, one decimal place above bytes: 1,900,000 → "1.9 MB". */
export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

/** "YYYY-MM-DD HH:MM UTC" (explicit zone: the server renders it, the viewer's zone is unknown). */
export function formatCreated(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

interface DbRow {
  asset_id: string;
  kind: MediaKind;
  scenario_key: string | null;
  position: number | null;
  alt: string;
  mime: MediaMime;
  bytes: number;
  created_at: Date | string;
}

export async function listMedia(deps: ListMediaDeps = {}): Promise<MediaListResult> {
  const db = deps.db ?? pool;
  const limits = deps.limits ?? (await readMediaLimits(db));
  const cap = limits.list_page_max;
  const res = await db.query<DbRow>(
    `SELECT asset_id, kind, scenario_key, position, alt, mime, bytes, created_at FROM media_assets ORDER BY kind, scenario_key, position, created_at LIMIT $1`,
    [cap],
  );

  let urls: Array<string | null> = res.rows.map(() => null);
  if (res.rows.length > 0) {
    const paths = res.rows.map((r) => pathFor(r.kind, r.asset_id, r.mime));
    try {
      const storage = deps.storage ?? (await sessionMediaStorage(limits.storage_timeout_ms));
      urls = await storage.signMany(paths, limits.signed_url_ttl_seconds);
    } catch (cause) {
      urls = paths.map(() => null);
      logError(TAG, cause, { stage: 'media_sign', requested: paths.length, failed: paths.length });
      return build(res.rows, urls, cap, false);
    }
  }
  return build(res.rows, urls, cap, true);
}

function build(dbRows: DbRow[], urls: Array<string | null>, cap: number, logPartial: boolean): MediaListResult {
  const rows = dbRows.map((r, i): MediaListRow => {
    const created_at = r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString();
    const bytes = Number(r.bytes);
    return {
      asset_id: r.asset_id,
      kind: r.kind,
      scenario_key: r.scenario_key,
      position: r.position === null ? null : Number(r.position),
      alt: r.alt,
      mime: r.mime,
      bytes,
      bytes_display: formatBytes(bytes),
      created_at,
      created_display: formatCreated(created_at),
      signed_url: urls[i] ?? null,
    };
  });
  const unsigned = rows.filter((r) => r.signed_url === null).length;
  if (logPartial && unsigned > 0) {
    logError(TAG, new Error('signed URL batch partially failed'), {
      stage: 'media_sign',
      requested: rows.length,
      failed: unsigned,
    });
  }
  return { rows, meta: { total: rows.length, unsigned, cap, partial: rows.length === cap } };
}
