# Seat: regression: task-450 plan (PLAN-450-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 9a10561ef (the plan text says it read 5a26374b9). I read the whole task-450 file, FINDINGS-PLAN.md, and the plan's cited code and tests. Read-only throughout: no tests run and no database used. The code files were parcelSearchMatch.ts, semiQuestion.ts, lotMap.ts, schemas.ts, useParcelLookup.ts, useParcelPageHooks.ts and both mobile SearchBindings. The test files were parcelSearchMatch.test.ts, parcelScreens.golden.test.ts, surfaceRenderer.smoke.test.tsx, parcelSearchScreen.behaviour.test.tsx, semiQuestionScreens.golden.test.ts, lotMapScreens.golden.test.ts, the fixtures, spec99.mandates.lint.test.ts and subscriptionGate.test.ts. The specs and notes were Spec 99, Spec 100, MCFRONTEND-QUEUE.md:417, MD:2276-2300, and cards 449, 451, 454 and 456. Git history was read with `git log -S`.

## Why each pin was added (git history)
- **MF35-DF1 pins.** Added by b51bdead0 (2026-11-10, MF-35, "must-survive rows 11-17" from the legacy index.tsx). The legacy `!retryAfter` bug was deliberately pinned and not fixed. Sources are ~/Buildo-scratch/mcfrontend/MF-35/plan.v2.md:161 and plan.v3.md:286. The pins are parcelScreens.golden.test.ts:160, surfaceRenderer.smoke.test.tsx:76, and parcelSearchMatch.test.ts:397 (`unexpected: true` for RateLimitError(0)).
- **showMiss truth table (:417).** Also from b51bdead0, row 14 "the miss only when not fetching and no error". It is a legacy-oracle row, not an operator ruling.
- **redirect_no_data.** Added by cfb4dffee (2026-11-13, SEMI-B). It is a named case only, with no committed golden (semiQuestion.situations.json:166, :230).
- **Deleted matchType tests and shim.**
  - The `deriveMatchType` shim and `withDeclaredType` come from 4c8f30e30 (2026-09-16).
  - The "resolution absent keeps the derivation" lock was added by 3655da71d (MF-53, 2026-11-11) as "regression MED-4/MED-6". The MF-53 plan says it "has its own test" (plan.v2.md:223).
- **Spec 99 §6.5.** Created by 55fcdfb83 (2026-05-02), after the isFetching/Tabs flicker incident. Amended by dd638c297 (2026-05-05) with the enumerated carve-out. The spec is pinned by subscriptionGate.test.ts:81-96 and spec99.mandates.lint.test.ts:289-297.

## Checked and clean
- The V4 change (drop `&& !isFetching` from showMiss) moves toward §6.5. useParcelSearch has no placeholderData (useParcelLookup.ts:73-85) and the key is per query, so a stale no_match cannot show against a new query. The planned flip of :417 plus a new isFetching-toggle case is a real §8.3 lock.
- Removing `.strict()` from the lot form (AC3). No existing test pins strictness of the client lot form: `ParcelLotFormSchema` is referenced only in schemas.ts. The server schema stays strict (types.ts:132-140), which is fine because it is an output schema. The change matches the additive rule at schemas.ts:370-371. The enum-stays test keeps a real lock.
- The Spec 99 edits cannot break the spec-reading tests, as long as the "isFetching toggles on every refetch" text and the "Permitted carve-outs" header survive and no new heading is added.
- The lot-map fixtures all carry `resolution` (checked by script), so Q19 does not move the lot-map or semi goldens. A named case is not a golden, so V5 moves no semi golden.
- Unlanded branches. The only recent branch touching a shared file is mf83-daylight (c0d756111): a 6-line hunk at schemas.ts:395, away from the lot form. The other hits are old duplicates (SEMI-B, MF-46).
- Sequencing against open cards is declared: 451 "Runs after SEARCHFIX.2" (static-page.json), 454 "Runs after SEARCHFIX.1 to .4" (search descriptor and slice), 456 "Runs after SEARCHFIX.4" (smoke test).

