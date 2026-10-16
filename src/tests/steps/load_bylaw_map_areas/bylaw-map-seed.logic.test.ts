// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (map seed)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A1)
//
// A1 map seed, offline (synthetic fixtures only): buildSeed over an 18-feature GIS layer-80 FC and a
// 25-ward CKAN FC, and the seed/manifest/checkSeed trio. Never mutates its inputs; every rejection
// names the offender. The real seed is adopted by the orchestrator after the Q-A1 ruling (see
// bylaw-maps.infra.test.ts, red until then).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const M = await load('scripts/analysis/bylaw/map-seed.mjs');

// Unit squares near -79.4 / 43.7, i.e. INSIDE TORONTO_BBOX (fix 6). `x` is a lon offset.
const square = (x: number): Json => ({ type: 'Polygon', coordinates: [[[-79.4 + x, 43.7], [-79.4 + x + 0.001, 43.7], [-79.4 + x + 0.001, 43.701], [-79.4 + x, 43.701], [-79.4 + x, 43.7]]] });

/** 18 GIS features: OBJECTIDs 13201..13218, the last two Scarborough North (type 3). */
function gisFc(): Json {
  const features = [];
  for (let i = 0; i < 18; i++) {
    const objectid = 13201 + i;
    features.push({
      type: 'Feature',
      geometry: square(i * 0.002),
      properties: {
        OBJECTID: objectid,
        ZN_STRING: `Area ${objectid}`,
        CH600_AREA_TYPE: i >= 16 ? 3 : 4,
        BYLAW_SECTIONLINK: 'Chapter600_60.htm',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** 25 wards: AREA_SHORT_CODE '01'..'25', AREA_ID 1..25, AREA_DESC 'Ward N'. */
function wardsFc(): Json {
  const features = [];
  for (let n = 1; n <= 25; n++) {
    const code = String(n).padStart(2, '0');
    features.push({
      type: 'Feature',
      geometry: square(-0.09 + n * 0.001),
      properties: { AREA_ID: n, AREA_SHORT_CODE: code, AREA_DESC: `Ward ${n}` },
    });
  }
  return { type: 'FeatureCollection', features };
}

const immutable = (fc: Json): Json => JSON.parse(JSON.stringify(fc));
const props = (f: Json): Json => f.properties;
const byKey = (features: Json[], key: string): Json => features.find((f) => props(f).area_key === key) as Json;

describe('A1 map seed: buildSeed over synthetic GIS + ward fixtures', () => {
  it('builds 27 features (18 GIS + 9 wards) sorted by area_key', () => {
    const seed = M.buildSeed(gisFc(), wardsFc());
    expect(seed.type).toBe('FeatureCollection');
    expect(seed.features).toHaveLength(27);
    const keys = seed.features.map((f: Json) => props(f).area_key);
    expect(keys).toEqual([...keys].sort());
    expect(keys[0]).toBe('city_gis_layer80:13201'); // area_key is sorted as a string: city_gis_layer80:* before ckan_wards_2018:*
    expect(keys[keys.length - 1]).toBe('ckan_wards_2018:9'); // string order: '...:4' < '...:9', and 'city_gis...' < 'ckan...'
    expect(byKey(seed.features, 'city_gis_layer80:13201')).toBeTruthy();
    expect(byKey(seed.features, 'ckan_wards_2018:19')).toBeTruthy();
  });

  it('carries the GIS fields and MultiPolygon geometry, and the Scarborough North / TEY area types', () => {
    const seed = M.buildSeed(gisFc(), wardsFc());
    const gis = seed.features.filter((f: Json) => props(f).source === 'city_gis_layer80');
    expect(gis).toHaveLength(18);
    for (const f of gis) {
      expect(f.geometry.type).toBe('MultiPolygon');
      expect(f.geometry.coordinates).toHaveLength(1);
      expect(props(f).map_code).toBe('600.60');
      expect(props(f).area_name).toBe(`Area ${props(f).source_feature_id}`);
      expect(props(f).area_type).toBe(props(f).source_feature_id >= 13217 ? 3 : 4);
    }
    expect(props(byKey(seed.features, 'city_gis_layer80:13217')).area_type).toBe(3);
    const w23 = byKey(seed.features, 'ckan_wards_2018:23');
    expect(props(w23).area_type).toBe(3);
    expect(props(w23).area_name).toBe('Ward 23');
    for (const code of M.TEY_WARDS) {
      const ward = byKey(seed.features, `ckan_wards_2018:${Number(code)}`);
      expect(ward, `ward ${code} missing`).toBeTruthy();
      expect(props(ward).area_type).toBe(4);
      expect(props(ward).source_feature_id).toBe(Number(code));
      expect(ward.geometry.type).toBe('MultiPolygon');
    }
    // TEY is 8 + ward 23 = the 9 kept wards out of 25.
    expect(seed.features.filter((f: Json) => props(f).source === 'ckan_wards_2018')).toHaveLength(9);
  });

  it('never mutates its inputs and leaves the non-overlay wards out', () => {
    const gis = gisFc();
    const wards = wardsFc();
    const beforeGis = immutable(gis);
    const beforeWards = immutable(wards);
    const seed = M.buildSeed(gis, wards);
    expect(gis).toEqual(beforeGis);
    expect(wards).toEqual(beforeWards);
    for (const f of seed.features) expect(beforeGis.features.includes(f)).toBe(false);
    for (let n = 1; n <= 25; n++) {
      const code = String(n).padStart(2, '0');
      const kept = M.TEY_WARDS.includes(code) || code === M.SCARB_NORTH_WARD;
      expect(!!byKey(seed.features, `ckan_wards_2018:${n}`)).toBe(kept);
    }
    expect(seed.features.some((f: Json) => props(f).area_key === 'ckan_wards_2018:1')).toBe(false);
  });

  it('throws on 17 GIS features', () => {
    const short = gisFc();
    short.features.pop();
    expect(() => M.buildSeed(short, wardsFc())).toThrow(/expected 18/);
  });

  it('throws on a GIS feature with CH600_AREA_TYPE 5 (naming the OBJECTID)', () => {
    const bad = gisFc();
    bad.features[3].properties.CH600_AREA_TYPE = 5;
    expect(() => M.buildSeed(bad, wardsFc())).toThrow(/13204/);
  });

  // Fix 3: `'toString' in AREA_TYPES` is true (prototype walk); the number test refuses both a
  // prototype key and the STRING '4'.
  it("refuses CH600_AREA_TYPE 'toString' (a prototype key) and '4' (a string)", () => {
    const proto = gisFc();
    proto.features[0].properties.CH600_AREA_TYPE = 'toString';
    expect(() => M.buildSeed(proto, wardsFc())).toThrow(/13201/);
    const str = gisFc();
    str.features[1].properties.CH600_AREA_TYPE = '4';
    expect(() => M.buildSeed(str, wardsFc())).toThrow(/13202/);
    expect('toString' in M.AREA_TYPES).toBe(true); // the trap the number test avoids
  });

  it('throws on a GIS feature whose BYLAW_SECTIONLINK is not Chapter600_60.htm', () => {
    const bad = gisFc();
    bad.features[0].properties.BYLAW_SECTIONLINK = 'Chapter600_70.htm';
    expect(() => M.buildSeed(bad, wardsFc())).toThrow(/Chapter600_60\.htm/);
  });

  it('throws when the wards are missing 19', () => {
    const words = wardsFc();
    words.features = words.features.filter((f: Json) => f.properties.AREA_SHORT_CODE !== '19');
    expect(() => M.buildSeed(gisFc(), words)).toThrow(/19/);
  });
});

describe('A1 map seed: manifest + checkSeed', () => {
  const built = () => {
    const seedText = M.stableStringify(M.buildSeed(gisFc(), wardsFc()));
    const manifest = M.buildManifest({
      seedText,
      gisUrl: 'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer/80/query?f=geojson',
      wardsUrl: 'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/city-wards/wards-4326.geojson',
      gisRawSha: M.sha256Hex('gis'),
      wardsRawSha: M.sha256Hex('wards'),
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    return { seedText, manifest };
  };

  it('checkSeed accepts the built seed and records the licence facts without deciding them', () => {
    const { seedText, manifest } = built();
    expect(M.checkSeed(seedText, manifest)).toEqual([]);
    expect(manifest.seed_sha256).toBe(M.sha256Hex(seedText));
    expect(manifest.seed_md5).toBe(M.md5Hex(seedText));
    expect(manifest.seed_bytes).toBe(Buffer.byteLength(seedText, 'utf8'));
    expect(manifest.seed).toBe('scripts/seeds/bylaw/maps/600_60.geojson');
    expect(manifest.sources[0].feature_count).toBe(18);
    expect(manifest.sources[0].licence).toEqual({
      stated: 'none',
      ruling: M.GIS_LICENCE_RULING,
      ruled_on: '2026-10-08',
      publish_scope: M.GIS_PUBLISH_SCOPE,
      publish_note: 'cloud/prod publish waits until the licence is confirmed (operator 2026-10-08)',
    });
    expect(M.GIS_LICENCE_RULING).toBe('not stated — City of Toronto GIS, unverified');
    expect(M.GIS_PUBLISH_SCOPE).toBe('local_only');
    expect(manifest.sources[1].ward_codes).toEqual([...M.TEY_WARDS, '23'].sort());
    expect(manifest.area_types).toEqual({ 3: 'Scarborough North (Ward 23)', 4: 'Toronto and East York Community Council Area' });
  });

  // The GIS licence ruling is a gate: a manifest whose publish_scope is 'cloud' can never check out.
  it("checkSeed flags a GIS licence publish_scope of 'cloud' (and a missing ruling)", () => {
    const { seedText, manifest } = built();
    const cloud = JSON.parse(JSON.stringify(manifest));
    expect(cloud.sources[0].licence.publish_scope).toBe('local_only');
    cloud.sources[0].licence.publish_scope = 'cloud';
    const problems = M.checkSeed(seedText, cloud);
    expect(problems.some((p: string) => /publish_scope "cloud" != "local_only"/.test(p))).toBe(true);

    const blank = JSON.parse(JSON.stringify(manifest));
    blank.sources[0].licence.ruling = '';
    expect(M.checkSeed(seedText, blank).some((p: string) => /ruling "" is not a non-empty string/.test(p))).toBe(true);

    // The untouched manifest still checks out.
    expect(M.checkSeed(seedText, manifest)).toEqual([]);
  });

  it('the manifest serialization is sorted-key, 2-space, LF and newline-terminated', () => {
    const { manifest } = built();
    const text = M.stableStringify(manifest, { indent: 2 });
    expect(text.includes('\r')).toBe(false);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(manifest);
    const keys = [...text.matchAll(/^ {2}"([a-z_]+)":/gm)].map((m) => m[1]);
    expect(keys).toEqual([...keys].sort());
    // The seed itself is one line (indent 0).
    expect(M.stableStringify(M.buildSeed(gisFc(), wardsFc())).includes('\n')).toBe(false);
  });

  it('a one-byte change to the seed text is a sha problem', () => {
    const { seedText, manifest } = built();
    // One byte, same length: a same-length substitution keeps seed_bytes intact, so the only
    // problem is the sha256 mismatch (checkSeed compares both sha and byte length).
    const tampered = seedText.replace('Area 13201', 'Area 1320X');
    expect(tampered).not.toBe(seedText);
    const problems = M.checkSeed(tampered, manifest);
    // The manifest now pins sha256 AND md5, so one byte breaks both digests: TWO problems.
    expect(problems).toHaveLength(2);
    expect(problems.some((p: string) => /sha256/.test(p))).toBe(true);
    expect(problems.some((p: string) => /md5/.test(p))).toBe(true);
  });

  it('checkSeed flags a wrong seed_md5 (the step library hashes md5)', () => {
    const { seedText, manifest } = built();
    expect(manifest.seed_md5).toBe(M.md5Hex(seedText));
    const forged = JSON.parse(JSON.stringify(manifest));
    forged.seed_md5 = '0'.repeat(32);
    const problems = M.checkSeed(seedText, forged);
    expect(problems.some((p: string) => /md5/.test(p))).toBe(true);
    // The untouched manifest still checks out.
    expect(M.checkSeed(seedText, manifest)).toEqual([]);
  });

  it('checkSeed flags a duplicated area_key and an out-of-range area_type', () => {
    const { manifest } = built();
    const seed = M.buildSeed(gisFc(), wardsFc());
    seed.features.push(JSON.parse(JSON.stringify(seed.features[0])));
    seed.features[1].properties.area_type = 9;
    const problems = M.checkSeed(M.stableStringify(seed), manifest);
    expect(problems.some((p: string) => /duplicate area_key/.test(p))).toBe(true);
    expect(problems.some((p: string) => /area_type/.test(p))).toBe(true);
  });

  // Fix 4: checkSeed's contract is "never throws".
  it('checkSeed("null", m) does not throw and reports a non-FeatureCollection', () => {
    const { manifest } = built();
    let problems: string[] = [];
    expect(() => {
      problems = M.checkSeed('null', manifest);
    }).not.toThrow();
    expect(problems).toContain('seed is not a FeatureCollection');
  });

  it('checkSeed on a JSON array / a non-object payload also reports a non-FeatureCollection', () => {
    const { manifest } = built();
    expect(M.checkSeed('[]', manifest)).toContain('seed is not a FeatureCollection');
    expect(M.checkSeed('42', manifest)).toContain('seed is not a FeatureCollection');
  });

  // Fix 5: geometry shape, source_feature_id and area_key agreement.
  it('checkSeed flags a geometry, a source_feature_id and an area_key disagreement', () => {
    const { manifest } = built();
    const seed = M.buildSeed(gisFc(), wardsFc());
    seed.features[0].geometry = { type: 'Point', coordinates: [-79.4, 43.7] };
    seed.features[1].geometry = { type: 'MultiPolygon', coordinates: [] };
    seed.features[2].properties.source_feature_id = '13203';
    seed.features[3].properties.area_key = 'city_gis_layer80:99999';
    const problems = M.checkSeed(M.stableStringify(seed), manifest);
    expect(problems.some((p: string) => /area_key city_gis_layer80:13201: geometry is not a MultiPolygon/.test(p))).toBe(true);
    expect(problems.some((p: string) => /area_key city_gis_layer80:13202: geometry is not a MultiPolygon/.test(p))).toBe(true);
    expect(problems.some((p: string) => /area_key city_gis_layer80:13203: source_feature_id "13203" is not a positive integer/.test(p))).toBe(true);
    expect(problems.some((p: string) => /area_key city_gis_layer80:99999: does not agree with source/.test(p))).toBe(true);
  });

  // Fix 6: a Web-Mercator payload (metres) is refused as outside the Toronto lon/lat box.
  it('checkSeed flags coordinates outside the Toronto box (a Web-Mercator payload)', () => {
    const { manifest } = built();
    const seed = M.buildSeed(gisFc(), wardsFc());
    seed.features[0].geometry = { type: 'MultiPolygon', coordinates: [[[[-8840000, 5420000], [-8839000, 5420000], [-8839000, 5421000], [-8840000, 5420000]]]] };
    const problems = M.checkSeed(M.stableStringify(seed), manifest);
    expect(problems.some((p: string) => /area_key city_gis_layer80:13201: coordinate outside the Toronto lon\/lat box \(not EPSG:4326\?\)/.test(p))).toBe(true);
    // Every other feature still sits inside the box.
    expect(problems.filter((p: string) => /coordinate outside the Toronto/.test(p))).toHaveLength(1);
  });

  it('TORONTO_BBOX contains the fixture coordinates and rejects the Web-Mercator pair', () => {
    const b = M.TORONTO_BBOX;
    expect(b).toEqual({ minLon: -79.70, maxLon: -79.10, minLat: 43.55, maxLat: 43.90 });
    expect(Object.isFrozen(b)).toBe(true);
    expect(-79.4).toBeGreaterThanOrEqual(b.minLon);
    expect(-79.4).toBeLessThanOrEqual(b.maxLon);
    expect(43.7).toBeGreaterThanOrEqual(b.minLat);
    expect(43.7).toBeLessThanOrEqual(b.maxLat);
    expect(-8840000).toBeLessThan(b.minLon);
  });
});

describe('A1 map seed: staging path (fix 1)', () => {
  it('stages under the git-ignored scripts/seeds/bylaw/.staging/map-seed (NOT under maps/)', () => {
    const src = fs.readFileSync('scripts/analysis/bylaw/map-seed.mjs', 'utf8');
    expect(src).toContain("path.join('scripts', 'seeds', 'bylaw', '.staging', 'map-seed')");
    expect(src).not.toContain("'maps', '.staging'");
    // .gitignore ignores scripts/seeds/bylaw/.staging/ (not the maps/ subdir).
    const ignored = fs.readFileSync('.gitignore', 'utf8');
    expect(ignored).toMatch(/^scripts\/seeds\/bylaw\/\.staging\/$/m);
  });
});

describe('A1 map seed: refresh empties the staging first + adopt writes the manifest last', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'map-seed-'));
  const STAGING = 'scripts/seeds/bylaw/.staging/map-seed';
  const stagingDir = path.join(tmpRoot, STAGING);
  const seedStaged = path.join(stagingDir, path.basename(M.SEED_REL));
  const manifestStaged = path.join(stagingDir, path.basename(M.MANIFEST_REL));
  const finalSeed = path.join(tmpRoot, M.SEED_REL);
  const finalManifest = path.join(tmpRoot, M.MANIFEST_REL);
  const gisGeoJson = JSON.stringify(gisFc());
  const wardsGeoJson = JSON.stringify(wardsFc());

  const fetchOk = async (url: string) => {
    if (/FeatureServer\/80/.test(url)) return new Response(gisGeoJson, { status: 200 });
    if (/package_show/.test(url)) {
      return new Response(JSON.stringify({ result: { resources: [{ format: 'GeoJSON', name: 'wards 4326', url: 'https://example.test/wards.geojson' }] } }), { status: 200 });
    }
    return new Response(wardsGeoJson, { status: 200 });
  };

  it('refresh stages under .staging/ and adopt writes the manifest LAST, both re-checked', async () => {
    await M.refresh({ root: tmpRoot, fetchImpl: fetchOk, retrySleep: async () => {}, log: () => {} });
    expect(fs.existsSync(seedStaged)).toBe(true);
    expect(fs.existsSync(manifestStaged)).toBe(true);

    const manifest = M.adopt({ root: tmpRoot });
    expect(fs.existsSync(finalSeed)).toBe(true);
    expect(fs.existsSync(finalManifest)).toBe(true);
    // The pair on disk agrees.
    expect(M.checkSeed(fs.readFileSync(finalSeed, 'utf8'), JSON.parse(fs.readFileSync(finalManifest, 'utf8')))).toEqual([]);
    expect(manifest.seed).toBe(M.SEED_REL);
    // Manifest is present after the seed: adopting again with the manifest removed re-writes it.
    fs.rmSync(finalManifest);
    M.adopt({ root: tmpRoot });
    expect(fs.existsSync(finalManifest)).toBe(true);
  });

  // Fix 2: a failed refresh removes the PREVIOUS staging so --adopt cannot pick it up.
  it('a failed refresh leaves no staging for --adopt (no stale adopt)', async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'map-seed-fail-'));
    const fetchFail = async () => new Response('nope', { status: 404 }); // <500 -> no retry, throws
    await expect(M.refresh({ root: fresh, fetchImpl: fetchFail, retrySleep: async () => {}, log: () => {} })).rejects.toThrow(/404/);
    expect(fs.existsSync(path.join(fresh, STAGING))).toBe(false);
    expect(() => M.adopt({ root: fresh })).toThrow(/no complete staging/);

    // Seed a REAL staging first, then fail a re-refresh: the stale staging must be gone.
    await M.refresh({ root: fresh, fetchImpl: fetchOk, retrySleep: async () => {}, log: () => {} });
    expect(fs.existsSync(path.join(fresh, STAGING, path.basename(M.SEED_REL)))).toBe(true);
    await expect(M.refresh({ root: fresh, fetchImpl: fetchFail, retrySleep: async () => {}, log: () => {} })).rejects.toThrow(/404/);
    expect(fs.existsSync(path.join(fresh, STAGING))).toBe(false);
  });

  it('adopt refuses a broken staging and never throws the raw TypeError from a bad manifest', () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'map-seed-adopt-'));
    fs.mkdirSync(path.join(fresh, STAGING), { recursive: true });
    fs.writeFileSync(path.join(fresh, STAGING, path.basename(M.SEED_REL)), 'not json');
    fs.writeFileSync(path.join(fresh, STAGING, path.basename(M.MANIFEST_REL)), '{}');
    expect(() => M.adopt({ root: fresh })).toThrow(/refusing to adopt/);
    // Nothing was written to the final paths.
    expect(fs.existsSync(path.join(fresh, M.SEED_REL))).toBe(false);
  });
});

describe('A1 map seed: toMulti / sha256Hex', () => {
  it('toMulti wraps a Polygon and passes a MultiPolygon through', () => {
    const poly = square(-79.4);
    expect(M.toMulti(poly)).toEqual({ type: 'MultiPolygon', coordinates: [poly.coordinates] });
    const multi = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] };
    expect(M.toMulti(multi)).toBe(multi);
  });

  it('toMulti throws on a Point and on null', () => {
    expect(() => M.toMulti({ type: 'Point', coordinates: [0, 0] })).toThrow(/unsupported geometry Point/);
    expect(() => M.toMulti(null)).toThrow(/map-seed: unsupported geometry null/);
  });

  it('sha256Hex hashes strings and buffers identically', () => {
    expect(M.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(M.sha256Hex(Buffer.from('abc', 'utf8'))).toBe(M.sha256Hex('abc'));
    expect(M.sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
