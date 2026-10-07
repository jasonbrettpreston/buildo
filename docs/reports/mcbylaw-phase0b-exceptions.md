# McBYLAW Phase 0b: Ch.900 exception archetype probe (+ standard-regulation extension)

Date: 2026-10-06. This was READ-ONLY research. Nothing was changed in `src/`, `scripts/` or `migrations/`, and nothing was written to the DB. The SQL was read-only (`SET default_transaction_read_only = on`). Probe code and outputs are in `.cursor/mcbylaw/phase0b/`.
Evidence tags: **[measured]** means a script computed it. **[read]** means I read it in the by-law text or the spec. **[inferred]** means it is my reasoning and has not been executed.

## 0. Headline

| | Result |
|---|---|
| Is the provisional 12-member single-label `archetype` set (Spec 68 v0.3, M-30) good enough? | **No.** Only **54.5 % of lots** in the ≥ 100-lot exceptions (and 57.5 % in wave 1) sit in exceptions whose clauses all fit it. Only **70.2 %** of in-scope standard regulations fit it **[measured]**. Two shapes are missing: EXISTING value ("that which existed on the day of enactment", 19 % of clauses) and non-numeric REQUIRE ("the required parking space must be located in a building", 5 %). |
| Do the members overlap? | **Yes, so a single label is ambiguous.** 23.3 % of exception clauses and **71.7 %** of standard-regulation clauses match ≥ 2 of the shape archetypes (BRANCH+LIMIT, CONDITIONAL+LIMIT, OVERRIDE+PROHIBITION …) **[measured]**. With a single label, the precedence order decides the label, so two blind drafters (M-17) would disagree by construction **[inferred]**. |
| Recommended fix | Split the 12-set into two parts. **(1)** A closed **`archetype`** for what the clause *does*: 10 members, merged with v0.2's `provision_kind`. **(2)** **`value_form`**, which is *derived* from the parsed DSL expression rather than authored. TIERED_TABLE, FORMULA, BRANCH and CONDITIONAL are already DSL forms (`band`, `max/min`, keyed-by-type, `if`). OVERRIDE becomes a `displaces[]` qualifier. Under this design: **97.7 %** of ≥ 100-lot exception lots fully classify (**98.1 %** in wave 1), and **95.2 %** of standard regulations do, with 3.0 % of standard clauses and 1.0 % of exception clauses UNUSUAL **[measured, mechanical draft]**. |
| Mechanical classifier precision (hand-checked samples) | Exceptions: about **90 %** (n = 60, wave 1). Standard regulations: about **77 %** (n = 35) **[measured by reading the samples]**. The regex is therefore a **pre-sorter / third opinion, never the authority**. The fit percentages above come from that same classifier, so treat them as **±10 points**. |
| Plan-changing findings | (a) **Included "library" exceptions have 0 direct lots.** RD 1462 is pulled in by 557 exceptions (38,512 lots), RS 336 by 123 exceptions (8,249 lots) and RT 352 by 47 exceptions (2,323 lots). They carry the **FSI cap** (lot-area bands of "lesser of 0.6 × lot area or 204 m²" …). A direct-lot threshold drops them **[measured]**. (b) **"Despite regulation X" is rare.** Only 85 / 2,380 (3.6 %) of SSP clauses say "Despite" or "does not apply" **[measured]**. About 80 % are bare LIMITs that override *implicitly* under 900.1.10(3) **[read]**. Override binding must therefore be keyed on the **DSL target variable**, not on a cited regulation id. (c) **R −1 is not an exception.** It is a sentinel on `R (d0.6)` labels with no `x` (4,527 lots). The true set is **515 exceptions = 88.6 %** of excepted lots, not 516 / 88.8 % **[measured]**. (d) **PREVAILING is large.** 65.6 % of ≥ 100-set lots are in an exception that cites a former by-law, and 13.3 % are prevailing-only. It can only be disclosed **[measured]**. |

## 1. Ranking and keying (step 1)

