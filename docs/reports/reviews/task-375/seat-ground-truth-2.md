GROUND-TRUTH seat 2, plan altitude, PLAN-399 (sha256 293934956e5c…) and PLAN-375 (sha256 89e3cd334b96…). Read-only.

HEADS READ (moved during the run)
- Board wf2/board: read at 4fda5187d (the plans' head); during the run the board moved to c15fab7ec (task-410 folded by merge; it now carries 410's check script and Spec 08 notes). Script cites below were re-checked at c15fab7ec; Spec 08 lines at c15fab7ec are +10 versus 4fda5187d.
- task-410 branch wf1/inc1b-v2whole: 1dd061188 (the plans' head), bb0559c67, 86ec4611a (last read; task-410 BUILT). Each cite says which head it holds at.
- MORNING-DECISIONS.md read at 1586 lines (entries to :1586).

FINDINGS

gt2#1 HIGH - PLAN-375 acceptance 9 (and D4 dry-run) - cannot be run as written.
Plan: "`node scripts/analysis/backlog-lane.mjs --task task-399 --lane <new name> --dry-run` before the records are in docs/reports/reviews/task-399/: refused ... after the records ... 'plan gate ok' ... (planted: edit one word, refused)". Plan order (section 0): 375 launches AFTER task-399 is folded.
Source: backlog-lane.mjs:63-64, `if (status !== 'LATER' && status !== 'WAITS') refuse(...)`, is not conditioned on --dry-run (same line at 4fda5187d, 1dd061188, 86ec4611a, c15fab7ec). When 375's acceptance is run, task-399 is BUILT or DONE, so the dry-run refuses on status before any gate; the "before the records are in" state no longer exists either (the orchestrator copies the records before 399 launches), and "edit one word of task-399" would edit a closed task.
Correction: name a task still LATER/WAITS (or a planted fixture) for the dry-run, or state that the gate runs before the status refusal in dry-run mode; give the expected output lines.

gt2#2 MED - PLAN-375 A5 - "reproduced" claim is false for build and fix tasks.
Plan: "check-lane-close.mjs:178-214 sets ok when either phase holds an output ... (reproduced: plan-only outputs, 9 lists, 0 of 9 refused)".
Source: check-lane-close.mjs:178 `const phases = build ? ['out'] : ['plan', 'out'];` (same at 1dd061188, bb0559c67, 86ec4611a, c15fab7ec; board 4fda5187d :105). For build/fix, plan-compliance files are never read; a plan-only set leaves every list with no out output and is refused (:216 "has no valid compliance lens output ... write out-compliance-<id>.txt"). "Either phase" holds only for non-build tasks, or after the proposed edit. Today a build task needs only >=1 plan-*.txt (:253). No run output is recorded and which task has 9 lists is not named. I did not run it (no test runner); by code reading the sentence is wrong as a present-tense reproduction.
Correction: say "would let", or name the non-build task and paste the run.

gt2#3 MED - PLAN-375 A5 authority - Spec 08 rule 4 says WF1/WF2 at plan, WF3 at output only.
Plan: 08_agents.md:337 rule 4 ("Run the set at plan AND output for WF1/WF2"), :334 rule 1; applied to every "build or fix task".
Source: :337 continues "...; at output for WF3." and 6.4 gives WF3 a LEAN plan roster ("(RC* or GT)+I+DS(1)"). The plan's quote drops the WF3 clause and does not say whether a fix-type task is WF3.
Correction: state the fix-to-WF mapping or exempt WF3 fix tasks from the plan-phase compliance requirement.

gt2#4 MED - both plans, header - "its Spec 08 lines are +6 below :232" (PLAN-399 section 1 repeats "6 higher").
Source: 08_agents.md rule 1 board :334 -> 1dd061188 :342 (+8), rule 3 :336 -> :344, rule 6 :340 -> :348, 11.2 :463 -> :471; at bb0559c67, 86ec4611a and board c15fab7ec +10 (rule 3 :346, rule 6 :350, 11.2 :473, 11.3 :477). +6 was true only at the earlier 410 head 065f85a02/1163e3d9c. 137_mcqueue.md: +2 from :132 down (notes :134/:136/:138), Rule 3 stays :98.
Correction: give the offset per head, or cite by rule number and sha only (rule 10 note C2 form).

gt2#5 MED - PLAN-399 section 6 - "(Spec 08 :232 dated note says 'sets a lane's task BUILT or DONE')".
Source: the sentence (verbatim) is in the task-366 note at 08_agents.md:229 at 4fda5187d, 1dd061188, 86ec4611a, c15fab7ec. :232 at the board is the 5.4 Schema-Fidelity "Question" line; at 1dd061188 :232 is blank (410 note is :231).
Correction: :229.

gt2#6 MED - PLAN-399 section 4 item 5 and PLAN-375 closing paragraph - wrong precedent line and wrong section for the 137 notes.
Plan 399: "under section 3 in 137_mcqueue.md ... the task-410 note at :132 is the precedent"; plan 375: "a dated note under section 3 of 137_mcqueue.md".
Source: 137_mcqueue.md :132 at 4fda5187d is the task-366 note. The task-410 notes are :100 (the Rule 3 amendment, two-commit close), :136 and :138 at 1dd061188, bb0559c67, 86ec4611a. All these notes sit in section 4 "The rules, with sources" (headings: ## 3. The status line :55; ## 4. The rules :93); Rule 3 itself is :98 in section 4. Section 3 holds the status words (BUILT :78). On the board 4fda5187d the two-commit close is NOT recorded in 137 (it is at c15fab7ec after the fold).
Correction: "under Rule 3 / section 4, after the :100 and :136 notes".

gt2#7 MED - PLAN-399 section 4 item 3 - reading attributed to the operator, and wrong file.
Plan: "(operator, :1522 item 3: generated snapshots exempt, "their own fingerprint check being their proof"; the dated task-410 note in 137_mcqueue.md)".
Source: MORNING-DECISIONS.md:1522 his words: "you are probaley rebuilding stuff that already exists you do this all the time. 1-5 y". Item 3 as put (:1521): "Exempt generated snapshots from review material. My recommendation: yes." The phrase "their own fingerprint check being their proof" is at :1524 under "Orchestrator readings (mine, not his words)". The exempt rule is in 08_agents.md:231 (task-410 note, 410 branch); 137_mcqueue.md has no review-exempt text in any 410 note (the only "exempt" in 137 is :23, about commit types).
Correction: his ruling is "y" to the item as put; mark the fingerprint clause as the orchestrator's reading; cite 08_agents.md:231.

gt2#8 MED - PLAN-399 section 1 and section 4 item 1 - "adds no rule", wontfix authority, and wontfix severity widened beyond what he approved.
Plan: "ENFORCES rules that already exist and adds no rule"; "wontfix:"<60+ characters>" (a rejection with reasons, rule 3 and 5.3)"; "wontfix: and the bulk REJECTED form cover MED, LOW and NIT".
Source: 08_agents.md:336 rule 3 "fold survivors, file rejections with reasons" (CONFIRMED findings are the survivors; they are folded); :227 5.3 "Rejected findings are written to the plan with reasons" (findings the round-2 REJECTS). A CONFIRMED finding closed as "won't fix" has no home in rules 3, 5.3 or 6 (rule 6 :340: BUG -> WF3, DEFER -> review_followups.md). The approved NOTE-399 (operator "approved", :1557, file NOTE-399.md line 8) reads: `<id> wontfix:"<60+ chars>" (a rejection with reasons, rule 3 and 5.3; LOW and NIT only)`. The plan widens to MED and does not mark it.
Correction: LOW and NIT only, or mark MED as AWAITS OPERATOR; call wontfix a new disposition (a reading), not an existing rule.

gt2#9 MED - PLAN-399 acceptance (b) names no command.
Plan: "Run the new block on task-381's real GROUNDER.md ... prints 'checked 36 ids' ... exit 0".
Source: the block is an exported function in check-lane-close.mjs ("No new script"); no entry point runs it on a lone GROUNDER.md, and the hook prints only errors. Numbers verified: GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/hooks3/ has 144 VERDICT-regex lines, 36 CONFIRMED, 108 REJECTED, 0 CONFLICT (task-399's own text says 35; plan is right); the branch wf1/inc1b-hooks3 holds no GROUNDER.md (verified).
Correction: name the command (a test calling the function, or the hook on a planted lane dir) and where the count line prints.

gt2#10 MED - PLAN-399 section 5 - "AC #2 of the task binds".
Source: task-399 view: "No acceptance criteria defined" (plan says so itself in section 2). The red-first line is DoD #2 ("The tests were written first and proven red, then green"); AC #2 is task-375's.
Correction: "DoD #2".

gt2#11 MED - PLAN-375 D3/D1 and PLAN-399 section 4 - outcomeErrors cannot be "called unchanged" at plan time.
Plan 399: "assumes no lane directory, so task-375's plan gate calls it unchanged on the plan-time records (path of fixed: may then be a task file)". Plan 399 item 1 defines `fixed:<sha>` as "an ancestor of HEAD, not of the range base, touches <path>".
Source/gap: the plan-time launch has no branch and no range base (L is the take commit, created after the gate). "Not an ancestor of the range base" is undefined for a board-side fold. UNVERIFIED (design; no code yet).
Correction: define the plan-time base (for example the previous review round's commit) as an argument, or say the function is not unchanged.

gt2#12 MED - PLAN-375 section D - what he asked versus what D writes.
His words (:1572, verbatim, the entry '… ORDERS the two binding checks added …'): "Can we add these to the three tasks remaining taks for the four steps. run the full panel on them? We need to get this right? - Item 10: a grounder checks the folded plan before any build starts, so I cannot launch a build on an unchecked plan. ...". Orchestrator reading (5) at :1573: the amendments are "applied to the tasks only after the panel and his agreement". Entry :1580: he wants reality check and integration run on the additions.
D DOES: refuse the launch (binds the orchestrator) - what he asked.
D MORE: a `Plan: sha256` line and a new `plan-sha` subcommand, a `Cross-read:` line, DeepSeek plan compliance outputs for EVERY list, a TRIAGE for plan findings, a close re-proof, a new rule-lists.json key gate_from. None is in his words; DoD #8 / 124a R-IZ (:992) "no scope its ruling did not name". Only D-exempt is marked AWAITS OPERATOR; D1-D5 read as decided.
D LESS (stated by the plan): it cannot prove the grounder checked or differs; a raw `backlog task edit -s RUNNING` is caught only at close (so "I cannot launch" is not met); Integration and Ground-truth seats, and the reality-check/integration he asked for at :1580, are not checked.
Correction: label D1-D7 a proposal for his agreement and list the added mechanisms by name.

gt2#13 MED - Cards owed for approved items are not opened or named.
Source: MD:1556-1557 items 2 (golden exemption, "Yes") and 7 (re-run changed chunks only, "Yes, after 375") approved. PLAN-399 opens cards for the literals and the review_followups row only; PLAN-375's pre-launch list opens only the literals card and says item 2 is "a table row on its own card", item 7 "card after 375". No such task exists in backlog/tasks (checked by listing). Spec 137 Rule 2 (:95): "Every task is registered ... A task with no row does not exist."
Correction: add both cards to the orchestrator's pre-launch list.

gt2#14 LOW - PLAN-375 N20 (AWAITS OPERATOR) - correctly unanswered; one gap.
Verified: his words at :1422 are "approved [the five items pasted] - remember the app is not beign used - we are in development" (decision-113 holds the tail exactly). No entry answers it (no "shim" or "compatibility" in the log). BUT task-375's Implementation Notes today still hold the approved NOTE-375 sentence "outputs hashed over the placeholder are refused afterwards and there is no shim (RR-0328)" (appended under his "approved" :1557, item 0). Until the D1/D2 note is appended, the task file carries the reading as approved text. Also the RR-0328 line was said about the table-driven page conversion, not about review outputs; the plan's question is fair but should say so.

gt2#15 LOW - PLAN-399 section 6 (M16, AWAITS OPERATOR) - unanswered (grep: no BUILT-to-DONE entry). Counts: BUILT with @lane assignee = 30 at 4fda5187d (31 at c15fab7ec, task-410 now BUILT). The skip is at check-lane-close.mjs:338 (`... === status) continue`), not "about :326-336" (:326 is the finished-statuses set). "Already closed BUILT through the lane check": the lane check dates from task-366 (2026-11-20); not shown that all 30 passed through it (UNVERIFIED).

gt2#16 LOW - PLAN-375 A2 and A7 numbers - reproduced, with unit slips.
I reproduced by read-only node on v2whole 86ec4611a (buildLensInputs, max = 120000 minus context size, lens-compliance.md): task-381 resolves 15 lists; calls: no context 17, 2,126 chars 17, 32,698 chars 38, 78,442 chars 88 with surface-135 refused; with 60,000-char material and 2,126 context 3 of 55 lists refused: bylaw-133, surface-135, policy-124-s2-s5. change.diff 19,138 bytes / 19,131 chars; whole context 32,698 chars (committed file on wf1/inc1b-hooks3); task-267 context 78,442 bytes. Slips: "five sections (2,126 characters)" - GROUNDER-NOTES Appendix 1 says "about 2,126" (1,730 of four headings + 417 of notes; no committed context has an Implementation Notes heading; the four existing sections measure 1,760 chars here). "surface-135 '## Register' 77,056 characters (46 table rows, longest 8,077)": measured 77,055 chars; 46 pipe lines = 44 data rows plus header and separator; longest row 8,060 chars (8,077 not reproduced; may be bytes). policy-124 section 5 55,839 chars exact; bylaw-133 "74 KB" = 74,730 chars / 75,797 bytes.

gt2#17 LOW - quote forms. PLAN-399 section 1/9: rule 6 quoted as "BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons"; spec :340 has "→" and backticks (paraphrase in quote marks). PLAN-375 section D: 11.2 quote is a condensation of :464 (the text sits on :464; :463 is the heading), "+" and bold dropped. PLAN-399 (e)/section 6: "Yes, after 375" is the auditor's recommendation text under his "approved" (:1556 put-to, :1557 his word), not his words. PLAN-399 section 4: "TRIAGE.md ... (the layout the check already reads)": check-lane-close.mjs never mentions TRIAGE.md (grep); it reads lane-dir files generally; existing TRIAGE.md files (e.g. docs/reports/lanes/2026-11-19/BL-R11/TRIAGE.md) are a KEEP/REJECT table, not the new outcome lines (the README:109 correction covers the text, not old files).

gt2#18 LOW - head mixing in PLAN-375 cites (the plan labels some "board", some "at 1dd061188", some none).
backlog-lane.mjs: compliance command `per` is :153 at 1dd061188/86ec4611a/c15fab7ec but :152 at 4fda5187d; "lens line and its call :149 and :178 at 1dd061188": lensLine is defined :147, :149 is the `const f` helper, the call is :178 (board 4fda5187d :177); :159 ctxRel, :160 ticket, :100 take note, :104 take, :122-123 worktree add all true. rule-lists.mjs renderPage ":464" is the buildLensInputs call inside renderPage (defined :446 at 1dd061188). backlog-brief.mjs :46, :65-98, :154, :167, :171 true at all heads. PLAN-375 B3 "this task's AC #3" names GROUNDER.md: AC #3 says only "a separate grounder verdict on file". PLAN-375 RULES CITED lists rules 3, 6, 7 (:336, :340, :341) that the body never uses.

gt2#19 LOW - operator entries the plans do not cite: :1580 (low-priority findings filed in "a review pile for later"; RC + Integration for the additions; "We test them to reasonable levels") and :1584-1586 ("yes hardening rounds. Today's were warranted, but not endless"). PLAN-399 sends a DEFER to a named task card (not a pile) until the row exists; both plans carry long planted-test lists with no statement of the "reasonable levels" bound. These are readings by omission, not wrong facts.

gt2#20 LOW - acceptance sections (item 7).
PLAN-399: (a) restates the test list (red then green; paste hook output) - command given (the hooks), expected output not; (b) real input with expected exit codes and count (good) but no command (gt2#9); (c) command and expected ("task view shows it"); (d) a rule, not a command.
PLAN-375: 0 command, no expected output; 1 command + 4 expected greps (good); 2 command + "about 17, none refused" (about); 3 list of planted refusals (restates tests); 4, 5 command + expected; 6 "stay green" with no command; 7, 8 "test red first then green" (restatement; 8 needs the DB GO); 9 not runnable (gt2#1). `backlog task edit --ac` appends after the existing AC #1-#4, so numbers 0-9 will not be the task's numbers.

VERIFIED TRUE (checked, no finding): MD :1517, :1522, :1541, :1546, :1557, :1570 verbatim and on those lines; :1422 and decision-113; "no shim (RR-0328)" is not his ruling (plan correct); 9 resolved lists for the 399 Files line (`rule-lists.mjs resolve`, unmatched []); no review_followups.md row (resolve refuses); board 3 commits ahead of the 410 merge-base d17fc7499 and backlog-only; 36 CONFIRMED / 0 CONFLICT; 30 BUILT with lane; ms-9 the only comma path, 16 tasks in m-11; rule-lists.logic.test.ts:434-438; check-task-files.mjs:70; .husky/pre-commit:17-19 "no flag or environment variable turns it off"; deepseek-review.js :106-121, :111 (throw), substring `includes`, :189 placeholder, --dry-run and --section exist; lens-compliance.md :12, :14, :30, {{PLAN}} :34 once; README :104, :109, :115; lens-security.md:48; Spec 08 :227, :334, :336, :337, :338, :340, :346, :347, :451, :459, :463, :467 at 4fda5187d; 124a:296, :992; 132:154; plan-protocol :12, :44; check-lane-close.mjs :65, :133, :144, :146, :149, :150, :158, :178, :214, :253, :264, :306 at 1dd061188, 86ec4611a, c15fab7ec; test pins backlog-lane.logic.test.ts:257 and :245; the take note at backlog-lane.mjs:100 matches "taken on the board at lane launch"; task-366 already fixed the template ({{PLAN}} once, function replacer at review-template.js:74-78); "--stage only prints" true (backlog-lane.mjs:39,49,135,159; backlog-brief.mjs:154); "--plan field read by nothing" true for the launch/close/brief scripts (grep; brief:166 only tells the lane to set it); "check-tasks is in no hook" true; "no hook looks at a launch" true (husky grep; check-lane-close finds L only at close). Design note (3) rejected: the board job (scripts/board/board-commit.zsh) runs `git add backlog` then one commit through the real hooks, a refusal is a WARN and the edits stay for the next run - so the plan's "unverified how the job handles a hook failure" is now verified, and one refused task would indeed hold every pending board edit; the board auto-commit does pass through check-lane-close (PLAN-399 section 1 true).

SIX STEPS: PARTS NEITHER PLAN NOR TASK-410 PROVIDES
1. Step 2, "findings ... posted to the task": nothing puts the plan-review outputs, GROUNDER or TRIAGE on the task before launch (D1 stores them in docs/reports/reviews/<id>/ on the board; B3 puts REPORT/GROUNDER/TRIAGE in references only at close). Plan-stage lens findings' own file:line cites are not checked (only the grounder's verdict quotes).
2. Step 3, "grounder ... attached to the task": at plan time the grounder file is board evidence, not a task reference; attached only at close.
3. Step 4, "folded plan checked by a grounder": D proves a grounder file exists, names differ, and the plan hash is unchanged since; it cannot prove the findings were folded, that the grounder re-executed anything, or the Integration/Reality-Check/Ground-truth seats ran; raw takes pass until close; tasks 399 and 375 themselves and pre-gate launches are manual or exempt.
4. Step 5, forgery: 410 is an omission guard; forgery routes tasks 401 and 402 are LATER, unbuilt (board and 86ec4611a).
5. Step 6, "visible on the task": the final summary shows only counts and two paths; each outcome and each wontfix reason sits in TRIAGE.md (a referenced file), not on the task page. DEFER lands on a card until the review_followups row (card not yet opened, gt2#13); he asked for a review pile (:1580).
6. Claude-seat findings (Integration, Ground-truth, RC) are in no GROUNDER.md, so step 6's outcome check never sees them.
7. Step 1 "sized": covered by A4/A7 except one row or paragraph over the room (still refused) and the declined priority/summary items; and 375's A is unbuilt (his ":1580 Step 1 is complete" is his statement; the log's own record says the reviewer-context part is not built).

COUNTS
Cites checked: 112; wrong: 10 (header +6; :232; 137 :132 precedent; 137 section 3; exempt cite to 137; "AC #2"; :326-336; plan-375 :149 lens line; renderPage :464 label; AC #3 naming GROUNDER.md). Several more are head-dependent (listed gt2#18).
Quotes checked: 30; wrong or inexact: 3 (rule 6 arrow form; "fingerprint check" clause taken from the orchestrator reading; "Yes, after 375" auditor text) plus 1 meaning misuse (rules 3 and 5.3 for wontfix of a CONFIRMED finding, gt2#8).
Ruling attributions checked: 26; wrong: 1 (fingerprint clause under "operator", gt2#7); partial: 2 (the D design headed "operator :1570", gt2#12; wontfix severity widened past the approved note, gt2#8). N20 and M16 correctly marked AWAITS OPERATOR and truly unanswered; D-exempt unanswered.

UNVERIFIED
- No test or hook run (no runner): gt2#2 rests on code reading; --final-summary then --append-final-summary in one `backlog task edit` ordering (PLAN-399 acceptance 3) not run (CLI binary is a wrapper; help says --final-summary replaces); `--add-ref` de-duplication; "30 BUILT all passed the lane check"; the "supporting function, advances none of doc-2 A to G" statement; the two Claude seats' content; whether the 36 golden before-image files are covered by the current exempt globs.
- I wrote two scratch files under $TMPDIR (task views and one measuring script, meas.mjs) before noticing that the brief forbade any temp file; nothing in the repo or scratch directories of the project was changed.
