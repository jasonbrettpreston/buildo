/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D2
 *
 * build-manifest — the OFFLINE discover / pin / verify / measure tool for the CoA decision-PDF
 * inventory. It is the ONLY place in the CoA decision-notice arm that touches the network, and
 * it does so politely: strictly sequential, paced, one User-Agent, capped bodies.
 *
 * USAGE
 *   node scripts/analysis/coa-notices/build-manifest.mjs --discover [--cdx-file <saved.json>] --out candidates.json
 *   node scripts/analysis/coa-notices/build-manifest.mjs --pin --candidates candidates.json --out manifest.json \
 *        [--pace-ms N] [--user-agent S] [--exclude-delegated]
 *   node scripts/analysis/coa-notices/build-manifest.mjs --verify --manifest manifest.json
 *   node scripts/analysis/coa-notices/build-manifest.mjs --measure --manifest manifest.json
 *
 * WHY OFFLINE: discovery/pinning happen once, by hand, into a committed JSON inventory. The
 * pipeline never fetches a decision PDF at run time. Every write is JSON via `stableStringify`
 * from `scripts/analysis/bylaw/snapshot.mjs` (read-only reuse). Writes are numbers and IDs only —
 * a PDF is hashed in memory and DROPPED (never written, never logged).
 *
 * PURITY FOR TESTS: every exported function is injectable (`fetchImpl`, `sleep`, `now`, …) and
 * the pure exports (`discoverCandidates`, `pinAll`, `verifyAll`, `measureDocs`) import cleanly
 * WITHOUT `scripts/lib/pdf-text.js` or `scripts/lib/compute/load-coa-notices.js`: those two
 * modules are required LAZILY (`createRequire`) only on the paths that need them.
 *
 * NETWORK CALLS ARE NEVER MADE AT MODULE LOAD; the CLI runs only under a direct invocation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { sha256, stableStringify } from '../bylaw/snapshot.mjs';
import { parseDocTitle, docIdFor, validateManifest } from '../../lib/coa-notices/manifest.js';

const require = createRequire(import.meta.url);

export const DEFAULTS = {
  userAgent: 'BuildInfo/1.0',
  paceMs: 3000,
  hostAllowlist: ['www.toronto.ca', 'web.archive.org'],
  maxDocBytes: 52428800,
  timeoutMs: 120000,
  cdxQuery: 'https://web.archive.org/cdx/search/cdx?url=www.toronto.ca/wp-content/uploads/2017/*&output=json&fl=original,timestamp,statuscode,mimetype&filter=mimetype:application/pdf&collapse=urlkey',
  robotsUrl: 'https://www.toronto.ca/robots.txt',
  termsUrl: 'https://www.toronto.ca/home/terms-of-use/',
};

// --- small pure helpers -------------------------------------------------------------------------

/** Real sleep, used by the CLI (injectable `sleep` everywhere else). */
function realSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ISO-8601 UTC now, used by the CLI (injectable `now` everywhere else). */
function realNow() {
  return new Date().toISOString();
}

/** The hostname of a URL, or null if the URL will not parse. */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Normalise a discovered URL to the https canonical form the manifest stores: force `https:`
 * and drop an explicit `:80`.
 */
function normaliseUrl(url) {
  const u = new URL(String(url));
  u.protocol = 'https:';
  if (u.port === '80') u.port = '';
  return u.href;
}

// --- discover ---------------------------------------------------------------------------------

/**
 * discoverCandidates(cdxJson) → sorted unique `original` URLs from a CDX JSON array-of-arrays
 * (first row is the header). Keeps only basenames that look like a committee decision document:
 * `(C_of_A|Committee of Adjustment)` AND `Decision`.
 */
