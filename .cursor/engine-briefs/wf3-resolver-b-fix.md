---
write_scope:
- scripts/lib/sql-witness/resolve.cjs
allow_commit: false
---
# Resolver: Postgres scoping for unqualified columns + closed statement-kind set — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only (resolve.cjs is ~1035 lines — NEVER write_file), anchored text edits verified once, preserve LF line endings. This is an EDIT, not a rewrite: change only the anchors below.
**Sizing:** write scope = 1 file. NEVER run git add / commit / stash / reset. Do NOT edit the test file.
**Facts (verified by the orchestrator — re-read to confirm, never invent; text anchors win over line numbers):**
- `function resolveUnqualified(scope, column, catalog, writeColumns)` at ~:306-349, preceded by TWO stacked docblocks (~:291-296 "Resolve an unqualified column against the in-scope real relations using the catalog: exactly one real relation -> that table; …" and ~:297-305 "Resolve an unqualified column against the scopes on the chain, innermost first. …").
- `resolveNode` utility list (~:521): `if (key === 'TransactionStmt' || key === 'VariableSetStmt' || key === 'VariableShowStmt' || key === 'VacuumStmt' || key === 'AnalyzeStmt') {`
- write branch (~:565): `if (key === 'InsertStmt' || key === 'UpdateStmt' || key === 'DeleteStmt' || key === 'MergeStmt') {`
- fall-through (~:570-571): `  // Unknown statement type: never silently a table touch, but not utility either.` followed by `  return result('utility', fp, {}, {}, [], null);` then `}`.
- `resolveWrite` docblock (~:739): `/** Resolve INSERT / UPDATE / DELETE / MERGE. */`
- MERGE tail of `resolveWrite` (~:867-872): from `  // MERGE: writes are managed by the runner elsewhere; touch the target + its reads.` through the `walkExpr(inner, …applyColumn(n, mergeScope…)…});` block. The `return target;` that follows it stays (it is the function's final return for DeleteStmt). Read ~:840-875 first to confirm which branch the preceding `return target;` belongs to, so that removing the tail leaves every path of resolveWrite returning `target`.
- `resolveStatement` already copies `currentErrors[0]` into `core.error` (~:992-994); `currentErrors` is a module-level array used by resolveNode (see the `FAIL:INPUT:temp-shadows:` push in the CreateTableAsStmt branch).

**Measure first:** run `node -e "const R=require('./scripts/lib/sql-witness/resolve.cjs');R.init().then(()=>{const C={a:['id','x'],b:['id','y'],c:['z']};for(const s of ['SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)','CALL refresh_all(1)'])console.log(JSON.stringify(R.resolveStatement(s,C)))})"` and report the output (expect reads c:["id"] with error null, and a CallStmt with error null).

1. **Replace both docblocks AND the body of `resolveUnqualified`** (signature unchanged) with exactly this (keep the C2c funcCols block FIRST in the loop, verbatim):

```js
/**
 * Resolve an unqualified column with Postgres's scoping rule: walk the scope chain
 * innermost -> outward, and at EACH scope count the distinct catalog tables (of the
 * scope's real relations) that contain the column: exactly 1 -> bind there; more than
 * 1 -> error (ambiguous, at any scope); 0 -> the write target's declared write columns
 * may bind it, else continue outward. Two fences (P1-C2):
 *  (i)  an innermost lone relation with NO catalog row binds immediately (nothing to
 *       check against);
 *  (ii) if no scope places the column and the innermost scope had one real relation,
 *       that relation keeps the credit (executed SQL + stale catalog / output alias
 *       must not become an error).
 * Otherwise: ignored when a derived source is in scope (or no relations), else an error.
 */
function resolveUnqualified(scope, column, catalog, writeColumns) {
  let lone = null; // fence (ii): the innermost lone relation, credited only if no scope places the column
  for (let s = scope; s !== null && s !== undefined; s = s.parent) {
    // WF3 C2c: an unqualified function output column is derived, never the lone real relation's.
    if (s.funcCols) {
      for (const cols of s.funcCols.values()) {
        if (cols.has(column)) return { derived: true };
      }
    }
    const rels = (s.relations || []).filter((r) => !isDerived(s, r.alias || r.rel));
    if (s === scope && rels.length === 1) {
      const only = { table: baseTable(rels[0].rel), schema: rels[0].schema };
      if (!Array.isArray(catalog[only.table])) return only; // fence (i): uncatalogued
      lone = only;
    }
    const matches = [];
    const seen = new Set();
    for (const rel of rels) {
      const table = baseTable(rel.rel);
      if (seen.has(table)) continue;
      seen.add(table);
      const cols = catalog[table];
      if (Array.isArray(cols) && cols.indexOf(column) !== -1) matches.push({ table, schema: rel.schema });
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return { error: true };
    // The write target of an UPDATE/INSERT binds its own name (and declared
    // write columns); `EXCLUDED` is that same proposed row inside ON CONFLICT.
    if (s.writeTarget && Array.isArray(writeColumns) && writeColumns.indexOf(column) !== -1) {
      return { table: baseTable(s.writeTarget.rel), schema: s.writeTarget.schema };
    }
  }
  if (lone) return lone;
  if ((scope.relations || []).length === 0 || (scope.derived && scope.derived.size > 0)) return { derived: true };
  return { error: true };
}
```

2. **resolveNode utility list:** append `|| key === 'IndexStmt'` after `key === 'AnalyzeStmt'`, and change the comment above it from `// --- Utility: transactions, SET/RESET/SHOW, VACUUM/ANALYZE ---` to `// --- Utility: transactions, SET/RESET/SHOW, VACUUM/ANALYZE, CREATE INDEX ---`.
3. **Write branch:** remove ` || key === 'MergeStmt'` so it reads `if (key === 'InsertStmt' || key === 'UpdateStmt' || key === 'DeleteStmt') {`.
4. **Fall-through:** replace the comment line `// Unknown statement type: never silently a table touch, but not utility either.` with two lines:
```js
  // Closed set: any other statement kind (EXPLAIN, DO, CALL, MERGE, TRUNCATE, COPY, …) is refused by name, never a silent utility.
  currentErrors.push(`FAIL:INPUT:unsupported:${key}`);
```
   keeping the `return result('utility', fp, {}, {}, [], null);` after it.
5. **resolveWrite:** docblock → `/** Resolve INSERT / UPDATE / DELETE. */`; delete the MERGE tail (the `// MERGE: …` comment, the `const mergeScope = buildWriteScope(inner, null, []);` line and its `walkExpr(...)` block) so the function still ends with a single `return target;`. If `buildWriteScope` then has no other caller, report that (do NOT delete it — just report `grep -n buildWriteScope scripts/lib/sql-witness/resolve.cjs`).

Nothing else changes.

**Verify (report each):**
- Re-run the measure command: expect `reads` `{"a":["id"],"c":[]}` error null, and the CALL with `"error":"FAIL:INPUT:unsupported:CallStmt"`.
- `node -e "require('./scripts/lib/sql-witness/resolve.cjs')"` loads with no error.
- `grep -n "MergeStmt" scripts/lib/sql-witness/resolve.cjs` — report every hit (expect only, if any, a comment; none in the write branch).
- `git diff --stat` — only resolve.cjs.