- **Key = (zone category, number) → `900.<k>.10(<n>)`**, with k = 2 R · 3 RD · 4 RS · 5 RT · 6 RM. Numbers repeat across zones with different text: RD 5 = 1.8 m side yard, while RS 5 = former Etobicoke by-law 1980-208 **[read]**. `parcels.bylaw_exception_ref` already stores this key, and 0 mismatches against `zoning_class` + `exception_number` **[measured]**. A zone label never carries two `x` numbers (0 multi-x labels in 440,094) **[measured]**. 364 excepted parcels have `zoning_is_ambiguous` **[measured]**.
- **Residential parcels:** 440,094. 339,125 carry a real exception (2,893 zone+exception pairs) and 96,442 have none. R −1 (4,527) is a sentinel **[measured]**.
- **≥ 100 lots:** **515 exceptions / 300,616 lots = 88.6 %**. Wave 1 (top 220) = **253,503 lots = 74.8 %**. Wave 2 = 295 exceptions / 47,113 lots **[measured]**.
- **Every ranked exception slices from the page.** 3,015 headings are sliced (R 574 · RD 1,313 · RS 317 · RT 363 · RM 448) and 0 of the 515 are missing **[measured]**.

## 2. Fetch and provenance (step 2)

- I re-fetched `ZBL_NewProvision_Chapter900_{1..6}.htm` at **2026-10-06T19:10:22Z** (all HTTP 200). They are byte-identical (sha256) to the Phase 0 copies.
- `norm.js` (latin1) reproduces the Phase 0 `.txt` exactly.
- The consolidation is "Version Date: July 31, 2024, including City-wide Amendments up to April 30, 2026" **[measured]**. Provenance is recorded in `phase0b/manifest.json`: URL, explicit fetched_at, raw + normalized sha256, normalizer and consolidation string.
- Every exception has the formulaic lead, then `Site Specific Provisions:` (SSP) and `Prevailing By-laws and Prevailing Sections:` (PBS). Six text variants had to be tolerated (`.`/`:`/`;`, `Site-Specific`, `Bylaws`, `Section` singular, a missing SSP header in 2 cases, `None Apply` without brackets). Each exception's text sha256 is recorded in the census.

## 3. Fit metrics (step 3): exceptions, ≥ 100-lot set

| Metric | Wave 1 (220) | Wave 2 (295) | All ≥ 100 (515) |
|---|---|---|---|
| Clauses (SSP / PBS) | 1,323 (897 / 426) | 1,744 (1,483 / 261) | 3,067 (2,380 / 687) |
| Clauses per exception (mean; max) | 6.0; 37 | 5.9; 28 | 6.0; 37 |
| Prevailing-only exceptions (SSP = None) | 32 | 34 | 66 (40,099 lots, 13.3 %) |
| **Lots fully classified, 12-set single label** | **57.5 %** | 38.3 % | **54.5 %** |
| Lots fully classified, 12-set + EXISTING + REQUIRE | 98.2 % | 97.0 % | 98.0 % |
| **Lots fully classified, recommended faceted set** | **98.1 %** | 95.1 % | **97.7 %** (499 / 515 exceptions) |
| SSP clauses with "Despite" / "does not apply" | 52 | 33 | 85 (3.6 %) |
| Despite targets resolving to a Phase 0 universe id | 64 / 66 | 31 / 31 | **95 / 97** (81 regulation, 6 article, 8 section-prefix). The 2 unresolved: `230.5.10.1` (Ch.230 bicycle parking, not fetched) and `10.5.40.601` (a source typo) **[measured]** |
| SSP clauses with a numeric literal + unit | 63.1 % | 56.8 % | 59.2 % (2,009 literals) |

**SSP clause archetype share (all ≥ 100, faceted):** LIMIT 80.2 · INCLUDE 7.6 · REQUIRE 5.1 · PROHIBIT 3.2 · PERMIT 2.0 · UNUSUAL 1.0 · DEFINE 0.3 · DISAPPLY 0.2 · other 0.4 %.

**`value_form` of SSP clauses:** literal 51.5 % · **existing 19.2 %** · none 17.6 % · by_building_type 9.7 % · formula 1.6 % · band 0.4 % · map_lookup 0.1 %.

