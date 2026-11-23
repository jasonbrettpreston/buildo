// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the nullable `page`); docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7,
//            §11b.2 dated note 2026-11-11 (never a second resolver); docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (Layer 3 is the step's own pure core);
//            backlog/docs/doc-16 (McStorage policy v2: computed on first open, a stale record is never served).
//
// LOAD.1 (task-266) · the one-lot compute at the lookup pick: `computeCustomerPageResponse` in src/lib/parcels/report-compute.ts. Red first (Spec 08
// 08_agents.md:490, RR-0225), written from docs/reports/lanes/2026-11-19/BL-LOAD1/PLAN.md section 4 (C1 to C9). No database: the pool is a scripted fake.
// The gate is the EXISTING web live switch only (decision D-1 / task-348 is not ruled): no session gate, no admin condition, no new switch.
//   C1 gate       switch off: null, no query, the core and the config reader never imported
//   C2 parity     the computed page equals the page W projects from the same rows stored
//   C3 null paths no parcel, no Layer 2 stamp, zero batch rows, a batch row for another id, no parcels row in the batch: null, never a throw
//   C4 errors     a core error or a thrown query propagates (never a half page, never a miss)
//   C5 gated      a gated lot is the deliberate all-not-evaluated page
//   C6 fence      static and lazy imports allow-listed; no write verb; no meter, entitlement, auth or admin module
//   C7 one core   the entry calls the step's own exports; no formula of the core is written in the entry
//   C8 types      the rows of the page's own building types are equal when the compute is cut to those types (measurement pinned; the entry runs all types)
//   C9 current    a computed ungated lot has freshness verdict `current` and a non-null page
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { goldenBatch } from './steps/compute_maxbld_scenarios/golden25-harness';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p: string): Json => JSON.parse(read(p));
const rq = createRequire(path.join(ROOT, 'package.json'));
const CORE_REL = 'scripts/lib/compute/compute-maxbld-scenarios.js';
const DESCRIPTOR_REL = 'scripts/compute-maxbld-scenarios.descriptor.json';

const h = vi.hoisted(() => ({ live: { on: false }, loaded: { core: 0, config: 0 }, cfg: { values: {} as Record<string, unknown>, calls: 0 } }));
vi.mock('@/lib/surfaces/maxbld-web', async (orig) => ({
  ...(await orig<typeof import('@/lib/surfaces/maxbld-web')>()),
  get MAXBLD_WEB_LIVE(): boolean { return h.live.on; },
}));
const poolQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/lib/step/config.js', () => {
  h.loaded.config += 1;
  return { resolveConfig: async () => { h.cfg.calls += 1; return { values: h.cfg.values }; } };
});
vi.mock('../../scripts/lib/compute/compute-maxbld-scenarios.js', async () => {
  const { createRequire: cr } = await import('node:module');
  const m = cr(`${process.cwd()}/package.json`)(`${process.cwd()}/scripts/lib/compute/compute-maxbld-scenarios.js`) as Record<string, unknown>;
  h.loaded.core += 1;
  return { ...m, default: m };
});

import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';
import { readCustomerPageResponse, pageForVerdict } from '@/lib/parcels/report-page';
import { projectStoredPage, pageOptions, type StoredRow } from '@/lib/report-projection/project';
import { CURRENT_SEED_SHAS } from '@/lib/report-projection/seed-shas';

const REF = 'P-123';
// a golden lot whose full compute is cheap (about 4 s; lot 119522 is cheaper but its sizes are not evaluated; the other golden lots take 7 to 16 s each, measured by the lane scan)
const LOT_ID = 428050;
const SLOW = 120_000;

let CORE: Json;
let ROW: Json;
let RAW: Json;
let CONFIG: Json;
let CORE_ROWS: Json[];

