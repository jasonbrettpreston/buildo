# task-461 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P461)

Authority: RR-0385 (MORNING-DECISIONS.md:1917-1920); RR-0443 b (:2285, open questions are checked against the rules before they reach him); RR-0392 (:1975): "I don't think we need any other infastrcuture beyond this"; RR-0460 (:2382, phone tests local first, then push; proof is a full local run before the push, then the Mobile CI run after it; no extra old-code run). Basis: board head 66ea5bb89 (wf2/board). Read with git grep, sed and node in memory.

## Operator questions: none
All three open choices are settled by the rules below.

## 8.1 Placement: ruled A
Rules: card AC1 "states that an extra field in the lot-form block still parses"; .cursor/MCBYLAWS-QUEUE.md:107 "Changing a test assertion, a floor, an oracle case or a worked example is a ruling." (covered by task-450 AC3, FOLD-PLAN.md:47 "(L1) A lot form with one extra field parses", GROUNDER-B.md:86 D1). Ruling: A, move the line into the "parses ..." case as true. The seat regression-1 read the history of :71 (cfb4dffee, SEMI-B) and found no operator word on strictness. The "parses" title is extended to name the new input (plan-ux#1); the "refuses" title stays true (plan-ux#2).

## 8.2 The other direction: ruled B
Rules: docs/specs/00-architecture/08_agents.md:496 "Every lock is proven in BOTH directions (fails on the old shape, passes on the new)"; RR-0460 item 2b (MORNING-DECISIONS.md:2382): "a full local run passing before the push, then the Mobile CI run after it; no extra \"old code\" run", approved ("Approved."). The card's Files line is the test file only. Ruling: B. The head red at :71 and schemas.test.ts:329 are the proof; the both-direction proof is recorded as implicit. No operator question: he approved this proof shape.

## 8.3 The server-side strict test: ruled no card now
Rules: GROUNDER-B.md:86 D1 calls the server block "a latent trap for the next additive change, not a live failure today" and gives no fix; src/tests/parcel-lot-form.logic.test.ts:145-148 is the server test and it is green and correct for the server schema (types.ts:141 `.strict()`); RR-0392 (:1975). Ruling: no card; the close-out names it in one line.

## UNVERIFIED items of the plan (section 9)
- The moved line is green: settled by reading. schemas.ts:425-429 is a plain z.object (extra keys stripped), and the 5af0f7be2 run received true at :71. The lane's run records it.
- The commit hook may not reach mobile tests: not settled by reading. task-450's card :314 says it did not, so the local run and the Mobile CI run (RR-0460) are the proof, not the hook.
- The queue-row file for DoD #6: Spec 137 Rule 2 (137_mcqueue.md:22) says a plan task that is not a queue row has its Backlog file as its row; the lane reads it at its own head.

## Files outside the Files line
None marked by the plan. The notes on task-461 and task-450 are written through the backlog CLI as close-out bookkeeping, not code files; the Files line stays mobile/__tests__/lotForm.test.ts.
