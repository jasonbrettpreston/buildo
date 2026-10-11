// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D2 (T-MAN)
//
// RED/GREEN lock for the CoA decision-PDF MANIFEST CONTRACT (`scripts/lib/coa-notices/manifest.js`,
// pure) and the OFFLINE discover/pin/verify tool (`scripts/analysis/coa-notices/build-manifest.mjs`,
// ESM). Every case here is offline: the tool's `fetchImpl` / `sleep` / `now` seams are injected with
// fakes, so NO network call is ever made (the tool is the only network-touching file in the arm, and
// it is exercised here exactly through its injectable seam).
//
// RED BASELINE (Spec 08 §11.4, both directions): `COA_MANIFEST_IMPL=permissive` swaps
// `validateManifest` for `() => []` — a validator that never trips. Every `T-MAN-*` shape case below
// FAILS against it and PASSES against the committed validator. `T-MAN-valid` and the pure
// `parseDocTitle` cases are green under both (they do not depend on the validator's strictness).
//
// EVERY fixture below is SYNTHETIC: invented doc ids, hashes, byte counts and 64-hex values. The
// URLs are the PUBLIC City of Toronto document paths from §D2's examples — they carry the panel and
// the date only, and no document text is ever fetched or held.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS/ESM modules under test

// ---- the two implementations (RED BASELINE switch) -------------------------------------------

const MANIFEST = require(path.join(REPO_ROOT, 'scripts/lib/coa-notices/manifest.js')) as {
  validateManifest: (m: unknown, options?: { hostAllowlist?: string[] }) => string[];
  parseDocTitle: (url: string) => { hearing_date: string | null; session: string; kind: string; revision: string; panel: string };
  docIdFor: (url: string) => string;
};

const RED = process.env.COA_MANIFEST_IMPL === 'permissive';

/** RED baseline: a validator that reports no problems, whatever the manifest says. */
const permissive = (): string[] => [];

/** The validator the test drives: the permissive fake under the RED baseline, the committed one otherwise. */
const validateManifest: (m: unknown, options?: { hostAllowlist?: string[] }) =>
  string[] = RED ? permissive : MANIFEST.validateManifest;

const TOOL = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/coa-notices/build-manifest.mjs')).href) as Json;
// The tool reuses `sha256` from the pure snapshot module by import (read-only); the test re-derives
// the pinned row's hash with the SAME function, so the assertion pins the tool's behaviour rather
// than a hand-copied literal.
const SNAP = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/bylaw/snapshot.mjs')).href) as Json;

// ---- synthetic manifest builder --------------------------------------------------------------

const HOST_ALLOWLIST = ['www.toronto.ca', 'web.archive.org'];

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);

const URL_A = 'https://www.toronto.ca/wp-content/uploads/2017/08/8f7a-C_of_A_TEY_Decisions_June_28_2017.pdf';
const URL_B = 'https://www.toronto.ca/wp-content/uploads/2017/08/9921-CommitteeofAdjustment-NorthYork-Decision-October-26-2017.pdf';

function doc(overrides: Json = {}): Json {
  return {
    doc_id: 'coa-decision-a',
    url: URL_A,
    sha256: SHA_A,
    bytes: 123456,
    hearing_date: '2017-06-28',
    session: 'full',
    kind: 'committee',
    revision: 'original',
    panel: 'toronto_east_york',
    pinned_at: '2017-08-01T00:00:00.000Z',
    wayback_ts: null,
    ...overrides,
  };
}

