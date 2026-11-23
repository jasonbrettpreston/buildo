# Seat: regression: task-367 plan (PLAN-367-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: `wf2/board` head now `1da9f842d`. The plan says it read `b32ea9b4c`, so the board has moved since. I read the task file (all 365 lines, including the dated notes), and these files:
- `src/tests/surfaces/handbook-rule-map.logic.test.ts` (:30-82, :170-410), the history of that file, and `git log` of `register-locks-resolve.infra.test.ts`.
- `src/tests/surfaces/register-locks-resolve.infra.test.ts` (:1-80).
- `src/tests/surfaces/nav-by-route.logic.test.ts` (header, :40-60, :320-330).
- `docs/specs/02-web-admin/135_mcfrontend_decisions_register.md` (:10-20, :55-82, and the last cells of FE-36, FE-49, FE-51, FE-54).
- `docs/specs/02-web-admin/136_mcfrontend_handbook.md` (:190-195, the OWED count).
- `scripts/surfaces/_schema/converted-surfaces.json`.
- `mobile/__tests__/parcelScreens.golden.test.ts` (:210-225).
- The `lead_parcels` grep over `scripts/surfaces` and the mobile and route code.
- `git diff --name-only wf2/board...wf1/inc1b-gates`.

I ran no test runner, wrote nothing, and made no model call. UNVERIFIED: the acceptance-grep outputs, `gate.mjs --staged` behaviour (the plan's G1), and McFixReborn's file list.

## Checked and clean
- **Lock purposes kept.**
  - `register-locks-resolve.infra.test.ts` FLIP_PENDING (:26) is a "shrink-only list of OWED rows whose lock already landed". The plan's OQ1=y path never uses it. The OQ1=n path adds the three ids, which is what the MF-37 and FE-39 precedent does (:20-25).
  - `handbook-rule-map.logic.test.ts` C-T2 and C-T3 (:255-283, added in d429b287d for RR-0384's 13 rows) pin the rows by lock path, not by id. The planned edit keeps that.
  - A row that is RULED must have a tracked lock (register-locks-resolve :66-69). So adding an id to BUILT_BY_367 cannot take a row out of OWED without a lock.
- **Scope with the parked branch.** `wf1/inc1b-gates` touches only gate scripts, `compute-reach`, `mobile-literals`, `mobile-never-do`, fixtures, `src/tests/gate-*.infra.test.ts`, migration 333, `logic_variables.json`, `docs/reference/*`, lane reports, and the task-367 file itself. The diff names none of the plan's paths. No `src/tests/surfaces/*`, Spec 135/136, queue, panels or prereg paths are touched, so there is no path or test-name collision and no double-check. The task file is the one shared file. It is textual, and the board's version already says the plan is parked.
- **Dated card notes.**
  - The 2026-11-20 operator words ("test the new gates", "1 y 2. whatever you recommend") belong to gates A, B and C. RR-0386 parks them, so they are not contradicted.
  - The mobile-numbers and Spec 90 never-do candidates ((b) and (c) on the card) are dropped, but only by RR-0386 and the orchestrator's note. I did not find an operator word dropping candidates (a), (b) or (c) specifically. See rg#5.
- **No rebuilding found.**
  - `nav-by-route.logic.test.ts` NAV-1 to NAV-6 do not check "navigate, not push" for tab routes. I confirmed this from its rule list.
  - `parcelScreens.golden.test.ts:217-220` checks only 3 files, with the regex `useFilterStore|@/lib/onboarding|useLeadFeed|useFlightBoard`. T2's set is wider and uses an AST, so it does not disagree.
  - The plan reuses `converted-surfaces.json` `scope.programme_scopes` and `expected_count` 33 (confirmed), `PARCEL_TAB_ROUTE`, and the nav-by-route fail-closed list form.
- **The two live fe.51 breaks exist as the plan says.** `_layout.tsx:48` reads `router.push(PARCEL_TAB_ROUTE[tab])` and `tracked.tsx:99` reads `router.push(PARCEL_TAB_ROUTE.account)`.
- **Scope.** All planned steps touch only tests, Spec 135/136, the rule map, the rule-lists page, queue and records. Acceptance #5 checks that nothing else changes. No runtime, descriptor or generated-page change other than Spec 136, the rule map and the rule-lists page.

## rg#1 MED: FE-49's standing-exception words and the "task-434's" ownership words go stale, and the plan does not touch them
Plan: §6 Commit 1, Spec 135 cells FE-49, FE-51 and FE-54 flip to RULED. §0 item 5 and §1 claim the exception words and ownership words stay true. §3 T2 scans only in-scope descriptors (`parcel_product` and `parcel_admin`).
Evidence:
- Register FE-49 cell: "Known standing exception: a platform_shared contract descriptor note already names lead_parcels (REPORT-429 section 3A item 5); task-434 meets it when it builds the lock."
- `scripts/surfaces/platform_shared/F16/contracts/contract_admin_pipeline_step_output.descriptor.json:433` has `"scope": "platform_shared"` and names `lead_parcels` in a table list.
- The same three cells say "the lock is task-434's and the path is a reservation". FE-51's cell also says Spec 126 calls the tab rule "convention, not checked by the lock" (the FE-51 row text and the generated Spec 136 fe.51 line say "PROSE-ONLY until the lock below exists").
- After the flip these read false: the lock now exists and is 367's. The exception is silently outside T2's scope, so the fence rule "lead_parcels is read by no surface" reads RULED with a known hit that no test sees or lists.
Fix: add to commit 1 a dated note on each of the three rows. The note says the lock landed under task-367 and that the "task-434's" ownership is satisfied. For FE-49 it also states that the platform_shared exception is out of T2's scope, and who owns it. Keep the prior text, per the Spec 135 rule 3 dated-note form. Also decide whether to add the one platform_shared descriptor to T2 as a named, fail-closed exception, so the "meets it when it builds the lock" promise is kept.

## rg#2 MED: FE-51 and FE-49 go RULED while owned breaks stay listed, and the plan cites no precedent
Plan: §6 Commit 1 and OQ1.
Evidence:
- The FE-36 row reads "RULED 2026-11-11, lock landed (MF-75). Lock: `src/tests/surfaces/nav-by-route.logic.test.ts`", and its lock lands with named exceptions (header: "the six known violations as NAMED EXCEPTIONS, each tied to the task that will fix it").
- So RULED with fail-closed owned exceptions is a real precedent, and T3's design copies it.
- But that precedent rested on the operator's explicit "yes" to "landing it now with the six known violations as NAMED EXCEPTIONS". The plan asks OQ1 only about the flip and the 22 to 19 count. It never states that two live breaks and one out-of-scope exception ride along.
Fix: reword OQ1 to say "FE-51 reads RULED with 2 named, owned push breaks (MF-49/MF-50, MF-51/MF-52) and FE-49 with the out-of-scope exception from rg#1; FE-36 precedent". Cite the FE-36 precedent in §6.

## rg#3 LOW: the floor "21 - 3" keeps the old slack of one and weakens nothing, but it leaves the OWED set otherwise unpinned
Plan: §0 item 4 and §6, `:281` becomes `21 - BUILT_BY_367.length` (so 18).
Evidence: `handbook-rule-map.logic.test.ts:281` `expect(owed).toBeGreaterThanOrEqual(21);`. The register has 22 OWED today (`grep -c 'Status: OWED'` on Spec 136 gives 22). After the flip, 19 are OWED and the floor is 18. That is the same one-row slack as before (22 against 21), so the purpose is preserved (the 13 locks plus FE-39's flip). It still lets a different row flip without anyone noticing. Acceptance #3 asserts 19 only in a lane grep and not in a test.
Fix: either leave it as is and say the slack is deliberate, or derive the floor from the 13 `NEW_LOCKS` minus BUILT_BY_367 plus the pre-existing 9 OWED rows.

## rg#4 LOW: a second fail-closed push list duplicates the file scan of nav-by-route
Plan: §3 T3.
Evidence:
- `nav-by-route.logic.test.ts` `DIRS` already walks `mobile/app/(app)/parcel-tool` and `mobile/src/components/parcel`, and it already holds an allow-list with `count` and `kind` entries (e.g. :323-329).
- T3 adds a separate list with the same key shape (file, call text, count, why) over a subset of the same files.
- This is not a contradiction. A router call that nav-by-route already explains as `ok` or `flag` and T3 flags as a tab push could be counted in two lists, with the two lists drifting apart.
- Operator words: "you are probaley rebuilding stuff that already exists you do this all the time". I found no real rebuild, but this is the nearest case.
Fix: say in §3 why T3 is a separate file (the reserved lock path and register row `nav-tab-switch.logic.test.ts`). Import `DIRS` and the router-call finder from nav-by-route, or state that they are not shared and why.

## rg#5 LOW: card AC #1 and the dropped gate candidates rest on the orchestrator, not on an operator word
Plan: §8 "Old acceptance criteria", OQ2, and §1 Out.
Evidence:
- Card AC #1: "The gate list is confirmed by the operator before any gate is built".
- Description candidates (a), (b) and (c) are the gates A, B and C that the plan drops.
- The only operator words that support the change are RR-0385 item 6 ("the handbook rules are key") and RR-0386 "a" (record text only: the note at :360 carries the verbatim "a" but not the question).
- The plan handles AC #1 correctly by asking OQ2. But the three descriptive candidates (a) to (c) are not marked anywhere on the card as "dropped by RR-0386" in the Description or Acceptance text, so a later reader sees an unmet or contradictory list. The 2026-11-20 verdict notes (compute-reach fixes, mobile-literals) stay on the card as live "must fix" items.
Fix: in commit 0's task-file edit, add one dated note stating that candidates (a) to (c) and the 2026-11-20 must-fix list move with the parked branch under RR-0386. Check that the note quotes RR-0386's actual question and "a" from MD:1929-1933 (UNVERIFIED by me).

## rg#6 NIT: future-breakage messages
Plan: §3 and §9.
Evidence: floors "files ≥ 30, descriptors ≥ 40" and `expected_count` equality (T1 (A)). `expected_count` is 33 today. A new converted surface in `programme_scopes` raises `expected_count`. The existing `surface-conformance` test already forces that edit, so T1's own equality would go red in step with it. A descriptor losing `x-draft.files` makes T2 count fewer files. A new tab route added to `PARCEL_TAB_ROUTE` is picked up by the AST, which is right. Task-411, 383 and 388 are covered in §7.
Fix: the plan does not say what each failure message tells the developer. Add one sentence to §3 "Common": every failure prints the offending file, rule, and the next step (fix the code, or add or remove a named exception). The plan has this for T3 only.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 2 MED, 3 LOW, 1 NIT); the plan keeps each existing lock's purpose and does not collide with wf1/inc1b-gates, but it must update the stale "task-434's" and standing-exception words on FE-49, FE-51 and FE-54 and name the owned breaks in OQ1.
