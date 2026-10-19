// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity)
//            plan: .cursor/wf1_compute_purity_active_task.md Phase 1
//
// Split out of compute-purity.mjs (2026-10-11, mechanical move, no behaviour change): the SQL pass helpers (lexical classes, temp relations, literal extraction, declared set).

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { libpg } from './compute-purity-base.mjs';

// ------------------------------------------------------------------ lexical helpers

/** Relations whose raw access is ALWAYS a G1 site, whatever the SQL's own shape. */
export const LEDGER_TABLES = [
  'pipeline_runs', 'sync_runs', 'logic_variables', 'schema_migrations', 'trade_configurations',
];

/**
 * The resolver's OWN runner-owned set (`scripts/lib/sql-witness/resolve.cjs` `RUNNER_OWNED`) —
 * the tables the resolver treats as system-owned. Only used to refuse a SHADOW: a session temp
 * that claims one of these names must stay judgeable, never be exempted by the temp rule.
 */
const RUNNER_OWNED_TABLES = new Set([
  'pipeline_runs', 'logic_variables', 'trade_configurations', 'schema_migrations',
]);

/** `scanPurity` diagnostics — keyed by repo-relative file, so a caller can print why G2 was skipped. */
export const scanDiagnostics = new Map();

/** Clear `scanDiagnostics` — `scanPurity` calls this at its top so a run never reports a stale file. */
export function resetScanDiagnostics() {
  scanDiagnostics.clear();
}

/** The SQL verbs that make a literal SQL-shaped, by leading keyword. */
const SQL_START = /^(SELECT|WITH|INSERT|UPDATE|DELETE|MERGE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|VACUUM|ANALYZE|SET|RESET|CREATE|DROP|ALTER|TRUNCATE|LOCK|REINDEX|CLUSTER|DO(?=\s+(?:\$|LANGUAGE\b)))\b/i;

/** `information_schema` as a schema qualification (`information_schema.columns`). */
export const CATALOG_RE = /\binformation_schema\s*\./i;
/** A bare `information_schema` relation name. */
const INFORMATION_SCHEMA_RE = /^information_schema$/i;
/** A `pg_*` identifier as a whole word (Postgres's own catalog/stat objects). */
export const PG_REL_RE = /\bpg_[a-z0-9_]+/i;
/** PostGIS's SRID lookup — a catalog read with no relation to name. */
export const FIND_SRID_RE = /\bfind_srid\s*\(/i;
/** `pg_advisory*` / `pg_try_advisory*` — the session-lock family G4 bans. */
export const ADVISORY_RE = /\bpg_(?:try_)?advisory[a-z0-9_]*/i;
/** A leading statement verb for an UNPARSED literal (the parser could not say). */
export const UTILITY_START = /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|VACUUM|ANALYZE|SET|RESET|CREATE|DROP|ALTER|TRUNCATE|LOCK|REINDEX|CLUSTER|DO(?=\s+(?:\$|LANGUAGE\b)))\b/i;
/** A parsed statement kind that makes the literal a G4 site (transaction / session / DDL / maintenance). */
export const G4_STMT_RE = /^(TransactionStmt|VacuumStmt|VariableSetStmt|LockStmt|Create.*|Alter.*|Drop.*|Truncate.*|IndexStmt|ReindexStmt)$/;

/** A relation NAME is `<schema>.<table>` — the LAST segment is what a declaration matches. */
export function baseTableName(name) {
  return String(name).split('.').pop().trim().toLowerCase();
}

/**
 * The bare name of a resolver relation. CP-B2c defect 1: a resolver relation carries a
 * TRAILING SPACE (`pg_stat_user_tables ` — the resolver's own `rel.rel` when the RangeVar
 * had a `schemaname`) while `catalogRefs`/`isCatalogName` carry the clean `pg_stat_user_tables`.
 * Compared raw, the catalog duplicate is not seen and one relation is judged twice (G3 AND G2);
 * normalized, both spellings collapse to one name.
 */
export function bareRelationName(name) {
  return baseTableName(String(name || '').replace(/\s+/g, ' ').trim());
}

