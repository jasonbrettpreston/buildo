// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 2
//
// SQL witness resolver (P1-C2). Parses executed SQL text with libpg-query (the real
// Postgres grammar), then resolves every touched relation/column into a table ->
// column-set map, separately for reads and writes. CommonJS, no DB, no network,
// no fs writes, no process.exit; the only dependency is `libpg-query`.
//
// Contract: `.cursor/engine-briefs/p1c2-contract.md` (frozen). Sets are never
// returned — every list is a sorted, unique string array.
'use strict';

let loadModule = null; // libpg-query, resolved lazily in init()
let parseSync = null;
let fingerprintSync = null;
let initPromise = null;

// Runner-owned (system) relations. Each entry cites the runner file that touches it.
const RUNNER_OWNED = Object.freeze([
  { name: 'pipeline_runs', cite: 'scripts/lib/pipeline.js' },
  { name: 'logic_variables', cite: 'scripts/lib/config-loader.js' },
  { name: 'trade_configurations', cite: 'scripts/lib/config-loader.js' },
  { name: 'schema_migrations', cite: 'scripts/lib/resolve-db.js' },
]);

// Schema prefixes that are always system-owned, plus any relation whose bare name
// starts with `pg_` (catalog relations).
const SYSTEM_SCHEMAS = new Set(['pg_catalog', 'information_schema']);
const RUNNER_OWNED_NAMES = new Set(RUNNER_OWNED.map((e) => e.name));

/** Sort + dedupe a list of strings (never returns a Set — contract). */
function sortedUnique(xs) {
  return Array.from(new Set(xs)).sort();
}

/** Sorted unique keys of a table -> column map, materialised as plain arrays. */
function sortColumns(map) {
  const out = {};
  for (const table of Object.keys(map).sort()) {
    out[table] = sortedUnique(map[table]);
  }
  return out;
}

/** Deep, cycle-safe walk over the protobuf-JSON parse tree. Visits every node. */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  visit(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child !== null && typeof child === 'object') walk(child, visit);
  }
}

/**
 * Like `walk`, but does NOT descend into the bodies of nested scopes: the
 * `subselect` of a `SubLink`, the `subquery` of a `RangeSubselect`, or the
 * `ctequery` of a `CommonTableExpr`. Those bodies are resolved separately as
 * their own scopes (with the outer scope as parent), so visiting their
 * ColumnRefs here would wrongly bind them against the OUTER scope.
 * Use this for every ColumnRef -> applyColumn walk.
 */
function walkExpr(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkExpr(item, visit);
    return;
  }
  visit(node);
  // Skip the bodies of nested scopes; they are resolved as their own scopes.
  if (node.SubLink && typeof node.SubLink === 'object') {
    const sl = {};
    for (const k of Object.keys(node.SubLink)) {
      if (k !== 'subselect') sl[k] = node.SubLink[k];
    }
    walkExpr(sl, visit);
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child === null || typeof child !== 'object') continue;
    if (child.subselect !== undefined) continue; // SubLink body
    if (child.subquery !== undefined) continue; // RangeSubselect body
    if (child.ctequery !== undefined) continue; // CommonTableExpr body
    walkExpr(child, visit);
  }
}

/** Extract the string value of a `{ String: { sval: 'x' } }` field. */
function sval(field) {
  if (field && typeof field === 'object' && field.String && typeof field.String.sval === 'string') {
    return field.String.sval;
  }
  return null;
}

/** Is this node a `ColumnRef` node (as opposed to some other node-shaped object)? */
function isColumnRef(node) {
  return Array.isArray(node.fields) && node.fields.some((f) => sval(f) !== null || (f && f.A_Star));
}

/** Is this node a `RangeVar`? */
function isRangeVar(node) {
  return typeof node.relname === 'string';
}

/** Is this node a `RangeSubselect`? */
function isRangeSubselect(node) {
  return node.subquery !== undefined;
}

/** Is this node a CTE (`CommonTableExpr`)? */
function isCommonTableExpr(node) {
  return typeof node.ctename === 'string';
}

/**
 * Is this qualifier the `ON CONFLICT ... DO UPDATE` pseudo-relation? Inside that
 * clause `excluded` denotes the proposed row, not a relation in scope: a column
 * qualified by it is neither a read nor an error and must be ignored.
 */
