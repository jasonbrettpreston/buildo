---
write_scope:
- docs/reference/envelope-answer-dispositions.json
allow_commit: false
---
# Mechanical edit: dispositions for M-206 and M-208 (Spec 08 sub-task)

Edit ONLY `docs/reference/envelope-answer-dispositions.json`. Keep its formatting (1-space JSON indent, key order, trailing newline). Do not change any other entry. Do not commit.

The operator ruled on 2026-10-18:
- M-206 (one-storey 2.0 m extension): applied to RENOVATIONS ONLY (the `renovation_addition` scenario), not new builds. Disclosure code stays `one_storey_extension`.
- M-208 (suite soft landscaping): DISCLOSED, NOT BINDING. The required area is computed and disclosed (`suite_soft_landscaping`); it never sizes the suite.

Tasks. Find every entry in `dispositions` whose `fix_ids` contains "M-206" (there are 6, for unit ids under 10.20.40.20(2) and 10.40.40.20(2)) and every entry whose `fix_ids` contains "M-208" (there are 4, under 150.7.50.10(1) and 150.8.50.10(1)). For each, replace ONLY the `corrected_value` string:
- M-206 (A) entries (unit id ending `#(2)(A)`): "Applied in the renovation (addition) scenario only (operator 2026-10-18, M-206): +2.0 m beyond the length cap, one storey ≤ 5.0 m, ≤ 50 % of the building width, ≥ 3.0 m from each side line; disclosed. New-build rows do not take it."
- M-206 (B)/(C) entries: "As (A): renovation (addition) only (M-206), disclosed."
- M-208 entries: keep the clause-specific part (which suite, which share, which area) from the current text, drop any phrase saying it is binding, "applied as a binding constraint", or "operator to confirm", and end with: "Disclosed, not binding (operator 2026-10-18, M-208); the suite is not reduced."
Do not change `disposition`, `fix_ids`, `disclosure_code`, `basis`, `verdict` or `unit_id`.

Then validate: the file must parse as JSON (read it back) and `count` must still equal the number of entries. Report the 10 unit ids you changed and their new `corrected_value`.