**12-set single-label share (SSP):** LIMIT 45.3 · *EXISTING_VALUE 19.1* · BRANCH 7.6 · CROSS_REFERENCE 7.6 · CONDITIONAL 5.9 · *REQUIREMENT 5.1* · OVERRIDE 3.3 · PROHIBITION 1.6 · PERMISSION 1.6 · FORMULA 1.5 · UNUSUAL 0.6 · TIERED 0.4 · DEFINITION 0.2 %. The italic labels are not in the 12-set.

**Residual UNUSUAL shapes (24 clauses).** Most are classifier misses rather than new shapes. Examples: "the maximum lot coverage permitted for … is", "no lot may be created that …", "the lot is comprised of those [registered-plan lots]", "maximum number of units applies to …". **No third new archetype is warranted.** The two new ones (EXISTING as a value form, REQUIRE as an archetype) cover 24 % of SSP clauses **[measured]**.

## 4. Fit metrics: standard regulations (operator extension)

These figures cover the 420 in-scope Phase 0 regulations (envelope + existing-building in Ch.5.10, 10.5, 10.10–10.80, 150.7/8/10, 200.5 and 900.1). The regulations were split into 877 clauses (stem + (A)(B)…) and run through the same classifier.

| Metric | Value |
|---|---|
| Clause archetype share (faceted) | LIMIT 62.9 · PERMIT 9.8 · REQUIRE 6.6 · REFERENCE/INCLUDE 4.4 · DEFINE 4.2 · DISAPPLY 4.1 · PROHIBIT 3.8 · **UNUSUAL 3.0** · PREVAILING 1.0 % |
| `value_form` | by_building_type 35.8 · literal 19.7 · none 11.7 · **map_lookup 11.6** (zone-label `f`/`a`/`u`, Height/Lot-Coverage overlay) · existing 11.3 · formula 9.0 · band 0.8 % |
| Displacing ("despite") clauses | 223 / 877 (25 %), mostly *internal* ("despite (A) above") |
| Conditional clauses | 474 / 877 (54 %) |
| Regulations with all clauses classified | 12-set: **70.2 %**. Faceted: **95.2 %** |
| Cross-reference targets resolving | 97.8 % (318 targets) |
| Used definitions (69) | DEFINE 97.1 % |

**What standard rules need that exceptions mostly do not** (each is a `value_form` or qualifier, not a new archetype):
- `map_lookup`: zone-label and overlay values (11.6 %).
- `band`: the RD side-setback frontage bands. These split into per-band conditional LIMIT clauses, so the band is a regulation-level `band()`.
- `formula`: "the greater of / higher of …" (9 %).
- `by_building_type` branches (36 %).
- Internal `displaces` ("despite (A) above").
- DEFINE extended to **measurement and inclusion/exclusion rules**: "height is the distance between …", "is not included in GFA", "setback requirements apply only to parts above ground". All of these were UNUSUAL before DEFINE was extended.
- Several standard rules are **chooser permissions** ("may be selected as the front lot line") and **governance rows** (900.1.10(2)/(3)/(4)), which are PROCEDURAL.

## 5. Pitfalls (step 4)

Lot shares are of the 300,616 lots in the ≥ 100 set **[measured]** unless marked otherwise.

1. **INCLUDE chains to 0-direct-lot exceptions.**
   - There are 1,076 include edges across Ch.900.
   - RD 1462 (included by 557 exceptions, 38,512 lots), RS 336 (8,249 lots) and RT 352 (2,323 lots) have **0 direct lots** and carry the FSI cap.
   - R 4 → R 7 is nested (depth 2).
   - **The census threshold must count INCLUDE-closed lots, and the generator must expand includes transitively with cycle detection.**
2. **Prevailing by-laws and sections.**
   - 200 exceptions (65.6 % of lots) cite a former by-law, section or schedule. 122 (34.3 % of lots) do so for the *whole* exception, not a named address. 66 are prevailing-only (13.3 %).
   - Per 900.1.10(4)(A)/(B) [read], a prevailing instrument is an **alternate compliance path**: the 569 rules do not apply "to prevent" compliant erection, and 569 still applies to anything the prevailing by-law does not permit.
   - Our 569-only result is therefore conservative, not wrong **[inferred]**. Row: PREVAILING, `evaluated_by_us: no`, disclosed.
   - Example: RD 1463 (5,912 lots) is prevailing-only: North York 7625 Schedule 'D' Airport Hazard Map plus one address.
