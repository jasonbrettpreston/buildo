# Seat: reality-check — task-423 plan (PLAN-423-v2)

Run against board HEAD 36a2c2d63 (wf2/board), with ~/Buildo-wt-gaps419 (wf1/inc1b-gaps419, task-419 lane BL-GAPS419) and ~/Buildo-wt-mig334 for the lane folders. Measured with the repo's own functions in read-only node one-liners (listBlocks, readTable, the resolve CLI, review-template.js) and grep/wc. No environment file read, no DB, no DeepSeek call, no test run, nothing written except this file. Rulings relied on: RR-0363, RR-0364, RR-0365 and the correction entry (MORNING-DECISIONS.md, 2026-11-21 entries from "STATES the objective"; decision-148/149/150 in backlog/decisions); RR-0361 only to check a citation (rc#10).

Checked and TRUE (no finding): today's counts (task-419 lane 33 = plan 11 + out 22; task-412 22; BL-SCORE421 58 = 42 out + 16 plan; BL-MIG334 13 = 6 out + 7 plan; 123 findings on 419 = 59 plan + 64 out; 313 on 421; 67 on 334); the bound is 120,000 (deepseek-review.js:35); context sizes 4,620 (419) and 2,270 (412); packs 45 files, 1,108 kB; reviews/task-419 1,160 kB; tooling kind 194,255 chars over 9 lists; Spec 08 5.3 = 11,460; engineering standards sections 2+5+9+11+14 = 17,088; Spec 08 section 7 = 10 numbered lines 3,873 of 9,567; the 14 `**Rule N.**` lines are 3,436 chars; the station suite (station.sh:43-46) does not run `gate.mjs`, the pre-push hook (.husky/pre-push:41) runs it first; `gate.mjs --ci --base` exists (:613-615).

### rc#1 HIGH: the `lines` patterns drop the dated notes and section 1 bullets, where the binding amendments live; `count` cannot see them
Plan sentence: "`lines` (regex) ... Spec 137 section 4 (14 lines `**Rule N.**`, 3.4k of 33k) and Spec 08 section 7 (10 numbered lines, 3.9k of 9.6k)" and "`count` ... KEPT for correctness: without it a rule added to the spec is silently invisible".
Measurement:
- The 14 lines are over the WHOLE of Spec 137 (Rule 1 in section 3, rules 13 and 14 in section 5a), not section 4: section 4 holds 11 (2,737 chars).
- Spec 137 has 11 "Dated note" lines = 10,287 chars (6 in section 4, 2 in section 1) and 5 section-1 bullets "- Rule N:" = 1,407 chars. The pattern sends none of them. Rules plus notes plus bullets = 15.1k, so the saving is 17.9k, not 29.6k.
- Spec 08 section 7: the 6 dated notes (lines 348, 351, 352, 356, 358, 359) = 5,717 chars, more than the 10 rules (3,873). Rules plus notes is the whole section (9,567): the saving is about 0, not 5.7k.
- The repo changes binding rules by appending dated notes ("prior text kept", M-246): 137 got notes on 11-15 (2), 11-16, 11-19 (2), 11-20 (5), 11-21; 08 section 7 got 3 of its 6 within the last 3 days. A new binding rule arrives as a note, never as a new `**Rule N.**` line, so `count` never moves. It guards the rare case, not the common one.
- Real defects found today that rest on lines the pattern drops: plan-compliance-queue-137#1 HIGH on task-419 (GROUNDER-PLAN, CONFIRMED) cites the "§1 rule 3 note" (the G3 trailer bullet, section 1, line 23, "- Rule 3: ...") and the section-4 task-410 dated note (line 136); the same finding is HIGH on task-412 (plan-compliance-queue-137#1). Both survive only if those lines are sent.
- Worse than a miss: the Rule 3 line as sent says "The status line changes in the same commit as the work". The two-commit close (dated note, line 100) amends it for every lane build task, including all three cards. A reviewer given the line and not the note flags the mandated process as a violation.
- Card A acceptance 2 plants "a Spec 137 Rule 3 break (task moved to DONE without a status-line edit)": that passes against the bare line while the real two-commit workflow is mis-judged.
What would go wrong: the single call is blind to exactly the rules most recently changed, and false-flags the current process; the grounder (which reads the full spec) rejects the false flags, so the cost moves to rejections and real HIGH misses stay invisible.
Smallest correction: the `lines` regex for 137 and 08 section 7 must also match `^\s*Dated note` lines and the section-1 `- Rule N:` bullets (137: 15.1k of 33.0k; 08 section 7: no saving, send it whole), and `count` must count the notes. Say so in the plan; change acceptance 2 to plant a break of the two-commit close, not of Rule 3 alone.

