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
