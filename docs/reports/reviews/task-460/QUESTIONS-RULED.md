# task-460 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P460)

Authority (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md), read at the lines:
- RR-0457 (:2365-2368). Put-to (:2366): "at the output stage one code review run on the diff; the mechanical checks of the commit hook as today; one separate read-only grounder as the validation ... All spec rule lists, the pipeline step handbook and the surface handbook included, go off at the output stage and stay on at the plan stage. Plan stage unchanged." Operator (:2367): "I agree let's see the plan below". Ruled (:2368): "Not ruled: the plan itself; nothing is switched until he rules on it."
- RR-0458 (:2370-2373). Operator (:2372): "this should be simple - the output approach can stay for all front-end back end etc." Ruled (:2373): the output approach applies to all cards. The line "Orchestrator's reading, not his words" (the step-handbook sentence means handbook reviews stay matched at the plan stage) is not used as a ruling.
- RR-0459 (:2375-2378). Operator (:2377): "the output review looks good excpet for aspect - does teh code review on the output include error pathways?" then "Let's not do it. Create the task and go! Add label to it - ProcessImprovement." Ruled (:2378): error paths is NOT added at output. The orchestrator-reading line (:2378, "the output review looks good" accepts the grounded plan with its three answers) is not used as his word.
- RR-0450 (:2325): "Are these minor changes? We just want to turn off or change the text etc?"; ruled (:2326): switches or text changes only.
- RR-0392 (:1975): "I don't think we need any other infastrcuture beyond this".
- RR-0391 (:1968-1969): "Teh missing one is security" and "add it." RR-0394 (:1987): "Security a". RR-0418 (:2145): the four lenses (code review, UX, security, error paths) and the lists.
- RR-0385 (:1918, item 2): a review seat named engineering "at plan and at output". RR-0359 (:1687): no fold before the grounder (kept: this fold is applied after this ruling). RR-0429 (:2202-2203): dated notes kept short (the note is trimmed to about 900 characters).
- The operator's stated concern: descriptors right in the output review of completed tasks; "we need the right documents for the right review but we dont need a million reviews"; "It has to be simple and easy turning stuff off if at all possible ... No more mistakes or surprises". The descriptor and milestone duties stay in the grounder text (plan section 4 step 3), unchanged.

Basis: board head f5b3e1ff4. Read with sed, grep and read-only node on the repo's own functions (readTable, lensSet, outputLists, resolveTask). No test run.

## The three matters the seats raised

### (a) Security at output (rg#1): a TRUE operator question (plan Q7)
- What settles part of it. RR-0457 (:2366) put the output review as one code review, and he agreed (:2367); RR-0458 (:2372) "the output approach can stay for all"; RR-0459 (:2377) he found the output review good except for one aspect, error pathways, and then declined to add it. That settles ux (no earlier order of his names ux at output) and error paths. It also settles that engineering and every rule list are off (see (c)).
- Why it does not settle security. His own words on security are orders, twice: RR-0391 (:1968-1969) "Teh missing one is security" and "add it."; RR-0394 (:1987) "Security a" (a Files line with an API route or library). Spec 08 :263 records "at plan and at output". RR-0457 to RR-0459 never name security. The put-to texts are the orchestrator's, and the line that says he accepted the plan as shown is marked the orchestrator's reading. RR-0385 item 4 (ii) (:1922) sends to him an earlier answer that "reads two ways". The rules do not settle it, and I do not settle it by preference (RR-0443 means checked and grounded first: done).
- Not by reading: I cannot see from the file whether the eight rows shown to him at RR-0459 said that security leaves the output review.
- Question: plan Q7 (text in FOLD-460.json and below). The build waits only on that line, the Spec 08 note and the tests that pin security at output; everything else is built.

### (b) Fix tasks (rc#1, rg#2, in#2): SETTLED, accepted
- Facts read. Today the close treats fix as build (check-lane-close.mjs:468, :521, :525), so a fix task is held to its output lists; the launch brief names them (backlog-lane.mjs:184, :213). A fix task never had lists at the plan stage (rule-lists.mjs:661, check-lane-close.mjs:658-662). After the card it has none at either stage. The plan's Surprise 1 had this backwards ("no list at either stage" as if it held already); the fold corrects it.
- Words. RR-0458 (:2372) "the output approach can stay for all front-end back end etc." and the ruling (:2373) "applies to all cards" cover a fix card. RR-0450 (:2325, :2326): switches or text changes only. RR-0392 (:1975): no new mechanism.
- Options. Exempt fix tasks from the switch: two type tests at check-lane-close.mjs:525 and backlog-lane.mjs:184, hook code in a protected path and outside the Files line, not a switch or a text change, so refused by RR-0450 and the card. Lists at the fix plan stage: the card forbids a plan-stage change. Accept: no line changes; it is the same consequence the task-453 grounder ruled for plan-protocol (docs/reports/reviews/task-453/QUESTIONS-RULED.md, ruling (a)) with no operator question.
- Ruling. Accept. The Spec 08 note says it, the plan says it (Surprise 1, Q1), and the close-out reply states that a fix card has no rule list at either stage. Not an operator question.

