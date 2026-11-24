# Seat: regression: task-449 plan (PLAN-449-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board `wf2/board` head `9a10561ef`. I read the whole task file, `FINDINGS-PLAN.md`, `GROUNDER-PLAN.md` and `QUESTIONS-RULED.md`, and MD:2276, 2283, 2290 and 1975. I read `src/lib/admin/parcel-lookup.ts` (:130-335) and `src/lib/parcels/address.ts`. The test files were `parcel-lookup-resolution.logic.test.ts`, `search-parser-guard.logic.test.ts` and `search-routing.logic.test.ts`. I also read Spec 100 (:103, :107, :144), Spec 89 (:34-48), doc-2 (G.1 at :89, A.3 at :32) and the generated surface-registry text. I ran `parseLinearName` in memory with node (type stripping) and read git history with `git log -L` and `git log -S`. I ran no test runner and made no database read, because the database is not open to this seat.

## Checked and clean
- **`parcel-lookup-resolution.logic.test.ts:64-69` ("typeahead, 1 row -> unique").** `git log -L` gives one commit, 3655da71d (MF-53, 2026-11-11), the commit behind Spec 100 :103 clause (1) "one row is `unique`". The plan's flip to `text_candidates`, match null, candidates [P9] still locks "a one-row typeahead never opens". The new form is a real lock, and the ruling for it is RR-0442 with RR-0443 c.
- **`search-parser-guard.logic.test.ts:194-199` ("the typeahead path narrows the same way").** It was added in 87ecc6e97 (task-69, RR-0166 ONE-12 a). T2 keeps the narrowing to [W1] and only the opening goes. The direction-narrowing lock survives. The sibling test at :201 (street-only, E side) is unaffected, since it has two rows left.
- **Other tests that give the resolver a typeahead row or a single exact row.**
  - `parcel-lookup-resolution` :72 (3 rows, multi_parcel), :86, :153 (10 rows), :135-141 and the `Ma_n` test at :136 stay green.
  - `search-routing` :124 (3 rows) is unaffected. :167 and :218 are `41 Derwyn Road` against the printed `Derwyn Rd`. In memory both parse to type RD, so the new type guard does not fire.
  - `search-parser-guard` :99-192 uses exact rows with the typed and printed type both ST.
- **Row-type parsing.** `parseLinearName` gives the same canonical type for the typed long form and the printed short form (Street/St, Avenue/Ave, Boulevard/Blvd, Crescent/Cres, Road/Rd, Lane/Ln, Gardens/Gdns, Terrace/Terr). A lossy pair, such as Terrace giving TERR against printed `Ter` giving '', falls into the plan's "every row prints a type" gate. So guardByType makes no false conflict from word versus abbreviation.
- **One-row lists on the phone.** `mobile/src/lib/parcelSearchMatch.ts:204` turns any candidates into `text_candidates`, and I found no `candidates.length === 1` auto-open in `mobile/src`, `src/lib/parcels` or `src/app`. The plan's one-row list will not be re-opened client-side. The mobile test at `parcelSearchMatch.test.ts:90` fabricates its data and stays valid.
- **Admin tool.** Spec 89 :36 says typeahead gives "≤10 candidates", and a one-row list fits it. Plan §5 and §7.5 record the admin change. The Spec 89 note after :34 is on the Files line (Standard :465).
- **Operator words not dropped.**
  - RR-0166 ONE-12 a (MD:738 area) is kept: the trailing unit is dropped, the unit is not used to narrow, and the "add a unit number" text stays.
  - The plan keeps the city cut and the `UNIT_TAIL` strip.
  - RR-0392 holds: no new option and no new resolution value.
  - Nothing in `route.ts` or the meter changes. `parcel-tool-meter.logic.test.ts:260` pins the descriptor `metering`, and 3.C edits only the `why` text.
- **Pinned census phrases.** The `spec-notes-1b.logic.test.ts:52-59` phrases are kept byte for byte (plan 3.C).
- **Descriptor field whitelist.** `fix-tune.logic.test.ts:78` reads `inputs.field_whitelist`, and the plan does not touch it.
- **Ordering of reads on a miss.** The `search-parser-guard.logic.test.ts:215` and `search-routing.logic.test.ts:186` read order `[false,false,false,true]` holds. The new fallback runs after the matcher and only for a letter-suffix or dash number, and those tests use plain numbers.

