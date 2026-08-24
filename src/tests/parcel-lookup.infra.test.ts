// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API) + Known Failure Modes
//
// Always-run infra locks for the lookup route (source-shape regex + Zod request behaviors — the
// step-output-query.infra pattern; live-row cases live in src/tests/db/parcel-lookup.db.test.ts):
//  - verifyAdminAuth FIRST + withApiEnvelope (the mirror contract)
//  - parameterized SQL only; no SELECT *; typeahead on the NORMALIZED columns (never address_full)
//  - the PRODUCTION-CORRECT address_status filter (='CURRENT' alone matches 0 live rows)
//  - request Zod: exactly one of q|parcelId; min length; 400 shapes
//  - records the read-only mandate (no INSERT/UPDATE/DELETE anywhere in the lib)

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ParcelLookupQuerySchema } from '@/app/api/admin/parcels/lookup/types';
import { allMappedColumns, EXCLUDED_COLS } from '@/lib/admin/parcel-lookup';
import parcelsColumnsSnapshot from './fixtures/parcels-columns.snapshot.json';

const ROUTE = path.resolve(__dirname, '../app/api/admin/parcels/lookup/route.ts');
const LIB = path.resolve(__dirname, '../lib/admin/parcel-lookup.ts');
const route = () => fs.readFileSync(ROUTE, 'utf8');
const lib = () => fs.readFileSync(LIB, 'utf8');

describe('route source-shape locks (Spec 33 §5 + the mirror contract)', () => {
  it('verifyAdminAuth is the first await in the handler', () => {
    const src = route();
    const handlerIdx = src.indexOf('withApiEnvelope(async function GET');
    const authIdx = src.indexOf('await verifyAdminAuth(request)');
    expect(handlerIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(handlerIdx);
    // No OTHER await occurs between the handler open and the auth call.
    const firstOtherAwait = src.slice(handlerIdx).search(/await\s+(?!verifyAdminAuth)/);
    expect(firstOtherAwait === -1 || handlerIdx + firstOtherAwait > authIdx).toBe(true);
  });
  it('wrapped in withApiEnvelope + uses the envelope helpers', () => {
    expect(route()).toContain("from '@/lib/api/with-api-envelope'");
    expect(route()).toContain('badRequestZod');
    expect(route()).toContain('internalError');
  });
  it('slow-query telemetry: duration_ms in logInfo + WARN branch (Spec 33 §12/§13.3)', () => {
    expect(route()).toContain('duration_ms');
    expect(route()).toMatch(/slow_query/);
  });
});

describe('lib SQL locks (Spec 89 Known Failure Modes)', () => {
  it('parameterized only — no template-interpolated user input in WHERE values', () => {
    // Every WHERE comparison binds $n params; the only ${} in SQL are the static column lists.
    expect(lib()).toMatch(/addr_num_normalized = \$1/);
    expect(lib()).toMatch(/parcel_id = \$1/);
    expect(lib()).toMatch(/neighbourhood_id = \$1/);
  });
  it('no star-select anywhere (explicit projection)', () => {
    expect(lib()).not.toMatch(/SELECT\s+\*\s+FROM/i);
    expect(route()).not.toMatch(/SELECT\s+\*\s+FROM/i);
  });
  it('typeahead filters the NORMALIZED columns, never address_full (unindexed)', () => {
    expect(lib()).toMatch(/linear_name_normalized LIKE \$1/);
    expect(lib()).not.toMatch(/address_full\s+I?LIKE/i);
  });
  it('the PRODUCTION-CORRECT address_status filter (NULL/CURRENT/NONE — the WF3 hotfix parity)', () => {
    expect(lib()).toMatch(/address_status IS NULL OR UPPER\(ap\.address_status\) IN \('CURRENT', 'NONE'\)/);
    expect(lib()).toMatch(/UPPER\(ap\.maint_stage\) = 'REGULAR'/);
  });
  it('CoA ORDER BY includes application_number ASC tiebreaker', () => {
    expect(lib()).toMatch(/application_number ASC/);
  });
  it('READ-ONLY: the lib contains no INSERT/UPDATE/DELETE', () => {
    expect(lib()).not.toMatch(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/);
  });
  it('geometry blobs are not in the projection source lists', () => {
    expect(lib()).toMatch(/EXCLUDED_COLS = \['geometry', 'geom'\]/);
  });
});

describe('schema-drift guard — ALWAYS-RUN via the committed column snapshot (Spec 89 §4/§6)', () => {
  // The "ALL fields" mandate, enforced at pre-commit: the §4 mapping ∪ exclusions must equal the
  // committed snapshot of information_schema.columns for parcels. A migration adding a column must
  // update BOTH the snapshot (regenerate from the live DB) AND the mapping — visible at commit time,
  // not first in CI. The db test (parcel-lookup.db.test.ts) validates the SNAPSHOT against the live
  // DB, closing the loop (a stale snapshot fails there).
  // 159 cols as of migration 240 (Phase B B2) adding parcels.massing_enriched_at.
  it('mapping ∪ exclusions == the committed parcels column snapshot (159 cols)', () => {
    const mapped = [...allMappedColumns(), ...EXCLUDED_COLS].sort();
    const snapshot = [...(parcelsColumnsSnapshot as string[])].sort();
    expect(mapped).toEqual(snapshot);
  });
});

describe('request Zod behaviors (400 shapes)', () => {
  it('accepts q alone / parcelId alone', () => {
    expect(ParcelLookupQuerySchema.safeParse({ q: '26 Hurlingham Cres' }).success).toBe(true);
    expect(ParcelLookupQuerySchema.safeParse({ parcelId: '5147875' }).success).toBe(true);
  });
  it('rejects neither / both / too-short q / oversized q', () => {
    expect(ParcelLookupQuerySchema.safeParse({}).success).toBe(false);
    expect(ParcelLookupQuerySchema.safeParse({ q: '26 X', parcelId: '1' }).success).toBe(false);
    expect(ParcelLookupQuerySchema.safeParse({ q: 'ab' }).success).toBe(false);
    expect(ParcelLookupQuerySchema.safeParse({ q: 'x'.repeat(200) }).success).toBe(false);
  });
});
