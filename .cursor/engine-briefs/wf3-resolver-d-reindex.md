---
write_scope:
- scripts/lib/sql-witness/resolve.cjs
- src/tests/sql-witness-resolve.logic.test.ts
allow_commit: false
---
# Resolver: REINDEX joins the utility list (schema-permitted maintenance op) + lock — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve LF line endings.
**Sizing:** 2 files, 2 tiny edits. NEVER run git add / commit / stash / reset.
**Facts (verified by the orchestrator):** `scripts/lib/step/plausibility.js` MAINTENANCE_SQL builds `REINDEX TABLE ${t}` for the schema-allowed maintenance operation "reindex"; the resolver now returns `FAIL:INPUT:unsupported:ReindexStmt` for it (measured). In `scripts/lib/sql-witness/resolve.cjs` the utility line reads exactly:
`  // --- Utility: transactions, SET/RESET/SHOW, VACUUM/ANALYZE, CREATE INDEX ---`
`  if (key === 'TransactionStmt' || key === 'VariableSetStmt' || key === 'VariableShowStmt' || key === 'VacuumStmt' || key === 'AnalyzeStmt' || key === 'IndexStmt') {`
In `src/tests/sql-witness-resolve.logic.test.ts` the last test of the final describe is `it('G-B1 GREEN control: CREATE INDEX + ANALYZE is a utility statement', () => {` … `});` followed by the describe's closing `});`.

1. **RED first:** add, right after the G-B1 test (inside the same describe):
```ts
  it('G-B2 RED: REINDEX (schema-permitted maintenance op, plausibility.js MAINTENANCE_SQL) is a utility statement', () => {
    const r = R.resolveStatement('REINDEX TABLE parcels', CAT2);
    expect(r.kind).toBe('utility');
    expect(r.error).toBeNull();
  });
```
   Run `npx vitest run src/tests/sql-witness-resolve.logic.test.ts` and report: expect exactly 1 failed (G-B2), 66 passed.
2. **Change:** in resolve.cjs, comment → `  // --- Utility: transactions, SET/RESET/SHOW, VACUUM/ANALYZE, CREATE INDEX, REINDEX ---` and append ` || key === 'ReindexStmt'` after `key === 'IndexStmt'`. Nothing else.
**Verify:** re-run the same vitest command → 67 passed, 0 failed. Report.
