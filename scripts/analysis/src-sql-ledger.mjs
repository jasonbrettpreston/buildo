// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md P1-C-src (a)/(b), Fold 14
//
// src-sql-ledger — the static pass over every SQL-bearing file under `src/`.
//
// It is a GENERATED ledger (`scripts/steps/_schema/src-sql-ledger.json`) of one
// entry per `src/` `.ts`/`.tsx` file that carries SQL text, classified into
// exactly three classes:
//   static        — every SQL-bearing literal is a parseable statement and no
//                   SQL text is assembled by interpolation;
//   interpolated  — at least one SQL text is built by template interpolation
//                   (or reached via a non-literal expression) and therefore
//                   CANNOT be witnessed statically;
//   not_postgres  — the file's SQL-shaped text is never sent to Postgres at all
//                   (`NOT_POSTGRES`, a two-file carve-out).
//
// It REPLACES the `step:registry` git-grep ADVISORY half for `src/` readers: a
// grep can only name a reader, never say whether the file's SQL is statically
// witnessable; this ledger parses each literal with the ONE witness resolver
// (`scripts/lib/sql-witness/resolve.cjs`, libpg-query) and records the columns
// it touches. The pass is PARTIAL confirmation only: a `static` class means
// every literal it saw parsed, NOT that the ledger saw every SQL text the
// runtime will execute — an interpolated statement is by construction
// unwitnessable here, and the closed set (`CLOSED_INTERPOLATED_SET`) is what
// keeps the interpolated population from growing unnoticed.
//
// (c) RUNTIME CONFIRMATION (comparator). `--confirm <dir>` diffs the statements
// a live run ACTUALLY issued (the per-process NDJSON files the P1-C3a tracer
// flushes into `$BUILDO_SQL_TRACE`) against this static pass. To produce the
// traces: run `npm run test:db` with
// `NODE_OPTIONS=--require scripts/lib/sql-witness/trace-preload.cjs` and
// `BUILDO_SQL_TRACE=<dir>` set, then `--confirm <dir>`. A recorded statement
// whose caller is a class-`static` file is `confirmed` iff its fingerprint was
// parsed by the pass; a class-`interpolated` caller is `dynamic` (the closed
// interpolated set IS its witness); an unknown caller is `unclassified`, an
// untagged statement is `untagged`. This stays PARTIAL until that live
// `npm run test:db` run has been done: 34 test files mock the client and
// `getClient()` callers are untagged, so the trace never sees them.
//
// Deterministic: the ledger is sorted, `--write` regenerates it and `--check`
// compares byte-for-byte. No DB, no network, no `process.exit`.
//
// CATALOG MEMBERSHIP (`catalogMembership`, also enforced by `--check`): every
// column a file reads or writes on a table the committed information_schema
// snapshot (`_catalog.json`) lists must be one of that table's columns. A table
// the catalog does not carry (a matview — information_schema.columns omits them)
// is skipped and listed, never flagged. Added WF3 2026-10-04 after the ledger
// recorded sync/process.ts writing permit_trades.trade_slug/trade_name and
// lead-detail-query.ts reading coa_applications.updated_at — none exist.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);

// ONE RESOLVER (Spec 122 §10): the witness resolver is imported, never mirrored.
const resolve = require(path.join(REPO_ROOT, 'scripts/lib/sql-witness/resolve.cjs'));

export const SRC_SQL_LEDGER_REL_PATH = 'scripts/steps/_schema/src-sql-ledger.json';
export const CATALOG_REL_PATH = 'docs/reports/witness/_catalog.json';

/** SQL-bearing `src/` files whose SQL never reaches Postgres — excluded from the pass. */
export const NOT_POSTGRES = Object.freeze({
  'src/lib/admin/posthog-client.ts': 'HogQL sent to the PostHog query API, never to Postgres',
  'src/lib/db/generated/schema.ts': 'drizzle-kit generated schema mirror (policy/view DDL text), never executed by the app',
});

