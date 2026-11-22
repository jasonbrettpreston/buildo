# Seat: integration: task-436 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### ig#1 MED: the Spec 08 note changes the text of rule list `agents-s7-s11`, which stales the plan evidence of task-431 (LATER, already prepped)
- Plan sentence: "Add one dated note to Spec 08 after :359." and "Land 436 first so 437 rebases onto it."
- Evidence: scripts/analysis/rule-lists.json:45 defines `agents-s7-s11` as 08_agents.md sections "7. Rules & economics" and "11. ...". Section 7 starts at 08_agents.md:344 and ends before "## 8" at :389, so :359/:360 is inside it.
  - scripts/hooks/check-lane-close.mjs:410-412 (`listProof`, used by the launch gate at :625-640) refuses committed plan inputs that "do not carry the whole list ... as it is now: the list was shortened, softened or is out of date".
  - The plan hash itself (check-lane-close.mjs:587) covers only the task title and body, so it is not affected.
  - docs/reports/reviews/task-431/ holds `in-plan-compliance-agents-s7-s11.txt` and `plan-compliance-agents-s7-s11.txt`, and task-431 is `status: LATER`.
  - task-437 and task-438 have 0 such files, so they are not prepped yet. 437 and 438 will be prepped after the note lands, so they are fine.
  - Tasks 423, 430 (RUNNING), 432, 433 and 435 also hold s7 evidence. They are BUILT or already launched, so only a rebase or re-close of a running lane touches them.
- What would go wrong: once 436 lands, the launch dry run for task-431 is refused with the "out of date" list message until its agents-s7-s11 plan compliance is re-run. The plan names 431 as "about to be prepped" but does not mention this.
- Smallest correction: add one line to ORDER: "after 436 lands, re-run the agents-s7-s11 plan compliance for task-431 (or prep 431 only after 436 and 437 have landed)". 437 adds its own note to the same file, so one re-run covers both.

### ig#2 LOW: the plan does not say where `MODEL_LINE` goes in the merged `extra`
- Plan sentence: "At :223, the merged `extra` adds `MODEL_LINE` when `!extra.includes(MODEL_LINE)`."
- Evidence: backlog-lane.mjs:223 is `... ? extra : [...extra, spec.extra[spec.extra.length - 1]]`. Today `spec.extra` last is the lens line, so the plan is right that the merge relies on lens-last.
  - Reliance is only in this merge, plus the :221 comment. brief.mjs prints `extra` in order and has no size cap or order dependence (checked, no MAX or length check). No test reads `extra` positionally; the readers at test :145, :209, :296, :327 and :448 use `join`.
  - The check at :223 also only looks for the lens line, so a given spec that already holds the lens line would get `MODEL_LINE` appended after it.
- What would go wrong: nothing breaks, but "lens line last" would silently stop holding in that case, and an implementer could edit the :223 expression in a way that makes the index-based lens pick take `MODEL_LINE`.
- Smallest correction: write the merge as `[...extra, ...(extra.includes(MODEL_LINE) ? [] : [MODEL_LINE]), lens]`, or state that the order of a given spec is not guaranteed. Keep the lens pick as `spec.extra[spec.extra.length-1]` and add `MODEL_LINE` in `spec.extra` before it, as planned.

### ig#3 NIT: plan-prep commit will now show `AGENT-MODEL:` in its output
- Plan sentence: "print `AGENT-MODEL: opus ...` just before BRIEF-FILE, on both the dry-run path and the real path."
- Evidence: rule-lists.mjs:762 runs `backlog-lane.mjs ... --dry-run` as the gate and :776 passes its stdout through. That is the only machine consumer besides the tests.
  - Tests at backlog-lane.logic.test.ts:681, :829 and :853 use `toMatch`, not exact equality.
  - lane-guard.mjs:56 and protocol-check.mjs:61 only regex-match the BRIEF-FILE line. Hash and path are unchanged.
- What would go wrong: nothing breaks. The planner sees "set model opus on the Agent call" at plan-prep time, which is cosmetic.
- Smallest correction: none.

Checked and fine: the four BRIEF-FILE readers (backlog-lane.mjs, the test, lane-guard.mjs, protocol-check.mjs) and the other greps of scripts, src, .claude and .cursor, which found none. Brief generation: `brief.mjs` prints `s.extra` under "Task-specific rules"; its forbidden-name scan (guard.mjs TERMS) does not match `MODEL_LINE`. No budget row for 08_agents.md in 122_split_manifest.json, so spec-split-check is not affected. The test count at :670/:673 counts lines matching lens-input or deepseek-review, which `MODEL_LINE` and the AGENT-MODEL line do not match.
