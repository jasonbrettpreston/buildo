# Reality-Check seat: task-418 plan (PLAN-418-v2)
Seat: reality-check
Head read: 093f6d0fa9d80e2a9ab4376dba6ec028ffc47f3f (plan basis d9f2143a7; git diff d9f2143a7 HEAD over scripts, src/tests, docs/specs is empty; the one commit between is a board edit)

### rc#1 HIGH: The plan says every real review output opens with "REVIEW template=" (4.3 step 4, acceptance (c)), but with the planned REVIEW_CMD the first line is a dotenv banner and the header is line 2, so a first-line check exits 1 on all 9 real calls.
- Plan: 4.3 step 4 "every output opens with 'REVIEW template=' or the phase exits 1 naming it"; acceptance (c) "each starting REVIEW template=lens-compliance.md".
- Computed: in the 9 real outputs docs/reports/reviews/task-418/plan-compliance-*.txt, line 1 is "injected env (0) ... tip: ..." (the dotenv banner printed by the `node -r dotenv/config` preload that REVIEW_CMD carries) and "REVIEW template=lens-compliance.md ..." is line 2 in 9 of 9. The gate is not affected: reviewErrors (check-lane-close.mjs:57-59) searches the first 15 lines with the /m regex (:54).
- Command: `for f in plan-compliance-*.txt; do grep -n -m1 "^REVIEW template=" $f; done` (9 x "2:"); `head -c 300 plan-compliance-eng-all.txt`.

### rc#2 MED: The plan's output check (REVIEW header only) is weaker than what the gate requires, so plan-prep can accept an output the launch then refuses.
- Plan: 4.3 steps 3-4 write the output on exit 0 and check only the "REVIEW template=" header.
- Computed: reviewErrors (check-lane-close.mjs:57-71) also refuses an output with no line matching /^VERDICT:/m ("no VERDICT line (a failed run is not a lens output)"). The tool exits 0 whenever the API call returns, whatever the text. Today 9 of 9 real outputs have exactly one VERDICT line, so it passes now; it is not guaranteed.
- Command: `sed -n 57,71p scripts/hooks/check-lane-close.mjs`; `grep -c "^VERDICT:" plan-compliance-*.txt` (9 x 1).

### rc#3 MED: "Idempotent: the gate's own test finds nothing missing" cannot detect a missing zero-form round line, so test 9 (strip the round line, post restores the exact line) is not computable as described; post would print "nothing to post".
- Plan: 4.4 idempotence via the gate's own test (outcomeErrors with a summary), and test 9: from plant-evidence's state with the round line stripped, post restores the exact zero-form line.
- Computed: outcomeErrors only builds or checks the block when `summary && errors.length === 0 && ids.length > 0` (check-lane-close.mjs:266). plant-evidence's state has zero CONFIRMED or CONFLICT ids (all verdicts REJECTED). With zero ids and an empty plan field, outcomeErrors returns {"errors":[],"ids":0}: no "block is:" message, no "missing" signal. With one CONFIRMED HIGH it does return "the block is:\nReview round 1: 1 folded, ... grounder G.md; triage T.md\nint#1 HIGH folded a small note that ch" (the non-zero path works; the folded ref is cut to 20 chars). The zero-form path needs post's own presence test on the "Plan review round N:" line.
- Command: node script calling outcomeErrors({verdicts: parseVerdicts(REJECTED lines), triageText:'', lensKinds:new Map(), facts:{}, mode:'plan', seats:[], summary:{text:'',headText:'',grounderPath:'g',triagePath:'t'}}) printed {"errors":[],"ids":0}.

### rc#4 LOW: "9 lens-input and 9 review commands" (acceptance (b)) holds only while no list splits, and the plan does not say how a --dry-run (which writes no input files) knows the per-part review commands.
- Plan: acceptance (b) and 4.3 step 3 "per input: REVIEW_CMD <in file>"; "-pN" named only in passing.
- Computed: for task-418's own 56,401-char context (material 22,336 chars, context sections 3,705 chars) all 9 lists give one file, header "part 1 of 1" (no -pN; 9 in- and 9 plan- files, as made by hand). Adding extra material: +0, +20,000, +40,000 chars still 9 files; at +60,000 chars (material about 82 KB) four lists (agents-s7-s11, queue-137, eng-all, orchestrator-doc17) split into -p1 and -p2 = 13 files. Names are in-/plan-compliance-<id>-pN.txt (rule-lists.mjs:420); findings and ruledLine work per file name, so the Ruled lines and the gate need no change, but the acceptance count "9" would then be 13 and a dry run must call buildLensInputs in memory to print the commands.
- Command: node script importing buildLensInputs with material = extractSections(context-r1.md, PLAN_SECTIONS) + N filler chars, for all 9 resolved lists (scratch script, not committed).

