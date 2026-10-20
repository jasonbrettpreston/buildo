# verify-12h: wf1/answers-batch-6 fix @ db911e8d

Lane: verify-12h (R-EZ independent verification). Read-only; I did not write this work.
Branch: `wf1/answers-batch-6` @ `db911e8d` (worktree `~/Buildo-wt-ans5`). Parent: `a444e245` (verify-12g BLOCK, B1).

## Verdict: PASS-WITH-NOTES

B1 is fixed by option (a). The four arms are disclosed as the operator answered, no pin lacks a recorded ruling, and `--check` now enforces that.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | 10.10.40.71(1) | No correction against the unit remains in `adjudications.json` (the `COR-10.10.40.71(1)#whole/disclosure` = "none" entry is gone). The keyed disclosure ("Transit facilities along Eglinton Avenue are exempt …", `authored/ch10_10/10.10.40.71.a.json`:60) stands. Disposition is `disclosed_by` `setback_encroachments`, with no `scope_pin`. Tracker: INCORPORATED. The cited M-169(2) lists `abuts_named_street`, the unit's condition token. |
| 2 | 10.10.40.10(10)(A)–(C) | `disclosed_by` `rooftop_elements_exempt`, cites M-169 + M-214, no `scope_pin`. Three keyed corrections cite M-169(4) and M-214(3). Checked against `pages/ch10_10.txt`: (A) 6.5 m within 450 m², (B) chimneys, pipes and vents a further 3.0 m, (C) tower = storeys above 24.0 m with average GFA ≤ 750 m². All faithful. (A) shortens "equipment, structures or parts listed in 10.5.40.10(3)" to "rooftop equipment"; that is acceptable. Tracker: 3 × INCORPORATED. The Spec 78 P5.12 source cell and the 69a batch-6 note were updated to match. |
| 3 | Q-PR-2 quote | `git grep "our focus is residential"` at the tip finds it in only three places: (a) Spec 131 LC-59 (4), its proper Q-PR-2 / PIN PR-2 context, pre-existing (2ddeb47e); (b) the 69a batch-5 note, which says the quote is "no longer cited for these pins"; (c) the test and red evidence that assert its absence. It no longer appears in any disposition, correction or pin. |
| 4 | Closed `scope_pins` | Exactly NONRES-1 [5.10.40.70(6)(B)], NONRES-2 [5.10.40.80(1)(B)] and SCOPE-100UNITS-1 [10.5.40.60(4)(B)]. Each has `ruling: "y pin them"`, `ruled_on: 2026-10-20` and `recorded_in` 69a. The 69a M-169 batch-5 note names all three PIN ids and quotes "y pin them". The only `scope_pin` fields in the tree are on those three units. Tracker: 3 × UNFIXED "pinned out of scope". |
| 5 | `scopePinProblems` mutation tests | Run in a throwaway worktree at db911e8d; baseline `--check` exits 0. Five mutations, all exit 1 with the expected message: M1 unlisted pin SCOPE-TOWER-1 on 10.10.40.10(10)(A) ("no recorded operator ruling (not in scope_pins)"); M2 NONRES-1 on unlisted unit 10.10.40.71(1) ("does not list this unit"); M3 scope_pin on an `excluded` disposition ("scope_pin on a excluded disposition"); M4 ruling changed to "y pin these" ("not recorded verbatim"); M5 a new listed pin NONRES-4 ("not named in 69a"). This covers all four claimed cases plus the not-named case. File restored byte-identical; worktree removed. |
| 6 | 150.7.1(2) | Correction `rule` = "Spec 69a M-158; …; M-75". The disposition cites M-158 alone. The 69a M-192 note and the Spec 78 `lawfully_existing_relief` source now say M-158 (the date is the clause's own). Closes verify-12g N3. |
| 7 | Tracker | `generate-answer-tracker --check` exit 0: 788 = INCORPORATED 747 / UNFIXED 41 / OPEN 0. Between a444e245 and db911e8d exactly 8 tracker rows and 8 dispositions changed: the 4 arms, 150.7.1(2) and the 3 pins (text only). |
| 8 | Red-first | Tip `bylaw-answers-batch-6.logic.test.ts` in a throwaway at a444e245: **11 failed / 19 passed (30)**. The 11 are the 4 B1 arms, 150.7.1(2), the Q-PR-2 absence check and 5 `scopePinProblems` cases. At the tip: 30/30. |
| 9 | Suite and checks | Full suite **17,871 passed / 0 failed** (4 skipped), exit 0 (`h/ans6fix-suite.log`). `validate.mjs --check` 0, `generate-maxbld-lineage --check` 0, `generate-bylaw-provisions --check` 0, `spec-split-check --check` 0 (36 moves). test:db not re-run (the commit claims 888/0; no DB-facing code changed). |
| 10 | Diff scope | 9 files: dispositions, tracker md/json, new red evidence, 69a (2 notes), Spec 78 (P5.12 source cell, P5.15(B)), the generator (+`scopePinProblems`), adjudications (1 re-cite, 1 withdrawal correction replaced by 3 tower corrections), test file. Nothing outside what the message describes. `~/Buildo-wt-ans5` is clean except the pre-existing untracked `mobile/node_modules`. |

## Findings

**BLOCKING:** none.

**NOTE**

- **N1. The authority check works by co-occurrence.** `scopePinProblems` requires the pin id and the quoted ruling to appear somewhere in `recorded_in`. It does not check that they appear together. "y pin them" is already in 69a, so a future pin passes once its id is mentioned anywhere in 69a and it is added to the list. Adding a pin still needs two reviewable edits, a list entry and a spec mention, so this is acceptable. A tighter check would require the id and the ruling in the same dated-note row.
- **N2. 10.10.40.71(1) code choice.** `setback_encroachments` is labelled "the nearest setback-permission code". The unit's own keyed sentence is what is shown. This is reasonable, but the operator could be shown the pairing as a confirmation.
- **N3. Carried from verify-12g:** N2 (10.10.40.1(2)(A) and 10.10.30.20(1)(C) go to the operator as confirmations, as the commit message says), N4 (M-218/M-219 OWED co-cites, pre-existing), N5 (14 null `reading_sha`, pre-existing).

## Reproduction

`h/mut6.mjs` (mutations, run with cwd = throwaway worktree), `h/ans6fix-suite.log`. Throwaway worktrees `h/wt-a444` and `h/wt-db91` were removed with `git worktree remove` after `git status` was clean.
