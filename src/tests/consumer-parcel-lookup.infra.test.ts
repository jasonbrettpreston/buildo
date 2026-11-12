// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 + §3.2 (whitelist) + §6
//
// Always-run infra locks for the CONSUMER parcel lookup route/lib:
//  - getCurrentUserContext FIRST await + server-side subscription 403 gate
//  - withApiEnvelope + envelope helpers; the two rate buckets (search 60 / lookup 30)
//  - THE WHITELIST TEST — the assembler never leaks a Tier-3 diagnostic column or `groups`,
//    areas keys ⊆ CONSUMER_HEADLINE_COLS, comparable-build keys are the explicit pick, and the
//    .strict() response schema rejects a `groups` leak
//  - log hygiene: the raw search `q` is NEVER logged (Spec 100 §2.8)
//  - request Zod: exactly one of q|parcelId; min length; 400 shapes

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConsumerParcelLookupQuerySchema, ConsumerParcelLookupResponseSchema } from '@/app/api/parcels/lookup/types';
import { assembleConsumerPayload, assembleLotMap, CONSUMER_HEADLINE_COLS, FIT_MIN_SPAN_DEG, fitOf } from '@/lib/parcels/consumer-lookup';
import { CONSUMER_MAP_COLS } from '@/lib/parcels/lot-map';
import { T3_GROUPS } from '@/lib/admin/parcel-lookup';

const ROUTE = path.resolve(__dirname, '../app/api/parcels/lookup/route.ts');
const LIB = path.resolve(__dirname, '../lib/parcels/consumer-lookup.ts');
const route = () => fs.readFileSync(ROUTE, 'utf8');
const lib = () => fs.readFileSync(LIB, 'utf8');

