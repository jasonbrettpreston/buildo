# Verification index — wf2/p4-integrate-16

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20: "Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."). Both branches merged by `wf2/p4-integrate-16` were verified by lanes that did not write them (verify-17,
verify-18), read-only. The integrate-15 tip itself was verified by verify-16. All three reports are copied verbatim
(`cmp`-identical) from the orchestrator's scratchpad into this directory.

- **Integrate base:** `885c2ad2` (= `wf2/p4-integrate-15` tip, pushed)

## Merged branches (in merge order)

| # | Branch @ tip | Base | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf2/steps-rulings-1` @ `0e0c9f4b` (R-HN…R-IF, CoA cutover patch set, V3 projection, R-EY-9-WHY-TEXT draft) | `885c2ad2` | **PASS-WITH-NOTES** | [`steps-rulings-1.md`](steps-rulings-1.md) |
| 2 | `wf1/bylaw-fix-3` @ `04ba1b5c` (R-DV-1, R-7a-v2, N-3, D-1, M-205(1)-floor, N-2, D-3; golden puller) | `885c2ad2` | **PASS-WITH-NOTES** (F-1 blocking for integration only) | [`bylaw-fix-3.md`](bylaw-fix-3.md) |

Verification of the base tip: `wf2/p4-integrate-15` @ `885c2ad2`, verify-16, **PASS-WITH-NOTES**,
[`p4-integrate-15-verify.md`](p4-integrate-15-verify.md).

## Commit order note

All three reports were scanned with `spec-split-check.mjs`'s own extractors (`collectCitations`,
`checkCitationsResolve` for arm (iii), `checkHandbookCitations` for arm (iii-b)) at `885c2ad2` before committing:
1 citation in total (`verify-17.md:12 Spec 123 §3.1`), 0 dangling, 0 handbook problems, so all three land in this first
commit. A positive control (a file citing one real and one unknown Spec 124 ruling) was flagged as expected. No report
text was changed.

## Integration actions taken on the verify findings

- **Merges.** `wf2/steps-rulings-1` @ `0e0c9f4b` (merge `3a3e61f1`, clean) and `wf1/bylaw-fix-3` @ `04ba1b5c` (merge
  `24cb801a`), each `--no-ff` with the hooks.
- **The conflict (`src/tests/decision-log.logic.test.ts`), resolved per verify-18's merge preview.** Both sibling
  `it(...)` blocks are kept: the steps-rulings-1 logs test and the batch B (R-DV-1) test. The GREEN total was
  re-derived with `decision-log --check` on the merged tree, not taken from the preview: *"10 log(s), 54 decision(s),
  58 register row(s), 88 citation(s), 0 owed by another lane, 2 no_ruling"*.
