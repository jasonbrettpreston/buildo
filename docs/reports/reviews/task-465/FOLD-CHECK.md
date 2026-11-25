# Fold check: task-465 (PLAN-465-v1), round 1 plus two addenda
Checked by: Cairn-Ground-P465
Lane: BL-MCFIX465
Read: the card in the working tree of ~/Buildo-wt-board and docs/reports/reviews/task-465/.

Round 1 fold (kept from the first check; re-verified)
- All 93 pairs of FOLD-465.json are present exactly once. No `old` text is left, none is doubled and none is lost. The Files pair is in the Description, and `Files:` occurs once.
- The card holds one round line, `Plan review round 1: 41 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-465/GROUNDER-PLAN.md; triage docs/reports/reviews/task-465/TRIAGE-PLAN.md`, followed by 28 HIGH and MED outcome lines.
- The counts match GROUNDER-PLAN.md and TRIAGE-PLAN.md: 55 ids; 42 CONFIRMED (3 HIGH, 25 MED, 13 LOW, 1 NIT); 13 REJECTED.
- `rule-lists.mjs findings` prints the three Ruled lines the grounder file holds (fddcef965c28 with 7 findings, 2362a3dc0a1d with 12, 08d8b9b287e8 with 8).
- `rule-lists.mjs check-tasks` prints nothing for task-465.

First addendum (the state name and the refine line)
- The four plan pairs are each present once in the card. The step 9 state bullet now says state `partial` with golden `suggest`. The O8 line now says "RULED: no new state name". The 3(b) sentence says the refine line shows while typing and `list.hint` after Enter only. T12 now covers the rows with refine while typing. The superseded "suggest only" texts are gone.
- The O8 entry in QUESTIONS-RULED.md was replaced in the same way.

Second addendum (the prompt line, O14, operator RR-0495)
- All 13 plan pairs are present exactly once. The checks were these:
  - 3(b) short-query bullet: the miss line, with "The search.prompt line and its key are dropped (O14 ruled)".
  - Step 1: "showPrompt is removed from the situation".
  - Step 5: "the prompt block, its testID and its key are removed (O14)".
  - Block-order case: "updated for the drop and loses prompt".
  - Step 10: "showPrompt is removed from every situation, the static one included", with the named case `prompt_type_more` becoming `short_query_enter`.
  - Step 12: web binding "(no prompt)", `maxbld-web.ts` "no showPrompt field (O14)", and search-web-binding.ui.test.tsx ":33 and :81 the prompt text, :90 the idle prompt".
  - Rewrite list, :184 case: "the {min} binding now lives in search.input.hint".
  - Test line: "no showPrompt field".
  - O14: "no prompt line at all (second addendum)".
  - T17: "a short Enter shows the miss line".
  - Descriptor check: "loses the prompt, and the measured_states entry".
- No `old` text of those pairs remains. The old texts "showPrompt false at rest", "the prompt line in the drop-down" and "RULED: yes (mock state 1 draws no prompt" are gone.
- The O14 pair is applied in QUESTIONS-RULED.md ("RULED: no prompt at rest and no prompt line at all"); the old "RULED yes" text is gone.
- The operator's own ruling RR-0495 (MORNING-DECISIONS.md:2578-2579, verbatim "correct") is on the card as an appended note. The plan's O14 text rests on RR-0487, RR-0483 and the task-450 reading. The note carries RR-0495, so no further text is needed for it.
- Files line: 35 entries, resolving to 9 lists with no unmatched path. No path was added by either addendum. Every file that reads `search.prompt` or `showPrompt` is already on it (both bindings, `maxbld-web.ts`, both fixtures, the goldens, the golden, smoke and web tests, the census and descriptors).
- Sweep: every content key of both content files and every state has a golden after the plan. This was done by reading the keys and the goldens' states, not by running the key test.
  - The 12 states: loading, redirect, ambiguous, miss, empty, schema_drift, rate_limited, unauthorized, error, static, hit (golden reports_left) and partial (golden suggest).
  - The key `search.prompt` is dropped, so no orphan key remains.
  - One open item: the descriptor-check coverage rule for `covers` was not read, because `screen-checks.mjs` checks states only in the lines I read.

Hash
- `planHash` of the card as it stands (title plus body after the front matter, whitespace squashed) is sha256:7ebfea156229.
- The last `Plan:` line of GROUNDER-PLAN.md and of this file is the same, and equals the orchestrator's value. My earlier in-memory 801be35560a0 predated the RR-0495 note.
- If the card's title or body changes before the commit, recompute it.

Verdict: PASS

Plan: task-465 sha256:7ebfea156229
