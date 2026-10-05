// SPEC LINK: docs/specs/01-pipeline/50_source_permits.md
// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (writers persist attachment_basis, 9-col INSERT)
//
// WF3 2026-10-04 (sync-permit-trades): `runSync()` (behind /api/sync and
// /api/admin/sync) inserted `permit_trades (… trade_slug, trade_name …)`. Neither
// column has ever existed (migration 006 creates trade_id only), so every New or
// Changed permit that classified >= 1 trade threw 42703, rolled back its own
// permit write, and was counted in records_errors. No test caught it because the
// client was never exercised against the real schema. This file drives runSync
// through a FAKE client that is backed by the committed information_schema
// snapshot (`docs/reports/witness/_catalog.json`) via the ONE witness resolver:
// a permit_trades INSERT naming a column the table does not have is rejected
// with 42703, exactly as Postgres would.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/db/client', () => ({ query: vi.fn(), getClient: vi.fn() }));
vi.mock('@/lib/sync/ingest', () => ({ parsePermitsStream: vi.fn() }));
vi.mock('@/lib/classification/classifier', () => ({ classifyPermit: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { query, getClient } from '@/lib/db/client';
import { parsePermitsStream } from '@/lib/sync/ingest';
import { classifyPermit } from '@/lib/classification/classifier';
import { logError } from '@/lib/logger';
import { runSync } from '@/lib/sync/process';

type Resolver = {
  init: () => Promise<void>;
  resolveStatement: (
    sql: string,
    catalog: Record<string, string[]>,
  ) => { writes: Record<string, string[]>; error: string | null };
};

let R: Resolver;
let catalog: Record<string, string[]>;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  R = require(path.join(process.cwd(), 'scripts/lib/sql-witness/resolve.cjs')) as Resolver;
  await R.init();
  const raw = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'docs/reports/witness/_catalog.json'), 'utf8'),
  ) as { tables: Record<string, string[]> };
  catalog = raw.tables;
});

/** Columns a statement writes to a catalogued table that the catalog does not list. */
function missingWriteColumns(sql: string): string[] {
  const r = R.resolveStatement(sql, catalog);
  expect(r.error).toBeNull();
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(r.writes)) {
    const known = catalog[table];
    if (!known) continue;
    for (const col of cols) if (!known.includes(col)) missing.push(`${table}.${col}`);
  }
  return missing;
}

type Call = { sql: string; params: unknown[] };
let clientCalls: Call[];
let failPermitTradesInsert: boolean;
let existingPermit: Record<string, unknown> | null;

const mockedQuery = vi.mocked(query);
const mockedGetClient = vi.mocked(getClient);
const mockedStream = vi.mocked(parsePermitsStream);
const mockedClassify = vi.mocked(classifyPermit);
const mockedLogError = vi.mocked(logError);

function ckanRecord(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    PERMIT_NUM: '24 100001 BLD',
    REVISION_NUM: '00',
    PERMIT_TYPE: 'Building (Sfd, Sdd, Row)',
    STRUCTURE_TYPE: 'House (Sfd, Sdd, Row, Mobile)',
    WORK: 'Addition',
    STREET_NUM: '123',
    STREET_NAME: 'Test',
    STREET_TYPE: 'St',
    STREET_DIRECTION: '',
    CITY: 'TORONTO',
    POSTAL: 'M5V1A1',
    GEO_ID: '1',
    BUILDING_TYPE: 'House',
    CATEGORY: 'Building',
    APPLICATION_DATE: '2024-01-01',
    ISSUED_DATE: '',
    COMPLETED_DATE: '',
    STATUS: 'Permit Issued',
    DESCRIPTION: 'sync permit_trades fixture',
    EST_CONST_COST: '10000',
    BUILDER_NAME: '',
    OWNER: '',
    DWELLING_UNITS_CREATED: '0',
    DWELLING_UNITS_LOST: '0',
    WARD: '01',
    COUNCIL_DISTRICT: '',
    CURRENT_USE: '',
    PROPOSED_USE: '',
    HOUSING_UNITS: '0',
    STOREYS: '1',
    ...overrides,
  };
}