- **verify-18 F-1 (BLOCKING for integration), fixed inside the merge commit `24cb801a`.** `.husky/pre-commit:37` runs
  `decision-log.mjs --check`, which reads RED on the merged tree until F-1 is fixed (*"CHAT-15: quote_ref
  "operator_quote_2" names no quote in the record"*), so a separate fix commit could not follow a merge that could
  not commit. The steps lane's raw record
  `docs/reports/decisions/raw/2026-10-20-chat-batch-c-steps/2026-10-20-batch-c-steps.json` is rebuilt mechanically
  from the operator's source (`chat-decisions/2026-10-20-batch-c.json`), mirroring its structure: `operator_quote` is
  quote 1 and `operator_quote_2` keeps its own key, both verbatim; CHAT-15…20 and CHAT-22 are the source objects
  unchanged. The lane's `split_from` / `source_operator_quote_1` give way to a `split` key in the bylaw lane's form.
  The log is re-imported with `decision-log.mjs --import --chat`, never hand-edited; each decision now carries the
  `operator_quote_2` text through `quote_ref`. Authority: R-HK (124_step_standard_policy.md:266, *"Each set of
  rulings is committed verbatim as `docs/reports/decisions/<date>-<slug>.json`"*) and verify-18 F-1 (*"the steps record
  to keep the source key `operator_quote_2` verbatim, which is also more byte-faithful"*). This also closes verify-17
  N2.
- **verify-17 PIN ID-COUNTER-124-288.** Spec 124:288 is replaced in place (the prior text struck through, as the
  line's own history does): allocated through `R-IH`, next free id `R-II`. Spec 124 stays at 378 lines.
- **The operator's four pre-night answers (chat batch D, *"yes to all ensure they comply to the governing specs and
  are recorded as a ruling if necessary"*), commit `b0702b58`, through `decision-log.mjs` only.** The raw record is
  committed as two split records under `docs/reports/decisions/raw/` (every kept field verbatim, one added `split`
  key, the batch-C form). The split is by meaning, because `decision_vocab` maps a raw decision value and all four
  values are "approve":
  - `2026-10-20-chat-batch-d-rulings`: **CHAT-23** → new row **R-IG** (Draft B `extra_counters` as restated in the
    patch set; amends R-EG (1) additively; applied on the bundled night). **CHAT-24** → dated notes appended inside
    R-IB's and R-IC's rule cells in the CHAT-14 form, plus two bundled-night citations `i16-1` / `i16-2`
    (enrich_permits `deviations[1]`, `[2]`) in `docs/reports/2026-10-20-v3-condition9-backfill-citations.json`:
    **141 → 143**. The enrich_permits descriptor is not edited. **CHAT-25** → new row **R-IH** amending R-EY (9), the
    three stages as drafted; **stage 1 only is built** (below).
  - `2026-10-20-chat-batch-d-nd1`: **CHAT-26** → `no_ruling` resting on R-EY. Nothing implemented.
  - Rows R-IG and R-IH are appended to 124a §B26 after R-IF (Spec 124 adds nothing); conflict checks and
    seven-question tables are the new 124a §B32 at the end of the file, so no earlier 124a line moves.
  - Rule-map: R-IG (`link.2`), R-IH (`x-v3.1`), R-EY `amended-by` R-IH; Spec 132 regenerated with
    `generate-step-handbook --write`.
- **R-IH stage 1 (red first).** `scripts/analysis/gates/v3-label.mjs` gains `whyOnlyDeviations`,
  `whyOnlyAdvisoryLine` and `whyOnlySignal`; `step-validate` prints one advisory line per step and a run total.
  The new lock `src/tests/v3-why-only-advisory.logic.test.ts` was run before the code: 4 failed / 1 passed (the
  verdict-unchanged guard is green by design); after, 5/5. `step-validate --all --fast` output before and after is
  identical apart from the advisory lines: R-EY still 4/43, E1 PASS, no label moved. The advisory lists **17
  deviations in 11 steps**: link_massing 1, link_parcels 2, assert_engine_health 1, link_neighbourhoods 1,
  compute_parcel_cost_estimates 2, load_wsib 2, assert_coa_freshness 2, enrich_permits 2, enrich_coa_zoning 2,
  classify_coa_trades 1, compute_coa_cost_estimates 1. That is the projection's 15 in 10, plus enrich_coa_zoning's
  2, whose R-IB/R-IC citations land on the night.

## Final-tip checks

| Command | Result |
|---|---|
| `npx vitest run --exclude '**/*.db.test.ts'` | rc 0: 817 files passed, 1 skipped; 19,456 tests passed, 4 skipped, 936 todo |
| `npx tsc --noEmit` | rc 0 |
| `node scripts/analysis/step-validate.mjs --all --fast` | rc 0. R-EY: 4/43 read V3; E1 ratchet PASS (4 listed); E2 cutover PASS; E3 OFF. Stage-1 advisory: 17 deviation(s) in 11 step(s). The five "descriptor validation FAILED" lines are unchanged from before this lane's code (5 before, 5 after; R-DU non-blocking) |
| `node scripts/analysis/spec-split-check.mjs --check` | clean: 41 moves, 7678 citations, 0 dangling, budgets held |
| `node scripts/generate-step-handbook.mjs --check` | up to date |
| `node scripts/analysis/decision-log.mjs --check` | clean: 12 logs, 58 decisions, 60 register rows, 93 citations, 0 owed, 3 no_ruling |
| `node scripts/analysis/report-schema.mjs --check` | current; RS-5 WARN (54), all other RS gates PASS |
| `node scripts/analysis/report-fields.mjs --check` | current, 34 fields; the RF gates are report-only |
| `node scripts/analysis/bylaw/generate-answer-tracker.mjs --check` | clean: 788 answers (785 INCORPORATED, 3 UNFIXED) |
| `node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --check` | clean: 107 fields, 0 dangling, no drift |
| `node scripts/generate-bylaw-provisions.mjs --check` | rc 0 |
| `node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --check` and `bylaw-golden-lots.logic` | rc 0: 182 PROVEN / 935 OWED / 16 NOT_EXERCISABLE / 4 FAILS; the test passes in the suite |

## Open items (operator attention, verbatim from verify-18 "Operator attention")

**M-205(1)-floor / M-245: the no-floor rule makes the estimate too generous far more often.** I recomputed these from the committed `docs/reports/2026-10-20-front-setback-no-floor-remeasure.json` rows, using the oracle's own formulas (`front-setback-oracle.cjs` lines 117–128), read-only. All numbers are confirmed exactly:

| n = 220 | Mean error | Within 1 m | Too generous (ruled < examiner) |
|---|---|---|---|
| Before: max(est + 1.0, 6.0) | 1.39 m | 54.5 % | 22.3 % |
| After: est + 1.0 | 1.15 m | 67.3 % | **48.2 %** |

- 89 notices change. Of those, 71 now fall below the examiner's figure, 35 of them by more than 1 m (median shortfall 0.98 m, worst 11.07 m).
- Removing the floor makes the average closer but roughly doubles the share of answers that understate the required front yard. Those answers overstate the buildable depth.
- **Adoption was not made conditional on the result.** The draft and CHAT-21 say "re-measure on the 219 notices before adoption" without setting an acceptance threshold. The lane re-measured and adopted in the same commit (`81c23a9d`), whatever the result. It recorded the 48.2 % in M-245's status cell and the commit, but did not stop for an operator decision.
- The operator should confirm M-245 stands given the 48.2 %, or say otherwise. The two golden FAILS (COA-F-01: 453 Durie 2.90 m against the City's 3.91 m; 24 Gardens Cres 5.07 m against 4.86 m) show the estimator error either way.

**N-2 / M-241: Norwood's "side 1.0 m" is answered as a lane setback.**
- The City (A0625/26TEY, variance 2) states "The minimum required side yard setback for an ancillary building or structure is 1 m" under 10.10.60.20(1)(A).
- The lane keys (1)(A) as:
  - rear = `if(holds(abuts_lane); 1.0 m; unregulated)`
  - side-street = `if(holds(corner_lot); …)`
  - lane = `if(holds(abuts_lane); …)`
- The golden case checks Norwood through `lane_setback_m` = 1.0, with the rationale "which line abuts the lane is the ML-1 lot-line classification (owed), so the lane arm answers it".
- This is consistent with draft arm (2), "side lot line abutting a street or lane" → `lane_setback_m`, read as covering a side line on a lane. But it is a reading: the draft's own words for (3) were "a golden-lot case for 20 Norwood (side 1.0 m)".
- Side effect: because the rear arm also fires on the lot-level `abuts_lane` flag, Norwood's garage also answers rear 1.0 m (the `bylaw-fix-3` test asserts "1.0 m from the lane line and the rear line"). The City cited only a side yard there.
- On 474 Beresford (A0510/26TEY) the City did cite a 1.0 m rear yard, and the rear arm matches.
- Until ML-1 can tell which lot line abuts the lane, any lane lot gets both rear and lane 1.0 m for a garage. The draft accepted the `abuts_lane` proxy for the rear arm explicitly. The operator should confirm that the side-as-lane reading, and the rear 1.0 m on a side-lane lot, are acceptable.

## Carried forward

- **verify-17 N1–N4** (`steps-rulings-1.md`): N1 the patch-set's "4 files, 53 tests" count does not reproduce (3 / 38
  in the directory, 5 / 90 by name; all green). N2 the batch-C leftover quote name: closed by the F-1 fix above. N3
  "four cited now" is four files holding five entries. N4 the leftover `scratchpad/stepsrul/patch-wt` worktree needs
  its owner's decision; it must be undone (`git apply -R`, delete the untracked test and the symlink) before a plain
  `git worktree remove`, never `--force`. Not touched by this lane.
- **verify-18 N1–N10** (`bylaw-fix-3.md`): N-1 M-245's rule cell says n = 219, the re-measure ran on 220. N-2 M-243
  quotes the page's recommendation label as the operator's words (the answer was `approve` with an empty note). N-3
  166 `adjudications.json` records dated 2026-10-21. N-4 the M-235…M-239 placeholder replaced in place (sanctioned).
  N-5 R-DV-1 red has 8 failures, not 6 (two real-tree tests). N-6 two R-7a-v2 red case names renamed in the fix. N-7
  the golden puller writes `lots.json` in `--add` mode by design. N-8 "30 checks" is 29. N-9 case A0625 checks
  `10.10.60.70(1)#(1)(A)` while the City cited (1)(B). N-10 V22's expectation withdrawn as a consequence of R-7a-v2.
  None was acted on here.
- **verify-16 N1–N5** (`p4-integrate-15-verify.md`): N1 is answered by the operator's CHAT-14 (M-246); N2 Spec 68 has
  40 B of headroom; N3 "R-DV-1" / "R-7a-v2" are now ruled (M-240, R-HK amended); N4 and N5 need no action. verify-16
  PIN-1 (stale "M-198(1)" line cites, pre-existing) is carried.
- **PINs from the lanes.** steps-rulings-1 (124a §B31): N-D1-RULING (CHAT-26: drafted for the operator; neighbourhoods
  stays V2); DRAFT-B-REFREEZE (R-IG lands on the night); LOAD-WSIB-HEADER-CHECK, CROSS-FIELD-VALIDATOR,
  COUNT-SEMANTICS-LIMITATIONS (follow-ups named by R-HU, R-HV, R-HW); R-EY-9-WHY-TEXT is now R-IH, and
  ID-COUNTER-124-288 and DRAFT-B-RESTATE are closed here. bylaw-fix-3 closes bylaw-fix-2 PIN-1 (the golden puller)
  and opens none of its own.
- **PINs from this lane.** R-IH-STAGE-2 (cite each why-only entry's ruling in `adjudicated_by`, or route it to the
  operator) and R-IH-STAGE-3 (switch `exceptionEntries`, red-first lock), both owed (124a §B32). The R-EY row itself
  carries no pointer to R-IH; the rule-map's `amended-by` records it. Git printed its auto-detected "identity used for this commit" notice
  on three commits; the identity is the same one the base `885c2ad2` carries, so nothing is owed.
- **The scorecard drafts (F-SC-1…14)** await the operator on the page https://claude.ai/artifact/6yC7kewZ1a3kJuVXq9FdMT.