/**
 * The SCHEMA-QUALIFIED name of a relation, lowercased (`information_schema.columns`,
 * `public.parcels`, `parcels`). CP-B2b: the catalog judgement must run on THIS, never on
 * `baseTableName` — stripping the schema first turned `information_schema.columns` into
 * `columns`, which then failed `isCatalogName` and was reported as an undeclared relation.
 */
function qualifiedName(name) {
  return String(name || '').trim().toLowerCase().replace(/^"(.*)"$/, '$1');
}

/** Which of `names` appear in `text` as whole words (case-insensitive). */
export function lexicalMatch(text, names) {
  const found = [];
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) found.push(name);
  }
  return found;
}

/**
 * Every CTE name bound by a `WITH` clause of this statement tree. A `WITH parcel_c AS (…)`
 * binds `parcel_c` IN this statement, so a later `FROM parcel_c` is a reference to the CTE,
 * never a relation (`enrich-heritage.js:130` was three phantom G2 sites). The resolver
 * already knows this; the raw-`RangeVar` walk in `catalogRefs` does not, so it is told here.
 */
function cteNames(tree) {
  const names = new Set();
  const visit = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    const cte = node.CommonTableExpr;
    if (cte && typeof cte.ctename === 'string') names.add(qualifiedName(cte.ctename));
    for (const k of Object.keys(node)) visit(node[k]);
  };
  visit(tree);
  return names;
}

/**
 * Every CATALOG relation `RangeVar` reached by a statement tree, plus the two
 * non-relation catalog shapes (`find_srid`, and the lexical `information_schema`). Visits
 * the WHOLE tree — a catalog read is one wherever it sits, CTE included — and de-dupes by
 * QUALIFIED name, so one statement naming `pg_stat_user_tables` twice is one site.
 *
 * Names bound by a `WITH` clause of the SAME statement are skipped: a CTE named like a
 * table is a local binding, not a relation. `find_srid` is a plain function call, so the
 * CTE skip does not apply to it.
 */
export function catalogRefs(tree) {
  const names = new Set();
  let findSrid = false;
  const ctes = cteNames(tree);
  const visit = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (node.RangeVar && typeof node.RangeVar.relname === 'string') {
      const qualified = qualifiedName(node.RangeVar.schemaname
        ? `${node.RangeVar.schemaname}.${node.RangeVar.relname}`
        : node.RangeVar.relname);
      if (!ctes.has(qualified) && !ctes.has(qualifiedName(node.RangeVar.relname))) {
        names.add(qualified);
      }
    }
    if (Array.isArray(node.funcname)) {
      const called = node.funcname
        .map((f) => (f && f.String && typeof f.String.sval === 'string' ? f.String.sval : ''))
        .pop();
      if (called === 'find_srid') findSrid = true;
    }
    for (const k of Object.keys(node)) visit(node[k]);
  };
  visit(tree);
  return { names: [...names].filter(Boolean), findSrid };
}

/**
 * Every relation name a parsed statement really names, at its FULL (schema-qualified)
 * name — resolver `reads` ∪ `writes` ∪ `excluded`, PLUS a raw `RangeVar` walk for what the
 * resolver's contract does not list (a schema-qualified `information_schema.columns` read
 * lands in resolver `excluded` under its BARE name, and a `FROM information_schema.columns`
 * may be excluded entirely).
 *
 * CP-B2b: this is the ONE source of the G1/G2 relation set — CTE names in the same
 * statement come from `catalogRefs` filtered by the `WITH` bindings, never from the
 * resolver's resolved relations (the resolver already dropped them). Schema-qualified
 * `RangeVar`s are kept WHOLE, so the catalog test can see the schema.
 */
export function statementRelations(tree, res) {
  const set = new Set();
  const ctes = cteNames(tree);
  for (const t of Object.keys((res && res.reads) || {})) {
    const q = qualifiedName(t);
    if (!ctes.has(q) && !ctes.has(qualifiedName(baseTableName(q)))) set.add(q);
  }
  for (const t of Object.keys((res && res.writes) || {})) {
    const q = qualifiedName(t);
    if (!ctes.has(q) && !ctes.has(qualifiedName(baseTableName(q)))) set.add(q);
  }
  for (const t of (res && Array.isArray(res.excluded) ? res.excluded : [])) {
    const q = qualifiedName(t);
    if (!ctes.has(q) && !ctes.has(qualifiedName(baseTableName(q)))) set.add(q);
  }
  for (const r of catalogRefs(tree).names) set.add(r);
  return [...set].filter(Boolean);
}