export function discoverCandidates(cdxJson) {
  let rows = cdxJson;
  if (typeof cdxJson === 'string') rows = JSON.parse(cdxJson);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const header = Array.isArray(rows[0]) ? rows[0].map((h) => String(h).toLowerCase()) : [];
  const origIdx = header.indexOf('original');
  const col = origIdx >= 0 ? origIdx : 0;

  const seen = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const raw = row[col];
    if (typeof raw !== 'string' || raw === '') continue;

    let normalised;
    try {
      normalised = normaliseUrl(raw);
    } catch {
      continue;
    }

    const base = normalised.split('/').pop() || '';
    if (!/(C_of_A|Committee.?of.?Adjustment)/i.test(base)) continue;
    if (!/Decision/i.test(base)) continue;

    seen.add(normalised);
  }
  return [...seen].sort();
}

// --- fetch ------------------------------------------------------------------------------------

/**
 * fetchCapped(url, opts) → { status, http_status, bytes|null, sha256|null, final_url }.
 *
 * Follows redirects MANUALLY (max `maxRedirects` hops) and refuses (`host_refused`) when ANY hop
 * host — the first URL included — is not in `hostAllowlist`. Reads the body as a stream, aborting
 * (`too_large`) past `maxBytes`. Body not starting `%PDF-` → `not_pdf` (bytes dropped). Never
 * throws for a network outcome; an `AbortError` is `timeout`.
 */
