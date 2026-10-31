// SPEC LINK: MB-73 plan §2.1 — the source closure of the queue file. R-KU: ids are found by PATTERN in every file
//            the queue cites; K1 (the root), K3 (a cited path that is not tracked at the rev is refused, never read).
//
// A cited path is only ever read from the TRACKED tree at `rev`, so a citation of an uncommitted file cannot smuggle
// a pass in. Every way this can fail to decide returns a `FAIL:R:` line; an empty closure is never "nothing to check".

import { listTracked, readAt } from '../mcbylaws/git-util.mjs';

/** The queue file every promise trace starts at. */
export const ROOT_SOURCE = '.cursor/MCBYLAWS-QUEUE.md';

const SOURCES = 'mcbylaws/sources/';
const SPECS = 'docs/specs/';
const CHARS = 'A-Za-z0-9._/-';
/**
 * The citation patterns. Group 1 is a COMPLETE path that already ends `.md`. The lookahead excludes `/`, `-`, `_`
 * and alphanumerics (a longer name continues the path) but allows `.`, so a citation followed by a sentence period
 * still matches.
 */
const PATTERNS = [
  /(mcbylaws\/sources\/[A-Za-z0-9._/-]+?\.md)(?![A-Za-z0-9_/-])/g,
  /(docs\/specs\/[A-Za-z0-9._/-]+?\.md)(?![A-Za-z0-9_/-])/g,
  /(CARD-[A-Za-z0-9._-]+\.answered\.md)(?![A-Za-z0-9_/-])/g,
  /(HANDBOOK-AMENDMENTS\.md)(?![A-Za-z0-9_/-])/g,
];

/** Drop empty and `.` segments; null for a path that climbs out with `..`. */
const clean = (p) => {
  const parts = p.split('/').filter((s) => s !== '' && s !== '.');
  return parts.length === 0 || parts.includes('..') ? null : parts.join('/');
};

/** Map one regex hit to a repo-relative path (never double-prefixing, always `.md`), or null. */
const toPath = (m) => {
  const raw = m[1];
  const already = raw.startsWith(SOURCES) || raw.startsWith(SPECS);
  const full = already ? raw : SOURCES + raw;
  return full.endsWith('.md') ? clean(full) : null;
};

/**
 * Every repo-relative path cited in `text`, sorted and unique; each one ends `.md`.
 * @param {string} text
 * @returns {string[]}
 */
export function citedPaths(text) {
  const out = new Set();
  for (const re of PATTERNS) {
    for (const m of String(text ?? '').matchAll(re)) {
      const p = toPath(m);
      if (p !== null) out.add(p);
    }
  }
  return [...out].sort();
}

/**
 * The fixed-point closure of files cited (transitively) from `root` at `rev`. `files` is in discovery order, root
 * first; `lines` are closed `FAIL:R:` strings, no duplicates, empty on success.
 * @param {{cwd: string, rev: string, root?: string, depth?: number}} opts
 * @returns {{files: {path: string, text: string}[], lines: string[]}}
 */
export function sourceClosure({ cwd, rev, root = ROOT_SOURCE, depth = 3 }) {
  const lines = [];
  const fail = (l) => { if (!lines.includes(l)) lines.push(l); };
  const trackedList = listTracked(cwd, rev);
  if (trackedList === null) return { files: [], lines: ['FAIL:R:cannot-decide'] };
  const tracked = new Set(trackedList);
  const rootText = tracked.has(root) ? readAt(cwd, rev, root) : null;
  if (rootText === null) return { files: [], lines: ['FAIL:R:cannot-decide'] };
  const files = [{ path: root, text: rootText }];
  const seen = new Set([root]);
  let level = [rootText];
  for (let d = 0; d < depth && level.length > 0; d += 1) {
    const next = [];
    for (const text of level) {
      for (const path of citedPaths(text)) {
        if (seen.has(path)) continue;
        seen.add(path);
        if (!tracked.has(path)) { fail(`FAIL:R:source-untracked:${path}`); continue; }
        const body = readAt(cwd, rev, path);
        if (body === null) { fail(`FAIL:R:cannot-decide:unreadable:${path}`); continue; }
        files.push({ path, text: body });
        next.push(body);
      }
    }
    level = next;
  }
  if (files.length === 0) fail('FAIL:R:cannot-decide');
  return { files, lines };
}