function isExcludedQualifier(name) {
  return typeof name === 'string' && name.toLowerCase() === 'excluded';
}

/** The last (bare) name of a possibly-qualified relation name. */
function bareName(schemaname, relname) {
  return schemaname ? `${schemaname}.${relname}` : relname;
}

/** A relation a statement touches; `base` is the resolved (staging-stripped) table. */
function makeRel(relname, schemaname, alias) {
  return { rel: relname, schema: schemaname || null, alias: alias || null, raw: bareName(schemaname, relname) };
}

/** Strip a trailing `_staging` suffix (staging tables resolve to their base table). */
function baseTable(name) {
  if (name.length > '_staging'.length && name.endsWith('_staging')) {
    return name.slice(0, name.length - '_staging'.length);
  }
  return name;
}

/** Is a resolved (schema-qualified) relation runner/system-owned? */
function isSystemOwned(schema, relname) {
  if (schema && SYSTEM_SCHEMAS.has(schema)) return true;
  if (relname.startsWith('pg_')) return true;
  return RUNNER_OWNED_NAMES.has(relname);
}

/**
 * Walk one statement subtree, collecting the RangeVar-derived relations plus the
 * names bound by CTEs / subquery aliases in scope. `derived` names are column
 * sources we must NOT treat as real tables.
 */
function collectScope(stmtNode) {
  const relations = []; // real in-scope relations
  const derived = new Set(); // CTE names + subquery aliases (never tables)
  const subselectRels = []; // relation objects that are actually subquery aliases

  const pushRange = (rv) => {
    if (!isRangeVar(rv)) return;
    const alias = rv.alias && typeof rv.alias.aliasname === 'string' ? rv.alias.aliasname : null;
    relations.push(makeRel(rv.relname, rv.schemaname, alias));
  };

  // CTE names + subquery aliases first (they shadow earlier bindings).
  walk(stmtNode, (node) => {
    if (isCommonTableExpr(node)) derived.add(node.ctename);
    if (isRangeSubselect(node)) {
      const alias = node.alias && typeof node.alias.aliasname === 'string' ? node.alias.aliasname : null;
      if (alias) {
        derived.add(alias);
        subselectRels.push({ alias });
      }
    }
  });

  walk(stmtNode, (node) => {
    if (isRangeVar(node)) pushRange(node);
  });

  return { relations, derived, subselectRels };
}

/**
 * Build the alias -> relation map for the current scope. A relation's alias (or its
 * bare name) selects it. Derived (CTE/subquery) aliases are recorded separately.
 */
function aliasMap(scope) {
  const byAlias = new Map();
  for (const rel of scope.relations) {
    const bare = baseTable(rel.rel);
    const keys = new Set([rel.rel, bare]);
    if (rel.alias) keys.add(rel.alias);
    for (const k of keys) byAlias.set(k, rel);
  }
  return byAlias;
}

/** True if a name is a derived binding (CTE / subquery alias) in this scope. */
function isDerived(scope, name) {
  return scope.derived.has(name);
}

/**
 * Resolve a qualified column `qualifier.column`.
 * Returns { table } on success, { derived: true } when the qualifier is a CTE /
 * subquery alias (ignored), or { error: true } when the qualifier is unknown.
 *
 * When the qualifier is not bound by the innermost scope the enclosing scopes are
 * consulted outward (correlated-subquery chain), so `t.col` inside a subquery can
 * resolve the outer `UPDATE parcels t`. A `null` scope on the chain is the write
 * target of an UPDATE/INSERT, whose own name/alias binds there.
 */
function resolveQualified(scope, qualifier) {
  if (isExcludedQualifier(qualifier)) return { derived: true };
  for (let s = scope; s !== null && s !== undefined; s = s.parent) {
    if (isDerived(s, qualifier)) return { derived: true };
    const rel = aliasMap(s).get(qualifier);
    if (rel) {
      if (rel.raw === '*' && s.writeTarget) {
        return { table: baseTable(s.writeTarget.rel), schema: s.writeTarget.schema, relname: s.writeTarget.rel };
      }
      return { table: baseTable(rel.rel), schema: rel.schema, relname: rel.rel };
    }
  }
  return { error: true };
}