/** Does a statement tree carry a statement-kind key matching `pred`? */
export function hasStmtKey(node, pred) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((x) => hasStmtKey(x, pred));
  const keys = Object.keys(node);
  if (keys.length === 1 && pred(keys[0])) return true;
  return keys.some((k) => hasStmtKey(node[k], pred));
}

// ------------------------------------------------------------------ temp relations (G2)

/** `relpersistence === 't'` (unspecified), `'TEMP'`/`'T'` (legacy) — temp either way. */
const TEMP_RELPERSISTENCE = new Set(['t', 'TEMP', 'temp', 'T']);
/** `unparsed:<trimmed line>` fingerprints G4 builds for a text the grammar rejected. */
export const UNPARSED_FP_RE = /^unparsed:/;
/** `CREATE TEMP(ORARY)? TABLE <name>` / `CREATE TABLE pg_temp.<name>` — the lexical TEMP arm. */
const CREATE_TEMP_RE = /\bcreate\s+(?:temp(?:orary)?\s+table\s+|table\s+pg_temp\s*\.\s*)([a-z_][a-z0-9_]*)/gi;

/**
 * The bare name a `{CreateStmt|CreateTableAsStmt}` introduces, or null when that relation is
 * not lastingly TEMP (`relpersistence === 't'`; the legacy `'TEMP'` spelling is tolerated).
 * `pg_temp.<name>` is a temp too — libpg records it as `relpersistence: 'p'` only when the
 * schema is spelled explicitly, and the schema is the whole evidence there.
 */
function createTargetName(kind, inner) {
  const rv = kind === 'CreateTableAsStmt'
    ? (inner && inner.into && inner.into.rel) || null
    : (inner && inner.relation) || null;
  if (!rv || typeof rv.relname !== 'string') return null;
  const temp = TEMP_RELPERSISTENCE.has(rv.relpersistence) || String(rv.schemaname || '').toLowerCase() === 'pg_temp';
  return temp ? bareRelationName(rv.relname) : null;
}

/** Recurse the parse tree, calling `visit(kind, inner)` on every `<X>Stmt` node. */
function visitStmtKinds(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) visitStmtKinds(x, visit);
    return;
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (key !== 'location' && key.endsWith('Stmt') && child && typeof child === 'object' && !Array.isArray(child)) {
      visit(key, child);
    }
    visitStmtKinds(child, visit);
  }
}

/**
 * Every session-LOCAL relation the SAME file creates, across ALL of its literals (CP-B2c
 * defect 2): `CREATE TEMP TABLE tmp_x … ON COMMIT DROP` in `enrich-centreline.js` is a
 * compute-owned staging table, and the `SELECT … FROM tmp_x` three screens later is NOT an
 * undeclared relation — it never leaves the session (the DDL itself is already a G4 site).
 *
 * The two sources of a session temp are (a) `CREATE TEMP TABLE` text inside a literal and
 * (b) a literal-named `ctx.tempTable({ name: '<literal>' })` call (Spec 124 R-BZ G2/G4, CP-S2).
 * Three arms, the same closed set the resolver's rule reads:
 *   · AST — every `CreateStmt` / `CreateTableAsStmt` whose relation is TEMP (`relpersistence
 *     === 't'`, or a `pg_temp.` schema), whatever literal it sits in; and
 *   · lexical — `CREATE TEMP(ORARY)? TABLE <name>` (or `CREATE TABLE pg_temp.<name>`) over the
 *     text of EVERY literal, so a CREATE the grammar rejects is still a name the file owns; and
 *   · AST — every `ctx.tempTable({ name: <string literal> })` call, the S2 seam that moved the
 *     DDL out of compute. The callee is exactly the Identifier `ctx` receiving `.tempTable`, the
 *     seam's only name here: `foo.tempTable(…)`, `this.tempTable(…)` and `ctx.x.tempTable(…)` add
 *     nothing. Only a LITERAL name declares a temp: a computed name, a spread or a missing `name`
 *     adds nothing — the set stays closed.
 *
 * A SHADOW is never exempt: a temp whose name is one of the control/ledger tables
 * (`RUNNER_OWNED`, the resolver's own list) stays judgeable as G1/G2 — the resolver's
 * `FAIL:INPUT:temp-shadows` rule in the same spirit.
 */
