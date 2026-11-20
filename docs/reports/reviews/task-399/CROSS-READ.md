CROSS-READ.md, second pass (Spec 08 section 11.2 pairwise cross-read) on PLAN-399-v2.md and PLAN-375-v2.md, board wf2/board c15fab7ec. Read-only. Nothing re-executed that the claim-checker owns. Reads: both plans twice, GROUNDER-PLANS.md, Spec 08 5.3 / 6.4 / 7 / 11, Spec 137 Rules 2, 3 and notes, check-lane-close.mjs, backlog-lane.mjs, backlog-brief.mjs, board-commit.zsh, tasks 399 / 375 / 400 / 401 / 402 / 403 as they stand, MORNING-DECISIONS.md :1440 to end.

COUNTS: 29 items. HIGH 3, MED 20, LOW 6. OPERATOR 2. Plus 4 "presented as his" and 9 "decided, not asked".

======================================================================
HIGH
======================================================================

xr#1 HIGH. The task text the lane reads at launch holds BOTH the operator-approved FINAL BUILD NOTE and v2, and they differ.
 A: PLAN-399-v2 section 2: "the plan is this text, written by the orchestrator into the task (backlog task edit task-399 --plan, --ac, --notes)"; PLAN-375-v2 D1: "The plan IS the task text (Description, Acceptance Criteria, Implementation Plan, Implementation Notes); the lane does not plan."
 B: task-399 Implementation Notes (approved at MORNING-DECISIONS.md "approved", item 0, files NOTE-399.md / NOTE-375.md by sha256): "where it differs from earlier text of this task, this note governs". It says "Files line (unchanged): ... No other file", a Bulk form, wontfix:"<60+ characters>", "The close is refused naming every id with no line or with two lines", "A CONFLICT id takes only task: or ruling:", a Final Summary ending "; not reviewed (exempt): <k> paths", acceptance (b) "35 CONFIRMED lines". v2 says: five files on the line, bulk form deleted, 30 characters, "THE LAST LINE FOR AN ID WINS", CONFLICT takes "ruling: or fixed: only", no "k" clause, "36 CONFIRMED". The task-399 Description (scope 1 and 2) still describes the bulk form and 60-character reason. For 375 the approved note says "ONE more section", A.5 close both-phases, B.2 check-tasks printer plus close refusal, "no shim (RR-0328)"; v2 says two sections, deletes A5 and B2 (this one v2 does say), builds --refs-only, and deletes the "no shim" sentence.
 Why both cannot hold: if --notes REPLACES, the operator-approved text is destroyed (Spec 137 Rule 10 and the M-246 form: "the prior row text is kept"); if it appends or the Description is left, the lane gets a task text where the approved note says "this note governs" over v2. The hash of 375 D3 would also cover the contradiction.
 Resolves: append v2 as ONE dated note (M-246, prior text kept) that lists, sentence by sentence, each approved sentence it replaces and why (his :1580 "add these items to the existing tasks" and :1590 "do a second pass on the recommendations"), states "this note governs the FINAL BUILD NOTE where they differ", never use --notes replace, and rewrite the Description scope lines and the Files line in the same step so no line says bulk or 60. Support: 137_mcqueue.md Rule 10 (:125) and the M-246 form; the approved note's own governs-sentence.

xr#2 HIGH. Plan-mode outcome forms: 375 refuses its own grounder file if outcomeErrors is built as 399 words it.
 A: PLAN-399-v2 4.1: "CRITICAL, HIGH and MED close by fixed: or ruling: (or task: when DEFER)". PLAN-375-v2 D1: TRIAGE-PLAN.md "in PLAN-399-v2's forms and limits (fixed, task, ruling, wontfix, pile) with ONE added form ... folded", and in the same sentence "plan-time fixed: cannot work".
 B: GROUNDER-PLANS.md itself: 10 HIGH and 77 MED are "FOLDED", which is only the folded: form.
 Why both cannot hold: taken literally, mode 'plan' lists fixed as a form that cannot be satisfied and never says folded: counts as a closing form for MED, HIGH, CRITICAL, so the 77 MED folds are refused; and the round block in D4 counts "<a> folded" but 399 4.2 counts "<a> fixed". A9 (the gate on a real LATER task) stops.
 Resolves: say in the outcomeErrors contract (399, mode parameter) and in 375 D1: in mode 'plan' the forms are folded, task, ruling, wontfix, pile; folded: closes CRITICAL, HIGH and MED in the place of fixed:; fixed: is refused in plan mode; add the mode table to the 399 tests so the 375 lane inherits it. Support: Spec 08 5.3 (rejections with reasons) / 11.2 (the fold is the outcome of a plan finding).

