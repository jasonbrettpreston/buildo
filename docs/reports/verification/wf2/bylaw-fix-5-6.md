# VERIFY-27: fix round 4D lanes A (wf1/bylaw-fix-5 @ 3f85ed1c) and B (wf1/bylaw-fix-6 @ 7adf6a56)

Read-only. Base edd18529. I used a throwaway worktree of the base under ~/Buildo-scratch/verify-27/base. I removed it without --force. `git merge-tree --write-tree` wrote tree objects into the object store only.

## Verdicts

- **Lane A (bylaw-fix-5): PASS-WITH-NOTES.** One item needs fixing before integrate: the 13 "operator" stamps (finding A1). The engine, the authoring and the scorecard all check out.
- **Lane B (bylaw-fix-6): PASS-WITH-NOTES.** There are no blockers. One regression, A0385, is real and openly reported. The notes are below.

## Machine checks, both tips

| Check | A | B |
|---|---|---|
| generate-bylaw-provisions --check | rc 0, 9/9 gates (ACCURATE / UNDERSTANDABLE FAIL identical at base, pre-existing) | rc 0, 9/9 gates |
| decision-log --check | clean, 22 logs / 109 decisions | clean, 22 logs / 108 decisions |
| spec-split-check --check | clean | clean |
| generate-bylaw-layer2-input --check | clean | clean |
| vitest src/tests/bylaw-*, decision-log, golden (includes bylaw-fix-4d-a / bylaw-fix-6, golden-lots, eval-perf, cell-cache) | 81 files passed, 3444 passed / 936 todo | 81 files passed, 3471 passed / 936 todo |

I did not run the full suite or tsc.

## Scorecard (committed tool, notices-all2 / parcels-all2, plan-facts)

I re-ran base, A and B with the same tool and data.

| | MATCH | DIFFER | NO ANSWER | OWED | accurate | answered |
|---|---|---|---|---|---|---|
| base | 330 | 40 | 113 | 77 | 89.2% | 66.1% |
| A | 341 | 39 | 99 | 81 | 89.7% | 67.9% |
| B | 347 | 41 | 95 | 77 | 89.4% | 69.3% |

All of the lanes' reported numbers reproduce.

B with its patched scorer copy (~/Buildo-scratch/fix-round-4d/B/scorer/coa-scorecard-4db.mjs): 354 MATCH / 32 DIFFER = 91.7%. This is reproduced. The patched scorer is not committed anywhere.