export function collectFileTemps(sf, literals) {
  const names = new Set();
  const isControl = (n) => LEDGER_TABLES.includes(n) || RUNNER_OWNED_TABLES.has(n);
  for (const sql of literals) {
    for (const m of sql.matchAll(CREATE_TEMP_RE)) {
      const n = bareRelationName(m[1]);
      if (n && !isControl(n)) names.add(n);
    }
    let parsed;
    try {
      parsed = libpg().parseSync(sql);
    } catch {
      continue; // the lexical arm above already read it
    }
    visitStmtKinds(parsed, (kind, inner) => {
      if (kind !== 'CreateStmt' && kind !== 'CreateTableAsStmt') return;
      const n = createTargetName(kind, inner);
      if (n && !isControl(n)) names.add(n);
    });
  }
  if (sf) {
    const walk = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.getText(sf) === 'tempTable' &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.getText(sf) === 'ctx'
        ) {
          const arg = node.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            const prop = arg.properties.find(
              (p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'name',
            );
            if (prop) {
              const init = prop.initializer;
              if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
                const n = bareRelationName(init.text);
                if (n && !isControl(n)) names.add(n);
              }
            }
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  return names;
}

/**
 * Is a relation name one of the catalog shapes (`information_schema.*`, `pg_catalog.*`,
 * `pg_*`)? Judged on the QUALIFIED name (CP-B2b) — `information_schema.columns` must be a
 * catalog hit, and `pg_catalog.pg_class` must be recognised through its schema too.
 */
export function isCatalogName(name) {
  const q = qualifiedName(name);
  if (!q) return false;
  const last = baseTableName(q);
  return q === 'information_schema' || INFORMATION_SCHEMA_RE.test(q)
    || q.startsWith('information_schema.')
    || q.startsWith('pg_catalog.')
    || /^pg_/.test(last) || /^pg_/.test(q);
}

/** Relation names of a `{reads, writes}` object (descriptor arrays or an AST `DECLARED` literal). */
function declareTables(obj) {
  const out = new Set();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const key of ['reads', 'writes']) {
    const v = obj[key];
    if (!Array.isArray(v)) continue;
    for (const t of v) {
      const s = declareTableName(t);
      if (s) out.add(s);
    }
  }
  return out;
}

/**
 * The relation name of ONE `reads`/`writes` entry, in EVERY shape the schema allows
 * (`scripts/steps/_schema/step.schema.json`): a plain string, a `"table.column"` string
 * (`checks[].reads` pre-FOLD-9 entries spell the column INSIDE the string), or a
 * `{table, columns}` object.
 */
function declareTableName(entry) {
  if (typeof entry === 'string') return baseTableName(entry);
  if (entry && typeof entry === 'object') {
    if (typeof entry.table === 'string') return baseTableName(entry.table);
    if (typeof entry.name === 'string') return baseTableName(entry.name);
  }
  return null;
}

// ------------------------------------------------------------------ literal extraction (static)

/** One literal's enclosing-call line, or its own line when it is not a call argument. */
function siteLineOf(sf, node) {
  let call = null;
  let p = node.parent;
  while (p && !ts.isSourceFile(p)) {
    if (ts.isCallExpression(p)) { call = p; break; }
    p = p.parent;
  }
  const at = call || node;
  return sf.getLineAndCharacterOfPosition(at.getStart(sf)).line + 1;
}

const LOGGER_CALLEE_RE = /(^|\.)(log|logWarn|logError|warn|error|info|debug)$/;

/**
 * Is `node` (a string/template literal) the direct argument of a logger call —
 * a callee whose dotted text matches `LOGGER_CALLEE_RE` (so `ctx.log.warn(…)`,
 * `logError(…)`, `console.error(…)`) — or of `new Error(…)`? Such a string is a
 * diagnostic message, never executable SQL: `'VACUUM …'` / `'rollback …'` prose
 * in a log line is a false G4.
 */