export async function fetchCapped(url, opts = {}) {
  const {
    fetchImpl,
    userAgent,
    hostAllowlist = [],
    maxBytes = DEFAULTS.maxDocBytes,
    timeoutMs = DEFAULTS.timeoutMs,
    maxRedirects = 5,
  } = opts;

  let current = String(url);
  let httpStatus = null;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const host = hostOf(current);
    if (host === null || !hostAllowlist.includes(host)) {
      return { status: 'host_refused', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
    }

    let res;
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': userAgent, Accept: 'application/pdf,*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return { status: 'timeout', http_status: null, bytes: null, sha256: null, final_url: current };
      }
      return { status: 'http_error', http_status: null, bytes: null, sha256: null, final_url: current };
    }

    httpStatus = res.status;

    if (httpStatus >= 300 && httpStatus < 400) {
      const location = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
      if (!location) {
        return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      let next;
      try {
        next = new URL(location, current).href;
      } catch {
        return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      if (hop === maxRedirects) {
        return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      current = next;
      continue;
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
    }

    const contentLength = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : null;
    if (contentLength && Number(contentLength) > maxBytes) {
      return { status: 'too_large', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
    }

    // The fetch mock in tests may only implement arrayBuffer() (no streaming body).
    if (!res.body || typeof res.body.getReader !== 'function') {
      let buf;
      try {
        buf = Buffer.from(await res.arrayBuffer());
      } catch {
        return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      if (buf.length > maxBytes) {
        return { status: 'too_large', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      return finishBody(buf, httpStatus, current);
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.length;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Nothing to do: we already decided too_large.
          }
          return { status: 'too_large', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
        }
        chunks.push(Buffer.from(value));
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return { status: 'timeout', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
      }
      return { status: 'http_error', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
    }

    return finishBody(Buffer.concat(chunks), httpStatus, current);
  }

  return { status: 'host_refused', http_status: httpStatus, bytes: null, sha256: null, final_url: current };
}

/** A complete body → the result shape. `%PDF-` magic only; the bytes are otherwise dropped. */
function finishBody(buf, httpStatus, finalUrl) {
  const hasMagic =
    buf.length >= 5 &&
    buf[0] === 0x25 && // %
    buf[1] === 0x50 && // P
    buf[2] === 0x44 && // D
    buf[3] === 0x46 && // F
    buf[4] === 0x2d; //   -
  if (!hasMagic) {
    return { status: 'not_pdf', http_status: httpStatus, bytes: null, sha256: null, final_url: finalUrl };
  }
  return { status: 'ok', http_status: httpStatus, bytes: buf, sha256: sha256(buf), final_url: finalUrl };
}

// --- pin --------------------------------------------------------------------------------------

/**
 * pinAll(urls, opts) → { documents, excluded, log }.
 *
 * STRICTLY sequential: `await sleep(paceMs)` before every request except the first. Refuses a
 * pace below the floor. Each `ok` becomes a document row (bytes then dropped); a 404 becomes an
 * `http_404_at_pin` exclusion; every other failure, and a document with no parseable hearing
 * date, is logged and NOT pinned.
 */
export async function pinAll(candidateUrls, opts = {}) {
  let urls = candidateUrls;
  const {
    fetchImpl,
    sleep,
    userAgent = DEFAULTS.userAgent,
    paceMs = DEFAULTS.paceMs,
    hostAllowlist = DEFAULTS.hostAllowlist,
    maxBytes = DEFAULTS.maxDocBytes,
    timeoutMs = DEFAULTS.timeoutMs,
    now = realNow,
    excludeDelegated = false,
  } = opts;

  if (!(paceMs >= 2000)) throw new Error('pace below floor');

  const documents = [];
  const excluded = [];
  const log = [];
  urls = [...new Set(urls)];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (i > 0) await sleep(paceMs);

    const title = parseDocTitle(url);

    if (excludeDelegated && title.kind === 'delegated') {
      excluded.push({ url, reason: 'delegated_decision' });
      continue;
    }

    const r = await fetchCapped(url, { fetchImpl, userAgent, hostAllowlist, maxBytes, timeoutMs });

    if (r.status === 'ok') {
      if (title.hearing_date === null) {
        r.bytes.fill(0);
        log.push({ url, status: 'no_hearing_date' });
        continue;
      }
      documents.push({
        doc_id: docIdFor(url),
        url,
        sha256: r.sha256,
        bytes: r.bytes.length,
        hearing_date: title.hearing_date,
        session: title.session,
        kind: title.kind,
        revision: title.revision,
        panel: title.panel,
        pinned_at: now(),
        wayback_ts: null,
      });
      // The bytes are zero-filled and dropped here — only the hash survives.
      r.bytes.fill(0);
      continue;
    }

    if (r.status === 'http_error' && r.http_status === 404) {
      excluded.push({ url, reason: 'http_404_at_pin' });
      continue;
    }

    log.push({ url, status: r.status, http_status: r.http_status });
  }

  return { documents, excluded, log };
}

// --- verify -----------------------------------------------------------------------------------

/**
 * verifyAll(manifest, opts) → [{ doc_id, result }] with result `match` | `sha_changed` |
 * `http_error`. Same pacing discipline as `pinAll`.
 */
export async function verifyAll(manifest, opts = {}) {
  const {
    fetchImpl,
    sleep,
    userAgent = DEFAULTS.userAgent,
    paceMs = DEFAULTS.paceMs,
    hostAllowlist = DEFAULTS.hostAllowlist,
    maxBytes = DEFAULTS.maxDocBytes,
    timeoutMs = DEFAULTS.timeoutMs,
  } = opts;

  if (!(paceMs >= 2000)) throw new Error('pace below floor');

  const docs = Array.isArray(manifest && manifest.documents) ? manifest.documents : [];
  const out = [];

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (i > 0) await sleep(paceMs);

    const r = await fetchCapped(d.url, { fetchImpl, userAgent, hostAllowlist, maxBytes, timeoutMs });
    if (r.status !== 'ok') {
      out.push({ doc_id: d.doc_id, result: 'http_error' });
      continue;
    }
    r.bytes.fill(0);
    out.push({ doc_id: d.doc_id, result: r.sha256 === d.sha256 ? 'match' : 'sha_changed' });
  }

  return out;
}

// --- measure (P0) -----------------------------------------------------------------------------

/**
 * measureDocs(manifest, opts) → per doc `{ doc_id, status, page_count, notices, items,
 * mailed_lag_days }`. Numbers and ids ONLY — never document text. The body buffer is zero-filled
 * after each document. `extract` (pdf text) and `shapeDocument` are injected; the CLI loads them
 * lazily.
 */
export async function measureDocs(manifest, opts = {}) {
  const {
    fetchImpl,
    sleep,
    extract,
    shapeDocument,
    userAgent = DEFAULTS.userAgent,
    paceMs = DEFAULTS.paceMs,
    hostAllowlist = DEFAULTS.hostAllowlist,
    maxBytes = DEFAULTS.maxDocBytes,
    timeoutMs = DEFAULTS.timeoutMs,
    config = { maxPages: 400, maxTextChars: 5000000, lineYTolerance: 2 },
  } = opts;

  if (!(paceMs >= 2000)) throw new Error('pace below floor');

  const docs = Array.isArray(manifest && manifest.documents) ? manifest.documents : [];
  const out = [];

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (i > 0) await sleep(paceMs);

    const r = await fetchCapped(d.url, { fetchImpl, userAgent, hostAllowlist, maxBytes, timeoutMs });
    if (r.status !== 'ok') {
      out.push({ doc_id: d.doc_id, status: r.status, page_count: null, notices: 0, items: 0, mailed_lag_days: [] });
      continue;
    }

    let res;
    let shaped = null;
    try {
      res = await extract(r.bytes, config);
      if (res && res.status === 'ok' && Array.isArray(res.pages)) shaped = shapeDocument({ ...d, text_pages: res.pages }, {});
    } catch (err) {
      // a closed code only (COA_PARSE_E_*/PDF_TEXT_E_*), never document text
      res = { status: 'extract_error', page_count: null, pages: null, code: err && err.code ? String(err.code) : 'unknown' };
    } finally {
      r.bytes.fill(0);
    }

    let notices = 0;
    let items = 0;
    const lags = [];
    if (shaped) {
      const list = Array.isArray(shaped && shaped.notices) ? shaped.notices : [];
      notices = list.length;
      items = list.reduce((n, nt) => n + (Array.isArray(nt && nt.items) ? nt.items.length : 0), 0);
      const hearing = d.hearing_date ? Date.parse(`${d.hearing_date}T00:00:00Z`) : null;
      for (const nt of list) {
        const mailed = nt && nt.decision_mailed_on;
        if (typeof mailed !== 'string') continue;
        const t = Date.parse(`${mailed}T00:00:00Z`);
        if (Number.isNaN(t) || hearing === null || Number.isNaN(hearing)) continue;
        lags.push(Math.round((t - hearing) / 86400000));
      }
    }

    out.push({
      doc_id: d.doc_id,
      status: res ? res.status : 'extract_error',
      page_count: res && typeof res.page_count === 'number' ? res.page_count : null,
      notices,
      items,
      mailed_lag_days: lags,
    });

  }

  return out;
}

// --- CLI --------------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--discover' || a === '--pin' || a === '--verify' || a === '--measure' || a === '--exclude-delegated') {
      args[a.slice(2)] = true;
    } else if (a === '--out' || a === '--cdx-file' || a === '--candidates' || a === '--manifest' || a === '--pace-ms' || a === '--user-agent') {
      args[a.slice(2)] = argv[++i];
    } else {
      args._.push(a);
    }
  }
  return args;
}

