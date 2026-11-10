// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-12 (one audit row per admin mutation; an audit failure fails it)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22 (targeting only on declared database keys)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1 + §11 + §13
//
// MF-40 · plan section 3.5 lock 4 with folds 3-5 and 8: the placements routes on ONE shared call log over fakes for the pool, the transaction
// client, the audit writer, Sentry and the logger. No database (the real-driver updated_at compare and the forced audit failure on a live row are
// in src/tests/db/admin-placements.db.test.ts, run in the operator's DB job).
//   auth: 401 without an admin; 403 SESSION_REQUIRED for admin_key and dev_bypass with no transaction and no audit row, on every write;
//   offers PUT: create = BEGIN, advertiser check, offer FOR UPDATE, INSERT (active false), audit offer_schedule, COMMIT; edit = UPDATE ... WHERE
//     updated_at; a stale updated_at is 409 with ROLLBACK and no audit; an existing row without updated_at is 409; an updated_at for a missing row
//     is 404; income, user-entered and zone_class keys are 400 before any transaction; a placement rule is 400 with its code and a warn;
//     an inactive or unknown advertiser is 400; an audit failure rolls the offer back and is 500;
//   offers PATCH: offer_activate / offer_deactivate audit rows; over_cap returned and warned; 404 and 409;
//   advertisers PUT: one audit row on create; the same id and name again is a no-op with no audit; another name is 409;
//   GET: the read shape, private no-store.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  log: [] as string[],
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  auditFails: false,
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: h.poolQuery },
  // Mirrors src/lib/db/client.ts#withTransaction: BEGIN, fn, COMMIT; on any throw ROLLBACK and rethrow.
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
    h.log.push('BEGIN');
    try {
      const out = await fn({ query: h.clientQuery });
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
    if (h.auditFails) throw Object.assign(new Error('audit insert failed'), { code: '23503' });
    h.log.push(`audit:${p.action}`);
  }),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn((_t: string, _e: unknown, c?: { stage?: string }) => h.log.push(`logError:${c?.stage ?? ''}`)),
  logWarn: vi.fn((_t: string, _m: string, c?: { reason?: string }) => h.log.push(`logWarn:${c?.reason ?? ''}`)),
  logInfo: vi.fn(() => h.log.push('logInfo')),
}));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn(() => h.log.push('breadcrumb')), captureException: vi.fn() }));

import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { GET } from '@/app/api/admin/placements/route';
import { PUT as putOffer, PATCH as patchOffer } from '@/app/api/admin/placements/offers/route';
import { PUT as putAdvertiser } from '@/app/api/admin/placements/advertisers/route';
import { OVER_CAP_QUERY } from '@/lib/placements/over-cap';

const UID = '11111111-2222-4333-8444-555555555555';
const OFFER = '0b5d3c3e-6f0a-4c39-9d8e-2b7a0f4a1c11';
const ADV = '4f2b8c11-2d3e-4a5b-8c6d-7e8f9a0b1c2d';
const STAMP = '2026-11-10 12:00:00.123456+00';
const offer = { offer_id: OFFER, placement_key: 'detail_footer', advertiser_id: ADV, creative_text: 'Example sponsor offer (detail footer)' };
const PRIOR = { advertiser_id: ADV, placement_key: 'detail_footer', targeting: {}, flight_start: null, flight_end: null, active: false, creative_text: 'Old', creative_asset_id: null };

let state: { advertiser: { active: boolean } | null; offer: typeof PRIOR | null; updateRows: number; insertConflict: boolean; advName: string; overCap: boolean };
// OUTPUT panel MEDIUM-1 (code reviewer): the fake refuses an offers UPDATE whose WHERE lost the updated_at predicate or whose bound value is not the
// updated_at the request sent, so a route that drops the stale check fails these tests (plants A and H).
const PUT_STALE = /WHERE offer_id = \$1 AND updated_at = \$8::timestamptz/;
const PATCH_STALE = /WHERE offer_id = \$1 AND updated_at = \$2::timestamptz/;

function req(method: string, body: unknown): NextRequest {
  return {
    method,
    headers: { get: () => null },
    nextUrl: { pathname: '/api/admin/placements', searchParams: new URLSearchParams() },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  } as unknown as NextRequest;
}
const json = async (r: Response) => (await r.json()) as { data: Record<string, unknown> | null; error: { code: string } | null };
const audits = () => h.log.filter((l) => l.startsWith('audit:'));