function isDiagnosticArg(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isNewExpression(p) && p.expression && ts.isIdentifier(p.expression)
    && p.expression.text === 'Error') return true;
  if (!ts.isCallExpression(p) || !p.arguments.includes(node)) return false;
  const callee = p.expression;
  const name = ts.isIdentifier(callee) ? callee.text
    : ts.isPropertyAccessExpression(callee) ? callee.name.text
      : '';
  if (!name || !LOGGER_CALLEE_RE.test(name)) return false;
  return true;
}

/**
 * Strip a literal's leading whitespace and leading line comments (`--`) and block
 * comments, for the SQL_START test ONLY (CP-B8a). A statement that opens with a comment
 * is still SQL-shaped, but a leading `--` would otherwise defeat the leading-verb regex.
 * The literal text passed on to the parser/resolver is unchanged.
 */
export function stripLeadingSqlComments(text) {
  let out = text.replace(/^\s+/, '');
  for (;;) {
    if (out.startsWith('--')) {
      const nl = out.indexOf('\n');
      if (nl === -1) return '';
      out = out.slice(nl + 1).replace(/^\s+/, '');
      continue;
    }
    if (out.startsWith('/*')) {
      const end = out.indexOf('*/');
      if (end === -1) return '';
      out = out.slice(end + '*/'.length).replace(/^\s+/, '');
      continue;
    }
    return out;
  }
}

/**
 * Every SQL-shaped literal of one parsed file, in source order, each with the line
 * of its (part-of-a-)call-argument site. A template is rendered with `1` per `${}`
 * span; a render that fails the SQL_START test is retried with `''` (a span in a
 * statement-fragment position), which is the brief's retry rule. A literal that is
 * a logger / `new Error` argument is skipped entirely (a diagnostic, not SQL).
 */
export function literalSites(sf, text) {
  const lines = text.split(/\r?\n/);
  const isTemplate = (n) => ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n);

  const render = (node, empty) => {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    let out = node.head.text;
    for (const span of node.templateSpans) {
      out += empty ? '' : '1';
      out += span.literal.text;
    }
    return out;
  };

  const out = [];
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || isTemplate(node)) && !isDiagnosticArg(node)) {
      let sql = render(node, false);
      if (!SQL_START.test(stripLeadingSqlComments(sql))) {
        const alt = render(node, true);
        if (SQL_START.test(stripLeadingSqlComments(alt))) sql = alt;
      }
      if (SQL_START.test(stripLeadingSqlComments(sql))) {
        const line = siteLineOf(sf, node);
        out.push({ node, sql, line, lineText: (lines[line - 1] || '').trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

// ------------------------------------------------------------------ declared set (G2)

/**
 * Collect every `<basename>.descriptor.json` under `repoRoot/scripts`, skipping every dot-dir
 * (`.claude/worktrees/agent-*` holds 16 stale repo copies) and `node_modules`. Results are
 * sorted by path for determinism.
 *
 * MEASURED 2026-10-12, programme tip in the MAIN tree: the previous whole-repo walk descended
 * into `.claude/worktrees/agent-*` dirs and returned their stale `scripts/enrich-parcels.descriptor.json`
 * FIRST, so `declaredFor` got a stale declared set → 3 false G2 sites (enrich-parcels.js:554/964
 * building_footprints, :1150 coa_applications) and every scan statted 16 repo copies → step-validate
 * spawn timeouts. A clean worktree finds 0 G2 sites. Step descriptors live under scripts/
 * (scripts/<slug>.descriptor.json, scripts/quality/<slug>.descriptor.json), so that is the only
 * subtree worth walking.
 */
export function findDescriptors(repoRoot, basename) {
  const found = [];
  const want = `${basename}.descriptor.json`;
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name === want) found.push(abs);
    }
  };
  walk(path.join(repoRoot, 'scripts'));
  return found.sort();
}

/** A descriptor's declared set: inputs.reads.tables ∪ checks[].reads ∪ outputs.writes (missing keys tolerated). */
function readDescriptorDeclares(abs) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
  const out = new Set();
  const add = (name) => {
    const s = typeof name === 'string' ? baseTableName(name) : declareTableName(name);
    if (s) out.add(s);
  };
  const inputsTables = obj && obj.inputs && obj.inputs.reads && obj.inputs.reads.tables;
  for (const t of Array.isArray(inputsTables) ? inputsTables : []) add(t);
  const checks = obj && Array.isArray(obj.checks) ? obj.checks : [];
  for (const c of checks) {
    for (const r of Array.isArray(c && c.reads) ? c.reads : []) add(r);
  }
  const writes = obj && obj.outputs && Array.isArray(obj.outputs.writes) ? obj.outputs.writes : [];
  for (const w of writes) add(w);
  return out;
}

