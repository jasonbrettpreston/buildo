# REPORT: BL-R12 (task-327 / R12), Increment 1·B operator rulings applied
Status line (Spec 137 rule 3): BL-R12 lane · task-327 · record-only; one docs commit ce19eab1b on wf2/inc1b-r12 through the real hooks (commit.out: "GATE OK", "POLICY CHECKS OK (commit-msg): 0 file(s)", 16 files); no code, no push, no DB.

## Decisions (G2, scripts/analysis/backlog-decision.mjs; dated note on each named task)
- decision-77 RR-0270, quote "1. once  -approved", cite MORNING-DECISIONS.md:1061; names task-324, task-287, task-332.
- decision-78 RR-0273, quote "this is a shared component", cite MORNING-DECISIONS.md:1066 (the brief said :1065; grep -n finds the quote on :1066, the register cite is :1066); names task-332, task-127, task-324.
- decision-79 RR-0271, quote "2. y", cite :1061; names task-325, task-266, task-265, task-123.
- decision-80 RR-0277 and decision-81 RR-0278 (coordinator addition, cite :1082): SRCH.FUZZY / task-328 and SRCH.METER / task-329. task-328, task-329, SRCH.FUZZY and SRCH.METER are NOT in this worktree (they sit in ~/Buildo-wt-board; `ls backlog/tasks | grep -E '^task-(328|329) '` empty; `task list -m m-1 | grep SRCH.FUZZY|SRCH.METER` empty). So the two decisions were written with no --tasks (no dated note appended) and the DONE edits on task-328 and task-329 were SKIPPED. UNVERIFIED: the board lane must append the dated notes and set both DONE with the decision as final summary.

## Tasks
- task-324 DONE and task-325 DONE, each with the decision as final summary (grep status: DONE).
- New build task: task-332 SRCH.FOOTER (m-1, type build, labels S,plan:SRCH.FOOTER, 6 AC, refs, depends on task-127 only). The predicted id task-328 in my draft was wrong (328-331 belong to the board worktree); the id was read back from the CLI. The CLI refused the full title as a file name (ENAMETOOLONG), so the task was created with a short title and the full brief title set with `task edit -t`; the file name stays short, the title is the brief's exact text.
- MF-44 and MF-46 have no mirrored tasks on the board (grep of backlog/tasks: only task-271, task-324, task-326), so they are named by queue-row reference in the description; MF-91 is the queue row of the task itself.

## Dependency lists (before -> after)
- task-287 LS.12: TASK-123, TASK-285, TASK-264 -> task-123, 285, 264, 332
- task-266 LOAD.1: TASK-123, TASK-265 -> task-123 (--depends-on SETS the list)
- task-265 ST.P1: TASK-259, TASK-82 -> task-82, 259, 266
- task-332: none -> task-127
Scope notes appended to task-266 and task-265 (carry U1-U3 UNVERIFIED from R11). `backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found."

## Queue and id ledger
- ~/Buildo-scratch/ids: `mkdir ~/Buildo-scratch/ids/MF-91` (owner file written); `ls ~/Buildo-scratch/ids | grep '^MF-9'` -> MF-90, MF-91.
- .cursor/MCFRONTEND-QUEUE.md: row `**MF-91 SRCH.FOOTER ... — LATER** (E)` before MF-30, Status: LATER · since 2026-11-19 · expires 2026-11-26 · next: ... · ruling: "1. once  -approved"; two dated notes (:1061, :1066); Next free id MF-91 -> MF-92 with a dated note. 7-day expiry is Spec 137 rule 7 (137_mcqueue.md:112).
- Cites corrected: MF-58 is the row at :438; the web placement note N8 is at :314 (the brief's ":314" is the note).

## Review r1 (r1-review.txt, 31 findings, TRIAGE.md)
KEPT and folded: id read-back, report schema cite report-page.json:1900-1917 (G2-G4 only, no G5 part today), content keys in AC 2, LS.12 wording, task-327 ref #L1066, BL-R11 refs. The rest rejected with opened lines (generator defects, infra freeze).

## UNVERIFIED / not checked
Web search goldens; whether the F01 descriptor needs a footer section; no suite, no run, no DB, no push. The new row's G5 binding: G5 has no schema part in report-page.json today.

## Question (one)
task-332 depends on task-127 (GAP.4, m-3, itself depending on task-123) as the brief orders, which holds the footer until G2's data line exists, though the operator's ruling says the footer is not blocked by data and G2 "stays GAP.4 inside it": should the dependency run the other way (task-127 depends on task-332)?

STATUS: ready
