# Verification index — wf2/p4-integrate-17

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20) says: *"Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."*

The branch merged by `wf2/p4-integrate-17` was verified in two rounds. Neither verifier wrote the work, and both read it
only:
- verify-20 covered by-law fix round 4.
- verify-21 covered by-law fix round 5.

Both reports are copied verbatim from the orchestrator's scratchpad into `../wf1/`. Each copy is `cmp`-identical to its
source.

- **Integrate base:** `ee5ed572` (= `wf2/p4-integrate-16` tip, pushed)

## Merged branch

| # | Branch @ tip | Range verified | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf1/bylaw-fix-4` @ `a467cb4b` (round 4: F-SC-1 (2), F-SC-3, -4, -6 and its family, -7, -8, -9, -11 to -14, front-yard needs-survey guard; chat batch G, M-247 to M-258) | `ee5ed572`..`b6d8e710` (22 commits) | **PASS-WITH-NOTES**, verify-20 | [`../wf1/bylaw-fix-4.md`](../wf1/bylaw-fix-4.md) |
| 1 | the same branch (round 5: chat batch H, CHAT-30 to CHAT-34, row M-259; F-SC-5 `blank_side_wall`) | `b6d8e710`..`a467cb4b` (4 commits) | **PASS-WITH-NOTES**, verify-21 | [`../wf1/bylaw-fix-5.md`](../wf1/bylaw-fix-5.md) |

Round 5 has no branch of its own. Its commits sit on `wf1/bylaw-fix-4`. Its report is filed under the lane label
`bylaw-fix-5`, which its commits and notes use (verify-21 NOTE-1).

## Commit order note

Before committing, both reports were scanned with the extractors from `spec-split-check.mjs` at `ee5ed572`:
- `collectCitations`
- `checkCitationsResolve`, for arm (iii)
- `checkHandbookCitations`, for arm (iii-b)

The scan found 0 citations, 0 dangling and 0 handbook problems, so both reports land in this first commit.

A positive control, a file citing one real Spec 124 ruling and one unknown one, was flagged as expected.

No report text was changed.

## Integration actions taken

- **Merge.** `wf1/bylaw-fix-4` @ `a467cb4b`, merge `f782598a`, `--no-ff` with the hooks on, clean.
  - The merged tree equals `a467cb4b`'s tree plus this index and the two reports. `git diff --stat a467cb4b f782598a`
    lists those 3 files only.
  - The night-1 conflict that both verifiers previewed (`src/tests/decision-log.logic.test.ts` onto `e2c8e108`) does
    not arise here, because night-1 is not part of this integrate.
  - When night-1 is merged, verify-21's preview puts the pin at **78** (76 + 2). The integrate that merges night-1 must
    re-derive that count with `decision-log --check` on its merged tree, not take it from the preview.
- **No code, spec or generated file was changed by this lane.** Neither verifier raised a blocking finding, so nothing
  needed to be fixed or ruled before merging (R-EZ).

## Carried forward

### verify-20 N1–N9 ([`../wf1/bylaw-fix-4.md`](../wf1/bylaw-fix-4.md))

The operator answered verify-20's operator-attention list with chat batch H (*"1-5 y ensure."*). Batch H was imported
by `decision-log.mjs` in `bf448a2c`. verify-21 confirmed its routing (check 1c).

Resolved by batch H:
- **N1, F-SC-6 family extension:** resolved by **CHAT-30** → M-250. RD 21, 28, 35, 37 and 38 take the RD 42 cap form.
  This supersedes the W1 answers Q-W1-1bc0a62a and Q-W1-9b5518ca. RD 27 (D) is left as PIN `RD27-CAP-KEYING`.
- **N2, `private_garage` dropped on x28 / x37 (C)(i):** resolved by **CHAT-31** → M-250.
- **N3, M-247 scope (x14, and the 8 measurement-only DEFINE units → `none`):** resolved by **CHAT-32** → M-247.
- **F-SC-5:** this was operator-attention item 6, *"still unrecorded (orchestrator bug)"*. It is recorded as **CHAT-33**
  → new row M-259. It was applied red-first in `5d118300` → `a467cb4b` (`blank_side_wall`, default true; a platform
  never takes 0.45 m). verify-21 checks 3 and 4a–4d PASS. Golden COA-F-02 is now PROVEN on both lots: FAILS went from
  4 to 2 (verify-21 check 5b).
- **The drafted rulings R-SH-12 / R-SH-13 (operator-attention item 4):** approved by **CHAT-34** → M-257 / M-258. The
  by-law text is kept, and there is no code change.

