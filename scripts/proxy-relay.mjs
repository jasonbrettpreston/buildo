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

// Suffix match on the hostname. Deny-by-default: anything not listed here is
// refused locally and never touches the paid upstream.
const DEFAULT_ALLOW = [
  'toronto.ca',        // the AIC portal + its warm-entry pages
  'api.ipify.org',     // the proxied-egress proof
];
const allowSuffixes = (process.env.SCRAPER_PROXY_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ALLOW = allowSuffixes.length ? allowSuffixes : DEFAULT_ALLOW;

function isAllowed(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  return ALLOW.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

let blocked = 0;
let allowed = 0;

const server = new Server({
  port: Number(portArg) || 0,
  verbose: false,
  prepareRequestFunction: ({ hostname }) => {
    if (!isAllowed(hostname)) {
      blocked += 1;
      // Throwing refuses the request locally: proxy-chain answers the client
      // with an error and never opens an upstream connection, so zero metered
      // bytes are spent. Logged so a wrongly-blocked host is visible, not a
      // silent mystery — the failure mode this whole session kept hitting.
      process.stderr.write(
        `proxy-relay: BLOCKED ${hostname} (not in allowlist: ${ALLOW.join(',')})\n`
      );
      throw new Error(`Host ${hostname} is not on the scraper proxy allowlist`);
    }
    allowed += 1;
    return { upstreamProxyUrl: upstreamUrl, ignoreUpstreamProxyCertificate: true };
  },
});

server.on('requestFailed', ({ request, error }) => {
  // Never echo the upstream URL — it carries credentials.
  process.stderr.write(
    `proxy-relay: request failed for ${request && request.url}: ${error && error.message}\n`
  );
});

async function shutdown(code = 0) {
  process.stderr.write(`proxy-relay: shutting down (allowed=${allowed} blocked=${blocked})\n`);
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
