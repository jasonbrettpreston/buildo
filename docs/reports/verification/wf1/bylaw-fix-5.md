# Verification report: verify-21, `wf1/bylaw-fix-4` from `b6d8e710` to `a467cb4b`

**Verifier:** lane verify-21 (independent, read-only; R-EZ) · **Date:** 2026-10-21
**Range:** `b6d8e710` (verify-20, PASS-WITH-NOTES) to `a467cb4b`. Four commits: `bf448a2c` batch H import, `ddd00df8` decision-log lock, `5d118300` F-SC-5 red evidence, `a467cb4b` F-SC-5 fix.

## Verdict: **PASS-WITH-NOTES**

There are no blocking findings. Every claim checked holds. Four notes follow; none blocks integration.

## Check table

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Raw record byte-identical | PASS | `cmp` of `docs/reports/decisions/raw/2026-10-21-chat-batch-h/2026-10-21-batch-h.json` @a467cb4b against `<scratchpad>/chat-decisions/2026-10-21-batch-h.json`: identical |
| 1b | `decision-log --check` | PASS | clean: 14 logs, 76 decisions, 73 register rows, 113 citations, 0 owed, 3 no_ruling |
| 1c | Routing goes to the claimed rows | PASS | CHAT-30 and CHAT-31 go to M-250, CHAT-32 to M-247, CHAT-33 to M-259 (new, line 407), CHAT-34 to M-257 (M-258 also cites it). Each row carries its `2026-10-21-chat-batch-h#CHAT-n` note, and each note keeps the prior status text as its prefix |
| 1d | CHAT-30's superseded W1 answers are at their real locations | PASS | `adjudications.json:45757` is Q-W1-1bc0a62a ("min(…; 0.5 ratio × lot_area_m2) converts FSI into m2"). `:43976` is Q-W1-9b5518ca ("…is a conversion (§7.4)"). Both lines are the same at b6d8e710 and a467cb4b |
| 2 | `adjudications.json` is append-only; the 9 `~s1` records carry identical values | PASS | b6d8e710 to a467cb4b: +517 / −0 lines, and the first 5917 records are byte-equal. 9 `~s1` records (5 numeric_expression citing #CHAT-30; x28/x37 application.uses/evidence citing #CHAT-31). Each one supersedes an existing record with the same unit, field and value |
| 3 | Red first | PASS | Throwaway detached worktree at ddd00df8 with only the test file added: 2 pass / 6 fail, matching the evidence 8/8 case by case. At a467cb4b: 8/8 pass. Both worktrees removed with plain `git worktree remove` |
| 4a | Licensing text is in `ch10_10.txt` exactly as quoted | PASS | Found verbatim: "The required minimum side yard setback required in regulation 10.10.40.70(3)(A) and (B), may be reduced to 0.45 metres if there are no windows or doors in that side of the building, for the following residential building types in the R zone: (A) … (F) (Deleted by By-law 648-2025) … (G) an apartment building with a height of 13.0 metres or less." |
| 4b | (A)–(E), (G) extension | PASS | The condition sits in the lead-in, so it governs every item. (F) is deleted, so six keyed units take 4 records each = 24 M-75 corrections. Existing tokens are kept: C keeps `all_units_front_street`, G keeps the 13.0 m band |
| 4c | Missing flag gives `needs_user_input`; the default lives in vocab | PASS | Probe on an R lot with no flag: `side_setback_m` gives `not_evaluated / needs_user_input:blank_side_wall` for detached, townhouse and apartment. The default is `design_choice_disclosure.default_overrides.blank_side_wall.taken_as: true`; the evaluator has no silent default |
| 4d | House 0.45 m by default; platform 0.9 m | PASS | With the vocab defaults: house `side_setback_m` 0.45 (winner (4)(A)); `platform_side_setback_m` 0.9 (10.5.40.50(2)); `platform_clearance_m` 0.9. With `blank_side_wall: false` the house gets 0.9 (winner (3)(A)). The platform gets 0.9 even when the flag is missing or true |
| 4e | PIN CANOPY-BLANK-WALL | NOTED | Recorded in the M-259 APPLIED note and the fix commit. The probe confirms it: `canopy_clearance_m` = 0.45 by default and 0.9 when the flag is false (10.5.40.60(2)(B) still reads the reduction) |
| 5a | eval-perf pin | PASS (unmoved) | The `verify-15/scripts/cells.mjs` hash at a467cb4b is `3815ff0a…296d` (13580 cells), equal to the pin in `bylaw-eval-perf.logic.test.ts:142`. Diff against verify-20's cells: 0 changed |
| 5b | Golden pins | PASS | `cases.json` b6d8e710 to a467cb4b: exactly 2 of 1137 cases changed, idx 1127 (453 Durie St, A0594/26TEY) and idx 1135 (474 Beresford Ave, A0510/26TEY). Both went from FAILS/COA-F-02 to PROVEN/null, with scenario `flags.blank_side_wall: false` and expect `winner (3)(A)`. Counts went from 182/935/16/4 to 184/935/16/2. `golden-lots-cases --check` is clean, so both cases are produced by the generator |
| 5c | Other generated pins | PASS | Field inventory: only the vocab.json sha. Answer tracker: only the (4)(D) and (4)(E) check lists. Decision-log test: 71 to 76 plus a batch H case. All generator `--check` runs are clean |
| 6 | Line stability | PASS | 69a went from 406 to 407 lines. Every changed line (341, 395, 398, 405, 406) keeps its old text as a prefix; M-259 is appended at 407; no line moved. Specs 68, 124 and 124a are untouched. New cites check out: 69a:139, :153, :339, :341, :402, :407, `124_step_standard_policy.md:266`, `agree.mjs:23` |
| 7 | Suite (`vitest run --exclude **/*.db.test.ts`) | PASS | 819 files passed, 1 skipped; 19511 tests passed, 4 skipped, 936 todo |
| 7 | `tsc --noEmit` | PASS | exit 0 |
| 7 | spec-split-check | PASS | 41 moves; 7682 citations checked; 0 dangling |
| 7 | decision-log | PASS | as in 1b |
| 7 | report-schema | PASS | exit 0 (RS-5 WARN 54, pre-existing) |
| 7 | report-fields | PASS | current (report-only gates as before) |
| 7 | answer-tracker | PASS | 788 answers (785 INCORPORATED, 3 UNFIXED); clean |
| 7 | maxbld-lineage | PASS | 107 fields; 0 dangling; no drift |
| 7 | bylaw-provisions | PASS | exit 0 (report-only STALE note, never a blocker) |
| 7 | golden-lots `--check` and test | PASS | `--check` exit 0; test 1144 passed, 936 todo |
| 7 | `step-validate --all --fast` | PASS | exit 0 (R-EY E1/E2 PASS; E3 off, unchanged) |
| 8 | Merge preview | see below | one known textual conflict onto night-1 |

## Findings

**BLOCKING:** none.

**NOTE-1: the lane label differs from the branch name.** The new 69a notes (M-205(2) note, M-259 APPLIED note; 2 occurrences), the test file and `bylaw-fix-5-fsc5-red.json` all say "lane wf1/bylaw-fix-5". The commits are on `wf1/bylaw-fix-4`. It is cosmetic and traceable through the commit shas, but a reader searching by branch name will not find these notes.

**NOTE-2: the red commit does not contain the test file.** `5d118300` adds only the red-evidence JSON; `src/tests/bylaw-fix-5.logic.test.ts` first appears in the fix commit `a467cb4b`. This is the same pattern verify-20 accepted. The red evidence reproduces exactly when the fix-commit test file is run on ddd00df8 (6 red / 2 pass, 8/8 cases match).

**NOTE-3: only a test helper reads the default.** `design_choice_disclosure.default_overrides.blank_side_wall` is read only by `src/tests/helpers/bylaw-golden-lots.ts` (golden scenarios). No production Layer 3 / Spec 78 step reads it yet. This matches the existing M-173/M-176(1)/M-197 pattern. Until the Spec 78 P5 step supplies the defaults, a production caller that omits the flag gets `needs_user_input` for the R side yard rather than 0.45 m. That is the safe direction and is what CHAT-33 asked of the evaluator.

**NOTE-4: PIN CANOPY-BLANK-WALL (as flagged).** 10.5.40.60(2)(B) `canopy_clearance_m = side_setback_m` still takes the 0.45 m reduction under the default, because a canopy carries no accessory use. The PIN is recorded in the M-259 status cell and the probe confirms its description. It is left for the operator.

Also observed, no action needed: the `calculation_handling~s1` records on (4)(A)–(E) supersede earlier corrections with new values (they add `blank_side_wall` to user_inputs and gaps). These are intended M-75 corrections, not authority-only supersedes; (4)(G)'s calculation_handling is a new correction.

## Merge preview (`git merge-tree --write-tree`, read-only)

| Onto | Merge base | Result |
|---|---|---|
| `ee5ed572` | `ee5ed572` (ancestor of the tip) | **Clean** (fast-forward-able); tree `cedb6ed9` |
| `e2c8e108` (night-1 tip) | `ee5ed572` | **1 conflict:** `src/tests/decision-log.logic.test.ts` |

How to resolve the conflict:
- **Pinned count:** night-1 has `expect(r.decisions).toBe(60)` and this branch has `76`. Both start from 58 at ee5ed572 (night-1 adds 2, this branch adds 18), so the merged pin should be **78**.
- **Test blocks:** keep night-1's "chat batch F" and "chat batch E" cases and this branch's "chat batch H" case. They are adjacent insertions.

There is no CHAT id collision: night-1 uses CHAT-27 and CHAT-28, and this branch uses CHAT-29 to CHAT-34. This is the same conflict verify-20 found (`verify-20/mt-night1.txt`). Run `decision-log --check` after the merge to confirm 78.

## Hygiene
Nothing was written in the repo; `~/Buildo-wt-blfix4` is still at a467cb4b with the same status (only the pre-existing untracked `mobile/node_modules`). Scratch files are under `<scratchpad>/verify-21/`. All three throwaway worktrees (wt-red-ddd00df8, wt-fix-a467cb4b, wt-tip) were removed with a plain `git worktree remove`, symlinks first. No stash, reset, Python, .env read or DB access; no permission was denied.