/**
 * Resolve an unqualified column against the in-scope real relations using the
 * catalog: exactly one real relation -> that table; else the unique relation whose
 * catalog row contains the column; if nothing matches but a derived source is in
 * scope -> ignored; otherwise an error.
 */
/**
 * Resolve an unqualified column against the scopes on the chain, innermost first.
 * In the innermost scope the catalog disambiguates between multiple relations
 * (exactly one candidate). If the innermost scope cannot place it, each enclosing
 * scope is consulted outward; at an enclosing scope the first relation whose
 * catalog row (or, for the write target, whose declared write columns) contains the
 * column wins. If nothing matches but a derived source is in scope -> ignored;
 * otherwise an error.
 */
function resolveUnqualified(scope, column, catalog, writeColumns) {
  for (let s = scope; s !== null && s !== undefined; s = s.parent) {
    const rels = (s.relations || []).filter((r) => !isDerived(s, r.alias || r.rel));
    if (s === scope) {
      if (rels.length === 1) {
        return { table: baseTable(rels[0].rel), schema: rels[0].schema };
      }
      const matches = [];
      const seen = new Set();
      for (const rel of rels) {
        const table = baseTable(rel.rel);
        if (seen.has(table)) continue;
        seen.add(table);
        const cols = catalog[table];
        if (Array.isArray(cols) && cols.indexOf(column) !== -1) {
          matches.push({ table, schema: rel.schema });
        }
      }
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return { error: true };
    } else {
      for (const rel of rels) {
        const table = baseTable(rel.rel);
        const cols = catalog[table];
        if (Array.isArray(cols) && cols.indexOf(column) !== -1) {
          return { table, schema: rel.schema };
        }
      }
    }
    // The write target of an UPDATE/INSERT binds its own name (and declared
    // write columns); `EXCLUDED` is that same proposed row inside ON CONFLICT.
    if (s.writeTarget && Array.isArray(writeColumns) && writeColumns.indexOf(column) !== -1) {
      return { table: baseTable(s.writeTarget.rel), schema: s.writeTarget.schema };
    }
  }
  if ((scope.relations || []).length === 0 || (scope.derived && scope.derived.size > 0)) return { derived: true };
  return { error: true };
}

/** Expand `*` / `t.*` from the catalog for one relation. */
function expandStar(rel, catalog) {
  const table = baseTable(rel.rel);
  const cols = catalog[table];
  return Array.isArray(cols) ? cols.slice() : [];
}

/** Record a read/write with a column, defaulting to [] for a bare table touch. */
function touch(map, table, column) {
  if (!map[table]) map[table] = [];
  if (column) map[table].push(column);
}

/**
 * Classify a function-call-only SELECT as utility when it is an advisory-lock call
 * with no FROM clause.
 */
function isAdvisoryLockSelect(node) {
  if (!node.targetList) return false;
  const funcs = [];
  walk(node.targetList, (n) => {
    if (Array.isArray(n.funcname)) {
      const parts = n.funcname.map((p) => sval(p)).filter((x) => typeof x === 'string');
      funcs.push(parts[parts.length - 1] || '');
    }
  });
  if (funcs.length === 0) return false;
  const hasFrom = node.fromClause !== undefined;
  if (hasFrom) return false;
  return funcs.every((f) => /^pg_(try_)?advisory.*lock/i.test(f) || /^pg_advisory/i.test(f));
}

/** A node is a staging CREATE TEMP TABLE (no AS SELECT). */
function isStagingCreate(node, isTemp) {
  if (!isTemp) return false;
  const relname = node.relation && node.relation.relname;
  return typeof relname === 'string' && relname.endsWith('_staging');
}

/** Response object skeleton. */
function result(kind, fingerprint, reads, writes, excluded, error) {
  return {
    kind,
    fingerprint,
    reads: sortColumns(reads),
    writes: sortColumns(writes),
    excluded: sortedUnique(excluded),
    error: error || null,
  };
}

/** Find the single statement node from parseSync output (contract: one statement). */
function firstStmt(parsed) {
  if (!parsed || !Array.isArray(parsed.stmts) || parsed.stmts.length === 0) return null;
  return parsed.stmts[0].stmt || null;
}

