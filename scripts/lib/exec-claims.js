'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.6.3
 *
 * The active-claims registry — `<ledger_dir>/active-claims.json`, a JSON
 * array of `{ claim_id, run_id, pid, repo_root (realpath), branch,
 * write_scope, ts }`, guarded by `<ledger_dir>/active-claims.lock` (O_EXCL,
 * held only for the read-modify-write). This file is SEPARATE from the run
 * ledger (`scripts/lib/exec-ledger.js`) and is written by THIS module, so
 * the ledger writer stays truncate/unlink-free (its own static-source lock,
 * src/tests/deepseek-exec-fences.infra.test.ts commit 7).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeGlob } = require('./exec-glob');

const CLAIMS_FILENAME = 'active-claims.json';
const LOCK_FILENAME = 'active-claims.lock';
const STALE_LOCK_MS = 30000;
const LOCK_ACQUIRE_TIMEOUT_MS = 2000;
const LOCK_RETRY_DELAY_MS = 5;

class ClaimConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClaimConflictError';
    this.code = 'CLAIM_CONFLICT';
  }
}

// Step 9 panel fold, F-DS2 — a corrupt (present but unparsable) active-claims
// registry must ABORT the run, never silently start it with mutual exclusion
// off. Distinct from "no registry file yet" (ENOENT), which stays a legitimate
// fresh-start case.
class ClaimsCorruptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClaimsCorruptError';
    this.code = 'CLAIMS_CORRUPT';
  }
}

function claimsFilePath(ledgerDir) {
  return path.join(ledgerDir, CLAIMS_FILENAME);
}
function lockFilePath(ledgerDir) {
  return path.join(ledgerDir, LOCK_FILENAME);
}

// Step 9 panel fold, F-DS4 — `process.kill(pid, 0)` throws EPERM when the pid
// EXISTS but this process lacks permission to signal it (common cross-user/
// service-account setups), and ESRCH when it genuinely does not exist. The
// old catch-all treated BOTH as "dead", which could prune (and then let a
// SECOND claim overlap) a claim whose holder is very much alive. Only ESRCH
// (or any other code — fail toward "dead" is the documented default, but
// EPERM is the one code that unambiguously means "alive") means dead.
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

