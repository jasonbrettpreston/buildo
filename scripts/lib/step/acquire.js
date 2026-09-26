/**
 * `ctx.acquire` — THE ACQUISITION SEAM (Spec 122 §1.5, ruling A-2, LG-4).
 *
 * Spec 122 §1.5 concedes that `acquisition` is a P0 MISSING CATEGORY. Ruling A-2
 * declined to make it a 19th descriptor category and put it here instead, driven
 * entirely by data the descriptor already carries: `inputs.reads.externals[]` says
 * WHAT to fetch and with what cache policy, `staleness.trigger[].position` says
 * WHERE in the lifecycle each gate fires, `execution.network.timeout` says how long
 * to wait. Nothing in this file names a step.
 *
 * WHY IT CANNOT LIVE IN A COMPUTE: `scripts/ast-grep-rules/compute-shape.yml`
 * (`compute-forbidden-require`) bans `fs`, `child_process`, `pg` and the runner
 * from `scripts/lib/compute/**`. A loader needs a temp dir, a streamed download, an
 * unzip and a shapefile reader — six `fs` call sites and two fs-bound libraries. So
 * acquisition had NO legal home before this file: the filesystem is the fifth seam
 * and Spec 123 §6 G5 does not even enumerate it.
 *
 * ⚠️ FENCE 0b230472 (Severity HIGH) LIVES HERE NOW, and this is its ONE home.
 * Three constructs move together and are locked in both directions by
 * src/tests/steps/load_ravines/violations.test.ts:
 *   1. STREAMED HASH-THROUGH-TO-DISK. The bytes are hashed AS THEY LAND and never
 *      buffered whole (Spec 43 §9.5 bans `Buffer.from(await res.<whole-body>())`
 *      and a whole-file read of the archive). `hashThrough` is the generator that
 *      makes it one pass instead of two.
 *   2. md5 IS PINNED. The digest is compared against prior runs' stored
 *      `content_hash` baselines and is also written to the domain table as the
 *      dataset version; changing the algorithm invalidates every baseline and
 *      forces a full reload of every class-B target. It is descriptor data
 *      (`staleness.trigger[].hash`) so the compatibility constraint is visible.
 *   3. THE TIER-2 CONTENT-HASH GATE. Tier-1 compared HTTP metadata BEFORE the
 *      download and said "changed"; the bytes may still be identical, because CKAN
 *      re-stamps `last-modified` on files whose content never moved. `tier2` skips
 *      the extract/parse/write when the hash matches, and re-emits the prior run's
 *      block through `buildSkipReEmitMeta` so the skip STILL lands a `completed`
 *      row — downstream HALT gates read completed rows (DS4).
 *
 * The temp root is created here, owned here, and removed in a `finally` here. A
 * leaked temp dir per run is a disk defect, not a style point.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5, §5.5 (3)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §9.5
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline: streamPipeline } = require('stream/promises');
const StreamZip = require('node-stream-zip');
const shapefile = require('shapefile');
const { parse } = require('csv-parse');

const sourceVersion = require('../source-version');
const { triggersAt } = require('./staleness');

/** Pinned by fence 0b230472 — see header item 2. Overridable per trigger, never per call site. */
const DEFAULT_CONTENT_HASH_ALGORITHM = 'md5';

/** The temp-root prefix. Step-agnostic on purpose: the slug is appended by the caller. */
const TMP_PREFIX = 'step-acquire-';

/** ms per HTTP `duration` unit, for `execution.network.timeout`. */
const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

/** `"60000ms"` → 60000; `"none"` / unparseable → null. */
function parseDuration(text) {
  const m = /^([0-9]+)(ms|s|m|h)$/.exec(String(text || ''));
  return m ? Number(m[1]) * DURATION_UNITS[m[2]] : null;
}

/**
 * THE ACQUISITION TIMEOUT, FROM ONE SOURCE (peel 8c).
 *
 * `execution.network.timeout` and a `*_download_timeout_ms` logic variable were the same
 * number written twice: descriptor data (P1.1 — a reader must see the bound without a
 * database) and an operator knob (P4 — a hard-coded knob is a hidden variable). Two
 * literals that must agree is an invitation to drift, and the drift is invisible because
 * only one of them is ever executed.
 *
 * The resolution is ruling A-4's, generalized past `checks[].limit_from_config`: the
 * DESCRIPTOR DERIVES FROM CONFIG. `timeout_from_config` names the variable, the resolved
 * value wins, and the `timeout` literal is the STATED fallback for a database that has not
 * been seeded yet — byte-equal to the seed default, which the step's conformance lock
 * asserts. A step that declares no `timeout_from_config` behaves exactly as before.
 *
 * @param {object} descriptor
 * @param {Record<string, number>|null} config - `ctx.config`
 * @returns {number|null} milliseconds, or null for `network: "none"` / an unparseable literal
 */