/**
 * The `DECLARED` (or `_DECLARED`) `{reads, writes}` object literal a fixture exports, read
 * from the AST. CP-B2b — BOTH spellings a fixture uses:
 *   · `const DECLARED = {reads: […], writes: […]};`   (the literal itself), and
 *   · `module.exports.DECLARED = DECLARED;` / `exports.DECLARED = DECLARED;` (an
 *     IDENTIFIER that resolves back to a top-level `const DECLARED = {…}`).
 * The second is why a fixture exporting only the identifier was judged as having NO
 * declared set, which silently disabled G2 for it.
 */
function declaredFromAst(sf) {
  const out = new Set();
  const named = (id) => /^(DECLARED|_DECLARED)$/.test(id);
  const harvest = (objLit) => {
    for (const p of objLit.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      if (key !== 'reads' && key !== 'writes') continue;
      if (!ts.isArrayLiteralExpression(p.initializer)) continue;
      for (const el of p.initializer.elements) {
        if (!ts.isStringLiteral(el) && !ts.isNoSubstitutionTemplateLiteral(el)) continue;
        const leaf = el.text.split('.').pop().trim().toLowerCase();
        if (leaf) out.add(leaf);
      }
    }
  };
  /** Every `const DECLARED = {…}` (any binding depth) whose name is the fixture's own map. */
  const bindings = new Map();
  const collectBinding = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && named(node.name.text)
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectBinding);
  };
  ts.forEachChild(sf, collectBinding);
  for (const objLit of bindings.values()) harvest(objLit);
  // `module.exports.DECLARED = <literal | identifier>` and `exports.DECLARED = …`.
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && named(node.left.name.text)) {
      if (ts.isObjectLiteralExpression(node.right)) harvest(node.right);
      else if (ts.isIdentifier(node.right) && bindings.has(node.right.text)) harvest(bindings.get(node.right.text));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/**
 * The declared set for one compute entry: the sibling descriptor found by basename
 * (`scripts/**<basename>.descriptor.json`, skipping node_modules), else the AST
 * `DECLARED` literal, else null (G2 is skipped for that file).
 *
 * A FIXTURE basename never consults a descriptor: a fixture is a synthetic text, so
 * matching a real step's descriptor to it would judge the fixture against a declaration it
 * never made (and would be a silent G2 hole). Fixtures live under a `fixtures/` directory.
 *
 * With no descriptor AND no AST literal there is nothing to be "undeclared" against, so
 * G2 is skipped — which must be SAID OUT LOUD, not discovered later by a reviewer
 * wondering why a file has no relation sites.
 */
export function declaredFor(repoRoot, file, sf) {
  const abs = path.resolve(repoRoot, file);
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  const isFixture = /(^|\/)fixtures\//.test(rel);
  if (!isFixture) {
    const base = path.basename(abs).replace(/\.(js|cjs)$/, '');
    // `foo-compute.js` and its step `foo` are the same slug.
    const candidates = base.endsWith('-compute') ? [base, base.replace(/-compute$/, '')] : [base];
    for (const cand of candidates) {
      for (const d of findDescriptors(repoRoot, cand)) {
        const declared = readDescriptorDeclares(d);
        if (declared && declared.size) return declared;
      }
    }
  }
  const ast = declaredFromAst(sf);
  if (ast.size) return ast;
  if (!isFixture && !process.env.COMPUTE_PURITY_QUIET) {
    process.stderr.write(`note: compute-purity: no declared set for ${rel} (no sibling descriptor, no DECLARED literal) — G2 skipped for this file\n`);
  }
  return null;
}
