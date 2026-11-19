# TRIAGE r1 (BL-R10, task-316): review output r1-review.txt, 29 findings (4 CRITICAL, 12 HIGH, 8 MEDIUM, 3 LOW, 2 NIT) on docs/reports/reviews/task-316/context-2026-11-19.md
Line numbers below are the reviewer's (file as rendered); the opened line is the repo file I checked.

| # | Finding (short) | Verdict | Opened line / action |
|---|---|---|---|
| C1 | doc-2, Elements, doc-16 blocks ENOENT in the context pack | KEEP (defect in the generator, not in the plan) | context-2026-11-19.md:164,166,168 "not readable: ENOENT"; the files exist in this worktree (backlog/docs/increments/doc-2 - ...md, backlog/docs/doc-16 - ...md). I read both directly; generator defect raised as a draft task. |
| C2 | four cites render "undefined" | KEEP (generator) | context-2026-11-19.md:123,124 end with "undefined"; the same text is in the m-1 milestone Storage set-up (existing lines kept per the brief; Problems section names it); same draft task |
| C3 | RR-0174 vs RR-0176 both shown in force; Storage set-up still says 35 s / LOAD.3 | KEEP | backlog/decisions/decision-43 "Supersedes: RR-0174"; m-1 Rulings section marks RR-0176 as superseding RR-0174 inline, Problems names the stale Storage set-up lines (text kept) |
| C4 | LOAD.1 (m-1) depends on ST.P1 (m-13): sever it | REJECT the sever, KEEP the finding | task-266 description "the compute is the producer ST.P1"; storage-policy planNote "dependsOn 1.3,ST.P1 (needs the producer)"; without the producer LOAD.1 has nothing to start. task-265 line 39 "landingPush: push 12 with MB-38 (L.11)" and line 36 "ships at push 12": the ordering question (1·B finishes only when the producer lands) is a timeframe/priority call: OPERATOR task created with Grounded and Recommendation |
| H1 | Dependencies (none) in the pack | KEEP (generator) | context-2026-11-19.md:177-178; same draft |
| H2 | Decisions naming this task (none); unfiltered decision dump | KEEP (generator) | context-2026-11-19.md:170-171; my Decisions section is filtered by "Groups:" and "Tasks named:" lines of backlog/decisions (28 files); same draft |
| H3 | Documents (none) vs milestone documents | KEEP (generator) | context-2026-11-19.md:23 vs 156; same draft |
| H4 | 12 KB truncation without notice | KEEP (generator) | same draft |
| H5 | Field map pointer dangles | KEEP | field map appended to the context file and carried in REPORT.md and the task notes (65 doc-2 rows) |
| H6 | semi placeholder closed twice | REJECT as contradiction, KEEP the boundary request | AC1 allows present OR OPERATOR; the sources place the page on the search flow (RR-0182, RR-0184; doc-2 rows D.1-D.7 BUILT), so SRCH.SEMI is the placeholder; its scope split is a different question (owner-input store) with its own OPERATOR task; the recommended boundary is recorded as a dated note on SRCH.SEMI and on the OPERATOR task |
| H7 | three UNVERIFIED in a verification task | KEEP | A.4: fe-built/BUILT.md:55 "parseFreeTextAddress has no direction guard" and src/lib/parcels/address.ts:39 "Directional suffixes (N, S, E, W) are stripped": doc-2 Elements row (NOT-BUILT) is right, the search-delta current table row (AVAILABLE) is stale: resolved; ST.P1 question: OPERATOR task; task-209 "see board": deps written out in REPORT |
| H8 | RR-0144/0145 no owning task | KEEP | grep "90 days|purge" backlog/tasks: task-291 ST.P4 (m-13) owns RR-0144; grep "background|stamp moves|TRK-1" backlog/tasks: no hit: RR-0145 has no task: draft task created in m-13 |
| H9 | MF-44/MF-46 DONE with E.2 NOT BUILT: correct the rows | REJECT the row edit, KEEP the gap | MCFRONTEND-QUEUE.md:310 (MF-44 web search pair under the (maxbld) layout) and :319 (MF-46 front door, landing footer) do not name the search-page footer: the E.2 deliverer attribution is the plan's reading (UNVERIFIED), not a false DONE; OPERATOR task for placement |
| H10 | promote has no rollback / --check | REJECT mostly, KEEP the check | git is the rollback (nothing committed until the end); dependency ids are taken from the promote output, then `backlog doctor` and a diff are run |
| H11 | add-ref coverage rule undefined | KEEP | matching key: the record names the task's plan id (grep -l of the plan id over the lane records); the mapping table is in REPORT.md |
| H12 | paths with spaces / home-relative | KEEP (generator) | same draft |
| M1 | 7 names, 8 tasks | REJECT | task-316 description counts the dropped LOAD.3; REPORT states 7 live + 1 dropped |
| M2 | specs omitted silently | KEEP (generator) | same draft |
| M3 | author reviews own plan | REJECT | the review tool is DeepSeek through scripts/deepseek-review.js; one round by the brief (Spec 08 rule 12) |
| M4 | write contention, ID ledger | REJECT | this pass writes no MF row and claims no id; ~/Buildo-scratch/ids has MF-90 as the last MF claim (queue line 5 "Next free id: MF-91"); follow-up rows stay with the build lane |
| M5 | SRCH.DAYLIGHT bundles restyle with removals | KEEP | removals become separate acceptance lines with a per-id "no remaining reference" check |
| M6 | PROOF.S waits for everything | REJECT | AUDIT.md:159 "each PROOF.n waits for the slice's C-n check task, the slice's content tasks, ... and PROOF.TOOL"; RR-0154 is served: the OPERATOR question goes to the answer page and mock/page work continues |
| M7 | A.4 conflict left | KEEP | resolved under H7 |
| M8 | all-milestones draft is scope creep | KEEP the clarification | the draft proposes the section form only; only m-1 is populated |
| L1 | unbalanced parentheses in headings | KEEP (generator) | same draft |
| L2 | decision list unordered | KEEP (generator) | same draft; my Decisions list is in id order |
| L3 | label understates write scope | REJECT | the plan and the commit message state the board edits |
| N1 | no plan id | REJECT | task-316 is a card without a plan id (G1 ticket line 1 "no plan id") |
| N2 | template axes vs AC | REJECT | review format is the repo template |

KEPT items folded: field map appended to the context; milestone Rulings/Problems wording; SRCH.DAYLIGHT acceptance lines; OPERATOR task for ST.P1 timing; draft for RR-0145; draft for the generator defects.