### rc#5 LOW: the planned lens-input command passes no --root, so with --board other than the script's own repo it builds the lists from the wrong tree.
- Plan: 4.1 `[--board <dir>]`, 4.3 step 2 `lens-input --list L --context <ctx> --material-from <ctx> --out <folder>/in-plan-compliance-L` (the brief gets --root <board>, lens-input does not).
- Computed: rule-lists.mjs:529 `const root = path.resolve(str('root', REPO))`; buildLensInputs reads the list documents from `root`. The gate reads them from the board head (planGateErrors readRepo). Same tree in the real case, different in a temp-board test (plant-evidence passes root: board).
- Command: `sed -n 529p scripts/analysis/rule-lists.mjs`; `sed -n 560,562p scripts/analysis/rule-lists.mjs`.

### rc#6 LOW: four cited file:line references point at the wrong line.
- backlog-lane.mjs:94 cited as the "output written only on exit 0" precedent: line 94 is the `git ls-tree` names line; the precedent is :118 `if (out && r.status === 0) fs.writeFileSync(out, r.stdout);`.
- "wording after backlog-lane.mjs:27": :27 is `const a = args();`; the refusal wording is `refuse` at :29.
- "fold check (08_agents.md:473)": :473 is an *Incidents:* line; the rule is Section 11.2 "Fold-validation is a STEP" at :475-476.
- "deepseek-review.js :39 and :194" for "real header, no API call": :39 is right (API key check); :194 is the non-lens prompt build. The lens REVIEW header is :161/:175 and the lens DRY-RUN line :176-179. The 120000-char prompt cap (:35, :61-66) is enforced only in callDeepSeek, so a --dry-run test never exercises it.
- Command: `sed -n '94p;118p;27p;29p' scripts/analysis/backlog-lane.mjs`; `sed -n '473p;475,476p' docs/specs/00-architecture/08_agents.md`; `sed -n '161p;176,179p;194p' scripts/deepseek-review.js`.

### rc#7 NIT: the plan lists "a real 30 KB context" as left to measure; the real context of this very task is 56,434 bytes and the measurement already exists.
- Plan: section 11 "per-call time and counts with a real 30 KB context (measured: 9 files ... 259-character fixture context)".
- Computed: context-r1.md = 56,434 bytes; 9 in- files of 25,361 to 69,142 bytes; 9 outputs of 5,689 to 6,871 bytes; per call 81.3 to 171.2 s (mean 108.3 s; nine concurrent calls so wall time about the slowest, 171 s); tokens per call 23,928 to 51,911 (total 307,612). The largest prompt is far below the 120,000 cap.
- Command: `wc -c docs/reports/reviews/task-418/*`; `grep -h -a "Tokens" plan-compliance-*.txt` and the timing lines.

### rc#8 NIT: "the final GROUNDER.md in that folder has no task-418 section": the folder gate375/h holds no GROUNDER.md at all, only GROUNDER.md.new.
- Plan: section 3 header. Computed: `ls gate375/h | grep -i ground` shows only GROUNDER.md.new; the final gate375/GROUNDER.md has 0 occurrences of "418" (the claim is true of that file). The .new section F also lists the older 3-path Files line (now 4 paths); the 9 lists are the same.