// A synchronous, non-spinning sleep (no extra dependency) — Atomics.wait
// blocks the thread efficiently rather than busy-spinning the CPU while this
// short, sub-2-second critical-section retry loop waits its turn.
function sleepSyncMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// Step 9 panel fold, F-DS5 — the claims-registry mutex now carries a payload
// (`{ pid, ts }`) so contention can be resolved by pid-liveness FIRST, with
// mtime staleness as a fallback ONLY when the payload's pid field cannot be
// read (a pre-fold empty lock file, or one written mid-crash) — never as the
// primary signal, so a slow-but-LIVE holder is never stolen from mid-
// critical-section. Release only removes a lock file that still carries OUR
// OWN pid (F-DS5's "release unlinks only if contents match own <owner>" —
// here the owner is the pid, since acquire/release always pair within one
// synchronous call in this module, never across a claim's lifetime).
function readLockPayload(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.pid === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function acquireFileLock(ledgerDir) {
  const lockPath = lockFilePath(ledgerDir);
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  const payload = JSON.stringify({ pid: process.pid, ts: new Date().toISOString() });
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL | O_WRONLY
      fs.writeSync(fd, payload);
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
    // Contended — pid-liveness is the PRIMARY reclaim signal; mtime is the
    // fallback used only when the lock file's pid field is unreadable.
    const holder = readLockPayload(lockPath);
    let reclaimable;
    if (holder) {
      reclaimable = !isPidAlive(holder.pid);
    } else {
      try {
        const stat = fs.statSync(lockPath);
        reclaimable = Date.now() - stat.mtimeMs > STALE_LOCK_MS;
      } catch {
        reclaimable = true; // the lock vanished between the failed open and this stat — retry immediately
      }
    }
    if (reclaimable) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // lost the reclaim race to another waiter — fall through and retry the open
      }
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out acquiring ${lockPath}`);
    }
    sleepSyncMs(LOCK_RETRY_DELAY_MS);
  }
}

function releaseFileLock(ledgerDir) {
  const lockPath = lockFilePath(ledgerDir);
  const holder = readLockPayload(lockPath);
  if (holder && holder.pid !== process.pid) {
    return; // reclaimed from under us (or never actually ours) — never delete another holder's lock
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best-effort release; a missing lock file at release time is not itself a fault
  }
}

// Step 9 panel fold, F-DS2 — ENOENT (no registry file yet) is a legitimate
// fresh-start case and returns []; anything else that fails to read/parse as
// a JSON array is a CORRUPT registry, which THROWS (`CLAIMS_CORRUPT`) rather
// than silently starting the run with mutual exclusion off.
function readClaims(ledgerDir) {
  let raw;
  try {
    raw = fs.readFileSync(claimsFilePath(ledgerDir), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [];
    }
    throw new ClaimsCorruptError(`unable to read active-claims registry: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ClaimsCorruptError(`active-claims registry is corrupt (invalid JSON): ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new ClaimsCorruptError('active-claims registry is corrupt (not a JSON array)');
  }
  return parsed;
}

// Step 9 panel fold, F-DS2 — atomic write (tmp file + renameSync) so a crash
// mid-write can never leave a half-written, unparsable active-claims.json
// for the NEXT reader to trip over as CLAIMS_CORRUPT.
function writeClaims(ledgerDir, claims) {
  const finalPath = claimsFilePath(ledgerDir);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmpPath, JSON.stringify(claims, null, 2));
  fs.renameSync(tmpPath, finalPath);
}

// §C.6.3(b) — "overlap = the literal directory prefix of one glob (everything
// before its first `*`) is a prefix of the other's." Step 9 panel fold,
// F-DS7: both globs are normalised first (leading `./`, backslashes,
// repeated slashes) so `./src/**` and `src/**` compare identically; F-II2:
// this prefix rule STAYS (it over-approximates only on same-literal-stem
// siblings, e.g. `src/foo*.ts` vs `src/foo/*.ts` — fail-closed, documented
// in §C.6.3) — the actual false-positive class (an UNANCHORED glob like
// `*.md`, whose prefix is the empty string and therefore "overlaps" every
// scope) is closed upstream by refusing an unanchored write_scope glob at
// brief-parse time (`SCOPE_GLOB_UNANCHORED`), not by changing this function.
function globPrefix(glob) {
  const normalized = normalizeGlob(glob);
  const idx = normalized.indexOf('*');
  return idx === -1 ? normalized : normalized.slice(0, idx);
}

function scopesOverlap(scopeA, scopeB) {
  const as = Array.isArray(scopeA) ? scopeA : [];
  const bs = Array.isArray(scopeB) ? scopeB : [];
  // Windows paths are case-insensitive; fold both prefixes there so
  // `SRC/**` and `src/**` are recognised as the same directory.
  const fold = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  for (const a of as) {
    const pa = fold(globPrefix(a));
    for (const b of bs) {
      const pb = fold(globPrefix(b));
      if (pa.startsWith(pb) || pb.startsWith(pa)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * acquireClaim({ ledgerDir, runId, repoRoot, branch, writeScope }) →
 * `{ claimId }`, or throws `ClaimConflictError`.
 *
 * On every call (§C.6.3): (a) drops entries whose pid is dead, (b) refuses
 * with CLAIM_CONFLICT if any live entry shares this run's `repo_root`
 * (realpath) OR `branch`, AND its scope prefix-overlaps this run's, (c)
 * appends this run's own claim.
 */
function acquireClaim({ ledgerDir, runId, repoRoot, branch, writeScope }) {
  fs.mkdirSync(ledgerDir, { recursive: true });
  acquireFileLock(ledgerDir);
  try {
    let claims = readClaims(ledgerDir);
    claims = claims.filter((c) => isPidAlive(c && c.pid));

    const realRepoRoot = fs.realpathSync(repoRoot);
    for (const c of claims) {
      const sameRepo = c.repo_root === realRepoRoot;
      const sameBranch = Boolean(branch) && c.branch === branch;
      if ((sameRepo || sameBranch) && scopesOverlap(c.write_scope, writeScope)) {
        writeClaims(ledgerDir, claims); // persist the dead-pid prune even on conflict
        throw new ClaimConflictError(
          `active claim conflict (run ${c.run_id}): ${sameRepo ? 'same repo_root' : 'same branch'}, overlapping write_scope`,
        );
      }
    }

    const claimId = `${runId || 'unknown'}-${crypto.randomBytes(4).toString('hex')}`;
    claims.push({
      claim_id: claimId,
      run_id: runId || 'unknown',
      pid: process.pid,
      repo_root: realRepoRoot,
      branch: branch || null,
      write_scope: Array.isArray(writeScope) ? writeScope : [],
      ts: new Date().toISOString(),
    });
    writeClaims(ledgerDir, claims);
    return { claimId };
  } finally {
    releaseFileLock(ledgerDir);
  }
}

/**
 * releaseClaim({ ledgerDir, claimId }) — removes this run's own claim, if
 * present. Called at `run_end` (any status) and on `process.on('exit')`.
 * A missing `claimId` or `ledgerDir` is a silent no-op (a run that refused
 * to start, e.g. NO_WRITE_SCOPE, never acquired a claim).
 */
function releaseClaim({ ledgerDir, claimId }) {
  if (!ledgerDir || !claimId) {
    return;
  }
  try {
    acquireFileLock(ledgerDir);
  } catch {
    return; // best-effort release; do not let a lock-acquire failure crash shutdown
  }
  try {
    const claims = readClaims(ledgerDir).filter((c) => c.claim_id !== claimId);
    writeClaims(ledgerDir, claims);
  } finally {
    releaseFileLock(ledgerDir);
  }
}

module.exports = {
  acquireClaim, releaseClaim, ClaimConflictError, ClaimsCorruptError, scopesOverlap, globPrefix,
  acquireFileLock, releaseFileLock,
};