/** A valid synthetic manifest: two documents on the allowlisted host, no exclusions. */
function validManifest(): Json {
  return {
    source_family: 'toronto_ca_decision_pdf',
    user_agent: 'BuildInfo/1.0',
    pace_ms: 3000,
    discovered_via: {
      cdx_query: 'https://web.archive.org/cdx/search/cdx?url=www.toronto.ca/wp-content/uploads/2017/*',
      run_at: '2017-08-01T00:00:00.000Z',
    },
    robots: {
      url: 'https://www.toronto.ca/robots.txt',
      sha256: SHA_B,
      fetched_at: '2017-08-01T00:00:00.000Z',
      verdict: 'allowed',
    },
    terms: {
      url: 'https://www.toronto.ca/home/terms-of-use/',
      sha256: SHA_C,
      fetched_at: '2017-08-01T00:00:00.000Z',
    },
    documents: [
      doc({ doc_id: 'coa-decision-a', url: URL_A, sha256: SHA_A }),
      doc({
        doc_id: 'coa-decision-b',
        url: URL_B,
        sha256: SHA_D,
        hearing_date: '2017-10-26',
        panel: 'north_york',
      }),
    ],
    excluded: [],
  };
}

const check = (m: Json, options: { hostAllowlist?: string[] } = { hostAllowlist: HOST_ALLOWLIST }): string[] =>
  validateManifest(m, options);

/** A clean deep clone, so a mutation in one case can never leak into the next. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---- fetch fakes (NEVER a real network call) --------------------------------------------------

/** A minimal `Headers`-shaped object the tool's `res.headers.get` reads. */
function headers(map: Record<string, string>): { get: (k: string) => string | null } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (k: string) => (Object.prototype.hasOwnProperty.call(lower, k.toLowerCase()) ? lower[k.toLowerCase()] : null) as string | null };
}

