# verify-12g: wf1/answers-batch-6 @ a444e245

Lane: verify-12g (R-EZ independent verification, operator y 2026-10-20). Read-only. I did not write this work.
Branch: `wf1/answers-batch-6` @ `a444e245` (worktree `~/Buildo-wt-ans5`). Parent: `1309de7b` (batch 5, verify-12f PASS-WITH-NOTES).
Input: page dump `scratchpad/envdb12/envreviews` (788 records) compared with `envdb11` (729).

## Verdict: BLOCK

One blocking finding: **B1. Four arms are pinned out of scope with no operator authority, against the operator's explicit "disclose".**

Everything else checks out. The 62 answers are copied exactly. The other 58 dispositions follow the operator's answer or a ratified ruling. The suite, test:db, tsc, every bylaw generator `--check` and spec-split-check all reproduce. Red-first is real.

**Fix for B1 (either one clears it):**

- **(a) Revert the two pins.** Remove `COR-10.10.40.71(1)#whole/disclosure` ("none"). The keyed disclosure "Transit facilities along Eglinton Avenue are exempt …" then comes back, and the row is INCORPORATED as before. Give 10.10.40.10(10)(A)–(C) closed sentences under `rooftop_elements_exempt` (or `forms_deferred`, M-214(3): apartment forms are deferred). Drop `scope_pin` from all four dispositions. Remove the PIN NONRES-4 / SCOPE-TOWER-1 tests and the 69a dated-note sentence. The tracker then reads 747 / 41 / 0.
- **(b) Ask the operator.** Put the four arms to the operator by name and record the verbatim "y" in 69a and in the dispositions. Then fix the misattributed quotes (see B1, point 4).

## Checks

| # | Check | Result |
|---|---|---|
| 1 | 62 answers vs dump | **62/62 exact** (`g/cmp62.mjs`). envdb12 − envdb11 = 59 new, 0 removed, 3 changed (10.5.30.11(3), 10.5.40.10(3)(B), 10.5.40.71(2): null → disclose, note unchanged). `verdict`, `note`, `reading_sha`, `regulation_id`, `table_sha256` and `updated_at` equal the dump for all 62. The 3 changed rows carry `verdict_refreshed`. Snapshot 788 = dump 788, no extras, no duplicates. The only field difference is `prev_*`, which the snapshot never stores (same convention as batches 3–5). Across all 788, the 14 RD 10.20.40.10(3)–10.20.40.20(1) rows have `reading_sha: null`. That is pre-existing and documented in `reading_sha_note`, not from batch 6. |
| 1b | Disposition mix | matches 3; no_application → excluded 26; wrong → fixed_by 10 + resolved_by 2 (= 12); disclose → disclosed_by 18; null → disclose 3. Matches the claim. Tracker for the 62: 58 INCORPORATED, 4 UNFIXED (the 4 pins). |
| 2 | Faithfulness, all 62 | 58 are faithful. The 4 pinned arms are not (B1). Details below. |
| 2a | Cited M-rows | M-187 Q12 (x.40.80(2) "stays a disclosed multi-building rule"; covers R/RD), M-187 Q4 + M-176(1) (townhouse driveway trade-off), M-180(2)/M-182(2) (more permissive prevails), M-196(1) (10.5.20.40(6) prohibition, R copy 10.10.20.41), M-214(2)/(3) (forms not modelled / deferred), M-211(3) (pre-1953 FSI 0.69, quoted verbatim), M-192 (lists 10.10.40.11, x.40.81 R/RT/RM, 10.5.40.71(4)–(6)), M-205(2) (0.3 m shift), M-175 (platforms), M-216 (suite parking), M-158, M-177(3), M-169(4): all say what is claimed. Every literal in the new sentences matches the by-law page text (`ch10_10.txt`, `ch150_7.txt`, `ch150_8.txt`): 15.0 m / 5.0 m, 0.69 / 15 Oct 1953, 3 Feb 2022, 0.2 m, 4.0 m, 5 : 3. |
| 2b | Parallel-chapter reuse | Each reuse is the same provision family: x.40.80(2), x.30.1(2), x.40.1(7), x.20.100 suite pointer, x.40.11(1), x.40.81(2), x.30.20(1)(C) townhouse arm, 150.7 ↔ 150.8 twins. This follows the standing "rule by provision family across zones" direction. |
| 3 | 13 null + 35 unsure | **48/48 resolved_by, all INCORPORATED.** Every cited row is RATIFIED or RULED, with two exceptions that predate this batch (commit 920e9b6a): 10.20.40.1(1) also cites M-219 and 10.20.40.10(2)(B) also cites M-218. Both are OWED evaluator-defect rows, cited next to ratified rows. See N4. |
| 4 | scope_pin mechanism | `generate-answer-tracker.mjs` (disclosed_by branch): the pin id must match the PIN-id regex, be named `PIN <id>` in corrected_value, and the unit must carry no disclosure. The row is then UNFIXED with "pinned out of scope (PIN …)". Works as claimed, and SCOPE-100UNITS-1 matches the regex. The rename is consistent: "NONRES-3" survives only in "renamed from NONRES-3" provenance text. Gap: see N1. |
| 5 | Red-first | Tip `bylaw-answers-batch-6.logic.test.ts` copied into a throwaway worktree at 1309de7b: **28 failed / 0 passed**, all assertion failures (missing disclosures, scope_pin undefined, M-211 still cited, P5.12 text). At the tip: 28/28. Worktree removed. |
| 6 | Reproduce | Suite **17,869 passed / 0 failed** (4 skipped), exit 0 (`g/ans6-suite.log`). tsc exit 0. test:db **888 / 0** (17 skipped) under the dblock. `validate.mjs --check` 0. `generate-answer-tracker --check` 0 → {788: INCORPORATED 743, UNFIXED 45, OPEN 0}. `generate-maxbld-lineage --check` 0. `generate-bylaw-provisions --check` 0. `spec-split-check --check` clean. INV-25 asserts 788/788 (`bylaw-maxbld-trace.infra.test.ts`). |
| 7 | Adjudications | 1309de7b → a444e245: +10, −1. The −1/+1 pair is the N6 re-cite of 10.5.40.11(2). The 8 new keyed corrections are rooftop ×3, 10.10.20.41(6), 10.10.30.20(1)(C), 10.10.40.40(2)(A), 150.10.20.1(1)(C) and 150.7.1(2). The tenth is the **withdrawal correction `COR-10.10.40.71(1)#whole/disclosure` = "none", `adjudicator: "operator"`** (B1). No status, value or numeric field moved. |
| 8 | Batch-5 notes folded | N1 (rename), N2 (count 36 in the message), N3 (M-228/M-229 say "owed to step commit ①", tested), N6 (M-192 alone, tested), N8 (pin-aware tracker reason): all present. |