## rg#1 HIGH: option A is credited to the 2026-09-16 rule, but that rule only covers the 10-row cap, and A overrides RR-0443 c for 1 to 9 rows
Plan: §7 8.1 "For A: The 2026-09-16 rule ... 'ask for a house number, do not list'"; card text "recommended, the 2026-09-16 rule".
Evidence: parcelSearchMatch.ts:12-13 reads "text_candidates -> a capped candidate list ...; beyond the cap, ask for a house number instead of listing". constants/parcelSearch.ts:20 reads "Beyond this the operator's 2026-09-16 ruling says: ask for a house number, do not list." Both mean at 10 or more rows. The existing test locks the other half: parcelSearchMatch.test.ts:414, 9 "Bathurst St" candidates, `overCap` `toBe(false)`. RR-0443 c (MD:2284) says "the person selects from the close addresses". No MD line rules "empty the list with no number". The rule has no operator verbatim; it was only in the 4c8f30e30 header and comment text.
Fix: In 8.1, state that the 2026-09-16 rule applies only at 10 or more rows. Say A would be a new rule, and that it overrides RR-0443 c for 1 to 9 rows, so only a typed operator choice can adopt A. Drop "ruled by" from the A bullet.

## rg#2 HIGH: Q19 breaks tests the plan does not list, and it reverses the MF-53 MED-4/6 lock with no spec note
Plan: step 2a; §4 "The tests at :82-143 move to `withResolution`"; §6 notes owed (Spec 99, task-319 only).
Evidence:
- The MF-35 helper `lookup` at parcelSearchMatch.test.ts:390 builds `{ match, candidates, warnings, parcel }` with no `resolution`. After Q19, :406 (S.ambiguous, expects text_candidates) and :410 (S.redirect, expects unique) get `no_match` and fail. :413-419 (truth table) also go through it. Only :82-143 are listed.
- Test :441-442 and :449 ("RED (planted): a client that ignores resolution would guess no_match") change meaning. The planted legacy path becomes production.
- The MF-53 lock text is parcelSearchMatch.test.ts:425-427 ("a payload without it keeps the client derivation above (an older server)").
- Descriptor mobile_parcel_disambiguation_map.descriptor.json:57 says "a payload from an older server still parses and falls back to the client derivation". Q19 makes that false, and that file is not on the card's Files line.
- Spec 100 §3.2 dated note 2026-11-11 and plan.v4.md:66 state the same older-server fallback. No Spec 100 note is planned.
Fix: Add the `lookup` helper and :406, :410, :413-419, :441-449 to the test edits. Add a Spec 100 §3.2 dated note ("resolution is now required in practice; an absent value reads as no_match"). Reword disambiguation_map.descriptor.json:57 and add it to Files.

## rg#3 HIGH: under option A, 'Bathurst St' tests the plan does not list lose their lock (and the report link)
Plan: §5 risk 4; step 15 names only the "ambiguous" fixture.
Evidence:
- parcelSearchScreen.behaviour.test.tsx types 'Bathurst St' or 'Bathurst Street' at :107, :119, :122 and :159. They assert candidate selection, the checked state, the SELECT button, and the help link at :162. Under A, candidates are [], so these pass for the wrong reason or fail.
- Fixture situations `fetching_with_candidates` and `none_checked` (3 rows, query "Bathurst St") feed parcelScreens.golden.test.ts "the spinner shows over still-listed candidates" and the SELECT-disabled test (:150-170). The plan's risk 4 notes the fixtures but step 15 edits only :160-169.
- The "Report incorrect address match" help button sits inside the list block (SearchBinding.tsx:~198-206), so A also removes the help link for a no-number search. The plan does not say so.
Fix: List every 'Bathurst St' test and fixture above under A, and give each a numbered query. State in 8.1 that A removes the help link and SELECT for no-number searches.

