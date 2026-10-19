# Max-build fold, operator item 5 — compliance of M-199..M-216 (2026-10-18)

Operator 2026-10-18, item 5: *"landscaping - disclosed, one-storey extension - renovations only, coa for rear suites and renovations is not applicable - per lot lists - this needs to correspond to the governing spec for COA - has been previously decided - are M-199 to M216 show they are in compliance and if not make a rulings - also ensure they are standardized across steps, observable and most importantly understandable and simple and dont expand scope"*.

Method (Spec 08): Claude checked each row against the criteria below; DeepSeek ran an independent second-model lens (`.cursor/deepseek-fold5-lens.md`, run 20261019T003544Z-fbb70cfe) and did the mechanical disposition edit (run 20261019T003544Z-8a6ce2b2). Claude verified every DeepSeek claim against `docs/reference/bylaw-provisions.json` before acting on it (accepted / rejected list at the end).

**Criteria.**
- **McB:** McBylaws Airtight. Spec 68 §5a, the 69a reading conventions, and a verbatim quote.
- **Std:** STANDARDIZED. The same field names, status forms, trust tiers and disclosure form as the sibling rows and the other scenarios. One form per concept.
- **Obs:** OBSERVABLE. Each field is in `docs/reference/maxbld-field-lineage.json`, each code is in Spec 78 P5.12, and the INV and P5.13 vector are named (the vectors themselves are OWED at step commit ①, red first).
- **Plain:** UNDERSTANDABLE and SIMPLE. The disclosure template passes LC-52: at most 45 words, with by-law terms glossed.
- **Scope:** no scenario, field or data source beyond Spec 78 §Phase-5.

**Verdict values.**
- **compliant:** passes every criterion.
- **fixed:** a wording or standardization defect, corrected in this fold. The reading itself is unchanged.
- **ruled:** an operator ruling or a new/amended ruling changes the reading.

## Table

