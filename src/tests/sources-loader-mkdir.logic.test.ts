// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Pipeline Rehab P2 (2026-08-03) — the gitignored `data/` directory does not
// exist on a fresh checkout (every GitHub Actions runner), and FOUR sources
// loaders' `downloadFile()` helpers `fs.createWriteStream()` straight into it
// without an mkdir: load-address-points.js, load-parcels.js,
// load-neighbourhoods.js (two call sites, one helper), load-massing.js (its
// zip download at :137 precedes its only mkdirSync at :142, which creates
// extractDir, not data/). Result: every scheduled chain-sources run ENOENTs
// on the first loader step.
// (All four are since re-homed onto the runner's acquire.js — see the RE-HOMED
// notes above LOADERS; the fence itself is kept, re-homed, below.)
//
// These tests EXECUTE each loader's real `downloadFile()` source (extracted
// verbatim — the loaders are `pipeline.run()` scripts, so requiring them
// would fire the pipeline) against a destPath inside a fresh temp dir whose
// `data/` subdirectory does NOT exist, with a stubbed 200-response HTTP
// layer. Red before the fix (stream ENOENT, no file written); green once
// `downloadFile()` mkdirs the destination directory itself.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require('os') as typeof import('os');

// load-address-points.js RE-HOMED (Spec 122 §5.1 conversion, batch-2 row 3.1,
// commit 9, 2026-09-24): the file is now the frozen shell
// (`module.exports = pipeline.step(descriptor, compute)`) and has no
// `downloadFile()` function to extract — the runner's own `acquire.js`
// (`downloadFile`/`downloadArchive`, streamed hash-through-to-disk) owns
// destination-directory creation for every INGESTOR uniformly now. The
// successor lock is RE-FREEZE #13's own T1-T5 battery in
// src/tests/step-library.logic.test.ts (acquireExternal / CSV acquisition),
// which asserts the runner's acquisition path on the real CSV-format
// INGESTORs, address_points included.
// load-parcels.js RE-HOMED the same way at its own cutover (batch-2 row 3.7,
// compressed commit ③, 2026-09-24) — same successor lock, parcels included.
// load-massing.js RE-HOMED the same way at its own conversion (batch-2 row 3.6,
// commit ②, 2026-09-27): the frozen shell has no `downloadFile()` (nor its
// `data/3d-massing-wgs84/` cache, M-D10) — `scripts/lib/step/acquire.js`
// downloads into its own mkdtemp directory for the shapefile_zip format too.
// Same successor lock (step-library.logic.test.ts acquisition battery).
// load-neighbourhoods.js RE-HOMED (batch-2 row 3.8, commit ②, 2026-09-28) — the
// LAST of the four: its frozen shell has no `downloadFile()` either (the `data/`
// cache is retired, N-D5), and `scripts/lib/step/acquire.js` downloads into its
// own `fs.mkdtempSync` directory for the geojson + xlsx formats too.
//
// LOADERS is kept (now empty) so a future legacy loader re-joins this fence by
// name — the RUNNING loader list once pinned here is exhausted, and an empty
// list must register zero tests rather than a vacuous green.
const LOADERS: string[] = [];

/**
 * Extract the loader's downloadFile() function source and instantiate it with
 * stubbed collaborators. The stub HTTP layer answers 200 immediately and
 * "pipes" a small payload by ending the write stream with it.
 */
