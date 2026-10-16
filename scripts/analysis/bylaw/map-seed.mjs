// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §11.3 (load_bylaw_map_areas seed)
//            docs/specs/01-pipeline/69_mcbylaw_policy.md §3 R-10 / R-10b; Spec 68 §9 G-PROV
//            .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A1)
// The 600.60 Sixplex Overlay map seed: ONE GeoJSON FeatureCollection built from two sources, pinned
// by sha256 in scripts/seeds/bylaw/maps/manifest.json. The pipeline never fetches it live
// (load_bylaw_map_areas reads the file). --refresh stages, --adopt writes the manifest LAST.
// Licence: the City GIS layer states none; operator ruling 2026-10-08 (Q-A1): local use only, recorded as
// "not stated — City of Toronto GIS, unverified"; cloud/prod publish waits for confirmation.
//
//   --refresh  fetches the City GIS layer-80 query (the 600.60 map areas) and the CKAN `city-wards`
//              package (the TEY wards + ward 23), builds the seed, and stages
//              scripts/seeds/bylaw/.staging/map-seed/{600_60.geojson,manifest.json} (git-ignored).
//              The staging is emptied FIRST, so a failed --refresh leaves no staging for --adopt.
//   --adopt    re-runs checkSeed on the staging and refuses on any problem; then atomic-writes the
//              two files to SEED_REL / MANIFEST_REL, the manifest is written last; a crash between
//              the two renames leaves a seed whose sha no longer matches its manifest, which the
//              step's sha check and bylaw-maps.infra.test.ts refuse (never a silent mix). Every
//              write is tmp + rename.
// Provenance is recorded at fetch (clock.mjs), never taken from file mtimes. Every hash is a
// content sha256. JSON outputs are sorted-key, LF, newline-terminated.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nowIso, sleep } from './clock.mjs';

export const MAP_CODE = '600.60';
export const GIS_LAYER_URL = 'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer/80';
export const GIS_QUERY = '/query?where=1%3D1&outFields=OBJECTID,ZN_STRING,CH600_AREA_TYPE,BYLAW_SECTIONLINK&outSR=4326&f=geojson';
export const CKAN_WARDS_PACKAGE = 'city-wards';
export const TEY_WARDS = Object.freeze(['04', '09', '10', '11', '12', '13', '14', '19']);
export const SCARB_NORTH_WARD = '23';
export const AREA_TYPES = Object.freeze({ 3: 'Scarborough North (Ward 23)', 4: 'Toronto and East York Community Council Area' });
export const EXPECTED_GIS_FEATURES = 18;
export const SEED_REL = 'scripts/seeds/bylaw/maps/600_60.geojson';
export const MANIFEST_REL = 'scripts/seeds/bylaw/maps/manifest.json';
/** The Toronto lon/lat box (EPSG:4326) the seed's coordinate pairs must sit inside. */
export const TORONTO_BBOX = Object.freeze({ minLon: -79.70, maxLon: -79.10, minLat: 43.55, maxLat: 43.90 });
/** Operator ruling 2026-10-08 (Q-A1): the GIS licence is not stated and is unverified. */
export const GIS_LICENCE_RULING = 'not stated — City of Toronto GIS, unverified';
/** Operator ruling 2026-10-08 (Q-A1): local use only; a cloud/prod publish waits for confirmation. */
export const GIS_PUBLISH_SCOPE = 'local_only';

const ALL_WARD_CODES = Object.freeze([...TEY_WARDS, SCARB_NORTH_WARD].sort());
const SECTION_LINK = 'Chapter600_60.htm';
// Under scripts/seeds/bylaw/.staging/ (git-ignored) so a staged seed is never committed by accident.
const STAGING_REL = path.join('scripts', 'seeds', 'bylaw', '.staging', 'map-seed');
const SEEDS_MAPS_REL = path.join('scripts', 'seeds', 'bylaw', 'maps');

/** Error raised by the map-seed CLI (message is user-facing, printed once). */
export class MapSeedError extends Error {
  constructor(code, message) {
    super(`map-seed: ${message}`);
    this.name = 'MapSeedError';
    this.code = code;
  }
}

/**
 * The overlay area types. A NUMBER test, never `in AREA_TYPES` (which walks the prototype:
 * `'toString' in AREA_TYPES` is true). Only the numbers 3 and 4 are area types. PURE.
 */