| Reading | What it says (plain) | McB | Std | Obs | Plain | Scope | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|
| M-199 | A secondary suite may be up to 45 % of the whole house's interior. | ✓ verbatim 150.10.40.40(1) | fixed: P5.6 interior said "45 % of the host unit"; now "of the whole house's interior (M-199)" | ✓ `suite_interior_sqm`, INV-13, `secondary_suite_share_reading` | ✓ | ✓ | compliant (wording fixed) | 69a M-199; Spec 78 P5.6 |
| M-200 | R zone flat roofs get a set-back top storey (1.4 m). | ✓ 10.10.40.10(11)/(12) | ✓ RS (6)(A) form | ✓ P5.13 R flat-roof vector; `upper_storey_setback_m` | ✓ `flat_roof_setback` | ✓ | compliant (roof-slope keying OWED, M-218) | 69a M-200 |
| M-201 | On an RM lot with no height label, a houseplex gets 12.0 m. | ✓ 10.80.40.10(1)(B)(ii) | ✓ | ✓ P5.13 vector | n/a (no code) | ✓ | compliant | 69a M-201 |
| M-202 | Semi houseplex max 4 units; the 'u' lift to 6 only in R/RT/RM; no 'u' = no cap. | ✓ 800.50(746), 600.60.40(1)(A) | fixed: INV-11 still had the pre-M-202 formula; now the M-202 formula | ✓ INV-11, `dwelling_units` | ✓ | ✓ | compliant (INV fixed) | lineage `invariants` INV-11 |
| M-203 | An attic that fails the headroom test is livable but not counted in GFA. | ✓ 10.5.40.40(1) | fixed: `attic_outside_gfa_sqm` and its template cited RD 10.20.40.10(8) as a GFA exclusion; (8) is a storey exclusion only | ✓ `attic_outside_gfa_sqm`, `attic_outside_gfa` | fixed (LC-52 gloss) | ✓ | compliant (cite fixed) | 10.20.40.10(8) verbatim *"this space is not a storey"* |
| M-204 | Houseplexes get 19 m depth/length on large lots; RM houseplex has no cap. | ✓ x.40.20(3), x.40.30(2), 10.80.40.20(1) | ✓ `gain_reasons` values | ✓ INV-5, P5.13 | n/a | ✓ | compliant | 69a M-204 |
| M-205 | Main-building setbacks are explicit fields; R side yard 0.45 m with blank walls by default. | ✓ 10.10.40.70(4) chapeau verified (covers (3)(A)/(B), detached/semi/houseplexes) | ✓ the LC-35 / M-197 default-smallest form (operator "default is the smallest setback - rest is disclosure") | ✓ `main_*_setback_m`, INV-9 | ✓ `blank_side_wall`, `front_yard_averaging` | ✓ | compliant | 10.10.40.70(4) verbatim |
| M-206 | The 2.0 m one-storey extension applies to renovations only. | ✓ RD 10.20.40.20(2); fixed: RS/RM 10.40.40.20(2) / 10.80.40.20(2) differ (frontage > 12.0 m with no upper bound, semi included, width of the dwelling unit, party line excluded) | ✓ M-211 renovation form | ✓ `main_length_cap_m` (RA only), P5.13 vector "RD addition with it, RD new build without it" | ✓ `one_storey_extension` | ✓ | **ruled** (operator: renovations only) | 69a M-206; Spec 78 P5.2, P5.6 |
| M-207 | A lot with less than 3.5 m of front lot line is not buildable; a vacant sub-minimum lot needs 6.0 m frontage for a detached house or houseplex. | fixed: 10.5.30.21(3) names *"a detached house or detached houseplex"* only, so the gate applies to D, 2, H, not S | fixed: names `irregular_lot_approximation` for the margin band; `gate_flags` value renamed `lot_viability_margin` → `irregular_lot_approximation` (one name); cite §6.5 → §6.6 rule 8 | ✓ INV-21, `scenario_status` | ✓ | ✓ | compliant (scope and names fixed) | 10.5.30.21(3) verbatim |
| M-208 | Suite soft landscaping is shown as a disclosure; it never shrinks the suite. | ✓ 150.7.50.10(1), 150.8.50.10(1) | ✓ M-216 / M-212 disclosure form; `suite_binding` loses `soft_landscaping` | ✓ `suite_soft_landscaping_sqm`, P5.13 vector | fixed (plain template) | ✓ | **ruled** (operator: disclosed) | 69a M-208; Spec 78 P5.5 |
| M-209 | A laneway suite needs 3.5 m of lane along the rear, the side, or both combined. | ✓ 150.8.30.20(1) three arms | ✓ | ✓ `suite_lane_arm`, INV-15 (derivation OWED, Spec 130) | n/a | ✓ (centreline data, operator 2026-10-18) | compliant | 69a M-209 |
| M-210 | A suite's attic, mechanical, basement and void areas don't count toward its floor-area cap. | ✓ 150.7.60.50(5) / 150.8.60.50(4) | ✓ M-203 form | ✓ INV-2 | fixed (LC-52 gloss) | ✓ | compliant | 69a M-210 |
| M-211 | Renovation corrections: the up room still meets depth/length and the FSI residual; R rear-addition floors no higher than the top floor. | ✓ 10.10.40.10(7), 10.10.40.40(2) | fixed: "the smaller cap binds" stated in 69a and P5.6 | ✓ P5.13 | fixed (`r_pre1953_fsi_relief` gloss) | ✓ | compliant | 69a M-211 |
| M-212 | Established grade, triangular lots and shorelines are disclosed. | ✓ 10.5.40.10(1), 5.10.40.70(5), 5.10.40.40(1) | ✓ M-169 form | ✓ `triangular_lot` etc. | fixed (`established_grade`, `shoreline_hazard` gloss) | ✓ (the detector reads parcel geometry already held) | compliant | 69a M-212 |
| M-213 | A holding zone blocks new building; heritage, ravine and unauthored exceptions are disclosed. | ✓ | ✓ | ✓ INV-21, `gate_flags` | fixed (`holding_zone` plain) | ✓ (existing columns) | compliant | 69a M-213 |
| M-214 | Major-street, semi-detached, townhouse and apartment forms are disclosed as not modelled. | ✓ | ✓ M-169 | ✓ P5.12 codes | ✓ | ✓ deferral only | compliant; (3) ratified | 69a M-214 |
| M-215 | R's default FSI is 0.6; the entrance-height rule applies only where its clause does. | ✓ 10.10.40.40(1)(B), 10.10.40.10(6) | ✓ | ✓ | fixed (`main_entrance_height` gloss) | ✓ | compliant | 69a M-215 |
| M-216 | No parking is required with a suite; two bicycle spaces are. | ✓ 150.7.80.1, 150.8.80.1 | ✓ M-66 | ✓ `suite_parking_bicycle` | ✓ | ✓ | compliant | 69a M-216 |

