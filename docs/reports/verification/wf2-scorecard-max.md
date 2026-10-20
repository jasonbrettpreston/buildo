# Verification — wf2/scorecard-max

**Branch:** `wf2/scorecard-max` @ `b4ca48bb` (parent `6d63db74` = `origin/wf2/p4-rulings-6`)
**Commits:** `582542d8`, `f044df7c`, `42fe01cb`, `b4ca48bb`. All four touch the same 13 files, all under `docs/reports/*assessment.md`. None touches a spec, descriptor, code or test.
**Verifier:** lane verify-11 (R-EZ), read-only, 2026-10-20
**Verdict:** **BLOCK**. There is one blocking finding, B1: neighbourhoods row 21's grounding claim is false, and G-2 now scores that row. The fix is a one-row correction plus a scorecard regeneration. Apart from B1, the branch would be PASS-WITH-NOTES: no header stuffing, the census counts are exact, and the table moves are cited and legitimate.

## Checks run

| # | Check | Result |
|---|---|---|
| 1 | Read how the scorer reads reports: `scoreG3` and `checkPreservedInComputeHasWhy` (`scripts/analysis/step-validate.mjs:2899-2938`), `section()` (`:2753`), `DISPOSITION_VOCAB` (`:335-342`) | G3 takes every `|` row under the `## … PH-3` heading, up to the next `## `, except separator rows. It scores 2/2 only when **every** row, header rows included, contains a closed-set word |
| 2 | Is moving pilots 1–3's line-accounting heading from `###` to `##` mandated, or does it evade a check? Spec 123 `123_step_opt_assessment_validation.md:360` (R-PACE-1) and Spec 121 `:1057` | The citation is real. `:360` lists "(PH-0 boundary, PH-3 intent ledger, PH-5 seam map, PH-6 classification, line accounting)" as separate report sections. `:1057` scores line accounting at the §14.5 differential G4(c). No scorer or gate reads line accounting from inside PH-3 (grep over `scripts/analysis/**` finds no hits). Content is unchanged. **Legitimate**; see N1 |
| 3 | Header stuffing: scanned every header row (a row followed by a separator) in the 13 edited reports at `582542d8`, `f044df7c`, `42fe01cb` and `b4ca48bb`, and at the parent | 0 header rows carry closed-set words at any of these commits. At the tip, every PH-3 row that does not hit the vocabulary is a header row: 13/13 reports, checked with `verify-11/g3rows.mjs` |
| 4 | Negated vocabulary hits ("not/never/no longer preserved-in-…") in added rows | 0 found. Added rows use the vocabulary as follows: 392 `encoded-as-descriptor-field`, 17 `knowingly-retired`, 10 `preserved-in-compute`, 3 `preserved-in-runner`, 3 `encoded-as-deviation` |
| 5 | assert_data_bounds census, checked mechanically (`verify-11/census-check.cjs`): every "Shipped as" check id and each `limit` / `limit_from_config` compared with `scripts/quality/assert-data-bounds.descriptor.json` | **49 rows; every named check exists; limits and `limit_from_config` match exactly.** 52 checks in the descriptor, 50 claimed. The 2 unclaimed checks (`cost_estimates_null_rate`, `cost_estimates_min_tiers`) are later metrics the report does not claim. All 18 tunables are present in `config.logic_variables`. `calibration_freshness_warn_hours` is absent (ADB-D5 ✓). The 4 "bound as SQL parameter" vars are named in their checks' `why` ✓ |
| 6 | assert_global_coverage census, checked mechanically (`verify-11/agc-check.cjs`) | **273 rows. The descriptor has 305 unique checks, and the union of the census claims covers all 305 (0 unclaimed).** Every backticked token resolves, except the `COST_PROP_COLS` loop name (rows 60 and 208), which is intended. 12 sampled rows checked semantically: step_target and field match each check's `expect` (row 74 is renumbered Step 9 → 11; the report says it falls back to the field). All 14 tunable-pair vars are in config |
| 7 | 25+ rows spot-checked against code and descriptors (table below) | Every cited file:line resolves. One overstatement (N4) |
| 8 | Per-step `step-validate --step=<slug> --fast`: tip vs parent | Tip: all 13 edited steps at **16/17**. Parent: address_points, link_parcel_addresses and compute_centroids at 14/17; the other 10 at 16/17 (from the `--all` run at rul7, which leaves these reports unchanged) |
| 9 | Combined integration check: throwaway worktree at v3-label tip `0935a5cb` (R-FA scorer) with this branch's 13 reports copied in; per-step `--fast` over the 30 non-coa converted/pending steps | **30/30 at 17/17**, G3 2/2 on every step. Without this branch, v3-label alone leaves these 13 steps at 14–16/17 (`sv-v3label.log`). The lift therefore depends on R-FA landing |
| 10 | Full suite at tip (parent lane's run, `suite-scmax.log`) | **17,825 passed / 0 failed / 4 skipped**, 794 files. Reproduces the claim |
| 11 | `step-validate --all --fast` at tip (`sv-scmax.log`) | **exit 0** |
| 12 | test:db | Not run: the branch changes only docs |

### Row spot-check (file:line read at `b4ca48bb`)

| Report row | Claim | Evidence | OK |
|---|---|---|---|
| address_points #4–6 | knowingly-retired at commit 9, descriptor `deviations[0]` `:496` | `load-address-points.descriptor.json:496` is `deviations[0].from` "three config.logic_variables[] … progress cadence"; why "RETIRED at commit 9 … dead declaration". The 3 vars are absent from `config.logic_variables` | ✓ |
| address_points #10 | `execution.batch` 3640, `:272`, `2a96590c` | `:272` `"batch": 3640`; `git log -S` → `2a96590c` | ✓ |
| address_points #15 | `on_batch_error` fail_step `:281`; AP-D3 CLOSED FIXED-BY-RUNNER, MQ-B5 (a) | `:281` ✓; `defect-ledger.md:187` ✓; set to fail_step in `3965900e` (FLEET-2) ✓; `deviations[7]` records it ✓ | ✓ |
| address_points G4 | B (2×3); 19 commits, top-left, 8/19 fix; 525,699 rows `:242`; `:180`, `:212-213` | churn table `:34` (19, top-left) ✓; `git log --follow` 19 / 8 `^fix` ✓; golden `:242` 525699 ✓; `:180` guarded_upsert, `:212` departed_mark ✓ | ✓ |
| link_parcel_addresses G4 | C (1×3); 9 commits, 6 distinct, 2 fix; 526,602 `:129`; readers; `:86`/`:115` | churn `:40` ✓; 9 subjects, 6 distinct, 2 distinct `fix(` ✓; golden `:129` ✓; `link-parcels.js:138,:299`, `coa-link-sql.js:52`, `parcel-lookup.ts:199` all join `parcel_address_points` ✓; `:86` insert_only_no_retraction, `:115` retract none ✓ | ✓ |
| compute_centroids G4 | B (2×2); 17 commits, 7/17 fix; 496,536 `:254`; `:67`/`:96` | churn `:41` ✓; 7 `^fix` ✓; golden `:254` ✓; `:67` write_once_backfill, `:96` retract none ✓. Spec 121 `:172` scale A 9 / B 4,6 / C 1-3 ✓ | ✓ |
| load_ravines §2.4 ×3 | sha1 → knowingly-retired (LR-D4); ConfigSchema ×6 and PIPELINE_NAME → encoded-as-descriptor-field "ruled in §2.5" | §2.5 rows `:218`, `:220`, `:223` carry those dispositions ✓ | ✓ |
| parcels #5 | geom-drift; `set_null_on_change_of` geom `:216`; materiality `:173` | ✓ ✓ | ✓ |
| parcels #6 | nine `guard_columns` `:185-195` | 9 entries ✓ | ✓ |
| parcels #8 | `parcels_sqm_to_sqft` pinned min=max=10.7639, on_invalid fail `:750-755`; notes `constants[0]` | ✓ ✓ | ✓ |
| parcels #17 | fail_step `:298`; deviations `:592` (PR-D1) | ✓ ✓ | ✓ |
| neighbourhoods #2 | compute `:118-119`; `on_row_error_why` `:301` | ✓ ✓ | ✓ |
| neighbourhoods #3 | N-D4 = `deviations[3]` | ✓ | ✓ |
| neighbourhoods #6/#7 | notes `fences[1]` (UNNEST note) | ✓ | ✓ |
| neighbourhoods #8 | `acquire.js:679` parseGeoJson | ✓ | ✓ |
| neighbourhoods #10 | `sharing.on_contention:"self_skip"` | ✓ | ✓ |
| neighbourhoods #12/#13/#16/#17 | `deviations[9]` N-D11, `[2]` N-D3, `[18]` cadence, `[10]` N-D12 | all four match ✓ | ✓ |
| neighbourhoods #18 | shipped phase `{sources: 17}` | ✓ | ✓ |
| neighbourhoods #19 | notes `read_this_way[0]` names 'Neighbourhood Number'/'Neighbourhood ID' and the `Name (ID)` regex | ✓ | ✓ |
| neighbourhoods #20 | U+2019 normalisation only in compute comments `:143`, `:335`, not in notes | `:143` comment, `:335` `.replace(/’/g…)` ✓; absent from notes ✓ | ✓ |
| neighbourhoods #21 | notes `read_this_way[0]` holds "5 `startsWith('Total - …')` prefixes + every characteristic label" | `read_this_way[0]` names label families and CONSTRUCTION_PERIODS but **contains no `Total -` prefix**, and no such prefix appears anywhere in `load-neighbourhoods.notes.json` | ✗ (N4) |
| massing S1/S3/S8/S9 | `:316` invariant; `:381` M-D1 retirement; `:33-34`, `:46`; `:116` | ✓ (M-D7 = `deviations[3]` ✓) | ✓ |
| data_bounds IL-5 | compute `:453` NOT IN ('P19','P20'); why `:539` | ✓ ✓ | ✓ |
| data_bounds IL-6 | `COST_MAG_ACCEPT` at `assert-data-bounds-fields.js:115`; 3 ids + 2026-07-09 in why `:491` | ✓ ✓ | ✓ |
| data_bounds IL-4 | four `wsib_*` checks with chains permits+sources | ✓ | ✓ |
| global_coverage IL-11/12 | has_bldg in compute SQL `:258-265`, `:287`; no guard on the check | ✓; `src_parcel_cost_menu_resid_bldg` has no guard key ✓ | ✓ |
| engine_health IL-5/IL-6 | checks `insp_dead_tuple_pct`, `insp_update_insert_ratio`, `coa_dead_tuple_pct`; `:193-221`, `:225-238`, `:294`; all WARN | ✓ | ✓ |

## Findings

| ID | Class | Finding | Evidence |
|---|---|---|---|
| B1 | BLOCKING (inaccurate evidence feeding a scored gate) | Neighbourhoods row 21 was re-dispositioned by this branch from plain `carried` to `carried` = `preserved-in-compute`. Its grounding says the 5 `startsWith('Total - …')` prefixes are written in `load-neighbourhoods.notes.json` `read_this_way[0]`, and that is false. The notes file has 0 occurrences of `Total -`. `read_this_way[0]` names the label families, `CONSTRUCTION_PERIODS`, `PERIOD_MAP`, the id-row markers and the suppression tokens, but not the section-anchor prefixes. The prefixes are written only in compute: `scripts/lib/compute/load-neighbourhoods.js:144` (comment) and `:322`, `:345`, `:367`, `:389`, `:411` (the `startsWith` calls). Because of the new disposition, G-2 now counts 4 preserved-in-compute rows instead of 0 (policy matrix row 4). G-2's "0 with no grounding" verdict on row 21 rests on the substring `notes.json` in a claim that does not hold. Row 20 was corrected honestly to say "written only in compute comments … PINNED"; row 21 was not. **Fix (small):** either rewrite row 21's grounding to name the compute lines and PIN the gap like row 20, with a defect-ledger row (see N3), or write the 5 prefixes into `read_this_way[0]`. Then re-run `step-validate --step=neighbourhoods --write --fast` | `grep -c "Total -" scripts/load-neighbourhoods.notes.json` → 0; `grep -n "startsWith('Total" scripts/lib/compute/load-neighbourhoods.js`; `git diff 6d63db74 b4ca48bb -- docs/reports/2026-09-28-batch2-p3-8-neighbourhoods-assessment.md` rows 20, 21 and the G-2 line |
| N1 | NOTE | Three reports were restructured only to stay out of G3's "every PH-3 table row is a ledger row" reading. Pilots 1–3 and neighbourhoods §4.1 had their `###` heading raised to `##`, and load_centreline's introducing-commits table became a bullet list. The excluded rows are not ledger rows, the R-PACE-1 / Gate 4c / Gate 4d citations are real, the content is byte-identical, and each move is disclosed in an italic note and the commit body, so this is not gaming. It does, though, change the document to fit the scorer rather than fixing the scorer. The load_centreline table → list change still matters for 17/17 under R-FA, since its data rows carry no vocabulary. Integrate may want a follow-up so G3 reads only the declared Intent Ledger table (Spec 120 §14.3), not every table in the section | `step-validate.mjs:2899-2905`; diffs of the 5 reports |
| N2 | NOTE | G-2 (`checkPreservedInComputeHasWhy`) accepts neighbourhoods row 20 as grounded because the row contains the string `notes.json`, but the row itself says the U+2019 rule is *not* in notes.json (a "Rule 4 grounding gap, PINNED"). The committed policy matrix reads "G-2: 4 preserved-in-compute row(s), 0 with no … grounding". The report is honest; the scorer's substring test produces a green the row's own text contradicts. The row's vocabulary half is grounded (`read_this_way[0]`) | `step-validate.mjs:2930-2936`; neighbourhoods row 20 |
| N3 | NOTE | Two Rule-4 gaps were found and marked "PINNED" in report prose only, with no `defect-ledger.md` row: global_coverage IL-11/IL-12 (has_bldg scoping in compute SQL, not a declared guard) and neighbourhoods row 20. A PIN that lives only in report prose is invisible to G6 and to the ledger | `grep has_bldg docs/reports/defect-ledger.md` → 0 |
| N4 | — | Promoted to B1 by the verify-11 parent lane. The brief classes inaccurate assessment evidence as BLOCKING, and this row is now counted by a scored gate (G-2) | — |
| N5 | NOTE | Commit-message inaccuracies (history only; report content is correct): (a) `f044df7c` says it "removes the disposition vocabulary a previous run of this lane had stuffed into these reports' table headers", but no committed ancestor (parent, `582542d8`) carries stuffed headers, so the stuffing was never committed; (b) `f044df7c` gives the line-accounting rows as "17/38/36" where the measured data rows are 17/35/36; (c) the lane's summary claim of "20 converted steps reach 17/17" does not reproduce as a count: this branch edits 13 steps, all of which reach 17/17 under R-FA, and the combined fleet is 30/30 non-coa steps at 17/17 | `verify-11/g3rows.mjs` runs; line-accounting row counts; combo run |
| N6 | NOTE | Header-stuffed tables remain in 9 reports **not** touched by this branch (link_neighbourhoods `:115`, geocode_permits `:337`, load_wsib `:411`, enrich_centreline `:157`, load_heritage `:365`, load_zoning `:290`, load_coa_notices `:35`, load_bylaw_map_areas `:36`, link_parcel_abutments `:37`). Under R-FA (v3-label) these become irrelevant to G3; recorded so the operator's 2026-10-20 header-gaming ruling can be applied fleet-wide | header scan over `docs/reports/*assessment*.md` |
| N7 | NOTE | Under `--step=load_coa_notices --fast`, ACCURATE reads FAIL (gate G #38 CAPTURE-NONZERO, `coa_notice_variances`) at this tip, at v3-label tip and in the combined tree, while `--all` reports PASS. This predates the branch and is unrelated to it; it is a `--step` vs `--all` mode difference to raise with the v3-label/tooling owners | runs in `~/Buildo-wt-scmax` and `~/Buildo-wt-v3label` |

## Collisions for integration

- **All 13 edited reports are also modified by `wf2/v3-label-strict` (`0935a5cb`).** v3-label's changes there are generated scorecard blocks only (the G3 row count, the migration count 272 → 273). Resolve by keeping scorecard-max's report bodies, then regenerating the scorecards on the merged tree (`step-validate --all --write --fast`, R-R). Expected after the merge: 17/17 on all 30 non-coa steps (verified in a throwaway combined worktree).
- The 17/17 depends on R-FA landing. If scorecard-max lands alone, these steps show 16/17 (14 → 16 for address_points, link_parcel_addresses and compute_centroids).
- `docs/specs/01-pipeline/124_step_standard_policy.md:245` (R-DR) is cited as "Spec 124 R-DR". Both rulings-7 and v3-label move the R-D* rows to 124a §B18 (M33); citations by rule id still resolve, but any `124_…:245`-style line citation would go stale. None in this branch cites R-DR by line.

## Reproduced counts

- Full suite at `b4ca48bb`: **17,825 passed / 0 failed / 4 skipped** (794 files). Claim reproduced. Source: the parent lane's `suite-scmax.log`.
- `step-validate --all --fast` at `b4ca48bb`: **exit 0** (`sv-scmax.log`).
- Per-step `--fast` at the tip: 13/13 at 16/17. Combined with the R-FA scorer: 13/13 at 17/17 (30/30 fleet non-coa).
- test:db: not run (docs-only branch; the parent lane's claim is 888/0).

Throwaway worktree used: `verify-11/wt-scmax-combo` (detached at `0935a5cb`, with the 13 reports copied in), removed with `git worktree remove --force` because it held the copied files. Scripts used: `verify-11/g3rows.mjs`, `census-check.cjs`, `agc-check.cjs`.

## Re-verification of 7fc0670d (verify-11b, 2026-10-20)

See `verify-11/wf2-scorecard-max-fix.md`. B1 is **resolved**: row 21 now names the compute lines and pins the gap as N-D22. N3 is **resolved**: AGC-D8, N-D21 and N-D22 are ledgered, cite Spec 124 §2 Rule 4, and their file:lines are correct. Suite 17,825/0/4 and `--all --fast` exit 0 reproduce, and the regenerated scorecards produce an empty diff. One new BLOCKING finding, B2: #36 DEFECT-ID-UNIQUENESS went 497→498, not +3, because `DEFECT_ID_RE` (`registries.mjs:53`, `[A-Z]{2,5}`) does not match 1-letter prefixes, so N-D21 and N-D22 are not recognized. This predates the commit and already hides all 40 M-/N-/P- ledger rows. Widening the regex would turn #36 red on 13 disagreeing M-D mirrors.
**Updated overall verdict for the branch: BLOCK on B2 (gate defect, not branch content). It becomes PASS-WITH-NOTES if the operator rules B2 out of this branch's scope.**
