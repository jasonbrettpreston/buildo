# FOLD-VALIDATION: second pass on the folded plans of task-399 and task-375 (Spec 08 11.1, 11.2)

Read-only. Board c15fab7ec. PLAN-399-v2.md sha256 8240fd823cf1, PLAN-375-v2.md sha256 f9ca24939274, GROUNDER-PLANS.md 215 findings, FILED-LOW.md 60.
Scratch clone of the board (depth 1) used only for backlog CLI edits and backlog-lane --dry-run; deleted afterwards.

## Counts

Executable claims listed: 63. TRUE 45, FALSE 8, NOT EXECUTABLE UNTIL BUILT 10 (one of these also UNVERIFIED: 270 calls, 54 minutes; one UNVERIFIED: 52 of 153 unaddressed).
Findings: HIGH 1, MED 8, LOW 9.

## Measured limits (clone of the board)

- --add-ref: 103-character path accepted whole; 600-character path accepted whole (also in --plain); 47 references on one task accepted; comma splits one argument into two references ("docs/specs/a" and "b/file name.md"); a space is kept; identical references are deduplicated; --ref replaces, --clear-refs clears. No limit found.
- Final Summary and Implementation Notes: 2,050 / 10,242 / 30,722 characters accepted, in the file whole (last character present), and task view --plain showed all (plain output 11,379 / 27,763 / 68,723 characters for both fields together).
- --final-summary then --append-final-summary in one edit: replaces then appends; run twice leaves one block; reversed flag order gives the same result. --check-ac of an index that does not exist makes the whole edit "No changes were applied" (a status move in the same command is lost).
- --ac appends (task-375 AC 1-4 then 5, 6; task-399 with none starts at 1), commas kept; --plan and --notes replace.
- References survive the board job (it only runs git add backlog; no hook reads references).

## Findings

### fv#1 HIGH: 375 D1/D5: a plan input cannot be produced as written and is not bound to the plan text

Ran: rule-lists lens-input takes a --material file; deepseek-review --section cuts only the --context file (:176); no command writes the PLAN_SECTIONS material. The per-list body D5 extracts (REVIEW header, stamp, prompt hash, whole list) never compares the stamped material with anything: run on the 9 real panel outputs with phases [plan], 7 of 9 lists pass although the material was PLAN-399.md v1, not any task text. A plan review of some other text would pass the gate.

Corrected sentence: D1 add: "The material of a plan input is written by node scripts/analysis/rule-lists.mjs lens-input --list L --material-from <context-rN.md> --out <dir>/in-plan-compliance-L, which cuts PLAN_SECTIONS with extractSections." D5 add: "planGateErrors refuses a plan input whose stamped material is not extractSections(context-rN.md, PLAN_SECTIONS) for the context file whose text produces the output's prompt_sha256."

### fv#2 MED: 375 D3 and the launch undo: the take note is in the body, so any undone or failed launch voids the Plan line

Ran: backlog-lane.mjs prints undo = "backlog task edit <id> -s LATER -a ''", which keeps the appended take note. Clone: hash be2122d18b19 before, 5f5a0c32f0e5 after the take edit. The next launch of the same task is refused until a grounder runs again. The same holds for the "release and relaunch" of section 2.

Corrected sentence: D3 add: "The hash is computed with every line matching ^\d{4}-\d{2}-\d{2} taken on the board at lane launch removed (the launch script's own line; no other stripping)." or the undo command removes that line.

### fv#3 MED: 399 section 2 does not tell the orchestrator to post the plan review on task-399 (operator parts S2 and S3 for the task launched first)

Ran: 399 section 2 copies the panel records to docs/reports/reviews/task-399/ and commits them; it never adds the references or the plan round block to the task. 375 D4 does both, but only for launches after the gate.