/** The lone statement-type key on a node (`{ SelectStmt: {...} }`). */
function stmtKind(node) {
  if (!node || typeof node !== 'object') return null;
  for (const key of Object.keys(node)) {
    if (key !== 'location' && key.endsWith('Stmt')) return key;
  }
  return null;
}

/**
 * Unwrap a `{ SelectStmt: {...} }`-style node into its inner body. libpg-query v18
 * returns sub-queries wrapped in the statement key (e.g. `InsertStmt.selectStmt`
 * is `{ SelectStmt: { ... } }`), so clause access must drill through it.
 */
function unwrap(node) {
  if (!node || typeof node !== 'object') return node;
  const key = stmtKind(node);
  if (key && node[key] && typeof node[key] === 'object') return node[key];
  return node;
}

/** Collect DELETE target / INSERT target relation info from the top node. */
function topRelation(node, key) {
  const inner = node[key];
  if (!inner || typeof inner !== 'object') return null;
  if (isRangeVar(inner.relation)) {
    return makeRel(inner.relation.relname, inner.relation.schemaname, null);
  }
  return null;
}

/** Column names in an INSERT targetList (name or a ColumnRef in `val`). */
function insertColumns(inner) {
  const cols = [];
  if (!Array.isArray(inner.cols)) return cols;
  for (const c of inner.cols) {
    const nm = c && c.ResTarget && typeof c.ResTarget.name === 'string' ? c.ResTarget.name : null;
    if (nm) cols.push(nm);
  }
  return cols;
}

/** Resolve Statement: generic over all statement kinds the contract names. */
function resolveCore(sql, catalog) {
  const parsed = parseSync(sql);
  const fp = fingerprintSync(sql);
  const node = firstStmt(parsed);
  if (!node) return result('utility', fp, {}, {}, [], null);
  const key = stmtKind(node);
  if (!key) return result('utility', fp, {}, {}, [], null);

  const inner = node[key];
  const reads = {};
  const writes = {};
  const excluded = [];

  // --- Utility: transactions, SET/RESET/SHOW, VACUUM/ANALYZE ---
  if (key === 'TransactionStmt' || key === 'VariableSetStmt' || key === 'VariableShowStmt' || key === 'VacuumStmt' || key === 'AnalyzeStmt') {
    return result('utility', fp, {}, {}, [], null);
  }

  // --- CREATE TABLE ... AS SELECT -> write statement ---
  if (key === 'CreateTableAsStmt') {
    const target = inner.into && inner.into.rel ? inner.into.rel : null;
    if (target && isRangeVar(target)) {
      touch(writes, baseTable(target.relname), null);
    }
    resolveScope(inner.query, catalog, reads, writes, excluded, true);
    return result('write', fp, reads, writes, excluded, null);
  }

  // --- CREATE [TEMP] TABLE <x>_staging (...) -> utility; other CREATE -> utility ---
  if (key === 'CreateStmt') {
    const isTemp = inner.relation && inner.relation.relpersistence === 't';
    if (isStagingCreate(inner, isTemp)) return result('utility', fp, {}, {}, [], null);
    return result('utility', fp, {}, {}, [], null);
  }

  // --- DROP TABLE <x>_staging -> utility ---
  if (key === 'DropStmt') {
    return result('utility', fp, {}, {}, [], null);
  }

  // --- SELECT ---
  if (key === 'SelectStmt') {
    if (isAdvisoryLockSelect(inner)) return result('utility', fp, {}, {}, [], null);
    resolveScope(inner, catalog, reads, writes, excluded, true);
    return result('read', fp, reads, writes, excluded, null);
  }

  // --- Write statements ---
  if (key === 'InsertStmt' || key === 'UpdateStmt' || key === 'DeleteStmt' || key === 'MergeStmt') {
    resolveWrite(key, inner, catalog, reads, writes, excluded);
    return result('write', fp, reads, writes, excluded, null);
  }

  // Unknown statement type: never silently a table touch, but not utility either.
  return result('utility', fp, {}, {}, [], null);
}

/**
 * Resolve a read scope (SELECT subtree / CTE body / subquery). Recurses into
 * FROM/JOIN relations, target list columns and WHERE/JOIN conditions.
 */
