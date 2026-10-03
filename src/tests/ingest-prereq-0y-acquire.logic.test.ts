// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0y; RE-FREEZE #30, logged in 122 §8)
//
// INGESTOR prerequisite 0y (part B) — THE CKAN DataStore ACQUISITION ARM.
//
// The three zoning primaries (base + two overlays) are NOT zipped shapefiles: legacy
// `load-zoning.js` pulls each layer through CKAN's paginated `datastore_search` and takes its
// version from ONE `package_show` (`load-zoning.js:361-386`). 0y makes that a DECLARED arm of
// the acquisition seam: `format:"ckan_datastore"` + `ckan:{resource_id, package_url,
// page_size_from_config}` on an `http_api` external, dispatched (brief 16) from
// `acquireExternal` AFTER the tier-1 skip and BEFORE any temp root, and driven by
// `acquireCkanDatastore` (brief 14) with its tier-1 validators from `ckanResourceValidators`
// (brief 13, memoised in ONE per-run `validatorCache` Map — briefs 15′/21/22).
//
// This file locks the arm's contract, byte for byte against the legacy URLs and error text:
//   - T4 RED pagination: `?resource_id=<id>&limit=<page>&offset=<o>` exactly, the stop shape
//     `records.length < page` (legacy `:382`), and the last EMPTY page;
//   - T5 RED shaping/tally ORDER (GR-5e): null geometry FIRST (count + skip, never pushed),
//     then the `_id` coercion; `record_fields` = keys of the RAW record 0; `content_hash` null;
//   - T6 RED validators: ONE `package_show` per shared `package_url`, the SAME `validatorCache`
//     Map (identity, GR-5d), `source_dataset_version = last_modified || metadata_modified`,
//     a resource absent from the package rejects `/not listed/` with ZERO `datastore_search`;
//   - T7 RED errors/retry: non-ok rejects `/GET 503/`, `success:false` names the resource, a
//     retried page makes 2 GETs, `package_show` is NEVER retried, and the GR-3 Σrecords ≠ total
//     name-check (CKAN silently clamps `limit` to 32000);
//   - T8 PIN: a shapefile external fetches neither `package_url` nor any `datastore_search`, and
//     its `acquired` key set is unchanged (no `pages_fetched`/`record_fields`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const PACKAGE_URL = 'https://ex/api/3/action/package_show?id=pkg';
const DATASTORE_URL = 'https://ex/api/3/action/datastore_search';
const PACKAGE_VERSION = 'Mon, 14 Mar 2022 15:25:09 GMT';

/**
 * The three-primaries fixture (§4 Z3): `base`/`ov_a`/`ov_b`, each an `http_api` external over
 * the BARE datastore endpoint, sharing ONE `package_url`, each `ckan_datastore`, each with its
 * own `resource_id` and the registered page-size variable name.
 */
function ckanExternal(id: string, resourceId: string) {
  return {
    id,
    kind: 'http_api',
    format: 'ckan_datastore',
    url: DATASTORE_URL,
    ckan: {
      resource_id: resourceId,
      package_url: PACKAGE_URL,
      page_size_from_config: 'load_zoning_datastore_page_size',
    },
    key_property: '_id',
    cache: 'none',
    target: `t${id}`,
  };
}

/** The descriptor `acquireExternal` reads: identity, a network block, no staleness triggers. */
function ckanDescriptor(): Record<string, unknown> {
  return {
    identity: { name: 'load_zoning', spec_version: '1.0' },
    staleness: 'none',
    execution: { network: { timeout: '30s', retries: 0, retry_backoff_from_config: 'none' } },
  };
}

/** The resolved config: the page size the arm reads through `ckan.page_size_from_config`. */
function ckanConfig(pageSize = 2): Record<string, number> {
  return { load_zoning_datastore_page_size: pageSize };
}

/**
 * The fake CKAN server: serves `package_show` (ONE resource list, versioned) and paged
 * `datastore_search` from a per-resource record array. Records EVERY url it is asked for, so
 * pagination, the query string, and "no `datastore_search` GET happened" are all assertable.
 *
 * `recordsByResource[resourceId]` is the FULL record list; a `datastore_search` for offset `o`
 * returns `records.slice(o, o + limit)` with `total = records.length`. `overrides` lets a row
 * force a status, a `success:false` envelope, or a mismatched `total` (the GR-3 check).
 */
