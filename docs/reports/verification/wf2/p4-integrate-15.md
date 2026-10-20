# Verification index — wf2/p4-integrate-15

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20: "Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."). Both branches merged by `wf2/p4-integrate-15` were verified by a lane that did not write them (verify-15),
read-only. The integrate-14 tip itself was verified by verify-14. Both reports are copied verbatim (`cmp`-identical)
from the orchestrator's scratchpad into this directory.

- **Integrate base:** `a7655cec` (= `wf2/p4-integrate-14` tip, pushed)

## Merged branches (in merge order)

| # | Branch @ tip | Base | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf1/bylaw-fix-2` @ `5a26c383` (batch B CHAT-6/7/8/9/10/13; N-1/N-4) | `70ec6aed` | **PASS-WITH-NOTES** | [`bylaw-fix-2-and-v3-cite-1.md`](bylaw-fix-2-and-v3-cite-1.md) |
| 2 | `wf2/v3-cite-1` @ `18574feb` (R-EY E1 ratchet: v3[] 2 → 4) | `a7655cec` | **PASS** | [`bylaw-fix-2-and-v3-cite-1.md`](bylaw-fix-2-and-v3-cite-1.md) |

Verification of the base tip: `wf2/p4-integrate-14` @ `a7655cec`, verify-14, **PASS-WITH-NOTES**,
[`p4-integrate-14-verify.md`](p4-integrate-14-verify.md).

## Commit order note

Both reports were scanned with `spec-split-check.mjs`'s own extractors (`collectCitations`,
`checkCitationsResolve` for arm (iii), `checkHandbookCitations` for arm (iii-b)) before committing: 0 citations in
either report, so both land in this first commit. A positive control (a file citing one real and one unknown
Spec 124 ruling) was flagged as expected. No report text was changed.

## Integration actions taken on the verify findings

(Filled in by the merge and fix commits.)