xr#3 HIGH. 399 cannot satisfy its own acceptance (b), and 399 may not be marked BUILT without it.
 A: PLAN-399-v2 7(b): "After the orchestrator writes the missing lines (honestly: fixed, task for DEFER, pile for LOW or NIT) it exits 0 with 'checked 48 ids'." and 7(e): "Do not mark BUILT until (a) to (d) are pasted on the task (:1517)."
 B: PLAN-399-v2 7(b) itself: of the 48 ids, "3 are task: on a CRITICAL or HIGH BUG, 1 is a wontfix on an effective severity above LOW". 4.1: a CRITICAL/HIGH/MED BUG closes only by fixed: or ruling:.
 Why both cannot hold: the three refused lines can become honest only by real fix commits to task-410's code (check-lane-close.mjs and rule-lists.mjs, protected paths, outside 399's Files line and after the fold) or by operator rulings; the wontfix needs a fix or a ruling. A lane cannot paste exit 0, so the rule of :1517 holds 399 at RUNNING for ever.
 Resolves: 7(b) pastes exit 1, "checked 48 ids" and the measured counts, plus the passing control from the planted-defect suite; the exit-0 half becomes an orchestrator records step for task-410 (opened as a card, outside 399's acceptance). Support: Spec 137 Rule 2 (a unit of work has its own row) and the 399 NOT-IN-SCOPE line "judging that a fix fixes".

======================================================================
MED
======================================================================

xr#4 MED. Who tells the lane "do not re-plan".
 A: PLAN-399-v2 2: "The brief tells the lane: the plan is the task text at launch and was checked; do not re-plan." and 3 Files line (no backlog-brief.mjs).
 B: PLAN-399-v2 NOT-IN-SCOPE / plan-plan-review-deepseek-399#2 ruling: "the brief edit is task-375's A1"; backlog-brief.mjs:166 today: "2. backlog task edit task-N --plan ..." and Close line "--final-summary ... -s DONE|BUILT".
 Why both cannot hold: 399 and 375 are both launched with the OLD brief (375's own lane gets the old brief too: it edits backlog-brief.mjs in its own lane). The old brief tells both lanes to overwrite the folded plan with --plan and to close without the round block. Adding words to the Agent call is the "hand-written brief" the operator rejected (run-mclane: "No hand-written briefs"; RR-0242, MORNING-DECISIONS.md ~:953).
 Resolves: move the two brief lines (Take-order line :166 and Close line :171) and backlog-brief.logic.test.ts:58 into 399's Files line and commit (399 defines the block text anyway); 375 A1 keeps only the two new sections. Re-measure the 399 list count.

xr#5 MED. LOW and NIT forms: two sentences in 399 disagree.
 A: 4.1 "LOW and NIT by any form". B: 4.1 "task:task-N ... Allowed only when the finding's lens line begins DEFER (rule 6: a BUG is fixed before Green Light)"; pile and wontfix are allowed on a LOW BUG.
 Why both cannot hold: a LOW BUG may be filed by pile: (a deferral) but not by task: (a deferral to a named card, which is what approved item 1 says to do "until then"). Rule 6 is cited to bar task: but is not applied to pile or wontfix.
 Resolves: the DEFER-only limit on task: applies to CRITICAL, HIGH, MED; LOW and NIT take task:, pile or wontfix whatever their kind, because his later words :1580 "the findings that are deemed low priorities are filed in a review pile for later" override rule 6 (08_agents.md:350) for LOW; say so in the dated note.

xr#6 MED. 375 A5 reads the context files from three different places in one sentence.
 A: PLAN-375-v2 A5: "check() lists docs/reports/reviews/<id>/ at HEAD ... and passes the texts into closeErrors' input as readBase is".
 B: check-lane-close.mjs: readBase reads the RANGE BASE (git show <merge-base>:path, line ~370), the lane files are read from the INDEX (ls-files --cached, git show :f, line ~371), and 137_mcqueue.md note / check line ~425 let the closing commit stage docs/reports/reviews/<id>/ (the review context directory).
 Why both cannot hold: HEAD misses a context staged in the closing commit; the range base misses every context the lane committed after launch (all of them). Either reading refuses a good close.
 Resolves: read docs/reports/reviews/<id>/ from the index first, HEAD second (the order readRepo uses, line ~368); drop "as readBase is".

xr#7 MED. Name of the context file.
 A: PLAN-375-v2 A3: "passes --context <the committed context file>"; the brief and launch script today name context-<date>.md (backlog-brief.mjs:46, backlog-lane.mjs:159; run-mclane audit: "context-<date>.md present"). B: A5 "context-rN.md ... N = files already there + 1" (files of what? the folder also holds plan evidence and GROUNDER-PLANS.md).
 Why both cannot hold: at launch N is unknown, so the printed lens line cannot name a round file; "files already there" counts every file of the folder.
 Resolves: N = 1 + the number of context-r*.md files present; the lens line printed by the launch names context-r1.md written by the brief at launch (the date name is retired and the audit line updated in the same commit); later rounds are written by the lane before it runs the round.

xr#8 MED. A clean lane cannot close.
 A: PLAN-375-v2 B2: "the close refuses when one [REPORT.md, GROUNDER.md, TRIAGE.md reference] is missing". B: PLAN-399-v2 6: "a lane with zero CONFIRMED ids and no TRIAGE.md (passes, prints 'checked 0 ids')"; 08_agents.md:357 note: "its TRIAGE.md ... when they exist".
 Resolves: B2 requires the TRIAGE.md reference only when the lane directory holds a TRIAGE.md ("when they exist", 08_agents.md:357).

xr#9 MED. Refusal on the board job's commit: 399 adopts it, 375 rejects it for the same reason.
 A: PLAN-399-v2 1: "The check runs on every commit that moves a task to a finished status, whoever makes it (... the board job's commit included), so it binds the orchestrator too" and 5: BUILT to DONE "already refused TODAY". B: PLAN-375-v2 D0: rejected "a refusal in the board commit (the board job warns and leaves every pending backlog edit in the tree on a hook failure, scripts/board/board-commit.zsh, so one refused task would hold all)".
 Why both cannot hold: after 399 all 31 BUILT lane tasks lack a TRIAGE.md, so one orchestrator edit BUILT to DONE is refused by the new check and the job then holds EVERY pending board edit every ten minutes (board-commit.zsh: "a failing hook is a WARN line ... edits stay in the tree"). Also a fold by merge skips the check altogether (check-lane-close.mjs: MERGE_HEAD returns 0), so "binds the orchestrator too" is only true for hooked commits.
 Resolves: 399 section 1 and 5 say: the orchestrator sets no finished status through the board edit until operator item P2 (BUILT to DONE) is answered; the finished status is set only by a lane's closing commit; "binds the orchestrator" is limited to hooked commits (fold by merge is task-401 / 402).

xr#10 MED. Running lanes do not meet the new check.
 A: PLAN-399-v2 5: "Running lanes (35 RUNNING ...): the check meets them at their own close, with the same rule" and "The four audited tasks ... each closes only with its own TRIAGE.md". B: .husky/commit-msg:7 runs node scripts/hooks/check-lane-close.mjs relative to the lane's own worktree (152 worktrees); 08_agents.md:239 note (2): what runs is the lane's own copy of the script.
 Resolves: say that a lane launched before the fold meets the new refusals only if its branch has merged the board; for 396, 407, 406, 387 the orchestrator merges the board into each branch first, or the 52 unaddressed findings are not enforced.

xr#11 MED. "operator item N" means three things.
 A: PLAN-399-v2 NOT-IN-SCOPE ":1557 items 3 to 5: No" and 1 ":1557 item 1" (the operator's list); PLAN-375-v2 B1 "operator item 6 (:1557)". B: PLAN-375-v2 10 "Operator items ... (1) N20 (2) BUILT may move to DONE (3) Integration plan seat" and PLAN-399-v2 4.3 "operator item 3" / 5 "operator item 2 (section 8)" (these are 375's numbers; 399 section 8 has one unnumbered item). In :1557 item 3 is "hunk-level splitting: No".
 Resolves: the plans' own questions are P1, P2, P3 (both plans); the operator's list is always written ":1557 item N".

xr#12 MED. Words presented as his that are not.
 (a) PLAN-399-v2 0: "The six steps (his, confirmed at :1580)". MORNING-DECISIONS.md :1579 reading (4): '"Yes" is read as yes to the six steps' is marked the orchestrator's; the entry two above says the six steps "are his only once he confirms them". PLAN-375-v2 0 repeats by pointing to 399 section 0.
 (b) PLAN-399-v2 0 line ":1572 'Task 399: no close without an outcome ... so I cannot let findings drop.'" sits under the header "(verbatim ...)". It is the item as put to him; his words are "Can we add these to the three tasks ...". 375 labels this correctly; 399 does not.
 (c) PLAN-399-v2 0 puts '"Yes, after 375"' inside the :1557 verbatim line: those are the auditor's words, he said "approved".
 (d) PLAN-399-v2 4.1 wontfix "(the approved note of :1557 ...)" cites the approval for a form that v2 changes (60 to 30 characters).
 Resolves: 399 section 0 uses 375's wording ("the item as put to him; his words are ..."); the six steps read "listed back to him; his 'Yes' read by the orchestrator as yes (MORNING-DECISIONS.md :1579 reading 4)".

xr#13 MED. The plan round block lands where the approved note and A2 say it must not.
 A: PLAN-375-v2 D4: "the task's Implementation Notes hold the plan round block ... and one line '<id> <SEV> <form word> <ref>' per CONFIRMED or CONFLICT finding of effective severity CRITICAL, HIGH or MED". B: the approved 399 note: "At close the task's FINAL SUMMARY ... not the notes, which the reviewer reads as rulings"; PLAN-375-v2 A2 CONTEXT_SECTIONS includes "Implementation Notes" (and A4 refuses a context without it).
 Why both cannot hold: the block is read by every later reviewer as a ruling, charged in every list part (the context size is the thing A2 measured at 2,126 characters for a task with no notes; task-375's notes are already about 12 KB).
 Resolves: the plan round block goes under the Implementation Plan field (appended, outside CONTEXT_SECTIONS), and the gate reads it there; Implementation Notes keep only dated notes.

xr#14 MED. "Extracted unchanged" cannot hold if 399's call site stays.
 A: PLAN-375-v2 D5: the grounder block "(:264-306 ...) EXTRACTED UNCHANGED into two functions". B: PLAN-399-v2 4.1: the new block is "placed after the grounder verdict block" and calls outcomeErrors({ verdicts, triageText, lensKinds, facts, mode }); today `verdicts`, `findings`, `lensFiles` are locals of closeErrors (check-lane-close.mjs ~:284). GROUNDER-PLANS int2#16 ruled the returned verdict map "moot".
 Resolves: the extracted grounder function returns { errors, verdicts, findings }; 375 changes the 399 call site in the same commit with the existing tests green; delete "moot".

xr#15 MED. Plan-time context has no writer, and the recorded rulings never reach the reviewer.
 A: PLAN-375-v2 D1 lists context-rN.md in the evidence folder written "before the panel"; backlog-brief.mjs needs --lane and runs only inside the launch (usage line). B: "Decisions naming this task" (a CONTEXT_SECTIONS entry) holds only decisions whose RR- title the task BODY names (backlog-brief.mjs ~:58 `named`); both plans record rulings as decisions but cite MORNING-DECISIONS.md lines in the task text.
 Resolves: name the command (backlog-brief.mjs --task T --lane <planned lane> --root ~/Buildo-wt-board writes context-r1.md; the orchestrator commits it); after recording each decision the orchestrator adds its RR number to the task text.

xr#16 MED. Round N and the fix round.
 A: PLAN-399-v2 4.2 "Review round N: ..." with N never defined; (d) "run twice, the Final Summary holds ONE round line". B: 4.1 "the id is exactly <file stem>#<n>" and 399 error-paths#3 (filed LOW): a re-run of out-compliance-x writes #1.. again; the existing verdict Map keeps the LAST verdict per id; the brief carries max_fix_rounds: 2 but no check counts rounds; task-400 (stamp the head, refuse an uncited later commit) is not built; "re-run only changed chunks" is a card after 375, so after any fix commit every unsplit lens output (bound to the whole-range diff, check-lane-close.mjs F3) is stale.
 Why: after a fix round the round-1 finding with id #3 and the round-2 finding with id #3 are one id: the later line silently closes the earlier finding, which is the drop :1572 forbids; the one-command replace discards the round-1 line the check never asked for; N has no source (399 lands before any context-rN file exists).
 Resolves: N = 1 + the number of "Review round" lines in the HEAD copy of the Final Summary; a fix round re-runs the one command (replace then append) so one round line carries the latest counts; a re-run lens output is renamed -rN (layout already allows it) so its ids are new; the brief's max_fix_rounds: 2 is stated as the bound for hardening rounds (his :1585 "bounded"; the written bound), counted by hand, not checked.

xr#17 MED (OPERATOR O1). After "grounder owed" nobody owns TRIAGE.md, the fix commits or the closing commit.
 A: PLAN-399-v2 4.7 "the lane leaves the task RUNNING and does not stage a finished status" until TRIAGE.md is complete; 5 "The orchestrator writes it" (only for the four audited tasks). B: run-mclane (his phrase): a lane is launched by the script and one Agent call; E2 (08_agents.md rule 9 note): "a multi-step build goes to the owning lane".
 Why: the lane's one call has ended; a confirmed finding needs a code fix (owning lane) and a TRIAGE line (orchestrator, short mechanical step) and a closing commit with the grounder's file.
 Resolves: see OPERATOR O1.

xr#18 MED. Steps 2 and 3 are not delivered on these two tasks, and step 3 stays "at close" for output.
 A: PLAN-399-v2 2 / PLAN-375-v2 2: "its plan check is the panel records, by hand, committed by the orchestrator". B: his four uncovered parts (:1588 region): "Step 2: plan findings are stored on the board but not posted to the task before launch. Step 3: the grounder's file is attached to the task only at close." 375 D4 posts and attaches at PLAN time, but only for tasks launched after the gate; B2 attaches the output-phase GROUNDER.md only at close.
 Resolves: before launching 399 and 375 the orchestrator adds the GROUNDER-PLANS.md path as a reference and a hand-written round block on each task (what D4 will later require); say in 399 4.7 that the lane adds the GROUNDER.md reference as soon as the grounder has ruled, not only in the closing commit.

xr#19 MED. A new flag where an existing command is the approved route.
 A: PLAN-375-v2 B1 "New flag --refs-only on the same script ... the whole of operator item 6". B: the approved 375 note B.2 uses the existing `rule-lists.mjs check-tasks` (it already resolves every open task, rule-lists.mjs:507) to print the add-ref commands; his :1522 words: "you are probaley rebuilding stuff that already exists you do this all the time" (a standing caution, recorded as such in MORNING-DECISIONS.md).
 Resolves: print the commands from check-tasks (approved route) and drop --refs-only; the take keeps adding refs for new launches. (If he prefers fewer manual commands, that is a yes/no for him, not a default.)

xr#20 MED. Where a Seat file lives.
 A: PLAN-399-v2 4.3 "A seat writes its report as a file in the lane directory". B: PLAN-375-v2 D1 "seat-integration-N.md" in docs/reports/reviews/<id>/ (plan mode). The Seat line form "Seat: <name> <repo path> sha256:<12 hex>" is shared, the tree it is read from is not.
 Resolves: the outcomeErrors/seat contract in 399 reads the Seat path from the tree its mode names (lane directory for 'close', docs/reports/reviews/<id>/ for 'plan').

xr#21 MED. A plan changed after launch has no owner.
 A: PLAN-375-v2 D3 "the hash proves the plan at launch only"; D6 "do not edit the Description, Acceptance or Plan; record deviations in Implementation Notes" (binds the lane). B: his step 4 "a grounder checks the folded plan before any build starts"; check-lane-close.mjs unions only the Files line; the orchestrator's board edit of a RUNNING task's body and the lane's closing copy of the same file meet at the fold by merge (no hook).
 Resolves: a plan change after launch is made only by release and relaunch (the launch script's undo, fresh evidence) or by the lane as a dated deviation note; the orchestrator does not edit Description, Acceptance or Plan of a RUNNING task (step 4; Spec 08 11.2).

xr#22 MED. The ruling records in the pre-launch list are duplicated and partly unneeded.
 A: PLAN-399-v2 2 "records each verbatim ruling of section 0 as a backlog decision". B: PLAN-375-v2 2 "records the cited verbatim rulings as backlog decisions" (same :1517, :1522, :1546, :1557, :1580, :1585, :1590). Each plan also "opens the cards of section 9" (the same five cards: review_followups row, golden exemption, re-run changed chunks, H6, tooling_ registration).
 Resolves: 399 records and opens; 375 records only what 399 did not (:1541, :1572 as put, :1546 second sentence) and opens none twice (Spec 137 Rule 2: one task, one row).

xr#23 MED. 375 builds the stricter default before the operator answers.
 A: PLAN-375-v2 A4 "N20 DEFAULT BUILT: the placeholder is refused after this folds". B: PLAN-375-v2 10 "Operator items (yes or no each): (1) N20 ... recommendation yes" and 0 "the 'no shim' sentence ... is the orchestrator's reading; the orchestrator deletes that sentence". The approved note carried the sentence (xr#1).
 Why: an item put to him as a yes/no is built before his answer; if he says no, the launch-time cutoff is a later card.
 Resolves: keep as written but say "built on the recommended answer; if he says no, revert A4's placeholder refusal" (the plan already does this for the other items: 'one plan, built on the recommended answer', ms-S#3 FOLDED); keep the "no shim" sentence in the notes and append the correction (xr#1).

======================================================================
LOW
======================================================================

xr#24 LOW. Rollback sentence vs per-file commits.
 A: PLAN-375-v2 D5 "rollback is a git revert of the two commits that changed backlog-lane.mjs and check-lane-close.mjs". B: PLAN-375-v2 10 "Each source file change in its own commit (protected paths)" (also the approved note): the check-lane-close.mjs commit holds A4, A5, B2 and D5; the backlog-lane.mjs commit holds A3, B1 and the gate call.
 Resolves: the rollback names that the two reverts also remove A3, A4, A5, B1, B2; or the gate call is its own last commit of backlog-lane.mjs.

xr#25 LOW. 137 note placement.
 PLAN-375-v2 10 "a dated note under Rule 3 in section 4 of 137_mcqueue.md after the :136 notes"; the notes at :134-:138 follow Rule 12, the Rule 3 note is :100. PLAN-399-v2 4.5 "after the :100 and :136 notes".
 Resolves: both plans put their note after the :138 correction (the last dated note of section 4), headed with the rule it concerns.

xr#26 LOW. PLAN_SECTIONS overlaps CONTEXT_SECTIONS.
 PLAN-375-v2 A2: PLAN_SECTIONS "(so the plan is read, not charged twice as context)"; Description, Acceptance criteria and Implementation Notes are in BOTH constants, so only the Implementation Plan is charged once.
 Resolves: say "three of four sections are charged twice in the plan phase" and give the measured call count, or drop them from the material.

xr#27 LOW. 399 does not carry the omission-guard framing.
 PLAN-399-v2 "WHAT THIS CAN AND CANNOT PROVE" and 4.5 notes versus 08_agents.md:239 (task-410 note: the check "is an OMISSION GUARD ... forgery routes ... task-401 and task-402"). A TRIAGE line with a real sha touching any named path passes (399 NOT IN SCOPE: "a sha is accepted when it touches any path the lane names"; 13 of 43 touched only another file).
 Resolves: the 399 dated note under rule 6 says the outcome check is part of the same omission guard and names 401 and 402 for forgery.

xr#28 LOW. Evidence file names.
 GROUNDER-PLANS.md (panel2, plural, both tasks, copied into task-399/ and task-375/) vs GROUNDER-PLAN.md (the gate's name, singular, per task) vs GROUNDER.md / TRIAGE.md (lane dir) vs TRIAGE-PLAN.md (reviews folder). 399 2 names the plural file as its panel record; 375 D1 names the singular file as the gate's input. A stray plural file is ignored by the gate (D5), but a reader and a grep cannot tell them apart; the outcome lines for the panel's own findings exist only as the word FOLDED inside the plural file.
 Resolves: rename the combined record GROUNDER-PANEL2.md in both folders; the gate names stay.

xr#29 LOW. A9 and A4 spend a real task as fixture.
 PLAN-375-v2 A4 and A9 use task-400 for a real --refs-only write and a real evidence set plus "one word edited"; MORNING-DECISIONS.md (entry "ORDERS the two binding checks", reading 4) records that the remaining-tasks audit recommends DROPPING task-400; its Files line (rule-lists.mjs, check-lane-close.mjs) collides with 375.
 Resolves: choose the fixture on the day 375 launches (a LATER build task that is not recommended for drop); A9 reverts its one-word edit and states the evidence is a test set, not that task's plan evidence.

======================================================================
OPERATOR ITEMS (yes or no)
======================================================================

O1 (xr#17). May the orchestrator send a further Agent call to the owning lane's worktree for a fix round after the grounder has ruled (and do the TRIAGE lines and closing commit itself), or must each fix round be a new lane? Yes or no. Recommendation: yes. Ground: the lane's one call ends before the grounder runs (399 4.7 "grounder owed"); E2 (08_agents.md rule 9 note, 2026-11-06, his "E2a") sends a multi-step build to the owning lane; a new lane cannot take a RUNNING task. No recorded word of his covers a second call on a lane.

O2 (new, from the walk step 4). Each build or fix launch now needs the orchestrator to run the panel, copy the evidence folder and commit it by hand on wf2/board, set references, and write the round block, before the one launch command. His words (MORNING-DECISIONS.md ~:953, RR-0242): "let me understand you now need to manually change the board or add a task - every single time - that's seems like alot of work and inefficient - wasnt the point of this to avoid just that". Accept the hand steps for the plan stage now (yes or no)? Recommendation: yes for now, because the panel itself is agent work and the commit is one command; open a card to script the round block and references (the --refs-only idea, xr#19). If no, the gate cannot ship as D1 describes.

======================================================================
PRESENTED AS HIS RULING, NOT HIS WORDS (see xr#12)
======================================================================
1. PLAN-399-v2 0: "The six steps (his, confirmed at :1580)". Orchestrator reading, not his words (:1579 reading 4; the six-steps entry).
2. PLAN-399-v2 0 :1572 line under a "verbatim" header: the item as put to him.
3. PLAN-399-v2 0 inside the :1557 line: "Yes, after 375" (the auditor's words; he wrote "approved").
4. PLAN-399-v2 4.1 wontfix "(the approved note of :1557 ...)": the approved note said 60 characters; v2 says 30.
(PLAN-375-v2 marks :1572 and RR-0328 correctly.)

======================================================================
DECIDED BY v2, HE WAS NOT ASKED, AND NO WRITTEN RULE SETTLES IT
======================================================================
Each is the orchestrator's design (the plans label some of them; none has his words or a rule):
1. 399: the pile: form and its interim home (TRIAGE lines are the pile). Approved item 1 says "Until then a deferral goes to a named task"; his :1580 supports a pile, not this home.
2. 399: the Seat: line form, the --outcomes CLI mode, "last line wins", the severity grammar, "no exemption key", the Files line widened by three files ("No other file" in the approved note).
3. 375: the whole launch gate form: Plan: hash line and its width, the Seat: line requirement, folded: form, GROUNDER-PLAN.md / TRIAGE-PLAN.md names, refusal of the 20 resolvable tasks (his words name only "I cannot launch a build on an unchecked plan").
4. 375: Integration seat required at every build or fix launch (operator item P3, asked).
5. 375: N20 built by default before the answer (xr#23).
6. 375: --refs-only (xr#19).
7. 375: type fix = at least one plan lens (labelled a reading; fine).
8. 375: hand commit of the evidence folder on the board (O2).
9. Both: DoD #8 of both task pages ("Nothing was added that the card or ruling did not name", 124a:988) is not answered anywhere: the forms, flag and lines above are additions; add one sentence to each plan naming his :1572 / :1580 orders as the ground and saying the mechanism is the orchestrator's (375 D says it; 399 does not).

======================================================================
THE FOUR UNCOVERED PARTS (:1588 region), as v2 leaves them
======================================================================
Step 2 posted to the task: delivered for later tasks (375 D4), not for these two (xr#18).
Step 3 grounder file attached: plan stage delivered (D4); output stage still at close (xr#18).
Step 4 cannot prove folded or seats ran: stated as limits (375 D5 "WHAT THE GATE CANNOT PROVE"), folded: quote check is weak, said. Honest.
Step 6 outcomes on the page: MED and above listed, LOW and NIT counted only (399 4.2); seat findings enter through Seat lines (399 4.3). Delivered, with the stated limit.

======================================================================
WHAT CHECKED OUT (pairs read, no collision)
======================================================================
- outcomeErrors signature and "399 first, 375 adds mode 'plan'": consistent apart from xr#2, xr#14, xr#20.
- Two-commit close (Rule 3 note :100; 08_agents.md:229-239): both plans put code and notes in one commit and the close in a records-only commit; protected-path self-edit rule (check-lane-close.mjs ~:345) is respected by both landing orders. Index-staged records allowed by rec() (~:425): TRIAGE.md, GROUNDER.md, lane dir, reviews/<task>/, task files, decisions: no collision.
- Launch commit L: 399 4.1 "L..HEAD" and 375's gate "before the take" use the same L and the same take; the Files line must be set before the take in both (399 3, 375 2): consistent.
- Existing literals (30 characters, 12 hex, 120000): both reuse, neither adds.
- Real task-410 TRIAGE.md already uses the 399 forms (fixed 48, ruling 1, task 25, wontfix 83 lines); its plan-stage ids (plan-compliance-...) sit in the same file as its out- ids, which 399 4.1 handles by id.
- The Files lines resolve with no unmatched path (rule-lists.mjs resolve, run for both lines: 399 7 lists without milestone docs, 375 12).

======================================================================
LIFE OF ONE BUILD TASK, LATER TO DONE (plain words; for the operator)
======================================================================
1. Orchestrator, backlog task edit (description with the Files line, --plan, --ac, one dated note), on the board: the task page now shows the plan text (board job commits within 10 minutes). [Gap: must append the note, never replace the approved one: xr#1.]
2. Orchestrator, node scripts/analysis/backlog-brief.mjs --task T --lane <planned lane> then rule-lists.mjs lens-input and the DeepSeek lenses per rule list, plus the Integration seat: files context-r1.md, plan-compliance-<list>.txt with in- inputs, seat-integration-N.md. [Gap: nobody named for context-r1.md: xr#15.]
3. A separate grounder writes GROUNDER-PLAN.md (a verdict per finding, a Seat line, then the Plan hash line last). [Plan 375 only; for 399 and 375 themselves it is GROUNDER-PLANS.md and there is no gate.]
4. Orchestrator folds: writes TRIAGE-PLAN.md (folded:"quote", task:, ruling:, pile:), adds the evidence paths as references and the round block, commits the evidence folder by hand on wf2/board (docs commit; commit-msg hook runs; no status moves). [O2; round block place: xr#13.]
5. Fold-validation grounder (11.2) re-runs the claims; as its last act runs backlog-lane.mjs --task T --lane <name> --dry-run and copies the Plan line; any edit after this changes the hash and goes back to step 3.
6. Orchestrator, node scripts/analysis/backlog-lane.mjs --task T --lane <name>: the gate runs first (refuses with one line per missing item); then the take (RUNNING, @lane-name), board job commit = launch commit L, worktree cut, brief written; one Agent call. [Old brief until 399/375 land: xr#4.]
7. Lane agent, in its worktree: red tests, code commits (each with "Task: T" and the task file in the diff; pre-commit and commit-msg hooks fire), the lens set over the diff with context-rN.md, its own plan-stage lens, outputs in docs/reports/lanes/<date>/<lane>/. It stops at RUNNING, "grounder owed".
8. A separate grounder writes GROUNDER.md in the lane directory (verdicts, Ruled lines, Seat lines) for every finding.
9. Owner not named (O1): TRIAGE.md, one outcome line per confirmed or conflict finding (fixed:sha, task:, ruling:, wontfix:, pile:). A code fix goes back to the lane: new commit, lens outputs re-run and renamed -rN, finding re-ruled; run node scripts/hooks/check-lane-close.mjs --outcomes <lane dir> until it prints no refusal.
10. The closing commit (records only: lane directory, task file, review folder, decisions) from the lane worktree: backlog task edit T --check-ac ... --final-summary "..." --append-final-summary "<round block>" --add-ref <REPORT.md> <GROUNDER.md> <TRIAGE.md> -s BUILT. The commit-msg hook (check-lane-close.mjs) runs the whole check; the page shows the round line and every MED and above outcome.
11. Fold of the branch onto the board by merge (task-401 and 402 own a script and a git hook; today no hook fires on a merge).
12. BUILT to DONE: nobody. The check refuses it today, it would be refused for all 31 BUILT lane tasks after 399 (no TRIAGE.md), and a refusal on the board job holds every board edit (xr#9). Operator question P2 decides; until then a task stops at BUILT.
13. Fix round after step 10 (grounder confirms a finding late): reopen the lane (O1), fix commit, re-run every lens output (changed-chunks-only is a card after 375), re-rule, replace the TRIAGE line and rerun the one close command so one round line remains (xr#16). A plan change after launch: release and relaunch with fresh evidence, never an orchestrator edit of a RUNNING task (xr#21).