## rg#4 MED: the wrong-lot topic reverses a 2026-11-19 queue note, and the T8 pin, with no note to supersede it
Plan: step 5/6 topic 'wrong-lot'; step 8; §6 notes owed.
Evidence: MCFRONTEND-QUEUE.md:417 (2026-11-19, task-321 follow-up): "the links use the Help page's built topics ... topic address_match ... because v8 names the topic wrong-lot, which the Help page does not have ... The note above that names wrong-lot is superseded for the topic only." static-page.logic.test.ts:229-236 (T8) pins `topic: 'address_match'` and the label 'Report incorrect address match'. maxbldHelp.test.ts:22/:29 and parcelSearchScreen.behaviour:162 also use address_match. The 11-19 note says it is "not an operator ruling", so the reversal is allowed, but it must be recorded.
Fix: Add a dated note under MCFRONTEND-QUEUE.md:417 ("superseded by task-450, B.7"). Add the link-label question to the plan: the button text stays "Report incorrect address match" but now opens "Wrong address or lot".

## rg#5 MED: L3 changes the shared classifier, so the lot-map and semi pages change too, and the 0s case loses its Retry
Plan: step 2b, which names only the search page and its tests.
Evidence: `classifyParcelSearchError` is called from lotMap.ts:87 and semiQuestion.ts:68. The Retry button exists only in the `unexpected` block (SearchBinding.tsx:137-150; LotMapBinding.tsx:72; SemiQuestionBinding.tsx:63-71). After `retryAfterSeconds == null`, a RateLimitError(0) shows "Try again in 0s" with no button on three pages, the same as the 7s case today. lotMapScreens.golden.test.ts:226-229 asserts only `rateLimited` and the contract block, so it stays green and the change goes unnoticed.
Fix: Name the lot-map and semi pages in step 2b. Add a 429-of-0 assertion for each page, or say the 0s case is meant to be buttonless.

## rg#6 MED: the Spec 99 note is placed under §5.1, which triggers the §5 amendment rule
Plan: §6 "placed after §5.1"; §5 risk 8.
Evidence: Spec 99 :783 reads "any change to §3, §4, or §5 requires a WF1 amendment with adversarial review". The plan says :782; the line is :783. §5.1 is the AuthGate/AppLayout boundary table, and Spec 99 line 5 says the MaxBLD app is outside it. The redirect-once pattern is already tied to §6.5 by useParcelPageHooks.ts:1 and semiQuestion.ts:3 ("§6.5 a redirect fires on the first settled data only"). §6.5 has no amendment gate.
Fix: Place the dated note at the end of §6.5 (after the 2026-05-05 amendment). State there is no §5 change, so :783 does not apply. Remove risk 8's fallback.

## rg#7 LOW: V5 leaves stale comments and a misnamed test, and adds no §8.3 isFetching-toggle test for the semi gate
Plan: step 3; AC5.
Evidence: the semiQuestion.ts:53 comment says "the Lookup route with no data". The semiQuestionScreens.golden.test.ts:154 title says "no data and not fetching replaces with the Lookup route". The `redirect_no_data` key (fixtures/semiQuestion.situations.json:166, :230) will name a loading state. Spec 99 §8.3 (:705) requires each render gate to have a test that toggling isFetching does not flip it. AC5 covers only isFetching false.
Fix: Update the :53 comment and the test title. Rename the key to `no_data_loading`, or note that it keeps its old name. Add one case, "data undefined, isFetching true and false give the same 'loading' state".

## rg#8 LOW: the "task 3 / task 8" owners in §5 risk 7 are fold-plan numbers, not backlog ids
Plan: §5 risk 7.
Evidence: backlog task-3 is CHK.1 (DONE, scripts/hooks only) and task-8 is INFRA.5. The real owners are task-451 (static-page.json, static-page.logic.test.ts, static-web-binding.ui.test.tsx), task-456 (surfaceRenderer.smoke.test.tsx) and task-454 (the search descriptor and slice).
Fix: Use card ids. State that 451, 454 and 456 are sequenced after 450 on their own cards, and that 450 must not touch their files beyond the listed hunks.

STATUS: 8 findings (0 CRITICAL, 3 HIGH, 3 MED, 2 LOW); the plan is sound on L1 and V4, but its option A rests on a misread rule, and Q19 and the A-rewrite break tests it does not list.