**Result.**
- 0 rows are non-compliant on the reading. Their P5.13 vectors are named and OWED at step commit ①.
- 2 rows changed reading by operator ruling: M-206, M-208.
- 9 rows had a wording, cite or naming defect, fixed without changing the reading: M-199, M-202, M-203, M-207, M-210, M-211, M-212, M-213, M-215.
- All 18 rows are RATIFIED 2026-10-18.

## Rulings added or amended

| Id | Ruling |
|---|---|
| 69a M-206 (amended) | Renovations only (operator). The RS/RM wording difference is recorded. |
| 69a M-207 (amended) | The 10.5.30.21(3) gate is scoped to D, 2, H. The margin band is disclosed as `irregular_lot_approximation`. The lane exception is shown as the binding clause. |
| 69a M-208 (amended) | Disclosed, not binding (operator). |
| 131 LC-49 (ruled) | CoA is not applicable to the rear suite or the three renovations. Renovation rows carry `coa_status = not_applicable:no_coa_form`. The suite has no CoA figure, and `coa_gfa_sqm` covers the main building only. |
| 131 LC-51 (new) | The per-lot CoA list is the one already decided: `comparable_builds` (§P3C.2, `coa_decision` per comp), `nearby_coa_builds_gfa_sqm` (M-65(6)) and the neighbourhood CoA rates. The drafted `nearby_coa_applications` is withdrawn. |
| 131 LC-52 (new) | Disclosure wording is plain: at most 45 words, and the by-law terms (GFA, FSI, established grade, CoA) are glossed in place. Locked by the template lint in `bylaw-maxbld-trace.infra.test.ts`. |

## DeepSeek lens, verified

**Accepted and fixed:**
- P-9: INV-11 stale.
- P-10: RD (8) is a storey exclusion, not GFA.
- P-13: 10.5.30.21(3) names detached forms only.
- P-14: the cite is §6.6, not §6.5.
- P-15: two names for the margin flag.
- M-206: the RS/RM wording.
- P-20: "the smaller cap binds".

**Rejected, with evidence:**
- P-1, 0.45 m as a bound. The 10.10.40.70(4) chapeau permits it for the house forms. Max build is the maximum lawful envelope, and the operator's default-smallest rule applies.
- P-2, chapeau unquoted. Quoted above.
- P-4, three names. The repo has one, `secondary_suite_share_reading`; `suite_interior_reading` returns 0 hits.
- P-5, houseplex denominator. A secondary suite sits in a house, not in a houseplex unit.
- P-11, applied or disclosed. "Applied, disclosed" is the M-211 form.
- P-17, garden suite area. The suite's footprint occupies the rear-yard area, so depth matters.
- P-19, displacement set. 150.7.60.20(2) and 150.8.60.20(2)/(3) verbatim displace 10.5.60.20(2),(3),(5),(6) only, so (4) binds.
- P-21, new data source. The detector reads parcel geometry already held.
- P-3 and P-6 are not defects. The register keeps "where it is observed / OWED" in its own column, and RT "unregulated" vs RM "not_applicable" mirror the clause text.

**Round 2 (run 20261019T004235Z-37c9a739, `.cursor/deepseek-fold5-r2.md`).**
- F-1 BLOCKER, accepted and fixed: the 10.20.40.10(8) disposition still called it a GFA exclusion. It now says storey exclusion.
- F-2 MAJOR, accepted: LC-52 is narrowed to the closed term list the lint enforces.
- F-4 and F-5 MINOR, accepted: the Obs wording now says "named, OWED".
- F-3 (`suite_openings_setback`, pre-existing LC-35 wording) and F-6 (a provenance tag) are left as they are.

**Noted, not changed (outside this fold):**
- P-24: `gain_reasons` has no check proving that the named limit actually bound. Goes to step commit ①.
- P-18: per-edge `lane_abutting_length_m` vs the per-class `lane_rear/side_length_m` sums. A naming note for the Spec 130 derivation lane.
- P-23: `entrance_height_m` target vs the `main_entrance_height` disclosure. For the evaluator lane.
