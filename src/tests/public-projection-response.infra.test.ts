// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §4.3 ("Never SELECT * —
//               always project specific columns") + §4.4 (envelope)
//             docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 + §5
//
// RESPONSE-level projection locks (Code Reviewer fold F3). The scans in
// `api.infra.test.ts` read the route SOURCE — they prove no `SELECT *` survives
// and that the allow-list module is the column source. They cannot prove what a
// caller actually RECEIVES: an alias, a spread, a JOIN-added column or a later
// `{ ...row, extra }` could reintroduce a key without any `SELECT *` appearing.
//
// These four invoke the real exported GET handlers against a stubbed pool and
// assert the response KEY SET equals the declared allow-list — one per public
// route class (permit detail / permit list / entity detail / coa list).
//
// HOW THE STUB IS FAITHFUL: `projectingQuery` PARSES the SELECT list the route
// actually sends and returns only those columns from a wide fixture row,
// honouring `alias.col` and `expr AS name`. That is what Postgres does, so the
// assertion genuinely exercises the route's own projection. The inverse arm
// swaps in `leakyQuery`, which ignores the SELECT list and hands back the whole
// row — the shape a `SELECT *` regression would produce — and shows the same
// assertions go red.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ query: h.query, pool: { query: h.query } }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import {
  PARCEL_PUBLIC_COLS,
  PERMIT_DETAIL_COLS,
  PERMIT_LIST_COLS,
  PERMIT_HISTORY_COLS,
  ENTITY_PUBLIC_COLS,
  ENTITY_CONTACT_PUBLIC_COLS,
  COA_PUBLIC_COLS,
} from '@/lib/api/public-projections';
import { GET as PERMIT_DETAIL_GET } from '@/app/api/permits/[id]/route';
import { GET as PERMIT_LIST_GET } from '@/app/api/permits/route';
import { GET as BUILDER_DETAIL_GET } from '@/app/api/builders/[id]/route';
import { GET as COA_LIST_GET } from '@/app/api/coa/route';

// ---------------------------------------------------------------------------
// Wide fixtures — every allow-listed column PLUS the columns whose disclosure
// is the whole point of this WF3. Widths are indicative, not a schema dump:
// the assertions are set EQUALITY, so ANY unlisted key fails regardless of how
// many filler columns the fixture carries.
// ---------------------------------------------------------------------------

/** The `parcels` columns that must NEVER reach an unauthenticated caller. */
const PARCEL_FORBIDDEN = [
  'parcel_cost_menu',
  'cost_fb_total', 'cost_coa_total', 'cost_solar_total', 'cost_garden_suite_total',
  'cost_laneway_suite_total', 'cost_garage_total', 'cost_gut_total', 'cost_addition_total',
  'cost_kitchen_per_sqm', 'cost_bath_per_sqm', 'cost_basement_per_sqm',
  'cost_basement_underpin_per_sqm',
  'geometry', 'geom',
  'zoning_class', 'bylaw_max_fsi', 'bylaw_max_coverage_pct',
  'existing_gfa_sqm', 'opt_config_json', 'max_build_gfa_sqm',
  'comparable_builds', 'neighbourhood_cost_premium', 'groups',
];

const PERMIT_FORBIDDEN = ['raw_json', 'owner', 'data_hash', 'location', 'matched_status', 'lead_id'];
const ENTITY_FORBIDDEN = ['primary_phone', 'primary_email', 'linkedin_url', 'photo_url', 'photo_validated_at'];
const COA_FORBIDDEN = ['lifecycle_phase', 'lifecycle_seq', 'scope_tags', 'estimated_cost', 'bid_value', 'latitude', 'longitude', 'data_hash', 'lead_id'];

function wideRow(allow: readonly string[], forbidden: string[], fillerTo: number): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const c of allow) row[c] = 1;
  for (const c of forbidden) row[c] = 'SENSITIVE';
  let i = 0;
  while (Object.keys(row).length < fillerTo) row[`filler_col_${i++}`] = 'filler';
  return row;
}

const PARCEL_ROW = { ...wideRow(PARCEL_PUBLIC_COLS, PARCEL_FORBIDDEN, 158), id: 7, lot_size_sqft: 2000 };
const PERMIT_ROW = { ...wideRow(PERMIT_DETAIL_COLS, PERMIT_FORBIDDEN, 171), permit_num: '20-1', revision_num: '00', neighbourhood_id: 0, scope_tags: ['x'], project_type: 'alteration', storeys: 2 };
const ENTITY_ROW = wideRow(ENTITY_PUBLIC_COLS, ENTITY_FORBIDDEN, 19);
const CONTACT_ROW = wideRow(ENTITY_CONTACT_PUBLIC_COLS, ['entity_id', 'contributed_by', 'created_at'], 8);
const COA_ROW = wideRow(COA_PUBLIC_COLS, COA_FORBIDDEN, 146);
const HISTORY_ROW = wideRow(PERMIT_HISTORY_COLS, ['id', 'permit_num', 'revision_num', 'source'], 8);
const PERMIT_PARCEL_ROW = { match_type: 'exact_address', confidence: 0.99, parcel_id: 7, permit_num: '20-1' };