Corrected sentence: 399 section 2 add: "Before launch the orchestrator also adds, one --add-ref each, the repo paths of GROUNDER-PLANS.md, FILED-LOW.md and each seat report to task-399, and appends with --append-notes the plan round block of PLAN-375-v2 D4 (counts, grounder path, one line per CONFIRMED CRITICAL, HIGH or MED finding of the 399 plan outputs)."

### fv#4 MED: 399 4.3 / 375 D2: the seat finding line is not specified and the shared seat files break per-task outcomes

Ran: seat-reality-check-2.md writes findings as "### rc2#1 HIGH: ...": a line parser built on the stated form "<seat id>#<n> <SEV> ..." finds 0 of its 12 findings and the check passes it vacuously (int2 18 and gt2 20 parse). Each seat file covers both plans: 17 headlines name 375, 11 name 399, 8 both, 14 neither, so each task would need outcomes (folded: needs a quote in that task) for the other task's findings.

Corrected sentence: 4.3 add: "A seat finding line is /^\s*(#+\s+)?([a-z0-9]+)#(\d+)\s+(CRITICAL|HIGH|MED|LOW|NIT)\b/; a Seat file with no such line is refused. A seat report is written once per task." and D2 the same.

### fv#5 MED: GROUNDER-PLANS ruling plan-error-paths-399#5 is marked FOLDED and is not in either v2 text

Ran: The ruling reads "lines are re-recorded with the new shas after the last rebase (stated in 4.1)"; grep rebase and re-recorded in PLAN-399-v2.md and PLAN-375-v2.md: 0 hits.

Corrected sentence: 399 4.1 add after the fixed: form: "A sha that a rebase or amend rewrote is no longer an ancestor of HEAD and is refused; the orchestrator re-records the fixed: lines with the new shas after the last rebase."

### fv#6 MED: 375 B2 cites 137_mcqueue.md:136 for GROUNDER.md, and requires TRIAGE.md at every close

Ran: :136 does not name GROUNDER.md (:134 does); the REJECTED ruling plan-compliance-375-agents-s7-s11#1 rests on the same false cite. 399 4.1 passes a lane with zero CONFIRMED ids and no TRIAGE.md, so "refuses when one is missing" refuses a valid close.

Corrected sentence: B2: "At close the task's references hold the repo copies of REPORT.md, GROUNDER.md (137_mcqueue.md:134) and, when the lane directory holds one, TRIAGE.md; the close refuses a missing one of them and prints the exact backlog task edit --add-ref command."

### fv#7 MED: 375 changes behaviour README.md documents and README.md is not on its Files line (and 399 edits only :109)

Ran: README.md "Rule lists" items 2, 3, 5 and the --context example at :142-146 describe the launch, the lens line and the close that A3, A4, B and D change; eng-all section 14 (cited by 399 4.5) says a behaviour-changing rule updates every cited doc in one commit.

Corrected sentence: 375 section 3 add .claude/review-templates/README.md to the Files line and A3 add: "README.md items 2, 3 and 5 and the :142-146 command are updated in the commit that changes the lens commands."

### fv#8 MED: 399 4 heading restates a scope the edit set falsifies (11.2 sub-rule)

Ran: "SCOPE (all in check-lane-close.mjs ...)" while 4.4 edits README.md, 4.5 edits 08_agents.md and 137_mcqueue.md, and section 3 adds the test file.

Corrected sentence: 399 section 4 heading: "SCOPE (the check is in check-lane-close.mjs; 4.4 and 4.5 edit README.md, 08_agents.md and 137_mcqueue.md; tests in check-lane-close.logic.test.ts)".

### fv#9 MED: the panel plan outputs for two lists are stale against the board as it is, so a gate would refuse them

Ran: closeErrors with phases [plan] on the real 399 outputs: agents-s5-1to3 and queue-137 "committed inputs do not carry the whole list as it is now" (08_agents.md and 137 changed in the task-410 fold after the panel ran at 4fda5187d). The refusal is right; the compliance review of those two lists saw older text than the folded plans cite (:229, :100, :136, :138).