const isAreaType = (v) => v === 3 || v === 4;

/** Polygon -> MultiPolygon, MultiPolygon unchanged; anything else / null throws. PURE. */
export function toMulti(geometry) {
  const type = geometry ? geometry.type : 'null';
  if (type === 'MultiPolygon') return geometry;
  if (type === 'Polygon') return { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
  throw new MapSeedError('unsupported_geometry', `unsupported geometry ${type}`);
}

/** The GIS feature's source id (OBJECTID), as written to source_feature_id. PURE. */
function gisSourceId(props = {}) {
  const id = props.OBJECTID;
  return typeof id === 'string' && /^-?\d+$/.test(id) ? Number(id) : id;
}

/** One GIS layer-80 feature -> a seed feature. PURE. */
function gisFeature(feature) {
  const p = feature.properties || {};
  // The raw value must BE the number 3 or 4: a string ('4') or an inherited prototype key
  // ('toString') is refused rather than coerced.
  if (typeof p.CH600_AREA_TYPE !== 'number' || !isAreaType(p.CH600_AREA_TYPE)) {
    throw new MapSeedError('bad_area_type', `GIS OBJECTID ${p.OBJECTID} has CH600_AREA_TYPE ${JSON.stringify(p.CH600_AREA_TYPE)} (expected 3 or 4)`);
  }
  if (p.BYLAW_SECTIONLINK !== SECTION_LINK) {
    throw new MapSeedError('bad_section_link', `GIS OBJECTID ${p.OBJECTID} has BYLAW_SECTIONLINK ${JSON.stringify(p.BYLAW_SECTIONLINK)} (expected ${SECTION_LINK})`);
  }
  const area_type = Number(p.CH600_AREA_TYPE);
  const id = gisSourceId(p);
  return {
    type: 'Feature',
    geometry: toMulti(feature.geometry),
    properties: {
      area_key: `city_gis_layer80:${id}`,
      map_code: MAP_CODE,
      source: 'city_gis_layer80',
      source_feature_id: id,
      area_type,
      area_name: p.ZN_STRING,
    },
  };
}

/** One CKAN ward feature -> a seed feature, or null when the ward is not part of the overlay. PURE. */
function wardFeature(feature) {
  const p = feature.properties || {};
  const raw = p.AREA_SHORT_CODE;
  const code = raw === undefined || raw === null ? '' : String(raw);
  const kept = TEY_WARDS.includes(code) || code === SCARB_NORTH_WARD;
  if (!kept) return null;
  const area_type = code === SCARB_NORTH_WARD ? 3 : 4;
  const id = Number(code);
  return {
    type: 'Feature',
    geometry: toMulti(feature.geometry),
    properties: {
      area_key: `ckan_wards_2018:${id}`,
      map_code: MAP_CODE,
      source: 'ckan_wards_2018',
      source_feature_id: id,
      area_type,
      area_name: p.AREA_DESC,
    },
  };
}

/**
 * The seed FeatureCollection: 18 GIS areas + the 9 overlay wards, sorted by area_key.
 * Validates shape; throws MapSeedError on a bad input. Never mutates the inputs. PURE.
 */
export function buildSeed(gisFc, wardsFc) {
  const gis = Array.isArray(gisFc && gisFc.features) ? gisFc.features : null;
  if (!gis) throw new MapSeedError('bad_gis_fc', 'GIS FeatureCollection has no features[]');
  if (gis.length !== EXPECTED_GIS_FEATURES) throw new MapSeedError('gis_count', `expected ${EXPECTED_GIS_FEATURES} GIS features, got ${gis.length}`);
  const wards = Array.isArray(wardsFc && wardsFc.features) ? wardsFc.features : null;
  if (!wards) throw new MapSeedError('bad_wards_fc', 'wards FeatureCollection has no features[]');

  const features = gis.map(gisFeature);
  const keptCodes = new Set();
  for (const f of wards) {
    const p = (f || {}).properties || {};
    const code = p.AREA_SHORT_CODE === undefined || p.AREA_SHORT_CODE === null ? '' : String(p.AREA_SHORT_CODE);
    if (TEY_WARDS.includes(code) || code === SCARB_NORTH_WARD) keptCodes.add(code);
  }
  const missing = ALL_WARD_CODES.filter((c) => !keptCodes.has(c));
  if (missing.length) throw new MapSeedError('wards_missing', `wards missing ${missing.join(',')} (expected the 8 TEY wards + ${SCARB_NORTH_WARD})`);
  const extra = [...keptCodes].filter((c) => !ALL_WARD_CODES.includes(c));
  if (extra.length) throw new MapSeedError('wards_extra', `unexpected overlay ward(s) ${extra.join(',')}`);

  for (const f of wards) {
    const row = wardFeature(f);
    if (row) features.push(row);
  }
  const byKey = (a, b) => (a.properties.area_key < b.properties.area_key ? -1 : a.properties.area_key > b.properties.area_key ? 1 : 0);
  features.sort(byKey);
  return { type: 'FeatureCollection', features };
}

/** JSON with every object's keys sorted. `indent` 0 -> one line; the manifest uses 2 + LF + newline. PURE. */
export function stableStringify(value, { indent = 0 } = {}) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v === null || typeof v !== 'object') return v;
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  };
  return `${JSON.stringify(sortKeys(value), null, indent)}${indent ? '\n' : ''}`;
}

