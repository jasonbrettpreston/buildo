# TRIAGE of r1-plan.txt (plan review round 1, lane BL-MB94C, task-121)
Each finding: KEPT or REJECTED with the opened file:line.

1. CRITICAL null rows crash on `stored.length`: REJECTED. src/lib/admin/report-preview-live/project.ts:187 `const stored = rows ?? [];` already normalises null; the predicate is `stored.length === 0` (rows null or empty). T1 (null) proves it.
2. CRITICAL implements before tests: KEPT in part. The step text listed code (1) before tests (3), but the brief (BRIEF.md:11, :31) and 08_agents.md:490 fix the order: red commit attempt first. Plan text reordered: step 3 (tests, red.out) runs before step 1 (code). Nothing in the tree is changed before red.out exists.
3. HIGH Estimate [object Object]: REJECTED, out of scope (generator of the context pack, scripts/analysis/backlog-brief.mjs); not this task.
4. HIGH ENOENT doc paths: REJECTED, out of scope (pack resolver); the governing text read is Spec 126:809 and plan R-2, cited by file:line in the plan.
5. HIGH staged patch in scratch: REJECTED. The staged tree stays in ~/Buildo-wt-mb94c (read-only) and the departure cites its lines; the recut commit carries the final code and tests in the repo. The REPORT in the repo (rule 19) quotes the two departing lines.
6. HIGH no ruling needed: REJECTED. The operator's RR-0301 ('task 341 approved') orders the recut to the R-2 literal, and R-2 itself is the operator's 2026-11-12 ruling (Spec 126:809, verbatim "D all as recommended"). The label "Not yet evaluated" is ruled text.
7. HIGH AC #1, #3, #5 not in plan: REJECTED for #3 (write_scope is declared at BRIEF.md:25-27); #1 and #5 are imported generic criteria: noted at close with a note (BRIEF.md:13 allows it). The pre-registered expected moves are the T1-T6 list.
8. HIGH one lens output review: REJECTED. BRIEF.md:12 sets one round, one lens (every no-row lot, every option, nothing changes for rows).
9. MEDIUM doc-9 block metadata: REJECTED, pack generator, out of scope.
10. MEDIUM json generated vs edited: KEPT as a clarification. scripts/surfaces/_schema/seed-report-v2.mjs:597-600 holds pres; the json is its output. Plan: edit seed-report-v2.mjs, run it to write the json, never hand-edit the json.
11. MEDIUM T4 rendered precedence for gated lot: REJECTED. The gate shows in lineage.freshness (project.ts:172) and the admin banner; the page response values (project.ts:205-226) carry no gate sentence today, so no contradiction can be rendered. T4 keeps asserting the verdict stays gated.
12. MEDIUM name implies permanent while unstamped is transient: REJECTED. Spec 126:809 says "every option on a lot that has no stored Layer 3 rows"; no stamp condition exists in the rule. The departure from the literal is the finding; flagged in REPORT as a judgment note only.
13. MEDIUM per-lot vs per-option granularity: KEPT as a stated reading: the rule says "a lot that has no stored Layer 3 rows" (per lot); a lot with some rows keeps per-option states (plan 4a line 292). Written in the code comment.
14. MEDIUM sibling consumers under-enumerated: REJECTED. grep of status_text found consumers core.ts:69, report-checks.mjs:58, report-schema.mjs:465 (all in the table); emit-mobile-surfaces --check runs before and after (checks.out).
15. MEDIUM T6 prose: KEPT. T6 asserts status_text['not_evaluated:' + NOT_IN_ENGINE_POPULATION] equals the sentence (key built from the exported constant, so a key mismatch fails) and T1 asserts buildPage not.toThrow.
16. MEDIUM truncated hashes: REJECTED, pack generator.
17. MEDIUM no rollback: REJECTED. No push; one local commit; nothing to write.
18. LOW pins rule covers counts only: KEPT as wording: pins move as data with a dated comment whether a count or captured text moves; none expected.
19. LOW task-62 final summary: REJECTED, unrelated.
20. LOW type does not stop persisting producer reason: REJECTED. project.ts:185 "Pure: no I/O"; nothing writes rows.
21-23. NITs: REJECTED, pack formatting.

# TRIAGE of r2-output.txt (output review, one lens, after commit 56945a128): no KEPT defect, no fix commit
- HIGH reason null when shown_as is not not_evaluated: REJECTED. On a no-row lot status is null for every option (project.ts options loop), hidden needs status !== null and shown needs status === permitted, so every option is not_evaluated; the new tests assert shown_as not_evaluated AND the reason for all six no-row shapes (admin-report-preview-live.logic.test.ts, R-2 describe).
- MEDIUM `reason: null` key on row lots: REJECTED as a defect: an additive lineage key named by the plan (context table); values, hidden and not_evaluated unchanged (the row-lot tests and the 88-test file pass).
- MEDIUM commit claims goldens not in patch: REJECTED. The reviewed diff was filtered to code paths; `git show --stat 56945a128` lists 113 files incl. 72 report and 32 page goldens and web_landing.sample.json.
- MEDIUM stored row carrying the new reason: REJECTED. The reason is producer-only; stored reasons are the closed vocab.json:462 list.
- MEDIUM pageBindings export: REJECTED, project.ts:95 `export function pageBindings`.
- MEDIUM FACT_COLUMNS over-tight / LEGACY regex / seed-json sync / type nit: REJECTED, scope (the lock is the staged FE-39 lock; the seed --check proves the json sync).
- LOW rows not Layer 3: REJECTED, stored-page.ts:67 reads parcel_maxbld_scenarios only.
- LOW reason_text binding per option: REJECTED, the page table has the three option panels; T1 asserts all three keys.