Corrected sentence: 399 and 375 section 2 add: "Re-run the plan compliance lens for agents-s5-1to3 and queue-137 on the v2 text before launch and have the grounder rule the new findings."

### fv#10 LOW: A hand-made evidence set from the panel files cannot satisfy the 375 gate (names, ids, form)

Ran: Scratch closeErrors copy with the renamed panel files and GROUNDER-PLANS.md as GROUNDER.md: 89 errors: no Lane: header, 11 Ruled: lines missing, 73 of 73 lens findings "no complete verdict line" (the panel file writes "<id> CONFIRMED MED reason", no path:line "quote"), the ids differ once plan-compliance-399-<id> is renamed plan-compliance-<id>; further absent by inspection: Seat, Plan, TRIAGE-PLAN (101 ids for 399: 51 + 50 seat), round block, references. Every refusal is right. 399 and 375 launch before the gate, so none applies to them.

Corrected sentence: 375 D1 add: "The panel records of task-399 and task-375 keep the panel names and are not re-keyed; the D1 names apply to the first task launched after the gate."

### fv#11 LOW: 375 A5: "N = files already there + 1" counts every evidence file in the shared folder

Ran: the folder also holds plan outputs, seat files, GROUNDER-PLAN.md: the first context would be context-r41.md

Corrected sentence: A5: "N = the number of context-r*.md files already there + 1".

### fv#12 LOW: 399 4.1 contradicts itself on earlier malformed lines; 4.2 never defines N of "Review round N"

Ran: "a line that starts with a known id and fits no form is an error" vs test "an earlier wrong line does not matter"; the checker cannot compute N

Corrected sentence: 4.1: "Only the last line for an id is judged; earlier lines are ignored." 4.2: "N = 1 + the highest rN of the out-*-rN.txt files in the lane directory, 1 when none."

### fv#13 LOW: acceptance (b) and the fit numbers do not reproduce

Ran: 4 not 3 task: refusals, 34 not 35 passes, 19 not 18 lines; "30 of 43 fixed" is 39 of 39; "30 of 86" is 27 tests

Corrected sentence: (b): "of the 48, 9 have no line, 4 are task: on a CRITICAL or HIGH BUG, 1 is a wontfix above LOW, 34 pass the form checks"; delete the "30 of 43 real fixed lines" sentence or state 39 of 39.

### fv#14 LOW: 375 D7 count

Ran: 139 of 180 open build or fix tasks have no resolvable list (not 135 of 181)

Corrected sentence: D7: "139 of 180".

### fv#15 LOW: 399 says 9 lists without the flags that give 9

Ran: resolve --files alone gives 7

Corrected sentence: 399 section 3: "(rule-lists.mjs resolve --type build --letter S)".

### fv#16 LOW: measured limits replace the two UNVERIFIED notes

Ran: Final Summary and Notes accept 30,722 characters whole; --add-ref took a 600-character path and 47 references

Corrected sentence: 399 4.2: "Measured: backlog accepts a 30 KB Final Summary and shows it whole in task view --plain." 375 D4: "Measured: --add-ref took a 600-character path and 47 references; a comma splits one."

### fv#17 LOW: 375 D4 round block line for a folded outcome has no ref; deleted B1 printer leaves labelling unenforced after a Files edit

Ran: the line form "<id> <SEV> <form word> <ref>" has no ref for folded:; a list added to the Files line after the take gets no compliance reference and nothing refuses it (his :1541)

Corrected sentence: D4: "ref for folded is the first 20 characters of the quote". B1: "A list added to a Files line after the take is not labelled until --refs-only is run again (stated)."

### fv#18 LOW: 399 section 1 says the check also runs on the board job's commit; 375 D0 rejects a board-commit refusal because one refusal holds every pending edit

Ran: the hold-all hazard applies equally to a BUILT move made on the board; ruling plan-plan-review-deepseek-399#5 rejected it as existing behaviour of task-410

