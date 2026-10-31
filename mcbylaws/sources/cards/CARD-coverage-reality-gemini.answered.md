# CARD coverage map, city-wide reality check, Gemini for disagreements — ANSWERED 2026-10-31
Operator words (verbatim): "add 1 and 3, 4 for disagreement"
1. Coverage map: every Phase 3 catalogue row and every branch of it has at least one worked example; a gap gets an example or a stated, cited reason; enforced automatically by the loop gate. New task MB-75 (lane G, after MB-68 lands; MB-31's catalogue is its input).
3. City-wide reality check: after the first Phase 3 DB run, a Reality-Check seat reviews the outputs on all lots (zone-aware bounds, cross-field invariants, distribution outliers; existing tools scripts/analysis/parcel-sanity-audit.js and parcel-field-dump.js), separating genuine bugs from not-yet-re-run data. New task MB-76 (lane T, after the MB-31 step's first local run).
4. Gemini runs the independent blind check ONLY on examples where DeepSeek's blind answer and the Claude check disagree, to settle them before they reach the operator.