beforeEach(() => {
  vi.clearAllMocks();
  h.log.length = 0;
  h.auditFails = false;
  state = { advertiser: { active: true }, offer: null, updateRows: 1, insertConflict: false, advName: 'Example sponsor', overCap: false };
  vi.mocked(verifyAdminAuth).mockResolvedValue({ uid: UID, authMethod: 'session' });
  h.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('logic_variables')) {
      return { rows: [{ variable_key: 'admin_placement_default_flight_days', variable_value: '30' }, { variable_key: 'admin_placement_max_horizon_days', variable_value: '365' }] };
    }
    if (sql.includes('FROM offers o')) return { rows: [] };
    return { rows: [{ advertiser_id: ADV, name: 'Example sponsor' }] };
  });
  h.clientQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const s = sql.trim();
    if (s.startsWith('UPDATE offers SET advertiser_id') && !(PUT_STALE.test(s) && params[7] === STAMP)) throw new Error('PUT UPDATE without the updated_at predicate or its bound value');
    if (s.startsWith('UPDATE offers SET active') && !(PATCH_STALE.test(s) && params[1] === STAMP)) throw new Error('PATCH UPDATE without the updated_at predicate or its bound value');
    if (s.startsWith('SELECT active FROM advertisers')) { h.log.push('SELECT_ADVERTISER'); return { rows: state.advertiser ? [state.advertiser] : [] }; }
    if (s.includes('FROM offers WHERE offer_id = $1 FOR UPDATE')) { h.log.push('SELECT_FOR_UPDATE'); return { rows: state.offer ? [state.offer] : [] }; }
    if (s.startsWith('UPDATE offers')) { h.log.push('UPDATE'); return { rows: state.updateRows ? [{ updated_at: '2026-11-10 12:01:00.5+00' }] : [] }; }
    if (s.startsWith('INSERT INTO offers')) { h.log.push(s.includes('false)') ? 'INSERT_INACTIVE' : 'INSERT'); return { rows: [{ updated_at: STAMP }] }; }
    if (s === OVER_CAP_QUERY) { h.log.push('CAP'); return { rows: [{ offer_id: OFFER, over_cap: state.overCap }, { offer_id: ADV, over_cap: !state.overCap }] }; }
    if (s.startsWith('INSERT INTO advertisers')) { h.log.push('INSERT_ADVERTISER'); return { rows: state.insertConflict ? [] : [{ advertiser_id: ADV }] }; }
    if (s.startsWith('SELECT name FROM advertisers')) { h.log.push('SELECT_NAME'); return { rows: [{ name: state.advName }] }; }
    throw new Error(`unexpected SQL: ${s.slice(0, 60)}`);
  });
});

describe('auth: 401 and 403 on every write, before any transaction', () => {
  it('401 without an admin on GET, PUT, PATCH and the advertiser PUT', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValue(null);
    for (const r of [await GET(req('GET', undefined)), await putOffer(req('PUT', offer)), await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true })), await putAdvertiser(req('PUT', { advertiser_id: ADV, name: 'x' }))]) {
      expect(r.status).toBe(401);
    }
    expect(h.log.filter((l) => l === 'BEGIN')).toEqual([]);
  });

  it.each(['admin_key', 'dev_bypass'])('403 SESSION_REQUIRED for %s: no transaction, no audit row', async (authMethod) => {
    vi.mocked(verifyAdminAuth).mockResolvedValue({ uid: 'admin-key', authMethod } as never);
    const rs = [await putOffer(req('PUT', offer)), await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true })), await putAdvertiser(req('PUT', { advertiser_id: ADV, name: 'x' }))];
    for (const r of rs) {
      expect(r.status).toBe(403);
      expect((await json(r)).error?.code).toBe('SESSION_REQUIRED');
    }
    expect(h.log.filter((l) => l === 'BEGIN' || l.startsWith('audit:'))).toEqual([]);
  });
});