### rc#2 HIGH: the one-call arithmetic fails for the plan's own replay targets; acceptance 1 (33 to 9, 22 to 6) cannot be met as written
Plan sentence: "With the trims: about 87k. One plan call then is ... about 108k ... One output call = 87 + 4.6 + 4 = about 96k, leaving about 24k for the diff" and acceptance 1 "plan 11 calls become 3 ..., output round 1 11 become 3; whole 33 become 9 (6 if no round 2) ... task-412, 22 become 6".
Measurement (lens-compliance template; fixed part = system + template + context = 8,625 chars at 4,620 context; avail = 111,175; room for the list = avail - 800 - material):
- List sizes: tooling today 194.3k; lines only as planned 159.0k; with trims a, b, c 86.9k (true). But the `tests` row (src/tests/**, every code card) attaches eng-all WHOLE by id; `resolve` for Card A's Files line gives `eng-all[lane-tools+specs-docs+tests]`. The plan narrows only the lane-tools and specs rows, so eng-all stays 46.1k and the list is 115.9k (86.9 + 29.0). Every one of the three code cards names test files; so does task-412's.
- Plan stage, material 12.4k (task-419): room 98.0k. 115.9k needs 2 parts (87k would fit). Output stage, 419 round 1 diff 30.5k (in-out-code-review-p1.txt): room 79.9k; 418's diff 48.9k: room 61.5k; 412's diff 4.2k: room 107k. With the full trims (about 88.4k with headings) one output call needs a diff of 22.0k or less. Of the four build diffs measured (412 4.2k, 419 30.5k, 418 48.9k, 375 176k) one fits.
- Recomputed task-419: as written (tests row keeps eng-all) plan 2+2=4, round 1 2+2=4, round 2 on the fix diff (about 5k, 21 lines) 2+2=4: 12, not 9. With eng narrowed on the tests row too: plan 3, round 1 4, round 2 3: 10. Without round 2: 8 or 7, not 6. If rc#1 is fixed (list 104.3k with all trims, 133.3k without the tests row) the plan stage needs 2 parts, round 1 two, round 2 about two: 11-12.
- task-412 (22 to 6): holds only if eng-all is narrowed on the tests row (88.4k list fits plan room 100k and output room 107k); as written it is 8.
What would go wrong: Card A's replay acceptance is red at its first run; the lane then widens the trims on its own or the card is argued over.
Smallest correction: add the tests row (and every row that attaches eng-all by id to a tool or spec task) to trim (c), by a new list id `eng-tooling` (sections 2, 5, 9, 11, 14) used by lane-tools, specs-docs and tests, never both ids on one task; restate the replay targets as "2 to 4 compliance calls per stage when the diff is over 22k characters" and set acceptance 1 to 10 (7 without round 2) for task-419, 6 for task-412.

### rc#3 MED: "one call holds" for tooling and spec only, and for tooling only for small diffs; surface, phone and storage tasks stay at 14 to 20 compliance calls
Plan sentence: "Surface, phone and pipeline kinds still draw several calls ... the one-call target is met for tooling and spec tasks only."
Measurement (joined size, parts at plan room 98k / output room 80k with a 30k diff, 1.5k headings):
- tooling: today 9 lists; lines only 159.0k (2 / 3 parts); trims a-c 86.9k (1 / 2); trims a-b with tests row 115.9k (2 / 2); with rc#1 fixed 104.3k (2 / 2).
- spec-only (Files: Spec 08): today 7 lists 149.3k; lines only 114.0k (2 / 2); with the eng trim 85.0k (1 / 2). With rc#1 fixed 131.3k and 102.3k.
- pipeline: 197.2k, no `lines`, no trim: 3 / 3.
- web 679.4k: 7 / 9. phone 766.4k: 8 / 10. storage 569.7k: 6 / 8.
- "several" is 3 for pipeline and 7 to 10 per stage for web, phone and storage: about 14 to 20 compliance calls over plan and output, against 36 today (18 lists per stage): halved, not one. Spec 126 alone is 256k (4 parts) and no `lines` pattern exists for it, 128, 135, 127, 99, 100, 96.
What would go wrong: the operator's objective "one effective compliance review on the plan and the output. It isn't 17" is met for the tasks of this tooling programme only; the headline "Send the rule lines, joined into one compliance call" (the five adjustments put to him) reads as general.
Smallest correction: put the table above in the hand-off beside the five adjustments so he knows which tasks get one call; do not describe adjustment 1 as one call without "for tooling and spec tasks with a diff under 22k characters".

### rc#4 MED: 24-30 h of build (33-39 h with process) is 8 to 15 times what tasks 418 and 419 measured for edits to the same files
Plan sentence: "v2 about 24-30 h of build and test, plus about 3 h per code card for the plan review, grounder, fold and two-commit close (9 h) = about 33-39 h".
Measurement (commit author times, wf1 lane branches):
- task-419 (rule-lists.mjs, check-lane-close.mjs, tests; 159+6 lines in 7 files): context and plan outputs 09:44-09:48, grounder 10:12, launch about 10:13, build commit 571b6d999 10:24, fix e5c3a4818 10:50, closed 10:58. Plan stage about 30 min, lane about 45 min, whole 77 min (09:41-10:58).
- task-418 (same two files plus backlog-lane.mjs; 550 insertions in one feat commit 213342547): plan evidence 00:40, build 00:56, fix 01:21, closed 01:56: 76 min from plan evidence, about 16 min to the feat commit.
- task-412 (41 insertions): plan evidence 01:48-01:50, feat 01:53, closed 02:06: about 20 min.
- v2's code is about 175 lines in the same two files (the plan's own sizes 60 + 8 + 25 + 15 + 6 + 60 less overlap) plus tests: between 419 (165) and 418 (550). Three ordered cards at 75-100 min each is about 4-5 h of lane and plan time; allow 8 h with the grounder, fold checks and the operator's reading. The plan's 3 h per card for process is 4 to 6 times the measured 30-40 min of plan stage.
What would go wrong: the operator is told it is a 4-5 day job and may cut scope to save time that is not spent; or the estimate is read as a measurement (the plan labels hours ESTIMATES, but gives no basis).
Smallest correction: replace the hours with the measured per-card wall time (about 75-100 min each, three ordered cards, plus card D 20-40 min) marked "measured on 412, 418, 419", and keep a single margin line.

### rc#5 MED: rule lines without their definitions are unintelligible or misleading to the reviewer (five samples)
Plan sentence: "No spec text is written" and "the grounders and seats read full specs" (the cover for what the reviewer does not see).
Samples, each a line the patterns or trims DO send:
1. Spec 137 Rule 6: "A weekly snapshot, by procedure. §5." The whole rule is the pointer; section 5 is not sent.
2. Spec 137 Rule 12: "The `expires` field reads `when <event>` ... an operator-set exception to rule 7": the field and its grammar are defined in section 3 (Form line, word list of nine words), not sent; the closed nine-word list (DONE, BUILT, RUNNING, WAITS, OPERATOR, LATER, FROZEN, DROPPED, MERGED) is binding and absent.
3. Spec 08 section 7 rule 3: "Round-2 always for money/pipeline-critical work (§5.3)": trim (b) drops 5.3, the section the line cites (11,460 chars).
4. Spec 08 section 7 rule 6: "BUG -> WF3 before Green Light; DEFER -> review_followups.md with reasons": WF3 and Green Light are defined elsewhere, and the outcome forms (fixed, task, ruling, wontfix, pile: "30+ characters; LOW and NIT only") are in the line-351 dated note the pattern drops. Adjustment 4 (Card B) amends exactly that note, so Card B's plan cannot be judged against it.
5. Spec 08 section 7 rule 10(b): "names only checks runnable through `bash_allow` (§C.4)": bash_allow is defined in section C.4, not sent. Rule 4 "(1) `spec` = the Compliance (A10) substrate" uses A10, from the roster.
References from the 10 rule lines to sections outside the sent text: §9 x3, WF3 x3, WF6 x2, §C.4, §B, A10, §7b, §6.4, §6.2, §5.3.
What would go wrong: the reviewer either skips the line or guesses its content; guessed rules produce confident false flags that the grounder spends calls rejecting, and the correct reading is the one the dropped text holds.
Smallest correction: keep a 2-3 line glossary block at the head of the joined input (the nine status words, WF1/WF2/WF3, what each pointer means), not a spec rewrite; and keep the rule-6 and rule-4 notes (rc#1).

### rc#6 MED: acceptance counts findings and calls, not whether the single call still finds what the nine found
Plan sentence: "findings counted before (123) and after in REPORT.md" and "Planted rule breaks caught by the single call ... 2 of 2 runs each".
Measurement:
- Task-419 plan stage: of 63 CONFIRMED findings in GROUNDER-PLAN.md, 36 came from the nine compliance outputs (queue-137 5, eng-all 5, five-words 5, agents-s7-s11 5, inc-S 4, ms-S 4, plan-protocol 4, doc17 3, s5 1); 20 from the three seats (int 5, rc 8, rg 7); 7 from error-paths (4) and plan-review (3) (63 = 36 + 20 + 7, counted by id prefix in GROUNDER-PLAN.md). Output stage: 10 CONFIRMED lens findings, 9 of them compliance (4-5 distinct issues repeated across lists).
- The nine passes are nine samples of the same material. One call is one sample; it can report fewer findings, and fewer findings read as a win in the acceptance as written. The HIGH of rc#1 was found by one of the nine lists (queue-137) on both 412 and 419.
- Three planted breaks and one ruling test measure rule recall on invented defects, not on the real ones.
What would go wrong: a thinner review passes acceptance.
Smallest correction: add to acceptance 1 "replay of task-419 and task-412 plan stage: the single call re-finds plan-compliance-queue-137#1 (HIGH) of each, and at least 80 percent of the distinct CONFIRMED compliance findings of GROUNDER-PLAN.md"; record the recall in REPORT.md.

### rc#7 MED: "resolves to no lists" is false; the 58 to 0 and 13 to 0 hold only through the close branch, and a build task with all-exempt Files is refused
Plan sentence: "A Files entry that is all exempt resolves to no lists, so the brief tells the lane 'no review'" and card C acceptance 1 "task-421's Files narrowed ... resolves to no lists ... (58 calls become 0 ...); task-422's queue-row diff the same (13 calls become 0)".
Measurement:
- resolveTask (rule-lists.mjs:249-262) adds the every_task lists (five-words, plan-protocol), the increment list and the milestone lists after the Files loop, whatever the Files line: a paperwork task still resolves 4 lists (five-words, plan-protocol, inc-S, ms-S).
- A build or fix task whose Files are only exempt paths is refused ("resolves to no rule list (only exempt paths ...); a build or fix task must touch at least one governed path").
- task-422 (type record) has no Files line: `no_files_default` attaches the queue-records row (queue-137, agents-s7-s11) and never reaches the exempt test, so the new globs do not apply to it; its 13 to 0 depends only on the close branch.
- The 0 is reachable at close only if the branch drops both phases: for non-build types `phases = ['plan','out']` (check-lane-close.mjs:476), which is why 421 holds 16 plan + 42 out files and 422 holds 7 + 6. The plan says "no compliance or lens output is required" but names only the range test.
What would go wrong: card C's acceptance sentence "resolves to no lists" is untestable; a test written to it fails, or the resolver is changed to drop every_task, which `validateTable` and `verifyResolved` refuse.
Smallest correction: reword to "resolve returns only the always-attached lists; the close needs no lens output, plan or out, because the range holds no covered non-exempt path"; state that build and fix tasks with an all-exempt Files line stay refused (a paperwork task is not type build); name task-422 as resolved by `no_files_default`, closed by the range test.

### rc#8 MED: exempt-before-rows and `backlog/**` break existing tests, and exempt the very documents the reviewer is given as rules
Plan sentence: "`resolveTask` (:239-243): test exempt candidates BEFORE rows" and "Add globs: ... `backlog/**` ... `.cursor/*QUEUE*.md`" and card C acceptance "the golden-exempt test still passes".
Measurement:
- rule-lists-table.logic.test.ts:156-161 asserts that a golden path (src/tests/fixtures/surfaces/report/v21.web.json) still resolves to its ten lists with `exempt` empty ("list resolution of a golden path is unchanged by the exempt globs"). Testing exempt first makes it resolve to the always-attached lists only: red.
- The same file :167-168 counts the exempt globs not starting with `docs/reports/` (`toBe(9)`) and :139 fixes the proving checks to three names (goldenProblems, screenArm, report-page-capture.ts --check). `backlog/**` and `.cursor/*QUEUE*.md` make it 11; `step-validate.mjs --all --fast` and the queue-check are not in CHECKS.
- `backlog/**` includes backlog/docs (doc-16 McStorage policy, doc-17, the increment requirements docs such as inc-S and the milestone objectives ms-S, which the reviewer receives as rules) and backlog/decisions (the rulings). Edits to those would be unreviewed.
What would go wrong: Card C red on unrelated tests; unreviewed edits to rule sources.
Smallest correction: apply exempt-first only to the new globs (keep the golden globs resolved by rows), exempt `backlog/tasks/**` and `backlog/completed/**` rather than `backlog/**`, and list the test edits (count 9, CHECKS names) in card C's Files and acceptance.

### rc#9 LOW: trim (c) loses more than "sections 12 and 13", and trim (b) removes a section a kept rule cites
Plan sentence: "engineering standards narrowed from whole (46k) to sections 2, 5, 9, 11, 14 (about 17k; lost: sections 12 and 13 tooling and observability, not about scripts or hooks)".
Measurement: the kept sections are 17,088; the dropped are 1 (3,214), 3 (1,221), 4 Security and API Contracts (3,667), 6 Logging (566), 7 Dual Code Path (1,023), 8 (1,160), 10 (1,719), 12 (12,962), 13 (2,906) = 28.4k plus the header. Section 11 (kept) is a checklist whose items cite sections 1, 3, 4, 8 and 10. The two rows' own `why` text names 5, 9 and 14 only, so the narrowing is within what those rows say; the plan's "lost" line is incomplete, and trim (b) drops 5.3, which section 7 rule 3 still cites (rc#5).
What would go wrong: nothing breaks; the operator approves OPEN QUESTION 2 on an understated loss.
Smallest correction: state the nine dropped sections in open question 2.

### rc#10 LOW: stale or wrong cites in the plan
- "RR-0361 ("It isn't 17")" (card A description, section 6): decision-146 is "RR-0361 Built tasks ground the old findings and include them in a new pass; plan not approved". The "It isn't 17" entry has no RR number in MORNING-DECISIONS.md or backlog/decisions. A card naming RR-0361 attaches an unrelated ruling to every review of the three cards through "Decisions naming this task".
- "check-lane-close.mjs :550" for the "at least one plan-*.txt" requirement: it is line 516 (550-552 is planHash).
- "Spec 137 section 4 ... 14 lines": 11 in section 4, 14 in the whole file (rc#1).
Smallest correction: cite the entry heading ("2026-11-21 · Operator STATES the objective") not an RR id; fix the line numbers.

## Rejected-finding rates today (task 7)
Grounder verdict counts (GROUNDER.md of each lane, lens findings only unless noted):
| lane | findings | REJECTED | CONFIRMED | plan-stage share of REJECTED |
|---|---|---|---|---|
| task-419 (BL-GAPS419) | 32 out (+5 grounder's own) | 22 (69%) | 10 (+5) | 0 (plan files absent from the lane dir when ruled: that is g419#1) |
| BL-SCORE421 | 313 | 292 (93%) | 21 (18 are one LOW repeated) | 111 (38%) |
| BL-MIG334 | 67 | 66 (99%) | 1 | 44 (67%) |
| task-412 (BL-F412) | 79 | 57 | 22 | 27 (47%) |
| task-418 (BL-PREP418) | 124 | 79 | 45 | 34 (43%) |
What each adjustment removes:
- Adjustment 2 (paperwork): all 292 rejections of 421 and all 66 of 334 (100%); also their 21 and 1 confirmed (a LOW record gap repeated 18 times).
- Adjustment 3 (plan findings not re-ruled): 111 of 292 (38%) on 421, 44 of 66 (67%) on 334, 27 of 57 (47%) on 412, 34 of 79 (43%) on 418, 0 on 419.
- Adjustment 1 (join): the only measured rejection cluster on a code task is 9 of the 22 on 419, one false premise ("plant-evidence.mjs absent from the change": the review material excludes docs/reports/reviews/**, where the file lives). No adjustment removes the cause; one call would raise it once, not nine times (UNVERIFIED): at most 8 of 22 (36%).
- Adjustments 4, 5, 6: no rejection removed (they remove re-runs, one status class and a station gap).

Confirmed HIGH or CRITICAL findings, by lens and document (412, 418, 419, 421; none CRITICAL):
| task | id | found by | document or seat | removed or weakened by the plan |
|---|---|---|---|---|
| 412 | plan-compliance-queue-137#1 HIGH | DeepSeek compliance, plan | Spec 137 section 1 rule 3 note (G3 trailer) | weakened: line dropped by `lines` (rc#1) |
| 412 | out-compliance-agents-s7-s11#1 HIGH | DeepSeek compliance, output | Spec 08 section 11.2 | kept (section 11 whole) |
| 418 | int#1 HIGH | Integration seat, plan | the dotenv banner, 9 of 9 real outputs | no |
| 418 | rc#1 HIGH | Reality-check seat, plan | same banner, measured | no |
| 419 | plan-compliance-queue-137#1 HIGH | DeepSeek compliance, plan | Spec 137 section 1 rule 3 note and the section-4 task-410 note | weakened (rc#1) |
| 419 | g419#1 HIGH | output grounder | no plan-*.txt in the lane dir: close refused | removed by adjustment 3, by design |
| 421 | none | | | |
So today 2 of 6 confirmed HIGH were found by the Spec 137 compliance list on lines the plan's pattern would not send; none of the seat or grounder finds is touched. The doc-17 and 5.3 trims removed no unique confirmed finding in the 412, 418, 419 data as far as the grounders' "same as" reasons show (5 lists found the severity-rows contradiction on 418; 3 lists the CLAUDE.md:139 drift on 419, which section 14 of the standards, kept, also covers): not exhaustive.
