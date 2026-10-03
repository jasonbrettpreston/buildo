'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.1, §C.1.5, §C.3
 *
 * Append-only run-ledger writer for the DeepSeek Execution Engine (SUB-ENG-1).
 *
 * Invariant 1 (§C.1.1, "ledger-or-abort"): the engine may not take a tool
 * call it cannot log — every `append()` call either lands the record and
 * returns, or throws `LedgerWriteError` so the caller aborts the run.
 *
 * The ledger lives OUTSIDE the repo by design (F11) and is opened append-only
 * (`fs.openSync(path, 'a')` — `O_APPEND | O_CREAT`). This module intentionally
 * contains NO `truncate`, `unlink`, `rm`, `rename` or `writeFileSync` call —
 * grep for those five identifiers against this file as a standing lock.
 *
 * `redact()` also lives here (not duplicated in the model-prompt path) so the
 * ledger and the prompt share exactly ONE definition of what a secret looks
 * like (§C.1.5).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

class LedgerWriteError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LedgerWriteError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

// §C.1.5 — patterns checked, in order, against every string that enters a
// model message OR a ledger record.
const SIMPLE_SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
];

// The password segment only — the rest of a postgres(ql):// URL is left
// intact so a redacted record still names which host/db was touched.
const PG_URL_PASSWORD_PATTERN = /(postgres(?:ql)?:\/\/[^:/\s@]+:)([^@/\s]+)(@)/gi;

const KEY_VALUE_PATTERN = /(api[_-]?key|secret|token|password)(\s*[=:]\s*)(["']?)([^\s"']{8,})(["']?)/gi;

// ---------------------------------------------------------------------------
// Real-secret literal registry (WF3 engine-redaction, L17, 2026-10-03).
//
// The shape patterns above are right for the LEDGER (an audit artifact the
// model never reads) but WRONG for the model view: a fixture literal such as
// `postgres://u:testpw@...` or `password = 's3cretpw'` is not a secret, yet
// shape-masking it showed the model `[REDACTED]`, which the model then copied
// into its edits (MEASURED 2026-10-03, two seats). The model view therefore
// masks only VALUES THAT ARE ACTUALLY SECRETS — the values of sensitive-named
// env vars present in this process, the password component of any
// credential-bearing URL env value, the same for every `.env*` file the
// engine registered at run start — plus the vendor token shapes
// (`sk-`/`AIza`/`gh*_`): near-zero false-positive, kept as a defence for a
// real key whose env var is absent.
// ---------------------------------------------------------------------------

// A name that marks its value as a secret. `_PATH`/`_FILE` (a path to a key,
// not the key), `NEXT_PUBLIC_*` (public by construction) and `*_CLIENT_ID`
// (an OAuth client id is not a credential) are excluded.
const SENSITIVE_NAME_RE = /(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|_PASS$|^PASS|PRIVATE_KEY|CREDENTIAL|ACCESS_KEY)/i;
const NON_SECRET_NAME_RE = /(_PATH$|_FILE$|^NEXT_PUBLIC_|_CLIENT_ID$)/i;
const DATABASE_URL_NAME_RE = /(^|_)DATABASE_URL$/i;
const USERNAME_NAME_RE = /(_USER|_USERNAME)$/i;
// A credential-bearing URL value: scheme://user:password@...
const URL_CREDENTIAL_RE = /^[a-z][a-z0-9+.-]*:\/\/([^:/\s@]+):([^@/\s]+)@/i;
// Model view only: a standalone literal shorter than this is not masked on
// its own (it would mask ordinary text everywhere); a URL password is still
// masked in its `:pw@` position.
const MIN_STANDALONE_SECRET_LEN = 8;
// Both views (model AND ledger, L17 round 2): a single lowercase word under
// 16 chars (a dev/default credential such as the local DB's user-named
// password), or any value equal to a known user name, is not masked
// standalone — masking it would mask that word in every path, identifier and
// psql command line. The ledger's SHAPE patterns still mask it in a URL.
const WEAK_WORD_RE = /^[a-z]{1,15}$/;
const URLPW_PREFIX = '\u0000urlpw:';
const USER_PREFIX = '\u0000user:';