describe('route source-shape locks (Spec 100 §3)', () => {
  it('getCurrentUserContext is the first await in the handler', () => {
    const src = route();
    const handlerIdx = src.indexOf('withApiEnvelope(async function GET');
    const authIdx = src.indexOf('await getCurrentUserContext(request, pool)');
    expect(handlerIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(handlerIdx);
    const firstOtherAwait = src.slice(handlerIdx).search(/await\s+(?!getCurrentUserContext)/);
    expect(firstOtherAwait === -1 || handlerIdx + firstOtherAwait > authIdx).toBe(true);
  });
  it('server-side subscription gate — 403 branch present before DB work (Spec 100 §5)', () => {
    const src = route();
    expect(src).toContain('forbiddenSubscription');
    expect(src).toContain('ACTIVE_SUBSCRIPTION_STATUSES');
    // The gate fires before resolveAddress / fetchParcelById (no DB touch for a lapsed account).
    expect(src.indexOf('forbiddenSubscription')).toBeLessThan(src.indexOf('resolveAddress'));
  });
  it('wrapped in withApiEnvelope + uses the envelope helpers', () => {
    const src = route();
    expect(src).toContain("from '@/lib/api/with-api-envelope'");
    expect(src).toContain('badRequestZod');
    expect(src).toContain('internalError');
    expect(src).toContain('rateLimited');
    expect(src).toContain('unauthorized');
  });
  it('the two rate buckets: search 60/min (q) + lookup 30/min (parcelId)', () => {
    const src = route();
    expect(src).toMatch(/SEARCH_LIMIT_PER_MIN\s*=\s*60/);
    expect(src).toMatch(/LOOKUP_LIMIT_PER_MIN\s*=\s*30/);
    expect(src).toContain('parcels-search:${ctx.uid}');
    expect(src).toContain('parcels-lookup:${ctx.uid}');
  });
  it('unknown parcelId is a 200 miss, never a 404 (Spec 100 §2.6)', () => {
    // The route reserves 404 for nothing — it maps a dangling id to match:null.
    expect(route()).not.toMatch(/notFound\(/);
    expect(route()).toMatch(/match:\s*null[\s\S]*parcel:\s*null/);
  });
});

describe('log hygiene — the raw q is NEVER logged (Spec 100 §2.8)', () => {
  it('the logInfo payload carries outcome/parcelId/matchType/duration but no q', () => {
    const src = route();
    const m = src.match(/logInfo\(TAG, 'consumer parcel lookup', \{([\s\S]*?)\}\)/);
    expect(m).not.toBeNull();
    const args = m![1]!;
    expect(args).toContain('outcome');
    expect(args).toContain('parcelId');
    expect(args).toContain('matchType');
    expect(args).toContain('duration_ms');
    // No `q` key in the log object (the admin tool logs q; the consumer route must not).
    expect(args).not.toMatch(/\bq\b/);
  });
});

describe('consumer lib is read-only + reuses the admin resolver (no fork)', () => {
  it('READ-ONLY: no INSERT/UPDATE/DELETE in the consumer lib', () => {
    expect(lib()).not.toMatch(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/);
  });
  it('reuses the admin resolver internals — never forks the normalizers', () => {
    const src = route();
    expect(src).toContain("from '@/lib/admin/parcel-lookup'");
    expect(src).toMatch(/resolveAddress,\s*fetchParcelById,\s*fetchCoaProjects/);
    // MF-53: the map read is its own import line (src/lib/parcels/lot-map.ts, the one SQL home of the map), never the admin resolver's.
    expect(src).toContain("import { resolveLotMap } from '@/lib/parcels/lot-map';");
    // No SQL / normalizer parsing lives in the consumer lib (assembly only).
    expect(lib()).not.toMatch(/SELECT\s/i);
    expect(lib()).not.toContain('normalizeAddressNumber');
  });
});

// ── THE WHITELIST TEST (Spec 100 §3.2) ──────────────────────────────────────
describe('WHITELIST — the assembler never leaks a diagnostic column or `groups`', () => {
  // A row carrying Tier-1 + Tier-2 whitelisted fields AND a spread of Tier-3 diagnostic columns
  // + a comparable-build with an extra JSONB key. None of the diagnostics may reach the response.
  const row: Record<string, unknown> = {
    parcel_id: 'WL-1',
    // Tier-1 headline whitelist
    lot_size_sqm: 400, lot_size_sqft: 4305, opt_aor_gfa_sqm: 300, max_build_fsi: 1.25,
    max_build_stories: 3, coa_fsi: 1.6, envelope_constrained: true, envelope_constraint_reason: 'setback',
    // Tier-1 cost menu + a scalar
    parcel_cost_menu: {
      _schema_version: 3,
      kitchen: { total: 1000, per_sqm: 100, area: 10, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null },
      garden_suite: { total: 5000, per_sqm: 100, area: 50, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null, fits: false },
    },
    cost_fb_total: 900000,
    // Tier-2
    nearby_builds_summary: { headline: 'Mostly detached', basis: 'comp', typical_fsi: 0.9 },
    comp_count: 12, comp_fsi_p50: 0.85, neighbourhood_id: 42, neighbourhood_cost_premium: 1.1,
    comparable_builds: [
      { address: '5 Elm', permit_fsi: 0.95, structure_family: 'detached', work_type: 'new_build', LEAKED_SECRET: 'nope', zoning_zn_string: 'R' },
    ],
    // Tier-3 diagnostics that MUST NOT leak
    zoning_zn_string: 'R2', bylaw_max_fsi: 1.0, heritage_designation_type: 'Part IV',
    existing_height_m: 9.2, addr_num_normalized: '5', optimal_config: { x: 1 }, garden_suite_fits: true,
  };

  it('no Tier-3 diagnostic column name appears anywhere in the serialized payload', () => {
    const { payload } = assembleConsumerPayload(row, []);
    const flat = JSON.stringify(payload);
    // Names that are legitimately present as nested Tier-2 comparable-build example fields —
    // they describe the COMPARABLE, not the subject parcel, so a name-collision with a T3 parcel
    // column (e.g. `frontage_m`) is not a leak.
    const COMPARABLE_FIELD_NAMES = new Set([
      'address', 'lot_sqm', 'frontage_m', 'distance_m', 'work_type', 'permit_gfa_sqm',
      'permit_fsi', 'storeys', 'coa_decision', 'build_ratio', 'structure_family',
    ]);
    const t3Cols = Object.values(T3_GROUPS).flat();
    const leaked = t3Cols.filter((c) => {
      // max_build_stories/max_build_fsi/coa_fsi/realized_fsi_p90/envelope_* are consciously
      // promoted to the consumer headline whitelist — not leaks. (EI-D1, 2026-11-12: the legacy ones are sent as null.)
      if ((CONSUMER_HEADLINE_COLS as readonly string[]).includes(c)) return false;
      if (COMPARABLE_FIELD_NAMES.has(c)) return false;
      return flat.includes(`"${c}"`);
    });
    expect(leaked).toEqual([]);
    expect(flat).not.toContain('LEAKED_SECRET');
    expect(payload).not.toHaveProperty('groups');
  });

  it('areas keys are a subset of CONSUMER_HEADLINE_COLS', () => {
    const { payload } = assembleConsumerPayload(row, []);
    for (const k of Object.keys(payload.areas)) {
      expect(CONSUMER_HEADLINE_COLS).toContain(k);
    }
  });

  it('comparable-build examples carry ONLY the explicit whitelist fields (no passthrough)', () => {
    const { payload } = assembleConsumerPayload(row, []);
    const cb = payload.neighbourhood.comparableBuilds!;
    expect(cb).toHaveLength(1);
    expect(Object.keys(cb[0]!).sort()).toEqual([
      'address', 'build_ratio', 'coa_decision', 'distance_m', 'frontage_m', 'lot_sqm',
      'permit_fsi', 'permit_gfa_sqm', 'storeys', 'structure_family', 'work_type',
    ]);
    expect(cb[0]!.permit_fsi).toBe(0.95);
    expect(cb[0]!.structure_family).toBe('detached');
  });

  // Dated 2026-11-12 (EI-D1, operator "D all as recommended - please ensure this is addedd to the McFrontend decisions";
  // Spec 135 FE-38; Spec 100 §3.2 dated note 2026-11-12, which suspends §2 item 3 with the cost menu): the "absent ≠
  // fits:false" case is retired. Its prior text asserted that menu.garden_suite.fits === false and that menu.kitchen has
  // no fits key. The lookup now sends the legacy menu as null, so there is no line to carry either state; the lock is
  // src/tests/consumer-parcel-lookup-legacy-hide.logic.test.ts. The engine cost lines come back on the declared report (MB-94).
  it('EI-D1: the legacy cost menu is not sent (the fits:false case is retired with it)', () => {
    const { payload } = assembleConsumerPayload(row, []);
    expect(payload.costMenu.menu).toBeNull();
  });

  it('the full response is .strict() — a `groups` leak fails the boundary parse', () => {
    const { payload } = assembleConsumerPayload(row, []);
    // MF-53 (PLAN panel regression MEDIUM-4): `good` carries the two added keys, so the leak below fails for the right reason.
    const good = {
      match: { parcelId: 'WL-1', matchType: 'exact' as const, address: '5 Elm' },
      candidates: [], warnings: [], parcel: payload, resolution: 'unique' as const, map: null,
    };
    expect(() => ConsumerParcelLookupResponseSchema.parse(good)).not.toThrow();
    const leaked = { ...good, parcel: { ...payload, groups: { identity: { id: 1 } } } };
    const res = ConsumerParcelLookupResponseSchema.safeParse(leaked);
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => [i.code, (i as { keys?: string[] }).keys])).toEqual([['unrecognized_keys', ['groups']]]);
  });
});

