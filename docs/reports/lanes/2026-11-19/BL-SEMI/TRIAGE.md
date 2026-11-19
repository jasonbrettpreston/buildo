# TRIAGE r1 (plan round, review mode) · BL-SEMI stage 1 · task-319
Source: r1-plan.txt (30 findings). Every finding KEPT or REJECTED with the opened line. Most findings are on the generated context pack, not on the stage-1 plan; those are REJECTED here (out of stage scope) and relayed to the orchestrator as generator defects.

| r1-plan.txt line | Finding | Verdict | Reason and evidence |
|---|---|---|---|
| 14 | "undefined" quote tokens in Storage set-up | REJECTED (generator, not this plan) | The pack is generated; the defect is in the generator (BL-ROUTE already reported it, BL-METER REPORT.md "Context pack ENOENT"). Mock needs no storage text (D.8 not drawn, RR-0264, MORNING-DECISIONS.md:1041). Relayed. |
| 16 | three Documents bullets ENOENT | REJECTED (generator) | Same defect already reported (BL-METER REPORT.md last bullet). doc-2 was read directly from the worktree: backlog/docs/increments/doc-2 - Increment-S-requirements.md lines 67-73. |
| 18 | errata count wrong | REJECTED (generator) | Not a stage-1 artifact; relayed. |
| 20 | D.9/D.10 dropped without a ruling | REJECTED | The ruling exists: RR-0264, operator "1 y", MORNING-DECISIONS.md:1041-1043, and the task's own dated note (Scope now: page, mock and link only in 1·B). |
| 22 | RR-0174 vs RR-0176 loading ruling both shown | REJECTED | The mock draws no 35 s loading screen; D.7 loading is the built "Searching" state (content key state.loading). Superseded text is flagged SUPERSEDED in the pack itself (BRIEF.md CONTEXT, lines 219-222). |
| 24 | brief front-matter, prereg and write_scope not in bundle | REJECTED | Stage 1 writes no code and no MF build; the brief (BRIEF.md "Write scope") declares the scope and the claim was taken (lanes.mjs claim, ok:true). Pre-registration belongs to stage 2 (AC #1 binds the build). |
| 26 | ACs #2/#5/#6/#7 unsatisfiable at stage 1 | REJECTED (partly noted) | The task ACs are generator-fixed and bind stage 2; stage 1 is design only (BRIEF.md line 4). The task is left WAITS, not closed, so no AC is checked now. |
| 28 | Lock icon and Back control undecided inside a "no new element" plan; tokens "ad hoc" | KEPT in part | KEPT: the mock draws only the v8 forms (chevron back, info banner) and lists the built alternatives (X icon, Lock icon) as questions Q1 and Q2 for the operator, neither drawn as a decision. REJECTED part: the tokens are v8 tokens, defined at small-pages-v8/choose-lot.html:42-43 (--s-outer-b, --btn-b, --field-b). |
| 30 | template inputs empty, disclaims lenses | REJECTED | The review template is fixed by the brief (BRIEF.md "REVIEW"); one round only (rule 12). |
| 32 | generator and mock location, hash, --check | KEPT in part | KEPT: the mock sha256 and the generator path are recorded in REPORT.md, and the mock is committed in docs/reports/lanes/2026-11-19/BL-SEMI/ so it can be re-derived. REJECTED: a --check mode for a one-off design mock (no scope creep, PLAN-PROTOCOL.md:3). |
| 34 | D.8, D.11 not in the table | KEPT | Added a "Rows not drawn, with the reason" paragraph under the element table in the context file (D.8, D.9, D.10, D.11), and the mock design note repeats it. |
| 36 | storage field schema proposal | REJECTED | D.8/D.9 storage is out of stage by RR-0264 (MORNING-DECISIONS.md:1041-1043). |
| 38 | storage block carries dead loading semantics | REJECTED | Same as line 22; mock does not draw it. |
| 40, 42, 44, 46 | decisions list duplicates, entity types, line order | REJECTED (generator) | Pack hygiene, not this plan. Relayed. |
| 48 | "1 y" is a glyph fragment | REJECTED | It is the operator's verbatim answer on a numbered question (MORNING-DECISIONS.md:1041-1043); recorded as a dated note on the task. |
| 50 | WAITS contradicts RR-0154 "nothing waits idle" | REJECTED | The brief orders status WAITS with Grounded and Recommendation lines (BRIEF.md line 12; RR-0232 :925-929); work moves to the next task by the orchestrator. |
| 52, 54 | unpinned references; local username in paths | REJECTED (generator) | Paths in the pack are generated; relayed (rule 8 concern for the orchestrator). The lane's own files use ~ paths. |
| 56 | queue row for SRCH.SEMI not quoted | REJECTED | Stage 1 builds nothing in McFrontend (AC #8 binds stage 2); the row needed is named in DELTA.md. |
| 58, 60, 62, 66, 68, 70, 72, 74 | doc-2 counts, vocab, dependency note, hashes, duplicate keys, wording, truncation, artifact link | REJECTED | Pack and doc-2 hygiene, not on the stage-1 plan. Dependency note (task-318 mis-typed address OPERATOR item) is another task's. |
| 64 | built page never device-checked | KEPT | Added to the context-file paragraph and to REPORT.md UNVERIFIED and DELTA.md: the built look has no device run (doc-2 F-SEARCH-MOBILE), so the mock approval is on the design, not on device pixels. |

Folded: context-file table line cites corrected against SemiQuestionBinding.tsx (header :29-44, errorNotices :46-69, cards :71-87, continueButton :89-100, body :102-117) and semiQuestion.ts:48; the not-drawn paragraph added.
