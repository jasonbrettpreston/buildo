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
 * HEAD the external and return its cache validators, or throw on 4xx/5xx.
 * This is the ONLY network call a `pre_acquisition` trigger needs, and it is made
 * even when the gate ends up skipping — the dataset-age row is derived from it, so
 * the row appears on the skip path and on every downstream failure path too.
 */
async function headValidators(ctxFetch, url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await ctxFetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HEAD ${res.status} ${res.statusText}`);
    return { lastModified: res.headers.get('last-modified'), etag: res.headers.get('etag') };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Download to `destPath`, hashing the bytes as they stream through (header item 1).
 * Returns the digest and whatever validators the GET response carried — a CDN that
 * strips them on HEAD sometimes still sends them on GET.
 */
async function downloadArchive(ctxFetch, url, destPath, timeoutMs, algorithm) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
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
    clearTimeout(t);
  }
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
 * Parse a shapefile into `[{ key, geojson }]`, tallying the two loss modes the
 * audit table has to see: a property that will not coerce to a positive key, and a
 * null geometry. Neither is fabricated into a row.
 *
 * @param {(raw: unknown) => number|null} coerceKey - the step's own pure coercion,
 *   handed in from the compute module so the parse stays domain-free.
 */
async function parseShapefile(shpPath, dbfPath, keyProperty, coerceKey, keyColumn) {
  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  let badKey = 0;
  let nullGeometry = 0;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const props = r.value.properties || {};
    const key = coerceKey(props[keyProperty]);
    if (key == null) { badKey++; continue; }
    if (r.value.geometry == null) { nullGeometry++; continue; }
    // Keyed by the DECLARED key column (`outputs.writes[].key`), so the step's own
    // pure dedupe helper reads the same field name its descriptor declares.
    features.push({ [keyColumn]: key, geojson: JSON.stringify(r.value.geometry) });
  }
  return { features, badKey, nullGeometry };
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
  ctxFetch, log, tag, slug, external, descriptor, prior, timeoutMs,
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
  const head = await headValidators(ctxFetch, external.url, timeoutMs);

  // The base block exists BEFORE the tier-1 decision on purpose: the `when: "pre"`
  // checks (licence, cache validators, dataset age, standing overrides) are reported
  // on the SKIP path too, so a skipped run still says WHY it was allowed to skip.
  const base = {
    last_modified: head.lastModified,
    last_modified_ms: head.lastModified ? Date.parse(head.lastModified) : null,
    etag: head.etag,
    content_hash: null,
    source_dataset_version: null,
    bytes_downloaded: 0,
    license_url: external.license || null,
    feature_count: 0,
    bad_key_count: 0,
    null_geometry_count: 0,
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
    const dl = await downloadArchive(ctxFetch, external.url, path.join(tmpRoot, 'source.zip'), timeoutMs, algorithm);
    const acquired = {
      ...base,
      last_modified: dl.lastModified || head.lastModified,
      last_modified_ms: (dl.lastModified || head.lastModified) ? Date.parse(dl.lastModified || head.lastModified) : null,
      etag: dl.etag || head.etag,
      content_hash: dl.contentHash,
      source_dataset_version: dl.contentHash,
      bytes_downloaded: dl.bytesDownloaded,
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

    const extractDir = path.join(tmpRoot, 'ext');
    await extractArchive(dl.archivePath, extractDir);
    const { shpPath, dbfPath } = locateShapefile(extractDir);
    const parsed = await parseShapefile(shpPath, dbfPath, keyProperty, coerceKey, keyColumn);
    log.info(tag, `acquired ${parsed.features.length} feature(s) (${dl.bytesDownloaded} bytes, ${algorithm} ${dl.contentHash.slice(0, 8)}…)`);
    return {
      acquired: {
        ...acquired,
        feature_count: parsed.features.length,
        bad_key_count: parsed.badKey,
        null_geometry_count: parsed.nullGeometry,
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
  headValidators,
  downloadArchive,
  extractArchive,
  locateShapefile,
  parseShapefile,
  contentHashSkip,
  contentHashDecision,
  buildSkipReEmitMeta,
  acquireExternal,
};