## figure -> plan says -> computed
| figure | plan says | computed |
|---|---|---|
| resolved lists, task-418 (current Files, type build, letter S) | 9 | 9 (agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S: same ids and order as the plan) |
| resolved lists, task-412 (Files: rule-lists.json, rule-lists-table.logic.test.ts) | 9 | 9, same ids; status LATER, type build; both Files paths tracked, so the regression seat is required |
| brief / lens-input / review commands, acceptance (b) | 1 / 9 / 9 | 1 / 9 / 9 for 412 (9 lists); true only while no list splits (rc#4) |
| rule-lists.logic.test.ts lines | 804 | 804 |
| backlog-lane.logic.test.ts lines | 454 | 454 |
| plant-evidence.mjs lines | 67 | 67 |
| plant-evidence zero-form block text | "Plan review round 1: 0 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder <rel>/GROUNDER-PLAN.md; triage <rel>/TRIAGE-PLAN.md" | identical (plant-evidence.mjs, the --append-plan call) |
| hand evidence in task-418 folder | context-r1.md, 9 in-, 9 plan-, FINDINGS-PLAN.md | 1 + 9 + 9 + 1 = 20 files, names as the checklist; no -pN; all 9 "part 1 of 1"; file_sha256 in each header equals sha256 of its in- file (9 of 9) |
| header line | "starts with REVIEW template=" | line 2 (line 1 dotenv banner) in 9 of 9 (rc#1) |
| FINDINGS-PLAN.md | Ruled line per plan-*.txt, "<id>\t<line>" per finding | 9 Ruled lines + 47 finding lines = 56 lines; findings per file 4,7,4,5,6,5,5,6,5 = 47; regenerated output is byte-identical |
| context size | (operator) 56 KB; plan "30 KB" | 56,434 bytes (56,401 chars) |
| list split at 56 KB context | none (9 files) | none; splits start between +40,000 and +60,000 chars of material (4 lists, 13 files at +60,000) |
| planHash task-418 now | (not stated) | 71df51ec2992 |
| planHash after adding a reference | unchanged | unchanged (71df51ec2992), temp copy |
| planHash after updated_date change | (front matter excluded) | unchanged |
| planHash after appending the round block | changes | changes: 51c3544a1af8 |
| zero-ids outcomeErrors with summary | "clean outcomes return the block message" | no message, errors [] (rc#3); with one CONFIRMED id the block message is returned |
| dynamic import of check-lane-close.mjs from rule-lists.mjs | UNVERIFIED | works from a module context (planHash, outcomeErrors, parseVerdicts, lensKindOf, seatLines, PLAN_SEATS, planGateErrors all exported and load); not run from the rule-lists.mjs CLI as main |
| boardFacts / REVIEW_CMD in rule-lists.mjs; contextRound | to be created; contextRound in review-template.js | boardFacts and REVIEW_CMD do not exist yet (as the plan says); contextRound exported from scripts/lib/review-template.js:137 |
| check-lane-close.mjs cites (:128 :141 :142 :145 :161 :266-276 :549 :552 :564 :588 :604-607 :621 :625-630 :635 :639) | as listed | all on the cited line |
| backlog-lane.mjs cites (:25 :76-79 :90-106 :92-95 :100-103 :105 :106 :129 :175-177 :180 :187) | as listed | all correct; :27 and :94 wrong (rc#6) |
| rule-lists.mjs cites (:452 :544-566 :567-576 :588-593 :594) | as listed | all correct |
| backlog-brief.mjs cites (:49-52 :146-147 :159) | as listed | correct |
| board-commit.zsh :10 :11 :12; 600 s | as listed | correct; StartInterval 600 in scripts/board/launchd/com.maxbld.board-commit.plist |
| check-backlog-task.mjs:3-4, check-task-files.mjs:10 and :70 | as listed | correct |
| 08_agents.md:524, 137_mcqueue.md:140 | CANNOT PROVE note | both hold it |
| operator quotes :1517 :1522 :1585 :1600 :1630 :1634 :1638 :1580 | as listed | each line begins with or holds the quoted words |
| test pins :263, :335 in backlog-lane.logic.test.ts | unchanged by REVIEW_CMD | both sit in lens-line tests and hold only fragments of the same string |
| grep "usage: rule-lists" in src/tests/backlog | no pin | none anywhere in src/tests |
| launch dry run today on task-412 and task-418 | "plan gate ok" only at the end | both print "backlog-lane: refused: board checkout ... is dirty outside backlog/: docs/reports/reviews/task-418/" (the hand evidence is uncommitted; exit code not captured by my pipe) |
| per-call time | left to measure | 81.3 to 171.2 s, mean 108.3 s; tokens 23,928 to 51,911 per call |
| estimate | GUESS 0.5 lane day | not measurable |

## UNVERIFIED
- The estimate (0.5 lane day) and the 16 tests' red-then-green runs: not measurable read-only; the test runner was not run.
- Whether the dynamic import works when check-lane-close.mjs is loaded from the rule-lists.mjs CLI as main module (I tested a module-context import only).
- Launch dry run output ("plan gate ok: 9 lists, <M> findings") and the "expected Plan line" printing (:635): not reachable today because the board is dirty (uncommitted evidence folder); I did not commit, clone or use a temp board.
- Acceptance (e) outcomes of a real fold, hook behaviour of the commit phase, index.lock behaviour and "exit 1, no partial file" for a failed call: no code exists yet.
- Whether nine concurrent real calls stay near 171 s wall time (rate limits, API load).
- The 600 s board-commit interval was read from the plist, not observed running.
