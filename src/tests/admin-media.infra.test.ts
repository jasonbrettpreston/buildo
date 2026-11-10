// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8.1 + §11 + §12
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1
//             docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated note 2026-11-09)
//
// T4 (MF-37 plan.v3 §4): the admin media write/compensation order on ONE shared call log over fakes for
// the pool, the transaction client, storage, Sentry, track and the logger. Upload: breadcrumb → track →
// BEGIN → INSERT → audit → upload → COMMIT; storage failure rolls back (502 / 403 storage_session);
// a COMMIT failure after the upload removes the object (and logs compensate_failed if that fails too);
// 23505 → 409 without logError; 413 precheck; strict decode; no audit or telemetry on refusals.
// Delete: audit committed before the object removal; removal failure → 200 object_removed:false.
// List: a failed batch sign → every row unsigned and ONE logError stage media_sign. No database.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  log: [] as string[],
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signMany: vi.fn(),
  commitFails: false,
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: h.poolQuery },
  // Mirrors src/lib/db/client.ts#withTransaction: BEGIN, fn, COMMIT; on any throw ROLLBACK and rethrow.
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
    h.log.push('BEGIN');
    try {
      const out = await fn({ query: h.clientQuery });
      if (h.commitFails) throw Object.assign(new Error('commit failed'), { code: '40001' });
      h.log.push('COMMIT');
      return out;
    } catch (e) {
      h.log.push('ROLLBACK');
      throw e;
    }
  }),
}));
vi.mock('@/lib/auth/verify-admin', () => ({ verifyAdminAuth: vi.fn() }));
vi.mock('@/lib/admin/admin-audit', () => ({
  writeAdminAudit: vi.fn(async (p: { action: string }) => {
    h.log.push(`audit:${p.action}`);
  }),
}));
vi.mock('@/lib/admin/analytics', () => ({
  track: vi.fn(async (_id: string, event: string) => {
    h.log.push(`track:${event}`);
  }),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn((_t: string, _e: unknown, c?: { stage?: string }) => h.log.push(`logError:${c?.stage}`)),
  logWarn: vi.fn(() => h.log.push('logWarn')),
  logInfo: vi.fn(() => h.log.push('logInfo')),
}));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn(() => h.log.push('breadcrumb')) }));
vi.mock('@/lib/media/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/media/storage')>()),
  sessionMediaStorage: vi.fn(async () => ({ upload: h.upload, remove: h.remove, signMany: h.signMany })),
}));

import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { MediaStorageError } from '@/lib/media/storage';
import { GET, POST } from '@/app/api/admin/media/route';
import { DELETE } from '@/app/api/admin/media/[asset_id]/route';

const UID = '11111111-2222-4333-8444-555555555555';
const ASSET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PNG_URL = `data:image/png;name=hero.png;base64,${PNG.toString('base64')}`;
const SCENARIO = 'detached_house/pitched';
const LIMITS = { media_upload_max_bytes: '2000000', media_signed_url_ttl_seconds: '600', media_list_page_max: '200', media_list_cache_seconds: '60', media_storage_timeout_ms: '15000' };
const ROW = {
  asset_id: ASSET, kind: 'ad_creative', path: `ad_creative/${ASSET}.png`, mime: 'image/png', bytes: 12, alt: 'Hero',
  scenario_key: null, position: null, uploaded_by: UID, created_at: new Date('2026-11-09T14:05:00Z'),
};
let limits: Record<string, string>;
let listRows: unknown[];
let dupRows: unknown[];

function req(method: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    method,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { pathname: '/api/admin/media', searchParams: new URLSearchParams() },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  } as unknown as NextRequest;
}
const upload = (body: unknown, headers?: Record<string, string>) => POST(req('POST', body, headers));
const del = (confirm: unknown) => DELETE(req('DELETE', { confirm }), { params: Promise.resolve({ asset_id: ASSET }) });
const adBody = { kind: 'ad_creative', alt: 'Hero', file: PNG_URL };
const stages = () => h.log.filter((l) => l.startsWith('logError:')).map((l) => l.slice('logError:'.length));
const telemetryOrAudit = () => h.log.filter((l) => /^(track|audit|breadcrumb)/.test(l));

beforeEach(() => {
  vi.clearAllMocks();
  h.log.length = 0;
  h.commitFails = false;
  limits = { ...LIMITS };
  listRows = [ROW];
  dupRows = [];
  vi.mocked(verifyAdminAuth).mockResolvedValue({ uid: UID, authMethod: 'session' });
  h.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('logic_variables')) {
      return { rows: Object.entries(limits).map(([variable_key, variable_value]) => ({ variable_key, variable_value })) };
    }
    if (sql.includes('ORDER BY')) return { rows: listRows };
    return { rows: dupRows };
  });
  h.clientQuery.mockImplementation(async (sql: string) => {
    const verb = sql.trim().split(/\s+/)[0]!;
    h.log.push(verb === 'SELECT' && sql.includes('FOR UPDATE') ? 'SELECT_FOR_UPDATE' : verb);
    return sql.includes('FOR UPDATE') ? { rows: [ROW] } : { rows: [], rowCount: 1 };
  });
  h.upload.mockImplementation(async () => void h.log.push('upload'));
  h.remove.mockImplementation(async () => void h.log.push('remove'));
  h.signMany.mockImplementation(async (paths: string[]) => paths.map((p) => `https://signed.test/${p}`));
});