/**
 * robotsAllows(text, urlPath) → may a generic crawler fetch `urlPath`? RFC 9309 semantics for the group(s)
 * that apply to every agent (`User-agent: *`): the LONGEST matching Allow/Disallow pattern wins, Allow wins a
 * tie, `*` matches any run and a trailing `$` anchors the end; an empty Disallow allows everything. PURE.
 */
export function robotsAllows(text, urlPath) {
  let applies = false;
  let inAgentLines = false;
  const rules = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!inAgentLines) applies = false;
      inAgentLines = true;
      if (val === '*') applies = true;
      continue;
    }
    inAgentLines = false;
    if (applies && (key === 'allow' || key === 'disallow') && val !== '') rules.push({ allow: key === 'allow', pat: val });
  }
  const matches = (pat) => {
    const anchored = pat.endsWith('$');
    const body = (anchored ? pat.slice(0, -1) : pat).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(String(urlPath));
  };
  let best = null;
  for (const r of rules) {
    if (!matches(r.pat)) continue;
    if (!best || r.pat.length > best.pat.length || (r.pat.length === best.pat.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

/**
 * GET a small text resource under the same allowlist as the PDFs: redirects are followed MANUALLY
 * (at most 5) and every hop's host must be allowlisted; the body is capped. Never throws for a network
 * outcome: `{status: 'ok'|'host_refused'|'http_error'|'too_large'|'error', buf}`.
 */
async function fetchAllowedText(url, { fetchImpl, userAgent, hostAllowlist, maxBytes, timeoutMs }) {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    const host = hostOf(current);
    if (host === null || !hostAllowlist.includes(host)) return { status: 'host_refused', buf: null };
    let res;
    try {
      res = await fetchImpl(current, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      return { status: err && (err.name === 'AbortError' || err.name === 'TimeoutError') ? 'timeout' : 'error', buf: null };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
      if (!loc) return { status: 'http_error', buf: null };
      current = new URL(loc, current).href;
      continue;
    }
    if (res.status < 200 || res.status >= 300) return { status: 'http_error', buf: null };
    let buf;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return { status: err && (err.name === 'AbortError' || err.name === 'TimeoutError') ? 'timeout' : 'error', buf: null };
    }
    if (buf.length > maxBytes) return { status: 'too_large', buf: null };
    return { status: 'ok', buf };
  }
  return { status: 'http_error', buf: null };
}

/** robots.txt / terms page: hashed in memory. */
async function fetchText(url, opts) {
  const r = await fetchAllowedText(url, opts);
  return r.status === 'ok' ? { status: 'ok', sha256: sha256(r.buf), text: r.buf.toString('utf8') } : { status: r.status, sha256: null };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, stableStringify(value));
  fs.renameSync(`${file}.tmp`, file);
}

/** The CDX JSON. */
async function fetchTextBody(url, opts) {
  const r = await fetchAllowedText(url, opts);
  return r.status === 'ok' ? { status: 'ok', text: r.buf.toString('utf8') } : { status: r.status, text: null };
}

async function cmdDiscover(args, ctx) {
  const out = args.out;
  if (!out) {
    process.stderr.write('--discover requires --out <candidates.json>\n');
    process.exitCode = 1;
    return;
  }
  let cdxJson;
  let query;
  if (args['cdx-file']) {
    cdxJson = fs.readFileSync(args['cdx-file'], 'utf8');
    query = args['cdx-file'];
  } else {
    const r = await fetchTextBody(ctx.defaults.cdxQuery, ctx);
    if (r.status !== 'ok') {
      process.stderr.write(`cdx fetch failed: ${r.status}\n`);
      process.exitCode = 1;
      return;
    }
    cdxJson = r.text;
    query = ctx.defaults.cdxQuery;
  }

  const candidates = discoverCandidates(cdxJson);
  writeJson(out, { discovered_via: { cdx_query: query, run_at: ctx.now() }, urls: candidates });
  process.stdout.write(`${candidates.length} candidate URL(s) -> ${out}\n`);
}

async function cmdPin(args, ctx) {
  const out = args.out;
  if (!args.candidates || !out) {
    process.stderr.write('--pin requires --candidates <json> --out <manifest.json>\n');
    process.exitCode = 1;
    return;
  }
  const cand = JSON.parse(fs.readFileSync(args.candidates, 'utf8'));
  const urls = Array.isArray(cand) ? cand : Array.isArray(cand.urls) ? cand.urls : [];
  // Lineage is recorded, never fabricated: the candidates file must say how it was discovered.
  if (!cand || !cand.discovered_via || !cand.discovered_via.cdx_query || !cand.discovered_via.run_at) {
    process.stderr.write('--pin: the candidates file carries no discovered_via {cdx_query, run_at} (run --discover); nothing fetched\n');
    process.exitCode = 1;
    return;
  }
  const userAgent = args['user-agent'] || ctx.defaults.userAgent;
  const paceMs = args['pace-ms'] ? Number(args['pace-ms']) : ctx.defaults.paceMs;

  // robots.txt FIRST: the verdict is COMPUTED for every candidate path before any document GET;
  // a disallow (or an unreadable robots.txt) fetches nothing more and writes nothing.
  const robotsRes = await fetchText(ctx.defaults.robotsUrl, { ...ctx, userAgent });
  const disallowed = robotsRes.status !== 'ok'
    ? ['robots.txt unreadable']
    : urls.map((u) => new URL(u).pathname).filter((p) => !robotsAllows(robotsRes.text, p));
  if (disallowed.length > 0) {
    process.stderr.write(`robots.txt disallows (or could not be read for) ${disallowed.length} path(s); nothing fetched or written\n`);
    process.exitCode = 1;
    return;
  }
  await ctx.sleep(paceMs);
  const termsRes = await fetchText(ctx.defaults.termsUrl, { ...ctx, userAgent });
  await ctx.sleep(paceMs);

  const { documents, excluded, log } = await pinAll(urls, {
    ...ctx,
    userAgent,
    paceMs,
    excludeDelegated: Boolean(args['exclude-delegated']),
  });
  for (const l of log) process.stderr.write(`not pinned: ${l.url} (${l.status}${l.http_status ? ` ${l.http_status}` : ''})\n`);
  if (documents.length === 0) {
    process.stderr.write('--pin: no document pinned; nothing written\n');
    process.exitCode = 1;
    return;
  }

  const manifest = {
    source_family: 'toronto_ca_decision_pdf',
    user_agent: userAgent,
    pace_ms: paceMs,
    discovered_via: { cdx_query: cand.discovered_via.cdx_query, run_at: cand.discovered_via.run_at },
    robots: { url: ctx.defaults.robotsUrl, sha256: robotsRes.sha256, fetched_at: ctx.now(), verdict: 'allowed' },
    terms: { url: ctx.defaults.termsUrl, sha256: termsRes.sha256, fetched_at: ctx.now() },
    documents,
    excluded,
  };

  const problems = validateManifest(manifest, { hostAllowlist: ctx.defaults.hostAllowlist });
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`${p}\n`);
    process.exitCode = 1;
    return;
  }

  writeJson(out, manifest);
  process.stdout.write(`${documents.length} pinned, ${excluded.length} excluded, ${log.length} not pinned (stderr) -> ${out}\n`);
}