/** Content sha256 of a Buffer or string. PURE. */
export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Content md5 of a Buffer or string. PURE.
 *
 * The step library's acquisition content hash is md5 (scripts/lib/step/acquire.js
 * DEFAULT_CONTENT_HASH_ALGORITHM), so load_bylaw_map_areas' `seed_hash_matches_manifest`
 * compares `ctx.acquired.content_hash` against the manifest's `seed_md5` — sha256 alone
 * could never match it. The sha256 stays the PROVENANCE pin; the md5 is the library's pin.
 */
export function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * The seed manifest: sha256 + md5 + byte count of the seed text, the two source URLs and raw shas, and
 * the licence statements exactly as recorded at fetch (the operator's Q-A1 ruling of 2026-10-08:
 * local use only, the GIS licence "not stated — City of Toronto GIS, unverified"). PURE.
 */
export function buildManifest({ seedText, gisUrl, wardsUrl, gisRawSha, wardsRawSha, fetchedAt }) {
  if (!fetchedAt) throw new MapSeedError('no_fetched_at', 'fetchedAt is required (recorded at fetch, never from mtimes)');
  return {
    map_code: MAP_CODE,
    seed: SEED_REL,
    seed_sha256: sha256Hex(seedText),
    // The step library hashes the bytes it copies with md5 (scripts/lib/step/acquire.js
    // DEFAULT_CONTENT_HASH_ALGORITHM), and load_bylaw_map_areas' pre_write check
    // seed_hash_matches_manifest compares acquired.content_hash with this seed_md5 — so the
    // manifest records it beside seed_sha256.
    seed_md5: crypto.createHash('md5').update(seedText).digest('hex'),
    seed_bytes: Buffer.byteLength(seedText, 'utf8'),
    fetched_at: fetchedAt,
    sources: [
      {
        source: 'city_gis_layer80',
        url: gisUrl,
        raw_sha256: gisRawSha,
        feature_count: EXPECTED_GIS_FEATURES,
        licence: {
          stated: 'none',
          ruling: GIS_LICENCE_RULING,
          ruled_on: '2026-10-08',
          publish_scope: GIS_PUBLISH_SCOPE,
          publish_note: 'cloud/prod publish waits until the licence is confirmed (operator 2026-10-08)',
        },
      },
      {
        source: 'ckan_wards_2018',
        url: wardsUrl,
        raw_sha256: wardsRawSha,
        ward_codes: [...ALL_WARD_CODES],
        licence: { stated: 'Open Government Licence - Toronto', ruling: 'n/a' },
      },
    ],
    area_types: AREA_TYPES,
  };
}

/** The set of ward codes in the seed's ckan_wards_2018 features, sorted. PURE. */
function seedWardCodes(features) {
  return features
    .filter((f) => ((f || {}).properties || {}).source === 'ckan_wards_2018')
    .map((f) => String(f.properties.AREA_SHORT_CODE ?? String(f.properties.source_feature_id).padStart(2, '0')))
    .sort();
}

/** True when a coordinate pair is finite and inside TORONTO_BBOX. PURE. */
function inTorontoBox(lon, lat) {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= TORONTO_BBOX.minLon &&
    lon <= TORONTO_BBOX.maxLon &&
    lat >= TORONTO_BBOX.minLat &&
    lat <= TORONTO_BBOX.maxLat
  );
}