/**
 * The closed, counted set of src/ files with >=1 interpolated or non-static SQL;
 * it may not grow (`grew:`) and a file that stops interpolating must be removed
 * (`stale:`). This is the measured closed set — measured 2026-10-03 (72
 * SQL-bearing files: 41 static, 29 interpolated, 2 not_postgres).
 */
export const CLOSED_INTERPOLATED_SET = Object.freeze([
  'src/app/api/admin/leads/watchlist/route.ts',
  'src/app/api/admin/notifications/route.ts',
  'src/app/api/admin/rules/route.ts',
  'src/app/api/admin/stats/route.ts',
  'src/app/api/admin/users/[uid]/route.ts',
  'src/app/api/admin/users/route.ts',
  'src/app/api/builders/[id]/route.ts',
  'src/app/api/builders/route.ts',
  'src/app/api/coa/route.ts',
  'src/app/api/entities/[id]/route.ts',
  'src/app/api/entities/route.ts',
  'src/app/api/leads/detail/[id]/route.ts',
  'src/app/api/notifications/preferences/route.ts',
  'src/app/api/notifications/route.ts',
  'src/app/api/permits/[id]/route.ts',
  'src/app/api/permits/geo/route.ts',
  'src/app/api/permits/route.ts',
  'src/app/api/user-profile/reactivate/route.ts',
  'src/app/api/user-profile/route.ts',
  'src/features/leads/lib/get-lead-feed.ts',
  'src/lib/admin/control-panel.ts',
  'src/lib/admin/parcel-lookup.ts',
  'src/lib/admin/step-output-query.ts',
  'src/lib/analytics/queries.ts',
  'src/lib/auth/get-user-context.ts',
  'src/lib/builders/enrichment.ts',
  'src/lib/coa/pre-permits.ts',
  'src/lib/coa/repository.ts',
  'src/lib/quality/metrics.ts',
]);

/** A statement's text starts with a SQL keyword (CASE-SENSITIVE, per the measured pass). */
const SQL_KEYWORD_RE = /^\s*\(?\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\s/;

/**
 * True ONLY for a resolver PARSE failure (`FAIL:INPUT:parse:`). Any other
 * non-null `error` is a resolution NOTE on SQL that DID parse — its reads/writes
 * and fingerprint are still populated, so the statement still counts.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isParseError(error) {
  return typeof error === 'string' && error.startsWith('FAIL:INPUT:parse:');
}

/** Source extensions the pass walks. */
const SRC_EXT_RE = /\.tsx?$/;

// ---------------------------------------------------------------------------
// File walk
// ---------------------------------------------------------------------------

function walkDir(absDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) walkDir(abs, out);
    else if (SRC_EXT_RE.test(entry.name)) out.push(abs);
  }
}

/**
 * Sorted repo-relative POSIX paths of every `.ts`/`.tsx` file under `src/`,
 * skipping `src/tests/` and any dot/`node_modules` directory. FS only — never git.
 * @param {string} [root]
 * @returns {string[]}
 */
export function listSrcFiles(root = REPO_ROOT) {
  const abs = [];
  walkDir(path.join(root, 'src'), abs);
  const testsPrefix = `src${path.sep}tests${path.sep}`;
  return abs
    .filter((p) => !p.includes(testsPrefix))
    .map((p) => path.relative(root, p).split(path.sep).join('/'))
    .sort();
}

