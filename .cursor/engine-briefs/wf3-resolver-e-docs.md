---
write_scope:
- docs/specs/01-pipeline/122_pipeline_step_optimization.md
- docs/reports/review_followups.md
allow_commit: false
---
# Docs fold (output roster NITs + REINDEX) — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve LF line endings. Exact text replacements only.
**Sizing:** 2 files. NEVER run git add / commit / stash / reset.
1. Spec 122: replace `It binds at the first scope where exactly one catalog table has it, and two or more matches at any scope is an error.` with `It binds at the first scope where exactly one catalog table has it (with none, the write target's declared write columns may bind it), and two or more matches at any scope is an error.`
2. Spec 122: replace `CREATE INDEX joins the utility list). Locks R-A1–A4, R-B1–B7, R-C1 in` with `CREATE INDEX and REINDEX join the utility list). Locks R-A1–A4, R-B1–B7, R-C1, G-B1–G-B2 in`.
3. review_followups.md: replace `outer ambiguity is FAIL:INPUT:column; locks R-A1, R-A4` with `outer ambiguity is FAIL:INPUT:column; lock R-A1 (R-A4 pins the outer/inner split)`.
Nothing else.
**Verify:** `git diff --stat docs/` (2 files); `grep -c "G-B1–G-B2" docs/specs/01-pipeline/122_pipeline_step_optimization.md` → 1; `grep -c "lock R-A1 (R-A4" docs/reports/review_followups.md` → 1.