/** True when `geometry` is {type:'MultiPolygon', coordinates:[<non-empty rings>]}. PURE. */
function isMultiPolygon(geometry) {
  return !!geometry && geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
}

/** Walk every [lon, lat] pair in a MultiPolygon; false on the first pair outside the box. PURE. */
function coordinatesInBox(coordinates) {
  for (const polygon of coordinates) {
    if (!Array.isArray(polygon)) return false;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) return false;
      for (const pair of ring) {
        if (!Array.isArray(pair) || !inTorontoBox(pair[0], pair[1])) return false;
      }
    }
  }
  return true;
}

/**
 * The seed-vs-manifest check. Returns the problem strings (empty = ok). NEVER THROWS: bad JSON, a
 * non-object JSON payload, a bogus feature, a bad geometry, a forged area_key and an out-of-box
 * coordinate all come back as problems, not exceptions.
 * Catches a tampered seed, a wrong feature count, a wrong seed_md5 (the step library's own content
 * hash — acquire.js hashes md5), an area_type outside the numbers {3,4}, a
 * duplicate key, a geometry that is not a MultiPolygon, a source_feature_id that is not a positive
 * integer, an area_key that disagrees with source + source_feature_id, coordinates outside the
 * Toronto box (e.g. a Web-Mercator payload), and a ward set that is not the 8 TEY wards + 23.
 */
export function checkSeed(seedText, manifest) {
  const problems = [];
  if (typeof seedText !== 'string' || seedText.length === 0) return ['seed text is empty'];
  if (!manifest || typeof manifest !== 'object') return ['manifest is missing'];
  const sha = sha256Hex(seedText);
  if (manifest.seed_sha256 !== sha) problems.push(`seed sha256 ${sha} != manifest ${manifest.seed_sha256}`);
  // md5 is the step library's own content-hash algorithm, so seed_hash_matches_manifest can
  // only ever match an md5; a differing seed_md5 refuses the seed.
  const md5 = crypto.createHash('md5').update(seedText).digest('hex');
  if (manifest.seed_md5 !== md5) problems.push(`seed md5 ${md5} != manifest ${manifest.seed_md5}`);
  if (manifest.seed_bytes !== undefined && manifest.seed_bytes !== Buffer.byteLength(seedText, 'utf8')) {
    problems.push(`seed bytes ${Buffer.byteLength(seedText, 'utf8')} != manifest ${manifest.seed_bytes}`);
  }
  let seed;
  try {
    seed = JSON.parse(seedText);
  } catch (err) {
    problems.push(`seed is not JSON: ${err && err.message ? err.message : String(err)}`);
    return problems;
  }
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    problems.push('seed is not a FeatureCollection');
    return problems;
  }
  const features = Array.isArray(seed.features) ? seed.features : null;
  if (!features) {
    problems.push('seed has no features[]');
    return problems;
  }
  const gis = features.filter((f) => ((f || {}).properties || {}).source === 'city_gis_layer80');
  const wards = features.filter((f) => ((f || {}).properties || {}).source === 'ckan_wards_2018');
  const other = features.length - gis.length - wards.length;
  if (other) problems.push(`${other} feature(s) with an unknown source`);
  if (gis.length !== EXPECTED_GIS_FEATURES) problems.push(`expected ${EXPECTED_GIS_FEATURES} GIS features, got ${gis.length}`);
  if (wards.length !== TEY_WARDS.length + 1) problems.push(`expected ${TEY_WARDS.length + 1} ward features, got ${wards.length}`);

  const seen = new Set();
  for (const f of features) {
    const p = (f || {}).properties || {};
    const key = p.area_key;
    if (!isAreaType(p.area_type)) problems.push(`area_key ${key}: area_type ${JSON.stringify(p.area_type)} outside {3,4}`);
    if (p.map_code !== MAP_CODE) problems.push(`area_key ${key}: map_code ${JSON.stringify(p.map_code)} != ${MAP_CODE}`);
    if (seen.has(key)) problems.push(`duplicate area_key ${key}`);
    seen.add(key);

    if (!isMultiPolygon((f || {}).geometry)) {
      problems.push(`area_key ${key}: geometry is not a MultiPolygon with a non-empty coordinates array`);
    } else if (!coordinatesInBox(f.geometry.coordinates)) {
      problems.push(`area_key ${key}: coordinate outside the Toronto lon/lat box (not EPSG:4326?)`);
    }

    const fid = p.source_feature_id;
    if (typeof fid !== 'number' || !Number.isInteger(fid) || fid <= 0) {
      problems.push(`area_key ${key}: source_feature_id ${JSON.stringify(fid)} is not a positive integer`);
    }
    if (key !== `${p.source}:${p.source_feature_id}`) {
      problems.push(`area_key ${key}: does not agree with source ${JSON.stringify(p.source)} + source_feature_id ${JSON.stringify(p.source_feature_id)}`);
    }
  }
  const codes = seedWardCodes(features);
  const missing = ALL_WARD_CODES.filter((c) => !codes.includes(c));
  const extra = codes.filter((c) => !ALL_WARD_CODES.includes(c));
  if (missing.length) problems.push(`ward codes missing ${missing.join(',')}`);
  if (extra.length) problems.push(`unexpected ward codes ${extra.join(',')}`);

  // The GIS licence ruling is a gate, not a datum: a manifest can never silently claim a
  // publishable licence. The ruling must be a non-empty string and the scope must be local_only.
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const gisSource = sources.find((s) => (s || {}).source === 'city_gis_layer80');
  if (!gisSource) {
    problems.push('manifest has no city_gis_layer80 source (its licence ruling cannot be checked)');
  } else {
    const licence = (gisSource || {}).licence || {};
    if (typeof licence.ruling !== 'string' || licence.ruling.trim().length === 0) {
      problems.push(`city_gis_layer80 licence ruling ${JSON.stringify(licence.ruling)} is not a non-empty string`);
    }
    if (licence.publish_scope !== GIS_PUBLISH_SCOPE) {
      problems.push(`city_gis_layer80 licence publish_scope ${JSON.stringify(licence.publish_scope)} != ${JSON.stringify(GIS_PUBLISH_SCOPE)}`);
    }
  }
  return problems;
}

