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

(Filled in by the closing commit of this branch.)