function resolveTimeoutMs(descriptor, config) {
  const net = descriptor.execution && descriptor.execution.network;
  if (!net || net === 'none') return null;
  const name = net.timeout_from_config;
  if (name && name !== 'none' && config) {
    const value = config[name];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return parseDuration(net.timeout);
}

/**
 * THE DOWNLOAD RETRY POLICY, FROM ONE SOURCE (peel 0q, INGESTOR prerequisite 0q, 2026-09-24).
 *
 * `execution.network.retries` has been a FROZEN schema field since S1 with NO reader
 * anywhere in `scripts/lib/` (measured 2026-09-24), and the seam's one download call
 * made exactly ONE attempt. The legacy loaders did NOT retry: `load-neighbourhoods.js`'s
 * `downloadFile` — and its copies in load-address-points / load-parcels / load-massing —
 * made ONE attempt (Fold G-4, 2026-09-25, MEASURED: no retry loop in any of them); only
 * `load-centreline.js`'s `downloadZipWithRetry` retried, THREE times with no backoff.
 * Cloud run 34769829628 (2026-09-13) died on a single `HTTP 502` at step 17/28 and 11
 * downstream steps never ran.
 *
 * This is `resolveTimeoutMs`'s own shape generalized to the retry family (ruling A-4): a
 * `*_from_config` name derives from a REGISTERED logic variable (Rule 3 — a hard-coded
 * knob is a hidden variable), and the `retries` literal is the STATED fallback for a
 * database that has not been seeded. `config` may be null/undefined (no DB, a unit call):
 * a named variable wins iff its resolved value is a non-negative integer; otherwise the
 * literal, otherwise 0. `backoffMs` comes only from `retry_backoff_from_config` (a
 * finite ≥ 0 value), defaulting to 0 — a step that declares no `*_from_config` behaves
 * exactly as before.
 *
 * @param {object} descriptor
 * @param {Record<string, number>|null|undefined} config - `ctx.config`
 * @returns {{retries: number, backoffMs: number}}
 */
function resolveRetryPolicy(descriptor, config) {
  const net = descriptor.execution && descriptor.execution.network;
  if (!net || net === 'none') return { retries: 0, backoffMs: 0 };
  const cfg = config || {};
  let retries;
  const retryName = net.retries_from_config;
  if (retryName === 'none') {
    // The literal "none" disables retries OUTRIGHT — it is not "no named variable, so
    // fall back to the descriptor literal" (that is the `retryName` undefined/absent
    // case, two lines below). A step that declares `retries_from_config: "none"` means
    // it, even if `execution.network.retries` still carries a non-zero literal.
    retries = 0;
  } else {
    const retryValue = retryName ? cfg[retryName] : undefined;
    if (Number.isInteger(retryValue) && retryValue >= 0) retries = retryValue;
    else if (Number.isInteger(net.retries) && net.retries >= 0) retries = net.retries;
    else retries = 0;
  }
  let backoffMs;
  const backoffName = net.retry_backoff_from_config;
  const backoffValue = backoffName && backoffName !== 'none' ? cfg[backoffName] : undefined;
  if (typeof backoffValue === 'number' && Number.isFinite(backoffValue) && backoffValue >= 0) backoffMs = backoffValue;
  else backoffMs = 0;
  return { retries, backoffMs };
}

/**
 * ⚠️ THE NULL TIMEOUT IS "NO DEADLINE", NOT "ZERO MILLISECONDS".
 *
 * `resolveTimeoutMs` returns null for `network: "none"` and for an unparseable
 * `execution.network.timeout` literal — and `setTimeout(fn, null)` coerces to 0, so the
 * abort fired on the next tick and every fetch failed instantly with an `AbortError`. The
 * failure mode is the worst shape available: a descriptor typo in a duration string turned
 * into "the publisher is unreachable", which the tier-1 gate reports as a HEAD failure
 * rather than as the configuration defect it is. No timer at all is the correct reading of
 * "no declared deadline"; a step that wants one declares a parseable duration.
 *
 * @returns {NodeJS.Timeout|null} null when no deadline was declared — callers must
 *   `if (t) clearTimeout(t)`, because clearing null is a no-op that reads as an oversight.
 */
function abortTimer(ctrl, timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
}

/**
 * HEAD the external and return its cache validators, or throw on 4xx/5xx.
 * This is the ONLY network call a `pre_acquisition` trigger needs, and it is made
 * even when the gate ends up skipping — the dataset-age row is derived from it, so
 * the row appears on the skip path and on every downstream failure path too.
 */
async function headValidators(ctxFetch, url, timeoutMs) {
  const ctrl = new AbortController();
  const t = abortTimer(ctrl, timeoutMs);
  try {
    const res = await ctxFetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HEAD ${res.status} ${res.statusText}`);
    return { lastModified: res.headers.get('last-modified'), etag: res.headers.get('etag') };
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Download to `destPath`, hashing the bytes as they stream through (header item 1).
 * Returns the digest and whatever validators the GET response carried — a CDN that
 * strips them on HEAD sometimes still sends them on GET.
 */
async function downloadArchive(ctxFetch, url, destPath, timeoutMs, algorithm) {
  const ctrl = new AbortController();
  const t = abortTimer(ctrl, timeoutMs);
  try {
    const res = await ctxFetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`GET ${res.status} ${res.statusText}`);
    const hash = crypto.createHash(algorithm);
    let bytes = 0;
    await streamPipeline(
      Readable.fromWeb(res.body),
      async function* hashThrough(source) {
        for await (const chunk of source) {
          hash.update(chunk);
          bytes += chunk.length;
          yield chunk;
        }
      },
      fs.createWriteStream(destPath),
    );
    return {
      archivePath: destPath,
      contentHash: hash.digest('hex'),
      bytesDownloaded: bytes,
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
    };
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * DOWNLOAD WITH RETRIES (INGESTOR prerequisite 0q, 2026-09-24) — the retry loop the
 * legacy loaders ran by hand, promoted into the seam.
 *
 * `downloadArchive`'s own body is UNTOUCHED (FENCE 0b230472, measured byte-identical):
 * this function CALLS it, once per attempt. The contract is DOWNLOAD-ONLY — `headValidators`
 * is never retried (a HEAD is cheap and 502-prone for different reasons; the legacy loop
 * did not retry it either).
 *
 * `attempts = retries + 1` (so `retries: 0` — the default, and the pre-0q behaviour — is
 * EXACTLY one attempt, no WARN). On any attempt's failure: WARN once (tag + attempt/total
 * + the error message), remove the partial `destPath` (`force: true` — an attempt that
 * errored mid-stream must never leave truncated bytes behind for the next attempt to see
 * or for a later gate to parse), and sleep `backoffMs` — but NEVER after the last attempt
 * (no point sleeping before a rethrow). The LAST error is rethrown, never swallowed. The
 * successful return is `downloadArchive`'s own object plus `attempts`.
 *
 * `sleep` is injectable for tests (default: a real `setTimeout` promise); `backoffMs === 0`
 * never sleeps at all.
 *
 * @returns {Promise<object>} `downloadArchive`'s `{archivePath, contentHash, bytesDownloaded,
 *   lastModified, etag}` plus `attempts`.
 */
async function downloadWithRetries(ctxFetch, url, destPath, timeoutMs, algorithm, { retries = 0, backoffMs = 0, log, tag, sleep } = {}) {
  const attempts = (Number.isInteger(retries) && retries >= 0 ? retries : 0) + 1;
  const doSleep = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const dl = await downloadArchive(ctxFetch, url, destPath, timeoutMs, algorithm);
      return { ...dl, attempts: i };
    } catch (err) {
      lastErr = err;
      // WARN only when there is a NEXT attempt to explain — a `retries: 0` single
      // attempt that fails is not a "retry" (it never had a budget), so it rethrows
      // silently through this same catch with no WARN, exactly as before 0q.
      if (log && i < attempts) log.warn(tag, `download attempt ${i}/${attempts} failed: ${err.message}`);
      fs.rmSync(destPath, { force: true });
      if (backoffMs > 0 && i < attempts) await doSleep(backoffMs);
    }
  }
  throw lastErr;
}

/** Extract cross-platform (never a shell) and return the entry names. */
async function extractArchive(archivePath, destDir) {
  const zip = new StreamZip.async({ file: archivePath });
  try {
    fs.mkdirSync(destDir, { recursive: true });
    await zip.extract(null, destDir);
    return Object.keys(await zip.entries());
  } finally {
    await zip.close();
  }
}

/**
 * Locate the single shapefile in an extracted dir. FAIL loud on zero, on more than
 * one, and on a missing companion `.dbf` — a shapefile without its attribute table
 * parses to features with no properties, which is silently zero source ids.
 * Case-insensitive: publishers ship `.SHP` and `.shp` interchangeably.
 */
function locateShapefile(extractDir) {
  const files = fs.readdirSync(extractDir);
  const shps = files.filter((f) => f.toLowerCase().endsWith('.shp'));
  if (shps.length === 0) throw new Error('no shapefile (.shp) found in zip');
  if (shps.length > 1) throw new Error(`expected one .shp, found ${shps.length}: ${shps.join(', ')}`);
  const shp = shps[0];
  const base = shp.slice(0, -4);
  const dbf = files.find((f) => f.toLowerCase() === `${base.toLowerCase()}.dbf`);
  if (!dbf) throw new Error(`missing companion .dbf for ${shp}`);
  return { shpPath: path.join(extractDir, shp), dbfPath: path.join(extractDir, dbf) };
}

/**
 * Parse a shapefile into `[{ key, geojson, record }]`, tallying the two loss modes
 * the audit table has to see: a property that will not coerce to a positive key, and
 * a null geometry. Neither is fabricated into a row.
 *
 * ⚠️ `record` IS THE DBF PROPERTIES OBJECT — the SAME field `parseCsv` carries. A
 * shapefile INGESTOR with attribute columns (load_centreline: 15 DBF columns; massing:
 * footprint attributes) binds them through `compute.shapeRecord(record, { geojson })`
 * exactly as a CSV step does. Before this the shapefile arm kept ONLY `{key, geojson}`,
 * so a per-feature attribute filter could not be expressed at all.
 *
 * @param {(raw: unknown, ctx: {geojson: string|null}) => number|string|null} coerceKey - the
 *   step's own pure coercion, handed in from the compute module so the parse stays
 *   domain-free. The 2nd argument is DATA ONLY (`{ geojson }` — the string built once from
 *   the feature's geometry, reused by the push; Rule 2), which is what makes a
 *   geometry-derived key (massing's `hash_`) expressible without `crypto` reaching this file.
 * @returns {Promise<{features: Array<{[keyColumn]: number, geojson: string, record: object}>, badKey: number, nullGeometry: number, rowsParsed: number}>}
 *   `rowsParsed` (INGESTOR prerequisite 0o, 2026-09-24) is EVERY feature the source
 *   handed back, counted BEFORE the `badKey`/`nullGeometry` filters below drop a row —
 *   the raw count `ctx.acquired.rows_read` reports, as distinct from `features.length`
 *   (the post-filter kept count `feature_count` already reports).
 */
async function parseShapefile(shpPath, dbfPath, keyProperty, coerceKey, keyColumn) {
  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  let badKey = 0;
  let nullGeometry = 0;
  let rowsParsed = 0;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    rowsParsed++;
    const props = r.value.properties || {};
    // ── 0s: A GEOMETRY-DERIVED KEY IS REACHABLE (2026-09-24) ────────────────────
    // The founding case is row 3.6 `massing`: its shapefile carries NO id column, so the
    // legacy loader derives the primary key FROM the geometry (`scripts/load-massing.js`:
    // `'hash_' + crypto.createHash('md5').update(JSON.stringify(feature.geometry))
    // .digest('hex').substring(0, 12)`). Calling `coerceKey(props[keyProperty])` alone made
    // that rule inexpressible — it returned null for every feature, which is dropped as a
    // bad key BEFORE the geometry is ever visible. The context is `{ geojson }` and nothing
    // else (Rule 2): DATA, not a service — so the parse stays domain-free and `crypto` is
    // never imported here. Built ONCE, reused by the push below (one stringify per feature),
    // and every existing 1-arg `coerceKey` ignores the extra argument, byte-identically.
    const geojson = r.value.geometry == null ? null : JSON.stringify(r.value.geometry);
    const key = coerceKey(props[keyProperty], { geojson });
    if (key == null) { badKey++; continue; }
    if (r.value.geometry == null) { nullGeometry++; continue; }
    // Keyed by the DECLARED key column (`outputs.writes[].key`), so the step's own
    // pure dedupe helper reads the same field name its descriptor declares. `record`
    // carries the DBF properties verbatim — the ONE seam `compute.shapeRecord` reads.
    features.push({ [keyColumn]: key, geojson, record: props });
  }
  return { features, badKey, nullGeometry, rowsParsed };
}

/**
 * Parse a CSV into the SAME feature shape `parseShapefile` returns — one parsed record
 * per feature, keyed by the DECLARED key column, `record` carrying the parsed row.
 *
 * ⚠️ `record` IS NOT `geojson`. A shapefile hands the seam a geometry object and
 * `parseShapefile` stringifies it into the `geojson` field the write plan's
 * `bind: "wkb_geometry"` column validates (and, since 0f, ALSO onto `record`). A CSV
 * row's geometry is whatever
 * publisher put in a column, and only the STEP knows which column that is — so the
 * whole record travels through and `compute.shapeRecord` (the INGESTOR runner's
 * shape-mapping seam, see `runIngestPhase`) maps it to the columns the write plan
 * binds. Parsing stays domain-free here for the same reason `coerceKey` is handed in.
 *
 * The three options every loader agrees on are hard-wired (`columns` so the header is
 * read once and each row arrives as an object; `skip_empty_lines`; `relax_column_count`
 * because publishers ship ragged rows). `bom`/`relax_quotes` are the two the loaders
 * DISAGREE on, so they come from the external's declared `csv_options` — honoured, never
 * inferred (a BOM-less parse of a BOM-prefixed file makes the FIRST header `\ufeffID`,
 * which then misses `key_property` on every row: `bad_key_count === feature_count`).
 *
 * @param {string} filePath - the downloaded `source.csv`
 * @param {{bom: boolean, relax_quotes: boolean}} csvOptions - `external.csv_options`
 * @param {string} keyProperty - the source-side attribute, `external.key_property`
 * @param {(raw: unknown) => number|null} coerceKey - the step's own pure coercion
 * @param {string} keyColumn - `outputs.writes[].key`, so a step's own dedupe helper
 *   reads the same field name its descriptor declares
 * @returns {Promise<{features: Array<{record: object}>, badKey: number, nullGeometry: number, rowsParsed: number}>}
 *   `nullGeometry` is structurally 0 here — a CSV has no geometry-less rows at PARSE
 *   time; a blank geometry cell is the step's `shapeRecord` problem, not the parser's,
 *   and the field is carried so `acquired.null_geometry_count` keeps its meaning.
 *   `rowsParsed` (INGESTOR prerequisite 0o, 2026-09-24) is EVERY row the stream handed
 *   back, counted BEFORE the `badKey` filter below drops one — the raw row count
 *   `ctx.acquired.rows_read` reports, as distinct from `features.length` (the
 *   post-filter kept count `feature_count` already reports).
 */
async function parseCsv(filePath, csvOptions, keyProperty, coerceKey, keyColumn) {
  const stream = fs.createReadStream(filePath).pipe(parse({
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: csvOptions.bom,
    relax_quotes: csvOptions.relax_quotes,
  }));
  const features = [];
  let badKey = 0;
  let rowsParsed = 0;
  // `for await` over the piped parser — the same backpressure-shaped loop the
  // pre-conversion CSV loaders used, so a 200 MB source never buffers whole (§9.5).
  for await (const record of stream) {
    rowsParsed++;
    const key = coerceKey(record[keyProperty]);
    if (key == null) { badKey++; continue; }
    features.push({ [keyColumn]: key, record });
  }
  return { features, badKey, nullGeometry: 0, rowsParsed };
}

/**
 * Parse a GeoJSON FeatureCollection into the SAME feature shape `parseShapefile`
 * returns, with the SAME tallies and the SAME drop ORDER
 * (INGESTOR prerequisite 0v, 2026-09-25, Spec 122 §8 RE-FREEZE #25).
 *
 * The founding source is row 3.8 `neighbourhoods`: one bare 2.1 MB FeatureCollection
 * (158 MultiPolygons, CRS84, `AREA_SHORT_CODE` a string on every feature), which the
 * legacy loader parsed in-module (`scripts/load-neighbourhoods.js`: `JSON.parse`,
 * `JSON.stringify(feature.geometry)`). Before 0v the format axis had exactly two arms
 * (`shapefile_zip`, `csv`), so the payload had no home and the seam threw
 * `… which no parser … handles`. This arm is generic: it knows nothing about
 * neighbourhoods — `keyProperty`/`keyColumn`/`coerceKey` are handed in exactly as they
 * are for the shapefile and CSV arms.
 *
 * ⚠️ ORDER IS THE CONTRACT (parseShapefile parity). `rowsParsed` counts EVERY feature
 * first; then a key that will not coerce is a `badKey`; ONLY THEN is a null geometry a
 * `nullGeometry`. So a feature that is BOTH keyless and geometry-less is counted ONCE,
 * as a bad key — never as both, never as zero. A null `properties` degrades to `{}`
 * (the `parseShapefile` fallback), which then misses `keyProperty` and counts as a bad
 * key rather than crashing the run.
 *
 * The whole file is read here rather than streamed: the bytes already landed on disk
 * through the streamed hash-through (FENCE 0b230472 — a download is never buffered
 * whole), and `JSON.parse` has no streaming form. The read is therefore of the TEMP
 * file after acquisition, which is a bounded, already-validated payload; the download
 * path's §9.5 streaming guarantee is untouched.
 *
 * @param {string} filePath - the downloaded `source.geojson`
 * @param {string} keyProperty - the source-side attribute, `external.key_property`
 * @param {(raw: unknown, ctx: {geojson: string|null}) => number|string|null} coerceKey - the
 *   step's own pure coercion; the 2nd argument is DATA ONLY (`{ geojson }`, the string
 *   built once from the feature's geometry and reused by the push — Rule 2), the same
 *   contract `parseShapefile` carries.
 * @param {string} keyColumn - `outputs.writes[].key`, so a step's own dedupe helper reads
 *   the same field name its descriptor declares.
 * @returns {{features: Array<{[keyColumn]: number|string, geojson: string, record: object}>, badKey: number, nullGeometry: number, rowsParsed: number}}
 * @throws {Error} on malformed JSON (the legacy loader's own message form, file + first
 *   100 chars) or on a document whose `features` is not an array — refused BY NAME, since
 *   a `{type:"FeatureCollection"}` with no features would otherwise silently parse to zero
 *   rows and a green verdict over an empty load.
 */
async function parseGeoJson(filePath, keyProperty, coerceKey, keyColumn) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    // The legacy anchor: `Failed to parse GeoJSON file ${path}: ${err.message}
    // (first 100 chars: ${raw.slice(0,100)})` — scripts/load-neighbourhoods.js:115-121.
    // The first 100 characters are the DIAGNOSTIC: a CKAN error page, a truncated
    // download and a schema change all look the same from the exception alone.
    throw new Error(`Failed to parse GeoJSON file ${filePath}: ${err.message} (first 100 chars: ${raw.slice(0, 100)})`);
  }
  if (!doc || !Array.isArray(doc.features)) {
    throw new Error(`${filePath} is not a GeoJSON FeatureCollection — expected an object with a `
      + `"features" array, got ${doc === null ? 'null' : typeof doc}`
      + `${doc && doc.type ? ` (type "${String(doc.type)}")` : ''}.`);
  }
  const features = [];
  let badKey = 0;
  let nullGeometry = 0;
  let rowsParsed = 0;
  for (const f of doc.features) {
    rowsParsed++;
    const props = (f && f.properties) || {};
    const geometry = f ? f.geometry : null;
    // Built ONCE, reused by the push AND handed to `coerceKey` (0s) — one stringify per
    // feature, and the same string the write plan's `wkb_geometry` column receives.
    const geojson = geometry == null ? null : JSON.stringify(geometry);
    const key = coerceKey(props[keyProperty], { geojson });
    if (key == null) { badKey++; continue; }
    if (geometry == null) { nullGeometry++; continue; }
    features.push({ [keyColumn]: key, geojson, record: props });
  }
  return { features, badKey, nullGeometry, rowsParsed };
}

