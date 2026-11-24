# Seat: regression: task-461 plan (PLAN-461-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 2c902a184 (wf2/board). The plan read 492ef72c7. `git diff --stat 492ef72c7 HEAD -- mobile/` is empty, so the plan's line numbers still hold. Files read: task-461 card, mobile/__tests__/lotForm.test.ts:55-73, mobile/src/lib/schemas.ts:418-442, phone-5af0f7be2.out (lotForm failure at lines 81-97), grep of mobile/__tests__ and of the two descriptors that cite lotForm.test. I did not read the task-450 review folder files (FINDINGS-PLAN, GROUNDER-PLAN) in full. The task-461 folder holds only context-r1.md, so there are no prior lens findings to repeat. I ran no test runner and wrote no file.

Checked and clean:
- The failing line is real. It is lotForm.test.ts:71, `{ ...form(true), extra: 1 }` expecting `false`. The phone output shows "Expected: false / Received: true" at 71:115.
- The schema is plain on purpose. schemas.ts:423-424 carries the dated task-450 note ("prior text kept: the object ended in .strict()"), and ParcelLotFormSchema at :425-429 is a plain `z.object` with closed enums.
- Old assertion history. Line 71 came in with cfb4dffee (2026-11-13, SEMI-B) as part of the original strict mirror. It was never an operator ruling of its own. The semi rulings ("semi all y", "semi ask a") govern when the question is asked, not strictness. Flipping the line therefore drops no standing operator word.
- The new form keeps a real lock. The extra-field-parses assertion goes red if `.strict()` returns. The closed-enum refusals at :69-70 stay, so the "closed enum lists stay" part of task-450 AC3 is still locked here. schemas.test.ts:327-339 locks the same thing, so nothing is lost.
- No other phone assertion of the strict form. The only other "strict" hit near lot form in mobile/__tests__ is trackedLots.test.ts:192, which is a different schema.
- Descriptors. mobile_parcel_semi_question.descriptor.json:182 and census/mobile-product.json:7300 cite lotForm.test.ts only for the "ask only when unsure" rule. That rule is untouched by this change.
- The plan records the change where the rule text lives. The rule text is the schema's dated note and task-450 AC3. The plan adds a trailing comment on the moved line and a dated note on task-450 (plan section 7).
- Conflicts. The plan is one test file and touches no schema. I did not list unlanded branches (no worktree enumeration was done), so branch conflict is UNVERIFIED. The exposure is small, because only a branch editing the same two `it` blocks would clash.

## rg#1 LOW: the "refuses" case title becomes slightly stale only if option B is chosen
Plan: section 8.1, option B (flip in place and retitle).
Evidence: lotForm.test.ts:68 `it('refuses a block outside the contract')`. After option A, the :69-70 enum refusals still match that title.
Fix: none needed on the plan's recommended A. If the lane picks B, keep the title true by naming the enums, as the plan already says.

STATUS: 1 finding (0 critical, 0 high, 0 med, 1 low); the plan is sound and keeps a real lock, with no operator word dropped.
