# McBylaw: parcel zone-assignment validation (read-only premise check)

**Date:** 2026-10-06. **Mode:** read-only. Nothing in `src/`, `scripts/` or `migrations/` was touched. The local dev DB was used with `BEGIN READ ONLY` and `default_transaction_read_only = on`. Public City pages were fetched.
**Evidence tags:** **[measured]** = a script or query run here · **[read]** = read in code, spec or by-law text · **[inferred]** = my judgment.
**Reproduce:** see `zoning-validation/`. `q.js` is the read-only SQL runner. The `.sql` files hold the internal checks. CoA ground truth comes from `parse-coa.js`, then `join.js`, then `compare.js`, then `diag.js` / `live-pts.js`. Live City checks are `live-attrs.js`, `live-sample.js` and `unz-live.js`. Source PDFs are in `zoning-validation/pdf/`.

## 0. Answer

**Which zone each parcel carries: high confidence. The parameter columns (`bylaw_*`): not safe to use as-is.**

**1. The zone and label each parcel carries match the City's own published data.**
- 194 of 197 random parcels match the City's **live** Zoning Area layer exactly, label for label (98.5 %). The 3 misses are 2 amendments made after our snapshot and 1 split parcel **[measured]**.
- Every CoA disagreement I traced (11 of 11) also showed our value equal to the City's live value **[measured]**.

**2. Seven residual error classes remain. None of them is a defect in how a parcel picks its zone.**

| # | Class | Size | Evidence |
|---|---|---|---|
| E1 | **Parameter columns polluted by sliver zones** | **25,018 residential parcels (5.7 %)** have at least one of `bylaw_min_frontage_m` / `bylaw_min_area_sqm` / `bylaw_max_density` / `bylaw_max_units` that disagrees with the parcel's **own** dominant label. In **97.9 %** of the frontage cases the value comes from a polygon covering < 1 % of the parcel (96 % < 1 m²) | [measured] |
| E2 | **Residential label FSI (`d`) is never stored in `bylaw_max_fsi`** | 222,130 residential labels carry `d`. `bylaw_max_fsi` is non-null for only 1,328 of them. The `d` value lands in `bylaw_max_density` (CKAN `DENSITY`), and no script reads that column | [measured / read] |
| E3 | Snapshot staleness | Our snapshot is CKAN 2026-02-20. The live layer has 12,212 polygons vs our 11,719 (+493, mostly CR +233, RD +87, RA +50). 189 of our labels no longer exist live, and **2,773 parcels (248 residential)** carry one of them. This is a lower bound | [measured] |
| E4 | Not under 569-2013 | 17,829 parcels (3.6 %) have no zone. 17,807 touch no 569-2013 polygon. In a sample of 40, 38 sit in the City's "Not Part of This By-law" layer and 1 has been zoned since the snapshot | [measured] |
| E5 | Genuinely split-zoned parcels | Dominant share < 0.9: 3,392 parcels (1,653 residential). < 0.6 (`zoning_is_ambiguous`): 959 (451 residential). < 0.5: 103 | [measured] |
| E6 | Source-internal inconsistency in the City data | 80 R parcels (x4: 63, x988: 16, plus RD x213: 1) have `EXCPTN_NO` set while the label has no `(x)` and `ZBL_EXCPTN` is null. Below materiality | [measured] |
| E7 | R −1 sentinel | 4,527 R parcels have `exception_number = −1` (already known from Phase 0b) | [measured] |

**3. Before McBylaw Phase 1 (the table): no fix needed.**

**4. Before Phase 2/3 (applying the table to parcels): two blockers** **[inferred]**.
- **Rule:** read the label parameters from the dominant zone, and treat E3 as one disclosed condition.
- **E1:** Phase 2/3 must take f/a/d/u/x from the dominant label (`zoning_zn_string`, or the dominant source row via `zoning_base_source_id`), never from the MIN/MAX-aggregated `bylaw_*` columns.
- **E2:** the `d` → FSI mapping must be explicit.
- **E3:** needs a refresh / currency gate.

---

## 1. Internal consistency [measured]