/**
 * The `post_acquisition` gate (header item 3). Kept in this file and NOWHERE else:
 * `./staleness.js` owns the pre-acquisition position only, so there is exactly one
 * place the content-hash decision can be reverted from.
 */
function contentHashSkip({ descriptor, contentHash, prior }) {
  if (triggersAt(descriptor, 'post_acquisition').length === 0) {
    return { skip: false, reason: 'no_post_acquisition_trigger' };
  }
  return sourceVersion.contentHashDecision({ contentHash, priorMeta: prior });
}

/**
 * The skip terminal's emit block: skeleton ← prior ← pins, pins LAST so a future
 * `spec_version` bump can never re-emit a stale version on a skip run, and the run
 * still lands a `completed` row (DS4).
 */
function buildSkipReEmitMeta({ skeleton, prior, pins }) {
  return sourceVersion.buildSkipReEmitMeta({ skeleton, priorMeta: prior, pins });
}

/**
 * Acquire one declared external.
 *
 * Order is the lifecycle order, and it is the order the fences were built in:
 *   HEAD → tier-1 gate (caller) → temp root → streamed download+hash → tier-2 gate
 *   → extract → locate → parse → cleanup.
 *
 * The temp root is removed in a `finally` on EVERY path, including the tier-2 skip
 * and every throw. `force_run` never changes what is acquired — it only stops the
 * gates from short-circuiting, which is why it is read by `./staleness.js` and only
 * arrives here as a resolved boolean.
 *
 * @returns {Promise<{acquired: object, tier2: {skip: boolean, reason: string}}>}
 */
