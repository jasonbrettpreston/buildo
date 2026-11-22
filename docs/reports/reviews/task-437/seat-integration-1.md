# Seat: integration: task-437 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### ig#1 HIGH: the Spec 08 note changes a generated page the pre-commit hook checks, and the page is not in the plan
- Plan sentence: "Code commit: the tests, backlog-lane.mjs, the Spec 08 note, and the task file with `Task: task-437`." The Files line has four paths. The generated page is not among them.
- Evidence:
  - `.husky/pre-commit:44` runs `node scripts/analysis/rule-lists.mjs page --check`.
  - `docs/reports/generated/rule-lists-by-kind.md` prints the character size of `agents-s7-s11` (35,443 today). That list is the section "7. Rules & economics" plus section 11 of `08_agents.md` (`scripts/analysis/rule-lists.json:45`).
  - Section 7 runs from `08_agents.md:344` to :363, so a note after :355 sits inside it.
  - `src/tests/backlog/rule-lists.logic.test.ts:449` runs `page --check` and expects status 0.
  - Precedent: commit f5ca453ff changed `08_agents.md` by 3 lines and regenerated `rule-lists-by-kind.md` (14 lines) in the same commit.
  - `page --check` passes on the board now ("is current").
  - I could not run the edit itself, because I may not write.
- What would go wrong: the commit is refused by the hook, or the suite goes red at :449. The lane's only fixes are to bypass the hook (forbidden) or to touch a file outside its Files line. Task-436 also edits section 7 and lands first, so the page lines will conflict and need regenerating after 436.
- Smallest correction:
  - Add to the plan "run `node scripts/analysis/rule-lists.mjs page --write` after the note is in, and commit the page".
  - Add `docs/reports/generated/rule-lists-by-kind.md` to the Files line.
  - Run the regeneration after 436 has landed.

### ig#2 MED: the new note makes the stored plan evidence of prepped-not-launched tasks stale, and task-431 is prepped
- Plan sentence: the prompt's premise "438 and 431 are planned, not prepped". The plan itself says nothing about staleness.
- Evidence:
  - `check-lane-close.mjs:410-414` (`listProof`) refuses plan inputs whose committed list text no longer equals the whole list as it is now ("the committed inputs ... do not carry the whole list").
  - `docs/reports/reviews/task-431/` holds 31 files: `GROUNDER-PLAN.md`, 3 seat reports and `in-plan-compliance-agents-s7-s11.txt`. Task-431 is LATER. It is prepped, not just planned. Its launch will be refused for `agents-s7-s11` after any section 7 note lands.
  - `docs/reports/reviews/task-437/` already holds an `in-plan-compliance-agents-s7-s11.txt`. 436's note will stale it before 437 launches.
  - Task-438 has no folder, so it is not prepped.
  - Tasks 432, 433 and 435 are BUILT and 430 and 436 are RUNNING, so their launch gates are already passed.
  - Precedent: the task-423 task page, line 308, records "Plan review round 2 ... after the fold of task-419 changed Spec 08 ... staled their compliance outputs".
- What would go wrong: when 431 or 437 is launched, the plan gate refuses with "has no valid compliance lens output" for `agents-s7-s11`. Re-making it spends one of the plan's two review rounds. `rule-lists.mjs:640` allows one round per prep run, and the second round line must be added by hand.
- Smallest correction: add a plan line saying that the note stales `agents-s7-s11` plan inputs. Task-431 and task-437 re-make that one input (`rule-lists.mjs lens-input`) after 436 and 437 land. A re-made input is not a new review round (as in the 423 note).

