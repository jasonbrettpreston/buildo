GROUNDER-PLANS.md, round-2 adjudication of the panel2 output on PLAN-399 and PLAN-375 (Spec 08 section 5.3, section 7 rules 3, 4, 6; section 11.2), at board head c15fab7ec.
Grounder: grounder-plans-2 (separate from the plan authors and from every finding author). Read-only on the repo. Rules cited by number; lines at c15fab7ec.
COUNTS: 215 findings ruled, none sampled (165 DeepSeek BUG and DEFER lines in 32 outputs, ids <file stem>#<n> by the check's own FINDING_LINE; int2 18, rc2 12, gt2 20). CONFIRMED 147: HIGH 10, MED 77, LOW 56, NIT 4. REJECTED 68. Severity is the grounder's own, not the lens line's.
MEASUREMENTS RUN FOR THIS ROUND (scripts in /private/tmp/claude-501/-Users-brettpreston_macmini/e5859bf2-ef76-40e5-be86-4afba79a1666/scratchpad/g-plans2/):
- m1.mjs (rc2#7, int2#7): plan hash of title plus body, take line stripped, over every real take on the board history: 61 takes, the hash changes at the take in 29 (48%), 26 of them tasks with no notes section. Reproduced (rc2 said 26 of 57).
- t2.mjs on a port of the check's own test fixture (harness.mjs, real hook): control build set status 0. A plan-only set (every out-compliance renamed plan-compliance) for a BUILD task: current c15fab7ec status 1, 4 list errors "no valid compliance lens output ... write out-compliance-<id>.txt". The same set with phases changed to [plan,out] (patched copy p/scripts/hooks): status 0. So gt2#2 is right for today and the plan's "reproduced" holds only for the amended code.
- m2.mjs (rc2#1, rc2#3): real BL-V2WHOLE GROUNDER.md and TRIAGE.md: 278 TRIAGE lines, 118 distinct ids, 48 CONFIRMED. Last line per id, PLAN-399-v2 form rules (grounder severity, else lens): 9 no line, 0 reasons under 30 characters, 1 wontfix above LOW, 3 task: on a CRITICAL or HIGH BUG, 35 pass the form checks (git facts not run). HIGH or MED lines for the task page: 18, 1,237 characters.
- Counts at c15fab7ec: 35 RUNNING (29 with a lane assignee), 31 BUILT with a lane assignee, 11 of 77 lane directories hold out-compliance outputs.
NOT RERUN (the Reality-Check seat's scripts no longer exist at the path the ticket gives): rc2#2 (153 findings, 63 admitted, 90 refused), the 270-call estimate, the minutes. Marked UNVERIFIED where relied on.

FORMAT: <id> CONFIRMED|REJECTED [SEVERITY] reason. A CONFIRMED HIGH or MED is FOLDED in PLAN-399-v2 or PLAN-375-v2 (the word FOLDED, or moot by a deletion named in the reason); a CONFIRMED LOW or NIT goes to the review pile (FILED-LOW.md, his :1580 words), not rejected. A REJECTED carries its reason.

plan-compliance-375-agents-s5-1to3#1 REJECTED Ground-truth seat did run (seat-ground-truth-2.md); the premise that no pass is scheduled is false; rule 5.1 asks to run it, not a gate.
plan-compliance-375-agents-s5-1to3#2 REJECTED Round 2 is this adjudication (GROUNDER-PLANS.md); the plan is a draft until ruled.
plan-compliance-375-agents-s5-1to3#3 CONFIRMED LOW Row/paragraph cut is the orchestrator's reading of :1546 "or split smaller", not the 2026-11-20 note's heading split; v2 labels it a reading (A6). Parts rejoin whole, nothing is trimmed.
plan-compliance-375-agents-s5-1to3#4 CONFIRMED MED A5 both-phases close rule had no pasted authority (rule 4 says WF1/WF2 plan and output, WF3 output only, 08_agents.md:347); FOLDED: A5 deleted, plan evidence moved to the launch gate.
plan-compliance-375-agents-s5-1to3#5 REJECTED Rejections are kept in GROUNDER-PLAN.md and TRIAGE-PLAN.md, referenced on the task (D4); not a plan defect.
plan-compliance-375-agents-s7-s11#1 REJECTED 137_mcqueue.md:136 names GROUNDER.md as a close artifact; B2 is consistent with the note.
plan-compliance-375-agents-s7-s11#2 CONFIRMED LOW D-exempt recommendation carried no rule and line; D-exempt is deleted, remaining operator items carry ground and line.
plan-compliance-375-agents-s7-s11#3 CONFIRMED MED Plan triage vocabulary had no DEFER destination (rule 6, :350); FOLDED: pile form (his :1580 words) in outcomeErrors.
plan-compliance-375-agents-s7-s11#4 REJECTED "D1 to D7" are section labels of the plan, not ledger D numbers (11.8 covers MF, FE, MB, migration, prereg, decision numbers).
plan-compliance-375-agents-s7-s11#5 REJECTED TKT-1 is the header of a brief or prompt to an agent; the lens prompt is a fixed template bound by hash and is not edited.
plan-compliance-375-agents-s7-s11#6 CONFIRMED MED 11.2's pairwise cross-read left no record; FOLDED as a sentence: free-text cross-read note in GROUNDER-PLAN.md, stated as unchecked (a name check would pretend).
plan-compliance-375-agents-s7-s11#7 REJECTED STATUS line and one question bind replies, not plan documents.
plan-compliance-375-airtight-122a#1 CONFIRMED MED D10b reads logic_variables through the DB; a test needing Postgres is *.db.test.ts (Spec 132 x-tooling.1); FOLDED (C, files line, tests).
plan-compliance-375-airtight-122a#2 CONFIRMED LOW D10b acceptance should name the one-process DOTENV_CONFIG_PATH form when the DB GO is given; filed.
plan-compliance-375-airtight-122a#3 REJECTED A26 governs step-conversion runtime proof; this task edits tooling, and the lens could not see the clause set.
plan-compliance-375-airtight-124a#1 CONFIRMED MED Spawned-CLI tests must assert exit status, no signal and the header before absence assertions (R-CP, 124a:296); FOLDED in tests of both plans.
plan-compliance-375-airtight-124a#2 CONFIRMED LOW R-BA literals: v2 enumerates them (12-hex width, 120000 bound, 30-character minimum, all existing) and adds none; card registers them; filed.
plan-compliance-375-airtight-124a#3 CONFIRMED LOW Names compared only is an omission guard; v2 says so in the gate's limits and the 137 note; filed.
plan-compliance-375-airtight-124a#4 CONFIRMED LOW "Costs per ordinary commit: none" was an assertion; v2 words it as: runs at launch and, for 399, at commit-msg only on a move to a finished status; filed.
plan-compliance-375-airtight-124a#5 REJECTED The lens ran with a placeholder context (the defect A fixes); the clauses are cited in the plan.
plan-compliance-375-airtight-v2-122#1 REJECTED 137_mcqueue.md is not a declaring notes file (gates/notes-cap.mjs covers *.notes.json declaring files; grep).
plan-compliance-375-eng-all#1 REJECTED Not a finding (template placeholder text "none found").
plan-compliance-375-eng-all#2 CONFIRMED LOW Threshold registration is a card (core.8); v2 adds no new threshold; filed.
plan-compliance-375-eng-all#3 REJECTED eng-all section 11 self-check is agent behaviour at Green Light, not plan content; acceptance runs commands.
plan-compliance-375-eng-all#4 REJECTED 12.12 is for arithmetic invariants; v2 has no normaliser (hash is of the raw squashed text).
plan-compliance-375-eng-all#5 CONFIRMED LOW New coupling of check and launch gate to Spec 08 is recorded in the 137 note only; filed (08_agents.md is 399's file).
plan-compliance-375-eng-all#6 REJECTED Fixtures are text blobs and files; no typed domain object applies.
plan-compliance-375-five-words#1 CONFIRMED MED Duplicate of 122a#1: D10b test must be *.db.test.ts; FOLDED.
plan-compliance-375-five-words#2 REJECTED "phase" is the existing name in code (check-lane-close.mjs:178) and file names; renaming is out of scope.
plan-compliance-375-five-words#3 CONFIRMED NIT "stage" has two senses; v2 says "plan round" and "launch label"; filed.
plan-compliance-375-five-words#4 REJECTED R-BA lettered gates are step-validate gates; planGateErrors is a function of the close check.
plan-compliance-375-five-words#5 REJECTED Placeholder run (the lens had no context); rulings are cited with MD lines.
plan-compliance-375-five-words#6 REJECTED Gate V maps the five words for step work; a tooling plan has no step to score.
plan-compliance-375-inc-S#1 REJECTED Not a finding ("not emitted").
plan-compliance-375-inc-S#2 REJECTED Placeholder run; rulings cited with MD lines and recorded as decisions before launch.
plan-compliance-375-ms-S#1 CONFIRMED MED Section D carried mechanisms his words do not name (gt2#12); FOLDED: D labelled the orchestrator's mechanism for :1572 and cut to the launch refusal plus evidence.
plan-compliance-375-ms-S#2 REJECTED The milestone line is about the search page; this task is a supporting function ordered by him (:1572, :1580).
plan-compliance-375-ms-S#3 CONFIRMED MED Plan carried three open questions inside the build; FOLDED: one plan, built on the recommended answer, questions listed outside as operator items.
plan-compliance-375-ms-S#4 REJECTED Supporting function is stated; ordered by him; not a defect.
plan-compliance-375-ms-S#5 CONFIRMED LOW Own launch precedes the gate; v2 acceptance A9 runs the gate on the next real LATER task; filed.
plan-compliance-375-orchestrator-doc17#1 REJECTED gt2 verified :1517 and the other quoted lines are his verbatim words on those lines; the plan quotes only those.
plan-compliance-375-orchestrator-doc17#2 CONFIRMED MED Duplicate of ms-S#1 (D beyond his words); FOLDED.
plan-compliance-375-orchestrator-doc17#3 REJECTED Placeholder run; decision-113 exists (gt2 verified); the "no shim" sentence is removed from the task.
plan-compliance-375-orchestrator-doc17#4 CONFIRMED MED Duplicate of s5#4 (A5 authority); FOLDED by deletion.
plan-compliance-375-plan-protocol#1 REJECTED plan-protocol 5.2 governs the increment plan; the narrow lens set binds a lane task (MD entry "five open items", item 4).
plan-compliance-375-plan-protocol#2 REJECTED Push review is the increment plan (same ruling, item 4).
plan-compliance-375-plan-protocol#3 REJECTED SUPPORT S1-S8 tags are the increment plan's step B (same ruling).
plan-compliance-375-plan-protocol#4 REJECTED file:line per artifact belongs to the increment plan (same ruling).
plan-compliance-375-plan-protocol#5 CONFIRMED LOW Operator items must quote the search of the record; v2 items carry ground and line; filed.
plan-compliance-375-plan-protocol#6 REJECTED seq-patch.json and SITTING.md are per increment, not per lane task.
plan-compliance-375-plan-protocol#7 REJECTED Infra freeze is lifted by name for this work (08_agents.md:229) and he ordered the additions.
plan-compliance-375-queue-137#1 CONFIRMED MED Each code commit needs the Task trailer and the task file in the same diff (G3, check-backlog-task.mjs); FOLDED in both landing sections.
plan-compliance-375-queue-137#2 CONFIRMED MED A raw RUNNING by the board-edit route bypasses the launch refusal; FOLDED as a stated limit in D7 (no mechanism pretends).
plan-compliance-375-queue-137#3 REJECTED Task files carry no expires field (front matter read); rule 12 is for queue rows.
plan-compliance-375-queue-137#4 CONFIRMED LOW Operator questions should be Backlog comments (RR-0207); process note for the orchestrator; filed.
plan-compliance-375-queue-137#5 CONFIRMED NIT Cite Spec 137 by section or rule; v2 cites rule and section with line as hint.
plan-compliance-375-queue-137#6 CONFIRMED LOW Dated notes follow the M-246 form, prior text kept; v2 says so; filed.
plan-compliance-375-queue-137#7 REJECTED Card ids are minted when the cards are opened.
plan-compliance-375-step-132#1 CONFIRMED LOW Gate literals: all existing; v2 adds none; core.8 card lists them; filed.
plan-compliance-375-step-132#2 CONFIRMED MED Duplicate of 122a#1; FOLDED.
plan-compliance-375-step-132#3 CONFIRMED MED :1517, :1522, :1572 also need decision records; FOLDED in the pre-launch list.
plan-compliance-375-step-132#4 REJECTED x-rulings.1 is for rulings admitted as locks in Spec 124; the repo's form for tooling is the dated note.
plan-compliance-375-step-132#5 CONFIRMED MED Duplicate of s5#4: narrowing of WF1/WF2 to build or fix; FOLDED: build full plan evidence, fix lean (rule 4 and 6.4).
plan-compliance-375-step-132#6 REJECTED Defect Ledger and reflection entries are optional ("when it may recur").
plan-compliance-399-agents-s5-1to3#1 REJECTED v2 builds no skip; the BUILT to DONE refusal is task-410's (check-lane-close.mjs:338), not added here.
plan-compliance-399-agents-s5-1to3#2 CONFIRMED MED Bulk lines named no ids; FOLDED: bulk form deleted, one line per id.
plan-compliance-399-agents-s5-1to3#3 REJECTED CONFLICT is the check's own VERDICT word (check-lane-close.mjs:50).
plan-compliance-399-agents-s5-1to3#4 REJECTED Panel records are in docs/reports/reviews/task-399/; process, not defect.
plan-compliance-399-agents-s5-1to3#5 REJECTED 5.2's periodic sweep is unrelated to outcome lines.
plan-compliance-399-agents-s5-1to3#6 CONFIRMED LOW State the interim RUNNING "grounder owed" step; done in 4.7; filed.
plan-compliance-399-agents-s7-s11#1 CONFIRMED LOW "about :326-336" is :338; v2 cites it exactly; filed.
plan-compliance-399-agents-s7-s11#2 CONFIRMED MED Acceptance used a scratch path outside the repo; FOLDED: committed copy and the real BL-V2WHOLE lane directory.
plan-compliance-399-agents-s7-s11#3 REJECTED TKT-1 is the lane brief's header, not a plan document's.
plan-compliance-399-agents-s7-s11#4 CONFIRMED MED Duplicate of queue-137#1 (Task trailer); FOLDED.
plan-compliance-399-agents-s7-s11#5 REJECTED Cards get task ids from backlog at creation; the ledger covers MF, FE, MB numbers.
plan-compliance-399-agents-s7-s11#6 CONFIRMED MED DEFER home: until the row exists the pile lines are the pile; FOLDED with :1557 item 1 and :1580 cited.
plan-compliance-399-agents-s7-s11#7 REJECTED Fold validation is 11.2 and is run by this grounder pass; v2 states the procedure.
plan-compliance-399-agents-s7-s11#8 CONFIRMED LOW Name the seats instead of "full panel"; done; filed.
plan-compliance-399-airtight-124a#1 CONFIRMED MED Spawned-hook tests assert completion first (R-CP); FOLDED.
plan-compliance-399-eng-all#1 REJECTED Self-checklist is agent behaviour at Green Light.
plan-compliance-399-eng-all#2 REJECTED v2 introduces no threshold (the 30-character floor is existing).
plan-compliance-399-eng-all#3 CONFIRMED MED Docs landed after the code that makes them true; FOLDED: one commit holds check, tests, README and notes.
plan-compliance-399-eng-all#4 REJECTED Count reconciliation is not an arithmetic invariant under 12.12.
plan-compliance-399-five-words#1 REJECTED Lens ran with placeholder context; clauses are cited.
plan-compliance-399-five-words#2 CONFIRMED NIT "#NN" token clash for DoD #2 and finding ids; v2 writes "DoD #2"; filed.
plan-compliance-399-five-words#3 REJECTED The close script is named a check and hook by task-410's notes already.
plan-compliance-399-five-words#4 CONFIRMED LOW Name rule numbers in test titles; v2 section 6 lists them; filed.
plan-compliance-399-five-words#5 CONFIRMED LOW Cite entries by heading and verbatim words, not by line alone; v2 does; filed.
plan-compliance-399-inc-S#1 REJECTED The lens had no clause; the rulings are cited.
plan-compliance-399-inc-S#2 CONFIRMED LOW v2 states the check reads no TRIAGE.md today (gt2#17); filed.
plan-compliance-399-inc-S#3 REJECTED The refusal of BUILT to DONE exists today (check-lane-close.mjs:338); this task adds none.
plan-compliance-399-inc-S#4 CONFIRMED LOW Acceptance must run on a real lane directory; v2 (b) uses BL-V2WHOLE; filed.
plan-compliance-399-ms-S#1 CONFIRMED MED M16 carried two branches; FOLDED: removed from the plan, operator item.
plan-compliance-399-ms-S#2 REJECTED Placeholder run.
plan-compliance-399-orchestrator-doc17#1 REJECTED His words are quoted verbatim (gt2 verified).
plan-compliance-399-plan-protocol#1 CONFIRMED LOW Operator item now carries the quoted search (no BUILT to DONE entry in MORNING-DECISIONS.md); filed.
plan-compliance-399-plan-protocol#2 REJECTED Increment-plan tag; lane task is narrow (ruling item 4).
plan-compliance-399-plan-protocol#3 REJECTED Increment-plan count line; same.
plan-compliance-399-plan-protocol#4 CONFIRMED LOW Order 399 then 375 is a landing rule; set the dependency with the backlog CLI; filed.
plan-compliance-399-plan-protocol#5 CONFIRMED LOW Name the seats; done; filed.
plan-compliance-399-queue-137#1 REJECTED Rule 3 is amended to the two-commit close by his "agreed" (:1546) and recorded at 137_mcqueue.md:100.
plan-compliance-399-queue-137#2 REJECTED v2 builds no skip.
plan-compliance-399-queue-137#3 CONFIRMED MED Duplicate of queue-137#1 (trailer, task file in diff); FOLDED.
plan-compliance-399-queue-137#4 CONFIRMED LOW v2 quotes only verbatim words with the MD line; filed.
plan-compliance-399-queue-137#5 CONFIRMED LOW Operator items carry Grounded and Recommendation lines; filed.
plan-compliance-399-queue-137#6 REJECTED Task files carry no expires field.
plan-compliance-399-queue-137#7 CONFIRMED NIT Cite Spec 137 by rule and section; done.
plan-compliance-399-queue-137#8 REJECTED He approved the notes at :1557; the page header concerns the draft state.
plan-compliance-399-step-132#1 CONFIRMED LOW The 60-character literal is dropped; the existing 30 (check-lane-close.mjs:296) is reused; filed.
plan-compliance-399-step-132#2 CONFIRMED MED Duplicate of c375-step-132#3 (decision records); FOLDED.
plan-compliance-399-step-132#3 CONFIRMED MED The :1522 line was cited for an exemption it does not contain (gt2#7); FOLDED: exempt-count clause deleted.
plan-compliance-399-step-132#4 CONFIRMED MED Duplicate of 124a#1; FOLDED.
plan-compliance-399-step-132#5 CONFIRMED LOW git work per id in commit-msg: bounded by ids (48 on the largest real file); note filed.
plan-error-paths-375#1 REJECTED references is front matter (task-375 file head), outside the hash; and the hash is checked before the take.
plan-error-paths-375#2 CONFIRMED MED Stripping the take literal anywhere hid edits; FOLDED: no stripping, hash is checked before the take.
plan-error-paths-375#3 CONFIRMED MED gate_from unresolvable had no named error; FOLDED: key deleted.
plan-error-paths-375#4 CONFIRMED MED A close gate could block cancelling a launched task; FOLDED: no close re-proof.
plan-error-paths-375#5 CONFIRMED MED D10b unset or bad variable; FOLDED: refuse naming it.
plan-error-paths-375#6 CONFIRMED LOW A block with no cut point falls through to the old throw; stated; filed.
plan-error-paths-375#7 CONFIRMED LOW --refs-only adds only ids not present; duplicates on live tasks are left; filed.
plan-error-paths-399#1 REJECTED The BUILT to DONE refusal is task-410's today, not caused by 399.
plan-error-paths-399#2 CONFIRMED MED Empty case: zero ids passes and prints "checked 0 ids"; a build task still needs GROUNDER.md; FOLDED test.
plan-error-paths-399#3 CONFIRMED LOW Positional ids recur across rounds; last line wins and shas must lie in L..HEAD; residual stale-line risk filed.
plan-error-paths-399#4 CONFIRMED MED Two bulk lines overlap; FOLDED: bulk form deleted.
plan-error-paths-399#5 CONFIRMED MED A rebase rewrites shas; FOLDED: lines are re-recorded with the new shas after the last rebase (stated in 4.1).
plan-error-paths-399#6 CONFIRMED MED Callback failure must be one error line per id; FOLDED.
plan-error-paths-399#7 CONFIRMED MED Unparsable severity defaults to the strictest tier; FOLDED.
plan-plan-review-deepseek-375#1 CONFIRMED HIGH Hash changes at the take for 29 of 61 real launches (remeasured); FOLDED: hash checked only before the take.
plan-plan-review-deepseek-375#2 REJECTED references is front matter.
plan-plan-review-deepseek-375#3 CONFIRMED MED A raw take proceeds unchecked; FOLDED as stated limit; the hook alternative fails (board job leaves edits).
plan-plan-review-deepseek-375#4 CONFIRMED LOW Rollback named: revert of the two commits; filed.
plan-plan-review-deepseek-375#5 REJECTED A relaunch after the fold needs fresh evidence: that is step 4.
plan-plan-review-deepseek-375#6 CONFIRMED MED Stray or unreadable files must not throw; FOLDED (D5).
plan-plan-review-deepseek-375#7 REJECTED The lane sees every committed round file and counts them, so an earlier round is not overwritten.
plan-plan-review-deepseek-375#8 CONFIRMED LOW Splitter edits require re-running open outputs; stated limit; filed.
plan-plan-review-deepseek-375#9 CONFIRMED MED Where plan evidence and output evidence are read was unstated; FOLDED (D1, D5).
plan-plan-review-deepseek-375#10 CONFIRMED LOW List changes between launch and close force a re-run (existing behaviour); filed.
plan-plan-review-deepseek-375#11 CONFIRMED LOW Hash proves the plan at launch only; stated; filed.
plan-plan-review-deepseek-375#12 CONFIRMED LOW A moved list path leaves a stale entry; filed.
plan-plan-review-deepseek-375#13 REJECTED Printer deleted.
plan-plan-review-deepseek-375#14 REJECTED baseTask is read at L (check-lane-close.mjs launch block); gt2 verified.
plan-plan-review-deepseek-375#15 CONFIRMED LOW Grep run: four call sites (backlog-lane.mjs :150, :178; backlog-brief.mjs :167, :168), all covered in A3; filed.
plan-plan-review-deepseek-399#1 REJECTED The id stem is the lens output file name (rule-lists.mjs findingsIn), not a reviewed file's name.
plan-plan-review-deepseek-399#2 CONFIRMED MED The brief's Close line is not in 399's Files; FOLDED: the refusal prints the exact command; the brief edit is task-375's A1.
plan-plan-review-deepseek-399#3 CONFIRMED MED Duplicate of e399#5; FOLDED.
plan-plan-review-deepseek-399#4 CONFIRMED MED A malformed line must not count as presence; FOLDED.
plan-plan-review-deepseek-399#5 REJECTED Isolation per task is existing behaviour of the check; not caused by this plan.
plan-plan-review-deepseek-399#6 REJECTED M16 removed from the plan.
plan-plan-review-deepseek-399#7 REJECTED A build task always needs GROUNDER.md (check-lane-close.mjs:244).
plan-plan-review-deepseek-399#8 CONFIRMED LOW One command replaces then appends; acceptance (d) runs it twice; filed.
plan-plan-review-deepseek-399#9 CONFIRMED LOW Earlier returns hide the new message one refusal at a time; filed.
plan-plan-review-deepseek-399#10 CONFIRMED LOW Revert detection by full sha, a re-applied revert ignored; filed.
plan-plan-review-deepseek-399#11 CONFIRMED MED Severity token grammar pinned in 4.1; FOLDED.
plan-plan-review-deepseek-399#12 CONFIRMED MED Bulk namespace: bulk deleted; FOLDED.
plan-plan-review-deepseek-399#13 CONFIRMED MED Bulk and full line overlap: bulk deleted; FOLDED.
plan-plan-review-deepseek-399#14 CONFIRMED MED Whole-token id match; FOLDED.
plan-plan-review-deepseek-399#15 CONFIRMED MED outcomeErrors signature stated; FOLDED.
plan-plan-review-deepseek-399#16 CONFIRMED MED Flag order verified only from --help; acceptance (d) runs it; FOLDED.
plan-plan-review-deepseek-399#17 CONFIRMED MED Scratch copy; FOLDED (committed copy).
plan-plan-review-deepseek-399#18 CONFIRMED LOW Cite by rule number in refusal messages; filed.
plan-plan-review-deepseek-399#19 REJECTED Same defect as p399#1; premise false.
plan-plan-review-deepseek-399#20 CONFIRMED LOW Two verdicts for one id: last wins in the existing Map; filed.
plan-plan-review-deepseek-399#21 CONFIRMED LOW Reasons measured after whitespace squash; stated; filed.
plan-plan-review-deepseek-399#22 CONFIRMED MED Tests for malformed line, zero ids, same-stem were missing; FOLDED (same-stem is a rejected premise, others added).
plan-plan-review-deepseek-399#23 CONFIRMED LOW The commit-msg check is the one place that sees a move to a finished status; filed.
int2#1 CONFIRMED HIGH 375 could not close under its own gate: FOLDED by deleting the close re-proof and gate_from.
int2#2 CONFIRMED HIGH Plan outputs stale for lists the task edits (listBlocks reads the working tree); FOLDED: plan evidence checked only at launch.
int2#3 CONFIRMED HIGH Plan findings copied to the lane cannot take fixed:; FOLDED: plan evidence stays on the board, folded: form.
int2#4 CONFIRMED HIGH Acceptance 9 refused on status (backlog-lane.mjs:63-64); FOLDED: A9 on a LATER task.
int2#5 CONFIRMED HIGH gate_from covered only the plan gate; FOLDED: launch-only gate touches no running lane; the other close refusals are listed (D7, PLAN-399 section 5).
int2#6 CONFIRMED MED Pinned key trap; moot (key deleted).
int2#7 CONFIRMED MED Hash moves at the take for a notes-less task (rerun: 29 of 61); FOLDED (D3).
int2#8 CONFIRMED MED The plan reviewed was not the plan hashed and who plans was unsaid; FOLDED (D1, A1, A2 PLAN_SECTIONS).
int2#9 CONFIRMED MED Plan material was the whole context file; FOLDED (PLAN_SECTIONS).
int2#10 CONFIRMED MED Who commits evidence unsaid; FOLDED (D1).
int2#11 CONFIRMED MED Existing tests that go red unlisted; FOLDED (section 8 of 375, section 6 of 399).
int2#12 CONFIRMED MED Short shas, revert full sha, finished to finished, id parsing; FOLDED in 4.1 and the operator item.
int2#13 CONFIRMED MED Counts; FOLDED as D7 statements (20 tasks).
int2#14 CONFIRMED LOW backlog-lane.mjs is unprotected; card for protected_paths; filed.
int2#15 CONFIRMED LOW Tool drift invalidates evidence; stated (plan panels after 375 folds); filed.
int2#16 CONFIRMED LOW Verdict map returned by the extraction; moot; filed.
int2#17 CONFIRMED LOW Stale cites; v2 cites at c15fab7ec; filed.
int2#18 CONFIRMED MED Plan posting on the task; FOLDED (D4, operator's part S2).
rc2#1 CONFIRMED HIGH One line per id refused 43 of 48 on the real pair (rerun: last line per id leaves 9 with no line of 48); FOLDED: last line wins.
rc2#2 CONFIRMED HIGH The four audited tasks cannot close without writing 153 lines (not rerun: scripts gone); FOLDED: explicit rule, no exemption, backfill by the orchestrator.
rc2#3 CONFIRMED MED Severity from the grounder's rating; FOLDED.
rc2#4 CONFIRMED MED Bulk REJECTED word misrecorded CONFIRMED findings; FOLDED: bulk deleted.
rc2#5 CONFIRMED MED Task paths with spaces, decision-N form, answers need a decision file; FOLDED.
rc2#6 CONFIRMED MED A CONFLICT waiting for the operator has no form; FOLDED: stated, task stays RUNNING.
rc2#7 CONFIRMED HIGH Hash changes at the take (rerun: 29 of 61, notes-less 26); FOLDED: launch-only hash.
rc2#8 CONFIRMED MED Plan-time fixed: cannot pass; FOLDED: folded: form.
rc2#9 CONFIRMED MED Gate applies to build and fix only; FOLDED (D7).
rc2#10 CONFIRMED LOW gate_from moot; running lanes rule stated; filed.
rc2#11 CONFIRMED LOW Review calls estimate (270, UNVERIFIED minutes); recorded in D7; filed.
rc2#12 CONFIRMED LOW task-357 plan-phase refusal is cured by A6; filed.
gt2#1 CONFIRMED HIGH Same as int2#4; FOLDED.
gt2#2 CONFIRMED MED RUN: on c15fab7ec a plan-only set for a build task is REFUSED (status 1, 4 of 4 lists); the earlier "reproduction" holds only with phases ['plan','out'] (status 0); FOLDED (section 7).
gt2#3 CONFIRMED MED Rule 4 says WF3 output only; FOLDED: build full, fix lean.
gt2#4 CONFIRMED MED Line offsets differ per head; FOLDED: cites by rule number at c15fab7ec.
gt2#5 CONFIRMED MED Dated note is :229, not :232; FOLDED.
gt2#6 CONFIRMED MED 137 notes sit in section 4 (:100, :136, :138); FOLDED.
gt2#7 CONFIRMED MED Fingerprint clause was the orchestrator's; FOLDED: clause deleted.
gt2#8 CONFIRMED MED wontfix of a CONFIRMED finding was widened to MED; FOLDED: LOW and NIT only, marked as a reading.
gt2#9 CONFIRMED MED Acceptance (b) had no command; FOLDED: --outcomes.
gt2#10 CONFIRMED MED "AC #2" is DoD #2; FOLDED.
gt2#11 CONFIRMED MED outcomeErrors not unchanged at plan time; FOLDED: mode 'plan'.
gt2#12 CONFIRMED MED D beyond his words; FOLDED (labelled).
gt2#13 CONFIRMED MED Golden exemption and re-run cards missing; FOLDED (cards).
gt2#14 CONFIRMED LOW "no shim" sentence on the task; deleted before launch; filed.
gt2#15 CONFIRMED LOW M16 cite :338 and counts; FOLDED into the operator item; filed.
gt2#16 CONFIRMED LOW Unit slips in measurements; filed.
gt2#17 CONFIRMED LOW Quote forms; v2 quotes verbatim; filed.
gt2#18 CONFIRMED LOW Head mixing in cites; v2 single head; filed.
gt2#19 CONFIRMED MED :1580 pile and "reasonable levels" omitted; FOLDED (pile form).
gt2#20 CONFIRMED LOW Acceptance lines as commands; FOLDED; filed.


SECOND PASS (round 2 of 2, bounded: his :1585 "yes hardening rounds. Today's were warranted, but not endless")
Grounder: grounder-plans-2 (same agent, read-only). Reports ruled: FOLD-VALIDATION.md (fv#1-18) and CROSS-READ.md (xr#1-29, with its O1, O2 and the lists "presented as his" and "decided, not asked", all taken into v3). Ruled by running where they disagreed with the first pass: m3.mjs (task-410 pair with CRIT read as CRITICAL: 9 no line, 4 task: on CRITICAL or HIGH BUG, 1 wontfix above LOW, 34 pass, 19 page lines 1,297 characters: fv#13 right, v2 wrong); seat-file regex run on the three seat reports (12, 18, 20 found); .husky/commit-msg and check() read for xr#9, xr#10; the undo command read for fv#2.
COUNTS: 47 ruled (fv 18, xr 29). CONFIRMED 47: HIGH 4, MED 28, LOW 15. REJECTED 0 (one correction in the reports is not taken as worded: fv#2's strip sentence, ruled above). HIGH and MED folded in v3; LOW folded only where the corrected sentence costs one line, else FILED-LOW.md.
fv#1 CONFIRMED HIGH Run by the fold validator: no command writes the plan material and the per-list body never compares stamped material; FOLDED in both v3 plans (lens-input --material-from, gate compares stamped material to extractSections of the context file).
fv#2 CONFIRMED MED Undo keeps the take note, so an undone or failed launch voids the Plan line; reproduced by reading backlog-lane.mjs:87 and the note at :100. v3 states it and has the grounder re-copy the printed line after checking the only change is the take edit; the report's strip-the-line sentence is NOT taken (the take also adds a notes heading and markers when there were none, so stripping one line would not restore the hash).
fv#3 CONFIRMED MED 399 section 2 did not post the plan review on the task; FOLDED as hand steps (HOW THIS TASK ITSELF IS LAUNCHED).
fv#4 CONFIRMED MED Ran the stated line form against the seat files: rc2 parses 0 of 12 with the v2 form; with the corrected regex 12, 18, 20. FOLDED, one report per task.
fv#5 CONFIRMED MED The rebase-rewrites-shas sentence was ruled FOLDED but is not in v2; added to 399 4.1.
fv#6 CONFIRMED MED 137_mcqueue.md:136 does not name GROUNDER.md (:134 does); and a clean lane has no TRIAGE.md; FOLDED (B2 reads :134, TRIAGE only when it exists). The ruling plan-compliance-375-agents-s7-s11#1 stays REJECTED (B2 is consistent with :134).
fv#7 CONFIRMED MED README.md items 2, 3, 5 and the :142-146 example describe what A3, A4, B, D change; FOLDED: README.md on 375's Files line.
fv#8 CONFIRMED MED The section-4 heading restated a scope the edit set falsifies; FOLDED.
fv#9 CONFIRMED MED Plan outputs for agents-s5-1to3 and queue-137 are stale against the folded board; FOLDED as hand step 7.
fv#10 CONFIRMED LOW Hand-made set cannot satisfy the gate; one line in 375 D1 (panel records keep panel names; the gate applies from the first launch after it).
fv#11 CONFIRMED LOW N counts every evidence file; FOLDED in one line (count context-r*.md).
fv#12 CONFIRMED LOW 4.1 self-contradiction and N undefined; FOLDED in one line each.
fv#13 CONFIRMED LOW Rerun (m3.mjs, CRIT mapped to CRITICAL): 9 no line, 4 task: on a CRITICAL or HIGH BUG, 1 wontfix above LOW, 34 pass, 19 page lines and 1,297 characters; FOLDED. The 30-of-43 claim is dropped.
fv#14 CONFIRMED LOW 139 of 180; FOLDED.
fv#15 CONFIRMED LOW resolve flags; FOLDED (flags stated; the v3 Files line is re-measured by the lane).
fv#16 CONFIRMED LOW Measured limits replace the UNVERIFIED notes (30 KB summary, 600-character ref, 47 refs); FOLDED.
fv#17 CONFIRMED LOW A folded line has no ref (first 20 characters of the quote); a list added after the take is not labelled until check-tasks is rerun; FOLDED, one line each.
fv#18 CONFIRMED LOW A refusal on the board job's commit holds every pending edit; FOLDED with xr#9.
xr#1 CONFIRMED HIGH Task text would hold the approved FINAL BUILD NOTE and v2 with different forms; FOLDED: one appended dated note (never --notes) that governs and lists each replaced sentence; Description and Files rewritten in the same step.
xr#2 CONFIRMED HIGH Plan mode closed MED/HIGH only by a form v2 called impossible; FOLDED: one mode table, cited by both plans (folded replaces fixed in plan mode).
xr#3 CONFIRMED HIGH Acceptance (b) exit 0 needs real fixes in task-410 code outside 399's Files; FOLDED: (b) pastes exit 1 and the measured counts; the exit-0 half is a card.
xr#4 CONFIRMED MED The old brief tells the lane to overwrite the plan and close without the block; FOLDED: brief lines :166, :171 and their test move to 399's Files; the task Description says the override.
xr#5 CONFIRMED MED LOW/NIT forms disagreed; FOLDED: LOW/NIT take task, pile, wontfix whatever the kind (his :1580 overrides rule 6 for LOW and NIT, said in the dated note).
xr#6 CONFIRMED MED HEAD and range base both miss a staged context; FOLDED: read index first, then HEAD (check-lane-close.mjs readRepo order).
xr#7 CONFIRMED MED Context file naming and N; FOLDED: N = 1 + count of context-r*.md, brief writes context-r1.md at launch, date name retired.
xr#8 CONFIRMED MED Same as fv#6; FOLDED.
xr#9 CONFIRMED MED Verified: check() returns 0 on MERGE_HEAD, and the board job holds all edits on a refusal; FOLDED: no finished status through a board edit; binds hooked commits only.
xr#10 CONFIRMED MED Verified .husky/commit-msg runs the lane's own copy of the script; FOLDED: a lane meets the new refusals only if its branch has merged the board; the orchestrator merges the board into each of 396, 407, 406, 387 first.
xr#11 CONFIRMED MED "operator item N" meant three things; FOLDED: the plans' questions are P1 to P5, his list is always ":1557 item N".
xr#12 CONFIRMED MED Four sentences presented readings as his words; FOLDED (all four relabelled; the :1572 item sentences are inside his message because he pasted them back, and originate in the orchestrator's list).
xr#13 CONFIRMED MED The plan round block in Implementation Notes is read as a ruling by every reviewer; FOLDED: it goes under Implementation Plan.
xr#14 CONFIRMED MED "Extracted unchanged" cannot hold with 399's call site; FOLDED: the extraction returns {errors, verdicts, findings} and 375 updates the 399 call site in the same commit.
xr#15 CONFIRMED MED Plan-time context had no writer; FOLDED: the brief command is named; RR numbers are added to the task text after recording decisions.
xr#16 CONFIRMED MED N and the fix round: FOLDED (N = 1 + Review round lines in the HEAD Final Summary; re-run lens outputs are renamed -rN; max_fix_rounds is the written bound, counted by hand).
xr#17 CONFIRMED MED Nobody owned TRIAGE, fix commits and the closing commit; FOLDED in WHO DOES WHAT; AWAITS OPERATOR for the residue (P4).
xr#18 CONFIRMED MED Steps 2 and 3 on these two tasks; FOLDED as hand steps; the lane adds the GROUNDER.md reference once the grounder has ruled.
xr#19 CONFIRMED MED A new flag where the approved route is the existing check-tasks; FOLDED: --refs-only is dropped; check-tasks prints the commands (exit 0), no close refusal.
xr#20 CONFIRMED MED Seat path tree differed by mode; FOLDED in the mode table.
xr#21 CONFIRMED MED A plan changed after launch had no owner; FOLDED: only release and relaunch, or a dated deviation note by the lane.
xr#22 CONFIRMED MED Rulings and cards were duplicated across the plans; FOLDED: 399 records and opens, 375 records only what remains.
xr#23 CONFIRMED MED N20 built before the answer; FOLDED: built on the recommended answer, revert named; the approved "no shim" sentence is kept and a correction is appended.
xr#24 CONFIRMED LOW Rollback: FOLDED, the gate call is the last commit of backlog-lane.mjs so one revert removes it.
xr#25 CONFIRMED LOW Note placement: FOLDED, after the :138 note.
xr#26 CONFIRMED LOW PLAN_SECTIONS overlap: FOLDED, said plainly.
xr#27 CONFIRMED LOW Omission-guard framing: FOLDED in the dated note.
xr#28 CONFIRMED LOW File names: FOLDED, the combined record is copied as GROUNDER-PANEL2.md.
xr#29 CONFIRMED LOW task-400 as fixture: FOLDED, the fixture is chosen on the day.


ROUND 3 (re-run of the lists whose files changed in the task-410 fold, on the v3 text), appended from GROUNDER-R2.md

GROUNDER-R2.md, round-3 adjudication (second grounder pass, the last: his :1585 "yes hardening rounds. Today's were warranted, but not endless") of the SIX re-run compliance outputs on PLAN-399-v3 and PLAN-375-v3 (Spec 08 section 5.3, section 7 rules 3, 4, 6; section 11.2), at board head c15fab7ec (git rev-parse HEAD, branch wf2/board).
Grounder: grounder-r2 (separate from the plan authors, from every DeepSeek author and from the earlier rulings). Read-only on the repo. Rules cited by number at c15fab7ec.
IDS: <output file stem>#<n>, n counted over BUG and DEFER lines only (rule-lists.mjs FINDING_LINE, rule-lists.mjs:279); the stem carries -r2 (plan-compliance-399-agents-s5-1to3-r2). The reviewer's own REJECT and MET lines are not findings and are listed apart. Own ids: g2#1 to g2#3. File names under v3/: plan-compliance-{399,375}-{agents-s5-1to3,agents-s7-s11,queue-137}-r2.txt.
COUNTS r2: 41 ruled (38 DeepSeek BUG/DEFER lines in six outputs, 5+7+6 for 399 and 6+7+7 for 375, plus 3 own). CONFIRMED 22: CRITICAL 0, HIGH 0, MED 6, LOW 16, NIT 0. REJECTED 19. Repeats of an earlier ruling (same ruling applied): 19 (11 REJECTED, 8 CONFIRMED). The reviewers' own REJECT lines: 5, all agreed. All six outputs said FAIL; after ruling, none of the 38 DeepSeek findings is CONFIRMED HIGH; 5 are CONFIRMED MED (2 of those are repeats already folded in v3, 3 need a sentence), 14 LOW go to the pile, 19 REJECTED. Severity is the grounder's own.
MEASUREMENTS RUN (read-only node and grep, scratch scripts in the g-r2 scratch folder):
- node scripts/analysis/rule-lists.mjs resolve --files "<the seven-path Files line of PLAN-399-v3 section 3>": exit 0; 7 lists without --type/--letter; with --type build --letter S 9 lists (agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S); unmatched [] (matches the plan's "v2 measured 9 ... 7 without"). The two added paths resolve, so the Rule 12 launch refusal (137_mcqueue.md:136) cannot fire on them.
- same command on the PLAN-375-v3 Files line with src/tests globs expanded to the named test files: 14 lists, unmatched [], and the same 14 with docs/specs/00-architecture/08_agents.md added (so correction C3 changes no list and no lens count).
- 08_agents.md:521 (TKT-1 dated note 2026-11-19) read: "written by the same tool to docs/reports/reviews/<task>/context-<date>.md"; backlog-lane.mjs:159 builds that name. PLAN-375-v3 A3 retires it and no plan text edits :521.
- grep -rn deepseek-review over package.json, .claude, .husky, .github, scripts, src, docs/specs: generators of a lens command are backlog-lane.mjs:150, :178 and backlog-brief.mjs:167 only (:168 is prose); other hits are tests, package.json:49 (bare alias), docs, comments, rule-lists.json data.
- backlog-decision.mjs:2-8 read: --date, --tasks, appends the M-246 dated note to each named task. 137_mcqueue.md lines read: :20, :24, :26, :59, :91, :103, :114, :125, :131, :161, :165. 08_agents.md lines read: :217, :222, :225, :308, :345, :350, :351, :355, :356, :467, :469-473, :483-488, :510-512, :520-521.
- Verification of the round blocks (script, below): every 'folded' line's 20 characters (trailing space dropped) searched literally in the plan's v3 text.

FORMAT: <id> CONFIRMED|REJECTED [SEVERITY] reason. A CONFIRMED MED carries its correction (C1 to C4) or a verified v3 fold; a CONFIRMED LOW is its own pile line (ids listed at the end).

plan-compliance-399-agents-s5-1to3-r2#1 REJECTED Repeat of plan-compliance-375-agents-s5-1to3#1, same ruling: 08_agents.md:217 says run Ground-truth first, not that a launch gate enforces it; seat-ground-truth-2.md ran, and this adjudication re-read every quoted clause at c15fab7ec (08_agents.md:217, :222, :345; 137_mcqueue.md:103, :131). A further Ground-truth round on the same spec text is the endless round his :1585 excludes.
plan-compliance-399-agents-s5-1to3-r2#2 REJECTED Repeat of plan-compliance-399-agents-s5-1to3#1 and -inc-S#3, same ruling: PLAN-399-v3 builds no BUILT-to-DONE skip (NOT IN SCOPE "the finished-to-finished skip", section 5 "this task changes nothing there"); the refusal on a DONE commit stays as task-410 built it (check-lane-close.mjs:338). P2 wording noted as g2#1.
plan-compliance-399-agents-s5-1to3-r2#3 CONFIRMED LOW Real but cured by measurement now: node scripts/analysis/rule-lists.mjs resolve on the seven-path Files line at c15fab7ec gives exit 0, 7 lists without --type/--letter, 9 with --type build --letter S, unmatched []. The plan sentence "the lane re-measures ... (UNVERIFIED)" (PLAN-399-v3 section 3) is now measured; Rule 12 note (137_mcqueue.md:136) refusal cannot fire. Pile.
plan-compliance-399-agents-s5-1to3-r2#4 REJECTED Repeat of plan-compliance-375-agents-s5-1to3#5, same ruling: 08_agents.md:225 asks for reasoned rejections in the plan record; PLAN-399-v3 step 8 posts GROUNDER-PANEL2.md and FILED-LOW.md (which carry the reasons) as references on the task, and the round block names the grounder file.
plan-compliance-399-agents-s5-1to3-r2#5 REJECTED Repeat of plan-compliance-399-agents-s5-1to3#5, same ruling: the periodic sweep (08_agents.md:222 (b)) is unrelated to outcome lines; the plan builds no scheduler.
plan-compliance-399-agents-s7-s11-r2#1 CONFIRMED MED Spec 08 11.2 (08_agents.md:473) "After folding any review round, and BEFORE implementation" is literal; PLAN-399-v3 step 7 opens another round and says nothing on how its fold is checked or when it stops. Cured by one sentence (C1), no new mechanism; this round is the last (his :1585).
plan-compliance-399-agents-s7-s11-r2#2 CONFIRMED MED Repeat of plan-compliance-399-agents-s7-s11#6, same ruling, fold verified in v3: PLAN-399-v3 4.1 "READING (orchestrator's): the pile is docs/reports/review_followups.md ... until the card of section 9 lands, pile lines in the lane's TRIAGE.md ARE the pile" plus section 9 card for the row; rule 6 (08_agents.md:350) destination cannot be written by a lane today (his :1557 item 1 "after 375").
plan-compliance-399-agents-s7-s11-r2#3 CONFIRMED MED Repeat of xr#5 (second pass), same ruling, fold verified in v3: mode table line "LOW and NIT close by ANY form whatever the kind (his :1580 overrides rule 6, 08_agents.md:350, for LOW and NIT; said in the dated note)"; wontfix on LOW is the approved note's own form (:1557) and "reasonable levels and move on" is :1580. Plan labels the reading.
plan-compliance-399-agents-s7-s11-r2#4 CONFIRMED LOW 08_agents.md:308 fires the Regression Guardian when a diff modifies existing code, but 11.5 (:483) is scoped to Backend/Pipeline (:467) and rule 7 (:351) makes the roster a menu; the seats are the ones his :1580 ordered. Not a plan defect; for the orchestrator when it composes the 375 output round (closeErrors extraction). Pile.
plan-compliance-399-agents-s7-s11-r2#5 REJECTED Repeat of plan-compliance-375-agents-s5-1to3#1, same ruling: rule 2 (08_agents.md:345) is satisfied by the clause re-read at c15fab7ec in this adjudication; no further seat round.
plan-compliance-399-agents-s7-s11-r2#6 REJECTED Premise false: C3 (08_agents.md:356 "every answered card ends with one four-line compliance block") binds answered cards; P1 to P5 are open and unanswered. The block is written when he answers.
plan-compliance-399-agents-s7-s11-r2#7 CONFIRMED LOW Repeat of plan-compliance-375-agents-s7-s11#2, same ruling: P2 and P3 Ground lines paraphrase and cite a location (check-lane-close.mjs:338; 08_agents.md:312) without quoting the rule text (rule 10 (a), 08_agents.md:355). Pile.
plan-compliance-399-queue-137-r2#1 CONFIRMED LOW Same measurement as 399-agents-s5-1to3-r2#3 (resolve exit 0, unmatched []): the launch refusal of 137_mcqueue.md:136 cannot fire on the two added paths; the claim was flagged UNVERIFIED, not false. Severity LOW. Pile.
plan-compliance-399-queue-137-r2#2 REJECTED Premise false: scripts/analysis/backlog-decision.mjs:2-3 takes --date and --tasks and "appends the M-246 dated note to each named task" (137_mcqueue.md:24 Rule 4 note); PLAN-399-v3 step 5 records each ruling through it, so the row gets the dated note with date and verbatim words. Wording to name --tasks/--date is g2#3.
plan-compliance-399-queue-137-r2#3 REJECTED Premise false: Section 9 "cards" are Backlog tasks opened by the CLI (137_mcqueue.md:20 §3 note "for a Backlog task the status line is its front matter"; :26 Rule 8 "a task comment replaces the card"); a card file with a first-line status is the queue-file form (:91), not this home.
plan-compliance-399-queue-137-r2#4 REJECTED Repeat of plan-compliance-399-queue-137#6, same ruling: BUILT is not an open word (137_mcqueue.md:114 Rule 7 covers open rows) and the task front matter read at c15fab7ec carries no expires field.
plan-compliance-399-queue-137-r2#5 CONFIRMED LOW Repeat of plan-compliance-399-queue-137#5, same ruling: the P1 to P5 items carry Ground and Recommend lines in the plan; the OPERATOR task form of 137_mcqueue.md:165 is the channel the orchestrator uses when it puts them to him, not plan content. Pile.
plan-compliance-399-queue-137-r2#6 REJECTED PLAN-399-v3 4.5 lands the 137_mcqueue.md section 4 dated note "in the SAME commit as the check" and the closing block labels the forms as the orchestrator's additions; the spec row exists before the check ships.
plan-compliance-375-agents-s5-1to3-r2#1 REJECTED Repeat of plan-compliance-375-agents-s5-1to3#1, same ruling: 08_agents.md:217 and :222 (a) ask for a Ground-truth run, which seat-ground-truth-2.md was; a required Ground-truth seat at every launch is a new mechanism his :1580 did not order ("for the additions").
plan-compliance-375-agents-s5-1to3-r2#2 REJECTED Premise false: 08_agents.md:225 "Integration ... is its grounder": the separate grounder's verdict per finding (GROUNDER-PLAN.md, checked per finding by D5) IS the second pass; the DeepSeek half is the lens run. Cross-read note was ruled in plan-compliance-375-agents-s7-s11#6.
plan-compliance-375-agents-s5-1to3-r2#3 REJECTED Repeat of plan-compliance-375-agents-s5-1to3#5, same ruling: rejections and reasons are in GROUNDER-PLAN.md and TRIAGE-PLAN.md, referenced on the task (D4).
plan-compliance-375-agents-s5-1to3-r2#4 CONFIRMED LOW Repeat of plan-compliance-375-agents-s5-1to3#3 (LOW), same ruling: PLAN-375-v3 A6 labels the row cut "the orchestrator's reading" of :1546 "or split smaller" and states the limit (a row judged without its column header). Pile.
plan-compliance-375-agents-s5-1to3-r2#5 REJECTED 08_agents.md:222 (a) binds a WF that touches a spec-governed area; the gate scope (build and fix) is stated in PLAN-375-v3 D7 and the operator ordered the gate for builds. Not a plan defect.
plan-compliance-375-agents-s5-1to3-r2#6 REJECTED Repeat of plan-compliance-399-agents-s5-1to3#5, same ruling: the periodic sweep (08_agents.md:222 (b)) is not part of this task.
plan-compliance-375-agents-s7-s11-r2#1 CONFIRMED MED Verified: 08_agents.md:521 (the 2026-11-19 note under TKT-1) says the context file is written to "docs/reports/reviews/<task>/context-<date>.md"; PLAN-375-v3 A3 retires that name and edits no spec text (08_agents.md "not on the line"); engineering standards section 14 wants every cited doc in the same commit (PLAN-399-v3 4.5 cites it). MED, not HIGH: tool naming is the orchestrator's design, no operator ruling is overridden. Correction C3; measured: resolved lists stay 14 with or without 08_agents.md on the line.
plan-compliance-375-agents-s7-s11-r2#2 CONFIRMED LOW Real narrowing: 08_agents.md:470 (11.1) "census grep at the full scope its conclusion covers". Grounder ran grep -rn deepseek-review over scripts, .husky, .github, package.json, src, .claude, docs/specs at c15fab7ec: the only generators of a lens command are backlog-lane.mjs:150, :178 and backlog-brief.mjs:167; the rest are tests, the bare npm alias package.json:49, docs, comments and data. Claim holds; wording "(scripts/analysis only)" should be widened. Pile.
plan-compliance-375-agents-s7-s11-r2#3 REJECTED Premise false: MCINC-8 (08_agents.md:512) binds the orchestrator before a push command, whatever the plan; the plans contain no push step (hand steps end in a local commit and the launch script). Nothing to add to plan text.
plan-compliance-375-agents-s7-s11-r2#4 CONFIRMED MED 08_agents.md:510 note "They apply to every lane and every DB job"; MCINC-7 (:511) "OPERATOR-GO is asked only after both pass". PLAN-375-v3 C says D10b "needs the operator's DB GO" and names no rehearsal. Correction C4 (one clause, cites the existing rule; no new mechanism).
plan-compliance-375-agents-s7-s11-r2#5 CONFIRMED LOW 11.2 (08_agents.md:473) "an expanded edit set kills every restated scope claim": section 1 "D the launch refuses a build whose folded plan was not checked" is narrower in D7 (raw take, other types). D7 and "WHAT THE GATE CANNOT PROVE" already state it; headline wording only. Pile: restate as "the launch through backlog-lane.mjs refuses a build or fix task whose folded plan was not checked".
plan-compliance-375-agents-s7-s11-r2#6 CONFIRMED LOW Same ruling as 399-agents-s7-s11-r2#4 (Guardian: 08_agents.md:308 vs :467 and :351). Pile.
plan-compliance-375-agents-s7-s11-r2#7 CONFIRMED LOW Repeat of rc2#11, same ruling: the 54-minute figure is marked UNVERIFIED in D7 (11.1 wants it run; no per-call timing is recorded). Pile.
plan-compliance-375-queue-137-r2#1 REJECTED Premise false (as 399-queue-137-r2#2): scripts/analysis/backlog-decision.mjs:2-3 appends the M-246 dated note, with --date, to each task named by --tasks (137_mcqueue.md:24). PLAN-375-v3 step 4 records through it. Wording is g2#3.
plan-compliance-375-queue-137-r2#2 REJECTED Repeat of plan-compliance-399-agents-s5-1to3#1 and -queue-137#2, same ruling: neither plan builds a BUILT-to-DONE skip (PLAN-399-v3 NOT IN SCOPE); P2 yes would need its own task and a dated note on the 137_mcqueue.md task-366 note (:136). Wording is g2#1.
plan-compliance-375-queue-137-r2#3 CONFIRMED LOW Repeat of plan-compliance-375-queue-137#4 (LOW) and 399-queue-137#5, same ruling: the OPERATOR-task form (137_mcqueue.md:165) is how the orchestrator presents the items to him. Pile.
plan-compliance-375-queue-137-r2#4 REJECTED Repeat of plan-compliance-375-queue-137#3, same ruling: task front matter carries no expires field (137_mcqueue.md:131 Rule 12 is for queue rows); the order 399 then 375 is a dependency set with the backlog CLI (plan-compliance-399-plan-protocol#4, LOW, filed).
plan-compliance-375-queue-137-r2#5 CONFIRMED LOW Real, small: step 1's dated note lists the approved sentences replaced but not the Description scope lines and Files line that step 2 rewrites (137_mcqueue.md:59 Rule 1 "prior text kept"). PLAN-399-v3 step 1 lists its Files line change. Pile: add "; Files line -> section 3 (README.md added); Description scope lines -> rewritten by step 2" to 375 step 1.
plan-compliance-375-queue-137-r2#6 CONFIRMED LOW Real, small: a ruling note (Rule 4, 137_mcqueue.md:103) written after the Plan line is a plan edit under D3 and forces a copy of the new line. D3 already says the grounder re-copies after a hash change; the plan does not order the note before the last dry-run. Stripping dated notes from the hash is NOT taken (error-paths-375#2: stripping hides edits). Pile: "write any ruling note before the grounder's last act".
plan-compliance-375-queue-137-r2#7 CONFIRMED LOW Repeat of plan-compliance-399-queue-137#4, same ruling: section 0 quotes with an ellipsis are the plan's brevity; the 137 dated note is written from the full MORNING-DECISIONS lines (137_mcqueue.md:125 Rule 10). Pile.
g2#1 CONFIRMED LOW (both plans) Operator item P2 says "built on the recommended answer" but the skip is outside both plans; wording only, so a lane does not read it as scope. Pile: add to P2 "A yes builds nothing here (NOT IN SCOPE); it needs its own task and a dated note on the task-366 note, 137_mcqueue.md:136."
g2#2 CONFIRMED MED (375) PLAN-375-v3 step 5 holds the same re-run-and-rule sentence as 399 step 7 with the same 11.2 gap (08_agents.md:473); twin of 399-agents-s7-s11-r2#1. Correction C2.
g2#3 CONFIRMED LOW (both plans) Step 5 (399) and step 4 (375) say "backlog decision" without the arguments that make backlog-decision.mjs append the M-246 note: --date <his date> --tasks task-N (scripts/analysis/backlog-decision.mjs:7-8). Pile: name them.

REVIEWER'S OWN REJECT LINES (not findings, no id):
399 agents-s5-1to3-r2 reviewer REJECT line 1: REJECT of "presence and form only": agree, plan states it cannot prove a fix is right
399 agents-s7-s11-r2 reviewer REJECT line 2: REJECT of rule 7 security menu and of TKT-1 header: agree (08_agents.md:351; TKT-1 is the brief header :520)
399 queue-137-r2 reviewer REJECT line 1: REJECT of a built deferred check (137_mcqueue.md:29 §6): agree
375 agents-s7-s11-r2 reviewer REJECT line 1: REJECT of MCINC-1: agree (the 2026-11-12 note scopes steps 7 and 8, 08_agents.md:510)
375 queue-137-r2 reviewer REJECT line 1: REJECT of Rule 13 board edit: agree (137_mcqueue.md:161)

SENTENCE CORRECTIONS (only for CONFIRMED MED not already in v3; each is the smallest correction, no new mechanism; apply word for word):
C1 (finding plan-compliance-399-agents-s7-s11-r2#1) PLAN-399-v3, section 2 (HOW THIS TASK ITSELF IS LAUNCHED), hand step 7. OLD (end of step): "the grounder rules the new findings in GROUNDER-PANEL2.md." NEW: the same words, then " The grounder's round-3 rulings (GROUNDER-R2.md) are appended to the GROUNDER-PANEL2.md copy and their sentence corrections applied word for word, then read back against the plan by the same grounder (Spec 08 11.2); this is the last panel round (his :1585): a CONFIRMED finding after it is folded by its own sentence or filed in FILED-LOW.md and opens no further panel."
C2 (g2#2) PLAN-375-v3, section 2, hand step 5. OLD: "the grounder rules the new findings." NEW: the same words, then " The grounder's round-3 rulings (GROUNDER-R2.md) are appended to the GROUNDER-PANEL2.md copy and their sentence corrections applied word for word, then read back against the plan by the same grounder (Spec 08 11.2); this is the last panel round (his :1585): a CONFIRMED finding after it is folded by its own sentence or filed in FILED-LOW.md and opens no further panel."
C3 (plan-compliance-375-agents-s7-s11-r2#1) PLAN-375-v3, section 3 (FILES LINE) and section 10. (a) section 3, in the Files line. OLD: "docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md" NEW: "docs/specs/00-architecture/08_agents.md (one dated note only), docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md". (b) section 3, last sentence. OLD: "08_agents.md and rule-lists.json are not on the line (no gate_from key)." NEW: "rule-lists.json is not on the line (no gate_from key); docs/specs/00-architecture/08_agents.md is on the line for one dated note under the TKT-1 note (:521), which says the review context file is context-<date>.md: the note says it is context-rN.md (A3, A5), in the same commit as the rename (engineering standards section 14); the resolved lists are the same 14 with it (measured)." (c) section 10. OLD: "a dated note in section 4 of 137_mcqueue.md after the :138 note" NEW: "a dated note under the TKT-1 note of 08_agents.md (:521; context-rN.md replaces context-<date>.md) and a dated note in section 4 of 137_mcqueue.md after the :138 note"
C4 (plan-compliance-375-agents-s7-s11-r2#4) PLAN-375-v3, section C (STILL OPEN IN THIS TASK), D10b. OLD: "(needs the operator's DB GO and an id claim)" NEW: "(needs the operator's DB GO and an id claim; the DB GO is asked only after the MCINC-7 rehearsal on the test stack, JOB_TARGET=teststack, then step-validate.mjs --staged and mcbylaws/gate.mjs --ci on the captures: Spec 08 11.8 MCINC-7, :511, which its 2026-11-12 note (:510) applies to every DB job)"
Anchors checked in v3 text: each OLD string occurs exactly once (399: 1 of 1; 375: 5 of 5; script output below).

REVIEW PILE (r2), CONFIRMED LOW, 16 lines (each is its own line above; his :1580 "filed in a review pile for later"): plan-compliance-399-agents-s5-1to3-r2#3 plan-compliance-399-agents-s7-s11-r2#4 plan-compliance-399-agents-s7-s11-r2#7 plan-compliance-399-queue-137-r2#1 plan-compliance-399-queue-137-r2#5 plan-compliance-375-agents-s5-1to3-r2#4 plan-compliance-375-agents-s7-s11-r2#2 plan-compliance-375-agents-s7-s11-r2#5 plan-compliance-375-agents-s7-s11-r2#6 plan-compliance-375-agents-s7-s11-r2#7 plan-compliance-375-queue-137-r2#3 plan-compliance-375-queue-137-r2#5 plan-compliance-375-queue-137-r2#6 plan-compliance-375-queue-137-r2#7 g2#1 g2#3
PILE COUNT NOTE: in the round blocks the pile count e is every CONFIRMED LOW or NIT concerning the task across the three rounds (first pass 60 in FILED-LOW.md split by task, second pass fv/xr LOW which v3 folded at one line each, and the r2 LOW above); the second-pass LOW are counted because a block has no line for LOW and the sum must close. The r2 pile lines should be appended to FILED-LOW.md by the orchestrator when it copies the records.

SEAT ID ASSIGNMENT (mine; the ruled file does not say): int2 and rc2 and gt2 and fv and xr ids are assigned from the one-line reasons in GROUNDER-PLANS.md, to both plans where the folded sentence exists in both. One observation, not a gap: GROUNDER-PLANS.md says fv#1 is folded "in both v3 plans"; PLAN-399-v3 holds no --material-from (399 launches before the gate and has no plan material), so fv#1 is assigned to 375 only.

BLOCKS: ROUND-BLOCK-399.txt 3747 characters, 76 lines; ROUND-BLOCK-375.txt 3859 characters, 82 lines. Verification: 399 74 of 75 folded lines found literally in PLAN-399-v3; 375 78 of 81 found in PLAN-375-v3. NOT FOUND in v3 (CONFIRMED MED whose fold is a sentence correction above, not yet in the text; real gaps until C1 to C4 are applied): plan-compliance-399-agents-s7-s11-r2#1 MED (399): "The grounder's round"; plan-compliance-375-agents-s7-s11-r2#1 MED (375): "rule-lists.json is n"; plan-compliance-375-agents-s7-s11-r2#4 MED (375): "the DB GO is asked o"; g2#2 MED (375): "The grounder's round". No other CONFIRMED HIGH or MED of any round lacks its fold in v3. After C1 to C4 the four lines verify (their phrases are the first 20 characters of the NEW words; C3's is the start of (b)).

VERDICTS
PLAN-399-v3: LAUNCHABLE AFTER THESE SENTENCE CORRECTIONS: C1 only (399 step 7). Nothing else: the other five 399 r2 findings that stand are LOW (pile) or already folded in v3 (s7-s11-r2#2 and #3).
PLAN-375-v3: LAUNCHABLE AFTER THESE SENTENCE CORRECTIONS: C2 (375 step 5), C3 (08_agents.md on the Files line, :521 note, section 10), C4 (D10b rehearsal clause). 375 launches after 399, so C2 to C4 can be applied before the 375 hand steps.
No further panel round is warranted by these six outputs: 19 of 38 findings rejected, 14 LOW, and the 5 MED are one-clause corrections of the grounder's own wording.