**Lane A transitions (18 rows):**
- NO ANSWER to MATCH: 7
- DIFFER to MATCH: 4 (A0067#2, A0079#1, A0094#1, A0136#1)
- NO ANSWER to OWED: 4
- NO ANSWER to DIFFER: 3
- **MATCH lost: 0.**

The 3 new DIFFERs are rows that were blank before and are now answered wrongly:
- A0103/26SC#1: side setback, ours 1.2 vs City 0.6.
- A0103/26SC#3: platform side, ours 1.2 vs City 0.2.
- A0138/26SC#3: rear setback, ours 9.3375 vs City 9.48.

The keyed 256(A) text does say 1.2 m, so the City is probably applying something else.

**Lane B transitions (20 rows):**
- NO ANSWER to MATCH: 17
- DIFFER to MATCH: 1
- NO ANSWER to DIFFER: 1 (A0175/26EYK#2, platform area 4 vs City 10.07; B says the notice citation is wrong)
- **MATCH lost: 1.** A0385/26TEY#3 separation_m went from 11 to 2 against a City 11.

A0385 is the intended consequence of M-282. The ruling takes the openings tokens as absent, so the answer is the smallest figure, 2.0 m. Before, the 11 m matched only because the arm was never conditioned. B discloses it. It is a legitimate regression, not a defect.

## Findings

### Question 2 (most important): the 13 "operator" M-75 stamps on lane A

**Answer: NO, as stamped.**

What was stamped. Lane A's 13 corrections in scripts/seeds/bylaw/adjudications.json are all `adjudicator: "operator"`, `adjudicated_on: 2026-10-21`.
- 7 are gate fixes. The rule text reads "mechanical gate correction in the shard keyed for CHAT-38.F-4D-SC-199 / F-4D-10 / F-4D-16".
  - 5 are an empty `literals_not_expressed`, on 100 PBS(A), 1428 PBS(B), 199 PBS(A) and 1434 SSP(A)/(C).
  - 2 are `not_an_override`, on 1437 (F) and 100 (D).
- 6 are on 528 (A) and (B): condition, lot_conditions and evidence. They drop the `lawfully_existing` token. The rule text reads "mechanical family correction ... CHAT-38.F-4D-16". This is a reading call, not a gate repair.

What the operator actually ruled. CHAT-38.F-4D-10, F-4D-16 and F-4D-SC-199 are "approve" on findings of the form "exception X is not authored". They have no operator_note. They approve authoring the exceptions. They do not rule on any individual correction. The operator never saw these 13 records. The corrections were generated after the keyers disagreed with the gates.

Precedent cuts both ways.
- For: the pre-edd18529 file already holds 3,061 `correction | operator` records. Many are lane-generated gate fixes, for example "Spec 68 §9 G-CLAUSE; Spec 69a M-89" (72 records) and "G-CLAUSE ... rule 6" (86). The agree.mjs gate only forbids a keyer as adjudicator, and "operator" passes it.
- Against, and stronger: commit bf448a2c ("F-SC-6-family M-75 records re-recorded with the operator's authority") says the nine F-SC-6-family corrections of 0c49cdb7 "were stamped adjudicator 'operator' before a ruling existed". Each was superseded by an identical-value `~s1` record whose rule cites the chat ruling. So the programme has already treated a lane stamping "operator" before a ruling as a defect to be repaired.
- A different adjudicator label exists for lane mechanical work: `orchestrator-p1-mechanical` (70 records).
- Compare lane B's 90 corrections. Each implements a finding that was individually approved and spelled out by the page's `fix` text (design tokens, element targets), and each cites that finding. That is the F-SC-5 / CHAT-33 pattern and it is defensible.

Action. Either re-record the 13 under a lane label (like `orchestrator-p1-mechanical`), or have the operator ratify them in the next chat batch and follow the bf448a2c superseding form. The 6 on 528 deserve explicit ratification, because they change meaning and are not just a gate fix. My check supports the claim: of 145 "existed on the day of enactment" units, 144 carry no `lawfully_existing`. The one outlier is 258(D), which is a pending unit.

### Lane A

**A1.** The stamps issue above. This is what holds A at PASS-WITH-NOTES. It is not a code defect.

**A2. Ruling fidelity (items 1 and 4, M-265..M-268).**
- M-265 (F-4D-2 / F-4D-18 / F-4D-SC-1462) is faithful. The change is one generated field in assembly.mjs:19-27, `includeLink`. It is set only when `includeOf` resolves to a Ch.900 exception row. Rule 4a then needs no new code.
- F-4D-18 / 1397: the 0.69 arm is held as an existing-building fact. This is defensible. The unit applies only to a house erected before October 15, 1953. A0578/26TEY stays DIFFER (0.6 vs 0.69) in the A, B and base runs. M-265(4) says the arm is "OWED to the inputs lane", but lane B's items do not include F-4D-18, so 1397 now belongs to nobody. Someone needs to pick it up.
- M-266 (F-4D-6) is faithful. It adds one vocab phrase, `keeps_limit_phrases: ["permitted by that regulation"]`, and lets `optionalVariation` admit a DEFINE (evaluate.mjs:838-ish). A0166/26EYK#3 gives 19 m = City.
- M-267 (F-4D-SC-155 / 340) is faithful. It adds two `unit_application` entries.
- M-268: the items named by the operator were authored. 317 is held (amended_pending 650-2026).

**A3. Blast radius of M-265 (item 4).**
- Base: 136 INCLUDE units, 0 with `include_ref`.
- A: 141 INCLUDE units, of which **64 now carry `include_ref`**:
  - 22 are Ch.900.2 R-zone links (to 900.2.10(4), (5) and (7)),
  - 38 link to 1462,
  - 4 link to 336.
- So the register's "all 136 INCLUDE units" overstates it. The R-zone links to 900.2.10(4)/(5)/(7) are not mentioned in M-265's text. They are the same rule, but are a wider footprint than the text describes.
- Golden lots: I ran eval-lots on the 178 golden lots (16 targets x all building types x roof variants, 16,480 cells) at base and at A. **26 cells changed on 5 lots, all `fsi`:**
  - "unlimited" or not_applicable becomes 0.6 / 0.5 / 0.6 / 0.6 / 0.6, winners 1462(A)(i) and (ii) and 336(A)(i).
  - The lots are RD x841 (area 311), RD x806 (area 436), RS x256 (two lots) and RS x25 (area 31.25, tiny, a data oddity).
  - No other target moved, and none became blocked.
- The golden-lot test (cases.json fresh) and the eval-perf pin pass unchanged in A. The pin did not move.
- B moved no cell on the golden lots for those 16 targets (same hash as base).
- Verdict: the "no MATCH lost" claim is true for the CoA set and for the golden set. The only golden movements are the intended unlimited-to-finite changes.

**A4. Keying method (item 3).**
- Keyer A was Claude and keyer B was DeepSeek, per provenance (`keyer-a:claude` / `keyer-b:deepseek`, `read_paths: []`, worktree a5485f41).
- ~/Buildo-wt-keyer-b-4a has only 8 `.b.json` files and no `.a` files. All 8 are byte-identical to the lane A tree.
- Gates are 9/9. The count of complete exceptions rose 1316 to 1327 (+11, matching the 4 named plus 7 co-sharded).
- W2X is an overlay batch (`OVERLAY_BATCHES`, `W2X_MEMBERS` = 1434, 117, 258, 528). It uses the same harness, so it is not a gate bypass.
- M-15 (≥100 lots) defines the required scope. It says other excepted lots are disclosed as "not yet captured". It does not forbid authoring more. The four members are exactly the exceptions the operator named in CHAT-38.F-4D-10 and F-4D-16.
- Six agreed units spot-checked against the clause text, all faithful:
  - 245(A) existing frontage,
  - 245(C) 40% lot coverage,
  - 245(D) 1.2 m side yard,
  - 256(A) 1.2 m,
  - 256(B) 3.6 m street side,
  - 256(C) INCLUDE 1462.
- The M-15 / W2X statement belongs in a Spec 69a note (the register M-268 conflict check has it).
- The decision log matches the chat file exactly (0 mismatches).

**A5. Pending units.** 1437 (10 units), 1436 (10), 1434, 117, 258, 287, 199 and 291 (1 each) wait for adjudication. Draft answer files exist and are not applied. That is correct. The pending-unit rule keeps those exceptions unauthored, so no lot gets a partial answer.

### Lane B

**B1. Ruling fidelity (item 1).**
- F-4D-11 (amend) is followed. The distance and proposed height are in `vocab.suite_scenario` with `user_input: false`. Neither value is in the `user_input` list. No field asks the user for a distance. The distance basis is the max-build envelope (isolated suite: nothing to measure to). One closed disclosure sentence for a laneway suite with an existing house sits on exactly the four laneway separation and height units (150.8.60.30(1)(A)/(B), 150.8.60.40(1)(A)/(B)). The garden suite units are left alone, as the operator named the laneway suite. The numeric rows stay owed. Lane B explicitly refuses to invent them. This is correct.
  - Note: the disclosure sentence is conditional wording ("If the laneway suite sits with an existing house ...") that is always attached. It is acceptable, because no input says the house exists.
- F-4D-12 reading B: no code change. The 5% stays. The only addition is `vocab.explained_differences['10.5.60.70(1)(B)']`. Nothing in the committed tree reads it (only the uncommitted scorer copy does), and `checkVocab` does not validate it. It is minor extra, with no effect on results. The committed scorecard shows A0180#2 DIFFER with no explained_by.
- F-4D-21 (out of scope): faithfully obeyed. M-291 adds nothing. The 11 notices stay owed.
- F-4D-1, 3, 4, 5: faithful. These are element targets, design tokens taken as absent (the M-259 / M-197 pattern), `holds()` and the one-storey token.
- F-4D-7: the join source was left to the lane. B chose `parcels.primary_frontage_street_name`.
- F-4D-15, 17, 19: F-4D-15 is partly done and the rest is held with reasons. F-4D-17 and F-4D-19 are recorded with no engine change.

**B2. Engine edits (item 5).**
- evaluate.mjs has three insertions: two context fields in `makeContext`, a `deviceUse` guard in `applies()`, and the `namedStreetJoin` helper. cell-cache.mjs adds one name to the WHOLE set. All are minimal.
- I tested `applies()` on 900.3.10(323)(C) directly:
  - name undefined, null or "" gives `{ok:null, reason:"condition_unknown:abuts_named_street"}`, so it is undecided and never true or false.
  - "Huntingwood Dr.", "HUNTINGWOOD DR" and "Huntingwood Drive" give true.
  - "Ravencliff Cres" gives false.
  - An explicit flag with no name still decides as before.
- For `line: any` units, a mismatch stays undecided. Only `front` units go false.

**B3. Scope leak (note).** `platform_above_access_floor_m` on a plain `ancillary_building` resolves to 150.7.60.60(3)(A), a garden-suite chapter rule, and a `laneway_suite` also picks up the 150.7 rule. The value is 0.2 either way, so there is no wrong number today. The 150.7 units carry no building-type scope for the new element target. B only scoped 150.8.60.60(3)(A)/(B) (for the laneway suite). Worth a follow-up ruling or a `unit_application` entry.

**B4. eval-perf re-pin.** It moves from 3815ff0a to 751d494c for two new dsl_targets (280 cells, `no_candidate`). This is the same pattern as the M-255 re-pin. I did not recompute the "left-out hash equals the old pin" claim myself, but the test passes.

**B5. Decision log (note).** B's raw record adds a per-decision `operator_quote` field to F-4D-11 and F-4D-21 (same text as `operator_note`). That is not byte-identical to the chat file, though the decision-log check passes. Lane A's raw record is identical to the chat file.

**B6. Stamps.** All 90 of B's corrections are `operator`. They are acceptable (see Q2 reasoning), because each implements a finding that was individually approved, with the register row quoted in the rule text.

**B7. Open items.** The "91.7%" is only reachable with a scorer copy that is not committed. The committed tool's honest figure is 89.4%. Lane D (or integrate) should land the scorer changes (4D-S4b, named-street pass-through, explained_differences).

## Overlap (item 6), A vs B vs lane C (10ead5bf)

Predicted conflicts from `git merge-tree`:
- **A+B** conflict in 10 files:
  - generated files: bylaw-code-findings.md, bylaw-layer2-input.json, bylaw-provisions.json and .md, maxbld-report-field-inventory.json and .md (regenerate);
  - hand-merge files: 69a register (both append rows), adjudications.json (both append at the end, union), vocab.json (both edit `unit_application`, union), decision-log.logic.test.ts (the pin);
  - decision-log pin arithmetic: base 97, A +12, B +11, C +4 gives 124 when all three are merged.
- **A+C** and **B+C** conflict only in layer2-input.json, the maxbld inventory json and md, the 69a register and the decision-log test pin. Source files (evaluate.mjs, vocab.mjs, cell-cache.mjs, eval-perf test) merge clean in every pairing.
- **Semantic include_ref.** There is no double derivation. Lane C reads `include_ref` in `exceptionClosure` (evaluate.mjs near 992). Nothing in C generates it, and only A sets it on real-lot units. Without A's assembly change, C's closure walk through INCLUDE links is dead on real lots, so C wants A. After merge, C's closure will show 1462 and 336 for the 64 linked units' lots.
- **eval-perf pin.** C wraps the hash with `noLosers` and leaves the digest unchanged. B changes the digest. Because the wrapper is neutral, the merged pin should be B's, but re-verify after merge.
- **cases.json.** B changed cases.json. After merge, re-run `golden-lots-cases.mjs --check`.
- Regenerate in this order after resolving: provisions, layer2-input, report-fields, golden cases, then run `decision-log --check`.

## Numbered summary

1. A: 0 MATCH lost on the CoA set and the golden set. Reported numbers confirmed (89.7% / 67.9%).
2. A: the 13 "operator" stamps are NOT backed by a specific operator ruling. Re-record under a lane label or ratify (A1).
3. A: M-265 changes 64 INCLUDE units (not "all 136", and including 22 R-zone links); 5 golden lots / 26 fsi cells move; all intended.
4. A: 1397 (0.69) is orphaned between A and B.
5. A: authoring is blind, honestly keyed, and gate-green. W2X is a legitimate overlay.
6. B: reported 89.4% confirmed (91.7% with the uncommitted scorer copy). A0385 is the one regression, and it is the intended result of M-282.
7. B: F-4D-11, 12 and 21 are followed to the letter. The named-street join returns undecided with no name.
8. B: the platform_above_access_floor_m scope leak onto ancillary/laneway from the 150.7 unit is a small follow-up. The `explained_differences` table and `operator_quote` field are minor extras.
9. Merge will need a hand-merge of 4 files and a regenerate of 6; the source files are clean.