describe('PUT /api/admin/placements/offers', () => {
  it('create: BEGIN, advertiser, FOR UPDATE, INSERT inactive, audit offer_schedule, COMMIT', async () => {
    const r = await putOffer(req('PUT', offer));
    expect(r.status).toBe(200);
    expect((await json(r)).data).toEqual({ offer_id: OFFER, updated_at: STAMP, created: true, over_cap: false });
    expect(h.log.filter((l) => /^(BEGIN|SELECT|INSERT|UPDATE|audit|COMMIT|ROLLBACK)/.test(l))).toEqual(['BEGIN', 'SELECT_ADVERTISER', 'SELECT_FOR_UPDATE', 'INSERT_INACTIVE', 'audit:offer_schedule', 'COMMIT']);
    const a = vi.mocked(writeAdminAudit).mock.calls[0]?.[0];
    expect(a).toMatchObject({ adminUid: UID, action: 'offer_schedule', targetUid: OFFER, oldValue: null, newValue: { active: false, targeting: {} } });
    expect(a?.reason).toBeTruthy();
  });

  it('edit: UPDATE WHERE updated_at; the audit carries the before and after', async () => {
    state.offer = PRIOR;
    const r = await putOffer(req('PUT', { ...offer, updated_at: STAMP, building_type: 'detached_house', design_option: 'pitched' }));
    expect(r.status).toBe(200);
    expect((await json(r)).data).toMatchObject({ created: false });
    expect(audits()).toEqual(['audit:offer_schedule']);
    expect(vi.mocked(writeAdminAudit).mock.calls[0]?.[0]).toMatchObject({ oldValue: PRIOR, newValue: { targeting: { building_type: 'detached_house', design_option: 'pitched' } } });
  });

  it('409 STALE_OFFER: a stale updated_at, or an existing row without one; ROLLBACK and no audit', async () => {
    state.offer = PRIOR;
    state.updateRows = 0;
    const stale = await putOffer(req('PUT', { ...offer, updated_at: STAMP }));
    expect(stale.status).toBe(409);
    expect((await json(stale)).error?.code).toBe('STALE_OFFER');
    const missing = await putOffer(req('PUT', offer));
    expect(missing.status).toBe(409);
    expect(h.log.filter((l) => l === 'ROLLBACK')).toHaveLength(2);
    expect(audits()).toEqual([]);
  });

  it('404 NOT_FOUND: an updated_at sent for an offer that does not exist', async () => {
    const r = await putOffer(req('PUT', { ...offer, updated_at: STAMP }));
    expect(r.status).toBe(404);
    expect(audits()).toEqual([]);
  });

  it('400 before any transaction: income, user-entered, zone_class and active keys; a disclosure flag; bad JSON', async () => {
    for (const extra of [{ income_band: 'high' }, { lot_size_declared: '400' }, { zone_class: 'rd' }, { active: true }, { disclosure_required: false }]) {
      const r = await putOffer(req('PUT', { ...offer, ...extra }));
      expect(r.status).toBe(400);
      expect((await json(r)).error?.code).toBe('VALIDATION_FAILED');
    }
    expect((await json(await putOffer(req('PUT', undefined)))).error?.code).toBe('INVALID_JSON');
    expect(h.log.filter((l) => l === 'BEGIN')).toEqual([]);
  });

  it('400 with the rule code and a structured warn: targeting a placement does not accept, a scenario_card without its pair', async () => {
    const a = await putOffer(req('PUT', { ...offer, placement_key: 'renovation_section', building_type: 'detached_house' }));
    expect((await json(a)).error?.code).toBe('TARGETING_NOT_ALLOWED');
    const b = await putOffer(req('PUT', { ...offer, placement_key: 'scenario_card', design_option: 'pitched' }));
    expect((await json(b)).error?.code).toBe('SCENARIO_REQUIRED');
    expect(h.log.filter((l) => l.startsWith('logWarn:'))).toEqual(['logWarn:TARGETING_NOT_ALLOWED', 'logWarn:SCENARIO_REQUIRED']);
    expect(h.log.filter((l) => l === 'BEGIN')).toEqual([]);
  });

  it('400 for an unknown or inactive advertiser, inside the transaction, rolled back', async () => {
    state.advertiser = null;
    expect((await json(await putOffer(req('PUT', offer)))).error?.code).toBe('ADVERTISER_UNKNOWN');
    state.advertiser = { active: false };
    expect((await json(await putOffer(req('PUT', offer)))).error?.code).toBe('ADVERTISER_INACTIVE');
    expect(h.log.filter((l) => l === 'ROLLBACK')).toHaveLength(2);
    expect(audits()).toEqual([]);
  });

  it('an audit failure rolls the offer back and fails the request (R-12)', async () => {
    h.auditFails = true;
    const r = await putOffer(req('PUT', offer));
    expect(r.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
  });
});

describe('OUTPUT panel folds (code reviewer LOW 1, 2; security L1; operator 2026-11-10 answer 1)', () => {
  it('a PUT edit of an ACTIVE offer returns over_cap (and warns); an inactive offer never runs the cap query', async () => {
    state.offer = { ...PRIOR, active: true };
    state.overCap = true;
    const r = await putOffer(req('PUT', { ...offer, updated_at: STAMP }));
    expect((await json(r)).data).toMatchObject({ created: false, over_cap: true });
    expect(h.log).toContain('logWarn:over_cap');
    h.log.length = 0;
    state.offer = PRIOR;
    expect((await json(await putOffer(req('PUT', { ...offer, updated_at: STAMP })))).data).toMatchObject({ over_cap: false });
    expect(h.log).not.toContain('CAP');
  });

  it('PATCH activate refuses an inactive advertiser (as PUT does); deactivate does not check it', async () => {
    state.offer = PRIOR;
    state.advertiser = { active: false };
    const r = await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true }));
    expect(r.status).toBe(400);
    expect((await json(r)).error?.code).toBe('ADVERTISER_INACTIVE');
    expect(audits()).toEqual([]);
    state.offer = { ...PRIOR, active: true };
    expect((await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: false }))).status).toBe(200);
  });

  it('a whitespace-only creative_text is 400 VALIDATION_FAILED before any transaction (never a 500); the saved text is trimmed', async () => {
    const r = await putOffer(req('PUT', { ...offer, creative_text: '   ' }));
    expect(r.status).toBe(400);
    expect((await json(r)).error?.code).toBe('VALIDATION_FAILED');
    expect(h.log.filter((l) => l === 'BEGIN')).toEqual([]);
    await putOffer(req('PUT', { ...offer, creative_text: '  Example sponsor offer  ' }));
    const insert = h.clientQuery.mock.calls.find((c) => String(c[0]).trim().startsWith('INSERT INTO offers'));
    expect(insert?.[1]?.[6]).toBe('Example sponsor offer');
  });

  it('an open-ended offer (no flight_end) is accepted; an end beyond the horizon is refused', async () => {
    expect((await putOffer(req('PUT', { ...offer, flight_start: '2026-12-01' }))).status).toBe(200);
    const far = await putOffer(req('PUT', { ...offer, flight_end: '2099-01-01' }));
    expect((await json(far)).error?.code).toBe('FLIGHT_BEYOND_HORIZON');
  });
});