/** Which fixture answers a given query, chosen by its FROM clause. */
const SOURCES: Array<{ match: RegExp; row: Record<string, unknown> }> = [
  { match: /FROM permit_parcels/i, row: { ...PARCEL_ROW, ...PERMIT_PARCEL_ROW } },
  { match: /FROM permit_history/i, row: HISTORY_ROW },
  { match: /FROM entity_contacts/i, row: CONTACT_ROW },
  { match: /FROM entities/i, row: ENTITY_ROW },
  { match: /FROM coa_applications/i, row: COA_ROW },
  { match: /FROM permits/i, row: PERMIT_ROW },
];

/** Split a SELECT list on top-level commas (parens/quotes aware). */
function splitSelectList(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** `pa.lot_size_sqft` → {src:'lot_size_sqft', key:'lot_size_sqft'}; `pp.confidence AS link_confidence` → {src:'confidence', key:'link_confidence'}. */
function parseSelectItem(raw: string): { src: string; key: string } | null {
  const item = raw.trim().replace(/\s+/g, ' ');
  if (!item) return null;
  const aliased = /^(.*?)\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)$/i.exec(item);
  const expr = (aliased ? aliased[1]! : item).trim();
  const bare = expr.replace(/^[A-Za-z_][A-Za-z0-9_]*\./, '');
  const key = aliased ? aliased[2]! : bare;
  return { src: bare, key };
}

