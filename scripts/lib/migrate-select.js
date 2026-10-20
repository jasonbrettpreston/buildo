'use strict';
/**
 * migrate-select — the PURE selection behind `node scripts/migrate.js --only=<n,…>` (Spec 124 §5
 * R-EU, operator y 2026-10-20; amends Spec 113 §7's apply path, not its authority).
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §7 (migrate.js is the only schema authority)
 *
 * WHY. migrate.js applies every unapplied file in order. A night that must apply 271/272/278 while 274/275/276
 * are deliberately held has no sanctioned path: a plain run applies the held files, and a hand `psql -f`
 * leaves no schema_migrations row (Spec 113 §7: the ledger is the only record of what ran). `--only` keeps the
 * one authority and the one ledger and narrows WHICH files run.
 *
 * THE REFUSAL. A listed file must not depend on a HELD file — an unapplied, unlisted file numbered below it.
 * "Depends" is decided statically and fail-closed: a held file's created objects (CREATE TABLE/VIEW/FUNCTION/
 * TYPE/INDEX/SEQUENCE/TRIGGER names, ALTER TABLE … ADD COLUMN names, and the logic_variables keys it seeds)
 * appearing as a whole word anywhere in the listed file's SQL outside comments. A false positive refuses (list
 * the dependency too, or apply in order); it never applies a file whose prerequisite is missing.
 *
 * No DB, no fs: the caller passes the file list, the applied map (filename → checksum), a reader and the
 * checksum function migrate.js already uses.
 */

const ONLY_RE = /^[1-9][0-9]*$/;
const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';
const QUALIFIED = `(?:${IDENT}\\s*\\.\\s*)?${IDENT}`;
const CREATE_RE = new RegExp(
  `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:UNIQUE\\s+)?(?:MATERIALIZED\\s+)?(?:TABLE|VIEW|FUNCTION|TYPE|INDEX|SEQUENCE|TRIGGER)\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUALIFIED}`,
  'gi',
);
const ADD_COLUMN_RE = new RegExp(`\\bADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}`, 'gi');
const ADD_NOT_A_COLUMN = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude', 'column']);
/** A seeded key: the first element of a VALUES tuple, or the first SELECT expression, of a logic_variables insert. */
const SEED_TUPLE_RE = /\(\s*'([a-z][a-z0-9_]*)'\s*,/g;
const SEED_SELECT_RE = /\bSELECT\s+'([a-z][a-z0-9_]*)'\s*,/gi;

/** Parse `--only=<n,…>` into a sorted, de-duplicated list of positive integers. Throws on anything else. */
function parseOnly(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new Error('--only needs a comma-separated list of migration numbers (e.g. --only=271,272,278)');
  const parts = raw.split(',').map((s) => s.trim());
  for (const p of parts) {
    if (!ONLY_RE.test(p)) throw new Error(`--only: ${JSON.stringify(p)} is not a positive migration number`);
  }
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

/** The leading migration number of `NNN_name.sql`, or null. */
function fileNumber(filename) {
  const m = /^(\d+)_/.exec(String(filename));
  return m ? Number(m[1]) : null;
}

/** --only is a narrowing of the APPLY path; it has no meaning with --force or --verify. Returns a refusal or null. */
function onlyFlagRefusal({ force, verify }) {
  if (force) return '--only cannot be combined with --force (which re-runs every file)';
  if (verify) return '--only cannot be combined with --verify (a read-only checksum mode over every file)';
  return null;
}

/**
 * The SQL with line and block comments removed; single-quoted strings, quoted identifiers and dollar-quoted
 * bodies are KEPT (a seeded key is a string literal; a function body can name a held object).
 */
function stripComments(sql) {
  const s = String(sql);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === '-' && next === '-') {
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === ch && s[j + 1] === ch) { j += 2; continue; }
        if (s[j] === ch) break;
        j += 1;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(s.slice(i));
      if (m) {
        const end = s.indexOf(m[0], i + m[0].length);
        const stop = end < 0 ? s.length : end + m[0].length;
        out += s.slice(i, stop);
        i = stop;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The objects and logic-variable keys a migration creates (lower-cased identifiers). */
function createdObjects(sql) {
  const text = stripComments(sql);
  const out = new Set();
  for (const m of text.matchAll(CREATE_RE)) out.add((m[2] || m[1]).toLowerCase());
  for (const m of text.matchAll(ADD_COLUMN_RE)) {
    const name = m[1].toLowerCase();
    if (!ADD_NOT_A_COLUMN.has(name)) out.add(name);
  }
  for (const stmt of text.split(';')) {
    if (!/\bINSERT\s+INTO\s+logic_variables\b/i.test(stmt)) continue;
    for (const m of stmt.matchAll(SEED_TUPLE_RE)) out.add(m[1]);
    for (const m of stmt.matchAll(SEED_SELECT_RE)) out.add(m[1]);
  }
  return out;
}

/** Does `sql` (comments removed) name `ident` as a whole word? */
function references(sql, ident) {
  const esc = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`, 'i').test(stripComments(sql));
}

/**
 * The --only decision. PURE. Returns `{ok, run, skip, held, refusals}`:
 *   run       listed files to apply, in file order;
 *   skip      listed files already applied with an unchanged checksum (idempotent, like a plain run);
 *   held      unapplied, UNLISTED files numbered below the highest listed number (printed, never applied);
 *   refusals  a listed number with no file / several files, a listed applied file whose checksum drifted,
 *             or a listed file that depends on a held file. Any refusal ⇒ ok:false and NOTHING runs.
 */
function selectOnly({ files, applied, only, readSql, checksum }) {
  const refusals = [];
  const byNumber = new Map();
  for (const f of files) {
    const n = fileNumber(f);
    if (n === null) continue;
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push(f);
  }
  const listed = [];
  for (const n of only) {
    const hit = byNumber.get(n) || [];
    if (hit.length === 0) refusals.push(`--only: no migration file numbered ${n}`);
    else if (hit.length > 1) refusals.push(`--only: ${hit.length} migration files share number ${n} (${hit.join(', ')})`);
    else listed.push(hit[0]);
  }
  const listedSet = new Set(listed);
  const run = [];
  const skip = [];
  for (const f of [...listed].sort()) {
    if (!applied.has(f)) { run.push(f); continue; }
    if (applied.get(f) === checksum(readSql(f))) skip.push(f);
    else refusals.push(`--only: ${f} is already applied but its checksum has changed — investigate (a plain run would not re-run it either)`);
  }
  const top = only.length ? Math.max(...only) : -Infinity;
  const held = files.filter((f) => !applied.has(f) && !listedSet.has(f) && fileNumber(f) !== null && fileNumber(f) < top).sort();
  for (const f of run) {
    const sql = readSql(f);
    for (const h of held) {
      if (fileNumber(h) >= fileNumber(f)) continue;
      for (const obj of createdObjects(readSql(h))) {
        if (references(sql, obj)) refusals.push(`--only: ${f} depends on held ${h} (${obj}) — list ${fileNumber(h)} too, or apply in order`);
      }
    }
  }
  return { ok: refusals.length === 0, run: refusals.length === 0 ? run : [], skip, held, refusals };
}

module.exports = { parseOnly, fileNumber, onlyFlagRefusal, stripComments, createdObjects, references, selectOnly };
