# CARD PUSH-FIXES — ANSWERED 2026-10-30
Operator words (verbatim): "approve 2 and 4"
2. Re-pin scripts/analysis/bylaw-validation/coa-expected/expected-172.json and expected-4d.json with coa-scorecard.mjs --pin: only `inputs` and `commit` change, and the totals are equal (the scorer printed "totals equal" before the pin). Cause: the ruling batches moved Layer 2 table_version via scripts/analysis/bylaw/_schema/bylaw-rule-map.json.
4. Regenerate the generated amendment index (compute_maxbld_scenarios, scripts/analysis/phase3/generate-amendment-index.mjs --write). It was already stale on wf1/p3-model (8fadc19f) before 2026-10-30's work. A generated file only; no old code reused.
Follow-up card owed: take the rule map out of the Layer 2 table_version hash scope so ruling batches stop turning the regression pins dark.
