---
write_scope:
- src/tests/sql-witness-resolve.logic.test.ts
allow_commit: false
---
# Resolver scope + closed statement kinds — RED-first locks (17 cases) — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only (the file exists; 554 lines), anchored text edits verified once, preserve the file's line endings (LF).
**Sizing:** test-only edit. Write scope = 1 file. NEVER run git add / commit / stash / reset — the orchestrator commits. Do NOT touch `scripts/lib/sql-witness/resolve.cjs`.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- `src/tests/sql-witness-resolve.logic.test.ts` already has a `SPEC LINK` header, the module-level `let R: ResolverModule;` loaded in `beforeAll`, and helpers `keys`/`sorted` near the top. `R.resolveStatement(sql, catalog)` returns `{ kind, fingerprint, reads, writes, excluded, error }` (`error` is `string | null`).
- The file ends with the closing `});` of the describe that contains the test `'RED: the REAL generated parcels upsert resolves every declared column to \`parcels\`'`. Append the new describe AFTER that final `});` (end of file).

1. **Change:** append exactly one new top-level block:

```ts
describe('WF3 resolver scope + closed statement kinds (outer-scope binding, loud refusal)', () => {
  const CAT2: Record<string, string[]> = { a: ['id', 'x'], b: ['id', 'y'], c: ['z'] };
  // ... 17 `it(...)` cases below
});
```

The 17 cases, in this order, titles prefixed with the id (e.g. `'R-A1 RED: …'`, `'G-A1 GREEN control: …'`). Use `toEqual` for arrays exactly as stated.

| id | SQL (string literal, exact) | assertions |
|---|---|---|
| R-A1 | `SELECT 1 FROM a, b WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `expect(r.error).toBe('FAIL:INPUT:column:id')`; `expect(r.reads.c ?? []).not.toContain('id')` |
| R-A2 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` | `r.error` null; `r.reads.a` toEqual `['id']`; `r.reads.c` toEqual `[]` |
| R-A3 | `UPDATE a SET x = 1 WHERE EXISTS (SELECT 1 FROM c WHERE id = 2)` | `r.reads.a` toEqual `['id']`; `r.reads.c` toEqual `[]`; `r.writes.a` toEqual `['x']` |
| R-A4 | `SELECT 1 FROM a JOIN b ON a.id = b.id WHERE x IN (SELECT z FROM c WHERE y = 1)` | `r.reads.b` toEqual `['id', 'y']`; `r.reads.c` toEqual `['z']` |
| G-A1 | `SELECT 1 FROM a, b WHERE id = 1` | `r.error` toBe `'FAIL:INPUT:column:id'` (innermost ambiguity unchanged) |
| G-A2 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM b WHERE id = 1)` | `r.reads.b` toEqual `['id']` (inner table wins when it has the column) |
| G-A3 | `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM d WHERE id = 1)` | `r.reads.d` toEqual `['id']`; `r.error` null (fence i: uncatalogued lone relation `d`) |
| G-A4 | `SELECT q FROM c` | `r.reads.c` toEqual `['q']`; `r.error` null (fence ii: stale catalog) |
| R-B1 | `EXPLAIN SELECT id FROM a` | `r.error` toBe `'FAIL:INPUT:unsupported:ExplainStmt'` |
| R-B2 | `EXPLAIN ANALYZE UPDATE a SET x = 1` | `r.error` toBe `'FAIL:INPUT:unsupported:ExplainStmt'` |
| R-B3 | `DO $$ BEGIN UPDATE a SET x = 1; END $$` | `r.error` toBe `'FAIL:INPUT:unsupported:DoStmt'` |
| R-B4 | `CALL refresh_all(1)` | `r.error` toBe `'FAIL:INPUT:unsupported:CallStmt'` |
| R-B5 | `SELECT id FROM a; CALL refresh_all(1)` | `r.error` toBe `'FAIL:INPUT:unsupported:CallStmt'`; `r.reads.a` toEqual `['id']` |
| R-B6 | `TRUNCATE a` | `r.error` toBe `'FAIL:INPUT:unsupported:TruncateStmt'` |
| R-B7 | `CALL refresh_all(1); SELECT id FROM a` | `r.error` toBe `'FAIL:INPUT:unsupported:CallStmt'`; `r.reads.a` toEqual `['id']` (unsupported statement first) |
| R-C1 | `MERGE INTO a USING b ON a.id = b.id WHEN MATCHED THEN UPDATE SET x = b.y` | `r.error` toBe `'FAIL:INPUT:unsupported:MergeStmt'`; `expect(String(r.error)).not.toMatch(/TypeError\|relname/)` |
| G-B1 | `CREATE INDEX comp_cand_gix ON comp_cand USING gist (geom); ANALYZE comp_cand;` | `r.kind` toBe `'utility'`; `r.error` null |

(In the R-C1 regex use `/TypeError|relname/` — the backslash above is table escaping only.) Each case: `const r = R.resolveStatement(<sql>, CAT2);` then the assertions. Titles: RED ids say `RED:`, G ids say `GREEN control:`, and briefly name the behaviour (e.g. "outer-scope ambiguity errors", "outer column binds to the outer table", "EXPLAIN refuses by name").

Nothing else in the file changes.

**Verify:** run `npx vitest run src/tests/sql-witness-resolve.logic.test.ts` (from the repo root of this worktree). EXPECTED on the current resolver: exactly 12 failed (R-A1, R-A2, R-A3, R-A4, R-B1..R-B7, R-C1) and the 5 G-* cases plus every pre-existing test pass. Report the pass/fail counts and the names of the failing tests verbatim. Do NOT try to make the RED tests pass. Also run `npx tsc --noEmit -p tsconfig.json 2>&1 | grep sql-witness-resolve` and report (expect no output).