/** Resolve a repo-relative path under `root`. PURE. */
export function relUnder(root, rel) {
  return path.join(root, rel);
}

/** --refresh: fetch both sources, build, stage. Returns the staging summary. NOT pure (network + fs). */
export async function refresh({ root, fetchImpl, nowIso: clock = nowIso, retrySleep = sleep, log = () => {} }) {
  const gisUrl = `${GIS_LAYER_URL}${GIS_QUERY}`;
  // Empty the staging BEFORE any fetch: a failed refresh must leave no staging for --adopt to
  // pick up (otherwise --adopt would adopt the PREVIOUS refresh's seed after a failed re-run).
  const staging = relUnder(root, STAGING_REL);
  fs.rmSync(staging, { recursive: true, force: true });

  const gisRaw = await fetchWithRetry(gisUrl, { fetchImpl, retrySleep });
  const gisFc = JSON.parse(gisRaw.toString('utf8'));

  const pkg = await fetchJsonWithRetry(`https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=${CKAN_WARDS_PACKAGE}`, { fetchImpl, retrySleep });
  const resource = pickWardsResource(pkg);
  const wardsRaw = await fetchWithRetry(resource.url, { fetchImpl, retrySleep });
  const wardsFc = JSON.parse(wardsRaw.toString('utf8'));

  const fetchedAt = clock();
  const seed = buildSeed(gisFc, wardsFc);
  const seedText = stableStringify(seed);
  const manifest = buildManifest({
    seedText,
    gisUrl,
    wardsUrl: resource.url,
    gisRawSha: sha256Hex(gisRaw),
    wardsRawSha: sha256Hex(wardsRaw),
    fetchedAt,
  });
  const problems = checkSeed(seedText, manifest);
  if (problems.length) throw new MapSeedError('seed_invalid', `the built seed does not check out: ${problems.join('; ')}`);
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, path.basename(SEED_REL)), seedText);
  fs.writeFileSync(path.join(staging, path.basename(MANIFEST_REL)), stableStringify(manifest, { indent: 2 }));
  log(`refreshed ${seed.features.length} areas (${EXPECTED_GIS_FEATURES} GIS + ${TEY_WARDS.length + 1} wards) -> ${STAGING_REL}`);
  return { staging, manifest, featureCount: seed.features.length };
}