Still open, carried as notes. None was acted on here:
- **N4:** approved items were applied only in part. All are disclosed in the status cells:
  - M-254: (2)(A) and (7)(A) are PINned.
  - M-255: the 10.5.50.10(5) unit is withheld under M-56. G-UNIVERSE `--accept` is owed.
  - M-249: also keys (4)(D)(iv).
  - M-251: `proposed_storeys` is used in place of `height_storeys`.
- **N5:** the front-yard re-measure on the oracle basis is still owed. It waited on the dblock.
- **N6:** F-SC-3 reaches beyond the approved example. No fixture cell moved.
- **N7:** one red-evidence case name is stale.
- **N8:** rows M-247…M-258 paraphrase their recommendations. The verbatim text is in the generated log.
- **N9:** 13 `stairs_clearance_m` NO ANSWER → DIFFER rows may be a City stair-width mapping issue.

### verify-21 NOTE-1…4 ([`../wf1/bylaw-fix-5.md`](../wf1/bylaw-fix-5.md))

- **NOTE-1:** the lane label `wf1/bylaw-fix-5` appears in the 69a notes, the test file and the red evidence. The
  commits are on `wf1/bylaw-fix-4`. This index files the report under `bylaw-fix-5` and names both labels.
- **NOTE-2:** the red commit `5d118300` holds the evidence only. The test lands in the fix commit, which is the same
  pattern verify-20 accepted.
- **NOTE-3:** only the golden-lots test helper reads the `blank_side_wall` default. A production caller that omits the
  flag gets `needs_user_input`, which is the safe direction. This is owed to the Spec 78 P5 step.
- **NOTE-4:** PIN `CANOPY-BLANK-WALL`. 10.5.40.60(2)(B) `canopy_clearance_m` still takes 0.45 m under the default.
  This is left for the operator.

### PINs

- **`RD27-CAP-KEYING`** (M-250 note): key x27 (D) through keyer A/B, then apply the cap form.
- **`CANOPY-BLANK-WALL`** (M-259 note; verify-21 NOTE-4).
- **The scorecard-harness slips** reported by the by-law fix lane.
- **The `eval-lots` defaults** reported by the by-law fix lane.
- **The M-247 (1) keying of the no-unit exceptions** (x40, x225, x478, x863, x559, x14). It is owed through keyer A/B,
  per CHAT-32.
- **The 10.5.50.10(5) unit (M-255):** the G-UNIVERSE `--accept` is owed.
- **The front-yard re-measure (M-256; verify-20 N5).** It was owed while the dblock was held.
- **The height check.** It was owed while the dblock was held.

## Open items (operator attention)

- **Night-1 `REFREEZE-WITNESS-Q`.** The operator chooses A, B or C.
- **The 12 Layer 2 open questions** on the page https://claude.ai/artifact/GkMJvJHFEyZdd2V88nXXeK.

## Final-tip checks

These checks ran on the merge `f782598a`. The index commit that follows changes this file only. The docs-reading checks
were re-run on it with the same result.

| Command | Result |
|---|---|
| `npx vitest run --exclude '**/*.db.test.ts'` | rc 0. 819 files passed, 1 skipped. 19,511 tests passed, 4 skipped, 936 todo. |
| `npx tsc --noEmit` | rc 0 |
| `node scripts/analysis/step-validate.mjs --all --fast` | rc 0. **R-EY:** 4/43 steps read V3. E1 ratchet PASS (4 listed). E2 cutover PASS. E3 OFF. The R-IH stage-1 advisory reports 17 deviations in 11 steps. The five "descriptor validation FAILED" lines are unchanged (R-DU, non-blocking). |
| `node scripts/analysis/spec-split-check.mjs --check` | clean: 41 moves, 7682 citations, 0 dangling, budgets held |
| `node scripts/generate-step-handbook.mjs --check` | up to date |
| `node scripts/analysis/decision-log.mjs --check` | clean: 14 logs, 76 decisions, 73 register rows, 113 citations, 0 owed, 3 no_ruling |
| `node scripts/analysis/report-schema.mjs --check` | current. RS-5 WARN (54), as before. All other RS gates PASS. |
| `node scripts/analysis/report-fields.mjs --check` | current, 34 fields. The RF gates are report-only. |
| `node scripts/analysis/bylaw/generate-answer-tracker.mjs --check` | clean: 788 answers (785 INCORPORATED, 3 UNFIXED) |
| `node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --check` | clean: 107 fields, 0 dangling, no drift |
| `node scripts/generate-bylaw-provisions.mjs --check` | rc 0. The report-only twins note is never a blocker. |
| `node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --check` and `bylaw-golden-lots.logic` | rc 0. 184 PROVEN / 935 OWED / 16 NOT_EXERCISABLE / 2 FAILS. The test passes in the suite (2080 tests, 936 skipped). |