3. **Named-lot and part-of-lands clauses.** "On 97 Hillmount Avenue …", "On 2980 Weston Road …" (both inside RD 5), and registered-plan lot lists. 95 exceptions (31 % of lots) contain at least one. These apply only to the named lots, so for all other lots of the exception they are inapplicable. Two fields are needed:
   - `applies_to.part = named_addresses | lot_list | map_area`, with refs;
   - an address → parcel match before they can be evaluated. Until then they are disclosed for the named lots only.
   - RD 5 (48,336 lots) has two such clauses, plus a whole-exception prevailing airport map.
4. **Existing-value clauses ("that which existed on the day of the enactment of this By-law").**
   - These are 19 % of SSP clauses, in 243 exceptions.
   - 198 of those exceptions use them only for lot frontage / area. The lot is deemed conforming, which can be evaluated if the lot has not changed since 2013-05-09 **[inferred]**.
   - Setback / GFA "as existed" needs as-built facts: 42 exceptions, 5.8 % of lots.
5. **Implicit override.** Under 900.1.10(3) [read], SSP "govern over any inconsistent regulations". Most SSP LIMITs name no target regulation. Replace-vs-additional is decided by whether a base row with the **same DSL target** exists for that zone. That is derivable, not authored. Example: "minimum setback from a lot line abutting Lawrence Ave is 22.0 m from the centreline" is a *new* target, while "minimum side yard setback is 1.2 m" *replaces* the base value.
6. **Conditional and lot-condition clauses.** 283 SSP clauses (12 %): flanking lot, corner lot, frontage ≤ 7.6 m, abutting a named street. These need `application.lot_condition` tokens. Some name **streets** (Bellamy Rd, McCowan Rd), which requires a street-abutment input **[read]**.
7. **Diagrams and maps.** 34 exceptions (3.4 % of lots) reference a diagram, schedule or map we do not hold.
8. **Amendments.** 96 exceptions (50.5 % of lots) carry `[ By-law: … ]` tags, including `(OLT)` / `(OMB)` ones. Their in-force status is not verified. `[TO: 438-86; …]` provenance notes appear in 139 clauses and must be stripped from values.
9. **Source defects.**
   - Clause letters are skipped 12 times (e.g. RD 620 has no (C)).
   - 6 header variants exist.
   - The page footer ("&copy;City of Toronto 1998-2026") leaks into the last exception on each page.
   - Typo targets such as "10.5.40.601".
   - The slicer must tolerate and *log* all of these, never silently.
10. **References to other chapters.** Ch.230 (bicycle), 220 (loading) and 150.10 / 150.7 section-level references occur; only Ch.230 is outside the fetched set.
11. **Multiple exceptions per lot** never happen at the label level (0). **Partial-lot zoning** affects 364 excepted parcels (`zoning_is_ambiguous`) **[measured]**.

## 6. Recommendation (step 5 + extension)

### 6.1 One unified, closed set: `archetype` (10) + derived `value_form` + qualifiers

This set covers standard regulations, exception clauses, provincial overrides and prevailing references alike. It **replaces v0.3's 12-member `archetype` and merges v0.2's `provision_kind`** (one field, no duplication).

| `archetype` | What it does | v0.2 `provision_kind` | v0.3 member(s) folded in |
|---|---|---|---|
| `LIMIT` | numeric bound on one DSL target (min / max / count / exact) | numeric_limit | LIMIT, TIERED_TABLE, FORMULA, BRANCH, CONDITIONAL (→ value_form / condition), OVERRIDE (→ `displaces[]`) |
| `PERMIT` | adds a use, building type, encroachment or choice | permission | PERMISSION |
| `PROHIBIT` | removes a use, building type or action | prohibition | PROHIBITION |
| `REQUIRE` | non-numeric obligation (parking in a building, access from the lane, must be fenced) | — **new** (measured 5–7 %) | — |
| `DEFINE` | definition, measurement method, inclusion/exclusion rule | definition | DEFINITION |
| `DISAPPLY` | "regulation X does not apply" with no replacement value | override (no-value case) | OVERRIDE (no-value case) |
| `INCLUDE` | incorporates another provision ("must comply with exception 900.3.10(1462)") | cross_reference | CROSS_REFERENCE |
| `PREVAILING` | alternate compliance path under a former by-law, section or schedule; never evaluated | — | PREVAILING_REFERENCE |
| `PROCEDURAL` | governance / precedence / no-effect text (900.1.10(2), "continue to apply") | procedural | — |
| `UNUSUAL` | anything else → `not_modelled`, disclosed | — | UNUSUAL |