### ig#3 MED: the new brief sentence names a form and a file the lane brief never mentions
- Plan sentence: "a MED confirmed in round 2 is recorded as `<id> ruling:RR-0385`; LOW and NIT are recorded (pile or wontfix, 30+ character reason)".
- Evidence:
  - `grep -c TRIAGE scripts/analysis/backlog-lane.mjs` returns 0. The brief never says outcome lines exist, which file holds them, or who writes them.
  - The same `grounder` string says "You do not rule on your own findings".
  - The only lane-side text on outcomes is Spec 08 at :354.
  - I could not tell from the code who writes `TRIAGE.md`. The close check only reads it (`check-lane-close.mjs:574`).
- What would go wrong: a lane reads "recorded as `<id> ruling:RR-0385`" as an instruction to write its own ruling line for any MED. That is the self-ruling the paragraph forbids, and it needs no grounder.
- Smallest correction: reword the sentence to name the grounder's outcome file ("the outcome line in TRIAGE.md, written with the grounder's verdict") and say the lane does not write it. If who writes TRIAGE.md is not settled, drop the form from the brief and keep it in the Spec note.

### ig#4 MED: `ruling:RR-0385` is a blanket outcome for any task, any severity and any round, and the note says it only covers a MED
- Plan sentence: "accepts any recorded ruling id for a MED" and "Q1 (A) Yes, as planned: zero code".
- Evidence: I drove `outcomeErrors` in memory with `decisionExists: () => true`.
  - `ruling:RR-0385` passes for MED, HIGH and CRITICAL, in both close and plan mode.
  - With `decisionExists` false the same lines are refused with "RR-0385 has no decision record".
  - The ruling branch (`check-lane-close.mjs:252-258`) takes `RR-\d{4}|decision-\d+` and calls `facts.decisionExists(ref)` only. It checks no task id, round number or severity. `decisionExists` (:302, launch gate backlog-lane.mjs:102) needs only a decision file whose basename contains the id.
  - `decision-170` lists only "Tasks named: task-427".
  - Final Summary line (:267-274): `ruling` rows print as `<id> MED ruling RR-0385`, so the rule does not collide with it. That line shows the class ruling but gives no reason or round.
- What would go wrong: RR-0385 item 4(i) says a CRITICAL or HIGH still open after round 2 comes to the operator. Nothing in code stops `ruling:RR-0385` closing a CRITICAL or HIGH. The same hole already lets any existing RR id close any finding, but RR-0385 now gets used as the standard outcome.
- Smallest correction: change the note's last sentence to "accepts any recorded ruling id (RR-0385 included) for a finding of any severity, on any task, in any round; the check cannot tell a round-1 MED from a round-2 MED". Q1 (A) should name this as the cost of choosing A.

### ig#5 LOW: the acceptance line says "every brief", but only the lane brief changes
- Plan sentence: "Every brief states the two-round rule and the round-2 MED form."
- Evidence: `backlog-brief.mjs:174` prints only `max_fix_rounds: 2`, and the plan leaves it alone. T1 covers the `backlog-lane.mjs` `extra` text. Lanes already RUNNING keep their old briefs ("r2, r3, ..."). That is harmless, because the close check has no cap.
- What would go wrong: a reader assumes the generated brief states the severity-by-round rule. It does not.
- Smallest correction: reword to "every lane brief printed by backlog-lane.mjs (build, fix and record-only)", and state that running lanes keep their old brief.

Checked with no finding:
- **Brief consumers:** no test pins "r2, r3" or "fix) round". The parity pin (`backlog-lane.logic.test.ts:230-241`) needs `out-<lens>[-<list id>]-rN.txt`, and the plan keeps it.
- **Tests that read the brief:** the grounder-sentence tests (:224 and :358) read the part of the string before the appended text.
- **Brief size and quoting:** no brief size limit exists in `backlog-lane.mjs`. The appended text has no apostrophe or `${`, so it is safe inside the single-quoted `grounder` string.
- **Line shifts:** 436's note after :359 sits after :355, so :355 does not shift.
- **Other copy of the Spec 08 text:** the review-template pack copy of Spec 08 is a hand-written snapshot already behind the spec. I did not check for any test that compares it.