## Findings

**BLOCKING**

- **B1. PIN NONRES-4 (10.10.40.71(1)) and PIN SCOPE-TOWER-1 (10.10.40.10(10)(A)–(C)) override the operator's explicit answer, and no ruling authorizes them.**
  1. **What the operator authorized.** "y pin them" (QUEUE.md :1650): *"'y pin them' → three non-residential batch-5 arms PINNED (NONRES-1)"*. The three arms are 5.10.40.70(6)(B), 5.10.40.80(1)(B) and 10.5.40.60(4)(B). No other operator ruling on pins exists. I searched `~/Buildo/.cursor/QUEUE.md` (read-only), the queue snapshot `docs/reports/2026-10-20-operator-queue-snapshot.md` (on `wf2/v3-backfill-9`; it is not on this branch), Spec 69a and Spec 131. The coordinator's own QUEUE line :1661 says: *"Lane extended pins beyond operator's three … (operator answered 'disclose') — needs operator confirmation."*
  2. **What the operator answered on these arms.** The operator answered them later, on 2026-10-20 at 15:33–15:40Z, after "y pin them". 10.10.40.71(1): verdict **disclose**, note "Setback exemptions". 10.10.40.10(10)(A)/(B)/(C): verdict **disclose**, note empty.
  3. **What the branch does with them.**
     - 10.10.40.71(1): the keyed unit already carried a disclosure ("Transit facilities along Eglinton Avenue are exempt …", `authored/ch10_10/10.10.40.71.a.json`), so the operator's "disclose" was already met. The branch adds an active correction that sets `disclosure` to "none" and labels it `"adjudicator": "operator"`. It removes what the operator asked to keep.
     - 10.10.40.10(10)(A)–(C): no disclosure is added, although existing rulings give a ready path: M-169(4) `rooftop_elements_exempt` (used for (8)(A)–(C) in the same batch) or M-214(3) `forms_deferred` (used for 150.10.20.1(1)(C) in the same batch). 10.10.40.10(10) is a **residential** R-zone tower provision, not non-residential.
  4. **Misattributed quotes.** The corrected_values cite the operator's "our focus is residential this is beyond the scope at this point" (2026-10-19) as authority. That is the Q-PR-2 answer about Priority Retail frontage (QUEUE :1555). It is not a general scope ruling.
  5. **Locked in by tests.** `bylaw-answers-batch-6.logic.test.ts` asserts the withdrawal: `expect(unitOf('10.10.40.71(1)#whole').disclosure).toBe('none')`.
  6. **Where it is recorded.** The commit message, the 69a dated note under M-169 and the generator comment all present the extension as covered by "y pin them".
  7. **Fix.** See the Verdict section.

