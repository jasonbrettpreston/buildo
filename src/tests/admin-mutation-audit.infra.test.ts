// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-12
//             docs/specs/00_engineering_standards.md §2 (error boundary) + §4.4
//
// The BEHAVIOURAL half of the WF3 SEC-1 audit locks. `api.infra.test.ts`
// proves by source scan that every mutating `/api/admin/**` export references
// `writeAdminAudit` and a session gate. This file proves what those
// references DO, on two representative shapes:
//
//   * TRANSACTIONAL (pipelines/schedules PUT) — the mutation and its
//     admin_audit_log row share one transaction, so a failing audit write
//     rolls the mutation back rather than leaving an unattributable change.
//     `writeAdminAudit` must receive the TRANSACTION CLIENT as its executor,
//     not the pool: passing the pool would commit the row on a separate
//     connection and silently defeat the atomicity.
//   * SIDE-EFFECTING (control-panel/resync POST) — a background `spawn` has
//     no transaction to enclose, so the audit row is written FIRST. The only
//     possible failure is a recorded intent with no run; never a chain run
//     nobody can attribute.
//
// Plus the unhappy paths the guard introduces: 401 (no credential), 403
// (shared non-session sentinel), 400 (validation), 500 (audit failure).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  /** `query()` — the rows-array helper the read paths use. */
  query: vi.fn(),
  /** `client.query()` inside withTransaction — returns a pg QueryResult. */
  clientQuery: vi.fn(),
  rollback: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: h.query },
  query: h.query,
  // Faithful-enough transaction fake: the callback gets a client, and a throw
  // from anywhere inside it is surfaced to the caller AFTER a ROLLBACK —
  // exactly the contract src/lib/db/client.ts#withTransaction provides.
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
    try {
      return await fn({ query: h.clientQuery });
    } catch (err) {
      h.rollback();
      throw err;
    }
  }),
}));