/** A response whose body is a `Buffer` (only `arrayBuffer()` is implemented — the mock path the tool guards). */
function bodyResponse(body: Buffer, status = 200, headerMap: Record<string, string> = {}): Json {
  return { status, headers: headers(headerMap), arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

/** A redirect response — `Location` read by the tool via `res.headers.get('location')`. */
function redirectResponse(location: string, status = 302): Json {
  return { status, headers: headers({ location }), arrayBuffer: async () => new ArrayBuffer(0) };
}

/** A tiny, structurally-valid PDF head — the tool only checks the `%PDF-` magic. */
function pdfBytes(payload = 'synthetic'): Buffer {
  return Buffer.from(`%PDF-1.4\n${payload}\n%%EOF\n`, 'utf8');
}

describe('CoA decision-PDF manifest — §D2 (T-MAN)', () => {
  // ---- the valid manifest ---------------------------------------------------------------------

  it('T-MAN-valid the valid synthetic manifest has no problems', () => {
    expect(check(validManifest())).toEqual([]);
  });

  // ---- shape rules ----------------------------------------------------------------------------

  it('T-MAN-1 a duplicate url is refused', () => {
    const m = clone(validManifest());
    m.documents.push(doc({ doc_id: 'coa-decision-c', url: URL_A, sha256: SHA_C }));
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-2 a host outside the allowlist is refused', () => {
    const m = clone(validManifest());
    m.documents[0].url = 'https://example.com/wp-content/uploads/2017/08/8f7a-C_of_A_TEY_Decisions_June_28_2017.pdf';
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-3 a 63-hex sha is refused', () => {
    const m = clone(validManifest());
    m.documents[0].sha256 = 'a'.repeat(63);
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-4 a pace under the floor is refused', () => {
    const m = clone(validManifest());
    m.pace_ms = 1500;
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-5 a document without kind is refused', () => {
    const m = clone(validManifest());
    delete m.documents[0].kind;
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-6 a document without session is refused', () => {
    const m = clone(validManifest());
    delete m.documents[0].session;
    expect(check(m).length).toBeGreaterThan(0);
  });

  it('T-MAN-7 no allowlist supplied is refused (fail closed)', () => {
    expect(check(validManifest(), {}).length).toBeGreaterThan(0);
  });

  // ---- title parsing --------------------------------------------------------------------------

  it('T-MAN-title parseDocTitle reads panel/session/kind/revision from the URL basename', () => {
    expect(MANIFEST.parseDocTitle('https://www.toronto.ca/wp-content/uploads/2017/08/8f7a-C_of_A_TEY_Decisions_June_28_2017.pdf')).toEqual({
      hearing_date: '2017-06-28',
      session: 'full',
      kind: 'committee',
      revision: 'original',
      panel: 'toronto_east_york',
    });
    expect(MANIFEST.parseDocTitle('https://www.toronto.ca/wp-content/uploads/2017/10/9921-CommitteeofAdjustment-NorthYork-Decision-October-26-2017.pdf').panel).toBe('north_york');
    expect(MANIFEST.parseDocTitle('https://www.toronto.ca/wp-content/uploads/2017/08/87b5-C_of_A_TEY_Decisions_July_26_2017_PM_Hearing.pdf')).toMatchObject({
      hearing_date: '2017-07-26',
      session: 'pm',
      panel: 'toronto_east_york',
    });
    expect(MANIFEST.parseDocTitle('https://www.toronto.ca/wp-content/uploads/2017/08/9654-Delegated-Pages-from-C_of_A_Etobicoke_Decisions_April_6_2017.revised.pdf')).toMatchObject({
      kind: 'delegated',
      revision: 'revised',
      panel: 'etobicoke_york',
      hearing_date: '2017-04-06',
    });
  });

  // ---- fetchCapped ----------------------------------------------------------------------------

  it('T-MAN-fetch-1 a cross-host redirect is refused and the evil host is never requested', async () => {
    const requested: string[] = [];
    const fetchImpl = async (url: string): Promise<Json> => {
      requested.push(url);
      if (url === URL_A) return redirectResponse('https://evil.example/x.pdf', 302);
      throw new Error(`the evil host must never be requested: ${url}`);
    };
    const r = await TOOL.fetchCapped(URL_A, { fetchImpl, userAgent: 'BuildInfo/1.0', hostAllowlist: HOST_ALLOWLIST });
    expect(r.status).toBe('host_refused');
    expect(requested).toEqual([URL_A]);
  });

  it('T-MAN-fetch-2 an HTML body is not a pdf', async () => {
    const fetchImpl = async (): Promise<Json> => bodyResponse(Buffer.from('<html><body>nope</body></html>', 'utf8'), 200, { 'content-type': 'text/html' });
    const r = await TOOL.fetchCapped(URL_A, { fetchImpl, userAgent: 'BuildInfo/1.0', hostAllowlist: HOST_ALLOWLIST });
    expect(r.status).toBe('not_pdf');
  });

  it('T-MAN-fetch-3 an over-cap body is refused', async () => {
    const fetchImpl = async (): Promise<Json> => bodyResponse(Buffer.alloc(100, 0x25), 200);
    const r = await TOOL.fetchCapped(URL_A, { fetchImpl, userAgent: 'BuildInfo/1.0', hostAllowlist: HOST_ALLOWLIST, maxBytes: 10 });
    expect(r.status).toBe('too_large');
  });

  it('T-MAN-fetch-4 a TimeoutError is a timeout', async () => {
    const fetchImpl = async (): Promise<Json> => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    };
    const r = await TOOL.fetchCapped(URL_A, { fetchImpl, userAgent: 'BuildInfo/1.0', hostAllowlist: HOST_ALLOWLIST });
    expect(r.status).toBe('timeout');
  });

  // ---- pinAll ---------------------------------------------------------------------------------

  it('T-MAN-pin-1 pacing: one sleep between requests, and a pace under the floor is refused', async () => {
    const slept: number[] = [];
    const fetchImpl = async (): Promise<Json> => bodyResponse(pdfBytes());
    const urls = [URL_A, URL_B, 'https://www.toronto.ca/wp-content/uploads/2017/08/1234-C_of_A_TEY_Decisions_May_3_2017.pdf'];
    const res = await TOOL.pinAll(urls, {
      fetchImpl,
      sleep: async (ms: number) => { slept.push(ms); },
      userAgent: 'BuildInfo/1.0',
      paceMs: 3000,
      hostAllowlist: HOST_ALLOWLIST,
      now: () => '2017-08-01T00:00:00.000Z',
    });
    expect(res.documents).toHaveLength(3);
    expect(slept).toEqual([3000, 3000]);
    await expect(TOOL.pinAll(urls, {
      fetchImpl,
      sleep: async () => {},
      userAgent: 'BuildInfo/1.0',
      paceMs: 1500,
      hostAllowlist: HOST_ALLOWLIST,
    })).rejects.toThrow(/pace below floor/);
  });

  it('T-MAN-pin-2 a 404 is excluded and a pinned row carries sha and bytes', async () => {
    const bytes = pdfBytes('pinned-doc');
    const fetchImpl = async (url: string): Promise<Json> => {
      if (url === URL_A) return bodyResponse(bytes, 200);
      if (url === URL_B) return bodyResponse(Buffer.from('not found', 'utf8'), 404);
      throw new Error(`unexpected url: ${url}`);
    };
    const res = await TOOL.pinAll([URL_A, URL_B], {
      fetchImpl,
      sleep: async () => {},
      userAgent: 'BuildInfo/1.0',
      paceMs: 3000,
      hostAllowlist: HOST_ALLOWLIST,
      now: () => '2017-08-01T00:00:00.000Z',
    });
    expect(res.excluded).toHaveLength(1);
    expect(res.excluded[0]).toEqual({ url: URL_B, reason: 'http_404_at_pin' });
    expect(res.documents).toHaveLength(1);
    const pinned = res.documents[0];
    expect(pinned.sha256).toEqual(SNAP.sha256(bytes));
    expect(pinned.bytes).toBe(bytes.length);
  });

  // ---- robots ---------------------------------------------------------------------------------

  it('T-MAN-robots robotsAllows applies only the `*` group', () => {
    const robots = ['User-agent: *', 'Disallow: /wp-admin/', '', 'User-agent: bot', 'Disallow: /wp-content/'].join('\n');
    expect(TOOL.robotsAllows(robots, '/wp-admin/wp-login.php')).toBe(false);
    expect(TOOL.robotsAllows(robots, '/wp-content/uploads/2017/x.pdf')).toBe(true);
    // A `User-agent: bot` group NEVER applies to `*`: a bare disallow under it is invisible here.
    expect(TOOL.robotsAllows('User-agent: bot\nDisallow: /wp-content/', '/wp-content/uploads/2017/x.pdf')).toBe(true);
  });

  // ---- the committed manifest (pinned later — deliberate skip) --------------------------------

  const committed = path.join(REPO_ROOT, 'scripts/seeds/coa-notices/manifest-toronto-2017.json');
  it.skipIf(!fs.existsSync(committed))('T-MAN-committed the committed manifest validates and carries >= 60 documents', () => {
    const m = JSON.parse(fs.readFileSync(committed, 'utf8')) as Json;
    expect(check(m, { hostAllowlist: TOOL.DEFAULTS.hostAllowlist })).toEqual([]);
    expect(m.documents.length).toBeGreaterThanOrEqual(60);
  });
});

describe('discovery query — no mimetype filter (2026-10-08: warc/revisit captures of live PDFs were dropped)', () => {
  it('the default CDX query filters on the .pdf URL extension, never on mimetype', () => {
    expect(TOOL.DEFAULTS.cdxQuery).not.toMatch(/filter=mimetype/);
    expect(TOOL.DEFAULTS.cdxQuery).toContain('filter=original:.*%5C.pdf');
  });
  it('a decision PDF whose only capture is warc/revisit is still a candidate', () => {
    const cdx = [
      ['original', 'timestamp', 'statuscode', 'mimetype'],
      ['http://www.toronto.ca:80/wp-content/uploads/2017/08/8de7-C_of_A_SC_Decisions_July_13_2017.pdf', '20170901000000', '-', 'warc/revisit'],
      ['https://www.toronto.ca/wp-content/uploads/2017/03/aaaa-C_of_A_TEY_Decisions_February_28_2017.pdf', '20170401000000', '200', 'application/pdf'],
    ];
    const out = TOOL.discoverCandidates(cdx);
    expect(out.some((u: string) => u.endsWith('8de7-C_of_A_SC_Decisions_July_13_2017.pdf'))).toBe(true);
    expect(out).toHaveLength(2);
  });
});
