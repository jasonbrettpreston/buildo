# Fold check: task-465 (PLAN-465-v1), round 1 plus three addenda
Checked by: Cairn-Ground-P465
Lane: BL-MCFIX465
Read: the card in the working tree of ~/Buildo-wt-board and docs/reports/reviews/task-465/.

Round 1 fold
- All 93 pairs of FOLD-465.json are present exactly once. No `old` text is left, none is doubled and none is lost. The Files pair is in the Description, and `Files:` occurs once.
- The card holds one round line, `Plan review round 1: 41 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-465/GROUNDER-PLAN.md; triage docs/reports/reviews/task-465/TRIAGE-PLAN.md`, followed by 28 HIGH and MED outcome lines.
- The counts match GROUNDER-PLAN.md and TRIAGE-PLAN.md: 55 ids; 42 CONFIRMED (3 HIGH, 25 MED, 13 LOW, 1 NIT); 13 REJECTED.
- `rule-lists.mjs findings` prints the three Ruled lines the grounder file holds (7, 12 and 8 findings). `rule-lists.mjs check-tasks` prints nothing for task-465.

First addendum (the state name and the refine line)
- The four pairs are each present once: step 9 gives state `partial` with golden `suggest`, O8 reads "RULED: no new state name", the 3(b) refine sentence, and T12 covers refine while typing. The O8 entry in QUESTIONS-RULED.md was replaced in the same way.

Second addendum (the prompt line, O14; operator RR-0495, "correct")
- All 13 pairs are present once. They cover: the 3(b) short-query bullet ("The search.prompt line and its key are dropped"), the situation and fixture changes ("showPrompt is removed from the situation"), the web and `maxbld-web.ts` text ("no showPrompt field"), the web test lines (:33, :81, :90), the :184 case ("the {min} binding now lives in search.input.hint"), the test line, O14 ("no prompt line at all (second addendum)"), T17, and the descriptor check text.
- The O14 pair is applied in QUESTIONS-RULED.md. RR-0495 is on the card as an appended note.
- Sweep: every content key and every state has a golden after the plan, by reading and not by running the key test.
  - The 12 states are loading, redirect, ambiguous, miss, empty, schema_drift, rate_limited, unauthorized, error, static, hit (golden reports_left) and partial (golden suggest).
  - `search.prompt` is dropped, so no orphan key remains.
  - Still unread: whether every descriptor check must be covered by a golden's `covers`. screen-checks.mjs checks states only, in the lines I read.

Third addendum (NAV-6, the web rows)
- The three pairs are each present once:
  - Step 12: web rows carry the same route as `href` for a lot route, and a map-kind row carries none (S-7).
  - Step 12 tests: nav-by-route.logic.test.ts loses its allow-list entry for node:Button#select (audit 46).
  - The Files line gains src/tests/surfaces/nav-by-route.logic.test.ts.
- The Files line now has 36 entries and resolves to 9 lists with no unmatched path.
- The QUESTIONS-RULED.md entry "Web row links (third addendum, NAV-6)" is applied.
- Reconciliation: the lane applies the same one-path addition to its worktree card's Files line through the backlog CLI. The two Files lines must name the same set at merge.

Hash
- `planHash` of the card as it stands (title plus body after the front matter, whitespace squashed) is sha256:ff498c3070c5.
- The last `Plan:` line of GROUNDER-PLAN.md and of this file is the same, and equals the orchestrator's value. If the card's title or body changes before the commit, recompute it.

Verdict: PASS

Plan: task-465 sha256:ff498c3070c5
