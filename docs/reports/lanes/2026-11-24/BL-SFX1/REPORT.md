# BL-SFX1 · task-449 SEARCHFIX.1 · lane report (stage 1, output round 2)

Lane: BL-SFX1 · worktree /Users/brettpreston_macmini/Buildo-wt-sfx1 · branch wf2/inc1b-sfx1 · provider claude (Opus building seat; DeepSeek lenses)
Plan: PLAN-449-v1 as written in the task (plan already ruled: GROUNDER-PLAN.md; no plan lens run).

## Commits (not pushed; no DB read or write by the lane; no full suite)
- 079f76c30 fix: the work (code, tests, census row, emitted descriptor, Spec 100 and Spec 89 notes). Hooks green: 332 passed, 14 skipped.
- a997f8fb7 docs only: regenerated registry, review queue, rule-lists page and system map; the notes on doc-2 G.1/A.3 and task-69. A separate commit because check-task-files.mjs refuses non-Files-line paths beside code (docs-only exempt, check-task-files.mjs:10).
- 2bc72d9ca: round 1 review records.
- ddc9e8a24 fix: round 1 fix (out-compliance-ms-S#1, MED): the direction guard is re-checked after the street-type narrowing, so "32 Fulham Dr E" over "32 Fulham St W" and "32 Fulham Dr W" is the list (RR-0166 ONE-12 a). Net zero lines; generate-surface-registry --check clean. Also: case 15 rows 5 to 10 and case 21's point are real rows (local test stack, read-only, 2026-11-24, read by the orchestrator); the task Files line gains docs/specs/00-architecture/00_system_map.md (grounder Q4).
  - Red: red-r2.out, 1 failed / 94 passed (only the Dr E row; the Dr W row and the new fixtures passed). Green: green-r2.out, 9 files passed, 2 skipped (db); 334 passed, 14 skipped.
- The round 2 records commit (this report, context-r4.md, 30 lens inputs and outputs, FINDINGS.md, TASK).

## Code summary (src/lib/admin/parcel-lookup.ts)
- A lot opens only on an exact match. A one-row typeahead opens only when it is the typed address in full.
- The exact rows are narrowed by the typed street type, and the direction is re-checked on the narrowed rows.
- A 10-row typeahead window is not narrowed by direction (ST1).
- A leading unit and a period are cleaned before the parse; the raw key is tried first.
- A letter or dash number lists the lots at the bare numbers on a miss.
- Typed % and _ are escaped (D1). Each of the 10 remaining `!` carries a why-comment (D6).
- No resolution value added. route.ts, address.ts, types.ts and mobile/ unchanged.

## Deviations (recorded in Implementation Notes)
1) the fallback dedupes by parcel_id and caps at 10; 2) the readExact helper (same SQL text); 3) the old :226 `!` became `?? ''`; 4) no fallback or matcher on the raw-first run; 5) T6 is green before and after (a lock with a red plant); 6) case 15's ten rows and case 21's point are real rows (local test stack, read-only, 2026-11-24); 7) the docs-only commit a997f8fb7; 8) system map and rule-lists page regenerated (hooks required them).

## Review round 1 (kept outside the repo folder)
Review round 1: 91 ids, 17 CONFIRMED (1 MED, 15 LOW, 1 NIT), 74 REJECTED; grounder ~/Buildo-scratch/lanes-20261124/BL-SFX1/round1/GROUNDER.md; triage ~/Buildo-scratch/lanes-20261124/BL-SFX1/round1/TRIAGE.md (its FIX-SHA is ddc9e8a24). Round 1 lens files: ~/Buildo-scratch/lanes-20261124/BL-SFX1/round1/repo/.

## Review round 2
- Context: docs/reports/reviews/task-449/context-r4.md. Diff: ff3838a04..HEAD on the Files line, now including 00_system_map.md (9 files, 92,157 bytes).
- 30 outputs, same base names, each beside its in- file, in docs/reports/lanes/2026-11-24/BL-SFX1/: code-review-p1, ux-p1, error-paths-p1, security-p1, compliance step-132 p1-4, surface-136 p1-3, mobile-90, mobile-98, mobile-99 p1-8, five-words, plan-protocol, inc-S p1-2, ms-S, engineering eng-all p1-4.
- FINDINGS.md: 92 ids: 1 BUG HIGH (out-ux-p1#1: the letter and dash list is cut to 10 with no truncation flag; round 1 ruled this point REJECTED as ux-p1#1), 1 BUG MED (out-compliance-ms-S#1), 30 DEFER MED, 57 LOW, 2 NIT. Not ruled by the lane: GROUNDER OWED. Round 2 resolves CRITICAL and HIGH only (RR-0385).

## Status
Task RUNNING, grounder owed. Not closed. Not pushed.
STATUS: blocked (round 2 grounder owed)

Grounder Cairn-Ground-O449, round 2 (re-ruled after the step-132-p3 re-run 4e64e3bc4, the board merge 3b45d5580 and the mobile-99 re-make 5c974f80f): 102 ids over 30 files, 11 CONFIRMED (9 LOW, 2 NIT), all piled, 91 REJECTED, no CRITICAL, HIGH or MED.