function fakePackageFetch(opts: {
  resources: Array<{ id: string; last_modified?: string | null }>;
  metadataModified?: string | null;
  recordsByResource?: Record<string, Array<Record<string, unknown>>>;
  overrides?: (url: string, call: number) => { status?: number; body?: unknown } | undefined;
}) {
  const urls: string[] = [];
  const metadataModified = opts.metadataModified ?? PACKAGE_VERSION;
  const recordsByResource = opts.recordsByResource ?? {};
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(url);
    const forced = opts.overrides ? opts.overrides(url, urls.length) : undefined;
    if (forced) {
      return new Response(JSON.stringify(forced.body ?? {}), {
        status: forced.status ?? 200,
        statusText: String(forced.status ?? 200),
      });
    }
    if (url.startsWith(PACKAGE_URL)) {
      return new Response(JSON.stringify({
        success: true,
        result: { metadata_modified: metadataModified, resources: opts.resources },
      }), { status: 200, statusText: '200' });
    }
    if (url.startsWith(DATASTORE_URL)) {
      const q = new URL(url).searchParams;
      const resourceId = q.get('resource_id') ?? '';
      const limit = Number(q.get('limit'));
      const offset = Number(q.get('offset'));
      const all = recordsByResource[resourceId] ?? [];
      const records = all.slice(offset, offset + limit);
      return new Response(JSON.stringify({
        success: true,
        result: { records, total: all.length, limit, offset },
      }), { status: 200, statusText: '200' });
    }
    throw new Error(`fakePackageFetch: unexpected url ${url}`);
  });
  return { fetchImpl, urls };
}

/**
 * A fake pool whose PRIOR read is routed on `SELECT records_meta FROM pipeline_runs` (I-A5) —
 * never on the `status='completed'` literal — and which records every statement.
 */