| Metric | Value |
|---|---|
| Parcels | 496,536 |
| Zoned (have a 569-2013 base zone) | 478,707 (**96.41 %**) |
| Residential (R / RD / RS / RT / RM) | 440,094 |
| Dominant share ≥ 0.99 | 472,851 (98.8 % of zoned) |
| Dominant share < 0.9 / < 0.7 / < 0.6 / < 0.5 | 3,392 / 1,694 / 958 / 103 |
| `zoning_is_ambiguous` | 959. This is one more than the < 0.6 count because the flag is computed before rounding to NUMERIC(5,4) |
| Stored label vs the dominant source row (`zn_zone`, `zn_string`) | **0 mismatches** out of 478,707. The dominant zone is copied faithfully |
| Label re-parsed vs the dominant **source row** columns | f 11 · a 7 · u 0 · d 311 (non-residential labels such as `I 2.0`, `OR`, `CR SS2` whose density is not a `d` token) · x 4,732 (4,522 = R −1 sentinel, plus E6) |
| Label re-parsed vs the parcel's **aggregated** `bylaw_*` columns (residential) | f 18,468 · a 16,006 · d 7,500 · u 3,755 · any 25,018 (**E1**) |
| E1 frontage mismatches, mechanism | 11,181 where stored > label (MAX takes a larger neighbour value) and 12,358 where the label has no `f` but a neighbour's does (all classes). The residential source polygon covers < 1 % of the parcel in 18,071 / 18,468 cases, < 1 m² in 17,755 |
| Why the share flag misses it | Sub-1 m² slivers round to share 1.0000, so neither `zoning_is_ambiguous` nor the share sees them. This is the same defect class already fixed for FSI (`zoning-precedence.js`, 502/555 RD parcels) and logged for STAND_SET (Spec 58 §13, 2,341 parcels) **[read]** |
| `bylaw_exception_ref` vs `900.<k>.10(<n>)` | 80 mismatches, all E6 (ref null because the source `ZBL_EXCPTN` is null). Phase 0b's "0 mismatches" covered rows where a ref exists |
| Zone class vs existing building (light touch) | RD parcels with an 8+ storey (estimated) primary footprint ≥ 800 m² on a whole-zone lot: 98. R: 380, RS: 6, RT: 7. A 10-row eyeball shows institutional buildings (schools, churches, height-derived storeys) and **footprint-link artefacts** (a 1,094 m² footprint on a 3 m² "lot", 898 m² on 118 m²). There is **no zone-assignment signal**. The test is dominated by `parcel_buildings` link noise, so I would not adopt it as a check |

## 2. External ground truth: CoA decisions

**Where the City's stated zoning lives.** It is **not in our DB.** The CKAN CoA feed has no zoning field: `load-coa.js` maps 10 fields, and `DESCRIPTION` mentions "zoned" once in 33,400 rows **[measured / read]**. `coa_applications.zoning_class` and `variance_context` are copied from our own parcel (Spec 42 step 5, `enrich_coa_zoning`), so they are not independent **[read]**. The City's text appears on the **Notice of Decision** ("Zoning RD (f15.0; a610) (x5)/R4 [ZZC]"). That text is public only in old batch PDFs. Recent notices sit behind the AIC (about 90 days) or the paid Research Request Portal **[read, web]**.

**Sample.** Seven public PDFs: four district batch decision sets (TEY 2017-02-28, NY 2017-10-12, EYK 2017-09-07, SC 2017-11-02) and three single notices (2015, 2020, 2021).
- **155 applications** were parsed. 154 are in our DB and 127 are linked to a parcel.
- After de-duplicating by property: **126 properties**, of which **107** are comparable. The other 15 are unlinked (our CoA→parcel gap) and 4 are notices with no 569-2013 label (e.g. "R4(107)[WAV]").
- 36 of the comparable properties carry full labels with parameters.
- **Recency caveat:** these notices are mostly 2016–2017, about 9 years before our 2026 snapshot.

| Metric (per property) | Result |
|---|---|
| Zone class match | **101 / 107 = 94.4 %** |
| Full label match (class + f/a/d/u + x) | **27 / 36 = 75 %** raw. Excluding the classes shown not to be our error (CoA omitted x, CoA typo, linkage): 27 / 28. The one left unresolved is 14 Oriole Gdns |
| Our value = City **live** layer, wherever we disagreed with the CoA | **11 / 11** checked |

**Mismatch classes (15 properties):**

