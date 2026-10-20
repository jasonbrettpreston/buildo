# Verification index — wf2/p4-integrate-14

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20: "Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."). The branch merged by `wf2/p4-integrate-14` was verified by a lane that did not write it (verify-13), read-only.
The report is copied verbatim from the verify-13 scratchpad into this directory's parent (`docs/reports/verification/`).

- **Integrate base:** `70ec6aed` (= `wf2/p4-integrate-13` tip)
- **Merge notes:** verify-13's trial-merge notes for night-c (written against int12 `208e8a82`),
  [`../night-p4c-merge-notes.md`](../night-p4c-merge-notes.md). Every point was re-checked against `70ec6aed`
  (see "Integration actions" below).

## Merged branches (in merge order)

| # | Branch @ tip | Verdict | Reports |
|---|---|---|---|
| 1 | `wf2/p4-night-c` @ `51874abd` (base int11 `5f1cc5ba`; coa, link_coa_to_parcels, enrich_coa_zoning R-EQ swaps; R-GZ, R-HA, RE-FREEZE #38) | **PASS-WITH-NOTES** (integration blocker: the coa-chain POST captures go STALE after int12's condition-9 backfill, merge notes §3) | [`../wf2-p4-night-c.md`](../wf2-p4-night-c.md), [`../night-p4c-merge-notes.md`](../night-p4c-merge-notes.md) |

## Commit order note

The night-c verification report was scanned with `spec-split-check.mjs`'s own extractors (`collectCitations`,
`checkHandbookCitations`) before copying: 0 citations in `wf2-p4-night-c.md`, so it lands in this first commit. The
merge notes cite the register row R-HA in Spec 124 (their line 32), which arm (iii) reports DANGLING at the base (R-HA arrives with the
merge), so the merge notes land verbatim in the merge commit, where the id resolves. No report text was changed.

## Integration actions taken on the verify findings

(Filled in by the merge and integration commits; see below.)