- **`value_form` (G, closed, derived from the parsed `numeric_expression`):** `literal` · `band` · `formula` · `by_building_type` · `if` · `map_lookup` · `existing_as_of` · `none`. This needs two new DSL primitives: `existing(var; as_of)` and `label(letter)` / `overlay(code)`. G-KIND checks that the derived form agrees with the archetype. Because it is derived, it is *not* double-keyed.
- **Qualifiers (G where mechanical, A ⧉ otherwise):**
  - `displaces[]`: resolved ids, mechanical from "Despite …" / "does not apply". Must resolve (95/97 do today).
  - `condition`: an `application.lot_condition` token plus the DSL `if`.
  - `applies_to.part` ∈ `whole | named_addresses | lot_list | map_area`, with refs.
  - `layer` ∈ `base | exception | provincial` (generated from the source).

### 6.2 Fixed row shape per archetype (beyond the common §2.3 fields)

| Archetype | Required fields | Must be "none" / empty |
|---|---|---|
| LIMIT | `target` (closed DSL var), `bound` (min/max/count/exact), `numeric_expression` (literals in the cited clause), `units[]` | — |
| PERMIT / PROHIBIT | `subject` (closed building_type / use / action token), optional `condition` | expression "none" unless condition literals |
| REQUIRE | `subject`, `requirement` (closed token, e.g. `parking_in_building`, `access_from_lane`) | expression "none" |
| DEFINE | `term` or `variable`, optional expression; `input_fidelity` when a DSL input maps to it | — |
| DISAPPLY | `displaces[]` ≥ 1 resolved | expression "none" |
| INCLUDE | `include_ref` (resolved row or exception id); generator expands it (cycle check, depth recorded) | expression "none" |
| PREVAILING | `instrument {kind: former_bylaw / former_section / schedule_map, citation, municipality}`, `applies_to.part`, `evaluated_by_us: no` | expression "none" |
| PROCEDURAL | — | expression "none" |
| UNUSUAL | `not_modelled_reason` (closed), disclosure text | expression "none" |

**Precedence is data; there is one generic resolver.**
- `effective(lot, target)` = the highest-layer applicable row for that target. Layers rank `provincial > exception > base`, citing 900.1.10(3) and EXT-prov-1.
- At the same target, a higher layer replaces a lower one. `DISAPPLY` removes the row. `INCLUDE` expands. `PREVAILING` never changes the 569 value; it adds an "alternate path not evaluated" disclosure.
- Replace-vs-additional is computed from whether a base row exists for the same target (pitfall 5).

### 6.3 Anti-spaghetti gates (Phase 2; each with a red-first fixture)

1. **G-EXC-LIT**: a literal lint over `scripts/` + `src/` for `900\.[2-6]\.10\(\d+\)` and exception-number literals. Fixture and test-data dirs are allowlisted by path, never by value.
2. **Closed handler registry**: the keys of the handler map equal `vocab.archetype`, checked in both directions. One handler per archetype; adding a member without a handler (or the reverse) fails.
3. **Generator-only population**: exception rows come only from the slicer plus authored sidecar fields. Schema plus byte-identical `--check`.
4. **G-KIND**: the derived `value_form` matches the archetype shape table (§6.2).
5. **Double-keyed `archetype`, `target`, `condition`, `applies_to.part`** (M-17). The regex classifier is recorded as a third, non-authoritative opinion. Its disagreement rate with the agreed label is reported, never gated: measured precision is about 90 % on exceptions and 77 % on standard regulations.
6. **Red-first fixtures, one per archetype × value_form.** Taken from this probe:
   - RD 5 (A): LIMIT + `displaces` 10.20.40.70(3);
   - RM 18 (B): LIMIT by_building_type;
   - RD 1462 (A): LIMIT band+formula via INCLUDE;
   - RD 587 (A): LIMIT existing_as_of;
   - RD 254 (C): INCLUDE → RD 1462;
   - RD 1463: PREVAILING (map + named lot);
   - RD 5 (B): DISAPPLY, named lot;
   - R 604: PROHIBIT apartment building;
   - RD 806 (G): REQUIRE parking in a building;
   - 10.20.40.70(3): band (standard);
   - 10.40.40.10(1): map_lookup.