| Class | n | Cases | Our error? |
|---|---|---|---|
| CoA text omits the `(x…)` that the City map has | 6 | 549 Euclid (x735) · 59 Brooklyn (x809) · 110 Parkmount (x736) · 575 Jones (x736) · 49 Dunvegan Rd (x961) · 107 Virginia (x312, 3 apps) | No. Ours = City live |
| CoA typo | 1 | 68 Dagmar: "R(d.06)(x809)" vs R (d0.6)(x809) | No |
| **CoA→parcel linkage error** (our CoA link, not zoning) | 3 proven + 1 likely | 87 Douglas Ave: linked parcel (no address) is RT (x224), but the CoA geocode point is R (f7.5; d0.6)(x604), which matches the CoA's "R" · 83 King St (Weston): linked parcel is CR 4.0, CoA point is RD (f12.0; a370; d0.4), matching the CoA's "RD" · 12 Howland **Ave**: CoA x900 is the Annex exception (140 Madison Ave), but we linked to a Howland Rd parcel in Riverdale (x736, street-type collision) · 9 York Rd: NY panel, but we linked to a 9 York Rd in former York (RM) | No (zoning). **Yes for any CoA-based instrument** |
| Probably rezoned after 2017 | 1 | 1478 Eglinton Ave W: CoA "RD (ZPR)"; ours and live = CR SS2 (x2641), a late-series exception number | No |
| Unresolved (CoA vs current City data) | 3 | 495 Warden Ave and 126 Newport Ave (SC): CoA "RD"; ours and live = RS (f15.0; a464)(x98) · 14 Oriole Gdns: CoA R (d0.6)(x905); ours and live = R (d1.0)(x573), with neighbour 59 Oriole Gdns at x905 and matching | Not ours vs City. Either CoA noise or a boundary change since 2017 |

**Worked matches (sample):** 182 Patricia Ave "RD (f15.0; a610) (x5)/R4" = RD (f15.0; a610) (x5) · 29 Dempsey Cres "RD (f21.0; a975) (x70)" = RD (f21.0; a975) (x70) · 37 Dunloe Rd "RD (f15.0;d0.35)(x1328)" = RD (f15.0; d0.35) (x1328) · 98 Winona Dr (2020) "R (d0.6) (x730)" = R (d0.6) (x730) · 21 Killdeer Cres (2019) "RD (f12.0;a370;d0.6)" = RD (f12.0; a370; d0.6) · 18 Shamokin Dr "RD (f18.0, a690)" = RD (f18.0; a690). Full list: `zoning-validation/coa-compare.json`.

**What the CoA check can and cannot prove.** On class, it agrees with our zone 94 % of the time, and every disagreement traced to CoA text, CoA linkage or time, never to our parcel→zone step. The sample is small and dated: 107 properties, 2016–2017, 4 districts. **A CoA instrument at scale is not cheap.** Recent notices are not openly published, and our CoA→parcel link is wrong often enough (≥ 3–4 of 111 linked properties, plus 15 unlinked) that it would need its own gate first **[inferred]**.

## 3. Other independent source: the City's live GIS (sample only)

- **Service:** `gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer` layer 3 (Zoning Area, live) and layer 12 (Not Part of This By-law).
- **What it checks:** this is the same lineage as CKAN, so it tests **currency and our geometry handling**, not the City's own correctness.
- **Calls made:** one attribute-only pull (12,212 rows) plus about 360 point queries.
- Random 200 parcels (point-on-surface): 197 hit a polygon, **194 label-identical (98.5 %), 196 class-identical**. Misses: 404862 R (d2.0)(x943) → RAC (x304), and 148171 CR SS2 → CR 5.0 SS4 (both amendments after the snapshot); 6319977 is split (share 0.45) **[measured]**.
- 100 residential parcels with share < 0.9: 81 hit, 75 match. A point-on-surface test of a split parcel is arbitrary, so this is the expected disagreement, not an error **[measured / inferred]**.
- The live service has layers we do not load: Multi Tenant House overlay (64), Housing Zone (29), Sixplex Permission (80), Community Street (79). Phase 2 should check these for envelope relevance **[measured: layer list; relevance inferred]**.
- The live "Zoning Property Summary" layer (18, per-address ZN_STRING) returns only 1,999 records and none of 8 tested addresses, so it is not usable as a property-level oracle **[measured]**.

## 4. Verdict, quantified