/** Create a TypeScript SourceFile for one rel path + text. */
function sourceFile(rel, text) {
  return ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** 1-based line of a node's start. */
function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** The raw text of a string / no-substitution template literal, or null. */
function literalText(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** True for a string or a template with no substitutions. */
function isTextLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** True for a `query` identifier or `<x>.query` property access. */
function isQueryCallee(callee) {
  if (ts.isIdentifier(callee) && callee.text === 'query') return true;
  if (ts.isPropertyAccessExpression(callee) && callee.name && callee.name.text === 'query') return true;
  return false;
}

/** True when `node` (a CallExpression) is a QUERY CALL with >=1 argument. */
function isQueryCall(node) {
  if (!ts.isCallExpression(node)) return false;
  if (node.arguments.length < 1) return false;
  return isQueryCallee(node.expression);
}

/** True when the identifier is a parameter of some enclosing function-like node. */
function isEnclosingParameter(id) {
  let cur = id.parent;
  while (cur) {
    if (
      ts.isFunctionLike(cur)
      || ts.isFunctionDeclaration(cur)
      || ts.isArrowFunction(cur)
      || ts.isFunctionExpression(cur)
      || ts.isMethodDeclaration(cur)
    ) {
      for (const param of cur.parameters || []) {
        if (ts.isIdentifier(param.name) && param.name.text === id.text) return true;
        // A destructured/binding-pattern parameter named `id` also counts.
        if (bindingPatternNames(param.name).has(id.text)) return true;
      }
    }
    cur = cur.parent;
  }
  return false;
}

/** Every identifier name a binding pattern declares. */
function bindingPatternNames(name) {
  const out = new Set();
  const visit = (n) => {
    if (!n) return;
    if (ts.isIdentifier(n)) out.add(n.text);
    else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
      for (const el of n.elements) {
        if (ts.isBindingElement(el)) visit(el.name);
      }
    }
  };
  visit(name);
  return out;
}

/**
 * Resolve an identifier `name` to its `const`/`let` VariableDeclaration
 * initializer, searching the enclosing scopes outward (module-level or any
 * enclosing function-like body). Returns the initializer expression or null.
 */
function findBindingInitializer(id) {
  if (isEnclosingParameter(id)) return undefined; // parameter, not a binding
  const name = id.text;
  for (let cur = id.parent; cur; cur = cur.parent) {
    const stmts = cur.statements;
    if (!Array.isArray(stmts)) continue;
    for (const stmt of stmts) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return decl.initializer;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// extractSql — pure, sync
// ---------------------------------------------------------------------------

/**
 * Extract the SQL-bearing strings/templates of ONE file's text. PURE, sync.
 *
 * Two independent sources feed the result, de-duplicated by AST node position
 * (a node is counted once):
 *   1. QUERY CALLS — a CallExpression whose callee is the identifier `query` or
 *      a property access named `query`, with >= 1 argument. Its FIRST argument:
 *        - string/no-substitution literal → literal (viaQueryCall true); parsed
 *          regardless of whether it starts with a keyword.
 *        - TemplateExpression            → interpolated.
 *        - Identifier naming a parameter → `passthrough += 1` (forwarded text is
 *          the caller's, so it is neither a literal nor interpolated here).
 *        - Identifier naming a const/let whose initializer is a string literal →
 *          literal (viaQueryCall true); whose initializer is a TemplateExpression
 *          → interpolated; otherwise → interpolated (non-static).
 *        - any other expression           → interpolated.
 *   2. KEYWORD-START TEXT — any string/no-substitution literal or
 *      TemplateExpression anywhere whose text (head text for a template) matches
 *      the SQL keyword regex: template → interpolated; literal → literal with
 *      `viaQueryCall: false`.
 *
 * @param {string} rel repo-relative path (drives the ScriptKind)
 * @param {string} text source text
 * @returns {{literals: {line:number, sql:string, viaQueryCall:boolean}[],
 *            interpolated: {line:number}[], skipped:number, passthrough:number}}
 */
export function extractSql(rel, text) {
  const sf = sourceFile(rel, text);
  const literals = [];
  const interpolated = [];
  let skipped = 0;
  let passthrough = 0;
  const seen = new Set(); // AST node positions already counted
  // Nodes Source 1 has already accounted for as a query argument (the arg node
  // itself and the initializer node it resolved through): Source 2 skips both,
  // so a `const Q = 'SELECT …'` bound and then passed to `query(Q)` is ONE
  // literal (the call site), not two.
  const consumedByQueryCall = new Set();

  const addLiteral = (node, sql, viaQueryCall, queryArgOnly) => {
    if (queryArgOnly && !SQL_KEYWORD_RE.test(sql)) {
      // A literal query argument that does not start with a keyword is still a
      // literal (parsed regardless); the keyword rule below does NOT create it.
      // Nothing to skip here — it is recorded as a literal.
    }
    const key = node.pos + ':' + node.end;
    if (seen.has(key)) return;
    seen.add(key);
    literals.push({ line: lineOf(sf, node), sql, viaQueryCall });
  };

  const addInterpolated = (node) => {
    const key = node.pos + ':' + node.end;
    if (seen.has(key)) return;
    seen.add(key);
    interpolated.push({ line: lineOf(sf, node) });
  };

  // --- Source 1: query calls -------------------------------------------------
  const visitCalls = (node) => {
    if (isQueryCall(node)) {
      const arg = node.arguments[0];
      const queryArgOnly = true;
      if (isTextLiteral(arg)) {
        consumedByQueryCall.add(arg.pos + ':' + arg.end);
        addLiteral(arg, literalText(arg), true, queryArgOnly);
      } else if (ts.isTemplateExpression(arg)) {
        consumedByQueryCall.add(arg.pos + ':' + arg.end);
        addInterpolated(arg);
      } else if (ts.isIdentifier(arg)) {
        const init = findBindingInitializer(arg);
        if (init === undefined) {
          passthrough += 1; // identifier is a parameter of an enclosing function
        } else if (init === null) {
          addInterpolated(arg); // unresolvable identifier → non-static
        } else if (isTextLiteral(init)) {
          consumedByQueryCall.add(init.pos + ':' + init.end);
          addLiteral(arg, literalText(init), true, queryArgOnly);
        } else if (ts.isTemplateExpression(init)) {
          consumedByQueryCall.add(init.pos + ':' + init.end);
          addInterpolated(arg);
        } else {
          addInterpolated(arg);
        }
      } else {
        addInterpolated(arg);
      }
    }
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(sf);

  // --- Source 2: keyword-start text anywhere ---------------------------------
  // A keyword-start literal is a CANDIDATE: at extraction time it is parsed with
  // the (empty) catalog, so text that is not SQL at all — a route label like
  // `'DELETE /api/admin/x'` — is `skipped`, never a literal. Only a PARSE
  // failure skips: a resolution note on SQL that parsed is a real literal.
  const visitKeywordText = (node) => {
    const key = node.pos + ':' + node.end;
    if (isTextLiteral(node)) {
      const sql = literalText(node);
      if (SQL_KEYWORD_RE.test(sql) && !seen.has(key) && !consumedByQueryCall.has(key)) {
        seen.add(key);
        if (isParseError(resolve.resolveStatement(sql, {}).error)) skipped += 1;
        else literals.push({ line: lineOf(sf, node), sql, viaQueryCall: false });
      }
    } else if (ts.isTemplateExpression(node)) {
      const head = node.head && node.head.text;
      if (typeof head === 'string' && SQL_KEYWORD_RE.test(head) && !seen.has(key) && !consumedByQueryCall.has(key)) {
        seen.add(key);
        interpolated.push({ line: lineOf(sf, node) });
      }
    }
    ts.forEachChild(node, visitKeywordText);
  };
  visitKeywordText(sf);

  literals.sort((a, b) => a.line - b.line);
  interpolated.sort((a, b) => a.line - b.line);
  return { literals, interpolated, skipped, passthrough };
}

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

function sortedUnique(xs) {
  return Array.from(new Set(xs)).sort();
}

/** Sorted unique keys of a table -> column map, materialised as plain arrays. */
function sortColumns(map) {
  const out = {};
  for (const table of Object.keys(map).sort()) out[table] = sortedUnique(map[table]);
  return out;
}

/**
 * Classify ONE file's extraction against the resolver + catalog. PURE.
 *
 * A `NOT_POSTGRES` rel short-circuits to `{ class: 'not_postgres', reason }`.
 * Otherwise every literal is resolved with `resolveStatement`; a literal whose
 * resolution fails to PARSE (`isParseError`) is `unparsed` (its line recorded)
 * when it was a query argument, or `skipped` (non-SQL text) when it was a bare
 * keyword-start string. Any other non-null error is a resolution NOTE on SQL
 * that parsed: the statement still counts (reads/writes/fingerprint recorded)
 * and `resolve_errors` is incremented. `skipped` also carries the extraction's
 * own skips. Returns the parsed-statement counts, the union of reads/writes and
 * the sorted-unique fingerprints.
 *
 * @param {string} rel
 * @param {ReturnType<typeof extractSql>} extraction
 * @param {{[table:string]: string[]}} catalogTables
 */
export function classifyFile(rel, extraction, catalogTables) {
  if (Object.prototype.hasOwnProperty.call(NOT_POSTGRES, rel)) {
    return { class: 'not_postgres', reason: NOT_POSTGRES[rel] };
  }
  const catalog = catalogTables || {};
  const unparsed = [];
  let skipped = extraction.skipped || 0;
  let resolve_errors = 0;
  let statements = 0;
  const fingerprints = [];
  const reads = {};
  const writes = {};

  for (const lit of extraction.literals) {
    const r = resolve.resolveStatement(lit.sql, catalog);
    if (isParseError(r.error)) {
      if (lit.viaQueryCall) unparsed.push(lit.line);
      else skipped += 1;
      continue;
    }
    // A non-null `error` here is a resolution NOTE, not a parse failure: the
    // statement parsed, so it counts and its reads/writes/fingerprint stand.
    if (r.error) resolve_errors += 1;
    statements += 1;
    if (typeof r.fingerprint === 'string' && r.fingerprint) fingerprints.push(r.fingerprint);
    for (const table of Object.keys(r.reads)) {
      if (!reads[table]) reads[table] = [];
      for (const col of r.reads[table]) reads[table].push(col);
    }
    for (const table of Object.keys(r.writes)) {
      if (!writes[table]) writes[table] = [];
      for (const col of r.writes[table]) writes[table].push(col);
    }
  }

  return {
    class: extraction.interpolated.length > 0 ? 'interpolated' : 'static',
    statements,
    interpolated: extraction.interpolated.length,
    unparsed: unparsed.slice().sort((a, b) => a - b),
    skipped,
    resolve_errors,
    fingerprints: sortedUnique(fingerprints),
    reads: sortColumns(reads),
    writes: sortColumns(writes),
  };
}

// ---------------------------------------------------------------------------
// build / read / write / check
// ---------------------------------------------------------------------------

/** initParser(): load libpg-query once (the resolver's own init). */
export async function initParser() {
  await resolve.init();
  return true;
}

/** The committed catalog's `tables` map. DISK. */
function readCatalog(root) {
  const abs = path.join(root, CATALOG_REL_PATH);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return parsed && parsed.tables ? parsed.tables : {};
}

/**
 * Build the whole ledger. DISK (walks `src/`, reads the catalog). A file is
 * included only when it is a NOT_POSTGRES key or carries >= 1 literal or >= 1
 * interpolated text. Deterministic: `files` keys are sorted.
 * @param {string} [root]
 */
export async function buildSrcSqlLedger(root = REPO_ROOT) {
  await initParser();
  const catalog = readCatalog(root);
  const files = {};
  for (const rel of listSrcFiles(root)) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const extraction = extractSql(rel, text);
    const isNotPostgres = Object.prototype.hasOwnProperty.call(NOT_POSTGRES, rel);
    if (!isNotPostgres && extraction.literals.length === 0 && extraction.interpolated.length === 0) {
      continue;
    }
    files[rel] = classifyFile(rel, extraction, catalog);
  }
  const sorted = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key];
  return {
    contract_version: 1,
    generated_by: 'scripts/analysis/src-sql-ledger.mjs',
    catalog: CATALOG_REL_PATH,
    files: sorted,
  };
}

export async function writeSrcSqlLedger(root = REPO_ROOT) {
  const ledger = await buildSrcSqlLedger(root);
  fs.writeFileSync(path.join(root, SRC_SQL_LEDGER_REL_PATH), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

export async function readSrcSqlLedger(root = REPO_ROOT) {
  const abs = path.join(root, SRC_SQL_LEDGER_REL_PATH);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    const err = new Error(`src-sql-ledger.json unreadable at ${SRC_SQL_LEDGER_REL_PATH}: ${e.message}`);
    err.name = 'SrcSqlLedgerMissingError';
    throw err;
  }
  return JSON.parse(text);
}

/**
 * Closed-set violations over a ledger's `files` map. PURE.
 *   grew:<f>          a class-`interpolated` file not in the closed set
 *   stale:<f>         a set member whose class is not `interpolated` (or absent)
 *   unparsed:<f>:<l>  every unparsed line
 * @param {{files: {[f:string]: {class?:string, unparsed?:number[]}}}} ledger
 * @param {string[]} [closedSet]
 * @returns {string[]} sorted
 */
export function closedSetViolations(ledger, closedSet = CLOSED_INTERPOLATED_SET) {
  const files = (ledger && ledger.files) || {};
  const set = new Set(closedSet || []);
  const out = [];
  for (const f of Object.keys(files).sort()) {
    const entry = files[f] || {};
    if (entry.class === 'interpolated' && !set.has(f)) out.push(`grew:${f}`);
  }
  for (const f of Array.from(set).sort()) {
    const entry = files[f];
    if (!entry || entry.class !== 'interpolated') out.push(`stale:${f}`);
  }
  for (const f of Object.keys(files).sort()) {
    const entry = files[f] || {};
    for (const line of entry.unparsed || []) out.push(`unparsed:${f}:${line}`);
  }
  return out.sort();
}

/**
 * Catalog membership over a ledger's `files` map. PURE.
 *   missing       `missing-column:<file>:<reads|writes>:<table>.<column>` for every
 *                 column of a catalogued table the catalog does not list, sorted
 *   uncatalogued  tables the ledger touches that the catalog does not carry
 *                 (matviews), sorted unique — skipped, never flagged
 * @param {{files: {[f:string]: {class?: string, reason?: string, reads?: {[t:string]: string[]}, writes?: {[t:string]: string[]}}}}} ledger
 * @param {{[table:string]: string[]}} catalogTables
 * @returns {{missing: string[], uncatalogued: string[]}}
 */
export function catalogMembership(ledger, catalogTables) {
  const files = (ledger && ledger.files) || {};
  const catalog = catalogTables || {};
  const missing = [];
  const uncatalogued = new Set();
  for (const f of Object.keys(files).sort()) {
    const entry = files[f] || {};
    for (const kind of ['reads', 'writes']) {
      const map = entry[kind] || {};
      for (const table of Object.keys(map).sort()) {
        if (!Object.prototype.hasOwnProperty.call(catalog, table)) {
          uncatalogued.add(table);
          continue;
        }
        const known = new Set(catalog[table] || []);
        for (const col of map[table] || []) {
          if (!known.has(col)) missing.push(`missing-column:${f}:${kind}:${table}.${col}`);
        }
      }
    }
  }
  return { missing: missing.sort(), uncatalogued: Array.from(uncatalogued).sort() };
}

/**
 * `--check`: regenerate in memory, compare `files` to disk, compute closed-set
 * violations. Returns `{ fresh, firstDiff, violations, membership, built }` — `built` is the
 * in-memory ledger, so the CLI needs exactly ONE build per `--check`.
 */
export async function checkSrcSqlLedger(root = REPO_ROOT) {
  const built = await buildSrcSqlLedger(root);
  let onDisk = null;
  try {
    onDisk = await readSrcSqlLedger(root);
  } catch {
    onDisk = null;
  }
  const fresh = onDisk !== null
    && JSON.stringify(built.files) === JSON.stringify(onDisk.files);
  let firstDiff = null;
  if (!fresh) {
    const builtKeys = Object.keys(built.files);
    const diskKeys = onDisk ? Object.keys(onDisk.files || {}) : [];
    const union = Array.from(new Set([...builtKeys, ...diskKeys])).sort();
    for (const key of union) {
      if (JSON.stringify(built.files[key]) !== JSON.stringify(onDisk ? onDisk.files[key] : undefined)) {
        firstDiff = key;
        break;
      }
    }
  }
  return {
    fresh,
    firstDiff,
    violations: closedSetViolations(built),
    membership: catalogMembership(built, readCatalog(root)),
    built,
  };
}

// ---------------------------------------------------------------------------
// (c) runtime confirmation — recorded statements vs the static pass
// ---------------------------------------------------------------------------

/**
 * The witness resolver's fingerprint for ONE SQL text ('' when unparseable).
 * Uses the SAME resolver as the pass, so a fingerprint recorded here is
 * comparable to the `fingerprints` a ledger file entry carries. PURE.
 * @param {string} sql
 * @returns {string}
 */
export function fingerprintOf(sql) {
  const r = resolve.resolveStatement(sql, {});
  return (r && typeof r.fingerprint === 'string' && r.fingerprint) || '';
}

/**
 * Read the recorded statements of a trace dir. DISK: every `*.ndjson` in `dir`,
 * sorted by name (the tracer writes one file per process, named `<pid>.ndjson`).
 * Only `type === 'statement'` lines are read → `{ text, callers? }` (the
 * `callers` key is present only when the app's test-mode caller tag ran). A
 * missing/unreadable dir → `[]`; an unparseable line is skipped.
 * @param {string} dir
 * @returns {{text: string, callers?: string[]}[]}
 */
export function readRecordedStatements(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.ndjson')).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!rec || rec.type !== 'statement') continue;
      if (typeof rec.text !== 'string') continue;
      if (Array.isArray(rec.callers)) out.push({ text: rec.text, callers: rec.callers });
      else out.push({ text: rec.text });
    }
  }
  return out;
}

/**
 * Compare recorded statements against the static pass. PURE.
 *
 * A statement with no/empty `callers` is `untagged` (it counts once, its callers
 * are invisible). Otherwise it is judged ONCE PER CALLER: an absent
 * `ledger.files[caller]` → row `unclassified:<caller>`; a class-`interpolated`
 * caller → `dynamic` (the closed interpolated set is its witness); a
 * class-`static` caller → `confirmed` when the statement's fingerprint is in
 * that entry's `fingerprints`, else row `unconfirmed:<caller>:<fp>`.
 *
 * @param {{files: {[f:string]: {class?:string, fingerprints?:string[]}}}} ledger
 * @param {{text: string, callers?: string[]}[]} statements
 * @returns {{confirmed: number, dynamic: number, untagged: number, rows: string[]}}
 */
export function confirmRecorded(ledger, statements) {
  const files = (ledger && ledger.files) || {};
  const list = Array.isArray(statements) ? statements : [];
  let confirmed = 0;
  let dynamic = 0;
  let untagged = 0;
  const rows = [];
  for (const stmt of list) {
    if (!stmt) continue;
    const callers = Array.isArray(stmt.callers) ? stmt.callers : [];
    if (callers.length === 0) {
      untagged += 1;
      continue;
    }
    const fp = fingerprintOf(stmt.text);
    for (const caller of callers) {
      const entry = files[caller];
      if (!entry) {
        rows.push(`unclassified:${caller}`);
      } else if (entry.class === 'interpolated') {
        dynamic += 1;
      } else if (entry.class === 'static') {
        const fps = Array.isArray(entry.fingerprints) ? entry.fingerprints : [];
        if (fps.indexOf(fp) !== -1) confirmed += 1;
        else rows.push(`unconfirmed:${caller}:${fp}`);
      } else {
        rows.push(`unclassified:${caller}`);
      }
    }
  }
  return { confirmed, dynamic, untagged, rows: sortedUnique(rows) };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function counts(ledger) {
  let staticN = 0;
  let interpN = 0;
  let npN = 0;
  for (const entry of Object.values(ledger.files)) {
    if (entry.class === 'static') staticN += 1;
    else if (entry.class === 'interpolated') interpN += 1;
    else if (entry.class === 'not_postgres') npN += 1;
  }
  return { staticN, interpN, npN };
}

export async function main(argv) {
  if (argv.includes('--write')) {
    const ledger = await writeSrcSqlLedger(REPO_ROOT);
    const n = Object.keys(ledger.files).length;
    process.stdout.write(`wrote ${n} file(s) to ${SRC_SQL_LEDGER_REL_PATH}\n`);
    return 0;
  }
  if (argv.includes('--check')) {
    const r = await checkSrcSqlLedger(REPO_ROOT);
    const built = r.built;
    const { staticN, interpN, npN } = counts(built);
    const n = Object.keys(built.files).length;
    const m = r.membership;
    if (r.fresh && r.violations.length === 0 && m.missing.length === 0) {
      process.stdout.write(
        `src-sql-ledger: fresh, ${n} file(s) (${staticN} static, ${interpN} interpolated, ${npN} not_postgres), closed set holds, every column is in the catalog`
        + (m.uncatalogued.length > 0 ? ` (uncatalogued, skipped: ${m.uncatalogued.join(', ')})` : '')
        + '\n',
      );
      return 0;
    }
    if (!r.fresh) {
      process.stderr.write(
        `${SRC_SQL_LEDGER_REL_PATH} is STALE`
        + (r.firstDiff ? ` (first diff at file ${r.firstDiff})` : '')
        + ` — run \`node scripts/analysis/src-sql-ledger.mjs --write\`\n`,
      );
    }
    for (const v of r.violations) {
      process.stderr.write(`${v} — run \`node scripts/analysis/src-sql-ledger.mjs --write\` (then update CLOSED_INTERPOLATED_SET)\n`);
    }
    for (const v of m.missing) {
      process.stderr.write(`${v} — not in ${CATALOG_REL_PATH}: fix the SQL, or re-capture the catalog if a migration added the column\n`);
    }
    return 1;
  }
  const confirmAt = argv.indexOf('--confirm');
  if (confirmAt !== -1) {
    await initParser();
    const dir = argv[confirmAt + 1];
    if (!dir || dir.startsWith('--')) {
      process.stderr.write('usage: src-sql-ledger.mjs --confirm <trace-dir>\n');
      return 1;
    }
    const ledger = await readSrcSqlLedger(REPO_ROOT);
    const r = confirmRecorded(ledger, readRecordedStatements(dir));
    process.stdout.write(
      `src-sql-ledger confirm (PARTIAL — 34 mocked test files and getClient() callers are not seen): `
      + `${r.confirmed} confirmed, ${r.dynamic} dynamic (closed interpolated set), ${r.untagged} untagged\n`,
    );
    for (const row of r.rows) process.stdout.write(`${row}\n`);
    return r.rows.length > 0 ? 1 : 0;
  }
  process.stderr.write('usage: src-sql-ledger.mjs --write | --check | --confirm <trace-dir>\n');
  return 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
      process.exitCode = 2;
    });
}
