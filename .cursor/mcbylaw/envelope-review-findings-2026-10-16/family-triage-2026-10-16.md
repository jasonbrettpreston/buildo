# Residential zone chapters: family triage of the operator's envelope-review verdicts (2026-10-16), DRAFT

**Status.** DRAFT for the operator. Nothing here is ratified or applied. READ-ONLY run: no repo file was edited except this one,
there was no DB access and no git writes. Placeholder rows are MF-1..MF-4, and the orchestrator assigns M-ids from M-180.
**Inputs.** 497 verdicts (`envdb5/envreviews/*.json`). 277 of them are in the residential chapters: 10.20 RD 47, 10.40 RS 87,
10.60 RT 66, 10.80 RM 77 (34 RM verdicts are the 2026-10-15 paste that M-174 ruled on), and **10.10 R 0 (not reviewed)**.
Keyed units are resolved the way the gates read them: `agree.mjs checkAgree` over `authored.mjs loadAuthored(~/Buildo)` plus
`adjudications.json` with corrections, giving 623 residential units. Verbatim text is from `docs/reference/bylaw-provisions.json`.
Evaluator probes ran on `scripts/analysis/bylaw/evaluate.mjs effective()` with `vocab.mjs evaluatorVocab()` and synthetic lots,
with the generated `displaces[]` attached as the loader must (M-159 Q-K (D), 69a:257).
Citations: `68:` = `docs/specs/01-pipeline/68_mcbylaw_standard.md`, `69a:` = `…/69a_mcbylaw_register.md`.
**Operator directive applied:** "chapters 10.20, 10.40, 10.60 are almost identical … treat all the same provisions the same".
Every correction below names every zone copy, 10.10 and 10.80 included. **Standing rule M-176** (69a:276) means build more,
disclose how, and never assume a site fact.

**Warning on grouping.** The literal suffix match fails for x.40.1 and x.40.10: the same provision has different numbers in
different chapters. For example, townhouse unit width is R/RD/RS 40.1(4) but RT/RM 40.1(3); the 900 houseplex
"more permissive" clause is R/RD (7), RS (6), RT/RM (5); RT 40.10(2) is *storeys*, not main walls. Families below are therefore
grouped by **provision**, and each one lists its per-zone ids. The same suffix holding different text (e.g. x.20.100(12):
R/RM retail / public utility, RD/RS/RT secondary suite) is not a family.

## Summary counts

| | count |
|---|---|
| residential verdicts | 277: matches 118 · no_application 73 · wrong 37 · unsure 27 · disclose 19 · null 3 |
| provision families with ≥ 1 wrong / unsure / null / change-asking disclose | 24 |
| (a) keying correction (M-75 style, existing rule) | 4: F06, F08 (part), F10, F22 |
| (b) evaluator / scenario gap an existing row owns | 5: F01, F09, F13, F16, F21 |
| (c) needs a new ruling | 7 (+ F08 part): F02, F03, F04, F05, F11, F14, F19, served by **MF-1..MF-4** |
| (d) disclosure only (renovation / extension / site fact / accessory) | 5: F12, F15, F17, F20, F23 |
| no change (keying matches the text; operator question only) | 3: F07, F18, F24 |
| families where the zones' verdicts disagree on the same text | 11 (Operator questions) |
| defects measured on the evaluator (not only on the review page) | 3: F08 RD/RT `if`, F14/F19 `no_candidate`, F22 RM separation candidate |

**Top MaxBLD impact:** F19 FSI exemption, F11/F02/F03 Chapter 900 houseplex rules (on 77.1 % of residential lots, which carry
an exception, 68:378), F03/F08/F19 suite disjunct, F14 storeys, F08 coverage 45 %, F13 main walls, F06/F10 townhouse frontage
and width, and F22 separation.

---

## Families

### F01 · Suite pointers: RD/RS/RT 20.100(12) secondary, (16) laneway, (17) garden; RM 20.100(15)/(19)/(20); R 20.100(14)/(19)/(20)
- Text: the zones are identical except for the zone name ("A [suite] in the ZONE zone must comply with … Section 150.10 / 150.8 / 150.7").
- Verdicts: RD unsure ×3 ("Important - procedural"); RS unsure ×3 ("we have this already"); RT unsure ×3 ("This just states what we know from 150.10"). The **RM** copies are no_application, and **R** is not reviewed.
- Keyed: all copies are `INCLUDE` with `bt [secondary_suite]` and no measure. Status differs: RD `not_modelled` + disclosure, RS/RT/R/RM `informational`. This is an M-151 report-only difference (69a:245).
- **Class (b).** M-177 (69a:277) owns the suites, and (1)(b) brings the A axis and the P suite variants into P2-10. No new rule is needed. Recommend the verdict "matches" for all 15 copies.

### F02 · Chapter 900 houseplex lot requirements: x.30.1(1) (R, RD, RS, RT, RM)
- Text: identical except that **RD names the detached houseplex only (no (B) semi arm)**.
- Verdicts: RD (A) unsure; RS (A)/(B) matches; RT (A)/(B) unsure ("procedural"); RM (A)/(B) no_application. R is not reviewed.
- Keyed: PROCEDURAL with no target. R, RD and RT are `not_modelled` + disclosure ("we do not yet evaluate exception lot requirements"); RS and RM are `informational` with no disclosure. RD (A) also carries `detached_house` in bt.
- The effect is real. On an exception lot, the exception's **detached-house** lot rules apply to the detached-houseplex class. Today the evaluator reads an exception unit's `building_types` literally (`evaluate.mjs:395-399`), so a houseplex class never picks them up.
- **Class (c) → MF-1(1).** Meanwhile, apply M-151 alignment: RS/RM get R/RT's status and disclosure, and RD (A) bt → `[detached_houseplex]`.