async function cmdVerify(args, ctx) {
  if (!args.manifest) {
    process.stderr.write('--verify requires --manifest <path>\n');
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const results = await verifyAll(manifest, { ...ctx, userAgent: manifest.user_agent || ctx.defaults.userAgent, paceMs: manifest.pace_ms || ctx.defaults.paceMs });
  const mismatches = results.filter((r) => r.result !== 'match');
  process.stdout.write(stableStringify({ results, mismatches: mismatches.length }));
  if (mismatches.length > 0) process.exitCode = 1;
}

async function cmdMeasure(args, ctx) {
  if (!args.manifest) {
    process.stderr.write('--measure requires --manifest <path>\n');
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  // Lazy: these modules may not exist on the pure paths, and must never load for tests.
  const { extractPdfText } = require('../../lib/pdf-text.js');
  const { shapeDocument } = require('../../lib/compute/load-coa-notices.js');
  const documents = await measureDocs(manifest, {
    fetchImpl: ctx.fetchImpl,
    sleep: ctx.sleep,
    extract: extractPdfText,
    shapeDocument,
    userAgent: manifest.user_agent || ctx.defaults.userAgent,
    paceMs: ctx.defaults.paceMs,
    hostAllowlist: ctx.defaults.hostAllowlist,
  });
  const summary = {
    documents,
    total_notices: documents.reduce((n, d) => n + d.notices, 0),
    total_items: documents.reduce((n, d) => n + d.items, 0),
  };
  process.stdout.write(stableStringify(summary));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = {
    fetchImpl: fetch,
    sleep: realSleep,
    now: realNow,
    defaults: DEFAULTS,
    hostAllowlist: DEFAULTS.hostAllowlist,
    maxBytes: DEFAULTS.maxDocBytes,
    timeoutMs: DEFAULTS.timeoutMs,
    userAgent: DEFAULTS.userAgent,
  };
  if (args.discover) await cmdDiscover(args, ctx);
  else if (args.pin) await cmdPin(args, ctx);
  else if (args.verify) await cmdVerify(args, ctx);
  else if (args.measure) await cmdMeasure(args, ctx);
  else {
    process.stderr.write('usage: build-manifest --discover|--pin|--verify|--measure …\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
