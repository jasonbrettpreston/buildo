// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// Plan: .cursor/wf2_registry_truth_active_task.md fold 10 item 4
//
// Registry-truth fold 10 item 4 — the `address_points` readers guard.
//
// The migration (another seat) adds `address_points.retired_at TIMESTAMPTZ NULL`
// (NULL = live) and the view `address_points_active`. A reader that must see only
// live points therefore either reads the VIEW or carries a TOP-LEVEL AND conjunct
// `<alias>.retired_at IS NULL` in the statement that reads the BASE table.
//
// This suite is the static witness for that rule. It extracts every SQL string
// literal from the SQL-bearing files under `scripts/` and `src/`, parses each one
// with the REAL Postgres grammar (libpg-query), walks the AST of the enclosing
// statement, and flags every `address_points` RangeVar that is not filtered:
//
//   * `address_points_active`  — the view, not the table: NOT a match;
//   * `parcel_address_points`  — the bridge table, not the table: NOT a match;
//   * a filter in an ENCLOSING query, in an OR branch, under NOT, or as
//     `IS NOT NULL` does NOT count — it is the statement body that reads the
//     RangeVar whose top-level conjuncts decide.
//
// A candidate that does not parse at all is RED (`parse_error`), never skipped:
// "cannot witness" is not "live".
//
// The `live:` test is the exit criterion; it is RED on a fresh worktree by design
// (the unfiltered readers are fixed in the same FLEET-2 landing commit). The
// `BASE_TABLE_READERS` exemption set below is CLOSED: four named owners/harnesses
// that legitimately see retired rows. Adding a fifth is a review decision, not a
// test-fix.

import { describe, it, expect, beforeAll } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import ts from 'typescript';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]$/, '');
const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- libpg-query's AST is untyped JSON
type Json = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the real Postgres grammar
let pgQuery: any;

beforeAll(async () => {
  pgQuery = require('libpg-query');
  if (typeof pgQuery.loadModule === 'function') await pgQuery.loadModule();
});

// ===========================================================================
// The closed exemption set — base-table readers that legitimately see retired rows
// ===========================================================================

/** `{ relPath: reason }` — the ONLY files allowed to read the base table unfiltered. */
const BASE_TABLE_READERS: Readonly<Record<string, string>> = Object.freeze({
  'scripts/load-address-points.js':
    'owner — the loader writes and reads its own table, retired rows included',
  'scripts/lib/compute/load-address-points.js': 'owner — the loader compute',
  'scripts/backfill/seed-pipeline-runs.js': 'seeds the loader records_total = whole-table size',
  'scripts/analysis/ingestor-forced-cohort.js':
    'capture harness hashing the loader write surface',
});

// ===========================================================================
// 1. The extractor — SQL candidates out of a TypeScript/JavaScript source text
// ===========================================================================