**NOTE**

- **N1. `scope_pin` has no authority check.** `--check` accepts any well-formed PIN id, which is how B1 got through. Consider a closed list of operator-authorized pins (pin id → unit list → verbatim quote) that `--check` reads. Also, `scope_pin` is only examined in the `disclosed_by` branch, so a `scope_pin` on any other disposition is silently ignored.
- **N2. Two "wrong" answers with empty notes change nothing.** 10.10.40.1(2)(A) (`resolved_by` M-158/M-177(3)) is one. The keyed unit stays a modelled LIMIT `buildings_on_lot = 1`, and the operator's "wrong" carries no reason. Reading it from RS 10.40.40.1(2)(A) ("doesn't apply to garden suites or laneway suites") and RD (unsure → M-158) is plausible: same family, and a suite is an ancillary building outside Article 10.10.40. But it is an inference. Worth one line to the operator. 10.10.30.20(1)(C) (empty note) is better grounded: its text is exactly the M-176(1)/Q4 townhouse arm plus the M-214 semi/townhouse forms, so it is recorded as a disclosure, consistent with the RT/RM answers. Note also that M-187 Q13 says the R townhouse frontage "is re-keyed with a `by_type(townhouse: (… − 1.0 m) …)` arm". The new R (C) correction says "disclosed, not bound" because the form is deferred. The two are consistent (deferred form), but the 69a note could say so.
- **N3. Weak citation: 150.7.1(2) → M-178.** M-178's cut-off is the 24 July 2025 suite transition. The 3 Feb 2022 garden-suite lawful date is not in M-178; it is recorded only in the new M-192 dated note. M-158 plus the 69a note carry it. M-178 is a family cite, not a governing one.
- **N4. The "13 null + 35 unsure all resolved by ratified rulings" claim is true, with two caveats.** Two of the rows (10.20.40.1(1), 10.20.40.10(2)(B)) also cite the OWED evaluator-defect rows M-219 / M-218 (pre-existing, 920e9b6a).
- **N5. Pre-existing:** 14 snapshot rows have `reading_sha: null` while envdb12 has the sha (documented in `reading_sha_note`). Fill them in at the next snapshot refresh.
- **N6. Process (mine).** I briefly wrote one temp file to `/tmp` (removed at once). No tracked file was touched in `~/Buildo-wt-ans5`; its `git status` is clean apart from the pre-existing untracked `mobile/node_modules`.

## Reproduction

- `node scratchpad/verify-12/g/cmp62.mjs <scratchpad> ~/Buildo-wt-ans5` → new 59, removed 0, changed 3; only `prev_*` differs; `g/new62.json`, `g/disp62.txt`.
- `g/adj6.mjs` (adjudication diff 1309de7b → a444e245; `g/adj6-added.json`, `g/adj6-removed.json`).
- Logs: `g/ans6-suite.log`, `g/ans6-tsc.log`, `g/ans6-testdb.log`.

## Update — verify-12h @ db911e8d (fix for B1): PASS-WITH-NOTES

B1 is fixed by option (a). 10.10.40.71(1) keeps its keyed disclosure: the withdrawal correction and the pin are gone, and the row is `disclosed_by` with no scope_pin, INCORPORATED. 10.10.40.10(10)(A)–(C) are disclosed under M-169(4) `rooftop_elements_exempt` + M-214(3), with closed sentences faithful to `ch10_10.txt`. The Q-PR-2 quote is no longer cited as scope authority. The closed `scope_pins` list holds exactly NONRES-1, NONRES-2 and SCOPE-100UNITS-1, each with "y pin them" (2026-10-20) recorded in 69a. `scopePinProblems` fails `--check` on all five mutations tried (unlisted pin, unlisted unit, non-disclosed_by disposition, non-verbatim ruling, pin not named). N3 is closed: 150.7.1(2) now cites M-158. Tracker 788 = 747 / 41 / 0. Red-first is 11 fail / 19 pass at a444e245; 30/30 at the tip. Suite 17,871 / 0; bylaw `--check`s and spec-split-check clean. Notes: the authority check works by co-occurrence (pin id and ruling anywhere in the spec), and the `setback_encroachments` pairing for 10.10.40.71(1) is worth showing the operator. Detail: `wf1-answers-batch-6-fix.md`.
