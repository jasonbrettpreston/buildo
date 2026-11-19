# REPORT BL-PARSER (task-69, 1.4 Search parser, Increment 1·B, A.4 and A.5)

## Grounding
- Ruling RR-0166 "ONE-12 a" (MORNING-DECISIONS.md:738; backlog/decisions/decision-36). Option a text: ~/Buildo-scratch/lanes-20261117/gap-register/g1/q.md:22 ("a direction guard after the match (typed direction differs from the matched lot: answer the address list instead of one lot) and a unit-token strip before parsing; the join key and its tests untouched"). The two labels: g1/q.md:27 (1) one-lot conflicting hit changes unique -> text_candidates, dated note on the 2026-09-16 match-type rule; (2) the unit text is ruled (open-questions.md:936), the strip makes the resolver ignore the unit, the ruled string stays, the unit is not used to narrow.
- Where the direction lives: no direction column. Rows carry `address` (parcels: address_number || linear_name_full, parcel-lookup.ts displayAddress; typeahead: address_full), both aliased `AS address`. Guard compares the trailing direction token of that text. No new query, no column, no migration.
- parseFreeTextAddress is not in address.ts; it is in src/lib/admin/parcel-lookup.ts, which is where the change lives.

## Commits (branch wf1/inc1b-parser, no push)
- e8a3de62b fix(89_parcel_cost_model_tool): search parser keeps a typed street direction after the match and strips a trailing unit token; join key unchanged (1.4, Increment 1·B)
- d8a99e254 fix: direction guard skips a truncated exact window (output review r2 KEPT defect)
- red.out: first commit attempt refused at typecheck: `src/tests/search-parser-guard.logic.test.ts(34,48): error TS2305: Module '"@/lib/admin/parcel-lookup"' has no exported member 'typedDirection'.` (red through the hook's typecheck step; the test runner was not called).
- commit.out (green): `✓ src/tests/search-parser-guard.logic.test.ts (42 tests)`, `✓ src/tests/parcel-cost-tool.logic.test.ts (15 tests)` (the parity test), `✓ src/tests/search-routing.logic.test.ts (13 tests)`, `Tests 218 passed | 14 skipped`, `GATE OK`. commit2.out: 43 tests, 219 passed. `npm run typecheck` clean.
- Docs commit with this report and the review records follows (rule 19).

## Join key and parity unchanged
`git diff --stat HEAD~2 HEAD -- src/lib/parcels/address.ts scripts/lib/address-normalizers.js src/tests/parcel-cost-tool.logic.test.ts` is empty. The exact read is still bound on ['100','QUEEN'] (test 'the exact read is still keyed on the stripped street').

## Behaviour
- A.5: trailing `Unit n`, `Unit #n`, `Unit#n`, `Apt n`, `Apt. n`, `Apartment n`, `Suite n`, `Ste n`, `#n`, `# n` stripped once, only while a house number and a street remain. Untouched: '4A Queen St', '12 Unit St', '5 Unit 4', '100', 'Queen St Unit 4'.
- A.4: guard after the exact and typeahead reads only when a direction was typed and every row prints one: typed-side rows kept; a ONE-row hit on another side is text_candidates (label 1); otherwise unchanged; skipped on a truncated (11-row) exact window. Unlinked and fuzzy paths untouched (test: call order exact, typeahead, unlinked, matcher). Admin call: same resolver, same three fields read.
- Spec notes: Spec 89 line 33 dated note 2026-11-19 (quotes "ONE-12 a", both labels) and Spec 100 dated note after the 2026-11-19 SRCH.FUZZY note (match-type change).

## Case table (test file src/tests/search-parser-guard.logic.test.ts; all pass in commit2.out, 43 tests)
Unit strip (it.each, one name per form): 11 forms parse to {num '100', street 'QUEEN'}; '4A Queen St' -> 4A; '12 Unit St' -> UNIT; '5 Unit 4' -> UNIT 4; '100' -> street '100'; 'Queen St Unit 4' -> 'QUEEN UNIT 4'.
Typed direction: W, East->E, North->N, south->S, ', Toronto' suffix, with unit, none, '100 W' -> null, no-direction street -> null.
Guard: E/W pair typed W -> W lot unique exact; typed East -> E lot; no direction -> both rows as today; 'Queen Street East' row = E; one wrong-side lot -> text_candidates with lot listed; one same-side lot -> unique; row without direction -> unchanged; mixed set -> unchanged; two same-side lots -> multi_parcel map kept; two other-side lots -> unchanged map; truncated window -> no false unique; never-empty invariant; typeahead narrowing (unique, matchType typeahead); street-only typeahead keeps one side; unit + direction end to end; miss with direction still reaches the matcher in today's order; admin call.

## Review rounds
- r1 plan (r1-plan.txt, verdict FAIL as written) triaged in TRIAGE.md: KEPT null-direction rule, one-row conflict only, one compass mapper, literal expectations, red first, anchored regex, one name per form; REJECTED the rest with lines. Folded before code (context file "Fold after review round r1").
- r2 output, one lens (r2-output.txt), TRIAGE-r2.md: one HIGH KEPT and fixed (d8a99e254); rest REJECTED with reasons.

## Decision for the orchestrator (one)
The brief's design limit says "typed direction matches none -> today's result unchanged"; the ruling's option a and label 1 say a one-lot conflicting hit becomes the list. I followed the ruling for the one-row proven conflict only and left everything else unchanged. If the operator wants the literal brief form, drop conflictList (3 lines) and the label 1 sentence in the two spec notes.

## UNVERIFIED
- Behaviour on a live database (no DB connection allowed): that linear_name_full and address_full end in the direction token for real Queen St E/W rows; if not, the guard is a no-op there, not a wrong answer.
- Street-only typeahead (LIMIT 10) may hold no typed-side row; no new query was added by design.
- Mobile jest suite and client rendering of text_candidates for the one-lot case (not run by the hook).
- Wider unit forms (Unit No., PH, Bsmt, Rear) are not stripped by design (closed list).
- The generated context file carries ENOENT blocks and superseded Storage lines (generator issue, noted in TRIAGE #11, #13).
