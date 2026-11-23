# Seat: integration: task-446 plan (PLAN-446-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head eb7aad381. Read: .husky/pre-commit and commit-msg wiring, scripts/hooks/check-task-files.mjs, validate-commit-msg.sh, check-spec-diff.mjs, scripts/analysis/mcbylaws/ (cite-arms.mjs, cite-parse.mjs, panel.mjs, mcbylaws-queue-check.mjs idLedgerErrors, paths), mcbylaws/protected-paths.json, ~/Buildo-scratch/ids (README.md, check.mjs whole, ledger owners), .cursor/MCFRONTEND-QUEUE.md (:5, :246, :648-652), src/tests/surfaces/mcfrontend-queue.infra.test.ts, Spec 137 (:77, :98, :100, :125, :136, :158), commits 62b2ffed6 and d429b287d (message, files, diffs), task-439, task-445, task-388, task-430, task-434, task-367 files, the unlanded branches wf1/inc1b-mfrules, wf1/inc1b-sec445, wf1/inc1b-hb430. Ran `node scripts/analysis/rule-lists.mjs resolve --files "<the plan's Files line>"`, which exits 0 and resolves surface-136, 126, 127, 128, 135, so the Files line resolves at launch. Verified (no finding): the Files line covers everything commits 0 and 1 stage (test, 135, 136, rule map JSON, queue, panels dir, rule-lists page, prereg path, system map; task file, review dir and lanes are always allowed, check-task-files.mjs header). None of the nine entries is unneeded. Plan sentences on cite-arms.mjs:9 (prereg read from the PARENT tree), arm C refusing OWED FE ids in a message, the panel record read in the commit's own tree (panel.mjs:29-35), protected-paths (135, queue, panels protected; scripts/surfaces/** and src/tests/surfaces/** frontend; bylaw-validation/** layer23 and coa-expected/** protected) all match the code.

FINDINGS:

in#1 MED. A single `--lane` cannot cover a push range that carries two lanes' ids.
- Plan: "The orchestrator, before the push: `node ~/Buildo-scratch/ids/check.mjs ~/Buildo-wt-board --lane <lane>`. The FE row, MF-96 and round 201 are claimed by this lane. The full push range also carries task-430's ids (section 9)."
- Evidence: check.mjs:150-153: `const names = [branch, args.lane].filter(Boolean)` and `else if (!names.some((n) => text.includes(n))) verdict = 'FAIL owner-is-another-lane'`. Base is origin/wf1/mb-rulings; the plan itself reports d429b287d is not on it, so the range introduces FE-46..FE-57 (owner text "BL-HB430 wf1/inc1b-hb430 ...", e.g. ids/FE-46/owner), MF-95 and round-200 (owner BL-HB430). The branch name is wf2/board, which appears in none of those owner files. With `--lane <446 lane>` all of task-430's ids FAIL; with `--lane BL-HB430` task-446's ids FAIL unless their owners also name BL-HB430. FE-45 is safe (it is in the base text, `inBase`).
- What goes wrong: `check.mjs` exits 1 and the orchestrator will not issue the push command (README: "exit 1 ... no push command"). The plan notes the shared range only as a task-430 issue.
- Smallest fix: state it in the landing steps: either run check.mjs twice (once per lane) and accept each run's other-lane failures as known, or put the push branch name (wf2/board) in the owner files of all introduced ids, or push task-430 first.

