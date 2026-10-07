# PROJECT McBYLAW — Phase 0 audit (read-only)

**Date:** 2026-10-06 · **Mode:** read-only research (no `src/` / `scripts/` / `migrations/` edits, no DB writes; one read-only DB session with `default_transaction_read_only = on`).
**By-law text:** City of Toronto Zoning By-law 569-2013 office consolidation, pages `https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter{X}.htm`, fetched 2026-10-06 into `.cursor/mcbylaw/pages/` (raw `.htm` + normalized `.txt`, normalized with the legacy `norm.js`). Page header: *"Version Date: July 31, 2024, including City-wide Amendments up to April 30, 2026"* **[measured]**.
**Evidence tags:** **[measured]** = produced by a script run in this audit (scripts in `.cursor/mcbylaw/phase0/`, re-runnable) · **[read]** = I read the text/code · **[inferred]** = judgment/classification, not mechanically checked.

**Reproduce:** `cd .cursor/mcbylaw/phase0 && node universe.js && node audit.js && node classify.js && node report.js` (tables in `gen/`), plus `node fields.js` (field-feasibility probe), `node exc.js` / `node exc3.js` (Ch.900 counts + read-only DB census).

---

## 0. Summary

| Question | Answer |
| --- | --- |
| **How comprehensive is the by-law material today?** | Of the **420** in-scope regulations (envelope-affecting + existing-building regulations in Ch.5.10, 10.5, 10.10 R, 10.20 RD, 10.40 RS, 10.60 RT, 10.80 RM, 150.7, 150.8, 150.10, 200.5, 900.1) only **71 (16.9 %)** are captured at regulation level, and only **40 (9.5 %)** have their full verbatim text captured **[measured]**. Excluding the R zone: **71 / 365 = 19.5 %** captured, **11.0 %** verbatim. Another 46 regulations are mentioned only by their article number (e.g. "§10.5.40.71"), which is not a capture. Counting those too gives 117 / 420 = 27.9 %. Definitions: **15 / 69** of the Ch.800 terms used by in-scope regulations are captured verbatim (21.7 %) **[measured]**. |
| Where it is strong | Front-yard landscaping / rear soft / corner side (10.5.50.10(1)–(7): **100 % verbatim**), principal-building setbacks (17 / 33 verbatim), building length (7 / 16) and depth (4 / 9), the main FSI, coverage and height clauses (partial), driveway width 10.5.100.1(1)/(6) **[measured]**. |
| Biggest gaps | (1) **Chapter 900 site-specific exceptions: 0 captured.** 3,015 residential-zone exceptions exist, and **78.1 % of residential parcels (343,652 / 440,094)** carry an exception number. Example: RD exception 5 (48,336 parcels) replaces the RD side-yard table with **1.8 m** **[measured / read]**. (2) **R zone (10.10): 0 / 55**, yet R covers **104,544 parcels**, 24 % of residential parcels **[measured]**. (3) **Ancillary buildings (10.5.60), 0 / 27**, and **laneway suites (150.8), 1 / 36**. Garden suites (150.7) have 7 / 37, and 6 of those are citations in code only. (4) **Code constants are stale against the current text.** `optimal-config.js` / Spec 78 §P2.1 cite garden-suite clauses that by-law 849-2025 rewrote: there is no longer a 40 %-of-rear-yard term, height is 6.3 m (not 6.0), and separation is 4.0 m (not 5.0). By-laws 849-2025 and 847-2025 appear nowhere in the repo docs **[measured / read]**. (5) None of the requested **numeric-expression, application or calc-handling fields exist** as fields anywhere **[read]**. |
| Generators | The legacy `spec67-gen` still runs green against today's tree: 0 failures, ledger 28/28, G-anchors 23/23, claims 60 verified / 12 unverified, vectors 24/24 **[measured]**. Its output matches committed Spec 67 except fetched_at timestamps (taken from file mtime) and the R-BE generated Target-Files block **[measured]**. It verifies **quotes that people wrote**. It does not enumerate the by-law, so it cannot measure exhaustiveness. |
| Phase 1 recommendation | Generate the table from the **regulation universe sliced from the fetched pages** (`universe.js`, 945 regulation rows, 0 span mismatches **[measured]**). Verbatim, citation, URL, fetched_at, sha256 and amendment tags then come for free for 100 % of rows. Authored fields (explanation, numeric expression, application, calc-handling) go in a keyed sidecar. The generator rejects any row with a missing field, and rejects any numeric expression whose literals are not in the verbatim. Scope: in-scope universe + used definitions (≈ 489 rows incl. R). Ch.900 stays a mechanism row plus a top-N exception backlog (§5). |

---

## 1. Inventory — every by-law provision captured anywhere today

### 1.1 Sources and what each carries

| Source | Rows | Unit of capture | Citation | Verbatim | URL | fetched_at | Explanation | Numeric expr. | Application | Calc-handling | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Spec 67 App. A — quoted claims C1–C76 | 76 claims (60 VERIFIED, 12 UNVERIFIED, 4 absence phrases) **[measured, check.json]** | fragment of a quote written into a plan/report cell (may be an excerpt with "...") | yes (section list, often article-level only) | fragment only | yes | yes (page mtime) | no | no | no | no (origin NF row only) | ordered-fragment substring search, window 300 chars, casefold / trailing-punct tolerance |
| Spec 67 App. B / Spec 58 §13 / plan — ledger L1–L28 | 22 verbatim + 6 absence claims **[measured]** | clause or regulation (e.g. L5 = 10.5.50.10(1)(A)) | yes (clause-level) | **full** | yes | yes | topic label + plain-language bullets for landscaping only | no | implicit in verbatim | via NF-12..NF-28 rows | substring PASS 28/28 on 2026-10-06 text **[measured]** |
| Spec 67 App. C — G1–G23 (+A1) | 23 anchors + 1 absence **[measured]** | span between two anchors (G1 = 10.20.40.70(1)–(3)) | yes | **full span** | yes | yes | topic label | no | no | indirect (NF/EF rows) | anchor found + unique: 23/23 **[measured]** |
| Spec 67 App. E — H1–H28 | 28 anchors (H26–H28 = CR Ch.40 + CKAN readme, outside residential) **[measured]** | span between anchors | yes | **full span** | yes | yes | topic label | no | no | NF-29..NF-32 | 25/25 residential anchors found unique **[measured]** |
| Spec 67 §3.4 NF-1..NF-32 / §3.5 EF-1..EF-26 (= plan = Spec 58 §13) | 32 NF + 26 EF rows in the plan **[measured]** | planned output field | yes (in "By-law claim" cell) | quotes inside cells (→ App. A) | no | no | partial (constraints prose) | **implicit** in "Formula / source" SQL | partial (zone list in prose) | **yes — the closest thing to calc-handling today** (formula + constraints + status) | statuses: planned / research-required (NF-3, NF-4, NF-20, NF-23) / user-input (NF-26..NF-29) **[measured]** |
| Report `parcel-columns-buyer-lot-report-derivation.md` | verified matrix (5 dimensions × 4 zones), verbatim record (feeds C43–C76), citation-validation ledger (11 rows), additional-provisions table (7 rows) **[read]** | topic | yes | via App. A | no | no | **yes, prose** (the best buyer-facing explanations today) | no | zone columns in the matrix | "our system's handling today" column (7 rows) | graded tiers (verbatim-quoted / summarized) |
| Spec 78 §P2.1 + `optimal-config.js` `BYLAW` | 10 rule rows / 19 constants, 11 citations to 150.7 clauses **[measured]** | constant | yes | no | no | "verified 2026-06-26" | 1-line comment | **yes (the constant)** | no | the engine itself | **stale** — see §5.2 |
| `max-build.js` constants (`SETBACK_DEFAULTS`, `COVERAGE_DEFAULTS`, suite/garage constants) | 0 by-law citations **[measured]** | constant | no | no | no | no | comment ("Approximations… typical yards") | yes | zone prefix key | yes | none |

### 1.2 Deduplicated regulation-level inventory

The two kinds of capture were mapped onto the regulation universe of §2:
- **Verbatim captures:** ledger verbatims, G/H anchor spans, and verified claim fragments of at least 40 characters. Each one is located in the page text, and the share of each regulation's characters it covers is measured.
- **Prose citations:** every `§x.y.z.w(n)` in Spec 67 §0–§11, Spec 58 §13, the report, Spec 78, the plan, and the four code files, with long quoted strings removed first.

Grades: **V** = at least 90 % of the regulation's text captured verbatim · **P** = partially captured verbatim · **C** = cited at regulation level, text not captured · **A** = only the article is cited · **U** = nothing **[measured]**.

Result: **154 distinct regulations are touched at all.** V 57 · P 23 · C 11 · A 63. Of these, 132 are in-scope (envelope, existing-building or used definition). The other 22 are informational or out-of-scope, e.g. the apartment landscaping rows L11/L12 **[measured]**. The full per-regulation inventory, with the operator's fields marked present or absent, is in **Appendix 1**.

Captures that fall outside the residential universe and are kept as-is: H26/H27 (§40.5.1.10(3)(B)–(4), §40.10.1.10(2), CR standard sets), H28 (CKAN `STAND_SET` data dictionary), §15.5.40.10 (RA, an example of "despite" language) **[measured]**. Absence claims (count-verified facts, not provisions): L3 ("hard landscaping" undefined), L19 (no zone-chapter landscaping article), L22, L24 ("patio" absent from Ch.10.5), L27 (shared/mutual driveway), L28 ("parking pad" undefined), A1 (no RS/RT/RM corner clause) **[measured]**.

**Twelve claims are UNVERIFIED in App. A** (C12, C13, C18, C43, C44, C45, C49, C52, C54, C55, C58, C59) **[measured]**. These are paraphrased or ellipsis-joined quotes that do not match the text. They must not seed the new table, which should be seeded from page slices.

---

## 2. Exhaustiveness — the in-scope universe and coverage

### 2.1 Universe definition **[measured enumeration, inferred relevance]**

Every page below was fetched on 2026-10-06. `universe.js` parses them into articles (`x.y.z.w Title (1) …`) and numbered regulations (`(n) Title …`, which must increase within the article and follow `. ] ) : ;`). Ch.800 is parsed into `(n) Term means …`.

**945 regulation rows** came out, and slicing each one back from the page gives **0 span mismatches** **[measured]**. The numbering gaps the parser reports are genuine by-law gaps (e.g. 10.20.20.100(7), 150.10.20.1(3) do not exist) **[measured: the gap context was checked]**. The legacy page copies (2026-09-29 fetch) are **byte-identical** to the 2026-10-06 fetch for all 10 overlapping pages **[measured]**.

| Page fetched | Article range | Regs | Role |
| --- | --- | --- | --- |
| Ch.1 (1.5) | 1.5.1–1.5.10 | 12 | informational (title, map, severability) |
| Ch.2 (2.1) | 2.1.1–2.1.3.8 | 25 | informational (compliance, variances, transition) |
| Ch.5 (5.10) | 5.10.1.10–5.10.175.1 | 42 | mixed: setbacks apply to all parts (5.10.40.70(2)), corner/through-lot front-line designation (5.10.30.20), triangular-lot rear yard (5.10.40.70(5)), shoreline/top-of-bank (TRCA), heritage-site override (5.10.40.1(6)) |
| 10.5 Residential general | 10.5.1.10–10.5.150.1 | 148 | core |
| 10.10 R | 10.10.1.10–10.10.80.200 | 93 | core if R is in scope (104,544 parcels) |
| 10.20 RD / 10.40 RS / 10.60 RT / 10.80 RM | `.1.10`–`.80.1` | 75 / 68 / 57 / 70 | core |
| 150.7 Garden suites / 150.8 Laneway suites / 150.10 Secondary suites | | 46 / 41 / 6 | core (accessory / suite) |
| 150 (served page = 150.5 Home occupation) | | 15 | out of scope |
| 200 (200.5 Parking) | 200.5.1–200.5.200.50 | 41 | parking-space dimensions in scope; rates informational |
| 800.50 Definitions | | 200 | 69 used by in-scope regulations (term match, inferred) |
| 900 (900.1 interpretation) + 900.2–900.6 (R/RD/RS/RT/RM exceptions) | | 4 + **3,015 exceptions** | precedence mechanism; exceptions handled separately (§5.3) |
| 600 / 995 | | 1 / 1 | overlay-map location (informational) |

Relevance classes come from `classify.js` and are **[inferred]**. They are rule-based on article and title keywords, with a short override list. The rules:
- `.20.100` "Conditions" (non-residential uses) is out-of-scope.
- Apartment-only rules are out-of-scope, matching the MaxBLD scope of detached / semi / row.
- "lawfully existing" regulations are the **existing-building** class (grandfathering; needs as-built facts).
- Deleted / empty slots are excluded.

**Relevance census (all 945):**

| Relevance class | Regulations |
| --- | --- |
| informational | 158 |
| existing-building | 60 |
| out-of-scope | 157 |
| envelope-affecting | 360 |
| deleted | 10 |
| definition-unused | 131 |
| definition-used | 69 |

**Excluded from the universe (out-of-scope / deleted / unused definitions):**

| Class | Count | Examples |
| --- | --- | --- |
| out-of-scope: unzoned land / vehicle habitation / satellite dish / city services | 8 | 5.10.1.30(1), 5.10.1.30(2), 5.10.1.30(3), 5.10.20.1(1), 5.10.20.1(2), 5.10.60.1(2), … |
| out-of-scope: apartment-building-only rule (MaxBLD scope: detached/semi/row) | 10 | 10.5.40.40(4), 10.5.50.10(4), 10.5.50.10(5), 10.5.80.10(2), 10.5.80.30(1), 10.5.100.1(4), … |
| out-of-scope: apartment-building amenity space | 2 | 10.5.55.1(1), 10.5.55.1(2) |
| deleted: regulation slot empty / deleted | 10 | 10.5.80.1(3), 10.10.40.10(9), 150.7.60.30(2), 150.7.60.30(3), 150.7.60.30(4), 150.8.60.30(2), … |
| out-of-scope: apartment waste storage | 1 | 10.5.150.1(1) |
| out-of-scope: condition on a non-residential / institutional use | 115 | 10.10.20.100(1), 10.10.20.100(2), 10.10.20.100(3), 10.10.20.100(4), 10.10.20.100(5), 10.10.20.100(6), … |
| out-of-scope: home occupation (use, not envelope) | 15 | 150.5.1(1), 150.5.20.1(1), 150.5.20.1(2), 150.5.20.1(3), 150.5.20.1(4), 150.5.20.1(5), … |
| out-of-scope: drive aisles in parking areas | 1 | 200.5.1(3) |
| out-of-scope: outdoor patio aisle reduction | 1 | 200.5.1(4) |
| out-of-scope: non-residential marking | 1 | 200.5.1.10(10) |
| out-of-scope: parking exemptions for CR/CRE zones | 3 | 200.5.200.40(1), 200.5.200.40(2), 200.5.200.40(3) |
| definition-unused: term not used by in-scope regs | 131 | 800.50(10), 800.50(20), 800.50(25), 800.50(45), 800.50(50), 800.50(60), … |

### 2.2 COVERAGE — per chapter (in-scope = envelope-affecting + existing-building; definitions = used terms) **[measured]**

| Chapter / section | In-scope regs | V verbatim ≥90% | P partial verbatim | C cited (reg-level), no text | A article-level cite only | U uncaptured | Captured (V+P+C) | Verbatim (V) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ch.5 All zones (5.10) | 18 | 0 | 0 | 0 | 0 | 18 | 0.0% | 0.0% |
| 200.5 Parking | 9 | 0 | 2 | 0 | 0 | 7 | 22.2% | 0.0% |
| 800.50 Definitions | 69 | 15 | 0 | 0 | 0 | 54 | 21.7% | 21.7% |
| 900.1 Exceptions (interp.) | 4 | 0 | 0 | 0 | 0 | 4 | 0.0% | 0.0% |
| 10.5 Residential general | 121 | 9 | 1 | 1 | 21 | 89 | 9.1% | 7.4% |
| 10.10 R zone | 55 | 0 | 0 | 0 | 0 | 55 | 0.0% | 0.0% |
| 10.20 RD | 42 | 8 | 6 | 1 | 10 | 17 | 35.7% | 19.0% |
| 10.40 RS | 35 | 6 | 5 | 1 | 8 | 15 | 34.3% | 17.1% |
| 10.60 RT | 24 | 7 | 4 | 0 | 2 | 11 | 45.8% | 29.2% |
| 10.80 RM | 33 | 8 | 4 | 0 | 5 | 16 | 36.4% | 24.2% |
| 150.7 Garden suites | 37 | 1 | 0 | 6 | 0 | 30 | 18.9% | 2.7% |
| 150.8 Laneway suites | 36 | 1 | 0 | 0 | 0 | 35 | 2.8% | 2.8% |
| 150.10 Secondary suites | 6 | 0 | 0 | 0 | 0 | 6 | 0.0% | 0.0% |
| **Total excl. definitions (incl. R zone)** | 420 | 40 | 22 | 9 | 46 | 303 | 16.9% | 9.5% |
| **Total excl. definitions and R zone** | 365 | 40 | 22 | 9 | 46 | 248 | 19.5% | 11.0% |

**Envelope-affecting only, excluding R and definitions:** 310 regulations → V 40 · P 22 · C 9 · A 40 · U 199 → **22.9 % captured, 12.9 % verbatim** **[measured]**.

### 2.3 COVERAGE — per topic (excl. R zone and definitions) **[measured]**

| Topic | In-scope regs | V | P | C | A | U | Captured (V+P+C) | Verbatim (V) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| garden suite | 37 | 1 | 0 | 6 | 0 | 30 | 18.9% | 2.7% |
| laneway suite | 36 | 1 | 0 | 0 | 0 | 35 | 2.8% | 2.8% |
| setbacks | 33 | 17 | 0 | 0 | 9 | 7 | 51.5% | 51.5% |
| principal building general | 30 | 0 | 0 | 0 | 0 | 30 | 0.0% | 0.0% |
| height | 27 | 1 | 2 | 2 | 9 | 13 | 18.5% | 3.7% |
| ancillary building | 27 | 0 | 0 | 0 | 0 | 27 | 0.0% | 0.0% |
| parking | 27 | 1 | 6 | 1 | 4 | 15 | 29.6% | 3.7% |
| platforms/encroachments | 20 | 0 | 1 | 0 | 7 | 12 | 5.0% | 0.0% |
| building length | 16 | 7 | 1 | 0 | 4 | 4 | 50.0% | 43.8% |
| separation | 14 | 0 | 0 | 0 | 2 | 12 | 0.0% | 0.0% |
| building types/conversion | 14 | 0 | 2 | 0 | 0 | 12 | 14.3% | 0.0% |
| lot frontage | 11 | 0 | 1 | 0 | 0 | 10 | 9.1% | 0.0% |
| floor area/FSI | 11 | 0 | 4 | 0 | 0 | 7 | 36.4% | 0.0% |
| lot area | 11 | 0 | 0 | 0 | 0 | 11 | 0.0% | 0.0% |
| lot coverage | 9 | 0 | 4 | 0 | 0 | 5 | 44.4% | 0.0% |
| building depth | 9 | 4 | 0 | 0 | 1 | 4 | 44.4% | 44.4% |
| height/storeys | 8 | 1 | 1 | 0 | 6 | 0 | 25.0% | 12.5% |
| driveway | 6 | 2 | 0 | 0 | 4 | 0 | 33.3% | 33.3% |
| secondary suite | 6 | 0 | 0 | 0 | 0 | 6 | 0.0% | 0.0% |
| general/interpretation | 5 | 0 | 0 | 0 | 0 | 5 | 0.0% | 0.0% |
| landscaping | 5 | 5 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| ancillary/pool | 3 | 0 | 0 | 0 | 0 | 3 | 0.0% | 0.0% |