Corrected sentence: 399 section 1 add: "A refusal in the board job's commit leaves every pending backlog edit in the tree; the orchestrator moves a task to a finished status only in a lane closing commit."

## Four added parts walked on task-399 as it will be launched (by hand, before any gate)

- S2 plan findings posted to the task: owner orchestrator; command backlog task edit task-399 --append-notes "<plan round block>" and --add-ref per file; PLAN-399-v2 does not say it (fv#3). The block lines are computable from GROUNDER-PLANS.md (87 CONFIRMED HIGH/MED across both tasks; about 6 KB; well under the 30 KB measured).
- S3 grounder file referenced at plan time: place docs/reports/reviews/task-399/GROUNDER-PLANS.md (committed by hand first: the launch refuses a board dirty outside backlog/, and a docs commit needs no Task trailer); then --add-ref by repo path (about 50 to 90 characters; fine). Name: the panel file is GROUNDER-PLANS.md, 375 D1 calls it GROUNDER-PLAN.md.
- S4 folded:"<quote>" and Seat: lines: exist only in 375 (gate, mode plan); for 399 launched first they are done by hand and checked by nothing. Where each file sits: seats docs/reports/reviews/task-399/seat-integration-2.md, seat-reality-check-2.md, seat-ground-truth-2.md; plan outputs plan-*.txt there; TRIAGE-PLAN.md there (does not exist for the panel: 101 ids for 399 need an outcome if the gate is ever run on it). The hand evidence run through a scratch copy of the gate body: 89 refusals (fv#1, fv#9, fv#10); each refusal is right.
- S6 outcome lines in the Final Summary and seat findings in the lane grounder file: at the 399 close the lane runs backlog task edit task-399 --check-ac <n> --final-summary "<landed>" --append-final-summary "<block>" -s BUILT (measured to work, one block on a rerun); seats write seat-<name>-N.md in the lane directory, GROUNDER.md names it "Seat: <name> <repo path> sha256:<12>" (a lane grounder must write the sha; no command prints it: sha256 of the file, first 12 hex, by sha256sum); N of the round line is undefined (fv#12).

## Scratch evidence check (task-399, hand-made set from this panel)

Per-list body (REVIEW header, stamp, prompt hash with placeholder context, whole list): 7 of 9 lists pass, agents-s5-1to3 and queue-137 are refused as stale (right). Grounder block: no Lane header, 11 Ruled lines missing (expected lines printed, e.g. Ruled: plan-compliance-queue-137.txt sha256:c957119824fc findings:8), 73 findings without a complete verdict line. Seat, Plan, TRIAGE-PLAN, round block and references: absent. Total 89 refusals from the executed part.

## Fold check

REJECTED: all 20 with a lens HIGH read (plus 12 others, 32 of 68): 30 rulings right; two doubtful: plan-compliance-375-agents-s7-s11#1 (false cite :136, fv#6) and plan-plan-review-deepseek-399#5 (reasoning against 375 D0, fv#18; verdict stands); plan-plan-review-deepseek-399#7 right with a wrong line cite (:244, the refusal is :268). CONFIRMED HIGH/MED: 36 of 87 checked against the v2 text, 35 present at the claimed place, 1 absent (fv#5). The 60 LOW/NIT are all in FILED-LOW.md.

## Deletions and the six steps

No requirement falls silently except: the :1541 labelling after a Files-line edit (fv#17, stated for the first fill only); step 4 binds only through the script (stated); the 11.2 adversary is a free-text note nothing reads (stated). Step 2 at close still needs one plan-stage output (:253 unchanged).

## Claims table

| status | claim | evidence |
|---|---|---|
| TRUE | A1 plan hash stable before the take, --dry-run on a real LATER task | backlog-lane --dry-run on task-400 (clone): hash be2122d18b19 before and after; --ref and --add-label leave it be2122d18b19; the real take edit (-s RUNNING -a, --append-notes) moves it to 5f5a0c32f0e5 |
| TRUE | A2 plan-only set for a build task refused at c15fab7ec | closeErrors on the 9 lists of task-399 with the panel outputs renamed plan-compliance-<id>: 12 errors, all 9 lists "no valid compliance lens output ... write out-compliance-<id>.txt" (phases is [out] at :178) |
| TRUE | A3 findingsIn ids <stem>#<n> cannot collide | findingsIn: stem = output file name, one counter per file; a collision needs a file name holding "#" |
| TRUE | A4 BL-V2WHOLE: 48 CONFIRMED/CONFLICT, last line per id leaves 9 with no line | run: verdict ids 190, 48 non-REJECTED, 9 no line (agents-s5-1to3-p2#4,#5, eng-all-p3#4, five-words-p1#5,-p2#2, ms-S-p1#4, plan-protocol-p2#4, policy-124-p1#1,-p3#2) |
| TRUE | A5 --final-summary then --append-final-summary in one edit, run twice: one round line | clone: run 1 and run 2 both end "landed X / ROUND-LINE" once; reversed flag order gives the same (replace first, then append) |
| TRUE | A6 VERDICT regex cannot carry a path with spaces | regex test: "backlog/tasks/task-399 - Foo.md:12" false; "docs/reports/reviews/task-399/context-r1.md:12" true |
| TRUE | A7 notes-cap does not apply to 137_mcqueue.md | gates/notes-cap.mjs reads only *.notes.json declared by converted steps (header, readConvertedJson) |
| TRUE | A8 four --context call sites: backlog-lane.mjs :150 and :178, backlog-brief.mjs :167-168 | grep deepseek-review scripts/analysis: those four lines plus a comment at rule-lists.mjs:27; (:150 is the cmd constant, the "per" text is :153) |
| TRUE | A9 3 of 55 lists refused at 60,000 characters | buildLensInputs over all 55 lists: refused bylaw-133 (74,730), surface-135 "## Register" (77,056), policy-124-s2-s5 s5 (55,839) |
| TRUE | A9b the row/paragraph cut can cure them (feasibility) | largest line 310 (bylaw-133, 628 paragraphs, max 464), 8,060 (surface-135, 46 table rows), 11,248 (policy-124), all far under the room |
| TRUE | A10 hash changes at the take (29 of 61): mechanism | my method (take note line stripped, 50 takes found in history): 22 of 50 change, every one a task with no notes section before; exact 29/61 depends on the method (the grounder script no longer exists) |
| TRUE | 399 Files line resolves to 9 lists, none unmatched | resolve --type build --letter S: agents-s5-1to3 agents-s7-s11 queue-137 eng-all orchestrator-doc17 five-words plan-protocol inc-S ms-S, unmatched [] (7 lists without --type/--letter: the plan omits the flags) |
| TRUE | 35 RUNNING, 29 with a lane assignee, 31 BUILT with a lane assignee at c15fab7ec | node over git show HEAD: RUNNING 35 / 29; BUILT 31 / 31 |
| TRUE | task-410 TRIAGE.md 278 lines for 118 ids | 278 outcome lines, 118 distinct ids (forms by last line: fixed 39, wontfix 56, task 22, ruling 1) |
| FALSE | acceptance (b): of 48, 3 are task: on a CRITICAL or HIGH BUG | scratch outcomeErrors form checks: 4 (doc17#1 CRIT, doc17#2, doc17#3, plan-review-deepseek#4 HIGH), all BUG lines |
| TRUE | acceptance (b): 1 wontfix above LOW | plan-compliance-agents-s5-1to3#3 MED wontfix |
| FALSE | acceptance (b): 35 pass the form checks | 34 pass (9 + 4 + 1 = 14 refusals before git facts) |
| FALSE | task-410 has 18 HIGH or MED lines, 1,237 characters | 19 HIGH/MED/CRIT lines under the plan severity rule (893 characters in the minimal line form); the lens writes "CRIT", which the whole-word list does not match, so it falls to the strictest default |
| TRUE | acceptance (c): task-381 GROUNDER.md 36 CONFIRMED, 0 CONFLICT; branch holds no copy | hooks3/GROUNDER.md: CONFIRMED 36, REJECTED 108; wf1/inc1b-hooks3 has no BL-HOOKS3/GROUNDER.md |
| TRUE | four audited tasks: 153 CONFIRMED or CONFLICT (396, 407, 406, 387; RUNNING) | 11 + 17 + 46 + 79 = 153; none has a TRIAGE.md |
| TRUE | four audited tasks: 125 HIGH or MED lens lines | 125 by lens severity among the confirmed (124 by effective severity) |
| NOT YET | 52 of the 153 unaddressed | needs the audit (FOUR-STEP-AUDIT.md method); no TRIAGE.md exists in any of the four dirs, so by the plan's own rule all 153 lack an outcome |
| TRUE | task bodies of 23,954 bytes exist (task-357) | task-357 23,954; the largest is task-343 at 31,413 |
| FALSE | 30 of 86 scenario tests expect exit 0 | 86 tests; 27 expect 0 (30 toBe(0) assertions) |
| FALSE | 30 of 43 real fixed: lines touched the cited file, 13 only another | BL-V2WHOLE TRIAGE.md: 39 last-line (58 distinct) fixed lines, every one touches its cited path, git rev-parse resolves all |
| TRUE | check-lane-close.mjs :50 VERDICT, :133 lensContexts, :178 phases, :253 plan-stage output, :296 reason 30, :338 same-status skip | lines read |
| TRUE | check-lane-close.mjs :180-212 per-list body and :264-306 grounder block (extractable) | body is the (a) loop; grounder block starts at :262 (hints) |
| TRUE | 08_agents.md cites :225 :229 :312 :344 :346 :347 :348 :350 :357 (and :229 "grounder owed") | lines read; :346 "fold survivors, file rejections", :348 --context note, :350 rule 6 |
| TRUE | 137_mcqueue.md :98 Rule 3, notes :100 :136 :138 | lines read |
| FALSE | 375 B2: "137_mcqueue.md:136 names GROUNDER.md" | grep GROUNDER in :136 = 0; the grounder block is named at :134 (task-366 note); :136 names the report directory, chunks and hashes |
| TRUE | README.md :104 (security fires for PII and admin), :109, :115; lens-compliance.md :12 :14 :30 :34; lens-security.md :48 | lines read |
| TRUE | rule-lists.mjs:161 sec regex /entitlement/auth/stripe/metered/ misses admin and PII | line read; README.md:104 and lens-security.md:48 say it fires for both |
| TRUE | check-task-files.mjs:70 always allows docs/reports/reviews/<id>/ | line read |
| TRUE | Spec 132 core.8 at 132:154 | line read |
| TRUE | backlog-lane.mjs refuses by status :63-64, worktree :67-68, branch :69-70 | lines read |
| TRUE | deepseek-review.js extractSections :106-121, throws on a missing heading :111 | lines read; --section applies to the --context file (:176) |
| TRUE | 76 resolvable LATER/WAITS tasks; 20 resolvable not-started build/fix; 56 of 76 record/check | check: LATER 54 + WAITS 22; build 19 + fix 1; record 55 + check 1; task-400 is one of the 20 |
| FALSE | 135 of 181 open build or fix tasks have no resolvable list | 139 of 180 (open = not BUILT, DONE, MERGED, DROPPED) |
| TRUE | 11 of 77 lane directories hold out-compliance outputs | counted |
| TRUE | task-381: 15 resolved lists; 17 calls with no context; diff 19,138 bytes; context 32,698 characters | 15 lists; 17 calls, 0 refused; branch diff 19,138 bytes; context 32,722 bytes |
| NOT YET | task-381: 38 calls with the whole context; five sections 2,126 characters give 17 calls | needs A4 built; the committed context holds four of the five headings (1,730 characters), Notes absent as A0 says |
| TRUE | ms-9 is the only list whose file name holds a comma; 16 tasks of m-11 | table scan; m-11 has 16 tasks |
| TRUE | resolve --files docs/reports/review_followups.md is refused (no table row) | refused: matched by no row |
| TRUE | backlog --ac appends numbered after existing AC (5 onward); --plan/--notes replace; commas kept | clone on task-375: #5 #6 added; task-399 with no AC starts at #1; commas preserved |
| TRUE | backlog splits --add-ref at commas; identical refs are deduplicated | "compliance:ms-9 docs/specs/a,b/file name.md" became two references |
| TRUE | board job commits only backlog/ and warns and leaves edits on a hook failure | board-commit.zsh read |
| TRUE | check-backlog-task.mjs exempts docs commits (evidence commit needs no Task trailer) | header and code filter read |
| TRUE | 08_agents.md 6.4 plan roster names Integration in every row | 7 rows read (WF3 LEAN too) |
| TRUE | section 0 quotes are his verbatim words at the stated MORNING-DECISIONS lines (:1517 :1522 :1541 :1546 :1557 :1572 :1580 :1585 :1590) | read; :1572 sentence "Task 399: no close ..." is inside his pasted reply |
| TRUE | RR-0328 is decision-113 at :1422 and says only "remember the app is not beign used" | read |
| TRUE | GROUNDER-PLANS.md counts: 215 findings, CONFIRMED 147 (HIGH 10, MED 77, LOW 56, NIT 4), REJECTED 68; FILED-LOW 60 = LOW + NIT | recomputed; 165 lens ids all ruled, int2 18 / rc2 12 / gt2 20 |
| FALSE | GROUNDER-PLANS ruling plan-error-paths-399#5: rebase rewrites shas, FOLDED "re-recorded with new shas (stated in 4.1)" | grep rebase / re-recorded in both v2 plans: 0 hits |
| TRUE | --add-ref accepts a 103-character path, a 600-character path, 47 references; Final Summary and Notes accept 2 KB, 10 KB, 30 KB and --plain shows them whole | measured in the clone (see Measured limits) |
| TRUE | references survive the board job | board-commit.zsh does git add backlog; no hook reads references; plan-to-backlog replaces commas the same way |
| TRUE | task-375 context has "no shim (RR-0328)" sentence to delete | task-375 line 92 |
| NOT YET | 399: outcomeErrors, TRIAGE.md forms, Final Summary check, Seat lines, --outcomes CLI, README.md:109 change, dated notes | not built |
| NOT YET | 399 acceptance (a) to (e) | needs the build |
| NOT YET | 375: A1 two sections; A2 constants; A3 --context and --section at every lens call; A4 lens-input --context; A5 context-rN; A6 row/paragraph cut | not built |
| NOT YET | 375: B1 compliance references and --refs-only; B2 close refuses missing report references | not built |
| NOT YET | 375: D1 to D6 planGateErrors, Plan line, Seat checks, round block, references, --dry-run text | not built |
| NOT YET | 375 acceptance A0 to A9 (A9: gate on task-400) | needs the build; task-400 does resolve |
| NOT YET | 375 tests of section 8; D10b / D11b | not built |
| NOT YET | 375 D7 cost: 13.5 plan calls per task, 270 for 20, about 54 minutes | UNVERIFIED (scripts gone, no timing) |

## Verdict

READY AFTER THE LISTED CORRECTIONS (fv#1 first).

UNVERIFIED: 270 calls and 54 minutes; 52 of 153 unaddressed; the exact 29 of 61; the behaviour of anything not yet built; no hook was run (the evidence commit and the board commit pass the hooks only by reading).