function resolveScope(scopeNode, catalog, reads, writes, excluded, _topLevel, parent) {
  scopeNode = unwrap(scopeNode);
  if (!scopeNode || typeof scopeNode !== 'object') return;
  const scope = collectScope(scopeNode);
  if (parent !== undefined) scope.parent = parent;

  // Record FROM/JOIN relations as reads of the table (bare touch).
  for (const rel of scope.relations) {
    if (isDerived(scope, rel.alias || rel.rel)) continue;
    recordRead(reads, excluded, rel, null);
  }

  // Target list / select columns.
  const targets = Array.isArray(scopeNode.targetList) ? scopeNode.targetList : [];
  for (const t of targets) {
    const val = t && t.ResTarget ? t.ResTarget.val : null;
    if (val) resolveExpr(val, scope, catalog, reads, writes, excluded, false);
  }

  // FROM / JOIN / WHERE / other column-bearing clauses.
  resolveClauseColumns(scopeNode, scope, catalog, reads, writes, excluded);

  // Subqueries (RangeSubselect incl. LATERAL, SubLink: EXISTS / IN / scalar). Each
  // resolves against its own relations first, then this scope outward (the chain).
  const descend = (node) => {
    walk(node, (n) => {
      if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, scope);
      const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
      if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, scope);
    });
  };
  for (const k of ['whereClause', 'havingClause', 'targetList']) {
    if (scopeNode[k] !== undefined) descend(scopeNode[k]);
  }
  if (scopeNode.fromClause !== undefined) descend(scopeNode.fromClause);
}

/** Walk a clause subtree resolving every ColumnRef in the given scope. */
function resolveClauseColumns(scopeNode, scope, catalog, reads, writes, excluded) {
  const clauseKeys = ['fromClause', 'whereClause', 'havingClause', 'groupClause', 'qualClause', 'joinQual', 'onClause'];
  for (const k of clauseKeys) {
    if (scopeNode[k] !== undefined) {
      walkExpr(scopeNode[k], (n) => {
        if (isColumnRef(n)) applyColumn(n, scope, catalog, reads, writes, excluded, false);
      });
    }
  }
  // CTEs resolve as their own scope.
  if (scopeNode.withClause && Array.isArray(scopeNode.withClause.ctes)) {
    for (const cte of scopeNode.withClause.ctes) {
      const cbody = cte && cte.CommonTableExpr ? cte.CommonTableExpr.ctequery : null;
      if (cbody) resolveScope(cbody, catalog, reads, writes, excluded, false, scope);
    }
  }
}

/** Resolve an expression node's ColumnRefs in a scope. */
function resolveExpr(val, scope, catalog, reads, writes, excluded, _isWrite) {
  walkExpr(val, (n) => {
    if (isColumnRef(n)) applyColumn(n, scope, catalog, reads, writes, excluded, _isWrite);
  });
}

/** Apply a single ColumnRef to the read/write maps. */
function applyColumn(colRef, scope, catalog, reads, writes, excluded, _isWrite) {
  const fields = colRef.fields || [];
  const names = fields.map((f) => sval(f)).filter((x) => typeof x === 'string');
  const hasStar = fields.some((f) => f && f.A_Star);

  // `*` or `t.*` expansion.
  if (hasStar || names.length === 0) {
    const qualifier = names.length >= 1 ? names[names.length - 1] : null;
    if (qualifier) {
      const r = resolveQualified(scope, qualifier);
      if (r.derived) return;
      if (r.error) return;
      const rel = { rel: r.table, schema: r.schema };
      for (const c of expandStar(rel, catalog)) recordRead(reads, excluded, rel, c);
      return;
    }
    for (const rel of scope.relations) {
      if (isDerived(scope, rel.alias || rel.rel)) continue;
      for (const c of expandStar(rel, catalog)) recordRead(reads, excluded, rel, c);
    }
    return;
  }

  if (names.length >= 2) {
    const column = names[names.length - 1];
    const qualifier = names[names.length - 2];
    const r = resolveQualified(scope, qualifier);
    if (r.derived) return;
    if (r.error) {
      markError(scope, column);
      return;
    }
    recordRead(reads, excluded, { rel: r.table, schema: r.schema }, column);
    return;
  }

  // Unqualified single-name column.
  const column = names[0];
  const r = resolveUnqualified(scope, column, catalog, scope.writeColumns);
  if (r.derived) return;
  if (r.error) {
    markError(scope, column);
    return;
  }
  recordRead(reads, excluded, { rel: r.table, schema: r.schema }, column);
}