const registeredSecretLiterals = new Set();

// → { standalone: string[], urlPasswords: string[], usernames: string[] }
function secretLiteralsForEntry(name, value) {
  const out = { standalone: [], urlPasswords: [], usernames: [] };
  if (typeof value !== 'string' || value.trim().length === 0) {
    return out;
  }
  const v = value.trim();
  const url = URL_CREDENTIAL_RE.exec(v);
  if (url) {
    out.usernames.push(url[1]);
    // user === password (a dev DB such as postgres://x:x@): the "password"
    // is the published user name — nothing secret to mask, and masking it
    // would re-create L17 on every test literal that copies the dev URL.
    if (url[2] === url[1]) {
      return out;
    }
    out.standalone.push(v); // the whole URL
    out.urlPasswords.push(url[2]);
    out.standalone.push(url[2]);
    try {
      const decoded = decodeURIComponent(url[2]);
      if (decoded !== url[2]) {
        out.urlPasswords.push(decoded);
        out.standalone.push(decoded);
      }
    } catch {
      // not valid percent-encoding; the raw form is already listed.
    }
    return out;
  }
  // Sensitive wins over the username rule (a name matching both is a secret).
  if (name === 'DEEPSEEK_API_KEY' || DATABASE_URL_NAME_RE.test(name)
    || (SENSITIVE_NAME_RE.test(name) && !NON_SECRET_NAME_RE.test(name))) {
    out.standalone.push(v);
  } else if (USERNAME_NAME_RE.test(name)) {
    out.usernames.push(v);
  }
  return out;
}

/**
 * registerSecretLiterals(entries) — entries is `{ NAME: value }` (e.g. a
 * parsed `.env`). The same name/value rule as the live env applies, so a
 * `.env`'s `PG_HOST=localhost` is NOT registered while its
 * `*_SECRET_ACCESS_KEY` is. Process-lifetime (one engine run per process).
 */
function registerSecretLiterals(entries) {
  if (!entries || typeof entries !== 'object') {
    return;
  }
  for (const name of Object.keys(entries)) {
    const r = secretLiteralsForEntry(name, entries[name]);
    for (const lit of r.standalone) registeredSecretLiterals.add(lit);
    for (const pw of r.urlPasswords) registeredSecretLiterals.add(URLPW_PREFIX + pw);
    for (const u of r.usernames) registeredSecretLiterals.add(USER_PREFIX + u);
  }
}

/**
 * parseDotEnv(text) — minimal KEY=VALUE reader (comments, `export `, matched
 * outer quotes). Used only to learn which VALUES are secrets; its output is
 * never shown to the model.
 */
function parseDotEnv(text) {
  const out = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(rawLine);
    if (!m) continue;
    let v = m[2].trim();
    const quoted = v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")));
    v = quoted ? v.slice(1, -1) : v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

/**
 * registerSecretsFromEnvFiles(dirs) — reads every `.env` / `.env.*` file
 * directly inside each dir (`.example`/`.sample`/`.template` excluded:
 * placeholders, not secrets — masking them would re-create L17) and
 * registers its secret values. Returns the files read. An unreadable file is
 * skipped (best-effort: the live env is still masked regardless).
 */
function registerSecretsFromEnvFiles(dirs) {
  const read = [];
  for (const dir of Array.isArray(dirs) ? dirs : []) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^\.env(\..+)?$/.test(name) || /\.(example|sample|template)$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        if (!fs.statSync(file).isFile()) continue;
        registerSecretLiterals(parseDotEnv(fs.readFileSync(file, 'utf8')));
        read.push(file);
      } catch {
        // an unreadable env file is skipped; see the docblock.
      }
    }
  }
  return read;
}

