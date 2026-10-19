---
write_scope:
- .cursor/deepseek-fold5-lens.md
allow_commit: false
---
# Independent compliance lens: by-law readings M-199..M-216 (Spec 08 second model)

READ-ONLY except the single output file `.cursor/deepseek-fold5-lens.md`. Do not commit.

Material:
- `docs/specs/01-pipeline/69a_mcbylaw_register.md`, rows M-199 .. M-216 (grep `^\| \*\*M-2`).
- `docs/specs/01-pipeline/78_optimal_lot_configuration.md` §Phase-5: P5.2, P5.5, P5.6, P5.10 (generated field table), P5.10a (CoA), P5.12 (closed disclosure codes with templates), P5.13 (test vectors), P5.14 (trust model), P5.15 (INV-1..25), G-HT-1..9.
- `docs/specs/01-pipeline/131_lot_configuration_policy.md` rows LC-1..LC-52.
- `docs/reference/maxbld-field-lineage.json` (field registry: every field, its regulation ids, trust tier, invariants).
- `docs/reference/bylaw-provisions.json` (verbatim by-law, one provision per line; grep `"article":"10\.20\.40\.20"` etc.).

Operator rulings 2026-10-18 to respect: M-206 renovations only; M-208 disclosed not binding; CoA not applicable for the rear suite and renovations (LC-49); per-lot CoA list = existing `comparable_builds` + `nearby_coa_builds_gfa_sqm` (LC-51), no new field; secondary suite ≤ 45 % of the whole house (M-199); default the smallest setback (no windows), rest disclosed.

For EACH row M-199..M-216, check:
1. STANDARDIZED — does it use the same field names, disclosure-code form, status forms (`permitted` / `not_permitted:<clause>` / `not_buildable:<clauses>` / `not_evaluated:<reason>`) and trust tiers as sibling rows and the other scenarios? Is any concept stated two different ways across Spec 78 / 131 / 69a?
2. OBSERVABLE — every field it names exists in the lineage registry; every disclosure code it names exists in P5.12; every INV/P5.13 vector it cites exists.
3. UNDERSTANDABLE / SIMPLE — would a homeowner understand its disclosure template? Is there one form per concept?
4. NO SCOPE EXPANSION — does it add any scenario, field or data source beyond those already in Spec 78 §Phase-5?
5. ACCURATE — quote the deciding by-law words for its main claim and say CORRECT / WRONG / AMBIGUOUS.
Output a table `| Row | Std | Obs | Plain | Scope | Accurate (quote) | Problems |` and then a list of concrete problems with file:line. Say UNVERIFIED rather than guess. Write an early draft by iteration 25.
