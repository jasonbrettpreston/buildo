# TRIAGE: BL-R12 review r1 (review mode, plan template; r1-review.txt, 31 findings)
Opened lines are in the repo worktree ~/Buildo-wt-r12 (wf2/inc1b-r12) and MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

KEEP (folded)
1. HIGH predicted task-328 / decision-77..79 ids: KEEP. The task id is read back from the CLI and the decision ids from the G2 output; the text files carry placeholders (NEWTASK, DEC-A..C) until then. Opened: plan.txt step 2-3.
2. HIGH report footer render path and G5 (two findings): KEEP in part. Opened scripts/surfaces/_schema/report-page.json:1900-1917: the report footer is a schema section with parts G2, G3, G4 (no G5 link part); rendered by src/components/report/ReportPage.tsx:319-323. So the F01 premise of the finding is wrong (F01 is the search surface), but G5 has no part today. Folded: the task description names the schema cite and says G5 is what the shared component adds for the report (the ruling names G3-G5, MD:1066, RR-0273).
3. HIGH content keys for the five search items: KEEP. Opened static-page.json:52-75 (no copyright part) and F16 web_login.content.json:61. Folded: AC 2 says the content keys are added to the F01 search content file.
4. HIGH "1.C holds no footer item" vs LS.12 depends on it: KEEP the wording point. Folded: "no footer build item in m-2; LS.12 (task-287) only depends on the footer task".
5. MEDIUM #L1065 reference on task-327: KEEP. Opened MD:1066 (grep -n finds the quote on 1066). Folded: task-327 reference corrected to #L1066 with --remove-ref/--add-ref.
6. NIT BL-R11 report and triage not listed as inputs: KEEP. Folded: --add-ref docs/reports/lanes/2026-11-19/BL-R11/REPORT.md and TRIAGE.md on the new task.
7. HIGH ordering of the mutations: already ordered in the plan (create task, claim id, G2, DONE, edits, doctor, commit); no further change. The "before" lists are printed in REPORT.md.

REJECT
8. CRITICAL ENOENT blocks / doc quotes unread; MEDIUM generator noise, stale 35 s lines, "undefined" quotes, Decisions-in-force noise: REJECT. Generator defects already rejected in BL-R11 TRIAGE and reported there; infra freeze (memory infra-freeze-project-first). The facts this lane records were read directly: doc-4 :94-96, :121 opened.
9. CRITICAL antecedent list for "1. once -approved 2. y": REJECT. Opened MD:1040-1041 (the three OPERATOR items) and MD:1062-1063 (Ruling 1 task-324, Ruling 2 task-325 in the operator-answer record), which is the mapping RR-0270/RR-0271 carry.
10. HIGH task-127 dependency reversed against AC 4: REJECT as a finding on this lane, FLAGGED in REPORT.md as the one question. The brief orders it ("its dependencies include GAP.4 task-127 (for G2)", BRIEF.md:9); not changed here.
11. HIGH decision/RR numbering and RR-0272 skipped: REJECT. Opened rulings-register RR-0270, RR-0271, RR-0273 (quote and cite fields); G2 allocates the decision ids and its output is used (see KEEP 1).
12. HIGH two compute paths for one lot (LOAD.1 vs ST.P1): REJECT. Not new design: task-325 description item (4) "a re-open recomputes in 1.B" and "the stale-stamp read guard" are deferred to ST.P1 by the ruling "2. y" (MD:1063).
13. HIGH id allocation half-atomic: REJECT. mkdir of ~/Buildo-scratch/ids/MF-91 succeeded (ls pasted in REPORT.md); the ledger is the one Spec 137 section 2 names (137_mcqueue.md:46); the line bump is in the same commit; ids/check.mjs judges at push.
14. HIGH Dependencies "(none)" in the context file: REJECT. The context file is a G1 snapshot of task-327; the edits are the subject of the plan.
15. MEDIUM MF-58 / N8 note for the removed web line: REJECT. Nothing is removed in this commit; the MF-91 row note carries the placement change; the brief names one row and the Next free id bump.
16. MEDIUM ownership lane E vs BL-R12; expiry basis; comp label; short title; MF-44/46 board deps; plan id; before lists: REJECT. Lane E is the queue lane, BL-R12 the ledger recorder (MF-90/owner form); expiry is 7 days, Spec 137 rule 7 (137_mcqueue.md:112); neighbour task-319 carries no comp label; the title is the brief's exact text; MF-44/MF-46 have no mirrored tasks (grep, in the description); plan lock not applicable to a record lane.
17. NIT double space in the quote: REJECT. G2 compares with norm() (backlog-decision.mjs:34, whitespace normalised); the quote is verbatim.
18. NIT "push 12": REJECT. Opened task-325 description ("landingPush: push 12 with MB-38 (L.11)", task-265 text).
