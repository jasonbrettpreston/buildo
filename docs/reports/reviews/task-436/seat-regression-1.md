# Seat: regression: task-436 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rg#1 MED: T3 is green on the old script for the case the plan describes, so it is not a red-first lock
- Plan sentence: "T3, `--spec` path: task.merged.json `extra` holds the model line exactly once. The planted defect is a given spec whose extra already holds the line; the merge must not add it twice."
- Evidence: the old merge (backlog-lane.mjs:223) never adds `MODEL_LINE`, so a given spec that already holds it also ends with it exactly once. The plan's own rule is "Lock in both directions (08_agents.md:485)". The test fixture's fake brief.mjs (test :41) dumps the spec into BRIEF.md, and the existing `--spec` test at :179-186 uses a spec with no `extra`.
- What would go wrong: the not-twice half cannot fail on the old script, and the "given spec lacks the line" case is not stated, so the real new behaviour (the line is added) is untested.
- Smallest correction: split T3. (a) A given spec without `extra`: merged `extra` contains `MODEL_LINE` once (red on old). (b) A given spec whose `extra` already holds `MODEL_LINE`: still once (a survive-the-fix lock, state it as such per 08_agents.md §11.3).

### rg#2 LOW: inserting a line shifts every Spec 08 cite after :359 by one
- Plan sentence: "Add one dated note to Spec 08 after :359." (and "In the header comment, step 6 (:11), name the new line.")
- Evidence: backlog-lane.mjs:185, in the brief, says "(RR-0378 step 5, 08_agents.md:529)" and test :287 comments :529; backlog-brief.mjs:3 and :8 cite :504, and several test and script comments cite :462, :490 and :511. Those cites are already stale (462 and 490 are ones the plan itself notes drifted).
  - No test pins a number above 359. The tests that pin line numbers use only :334 and :339 (backlog-brief.logic.test.ts:54-55), which are before the insertion.
- What would go wrong: no failure. The brief cites :529 for a line that moves to :530.
- Smallest correction: none now. Task-437 already edits :185, so it can fix the cite there. T-line-cite hygiene is not worth new work.

### rg#3 NIT: T1 as written does not prove "directly before"
- Plan sentence: "the output matches `/^AGENT-MODEL: opus \(RR-0385/m` on the line directly before the BRIEF-FILE line."
- Evidence: in the dry run, the preceding line is the brief.mjs step print. A bare `/m` regex would also pass if AGENT-MODEL were printed anywhere. T2 asserts position by popping lines, which is the right form.
- What would go wrong: the order could be wrong and T1 still pass; T2 covers the real run only.
- Smallest correction: in T1, assert `lines.at(-2)` matches AGENT-MODEL and `lines.at(-1)` matches BRIEF-FILE after `trim().split('\n')`.

No finding on: the exact-last-line assertion (:176 stays valid because AGENT-MODEL is printed before the last line); the dry-run `$` anchor at :117; the lane guard A2 (the hash is computed over the brief after it is written, and the Order-of-work block and CONTEXT sha line are appended by brief.mjs after `extra`); lanes resumed with an old brief (nothing reads `MODEL_LINE`; the guard only needs the BRIEF-FILE regex, Order-of-work and CONTEXT sha); old task.json files (the merge adds the line); plan-prep consumers (see ig#3).

Why :359 said Sonnet: git log -S finds commit 0258f7e61 "MB-85 text: ... orchestrator split, cite form ...". The note says "(MB-85, M-246, prior text kept; E2, revised form) ... a multi-step build goes to the owning lane, on Sonnet ... Operator, verbatim: "E2a"". The operator's E2 question was "who will do the build? Another opus? how many more tokens will this consume?" (69a register M-507 quote), and he chose "E2a". The new note supersedes it with the newer operator wording and keeps the old text; that honours M-246. It supersedes "for the building lane only", which matches RR-0385.

Could not verify: the board's `lane-guard.mjs` and `protocol-check.mjs` behaviour at runtime (read only, no execution), whether the real orchestrator reads stdout above BRIEF-FILE, and the full runtime refusal of task-431's launch gate after the edit (derived from code in check-lane-close.mjs :410-412 and :625-640, not executed because running the suite or gate was out of scope).
