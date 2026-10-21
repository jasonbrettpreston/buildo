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
