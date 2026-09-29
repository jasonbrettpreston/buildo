// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A17 (0fs; RE-FREEZE #28, logged in 122 §8)
//
// INGESTOR prerequisite 0fs (part A) — FILESYSTEM ACQUISITION. `kind:"filesystem"` has
// been in the externals `kind` enum since S1 (x-frozen, step.schema.json) with ZERO
// descriptors and ZERO tests behind it [MEASURED `git grep '"filesystem"'` → schema only].
// The legacy load-wsib loader resolved a local, operator-dropped CSV by hand:
// `readdirSync(dataDir).filter(f => /^BusinessClassificationDetails/i.test(f) &&
// f.endsWith('.csv')).sort().pop()` [READ scripts/load-wsib.js:87-133]. That scan is the
// DECLARED input now: `externals[].path`, a repo-relative literal dir + basename `*`
// wildcards, case-INSENSITIVE on the basename except the final `.ext` (the legacy
// `/…/i` + `endsWith('.csv')` split), code-unit sort, last wins.
//
// Before this file the acquisition seam was URL-ONLY: `acquireExternal` HEADs
// `external.url` unconditionally. A `path`-bearing external has NO url, so the HEAD is
// literally `headValidators(ctxFetch, undefined, …)` — the failing shape this suite
// releases. The Fix: `resolveLocalSource(pattern, repoRoot)` resolves the file with no
// network, a missing file (or a missing directory, `/data` is absent in the cloud) is
// the declared tier-1 skip `no_source_file`, and a present file is STREAM-copied into
// the temp root and hashed by `copyLocalFile` on the SAME md5 the download path uses
// (G5) so the existing csv arm parses it unchanged.
//
// T-labels: PIN = green before the implementation; RED = fails before it, with the red
// reason named on the test. This file is authored RED-FIRST: T1, T2, T2b, T3, T4 fail
// now (missing exports / a HEAD against an undefined url), T5 is the pin.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(path.join(process.cwd(), 'scripts/lib/step/acquire.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** Every temp dir made by `repoRoot()` — removed in `afterEach`, one per test. */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A throwaway `repoRoot` (never `data/`, which is gitignored) under `os.tmpdir()`. */
function repoRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0fs-'));
  tmpDirs.push(dir);
  return dir;
}

/** The BOM-prefixed CSV fixture — the BOM is why `csv_options.bom:true` is declared. */
const CSV_BYTES = Buffer.from('\ufeffLegal name,Mailing Address\nACME,1 Main St\n', 'utf8');
const CSV_REL = 'data/BusinessClassificationDetails(2025).csv';

/** Write the CSV fixture at `<root>/<rel>`, creating the directory chain. */
function writeCsv(root: string, rel: string = CSV_REL): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, CSV_BYTES);
  return abs;
}

/** The declared filesystem external under test (primary csv, a `*` basename glob). */
const FS_EXTERNAL = {
  id: 'fs',
  kind: 'filesystem',
  path: 'data/BusinessClassificationDetails*.csv',
  format: 'csv',
  csv_options: { bom: true, relax_quotes: false },
  key_property: 'Legal name',
  cache: 'none',
};

/** md5 of arbitrary bytes — the digest the acquisition seam hashes as the bytes land. */
const md5 = (body: Buffer) => crypto.createHash('md5').update(body).digest('hex');

/**
 * A fetch whose Nth call returns the Nth queued response (copied from 0w-acquire's
 * `fetchOf`, widened to `body?: string | Buffer`). A REAL `Response` — the download
 * path's `Readable.fromWeb(res.body)` requires a genuine WHATWG stream.
 */
const fetchOf = (queue: Array<{ status: number; body?: string | Buffer }>) => {
  let i = 0;
  return vi.fn(async () => {
    const next = queue[i++];
    if (!next) throw new Error(`fetchOf: call ${i} exceeds the queued response list`);
    const buf = Buffer.isBuffer(next.body) ? next.body : Buffer.from(next.body ?? 'x');
    return new Response(new Uint8Array(buf), {
      status: next.status,
      statusText: String(next.status),
    });
  });
};

/** The minimal descriptor `acquireExternal` reads: spec_version, name, staleness, retries. */
function minimalDescriptor(staleness: unknown = 'none') {
  return {
    identity: { name: 'load_ravines', spec_version: '1.0' },
    staleness,
    execution: { network: 'none' },
  };
}

/**
 * The `acquireArgs` shape (copied from 0r's own helper), plus 0fs's new optional
 * `repoRoot` — the runner passes none, a test passes a throwaway tree.
 */