// Live env + registry, recomputed per call (tests change env between calls;
// the cost is one scan of process.env, negligible next to a model turn).
function collectSecretLiterals(extraLiterals) {
  const standalone = new Set();
  const urlPasswords = new Set();
  const usernames = new Set();
  for (const lit of registeredSecretLiterals) {
    if (lit.startsWith(URLPW_PREFIX)) urlPasswords.add(lit.slice(URLPW_PREFIX.length));
    else if (lit.startsWith(USER_PREFIX)) usernames.add(lit.slice(USER_PREFIX.length));
    else standalone.add(lit);
  }
  for (const name of Object.keys(process.env)) {
    const r = secretLiteralsForEntry(name, process.env[name]);
    for (const lit of r.standalone) standalone.add(lit);
    for (const pw of r.urlPasswords) urlPasswords.add(pw);
    for (const u of r.usernames) usernames.add(u);
  }
  // A caller's explicit extraLiterals are always masked (no weak-word
  // exception): the caller named them as secrets.
  const explicit = new Set();
  for (const lit of Array.isArray(extraLiterals) ? extraLiterals : []) {
    if (typeof lit === 'string') explicit.add(lit);
  }
  return { standalone, urlPasswords, usernames, explicit };
}

function maskLiterals(str, extraLiterals, minLen) {
  const { standalone, urlPasswords, usernames, explicit } = collectSecretLiterals(extraLiterals);
  let out = str;
  // Longest first, so a whole URL is masked before its password component.
  const ordered = [
    ...[...standalone].filter((l) => l.length >= minLen && !usernames.has(l) && !WEAK_WORD_RE.test(l)),
    ...[...explicit].filter((l) => l.length >= 4),
  ].sort((a, b) => b.length - a.length);
  for (const literal of ordered) {
    if (out.includes(literal)) {
      out = out.split(literal).join('[REDACTED]');
    }
  }
  for (const pw of urlPasswords) {
    const needle = `:${pw}@`;
    if (pw.length > 0 && out.includes(needle)) {
      out = out.split(needle).join(':[REDACTED]@');
    }
  }
  return out;
}

/**
 * redact(str, extraLiterals?) — §C.1.5, the LEDGER redactor. Replaces every
 * recognised secret SHAPE with the literal text `[REDACTED]`, then every
 * real-secret literal (live sensitive env values incl. `DEEPSEEK_API_KEY` and
 * `DATABASE_URL`, registered `.env` values, `extraLiterals`), with the same user-name / weak-word
 * exceptions as the model view (L17 round 2 — the ledger stays readable).
 * The ledger is never shown to the model. NEVER use this on a
 * model-facing string — use redactForModel (L17).
 */
function redact(str, extraLiterals) {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }
  let out = str;
  for (const pattern of SIMPLE_SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  out = out.replace(PG_URL_PASSWORD_PATTERN, (_m, pre, _pass, at) => `${pre}[REDACTED]${at}`);
  out = out.replace(KEY_VALUE_PATTERN, (_m, key, sep) => `${key}${sep}[REDACTED]`);
  return maskLiterals(out, extraLiterals, 4);
}

/**
 * redactForModel(str, extraLiterals?) — §C.1.5 as applied to every string
 * that enters a MODEL message (system prompt incl. the brief, tool results,
 * re-fed assistant turns). Masks real secret VALUES only (+ the vendor token
 * shapes); a password-LOOKING literal that is not a real secret is shown
 * verbatim, so the model never sees — and never copies — a `[REDACTED]`
 * mask into code (L17).
 */
function redactForModel(str, extraLiterals) {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }
  let out = str;
  for (const pattern of SIMPLE_SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return maskLiterals(out, extraLiterals, MIN_STANDALONE_SECRET_LEN);
}

/**
 * Recursively redacts every string leaf of a JSON-serialisable value.
 * Non-string leaves (numbers, booleans, null) pass through untouched.
 */