function fakePool() {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const answer = (text: string) => {
    if (/SELECT records_meta FROM pipeline_runs/i.test(text)) return { rows: [] };
    return { rows: [] };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text); };
  return { calls, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/**
 * The `acquireExternal` args for one CKAN primary: the arm's own inputs, plus the ONE
 * `validatorCache` Map the caller threads (briefs 15′/21/22). The tier-1 gate is a no-op
 * `skip:false` — the CKAN validators flow through the HEAD seam, not this gate.
 */
function ckanArgs(opts: {
  external: Record<string, unknown>;
  fetchImpl: unknown;
  config?: Record<string, number>;
  validatorCache?: Map<string, unknown>;
  keyProperty?: string;
  keyColumn?: string;
  coerceKey?: (raw: unknown, ctx: unknown) => unknown;
  descriptor?: Record<string, unknown>;
}) {
  return {
    ctxFetch: opts.fetchImpl,
    log: noopLog,
    tag: '[0y]',
    slug: 'load_zoning',
    external: opts.external,
    descriptor: opts.descriptor ?? ckanDescriptor(),
    config: opts.config ?? ckanConfig(),
    prior: null,
    timeoutMs: null,
    keyProperty: opts.keyProperty ?? '_id',
    keyColumn: opts.keyColumn ?? 'source_id',
    coerceKey: opts.coerceKey ?? ((raw: unknown) => (raw == null ? null : raw)),
    forced: false,
    preAcquisitionGate: () => ({ skip: false, reason: 'fresh' }),
    emitSkeleton: {},
    validatorCache: opts.validatorCache ?? new Map(),
  };
}

/** The arm's typed return, narrowed for the assertions. */
type ArmResult = {
  acquired: Record<string, unknown> & {
    pages_fetched: number;
    record_fields: string[] | null;
    rows_parsed: number;
    feature_count: number;
    bad_key_count: number;
    null_geometry_count: number;
    bytes_downloaded: number;
    content_hash: null;
    source_dataset_version: string;
  };
  features: Array<{ source_id: unknown; geojson: string; record: Record<string, unknown> }>;
  tier1: { skip: boolean; reason: string };
  tier2: { skip: boolean; reason: string };
};

describe('INGESTOR prerequisite 0y — the CKAN DataStore acquisition arm', () => {
  const restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // =========================================================================
  // T4 — PAGINATION. Page size 2 ⇒ 3 records = exactly 2 GETs, 4 records = 3
  // GETs with a last EMPTY page. Every URL asserted BYTE FOR BYTE against the
  // legacy string `?resource_id=<id>&limit=<page>&offset=<o>` (ZN-D4: no sort).
  // =========================================================================
  it('T4 — pagination: page size 2 ⇒ 3 records = 2 GETs (offset 0, 2); 4 records = 3 GETs with an EMPTY last page', async () => {
    const rec = (id: string) => ({ _id: id, geometry: '{"type":"Point","coordinates":[0,0]}' });

    // 3 records: pages [r0,r1] then [r2] (2 < page ⇒ stop). Exactly TWO GETs.
    const three = fakePackageFetch({
      resources: [{ id: 'Rbase', last_modified: PACKAGE_VERSION }],
      recordsByResource: { Rbase: [rec('a'), rec('b'), rec('c')] },
    });
    const r3 = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: three.fetchImpl,
    })) as ArmResult;

    const ds3 = three.urls.filter((u) => u.startsWith(DATASTORE_URL));
    expect(ds3, 'exactly two datastore GETs for 3 records at page size 2').toHaveLength(2);
    expect(ds3[0], 'the first page URL, byte for byte').toBe(
      `${DATASTORE_URL}?resource_id=Rbase&limit=2&offset=0`,
    );
    expect(ds3[1], 'the second page URL, byte for byte').toBe(
      `${DATASTORE_URL}?resource_id=Rbase&limit=2&offset=2`,
    );
    expect(r3.acquired.pages_fetched, 'two pages fetched').toBe(2);
    expect(r3.acquired.feature_count, 'all three records are features').toBe(3);

    // 4 records: pages [r0,r1], [r2,r3] (== page ⇒ continue), [] (the EMPTY last page).
    const four = fakePackageFetch({
      resources: [{ id: 'Rbase', last_modified: PACKAGE_VERSION }],
      recordsByResource: { Rbase: [rec('a'), rec('b'), rec('c'), rec('d')] },
    });
    const r4 = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: four.fetchImpl,
    })) as ArmResult;

    const ds4 = four.urls.filter((u) => u.startsWith(DATASTORE_URL));
    expect(ds4, 'four records at page size 2 take THREE GETs — the third is empty (legacy stop shape)').toHaveLength(3);
    expect(ds4[2], 'the empty-page URL is the legacy string at offset 4').toBe(
      `${DATASTORE_URL}?resource_id=Rbase&limit=2&offset=4`,
    );
    expect(r4.acquired.pages_fetched, 'three pages fetched').toBe(3);
    expect(r4.acquired.feature_count, 'four records are four features').toBe(4);
  });

  // =========================================================================
  // T5 — SHAPING AND TALLY ORDER (GR-5e). Null geometry is counted FIRST and
  // never pushed; `_id` coercion second. `record_fields` is the RAW record 0.
  // =========================================================================
  it('T5 — shaping/tally order: null geometry counts and skips, an object geometry stringifies, record_fields is RAW record 0, content_hash null', async () => {
    const records = [
      // record 0 is RAW and DROPPED (null geometry) — record_fields must still be its keys.
      { _id: 'x', geometry: null, extra: 'kept-in-fields' },
      // `{geometry:null,_id:null}`: counted ONCE (null geometry) and never pushed.
      { _id: null, geometry: null },
      // a null _id with a geometry ⇒ bad key (coercion returns null), counted + skipped.
      { _id: null, geometry: '{"type":"Point","coordinates":[1,1]}' },
      // a STRING geometry passes through untouched.
      { _id: 'k1', geometry: '{"type":"Point","coordinates":[2,2]}' },
      // an OBJECT geometry is JSON.stringify'd.
      { _id: 'k2', geometry: { type: 'Point', coordinates: [3, 3] } },
    ];
    const f = fakePackageFetch({
      resources: [{ id: 'Rbase', last_modified: PACKAGE_VERSION }],
      recordsByResource: { Rbase: records },
    });
    const r = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: f.fetchImpl,
      config: ckanConfig(10), // one page: the whole list
      coerceKey: (raw: unknown) => (typeof raw === 'string' && raw.length > 0 ? raw : null),
    })) as ArmResult;

    expect(r.acquired.null_geometry_count, 'the two null-geometry records (one also null-key)').toBe(2);
    expect(r.acquired.bad_key_count, 'only the null-_id WITH geometry is a bad key').toBe(1);
    expect(r.acquired.rows_parsed, 'rows_parsed counts every raw record').toBe(5);
    expect(r.features, 'two features survive (k1, k2)').toHaveLength(2);

    // The null-geometry records are NEVER pushed; the null-_id+geometry record is not either.
    expect(r.features.map((x) => x.record._id)).toEqual(['k1', 'k2']);

    // GR-5e invariant.
    expect(r.acquired.rows_parsed, 'rows_parsed === pushed + null_geometry_count + bad_key_count').toBe(
      r.features.length + r.acquired.null_geometry_count + r.acquired.bad_key_count,
    );

    // record_fields = keys of RAW record 0 (the dropped one), NOT of a surviving feature.
    expect(r.acquired.record_fields, 'record_fields reads the RAW first record before any drop').toEqual(
      Object.keys(records[0]!),
    );
    expect(r.acquired.record_fields, 'the raw key set includes the dropped record’s own keys').toContain('extra');
    expect(r.acquired.record_fields, 'the dropped record’s _id is in the field set').toContain('_id');

    // A string geometry passes through; an object geometry is stringified.
    expect(r.features[0]!.geojson, 'a string geometry is passed through byte for byte').toBe(
      '{"type":"Point","coordinates":[2,2]}',
    );
    expect(r.features[1]!.geojson, 'an object geometry is JSON.stringify’d').toBe(
      JSON.stringify({ type: 'Point', coordinates: [3, 3] }),
    );

    // The derived tallies are all positive, and there is NO content hash on this arm.
    expect(r.acquired.pages_fetched, 'pages_fetched > 0').toBeGreaterThan(0);
    expect(r.acquired.rows_parsed, 'rows_parsed > 0').toBeGreaterThan(0);
    expect(r.acquired.feature_count, 'feature_count > 0').toBeGreaterThan(0);
    expect(r.acquired.bytes_downloaded, 'bytes_downloaded > 0').toBeGreaterThan(0);
    expect(r.acquired.content_hash, 'a ckan_datastore arm has no content hash').toBeNull();
  });

  // =========================================================================
  // T6 — VALIDATORS. ONE `package_show` per shared `package_url`, the SAME
  // `validatorCache` Map to every call (GR-5d); the version mapping; the
  // "not listed" refusal with ZERO datastore GETs; `success:false` rejects.
  // =========================================================================
  it('T6 — validators: three primaries share ONE package_show and ONE validatorCache Map; version = last_modified || metadata_modified; an unlisted resource rejects /not listed/ with 0 datastore GETs', async () => {
    expect(typeof acquireLib.ckanResourceValidators, 'ckanResourceValidators is exported (brief 17)').toBe('function');
    const shared = new Map();
    const recs = {
      Rbase: [{ _id: '1', geometry: '{}' }],
      Rov_a: [{ _id: '2', geometry: '{}' }],
      Rov_b: [{ _id: '3', geometry: '{}' }],
    };

    // Three primaries over ONE package_url; only ONE package_show GET may happen.
    const f = fakePackageFetch({
      resources: [
        { id: 'Rbase', last_modified: PACKAGE_VERSION },
        { id: 'Rov_a', last_modified: PACKAGE_VERSION },
        { id: 'Rov_b', last_modified: PACKAGE_VERSION },
      ],
      recordsByResource: recs,
    });
    for (const id of ['base', 'ov_a', 'ov_b']) {
      await acquireLib.acquireExternal(ckanArgs({
        external: ckanExternal(id, `R${id}`),
        fetchImpl: f.fetchImpl,
        config: ckanConfig(10),
        validatorCache: shared,
      }));
    }
    expect(f.urls.filter((u) => u === PACKAGE_URL), 'three primaries, ONE package_show').toHaveLength(1);
    // Every call used the SAME caller-owned Map (identity — GR-5d): the ONE package_show is
    // memoised IN `shared`. Observed through the Map itself, never a spy on the export —
    // `acquireExternal` calls the module-local binding, which a `vi.spyOn` on
    // `module.exports` cannot see (a spy there records 0 calls).
    expect(shared.size, "the caller's ONE Map holds the ONE package_show memo (no private Map)").toBe(1);

    // `source_dataset_version = last_modified`; when `last_modified` is empty, `metadata_modified`.
    const viaLast = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: fakePackageFetch({
        resources: [{ id: 'Rbase', last_modified: PACKAGE_VERSION }],
        recordsByResource: { Rbase: [{ _id: '1', geometry: '{}' }] },
      }).fetchImpl,
      config: ckanConfig(10),
    })) as ArmResult;
    expect(viaLast.acquired.source_dataset_version, 'last_modified wins when present').toBe(PACKAGE_VERSION);

    const viaMeta = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: fakePackageFetch({
        resources: [{ id: 'Rbase', last_modified: '' }],
        metadataModified: 'Tue, 15 Mar 2022 00:00:00 GMT',
        recordsByResource: { Rbase: [{ _id: '1', geometry: '{}' }] },
      }).fetchImpl,
      config: ckanConfig(10),
    })) as ArmResult;
    expect(viaMeta.acquired.source_dataset_version, 'metadata_modified fills an empty last_modified').toBe(
      'Tue, 15 Mar 2022 00:00:00 GMT',
    );

    // A resource the package does NOT list ⇒ the arm refuses /not listed/ and never pages.
    const unlisted = fakePackageFetch({
      resources: [{ id: 'OTHER', last_modified: PACKAGE_VERSION }],
      recordsByResource: { Rbase: [{ _id: '1', geometry: '{}' }] },
    });
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: unlisted.fetchImpl,
      config: ckanConfig(10),
    }))).rejects.toThrow(/not listed/);
    expect(unlisted.urls.filter((u) => u.startsWith(DATASTORE_URL)), 'an unlisted resource pages NOTHING').toHaveLength(0);

    // `success:false` on `package_show` rejects.
    const badPackage = vi.fn(async () => new Response(JSON.stringify({ success: false, result: {} }), {
      status: 200, statusText: '200',
    }));
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: badPackage,
      config: ckanConfig(10),
    }))).rejects.toThrow(/package_show/);
  });

  // =========================================================================
  // T7 — ERRORS AND RETRY. A page 503 rejects `/GET 503/`; `success:false`
  // names the resource; retries 1 ⇒ a 503 then a 200 makes 2 GETs;
  // `package_show` is NEVER retried; the GR-3 Σrecords ≠ total name-check.
  // =========================================================================
  it('T7 — errors/retry: page 503 → /GET 503/; success:false names the resource; a retried page makes 2 GETs; package_show never retries; Σrecords ≠ total rejects by name', async () => {
    const oneRec = { Rbase: [{ _id: '1', geometry: '{}' }] };
    const okResources = [{ id: 'Rbase', last_modified: PACKAGE_VERSION }];

    // A 503 page (no retries declared) rejects /GET 503/. The override targets the PAGED GET
    // (`resource_id=` in the query), never the bare HEAD a shapefile-shaped external would make.
    const isPaged = (url: string) => url.startsWith(DATASTORE_URL) && url.includes('resource_id=');
    const page503 = fakePackageFetch({
      resources: okResources,
      recordsByResource: oneRec,
      overrides: (url) => (isPaged(url) ? { status: 503 } : undefined),
    });
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: page503.fetchImpl,
      config: ckanConfig(10),
    }))).rejects.toThrow(/GET 503/);

    // `success:false` on a page names the resource.
    const pageFalse = fakePackageFetch({
      resources: okResources,
      recordsByResource: oneRec,
      overrides: (url) => (isPaged(url) ? { status: 200, body: { success: false, result: {} } } : undefined),
    });
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: pageFalse.fetchImpl,
      config: ckanConfig(10),
    }))).rejects.toThrow(/Rbase/);

    // Retries 1: a 503 THEN a 200 on the first page ⇒ two datastore GETs, then success.
    const retryDescriptor = ckanDescriptor();
    (retryDescriptor.execution as { network: Record<string, unknown> }).network = {
      timeout: '30s', retries: 1, retry_backoff_from_config: 'none',
    };
    let dsCalls = 0;
    const retryFetch = vi.fn(async (url: string) => {
      if (url.startsWith(DATASTORE_URL)) {
        dsCalls += 1;
        if (dsCalls === 1) return new Response('{}', { status: 503, statusText: '503' });
      }
      if (url.startsWith(PACKAGE_URL)) {
        return new Response(JSON.stringify({ success: true, result: { metadata_modified: PACKAGE_VERSION, resources: okResources } }), { status: 200, statusText: '200' });
      }
      const q = new URL(url).searchParams;
      const limit = Number(q.get('limit'));
      const offset = Number(q.get('offset'));
      const all = oneRec.Rbase!;
      return new Response(JSON.stringify({ success: true, result: { records: all.slice(offset, offset + limit), total: all.length, limit, offset } }), { status: 200, statusText: '200' });
    });
    const r = await acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: retryFetch,
      config: ckanConfig(10),
      descriptor: retryDescriptor,
    })) as ArmResult;
    expect(dsCalls, 'a 503 page is retried once, then succeeds (2 GETs)').toBe(2);
    expect(r.acquired.feature_count).toBe(1);

    // `package_show` is NEVER retried: a 503 then a 200 still yields ONE package_show GET.
    let pkgCalls = 0;
    const pkgRetry = vi.fn(async (url: string) => {
      if (url.startsWith(PACKAGE_URL)) {
        pkgCalls += 1;
        if (pkgCalls === 1) return new Response('{}', { status: 503, statusText: '503' });
        return new Response(JSON.stringify({ success: true, result: { metadata_modified: PACKAGE_VERSION, resources: okResources } }), { status: 200, statusText: '200' });
      }
      const q = new URL(url).searchParams;
      const limit = Number(q.get('limit'));
      const offset = Number(q.get('offset'));
      const all = oneRec.Rbase!;
      return new Response(JSON.stringify({ success: true, result: { records: all.slice(offset, offset + limit), total: all.length, limit, offset } }), { status: 200, statusText: '200' });
    });
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: pkgRetry,
      config: ckanConfig(10),
      descriptor: retryDescriptor,
    }))).rejects.toThrow(/package_show/);
    expect(pkgCalls, 'the validators seam makes ONE package_show attempt, never a retry').toBe(1);

    // GR-3: the server claims {limit:2,total:5} while the arm is told the page size is 10 —
    // Σrecords (2) ≠ total (5) ⇒ the arm refuses BY NAME (never silent truncation).
    const clamped = vi.fn(async (url: string) => {
      if (url.startsWith(PACKAGE_URL)) {
        return new Response(JSON.stringify({ success: true, result: { metadata_modified: PACKAGE_VERSION, resources: okResources } }), { status: 200, statusText: '200' });
      }
      return new Response(JSON.stringify({
        success: true,
        result: { records: [{ _id: '1', geometry: '{}' }, { _id: '2', geometry: '{}' }], total: 5, limit: 2, offset: 0 },
      }), { status: 200, statusText: '200' });
    });
    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl: clamped,
      config: ckanConfig(10),
    }))).rejects.toThrow(/5/);
  });

  // =========================================================================
  // T8 — PIN. A SHAPEFILE external's acquisition is untouched: no `package_show`,
  // no `datastore_search`, and an `acquired` key set with no `pages_fetched` /
  // `record_fields` (the two new keys are ABSENT on every other arm).
  // =========================================================================
  it('T8 — PIN: a shapefile external fetches neither package_url nor datastore_search, and its acquired key set is unchanged', async () => {
    const descriptor = clone(ckanDescriptor());
    const external = {
      id: 'shp', kind: 'http_file', format: 'shapefile_zip',
      url: 'https://ex/ravines.zip', key_property: 'OBJECTID', cache: 'none',
    };
    // A shapefile HEAD succeeds; the tier-1 gate DECLARES a skip, so the arm returns the `base`
    // block with NO download and NO parser. Any CKAN fetch would be a regression.
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith(DATASTORE_URL) || url.startsWith(PACKAGE_URL)) {
        throw new Error(`the shapefile arm must not fetch ${url}`);
      }
      return new Response(new Uint8Array(), { status: 200, statusText: '200' });
    });

    const r = await acquireLib.acquireExternal({
      ctxFetch: fetchImpl,
      log: noopLog,
      tag: '[0y-t8]',
      slug: 'load_ravines',
      external,
      descriptor,
      config: ckanConfig(),
      prior: null,
      timeoutMs: null,
      keyProperty: 'OBJECTID',
      keyColumn: 'source_id',
      coerceKey: (raw: unknown) => raw,
      forced: false,
      preAcquisitionGate: () => ({ skip: true, reason: 'unchanged' }),
      emitSkeleton: {},
      validatorCache: new Map(),
    }) as { acquired: Record<string, unknown>; tier1: { skip: boolean } };

    expect(r.tier1.skip, 'the shapefile external took the declared skip path').toBe(true);

    const ckanUrls = fetchImpl.mock.calls.map((c) => String(c[0]))
      .filter((u) => u.startsWith(DATASTORE_URL) || u.startsWith(PACKAGE_URL));
    expect(ckanUrls, 'a shapefile external fetches NO package_url and NO datastore_search').toEqual([]);

    // The two 0y keys are ABSENT (not null) on this arm — the 0fs `source_path` precedent.
    expect(Object.prototype.hasOwnProperty.call(r.acquired, 'pages_fetched'), 'pages_fetched is absent on a shapefile').toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r.acquired, 'record_fields'), 'record_fields is absent on a shapefile').toBe(false);
  });

  // =========================================================================
  // 0y-F3 (output-grounder fix7) — A SERVER THAT IGNORES `offset`. The page loop
  // stopped ONLY on a short page, so a server returning a FULL page forever (the
  // `offset` parameter ignored) looped WITHOUT BOUND — an infinite fetch loop.
  // The arm must reject BY NAME within a bounded number of requests.
  // =========================================================================
  it('0y-F3 — a server that ignores `offset` (a FULL page every time with total: 4) rejects by name within a bounded fetch count', async () => {
    const records = [
      { _id: '1', geometry: '{}' },
      { _id: '2', geometry: '{}' },
    ];
    let datastoreGets = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith(PACKAGE_URL)) {
        return new Response(JSON.stringify({
          success: true,
          result: { metadata_modified: PACKAGE_VERSION, resources: [{ id: 'Rbase', last_modified: PACKAGE_VERSION }] },
        }), { status: 200, statusText: '200' });
      }
      datastoreGets += 1;
      // A FULL page EVERY time, `offset` IGNORED, `total` a constant 4.
      return new Response(JSON.stringify({
        success: true,
        result: { records, total: 4, limit: 2, offset: 0 },
      }), { status: 200, statusText: '200' });
    });

    await expect(acquireLib.acquireExternal(ckanArgs({
      external: ckanExternal('base', 'Rbase'),
      fetchImpl,
      config: ckanConfig(2),
    }))).rejects.toThrow(/ignored offset/);
    expect(datastoreGets, 'the arm bounds the request count — never an infinite loop').toBeLessThanOrEqual(3);
  });

  // A small sanity check that the pool fake routes the prior read on the I-A5 string and never
  // on the `status='completed'` literal — the acquisition arm itself opens no transaction.
  it('T-helper — the fakePool prior read is routed on `SELECT records_meta FROM pipeline_runs` (I-A5), not the status literal', async () => {
    const pool = fakePool();
    await pool.query("SELECT records_meta FROM pipeline_runs WHERE step_key = $1 ORDER BY id DESC LIMIT 1", ['zoning']);
    expect(pool.calls, 'the prior statement was recorded').toHaveLength(1);
    expect(pool.calls[0]!.text, 'the routing key is the records_meta SELECT, per I-A5').toMatch(/SELECT records_meta FROM pipeline_runs/i);
    expect(pool.calls[0]!.text, 'the status literal is NOT the routing key').not.toMatch(/status\s*=\s*'completed'/);
  });
});