// Record a column that resolved to no in-scope relation (or to 2+).
function markError(scope, column) {
  scope.__errors = scope.__errors || [];
  scope.__errors.push(column);
  currentErrors.push(`FAIL:INPUT:column:${column}`);
}

/** Record a read of `rel` (system-owned -> excluded), optionally a specific column. */
function recordRead(reads, excluded, rel, column) {
  const table = baseTable(rel.rel);
  if (isSystemOwned(rel.schema, rel.rel) || isSystemOwned(rel.schema, table)) {
    if (excluded.indexOf(rel.rel === table ? rel.rel : rel.rel) === -1) excluded.push(rel.rel);
    return;
  }
  touch(reads, table, column);
}

/** Record a write of `rel` (system-owned -> excluded), optionally specific columns. */
function recordWrite(writes, excluded, rel, column) {
  const table = baseTable(rel.rel);
  if (isSystemOwned(rel.schema, rel.rel) || isSystemOwned(rel.schema, table)) {
    if (excluded.indexOf(rel.rel) === -1) excluded.push(rel.rel);
    return;
  }
  touch(writes, table, column);
}

/** Resolve every CTE body of a statement as its own scope (CTEs are not tables). */
function resolveCtes(inner, catalog, reads, writes, excluded, parent) {
  const wc = inner && inner.withClause;
  if (!wc || !Array.isArray(wc.ctes)) return;
  for (const cte of wc.ctes) {
    const body = cte && cte.CommonTableExpr ? cte.CommonTableExpr.ctequery : null;
    if (body) resolveScope(body, catalog, reads, writes, excluded, false, parent);
  }
}