/** The TS `ScriptKind` for a file extension. */
function scriptKindOf(rel: string): ts.ScriptKind {
  if (rel.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (rel.endsWith('.ts')) return ts.ScriptKind.TS;
  if (rel.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/**
 * Every string literal in `text` whose value reads `FROM|JOIN address_points`
 * (word-boundary, so the view and the bridge table are not candidates).
 *
 * A `TemplateExpression` contributes a RECONSTRUCTED text: the head, then `NULL`
 * for every interpolated span, then each span's literal text. `NULL` is not SQL
 * noise — it is a placeholder that keeps the surrounding `FROM`/`JOIN` keywords
 * adjacent enough to be detected while never being mistakable for a filter.
 */
function extractCandidateSql(rel: string, text: string): { line: number; sql: string }[] {
  const kind = scriptKindOf(rel);
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const out: { line: number; sql: string }[] = [];
  const CANDIDATE = /\b(FROM|JOIN)\s+address_points(?![A-Za-z0-9_])/i;

  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const consider = (pos: number, value: string) => {
    if (CANDIDATE.test(value)) out.push({ line: lineOf(pos), sql: value });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      consider(node.getStart(sf), node.text);
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text];
      for (const span of node.templateSpans) parts.push('NULL', span.literal.text);
      consider(node.getStart(sf), parts.join(''));
    }
    node.forEachChild(visit);
  };

  visit(sf);
  return out;
}

// ===========================================================================
// 2. The AST predicate — does this candidate filter its address_points read?
// ===========================================================================

/** `ColumnRef` field names, or `null` for anything that is not a plain column ref. */
function columnRefPath(node: Json): string[] | null {
  const ref = node?.ColumnRef;
  if (!ref || !Array.isArray(ref.fields)) return null;
  const names: string[] = [];
  for (const f of ref.fields) {
    if (f?.String?.sval !== undefined) names.push(String(f.String.sval));
    else if (f?.A_Star) names.push('*');
    else return null;
  }
  return names.length > 0 ? names : null;
}

/** Is `node` a `IS NULL` NullTest on exactly `<alias>.retired_at`? */
function isRetiredAtIsNull(node: Json, alias: string | null): boolean {
  if (!node || typeof node !== 'object') return false;
  const nt = node.NullTest;
  if (!nt || nt.nulltesttype !== 'IS_NULL') return false;
  const p = columnRefPath(nt.arg);
  if (!p) return false;
  const expected = alias === null ? [['retired_at'], ['address_points', 'retired_at']] : [[alias, 'retired_at']];
  return expected.some((cand) => cand.length === p.length && cand.every((s, i) => s === p[i]));
}

/** The direct top-level conjuncts of a boolean clause (`a AND b AND c` is ONE AND_EXPR). */
function topLevelConjuncts(clause: Json): Json[] {
  if (!clause || typeof clause !== 'object') return [];
  const be = clause.BoolExpr;
  if (be && be.boolop === 'AND_EXPR' && Array.isArray(be.args)) return be.args;
  return [clause];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
function hasOwn(obj: any, key: string): boolean {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
function statementBodyOf(v: any): any | null {
  if (!v || typeof v !== 'object') return null;
  return v.SelectStmt ?? v.UpdateStmt ?? v.DeleteStmt ?? null;
}

/**
 * One `address_points` RangeVar, classified against the statement body that owns it.
 *
 * The owning statement is the OUTERMOST statement reached before the RangeVar: a
 * `SubLink`/`RangeSubselect`/CTE body pushes a NEW statement (so an outer filter
 * cannot justify an inner read, and an inner filter does not justify an outer one).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
function walkForUnfiltered(v: any, out: string[]): void {
  if (!v || typeof v !== 'object') return;

  const own = statementBodyOf(v);
  if (own) {
    checkStatement(own, out);
    return;
  }

  if (Array.isArray(v)) {
    for (const item of v) walkForUnfiltered(item, out);
    return;
  }

  for (const key of Object.keys(v)) walkForUnfiltered(v[key], out);
}

/** Every top-level conjunct clause of a statement body, plus every reachable JOIN ON qual. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
function clausesOf(body: any): Json[] {
  const clauses: Json[] = [];
  if (body.whereClause) clauses.push(body.whereClause);
  if (body.qualClause) clauses.push(body.qualClause);
  if (body.havingClause) clauses.push(body.havingClause);

  // (b) the `quals` of every JoinExpr reachable from the FROM/USING clause without
  //     entering a nested statement.
  const fromLists: Json[] = [];
  if (Array.isArray(body.fromClause)) fromLists.push(body.fromClause);
  if (Array.isArray(body.usingClause)) fromLists.push(body.usingClause);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
  const visit = (v: any): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (hasOwn(v, 'JoinExpr') && v.JoinExpr && v.JoinExpr.quals) clauses.push(v.JoinExpr.quals);
    // A nested statement's ON clause belongs to THAT statement, not this one.
    if (statementBodyOf(v)) return;
    for (const key of Object.keys(v)) visit(v[key]);
  };
  for (const list of fromLists) visit(list);

  return clauses;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
function checkStatement(body: any, out: string[]): void {
  const clauseList = clausesOf(body);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural walk over untyped AST
  const visit = (v: any): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }

    // A NESTED statement is its own body — never checked against this one's clauses.
    if (statementBodyOf(v) && v !== body) {
      checkStatement(statementBodyOf(v), out);
      return;
    }

    if (v.RangeVar && v.RangeVar.relname === 'address_points') {
      const rv = v.RangeVar;
      const alias: string | null = rv.alias?.aliasname ? String(rv.alias.aliasname) : null;
      const filtered = clauseList.some((clause) =>
        topLevelConjuncts(clause).some((conj) => isRetiredAtIsNull(conj, alias)),
      );
      if (!filtered) out.push(`address_points AS ${alias ?? 'address_points'}`);
    }

    for (const key of Object.keys(v)) visit(v[key]);
  };

  visit(body);
}

/**
 * Every unfiltered `address_points` read in `sql`.
 *
 * An unparseable candidate yields `['parse_error']` — RED, never skipped.
 */
function unfilteredReads(sql: string): string[] {
  let tree: Json;
  try {
    tree = pgQuery.parseSync(sql);
  } catch {
    return ['parse_error'];
  }

  try {
    const out: string[] = [];
    for (const stmt of tree?.stmts ?? []) walkForUnfiltered(stmt?.stmt, out);
    return out;
  } catch {
    return ['parse_error'];
  }
}

// ===========================================================================
// 3. The repo scan
// ===========================================================================

const SKIP_DIRS = new Set(['node_modules', 'one-time', '.git']);

function walkFiles(absDir: string, relDir: string, ext: (name: string) => boolean, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = path.join(relDir, e.name);
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      walkFiles(abs, rel, ext, out);
    } else if (e.isFile() && ext(e.name)) {
      out.push(rel);
    }
  }
}

/** `['rel:line violation', ...]` for every unfiltered read outside the exemption set. */
function scanRepo(): string[] {
  const rels: string[] = [];
  walkFiles(path.join(REPO_ROOT, 'scripts'), 'scripts', (n) =>
    n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs'), rels);
  walkFiles(path.join(REPO_ROOT, 'src'), 'src', (n) => n.endsWith('.ts') || n.endsWith('.tsx'), rels);

  const out: string[] = [];
  for (const rawRel of rels) {
    const rel = rawRel.split(path.sep).join('/');
    if (rel.startsWith('src/tests/')) continue;
    if (Object.prototype.hasOwnProperty.call(BASE_TABLE_READERS, rel)) continue;

    const text = fs.readFileSync(path.join(REPO_ROOT, rawRel), 'utf8');
    for (const candidate of extractCandidateSql(rel, text)) {
      for (const violation of unfilteredReads(candidate.sql)) {
        out.push(`${rel}:${candidate.line} ${violation}`);
      }
    }
  }

  return out.sort();
}

// ===========================================================================
// Fixtures — the pure predicates
// ===========================================================================

describe('address_points readers see live rows only (fold 10 item 4)', () => {
  it('fixture: an unfiltered join is flagged', () => {
    expect(
      unfilteredReads(
        'SELECT ap.geom FROM address_points ap JOIN parcels p ON ST_Within(ap.geom, p.geom)',
      ),
    ).toEqual(['address_points AS ap']);
  });

  it('fixture: a top-level retired_at IS NULL conjunct passes', () => {
    expect(
      unfilteredReads(
        'SELECT ap.geom FROM address_points ap JOIN parcels p ON ST_Within(ap.geom, p.geom) WHERE ap.retired_at IS NULL AND p.id > 1',
      ),
    ).toEqual([]);

    expect(
      unfilteredReads(
        'UPDATE permits p SET latitude = ap.latitude FROM address_points ap WHERE ap.address_point_id = 1 AND ap.retired_at IS NULL',
      ),
    ).toEqual([]);

    expect(
      unfilteredReads(
        'SELECT 1 FROM parcels p JOIN address_points ap ON ap.retired_at IS NULL AND ST_Within(ap.geom, p.geom)',
      ),
    ).toEqual([]);

    expect(
      unfilteredReads('SELECT COUNT(*) FROM address_points WHERE geom IS NOT NULL AND retired_at IS NULL'),
    ).toEqual([]);
  });

  it('fixture: the view passes and the bridge table is not a match', () => {
    expect(unfilteredReads('SELECT 1 FROM address_points_active ap')).toEqual([]);
    expect(unfilteredReads('SELECT 1 FROM parcel_address_points pap')).toEqual([]);
  });

  it('fixture: IS NOT NULL, an OR branch, and a filter only in an outer query do not count', () => {
    expect(
      unfilteredReads(
        'SELECT ap.geom FROM address_points ap JOIN parcels p ON ST_Within(ap.geom, p.geom) WHERE ap.retired_at IS NOT NULL',
      ),
    ).toEqual(['address_points AS ap']);

    expect(
      unfilteredReads(
        'SELECT ap.geom FROM address_points ap JOIN parcels p ON ST_Within(ap.geom, p.geom) WHERE ap.retired_at IS NULL OR ap.geom IS NULL',
      ),
    ).toEqual(['address_points AS ap']);

    expect(unfilteredReads('SELECT * FROM (SELECT ap.geom FROM address_points ap) s WHERE s.geom IS NULL')).toEqual([
      'address_points AS ap',
    ]);

    expect(
      unfilteredReads(
        'SELECT COUNT(*) FROM address_points ap WHERE EXISTS (SELECT 1 FROM parcels p WHERE p.id = 1) AND ap.retired_at IS NULL',
      ),
    ).toEqual([]);
  });

  it('fixture: an unparseable candidate is red', () => {
    expect(unfilteredReads('SELECT FROM address_points WHERE (')).toEqual(['parse_error']);
  });
});

// ===========================================================================
// The exemption set — closed, named, reasoned
// ===========================================================================

describe('address_points readers see live rows only (fold 10 item 4)', () => {
  it('the exemption set is exactly the four named owners/harnesses, each with a reason', () => {
    expect(Object.keys(BASE_TABLE_READERS).sort()).toEqual([
      'scripts/analysis/ingestor-forced-cohort.js',
      'scripts/backfill/seed-pipeline-runs.js',
      'scripts/lib/compute/load-address-points.js',
      'scripts/load-address-points.js',
    ]);
    for (const [rel, reason] of Object.entries(BASE_TABLE_READERS)) {
      expect(reason.trim().length, `${rel} must carry a reason`).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(REPO_ROOT, rel)), `${rel} must exist on disk`).toBe(true);
    }
  });

  it('live: no reader outside the exemption set reads address_points unfiltered', () => {
    expect(scanRepo()).toEqual([]);
  });
});
