# Seat: integration: task-461 plan (PLAN-461-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board `wf2/board` at head 2c902a184. The plan read 492ef72c7. `git diff --stat 492ef72c7 HEAD -- mobile` and `git diff --stat 5af0f7be2 HEAD -- mobile` are both empty, so the plan's mobile line numbers still hold. Files read:
- the task-461 card and `docs/reports/reviews/task-461/context-r1.md`
- `mobile/__tests__/lotForm.test.ts` and `mobile/__tests__/schemas.test.ts:320-342`
- `mobile/src/lib/schemas.ts:418-442` and `mobile/package.json:11,82-100`
- `~/Buildo-scratch/lanes-20261124/phone-5af0f7be2.out`
- the task-450 card :59 and :314
- `FOLD-PLAN.md:47`, `GROUNDER-B.md:86`, `.cursor/MCBYLAWS-QUEUE.md:107`
- `contract_parcels_lookup.descriptor.json:70-71`
- `src/tests/parcel-lot-form.logic.test.ts:145-148`
- both descriptors that cite lotForm.test.ts

UNVERIFIED: the hook's related-test reach (as the plan itself says), and the queue-row file for DoD #6. I did not run any test.

## Checked and clean
- **The failing line.** `lotForm.test.ts:71` is exactly the plan's text: `{ ...form(true), extra: 1 } }).success).toBe(false)`. The phone output shows it failing at `lotForm.test.ts:71:115`, with the output lines the plan cites (81-97, 305+).
- **The reused fixtures.** `base` is at :18 and `form(unsure, detected)` at :19. The "parses a payload..." case is at :63-67 and the "refuses..." case at :68-72. All three match the plan.
- **The schema.** `schemas.ts:423-424` is the dated note, with the quoted text. `ParcelLotFormSchema` is a plain `z.object` at :425-429. `lotForm: ParcelLotFormSchema.nullable().optional()` is at :440. The plain schema is what makes the flipped assertion parse.
- **task-450's lock.** `schemas.test.ts:324-341` is as cited: extra field at :329-330, through the lookup result at :333-335, and the enum throw at :339. It is not touched.
- **The rule quotes.** All of these match their lines:
  - task-450 AC3 at card :59
  - FOLD-PLAN :47 (it says `.strict()` at :428, the line before the later +1 shift; the plan's :429 is the current line)
  - GROUNDER-B :86
  - MCBYLAWS :107
  - the contract's `additive_only` at :70-71
- **AC2 (no other strict assertion in the phone tests).**
  - A grep of `mobile/__tests__` for `.strict()` and `ParcelLotFormSchema` finds only the schemas.test.ts lines.
  - lotForm.test.ts:71 is the only strict assertion, so AC2 holds once it is moved.
  - The server-side strict test at `src/tests/parcel-lot-form.logic.test.ts:145-148` pins the server schema, not the phone mirror. It is correctly left alone.
- **No caller, golden or generated file breaks.**
  - Both descriptors (`mobile_parcel_semi_question.descriptor.json:182` and `census/mobile-product.json:7300`) cite lotForm.test.ts by file name only, with no line number, so they are unaffected.
  - The moved line is net-zero for later line numbers.
  - No spec, script or census file pins the case titles "refuses a block outside the contract" or "parses a payload with the block".
- **The run command.** `test:ci` is `jest --coverage --ci` (`package.json:11`). The jest block at :82-100 has no `coverageThreshold`, so a single-path run with coverage will not fail on thresholds. `mobile/node_modules` is a symlink to `/Users/brettpreston_macmini/Buildo/mobile/node_modules`, which matches the plan's claim.
- **Nothing is already there under another name.** schemas.test.ts duplicates the assertion at the schema level only. The plan states this in §6 Surprise 2 and keeps the line because AC1 needs this file to state the plain form.

No findings. The plan matches the real code, and the one-line test fix breaks no caller, golden, generated file or pinned test.

STATUS: 0 findings (none); the plan matches the real code at head 2c902a184 and the one-file edit has no unlisted caller or pin.