function instantiateDownloadFile(loaderFile: string, onStreamError: (err: Error) => void) {
  const scriptPath = path.resolve(__dirname, '../../scripts', loaderFile);
  const src = fs.readFileSync(scriptPath, 'utf-8');
  const match = src.match(/function downloadFile\(url, destPath\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error(`downloadFile() not found in ${loaderFile}`);

  const fsStub = {
    ...fs,
    createWriteStream(p: string) {
      const ws = fs.createWriteStream(p);
      // The real helpers attach no 'error' listener to the write stream — an
      // unhandled ENOENT would crash the process. Capture it here so the RED
      // assertion is deterministic instead of an unhandled-event crash.
      ws.on('error', onStreamError);
      return ws;
    },
    mkdirSync: fs.mkdirSync.bind(fs),
    unlinkSync: fs.unlinkSync.bind(fs),
    existsSync: fs.existsSync.bind(fs),
  };
  const httpStub = {
    get(_url: string, cb: (res: unknown) => void) {
      const res = {
        statusCode: 200,
        headers: {},
        on() {
          return res;
        },
        pipe(file: { end: (chunk: string) => void }) {
          file.end('payload');
        },
      };
      setImmediate(() => cb(res));
      return {
        on() {
          return this;
        },
      };
    },
  };
  const pipelineStub = { log: { info() {}, warn() {}, error() {} } };
  const safeParsePositiveInt = () => 0;

  // Test-only source extraction: the string handed to new Function is the
  // repo's OWN committed loader source (read from scripts/), never external
  // or user-controlled input — no injection surface.
   
  const factory = new Function(
    'fs',
    'path',
    'https',
    'http',
    'pipeline',
    'safeParsePositiveInt',
    `${match[0]}; return downloadFile;`,
  );
  return factory(fsStub, path, httpStub, httpStub, pipelineStub, safeParsePositiveInt) as (
    url: string,
    destPath: string,
  ) => Promise<string>;
}

// Guarded: with every loader re-homed, LOADERS is empty and an unguarded
// describe.each would register zero tests — a vacuous green. Keep the fence
// silent, not green-by-accident, until a legacy loader re-joins by name.
if (LOADERS.length > 0) {
  describe.each(LOADERS)('%s — downloadFile() on a fresh checkout (no data/)', (loaderFile) => {
  it('creates the missing destination directory itself and lands the file (ENOENT on fresh clone otherwise)', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildo-mkdir-'));
    const destPath = path.join(tmpRoot, 'data', 'download.bin');
    let streamError: Error | null = null;
    const downloadFile = instantiateDownloadFile(loaderFile, (err) => {
      streamError = err;
    });

    try {
      // Pre-fix the promise never settles (the swallowed stream ENOENT kills
      // the 'finish' path) — race a settle window so RED fails on assertions,
      // not on a test timeout.
      await Promise.race([
        downloadFile('https://example.test/fixture.bin', destPath),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      expect(streamError).toBeNull();
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('payload');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
  });
}

// ── P2 mkdir fence — RE-HOMED onto the acquisition seam (batch-2 row 3.8) ──
//
// The fence is not dropped, it MOVED. Pre-conversion each loader's own
// `downloadFile()` had to mkdir its destination directory (the fresh-checkout
// ENOENT documented above). Post-conversion NO loader file downloads anything:
// the shared seam scripts/lib/step/acquire.js creates the destination directory
// itself (`fs.mkdtempSync`) and names every declared format's file, so the
// "no ENOENT on a fresh checkout" guarantee is now owned in exactly one place.
// These two locks pin that ownership: (a) the seam really does mkdtemp + name
// the geojson/xlsx payloads, and (b) none of the four ex-loaders retains the
// write path the fence was originally about.

describe('P2 mkdir fence — re-homed onto the acquisition seam', () => {
  const acquireSource = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/lib/step/acquire.js'), 'utf-8'
  );

  it('acquire.js makes its own temp directory and names every declared download format', () => {
    // The seam does mkdtemp instead of writing into the gitignored `data/`.
    expect(acquireSource).toContain('fs.mkdtempSync(');
    // geojson (load-neighbourhoods primary boundary source) + xlsx (its lookup).
    expect(acquireSource).toContain('source.geojson');
    expect(acquireSource).toContain('source.xlsx');
  });

  it('no ex-loader retains downloadFile() or fs.createWriteStream()', () => {
    for (const loaderFile of [
      'load-neighbourhoods.js',
      'load-massing.js',
      'load-parcels.js',
      'load-address-points.js',
    ]) {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../scripts', loaderFile), 'utf-8'
      );
      expect(src, `${loaderFile} must not carry downloadFile()`).not.toContain('function downloadFile(');
      expect(src, `${loaderFile} must not carry fs.createWriteStream(`).not.toContain('fs.createWriteStream(');
    }
  });
});
