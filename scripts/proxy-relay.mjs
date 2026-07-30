#!/usr/bin/env node
/**
 * Local unauthenticated proxy relay — holds the upstream credentials so Chrome
 * never has to, and HARD-CAPS which hosts may consume metered bandwidth.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
 *
 * WHY THIS EXISTS. Chromium ignores credentials in `--proxy-server`, so an
 * authenticated proxy historically needed an MV3 extension calling
 * `chrome.webRequest.onAuthRequired`. That is now a dead end: branded Chrome
 * removed `--load-extension` in 137 and its opt-out in 142, and an idle MV3
 * service worker is evicted, taking onAuthRequired with it while chrome.proxy
 * settings persist. This relay listens unauthenticated on 127.0.0.1 and
 * forwards upstream with credentials attached, so Chrome needs only a plain
 * `--proxy-server=http://127.0.0.1:PORT` and no extension.
 *
 * WHY THE ALLOWLIST (2026-07-30, learned expensively). The moment the proxy
 * actually started working, ALL of Chrome's background chatter began flowing
 * through metered residential bandwidth: 1.76 GB to edgedl.me.gvt1.com —
 * Google's component-update CDN — in a single run (~$6.60, 62 requests
 * averaging 28 MB each), against 2.7 MB of real AIC scraping. Launch flags
 * (--disable-background-networking, --disable-component-update) suppress most
 * of it, but flags are silent when they fail and a future edit can drop one.
 * This allowlist is the belt to that pair of braces: a host not on it never
 * reaches the upstream proxy, so it cannot spend money. Deny-by-default.
 *
 * On CONNECT, allowed traffic is piped as raw bytes — no TLS termination — so
 * the browser's own TLS/JA3 fingerprint and ALPN reach the origin intact.
 * (This is also precisely why mitmproxy must never be used here.)
 *
 * Protocol: prints ONE line of JSON ({"url": "http://127.0.0.1:PORT"}) to
 * stdout once listening, then stays alive until signalled.
 *
 * Usage: node scripts/proxy-relay.mjs <upstreamUrl> [listenPort]
 */

import { Server } from 'proxy-chain';

const [, , upstreamUrl, portArg] = process.argv;

if (!upstreamUrl) {
  process.stderr.write('proxy-relay: missing upstream proxy URL argument\n');
  process.exit(2);
}