### (c) Engineering lists at output (rg#3): SETTLED, off
- Words. RR-0457 put-to (:2366) "All spec rule lists", agreed at :2367, and RR-0458 :2372. The eng-* lists are lists of the table whose file is docs/specs/00_engineering_standards.md (rule-lists.json), so they are spec rule lists. RR-0385 item 2 (:1918) is earlier and a general seat rule; the later, more specific ruling is for the output stage. This differs from security: security is a lens, not a rule list, and he ordered it by name.
- Ruling. Off, and the note names the supersession of RR-0385 item 2 at output. rg#3's guard: the ui-app planted-defect lock (backlog-lane.logic.test.ts:419-437) moves to a check brief; in memory a check task on src/app/api resolves eng-back and eng-shared as a build does, so the lock survives; its red-then-green run is kept in the lane folder. Not an operator question.

## The plan's open choices (section 8) and in#1
- **Q1 (fix tasks).** Ruled accept, see (b). Not an operator question.
- **Q2 (engineering at output).** Ruled off, see (c).
- **Q3 (output_off holds 58 ids or the 43 attachable).** 58. The card says every rule list; RR-0457 (:2366) "All spec rule lists"; one rule, one test (T2 pins output_off to Object.keys(lists)). The 15 lists no row attaches today are included, so one attached later is off at output at once. T5 (a second pin) is dropped, because T2 already pins it and a committed rollback edits T2 with the data (plan-error-paths#6).
- **Q4 / in#1 (the grounder's own findings).** Prose, no seat form. check-lane-close.mjs:178 refuses a seat file with no finding line, so a clean validation could not be filed; any seat finding needs a verdict line and a TRIAGE outcome written by the grounder about its own work. The Validation section in GROUNDER.md holds one line per duty; a finding there is fixed in the lane's own round or reported. The close proves presence only and the card must not change its grounder rules (RR-0392).
- **Q5 (this card's own output review).** Skip error-paths. RR-0459 (:2378) no error-paths at output. The close of this lane uses the branch's own lensSet and asks code-review as its only lens, plus the lists by the range base (check-lane-close.mjs:855, as plan section 6 says). The launch brief, made from the board's old table, still names error-paths; the orchestrator tells the lane not to run it. A file written anyway needs a Ruled line and verdicts.
- **Q6 (text edits beyond the grounder's table).** Yes. AC 6 names the README lines; RR-0450 allows text changes; README :154 would be false otherwise (it lists out-error-paths, out-ux, out-security). All are in files on the Files line.
- **Files marked outside the Files line.** None. check-lane-close.mjs stays unedited; no extra Files entry is needed. rule-lists-table.logic.test.ts stays on the line though no edit remains (T5 dropped); harmless.

## UNVERIFIED items of the plan settled by reading
- Zero lists at close: nothing else is required (check-lane-close.mjs:526 skips the set; GROUNDER.md is still needed at :579-580).
- Close mode accepts any seat name but not a seat file with no finding line (:178): see Q4.
- The 14 LATER and 2 RUNNING fix cards: the count was confirmed by the reality-check seat; I did not recount.

## For the operator (one question, plan Q7)
Security at the output stage. Plain question: when a card changes an API route, a library, or money, sign-in, personal-data or admin code, should the extra security review still run on the finished code?
- A. No (the card as put): the output review is the code review alone; security is checked at the plan stage only. Cost: the Spec 08 note also names the 2026-11-22 security note (08_agents.md:263) and RR-0391 as superseded for output; about 8 security test edits (rule-lists.logic 4 lines, check-lane-close.logic 3 lines, backlog-lane.logic 2 blocks). No new line of code beyond the card's one line.
- B. Yes, only on those paths: the one lensSet line the card already edits keeps its security term (rule-lists.mjs:194, 0 extra lines, 0 extra files). The security test pins are left as they are. Cost: one more output file and one more ruling on those cards.
- C. No security review, but the validating grounder reads each changed file on those paths for exploit paths: about 2 lines (backlog-lane.mjs:191, README :153) and one more test assertion.
Recommendation: B. It rests on RR-0391 ("add it.") and RR-0394 ("Security a"), which his later words never withdraw, and on the repo rule that a switch fails toward more review. It is the same single line, with fewer edits than A.
Meanwhile: the plan builds everything except that line, the Spec 08 note and the security test pins; if no answer has come when the build reaches that line, it stops there and reports (it does not guess).