/** A pool stub that PROJECTS exactly like Postgres would. */
function projectingQuery(sql: string): Record<string, unknown>[] {
  const m = /SELECT\s+([\s\S]*?)\s+FROM\s/i.exec(sql);
  const source = SOURCES.find((s) => s.match.test(sql))?.row ?? {};
  if (!m) return [];
  const items = splitSelectList(m[1]!).map(parseSelectItem).filter(Boolean) as Array<{ src: string; key: string }>;
  // Aggregate/count queries the routes use for pagination. Matched on the
  // CALL shape `COUNT(` — a bare /COUNT/ also matches the legitimate column
  // `entities.permit_count`, which made the entity assertions return a count
  // row instead of an entity (caught while writing this file).
  if (/COUNT\s*\(/i.test(m[1]!)) {
    return [{ count: '1', total: '1' }];
  }
  const row: Record<string, unknown> = {};
  for (const { src, key } of items) row[key] = source[src] ?? null;
  return [row];
}

/** The regression shape: ignores the SELECT list and returns the whole row. */
function leakyQuery(sql: string): Record<string, unknown>[] {
  if (/COUNT\s*\(/i.test(sql)) return [{ count: '1', total: '1' }];
  return [SOURCES.find((s) => s.match.test(sql))?.row ?? {}];
}

function req(url: string): NextRequest {
  const u = new URL(url);
  return {
    method: 'GET',
    url,
    nextUrl: { pathname: u.pathname, searchParams: u.searchParams },
    headers: { get: () => null },
  } as unknown as NextRequest;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockImplementation(async (sql: string) => projectingQuery(sql));
});

describe('GET /api/permits/[id] — response key sets equal the declared allow-lists', () => {
  it('parcel is EXACTLY the 11 declared keys, with no cost/menu/geometry column', async () => {
    const res = await PERMIT_DETAIL_GET(req('https://x.test/api/permits/20-1--00'), ctx('20-1--00'));
    expect(res.status).toBe(200);
    const body = await res.json();

    // 9 allow-listed parcel columns + the 2 the permit_parcels JOIN supplies.
    const expected = [...PARCEL_PUBLIC_COLS, 'match_type', 'link_confidence'].sort();
    expect(Object.keys(body.parcel).sort()).toEqual(expected);
    expect(expected).toHaveLength(11);

    // Spec 100 §5 — the paid payload and the raw geometry, named explicitly.
    for (const leaked of PARCEL_FORBIDDEN) expect(body.parcel).not.toHaveProperty(leaked);
    expect(Object.keys(body.parcel).some((k) => /^cost_|^geom/.test(k))).toBe(false);
  });

  it('permit, builder and history are exactly their allow-lists', async () => {
    const res = await PERMIT_DETAIL_GET(req('https://x.test/api/permits/20-1--00'), ctx('20-1--00'));
    const body = await res.json();
    expect(Object.keys(body.permit).sort()).toEqual([...PERMIT_DETAIL_COLS].sort());
    expect(Object.keys(body.builder).sort()).toEqual([...ENTITY_PUBLIC_COLS].sort());
    expect(Object.keys(body.history[0]).sort()).toEqual([...PERMIT_HISTORY_COLS].sort());
    for (const leaked of [...PERMIT_FORBIDDEN, ...ENTITY_FORBIDDEN]) {
      expect(body.permit).not.toHaveProperty(leaked);
      expect(body.builder).not.toHaveProperty(leaked);
    }
  });

  it('INVERSE ARM — a leaking pool makes these assertions RED', async () => {
    h.query.mockImplementation(async (sql: string) => leakyQuery(sql));
    const res = await PERMIT_DETAIL_GET(req('https://x.test/api/permits/20-1--00'), ctx('20-1--00'));
    const body = await res.json();
    // The exact keys this WF3 exists to remove come back…
    expect(body.parcel).toHaveProperty('parcel_cost_menu');
    expect(body.parcel).toHaveProperty('geometry');
    expect(body.permit).toHaveProperty('raw_json');
    // …and the equality assertion above would therefore fail.
    expect(Object.keys(body.parcel).sort()).not.toEqual(
      [...PARCEL_PUBLIC_COLS, 'match_type', 'link_confidence'].sort(),
    );
  });
});

describe('GET /api/permits — list elements equal PERMIT_LIST_COLS (+ trades)', () => {
  it('each element is the allow-list plus the already-explicit trades pick', async () => {
    const res = await PERMIT_LIST_GET(req('https://x.test/api/permits?page=1&limit=20'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.data[0]).sort()).toEqual([...PERMIT_LIST_COLS, 'trades'].sort());
    for (const leaked of PERMIT_FORBIDDEN) expect(body.data[0]).not.toHaveProperty(leaked);
    expect(body.pagination).toHaveProperty('total_pages'); // envelope unchanged
  });

  it('INVERSE ARM — a leaking pool returns raw_json on the feed', async () => {
    h.query.mockImplementation(async (sql: string) => leakyQuery(sql));
    const body = await (await PERMIT_LIST_GET(req('https://x.test/api/permits'))).json();
    expect(body.data[0]).toHaveProperty('raw_json');
  });
});

describe('GET /api/builders/[id] — entity + contacts equal their allow-lists', () => {
  it('builder drops the contact PII and contacts drop contributed_by/entity_id/created_at', async () => {
    const res = await BUILDER_DETAIL_GET(req('https://x.test/api/builders/7'), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.builder).sort()).toEqual([...ENTITY_PUBLIC_COLS].sort());
    expect(Object.keys(body.contacts[0]).sort()).toEqual([...ENTITY_CONTACT_PUBLIC_COLS].sort());
    for (const leaked of ENTITY_FORBIDDEN) expect(body.builder).not.toHaveProperty(leaked);
    for (const leaked of ['entity_id', 'contributed_by', 'created_at']) {
      expect(body.contacts[0]).not.toHaveProperty(leaked);
    }
  });

  it('INVERSE ARM — a leaking pool returns primary_phone / primary_email', async () => {
    h.query.mockImplementation(async (sql: string) => leakyQuery(sql));
    const body = await (await BUILDER_DETAIL_GET(req('https://x.test/api/builders/7'), ctx('7'))).json();
    expect(body.builder).toHaveProperty('primary_phone');
    expect(body.builder).toHaveProperty('primary_email');
  });
});

describe('GET /api/coa — applications equal COA_PUBLIC_COLS', () => {
  it('the 146-column table is served as the 17 declared columns', async () => {
    const res = await COA_LIST_GET(req('https://x.test/api/coa?limit=20'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.applications[0]).sort()).toEqual([...COA_PUBLIC_COLS].sort());
    for (const leaked of COA_FORBIDDEN) expect(body.applications[0]).not.toHaveProperty(leaked);
    expect(body.pagination).toHaveProperty('total_pages'); // envelope unchanged
  });

  it('INVERSE ARM — a leaking pool returns the lifecycle/cost internals', async () => {
    h.query.mockImplementation(async (sql: string) => leakyQuery(sql));
    const body = await (await COA_LIST_GET(req('https://x.test/api/coa'))).json();
    expect(body.applications[0]).toHaveProperty('lifecycle_phase');
    expect(body.applications[0]).toHaveProperty('estimated_cost');
  });
});
