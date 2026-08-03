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

const LOADERS = [
  'load-address-points.js',
  'load-parcels.js',
  'load-neighbourhoods.js',
  'load-massing.js',
];

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