function acquireArgs(opts: {
  external: Record<string, unknown>;
  fetchImpl: unknown;
  descriptor: unknown;
  gate: unknown;
  prior?: unknown;
  forced?: boolean;
  repoRoot?: string;
  slug?: string;
}) {
  return {
    ctxFetch: opts.fetchImpl,
    log: noopLog,
    tag: '[0fs]',
    slug: opts.slug ?? 'load_ravines',
    external: opts.external,
    descriptor: opts.descriptor,
    prior: opts.prior ?? null,
    timeoutMs: null,
    keyProperty: FS_EXTERNAL.key_property,
    keyColumn: 'legal_name_normalized',
    coerceKey: (raw: unknown) => (typeof raw === 'string' && raw.length > 0 ? raw : null),
    forced: opts.forced ?? false,
    preAcquisitionGate: opts.gate,
    emitSkeleton: {},
    repoRoot: opts.repoRoot,
  };
}

describe('INGESTOR prerequisite 0fs — filesystem acquisition', () => {
  // -------------------------------------------------------------------------
  // T1 RED (`resolveLocalSource` is not exported): the resolver's own contract.
  // It takes a repo-relative pattern with basename `*` wildcards only, throws BY
  // NAME on an unsafe pattern, and returns `{absPath, relPath}` or `null`.
  // -------------------------------------------------------------------------
  it('T1 — resolveLocalSource picks the lexicographically last match, is case-insensitive but strict on the final extension, returns null when absent, throws on unsafe patterns', () => {
    // RED before 0fs: `resolveLocalSource` is undefined.
    const resolve = acquireLib.resolveLocalSource as (p: string, root: string) => { absPath: string; relPath: string } | null;

    // Two candidates differing only by their suffix: code-unit sort, last wins.
    const two = repoRoot();
    writeCsv(two, 'data/BusinessClassificationDetails(2024).csv');
    writeCsv(two, 'data/BusinessClassificationDetails(2025).csv');
    const twoHit = resolve(FS_EXTERNAL.path, two);
    expect(twoHit, 'a match exists').not.toBeNull();
    expect(twoHit!.relPath.endsWith('(2025).csv'), 'the LAST code-unit sort wins').toBe(true);
    expect(twoHit!.relPath, 'the returned path is repo-relative, never absolute').toBe(CSV_REL);

    // The basename prefix matches case-INSENSITIVELY (the legacy `/…/i.test(f)`).
    const lower = repoRoot();
    writeCsv(lower, 'data/businessclassificationdetails(2025).csv');
    const lowerHit = resolve(FS_EXTERNAL.path, lower);
    expect(lowerHit, 'a lower-case prefix matches — the `i` flag the legacy scan carried').not.toBeNull();
    expect(lowerHit!.relPath).toBe('data/businessclassificationdetails(2025).csv');

    // The final `.ext` matches case-SENSITIVELY (the legacy `f.endsWith('.csv')`).
    const upper = repoRoot();
    fs.writeFileSync(path.join(upper, 'X(2025).CSV'), CSV_BYTES);
    expect(resolve('*.csv', upper), 'X(2025).CSV is NOT a `.csv` — the extension is case-SENSITIVE').toBeNull();

    // An empty directory has no candidate.
    expect(resolve(FS_EXTERNAL.path, repoRoot()), 'no file → null').toBeNull();

    // A MISSING directory is null, not a throw (the legacy `fs.existsSync(dataDir)`
    // guard; `/data` is absent in the cloud, so this is the common case there).
    expect(resolve(FS_EXTERNAL.path, path.join(repoRoot(), 'does-not-exist')), 'missing dir → null').toBeNull();

    // Unsafe patterns are refused BY NAME, each matching `/path/`, before any readdir.
    // A `*` outside the basename stem (directory or extension) is refused too: it would
    // otherwise match nothing and become a permanent green `no_source_file` skip.
    for (const bad of ['/abs/x.csv', '../x.csv', 'data/**/x.csv', 'da*/x.csv', 'data/*/x.csv', 'data/Business*.c*']) {
      expect(() => resolve(bad, repoRoot()), `${bad} is refused by name`).toThrow(/path/);
    }
  });

  // -------------------------------------------------------------------------
  // T2 RED (HEAD against an `undefined` url): end to end through the seam. A
  // present filesystem csv is resolved, stream-copied and hashed into the temp
  // root, and parsed by the EXISTING csv arm — with NO network call at all.
  // -------------------------------------------------------------------------
  it('T2 — a filesystem csv acquires with 0 fetch calls, hash/bytes from the local bytes, and source_path', async () => {
    const root = repoRoot();
    writeCsv(root);
    const fetchImpl = vi.fn();
    const descriptor = minimalDescriptor('none');
    const r = await acquireLib.acquireExternal(acquireArgs({
      external: FS_EXTERNAL,
      fetchImpl,
      descriptor,
      gate: () => ({ skip: false, reason: 'fresh' }),
      repoRoot: root,
    })) as {
      acquired: { content_hash: string; bytes_downloaded: number; source_path?: string };
      features: Array<{ record: Record<string, unknown> }>;
    };

    expect(fetchImpl, 'a local file makes NO network call — no HEAD, no GET').not.toHaveBeenCalled();
    expect(r.acquired.content_hash, 'the digest is md5 of the local bytes').toBe(md5(CSV_BYTES));
    expect(r.acquired.bytes_downloaded, 'the size is the local file size').toBe(CSV_BYTES.length);
    expect(r.features[0]!.record['Legal name'], 'the BOM header still parses to `Legal name`').toBe('ACME');
    expect(r.acquired.source_path, 'the repo-relative source is recorded').toBe(CSV_REL);

    // The temp root is removed on EVERY path, including success (a leaked temp dir per
    // run is a disk defect).
    const leaked = fs.readdirSync(os.tmpdir())
      .filter((n) => n.startsWith(`${acquireLib.TMP_PREFIX}load_ravines-`));
    expect(leaked, 'the acquisition temp root is removed in the finally').toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T2b RED (`copyLocalFile` is absent): md5 parity between the local copy and
  // the download path (G5). The SAME digest for the SAME bytes, on the SAME
  // pinned algorithm — a local file is not a second, drifting hash home.
  // -------------------------------------------------------------------------
  it('T2b — copyLocalFile hashes md5 identically to downloadArchive, pinned to a literal digest; DEFAULT_CONTENT_HASH_ALGORITHM is md5', async () => {
    const root = repoRoot();
    const src = writeCsv(root);
    const destA = path.join(root, 'copy-a.csv');
    const destB = path.join(root, 'copy-b.csv');

    const copied = await acquireLib.copyLocalFile(src, destA, 'md5') as { contentHash: string; bytesDownloaded: number };
    const fetched = await acquireLib.downloadArchive(
      fetchOf([{ status: 200, body: CSV_BYTES }]), 'http://x', destB, 5000, 'md5',
    ) as { contentHash: string; bytesDownloaded: number };

    const expected = md5(CSV_BYTES);
    expect(copied.contentHash, 'the local copy hashes the same bytes the download would').toBe(expected);
    expect(fetched.contentHash, 'the download path hashes the same bytes (parity)').toBe(expected);
    expect(copied.bytesDownloaded).toBe(CSV_BYTES.length);
    expect(fetched.bytesDownloaded).toBe(CSV_BYTES.length);

    // A LITERAL digest, on a file whose bytes are known exactly (`abc`, RFC 1321's vector):
    // an implementation that drifted to sha1 (or that hashed a re-encoded stream) fails here.
    const abc = path.join(root, 'abc.txt');
    fs.writeFileSync(abc, 'abc');
    const abcCopy = await acquireLib.copyLocalFile(abc, path.join(root, 'abc-copy.txt'), 'md5') as { contentHash: string };
    const abcFetch = await acquireLib.downloadArchive(
      fetchOf([{ status: 200, body: 'abc' }]), 'http://x', path.join(root, 'abc-dl.txt'), 5000, 'md5',
    ) as { contentHash: string };
    expect(abcCopy.contentHash, 'MD5("abc")').toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(abcFetch.contentHash, 'MD5("abc") via the download path').toBe('900150983cd24fb0d6963f7d28e17f72');

    expect(acquireLib.DEFAULT_CONTENT_HASH_ALGORITHM, 'md5 is PINNED (fence 0b230472)').toBe('md5');
  });

  // -------------------------------------------------------------------------
  // T3 RED: a missing source file is the DECLARED tier-1 skip `no_source_file`
  // — no fetch, no gate call, and no `source_path` key (the skip reuses the
  // existing tier-1 return, so the key is ABSENT, not null). `forced` cannot
  // load an absent file: the check precedes both gates (I9).
  // -------------------------------------------------------------------------
  it('T3 — a missing file is the tier-1 skip no_source_file with no fetch and no gate, and forced does not override it', async () => {
    for (const forced of [false, true]) {
      const root = repoRoot(); // empty: no `data/` chain at all
      const fetchImpl = vi.fn();
      const gate = vi.fn(() => ({ skip: false, reason: 'fresh' }));
      const r = await acquireLib.acquireExternal(acquireArgs({
        external: FS_EXTERNAL,
        fetchImpl,
        descriptor: minimalDescriptor('none'),
        gate,
        forced,
        repoRoot: root,
      })) as {
        acquired: Record<string, unknown>;
        tier1: { skip: boolean; reason: string };
        tier2: { skip: boolean; reason: string };
        features: unknown[];
        emitBlock: { skipped_reason?: string };
      };

      expect(r.tier1, `forced=${forced}: the skip is declared, not an error`).toEqual({ skip: true, reason: 'no_source_file' });
      expect(r.emitBlock.skipped_reason, `forced=${forced}: the emit block says WHY`).toBe('no_source_file');
      expect(Object.prototype.hasOwnProperty.call(r.acquired, 'source_path'), `forced=${forced}: there is no source file, so no source_path key`).toBe(false);
      expect(fetchImpl, `forced=${forced}: nothing is fetched`).not.toHaveBeenCalled();
      expect(gate, `forced=${forced}: the gate is never consulted for an absent file`).not.toHaveBeenCalled();
      expect(r.tier2, `forced=${forced}: tier-2 is not reached`).toEqual({ skip: false, reason: 'not_reached' });
      expect(r.features, `forced=${forced}: no features`).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // T4 RED: the tier-2 content-hash gate applies to a LOCAL file too. A local csv
  // whose bytes equal the prior run's recorded `content_hash` skips WITHOUT
  // parsing — the same post_acquisition trigger an http_file resolves.
  // -------------------------------------------------------------------------
  it('T4 — a local file whose md5 equals the prior content_hash skips at tier-2 with no features', async () => {
    const root = repoRoot();
    writeCsv(root);
    const descriptor = minimalDescriptor({
      trigger: [{ signal: 'content_hash', position: 'post_acquisition', external: 'fs', hash: 'md5' }],
    });
    const r = await acquireLib.acquireExternal(acquireArgs({
      external: FS_EXTERNAL,
      fetchImpl: vi.fn(),
      descriptor,
      gate: () => ({ skip: false, reason: 'fresh' }),
      prior: { content_hash: md5(CSV_BYTES) },
      repoRoot: root,
    })) as {
      acquired: { content_hash: string };
      tier2: { skip: boolean; reason: string };
      features: unknown[];
    };

    expect(r.tier2.skip, 'the bytes are identical to the prior run').toBe(true);
    expect(r.acquired.content_hash).toBe(md5(CSV_BYTES));
    expect(r.features, 'a tier-2 skip parses nothing').toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T5 PIN (green now): a url `http_file` csv is acquired EXACTLY as before —
  // HEAD then GET — and its `acquired` block carries NO `source_path` key, so
  // the url path stays byte-identical.
  // -------------------------------------------------------------------------
  it('T5 — a url http_file csv still HEADs then GETs and carries no source_path key', async () => {
    const external = {
      id: 'p', kind: 'http_file', url: 'http://ex/a.csv', format: 'csv',
      csv_options: { bom: true, relax_quotes: false }, key_property: 'Legal name', cache: 'none',
    };
    const fetchImpl = fetchOf([
      { status: 200 }, // HEAD
      { status: 200, body: CSV_BYTES }, // GET
    ]);
    const r = await acquireLib.acquireExternal(acquireArgs({
      external,
      fetchImpl,
      descriptor: minimalDescriptor('none'),
      gate: () => ({ skip: false, reason: 'fresh' }),
    })) as {
      acquired: { content_hash: string; bytes_downloaded: number; source_path?: string };
      features: Array<{ record: Record<string, unknown> }>;
    };

    expect(fetchImpl, 'HEAD then GET — two calls').toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as unknown[][];
    expect(calls[0]![1], 'the first call is the HEAD').toMatchObject({ method: 'HEAD' });
    expect(calls[1]![1], 'the second call is the GET').toMatchObject({ redirect: 'follow' });
    expect(r.acquired.content_hash).toBe(md5(CSV_BYTES));
    expect(r.acquired.bytes_downloaded).toBe(CSV_BYTES.length);
    expect(r.features[0]!.record['Legal name']).toBe('ACME');
    expect(Object.prototype.hasOwnProperty.call(r.acquired, 'source_path'), 'the url block keeps identical keys').toBe(false);
  });
});
