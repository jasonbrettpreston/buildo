// SPEC LINK: MB-67 F4 (output panel O67-23, blocker; operator card CARD-aj3-four item 3 and CARD-local-db):
// any McBylaws script or night whose DB target is not 127.0.0.1:54322 is refused; the cloud waits.
//
// PURE: no disk, no env, no network. Every database target found in the scanned text that is not the
// local stack is `FAIL:V:db-target-not-local:<snippet>`. Fail closed: unreadable input, an unparseable
// URL or an unreadable host is a failure line, never a pass.

const CODE = 'FAIL:V:db-target-not-local';
const MAX_SNIPPET = 60;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOCAL_PORT = '54322';
const CLOUD_HOST = /supabase\.co|supabase\.com|pooler\./i;

const fail = (token) => `${CODE}:${String(token).slice(0, MAX_SNIPPET)}`;
const isLocalHost = (h) => typeof h === 'string' && LOCAL_HOSTS.has(h.toLowerCase());
const hostOf = (token) => {
  try {
    return new URL(token).hostname;
  } catch {
    return null;
  }
};

/** `postgres://` / `postgresql://` URL: local only for a loopback host AND port exactly 54322. */
function urlVerdict(url) {
  const host = hostOf(url);
  if (!host || /^\d+$/.test(host)) return fail(url); // no host, or a truncated token → cannot parse
  let port = '';
  try {
    port = new URL(url).port;
  } catch {
    return fail(url);
  }
  return isLocalHost(host) && port === LOCAL_PORT ? null : fail(url);
}

/** The port a psql/env context declares, if any: `-p N`, `--port N`, `PGPORT=N`. */
function declaredPort(window) {
  const m = window.match(/(?:^|\s)(?:-p|--port)[ =](\S+)|PGPORT[=:]\s*(\S+)/);
  return m ? (m[1] ?? m[2]).replace(/['";]+$/, '') : null;
}

/** `PGHOST` / `--host`: local host, and a declared port (if any) exactly 54322. */
function hostVerdict(label, rawHost, window) {
  const host = rawHost.replace(/^['"]|['"]$/g, '');
  const token = `${label}: ${host}`;
  if (!host || /\$\{|\$\(/.test(host) || !isLocalHost(host)) return fail(token);
  const port = declaredPort(window);
  return port !== null && port !== LOCAL_PORT ? fail(token) : null;
}

/**
 * Every non-local database target in `text`; `[]` = pass.
 * @param {string} text
 * @returns {string[]}
 */
export function scanDbTargets(text) {
  if (typeof text !== 'string') return [fail('<unreadable-input>')];
  const out = [];
  const push = (verdict) => {
    if (verdict !== null && verdict !== undefined) out.push(verdict);
  };

  // 1 + 4 — connection URLs, and any cloud host name.
  const urlRe = /(?:postgres(?:ql)?):\/\/\S*|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:supabase\.co|supabase\.com|pooler\.[a-z0-9.-]+)\b/gi;
  for (const m of text.matchAll(urlRe)) {
    if (/^postgres(?:ql)?:\/\//i.test(m[0])) push(urlVerdict(m[0]));
    else if (CLOUD_HOST.test(m[0])) push(fail(m[0]));
  }

  // 2 — PGHOST= / PGHOST: and psql -h / --host / --host=. On a psql line the env form wins when both
  // are given (the env form is the one the test pins); a line with only `-h` reports the psql form.
  const envHostRe = /\bPGHOST\s*[=:]\s*('[^']*'|"[^"]*"|[^\s;]+)/g;
  const psqlHostRe = /\bpsql\b[^\n;]*?(?:-h\s+(\S+)|--host[=\s]+(\S+))/g;
  for (const m of text.matchAll(envHostRe)) {
    push(hostVerdict('PGHOST', m[1], text.slice(m.index, m.index + 200)));
  }
  for (const m of text.matchAll(psqlHostRe)) {
    const rest = text.slice(m.index + m[0].length);
    const flag = /--host/.test(m[0]) ? '--host' : '-h';
    push(hostVerdict(`psql ${flag}`, m[1] ?? m[2], rest.split(/[\n;]/)[0]));
  }

  // 3 — DATABASE_URL= / DATABASE_URL: whose value is not a local URL.
  const dbUrlRe = /\bDATABASE_URL\s*[=:]\s*(\S+)/g;
  for (const m of text.matchAll(dbUrlRe)) {
    const value = m[1].replace(/^['"]|['"]$/g, '');
    if (/^postgres(?:ql)?:\/\//i.test(value)) push(urlVerdict(value));
    else push(fail(`DATABASE_URL=${value}`));
  }

  // 5 — npm script names starting `cloud:`.
  for (const m of text.matchAll(/\bcloud:[a-z0-9:_-]+/gi)) push(fail(m[0]));

  // The token of a URL already reported must not be reported twice.
  return [...new Set(out)];
}

/**
 * `scanDbTargetsInFiles(files)` — every verdict suffixed with `:<path>`. The caller chooses the
 * files (isDbScopePath gates script, brief and night files).
 * @param {Array<{path: string, text: string}>} files
 * @returns {string[]}
 */
export function scanDbTargetsInFiles(files) {
  if (!Array.isArray(files)) return [fail('<unreadable-file-list>')];
  const out = [];
  for (const file of files) {
    const path = file && typeof file.path === 'string' ? file.path : '<no-path>';
    for (const verdict of scanDbTargets(file && file.text)) out.push(`${verdict}:${path}`);
  }
  return out;
}

/**
 * `isDbScopePath(p)` — true only for the McBylaws gate scripts (not this module), `.cursor` night
 * and brief markdown, and `.mb67-briefs/**`.
 * @param {string} p
 * @returns {boolean}
 */
export function isDbScopePath(p) {
  if (typeof p !== 'string' || p === '') return false;
  const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel === 'scripts/analysis/mcbylaws/db-target.mjs') return false;
  if (/^scripts\/analysis\/mcbylaws(-loop)?\//.test(rel)) return true;
  if (/^\.cursor\/(?:.+\/)?(?:night|brief)[^/]*\.md$/i.test(rel)) return true;
  if (/^\.cursor\/(?:nights|briefs)\/(?:.+\/)?[^/]+\.md$/i.test(rel)) return true;
  // N67-4 — engine briefs carry run lines and connection strings, so they are in scope.
  if (/^\.cursor\/engine-briefs\/(?:.+\/)?[^/]+\.md$/i.test(rel)) return true;
  return /^\.mb67-briefs\//.test(rel);
}