const seedConfig = (): Json => {
  const lv = readJson('scripts/seeds/logic_variables.json');
  const out: Json = {};
  for (const d of readJson(DESCRIPTOR_REL).config.logic_variables as Json[]) out[d.name] = lv[d.name].default;
  return out;
};
/** A stored row as W reads it (pg): numeric as a string, the jsonb switches parsed. */
const asStored = (r: Json): Json => ({
  building_type: r.building_type, field_id: r.field_id, increment: r.increment === null || r.increment === undefined ? null : String(r.increment), status: r.status,
  value: r.value === null || r.value === undefined ? null : String(r.value), unit: r.unit, reason: r.reason, flags: r.flags, content_sha: r.content_sha,
  catalogue_sha: r.catalogue_sha, switchboard_sha: r.switchboard_sha, settings_sha: r.settings_sha, layer2_table_version: r.layer2_table_version,
  switches: typeof r.switches === 'string' ? JSON.parse(r.switches) : r.switches,
});
const parcelRow = (row: Json): Json => ({
  id: row.id, parcel_id: REF, zoning_zn_string: 'R', address: '1 Test St', lot_size_sqm: String(row.parcel.lot_size_sqm), is_corner_lot: row.parcel.is_corner_lot === true,
  is_heritage_designated: null, is_in_ravine_protection_area: null,
});
interface Scenario { parcel?: Json | null; batch: Json[]; batchError?: Error }
const batchCalls: Array<{ text: string; binds: unknown[] }> = [];
/** The scripted pool: the parcels read, the two lookup tables, the batch statement, and W's own stamp and stored-row reads (rows = the core's rows, stored). */
const script = (s: Scenario, stored: Json[] | null = null) => async (text: string, binds?: unknown[]) => {
  if (/FROM parcels WHERE parcel_id/.test(text)) return { rows: s.parcel === null ? [] : [s.parcel ?? parcelRow(ROW)] };
  if (/FROM bylaw_resolution_units/.test(text)) return { rows: RAW.bylaw_resolution_units };
  if (/FROM bylaw_resolution_texts/.test(text)) return { rows: RAW.bylaw_resolution_texts };
  if (/WITH page AS/.test(text)) {
    batchCalls.push({ text, binds: binds ?? [] });
    if (s.batchError) throw s.batchError;
    return { rows: s.batch };
  }
  if (/FROM bylaw_resolution_lot_stamps/.test(text)) return { rows: [{ lot_gate: ROW.lot.lot_gate, table_version: ROW.lot.table_version, evaluator_version: ROW.lot.evaluator_version }] };
  if (/to_regclass\('public\.parcel_maxbld_scenarios'\)/.test(text)) return { rows: [{ present: stored !== null }] };
  if (/FROM parcel_maxbld_scenarios WHERE parcel_id/.test(text)) return { rows: stored ?? [] };
  throw new Error(`unexpected pool query: ${text}`);
};
const use = (s: Scenario, stored: Json[] | null = null): void => { poolQuery.mockImplementation(script(s, stored)); };

beforeAll(() => {
  CORE = rq(path.join(ROOT, CORE_REL)) as Json;
  const g = goldenBatch();
  RAW = g.raw;
  ROW = g.rows.find((r) => r.id === LOT_ID) as Json;
  CONFIG = seedConfig();
  h.cfg.values = CONFIG;
  CORE_ROWS = CORE.materializeRows([ROW], { config: CONFIG, lookups: RAW }).rows.e1 as Json[];
}, SLOW);

beforeEach(() => {
  poolQuery.mockReset();
  batchCalls.length = 0;
  h.live.on = true;
  h.cfg.calls = 0;
});

