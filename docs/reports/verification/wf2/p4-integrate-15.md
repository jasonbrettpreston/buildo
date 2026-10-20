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

- **Merges.** `wf1/bylaw-fix-2` @ `5a26c383` (merge `e3d94582`) and `wf2/v3-cite-1` @ `18574feb` (merge
  `7e9a83cb`), each `--no-ff` with the hooks; both clean, as verify-15 checks 14 and 15 previewed.
- **verify-15 N2 (CHAT-9 amends M-102 / M-106).** 69a M-239's conflict check and its Amends cell now name M-102
  (69a:183, *"or mixed bound directions or measures in one unit — the unit is UNUSUAL"*) and M-106 (69a:190, *"A unit
  whose statements bound `encroachment_m` (max) and `encroachment_clearance_m` (min, …) mixes bound directions, which
  one unit `bound` cannot carry"*). In plain words: the eight x.40.10(2) units now put a max (`main_wall_height_m`) and
  a min (the share) on one LIMIT unit, which M-102 and M-106 had made UNUSUAL; M-239 amends them for targets that
  declare their own bound. Only the six M-239 targets declare one (`vocab.json` `dsl_target.<t>.bound`: the two share
  tiers `min`, the four attic thresholds `exact`); `encroachment_clearance_m` declares none, so the M-106 pair is
  untouched. Authority: the operator's CHAT-9 words in
  `docs/reports/decisions/raw/2026-10-20-chat-batch-b/2026-10-20-batch-b.json` (*"the operator approves the target
  shape"*). No code, data or test changed: the shape was already applied at `06f7fb6d`; only the row's record of what it
  amends was incomplete.