/** Resolve INSERT / UPDATE / DELETE / MERGE. */
function resolveWrite(key, inner, catalog, reads, writes, excluded) {
  const target = topRelation(inner, key) || (inner.targetList ? null : null);
  resolveCtes(inner, catalog, reads, writes, excluded, null);

  if (key === 'InsertStmt') {
    const targetRel = inner.relation && isRangeVar(inner.relation)
      ? makeRel(inner.relation.relname, inner.relation.schemaname, null)
      : null;
    const cols = insertColumns(inner);
    if (targetRel) {
      // Write every named column; a bare INSERT with no column list touches [].
      if (cols.length === 0) recordWrite(writes, excluded, targetRel, null);
      else for (const c of cols) recordWrite(writes, excluded, targetRel, c);
    }
    // INSERT ... SELECT: the query's columns are reads, correlated to the target.
    const writeScope = buildWriteScope(inner, targetRel, cols);
    if (inner.selectStmt) {
      resolveScope(inner.selectStmt, catalog, reads, writes, excluded, true, writeScope);
    }
    // RETURNING (e.g. `RETURNING (xmax = 0) AS is_insert`) belongs to the target row.
    if (inner.returningList !== undefined) {
      for (const visit of [writeScope, conflictScope(inner, targetRel, cols)]) {
        walkExpr(inner.returningList, (n) => {
          if (isColumnRef(n)) applyColumn(n, visit, catalog, reads, writes, excluded, false);
        });
        walk(inner.returningList, (n) => {
          if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, visit);
          const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
          if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, visit);
        });
      }
    }
    // ON CONFLICT ... DO UPDATE: SET right-hand sides and the guard WHERE. Inside
    // the clause `EXCLUDED` is the proposed row; unqualified/LHS-declared columns
    // resolve to the INSERT target (its declared column list).
    if (inner.onConflictClause) {
      const scope = conflictScope(inner, targetRel, cols);
      const conflict = unwrap(inner.onConflictClause);
      const pieces = [
        conflict.targetList,
        conflict.whereClause,
        conflict.infer && conflict.infer.whereClause,
      ];
      if (Array.isArray(conflict.targetList)) {
        for (const t of conflict.targetList) {
          if (t && t.ResTarget && t.ResTarget.val !== undefined) pieces.push(t.ResTarget.val);
        }
      }
      for (const piece of pieces) {
        if (piece === undefined) continue;
        resolveExpr(piece, scope, catalog, reads, writes, excluded, false);
        walk(piece, (n) => {
          if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, scope);
          const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
          if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, scope);
        });
      }
    }
    return;
  }

  if (key === 'UpdateStmt') {
    const targetRel = inner.relation && isRangeVar(inner.relation)
      ? makeRel(inner.relation.relname, inner.relation.schemaname, null)
      : null;
    const targetAlias = inner.relation && inner.relation.alias && typeof inner.relation.alias.aliasname === 'string'
      ? inner.relation.alias.aliasname
      : null;
    const writeColumns = [];
    if (Array.isArray(inner.targetList)) {
      for (const t of inner.targetList) {
        const res = t && t.ResTarget ? t.ResTarget : null;
        if (res && typeof res.name === 'string') writeColumns.push(res.name);
      }
    }
    const scope = buildWriteScope(inner, targetRel, writeColumns);
    // SET targets -> writes; SET right-hand sides -> reads.
    if (Array.isArray(inner.targetList)) {
      for (const t of inner.targetList) {
        const res = t && t.ResTarget ? t.ResTarget : null;
        if (!res) continue;
        if (targetRel && typeof res.name === 'string') recordWrite(writes, excluded, targetRel, res.name);
        if (res.val) {
          resolveExpr(res.val, scope, catalog, reads, writes, excluded, false);
          walk(res.val, (n) => {
            if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, scope);
            const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
            if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, scope);
          });
        }
      }
    }
    // WHERE / FROM / RETURNING / guard columns -> reads.
    for (const k of ['whereClause', 'fromClause', 'returningList']) {
      if (inner[k] === undefined) continue;
      walkExpr(inner[k], (n) => {
        if (isColumnRef(n)) applyColumn(n, scope, catalog, reads, writes, excluded, false);
      });
      walk(inner[k], (n) => {
        if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, scope);
        const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
        if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, scope);
      });
    }
    return target;
  }

  if (key === 'DeleteStmt') {
    const targetRel = inner.relation && isRangeVar(inner.relation)
      ? makeRel(inner.relation.relname, inner.relation.schemaname, null)
      : null;
    if (targetRel) recordWrite(writes, excluded, targetRel, null);
    const scope = buildWriteScope(inner, targetRel, []);
    for (const k of ['whereClause', 'usingClause', 'returningList']) {
      if (inner[k] === undefined) continue;
      walkExpr(inner[k], (n) => {
        if (isColumnRef(n)) applyColumn(n, scope, catalog, reads, writes, excluded, false);
      });
      walk(inner[k], (n) => {
        if (isRangeSubselect(n) && n.subquery) resolveScope(n.subquery, catalog, reads, writes, excluded, false, scope);
        const sub = n && !isRangeSubselect(n) ? n.SubLink : null;
        if (sub && sub.subselect) resolveScope(sub.subselect, catalog, reads, writes, excluded, false, scope);
      });
    }
    return target;
  }

  // MERGE: writes are managed by the runner elsewhere; touch the target + its reads.
  const mergeScope = buildWriteScope(inner, null, []);
  walkExpr(inner, (n) => {
    if (isColumnRef(n)) applyColumn(n, mergeScope, catalog, reads, writes, excluded, false);
  });
  return target;
}

/**
 * The scope for an `ON CONFLICT ... DO UPDATE` clause: no relations of its own,
 * `EXCLUDED` (the proposed row) handled by the qualifier predicate, and unqualified
 * columns resolving to the INSERT target's declared column list via a write-target
 * parent scope. RETURNING and the conflict clause both read the same target row.
 */
function conflictScope(inner, targetRel, writeColumns) {
  const scope = { relations: [], derived: new Set(), subselectRels: [], writeColumns: writeColumns || [] };
  if (targetRel) {
    scope.parent = {
      relations: [
        makeRel(targetRel.rel, targetRel.schema, null),
        { rel: '*', schema: null, alias: null, raw: '*' },
      ],
      derived: new Set(),
      subselectRels: [],
      writeTarget: targetRel,
      writeColumns: writeColumns || [],
    };
  }
  return scope;
}

