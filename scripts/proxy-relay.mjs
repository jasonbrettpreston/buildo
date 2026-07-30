#!/usr/bin/env node
/**
 * Local unauthenticated proxy relay — holds the upstream credentials so Chrome
 * never has to.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
 *
 * WHY THIS EXISTS. Chromium ignores credentials in `--proxy-server`, so an
 * authenticated proxy historically needed an MV3 extension calling
 * `chrome.webRequest.onAuthRequired`. That approach is now a dead end:
 * branded Chrome removed `--load-extension` in 137 and removed its opt-out in
 * 142 (unbranded Chromium is exempt today, which is one base-image bump from
 * breaking us), and an MV3 service worker is EVICTED when idle — taking the
 * onAuthRequired listener with it while `chrome.proxy` settings persist, so the
 * browser keeps routing through the proxy while being unable to authenticate.
 * That failure is intermittent and invisible: Chrome just renders "This site
 * can't be reached".
 *
 * This relay listens unauthenticated on 127.0.0.1 and forwards upstream with
 * credentials attached, so Chrome needs only a plain `--proxy-server=
 * http://127.0.0.1:PORT` and no extension at all. Consequences worth naming:
 *   · headed mode + Xvfb are no longer required (they existed ONLY because
 *     --load-extension needs them), so CI can run plain headless;
 *   · credentials stop being written to disk in a generated background.js;
 *   · on CONNECT, proxy-chain pipes raw bytes rather than terminating TLS, so
 *     the browser's own TLS/JA3 fingerprint and ALPN reach the origin intact —
 *     which is exactly what a WAF-sensitive scraper needs (and precisely why
 *     mitmproxy, which re-originates TLS, must NOT be used here).
 *
 * Protocol: prints ONE line of JSON ({"url": "http://127.0.0.1:PORT"}) to
 * stdout once listening, then stays alive until signalled. The parent parses
 * that line to learn the port.
 *
 * Usage: node scripts/proxy-relay.mjs <upstreamUrl> [listenPort]
 */

import { anonymizeProxy, closeAnonymizedProxy } from 'proxy-chain';

const [, , upstreamUrl, portArg] = process.argv;

if (!upstreamUrl) {
  process.stderr.write('proxy-relay: missing upstream proxy URL argument\n');
  process.exit(2);
}

let anonymizedUrl = null;

async function shutdown(code = 0) {
  if (anonymizedUrl) {
    try {
      await closeAnonymizedProxy(anonymizedUrl, true);
    } catch {
      // Best effort: the parent kills our process group regardless, and a
      // failed close must not keep the relay alive past its browser.
    }
  }
  process.exit(code);
}

try {
  anonymizedUrl = await anonymizeProxy({
    url: upstreamUrl,
    port: Number(portArg) || 0, // 0 = let the OS pick a free port
    // Verified necessary 2026-07-29: without this an https:// upstream fails
    // its CONNECT with proxy-chain's 599. Only affects the TLS hop to OUR
    // proxy provider, never the browser's TLS to the origin (that stays a raw
    // byte pipe, preserving the JA3/ALPN fingerprint).
    ignoreProxyCertificate: true,
  });
} catch (err) {
  // Never echo the URL itself — it carries the upstream credentials.
  process.stderr.write(`proxy-relay: failed to start: ${err && err.message}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ url: anonymizedUrl })}\n`);

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// Park forever; the parent owns our lifetime.
await new Promise(() => {});
