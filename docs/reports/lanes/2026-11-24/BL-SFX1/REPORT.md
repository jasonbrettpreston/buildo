# BL-SFX1 · task-449 SEARCHFIX.1 · lane report (stage 1, output round 1)

Lane: BL-SFX1 · worktree /Users/brettpreston_macmini/Buildo-wt-sfx1 · branch wf2/inc1b-sfx1 · provider claude (Opus building seat; DeepSeek lenses)
Plan: PLAN-449-v1 as written in the task (plan already ruled: GROUNDER-PLAN.md; no plan lens run, per the G1 ticket).

## What landed (not pushed; no DB touched)
- 079f76c30 fix(100_mobile_parcel_cost_tool): SEARCHFIX.1 a lot opens only on an exact match (Task: task-449, McFrontend-Task: MF-35, as task-376/378 filed the lookup descriptor).
  Files-line paths only: src/lib/admin/parcel-lookup.ts, the three test files, census contracts.json row, the emitted lookup descriptor, Spec 100 (notes after :107 and :144), Spec 89 (note after :34), task-449 file, context-r2.md.
- a997f8fb7 docs(100_mobile_parcel_cost_tool): generated files (127-surface-registry.md, 127-surface-review-queue.md, rule-lists-by-kind.md, 00_system_map.md) and the owed notes on doc-2 G.1/A.3 (backlog doc update) and task-69 (append-notes). Split out because check-task-files.mjs refuses paths outside the Files line in a commit that stages code; a docs-only commit is exempt by that hook's own rule (check-task-files.mjs:10).
- The review-round commit (this report, context-r3.md, lens inputs and outputs, FINDINGS.md, TASK).

## Code (src/lib/admin/parcel-lookup.ts)
- typedText/typedBase: periods to spaces, one leading closed-form unit stripped (separator required); city cut and trailing-unit strip unchanged.
- Raw-first run when a query holds a period and the raw key differs (exact, typeahead, unlinked only); stripped run on no_match.
- guardByType on the exact rows after guardByDirection (not on a truncated window; a row with no printed type stops it; one-row conflict = conflictList).
- Typeahead: no direction narrowing at 10 rows (ST1); one-row leftover opens only when isTypedAddressInFull, else conflictList (2a). matchType 'typeahead' kept.
- likePrefix escape on the typeahead and unlinked $1 (D1).
- Letter/dash fallback after the full miss: exact statement (readExact, same SQL) per bare number, deduped, capped at 10, text_candidates; not on the raw run.
- Every `!` (10 left) carries a why-comment (D6). No resolution value added; route.ts, address.ts, types.ts and mobile/ unchanged (git diff ff3838a04..HEAD on those paths: 0 lines).

## Tests (red then green, through the real hooks)
- Red: refused commit attempt with only the test and task files staged: lane dir red.out, 25 failed / 144 passed (all new SEARCHFIX.1 cases; the green-both cases passed).
- Green: the landed commit 079f76c30; hook related run 9 files passed, 2 skipped (db), 332 tests passed, 14 skipped (lane dir green.out). typecheck clean.
- AC #1 T2, T5 12/13, extra 7 Oak, resolution-test partial; AC #2 T1 + 9-row boundary; AC #3 cases 10, 11; AC #4 27a/27b/27c, 2e, St. Clair, Gaspar; AC #5 T3; AC #6 T5 (cases 24, 29 and the phone half of 23 cited to existing phone tests).

## Deviations (recorded in Implementation Notes)
1) fallback dedupes by parcel_id and caps at 10; 2) readExact helper (same SQL text); 3) the old :226 `!` became `?? ''` (10 `!` left); 4) no fallback/matcher on the raw run; 5) T6 is green today too (a lock with a red plant); 6) case 15 has 4 recorded rows + 6 placeholders, case 21's pin is a placeholder (UNVERIFIED); 7) the second (docs-only) commit above; 8) system map and rule-lists page regenerated (hooks required them).

## Output review round 1
- Context: docs/reports/reviews/task-449/context-r3.md (backlog-brief.mjs). Diff: launch commit ff3838a04..HEAD on the Files line (85,586 bytes).
- 24 outputs in docs/reports/lanes/2026-11-24/BL-SFX1/: out-code-review-p1, out-ux-p1, out-error-paths-p1, out-security-p1, out-compliance-{step-132 p1-3, surface-136 p1-2, mobile-90, mobile-98, mobile-99 p1-5, five-words, plan-protocol, inc-S p1-2, ms-S}, out-engineering-eng-all p1-3, each beside its in- file.
- FINDINGS.md: 91 finding ids: 7 BUG HIGH, 8 BUG MED, 28 DEFER MED, 44 DEFER LOW, 2 DEFER NIT. Not ruled by the lane (Spec 08 section 7 rule 4): GROUNDER OWED.
- HIGH ids to note for the grounder: out-code-review-p1#1 (m[1] passed raw in isTypedAddressInFull; typechecks since normalizeAddressNumber accepts undefined), out-compliance-inc-S-p1#1 and out-engineering-eng-all-p3#1 (doc-2/task-69 notes not in the Files-line diff: they are in a997f8fb7), out-compliance-mobile-98#1 and out-compliance-surface-136-p2#1/#2 (case 15 placeholder rows, case 21 placeholder pin), out-compliance-ms-S#1 (direction/one-row rule).

## Status
Task left RUNNING, "grounder owed". Not pushed. No DB read or write. No suite run.
STATUS: blocked (waiting on the separate grounder for GROUNDER.md; then round-1 fixes and the close)