/** Build a scope for a write statement. The scope's own relations are the
 * FROM/USING clauses (aliases such as `pb`); `parent` is a binding of the write
 * target so `t.col` / `parcels.col` in a correlated subquery resolves outward.
 * `writeColumns` are the declared write columns, which resolve unqualified columns
 * inside `ON CONFLICT ... DO UPDATE` (the proposed row) to the target relation.
 */
function buildWriteScope(inner, targetRel, writeColumns) {
  const scope = { relations: [], derived: new Set(), subselectRels: [] };
  // CTE names shadow table references of the same name.
  walk(inner, (n) => {
    if (isCommonTableExpr(n)) scope.derived.add(n.ctename);
  });
  const pushRv = (rv) => {
    if (!isRangeVar(rv)) return;
    const alias = rv.alias && typeof rv.alias.aliasname === 'string' ? rv.alias.aliasname : null;
    // A FROM reference that names a CTE is derived, never a real table.
    if (scope.derived.has(rv.relname)) {
      scope.derived.add(alias || rv.relname);
      return;
    }
    scope.relations.push(makeRel(rv.relname, rv.schemaname, alias));
  };
  const rvKeys = ['usingClause', 'fromClause'];
  for (const k of rvKeys) {
    if (inner[k] !== undefined) walk(inner[k], (n) => { if (isRangeVar(n)) pushRv(n); });
  }

  const target = targetRel || topRelation(inner, 'relation');
  if (target) {
    const alias = inner.relation && inner.relation.alias && typeof inner.relation.alias.aliasname === 'string'
      ? inner.relation.alias.aliasname
      : null;
    const targetScope = {
      relations: [makeRel(target.rel, target.schema, alias), { rel: '*', schema: null, alias: null, raw: '*' }],
      derived: new Set(),
      subselectRels: [],
      writeTarget: target,
      writeColumns: writeColumns || [],
    };
    scope.parent = targetScope;
  }
  return scope;
}

// Pending resolution errors for the statement currently being resolved (module-level
// because resolveStatement is synchronous and single-threaded).
let currentErrors = [];

/** init(): load the WASM module exactly once. */
async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('libpg-query');
      loadModule = mod.loadModule;
      parseSync = mod.parseSync;
      fingerprintSync = mod.fingerprintSync;
      if (typeof loadModule === 'function') await loadModule();
    })();
  }
  return initPromise;
}

/** resolveStatement(sql, catalog) -> plain result object; never throws on bad SQL. */
function resolveStatement(sql, catalog) {
  const cat = catalog || {};
  let fp = '';
  try {
    fp = typeof fingerprintSync === 'function' ? fingerprintSync(sql) : '';
  } catch {
    fp = '';
  }
  currentErrors = [];
  let core;
  try {
    core = resolveCore(sql, cat);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return result('utility', fp, {}, {}, [], `FAIL:INPUT:parse:${msg}`);
  }
  if (currentErrors.length > 0) {
    core.error = currentErrors[0];
  }
  return core;
}

/** resolveAll(statements, catalog) -> merged sets; errors collected, not thrown. */
function resolveAll(statements, catalog) {
  const reads = {};
  const writes = {};
  const excluded = [];
  const errors = [];
  let utility = 0;
  const list = Array.isArray(statements) ? statements : [];
  for (const sql of list) {
    const r = resolveStatement(sql, catalog);
    if (r.kind === 'utility') utility += 1;
    if (r.error) errors.push(r.error);
    for (const t of Object.keys(r.reads)) {
      touch(reads, t, null);
      for (const c of r.reads[t]) touch(reads, t, c);
    }
    for (const t of Object.keys(r.writes)) {
      touch(writes, t, null);
      for (const c of r.writes[t]) touch(writes, t, c);
    }
    for (const e of r.excluded) if (excluded.indexOf(e) === -1) excluded.push(e);
  }
  return {
    reads: sortColumns(reads),
    writes: sortColumns(writes),
    excluded: sortedUnique(excluded),
    utility,
    errors,
  };
}

module.exports = {
  init,
  RUNNER_OWNED,
  resolveStatement,
  resolveAll,
};