in#2 LOW. The ledger edit the plan prescribes breaks the ledger's own rule.
- Plan: "the orchestrator therefore adds task-446's lane to FE-58/owner".
- Evidence: ~/Buildo-scratch/ids/README.md: "Claim = atomic mkdir ... Never write into another lane's claim." ids/FE-58/owner is BL-HB430's.
- What goes wrong: the plan rewrites another lane's claim file.
- Smallest fix: have BL-HB430 release FE-58 (it is dead, per the plan's Q1) and claim it afresh for task-446, or let the orchestrator write a new FE-58 owner file recording the hand-over.

in#3 LOW. The FE-59 claim recreates the ledger drift the plan names.
- Plan: "claims FE-59 for the renumber case" and "Spec 137 §5 item 7 (137:158) wants each 'next free id' to be greater than every claimed id. Today FE-58 is both claimed and 'next' (a drift); after this task it reads FE-59."
- Evidence: Spec 137:158 "each 'next free id' number is greater than every claimed id of its kind"; the plan sets Next free id to FE-59 and also claims FE-59.
- What goes wrong: the Spec 137 snapshot check reports the same drift for FE-59.
- Fix: do not claim FE-59 until a renumber is actually needed, or write Next free id FE-60.

in#4 MED. The MF-96 status word in commit 1 is undecided, and two rules pull against each other.
- Plan: "6. Edit the MF-96 status line in the same commit (137:98; see Q5)" and "Close. Lane records and the task file only, in a separate closing commit (137:100, :136)".
- Evidence: Spec 137:136 refuses a closing commit that stages a path other than "the lane's report directory, the task's review context directory, task files and decision records", so the queue row cannot move at close. arm Q (mcbylaws-queue-check.mjs, Q3, "every DONE heading must carry MF-nn@<hex>") means a DONE heading needs the commit sha, which cannot be known inside commit 1. The MF-95 precedent (queue :648-649) still reads RUNNING after BUILT.
- What goes wrong: commit 1 can only say RUNNING, so Rule 3 ("changes in the same commit as the work") is met with a word that stays wrong, and the row's "expires" date lapses. The plan hands this to the grounder (Q5) without a default.
- Fix: state the default in the plan: keep RUNNING, with `next: closing commit (task file BUILT)`, and let the orchestrator's board-edit commit move it to DONE with the MF-96@sha stamp.

in#5 MED. The plan narrows the card from three rules to one but lands under the card's wording.
- Plan: section 0 "This task adds ONE row and ONE line, for R-22. R-03 and R-04 are dropped as duplicates"; Q4 recommends "shown with the line text".
- Evidence: the card Description still says "one handbook line ... for each of the three" and the title and filename say "R-22, R-03 and R-04"; DoD #8 "Nothing was added that the card or ruling did not name". RR-0385 item 4(ii), MORNING-DECISIONS.md:1920, says the work comes to him when "an earlier answer of his ... rests on a wrong fact". The plan itself says his question "rested on a fact that is no longer true". The commit trailer `Operator-Ruling: RR-0395 ... "Agreed. Plan approved"` will be quoted for a one-rule task.
- What goes wrong: the trailer and queue row would claim an approval that covered three rules for work that covers one, with the operator's sight of the change left to "alongside the line text".
- Fix: amend the card (title, Description, DoD) to the one-rule scope in the same step the operator is shown the text, and make his reply to the line text a launch condition; keep the "UNVERIFIED by me" fact in the dated note.

in#6 LOW. Overlap with other open tasks is wider than the plan names, but only task-388 is a real conflict.
- Plan names task-445, task-388, task-439, task-430.
- Evidence: task-376, 384, 387 and 406 also list 135, 136, the rule map, the page or the system map in Files and read RUNNING, but `git log --grep "Task: task-3xx"` finds their commits on wf2/board (stale statuses, no conflict). wf1/inc1b-mfrules (task-388) is the unlanded one and is based pre-430 (it reads "Next free id: FE-46"); it changes 135, 136, queue and prereg-MF-94-1.json. Its merge with this task conflicts on 135:17 and queue :5 and needs a regenerate, not a text merge.
- What goes wrong: nothing for this plan; the renumber note in section 5 already covers the 135 conflict.
- Fix: add "task-376, 384, 387, 406 are landed on the board" in section 7, and say 136 and the rule map are regenerated, never merged.

in#7 LOW. task-445 and the page: the second lander is blocked until `page --write` is re-run.
- Plan: "If 445 changes the page output of rule-lists.mjs, the second lander re-runs `page --write`. UNVERIFIED whether 445 changes the page."
- Evidence: .husky/pre-commit runs `node scripts/analysis/rule-lists.mjs page --check` on every commit; task-445 Files include scripts/analysis/rule-lists.mjs.
- What goes wrong: if 445 lands first and changes the page, commit 1 of this task is refused by the hook until regenerated. Not a defect, a planning note.
- Fix: put `page --check` as the first command of commit 1 step 4, not only `--write`.

in#8 LOW. Queue heading constraints are not in the plan.
- Plan: Title "MF-96 FINAL.9: one McFrontend handbook line for Spec 128 R-22 (React Native has no Server Components)", placed under Phase 2.
- Evidence: mcfrontend-queue.infra.test.ts:46-49 treats a heading as an admin task when the word "admin" appears outside parentheses (whole heading line); `idLedgerErrors` (mcbylaws-queue-check.mjs:289-314) fails `id-unclaimed` unless the heading number is below the first `Next free id: **MF-nn**` in the same file, so "Next free id: **MF-97**" must be the FIRST match (line 5), in the same commit as the heading. statusWordErrors needs exactly one status word after the first " - " or " — ".
- What goes wrong: nothing with the drafted title; a lane that edits the title or moves the note below another "Next free id" quote would be refused.
- Fix: add one sentence: no "admin" outside parentheses, one status word after the em dash, first `Next free id` match moved.

in#9 LOW. Commit subjects are not specified.
- Plan: gives trailers only.
- Evidence: validate-commit-msg.sh requires `type(NN_spec_name): description` with a 2-3 digit spec id (precedent: `docs(135_mcfrontend_decisions_register): ...`, `feat(136_mcfrontend_handbook): ...`, `feat(135_...)`).
- What goes wrong: a lane free-forming the subject is refused at commit-msg.
- Fix: name the two subjects, for example `docs(135_mcfrontend_decisions_register): MF-96 queue row, prereg and panel record` and `feat(135_mcfrontend_decisions_register): one OWED register row for Spec 128 R-22, Spec 136 regenerated`; check each for no FE-nn token.

in#10 LOW. The tests' red proof and typecheck.
- Plan: T1 snippet `citing = (rs, cite) => rs.filter(r => r.headline.includes(cite))`.
- Evidence: pre-commit runs `npm run typecheck`; the test file annotates every parameter (`(r: Row)`), and `noUncheckedIndexedAccess` is in force (`ids[0]!`).
- What goes wrong: implicit-any parameters fail typecheck at commit.
- Fix: write `(rs: Row[], cite: string)`.

UNVERIFIED:
- That the copied expected totals of prereg-MF-95-1.json still equal the current measured COA totals (coa-scorecard.mjs:551 reads the newest prereg; no hook runs it). Likely unchanged (documents only).
- That the gate accepts commit 0 (prereg under layer23 and protected, McFrontend trailer only): precedent 62b2ffed6 passed.
- Whether task-445 changes the page.