function match(overrides: Record<string, unknown> = {}) {
  return {
    permit_num: '24 100001 BLD',
    revision_num: '00',
    trade_id: 5,
    trade_slug: 'framing',
    trade_name: 'Framing',
    tier: 2,
    confidence: 0.8,
    is_active: true,
    phase: 'structural',
    lead_score: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientCalls = [];
  failPermitTradesInsert = false;
  existingPermit = null;

  mockedQuery.mockImplementation((async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO sync_runs')) {
      return [{ id: 7, started_at: new Date().toISOString(), status: 'running' }];
    }
    if (sql.includes('FROM trade_mapping_rules')) return [];
    if (sql.includes('FROM trades WHERE id = 33')) return [{ id: 33, slug: 'realtor' }];
    if (sql.includes('FROM permit_type_classifications')) return [];
    if (sql.includes('SELECT * FROM permits')) return existingPermit ? [existingPermit] : [];
    if (sql.includes('UPDATE sync_runs')) {
      const p = params ?? [];
      const failed = sql.includes("status = 'failed'");
      return [{
        id: 7,
        status: failed ? 'failed' : 'completed',
        records_new: p[1],
        records_updated: p[2],
        records_unchanged: p[3],
        records_errors: p[4],
        error_message: failed ? p[5] : null,
      }];
    }
    return [];
  }) as unknown as typeof query);

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      clientCalls.push({ sql, params });
      if (sql.includes('INSERT INTO permit_trades')) {
        if (failPermitTradesInsert) throw new Error('simulated permit_trades failure');
        const missing = missingWriteColumns(sql);
        if (missing.length > 0) {
          const col = missing[0]!.split('.')[1];
          throw Object.assign(
            new Error(`column "${col}" of relation "permit_trades" does not exist`),
            { code: '42703' },
          );
        }
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  mockedGetClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof getClient>>);

  mockedStream.mockImplementation((async (_f: string, cb: (b: unknown[]) => Promise<void>) => {
    await cb([ckanRecord()]);
    return 1;
  }) as unknown as typeof parsePermitsStream);
});

function permitTradesInserts(): Call[] {
  return clientCalls.filter((c) => c.sql.includes('INSERT INTO permit_trades'));
}

describe('runSync — permit_trades writes match the real schema (Spec 80 §5.C)', () => {
  it('New permit: inserts every classified trade and the permit commits (no 42703)', async () => {
    mockedClassify.mockReturnValue([
      match(),
      match({ trade_id: 9, trade_slug: 'hvac', trade_name: 'HVAC', attachment_basis: 'inference', confidence: 0.5 }),
    ] as unknown as ReturnType<typeof classifyPermit>);

    const run = await runSync('fixture.json');

    expect(run.status).toBe('completed');
    expect(run.records_errors).toBe(0);
    expect(run.records_new).toBe(1);
    const inserts = permitTradesInserts();
    expect(inserts).toHaveLength(2);
    for (const ins of inserts) expect(missingWriteColumns(ins.sql)).toEqual([]);
    expect(clientCalls.map((c) => c.sql)).toContain('COMMIT');
    expect(clientCalls.map((c) => c.sql)).not.toContain('ROLLBACK');
  });

  it('New permit: writes the 9 pipeline columns with attachment_basis derived like classify-permits.js', async () => {
    mockedClassify.mockReturnValue([
      match(),
      match({ trade_id: 9, attachment_basis: 'inference', confidence: 0.5 }),
      match({ trade_id: 11, is_active: false }),
    ] as unknown as ReturnType<typeof classifyPermit>);

    await runSync('fixture.json');

    const inserts = permitTradesInserts();
    expect(inserts).toHaveLength(3);
    expect(inserts[0]!.sql).toMatch(
      /\(\s*permit_num,\s*revision_num,\s*trade_id,\s*tier,\s*confidence,\s*is_active,\s*phase,\s*lead_score,\s*attachment_basis\s*\)/,
    );
    expect(inserts[0]!.params).toEqual(['24 100001 BLD', '00', 5, 2, 0.8, true, 'structural', 0, 'evidence']);
    expect(inserts[1]!.params[8]).toBe('inference');
    expect(inserts[2]!.params[8]).toBe('inference');
  });

  it('Changed permit: DELETEs then re-inserts with the real columns and the update commits', async () => {
    existingPermit = { permit_num: '24 100001 BLD', revision_num: '00', data_hash: 'STALE_HASH', status: 'Permit Issued' };
    mockedClassify.mockReturnValue([match()] as unknown as ReturnType<typeof classifyPermit>);

    const run = await runSync('fixture.json');

    expect(run.records_errors).toBe(0);
    expect(run.records_updated).toBe(1);
    const sqls = clientCalls.map((c) => c.sql);
    const del = sqls.findIndex((s) => s.startsWith('DELETE FROM permit_trades'));
    const ins = sqls.findIndex((s) => s.includes('INSERT INTO permit_trades'));
    expect(del).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del);
    expect(missingWriteColumns(sqls[ins]!)).toEqual([]);
    expect(clientCalls[ins]!.params).toHaveLength(9);
    expect(sqls).toContain('COMMIT');
  });

  it('unhappy path: a failing permit_trades INSERT rolls the permit back, counts an error, and logs it', async () => {
    failPermitTradesInsert = true;
    mockedClassify.mockReturnValue([match()] as unknown as ReturnType<typeof classifyPermit>);

    const run = await runSync('fixture.json');

    expect(run.status).toBe('completed');
    expect(run.records_errors).toBe(1);
    expect(run.records_new).toBe(0);
    expect(clientCalls.map((c) => c.sql)).toContain('ROLLBACK');
    expect(mockedLogError).toHaveBeenCalledWith(
      '[sync]',
      expect.any(Error),
      expect.objectContaining({ event: 'permit_processing_error' }),
    );
  });

  it('control: the catalog-backed client rejects a column permit_trades does not have', () => {
    expect(missingWriteColumns('INSERT INTO permit_trades (permit_num, trade_slug) VALUES ($1, $2)')).toEqual([
      'permit_trades.trade_slug',
    ]);
  });
});