/**
 * --adopt: re-check the staging, write the seed, write the manifest LAST, then re-read BOTH from
 * their final paths and checkSeed them again. A crash between the two renames leaves a seed whose
 * sha no longer matches its manifest; the step's sha check and bylaw-maps.infra.test.ts refuse that
 * (never a silent mix). Any post-write problem throws MapSeedError('adopt_verify'). NOT pure.
 */
export function adopt({ root }) {
  const staging = relUnder(root, STAGING_REL);
  const seedFile = path.join(staging, path.basename(SEED_REL));
  const manifestFile = path.join(staging, path.basename(MANIFEST_REL));
  if (!fs.existsSync(seedFile) || !fs.existsSync(manifestFile)) {
    throw new MapSeedError('no_staging', `no complete staging at ${STAGING_REL} (run --refresh first)`);
  }
  const seedText = fs.readFileSync(seedFile, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const problems = checkSeed(seedText, manifest);
  if (problems.length) throw new MapSeedError('staging_refused', `refusing to adopt: ${problems.join('; ')}`);

  const seedTarget = relUnder(root, SEED_REL);
  const manifestTarget = relUnder(root, MANIFEST_REL);
  writeAtomic(seedTarget, seedText);
  writeAtomic(manifestTarget, stableStringify(manifest, { indent: 2 }));

  // Re-read BOTH from their final paths and re-check: the pair as it now stands on disk is the
  // contract, not what we intended to write.
  const verify = checkSeed(fs.readFileSync(seedTarget, 'utf8'), JSON.parse(fs.readFileSync(manifestTarget, 'utf8')));
  if (verify.length) throw new MapSeedError('adopt_verify', `adopt wrote a seed/manifest pair that does not check out: ${verify.join('; ')}`);
  return manifest;
}

/** Atomic file write: tmp file in the same directory, then rename. */
export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

async function fetchWithRetry(url, { fetchImpl, retrySleep, attempts = 3 }) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Buildo-McBylaw/1 (bylaw map seed; polite)' },
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 200) return Buffer.from(await res.arrayBuffer());
      lastErr = new MapSeedError('http_status', `${url}: HTTP ${res.status}`);
      if (res.status < 500) break;
    } catch (err) {
      lastErr = new MapSeedError('fetch_error', `${url}: ${err && err.message ? err.message : String(err)}`);
    }
    if (i < attempts - 1) await retrySleep(1000 * 2 ** (i + 1));
  }
  throw lastErr;
}

async function fetchJsonWithRetry(url, opts) {
  return JSON.parse((await fetchWithRetry(url, opts)).toString('utf8'));
}

/** The CKAN resource holding the ward polygons: format GeoJSON, name mentions 4326. PURE. */
export function pickWardsResource(pkg, packageName = CKAN_WARDS_PACKAGE) {
  const resources = (pkg && pkg.result && Array.isArray(pkg.result.resources) ? pkg.result.resources : null) || [];
  const hit = resources.find((r) => String((r || {}).format).toLowerCase() === 'geojson' && /4326/.test(String((r || {}).name)));
  if (!hit) throw new MapSeedError('no_wards_resource', `${packageName}: no GeoJSON resource with 4326 in its name`);
  return { url: hit.url, name: hit.name };
}

const SPEC68 = 'docs/specs/01-pipeline/68_mcbylaw_standard.md';

async function main() {
  const argv = process.argv.slice(2);
  const isRefresh = argv.includes('--refresh');
  const isAdopt = argv.includes('--adopt');
  if (isRefresh === isAdopt) {
    console.error('usage: map-seed.mjs --refresh | --adopt');
    return 2;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  if (isRefresh) {
    const { featureCount, manifest } = await refresh({ root, fetchImpl: fetch, log: (m) => console.log(m) });
    console.log(`staged ${featureCount} areas, seed sha256 ${manifest.seed_sha256.slice(0, 12)}… (${SPEC68} §9 G-PROV)`);
    return 0;
  }
  const manifest = adopt({ root });
  console.log(`adopted ${SEED_REL} (${manifest.seed_bytes} B, sha256 ${manifest.seed_sha256.slice(0, 12)}…) + ${MANIFEST_REL}`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err instanceof MapSeedError ? err.message : err && err.stack ? err.stack : String(err));
      process.exitCode = 2;
    },
  );
}