function redactDeep(value, extraLiterals, depth = 0) {
  if (depth > 20) {
    return value; // defensive cap; the ledger schema is never this deep
  }
  if (typeof value === 'string') {
    return redact(value, extraLiterals);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, extraLiterals, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = redactDeep(value[key], extraLiterals, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * redactForModelDeep(value) — redactForModel over every string leaf (applied
 * BEFORE JSON.stringify, so a secret containing a quote/backslash is matched
 * in its raw form, not its JSON-escaped one).
 */
function redactForModelDeep(value, depth = 0) {
  if (depth > 20) {
    return value;
  }
  if (typeof value === 'string') {
    return redactForModel(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForModelDeep(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = redactForModelDeep(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * resolveLedgerDir() — §C.3. `BUILDO_EXEC_LEDGER_DIR` > the OS default
 * (`%LOCALAPPDATA%/buildo-exec-runs` on Windows, `~/.local/share/buildo-exec-runs`
 * elsewhere) — always outside the repo (F11).
 */
function resolveLedgerDir() {
  if (process.env.BUILDO_EXEC_LEDGER_DIR) {
    return process.env.BUILDO_EXEC_LEDGER_DIR;
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'buildo-exec-runs');
  }
  return path.join(os.homedir(), '.local', 'share', 'buildo-exec-runs');
}

/**
 * openLedger({ ledgerDir, runId }) → { path, append(record), close() }.
 *
 * `append` stamps the common fields (`v`, `run_id`, `seq`, `ts`) onto the
 * caller's record, redacts every string leaf, and writes ONE synchronous
 * JSON line. `seq` is 1-based and gap-free per ledger instance.
 */
function openLedger({ ledgerDir, runId } = {}) {
  if (!runId) {
    throw new LedgerWriteError('openLedger requires a runId');
  }
  const dir = ledgerDir || resolveLedgerDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new LedgerWriteError(`failed to create ledger dir: ${dir}`, err);
  }
  const filePath = path.join(dir, `${runId}.jsonl`);
  let fd;
  try {
    fd = fs.openSync(filePath, 'a');
  } catch (err) {
    throw new LedgerWriteError(`failed to open ledger file: ${filePath}`, err);
  }

  let seq = 0;
  let closed = false;

  return {
    path: filePath,
    append(record) {
      if (closed) {
        throw new LedgerWriteError('cannot append to a closed ledger');
      }
      if (!record || typeof record !== 'object' || !record.kind) {
        throw new LedgerWriteError('ledger record requires a "kind" field');
      }
      seq += 1;
      const full = {
        v: 1,
        run_id: runId,
        seq,
        ts: new Date().toISOString(),
        ...record,
      };
      const redacted = redactDeep(full);
      let line;
      try {
        line = JSON.stringify(redacted) + '\n';
      } catch (err) {
        seq -= 1;
        throw new LedgerWriteError('ledger record is not JSON-serialisable', err);
      }
      try {
        fs.writeSync(fd, line);
      } catch (err) {
        seq -= 1;
        throw new LedgerWriteError(`ledger write failed: ${filePath}`, err);
      }
      return redacted;
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        fs.closeSync(fd);
      } catch {
        // best-effort close; a failed close after successful writes is not
        // itself a ledger-write failure and must not throw during shutdown.
      }
    },
  };
}

/**
 * generateRunId() — `run_id` = `<UTC yyyymmddThhmmssZ>-<8 hex>` (§C.3). Lives
 * here (scripts/lib/**, exempt from the pipeline `new Date()` ban that exists
 * to force DB-timestamp reads through `pipeline.getDbTimestamp` — this run id
 * is a filename component, not a DB write, and the engine opens no DB
 * connection at all).
 */
function generateRunId() {
  const iso = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rand = crypto.randomBytes(4).toString('hex');
  return `${iso}-${rand}`;
}

module.exports = {
  openLedger,
  redact,
  redactForModel,
  redactForModelDeep,
  redactDeep,
  registerSecretLiterals,
  registerSecretsFromEnvFiles,
  parseDotEnv,
  resolveLedgerDir,
  generateRunId,
  LedgerWriteError,
};