describe('POST /api/admin/media — order and compensation', () => {
  it('success: breadcrumb, track, BEGIN, INSERT, audit, upload, COMMIT; one audit, one logInfo', async () => {
    const res = await upload(adBody);
    expect(res.status).toBe(200);
    expect(h.log).toEqual([
      'breadcrumb', 'track:admin_action_performed', 'BEGIN', 'INSERT', 'audit:media_upload', 'upload', 'COMMIT',
      'track:admin_action_performed', 'logInfo',
    ]);
    expect(vi.mocked(writeAdminAudit)).toHaveBeenCalledTimes(1);
    const [params] = vi.mocked(writeAdminAudit).mock.calls[0]!;
    expect(params.action).toBe('media_upload');
    expect(params.newValue).toMatchObject({ uploaded_by: UID, kind: 'ad_creative', mime: 'image/png', bytes: PNG.length });
    expect(params.targetUid).toBe((await res.json()).data.asset_id);
    const insertArgs = h.clientQuery.mock.calls[0]![1] as unknown[];
    expect(insertArgs[8]).toBe(UID); // uploaded_by non-null
  });

  it('storage failure: ROLLBACK once, no COMMIT, no remove, 502, one logError media_upload_storage', async () => {
    h.upload.mockRejectedValue(new MediaStorageError('upload', 500));
    const res = await upload(adBody);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('STORAGE_UPLOAD_FAILED');
    expect(h.log.filter((l) => l === 'ROLLBACK')).toHaveLength(1);
    expect(h.log).not.toContain('COMMIT');
    expect(h.remove).not.toHaveBeenCalled();
    expect(stages()).toEqual(['media_upload_storage']);
    expect(h.log).not.toContain('logInfo');
  });

  for (const status of [401, 403]) {
    it(`storage status ${status}: 403 STORAGE_SESSION_REQUIRED + stage storage_session`, async () => {
      h.upload.mockRejectedValue(new MediaStorageError('upload', status));
      const res = await upload(adBody);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('STORAGE_SESSION_REQUIRED');
      expect(stages()).toEqual(['storage_session']);
    });
  }

  it('storage with no status (timeout): 502', async () => {
    h.upload.mockRejectedValue(new MediaStorageError('upload', null));
    expect((await upload(adBody)).status).toBe(502);
    expect(stages()).toEqual(['media_upload_storage']);
  });

  it('COMMIT failure after the upload: remove once + stage media_upload_commit', async () => {
    h.commitFails = true;
    const res = await upload(adBody);
    expect(res.status).toBe(500);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.log.indexOf('upload')).toBeLessThan(h.log.indexOf('remove'));
    expect(stages()).toEqual(['media_upload_commit']);
  });

  it('COMMIT failure and the compensating remove fails: stage media_upload_compensate_failed', async () => {
    h.commitFails = true;
    h.remove.mockRejectedValue(new MediaStorageError('remove', 500));
    expect((await upload(adBody)).status).toBe(500);
    expect(stages()).toEqual(['media_upload_commit', 'media_upload_compensate_failed']);
  });

  it('23505 (lost the position race): 409 POSITION_TAKEN, no logError, no upload', async () => {
    h.clientQuery.mockImplementationOnce(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
    const res = await upload({ kind: 'report_image', alt: 'A', file: PNG_URL, scenario_key: SCENARIO, position: 0 });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('POSITION_TAKEN');
    expect(stages()).toEqual([]);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('duplicate precheck: 409 before any write or telemetry', async () => {
    dupRows = [{ '?column?': 1 }];
    const res = await upload({ kind: 'report_image', alt: 'A', file: PNG_URL, scenario_key: SCENARIO, position: 0 });
    expect(res.status).toBe(409);
    expect(telemetryOrAudit()).toEqual([]);
    expect(h.log).not.toContain('BEGIN');
  });

  it('413 precheck on content-length, before parsing', async () => {
    const res = await upload(adBody, { 'content-length': String(4_000_000) });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('FILE_TOO_LARGE');
    expect(telemetryOrAudit()).toEqual([]);
  });

  it('413 on the decoded size over media_upload_max_bytes', async () => {
    limits.media_upload_max_bytes = '4';
    expect((await upload(adBody)).status).toBe(413);
    expect(telemetryOrAudit()).toEqual([]);
  });

  const invalid: Array<[string, unknown, number]> = [
    ['not JSON', undefined, 400],
    ['report_image without position', { kind: 'report_image', alt: 'A', file: PNG_URL, scenario_key: SCENARIO }, 400],
    ['invalid base64', { ...adBody, file: 'data:image/png;base64,iVBORw0' }, 400],
    ['missing ;base64,', { ...adBody, file: `data:image/png,${PNG.toString('base64')}` }, 400],
    ['MIME != magic bytes', { ...adBody, file: `data:image/jpeg;base64,${PNG.toString('base64')}` }, 400],
    ['odd ;name=', { ...adBody, file: `data:image/png;name=a"b;base64,${PNG.toString('base64')}` }, 400],
  ];
  for (const [label, body, status] of invalid) {
    it(`validation (${label}): ${status}, no audit, no telemetry, no transaction`, async () => {
      const res = await upload(body);
      expect(res.status).toBe(status);
      expect(telemetryOrAudit()).toEqual([]);
      expect(h.log).not.toContain('BEGIN');
      expect(stages()).toEqual([]);
    });
  }

  it('auth refusals: no audit, no telemetry; logWarn once on 403', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValueOnce(null);
    expect((await upload(adBody)).status).toBe(401);
    vi.mocked(verifyAdminAuth).mockResolvedValueOnce({ uid: 'dev-user', authMethod: 'dev_bypass' });
    expect((await upload(adBody)).status).toBe(403);
    expect(telemetryOrAudit()).toEqual([]);
    expect(h.log).toEqual(['logWarn']);
  });
});

describe('DELETE /api/admin/media/[asset_id]', () => {
  it('audit committed before the object removal', async () => {
    const res = await del('Hero');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ object_removed: true });
    expect(h.log).toEqual([
      'breadcrumb', 'track:admin_action_performed', 'BEGIN', 'SELECT_FOR_UPDATE', 'DELETE', 'audit:media_delete', 'COMMIT',
      'remove', 'track:admin_action_performed', 'logInfo',
    ]);
    const [params] = vi.mocked(writeAdminAudit).mock.calls[0]!;
    expect(params.action).toBe('media_delete');
    expect(params.oldValue).toMatchObject({ asset_id: ASSET, alt: 'Hero', created_at: '2026-11-09T14:05:00.000Z' });
  });

  it('remove failure: 200, object_removed false, one logError media_delete_remove', async () => {
    h.remove.mockRejectedValue(new MediaStorageError('remove', 500));
    const res = await del('Hero');
    expect(res.status).toBe(200);
    expect((await res.json()).meta).toEqual({ object_removed: false });
    expect(stages()).toEqual(['media_delete_remove']);
    expect(h.log.indexOf('COMMIT')).toBeLessThan(h.log.indexOf('logError:media_delete_remove'));
  });

  it('confirm != alt: 409 CONFIRM_MISMATCH, nothing deleted, no audit, no remove', async () => {
    const res = await del('hero');
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONFIRM_MISMATCH');
    expect(h.log).not.toContain('DELETE');
    expect(vi.mocked(writeAdminAudit)).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('missing row: 404', async () => {
    h.clientQuery.mockImplementationOnce(async () => ({ rows: [] }));
    expect((await del('Hero')).status).toBe(404);
    expect(vi.mocked(writeAdminAudit)).not.toHaveBeenCalled();
  });

  it('empty confirm: 400 before any telemetry', async () => {
    expect((await del('')).status).toBe(400);
    expect(telemetryOrAudit()).toEqual([]);
  });
});

describe('GET /api/admin/media', () => {
  it('rows are plain JSON with server display strings; Cache-Control from the variable', async () => {
    const res = await GET(req('GET', undefined));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    const body = await res.json();
    expect(body.data[0]).toMatchObject({
      asset_id: ASSET, bytes_display: '12 B', created_at: '2026-11-09T14:05:00.000Z', created_display: '2026-11-09 14:05 UTC',
      signed_url: `https://signed.test/ad_creative/${ASSET}.png`,
    });
    expect(body.meta).toEqual({ total: 1, unsigned: 0, cap: 200, partial: false });
    expect(h.signMany).toHaveBeenCalledWith([`ad_creative/${ASSET}.png`], 600);
  });

  it('batch sign failure: every row unsigned, ONE logError stage media_sign', async () => {
    listRows = [ROW, { ...ROW, asset_id: '4f2504e0-4f89-41d3-9a0c-0305e82c3301' }, { ...ROW, asset_id: '5f2504e0-4f89-41d3-9a0c-0305e82c3301' }];
    h.signMany.mockRejectedValue(new MediaStorageError('sign', 500));
    const body = await (await GET(req('GET', undefined))).json();
    expect(body.meta.unsigned).toBe(3);
    expect(body.data.every((r: { signed_url: unknown }) => r.signed_url === null)).toBe(true);
    expect(stages()).toEqual(['media_sign']);
  });

  it('partial sign: unsigned counts the nulls, one logError', async () => {
    listRows = [ROW, { ...ROW, asset_id: '4f2504e0-4f89-41d3-9a0c-0305e82c3301' }];
    h.signMany.mockResolvedValue(['https://signed.test/a', null]);
    const body = await (await GET(req('GET', undefined))).json();
    expect(body.meta.unsigned).toBe(1);
    expect(stages()).toEqual(['media_sign']);
  });

  it('partial flag when the cap is reached', async () => {
    limits.media_list_page_max = '1';
    expect((await (await GET(req('GET', undefined))).json()).meta).toMatchObject({ cap: 1, partial: true });
  });
});
