# CARD — the generated rule map and arm L (answered 2026-10-31)

Problem: arm L (literal scope `scripts/analysis/bylaw/**/*.json`, R-KR / O67-24, shrink-only baseline R-LA) flags all 3,752 strings in `scripts/analysis/bylaw/_schema/bylaw-rule-map.json`. That file is generated from the 69a/131 register by `scripts/generate-bylaw-handbook.mjs` and guarded at pre-commit by `--check`. Every rulings batch regenerates it, so every batch would fail.

Recommended: add this ONE file to the policy's `literal_exempt` (the R-KR declared-files list). Not a general exemption for generated files.
Alternative not recommended: a one-time exception for this push.

Operator answer, verbatim: "1. approved"

Separately, with no ruling needed: the loop arm's `record_missing` is fixed by writing loop round record 1 (MB-68 lane, R-LX), which documents the operator-approved re-pin (CARD-gates-recheck).
Flagged for before MB-31: Phase 3 catalogue rows in the literal-scope JSON may conflict with the shrink-only baseline (calculations are data).
Record in the next decision batch (124a row).