### 2.4 Uncaptured regulations

**Appendix 2** lists all **558** regulations graded U or A that are not out-of-scope, deleted, or unused definitions. Each row has a one-line gist (the page's own first 150 characters) and a relevance call **[measured list, inferred relevance]**.

High-value uncaptured regulations (envelope-affecting, used in a typical buyer question) **[read]**:
- **10.5.40.60(2)–(8)**: canopies, stairs, cladding, architectural features, bay windows, dormers, equipment encroachments.
- **10.5.40.71(1)–(6)**: lawfully-existing setbacks and the narrow-lot (≤ 12.2 m) addition rules.
- **10.5.40.10(1)–(5)**: how height is measured, and the rooftop exemptions.
- **10.5.40.40(1)–(3),(5)**: attic and basement GFA inclusion, how FSI is calculated.
- **10.5.60.x (27)**: ancillary building / garage / pool setbacks, the 2.5 / 4.0 m height cap, the 60 / 40 m² floor-area cap by frontage, the 10 % ancillary coverage.
- **10.5.80.10(4),(6),(7)** and **10.5.80.40(1)–(3)**: front-yard parking, corner-lot parking, garage-door width and elevation, access from the lane.
- **10.5.100.1(2),(3)**: driveway width outside the front yard, and for houseplexes.
- **10.20.40.10(2)–(8)**: main-wall height pairs, storeys, flat-roof walls, entrance height, dormer width.
- **10.20.40.70(4),(5),(7)**: the ±0.3 m side-yard shift, 7.5 m side yards beyond depth for frontage over 18 m, major streets.
- RS/RT/RM equivalents of the above.
- **10.x.30.10**: lot area. **10.x.40.1**: one building per lot, orientation, minimum unit width, unit count.
- **150.8** (35 / 36) and **150.7** (30 / 37) almost entirely.
- **150.10.40.40**: secondary suite ≤ 45 % of the unit's interior floor area.
- **5.10.40.70(2),(5)** and **5.10.30.20**: front-line designation for corner and through lots.

---

## 3. Field gap — requested fields vs what exists

| Field | Exists today? | Where today | Source for the new table | Mechanical check possible |
| --- | --- | --- | --- | --- |
| Citation (reg id) | yes for 154 regs (57 V + 23 P + 11 C + 63 A) **[measured]** | ledger / anchors / NF cells / code | **generated**: the article + regulation id from the page parse; clause ids (A)(B)(i) from a sub-parse | yes — the id must exist in the page parse |
| Verbatim | full for 57, partial for 23 **[measured]** | L / G / H / C | **generated**: slice the page between regulation boundaries (100 % of the universe, 0 mismatches) | yes — byte slice + sha256 |
| URL | yes for verbatim captures | generator output | generated (page URL + `#reg` id) | yes |
| fetched_at | yes, but **taken from file mtime**. Copying the legacy pages on 2026-10-06 changed every fetched_at **[measured]** | gen.js `fs.statSync().mtime` | manifest (`fetched_at`, sha256, consolidation "Version Date … up to <date>" string) | yes |
| Amendment provenance | **no field**, though the page carries `[ By-law: 648-2025 ]` tags on 73 in-scope regs (849-2025: 10, 847-2025: 5) **[measured]** | — | generated: parse the `[ By-law: … ]` tags per regulation | yes |
| Explanation (buyer-facing) | **no field**. Prose exists in the report matrix / additional-provisions table and in the landscaping bullets **[read]** | report §"Full verified matrix", ledger bullets | authored in the sidecar (LLM draft + review), with closed rules: must mention every numeric literal of the expression; no "ensures" | partly (literal coverage) |
| Numeric expression | **no field**. Implicit in NF "Formula / source" SQL and in code constants **[read]** | NF rows, `calc.js`, `optimal-config.js` | authored in the sidecar in a small DSL (e.g. `side_setback_m = band(required_min_frontage_m; <6:0.6, <12:0.9, …)`) | **yes — every numeric literal must occur in the verbatim (with unit), every variable must be in a closed vocabulary**. 227 / 420 in-scope regs contain a numeric literal with unit (metres 575×, percent 70×, % 27×, m² 24×) **[measured]** |
| Application (zone / building type / lot condition) | **no field**. Zone is implied by chapter; scope phrases are in the verbatim **[read]** | — | generated draft: zone from chapter (10.20 → RD, 10.5 → all R-category); building types from phrases (276 / 420 in-scope regs name a building type); lot conditions (233 / 420 mention corner / through / frontage / depth / major street / lane / overlay) **[measured]**; then confirmed in the sidecar | yes — every application token must be backed by a phrase in the verbatim or the chapter scope |
| Calc-handling | **partial**, only via NF / EF rows (formula + constraints + status) and code constants **[read]** | plan / Spec 58 §13 / Spec 67 §3.4–3.5 | sidecar, closed set: `modelled:<column/NF id>` · `partially-modelled:<what is missing>` · `not-modelled:<reason>` · `informational` · `user-input:<field>` · `overridden-by:<reg or Ch.900>` · `precedence:<despite-target>` | yes — the column / NF id must exist (`MAX_BUILD_COLS` / plan), the despite-target must exist in the universe (90 / 420 in-scope regs begin "Despite …" and 172 cross-reference another regulation) **[measured]** |
| Verification status | V/P/C/A/U grade (this audit) + App. A status | — | generated per run (slice sha256 vs manifest, sidecar literal checks) | yes |

---

## 4. Generator state

**What the legacy generators do [read + measured]:**
- `spec67-gen/gen.js` (422 lines):
  - fetches 10 pages and normalizes them (`norm.js`);
  - asserts byte equality across plan ↔ Spec 58 §13 for 5 sections;
  - enumerates as-built columns by parsing the SQL that `buildMaxBuildSql` / `buildEnrichmentSql` generate (`sqlparse.js`) and the drizzle schema;
  - extracts double-quoted claims from NF cells and the report's verbatim record and verifies them as ordered fragments;
  - re-verifies ledger L1–L28;
  - extracts the G anchors and H anchors (`suite-extract.js`) with uniqueness checks, plus absence counts;
  - self-checks `calc.js` against the plan's V-vectors;
  - renders 6 worked examples from DB captures (`*-data.json`) and assembles `template.md` → Spec 67 (`--write`).
- `landscaping-gen/gen.js` (201 lines): runs ledger substring and absence checks, then emits the NF-20..NF-28 rows and the landscaping section.
- **Today's run** (`node gen.js --no-fetch`): failures `[]`; claims 76 (60 / 12 / 4); ledger 28/28; G 23/23; vectors 24/24 (1 skipped). The output equals committed Spec 67 apart from timestamps and the R-BE `<!-- generated:target-files -->` block, which `--write` would clobber **[measured]**.

**Gaps relative to McBYLAW [read]:**
1. **No universe.** It verifies the quotes people chose, so it cannot say what is missing. This is the reason exhaustiveness was never measured.
2. **Verbatim units are arbitrary.** G1 spans 3 regulations, L5 is one clause, and C* are fragments with "...". None is aligned to the by-law's own ids.
3. **Hand-authored content lives inside the generator source**: the NF-20..NF-28 cell text and plain-language bullets in `landscaping-gen/gen.js`, and `G_FINDINGS` and `SCOPE` prose in `spec67-gen`. This contradicts "populated by a generator, never by hand". The prose belongs in a keyed sidecar that the generator validates.
4. **fetched_at = file mtime.** Provenance broke when the files were copied **[measured]**.
5. **Fixed page list (10).** Missing: Ch.5, 10.10, 150.10, Ch.900 and Ch.1/2. Spec 67 Appendix E pulls 40.5 / 40.10 / readme ad hoc.
6. **Hard-coded `C:/Users/User/Buildo`.** It requires live repo modules and DB-capture JSONs, and the worked examples (derwyn / ex2 / exgen) are Spec-67-specific.
7. No numeric-expression / application / calc-handling fields, and no amendment-tag parsing.

**Should they be the base?** Yes for the **engine pieces**, no for the **data model**. Reuse:
- `norm.js` (the single normalizer);
- the ordered-fragment `locate` / `verify` from `claims.js`, which re-verifies legacy claims against the new rows;
- the anchor extractor;
- absence-count checks;
- the SQL enumeration (`sqlparse.js`) for the calc-handling column check;
- the byte-equality asserts.

Replace the unit of record with **one row per regulation (plus clause sub-rows), sliced from the page**. Keep L/G/H/C ids only as legacy aliases mapped to regulation ids, as this audit's `audit.js` does.

**Relation to the queued `wf2_spec67_generator_check` [read]:** that plan lands the legacy generators as a `--check` drift test. That remains useful, since it locks Spec 67 / Spec 58 / plan consistency. Two caveats:
- Its Step 2 snapshot + manifest (sha256, URL, fetched_at) is exactly what McBYLAW needs. Do it **once** and share it.
- Its `--check` asserts that the current claims still verify, which would freeze the 12 UNVERIFIED claims and the stale 150.7 constants as "expected".

Recommended order: land the shared page-snapshot + manifest + universe parser first (McBYLAW Phase 1 step 1), then build the `--check` on top of it. Fold `wf1_bylaw_provisions_table` into McBYLAW: its `bylaw_provisions` table is the persistence target of this generator, and its plan to "port NF claim citations as first content" should change to "seed from the page universe".

---

## 5. Open research

### 5.1 Already flagged in the material (still open) **[read]**
- **§10.5.40.71 narrow-lot / lawfully-existing** (report citation ledger: "still only summarized"). The text is now sliced: (1)–(6), with (3) applying to frontage ≤ 12.2 m and (4) to rear/side additions. It needs as-built facts, so it is the *existing-building* class.
- **§10.5.80.10 parking** (summarized only). Only (3) is verbatim (L16); (4) front-yard parking, (5) secondary-suite exception, (6) corner lot and (7) rear-yard maximum of 2 are uncaptured.
- **RT/RM corner clauses.** A1 is count-verified: no RS/RT/RM analogue of RD 10.20.40.70(6). But 5.10.30.20(1) designates the front lot line of a corner lot, and 10.5.60.20(3)(C) covers ancillary side yards on corners. Both are uncaptured.
- **Spec 67 §9 operator decisions 1–9:**
  - KFM-4: required frontage vs measured frontage;
  - KFM-5: does NF-10 cap width or length;
  - KFM-6: RD caps only when required frontage ≤ 18 m;
  - R1: retire the coverage-median default;
  - the "NULL, don't guess" fallback;
  - major-street clauses;
  - KFM-12: FSI read from `bylaw_max_density`;
  - KFM-13: garden-suite area base;
  - KFM-14: STAND_SET as CR selector.
- **Plan research-required rows:** NF-3, NF-4, NF-20, NF-23. Shared driveways (L27), parking pad vs 10.5.80.11(3) City of Toronto Act permit (L28), at-grade patios (L24).

### 5.2 New findings from this audit
1. **Garden-suite constants are stale against the in-force text (849-2025) [measured: page text read by slice].**

| Constant (`optimal-config.js` / Spec 78 P2.1) | Code | Current by-law text | Status |
| --- | --- | --- | --- |
| `GARDEN_FOOTPRINT_REAR_FRAC` 0.4 → cites 150.7.60.70(1)(C)(i) | 40 % of rear yard | 150.7.60.70(1) now has no (C). It reads (A) all buildings ≤ 45 % of lot, **or** (B) suite excluded from coverage and all ancillary ≤ 20 % of lot; (i)/(ii) = overlay value / no coverage for the house | **stale — the cited clause no longer exists** (the "2025 DRAFT … NOT enacted" note in code / Spec 78 is out of date) |
| `GARDEN_FOOTPRINT_MAX_SQM` 60 → cites (1)(C)(ii) | 60 m² footprint | 150.7.60.50(4): GFA ≤ 120 m², ≤ 60 m² if one storey; (2): < house GFA | stale citation; the value coincides only for one storey |
| `GARDEN_HEIGHT_HIGH_M` 6.0 | 6.0 m | 150.7.60.40(1)(B): **6.3 m** at ≥ 7.5 m from the house | **stale** |
| `GARDEN_HEIGHT_LOW_M` 4.0 "@ 5.0–7.5 m" | 4.0 m | (A) 4.0 m when **< 7.5 m** | value ok, condition stale |
| `GARDEN_SEP_LOW_M` 5.0 | 5.0 m | 150.7.60.30(1)(A): **4.0 m** if suite height ≤ 4.0 m; (C) east-end area exception | **stale** |
| `ANCILLARY_COVERAGE_MAX_FRAC` 0.2, `SEP_HIGH` 7.5, side setback (10 % frontage, 0.6 / 1.5 floor, 3.0 cap), rear 1.5 / >45 m depth | — | 150.7.60.70(1)(B), 150.7.60.30(1)(B), 150.7.60.20(5), 150.7.60.20(2)(A)(B) | match; new **(2)(C) +1.5 m for rear openings above 4.0 m** is not modelled |
| `LANEWAY_FOOTPRINT_MAX_SQM` 60 "(8.0 × 10.0)" | 60 m² | 150.8.60.30(5) length 10.0 m, (6) width 8.0 m ⇒ 80 m² **[inferred arithmetic]**; 150.8.60.70(1)(B) all ancillary ≤ **30 % of lot**; 150.8.60.40(1)(B) **6.3 m** | stale / internally inconsistent |
| `max-build.js` `GARAGE_MAX_GFA_SQM` 60 | 60 m² | 10.5.60.50(2): total ancillary floor area 60 m² if frontage ≥ 12.0 m, **else 40 m²** | frontage branch missing |
| `max-build.js` `ACCESSORY_MAX_COVERAGE_PCT` 0.30 of usable rear yard | 30 % rear yard | 10.5.60.70(1)(B): ancillary ≤ **10 % of lot area** (lifted for houseplex / suite if total ≤ 45 %) | base and value differ |
| `max-build.js` `MIN_SOFT_LANDSCAPING_PCT` 0.30 of lot; `GARDEN_SUITE_MIN_LOT_SQM` 270; `*_MIN_LOT_SQM` 230 | — | no such provision found: "minimum lot area" occurs 0× in 150.7 / 150.8 **[measured]**; rear soft = 50 % / 25 % of **rear yard** (10.5.50.10(3)) | no by-law source — label as heuristic or remove |

   "849-2025" and "847-2025" occur **0×** in Spec 67 and in any repo doc **[measured: grep]**.
2. **Chapter 900 is the dominant layer, not an edge case [measured].**
   - 343,652 / 440,094 residential parcels (78.1 %) have an exception number, across 2,894 distinct zone+exception pairs in use.
   - Concentration of excepted parcels by top-N exceptions: top 10 = 31.5 %, top 50 = 50.5 %, top 200 = 73.4 %.
   - Largest: RD 5 (48,336), RM 252 (19,225), R 736 (7,455), R 737 (6,141), RD 1463 (5,912), RS 312 (5,785).
   - **Read:** RD 5 sets "Despite regulation 10.20.40.70 (3), the minimum side yard setback is 1.8 metres". RD 1463 has no site-specific provisions, only a prevailing North York airport-hazard map + one by-law. Others were not read.
   - Today `enrich-parcels.js:1415` only downgrades confidence (`high` → `medium`) when an exception exists. The as-built `exception_number` value `-1` occurs (R −1: 4,527 parcels) and is unexplained.
3. **R zone is a large uncovered population**: 104,544 parcels, 0 / 55 regulations captured. R has its own building-type side-yard table (10.10.40.70(3): 0.9 m for detached / semi / houseplex / street-fronting townhouse; 7.5 m otherwise), a flat 7.5 m rear yard and a different height structure **[read]**.
4. **RT and RM exist as zone chapters, but zone-level coverage hides clause gaps**, e.g. the 10.60.40.81 and 10.80.40.81 separation exemptions (lawfully-existing buildings) are uncaptured **[measured]**.

### 5.3 How to treat Ch.900 **[inferred recommendation]**
- One mechanism row: 900.1.10(1)–(4) verbatim, with precedence = "site-specific provisions and prevailing by-laws apply despite the zone regulations".
- One `calc-handling = overridden-by:Ch.900` flag on every regulation that an exception can override.
- A **measured backlog**: exceptions ranked by parcel count. Parse each exception into its own provision rows (`900.3.10(5)(A)` …) using the same slicer. The top 50 alone covers half of the excepted parcels.
- Prevailing former by-laws (e.g. 438-86, North York 7625) are **out of scope** for Phase 1. The row says so and the report must say "a former by-law prevails here; not evaluated".

### 5.4 User-input fields the table must reference (closed vocabulary) **[read]**
`building_type` (NF-15), `current_stories` (NF-16), `existing_driveway_type` / `existing_driveway_width_m` / `existing_front_parking_pad` (NF-26..NF-28), `has_secondary_suite` (NF-29).

The universe adds candidates no NF row has yet:
- has garden suite / laneway suite (gates 150.7 / 150.8);
- roof type flat / peaked (10.20.40.10(4),(5), RD exceptions);
- openings in the suite side / rear wall (150.7.60.20(2)(C),(5)(A));
- lawfully-existing status + as-built setbacks (10.5.40.71 family);
- pool;
- unit count / bedrooms for houseplexes (10.20.40.1(5),(8)).

### 5.5 Amendments **[measured tag counts]**
In-scope regulations carrying recent amendment tags: 648-2025 (73 regs, houseplex), 1062-2025 (OLT) and 608-2024 (71 each, major streets), 474-2023 (27), 848-2025 (11), 1313-2023 (11), 849-2025 (10, garden suites), 847-2025 (5, laneway suites). The page header's consolidation cut-off is "City-wide Amendments up to April 30, 2026".

**Not verified:** whether each tagged amendment is in force or under appeal (the page notes that 569-2013 itself has been appealed). The amendment-validation feature should diff page snapshots by regulation sha256 and by the set of `[ By-law: … ]` tags.

---

## 6. Recommendation — Phase 1 scope

1. **Snapshot + manifest + universe**, shared with the queued WF2 `--check`:
   - commit the normalized pages for Ch.1, 2, 5, 10.5, 10.10–10.80, 150.7 / 8 / 10, 200, 800, 900.1, 995, with a manifest of URL, fetched_at, sha256 and consolidation date;
   - port `universe.js` (0 mismatches) plus a clause sub-parser;
   - **Done when:** every in-scope regulation has id, verbatim, URL, fetched_at, sha256 and amendment tags. That is 100 % on those fields by construction.
2. **Sidecar for authored fields**: explanation, numeric expression, application, calc-handling, all closed-response. The generator fails on any missing field and on any literal or token that is not backed by the verbatim. LLM / engine drafts go into the sidecar in batches by topic. The generator, not the author, decides acceptance.
3. **Scope order** (by buyer impact × parcels):
   - (a) RD/RS/RT/RM + 10.5 envelope (220 regs; 61 captured V+P+C, 40 more cited by article only);
   - (b) R zone (+55 regs, +104.5 K parcels);
   - (c) 10.5.60 ancillary + 150.7 / 150.8 / 150.10 (109 regs incl. existing-building), **fixing the stale 150.7 constants first** because they feed live outputs;
   - (d) 69 used definitions;
   - (e) Ch.5 subset + 200.5.1.10(2),(3);
   - (f) Ch.900 mechanism row + top-50 exception backlog as Phase 2.
4. **Seed from the page, not from App. A.** Map the legacy L/G/H/C ids to regulation ids as aliases. The 12 UNVERIFIED claims are dropped, not ported.
5. **Coverage becomes a gated number:** `captured_with_all_fields / universe` per chapter and topic, emitted by the generator on every run. This audit's baseline is **16.9 % captured / 9.5 % verbatim** (all in-scope incl. R) and **0 % with all requested fields**.

---

## Appendix 1 — deduplicated inventory (154 regulations touched by existing material) **[measured]**

"Cited by" lists prose sources with reg-level citations. `(art)` means the article only was cited. Ids: L = ledger, G / H = anchors, C = Appendix A claims.

| Regulation | Topic | Relevance | Grade | Verbatim pieces (L/G/H/C ids) | Cited by | Citation | Verbatim | URL+fetched_at | Explanation | Numeric expr. | Application | Calc-handling | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.5.40.60(1) | platforms/encroachments | envelope-affecting | P | L23 | S58-13, Report, Plan, Ledger, S58-13(art), Report(art), Plan(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | partial (76% of text) |
| 10.5.40.60(2) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(3) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(4) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(5) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(6) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(7) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.60(8) | platforms/encroachments | envelope-affecting | A | — | S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.70(1) | setbacks | envelope-affecting | V | G19, C56 | S67, S58-13, Report, Plan, G | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-5,NF-6 | generator substring PASS |
| 10.5.40.71(1) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.71(2) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.71(3) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.71(4) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.71(5) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.40.71(6) | setbacks | existing-building | A | — | S67(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.50.10(1) | landscaping | envelope-affecting | V | L4, L5, L6, L7, L8, C14, C20, C25 +6 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-12,NF-20,NF-21,NF-22,NF-26,NF-28 | generator substring PASS |
| 10.5.50.10(2) | landscaping | envelope-affecting | V | L9, C17, C61 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-14 | generator substring PASS |
| 10.5.50.10(3) | landscaping | envelope-affecting | V | L10, C16, C60 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-13 | generator substring PASS |
| 10.5.50.10(4) | landscaping | out-of-scope | V | L11 | S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.5.50.10(5) | landscaping | out-of-scope | V | L12 | S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.5.50.10(6) | landscaping | envelope-affecting | V | L13 | S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.5.50.10(7) | landscaping | envelope-affecting | V | L14 | S58-13, Report, Plan, Ledger, S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.5.80.10(1) | parking | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(2) | parking | out-of-scope | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(3) | parking | envelope-affecting | V | L16, C41 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-28 | generator substring PASS |
| 10.5.80.10(4) | parking | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(5) | parking | envelope-affecting | C | — | S67, S58-13, Report, Plan, S67-AppA(art), Report(art) | yes | no | no | prose (report/spec narrative) | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(6) | parking | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(7) | parking | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(8) | parking | informational | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(9) | parking | informational | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.80.10(10) | parking | informational | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(1) | driveway | envelope-affecting | V | L15, C31 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-23,NF-27 | generator substring PASS |
| 10.5.100.1(2) | driveway | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(3) | driveway | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(4) | driveway | out-of-scope | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(5) | driveway | out-of-scope | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(6) | driveway | envelope-affecting | V | L17 | S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.5.100.1(7) | driveway | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.5.100.1(8) | driveway | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.30.20(1) | lot frontage | envelope-affecting | P | G5 | S67, Plan, G, S67(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | partial (37% of text) |
| 10.20.30.40(1) | lot coverage | envelope-affecting | P | G7, H7, C8, C19, C65, C73 | S67, S58-13, Report, Plan, G, H, S67-AppA(art), Report(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-8,NF-18,NF-29,NF-30 | partial (69% of text) |
| 10.20.40.10(1) | height | envelope-affecting | P | G6, H15, C76 | S67, S58-13, Report, Plan, G, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-7,NF-31 | partial (57% of text) |
| 10.20.40.10(2) | height | envelope-affecting | C | — | S67, S67-AppA(art) | yes | no | no | prose (report/spec narrative) | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.10(3) | height/storeys | envelope-affecting | P | H16 | S67, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | partial (15% of text) |
| 10.20.40.10(4) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.10(5) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.10(6) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.10(7) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.10(8) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.20(1) | building length | envelope-affecting | V | G3 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-10 | generator substring PASS |
| 10.20.40.20(2) | building length | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.20(3) | building length | envelope-affecting | V | H17 | S67, H, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.20.40.20(4) | building length | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.30(1) | building depth | envelope-affecting | V | G4 | S67, S58-13, Report, Plan, G, S67-AppA(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-11 | generator substring PASS |
| 10.20.40.30(2) | building depth | envelope-affecting | V | H18 | H, S67-AppA(art) | yes | full | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.20.40.40(1) | floor area/FSI | envelope-affecting | P | G8, H8, C9, C66, C75 | S67, S58-13, Report, Plan, G, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-9,NF-29,NF-31 | partial (73% of text) |
| 10.20.40.70(1) | setbacks | envelope-affecting | V | G1 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,EF-4 | generator substring PASS |
| 10.20.40.70(2) | setbacks | envelope-affecting | V | G1, C2 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-2 | generator substring PASS |
| 10.20.40.70(3) | setbacks | envelope-affecting | V | G1, C53 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-3 | generator substring PASS |
| 10.20.40.70(4) | setbacks | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.70(5) | setbacks | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.40.70(6) | setbacks | envelope-affecting | V | G2, C5 | S67, S58-13, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-4 | generator substring PASS |
| 10.20.40.70(7) | setbacks | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.20.80.1(1) | parking | envelope-affecting | P | L18, C22 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-20 | partial (18% of text) |
| 10.40.20.20(1) | permitted uses | informational | C | — | S67, H | yes | no | no | prose (report/spec narrative) | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.20.40(1) | building types/conversion | envelope-affecting | P | H19 | — | yes | partial | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | partial (89% of text) |
| 10.40.30.40(1) | lot coverage | envelope-affecting | P | H9, C8, C19, C67 | S67, S58-13, Report, Plan, H, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-29,NF-8,NF-18 | partial (44% of text) |
| 10.40.40.10(1) | height | envelope-affecting | C | — | S67, S58-13, Report, Plan, S67-AppA(art) | yes | no | no | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-7 | cited only — text not captured |
| 10.40.40.10(2) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.10(3) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.10(4) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.10(5) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.10(6) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.20(1) | building length | envelope-affecting | V | G10 | S67, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.40.40.20(2) | building length | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.20(3) | building length | envelope-affecting | A | — | S67-AppA(art), Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.40.40.20(4) | building length | envelope-affecting | P | C11 | S67-AppA(art), Report(art) | yes | partial | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | partial (28% of text) |
| 10.40.40.30(1) | building depth | envelope-affecting | V | G11 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-11 | generator substring PASS |
| 10.40.40.30(2) | building depth | envelope-affecting | A | — | S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | NF-11 | cited only — text not captured |
| 10.40.40.40(1) | floor area/FSI | envelope-affecting | P | H10, H23, C9, C68 | S67, S58-13, Report, Plan, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-9,NF-29 | partial (72% of text) |
| 10.40.40.70(1) | setbacks | envelope-affecting | V | G9 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.40.40.70(2) | setbacks | envelope-affecting | V | G9, C2 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.40.40.70(3) | setbacks | envelope-affecting | V | G9 | S67, S58-13, Report, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-3,NF-1,NF-2 | generator substring PASS |
| 10.40.40.70(4) | setbacks | envelope-affecting | V | G9 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.40.80.1(1) | parking | envelope-affecting | P | L18, C22 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-20 | partial (18% of text) |
| 10.60.20.20(1) | permitted uses | informational | C | — | S67, H | yes | no | no | prose (report/spec narrative) | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.60.20.40(1) | building types/conversion | envelope-affecting | P | H20 | — | yes | partial | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | partial (88% of text) |
| 10.60.30.40(1) | lot coverage | envelope-affecting | P | H11, C8, C19, C69 | S67, S58-13, Report, Plan, H, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-29,NF-8,NF-18 | partial (44% of text) |
| 10.60.40.10(1) | height | envelope-affecting | V | G14 | S67, S58-13, Report, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-7 | generator substring PASS |
| 10.60.40.10(2) | height/storeys | envelope-affecting | V | G14 | S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.60.40.20(1) | building length | envelope-affecting | V | G13, C11 | S67, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.60.40.40(1) | floor area/FSI | envelope-affecting | P | H12, H24, C9, C70 | S67, S58-13, Report, Plan, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-9,NF-29 | partial (71% of text) |
| 10.60.40.70(1) | setbacks | envelope-affecting | V | G12, C47 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.60.40.70(2) | setbacks | envelope-affecting | V | G12, C3, C48 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.60.40.70(3) | setbacks | envelope-affecting | V | G12 | S67, S58-13, Report, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-3,NF-1,NF-2 | generator substring PASS |
| 10.60.40.70(4) | setbacks | envelope-affecting | V | G12 | S67, Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1,NF-2 | generator substring PASS |
| 10.60.40.80(1) | separation | envelope-affecting | A | — | Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.60.40.80(2) | separation | envelope-affecting | A | — | Report(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.60.80.1(1) | parking | envelope-affecting | P | L18, C22 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-20 | partial (18% of text) |
| 10.80.30.40(1) | lot coverage | envelope-affecting | P | H13, C8, C19, C71 | S67, S58-13, Report, Plan, H, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-29,NF-8,NF-18 | partial (47% of text) |
| 10.80.40.10(1) | height | envelope-affecting | P | G18, C7, C46 | S67, S58-13, Report, Plan, G, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-7 | partial (39% of text) |
| 10.80.40.10(2) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.80.40.10(3) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.80.40.10(4) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.80.40.10(5) | height/storeys | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.80.40.10(6) | height | envelope-affecting | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 10.80.40.20(1) | building length | envelope-affecting | V | G16 | Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.80.40.20(2) | building length | envelope-affecting | V | G16 | Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.80.40.20(3) | building length | envelope-affecting | V | G16, C11 | Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 10.80.40.30(1) | building depth | envelope-affecting | V | G17 | Plan, G, S67(art), S67-AppA(art), S58-13(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-11 | generator substring PASS |
| 10.80.40.40(1) | floor area/FSI | envelope-affecting | P | H14, H25, C9, C72 | S67, S58-13, Report, Plan, H, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-9,NF-29 | partial (72% of text) |
| 10.80.40.70(1) | setbacks | envelope-affecting | V | G15, C50 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-1 | generator substring PASS |
| 10.80.40.70(2) | setbacks | envelope-affecting | V | G15, C2, C51 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-2 | generator substring PASS |
| 10.80.40.70(3) | setbacks | envelope-affecting | V | G15 | S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-3 | generator substring PASS |
| 10.80.40.70(4) | setbacks | envelope-affecting | V | G15 | S67, S58-13, Report, Plan, G, S67-AppA(art), Report(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-3 | generator substring PASS |
| 10.80.80.1(1) | parking | envelope-affecting | P | L18, C22 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-20 | partial (18% of text) |
| 150.7.50.10(1) | garden suite | envelope-affecting | V | L20, C34 | S67, S58-13, Report, S78, Plan, Code-optimal-config, Ledger, S67(art), S67-AppA(art), Report(art), Plan(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-24; optimal-config constant | generator substring PASS |
| 150.7.60.20(2) | garden suite | envelope-affecting | C | — | S78, Code-optimal-config | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | optimal-config constant | cited only — text not captured |
| 150.7.60.20(5) | garden suite | envelope-affecting | C | — | S78, Code-optimal-config | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | optimal-config constant | cited only — text not captured |
| 150.7.60.30(1) | garden suite | envelope-affecting | C | — | S78, Code-optimal-config | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | optimal-config constant | cited only — text not captured |
| 150.7.60.40(1) | garden suite | envelope-affecting | C | — | S78, Code-optimal-config | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | optimal-config constant | cited only — text not captured |
| 150.7.60.50(2) | garden suite | envelope-affecting | C | — | S78 | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 150.7.60.70(1) | garden suite | envelope-affecting | C | — | S78, Code-optimal-config | yes | no | no | — | implicit (NF formula / code const) | no (zone implied by chapter) | optimal-config constant | cited only — text not captured |
| 150.8.50.10(1) | laneway suite | envelope-affecting | V | L21, C35 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | full | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-25 | generator substring PASS |
| 200.5.1.10(1) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(2) | parking | envelope-affecting | P | L25, C32 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-23 | partial (19% of text) |
| 200.5.1.10(3) | parking | envelope-affecting | P | L26, C33 | S67, S58-13, Report, Plan, Ledger, S67-AppA(art) | yes | partial | yes (page-level) | prose (report/spec narrative) | implicit (NF formula / code const) | no (zone implied by chapter) | NF-23 | partial (38% of text) |
| 200.5.1.10(5) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(6) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(7) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(8) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(9) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(10) | parking | out-of-scope | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(11) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(12) | parking | out-of-scope | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(13) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 200.5.1.10(14) | parking | informational | A | — | S67-AppA(art) | yes | no | no | — | no | no (zone implied by chapter) | — | cited only — text not captured |
| 800.50(100) | definition | definition-used | V | G20 | S67, Plan, G | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(105) | definition | definition-used | V | G20 | S67, Plan, G | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(181) | definition | definition-used | V | H1, C63 | S67, S58-13, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(285) | definition | definition-used | V | H5 | S67, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(395) | definition | definition-used | V | L1, C21, C23, C39 | S67, S58-13, Report, Plan, Ledger | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(435) | definition | definition-used | V | H4, C74 | S67, S58-13, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(440) | definition | definition-used | V | G21 | G | yes | full | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(445) | definition | definition-used | V | G21 | G | yes | full | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(457) | definition | definition-used | V | G22 | Plan, G | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(650) | definition | definition-used | V | H6 | S67, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(735) | definition | definition-used | V | H3, C62 | S67, S58-13, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(745) | definition | definition-used | V | H21 | S67, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(746) | definition | definition-used | V | H2, C64 | S67, S58-13, Report, Plan, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(780) | definition | definition-used | V | L2, C24 | S67, S58-13, Report, Plan, Ledger | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 800.50(865) | definition | definition-used | V | H22 | S67, H | yes | full | yes (page-level) | prose (report/spec narrative) | no | no (zone implied by chapter) | — | generator substring PASS |
| 995.10.1(1) | general/interpretation | informational | P | G23 | G | yes | partial | yes (page-level) | topic label only | no | no (zone implied by chapter) | — | partial (88% of text) |

## Appendix 2 — uncaptured regulations (grade U or A; excludes out-of-scope / deleted / unused definitions) **[measured list · inferred relevance]**

#### Ch.1 Administration — 12 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 1.5.1(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Title This By-law is known as the "Zoning By-law for the City of Toronto". |
| 1.5.1(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Internal Reference Any references to "this By-law" means the Zoning By-law for the City of Toronto. |
| 1.5.2(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Purpose and Intent This By-law regulates the use of land, the bulk, height, location, erection and use of buildings and structures, the provision of p… |
| 1.5.3(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Licences, Permits and Other By-laws This By-law does not relieve any person from complying with the requirements of any other by-law of the City of To… |
| 1.5.4(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Defined Terms If words, terms, or phrases are highlighted in bold type in this By-law, they have the meaning provided in Chapter 800 Definitions. |
| 1.5.5(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Zoning By-law Map The Zoning By-law Map is found in Section 990.10 Zoning By-law Map. |
| 1.5.6(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Former General Zoning By-laws are not Repealed Nothing in this By-law repeals the provisions of the Former General Zoning By-laws. |
| 1.5.6(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Former General Zoning By-laws are Superseded by this By-law This By-law supersedes the Former General Zoning By-laws where it applies. |
| 1.5.7(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Lands Subject to this By-law This By-law applies to all the lands in the City of Toronto, except for those lands depicted on the Zoning By-law Map in … |
| 1.5.8(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Items that are Part of this By-law The following are part of this By-law: (A) Table of Contents; (B) Maps and Tables; and (C) a drawing or other visua… |
| 1.5.9(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Items that are not Part of this By-law The following are not part of this By-law: (A) headings and titles in the body of this By-law are included for … |
| 1.5.10(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Validity Should any regulation of this By-law be declared by a court of competent jurisdiction to be invalid, the invalidity of that regulation does n… |

#### Ch.2 Compliance — 25 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 2.1.1(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Uses to Conform with this By-law No person may use or permit the use of any land, building or structure except in conformity with this By-law. |
| 2.1.1(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Buildings and Structures to Comply with this By-law No person may use, erect or alter a building or structure that does not comply with this By-law.… |
| 2.1.1(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Lands to Comply with this By-law A lot may not be reduced in area either by severance, conveyance, transfer of ownership or otherwise, unless the rema… |
| 2.1.1(4) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Reduction of Lot Area - Conveyance to a Public Authority If a conveyance or dedication required by a Federal, Provincial or Municipal government, or a… |
| 2.1.2(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Continuation of Existing Variances All minor variances applied for prior to the enactment of this By-law and finally approved pursuant to Section 45 o… |
| 2.1.2(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Continuation of Finally Approved Variances After the expiration of the exemption period in Clause 2.1.3.7, any finally approved minor variances under … |
| 2.1.2(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Minor Variance - Application of Former General Zoning By-laws The Former General Zoning By-laws, including the definitions, apply to assist in the int… |
| 2.1.3.1(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Transition Clause General Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.2(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Building Permit Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.2(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Building Permit Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.3(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Zoning Certificate Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.3(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Zoning Certificate Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.3(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Zoning Certificate Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.4(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Transition: Minor Variance Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.4(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Minor Variance Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.4(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Minor Variance Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.5(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Site Plan Approval Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.5(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Site Plan Approval Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.5(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Site Plan Approval Applications Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.6(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Other Approvals and Agreements Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.6(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Other Approvals and Agreements Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.6(3) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Other Approvals and Agreements Deleted in accordance with Regulation 2.1.3.8, May 9, 2018. [ By-law: 569-2013 ] |
| 2.1.3.7(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Transition Clause Application Nothing in this By-law applies so as to continue the application of Clauses 2.1.3.1 to 2.1.3.6 beyond the issuance of th… |
| 2.1.3.7(2) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Transition Clause Duration In no case do the exemptions mentioned in Clauses 2.1.3.1 to 2.1.3.6 continue beyond the repeal of this transition section.… |
| 2.1.3.8(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Transition Clause Repeal Clauses 2.1.3.1 to 2.1.3.6 are repealed five years after May 9, 2013. [OMB PL130592 Sept 13,2016] [ By-law: OMB PL130592 Sept… |

#### Ch.5 All zones (5.10) — 34 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 5.10.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of Chapter The regulations in Chapter 5, "Regulations Applying to All Zones", apply to all lands, uses, buildings and structures. |
| 5.10.1.10(2) | U | general/interpretation | informational — interpretation / application clause | Multiple Uses On a Lot If a lot is used for more than one permitted use, the regulations which apply to each permitted use on the lot are applied as i… |
| 5.10.1.10(3) | U | general/interpretation | informational — interpretation / application clause | Specific Uses If the zone regulation identifies a use as being a permitted use with conditions, and the condition requires compliance with the specifi… |
| 5.10.1.10(4) | U | general/interpretation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Substantial Demolition A building is not lawfully existing if 50% or more of the main walls of the first storey, or above, are removed or replaced.… |
| 5.10.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Availability of Services No land may be used and no building or structure may be erected or used on the land unless: (A) the land abuts an existing st… |
| 5.10.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Fronting on a Street Except for a Parcel of Tied Land, a building or structure may not be erected or used, on any lot that does not abut a street. For… |
| 5.10.30.1(3) | U | general/interpretation | informational — interpretation / application clause | Lot with Reserve Along Street - No Access If a lot is separated from a street by a 0.3 metre reserve and the lot does not abut another street, the lot… |
| 5.10.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Designated Front Lot Line for Corner Lots The lot line or contiguous lot lines separating a corner lot from one street or one street segment may be se… |
| 5.10.30.20(2) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Designated Front Lot Line for Through Lots On a through lot, a lot line abutting a street may be selected as the front lot line if that lot line is no… |
| 5.10.30.40(1) | U | lot coverage | envelope-affecting — barrier-free ramp excluded from coverage | Ramp or Elevating Device Providing Barrier Free Access A pedestrian access ramp or elevating device providing "barrier-free" access to a building or s… |
| 5.10.40.1(1) | U | principal building general | existing-building — non-complying building damaged | Non-Complying Building or Structure Damaged by Acts Beyond Owner's Control If a lawfully existing building or structure does not comply with the build… |
| 5.10.40.1(2) | U | principal building general | existing-building — restoration to safe condition | Non-Complying Building or Structure - Restoration to a Safe Condition If a lawfully existing building or structure does not comply with the building r… |
| 5.10.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Location Restriction Below a Shoreline Hazard Limit or Stable Top-of-Bank On lands under the jurisdiction of the Toronto and Region Conservation Autho… |
| 5.10.40.1(4) | U | principal building general | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Buildings Not Complying With Location Restriction Below a Shoreline Hazard Limit or Stable Top-of-Bank If a lawfully existing buildi… |
| 5.10.40.1(6) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of Building Regulations to Heritage Designated Sites On a heritage designated site, any alteration, erection or placing of, or addition or… |
| 5.10.40.10(1) | U | height | informational — airport flight-path height (rare) | Height of Buildings and Structures - Flight Path If a lot is located under a flight path regulated by the Government of Canada, the permitted maximum … |
| 5.10.40.40(1) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Floor Area Calculation Restriction Below a Shoreline Hazard Limit or Stable Top-of-Bank On lands under the jurisdiction of the Toronto and Region Cons… |
| 5.10.40.40(2) | U | floor area/FSI | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Buildings Not Complying With Floor Area Calculation Restriction Below a Shoreline Hazard Limit or Stable Top-of-Bank Regulation 5.10… |
| 5.10.40.70(1) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Compliance with Required Building Setback No part of a building or structure may be in a required minimum building setback. |
| 5.10.40.70(2) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Parts of a Building to which a Required Building Setback Applies Building setback requirements apply only to all parts of a building or structure abov… |
| 5.10.40.70(3) | U | setbacks | informational — building on more than one lot | Application of Building Setbacks for a Building Located on More Than One Lot If a building is located on more than one lot, the required minimum build… |
| 5.10.40.70(4) | U | setbacks | informational — use outside a building | Minimum Building Setbacks for a Use Not Located Within a Building or Structure A use that is not located inside a building or structure must comply wi… |
| 5.10.40.70(5) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Rear Yard Building Setback for Triangular Shaped Lots If a lot fronts on a street and has no rear lot line, the rear yard required minimum building se… |
| 5.10.40.70(6) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Setback from the Shoreline Hazard Limit or Stable Top-of-Bank On lands under the jurisdiction of the Toronto and Region Conservation Authority pursuan… |
| 5.10.40.70(7) | U | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Buildings Not Complying With Setback from a Shoreline Hazard Limit or Stable Top-of-Bank If a lawfully existing building or structur… |
| 5.10.40.80(1) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Separation Distance from the Shoreline Hazard Limit or Stable Top-of-Bank On lands under the jurisdiction of the Toronto and Region Conservation Autho… |
| 5.10.40.80(2) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Buildings Not Complying With Separation Distance from a Shoreline Hazard Limit or Stable Top-of-Bank If a lawfully existing building… |
| 5.10.50.10(1) | U | general/interpretation | informational — interpretation / application clause | Ramp or Elevating Device Providing Barrier Free Access The area covered by an exterior pedestrian access ramp or exterior elevating device that provid… |
| 5.10.60.1(1) | U | general/interpretation | informational — ancillary buildings general | Ancillary Buildings and Structures Buildings and structures that are ancillary to a permitted use on the same lot, are permitted if they comply with t… |
| 5.10.75.1(1) | U | energy devices | informational — energy devices (yard placement only) | Meaning of Distribution For the purpose of the Clause 5.10.75.1, the term "distribution" means the delivery of energy derived from renewable energy or… |
| 5.10.75.1(2) | U | energy devices | informational — energy devices (yard placement only) | Relation of By-law to Green Energy Act Despite any of the provisions of this By-law, the regulations in this By-law do not apply to: (A) any "renewabl… |
| 5.10.75.1(3) | U | energy devices | informational — energy devices (yard placement only) | Distribution of Energy From Renewable Energy and Cogeneration Energy Sources The distribution of energy derived from renewable energy sources and coge… |
| 5.10.175.1(1) | U | general/interpretation | informational — interpretation / application clause | Fences A fence required by this By-law must comply with the regulations of Chapter 447, Fences, of the City of Toronto Municipal Code, as amended, and… |
| 5.10.175.1(2) | U | general/interpretation | informational — interpretation / application clause | Fences - Exemption from Building Setback Requirements A fence is not required to comply with the required minimum building setbacks. &copy;City of Tor… |

#### 200.5 Parking — 30 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 200.5.1(1) | U | parking | informational — application clause | Application of This Section The regulations in Section 200.5 apply to all parking spaces and drive aisles. |
| 200.5.1(2) | U | parking | informational — collective provision of parking | Requirement to Provide Parking Spaces Parking spaces must be provided collectively for each use on a lot in an amount that complies with the regulatio… |
| 200.5.1.10(1) | A | parking | informational — parking zones A/B rates | Application of Parking Space Rates in Parking Zones A and B A lot located entirely or partly within Parking Zone A or Parking Zone B on the Parking Zo… |
| 200.5.1.10(5) | A | parking | informational — tandem parking (required spaces) | Tandem Parking Spaces A required parking space may not be a tandem parking space, except when it is required for a secondary suite, group home or dupl… |
| 200.5.1.10(6) | A | parking | informational — tandem dimensions | Tandem Parking Space Minimum Dimensions A tandem parking space must have the following minimum dimensions: (A) length of 5.6 metres; (B) width of 2.6 … |
| 200.5.1.10(7) | A | parking | informational — rate calculation | Calculation of Required and Permitted Parking Spaces - Vacant Building Space The minimum and maximum parking space rates for an area of a building tha… |
| 200.5.1.10(8) | A | parking | informational — rate calculation | Calculation of Parking Space Requirement If a parking space rate is expressed as a ratio of parking spaces to the gross floor area, the parking space … |
| 200.5.1.10(9) | A | parking | informational — rounding | Calculation of Parking Space Requirements - Rounding If the calculation of the number of required parking spaces results in a number with a fraction, … |
| 200.5.1.10(11) | A | parking | informational — GFA exclusion of parking | Parking Space Calculation -Gross Floor Area Exclusion The interior floor area of that portion of a building used exclusively for heating, cooling, ven… |
| 200.5.1.10(13) | A | parking | informational — unobstructed access | Parking Space Access Other than stacked parking space and tandem parking spaces, all areas used for parking spaces must have driveway access to a stre… |
| 200.5.1.10(14) | A | parking | informational — EV infrastructure | Electric Vehicle Infrastructure Parking spaces must be equipped with an energized outlet, which is clearly marked and identified for electric vehicle … |
| 200.5.10.1(1) | U | parking | informational — parking-space rates (do not shape the envelope) | Parking Space Rates Off street parking spaces must be provided for every building or structure erected or enlarged, in compliance with Table 200.5.10.… |
| 200.5.10.1(2) | U | parking | informational — parking-space rates (do not shape the envelope) | Provision of Parking Spaces Parking spaces provided for each use may not be: (A) less than the required minimum; or (B) greater than the permitted max… |
| 200.5.10.1(3) | U | parking | informational — parking-space rates (do not shape the envelope) | Parking Space Rate Ancillary Uses A use that is ancillary has the same parking space rate as the use to which it is ancillary. |
| 200.5.10.1(4) | U | parking | informational — parking-space rates (do not shape the envelope) | Parking Space Permission for Uses with No Parking Requirement If a use is not required to provide parking spaces by Table 200.5.10.1 of this By-law, p… |
| 200.5.10.1(5) | U | parking | informational — parking-space rates (do not shape the envelope) | Parking Space Rates - Multiple Uses on a Lot If there are multiple uses on a lot, the respective minimum and maximum parking space rates for each use … |
| 200.5.10.1(7) | U | parking | informational — parking-space rates (do not shape the envelope) | Interpretation of Minimum and Maximum Parking Space Requirement If Table 200.5.10.1 has a minimum and maximum number of parking spaces for a use, the … |
| 200.5.10.1(8) | U | parking | informational — parking-space rates (do not shape the envelope) | Multiple Dwelling Unit Buildings Parking Rates For calculating parking space requirements, a "multiple dwelling unit building" means two or more resid… |
| 200.5.10.1(9) | U | parking | informational — parking-space rates (do not shape the envelope) | Assisted Housing Parking Rates For the purposes of calculating parking space requirements, "assisted housing" means a dwelling unit operated by a non-… |
| 200.5.10.1(10) | U | parking | informational — parking-space rates (do not shape the envelope) | Alternative Housing Parking Rates For the purpose of calculating parking space requirements, "alternative housing" means a dwelling unit or bedsitting… |
| 200.5.10.1(11) | U | parking | informational — parking-space rates (do not shape the envelope) | Reduction of Parking Spaces for Outdoor Patios Despite regulations 200.5.10.1(1) and 200.5.10.11(1)(C) and Table 200.5.10.1, an outdoor patio may occu… |
| 200.5.10.1(12) | U | parking | informational — parking-space rates (do not shape the envelope) | Reduction of Visitor Parking Spaces for Certain Apartment Buildings on Major Streets Despite regulations 200.5.10.1(1) and 200.5.10.11(1)(C) and Table… |
| 200.5.10.11(1) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Parking Space Requirements for a Lawfully Existing Building (A) If the lawful number of parking spaces for a lawfully existing building is less than t… |
| 200.5.10.11(2) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Parking Space Requirements - Addition or Extension of a Lawfully Existing Building Any addition or extension to a lawfully existing building referred … |
| 200.5.10.11(3) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Parking Space Requirement - Change of Use in a Lawfully Existing Building If a lawfully existing building referred to in regulation 200.5.10.11(1) cha… |
| 200.5.10.11(4) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Parking Space Located Off-Site If the required parking spaces for lawful uses in a lawfully existing building are lawfully located o… |
| 200.5.10.11(5) | U | parking | informational — unit-mix / transition / lawful-status definitions | Definition of Lawful For the purposes of Clauses 200.5.10.11, 200.5.200.5 and 200.5.200.50, the words lawful and lawfully highlighted in bold type, in… |
| 200.5.200.5(1) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Electric Vehicle Infrastructure for a Lawfully Existing Building Regulation 200.5.1.10(14) does not apply to a lawfully existing building that was not… |
| 200.5.200.5(2) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Electric Vehicle Infrastructure - Addition or Extension of a Lawfully Existing Building Any addition or extension to a lawfully existing building refe… |
| 200.5.200.5(3) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Electric Vehicle Infrastructure - Change of Use in a Lawfully Existing Building If a lawfully existing building referred to in regulation 200.5.10.11(… |

#### 600 Overlay zones — 1 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 600.5.1.10(1) | U | general/interpretation | informational — administration / interpretation / overlay-map location | Purpose of a Community Overlay District Map A Community Overlay District Map may alter, add or remove some of the regulations affecting the use of lan… |

#### 800.50 Definitions — 54 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 800.50(15) | U | definition | definition-used — term occurs 6x in in-scope regs | Amenity Space means indoor or outdoor space on a lot that is communal and available for use by the occupants of a building on the lot for recreational… |
| 800.50(30) | U | definition | definition-used — term occurs 227x in in-scope regs | Ancillary means naturally and normally incidental, subordinate in purpose or floor area, and exclusively devoted to a permitted use, building or struc… |
| 800.50(55) | U | definition | definition-used — term occurs 124x in in-scope regs | Apartment Building means a building that has five or more dwelling units, with at least one dwelling unit entirely or partially above another, and eac… |
| 800.50(75) | U | definition | definition-used — term occurs 3x in in-scope regs | Average Grade means the average elevation of the existing or finished ground surface, whichever is lower, around all sides of a building or structure,… |
| 800.50(80) | U | definition | definition-used — term occurs 4x in in-scope regs | Basement means any part of a building where the elevation of the midpoint between the lowest part of a floor and the bottom of the joists directly abo… |
| 800.50(90) | U | definition | definition-used — term occurs 6x in in-scope regs | Bicycle Parking Space means an area used for parking or storing a bicycle. |
| 800.50(95) | U | definition | definition-used — term occurs 929x in in-scope regs | Building means a wholly or partially enclosed structure with a roof supported by walls, columns, piers or other structural systems. A vehicle is not a… |
| 800.50(110) | U | definition | definition-used — term occurs 57x in in-scope regs | Building Setback means a horizontal distance measured at a right angle from any lot line to the nearest part of the main wall of a building or structu… |
| 800.50(150) | U | definition | definition-used — term occurs 31x in in-scope regs | Corner Lot means a lot situated, (A) at the intersection of two or more streets having an interior angle of intersection of 135 degrees or less, or (B… |
| 800.50(180) | U | definition | definition-used — term occurs 164x in in-scope regs | Detached House means a building that has one dwelling unit occupying the entire building. |
| 800.50(195) | U | definition | definition-used — term occurs 7x in in-scope regs | Drive Aisle means a vehicle passageway located within an area used for the parking or storage of 3 or more vehicles. |
| 800.50(210) | U | definition | definition-used — term occurs 52x in in-scope regs | Driveway means a passageway providing vehicle access between a street or lane and an area used for the parking, loading or storage of a vehicle. |
| 800.50(215) | U | definition | definition-used — term occurs 7x in in-scope regs | Duplex means a building that has two dwelling units, with one dwelling unit entirely or partially above the other. A detached house that has a seconda… |
| 800.50(220) | U | definition | definition-used — term occurs 209x in in-scope regs | Dwelling Unit means living accommodation for a person or persons living together as a single housekeeping unit, in which both food preparation and san… |
| 800.50(240) | U | definition | definition-used — term occurs 25x in in-scope regs | Established Grade means the average elevation of the ground measured at the two points where the projection of the required minimum front yard setback… |
| 800.50(255) | U | definition | definition-used — term occurs 3x in in-scope regs | First Floor means the floor of any part of a building, other than an area used for parking, that is: (A) directly above a basement; and (B) if there i… |
| 800.50(265) | U | definition | definition-used — term occurs 2x in in-scope regs | Fourplex means a building that has four dwelling units, with at least one dwelling unit entirely or partially above another. A detached house, semi-de… |
| 800.50(275) | U | definition | definition-used — term occurs 14x in in-scope regs | Front Lot Line means the lot line or contiguous lines dividing a lot from a street. |
| 800.50(280) | U | definition | definition-used — term occurs 8x in in-scope regs | Front Wall means any portion of the main wall of a building or structure that faces a front lot line. |
| 800.50(290) | U | definition | definition-used — term occurs 42x in in-scope regs | Front Yard Setback means a horizontal distance on a lot measured at a right angle from the front lot line to the nearest main wall of a building or st… |
| 800.50(303) | U | definition | definition-used — term occurs 85x in in-scope regs | Garden Suite means a self-contained living accommodation for a person or persons living together as a separate single housekeeping unit, in which both… |
| 800.50(315) | U | definition | definition-used — term occurs 8x in in-scope regs | Green Roof means an extension to a building's roof that allows vegetation to grow in a growing medium and which is designed, constructed and maintaine… |
| 800.50(320) | U | definition | definition-used — term occurs 32x in in-scope regs | Gross Floor Area means the sum of the total area of each floor level of a building, above and below the ground, measured from the exterior of the main… |
| 800.50(329) | U | definition | definition-used — term occurs 3x in in-scope regs | Heritage Designated Site means premises included in the City of Toronto Heritage Register designated as being of cultural heritage value or interest u… |
| 800.50(345) | U | definition | definition-used — term occurs 2x in in-scope regs | Home Occupation means a business use within a dwelling unit, living accommodation or ancillary building or structure, where the dwelling unit or livin… |
| 800.50(375) | U | definition | definition-used — term occurs 14x in in-scope regs | Interior Floor Area means the floor area of any part of a building, measured to: (A) the interior side of a main wall; (B) the centreline of an interi… |
| 800.50(400) | U | definition | definition-used — term occurs 31x in in-scope regs | Lane means a public right-of-way that is not for general traffic circulation. |
| 800.50(402) | U | definition | definition-used — term occurs 69x in in-scope regs | Laneway Suite means a self-contained living accommodation for a person or persons living together as a separate single housekeeping unit, in which bot… |
| 800.50(415) | U | definition | definition-used — term occurs 1x in in-scope regs | Loading Space means an area used for the loading or unloading of goods or commodities from a vehicle. |
| 800.50(420) | U | definition | definition-used — term occurs 795x in in-scope regs | Lot means a single parcel or tract of land that may be conveyed in compliance with the provisions of the Planning Act. |
| 800.50(425) | U | definition | definition-used — term occurs 44x in in-scope regs | Lot Area means the horizontal area within all the lot lines of a lot. |
| 800.50(450) | U | definition | definition-used — term occurs 117x in in-scope regs | Lot Line means any boundary of a lot. |
| 800.50(455) | U | definition | definition-used — term occurs 279x in in-scope regs | Main Wall means any exterior wall of a building or structure, including all structural members essential to the support of a roof over a fully or part… |
| 800.50(500) | U | definition | definition-used — term occurs 6x in in-scope regs | Non-Residential Building means a building that does not have a dwelling unit. |
| 800.50(530) | U | definition | definition-used — term occurs 2x in in-scope regs | Park means premises used for conservation, horticulture, or municipally operated public recreation. |
| 800.50(540) | U | definition | definition-used — term occurs 134x in in-scope regs | Parking Space means an area used for the parking or storing of a vehicle. |
| 800.50(600) | U | definition | definition-used — term occurs 12x in in-scope regs | Primary Window means a window in a dwelling unit other than a window of a bedroom, kitchen, bathroom, hallway, or storage area. [ By-law: 1062-2025(OL… |
| 800.50(630) | U | definition | definition-used — term occurs 7x in in-scope regs | Public Utility means premises or facilities used for telecommunications, the transmission and distribution of electricity, the distribution of gas, st… |
| 800.50(645) | U | definition | definition-used — term occurs 21x in in-scope regs | Rear Lot Line means, in the case of: (A) a square or rectangular lot, the lot line opposite the front lot line; (B) a three-sided lot, the point where… |
| 800.50(655) | U | definition | definition-used — term occurs 51x in in-scope regs | Rear Yard Setback means a horizontal distance on a lot measured at a right angle from the rear lot line to the nearest main wall of a building or stru… |
| 800.50(763) | U | definition | definition-used — term occurs 2x in in-scope regs | Short-term Rental means all or part of a dwelling unit, that: (A) is used to provide sleeping accommodations for any rental period that is less than 2… |
| 800.50(765) | U | definition | definition-used — term occurs 49x in in-scope regs | Side Lot Line means any lot line other than a front lot line or a rear lot line. |
| 800.50(770) | U | definition | definition-used — term occurs 101x in in-scope regs | Side Yard means the area on a lot that extends between the front yard and the rear yard of the lot, between the side lot lines and the building's side… |
| 800.50(775) | U | definition | definition-used — term occurs 77x in in-scope regs | Side Yard Setback means a horizontal distance on a lot measured at a right angle from the side lot lines to the nearest main wall of a building or str… |
| 800.50(790) | U | definition | definition-used — term occurs 3x in in-scope regs | Solar Energy means energy from the sun that is converted to produce electrical or thermal energy. |
| 800.50(800) | U | definition | definition-used — term occurs 11x in in-scope regs | Stable means premises used for keeping, boarding, training or breeding horses, mules or other equine animals. |
| 800.50(820) | U | definition | definition-used — term occurs 100x in in-scope regs | Storey means a level of a building, other than a basement, located between any floor and the floor, ceiling or roof immediately above it. |
| 800.50(825) | U | definition | definition-used — term occurs 183x in in-scope regs | Street means a public right-of-way for general traffic circulation. |
| 800.50(830) | U | definition | definition-used — term occurs 1x in in-scope regs | Street Yard means any front yard, rear yard or side yard abutting a street. |
| 800.50(835) | U | definition | definition-used — term occurs 157x in in-scope regs | Structure means anything that is erected, built or constructed of one or more parts joined together. A vehicle is not a structure. |
| 800.50(855) | U | definition | definition-used — term occurs 21x in in-scope regs | Through Lot means a lot, other than a corner lot, that abuts: (A) more than one street; or (B) one street in more than one location. |
| 800.50(870) | U | definition | definition-used — term occurs 4x in in-scope regs | Transportation Use means the use of premises or facilities for the operation of a mass transit system or a transportation system that is provided by, … |
| 800.50(875) | U | definition | definition-used — term occurs 2x in in-scope regs | Triplex means a building that has three dwelling units, with at least one dwelling unit entirely or partially above another. A detached house, semi-de… |
| 800.50(880) | U | definition | definition-used — term occurs 39x in in-scope regs | Vehicle means a wheeled or tracked device, either self-propelled or capable of being pulled by a self-propelled device, for moving persons or objects,… |

#### 900.1 Exceptions (interp.) — 4 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 900.1.10(1) | U | general/interpretation | envelope-affecting — Chapter 900 exception mechanism (precedence over zone rules) | Contents of Chapter 900 Site Specific Exceptions Chapter 900 Site Specific Exceptions are provisions pertaining to lands, or a portion thereof that ha… |
| 900.1.10(2) | U | general/interpretation | envelope-affecting — Chapter 900 exception mechanism (precedence over zone rules) | Effect of a Chapter 900 Site Specific Exception If there is a Chapter 900 Site Specific Exception, all of the regulations of this By-law, including th… |
| 900.1.10(3) | U | general/interpretation | envelope-affecting — Chapter 900 exception mechanism (precedence over zone rules) | Effect of a Site Specific Provision in Chapter 900 Site Specific Exceptions The regulations of a Site Specific Provision in Chapter 900 Site Specific … |
| 900.1.10(4) | U | general/interpretation | envelope-affecting — Chapter 900 exception mechanism (precedence over zone rules) | Effect of a Prevailing By-law or Prevailing Section listed in Chapter 900 Site Specific Exceptions The effect of a Prevailing By-law or Prevailing Sec… |

#### 10.5 Residential general — 126 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.5.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of General Regulations Section The regulations in Section 10.5 apply to all lands, uses, buildings and structures in the Residential Zone … |
| 10.5.1.10(2) | U | general/interpretation | informational — interpretation / application clause | Interpretation of the Residential Zone Symbol The zone symbol on the Zoning By-law Map for zones in the Residential Zone category consists of the lett… |
| 10.5.1.10(3) | U | general/interpretation | informational — interpretation / application clause | Interpretation of the Zone Label In the Residential Zone category, the letters following the zone symbol in the zone label have the following meaning:… |
| 10.5.20.1(1) | U | permitted uses | informational — permitted-use list | Lawfully Existing Public School, Private School A lawfully existing public school or private school on a lot in the Residential Zone category is permi… |
| 10.5.20.40(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conversion of Detached House to a Detached Houseplex In the Residential Zone category, a detached house may be converted to a detached houseplex, and:… |
| 10.5.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conversion of a Portion of a Semi-Detached House to a Semi-Detached Houseplex In the Residential Zone category, a portion of a semi-detached house loc… |
| 10.5.20.40(3) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conversion of a Portion of a Townhouse to Multiple Units In the Residential Zone category, a portion of a townhouse located on one lot may be converte… |
| 10.5.20.40(4) | U | building types/conversion | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building or structure on a lot referred to in regulations 10… |
| 10.5.20.40(5) | U | building types/conversion | informational — unit-mix / transition / lawful-status definitions | Definition of Lawful, Lawfully and Lawfully Existing For the purpose of regulations 10.5.20.40(1), (2), (3) and (4), and clauses 10.5.30.41, 10.5.40.1… |
| 10.5.20.40(6) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Secondary Suite  Not Permitted in a Converted Semi-Detached House or Townhouse Despite regulations 150.10.20.1(1), (2) and (3), a secondary suite may… |
| 10.5.20.40(7) | U | building types/conversion | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Parking Space Requirement for Conversion of a Lawfully Existing Building Despite the parking space requirements in regulations 200.5.10.1(1) and 200.5… |
| 10.5.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Lot Requirements Additional lot requirements are in each zone in the Residential Zone category. |
| 10.5.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Water Main and Sewer Capacity Requirements for Townhouses and Apartment Buildings on Major Streets In addition to the requirements of Regulation 5.10.… |
| 10.5.30.1(3) | U | general/interpretation | informational — interpretation / application clause | Exemptions for Water Main and Sewer Capacity Requirements for Townhouses and Apartment Buildings on Major Streets Regulation (2) above does not apply … |
| 10.5.30.11(1) | U | lot area | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Lot Area for Lawfully Existing Lots In the Residential Zone category, if the lawful lot area of a lawfully existing lot is less than the min… |
| 10.5.30.11(2) | U | lot area | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings In the Residential Zone category, an addition or extension to a lawfully existing building or structure on a … |
| 10.5.30.11(3) | U | lot area | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Vacant Lawfully Existing Lot In the Residential Zone category, if a lot referred to in regulation 10.5.30.11(1) is vacant, a detached house or detache… |
| 10.5.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Designated Front Lot Line for Through Lots Despite regulation 5.10.30.20(2), on a through lot in the Residential Zone category, any lot line separatin… |
| 10.5.30.20(2) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Front Lot Line for a Residential Building In the Residential Zone category, a residential building may not be erected on a lot that does not h… |
| 10.5.30.21(1) | U | lot frontage | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Lot Frontage for Lawfully Existing Lots In the Residential Zone category, if the lawful lot frontage of a lawfully existing lot is less than… |
| 10.5.30.21(2) | U | lot frontage | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building or structure on a lot referred to in regulation 10.… |
| 10.5.30.21(3) | U | lot frontage | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Vacant Lawfully Existing Lot If a lot referred to in regulation 10.5.30.21(1) is vacant, a detached house or detached houseplex may be constructed on … |
| 10.5.30.40(1) | U | lot coverage | envelope-affecting — principal-building envelope / lot / landscaping | Lot Coverage Exclusion for Permitted Encroachments In the Residential Zone category, any part of a building or structure that is permitted to encroach… |
| 10.5.30.40(2) | U | lot coverage | envelope-affecting — principal-building envelope / lot / landscaping | Parts of Platforms that are Not Permitted Encroachments In the Residential Zone category, any part of a platform without main walls, such as a deck, p… |
| 10.5.30.41(1) | U | lot coverage | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Lot Coverage for Lawfully Existing Buildings In the Residential Zone category, if the portion of a lot covered by lawfully existing building… |
| 10.5.30.41(2) | U | lot coverage | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to lawfully existing buildings or structures referred to in regulation 10.5.30.41(1… |
| 10.5.30.50(1) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Measurement of Front Yard setbacks for Townhouses and Apartment Buildings on Major Streets The required front yard setback of a townhouse or apartment… |
| 10.5.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.5.40 apply to buildings or structures in the Residential Zone category, other than ancillary… |
| 10.5.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Building Requirements Additional building requirements are in each zone in the Residential Zone category. |
| 10.5.40.10(1) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Determining the Height of a Building In the Residential Zone category, the height of a building is the distance between the established grade and the … |
| 10.5.40.10(2) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Specific Structures on a Building In the Residential Zone category, the following structures on the roof of a building may exceed the permit… |
| 10.5.40.10(3) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Elements for Functional Operation of a Building In the Residential Zone category, the following equipment and structures on the roof of a bu… |
| 10.5.40.10(4) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height - Horizontal Limits on Elements for Functional Operation of a Building In the Residential Zone category, equipment, structures or parts of a bu… |
| 10.5.40.10(5) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Rooftop Amenity Space Safety and Wind Protection In the Residential Zone category, unenclosed structures providing safety or wind protection… |
| 10.5.40.11(1) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Height for Lawfully Existing Buildings In the Residential Zone category, if the lawful height of a lawfully existing building or structure i… |
| 10.5.40.11(2) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings - Height Any addition or extension to a lawfully existing building or structure referred to in regulation 10.… |
| 10.5.40.11(3) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Alterations to the Roof of Lawfully Existing Buildings Any alteration to the roof of a lawfully existing building referred to in regulation 10.5.40.11… |
| 10.5.40.11(4) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Height of Main Walls for Lawfully Existing Buildings In the Residential Zone category, if the lawful height of the exterior portion of the main walls … |
| 10.5.40.11(5) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings - Height of Main Walls Any new main wall of an addition or extension to a lawfully existing building or struc… |
| 10.5.40.11(6) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Height of First Floor Above Established Grade for Lawfully Existing Buildings In the Residential Zone category, if the lawful height of the first floo… |
| 10.5.40.11(7) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings - Height of the First Floor Above Established Grade Any addition or extension to a lawfully existing building… |
| 10.5.40.20(1) | U | building length | envelope-affecting — principal-building envelope / lot / landscaping | Portion of Building to which Building Length Applies In the Residential Zone category, building length regulations apply to all main walls of a buildi… |
| 10.5.40.20(2) | U | building length | envelope-affecting — principal-building envelope / lot / landscaping | Exclusion from Building Length In the Residential Zone category, any part of a building or structure permitted to encroach into a required minimum bui… |
| 10.5.40.21(1) | U | building length | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Building Length for Lawfully Existing Buildings In the Residential Zone category, if the lawful building length of a lawfully existing build… |
| 10.5.40.21(2) | U | building length | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building referred to in regulation 10.5.40.21(1) must comply… |
| 10.5.40.30(1) | U | building depth | envelope-affecting — principal-building envelope / lot / landscaping | Portion of Building to which Building Depth Applies In the Residential Zone category, building depth regulations apply to all main walls of a building… |
| 10.5.40.30(2) | U | building depth | envelope-affecting — principal-building envelope / lot / landscaping | Exclusion from Building Depth In the Residential Zone category, any part of a building or structure permitted to encroach into a required minimum buil… |
| 10.5.40.31(1) | U | building depth | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Building Depth for Lawfully Existing Buildings In the Residential Zone category, if the lawful building depth of a lawfully existing buildin… |
| 10.5.40.31(2) | U | building depth | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building referred to in regulation 10.5.40.31(1) must comply… |
| 10.5.40.40(1) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Inclusion of Attic Space as Gross Floor Area in a Residential Building Other Than an Apartment Building In the Residential Zone category, the gross fl… |
| 10.5.40.40(2) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Exclusion of Certain Floor Area in an Attic If the floor area meets the conditions of regulation 10.5.40.40(1) and the area or portion of the area is … |
| 10.5.40.40(3) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Gross Floor Area Calculations for a Residential Building Other Than an Apartment Building In the Residential Zone category, the gross floor area of a … |
| 10.5.40.40(5) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Floor Space Index Calculation In the Residential Zone category, the floor space index: (A) for a non-residential building, is the result of the gross … |
| 10.5.40.41(1) | U | floor area/FSI | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Floor Space Index for Lawfully Existing Buildings In the Residential Zone category, if the lawful gross floor area of lawfully existing buil… |
| 10.5.40.50(1) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Interpretation of Platform Walls In the Residential Zone category, the exterior sides of a platform, such as a deck, porch, balcony or similar structu… |
| 10.5.40.50(2) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms in Relation to Building Setbacks In the Residential Zone category, a platform without main walls, such as a deck, porch, balcony or similar … |
| 10.5.40.50(3) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Residential Building Other than an Apartment Building In the Residential Zone category, the level of the … |
| 10.5.40.50(4) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Below the First Storey of a Residential Building other than an Apartment Building In the Residential Zone category, the level of the f… |
| 10.5.40.60(2) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Canopies and Awnings In the Residential Zone category a canopy, awning or similar structure, with or without structural support, or a roof over a plat… |
| 10.5.40.60(3) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Exterior Stairs, Access Ramp and Elevating Device In the Residential Zone category, exterior stairs, pedestrian access ramp and elevating device provi… |
| 10.5.40.60(4) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Exterior Main Wall Surface In the Residential Zone category, cladding added to the original exterior surface of the main wall of a building may encroa… |
| 10.5.40.60(5) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Architectural Features In the Residential Zone category, architectural features on a building must comply with the following: (A) a pilaster, decorati… |
| 10.5.40.60(6) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Window Projections In the Residential Zone category, a bay window, box window, or other window projection from a main wall of a building, which increa… |
| 10.5.40.60(7) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Roof Projections On a building in the Residential Zone category, roof projections must comply with the following: (A) a dormer projecting from the sur… |
| 10.5.40.60(8) | A | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Equipment In the Residential Zone category, the following wall mounted equipment on a building may encroach into required minimum building setbacks as… |
| 10.5.40.70(2) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Building or Structure to be Set Back from a Lane A building or structure in the Residential Zone category may be no closer than 2.5 metres from the or… |
| 10.5.40.71(1) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Setbacks for Lawfully Existing Buildings In the Residential Zone category, if the lawful building setback of a lawfully existing building or… |
| 10.5.40.71(2) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building or structure referred to in regulation 10.5.40.71(1… |
| 10.5.40.71(3) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions Above Lawfully Existing Buildings on Specified Lots Despite regulation 10.5.40.71(2), on a lot with a lot frontage of 12.2 metres or less, t… |
| 10.5.40.71(4) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to the Rear or Side of Lawfully Existing Buildings on Specified Lots Despite regulation 10.5.40.71(2), the required minimum building setback… |
| 10.5.40.71(5) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Setbacks for Lawfully Existing Buildings from a Lane In the Residential Zone category, if the lawful distance of a lawfully existing buildin… |
| 10.5.40.71(6) | A | setbacks | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions Above Lawfully Existing Buildings in Relation to a Lane The minimum distance from the original centreline of a lane for any addition or exte… |
| 10.5.60.1(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Application of this Article The regulations in Article 10.5.60 apply to ancillary buildings or structures in the Residential Zone category, if they ar… |
| 10.5.60.1(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Living Accommodation in Ancillary Buildings An ancillary building in the Residential Zone category may not be used for living accommodation. |
| 10.5.60.1(3) | U | ancillary building | envelope-affecting — accessory / suite envelope | Food or Sanitary Facilities in Ancillary Buildings An ancillary building in the Residential Zone category may have: (A) food preparation facilities an… |
| 10.5.60.1(4) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ancillary Building or Structure Construction Timing In the Residential Zone category, no above-ground part of an ancillary building or structure may b… |
| 10.5.60.10(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ancillary Buildings or Structures Not Permitted in Front Yard An ancillary building or structure in the Residential Zone category may not be located i… |
| 10.5.60.10(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Public Utility Equipment in a Front Yard Despite regulation 10.5.60.10(1), public utility equipment essential for the functional operation of the buil… |
| 10.5.60.20(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Parts of an Ancillary Building or Structure to which a Required Building Setback Applies In the Residential Zone category, required minimum ancillary … |
| 10.5.60.20(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ancillary Buildings or Structures - Rear Yard Setback Subject to regulation 10.5.60.20(5), in the Residential Zone category: (A) if an ancillary build… |
| 10.5.60.20(3) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ancillary Buildings or Structures - Side Yard Setback Subject to regulations 10.5.60.20(6) and (7), in the Residential Zone category, the required min… |
| 10.5.60.20(4) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ancillary Building or Structure - Setback from a Lane Despite regulations 10.5.60.20(2), (3) and (5) to (11), an ancillary building or structure in th… |
| 10.5.60.20(5) | U | ancillary building | envelope-affecting — accessory / suite envelope | Detached Private Garages - Rear Yard Setback In the Residential Zone category, the required minimum rear yard setback for an ancillary building or str… |
| 10.5.60.20(6) | U | ancillary building | envelope-affecting — accessory / suite envelope | Detached Private Garages - Side Yard Setback In the Residential Zone category, the required minimum side yard setback for an ancillary building or str… |
| 10.5.60.20(7) | U | ancillary building | envelope-affecting — accessory / suite envelope | Detached Private Garages Situated on More than One Lot Despite regulation 10.5.60.20(3) and (6), if an ancillary building or structure contains parkin… |
| 10.5.60.20(8) | U | ancillary/pool | envelope-affecting — accessory / suite envelope | Swimming Pools or Similar Ancillary Structures Containing Water - Rear Yard Setback Despite regulation 10.5.60.20(2), in the Residential Zone category… |
| 10.5.60.20(9) | U | ancillary/pool | envelope-affecting — accessory / suite envelope | Swimming Pools or Similar Ancillary Structures Containing Water - Side Yard Setback Despite regulation 10.5.60.20(3), in the Residential Zone category… |
| 10.5.60.20(10) | U | ancillary building | envelope-affecting — accessory / suite envelope | Ground Mounted Heating or Air-Conditioning Devices - Front Yard Setbacks and Side Yard Setbacks In the Residential Zone category, for a heating or air… |
| 10.5.60.20(11) | U | ancillary building | envelope-affecting — accessory / suite envelope | Open Platforms - Rear Yard Setbacks and Side Yard Setbacks Despite regulation 10.5.60.20(2) and (3), in the Residential Zone category, the required mi… |
| 10.5.60.30(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Minimum Separation Between Residential Buildings and Ancillary Buildings or Structures of a Certain Size In the Residential Zone category, an ancillar… |
| 10.5.60.30(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Maximum Separation Between Residential Buildings and Ground Mounted Heating or Air-Conditioning Devices in a Rear Yard A heating or air-conditioning d… |
| 10.5.60.40(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Determining the Height of Ancillary Buildings or Structures In the Residential Zone category, the height of an ancillary building or structure is the … |
| 10.5.60.40(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Maximum Height of Ancillary Buildings or Structures The permitted maximum height of an ancillary building or structure in the Residential Zone categor… |
| 10.5.60.40(3) | U | ancillary building | envelope-affecting — accessory / suite envelope | Maximum Storeys for Ancillary Buildings or Structures An ancillary building or structure in the Residential Zone category may not have more than one s… |
| 10.5.60.40(4) | U | ancillary building | envelope-affecting — accessory / suite envelope | Entrances to Ancillary Buildings or Structures The permitted maximum height of the top of an entrance into an ancillary building or structure in the R… |
| 10.5.60.40(5) | U | ancillary building | envelope-affecting — accessory / suite envelope | Height Restrictions for Platforms In the Residential Zone category, a platform, such as a deck or similar structure, other than a green roof, may not … |
| 10.5.60.50(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Exclusion from Floor Space Index In the Residential Zone category, the gross floor area of ancillary buildings is not included for the purpose of calc… |
| 10.5.60.50(2) | U | ancillary building | envelope-affecting — accessory / suite envelope | Maximum Floor Area of Ancillary Buildings or Structures The total floor area of all ancillary buildings or structures on a lot in the Residential Zone… |
| 10.5.60.50(3) | U | ancillary building | envelope-affecting — accessory / suite envelope | Maximum Floor Area of an Ancillary Building or Structure Close to a Residential Building on the Same Lot In the Residential Zone category, the permitt… |
| 10.5.60.60(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Roof Projections for Ancillary Buildings In the Residential Zone category, the eaves of a roof on an ancillary building may encroach into the required… |
| 10.5.60.70(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Lot Coverage Requirement for Ancillary Buildings and Structures An ancillary building or structure on a lot in the Residential Zone category, other th… |
| 10.5.60.70(2) | U | ancillary/pool | envelope-affecting — accessory / suite envelope | Lot Coverage Requirement for Swimming Pools or Similar Ancillary Structures Containing Water In the Residential Zone category, the water surface area … |
| 10.5.75.1(1) | U | energy devices | informational — energy devices (yard placement only) | Renewable Energy or Cogeneration Energy Device In the Residential Zone category, a device producing renewable energy or cogeneration energy may not be… |
| 10.5.75.1(2) | U | energy devices | informational — energy devices (yard placement only) | Cogeneration Energy Device In the Residential Zone category, a cogeneration energy device must be inside a permitted building. |
| 10.5.75.1(3) | U | energy devices | informational — energy devices (yard placement only) | Geo-energy Device In addition to regulation 10.5.75.1(1), in the Residential Zone category any above-ground part of a geo-energy device must comply wi… |
| 10.5.75.1(4) | U | energy devices | informational — energy devices (yard placement only) | Solar Energy Device In the Residential Zone category, a photovoltaic solar energy device or a thermal solar energy device that is: (A) on a building: … |
| 10.5.75.1(5) | U | energy devices | informational — energy devices (yard placement only) | Wind Energy Device In the Residential Zone category, a wind energy device must comply with the following: (A) there may be no more than one wind energ… |
| 10.5.80.1(1) | U | parking | envelope-affecting — parking/driveway placement or dimension | Use of Required Parking Space A parking space required by this By-law for a use in the Residential Zone category must be available for the use for whi… |
| 10.5.80.1(2) | U | parking | envelope-affecting — parking/driveway placement or dimension | Ancillary Outdoor Area for Parking In the Residential Zone category, a lot with a residential building other than a detached house, semi-detached hous… |
| 10.5.80.10(1) | A | parking | envelope-affecting — parking/driveway placement or dimension | Location of Required Parking Spaces In the Residential Zone category, a parking space must be on the same lot as the use for which the parking space i… |
| 10.5.80.10(4) | A | parking | envelope-affecting — parking/driveway placement or dimension | Parking in the Front Yard In the Residential Zone category, for a detached house, a semi-detached house, or a duplex, and for an individual townhouse … |
| 10.5.80.10(6) | A | parking | envelope-affecting — parking/driveway placement or dimension | Corner Lot Parking Space Location On a corner lot in the Residential Zone category, a parking space must be: (A) in a building or structure; (B) in a … |
| 10.5.80.10(7) | A | parking | envelope-affecting — parking/driveway placement or dimension | Rear Yard Parking Spaces In the Residential Zone category, on a lot with a detached house, a semi-detached house or a duplex, a maximum of 2 parking s… |
| 10.5.80.10(8) | A | parking | informational — vehicle-type use of parking | Parking Spaces for Storing Recreational Vehicles A maximum of two parking spaces on a lot in the Residential Zone category may be used for recreationa… |
| 10.5.80.10(9) | A | parking | informational — vehicle-type use of parking | Commercial Vehicle Parking Restriction A parking space in the Residential Zone category may be used for a commercial vehicle, if: (A) an owner or tena… |
| 10.5.80.10(10) | A | parking | informational — vehicle-type use of parking | Commercial Vehicle Parking Not Permitted in Yards A parking space located outside of a building in the Residential Zone category may not be used for: … |
| 10.5.80.11(1) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Front Yard Parking Spaces In the Residential Zone category, if a lawfully existing building has one or two lawful parking spaces on … |
| 10.5.80.11(2) | U | parking | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Side-by-Side Front Yard Parking Spaces on a Lawfully Existing Driveway If a lot with a lawfully existing detached house or lawfully existing semi-deta… |
| 10.5.80.11(3) | U | parking | envelope-affecting — parking/driveway placement or dimension | Front Yard Parking Spaces Authorized Under the City of Toronto Act If a lawfully existing lot in the Residential Zone category has a lawfully existing… |
| 10.5.80.40(1) | U | parking | envelope-affecting — parking/driveway placement or dimension | Maximum Width of Garage Entrance in Front Wall on Certain Lots In the Residential Zone category, for a lot with a detached house, semi-detached house,… |
| 10.5.80.40(2) | U | parking | envelope-affecting — parking/driveway placement or dimension | Elevation of Garage Entrance in Certain Types of Residential Buildings In the Residential Zone category, for a detached house, semi-detached house, de… |
| 10.5.80.40(3) | U | parking | envelope-affecting — parking/driveway placement or dimension | Parking Space Access on a Lot In the Residential Zone category, vehicle access to a parking space on a lot must: (A) be from the lane, if the lot abut… |
| 10.5.100.1(2) | A | driveway | envelope-affecting — parking/driveway placement or dimension | Driveway Width Other Than Through the Front Yard for Certain Residential Building Types In the Residential Zone category, for a detached house, semi-d… |
| 10.5.100.1(3) | A | driveway | envelope-affecting — parking/driveway placement or dimension | Driveway Width for Certain Residential Building Types with Three or More Dwelling Units In the Residential Zone category, for a detached houseplex or … |
| 10.5.100.1(7) | A | driveway | envelope-affecting — parking/driveway placement or dimension | Hammerhead Turnaround Driveway Dimensions In the Residential Zone category, a lot with a residential building, other than an apartment building with m… |
| 10.5.100.1(8) | A | driveway | envelope-affecting — parking/driveway placement or dimension | Hammerhead Turnaround Driveway Dimensions In the Residential Zone category, a hammerhead turnaround must: (A) have a maximum width of 3.0 metres; (B) … |

#### 10.10 R zone — 68 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.10.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of This Section The regulations in Section 10.10 apply to all lands, uses, buildings and structures in the R zone. 10.10.20 Permitted Uses… |
| 10.10.20.10(1) | U | permitted uses | informational — permitted-use list | Use - R Zone The following uses are permitted in the R zone: Dwelling Unit in a permitted residential building type in Clause 10.10.20.40. Municipal S… |
| 10.10.20.20(1) | U | permitted uses | informational — permitted-use list | Use with Conditions - R Zone The following uses are permitted in the R zone if they comply with the specific conditions associated with the reference … |
| 10.10.20.40(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Permitted Residential Building Types - R Zone In the R zone, a dwelling unit is permitted in the following residential building types: (A) Detached Ho… |
| 10.10.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions Despite regulations 900.1.10(3) and 900.1.10(4)(A), a detached houseplex, semi- detached houseplex, townhouse or apartment buil… |
| 10.10.20.41(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conversion of Detached House to a Low-rise Apartment Building In the R zone, a detached house may be converted to an apartment building, through the c… |
| 10.10.20.41(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conversion of a Portion of a Semi-Detached House to Multiple Dwelling Units In the R Zone, a portion of a semi-detached house located on one lot may b… |
| 10.10.20.41(3) | U | building types/conversion | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings Any addition or extension to a lawfully existing building or structure on a lot referred to in regulations 10… |
| 10.10.20.41(4) | U | building types/conversion | informational — unit-mix / transition / lawful-status definitions | Definition of Lawfully and Lawfully Existing For the purpose of regulations 10.10.20.41(1), (2), and (3), clauses 10.5.30.41, 10.5.40.11, 10.5.40.21, … |
| 10.10.20.41(5) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot Regulations 10.5.1.10(3) and 10.10.40.1(3), do not apply to a lawfully existing detached house or portion of a lawfu… |
| 10.10.20.41(6) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Secondary Suite  Not Permitted in a Converted Semi-Detached House Despite regulations 150.10.20.1(1) and (2), a secondary suite may not be in the por… |
| 10.10.20.60(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Exemptions Applying to Converted Dwelling Units In the Residential Zone, on a lot with 100 or more dwelling units in one or more residential buildings… |
| 10.10.20.60(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Parking Space Requirement for Conversion to Dwelling Units Despite regulation 200.5.10.11(1)(C), the number of lawful resident occupant parking spaces… |
| 10.10.20.60(3) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Conditions of Exemption The exemptions provided in regulations 10.10.20.60(1) and (2) are permitted, subject to the following requirements, unless aut… |
| 10.10.20.60(4) | U | building types/conversion | informational — unit-mix / transition / lawful-status definitions | Definition of Lawfully and Lawfully Existing For the purpose of regulations 10.10.20.60(1), (2) and (3), the words lawful, lawfully and lawfully exist… |
| 10.10.20.100(14) | U | permitted uses | informational — pointer to Ch.150 suite section | Secondary Suite A secondary suite in the R zone must comply with the specific use regulations in Section 150.10. |
| 10.10.20.100(19) | U | permitted uses | informational — pointer to Ch.150 suite section | Laneway Suite A laneway suite in the R zone must comply with the specific use regulations in Section 150.8. [ By-law: 810-2018 ] |
| 10.10.20.100(20) | U | permitted uses | informational — pointer to Ch.150 suite section | Garden Suite A garden suite in the R zone must comply with the specific use regulations in Section 150.7. [ By-law: 101-2022 ] |
| 10.10.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  Applicable Lot Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(… |
| 10.10.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  More Permissive Lot Coverage Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.10.30.1(… |
| 10.10.30.10(1) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area In the R zone: (A) if a zone label on the Zoning By-law Map has the letter "a", the numerical value following the letter "a" is the r… |
| 10.10.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Frontage In the R zone: (A) if a zone label on the Zoning By-law Map has the letter "f", the numerical value following the letter "f" is t… |
| 10.10.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.10.40 apply to buildings or structures in the R zone, other than ancillary buildings or stru… |
| 10.10.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Residential Buildings on a Lot (A) a maximum of one residential building is permitted on a lot in the R zone; and (B) despite (A) above, mor… |
| 10.10.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot (A) If a zone label applying to a lot in the R zone on the Zoning By-law Map has the letter "u", the numerical value… |
| 10.10.40.1(4) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Width of a Dwelling Unit In the R zone, the required minimum width of a dwelling unit in a townhouse is: (A) 5.0 metres if the dwelling unit d… |
| 10.10.40.1(5) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Building Orientation to a Street - Buildings with Dwelling Units In the R zone, a building, or an addition which is not attached above-ground to the o… |
| 10.10.40.1(6) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  Applicable Principal Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3… |
| 10.10.40.1(7) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  More Permissive Principal Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.10… |
| 10.10.40.1(8) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi- Detached Houseplex On a lot in the R zone, the maximum number of bedrooms permit… |
| 10.10.40.1(9) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition - Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex A detached houseplex or semi-detached houseplex m… |
| 10.10.40.1(10) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 10.10.40.1(9): (A) the words lawful, l… |
| 10.10.40.10(1) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height The permitted maximum height for a building or structure on a lot in the R zone is: (A) the numerical value, in metres, following the l… |
| 10.10.40.10(2) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Specified Pairs of Main Walls In the R zone, the permitted maximum height of the exterior portion of main walls for a residential bu… |
| 10.10.40.10(3) | U | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the R zone is: (A) the numerical value following the lette… |
| 10.10.40.10(4) | U | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Roof Slope Restriction for a Detached House In the R zone, a roof above the second storey or higher on a detached house may not have a slope greater t… |
| 10.10.40.10(5) | U | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Width of Dormers in a Roof Above a Second Storey or Higher In the R zone, on a residential building with two or more storeys, the walls of a dormer ar… |
| 10.10.40.10(6) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Main Pedestrian Entrance In the R zone, for a detached house or a semi-detached house, the elevation of the lowest point of a main pedestria… |
| 10.10.40.10(7) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Addition to a Residential Building In the R zone, all floor levels within an addition, extension or enlargement to the rear of a residential building,… |
| 10.10.40.10(8) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Specific Structures on a Building In the R zone, despite regulation 10.5.40.10(2), the following structures on the roof of a building with a… |
| 10.10.40.10(10) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Limits on Elements for Functional Operation of a Building for Towers In the R Zone: (A) Despite regulations 10.5.40.10 (3) and (4), equipment, structu… |
| 10.10.40.10(11) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Main Walls for a Residential Building other than an Apartment Building with a Flat or Shallow Roof Subject to regulation 10.10.40.10… |
| 10.10.40.10(12) | U | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Main Walls for a Residential Building other than an Apartment Building with a Flat or Shallow Roof Subject to regulation 10.10.40.10… |
| 10.10.40.11(1) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Alterations to the Roof of Lawfully Existing Buildings in the R Zone In addition to regulation 10.5.40.11(3), if a lawfully existing building in the R… |
| 10.10.40.20(1) | U | building length | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Building Length In the R zone, the permitted maximum building length for the following residential buildings on a lot abutting a major street … |
| 10.10.40.30(1) | U | building depth | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Building Depth In the R zone, the permitted maximum building depth is: (A) 17.0 metres for a detached house, semi-detached house, detached hou… |
| 10.10.40.40(1) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Floor Space Index In the R zone, the permitted maximum floor space index is: (A) the numerical value following the letter "d" in the zone label on the… |
| 10.10.40.40(2) | U | floor area/FSI | envelope-affecting — principal-building envelope / lot / landscaping | Additions to the Rear of Certain Residential Buildings If a lot in the R zone has a permitted maximum floor space index of 0.6, and has a detached hou… |
| 10.10.40.50(1) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Interpretation of Platform Walls In the R zone, in addition to regulation 10.5.40.50(1), the exterior sides of a lawfully existing platform that was l… |
| 10.10.40.61(1) | U | platforms/encroachments | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Lawfully Existing Porch Despite 10.5.40.50.(2) and 10.5.40.60(1)(A), in the R zone, a lawfully existing porch may be reconstructed or replaced, if the… |
| 10.10.40.70(1) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Front Yard Setback If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the R zone is 6.0 metres. |
| 10.10.40.70(2) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Rear Yard Setback The required minimum rear yard setback in the R zone is 7.5 metres. |
| 10.10.40.70(3) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Side Yard Setback In the R zone, the required minimum side yard setback is: (A) 0.9 metres, for: (i) a detached house; (ii) a semi-detached ho… |
| 10.10.40.70(4) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Reduced Minimum Side Yard for Walls with No Windows or Doors on Specified Buildings The required minimum side yard setback required in regulation 10.1… |
| 10.10.40.70(5) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Setback Requirements for Residential Buildings on Major Streets Despite (1) to (4) above, a townhouse or apartment building located on a lot a… |
| 10.10.40.71(1) | U | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Setback Exemptions Regulation 10.5.40.70(1) and Regulations 10.10.40.70 (1)(2)(3) and (4) do not apply to a transportation use along Eglinton Avenue W… |
| 10.10.40.80(1) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Main Walls of the Same Townhouse or Apartment Building In the R zone, if a townhouse or an apartment building has main walls where a … |
| 10.10.40.80(2) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Residential Buildings on the Same Lot In the R zone, if two or more townhouses or apartment buildings or combination thereof are loca… |
| 10.10.40.81(1) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Separation Between Main Walls for Lawfully Existing Buildings In the R zone, if the lawful separation distance between the main walls of law… |
| 10.10.40.81(2) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings In the R zone, any addition or extension to a lawfully existing building referred to in regulation 10.10.40.8… |
| 10.10.60.1(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Application of the Article The regulations in Article 10.10.60 apply to ancillary buildings or structures in the R zone, in addition to the requiremen… |
| 10.10.60.20(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Rear Yard Setbacks and Side Yard Setbacks for Detached Private Garages Despite regulation10.5.60.20(2), (3), (5) and (6), in the R zone, the required … |
| 10.10.60.70(1) | U | ancillary building | envelope-affecting — accessory / suite envelope | Lot Coverage Requirement for Ancillary Buildings and Structures Despite regulation 10.5.60.70(1), in the R zone, the area of the lot covered by ancill… |
| 10.10.80.1(1) | U | parking | envelope-affecting — parking/driveway placement or dimension | Conversion of a Parking Space in a Building to Habitable Space A parking space located inside a building on a lot in the R zone, other than an ancilla… |
| 10.10.80.1(2) | U | parking | envelope-affecting — parking/driveway placement or dimension | Conversion of Parking Space in a Residential Building to Non-Residential Use A parking space located inside a building on a lot in the R zone, other t… |
| 10.10.80.40(1) | U | parking | envelope-affecting — parking/driveway placement or dimension | Garage Entrance in Front Wall Not Permitted on Certain Lots Despite regulation 10.5.80.40(1), if a lot in the R zone has a lot frontage of 7.6 metres … |
| 10.10.80.40(2) | U | parking | envelope-affecting — parking/driveway placement or dimension | Parking Access to a Corner Lot or a Lot Abutting a Lane In the R zone, on a corner lot, despite regulation 10.5.80.40(3), or on a lot abutting a lane,… |
| 10.10.80.200(1) | U | parking | envelope-affecting — parking/driveway placement or dimension | Exemption from Parking Space Requirements for Certain Lots In the R zone, despite the requirements of Chapter 200, Parking Space Regulations, no parki… |

#### 10.20 RD — 38 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.20.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of This Section The regulations in Section 10.20 apply to all lands, uses, buildings and structures in the RD zone. 10.20.20 Permitted Use… |
| 10.20.20.10(1) | U | permitted uses | informational — permitted-use list | Use - RD Zone The following uses are permitted in the RD zone: Dwelling Unit in a permitted residential building type in Clause 10.20.20.40. Municipal… |
| 10.20.20.20(1) | U | permitted uses | informational — permitted-use list | Use with Conditions - RD Zone The following uses are permitted in the RD zone if they comply with the specific conditions associated with the referenc… |
| 10.20.20.40(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Permitted Residential Building Types  RD Zone In the RD Zone, a dwelling unit is permitted in the following residential building types: (A) Detached … |
| 10.20.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions Despite regulations 900.1.10(3) and 900.1.10(4)(A), a detached houseplex, townhouse or apartment building is a permitted reside… |
| 10.20.20.100(12) | U | permitted uses | informational — pointer to Ch.150 suite section | Secondary Suite A secondary suite in the RD zone must comply with the specific use regulations in Section 150.10. |
| 10.20.20.100(16) | U | permitted uses | informational — pointer to Ch.150 suite section | Laneway Suite A laneway suite in the RD zone must comply with the specific use regulations in Section 150.8. [ By-law: 1210-2019 ] |
| 10.20.20.100(17) | U | permitted uses | informational — pointer to Ch.150 suite section | Garden Suite A garden suite in the RD zone must comply with the specific use regulations in Section 150.7. [ By-law: 101-2022 ] |
| 10.20.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  Applicable Lot Requirements for a Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(4)(A), for a detached house… |
| 10.20.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  More Permissive Lot Coverage Requirements for a Detached Houseplex Despite regulations 10.20.30.1(1), 900.1.10(3) and 900.1.1… |
| 10.20.30.10(1) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area In the RD zone: (A) if a zone label includes the letter "a", on the Zoning By-law Map, the numerical value following the letter "a" i… |
| 10.20.30.10(2) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area for Each Dwelling Unit in a Townhouse In the RD Zone: If a zone label applying to a lot in the RD zone includes the letters "au", on … |
| 10.20.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.20.40 apply to buildings or structures in the RD zone, other than ancillary buildings or str… |
| 10.20.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Residential Buildings on a Lot (A) a maximum of one residential building is permitted on a lot in the RD zone; and (B) despite (A) above, mo… |
| 10.20.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Building Orientation to a Street - Buildings with Dwelling Units In the RD zone, a building, or an addition which is not attached above-ground to the … |
| 10.20.40.1(4) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Width of a Dwelling Unit In the RD zone, the required minimum width of a dwelling unit in a townhouse is: (A) 5.0 metres if the dwelling unit … |
| 10.20.40.1(5) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot (A) If a zone label applying to a lot in the RD zone on the Zoning By-law Map has the letter "u", the numerical valu… |
| 10.20.40.1(6) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  Applicable Principal Building Requirements for a Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(4)(A), for a… |
| 10.20.40.1(7) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  More Permissive Building Requirements for a Detached Houseplex Despite regulations 10.20.40.1(6), 900.1.10(3) and 900.1.10(4)… |
| 10.20.40.1(8) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Number of Bedrooms per Dwelling Unit in a Detached Houseplex On a lot in the RD zone, the maximum number of bedrooms permitted within a detached house… |
| 10.20.40.1(9) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition - Number of Bedrooms per Dwelling Unit in a Detached Houseplex A detached houseplex may have more than the permitted maximum number of bedr… |
| 10.20.40.1(10) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 10.20.40.1(9): (A) the words lawful, l… |
| 10.20.40.10(4) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Main Walls of a Residential Building with a Flat or Shallow Roof Subject to regulation 10.20.40.10(1), if a permitted residential bu… |
| 10.20.40.10(5) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Exemption for Parapet on a Residential Building with a Flat or Shallow Roof A parapet on a residential building in the RD zone may exceed the permitte… |
| 10.20.40.10(6) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Main Pedestrian Entrance In the RD zone, for a residential building, the elevation of the lowest point of a main pedestrian entrance through… |
| 10.20.40.10(7) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Width of Dormers in a Roof Above a Second Storey or Higher In the RD zone, on a residential building with two or more storeys, the walls of a dormer a… |
| 10.20.40.10(8) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Exclusion of Certain Floor Area Within an Attic Space as a Storey In the RD zone, where a floor area meets the conditions set out in regulation 10.5.4… |
| 10.20.40.11(1) | U | height | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Alterations to the Roof of Lawfully Existing Buildings in an RD Zone In addition to the requirements of regulation 10.5.40.11(3), if a lawfully existi… |
| 10.20.40.20(2) | A | building length | envelope-affecting — principal-building envelope / lot / landscaping | One Storey Extension to Building Length if Required Lot Frontage is in Specified Range In the RD zone, despite regulation 10.20.40.20(1), on a lot wit… |
| 10.20.40.20(4) | A | building length | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Building Length for a Townhouse or Apartment Building on a Major Street Despite regulation 10.20.40.20(1), in the RD zone, if a lot abuts a ma… |
| 10.20.40.50(1) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Detached House In the RD zone, a platform such as a deck or balcony with access from the second storey or… |
| 10.20.40.50(2) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Interpretation of Platform Walls In the RD zone, if an area is not subject to lot coverage, in addition to regulation 10.5.40.50(1) the exterior sides… |
| 10.20.40.50(3) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Detached Houseplex In the RD zone, platforms such as a deck or balcony, with access from the second store… |
| 10.20.40.70(4) | A | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Shifting Minimum Side Yard if Required Lot Frontage is in Specified Range Despite regulation 10.20.40.70(3), for a lot in the RD zone with a required … |
| 10.20.40.70(5) | A | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Larger Minimum Side Yard Beyond Specified Depth if Required Lot Frontage is Over 18.0 Metres Despite regulation 10.20.40.70(3), for a lot in the RD zo… |
| 10.20.40.70(7) | A | setbacks | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Setback Requirements for Residential Buildings on Major Streets Despite regulations 10.20.40.70(1) to (6) above, a townhouse or apartment buil… |
| 10.20.40.80(1) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Main Walls of the Same Townhouse or Apartment Building In the RD zone, if a townhouse or an apartment building on a lot abutting a ma… |
| 10.20.40.80(2) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Residential Buildings on the Same Lot In the RD zone, if two or more townhouses or apartment buildings or combination thereof are loc… |

#### 10.40 RS — 33 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.40.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of This Section The regulations in Section 10.40 apply to all lands, uses, buildings and structures in the RS zone. 10.40.20 Permitted Use… |
| 10.40.20.10(1) | U | permitted uses | informational — permitted-use list | Use - RS Zone The following uses are permitted in the RS zone: Dwelling Unit in a permitted residential building type in Clause 10.40.20.40. Municipal… |
| 10.40.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions Despite regulations 900.1.10(3) and 900.1.10(4)(A), a detached houseplex, semi-detached houseplex, townhouse or apartment build… |
| 10.40.20.100(12) | U | permitted uses | informational — pointer to Ch.150 suite section | Secondary Suite A secondary suite in the RS zone must comply with the specific use regulations in Section 150.10. |
| 10.40.20.100(16) | U | permitted uses | informational — pointer to Ch.150 suite section | Laneway Suite A laneway suite in the RS zone must comply with the specific use regulations in Section 150.8. [ By-law: 1210-2019 ] |
| 10.40.20.100(17) | U | permitted uses | informational — pointer to Ch.150 suite section | Garden Suite A garden suite in the RS zone must comply with the specific use regulations in Section 150.7. [ By-law: 101-2022 ] |
| 10.40.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  Applicable Lot Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(… |
| 10.40.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  More Permissive Lot Coverage Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.40.30.1(… |
| 10.40.30.10(1) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area In the RS zone: (A) if a zone label includes the letter "a", on the Zoning By-law Map, the numerical value following the letter "a" i… |
| 10.40.30.10(2) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area for Each Dwelling Unit in a Townhouse In the RS Zone: If a zone label applying to a lot in the RS zone includes the letters "au", on … |
| 10.40.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Frontage In the RS zone: (A) if a zone label includes the letter "f", on the Zoning By-law Map, the numerical value following the letter "… |
| 10.40.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.40.40 apply to buildings or structures in the RS zone, other than ancillary buildings or str… |
| 10.40.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Residential Buildings on a Lot (A) A maximum of one residential building is permitted on a lot in the RS zone; and (B) Despite (A) above, mo… |
| 10.40.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot (A) If a zone label applying to a lot in the RS zone on the Zoning By-law Map has the letter "u", the numerical valu… |
| 10.40.40.1(4) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Width of a Dwelling Unit In the RS zone, the required minimum width of a dwelling unit in a townhouse on a lot abutting a major street is: (A)… |
| 10.40.40.1(5) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  Applicable Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3) and 900.… |
| 10.40.40.1(6) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  More Permissive Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.40.40.1(5), … |
| 10.40.40.1(7) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex On a lot in the RS zone, the maximum number of bedrooms permit… |
| 10.40.40.1(8) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition - Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex A detached houseplex or semi-detached houseplex m… |
| 10.40.40.1(9) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 10.40.40.1(8): (A) the words lawful, l… |
| 10.40.40.10(2) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Specified Pairs of Main Walls In the RS zone, the permitted maximum height of the exterior portion of main walls for a permitted res… |
| 10.40.40.10(3) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RS zone is: (A) the numerical value following the lett… |
| 10.40.40.10(4) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Main Pedestrian Entrance In the RS zone, for a residential building, the elevation of the lowest point of a pedestrian entrance through the … |
| 10.40.40.10(5) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Width of Dormers in a Roof Above a Second Storey or Higher In the RS zone, on a residential building with two or more storeys, the walls of a dormer a… |
| 10.40.40.10(6) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Main Walls for a Residential Building with a Flat or Shallow Roof Subject to regulation 10.40.40.10(1), if a residential building in… |
| 10.40.40.20(2) | A | building length | envelope-affecting — principal-building envelope / lot / landscaping | One Storey Extension to Building Length if Required Lot Frontage is More than 12.0 Metres In the RS zone, despite regulation 10.40.40.20(1), on a lot … |
| 10.40.40.20(3) | A | building length | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Building Length for a Detached Houseplex or Semi-Detached Houseplex if Lot Frontage and Lot Depth is in Specified Range Despite regulation 10.… |
| 10.40.40.30(2) | A | building depth | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Building Depth for a Detached Houseplex or Semi-Detached Houseplex if Lot Frontage and Lot Depth is in Specified Range In the RS zone, a detac… |
| 10.40.40.50(1) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Detached House In the RS zone, platforms such as a deck or balcony, with access from the second storey or… |
| 10.40.40.50(2) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Semi-Detached House In the RS zone, platforms such as a deck or balcony, with access from the second stor… |
| 10.40.40.50(3) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Detached Houseplex or Semi-Detached Houseplex In the RS zone, platforms such as a deck or balcony, with a… |
| 10.40.40.80(1) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Main walls of the Same Townhouse or Apartment Building In the RS zone, if a townhouse or an apartment building on a lot abutting a ma… |
| 10.40.40.80(2) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Residential Buildings on the Same Lot In the RS zone, if two or more townhouses or apartment buildings or combination thereof are loc… |

#### 10.60 RT — 23 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.60.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of This Section The regulations in Section 10.60 apply to all lands, uses, buildings and structures in the RT zone. 10.60.20 Permitted Use… |
| 10.60.20.10(1) | U | permitted uses | informational — permitted-use list | Use - RT Zone The following uses are permitted in the RT zone: Dwelling Unit in a permitted residential building type in Clause 10.60.20.40. Municipal… |
| 10.60.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions Despite regulations 900.1.10(3) and 900.1.10(4)(A), a detached houseplex, semi- detached houseplex, townhouse or apartment buil… |
| 10.60.20.100(12) | U | permitted uses | informational — pointer to Ch.150 suite section | Secondary Suite A secondary suite in the RT zone must comply with the specific use regulations in Section 150.10. |
| 10.60.20.100(16) | U | permitted uses | informational — pointer to Ch.150 suite section | Laneway Suite A laneway suite in the RT zone must comply with the specific use regulations in Section 150.8. [ By-law: 1210-2019 ] |
| 10.60.20.100(17) | U | permitted uses | informational — pointer to Ch.150 suite section | Garden Suite A garden suite in the RT zone must comply with the specific use regulations in Section 150.7. [ By-law: 101-2022 ] |
| 10.60.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  Applicable Lot Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(… |
| 10.60.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  More Permissive Lot Coverage Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.60.30.1(… |
| 10.60.30.10(1) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area In the RT zone: (A) if a zone label includes the letter "a", on the Zoning By-law Map, the numerical value following the letter "a" i… |
| 10.60.30.10(2) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area For Each Dwelling Unit in a Townhouse If a zone label applying to a lot in the RT zone includes the letters "au", on the Zoning By-la… |
| 10.60.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Frontage In the RT zone: (A) if a zone label includes the letter "f", on the Zoning By-law Map, the numerical value following the letter "… |
| 10.60.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.60.40 apply to buildings or structures in the RT zone, other than ancillary buildings or str… |
| 10.60.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot (A) If a zone label applying to a lot in the RT zone on the Zoning By-law Map has the letter "u", the numerical valu… |
| 10.60.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Width of a Dwelling Unit In the RT zone, the required minimum width of a dwelling unit in a townhouse is: (A) 5.0 metres if the dwelling unit … |
| 10.60.40.1(4) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  Applicable Principal Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3… |
| 10.60.40.1(5) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  More Permissive Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.60.40.1(4), … |
| 10.60.40.1(6) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex On a lot in the RT zone, the maximum number of bedrooms permit… |
| 10.60.40.1(7) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition - Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex A detached houseplex or semi-detached houseplex m… |
| 10.60.40.1(8) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 10.60.40.1(7): (A) the words lawful, l… |
| 10.60.40.80(1) | A | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Main Walls of the Same Residential Building In the RT zone, if a residential building has main walls where a line projected outward a… |
| 10.60.40.80(2) | A | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Residential Buildings on the Same Lot In the RT zone, if two or more residential buildings are on the same lot, the required minimum … |
| 10.60.40.81(1) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Separation Between Main Walls for Lawfully Existing Buildings In the RT zone, if the lawful separation distance between the main walls of la… |
| 10.60.40.81(2) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings In the RT zone, any addition or extension to a lawfully existing building referred to in regulation 10.60.40.… |

#### 10.80 RM — 32 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 10.80.1.10(1) | U | general/interpretation | informational — interpretation / application clause | Application of This Section The regulations in Section 10.80 apply to all lands, uses, buildings and structures in the RM zone. 10.80.20 Permitted Use… |
| 10.80.20.10(1) | U | permitted uses | informational — permitted-use list | Use - RM Zone The following uses are permitted in the RM zone: Dwelling Unit in a permitted residential building type in Clause 10.80.20.40. Municipal… |
| 10.80.20.20(1) | U | permitted uses | informational — permitted-use list | Use with Conditions - RM Zone The following uses are permitted in the RM zone if they comply with the specific conditions associated with the referenc… |
| 10.80.20.40(1) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Permitted Residential Building Types - RM Zone In the RM zone, a dwelling unit is permitted in the following residential building types: (A) Detached … |
| 10.80.20.40(2) | U | building types/conversion | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions Despite regulations 900.1.10(3) and 900.1.10(4)(A), a detached houseplex, semi-detached houseplex, townhouse or apartment build… |
| 10.80.20.100(15) | U | permitted uses | informational — pointer to Ch.150 suite section | Secondary Suite A secondary suite in the RM zone must comply with the specific use regulations in Section 150.10. |
| 10.80.20.100(19) | U | permitted uses | informational — pointer to Ch.150 suite section | Laneway Suite A laneway suite in the RM zone must comply with the specific use regulations in Section 150.8. [ By-law: 1210-2019 ] |
| 10.80.20.100(20) | U | permitted uses | informational — pointer to Ch.150 suite section | Garden Suite A garden suite in the RM zone must comply with the specific use regulations in Section 150.7. [ By-law: 101-2022 ] |
| 10.80.30.1(1) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  Applicable Lot Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3) and 900.1.10(… |
| 10.80.30.1(2) | U | general/interpretation | informational — interpretation / application clause | Chapter 900 Exceptions  More Permissive Lot Coverage Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.80.30.1(… |
| 10.80.30.10(1) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area In the RM zone: (A) if a zone label includes the letter "a", on the Zoning By-law Map, the numerical value following the letter "a" i… |
| 10.80.30.10(3) | U | lot area | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Area for Each Dwelling Unit in a Townhouse If a zone label applying to a lot in the RM zone includes the letters "au", on the Zoning By-la… |
| 10.80.30.20(1) | U | lot frontage | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Lot Frontage In the RM zone: (A) if a zone label includes the letter "f", on the Zoning By-law Map, the numerical value following the letter "… |
| 10.80.40.1(1) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Application of this Article The regulations in Article 10.80.40 apply to buildings or structures in the RM zone, other than ancillary buildings or str… |
| 10.80.40.1(2) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Number of Dwelling Units on a Lot (A) If a zone label applying to a lot in the RM zone on the Zoning By-law Map has the letter "u", the numerical valu… |
| 10.80.40.1(3) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Minimum Width of a Dwelling Unit In the RM zone, the required minimum width of a dwelling unit in a townhouse is: (A) 5.0 metres if the dwelling unit … |
| 10.80.40.1(4) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  Applicable Principal Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 900.1.10(3… |
| 10.80.40.1(5) | U | principal building general | envelope-affecting — principal-building envelope / lot / landscaping | Chapter 900 Exceptions  More Permissive Building Requirements for a Detached Houseplex or Semi-Detached Houseplex Despite regulations 10.80.40.1(4), … |
| 10.80.40.1(6) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex On a lot in the RM zone, the maximum number of bedrooms permit… |
| 10.80.40.1(7) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition - Number of Bedrooms per Dwelling Unit in a Detached Houseplex or Semi-Detached Houseplex A detached houseplex or semi-detached houseplex m… |
| 10.80.40.1(8) | U | principal building general | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 10.80.40.1(8): (A) the words lawful, l… |
| 10.80.40.10(2) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Specified Pairs of Main Walls In the RM zone, the permitted maximum height of the exterior portion of main walls for a detached hous… |
| 10.80.40.10(3) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Number of Storeys The permitted maximum number of storeys in a building on a lot in the RM zone is: (A) the numerical value following the lett… |
| 10.80.40.10(4) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Height of Main Pedestrian Entrance In the RM zone, for a detached house or semi-detached house, the elevation of the lowest point of a main pedestrian… |
| 10.80.40.10(5) | A | height/storeys | envelope-affecting — principal-building envelope / lot / landscaping | Width of Dormers in a Roof Above a Second Storey or Higher In the RM zone, on a detached house or a semi-detached house with two or more storeys, the … |
| 10.80.40.10(6) | A | height | envelope-affecting — principal-building envelope / lot / landscaping | Maximum Height of Main Walls for a Detached House or Semi-Detached House with a Flat or Shallow Roof Subject to regulation 10.80.40.10(1), if a detach… |
| 10.80.40.50(1) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Detached House In the RM zone, platforms such as a deck or balcony, with access from the second storey or… |
| 10.80.40.50(2) | U | platforms/encroachments | envelope-affecting — principal-building envelope / lot / landscaping | Platforms at or Above the Second Storey of a Semi-Detached House In the RM zone, platforms such as a deck or balcony, with access from the second stor… |
| 10.80.40.80(1) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Main walls of the Same Apartment Building or Townhouse In the RM zone, if an apartment building or townhouse has main walls where a l… |
| 10.80.40.80(2) | U | separation | envelope-affecting — principal-building envelope / lot / landscaping | Distance Between Residential Buildings on the Same Lot In the RM zone, if two or more residential buildings are located on the same lot, the required … |
| 10.80.40.81(1) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Separation Between Main Walls for Lawfully Existing Buildings In the RM zone, if the lawful separation distance between the main walls of la… |
| 10.80.40.81(2) | U | separation | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Additions to Lawfully Existing Buildings In the RM zone, any addition or extension to a lawfully existing building or structure referred to in regulat… |

#### 150.7 Garden suites — 35 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 150.7.1(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Application of this Section The regulations of Section 150.7 apply to garden suites. [ By-law: 101-2022 ] |
| 150.7.1(2) | U | garden suite | informational — unit-mix / transition / lawful-status definitions | Definition of Lawful For the purposes of Chapter 150.7, the words lawful and lawfully highlighted in bold type, in addition to the definitions provide… |
| 150.7.20.1(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite - Permitted Uses (A) Despite regulation 10.5.60.1(2), an ancillary building may be used for living accommodation in one garden suite. (B)… |
| 150.7.20.1(2) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite - Use Restriction A maximum of one ancillary building containing either a garden suite or a laneway suite is permitted on a lot. A lot ma… |
| 150.7.60.20(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Parts of a Garden Suite to which a Required Building Setback Applies Despite regulation 5.10.40.70.(2), the required minimum ancillary building setbac… |
| 150.7.60.20(3) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite on Through Lot - Rear Yard Setback The required minimum rear yard setback for an ancillary building containing a garden suite must comply… |
| 150.7.60.20(4) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite containing a Parking Space on Through Lot - Rear Yard Setback The required minimum rear yard setback for an ancillary building containing… |
| 150.7.60.20(6) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite on Corner Lot - Side Yard Setback Despite regulation 10.5.60.20(3)(C)(i), the required minimum side yard setback for an ancillary buildin… |
| 150.7.60.21(1) | U | garden suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Setbacks for Lawfully Existing Ancillary Buildings If the lawful building setback of a lawfully existing ancillary building is less than the… |
| 150.7.60.21(2) | U | garden suite | informational — unit-mix / transition / lawful-status definitions | Transition  Setbacks for a Garden Suite A garden suite may have a side yard setback or rear yard setback less than required in regulations 150.7.60.2… |
| 150.7.60.21(3) | U | garden suite | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 150.7.60.21(2): (A) the words lawful, … |
| 150.7.60.31(1) | U | garden suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Minimum Separation Between a Lawfully Existing Residential Building and a Lawfully Existing Ancillary Building If the separation between a lawfully ex… |
| 150.7.60.40(2) | U | garden suite | envelope-affecting — accessory / suite envelope | Maximum Storeys for Garden Suites Despite regulation 10.5.60.40(3), an ancillary building containing a garden suite may have a maximum of two storeys,… |
| 150.7.60.40(3) | U | garden suite | envelope-affecting — accessory / suite envelope | Height of Specific Structures on a Garden Suite The following structures on the roof of an ancillary building containing a garden suite may exceed the… |
| 150.7.60.40(4) | U | garden suite | envelope-affecting — accessory / suite envelope | Height of Skylights on a Garden Suite Skylights on the roof of an ancillary building containing a garden suite may exceed the permitted maximum height… |
| 150.7.60.40(5) | U | garden suite | envelope-affecting — accessory / suite envelope | Height of Elements for Functional Operation of the Garden Suite The following equipment and structures on the roof of an ancillary building containing… |
| 150.7.60.40(6) | U | garden suite | envelope-affecting — accessory / suite envelope | Height - Horizontal Limits on Elements for Functional Operation of the Garden Suite Equipment, structures or parts of an ancillary building permitted … |
| 150.7.60.40(7) | U | garden suite | envelope-affecting — accessory / suite envelope | Height of Garden Suite Entrance Regulation 10.5.60.40(4) does not apply to an ancillary building containing a garden suite. [ By-law: 101-2022 ] |
| 150.7.60.50(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Exclusion from Floor Space Index The gross floor area of an ancillary building containing a garden suite is not included for the purpose of calculatin… |
| 150.7.60.50(3) | U | garden suite | envelope-affecting — accessory / suite envelope | Exemption from Maximum Floor Area for an Ancillary Building Regulation 10.5.60.50(2) does not apply to an ancillary building containing a garden suite… |
| 150.7.60.50(4) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite  Maximum Gross Floor Area In addition to the requirements of regulation 150.7.60.50(2), an ancillary building containing a garden suite … |
| 150.7.60.50(5) | U | garden suite | envelope-affecting — accessory / suite envelope | Garden Suite  Gross Floor Area Calculations The gross floor area of an ancillary building containing a garden suite, may be reduced by the area withi… |
| 150.7.60.51(1) | U | garden suite | informational — unit-mix / transition / lawful-status definitions | Transition  Gross Floor Area for a Garden Suite A garden suite may have gross floor area that exceeds the requirements in regulations 150.7.60.50(2),… |
| 150.7.60.51(2) | U | garden suite | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 150.7.60.51(1): (A) the words lawful, … |
| 150.7.60.60(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Interpretation of Platform Walls The exterior sides of a platform, such as a deck, porch, balcony or similar structure, attached to or within 0.3 metr… |
| 150.7.60.60(2) | U | garden suite | envelope-affecting — accessory / suite envelope | Platform Restrictions Despite regulation 10.5.60.20(11), a platform without main walls in accordance with regulation 150.7.60.60(1) is permitted, if: … |
| 150.7.60.60(3) | U | garden suite | envelope-affecting — accessory / suite envelope | Platform Height Despite regulation 10.5.60.40(5)(B), the level of the floor of a platform permitted in accordance with regulation 150.7.60.60(2), othe… |
| 150.7.60.60(4) | U | garden suite | envelope-affecting — accessory / suite envelope | Permitted Encroachments for Platforms Despite regulation 150.7.60.60(2)(B), a platform without main walls in accordance with 150.7.60.60(1), together … |
| 150.7.60.60(5) | U | garden suite | envelope-affecting — accessory / suite envelope | Permitted Encroachments for Canopies and Awnings A canopy, awning or similar structure, with or without structural support, or a roof over a platform … |
| 150.7.60.60(6) | U | garden suite | envelope-affecting — accessory / suite envelope | Architectural Features Architectural features on an ancillary building containing a garden suite must comply with the following, if the architectural … |
| 150.7.60.60(7) | U | garden suite | envelope-affecting — accessory / suite envelope | Equipment Wall mounted equipment on an ancillary building containing a garden suite, such as vents, pipes, utility equipment, satellite dishes, antenn… |
| 150.7.75.1(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Solar Energy Device Despite regulation 10.5.75.1(4), a photovoltaic solar energy device or thermal solar energy device that is on an ancillary buildin… |
| 150.7.80.1(1) | U | garden suite | envelope-affecting — accessory / suite envelope | Parking Space Requirement for a Lot with a Garden Suite Despite the parking space requirements in regulations 200.5.10.1(1) and 200.5.10.11(1)(C): (A)… |
| 150.7.80.1(2) | U | garden suite | envelope-affecting — accessory / suite envelope | Bicycle Parking Space Requirement for a Garden Suite An ancillary building containing a garden suite must provide a minimum of two bicycle parking spa… |
| 150.7.80.1(3) | U | garden suite | envelope-affecting — accessory / suite envelope | Access to Parking Space Despite regulation 10.5.80.40(3), if a lot has an ancillary building containing a garden suite, vehicle access to a parking sp… |

#### 150.8 Laneway suites — 37 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 150.8.1(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Application of this Section The regulations of Section 150.8 apply to laneway suites. [ By-law: 810-2018 ] 150.8.20 Use Requirements |
| 150.8.20.1(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite  Permitted Uses (A) Despite regulation 10.5.60.1(2), an ancillary building may be used for living accommodation in one laneway suite. (… |
| 150.8.20.1(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite - Use Restriction A maximum of one ancillary building containing either a laneway suite or a garden suite is permitted on a lot. A lot m… |
| 150.8.30.20(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Minimum Lot Line on a Lane A laneway suite must be on a lot with a rear lot line or side lot line abutting a lane for at least 3.5 metres; or on a lot… |
| 150.8.60.20(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Parts of a Laneway Suite to which a Required Building Setback Applies The required minimum ancillary building setbacks apply to all parts of an ancill… |
| 150.8.60.20(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite - Rear Yard Setback Despite regulations 10.5.60.20(2) and (5) and regulation 10.10.60.20(1), the required minimum rear yard setback for … |
| 150.8.60.20(3) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite  Side Yard Setback Despite regulations 10.5.60.20(3) and (6) and regulation 10.10.60.20(1), the required minimum side yard setback for … |
| 150.8.60.21(1) | U | laneway suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Setbacks for Lawfully Existing Ancillary Buildings If the lawful building setback of a lawfully existing ancillary building is less than the… |
| 150.8.60.30(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Minimum Separation between a Residential Building and the Ancillary Building Despite regulation 10.5.60.30(1), the main wall an ancillary building con… |
| 150.8.60.30(5) | U | laneway suite | envelope-affecting — accessory / suite envelope | Maximum Length of a Laneway Suite The permitted maximum building length for an ancillary building containing a laneway suite is 10.0 metres. [ By-law:… |
| 150.8.60.30(6) | U | laneway suite | envelope-affecting — accessory / suite envelope | Maximum Width of a Laneway Suite The permitted maximum building width of an ancillary building containing a laneway suite is 8.0 metres. [ By-law: 110… |
| 150.8.60.31(1) | U | laneway suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Minimum Separation Between a Lawfully Existing Residential Building and a Lawfully Existing Ancillary Building If the separation between a lawfully ex… |
| 150.8.60.31(2) | U | laneway suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Length of a Lawfully Existing Ancillary Building If the lawful building length for a lawfully existing ancillary building is more than the p… |
| 150.8.60.31(3) | U | laneway suite | existing-building — grandfathering of a lawfully existing building/lot (needs as-built facts) | Permitted Width of a Lawfully Existing Ancillary Building If the lawful building width for a lawfully existing ancillary building is more than the per… |
| 150.8.60.40(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Maximum Height of a Laneway Suite Despite regulation 10.5.60.40(2)(B), the permitted maximum height of an ancillary building containing a laneway suit… |
| 150.8.60.40(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Maximum Storeys for Laneway Suites Despite regulation 10.5.60.40(3), an ancillary building or structure containing a laneway suite may have a maximum … |
| 150.8.60.40(3) | U | laneway suite | envelope-affecting — accessory / suite envelope | Height of Specific Structures on a Laneway Suite The following structures on the roof of an ancillary building containing a laneway suite may exceed t… |
| 150.8.60.40(4) | U | laneway suite | envelope-affecting — accessory / suite envelope | Height of Skylights on a Laneway Suite Skylights on the roof of an ancillary building containing a laneway suite may exceed the permitted maximum heig… |
| 150.8.60.40(5) | U | laneway suite | envelope-affecting — accessory / suite envelope | Height of Elements for Functional Operation of a Building The following equipment and structures on the roof of an ancillary building containing a lan… |
| 150.8.60.40(6) | U | laneway suite | envelope-affecting — accessory / suite envelope | Height - Horizontal Limits on Elements for Functional Operation of a Building Equipment, structures or parts of a building permitted in (5) above must… |
| 150.8.60.40(7) | U | laneway suite | envelope-affecting — accessory / suite envelope | Height of Laneway Suite Entrance Regulation 10.5.60.40(4) does not apply to an ancillary building containing a laneway suite. [ By-law: 1107-2021 ]… |
| 150.8.60.50(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Exclusion from Floor Space Index The gross floor area an ancillary building containing a laneway suite is not included for the purpose of calculating … |
| 150.8.60.50(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite  Gross Floor Area The gross floor area of an ancillary building containing a laneway suite must be less than the gross floor area of th… |
| 150.8.60.50(3) | U | laneway suite | envelope-affecting — accessory / suite envelope | Exemption from Maximum Floor Area for an Ancillary Building Regulation 10.5.60.50(2) does not apply to an ancillary building containing a laneway suit… |
| 150.8.60.50(4) | U | laneway suite | envelope-affecting — accessory / suite envelope | Laneway Suite  Gross Floor Area Calculations The gross floor area of an ancillary building containing a laneway suite, may be reduced by the areas wi… |
| 150.8.60.51(1) | U | laneway suite | informational — unit-mix / transition / lawful-status definitions | Transition  Gross Floor Area for a Laneway Suite A laneway suite may have the gross floor area exceed the requirements in regulations 150.8.60.50(2) … |
| 150.8.60.51(2) | U | laneway suite | informational — unit-mix / transition / lawful-status definitions | Transition  Definition of Lawfully, Lawfully Existing and Complete Applications For the purposes of regulation 150.8.60.51(1): (A) the words lawful, … |
| 150.8.60.60(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Interpretation of Platform Walls The exterior sides of a platform, such as a deck, porch, balcony or similar structure, attached to or within 0.3 metr… |
| 150.8.60.60(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Platform Restrictions Despite regulation 10.5.60.20(11) a platform without main walls in accordance with (1) above, is permitted, if: (A) the area of … |
| 150.8.60.60(3) | U | laneway suite | envelope-affecting — accessory / suite envelope | Platform Height Despite regulation 10.5.60.40(5)(B), the level of the floor of a platform permitted in accordance with (2) above, other than a green r… |
| 150.8.60.60(4) | U | laneway suite | envelope-affecting — accessory / suite envelope | Permitted Encroachments for Platforms Despite (2)(B) above, a platform without main walls in accordance with (1) above, together with stairs or ramps … |
| 150.8.60.60(5) | U | laneway suite | envelope-affecting — accessory / suite envelope | Permitted Encroachments for Canopies and Awnings A canopy, awning or similar structure, with or without structural support, or a roof over a platform … |
| 150.8.60.60(6) | U | laneway suite | envelope-affecting — accessory / suite envelope | Architectural Features Architectural features on an ancillary building containing a laneway suite must comply with the following: (A) a pilaster, deco… |
| 150.8.60.60(7) | U | laneway suite | envelope-affecting — accessory / suite envelope | Equipment Wall mounted equipment on an ancillary building containing a laneway suite, such as vents, pipes, utility equipment, satellite dishes, anten… |
| 150.8.60.70(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Lot Coverage Requirement for a Lot with a Laneway Suite Despite regulations 10.5.60.70(1) and 10.10.60.70(1), if a lot has an ancillary building conta… |
| 150.8.80.1(1) | U | laneway suite | envelope-affecting — accessory / suite envelope | Parking Space Requirement for a Lot with a Laneway Suite Despite the parking space requirements in regulations 200.5.10.1(1) and 200.5.10.11(1)(C): (A… |
| 150.8.80.1(2) | U | laneway suite | envelope-affecting — accessory / suite envelope | Bicycle Parking Space Requirement for a Laneway Suite An ancillary building containing a laneway suite must have a minimum of two bicycle parking spac… |

#### 150.10 Secondary suites — 6 not captured at regulation level

| Regulation | Grade | Topic | Relevance (why) | Gist (first 150 chars of the page text) |
| --- | --- | --- | --- | --- |
| 150.10.1(1) | U | secondary suite | envelope-affecting — accessory / suite envelope | Application of this Section The regulations in Section 150.10 apply to secondary suites. [ By-law: 549-2019 ] 150.10.20 Use Requirements |
| 150.10.20.1(1) | U | secondary suite | envelope-affecting — accessory / suite envelope | Secondary Suite - Permitted in Certain Types of Residential Buildings A secondary suite may be in: (A) a detached house; (B) a semi-detached house; an… |
| 150.10.20.1(2) | U | secondary suite | envelope-affecting — accessory / suite envelope | Secondary Suite - Number Permitted in a Detached House, Semi-Detached House or Townhouse Within a detached house, semi-detached house, or townhouse, e… |
| 150.10.20.1(4) | U | secondary suite | envelope-affecting — accessory / suite envelope | Secondary Suite - Permission in Zones Where a Detached House, Semi-Detached House, or Townhouse Are Not Permitted Building Types A secondary suite is … |
| 150.10.40.40(1) | U | secondary suite | envelope-affecting — accessory / suite envelope | Secondary Suite - Interior Floor Area The interior floor area of a secondary suite, or all secondary suites where more than one is permitted, must be … |
| 150.10.40.40(2) | U | secondary suite | envelope-affecting — accessory / suite envelope | Secondary Suite  In a Basement in a One Storey Detached House Despite regulation 150.10.40.40(1), in the case of a secondary suite located in the bas… |
