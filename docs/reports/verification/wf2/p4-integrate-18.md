# Verification index — wf2/p4-integrate-18

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20) says: *"Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."*

The branch merged by `wf2/p4-integrate-18` was verified in one round by verify-22. The verifier did not write the work
and read it only.

The report is copied verbatim from the orchestrator's scratchpad to [`refreeze-night-1.md`](refreeze-night-1.md). The
copy is `cmp`-identical to its source.

- **Integrate base:** `ac78d5dd` (= `wf2/p4-integrate-17` tip, verified)

## Merged branch

| # | Branch @ tip | Range verified | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf2/refreeze-night-1` @ `8accd2b5` (REFREEZE-BUNDLE-1 night 1: items (1), (3)-(8) in one fleet recapture; chat batches E, F, I = CHAT-27, CHAT-28, CHAT-35; R-IJ retires the orphan `link_wsib` cohort-entities trace; R-EY E1 ratchet 4 -> 28; the two R-DK net-new scorecards) | `ee5ed572`..`8accd2b5` (5 commits) | **PASS-WITH-NOTES**, verify-22 | [`refreeze-night-1.md`](refreeze-night-1.md) |

## Commit order note

Before committing, the report was scanned with the extractors from `spec-split-check.mjs` at `ac78d5dd`:
- `collectCitations`
- `checkCitationsResolve`, for arm (iii)
- `checkHandbookCitations`, for arm (iii-b)

The scan found 2 citations (`Spec 124 R-ID` at line 17 and `Spec 124 R-GT` at line 22), 0 dangling and 0 handbook
problems, so the report lands in this first commit.

A positive control, a file citing one real Spec 124 ruling, one unknown ruling and one unknown handbook line, was
flagged as expected (1 dangling, 1 handbook problem).

No report text was changed.

## Integration actions taken

- **Merge.** `wf2/refreeze-night-1` @ `8accd2b5`, merge `e0fa25ee`, `--no-ff` with the hooks on. One conflict, in `src/tests/decision-log.logic.test.ts`, as both verifiers previewed.
  - The decision-log pin was re-derived on the merged tree with `decision-log --check`, not taken from the preview. It read 79 in the merge and 80 once CHAT-37 was imported.
- **CHAT-37 (operator, option c+a).** The V3 label counts only steps that are converted, or pass when judged as converted (the strict `--staged` view). `load_coa_notices` comes off the E1 list: **V3 = 27**.
  - Raw record: `docs/reports/decisions/raw/2026-10-21-chat-batch-k-37/2026-10-21-batch-k.json`. It is the batch K record cut to CHAT-37 only, because the importer takes every decision in a file and CHAT-38 to CHAT-40 belong to other lanes.
  - Imported by `decision-log.mjs --import --chat` as the log `2026-10-21-chat-batch-k-37`. The register row is **R-IK** (124a, conflict check and seven questions in §B35). Spec 124 stays at 378 lines; its line 288 allocation is replaced in place (next free `R-IL`).
  - Generator change, red tests first (`v3-label-enforcement.logic`, 3 tests): `step-validate --all --fast --v3-json=<f>` judges pending steps as-converted (`overlayRowsFor`), and `v3-label.mjs --write <f> --retire <slug>` removes a slug only when that strict run read it and it does not read V3. Plain `--all` is unchanged.
  - The floor was regenerated, not hand-edited: the strict run read 27 of 43 as V3, and `load_coa_notices` was the only listed step not at V3. Plain `--all` still reads 28 of 43 (it includes `load_coa_notices`); the E1 line reads `PASS (27 listed)`.
  - Closes PIN RATCHET-PENDING-ASCONVERTED.
- **Follow-up fix `81324fa4`.** The new row R-IK was missing from the handbook rule map (`handbook-rule-map.logic`, arm (a), 3 tests red in the first full run). Added `R-IK` to `scripts/steps/_schema/rule-map.json` and regenerated Spec 132.
- **Decision-log lock.** `decision-log.logic` now expects 80 decisions and has a batch K lock (CHAT-37 imported alone, cited by R-IK).

## Carried forward

### verify-22 NOTE-1..8 ([`refreeze-night-1.md`](refreeze-night-1.md))

None blocks. Status at this tip:
- **NOTE-1:** a flaky `deepseek-exec-fences.infra.test.ts` (tmpdir race). It did not recur in the two full runs here.
- **NOTE-2:** captures' `git_head` is `e2c8e108`, not `491685bd` (capture-then-commit). Proven fresh by stale=0. No action.
- **NOTE-3:** the explained-diffs count is 371, not the brief's 382. G8 shows 0 unexplained. No action.
- **NOTE-4:** one `link_coa_to_parcels` explanation still opens with the pre-restore text. Open: a text-only cleanup, queued.
- **NOTE-5:** `491685bd` alone is not green (stale R-DK scorecards, fixed in `8accd2b5`). Open: PIN NETNEW-SCORECARD-HEAD.
- **NOTE-6:** "104 of 106" is consistent. The 2 enrich_permits PREs are not retaken. Open: PIN EP-PRE-REPLAY.
- **NOTE-7:** `last_measured` is written as one-line JSON in descriptors. Cosmetic.
- **NOTE-8:** report-fields `--check` shows report-only gate failures RF-2, RF-5, RF-6, RF-8, RF-10, the same at the base. Not new.

### PINs
- Closed here: RATCHET-PENDING-ASCONVERTED.
- Open: NETNEW-SCORECARD-HEAD, EP-PRE-REPLAY, LN-D6-REMEASURE, OFFLINE-REPLAY-MODE (follow-up to CHAT-28), REFREEZE-ITEM2-PERMITS3, RS-PRODUCER-READ-RULE, plus the PINs carried in the integrate-17 index (RD27-CAP-KEYING and others).

### Open items
- Item (2), the refresh_snapshot producer-read, is its own library RE-FREEZE in the permits 3 landing (R-II).
- CHAT-38 to CHAT-40 (by-law rulings page, Layer 2 answers) are in the batch K record and are not imported here.

## Final-tip checks (this tree)

| Check | Result |
|---|---|
| `vitest run` (full, one at a time) | 835 files passed, 122 skipped; 19592 tests passed, 638 skipped, 936 todo; 0 failed |
| `npm run test:db` (dblock taken and released) | 133 files passed, 1 skipped; 893 tests passed, 12 skipped |
| `tsc --noEmit` | exit 0 |
| `step-validate --all` | exit 0; `R-EY: 28/43 read V3` (plain view); E1 PASS (27 listed); E2 PASS; E3 OFF |
| `step-validate --staged` | exit 0 |
| `spec-split-check --check` | clean, 8274 citations, 0 dangling |
| `decision-log --check` | clean: 18 logs, 80 decisions, 76 register rows |
| `npm run system-map` | regenerated, 115 specs |
