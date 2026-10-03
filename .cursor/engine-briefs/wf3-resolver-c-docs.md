---
write_scope:
- docs/specs/01-pipeline/122_pipeline_step_optimization.md
- docs/reports/review_followups.md
allow_commit: false
---
# Docs for the resolver scope WF3: Spec 122 §6.6.1(e) sentence + review_followups rows — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only (both files are long — NEVER write_file), anchored text edits verified once, preserve LF line endings. Text exactly as given; do not reword.
**Sizing:** 2 files, doc-only. NEVER run git add / commit / stash / reset.
**Facts (verified by the orchestrator):**
- Spec 122 line ~1034 is the single long paragraph starting `**(e) Phase 1 slice A — built (2026-10-01,`. It ends with the text `R13 in src/tests/staleness.logic.test.ts).` immediately followed by a blank line and `## 7. The validator, baked in`.
- `docs/reports/review_followups.md` ends (last 3 lines, ~:4199-4201) with three table rows beginning `| MEDIUM | **Witness resolver: an unqualified column that is ambiguous in an OUTER scope`, `| LOW | **Witness resolver: EXPLAIN / DO / CALL resolve as silent utilities`, `| LOW | **Witness resolver: MERGE fails with an opaque TypeError**`. Each row's LAST cell (after the final ` | `, before the closing ` |`) is the disposition, e.g. `registry-truth follow-up WF3 in scripts/lib/sql-witness/resolve.cjs: walk the scope chain and error on outer ambiguity; red-first fixture`.

1. **Spec 122:** on the (e) paragraph, replace the ending `R13 in src/tests/staleness.logic.test.ts).` with `R13 in src/tests/staleness.logic.test.ts). ` followed by this text (same line, no newline):

**Resolver scope rule (WF3 2026-10-03):** an unqualified column walks the scopes from innermost outward. It binds at the first scope where exactly one catalog table has it, and two or more matches at any scope is an error. A lone innermost relation keeps its credit when it has no catalog row, or when no scope's catalog places the column (stale catalog, output alias). Statement kinds outside the handled set are `FAIL:INPUT:unsupported:<Kind>` (EXPLAIN, DO, CALL, MERGE, TRUNCATE, …; CREATE INDEX joins the utility list). Locks R-A1–A4, R-B1–B7, R-C1 in `src/tests/sql-witness-resolve.logic.test.ts`.

2. **review_followups — close the 3 rows** by replacing ONLY each row's last (disposition) cell:
   - MEDIUM outer-scope row → `CLOSED 2026-10-03 (WF3 resolver-scope): per-scope 1/0/>1 rule, outer ambiguity is FAIL:INPUT:column; locks R-A1, R-A4`
   - LOW EXPLAIN/DO/CALL row → `CLOSED 2026-10-03 (WF3 resolver-scope): refused by name (FAIL:INPUT:unsupported:<Kind>), incl. inside a multi-statement text; TRUNCATE too; locks R-B1–R-B7`
   - LOW MERGE row → `CLOSED 2026-10-03 (WF3 resolver-scope): FAIL:INPUT:unsupported:MergeStmt; dead MERGE tail removed; lock R-C1`

3. **review_followups — append 2 new rows** at the very end of the file (after the MERGE row, same table, each on its own line):

`| MEDIUM | **Witness resolver: an outer column referenced unqualified inside a one-table subquery was credited to the subquery's table** (F1b, found reproducing the outer-ambiguity row, 2026-10-03): `SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)` with `id` only in a read c:["id"] — the innermost lone-relation shortcut skipped the catalog. Measured 0 suspect reads in committed traces. | CLOSED 2026-10-03 (WF3 resolver-scope): the lone relation binds only if its catalog has the column (fences: uncatalogued, or no scope places it); locks R-A2, R-A3 |`

`| LOW | **Witness resolver: the INSERT…SELECT write-target pseudo-scope exposes the target's columns to the SELECT** (S4, WF3 resolver-scope sibling, 2026-10-03): Postgres does not. When a catalogued source table lacks the column (stale catalog), the credit now moves from the source to the write target: `INSERT INTO a (id) SELECT id FROM c` read c.id before the fix and a.id after it — both wrong (Postgres raises an error). Corrected-corpus impact 0. | DEFER: registry-truth slice B — stop exposing the INSERT target's columns to its SELECT source; lock the shape above → FAIL:INPUT:column |`

Nothing else changes in either file.

**Verify (report each):** `git diff --stat` (2 files; Spec 122 1 line changed, review_followups 3 changed + 2 added); `tail -5 docs/reports/review_followups.md`; `grep -c "Resolver scope rule (WF3 2026-10-03)" docs/specs/01-pipeline/122_pipeline_step_optimization.md` → 1.