7. **Slicer self-test**: header-variant and letter-gap counts are locked (6 variants, 12 gaps, 2 no-PBS-header). A changed count fails until it is reviewed.

### 6.4 Exception census format (G-EXC)

A probe rendering is in `phase0b/exception-census.json`. One row per exception:
- `rank, wave, exception_ref, zone, number`;
- **`direct_lots`, `inherited_lots`** (via INCLUDE closure);
- `clauses`, `archetypes{}`, `value_forms{}`, `text_sha256`, `amendments[]`;
- `status ∈ captured | modelled | partially_modelled | not_modelled`;
- `reasons[]`, closed: `prevailing_alternate_path`, `prevailing_named_lots`, `named_lots_only`, `needs_as_built`, `map_area_not_held`, `unusual`, `include_outside_census`.

Membership = INCLUDE-closed lots ≥ 100.

The probe status, using mechanical drafts **[measured]**:

| Status | Exceptions | Lots |
|---|---|---|
| modelled | 345 | 56.0 % |
| partially_modelled | 88 | 28.3 % |
| not_modelled | 82 | 17.2 % |

Wave 1 by lots: modelled 135,675 · partially_modelled 78,636 · not_modelled 39,192.

Five-word lines (probe values):
```
STANDARDIZED: FAIL (clauses 3067; UNUSUAL 24 — pass requires each not_modelled + disclosed)
OBSERVABLE:   PASS (pages 6 sha-pinned; census rows 515 = DB >=100 set 515)
ACCURATE:     FAIL (0 double-keyed; displaces targets unresolved 2)
UNDERSTANDABLE: FAIL (no explanations drafted; 170 exceptions need a disclosure line)
SCALABLE:     FAIL (INCLUDE targets outside census: 900.3.10(1462) 29,493 lots, 900.4.10(336) 5,427, 900.5.10(352) 1,233)
```

## 7. What changes the plan

1. **M-30 archetype set** → replace it with §6.1: 10 archetypes plus derived `value_form` and qualifiers, merged with `provision_kind`. G-KIND is rewritten accordingly.
2. **M-15 threshold** → count **INCLUDE-closed** lots. RD 1462, RS 336 and RT 352 (0 direct lots; the FSI cap for about 49,000 lots across all of Ch.900) must be in **wave 1**.
3. **Override binding** → key on the DSL `target` vocabulary, not on "Despite X". The target vocab becomes a Phase 2 prerequisite.
4. **Census number** → 515 exceptions / 88.6 %. R −1 is a sentinel; correct M-15's 516 / 88.8 %.
5. **New Phase 2 data dependencies:**
   - address → parcel matching for named-lot clauses (31 % of lots are in affected exceptions);
   - a street-abutment input for clauses that name a street;
   - `existing_as_of` semantics for lot frontage / area.
6. **The classifier is a pre-sorter only.** Its precision (about 90 % / 77 %) rules it out as the authority. Double-keying stays mandatory.

## 8. Files (all under `.cursor/mcbylaw/phase0b/`)

| File | Contents |
|---|---|
| `rank.js`, `dbq.js` | read-only SQL |
| `rank.json` | exception ranking |
| `pages/*.htm`, `manifest.json` | re-fetch + provenance |
| `slice.js` | exception / section / clause slicer |
| `classify.js` | features, 12-set label, faceted archetype, targets, literals |
| `run.js` | census + metrics |
| `metrics.json`, `clauses.json`, `census.json` | outputs of `run.js` |
| `std.js` | standard-regulation population |
| `std-classified.json`, `std-clauses.json` | outputs of `std.js` |
| `ambig.js` | collision rates |
| `lots.js` | lot-weighted pitfalls |
| `census.js` | builds `exception-census.json` |