- **Zone identity (class + label + exception), in-scope parcels:** about **98.5 %** identical to the City's current map. Our faithfulness to the snapshot is about **100 %** (0 dominant-copy mismatches). The gap is snapshot age (E3, ≥ 0.6 % of parcels and growing about 65 polygons a month: +493 polygons since 2026-02-20). Split parcels (E5, 0.7 %) carry a dominant-zone choice that the by-law does not make. In law, each portion of a split lot follows its own zone **[inferred]**.
- **Label parameters as stored in `bylaw_*`:** **94.3 %** of residential parcels are clean. 5.7 % are polluted by slivers (E1), and the residential `d` FSI is absent from `bylaw_max_fsi` (E2).
- **CoA ground truth:** 94.4 % class agreement, with 0 traced disagreements caused by our zone assignment. The confidence interval is wide (n = 107, 2016–2017).
- **Fix before McBylaw Phase 1?** No. The table is by-law text keyed by `900.<k>.10(<n>)` and zone; it does not read parcel columns.
- **Fix before Phase 2/3?** Yes, for E1 and E2: Phase 2 reads parameters from the dominant label or source row, not from `bylaw_*`. A WF3 to make f/a/d/u `dominant` in `zoning-precedence.js` (same shape as the FSI fix) would remove E1 at the source. E3 needs a freshness gate, because CKAN lags the live map by about 7.5 months. E4 and E5 need a disclosed, never-silent state.

## 5. Where this belongs in McBylaw (simple, Spec 68 M-0)

One standing check replaces ad-hoc audits. It is a Phase 2 entry gate that is re-run per zoning load:

| Gate | Closed answer | Instrument |
|---|---|---|
| ZV-1 Dominant-label faithfulness | PASS iff 0 parcels where `zoning_zn_string` ≠ the dominant source row's `zn_string` | 1 SQL (`rt.sql`) |
| ZV-2 Parameter provenance | PASS iff 0 in-scope parcels whose McBylaw input f/a/d/u/x ≠ the re-parse of their own dominant label | 1 SQL (`anydiff.sql` pattern), applied to the McBylaw input view, not `bylaw_*` |
| ZV-3 Currency | PASS iff the CKAN `Zoning Area` `last_modified` is ≤ 90 days old, **or** the live-vs-snapshot label diff touches < 1,000 parcels. The 1K figure is the materiality bar | `live-attrs.js` diff (attribute pull, no geometry) |
| ZV-4 Disclosure | Every parcel McBylaw serves is exactly one of: `zoned` / `split (share < 0.6)` / `not_569_2013` / `stale_label` | Derived column, no new process |

The CoA cross-check stays **optional and evidential**, not a gate: the public sample is too small and dated, and our CoA linkage is itself noisy. If kept, it should be re-run as a ≥ 95 % class-agreement sanity line with linkage errors excluded.

## 6. Draft Spec 69 ruling

> **R-ZV (zone-assignment trust).** McBylaw resolves a parcel's applicable regulations from the parcel's **dominant 569-2013 label** (`zoning_zn_string` / `zoning_base_source_id`) and its `900.<k>.10(<n>)` exception key, never from the precedence-aggregated `parcels.bylaw_*` parameter columns, which mix in neighbouring sliver zones (measured 5.7 % of residential parcels, 2026-10-06). A residential label's `d` value is the zone FSI. Phase 2 may not start unless gates ZV-1..ZV-4 PASS. Parcels with dominant share < 0.6, with no 569-2013 zone, or with a label absent from the current City map are served with that status disclosed, never silently resolved. The CoA decision cross-check is evidence, not a gate.

Sources: [TEY decisions 2017-02-28](https://www.toronto.ca/wp-content/uploads/2017/08/8ee5-C_of_A_TEY_Decisions_February_28_2017.pdf) · [NY decisions 2017-10-12](https://www.toronto.ca/wp-content/uploads/2017/11/9065-CommitteeofAdjustment-NorthYork-Decisions-October-12-2017-.pdf) · [EYK decisions 2017-09-07](https://www.toronto.ca/wp-content/uploads/2017/09/96f5-C_of_A_EYK_Decisions_September_7_2017.pdf) · [SC decisions 2017-11-02](https://www.toronto.ca/wp-content/uploads/2017/11/8f29-CommitteeofAdjustment-Scarborough-Decisions-November-2-2017.pdf) · [TEY notice 2021](https://regalheights.ca/wp-content/uploads/2021/05/PLN-CA-Decision-Notice-MAR-23-2021.pdf) · [City GIS cot_geospatial11](https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/FeatureServer) · [CoA "more information about an application"](https://www.toronto.ca/city-government/planning-development/committee-of-adjustment/more-information-about-application/)
