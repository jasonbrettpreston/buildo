// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan §B1b, arm R (G67-09),
//            lines 88-93 — renames and path lists.
//
// HOW the gate reads a change stream. `git diff --name-status -z -M` (commit) and `git diff-tree -r -z -M
// --name-status` (push, CI) emit NUL-separated fields: a status letter, then ONE path, or — for R and C — TWO paths
// (old, then new). Paths are split on NUL and NEVER on a newline: a path may contain a newline, a tab or any other
// byte, and a line split would turn one path into two rows (a forged `PROTECTED: none` row, R2).
// Both sides of a rename or copy are classified (`allPaths`): `--name-only` reports only the destination, so a Layer
// 2/3 file renamed out of the globs would otherwise escape H, C, P and L (arm R, executed, adjudication E6).
// Fail closed: an unknown letter or a truncated stream is null (the caller turns that into a failure line), never a
// partial list. ONLY an empty stream is an empty list — it is never read as "nothing to check" on its own.

/** Status letters that carry ONE path. T and U included: a typechange and an unmerged conflict are real changes. */
const ONE_PATH = new Set(['A', 'M', 'D', 'T', 'U']);
/** Status letters that carry TWO paths: the old one, then the new one. */
const TWO_PATH = new Set(['R', 'C']);

/**
 * @typedef {object} NameStatusEntry
 * @property {string} status the single letter (`A`,`M`,`D`,`T`,`U`,`R`,`C`) — the score is never folded in here
 * @property {number|null} score the rename/copy similarity, else null
 * @property {string} path the new path (the only path when the entry has one)
 * @property {string|null} oldPath the old path for R/C, else null
 */

/**
 * PURE: parse a `--name-status -z` stream.
 * @param {string} raw
 * @returns {NameStatusEntry[]|null} null for an unknown letter or a truncated stream (fail closed)
 */
export function parseNameStatusZ(raw) {
  if (typeof raw !== 'string') return null;
  if (raw === '') return [];
  // git terminates every field with NUL; the split therefore yields one trailing empty piece, dropped here. A stream
  // that does not end in NUL was cut short mid-field — refuse it rather than guess the field is complete.
  if (!raw.endsWith('\0')) return null;
  const fields = raw.slice(0, -1).split('\0');
  if (fields.includes('')) return null; // an empty field is a truncated entry, never an empty path

  /** @type {NameStatusEntry[]} */
  const entries = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const letter = field.slice(0, 1);
    if (ONE_PATH.has(letter)) {
      const path = fields[i + 1];
      if (field !== letter || path === undefined) return null;
      entries.push({ status: letter, score: null, path, oldPath: null });
      i += 1;
    } else if (TWO_PATH.has(letter)) {
      const scoreText = field.slice(1);
      const oldPath = fields[i + 1];
      const path = fields[i + 2];
      if (!/^\d{1,3}$/.test(scoreText) || oldPath === undefined || path === undefined) return null;
      entries.push({ status: letter, score: Number(scoreText), path, oldPath });
      i += 2;
    } else {
      return null; // an unknown letter: the whole stream is untrustworthy
    }
  }
  return entries;
}

/**
 * PURE: every path the entries touch, BOTH sides of a rename/copy, sorted and de-duplicated. This is the list the
 * Layer 2/3 classifier walks (R1: a file renamed out of the globs is still classified by its old path).
 * @param {NameStatusEntry[]} entries
 * @returns {string[]}
 */
export function allPaths(entries) {
  const set = new Set();
  for (const e of entries) {
    set.add(e.path);
    if (e.oldPath !== null) set.add(e.oldPath);
  }
  return [...set].sort();
}

/**
 * PURE: the path on ONE line. Every control character (code < 0x20 or 0x7f, newline and tab included) and every
 * backslash is escaped as `\xNN` / `\\`, so a file named `a\nPROTECTED: none` prints escaped and cannot forge a
 * summary line (R2).
 * @param {string} p
 * @returns {string}
 */
export function escapePath(p) {
  let out = '';
  for (const ch of String(p)) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return out;
}