vi.mock('@/lib/auth/verify-admin', () => ({ verifyAdminAuth: vi.fn() }));
vi.mock('@/lib/admin/admin-audit', () => ({ writeAdminAudit: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('child_process', () => ({ spawn: h.spawn }));

import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { PUT as SCHEDULES_PUT } from '@/app/api/admin/pipelines/schedules/route';
import { POST as RESYNC_POST } from '@/app/api/admin/control-panel/resync/route';
import { POST as RULES_POST } from '@/app/api/admin/rules/route';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedAudit = vi.mocked(writeAdminAudit);

const SESSION_CTX: AdminContext = { uid: '11111111-2222-3333-4444-555555555555', authMethod: 'session' };
const ADMIN_KEY_CTX: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };
const DEV_CTX: AdminContext = { uid: 'dev-user', authMethod: 'dev_bypass' };

function makeRequest(opts: { method: string; body?: unknown; pathname?: string }): NextRequest {
  return {
    method: opts.method,
    url: `https://example.test${opts.pathname ?? '/api/admin/pipelines/schedules'}`,
    nextUrl: { pathname: opts.pathname ?? '/api/admin/pipelines/schedules', searchParams: new URLSearchParams() },
    headers: { get: () => null },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  h.query.mockResolvedValue([]);
  mockedAudit.mockResolvedValue(undefined);
  h.spawn.mockReturnValue({ stderr: { on: vi.fn() }, on: vi.fn(), unref: vi.fn() });
});

describe('PUT /api/admin/pipelines/schedules — guard, gate and atomic audit', () => {
  it('401 when no admin credential is presented, and nothing is written', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits', cadence: 'Daily' } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    expect(h.clientQuery).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('403 on the shared admin_key sentinel — an unattributable mutation is refused', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits', cadence: 'Daily' } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('SESSION_REQUIRED');
    expect(h.clientQuery).not.toHaveBeenCalled();
  });

  it('403 on the shared dev_bypass sentinel too (both sentinels are non-UUID)', async () => {
    mockedVerify.mockResolvedValueOnce(DEV_CTX);
    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits', cadence: 'Daily' } }));
    expect(res.status).toBe(403);
  });

  it('400 on a missing cadence — validation precedes any write', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits' } }));
    expect(res.status).toBe(400);
    expect(h.clientQuery).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('200 on a session admin — the audit row is written with the TRANSACTION CLIENT', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    h.clientQuery
      .mockResolvedValueOnce({ rows: [{ cadence: 'Weekly' }], rowCount: 1 })   // before-image
      .mockResolvedValueOnce({ rows: [{ pipeline: 'permits', cadence: 'Daily' }], rowCount: 1 }); // UPDATE

    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits', cadence: 'Daily' } }));
    expect(res.status).toBe(200);

    expect(mockedAudit).toHaveBeenCalledTimes(1);
    const [params, executor] = mockedAudit.mock.calls[0]!;
    expect(params.adminUid).toBe(SESSION_CTX.uid);
    expect(params.action).toBe('pipeline_schedule_cadence_update');
    expect(params.oldValue).toEqual({ pipeline: 'permits', cadence: 'Weekly' });
    expect(params.newValue).toEqual({ pipeline: 'permits', cadence: 'Daily' });
    // THE atomicity assertion: the executor is the transaction client, not
    // the pool. A pool executor would commit the audit row on another
    // connection and the rollback below would not take it with it.
    expect((executor as unknown as { query: unknown }).query).toBe(h.clientQuery);
  });

  it('a failing audit write ROLLS THE MUTATION BACK and returns the 500 envelope', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    h.clientQuery
      .mockResolvedValueOnce({ rows: [{ cadence: 'Weekly' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ pipeline: 'permits', cadence: 'Daily' }], rowCount: 1 });
    // e.g. 22P02 invalid input syntax for type uuid — the exact shape Q1 guards.
    mockedAudit.mockRejectedValueOnce(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }));

    const res = await SCHEDULES_PUT(makeRequest({ method: 'PUT', body: { pipeline: 'permits', cadence: 'Daily' } }));
    expect(res.status).toBe(500);
    expect(h.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/control-panel/resync — guard, gate and audit-before-side-effect', () => {
  const REQ = { method: 'POST', pathname: '/api/admin/control-panel/resync' } as const;

  it('401 when unauthenticated — the chain is never spawned', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await RESYNC_POST(makeRequest(REQ));
    expect(res.status).toBe(401);
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it('403 on a shared sentinel — the chain is never spawned', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await RESYNC_POST(makeRequest(REQ));
    expect(res.status).toBe(403);
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it('the audit row is written BEFORE the spawn, and a failing audit blocks the run', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedAudit.mockRejectedValueOnce(new Error('audit table unavailable'));
    const res = await RESYNC_POST(makeRequest(REQ));
    // withApiEnvelope maps the throw to the sanitized 500 envelope…
    expect(res.status).toBe(500);
    // …and, decisively, the side effect did not happen.
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it('a session admin records the trigger with the resync step list', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await RESYNC_POST(makeRequest(REQ));
    expect(res.status).toBe(200);
    expect(mockedAudit).toHaveBeenCalledTimes(1);
    const [params] = mockedAudit.mock.calls[0]!;
    expect(params.action).toBe('pipeline_resync_trigger');
    expect(params.adminUid).toBe(SESSION_CTX.uid);
    expect((params.newValue as { steps: string[] }).steps).toContain('refresh_snapshot');
  });
});

describe('POST /api/admin/rules — guard precedes body parsing', () => {
  const REQ = { method: 'POST', pathname: '/api/admin/rules' } as const;

  it('401 before the body is read (an unauthenticated caller learns nothing about validation)', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await RULES_POST(makeRequest({ ...REQ, body: { trade_id: 1 } }));
    expect(res.status).toBe(401);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('400 on a missing required field — no rule and no audit row', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await RULES_POST(makeRequest({ ...REQ, body: { trade_id: 1 } }));
    expect(res.status).toBe(400);
    expect(h.clientQuery).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});