async function acquireExternal({
  ctxFetch, log, tag, slug, external, descriptor, config, prior, timeoutMs,
  keyProperty, keyColumn, coerceKey, forced, preAcquisitionGate, emitSkeleton,
}) {
  // The DS4 contract, built HERE because this is where a gate can fire: a skipped run
  // must still land a `completed` row carrying the PRIOR block, since every downstream
  // HALT gate filters on completed rows and would read a skip as an absent producer.
  const skipEmit = (reason) => buildSkipReEmitMeta({
    skeleton: emitSkeleton || {},
    prior,
    pins: { spec_version: descriptor.identity.spec_version, skipped_reason: reason },
  });
  const algorithm = (triggersAt(descriptor, 'post_acquisition')[0] || {}).hash || DEFAULT_CONTENT_HASH_ALGORITHM;

  // ── THE DECLARED HEAD-FAILURE POSTURE (INGESTOR prerequisite 0r, 2026-09-24) ──────
  // The legacy load-centreline loader (Spec 62 §3.9, `scripts/load-centreline.js:433-439`)
  // WARNed on a HEAD 4xx/5xx and PROCEEDED with null validators — the tier-1 gate's own
  // `no_validators` arm then decided to download. That posture was never declared, only
  // observed; here it is `external.on_head_error`, reusing `staleness.on_prior_run_error`'s
  // vocabulary. ABSENT (and `"fail_step"`) rethrows the HEAD error — byte-identical to
  // today, where the throw escapes `acquireExternal`. `"warn_row"` swallows it, records
  // `head_error`, logs a WARN, and hands the gate null validators so the DECIDED-by-gate
  // path runs. Only a DECLARATION can decide this (Rule 10): the library owns the WARN row
  // (`§headErrorRows`), and a step-declared check over `acquired.head_error` could not —
  // a forgotten check would proceed silently.
  let head;
  let headError = null;
  try {
    head = await headValidators(ctxFetch, external.url, timeoutMs);
  } catch (err) {
    if (external.on_head_error !== 'warn_row') throw err;
    headError = err.message;
    log.warn(tag, `HEAD failed, proceeding without validators (on_head_error "warn_row"): ${err.message}`);
    head = { lastModified: null, etag: null };
  }

  // The base block exists BEFORE the tier-1 decision on purpose: the `when: "pre"`
  // checks (licence, cache validators, dataset age, standing overrides) are reported
  // on the SKIP path too, so a skipped run still says WHY it was allowed to skip.
  const base = {
    last_modified: head.lastModified,
    last_modified_ms: head.lastModified ? Date.parse(head.lastModified) : null,
    etag: head.etag,
    head_error: headError,
    content_hash: null,
    source_dataset_version: null,
    bytes_downloaded: 0,
    license_url: external.license || null,
    feature_count: 0,
    bad_key_count: 0,
    null_geometry_count: 0,
    rows_parsed: 0,
  };

  const tier1 = preAcquisitionGate(head);
  if (tier1.skip) {
    log.info(tag, `pre-acquisition gate: skip (${tier1.reason}) — nothing downloaded`);
    return {
      acquired: base,
      tier1,
      tier2: { skip: false, reason: 'not_reached' },
      features: [],
      emitBlock: skipEmit(tier1.reason),
    };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${TMP_PREFIX}${slug}-`));
  try {
    // The downloaded file's NAME is derived from the DECLARED format, so nothing
    // downstream has to sniff it: `.zip` for the archive, `.csv`/`.geojson` for the
    // flat files (`geojson` added at INGESTOR prerequisite 0v, 2026-09-25). Path only —
    // `downloadArchive` is byte-identical for all three, and the bytes are hashed as
    // they land on either branch (FENCE 0b230472).
    const destPath = path.join(tmpRoot, ({ csv: 'source.csv', geojson: 'source.geojson' })[external.format] || 'source.zip');
    const dl = await downloadWithRetries(ctxFetch, external.url, destPath, timeoutMs, algorithm, {
      ...resolveRetryPolicy(descriptor, config), log, tag,
    });
    const acquired = {
      ...base,
      last_modified: dl.lastModified || head.lastModified,
      last_modified_ms: (dl.lastModified || head.lastModified) ? Date.parse(dl.lastModified || head.lastModified) : null,
      etag: dl.etag || head.etag,
      content_hash: dl.contentHash,
      source_dataset_version: dl.contentHash,
      bytes_downloaded: dl.bytesDownloaded,
      download_attempts: dl.attempts,
    };
    const tier2 = forced
      ? { skip: false, reason: 'force_run' }
      : contentHashSkip({ descriptor, contentHash: dl.contentHash, prior });
    if (tier2.skip) {
      log.info(tag, `post-acquisition gate: skip (${tier2.reason}) — bytes identical, nothing parsed`);
      return { acquired, tier1, tier2, features: [], emitBlock: buildSkipReEmitMeta({
        skeleton: emitSkeleton || {},
        prior,
        pins: { spec_version: descriptor.identity.spec_version, skipped_reason: tier2.reason },
      }) };
    }

    // ── THE FORMAT AXIS (WF2 batch-2 row 3.1 prerequisite 0b) ──────────────────
    // Before this branch the seam was dispatch-free: every external was unzipped,
    // located and shapefile-parsed unconditionally. `format` is REQUIRED descriptor
    // data now, so the parser is selected by a declaration and never by an
    // extension. The shapefile arm's three lines are byte-identical to what they
    // were; an UNRECOGNISED value throws by name rather than silently parsing as
    // a shapefile (a CSV through `open()` fails, but a future third format would
    // not necessarily — and a silent wrong-parser is a data-shape defect).
    let parsed;
    if (external.format === 'shapefile_zip') {
      const extractDir = path.join(tmpRoot, 'ext');
      await extractArchive(dl.archivePath, extractDir);
      const { shpPath, dbfPath } = locateShapefile(extractDir);
      parsed = await parseShapefile(shpPath, dbfPath, keyProperty, coerceKey, keyColumn);
    } else if (external.format === 'csv') {
      parsed = await parseCsv(dl.archivePath, external.csv_options, keyProperty, coerceKey, keyColumn);
    } else if (external.format === 'geojson') {
      // ── 0v: THE THIRD ARM (2026-09-25) ────────────────────────────────────────
      // A bare FeatureCollection — no unzip, no locate. Tally/order parity with the
      // shapefile arm is `parseGeoJson`'s own contract (see its JSDoc); this branch
      // only names the parser.
      parsed = await parseGeoJson(dl.archivePath, keyProperty, coerceKey, keyColumn);
    } else {
      throw new Error(`${tag} external "${external.id}" declares format "${String(external.format)}", which no parser `
        + 'in the acquisition seam handles. Declare "shapefile_zip", "csv" or "geojson" (step.schema.json '
        + 'inputs.reads.externals[].format), or teach acquire.js the new payload format — an '
        + 'unrecognised value must never fall through to the shapefile parser.');
    }
    log.info(tag, `acquired ${parsed.features.length} feature(s) (${dl.bytesDownloaded} bytes, ${algorithm} ${dl.contentHash.slice(0, 8)}…)`);
    return {
      acquired: {
        ...acquired,
        feature_count: parsed.features.length,
        bad_key_count: parsed.badKey,
        null_geometry_count: parsed.nullGeometry,
        rows_parsed: parsed.rowsParsed,
      },
      tier1,
      tier2,
      features: parsed.features,
      emitBlock: null,
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

/** Re-exported so a caller never has to know which of the two gate homes owns which tier. */
const contentHashDecision = sourceVersion.contentHashDecision;

module.exports = {
  DEFAULT_CONTENT_HASH_ALGORITHM,
  TMP_PREFIX,
  parseDuration,
  resolveTimeoutMs,
  resolveRetryPolicy,
  abortTimer,
  headValidators,
  downloadArchive,
  downloadWithRetries,
  extractArchive,
  locateShapefile,
  parseShapefile,
  parseCsv,
  parseGeoJson,
  contentHashSkip,
  contentHashDecision,
  buildSkipReEmitMeta,
  acquireExternal,
};
