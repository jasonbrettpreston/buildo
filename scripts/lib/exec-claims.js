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

function claimsFilePath(ledgerDir) {
  return path.join(ledgerDir, CLAIMS_FILENAME);
}
function lockFilePath(ledgerDir) {
  return path.join(ledgerDir, LOCK_FILENAME);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A synchronous, non-spinning sleep (no extra dependency) — Atomics.wait
// blocks the thread efficiently rather than busy-spinning the CPU while this
// short, sub-2-second critical-section retry loop waits its turn.
function sleepSyncMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function acquireFileLock(ledgerDir) {
  const lockPath = lockFilePath(ledgerDir);
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL | O_WRONLY
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
    // Contended — reclaim a stale lock file by AGE (mtime older than 30s
    // means whatever held it crashed mid-critical-section).
    try {
      const stat = fs.statSync(lockPath);
      if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
        fs.unlinkSync(lockPath);
        continue;
      }
    } catch {
      continue; // the lock vanished between the failed open and this stat — retry immediately
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out acquiring ${lockPath}`);
    }
    sleepSyncMs(LOCK_RETRY_DELAY_MS);
  }
}

function releaseFileLock(ledgerDir) {
  try {
    fs.unlinkSync(lockFilePath(ledgerDir));
  } catch {
    // best-effort release; a missing lock file at release time is not itself a fault
  }
}

function readClaims(ledgerDir) {
  try {
    const raw = fs.readFileSync(claimsFilePath(ledgerDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // missing/corrupt registry starts fresh — never a fault at read time
  }
}

function writeClaims(ledgerDir, claims) {
  fs.writeFileSync(claimsFilePath(ledgerDir), JSON.stringify(claims, null, 2));
}

// §C.6.3(b) — "overlap = the literal directory prefix of one glob (everything
// before its first `*`) is a prefix of the other's."
function globPrefix(glob) {
  const idx = String(glob).indexOf('*');
  return idx === -1 ? glob : glob.slice(0, idx);
}

function scopesOverlap(scopeA, scopeB) {
  const as = Array.isArray(scopeA) ? scopeA : [];
  const bs = Array.isArray(scopeB) ? scopeB : [];
  for (const a of as) {
    const pa = globPrefix(a);
    for (const b of bs) {
      const pb = globPrefix(b);
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

module.exports = { acquireClaim, releaseClaim, ClaimConflictError, scopesOverlap, globPrefix };