// BLOCK-list, deliberately NOT an allowlist. Deny-by-default was reviewed as a
// re-run of the d138bb04 "WAF JavaScript Trap" (2026-03-15): starving the
// portal's bot-challenge script shadow-banned the session permanently, and
// because a refused request here surfaces only as a quiet per-resource 500,
// that failure is INVISIBLE — indistinguishable from "the portal returned
// nothing". Bot-management vendors serve their challenge JS from their OWN
// domains, so an allowlist of *.toronto.ca cannot be known to be complete.
// The cost driver, by contrast, is small and enumerable: block that, allow the
// rest. Overridable via SCRAPER_PROXY_BLOCKLIST.
const DEFAULT_BLOCK = [
  'gvt1.com',                        // edgedl.me.gvt1.com — 1.76 GB / $6.60 in one run
  'google.com',                      // bare google.com — 4.8 MB/run of omnibox/NTP
                                     // preconnect that the per-subdomain entries below
                                     // do NOT cover (suffix match is one-directional)
  'dl.google.com',
  'update.googleapis.com',
  'clients2.google.com',
  'clients2.googleusercontent.com',
  'android.clients.google.com',
  'translate.googleapis.com',
  'translate-pa.googleapis.com',
  'translate.google.com',
  'content-autofill.googleapis.com',
  'safebrowsingohttpgateway.googleapis.com',
  'optimizationguide-pa.googleapis.com',
  'accounts.google.com',
  'mtalk.google.com',
  'connectivitycheck.gstatic.com',
];
const blockSuffixes = (process.env.SCRAPER_PROXY_BLOCKLIST || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const BLOCK = blockSuffixes.length ? blockSuffixes : DEFAULT_BLOCK;

function isAllowed(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  return !BLOCK.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

let blocked = 0;
let allowed = 0;
// Metered-byte accounting (L4): cumulative bytes over the UPSTREAM sockets —
// exactly what Decodo bills. Blocked requests never open an upstream
// connection, so they correctly count zero here.
let bytesUp = 0;
let bytesDown = 0;

// Per-host attribution (R0). The relay logs only REFUSED hosts, so what the
// metered bytes were actually spent ON has never been observable — every
// byte-budget claim so far has been inference from a recon table. connectionId
// is handed to us on the way in and keys the byte stats on the way out, so
// remembering the pairing is all attribution costs.
const hostByConnection = new Map();
const bytesByHost = new Map();

function addHostBytes(hostname, up, down) {
  const key = hostname || 'unknown';
  const prev = bytesByHost.get(key) || { up: 0, down: 0 };
  bytesByHost.set(key, { up: prev.up + up, down: prev.down + down });
}

const server = new Server({
  port: Number(portArg) || 0,
  verbose: false,
  prepareRequestFunction: ({ hostname, connectionId }) => {
    if (connectionId !== undefined) hostByConnection.set(connectionId, hostname);
    if (!isAllowed(hostname)) {
      blocked += 1;
      // Throwing refuses the request locally: proxy-chain answers the client
      // with an error and never opens an upstream connection, so zero metered
      // bytes are spent. Logged so a wrongly-blocked host is visible, not a
      // silent mystery — the failure mode this whole session kept hitting.
      process.stderr.write(`proxy-relay: BLOCKED ${hostname} (cost blocklist)\n`);
      throw new Error(`Host ${hostname} is on the scraper proxy cost blocklist`);
    }
    allowed += 1;
    return { upstreamProxyUrl: upstreamUrl, ignoreUpstreamProxyCertificate: true };
  },
});

server.on('connectionClosed', ({ connectionId, stats }) => {
  if (!stats) return;
  bytesUp += stats.trgTxBytes || 0;
  bytesDown += stats.trgRxBytes || 0;
  addHostBytes(hostByConnection.get(connectionId), stats.trgTxBytes || 0, stats.trgRxBytes || 0);
  hostByConnection.delete(connectionId);
});

// LIVE totals, not just closed ones: Chrome keeps its tunnels open with
// keep-alive until AFTER this relay is torn down, so connectionClosed alone
// reported 0 for an entire run (run 30576202397). Sum the live sockets too,
// and emit a CUMULATIVE line periodically — the scraper keeps the latest.
function currentTotals() {
  let up = bytesUp;
  let down = bytesDown;
  // Live sockets, folded per host too — Chrome's keep-alive tunnels are still
  // open at report time, and they carry most of the bytes.
  const live = new Map();
  for (const id of server.getConnectionIds()) {
    const s = server.getConnectionStats(id);
    if (!s) continue;
    up += s.trgTxBytes || 0;
    down += s.trgRxBytes || 0;
    const host = hostByConnection.get(id) || 'unknown';
    const prev = live.get(host) || { up: 0, down: 0 };
    live.set(host, { up: prev.up + (s.trgTxBytes || 0), down: prev.down + (s.trgRxBytes || 0) });
  }
  const perHost = {};
  for (const [host, v] of bytesByHost) perHost[host] = { up: v.up, down: v.down };
  for (const [host, v] of live) {
    const prev = perHost[host] || { up: 0, down: 0 };
    perHost[host] = { up: prev.up + v.up, down: prev.down + v.down };
  }
  return { up, down, perHost };
}

// Top talkers only — attribution must not become the thing that floods a log.
function topHostsLine(perHost, limit = 12) {
  const ranked = Object.entries(perHost)
    .sort((a, b) => b[1].down - a[1].down)
    .slice(0, limit)
    .map(([host, v]) => `${host}=${v.down}`);
  return ranked.join(' ');
}

let lastBytesLine = '';
function reportBytes() {
  const t = currentTotals();
  const line = `proxy-relay: BYTES up=${t.up} down=${t.down}`;
  if (line !== lastBytesLine) {
    lastBytesLine = line;
    process.stderr.write(`${line}\n`);
    process.stderr.write(`proxy-relay: HOSTBYTES ${topHostsLine(t.perHost)}\n`);
  }
}
const bytesReporter = setInterval(reportBytes, 5000);
bytesReporter.unref();

server.on('requestFailed', ({ request, error }) => {
  // Never echo the upstream URL — it carries credentials.
  process.stderr.write(
    `proxy-relay: request failed for ${request && request.url}: ${error && error.message}\n`
  );
});

async function shutdown(code = 0) {
  // Final cumulative BYTES line BEFORE closing — live sockets are still
  // countable here; after close they are gone.
  reportBytes();
  const t = currentTotals();
  process.stderr.write(
    `proxy-relay: shutting down (allowed=${allowed} blocked=${blocked} ` +
    `bytes_up=${t.up} bytes_down=${t.down})\n`
  );
  try {
    await server.close(true);
  } catch {
    // Best effort — the parent kills our process group regardless.
  }
  process.exit(code);
}

try {
  await server.listen();
} catch (err) {
  process.stderr.write(`proxy-relay: failed to start: ${err && err.message}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${server.port}` })}\n`);

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

await new Promise(() => {});