describe('PATCH /api/admin/placements/offers (the list-row toggle)', () => {
  it('activate: audit offer_activate; over_cap is returned and warned', async () => {
    state.offer = PRIOR;
    state.overCap = true;
    const r = await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true }));
    expect(r.status).toBe(200);
    expect((await json(r)).data).toMatchObject({ active: true, over_cap: true });
    expect(audits()).toEqual(['audit:offer_activate']);
    expect(h.log).toContain('logWarn:over_cap');
  });

  it('deactivate: audit offer_deactivate, never over_cap', async () => {
    state.offer = { ...PRIOR, active: true };
    state.overCap = true;
    const r = await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: false }));
    expect((await json(r)).data).toMatchObject({ active: false, over_cap: false });
    expect(audits()).toEqual(['audit:offer_deactivate']);
  });

  it('404 for a missing offer, 409 for a stale updated_at, neither audited', async () => {
    expect((await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true }))).status).toBe(404);
    state.offer = PRIOR;
    state.updateRows = 0;
    expect((await patchOffer(req('PATCH', { offer_id: OFFER, updated_at: STAMP, active: true }))).status).toBe(409);
    expect(audits()).toEqual([]);
  });
});

describe('PUT /api/admin/placements/advertisers', () => {
  it('create: one audit row advertiser_upsert, active true, no contact field', async () => {
    const r = await putAdvertiser(req('PUT', { advertiser_id: ADV, name: ' Example sponsor ' }));
    expect((await json(r)).data).toEqual({ advertiser_id: ADV, created: true });
    expect(vi.mocked(writeAdminAudit).mock.calls[0]?.[0]).toMatchObject({ action: 'advertiser_upsert', targetUid: ADV, newValue: { name: 'Example sponsor', active: true } });
  });

  it('a double submit is a no-op (no audit); another name for the same id is 409', async () => {
    state.insertConflict = true;
    expect((await json(await putAdvertiser(req('PUT', { advertiser_id: ADV, name: 'Example sponsor' })))).data).toEqual({ advertiser_id: ADV, created: false });
    state.advName = 'Someone else';
    expect((await putAdvertiser(req('PUT', { advertiser_id: ADV, name: 'Example sponsor' }))).status).toBe(409);
    expect(audits()).toEqual([]);
  });

  it('an active flag or a blank name is refused', async () => {
    expect((await putAdvertiser(req('PUT', { advertiser_id: ADV, name: 'x', active: false }))).status).toBe(400);
    expect((await putAdvertiser(req('PUT', { advertiser_id: ADV, name: '   ' }))).status).toBe(400);
  });
});

describe('GET /api/admin/placements', () => {
  it('returns the read shape with private, no-store', async () => {
    const r = await GET(req('GET', undefined));
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const d = (await json(r)).data as { offers: unknown[]; advertisers: unknown[]; defaults: { flight_start: string; flight_end: string } };
    expect(d.offers).toEqual([]);
    expect(d.advertisers).toEqual([{ advertiser_id: ADV, name: 'Example sponsor' }]);
    expect(d.defaults.flight_end > d.defaults.flight_start).toBe(true);
  });
});
