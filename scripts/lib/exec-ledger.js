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

/**
 * redact(str, extraLiterals?) — §C.1.5. Replaces every recognised secret
 * shape with the literal text `[REDACTED]`. `extraLiterals` is an additional
 * list of exact strings to scrub (e.g. a brief's own copy of a token); the
 * CURRENT values of `DEEPSEEK_API_KEY` and `DATABASE_URL` are always scrubbed
 * in addition, unconditionally, per §C.1.5's explicit naming of those two
 * env vars — a caller does not have to remember to pass them.
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

  const literals = new Set(Array.isArray(extraLiterals) ? extraLiterals : []);
  if (process.env.DEEPSEEK_API_KEY) {
    literals.add(process.env.DEEPSEEK_API_KEY);
  }
  if (process.env.DATABASE_URL) {
    literals.add(process.env.DATABASE_URL);
  }
  for (const literal of literals) {
    if (typeof literal === 'string' && literal.length >= 4 && out.includes(literal)) {
      out = out.split(literal).join('[REDACTED]');
    }
  }
  return out;
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
  redactDeep,
  resolveLedgerDir,
  generateRunId,
  LedgerWriteError,
};