describe('C1 the gate: the existing web live switch only', () => {
  it('switch off: null, no query of any kind, and neither the core nor the config reader is imported', async () => {
    h.live.on = false;
    const coreBefore = h.loaded.core;
    const configBefore = h.loaded.config;
    use({ batch: [ROW] });
    expect(await computeCustomerPageResponse(REF)).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
    expect(h.cfg.calls).toBe(0);
    expect(h.loaded.core).toBe(coreBefore);
    expect(h.loaded.config).toBe(configBefore);
  });
  it('the gate is the first statement of the entry and is the web live switch alone (source order: no session, admin or second switch)', () => {
    const src = read('src/lib/parcels/report-compute.ts');
    const body = src.slice(src.indexOf('export async function computeCustomerPageResponse'));
    expect(body).toMatch(/\{\s*\n\s*if \(!MAXBLD_WEB_LIVE\) return null;/);
    expect(src).not.toMatch(/sessionGate|isProfileAdmin|is_admin|getCurrentUserContext|tester/i);
    expect([...src.matchAll(/MAXBLD_[A-Z_]+/g)].map((m) => m[0])).toEqual(['MAXBLD_WEB_LIVE', 'MAXBLD_WEB_LIVE']);
  });
  it('the entry imports the core and the config reader lazily, after the gate (source order)', () => {
    const src = read('src/lib/parcels/report-compute.ts');
    expect(src).not.toMatch(/^import [^\n]*scripts\//m);
    expect(src.indexOf('await import(')).toBeGreaterThan(src.indexOf('if (!MAXBLD_WEB_LIVE) return null;'));
  });
});

describe('C2 parity: the computed page is the page W projects from the same rows', () => {
  it('equals readCustomerPageResponse over the same lot stored, is not an empty page, and bound the batch to this one lot', async () => {
    use({ batch: [ROW] }, CORE_ROWS.map(asStored));
    const w = await readCustomerPageResponse(REF);
    expect(w).not.toBeNull();
    const computed = await computeCustomerPageResponse(REF);
    expect(computed).toEqual(w);
    expect((computed as { not_evaluated: string[] }).not_evaluated).not.toContain('o1');
    expect(Object.keys((computed as { values: Json }).values).some((k) => k.startsWith('o1.size'))).toBe(true);
    const b = batchCalls[0] as { text: string; binds: unknown[] };
    expect(b.binds).toEqual([LOT_ID - 1, 1]);
    expect(b.text).toContain(`unnest((ARRAY[${LOT_ID}]::int[]))`);
  }, SLOW);
  it('reads the lookup tables and the lot facts, writes nothing, and reads config and lookups per request (no process cache)', async () => {
    use({ batch: [] });
    await computeCustomerPageResponse(REF);
    await computeCustomerPageResponse(REF);
    expect(h.cfg.calls).toBe(2);
    const texts = (poolQuery.mock.calls as Array<[string]>).map(([t]) => t);
    expect(texts.filter((t) => /\b(INSERT|UPDATE|DELETE|TRUNCATE)\s/.test(t))).toEqual([]);
    expect(texts.filter((t) => /FROM bylaw_resolution_texts/.test(t))).toHaveLength(2);
  }, SLOW);
  it('the two lookup statements are the ones the step descriptor declares as role lookup (a drift here fails)', () => {
    const lookups = (readJson(DESCRIPTOR_REL).inputs.reads.tables as Json[]).filter((t) => t.role === 'lookup').map((t) => `${t.table}:${(t.columns as string[]).join(',')}`).sort();
    const src = read('src/lib/parcels/report-compute.ts');
    const stmts = [...src.matchAll(/SELECT ([a-z_, ]+) FROM (bylaw_resolution_[a-z]+)'/g)].map((m) => `${m[2]}:${(m[1] as string).replace(/\s/g, '')}`).sort();
    expect(stmts).toEqual(lookups);
  });
});

describe('C3 a lot the engine cannot compute is a null, never a throw', () => {
  // the scenarios are built inside the test (ROW exists only after beforeAll), so the stamp and parcels guards are really reached
  it.each([
    ['no parcels row', (): Scenario => ({ parcel: null, batch: [] })],
    ['zero batch rows', (): Scenario => ({ batch: [] })],
    ['a batch row with no Layer 2 stamp', (): Scenario => ({ batch: [{ ...ROW, lot: null }] })],
    ['a batch row with no parcels row', (): Scenario => ({ batch: [{ ...ROW, parcel: null }] })],
  ])('%s', async (_n, build) => {
    use(build());
    expect(await computeCustomerPageResponse(REF)).toBeNull();
  });
  it('C3b a batch row whose id is not the requested id is a null', async () => {
    use({ batch: [{ ...ROW, id: LOT_ID + 1 }] });
    expect(await computeCustomerPageResponse(REF)).toBeNull();
  });
});

describe('C4 a failure propagates: the route turns it into its existing 500 with no page and no meter', () => {
  it('a thrown batch query rejects', async () => {
    use({ batch: [], batchError: new Error('db down') });
    await expect(computeCustomerPageResponse(REF)).rejects.toThrow('db down');
  });
  it('a core error (a catalogue setting with no config value) rejects, never a half page or a miss', async () => {
    const { fya_porch_allowance_m: _gone, ...short } = CONFIG; // eslint-disable-line @typescript-eslint/no-unused-vars
    h.cfg.values = short;
    use({ batch: [ROW] });
    try {
      await expect(computeCustomerPageResponse(REF)).rejects.toThrow(/fya_porch_allowance_m/);
    } finally { h.cfg.values = CONFIG; }
  });
  it('the entry has no catch and no process cache (source)', () => {
    const src = read('src/lib/parcels/report-compute.ts');
    expect(src).not.toMatch(/\bcatch\b/);
    expect(src).not.toMatch(/^let |new Map\(|\bmemo\b|memoi[sz]/m);
  });
});

describe('C5 a gated lot is the deliberate all-not-evaluated page', () => {
  it('lot_gate set on a copy of the same batch row: every option not evaluated, no option number', async () => {
    use({ batch: [{ ...ROW, lot: { ...ROW.lot, lot_gate: 'under_min_area' } }] });
    const r = (await computeCustomerPageResponse(REF)) as { values: Json; not_evaluated: string[] };
    expect(r).not.toBeNull();
    expect(r.not_evaluated).toEqual(['o1', 'o2', 'o3']);
    expect(Object.keys(r.values).filter((k) => /^o\d\./.test(k) && !k.endsWith('.panel.reason'))).toEqual([]);
  }, SLOW);
});

describe('C6 the fence: pool, projection, switch, the miss rule; lazy core and config; no meter, no auth, no write', () => {
  const src = (): string => read('src/lib/parcels/report-compute.ts');
  const BAD_IMPORT = /entitlement|usage|openReport|consumer-lookup|api\/parcels\/lookup(?!\/types)|parcel-tool|report-preview-live|@\/lib\/admin|@\/app\/admin|@\/app\/api\/admin|auth\//;
  const STATIC_OK = new Set(['@/lib/db/client', '@/lib/report-projection/project', '@/lib/report-projection/read-stored', '@/lib/report-projection/seed-shas', '@/lib/surfaces/maxbld-web', '@/lib/parcels/report-page']);
  it('static imports are the allow-list and none is a forbidden module', () => {
    const imports = [...src().matchAll(/from '([^']+)'/g)].map((m) => m[1] as string);
    expect(imports.length).toBeGreaterThan(3);
    for (const i of imports) { expect(STATIC_OK.has(i), i).toBe(true); expect(BAD_IMPORT.test(i), i).toBe(false); }
  });
  it('the lazy imports are the core, the step config reader and the descriptor only', () => {
    const lazy = [...src().matchAll(/import\(\s*'([^']+)'/g)].map((m) => (m[1] as string).replace(/^(\.\.\/)+/, ''));
    expect(lazy.sort()).toEqual([DESCRIPTOR_REL, CORE_REL, 'scripts/lib/step/config.js'].sort());
  });
  it('contains no write verb', () => { expect(src()).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s/); });
  it('the only db import is the pool', () => { expect([...src().matchAll(/from '(@\/lib\/db\/[^']*)'/g)].map((m) => m[1])).toEqual(['@/lib/db/client']); });
  it('the fence is not vacuous: planted imports are caught', () => {
    expect(BAD_IMPORT.test('@/lib/entitlements')).toBe(true);
    expect(BAD_IMPORT.test('@/lib/auth/get-user-context')).toBe(true);
    expect(BAD_IMPORT.test('@/lib/admin/report-preview-live/stored-page')).toBe(true);
    expect(BAD_IMPORT.test('@/lib/db/client')).toBe(false);
  });
  // The real walk and filter, parameterised by the tree root so the plant runs the same code on a planted tree (Spec 128 section 4.4).
  const importersOf = (root: string): string[] => {
    const walk = (d: string): string[] => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : [])) : []);
    return walk('src').filter((f) => !f.startsWith('src/tests/') && f !== 'src/lib/parcels/report-compute.ts' && /from '[^']*lib\/parcels\/report-compute'/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  };
  const FLOW_ONLY = ['src/lib/parcels/lookup-flow.ts'];
  it('the flow file is the only importer of the entry; the entry is imported by nothing else outside the tests', () => {
    expect(importersOf(ROOT)).toEqual(FLOW_ONLY); // STD.ROUTE (task-383): the flow file moved out of the route; the route imports the flow
  });
  it('RED plant: a planted second importer fails the lock; the control tree passes it (same walk and filter)', () => {
    const mk = (extra: boolean): string => {
      const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'std-route-'));
      const put = (rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
      put('src/lib/parcels/lookup-flow.ts', "import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';\n");
      put('src/lib/parcels/report-compute.ts', "export const x = 1;\n");
      if (extra) put('src/app/api/parcels/other/route.ts', "import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';\n");
      return tmp;
    };
    const control = mk(false); const planted = mk(true);
    expect(importersOf(control)).toEqual(FLOW_ONLY);
    expect(importersOf(planted)).not.toEqual(FLOW_ONLY);
    fs.rmSync(control, { recursive: true, force: true }); fs.rmSync(planted, { recursive: true, force: true });
  });
});

describe('C7 one core: the entry calls the step\'s own exports and holds none of its formulas', () => {
  it('names materializeRows and buildSourceSql from the core and defines no formula of it', () => {
    const src = read('src/lib/parcels/report-compute.ts');
    expect(src).toMatch(/materializeRows/);
    expect(src).toMatch(/buildSourceSql/);
    expect(src).not.toMatch(/buildParcelRows|oneParcel|runRow|ringLots|catalogue\.js|switchboard\.json|building-types|gfa_|setback|\bFSI\b/i);
    expect(src).not.toMatch(/\bfunction (materializeRows|buildSourceSql)\b/);
  });
  it('the rows the page was built from are the core\'s own output for the same batch row (parity run above), and the core exports what the entry calls', () => {
    expect(typeof CORE.materializeRows).toBe('function');
    expect(typeof CORE.buildSourceSql).toBe('function');
    expect(CORE_ROWS.length).toBe(325);
  });
});

describe('C8 types filter: measured equality for the rows the page binds', () => {
  it('cutting the seed list to the page option types gives the same rows for those types (content_sha moves by design: it hashes the seed list)', () => {
    const shown = [...new Set(pageOptions().map((o) => o.building_type))];
    expect(shown.length).toBeGreaterThan(0);
    const BT = rq(path.join(ROOT, 'scripts/seeds/bylaw/building-types.json')) as Json;
    const keep = BT.rows as Json[];
    const strip = (r: Json): string => { const { content_sha: _c, ...rest } = r; return JSON.stringify(rest); }; // eslint-disable-line @typescript-eslint/no-unused-vars
    BT.rows = keep.filter((b) => shown.includes(b.id));
    let filtered: Json[];
    try { filtered = CORE.materializeRows([ROW], { config: seedConfig(), lookups: { ...RAW } }).rows.e1 as Json[]; } finally { BT.rows = keep; }
    const f = new Map(filtered.map((x) => [`${x.building_type}/${x.field_id}`, strip(x)]));
    const want = CORE_ROWS.filter((x) => shown.includes(x.building_type));
    expect(want.length).toBeGreaterThan(50);
    expect(want.filter((x) => f.get(`${x.building_type}/${x.field_id}`) !== strip(x)).map((x) => `${x.building_type}/${x.field_id}`)).toEqual([]);
  }, SLOW);
});

describe('C9 a computed ungated lot is current and served, not turned into a miss by not_stored', () => {
  it('the freshness verdict of the core\'s own rows against the current seed shas is current, and the miss rule serves the page', () => {
    const rows = CORE_ROWS.map(asStored) as unknown as StoredRow[];
    const stored = projectStoredPage({
      lot: { id: LOT_ID, parcel_id: REF, address: null, zoning: null, columns: { lot_size_sqm: '400', is_corner_lot: false, is_heritage_designated: null, is_in_ravine_protection_area: null } },
      stamp: { lot_gate: ROW.lot.lot_gate, table_version: ROW.lot.table_version, evaluator_version: ROW.lot.evaluator_version },
      rows,
      current: CURRENT_SEED_SHAS,
    });
    expect(ROW.lot.lot_gate).toBeNull();
    expect(stored.lineage.freshness).toMatchObject({ verdict: 'current', moved: [] });
    expect(pageForVerdict(stored)).not.toBeNull();
  });
});
