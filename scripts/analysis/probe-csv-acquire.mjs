#!/usr/bin/env node
'use strict';
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (the INGESTOR
//   runner's shared acquisition seam — scripts/lib/step/acquire.js)
// SPEC LINK: .cursor/wf2_ingest_csv_acquire_active_task.md D4 (memory is MEASURED, not
//   assumed — this probe is that measurement)
//
// READ-ONLY — this script never writes to the database. It downloads one CSV to a temp
// file and parses it through the runner's own `downloadArchive`/`parseCsv` (the exact
// functions `acquireExternal`'s `format: "csv"` branch calls), sampling
// `process.memoryUsage()` on an interval so the runner's whole-array-in-memory model is a
// measured number instead of an assumption.
//
// USAGE:
//   node scripts/analysis/probe-csv-acquire.mjs --url=<csv url> --key=<key_property> [--bom] [--relax-quotes]
//   node --max-old-space-size=2048 scripts/analysis/probe-csv-acquire.mjs --url=... --key=...
//
// Reusable: any CSV external (address_points, parcels, load_wsib) can be probed by
// pointing `--url`/`--key`/`--bom`/`--relax-quotes` at its descriptor's `external.url` /
// `key_property` / `csv_options`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The runner's OWN acquisition functions — not a reimplementation. A probe that measures
// a different code path than the one the runner actually runs would measure nothing.
const { downloadArchive, parseCsv } = require('../lib/step/acquire.js');

const MEMORY_SAMPLE_INTERVAL_MS = 500;

function parseArgs(argv) {
  const args = { bom: false, relaxQuotes: false, url: null, key: null };
  for (const raw of argv) {
    if (raw === '--bom') args.bom = true;
    else if (raw === '--relax-quotes') args.relaxQuotes = true;
    else if (raw.startsWith('--url=')) args.url = raw.slice('--url='.length);
    else if (raw.startsWith('--key=')) args.key = raw.slice('--key='.length);
  }
  if (!args.url || !args.key) {
    throw new Error(
      'usage: probe-csv-acquire.mjs --url=<csv url> --key=<key_property> [--bom] [--relax-quotes]',
    );
  }
  return args;
}

function toMB(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** A no-op key coercion (`String`) — this probe measures memory, not a step's own key
 *  validation, so every row with a non-empty key value is kept. */
function identityCoerceKey(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw);
}

async function main() {
  const { url, key, bom, relaxQuotes } = parseArgs(process.argv.slice(2));
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-csv-acquire-'));
  const destPath = path.join(tmpRoot, 'source.csv');
  const maxOldSpaceFlag =
    (process.execArgv || []).find((a) => a.startsWith('--max-old-space-size')) || null;

  try {
    process.stderr.write(`[probe-csv-acquire] downloading ${url} -> ${destPath}\n`);
    const dlStart = Date.now();
    // `fetch` is global on Node >=18; this is the same `ctxFetch` shape the runner hands
    // `downloadArchive` in production (a plain fetch, not a mock).
    const dl = await downloadArchive(fetch, url, destPath, 120000, 'md5');
    const downloadSeconds = (Date.now() - dlStart) / 1000;
    process.stderr.write(
      `[probe-csv-acquire] downloaded ${dl.bytesDownloaded} bytes in ${downloadSeconds.toFixed(1)}s ` +
        `(md5 ${dl.contentHash.slice(0, 8)}...)\n`,
    );

    let peakRss = 0;
    let peakHeapUsed = 0;
    let peakExternal = 0;
    const sample = () => {
      const m = process.memoryUsage();
      if (m.rss > peakRss) peakRss = m.rss;
      if (m.heapUsed > peakHeapUsed) peakHeapUsed = m.heapUsed;
      if (m.external > peakExternal) peakExternal = m.external;
    };
    sample();
    const timer = setInterval(sample, MEMORY_SAMPLE_INTERVAL_MS);

    const parseStart = Date.now();
    let features;
    let badKey;
    try {
      // The exact call `acquireExternal`'s `format: "csv"` branch makes.
      ({ features, badKey } = await parseCsv(
        destPath,
        { bom, relax_quotes: relaxQuotes },
        key,
        identityCoerceKey,
        'source_id',
      ));
    } finally {
      clearInterval(timer);
      sample();
    }
    const parseSeconds = (Date.now() - parseStart) / 1000;

    const heapLimitBytes = v8.getHeapStatistics().heap_size_limit;

    const result = {
      url,
      key_property: key,
      csv_options: { bom, relax_quotes: relaxQuotes },
      bytes_downloaded: dl.bytesDownloaded,
      row_count: features.length,
      bad_key_count: badKey,
      download_seconds: Math.round(downloadSeconds * 100) / 100,
      parse_seconds: Math.round(parseSeconds * 100) / 100,
      peak_rss_mb: toMB(peakRss),
      peak_heap_used_mb: toMB(peakHeapUsed),
      peak_external_mb: toMB(peakExternal),
      heap_size_limit_mb: toMB(heapLimitBytes),
      max_old_space_size_flag: maxOldSpaceFlag,
    };

    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.stderr.write(
      `[probe-csv-acquire] rows=${result.row_count} bad_key=${result.bad_key_count} ` +
        `peak_rss=${result.peak_rss_mb}MB peak_heapUsed=${result.peak_heap_used_mb}MB ` +
        `peak_external=${result.peak_external_mb}MB heap_limit=${result.heap_size_limit_mb}MB ` +
        `(${maxOldSpaceFlag || 'default heap'}) download=${result.download_seconds}s parse=${result.parse_seconds}s\n`,
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[probe-csv-acquire] FAILED: ${err.stack || err.message}\n`);
    process.exit(1);
  });