## rg#1 MED: a full correct address that only the address-points read finds now lists, and no lock or note records it
Plan: §3.B.4 "`if (typeahead.length === 1) return conflictList(typeahead);`" and AC #1 "only the exact path returns unique".
Evidence: `parcel-lookup.ts:253-258` has the exact read on `parcels(addr_num_normalized, street_name_normalized)`. The typeahead at `:285-298` joins `address_points` through `parcel_address_points`, with number equality and a street-name prefix. A lot whose parcel row carries a different address than one of its address points (a corner lot or a second frontage) never hits the exact read. Today a typed full address for it opens through the typeahead, as `unique` with matchType 'typeahead'. After the plan it shows a one-row list. Spec 100 :103(1) says "one row is `unique`".
No planned test tells "full address, one typeahead row" from "partial, one typeahead row". T5 cases 12 and 13 are partials only, and case 28 is exact.
This is real under RR-0442 and RR-0443 c, because the number and street are typed in full and printed alike, which is an exact match by the person's words. It is also in the spirit of AC #3. Whether any such lots exist is UNVERIFIED, since I may not read the data.
Fix: have the reality-check seat count linked address points whose number and street key match no parcel row key. Then either add one T5 case ("7 Oak Ave" typed in full, exact empty, one typeahead row, ruled as a list) and say so in the Spec 100 and 89 notes, or ask the operator in one line. No code change is needed if the list is accepted.

## rg#2 MED: the superseded rule is never named where the rule text lives
Plan: §3.G "quoting the RR-0442 and RR-0443 c words verbatim, and naming what lists now". §6 owes doc-2 G.1 and A.3 notes.
Evidence: the rule being reversed is Spec 100 :103 clause (1), "one row is `unique`", with its operator source "we should know the difference and just present the right one" (2026-09-16), quoted at `parcel-lookup.ts:131-132`. The same text is on the Files-line code comments at :313 and :316-317. The plan's note text does not name this clause, and the plan does not say the 2026-09-16 rule is amended. A later reader of :103 reads "one row is unique" with no pointer, since the new note sits at :107 and :144.
Spec 89 :48 and Spec 100 :67 still list `matchType: 'exact' | 'typeahead' | 'direct'`, and the plan leaves the enum alone.
Fix: in 3.G and 3.H the dated notes should say "amends §3.2 note 2026-11-11 clause (1) and the 2026-09-16 rule: one row is `unique` only on the exact path". They should also say "`typeahead` stays in the enum (additive_only) and is no longer emitted". The plan should also say that the doc-2 G.1 and A.3 notes keep "unique goes straight to the report" true for exact only.

## rg#3 LOW: the 10-row skip changes RR-0166 behaviour without a note or a boundary test
Plan: §3.B.3 `guardByDirection(typeahead, typeahead.length >= 10 ? null : typed)`. §5 admits the loss. Plan-grounder #11 rejected a further test.
Evidence: Spec 100 :107 (RR-0166) says that with a direction typed and rows printing one, "only those rows are kept". Plan 3.G does not list "a typeahead window of exactly 10 loses direction narrowing" among what the note names. The only test is T1, which has a 10-row window with 9 E rows. Nothing pins 9 against 10.
Fix: add one clause to the Spec 100 note: "a 10-row typeahead window is not narrowed by direction". Add a 9-row case to T1 that still narrows, so the boundary is locked in both directions.

## rg#4 LOW: another branch touches the same census file, and two queued tasks share `parcel-lookup.ts`
Evidence:
- `git diff HEAD...mf83-daylight` changes `scripts/surfaces/_schema/census/contracts.json` at @@ -22131 and @@ -22147 (+11 lines). That is about 80 lines after the row the plan edits at :22050. Textual conflict is unlikely, but the generated descriptor and registry must be re-emitted on the final merged tree. mf83-daylight touches no other file in the plan.
- task-454 (SEARCHFIX.6, dependencies TASK-449 to 452) edits `src/lib/admin/parcel-lookup.ts` (the cap of 10). Its line cites will move once 449 lands. Its description already says "Runs after SEARCHFIX.1 to .4".
- task-450 cites the comma cut at `parcel-lookup.ts:225-226`. 3.B.1 keeps the cut, so it is not broken.
Fix: add one line to plan §5: "if mf83-daylight lands first, re-run `--emit-descriptors` and the plain run, then `--check`; tasks 450 and 454 re-read their parcel-lookup.ts cites".

## rg#5 NIT: the plan's "green both" list is incomplete
Plan: §4 "Green both (survive the fix)". It names `search-routing.logic.test.ts:186, :206, :211` but not :167 or :218.
Evidence: those two tests (`41 Derwyn Road`, and the exact-row case that passes through guardByType) are exact one-row cases where the new type guard runs. I checked them in memory: typed RD against printed RD, so they stay unique.
Fix: add `search-routing.logic.test.ts:167` and `:218` to the green-both list, so a lane red there is read as a real break.

UNVERIFIED, not run or not readable by this seat:
- The `src/tests/db/*lookup*.test.ts` smoke cases (:134 accepts both matchTypes) were read only by grep.
- The count in rg#1, which needs the data.
- No test red or green status was run.

STATUS: 5 findings (0 CRITICAL, 0 HIGH, 2 MED, 2 LOW, 1 NIT); both flipped tests keep real locks, but the one-row full-address case (rg#1) and the unnamed superseded Spec 100 :103 clause (rg#2) need a plan line before lock.