describe('request Zod (Spec 100 §3)', () => {
  it('accepts exactly one of q | parcelId', () => {
    expect(ConsumerParcelLookupQuerySchema.safeParse({ q: '26 Hurlingham Cres' }).success).toBe(true);
    expect(ConsumerParcelLookupQuerySchema.safeParse({ parcelId: 'PIN-123' }).success).toBe(true);
  });
  it('rejects both / neither', () => {
    expect(ConsumerParcelLookupQuerySchema.safeParse({ q: '26 Main', parcelId: 'X' }).success).toBe(false);
    expect(ConsumerParcelLookupQuerySchema.safeParse({}).success).toBe(false);
  });
  it('rejects a too-short q', () => {
    expect(ConsumerParcelLookupQuerySchema.safeParse({ q: 'ab' }).success).toBe(false);
  });
});

// ── MF-53 THE MAP BLOCK (Spec 100 §3.2 dated note 2026-11-11; PLAN panel security M-1, M-2) ───────────────────────────────────────
describe('MF-53 map whitelist — the lot statement projects exactly CONSUMER_MAP_COLS; map is .strict() at every level', () => {
  const LOTMAP = path.resolve(__dirname, '../lib/parcels/lot-map.ts');
  const lotStatement = (src: string): string => /SELECT (parcel_id, [^]*?)\s+FROM parcels\s+WHERE parcel_id = ANY/.exec(src)?.[1] ?? '';
  const projected = (sel: string): string[] => sel.split(/,(?![^(]*\))/).map((c) => c.trim()).map((c) => /^ST_AsGeoJSON\((\w+), 6\) AS outline$/.exec(c)?.[1] ?? c);
  it('the lot SELECT list equals CONSUMER_MAP_COLS (both ways)', () => {
    expect(projected(lotStatement(fs.readFileSync(LOTMAP, 'utf8')))).toEqual([...CONSUMER_MAP_COLS]);
  });
  it('RED (planted): a Tier-3 column added to the lot statement fails the equality', () => {
    const planted = fs.readFileSync(LOTMAP, 'utf8').replace('zoning_zn_string, ', 'zoning_zn_string, zoning_class, ');
    expect(projected(lotStatement(planted))).not.toEqual([...CONSUMER_MAP_COLS]);
  });
  it('the assembled map carries only the declared camelCase keys and no snake_case column name', () => {
    const map = assembleLotMap({
      address: null, pin: { lat: 43.65, lng: -79.38 }, truncated: false,
      lots: [{ parcel_id: 'P1', lot_size_sqm: '283.5', frontage_m: '7.62', zoning_zn_string: 'RD', centroid_lat: '43.65', centroid_lng: '-79.38',
        outline: '{"type":"Polygon","coordinates":[[[-79.38,43.65],[-79.37,43.65],[-79.38,43.65]]],"crs":{"x":1}}' }],
      neighbours: [],
    });
    expect(Object.keys(map).sort()).toEqual(['address', 'fit', 'lots', 'neighbours', 'pin', 'truncated']);
    expect(Object.keys(map.lots[0]!).sort()).toEqual(['area', 'centroid', 'frontage', 'outline', 'parcelId', 'zoning']);
    expect(map.lots[0]!.outline).toBeNull(); // a crs passthrough fails the strict outline schema: no polygon, never a leak
    expect(map.lots[0]!.area).toBe('3,052 sq ft · 284 m²');
    expect(JSON.stringify(map)).not.toMatch(/"[a-z]+_[a-z_]+"/);
  });
  it('the response schema refuses a stray key in a map lot, a map on unique, and no map on a map outcome', () => {
    const base = { match: null, candidates: [], warnings: [], parcel: null };
    const map = { address: null, pin: null, fit: null, truncated: false, lots: [{ parcelId: 'P', area: null, frontage: null, zoning: null, centroid: null, outline: null }], neighbours: [] };
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, resolution: 'multi_parcel', map }).success).toBe(true);
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, resolution: 'multi_parcel', map: { ...map, lots: [{ ...map.lots[0], zoning_class: 'R' }] } }).success).toBe(false);
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, resolution: 'unique', map }).success).toBe(false);
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, resolution: 'unlinked', map: null }).success).toBe(false);
  });
  it('a degenerate start view (a pin alone) still opens at street scale', () => {
    const fit = fitOf([], { lat: 43.65, lng: -79.38 })!;
    expect(fit.north - fit.south).toBeCloseTo(FIT_MIN_SPAN_DEG, 9);
    expect(fit.east - fit.west).toBeCloseTo(FIT_MIN_SPAN_DEG, 9);
    expect(fitOf([], null)).toBeNull();
  });
});

describe('MF-53 a neighbour without a drawable outline is dropped (OUTPUT panel code reviewer LOW-2)', () => {
  it('null and drifted neighbour outlines leave the map; a lot without an outline keeps its card', () => {
    const map = assembleLotMap({
      address: '12 Main St', pin: { lat: 43.65, lng: -79.38 }, truncated: false, lots: [],
      neighbours: [
        { parcel_id: 'N1', outline: null },
        { parcel_id: 'N2', outline: '{"type":"Point","coordinates":[1,2]}' },
        { parcel_id: 'N3', outline: '{"type":"Polygon","coordinates":[[[-79.38,43.65],[-79.37,43.65],[-79.38,43.65]]]}' },
      ],
    });
    expect(map.neighbours.map((n) => n.parcelId)).toEqual(['N3']);
  });
});
