// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-AUDIT ("the bar's commit is an ancestor of the sample
//            record's commit"), G-CHANGE (an on-demand gate counts as run only when its latest COMMITTED record is bound
//            to the current snapshot, §4), G-PROV (the keyer-prov.mjs gitLsTree pattern: -z, commit ids only,
//            --end-of-options, null on failure = a closed answer, never a throw)
//
// The git witness shared by G-AUDIT (audit.mjs) and the G-CHANGE stale-unit arm (stale-arm.mjs). Every method answers
// null when git cannot (unknown object, git failure, malformed output): callers turn null into a fail-closed reason.
//
//   gitBlobOid(bytes)                  git's blob id of LF bytes (sha1 "blob <len>\0<bytes>"); PURE
//   lf(text)                           CRLF → LF (a core.autocrlf checkout of a committed LF file); PURE
//   gitWitness(root) → {commitsTouching(path), blobAt(commit, path), isAncestor(a, b), readBlob(oid), readBlobs(oids),
//                       lsTree(commit, dir) → [{path, oid}], pathsEver(dir) → every path ever added under dir}
//   fakeWitness(steps)                 the same interface over an in-memory linear history (fixtures); PURE

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** A sha1 object id (this repository's object format). */
export const OID = /^[0-9a-f]{40}$/;
const TIMEOUT_MS = 60_000;

export const lf = (text) => String(text).replace(/\r\n/g, '\n');

/** git's blob object id of these bytes. PURE. */
export function gitBlobOid(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`, 'utf8'), b])).digest('hex');
}

/** The witness over the repository at `root`. */
export function gitWitness(root) {
  const run = (args, input = undefined) => execFileSync('git', args, { cwd: root, encoding: input === undefined ? 'utf8' : 'buffer', input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024, timeout: TIMEOUT_MS });
  const oids = (out) => {
    const xs = out.split('\0').map((s) => s.trim()).filter(Boolean);
    return xs.every((x) => OID.test(x)) ? xs : null; // a non-NUL-separated answer is not an answer (fail closed)
  };
  return {
    /** Commit ids that changed `path` (HEAD history), oldest first; null on failure. */
    commitsTouching(p) {
      try {
        return oids(run(['log', '-z', '--reverse', '--format=%H', 'HEAD', '--', String(p)]));
      } catch {
        return null;
      }
    },
    /** The blob id of `path` in `commit`; null when absent or unknown. */
    blobAt(commit, p) {
      if (!OID.test(String(commit))) return null;
      try {
        const out = run(['ls-tree', '-z', '--end-of-options', String(commit), '--', String(p)]).split('\0').filter(Boolean);
        const m = /^\d+ blob ([0-9a-f]{40})\t/.exec(out[0] || '');
        return m ? m[1] : null;
      } catch {
        return null;
      }
    },
    /** true / false; null when git cannot answer (unknown commit, failure). */
    isAncestor(a, b) {
      if (!OID.test(String(a)) || !OID.test(String(b))) return null;
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', String(a), String(b)], { cwd: root, stdio: 'ignore', timeout: TIMEOUT_MS });
        return true;
      } catch (err) {
        return err && err.status === 1 ? false : null; // 1 = not an ancestor; anything else = no answer
      }
    },
    /** A blob's text; null when unknown. */
    readBlob(oid) {
      if (!OID.test(String(oid))) return null;
      try {
        return run(['cat-file', 'blob', String(oid)]);
      } catch {
        return null;
      }
    },
    /** Many blobs in one process: Map(oid → text | null). */
    readBlobs(list) {
      const want = [...new Set((list || []).filter((x) => OID.test(String(x))))];
      const out = new Map((list || []).map((x) => [x, null]));
      if (!want.length) return out;
      let buf;
      try {
        buf = run(['cat-file', '--batch'], Buffer.from(`${want.join('\n')}\n`, 'utf8'));
      } catch {
        return out;
      }
      let i = 0;
      while (i < buf.length) {
        const nl = buf.indexOf(0x0a, i);
        if (nl < 0) break;
        const head = buf.subarray(i, nl).toString('utf8').split(' ');
        if (head[1] !== 'blob') {
          i = nl + 1;
          continue; // "<oid> missing"
        }
        const size = Number(head[2]);
        out.set(head[0], buf.subarray(nl + 1, nl + 1 + size).toString('utf8'));
        i = nl + 1 + size + 1;
      }
      return out;
    },
    /** Every path ever added under `dir` in HEAD's history (a deleted file included); null on failure. */
    pathsEver(dir) {
      try {
        return [...new Set(run(['log', '-z', '--format=', '--name-only', '--diff-filter=A', 'HEAD', '--', String(dir)]).split('\0').map((x) => x.trim()).filter(Boolean))].sort();
      } catch {
        return null;
      }
    },
    /** Blobs under `dir` in `commit` (recursive): [{path, oid}]; null on failure. */
    lsTree(commit, dir) {
      if (!OID.test(String(commit))) return null;
      try {
        const rows = run(['ls-tree', '-r', '-z', '--end-of-options', String(commit), '--', String(dir)]).split('\0').filter(Boolean);
        const out = [];
        for (const r of rows) {
          const m = /^\d+ blob ([0-9a-f]{40})\t([\s\S]+)$/.exec(r);
          if (m) out.push({ oid: m[1], path: m[2] });
        }
        return out;
      } catch {
        return null;
      }
    },
  };
}

/** The witness interface over an in-memory linear history: steps = [{path: text | null}], cumulative. PURE. */
export function fakeWitness(steps) {
  const commits = [];
  const blobs = new Map();
  let state = {};
  steps.forEach((step, i) => {
    state = { ...state };
    for (const [p, t] of Object.entries(step)) {
      if (t === null) delete state[p];
      else {
        state[p] = gitBlobOid(Buffer.from(lf(t), 'utf8'));
        blobs.set(state[p], lf(t));
      }
    }
    commits.push({ id: crypto.createHash('sha1').update(`fake-commit-${i}`).digest('hex'), files: state });
  });
  const idx = (c) => commits.findIndex((x) => x.id === c);
  return {
    commits: commits.map((c) => c.id),
    commitsTouching: (p) => commits.filter((c, i) => (c.files[p] || null) !== (i ? commits[i - 1].files[p] || null : null)).map((c) => c.id),
    blobAt: (c, p) => (idx(c) < 0 ? null : commits[idx(c)].files[p] || null),
    isAncestor: (a, b) => (idx(a) < 0 || idx(b) < 0 ? null : idx(a) <= idx(b)),
    readBlob: (oid) => (blobs.has(oid) ? blobs.get(oid) : null),
    readBlobs: (list) => new Map((list || []).map((o) => [o, blobs.has(o) ? blobs.get(o) : null])),
    pathsEver: (dir) => [...new Set(commits.flatMap((c) => Object.keys(c.files)).filter((p) => p.startsWith(`${dir}/`)))].sort(),
    lsTree: (c, dir) => (idx(c) < 0 ? null : Object.entries(commits[idx(c)].files).filter(([p]) => p.startsWith(`${dir}/`)).map(([path, oid]) => ({ oid, path })).sort((a, b) => (a.path < b.path ? -1 : 1))),
  };
}