### F03 · More-permissive lot coverage: x.30.1(2) (R, RD, RS, RT, RM)
- Text: identical except: RD omits the semi houseplex; **R cites "regulation 10.10.60.70(1)(C)"** (R has no x.30.40, ABS-1 at 68:354) where the others cite "clause x.30.40".
- Verdicts: RD null ("Important - impacts envelope"); RS wrong; RT wrong ("the more permissive regulation prevails … build bigger"); RM wrong ("the suite entitles the owner to more permissive maximum lot coverage … key for maxbld"). R is not reviewed.
- Keyed: PROCEDURAL, `bt [detached_houseplex, semi_detached_houseplex]` (RD detached only), `lc [has_secondary_suite]`. Status is mixed: R/RD `not_modelled`, RS/RM `informational`, RT `partially_modelled`. Nothing in `effective()` compares the layers.
- Reading: it compares the base 45 % (x.30.40(1)(D)) with the **Chapter 900 exception's** coverage and keeps the larger. Without an exception it changes nothing; F08 is the no-exception path.
- **Class (c) → MF-1(2)** for the layer comparison, and **MF-3** for the "residential building with a secondary suite" subject.

### F04 · Semi-detached 50 % minimum lot area: x.30.10(1)(B) (RS, RT, RM; not in R or RD)
- Text: identical except that **RM adds "or an apartment building"** to the two-lot arm.
- Verdicts: RS matches ("its just the minimum"); RT **wrong** ("only applies to a semi on two lots … disclosure. However for the [semi] houseplex the formula works … remove the semi detached build type"); RM **disclose** ("two lots … beyond our scope").
- Keyed: RS/RT are `modelled`, `bt [semi_detached_house, semi_detached_houseplex]`, `50 pct × label(a)`, so the two-lot arm binds the semi class. RM is `not_modelled` (M-174(1), 69a:274). **The three copies disagree.**
- 800.50(746)(B): a semi-detached houseplex is by definition "situated on two abutting lots". For the houseplex the per-lot 50 % is its own rule. For a semi-detached **house**, "on two lots" is a site fact (M-176(1) lists "two lots 10.80.30.10(1)(B)", 69a:276).
- **Class (c) → MF-2** (it amends M-174(1)'s note that the houseplex arm "stays disclosed").

### F05 · Semi-detached 50 % minimum lot frontage: x.30.20(1)(C) (RS, RM; RT and R have no such arm)
- Text: RS "(C) if a semi-detached house is on two lots …, and for a semi-detached houseplex, … 50 percent of the requirements cited in (A) and (B)". RM adds "or an apartment building".
- Verdicts: RS **wrong** ("needs two lots - we can't know that - disclosure … It does work for the semi detached houseplex"); RM **disclose** ("Condition two lots - we can never identify").
- Keyed: both are `UNUSUAL` / `not_modelled`, bt semi house (+ apartment for RM) + semi houseplex. They are consistent with each other, but the houseplex arm is not applied.
- (C) has **no "despite"**. As a separate min unit, rule 4a (68:343) would keep the larger (A)/(B) value, so the 50 % arm can only bind as a `by_type` arm inside (A)/(B) (68 §7.4, M-48 `other`).
- **Class (c) → MF-2(2).** RM's (B) names "an entire semi-detached house" (15.0 m) but not the semi houseplex. See Q10.

### F06 · Townhouse frontage per dwelling unit, 6.0 m less 1.0 m without an individual private driveway
Ids: R 30.20(1)(C)(ii); RD (C); RS (D); RT (C); RM (D).
- Text: RD/RS/RM are identical: "if a townhouse is located on a lot abutting a major street … (i) every unit fronting a street: (a) 6.0 m for each dwelling unit; (b) may be reduced by 1.0 m for each unit without an individual private driveway". **R and RT differ**: the reduction applies to the zone's own (A)/(B) per-unit value (label 'f' or 6.0 m), with no major-street limit.
- Verdicts: RD **wrong** ("6m per dwelling but 5m without a private driveway"); RS **wrong** ("=6m but 5m if the unit doesn't have a driveway"); RT **disclose** ("-1m for every dwelling without an individual private driveway"); RM **wrong** (same text). R is not reviewed.
- Keyed: every copy is `UNUSUAL` / `not_modelled` ("we do not know the driveway"). RT (A)/(B) are already `LIMIT … × dwelling_units`, which is the in-family precedent.
- Since M-176(1) (69a:276; vocab `design_choice_disclosure.default_overrides.no_individual_private_driveway.taken_as = true`) the driveway is known by rule: the answer is **5.0 m per unit**, with 6.0 m disclosed.
- **Class (a)**, M-75 corrections (rule cited: M-176(1), M-172(3), 69a:271; precedent 10.60.30.20(1)(A)/(B)). For **RD (C), RS (D), RM (D)**: archetype `LIMIT`, target `required_lot_frontage_m`, bound `min`, `numeric_expression ["required_lot_frontage_m = 6.0 m × dwelling_units @(1)(X)(i)(a) − 1.0 m × dwelling_units @(1)(X)(i)(b)"]`, condition tokens `[major_street, all_units_front_street, no_individual_private_driveway]`, status `partially_modelled` (the block's unit count is Layer 3, M-160 69a:258), disclosure "If each dwelling unit has an individual private driveway leading to its front: 6.0 m of frontage per unit."
- **R (C) and RT (C)** reduce their (A)/(B) arms and have no "despite". They must be re-keyed as a `by_type(townhouse: …)` arm of (A)/(B), with keyer A + B in the keying lane (the ADJ-2 precedent). See Q13.

### F07 · RM minimum frontage with no 'f' value: 10.80.30.20(1)(B)
- Verdict: RM **wrong**: "This only holds if there is no f on the map … (i) 12.0 m detached … (ii) 15.0 m semi … (iii) 24.0 m …".
- Keyed: `condition.if "not labelled(f)"`, `by_type(detached_house 12.0; detached_houseplex 12.0; semi_detached_house 15.0; non_residential_building 24.0)`. **This already matches the note.** The apartment arm (iii)(a) is out of MaxBLD scope.
- **No change.** See Q9 (the verdict probably reflects the review-page summary).

### F08 · Lot coverage (C) major street 50 % and (D) 45 % for a houseplex or a house with a secondary suite: x.30.40(1) (RD, RS, RT, RM; no R copy)
- Text: identical except that **RD (D) omits the semi houseplex** (RD permits none), RD has no "In the RD zone:" lead-in, and **RM (C) reads "despite (A) above"** (others "(A) and (B)").
- Verdicts: (C) RT **unsure** ("you forgot … secondary suite"; but (C)'s text is townhouse / apartment only, see Q7); (D) RD **wrong**, RS **wrong** ("it is keyed uses secondary suite - which is great - its just not in the summary"), RT **unsure**, RM matches.
- Keyed (D): `bt [houseplex types]`, `lc [overlay_mapped, has_secondary_suite]`, `uses [secondary_suite_use]`. `applies()` reads only `building_types` (`evaluate.mjs:394-399`), so the suite subject never matches → **MF-3**.
- **Measured defect (a):** RD and RT (D) carry `if "overlay(LC) < 45 pct"`, while RS/RM carry `"mapped(LC) and overlay(LC) < 45 pct"`. Probe: on a lot with no LC value, a houseplex answers **`not_evaluated:map_value_absent:LC`** in RD and RT, but `unregulated` (10.x.30.40(1)(B)) in RS and RM. Correction: `condition.if` of **10.20.30.40(1)#(1)(D)** and **10.60.30.40(1)#(1)(D)** → `"mapped(LC) and overlay(LC) < 45 pct"` (rule cited: M-151, 68 §6 condition).
- Probe also confirmed: with generated `displaces` attached, (D) drops (A) and a houseplex on LC 35 answers 45 in every zone. Without them it answers 35, which is why the loader must attach them (M-159 Q-K (D)).
- **Class (a) + (c) MF-3.**

### F09 · Buildings and dwelling units per lot: one residential building (R/RD/RS 40.1(2)); 'u' label (R (3), RD (5), RS (3), RT (2), RM (2))
- Text: identical within each family, except the 'u' clause in RT/RM is (2) and in R/RS (3) and RD (5).
- Verdicts: one-building: RD (A) unsure, (B) unsure; RS no_application ("doesn't apply to garden suites or laneway suites"). 'u': RD (5)(A) **unsure** ("Does this impact having a laneway or garden suite? Investigate"); RS matches; RT **wrong** ("if the RT zone only allows 1 dwelling … could affect lot configuration"); RM no_application.
- Keyed consistently: `dwelling_units_max = label(u)`, `target_not_main_envelope`. The permission effect is already a scenario-scan row ("A u-label below N makes N units not permitted", `.cursor/mcbylaw/phase3-prework/scenario-scan.md` l.81). The class vectors are M-160 (69a:258) and the permission test is M-168 (69a:266).
- **Class (b).** Whether suite units count toward 'u' is an M-177(4) / P2-10 item. See Q11.

### F10 · Townhouse minimum dwelling-unit width 5.0 / 6.0 m: R 40.1(4), RD 40.1(4), RS 40.1(4), RT 40.1(3), RM 40.1(3)
- Text: identical except that **RS limits it to a townhouse "on a lot abutting a major street"**.
- Verdicts: RD (A) **wrong** ("applies with this condition … we need a disclosure here"); RS (A) matches ("only if [no] … driveway"); RT (A) **disclose** ("the condition which you didn't capture … we need to disclose this"); RM (A) **unsure** ("if they don't it's 5M"); RM (B) matches ("take the max size 6M", the 10-15 paste, which M-176(1) supersedes).
- Keyed (A): R/RD/RT have condition **none**; RS has `[major_street]` but carries the *positive* `individual_private_driveway` in lot_conditions; RM has `[no_individual_private_driveway]` (COR 2026-10-15, M-173(2) → M-176(1)). (B) is `[individual_private_driveway]` everywhere.
- The answer is the same today (5.0 m, because (B) is off under `taken_as false`), but only RM attaches the M-172 "achieved if" disclosure. That is the RD / RT complaint.
- **Class (a)**, M-75 corrections (rule cited: M-173(2), M-176(1), M-151): condition `{tokens:[no_individual_private_driveway]}` and `application.lot_conditions [no_individual_private_driveway]` on **10.10.40.1(4)#(4)(A), 10.20.40.1(4)#(4)(A), 10.60.40.1(3)#(3)(A)**; RS **10.40.40.1(4)#(4)(A)** → tokens `[major_street, no_individual_private_driveway]`, dropping `individual_private_driveway` from lot_conditions. RM: none. `calculation_handling.gaps` cite M-176(1) on all five.

### F11 · Chapter 900 houseplex building requirements and "more permissive prevails"
Ids: applicable R (6), RD (6), RS (5), RT (4), RM (4); more-permissive R (7), RD (7), RS (6), RT (5), RM (5).
- Text: identical except for **the articles compared**. R: 40.10, 40.30, 40.40. RD/RS: 40.10, 40.20, 40.30, 40.40, 40.50. RT/RM: 40.10, 40.40. RD names the detached houseplex only.
- Verdicts: more-permissive RT **wrong** ("Important more permissive building requirement"), RM **wrong** ("houseplex gets special treatment and potentially bigger building envelope"), RS matches (its note is townhouse-width text pasted on the wrong unit, Q3), RD **null** ×2 ("procedural"). Applicable: RS (5) matches, RT/RM (4) no_application. R is not reviewed.
- Keyed: PROCEDURAL with no target. Status is mixed (`not_modelled` + disclosure in R/RD/RT; `informational` in RS/RM).
- Effect: on an exception lot a houseplex gets the exception's detached-house rule **or** the zone's houseplex rule (height max(HT, 10.0), FSI exemption, no storey cap), whichever is more permissive. Today rule 4 (68:337) lets the exception replace the base outright.
- **Class (c) → MF-1.**

### F12 · Bedrooms and their 26 June 2025 transition: R (8)/(9)/(10), RD (8)/(9)/(10), RS (7)/(8)/(9), RT (6)/(7)/(8), RM (6)/(7)/(8)
- Text: identical except that RD names the detached houseplex only.
- Verdicts: RS (7)(A)-(C) disclose (no note); RS (9)(A) unsure ("procedural"); all others no_application.
- Keyed: `bedrooms` (not an envelope target, 68:308); transitions are `existing(…)` / `not_modelled` (M-158 69a:256, M-39 cut-off).
- **Class (d).** No change. The bedroom cap is a Layer 3 report field on houseplex scenarios (68:308).

### F13 · Specified pairs of main walls: x.40.10(2)(A)/(B) and the (C) townhouse major-street disapply (R, RD, RS, RM; **RT has none**)
- Text differs by **subject**: R "a residential building, other than an apartment building"; RD/RS "a permitted residential building"; **RM "a detached house or a semi-detached house"**. (C): R names "townhouses" only; RD/RS/RM name "townhouses or apartment buildings".
- Verdicts: (A)/(B) RD matches / **unsure** ("Investigate"); RS matches ("assume the optimal height for maximum building envelope"); RM **wrong** ×2 ("just a disclosure note", **2026-10-15 paste, before M-176**). (C): RD unsure; RS **wrong** ("townhouses I believe are still important. key this one similar … focused on townhouses").
- Keyed: (A)/(B) `not_modelled` + the M-173(3) sentence in all four zones (RM bt detached/semi ✓). (C) is a DISAPPLY, `[major_street]`, with bt as in the text ✓.
- **Class (b):** M-176(2)/(3) (69a:276) owns this: main-wall height becomes an envelope limit in the Spec 78 / `enrich_parcels` max-build pass. That build must take the **per-zone subject** (RM: detached/semi only, so an RM houseplex or townhouse has no main-wall cap) and **(C)** (no cap for a townhouse on a major street) as declared data.
- **Q-MW3 answered** (`.cursor/mcbylaw/main-wall-height-envelope-2026-10-15.md` l.67): 10.60.40.10 has only (1) height and (2) storeys, so **RT has no main-wall rule**. It is not a keying gap.
- Related, unreviewed: **10.20.40.10(4)(A)** (RD flat or shallow roof: main walls max(7.2 m; h − 2.5 m)) is keyed `LIMIT`, `partially_modelled`, with condition **none**, but the text conditions it on a roof slope under 1:10 for more than 50 % (`roof_type`, a design choice under M-172(3)). PIN: fold it into the M-176(3) design (Q-MW1/2).

### F14 · Storey cap does not apply to houseplexes: R/RD/RS/RM 40.10(3)(C), RT 40.10(2)(C)
- Text: identical except that RD names the detached houseplex only. (D) "despite (A) to (B)" in RD/RM vs "(A) to (C)" in R/RS is immaterial.
- Verdicts: RS **wrong** ("for build type detached houseplex and semi-detached houseplex there is no max stories. This impacts the build size"); RT **wrong** ("No limit for them I guess"). R, RD and RM are not reviewed.
- Keyed: DISAPPLY with houseplex bt in all five, consistent; the generated `displaces` names (A).
- **Measured:** probe with ST 2: detached house → 2, houseplex → **`not_evaluated` `no_candidate`** in all five zones. Rule 7 (68:348) turns "no limit" into "not evaluated".
- **Class (c) → MF-4.** The live `enrich_parcels` max-build reads `bylaw_max_stories` building-type-blind (`scripts/lib/compute/enrich-parcels.js:542, 660-662`). PIN: that is a Spec 78 change and rides a fleet night.

### F15 · Main pedestrian entrance height and flat-roof upper walls: entrance R (6), RD (6), RS (4), RM (4); flat roof RS (6), RM (6) [RD (4) differs]
- Text: entrance is the same 1.2 m everywhere. Subject: R and RM "detached house or a semi-detached house"; RD and RS "residential building"; RS says "a pedestrian entrance", not "main".
- Verdicts: RM (4) disclose ("just the entrance - this is a disclosure note"); RS (6)(A) **unsure** ("only applies to … flat or shallow roof … design disclosure").
- Keyed: entrance is `not_modelled` (M-174(2), 69a:274, all four listed); flat-roof (6)(A) is a PERMIT, `not_modelled`, with disclosure.
- **Class (d):** M-174(2) and M-172(3) (`roof_type`, a design choice). No change.

### F16 · Dormer walls are not main walls: R (5), RD (7), RS (5), RM (5) [RD (5) is the parapet rule]
- Text: identical except that **RM's subject is "detached house or a semi-detached house"**.
- Verdicts: RS (5)(A) **unsure**, (5)(B) **wrong** ("need to investigate if this impacts build envelope. I would imagine you don't want them to count as main walls"); RM (5)(B) disclose.
- Keyed: (A) DEFINE, (B) DEFINE `element_width_pct = 40 pct` in all four ✓.
- **Class (b):** M-174(3) and M-176(3) (69a:276): "the design chooses the dormers, so the maximum takes the 40 %". This is exactly the operator's instinct. It lands with the main-wall change (Q-MW2).

### F17 · One-storey extension beyond building length: x.40.20(2) (RD, RS, RM)
- Text: **RD differs**: required frontage "more than 12.0 m to 18.0 m", detached house only. RS and RM: "more than 12.0 metres", detached or semi.
- Verdicts: RS (A)-(C) **unsure** ("should be defined as renovation or extension not max build"); RM (A)-(C) disclose ("Renovation or expanding the envelope").
- Keyed: `UNUSUAL` / `not_modelled` + disclosure in every copy (M-102/M-130 extended part only; Q-K (C) in M-159 at 69a:257).
- **Class (d).** No change. PIN: a "renovation / extension" answer section is product scope, not a by-law ruling.

### F18 · Townhouse / apartment building length on a major street: x.40.20(4) (RD, RS)
- Text: identical, **except that RS's own text says "Despite regulation 10.20.40.20(1)"**. This is a City cross-chapter citation in the RS clause and should be checked as an amendment or consolidation slip (M-39 route).
- Verdict: RS (A) **wrong**: "for both apartment building and townhouse". Keyed (A) townhouse 19.0 m, (B) apartment 25.0 m, which matches the text.
- **No change.** See Q8. PIN: the RS citation of 10.20 goes to the M-39 enacting check.

### F19 · FSI exemptions: x.40.40(1)(C) houseplex or suite, (D) townhouse / apartment ≤ 60 units on a major street (R, RD, RS, RT, RM)
- Text: identical except: **R (B) defaults to 0.6** (others "not limited", `unlimited`); RD (C) omits the semi houseplex.
- Verdicts: RS (C) **wrong** ("FSI doesn't apply to … a residential building with a secondary suite. Definitely affects building envelope"); RT (C) **wrong** ("especially important is the detached house with a secondary suite"); RS (D) **wrong**; RT (D) **wrong** ("doesn't apply to townhouse … over 60 units", but the text says "**60 dwelling units or less**", see Q6); RM (C)/(D) **no_application**, which disagrees with RS/RT on the same text.
- Keyed: (C) DISAPPLY, houseplex bt, `lc [has_secondary_suite]`; (D) DISAPPLY `[major_street, unit_count_band] if dwelling_units ≤ 60`. Consistent in all five.
- **Measured:** label d 0.6: detached house → 0.6, houseplex → **`no_candidate`** in all five zones (as F14).
- **Class (c) → MF-4** (an exemption must answer "no FSI cap") **+ MF-3** (the suite subject). PIN: `enrich_parcels` takes `fsi_cap` building-type-blind (`enrich-parcels.js:701, 773`); fleet night.

### F20 · Upper-storey platforms (decks, balconies): x.40.50(1)/(2)/(3) (RD, RS, RM; R (1) is the enclosed-platform rule)
- Verdicts: RS disclose ×3 ("Not important - Decks- platforms etc."); RM no_application.
- Keyed: `uses [deck_or_platform]`, so M-159(2)/M-175 (69a:257, 275) already set them aside from the principal building.
- **Class (d).** No change. The two zones' verdicts mean the same thing.

### F21 · Rear yard is the greater of 7.5 m or 25 % of lot depth: x.40.70(2) (RD, RS, RM; **R and RT are a flat 7.5 m**)
- Verdicts: RS (A)/(B) **wrong**; RM (A)/(B) **wrong** ("This needs to calculate the greater of A or B"); RT (flat) matches. RD is not reviewed.
- Keyed: two min `LIMIT` leaves (7.5 m; `25 pct × lot_depth_m`) in RD/RS/RM, consistent. Rule 4a takes the larger, which is the greater-of, so the evaluator answer is right.
- **Class (b):** M-174(5) (69a:274): no keying change. Owed: the P2-0 red vector (depth 40 m → 10.0 m; 20 m → 7.5 m) and the review page showing the combined answer beside the split leaves.

### F22 · Separation between residential buildings on the same lot: x.40.80(2) (R, RD, RS: major-street townhouse / apartment; RT, RM: any 2+ residential buildings)
- Text: R/RD/RS identical (5.5 m / 11.0 m). **RT differs**: front / rear walls, plus (C) 2.4 m between side main walls. RM has the general form.
- Verdicts: RS **wrong** ×2 ("buildings on the same lot"); RT **wrong** ×3 ("only applies if two or more buildings … disclosure … maybe important for … the garden suite or laneway suite"); RM **wrong** ×2 ("No important for us").
- Keyed: RD and RT are `not_modelled` + disclosure ✓; **R, RS and RM are `partially_modelled`**. RM has condition none and bt any, so RM (A) 5.5 m and (B) 11.0 m are separation_m candidates on every RM lot. A single-building lot cannot test the scope "two or more buildings".
- **Class (a)**, M-75 corrections (rule cited: M-149 at 69a:243 for an untestable scope; M-172(3)/M-174(1) restrictive arms disclosed). Status → `not_modelled`, scope in `gaps`, closed disclosure "If the lot has two or more residential buildings: their main walls must be at least 5.5 m apart, or 11.0 m where each wall has an opening to a dwelling unit". Apply to **10.80.40.80(2)#(2)(A),(B)**, **10.40.40.80(2)#(2)(A),(B)** and **10.10.40.80(2)#(2)(A),(B)**, with "townhouses or apartment buildings on a lot abutting a major street" in the R/RS sentence. Add the same disclosure (plus "2.4 m between side main walls") to **10.60.40.80(2)#(2)(A)-(C)**. RD is unchanged.
- The suite question (RT note): suite-to-house separation is 150.7.60.30(1) / 150.8.60.30(1) under M-177(2). See Q12.

### F23 · Lawfully existing separation and additions: x.40.81(1)/(2) (R, RT, RM)
- Verdicts: RT/RM disclose ×4 ("Grandfathering existing structures"; "for renovations").
- Keyed: `existing(…)` / REQUIRE with `[lawfully_existing]`, `not_modelled`, with disclosure.
- **Class (d):** M-158 (69a:256). No change.

### F24 · Procedural, no change: RD 40.1(1) unsure ("procedural"); RS 40.1(9)(A) unsure ("procedural")
- The keying is informational in every zone. The verdicts ask for nothing. Recommend the verdict "matches".

**Out-of-scope PINs (one line each).**
- PIN-1: the review page's `plain` text repeats "minimum" ("The minimum required minimum lot area …", 15+ units in `envrev-page/envrev-base.json`). It needs a page-generator fix (the generator is not in the repo), not a ruling.
- PIN-2: `enrich_parcels` max-build is building-type-blind on FSI / storeys / coverage (`enrich-parcels.js:542, 701, 773`). Houseplex and suite answers need Spec 78 + an `enrich_parcels` change under Specs 122/124 on a fleet night.
- PIN-3: a renovation / extension answer section (F17, F23, the RS 40.20(2) notes) is product scope.
- PIN-4: the RS clause 10.40.40.20(4) cites "regulation 10.20.40.20(1)" → M-39 enacting-text check.
- PIN-5: RD 10.20.40.10(4)(A) flat-roof main wall has condition none → the M-176(3) main-wall design.

---

## Proposed register rows (DRAFT, placeholder ids; next free M-180)

| **MF-1** | **Chapter 900 exceptions and houseplexes: the detached-house substitution and "more permissive prevails" (operator 2026-10-16, envelope review; verdicts on x.30.1(1)/(2) and x.40.1 R (6)/(7), RD (6)/(7), RS (5)/(6), RT (4)/(5), RM (4)/(5)).** Operator, verbatim: *"the more permissive regulation prevails - this is the benefit of additional housing units. build bigger"*; *"houseplex gets special treatment and potentially bigger building envelope"*.<br>**(1) Substitution.** Where a lot's exception (or its INCLUDE closure) has a unit for a **detached house** (or a **semi-detached house**) on lot requirements (x.30.1(1)) or principal-building requirements (the x.40.1 "Applicable" clause), that unit also applies to the **detached houseplex** (or **semi-detached houseplex**) class. A declared `vocab.exception_type_alias` (`detached_house → detached_houseplex`, `semi_detached_house → semi_detached_houseplex`) is read by `applies()` for exception-layer units only, on the houseplex classes named by the zone's clause (RD: detached only). "Only residential building on the lot" is the new-build default (x.40.1(2)(A); M-158).<br>**(2) More permissive prevails.** For those classes, and on the targets of the articles the zone's clause names (R: 40.10, 40.30, 40.40; RD/RS: 40.10–40.50; RT/RM: 40.10, 40.40; coverage: x.30.40, with R's coverage clause at 10.10.60.70(1)(C) for the houseplex **and** suite classes, x.30.1(2)), rule 4 between the base and exception layers returns **the more permissive** of the two (max bound: larger; min bound: smaller). This is the form 68:337-341 already gives a provincial unit (M-55). The PROCEDURAL units carry it as declared data: `ranks_layers` value `more_permissive: exception, base`, with the article list in `application`, never an id in code.<br>**(3) Disclosure:** "On this exception lot the {measure} is {value} from {clause}: the zone's houseplex rule is more permissive than the exception's detached-house rule ({other value})."<br>**QA lenses.** Reality-Check: exceptions are authored (`authored/ch900_1..6`); 77.1 % of residential lots carry one (68:378), and RS/RT/RM's houseplex height max(HT, 10.0) vs a typical exception height is the live case. Regression Guardian: only the houseplex classes (plus suites for coverage) on exception lots move; detached-house answers and M-38/M-49 fixtures are unchanged; G-EVAL exception vectors re-run. Cross-read Adversary: the comparison is per target and bound direction, never "whole exception vs whole zone"; where the exception has no unit on the target, rule 6 already applies the base, so (2) is idle.<br>**Compliance (one line each):** **68** §7.5 rule 4 (a declared layer ranking, as 68:337-341), §6 `application`. **69 / 69a**: M-34 / M-38 / M-49 (layer ranking; displacement unchanged), M-55 (the "more permissive of the two" form reused), M-151 (the five zones key alike), M-158 (only-building default), M-160 (classes). **122 / 122a** N/A. **124 / 124a**: declared vocab and unit data, evaluator branch at the P2-0 seat (R-BZ, 124:240). **128**: surface text. **129**: oracle C compares base limits; an exception notice for a houseplex is `exception_cited`. **Five words:** ACCURATE, the houseplex keeps the zone's bonuses on an exception lot as the by-law says; OBSERVABLE, the losing value is disclosed; STANDARDIZED, one layer rule from data; SCALABLE, no per-lot input; UNDERSTANDABLE, "the more permissive rule applies". | Five zones say "the more permissive regulation prevails" and 77 % of lots carry an exception. Today rule 4 lets the exception win outright. | vocab `exception_type_alias`; PROCEDURAL units' `ranks_layers` (M-75 corrections, 15 units); `effective()` rule 4 branch + fixture (P2-0 seat) | DRAFT 2026-10-16 |

| **MF-2** | **The semi-detached houseplex's 50 % lot area and frontage apply; the semi-detached house on two lots stays a disclosed site fact (operator 2026-10-16; verdicts 10.60.30.10(1)(B), 10.40.30.20(1)(C); amends the M-174(1) note).** Operator, verbatim: *"this only applied to a semi detached [house] on two lots … disclosure. However, for the [semi-detached houseplex] the formula works. Do need to remove the semi detached build type here."*<br>**(1) Basis.** 800.50(746)(B): a semi-detached houseplex's "entire building is situated on two abutting lots". For that class the per-lot 50 % is its own requirement, not a lot-division choice. For a semi-detached **house** (and an RM apartment building), "on two lots" stays a site fact (M-176(1) lists it, 69a:276) with the M-174(1) sentence.<br>**(2) Lot area,** x.30.10(1)(B) RS/RT/RM: `building_types [semi_detached_houseplex]`, status `modelled`, `50 pct × label(a)` unchanged; disclosure "If the semi-detached house [or apartment building] is divided onto two lots: each lot's minimum lot area is 50 % of the 'a' value."<br>**(3) Frontage,** x.30.20(1)(C) RS/RM, has no "despite", so a separate min unit loses under rule 4a. It is keyed as a `by_type(semi_detached_houseplex: 50 pct × … @(1)(C); other: …)` arm inside (A) and (B) (68 §7.4, M-48 `other`), re-keyed by keyer A + B. (C) stays `not_modelled` with the two-lot disclosure for the house. RM (B) names no semi-houseplex arm (Q10).<br>**QA lenses.** Reality-Check: the RS/RT area units already answer 50 % today, for the semi house as well, so (2) narrows them; RM moves from not_modelled to modelled. Regression Guardian: semi-detached house answers lose the 50 % (correctly, a site fact) and gain a disclosure; no other class moves. Cross-read Adversary: "for each lot" on a one-lot reading would halve the requirement on a single lot, but the definition rules the one-lot reading out.<br>**Compliance:** **68** §7.4 (`by_type`), §7.5 rule 4a (why frontage is an arm), §6 `disclosure`. **69a** M-174(1) (note amended for the houseplex arm only), M-176(1) (site fact kept), M-75, M-151 (RS/RT/RM alike), M-48. **122 / 122a** N/A. **124 / 124a**: data (R-BZ). **128**: surface text. **129** unchanged. **Five words:** ACCURATE, the houseplex gets its halved lot minimum and the house does not assume a split; OBSERVABLE, the two-lot sentence; STANDARDIZED, one reading in three zones; SCALABLE, data; UNDERSTANDABLE, "each lot needs half". | The three zone copies are keyed three ways (RS/RT modelled for the house too; RM not modelled at all). | M-75 corrections (area: 3 units); keyer A + B re-key (frontage: RS/RM (A)/(B)) | DRAFT 2026-10-16 |

| **MF-3** | **"A residential building with a secondary suite" matches the suite class (operator 2026-10-16; verdicts on x.30.40(1)(D), x.40.40(1)(C), x.30.1(2): "we always need to include this building type"; applies M-177(1)(b), (4)).**<br>**(1) Rule.** Every unit whose clause names "a residential building with a secondary suite" carries `secondary_suite` in `application.building_types` (the type exists in vocab, structure suite; the 10.x.20.100 suite INCLUDEs already use it). `applies()` matches a `secondary_suite` entry when the class vector has `has_secondary_suite = 1` (M-177(4)), whatever its principal type. 800.50(181)(F) / (746)(F) ("a … house … that has one or more secondary suites is not a … houseplex") keep it a separate class, never folded into the houseplex.<br>**(2) Units (M-75 corrections, all zone copies):** x.30.40(1)(D) RD/RS/RT/RM; x.40.40(1)(C) R/RD/RS/RT/RM; x.30.1(2) R/RD/RS/RT/RM; R's 10.10.60.70(1)(C) if its text names the suite (to confirm in the keying lane).<br>**(3) Build-more.** `has_secondary_suite` is a design choice (M-172(3)). The detached + suite answer carries "FSI does not apply / coverage 45 % is achieved if: the house has a secondary suite."<br>**QA lenses.** Reality-Check: today `applies()` reads only `building_types` (`evaluate.mjs:394-399`), so the suite arm is dead in every zone (measured by reading; no suite class exists yet). Regression Guardian: M-50's all-types-agree runs over `building_type_residential`, which excludes structure `suite`, so a unit's extra type changes no type-unknown answer; it is inert until the P2-10 suite class lands. Cross-read Adversary: "with a secondary suite" must not match a houseplex that happens to have a suite (definition (F) says such a building is not a houseplex), which the class vector settles.<br>**Compliance:** **68** §6 `application.building_types` (clause evidence "with a secondary suite"), §7.5 rule 1. **69a** M-177(1)(b)/(4) (the class it matches), M-172(3) (design choice disclosed), M-50 (unchanged), M-151, M-75. **122 / 122a** N/A. **124 / 124a**: data plus a pure `applies()` read (R-BZ). **128**: surface text. **129** unchanged. **Five words:** ACCURATE, the suite bonuses reach the suite scenario; OBSERVABLE, the achieved-if line; STANDARDIZED, one type token; SCALABLE, data; UNDERSTANDABLE, "with a secondary suite, FSI does not apply". | Operator: "it is keyed uses secondary suite - which is great - its just not in the summary". The use token is not read by applicability, so the summary is right that the arm does nothing. | M-75 corrections (~14 units); `applies()` suite match + test (P2-10 with M-177(1)(b)) | DRAFT 2026-10-16 |

| **MF-4** | **An exemption that removes every candidate answers "does not apply", never "not evaluated" (operator 2026-10-16; verdicts on x.40.40(1)(C)/(D) and x.40.10(3)(C) / 10.60.40.10(2)(C); dated note on M-154).**<br>**(1) Rule.** When rule 2 (68:330) drops every candidate for a target because an applicable DISAPPLY names them, the result is M-154's `not_applicable:<DISAPPLY clause>` (69a:250), the same answer as "every applicability test decided false". It is not rule 7's `not_evaluated:no_candidate` (68:348).<br>**(2) Layer 3** reads `not_applicable` as no cap: `regulated(<target>)` (68:314) is false for it, as for `unregulated` / `unlimited`. A houseplex's GFA is footprint × storeys with no FSI cap, and its storeys follow height alone.<br>**Measured** (`effective()` probe, generated `displaces` attached): label d 0.6 → detached house 0.6, houseplex `no_candidate` in R, RD, RS, RT and RM; ST 2 → detached 2, houseplex `no_candidate` in all five.<br>**QA lenses.** Reality-Check: the probe reproduces the defect in all ten zone copies. Regression Guardian: only targets fully displaced by a DISAPPLY change status; a `no_candidate` with no displacement keeps M-154 / rule 7; K7-R class maps take the new reason as M-154 already does. Cross-read Adversary: a DISAPPLY with an undecided condition (e.g. (D) `dwelling_units ≤ 60` on an unresolved count) stays undecided under the M-60 combination rule, never `not_applicable`.<br>**Compliance:** **68** §7.5 rules 2 / 7 (rule 7 narrowed by this note), §7.4 `regulated()`, §11.1 (Layer 3 reads it). **69a** M-154 (dated note), M-48 (displacement), M-60 (undecided combinations), M-64 (field status). **122 / 122a** N/A. **124 / 124a**: pure evaluator change (R-BZ). **128**: "FSI: does not apply (10.x.40.40(1)(C))". **129** unchanged. **Five words:** ACCURATE, "no limit" is an answer; OBSERVABLE, the clause is cited; STANDARDIZED, one status for "does not apply"; SCALABLE, no data; UNDERSTANDABLE, "does not apply to a houseplex". | The by-law's largest houseplex bonuses (no FSI, no storey cap) surface today as "not evaluated", in every residential zone. | `effective()` rule 2/7 + `regulated()`; red vectors (houseplex FSI, houseplex storeys) at the P2-0 seat | DRAFT 2026-10-16 |

---

## Operator questions (one recommendation each)

| # | anomaly | recommendation |
|---|---|---|
| Q1 | **Null verdicts with a note** (residential): 10.20.30.1(2) "Important - impacts envelope"; 10.20.40.1(6)(A) and 10.20.40.1(7) "procedural". Others: 10.5.30.11(1), 10.5.30.40(1), 10.5.30.41(1), 10.5.40.10(4)(B) (10-15, ruled by M-169/M-158), 150.7.60.50(5), 150.8.60.20(2)(B), 150.8.60.40(2), 150.8.60.40(3)(D) | Record the three RD ones as **wrong → MF-1** (same as their RT/RM twins). Leave the 10.5 ones as ruled. Ask the operator for a verdict on the four suite notes, or let them ride the M-177 lane. |
| Q2 | **Stray note on 150.7.60.40(6)(B)** (verdict disclose): the note text is a shell command ("! cd ~/Buildo && git push origin wf2/…"). | Paste debris: discard the note and keep "disclose" only if the operator confirms. The text is data; nothing was run. |
| Q3 | 10.40.40.1(6) (more-permissive building req.) "matches" carries townhouse-width text ("5.0 metres if … no individual private driveway") | Misplaced paste: re-read as **wrong**, like RT/RM (5) (MF-1). |
| Q4 | **Townhouse width disagrees:** RD 40.1(4)(A) wrong, RS (4)(A) matches, RT (3)(A) disclose, RM (3)(A) unsure, RM (3)(B) matches "take 6M" (10-15) | One answer under M-176(1): 5.0 m with 6.0 m disclosed, F10 corrections in all five zones. RM (3)(B)'s note is superseded. |
| Q5 | **Main walls disagree:** RM (2)(A)/(B) wrong "just a disclosure note" (10-15 paste) vs RS "assume the optimal height", RD "investigate" | Confirm that M-176(2) (10-15, later the same day) supersedes the RM notes. |
| Q6 | **FSI disagrees:** RS/RT (C)/(D) wrong vs RM (C)/(D) no_application (same text). RT (D) note says "over 60 units"; the text says "60 dwelling units or less" | Treat RM as RS/RT (MF-3/MF-4). Keying `≤ 60` matches the text, so confirm the reading. |
| Q7 | 10.60.30.40(1)(C) unsure: "you forgot … a residential building with a secondary suite" | (C) names only townhouse / apartment on a major street: **no change**. The suite subject is in (D) (MF-3). |
| Q8 | 10.40.40.20(4)(A) wrong: "for both apartment building and townhouse" | (A) is the townhouse 19.0 m and (B) is the apartment 25.0 m, a separate unit: **no change**. |
| Q9 | 10.80.30.20(1)(B) wrong: "only holds if there is no f" | Already keyed `not labelled(f)`: re-read as **matches**. |
| Q10 | RM 30.20(1)(B) (no 'f') names "an entire semi-detached house" 15.0 m but no semi-detached houseplex. What frontage does MF-2's 50 % halve? | Take 15.0 m (the entire semi building), so 7.5 m per lot, and disclose. Needs an operator yes. |
| Q11 | **'u' label disagrees:** RD (5)(A) unsure "does this impact having a laneway or garden suite?", RS matches, RT wrong, RM no_application | One reading: 'u' caps a class's dwelling units (scenario-scan l.81). Whether a suite's unit counts toward 'u' is decided with M-177(4) at P2-10. |
| Q12 | RT x.40.80(2) note: does building-to-building separation govern the garden / laneway suite? | Use the suite chapters' own separation (150.7.60.30(1) / 150.8.60.30(1), M-177(2)). x.40.80(2) stays a disclosed multi-building rule (F22). |
| Q13 | R and RT townhouse frontage reduction (F06) has no "despite" | Re-key R/RT (A)/(B) with a `by_type(townhouse: (… − 1.0 m) × dwelling_units)` arm, keyer A + B. Same answer as RD/RS/RM. |
| Q14 | **Suite pointers disagree:** RD/RS/RT unsure vs RM no_application (identical text) | All "matches" (INCLUDE; M-177 owns). |
| Q15 | **x.30.1(1) and the semi 50 % disagree** across zones (matches / unsure / wrong / disclose) | Settle them by MF-1 and MF-2. Each draft treats every zone copy the same. |
