# SPEC 68 — McBylaw: the By-law Table Standard

> ## v0.5 — RATIFIED 2026-10-06 — the STANDARD half of a standard + policy pair
> This spec says **what** the by-law table is, **why** it exists, **how** a row is built and **how** the table is proven.
> **Spec 69 — McBylaw Policy** (`docs/specs/01-pipeline/69_mcbylaw_policy.md`) holds only the rulings that chose
> between alternatives; it is amended only by adding rows. On conflict, Spec 69 governs.
> The pair mirrors Spec 122 (the step standard) and Spec 124 (the step policy).
>
> **v0.5 (2026-10-06, operator-approved change package):** 24 Phase 1 gates merged into 13 (§9), with every reason code
> kept; G-COV cut (pending = 0 at close supersedes it); G-ALIAS became a one-time S12/S13 migration; G-CODE (iii) and
> the generic consolidation comparator were cut. **The DSL evaluator and `effective()` now ship in Phase 1** and run
> under the new gate G-EVAL (§7.6), because an expression that is never executed is only declared (Spec 124 R-BF).
> Absent and stale rows are `pending`, never `failed` (§4). Keyer provenance is a committed record (§10). Overlays have
> their own layer (§7.5). Model heuristics are a closed row kind (§6.3). The standing rules formerly in Spec 69
> (M-3..M-10, M-12, M-13, M-16, M-18, M-24) are now §6.4 here; their ids are retired there and never reused.
> Zoning-application checks (ZV-1..ZV-4) live on the zoning steps, not here (Spec 69 M-42).
>
> **S1 amendments (2026-10-07, operator rulings on the S0.5 spike; evidence `docs/reports/mcbylaw-s05-spike.md`):**
> the §7.4 grammar additions (Spec 69 M-48); argument-level, own-target displacement and the rule 3 tie-break (§7.5,
> M-48, M-49); building type unknown → all types must agree (§7.5, M-50); `calculation_handling` status single-drafted
> (§6, M-17 note); the page set per M-47 (§6.4, §10, §11); Spec 67 V1–V4/V25 corrected at S6b (§7.6, M-51).
>
> **S12b amendments (2026-10-07, operator ruling M-55):** §6.1 row fields `additional_sources[]`, `risk_feeds[]`,
> `precedence` none · active and `provincial_units[]`; EXT-prov-1 active; risk rows verified_primary; §7.5 rule 4 provincial
> by-law-prevails clause; §11 future note on the Ch.900 tail.
>
> **Byte budget:** `measured_at × 1.1` in lines **and** bytes (the `spec-split-check` arm (iv) rule, Spec 122/124
> convention), `measured_at` taken at the spec commit — about 76 KB for this spec and 38 KB for Spec 69 (measured at the activation commit: 68.8 KB / 34.3 KB). Enforced by `spec-split-check` arm (iv) once S8 adds 68/69 to its `SPEC_FILES`
> and to `122_split_manifest.json` `budgets` (`headroom_pct` 10, measured at the spec commit). Until then the budget is
> **declared-only**. Growth beyond it is a reviewed manifest edit; a fold that changes no decision goes to the plan.

**Status:** RATIFIED

**Ratified:** 2026-10-06, with every Spec 69 row. McBylaw Phase 1 is AUTHORIZED (2026-10-06); plan `docs/reports/mcbylaw-phase1-plan.md`.

**Version:** 0.5 · **Domain:** Backend/Pipeline (doc + offline generator). Phase 1 makes no DB writes and changes no live output (Spec 69 M-25).

**Ground truth:**
- Phase 0 audit and Phase 0b probe (2026-10-06, read-only), committed as `docs/reports/mcbylaw-phase0-audit.md` and `docs/reports/mcbylaw-phase0b-exceptions.md`, and the zoning-assignment validation behind Spec 69 M-42 (tag *[measured, zoning validation]*) as `docs/reports/mcbylaw-zoning-validation.md`, in the same commit as this spec. The Phase 1 plan, with its panel fold record, is committed as `docs/reports/mcbylaw-phase1-plan.md`. A tracked spec never cites an untracked file.
- Evidence tags: **[measured]** a script run produced it · **[read]** the text or code was read · **[inferred]** a judgment, not executed.

**Relationship to Specs 122/124.** This spec applies Spec 124 R-BA ("McDonald's Airtight": five words, closed answer sets, every rule a mechanical gate) and R-BF ("Airtight V2": every registry row generated or witnessed; declared == observed) to by-law *content*. It is not a step and does not amend Spec 124. It reuses gate *modules* (§8) but is not run by `step-validate.mjs` or the Spec 79 runner; from Spec 79 it borrows only the rule that a gate not run is never a PASS.

---

## 1. Purpose and objectives

**Purpose.** One table of every Toronto Zoning By-law 569-2013 provision we rely on, built by a generator from the City's own pages, so that every number we show a buyer can be traced to the clause that says it, and every clause we rely on can be checked against the code that applies it.

| # | Objective | Phase |
|---|---|---|
| **O-1** | **One source.** Every by-law fact the product uses lives in one generated table. No second hand-kept copy exists (Spec 67 appendices are generated blocks; the Spec 58 §13 mirror is deleted at S13). | 1 |
| **O-2** | **Exhaustive.** Every regulation on the pinned pages is a row: in scope and fully authored, or out of scope with a closed, dated reason. | 1 |
| **O-3** | **Faithful to the text.** Every number, unit, zone, building type and cross-reference in a row is mechanically checked against the cited clause. | 1 |
| **O-4** | **Interpreted twice, executed once.** Every structured interpretive field is drafted twice, blind; agreement passes, disagreement goes to a person. Every expression is **executed** against worked examples. Free text is drafted once and checked mechanically. An expert audits a sample. | 1 |
| **O-5** | **Standardized like a step.** Every clause is categorized from one closed archetype model with a fixed shape, so one generic handler per archetype can apply it. | 1 (model, evaluator), 3 (handlers) |
| **O-6** | **Cheap to keep current.** An amendment is detected by a re-fetch diff; only the clause units whose text changed become `pending:stale` and are re-keyed. | 1 |
| **O-7** | **Honest about what it does not cover.** Former by-laws, provincial overrides, unmodelled constraints, model heuristics and uncaptured exceptions are rows or counted disclosures. | 1 |
| **O-8** | **Ground-truthed.** Required values checked against Committee of Adjustment (CoA) decisions; our code's values checked against the table. | 2–3 |

## 2. Intent — why this exists

1. **The buyer report's truth.** A buyer report quotes a setback, a height, a unit count. Today those numbers come from code constants, Spec 67 prose and comments, which drift apart. The report must quote one table, with a citation and a consolidation date, and never present an unverified row as authoritative (Spec 69 P-1).
2. **Checking that the by-law is applied correctly.** The audit found live garden- and laneway-suite constants stale against by-law 849-2025: `BYLAW.GARDEN_HEIGHT_HIGH_M` 6.0 vs 150.7.60.40(1)(B) 6.3 m; `BYLAW.GARDEN_SEP_LOW_M` 5.0 vs 150.7.60.30(1)(A) 4.0 m; a cited 150.7.60.70(1)(C) that no longer exists. Live reach: `opt_suite_type` garden 339,661 / laneway 67,438 parcels, `garden_suite_fits` true on 299,416 *[measured, read-only, 2026-10-06; reproduced by the panel]* (Spec 69 M-22, M-25).
3. **Amendment detection.** The City amends 569-2013 continuously. A hand-kept table cannot say what changed; a generated, sha-pinned table can, clause by clause.
4. **CoA-validated accuracy.** Mechanical gates prove the table matches the text, not that the *interpretation* is right. CoA notices give an independent ground truth (Phase 2/3).
5. **Measured baseline** *[measured, Phase 0 audit]*: of 420 envelope + existing-building regulations, **16.9 %** were captured anywhere in our docs or code, **9.5 %** verbatim, **0 %** with every field. The standard exists to make a forgotten field impossible to ship.

## 3. Measurable success criteria

Each is printed by the validator or recorded by a named artifact.

| # | Criterion | Measure (closed) | Baseline | Target | Phase | Measured by |
|---|---|---|---|---|---|---|
| **SC-1** | Coverage | complete rows / in-scope rows (in-scope count pinned in `universe.lock.json`) | 0 % all-fields *[measured]* | **100 %** (pending = 0, incl. `pending:stale`; failed = 0) | 1 | five lines |
| **SC-2** | Executed expressions | (a) agreed/adjudicated `numeric_expression` units that evaluate without error on every applicable vector; (b) `by_law_expected` vectors matched, printed with their count n and the adjudicated-mismatch count | 0 (never executed) | **(a) 100 %; (b) 0 unexplained mismatches — a sample of n vectors, not a proof** | 1 | G-EVAL |
| **SC-3** | Double-key agreement | ⧉ fields whose canonical drafts agree, before adjudication | unknown; S0.5 measures it | **reported; 100 % of disagreements adjudicated.** Floor set from the S0.5/A1 rate (Spec 69 M-17, M-44) | 1 | G-AGREE |
| **SC-4** | Expert audit | agree / sampled rows; disagreements on `numeric_expression` | none | **≥ 95 % agree and 0 numeric disagreements** on exactly 50 rows (Spec 69 M-29) | 1 | G-AUDIT |
| **SC-5** | CoA match rate | CoA "required" values equal to the table's effective value | n/a | target set by the Phase 2 plan | 2–3 | Phase 2 CoA harness |
| **SC-6** | Code-linkage findings | open code ≠ by-law disagreements + unmapped root-module constants | ≥ 4 known (F-1) *[measured]* | **reported in Phase 1** (Spec 69 M-25); **0 open at Phase 3 close** | 1 → 3 | G-CODE (ii)/(iv) |
| **SC-7** | Cost to update after an amendment | units made `pending:stale` by a re-fetch vs units whose normalized text changed | whole-table re-read | **stale = changed exactly; 0 unflagged changes; no commit blocked** | 1 | G-CHANGE + G-TEXT fixtures |
| **SC-8** | Zero hand-edited rows | generated JSON / MD byte-equal to an in-memory regeneration | n/a | **0 diffs** | 1 | G-DRIFT |
| **SC-9** | Zero unresolved references | refs that resolve to neither a row nor an `external.json` `ref` entry | 2 of 97 exception targets *[measured]* | **0** (source defects carry a closed reason, counted) | 1 (std), 2 (exceptions) | G-XREF |
| **SC-10** | Nothing hidden | every row state, draft failure, disagreement, finding and gate state counted on the five lines | n/a | **no PASS hides an unrun gate** | 1 | validator output |
| **SC-11** | Page-set completeness | TOC entries that touch residential zones and map to neither a pinned page nor a page rule | 1 missed (Ch.600.60) *[measured]*; S0.5: 23 more + 1 undetermined (Ch.500) *[measured]*, ruled by Spec 69 M-47 | **0** | 1 | G-UNIVERSE |
| **SC-12** | Closed-model fit | clause units keyed `UNUSUAL` | pre-sorter prior only (3.0 % std · 1.0 % exception, a regex of ≈ 77–90 % precision, not a measurement); **true share measured on keyed units by S0.5** | every UNUSUAL unit `not_modelled` and disclosed; share reported | 1–2 | G-SHAPE |
| **SC-13** | Exception coverage | excepted residential lots whose exception, and every exception it INCLUDEs, is captured | 0 % | wave 1 / both waves re-measured at Phase 2 entry (probe: direct-ranked top 220 = **74.75 %**; INCLUDE-closed-ranked top 220 = **74.38 %**; both waves 88.6 % of 339,125) *[measured, panel]* | 2 | census render |

## 4. The five words, defined for the table

Each word is one `--validate` line. Common fields: `WORD: PASS|FAIL (complete n / in_scope N; pending p (stale s); failed x; draft_failures q; disagreements d; disclosed_defects k; gates pass a / run r / total t)`. Per-line extensions, as named fields: OBSERVABLE adds `snapshot_age_days` (WARN past `vocab.max_snapshot_age_days`; the clock is read only in `scripts/analysis/bylaw/clock.mjs`); ACCURATE adds `findings`, `eval_mismatches_adjudicated`, `expert_rulings_against`, `agreement_rate` with the fixed label `agreement≠correctness`, and `code_linkage=declared-only` until a test executes the referenced code against `effective()` (Phase 3). `total` counts the 13 Phase 1 gates. A sixth line, **`PHASE 1: DONE|NOT_DONE`**, is computed from the closure conditions below; it never affects the exit code, and S14 requires DONE — this is the coverage lock that replaced G-COV.

**Gate state** is closed: `pass · fail · not_run`. A gate not run is never a PASS (Spec 79's rule). An on-demand gate (G-CHANGE, G-AUDIT) counts as run only when its latest committed record is bound to the current snapshot / row hashes.

**Row state** is closed and computed by **G-SHAPE**, last among the content gates (§9), from every gate's results:
- **`complete`** — (a) the row-level fields are present (`scope`, `explanation`, `calculation_handling`, `code_refs` or "none", `definitions_used`, `drafts`); (b) every clause unit has every field §7.3 requires for its archetype; (c) every authored field has `field_status = verified` (no gate names it); (d) every ⧉ field has an `agreed` or `adjudicated` record; (e) every unit's `verified_against_sha256` equals the current unit sha.
- **`pending`** — no `authored/` entry yet, a sealed `.a` draft with no `.b` yet, or drafts awaiting adjudication. Counted, never failing.
- **`pending:stale`** — (e) fails because an adoption changed the unit's normalized text. Counted, never failing; only that unit is re-keyed.
- **`failed`** — agreed or adjudicated content that a gate rejects, or a generated-content defect. A gate failure on a draft that is not yet agreed is a counted `draft_failure` and goes to adjudication; it does not fail the row.

**Pending never fails a gate.** A content gate evaluates only agreed/adjudicated units; a check or eval vector whose inputs are pending (e.g. a vector's target has no agreed unit yet) is counted `pending` or `draft_failure` and never sets gate state `fail`. So at S8, with 0 agreed rows, `--check` exits 0 (fixture). A known City source defect (a garbled character, an omitted item) is a counted **disclosure** (`disclosed_defects`), not a failure.

**A word PASSes** when every pre-commit gate under it passes and no row it covers is `failed` (both inputs are computed, never asserted). `pending` never makes a word FAIL, so the pre-commit `--check` (Spec 69 M-32) never blocks a commit for unfinished authoring or for a City amendment. **Phase 1 is done** (`PHASE 1: DONE`) when all five lines PASS, pending = 0, failed = 0, every Phase 1 gate is run (`run = total`), and G-AUDIT has PASSED.

| Word | Means, for a by-law table | Gates (§9) |
|---|---|---|
| **STANDARDIZED** | Every row has the same shape for its archetype; every value comes from a versioned vocabulary; "none" is written, never omitted; the text is sliced exactly once. | G-TEXT · G-SHAPE |
| **OBSERVABLE** | Every row says where it came from (url, page sha, consolidation date, `fetch_id`), which amending by-laws touch which clause and their status, who drafted it and how blindness was kept. | G-PROV · G-DRIFT |
| **ACCURATE** | Every number and application term is in the cited clause; references resolve; interpretation is double-keyed; every expression is executed; code linkage is resolved. | G-CLAUSE · G-XREF · G-AGREE · G-EVAL · G-CODE |
| **UNDERSTANDABLE** | Every row has a buyer-readable explanation tied to its literals; definitions resolve and say how faithfully our data measures them; external and heuristic rows say what we do not evaluate. | G-READ |
| **SCALABLE** | The universe is pinned and exhaustive; an amendment marks exactly the changed units stale; the expert audit is bound to the table version. | G-UNIVERSE · G-CHANGE · G-AUDIT |

## 5. McDonald's Airtight V2, applied to the table

| Airtight V2 term | By-law table analogue | Enforced by |
|---|---|---|
| **Generated** | Every *generated* field (id, verbatim, clauses, literals, units, refs, provenance, `value_form`, `layer`, `displaces[]`, status) is written only by the generator from the pinned pages. | G-SHAPE (no generated field in an authored file), G-DRIFT |
| **Witnessed** | Every ⧉ field is double-keyed blind and agrees canonically or carries an adjudication by a person who is neither keyer. Single-drafted fields (`explanation`, `calculation_handling` status, `description`, `gaps`, `disclosure`, `code_refs`, heuristic rows) are checked mechanically and sampled by the expert. All are validated against the clause text. | G-AGREE, G-PROV, G-CLAUSE, G-READ |
| **Executed** | Every agreed `numeric_expression` is evaluated, and `effective()` resolves precedence on real lot vectors, in Phase 1. | G-EVAL |
| **Never hand-kept** | No row, count, backlog or appendix is typed by hand. Counts come from `universe.lock.json` / `census.json`; Spec 67 appendices are generated blocks. | G-DRIFT, G-UNIVERSE |
| **Declared == observed (Phase 1)** | **The table equals the by-law text**: each verbatim equals its page slice; each literal is in the cited clause; each verified unit is pinned to the unit sha it was verified against. | G-TEXT, G-CLAUSE |
| **Declared == observed (Phase 3)** | **The code equals the table.** In Phase 1 a code ref is shown to *exist*, not to *apply the rule*; the ACCURATE line says `code_linkage: declared-only` until a parity test executes the code against `effective()`. | G-CODE (i) blocking; (ii) report-only → blocking by a Phase 3 ruling |

## 6. The standard row

One row per slicer `regulation_id` (`<article>(<n>)`, `<article>#article`, `800.50(<n>)`; Ch.900 exceptions `900.<k>.10(<n>)` with k = 2 R · 3 RD · 4 RS · 5 RT · 6 RM; 900.1 is the general section). Clauses are a generated `clauses[]` sub-array with path ids such as `(3)(A)(i)` (Spec 69 M-2). Legacy Spec 67 / Spec 58 ids are rewritten once at S12/S13 and carry no permanent alias field. A clause unit's id is `regulation_id#clause_path`; `displaces[]` and `include_ref` resolve to unit ids where the text names a clause, else to the row. Three id forms come from the City page itself (Spec 69 M-57): a repeated division is a status-tagged variant `<id>~<status>` (e.g. `200.15.1(1)~under_appeal`); a data-table cell adds `[T<k>.R<i>.C<j>]` to its owner's clause path and carries its row and column headers; an amendment sliced from a captured enacting by-law is the row `<citation>@<by-law>` on page `enacting:<by-law>`, and the consolidation row it replaces points at it (`current_source`).

**The unit of classification is the clause, not the row.** A regulation often bundles clauses of different archetypes (600.60.40(3): (A) PERMIT, (B) a requirement, (C) DEFINE, (D) PROHIBIT). The classification facets — `archetype`, `target`, `bound`, `value_form`, `condition`, `applies_to.part`, `displaces[]`, `include_ref` and the §7.3 archetype-specific fields — live on each **leaf clause unit** in `clauses[]`. The row carries the verbatim, provenance, scope, status and explanation.

**G** = generated; **A** = authored once; **⧉** = authored by two blind keyers and compared. **The ⧉ set is exactly the fields marked ⧉ in this table** (Spec 69 M-17) — since the A1 narrowing (M-17 dated note 2026-10-07 (A1)): `archetype`, `target`, `bound`, `numeric_expression`; the fields narrowed out are drafted once by keyer A and expert-sampled (M-29). An authored file may contain only A / ⧉ fields.

| Word | Field | Own | Closed set / content |
|---|---|---|---|
| STANDARDIZED | `regulation_id`, `section_path` | G | slicer ids |
| | `topic` | G | `vocab.topic` |
| | `relevance` | G | `envelope · existing_building · permission · precedence · definition · informational · governance · risk_reference` |
| | **`archetype`** (per unit) | ⧉ | the 10 members of §7.1 |
| | **`value_form`** (per unit) | G | derived from the parsed `numeric_expression` (§7.2) |
| | **`target`** (per unit) | ⧉ | a `vocab.dsl_target` variable, or "none" (a LIMIT unit must name one) |
| | **`bound`** (LIMIT units) | ⧉ | `min · max · exact` (a count is a target in `units`, bounded min or max) |
| | **`requirement`** (REQUIRE units) | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | `vocab.requirement` |
| | **`instrument`** (PREVAILING units) | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | `{kind: former_bylaw · former_section · schedule_map, citation, municipality}` |
| | **`evaluated_by_us`** (PREVAILING units) | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | `no` (kept ⧉ by operator direction, B4) |
| | **`ranks_layers[]`** (PROCEDURAL precedence units) | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | the layers this precedence rule ranks, e.g. 900.1.10(3): `exception > base, overlay`; the data §7.5 rule 3 reads |
| | `disclosure` (UNUSUAL / not-evaluated units) | A | buyer text, G-READ rules |
| | **`layer`** | G | `base · overlay · exception · provincial`, from the source (Ch.600 → `overlay`) |
| | `units[]` | G | unit table |
| OBSERVABLE | `source` | G | url, raw + normalized page sha256, consolidation date, `fetch_id` → `fetched_at` recorded at fetch |
| | `amendments[]` | G | `{bylaw, clause_path}` per `[ By-law: … ]` tag, bound to the clause it follows. Status lives once per by-law in `amendments.json`: `{bylaw, status, enacted_on, in_force_on or in_force_trigger, source_url, source_sha256, verified_on, basis}` (`basis` = the Spec 69 row or research record that verified a non-default status; required with `source_url`, `source_sha256` and `verified_on` on every status other than `not_verified`); status ∈ `in_force · under_appeal · partially_in_force · repealed · not_verified · in_force_not_in_consolidation` (default `not_verified`, shown). A status never changes `row_status` or precedence candidacy in Phase 1; every non-`in_force` status is shown with a notice (Spec 69 P-1) |
| | `field_status` per field | G | `verified · unverified · failed:<closed reason>` |
| | `enacting_source` | G | where an enacting by-law's text is held: `{bylaw, url, pdf_sha256, extraction_sha256, extractor_version, fetch_id}` + the compared excerpt (Spec 69 M-36, M-39) |
| | `row_status` | G | `complete · pending · pending:stale · failed` (§4) |
| | `last_changed_in` | G | adoption id in which the verbatim last changed (`adoptions.json` records each adoption's per-unit shas, so this is reproducible offline) |
| ACCURATE | `verbatim` + sha, `clauses[]`, `numeric_literals[]` | G | page slice |
| | `numeric_expression` | ⧉ | DSL statements, each `@clause`, or "none" (§7.4) |
| | `literals_not_expressed[]` | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | `{literal, clause, reason}`, closed reasons |
| | `application` | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | zones, building types, lot conditions, uses — each token with clause + ≥ 2-word evidence phrase |
| | **`condition`** | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | one or more `lot_condition` tokens (a list is a conjunction, §7.4) + DSL `if`, or "none"; a numeric `if` needs a band/threshold token; a token-only condition has no `if` |
| | **`applies_to.part`** | A (⧉ until A1; narrowed, Spec 69 M-17 note 2026-10-07 (A1)) | `whole · named_addresses · lot_list · map_area`, with refs |
| | `cross_refs[]` | G | resolved row or `external.json` `ref` ids |
| | **`displaces[]`** | G | resolved ids from "Despite …" / "does not apply"; irreflexive and acyclic |
| | `include_ref` | G | INCLUDE units only; resolved to a row; expanded transitively with cycle check |
| | `calculation_handling` | A (`not_modelled_reason`, `user_inputs`: ⧉ until A1, narrowed by Spec 69 M-17 note 2026-10-07 (A1)) + A (status — drafted once by keyer A, because it needs code knowledge keyer B must not have (Spec 69 M-17 note 2026-10-07); description, gaps) | `modelled · partially_modelled · not_modelled · informational` |
| | `code_refs[]` | A | `table.column` · `module#dotted.member` (paths limited to `vocab.code_roots`; anything else fails closed) · logic variable, + `expects` on constants |
| UNDERSTANDABLE | `explanation` | A | buyer-facing text |
| | `definitions_used[]` | G | resolved |
| | `input_fidelity` (Ch.800 measurement rows only) | A (status: ⧉ until A1, narrowed by Spec 69 M-17 note 2026-10-07 (A1)) + A (why, `evidence_ref`) | `{our_field, matches · approximates · differs · unknown, why, evidence_ref}` |
| SCALABLE | `scope`, `scope_rule_id`, `out_of_scope_reason` | G | one rule per row, closed reasons; mechanical reasons first, then `administrative_no_application_effect` beats informational (Spec 69 M-31) |
| | `verified_against_sha256` (per unit) | G | sha256 of the **unit's normalized text**, written by the generator into the brief and copied into the agreement record (never typed by a keyer); a mismatch with the current unit makes it `pending:stale`. A normalizer bump that leaves the normalized text unchanged changes nothing |
| | `drafts` | G | draft ids, `agreed · adjudicated`, `adjudicated_by`; rendered in the table. Draft bodies and the provenance record stay in `authored/` |

**Table-level header** (once, not per row): `validated_against` = adoption id + generator, vocab and normalizer versions (never a timestamp).

### 6.1 External rows — one file

`external.json` holds every non-sliced entry, discriminated by `kind`. **Rows** (ids `EXT-<kind>-<n>`): `governance_former_bylaw · provincial_precedence · risk_reference`, with `title, authority, citation, url, source_sha256, excerpt, explanation, precedence (none · active), evaluated_by_us (no | yes:<spec>), verification_status (verified_primary · verified_secondary · unverified), verified_on, additional_sources[] {citation, url, source_sha256}` (further instruments a row cites, each pinned by sha) and `risk_feeds[] {structure, aspect}` (the MaxBLD outputs the row puts at risk, in the M-52 vocabulary; authored, not generated). `precedence` is `active` only on a `verified_primary` provincial row that carries `provincial_units[]` (Spec 69 M-55); every other row is `none`. A provincial unit is `{unit_id, citation, verbatim, target, bound (min · max), value, unit, limits_bylaw (min_permission · max_requirement), direction_basis (verbatim · inferred), bylaw_prevails_citation, scope}` — `min_permission` (bound max): a by-law maximum may not be below `value`; `max_requirement` (bound min): a by-law minimum may not be above `value`; `direction_basis` says whether the clause states the direction or it is inferred from s.35.1(4); and `scope` = `{land, applies_to (parcel · building_pair), principal_building_types[], unit_configurations[] {house_units[], ancillary_units[]}, other_building_contains_unit}` taken from the regulation's own words; the evaluator treats it as a layer-`provincial` candidate (§7.5) only when the lot meets `scope`. A `url` on e-Laws is the Word download (`ontario.ca/laws/docs/<id>_e.doc`), because the HTML page is script-rendered and has no stable bytes; `excerpt` is verbatim, with fragments joined by ` … `. An `unverified` row carries only its title, authority and "not evaluated — citation pending" (`citation`, `url`, `source_sha256`, `excerpt` are null; the schema has a separate `unverified` branch). **References** (kind `ref`): a citation target that is not a row (e.g. a chapter outside the page set), with `citation, url` and a closed reason; counted and printed. A reference into an unpinned Ch.900 exception has reason `phase2_exception`; in Phase 1 an `include_ref` may resolve to such a ref (counted), and from Phase 2 it must resolve to a row. **Heuristics** (kind `model_heuristic`, §6.3).

| Row | Kind | Content | Verification today |
|---|---|---|---|
| EXT-gov-1 | governance_former_bylaw | 1.5.7(1) (itself a sliced row) excludes former-by-law lands. 17,829 parcels have no polygon in our 569-2013 layer (COMMON 16,725 + CONDO 1,104; 1 has no geometry): former-by-law lands mixed with Spec 58 coverage gaps; disclosed "no 569-2013 zone found; not evaluated". Max-build produces envelopes for ≈ 12,762 of them (F-5) | 1.5.7(1) verified_primary; parcel claim inferred |
| EXT-prov-1 | provincial_precedence | Planning Act s.35.1(1) (and s.16(3)): a by-law may not prohibit up to 3 units on a parcel of urban residential land (a detached house, semi-detached house or rowhouse with 2–3 units, or 2 plus 1 in an ancillary building). **`precedence: active`** (Spec 69 M-55; under s.35.1(4) the regulation prevails over a by-law). `provincial_units[]` carries the O. Reg. 299/19 standards (as amended by 593/22 and 462/24), each with its verbatim clause and scope as data: **coverage** s.5(1)1 "Up to 45 per cent of the surface of the parcel is permitted to be covered by buildings and structures" (a by-law permitting more prevails, s.5(2)); **FSI** s.5(1)2 "Subject to any maximum height and minimum setback requirements in a by-law … there is no limit to the floor space index of the parcel"; **separation** s.4(1)2 "The building or structure shall be at least 4 metres from another building or structure on the parcel if the other building or structure contains a residential unit" (a by-law permitting less prevails, s.4(2)). Scope: s.5 applies to "parcels of urban residential land on which additional residential units are located"; s.4 to "buildings or structures that contain additional residential units and that are located on parcels of urban residential land". Not carried in Phase 1: s.4(1)1 angular-plane penetration (no `dsl_target`), s.2 parking | verified_primary (e-Laws) |
| EXT-risk-1 | risk_reference | Tree protection, Toronto Municipal Code Ch.813 §813-12 | verified_primary (R-12 closed) |
| EXT-risk-2 | risk_reference | Ontario Building Code (O. Reg. 163/24 s.1 adopts NBC 2020 + Ontario Amendments), spatial separation / limiting distance, NBC Div. B 9.10.14 / 9.10.15 (not quoted: NRC licence) | verified_primary (R-12 closed; Ontario Amendments not read) |
| EXT-risk-3 | risk_reference | TRCA regulated areas (Conservation Authorities Act s.28(1), s.28.1; O. Reg. 41/24 ss.2, 4). Not modelled; `RAVINE_SETBACK_M` is a heuristic row (§6.3), not this regulation | verified_primary (R-12 closed) |
| EXT-risk-4 | risk_reference | Heritage → Spec 61 (`evaluated_by_us: yes:61`); Ontario Heritage Act s.33(1), s.42(1) | verified_primary ("n/a" is not a status; the citation is checked like any row) |
| EXT-risk-5 | risk_reference | Ravine → Spec 59 (`evaluated_by_us: yes:59`); Toronto Municipal Code Ch.658 §658-2 | verified_primary (as EXT-risk-4) |

Seven rows. A by-law captured under Spec 69 M-36 is **sliced** from its extracted enacting text (held under `enacting/` and treated as a page by G-TEXT), not kept as an external row; the v0.4 `unconsolidated_amendment` kind is retired. "Every external row" (Spec 69 M-29) means these EXT-* rows only, not `ref` or heuristic entries. Bill 139 is research R-9, not a row.

### 6.2 Input fidelity — likely answers *[inferred, Integration]*

Lot frontage / depth `approximates` (minimum-bounding-rectangle short/long side scaled to the true area by √(area / MBR area), not street-oriented; `scripts/lib/compute/load-parcels.js:205-243`; R-13); lot area `approximates`/`matches` (98.5 % within 5 % of geometry, Spec 55); height from established grade `unknown` (no grade data); building length / depth `approximates`.

### 6.3 Model heuristics — a closed row kind

A model heuristic is a number our code uses that is **not** a by-law value. It is a row so that code linkage can classify every constant: **by-law** (cited by a sliced row's `code_refs`) · **heuristic** (a `model_heuristic` row) · **unmapped** (a counted finding). A `model_heuristic` row (`HEUR-<n>`) carries `name, value, unit, code_ref (module#member, or the logic variable where the constant is a fallback for one — no hand-kept line number; the generator reports the line), purpose, reason, related_regulations[], explanation`, with `reason` ∈ `modelling_assumption · data_cleaning_bound · tolerance · statistical_default · proxy_for_unmodelled_rule`. It is single-drafted, checked by G-READ, listed in the buyer report as a model assumption, and never cited as law. Examples *[measured, file:line 2026-10-06]*: `scripts/lib/max-build.js:25` `LOT_TOLERANCE` 0.15 · `:27-28` lot band 50–2000 m² · `:33-35` storey height 3.0 / 3.0 / 4.0 m · `:81` `RAVINE_SETBACK_M` 10.0 (proxy for Ch.658 / Spec 59) · `:87` minimum dimension 3.0 m · `:99`, `:105` garage / laneway-suite minimum lot 230 m² · `COVERAGE_DEFAULTS` zone medians (e.g. RD 33 %, Spec 67 64 Eastbourne example). The full list (≈ 60 constants, panel Explore map) is re-derived mechanically by G-CODE (iv) at S9; a constant whose comment claims a by-law source but has none (F-2: `GARDEN_SUITE_MIN_LOT_SQM`, `MIN_SOFT_LANDSCAPING_PCT`) is classified by the operator at S9, not assumed. The live use of `bylaw_standard_setback_m` (STAND_SET, a CR standard-set selector, Spec 67 KFM-14) as a front setback is a G-CODE finding, never a row citation; banned citations live in `vocab.banned_code_refs` with a reason.

### 6.4 Standing rules (moved from Spec 69 v0.4; ids retired there, never reused)

1. **(was M-3) The universe is a pinned, versioned page set.** Changing it is a Spec 69 ruling (M-37 is the first, M-47 the second). **One page per TOC section**: a chapter URL holds only that chapter's first section *[measured, S0.5]*, so the pinned list names each section page. A **retired** page is pinned (fetched, sha-checked) and its rows render as out of scope with a closed reason; an **excluded** page is listed with its ruling and never fetched. — G-UNIVERSE, G-PROV.
2. **(was M-4) Exhaustiveness is a gate.** Every row matches exactly one scope rule; judgment reasons carry evidence; in-scope counts are pinned both directions. — G-UNIVERSE.
3. **(was M-5) Coverage is complete-row counts.** No floor file: pending = 0 at close (SC-1) supersedes it. — five lines.
4. **(was M-6) Generated and authored fields are disjoint;** every authored file has a schema; no prose lives in code. — G-SHAPE.
5. **(was M-7) Closed, versioned vocabularies; "none" is written, never omitted** (Spec 124 R-BA; Rule 6). — G-SHAPE.
6. **(was M-8) Numbers are checked against the cited clause, and every number in it is accounted for;** one anti-vacuity scan for numbers (G-CLAUSE) plus one for displacement triggers (G-XREF).
7. **(was M-9) Application terms need ≥ 2 words of evidence from the cited clause; `any` building type only when the clause names none** (276 / 420 regulations name a type *[measured]*). — G-CLAUSE.
8. **(was M-10) Calculation handling is described in the table; code is parsed, never executed by the generator.** Refs resolve by static AST; a planned field alone cannot make a row `modelled`. — G-CODE (i).
9. **(was M-12) Authored units are pinned to the unit sha;** re-verification after a text change needs a new draft pair. — G-TEXT.
10. **(was M-13) Provenance is explicit:** raw + normalized pages kept; `fetch_id` → `fetched_at` recorded at fetch, never file mtimes; refresh transactional; writes atomic. — G-PROV.
11. **(was M-16) Definitions are linked by a declared matcher;** mechanical scope takes precedence; a flip either way needs `--accept --ruling`. — G-READ, G-UNIVERSE.
12. **(was M-18) Explanation rules:** mentions every expression literal; bounded length; no banned assurance words; bound and list in `vocab.json`. — G-READ.
13. **(was M-24) Cross-references, "Despite" targets and INCLUDE targets resolve;** INCLUDE expansion is transitive and cycle-checked. — G-XREF.

### 6.5 Closed vocabularies (`vocab.json`, versioned)

- `out_of_scope_reason`: mechanical `deleted_slot`, `definition_not_used`; judgment (evidence required) `non_residential_use_condition`, `apartment_building_only`, `apartment_amenity_or_waste`, `home_occupation_use`, `non_residential_zone_parking`, `unzoned_or_city_service`, `parking_aisle_or_marking`, `administrative_no_application_effect`.
- `zone`: R · RD · RS · RT · RM ("Residential Zone category" expands to all five).
- `vocab.max_snapshot_age_days`, `vocab.code_roots`, `vocab.dsl_input` map (G-READ).
- `vocab.topic`, `vocab.dsl_target` (one entry per by-law concept, each with its unit and evidence patterns, no synonyms), `vocab.requirement`. **`dsl_target` is enumerated in Phase 1 (S5) for the standard regulations; Phase 2 extends it for exception-only concepts.** This is the only statement of its phase.
- **`feeds`** (generated, never keyed; Spec 69 M-52): which MaxBLD output a unit feeds = (`structure`, `aspect`). `structure` comes from the unit's `application` building types through `vocab.building_type.structure` (`principal` · `suite` · `ancillary` · `any`); `aspect` comes from its `target` through `vocab.dsl_target.aspect` (`envelope` · `landscaping` · `parking_access` · `use_permission` · `lot` · `measurement`). Both maps are set once per vocabulary entry at S5. Checks: G-SHAPE totality (every LIMIT/PERMIT/PROHIBIT unit resolves to ≥ 1 pair, no unmapped vocab entry); G-CODE cross-check at S9 (a `modelled` unit's `code_refs` resolve into a module registered for its `feeds` pair, report-only in Phase 1); the renderer prints unit counts per pair. A PERMIT / PROHIBIT unit with target "none" takes its aspect from `vocab.feeds.aspect_without_target` (`use_permission`; Spec 69 M-56).
- `scope.page_rule_reason` (TOC page rules, G-UNIVERSE): `other_zone_category`, `non_residential_use_condition`, `chapter_empty`, `zone_labels_from_dataset`, `phase2_exception_pages`, `phase2_overlay_geometry`, `deferred_by_ruling`; with dispositions `out · map_rule · deferred`. `other_zone_category` is also a judgment `out_of_scope_reason` (Spec 69 M-56).
- `building_type`: detached_house, semi_detached_house, townhouse, duplex, triplex, fourplex, fiveplex, sixplex, detached_houseplex, houseplex, apartment_building, ancillary_building, garden_suite, laneway_suite, secondary_suite, any.
- `lot_condition`: corner_lot, through_lot, flanking_lot, frontage_band, required_frontage_band, depth_band, lot_area_band, abuts_lane, abuts_named_street, major_street, overlay_mapped, shoreline_or_top_of_bank, lawfully_existing, heritage_property, exception_area.
- `uses`: dwelling_unit, secondary_suite_use, parking_space, private_garage, swimming_pool, deck_or_platform, energy_device.
- `not_modelled_reason`: needs_user_input, needs_data_we_lack, existing_building_facts, deferred_phase2, ch900_backlog, outside_maxbld_building_types, procedural_not_numeric, map_area_not_held, named_lots_only, prevailing_alternate_path.
- `literal_not_expressed_reason`: threshold_used_in_application, cross_reference_value, count_or_ordinal_not_a_limit, illustrative_or_historic, map_label_value.
- `field_failure_reason` includes `verbatim_changed`, `consolidation_mismatch`, `eval_conflict`; `disclosure_reason` includes `source_defect`; `dsl_input` `null_reason` includes `not_a_measurement`.
- `vocab.displacement_triggers` ("Despite", "does not apply", "notwithstanding", …) with `not_an_override` reasons; `vocab.banned_code_refs`; `vector_status`: `by_law_expected · no_expected:<reason> · model_composite`.
- `heuristic_reason` (§6.3); `adjudication_kind`: `disagreement · consolidation_mismatch · eval_mismatch · eval_vector`.
- `user_input`: building_type, current_stories, existing_driveway_type, existing_driveway_width_m, existing_front_parking_pad, has_secondary_suite, has_garden_suite, has_laneway_suite, roof_type, suite_wall_openings, lawfully_existing_status, pool, unit_count, bedroom_count.
- Anti-vacuity exclusions (declared patterns): clause and regulation ids, by-law numbers, dates, zone labels (e.g. `RD (f12.0; a370) (x5)`), diagram / schedule / map numbers, `[ By-law: … ]` / `[TO: …]` tags.
- Unit table: metres / metre / m → m; square metres / m² → m2; percent / per cent / % → pct; storeys; dwelling units → units; number words → numerals; matched as value + unit on token boundaries (6 m ≡ 6.0 m).

**Expert-audit record** (`expert-audit/<date>-<n>.json`, `n` the audit count): reviewer role + organization + credential (no personal details beyond what the operator approves), date, bar-file blob sha, sampling seed, the 50 sample ids with each row's content hash, per-row `agree | disagree` on values **and** explanation, + note.

## 7. The closed archetype model (operator-approved 2026-10-06, Spec 69 M-30)

Every clause unit — of a standard regulation, an overlay or an exception — is classified on **independent facets**: one *authored* label for what the clause does, one *derived* label for the shape of its value, and a few qualifiers. The Phase 0b probe measured why: a single 12-member label fit only **54.5 %** of lots in the ≥ 100-lot exceptions and **70.2 %** of standard regulations, and **71.7 %** of standard clauses matched ≥ 2 members; the faceted model fits **97.7 %** / **95.2 %** *[measured by a regex pre-sorter, ±10 points; S0.5 measures the keyed share]*.

### 7.1 `archetype` — what the clause does (⧉, 10 members)

| Archetype | Does | Example |
|---|---|---|
| `LIMIT` | a numeric bound (min / max / exact) on one DSL `target` | "the minimum side yard setback is 1.8 m" |
| `PERMIT` | adds a use, building type, encroachment or choice | "a detached houseplex with five or six dwelling units is a permitted residential building type" (600.60.40(1)(B)) |
| `PROHIBIT` | removes a use, building type or action | "no portion of a semi-detached house … may be converted to a fiveplex or sixplex" (600.60.40(3)(D)) |
| `REQUIRE` | a non-numeric obligation | "the required parking space must be located in a building" |
| `DEFINE` | a definition, measurement method or inclusion/exclusion rule | "height is the distance between …" |
| `DISAPPLY` | "regulation X does not apply", no replacement value | RD 5 (B) |
| `INCLUDE` | incorporates another provision | "must comply with exception 900.3.10(1462)" |
| `PREVAILING` | an alternate compliance path under a former by-law, section or schedule; never evaluated | RD 1463 |
| `PROCEDURAL` | governance, precedence or no-effect text | 900.1.10(2)–(4) |
| `UNUSUAL` | anything else → `not_modelled`, disclosed | "no lot may be created that …" |

### 7.2 `value_form` — the shape of the value (generated, never keyed)

`literal · band · formula · by_building_type · if · map_lookup · existing_as_of · none`, derived from the parsed `numeric_expression` (`band(…)` → band; `max/min(…)` → formula; a bare `unlimited` or `unregulated` → literal (Spec 69 M-54); `by_type(…)` → by_building_type; `if(…)` → if; `label(letter)` / `overlay(code)` → map_lookup; `existing(var; date)` → existing_as_of). A nested expression takes the form of its outermost head.

### 7.3 Per-archetype unit shape (G-SHAPE)

| Archetype | Required | Must be "none" / empty | Allowed `value_form` |
|---|---|---|---|
| LIMIT | `target`, `bound`, `numeric_expression` (literals in the cited clause), `units[]` | — | any except `none` |
| PERMIT / PROHIBIT | `application` subject token; optional `condition` | expression "none" unless the condition has literals | `none`, `if` |
| REQUIRE | subject + `requirement` | expression | `none` |
| DEFINE | term or DSL variable; `input_fidelity` when a DSL input maps to it | — | any |
| DISAPPLY | `displaces[]` ≥ 1 resolved | expression | `none` |
| INCLUDE | `include_ref` resolved; expanded transitively, cycle-checked, depth recorded | expression | `none` |
| PREVAILING | `instrument`, `applies_to.part`, `evaluated_by_us: no` | expression | `none` |
| PROCEDURAL | — | expression | `none` |
| UNUSUAL | `not_modelled_reason`, `disclosure` | expression | `none` |

Cross-cutting: an `overlay(code)` without held geometry, an `existing(…)` without as-built input, **or** `applies_to.part` ∈ {`map_area`, `named_addresses`, `lot_list`} ⇒ `calculation_handling` ≠ `modelled` until the map, lot list or as-built input exists. `label(letter)` is evaluable from the lot vector (the dominant label, Spec 69 M-42), so it is not a missing map; label digits are checked against `vocab` label patterns with the same evidence rule as application tokens. Two different `exact` values on one target and layer is a conflict, never resolved by order.

One red-first fixture per archetype × value-form pair **that occurs in real text** (the set is enumerated and pinned at S6; S0.5 starts from the 14 clauses below) (Phase 0b §6.3: RD 5 (A), RM 18 (B), RD 1462 (A), RD 587 (A), RD 254 (C), RD 1463, RD 5 (B), R 604, RD 806 (G), 10.20.40.70(3), 10.40.40.10(1); plus 600.60.40(1)(A)/(B)/(2)(A), explicit displacement of 900.1.10(3) and a conditional height LIMIT).

### 7.4 The DSL

```
statement := target "=" expr "@" clause_path
expr      := literal | variable | unlimited | unregulated | "(" expr ")" | max(arg; …) | min(arg; …) | band(variable; cond:literal; …)
           | if(cond; expr; expr) | by_type(type:expr; …[; other:expr]) | existing(variable; date | enacted(bylaw))
           | label(letter) | overlay(code) | expr op expr
arg       := expr ["@" clause_path]       (a max/min argument may carry its own clause path)
cond      := atom { (and | or) atom }
atom      := variable cmp literal | mapped(code) | labelled(letter) | not atom
literal   := number unit      unit ∈ { m, m2, pct, storeys, units, ratio }
```
`op` ∈ `+ − × ÷` (usual precedence, left-associative); `cmp` ∈ `< ≤ > ≥ =`; arguments separated by `;`; `date` is ISO `YYYY-MM-DD`. Every literal occurs in the cited clause; every variable is in `vocab.json` and licensed by a phrase in the clause; **a literal's unit equals the unit of the variable or target it binds to** (so condition literals in an `if` may differ from the target's unit). Targets are unit-specific (`height_m` and `height_storeys` are two targets): a mixed-measure clause yields two units, never a conversion, and both limits apply independently (so "the lesser of" holds without a cross-target operator). `band` with no matching band and `by_type` for an unlisted building type (with no `other` key) evaluate to `not_evaluated` with a reason, never a default. Two drafts agree when their canonical forms are equal: whitespace removed, numerals normalized, arguments sorted **only** for `max`, `min`, `+`, `×` and `by_type` keys; `if` and `band` keep their order. The grammar was exercised in the S0.5 spike and is fixture-tested at S6 before A1.

**S1 additions (2026-10-07, Spec 69 M-48; each closes an S0.5 gap, `docs/reports/mcbylaw-s05-spike.md` §2.4):**
- **`unlimited`** — "no limit applies" (a value, distinct from `not_evaluated`): 10.20.40.40(1)(B) "the floor space index is not limited by this regulation" → `fsi = unlimited @(1)(B)`. `effective()` treats it as no bound in rule 4a (a max with `unlimited` loses to any finite max). It closed 7 of the 9 inexpressible `by_law_expected` vectors.
- **Presence tests** `mapped(code)`, `labelled(letter)`, `not` — the "if there is no value on the map / in the label" arms: 10.20.40.10(1)(B) `condition.if = not mapped(HT)`; 10.20.30.20(1)(B) `not labelled(f)`; 600.60.40(1)(A) `labelled(u) and label(u) < 6 units`.
- **Absent map arguments in `max`/`min`** — an `overlay(code)` / `label(letter)` argument with no value for the lot is dropped; if every argument is absent the result is `not_evaluated`: 10.20.40.10(1)(D)(i) `height_m = max(13.0 m; overlay(HT))` with HT unmapped → 13.0 m.
- **`other` in `by_type`** — the "any other building" arm: 10.80.40.10(1)(B) `by_type(detached_house: 10.0 m; semi_detached_house: 10.0 m; other: 12.0 m)`. Without `other`, an unlisted type is still `not_evaluated`.
- **Multi-token conditions** — `condition` tokens are a list, read as a conjunction: 10.20.40.70(6) `condition = [corner_lot, <adjacent lot fronts the flanking street>] + if required_lot_frontage_m ≥ 12.0 m` (the second token is added to `vocab.lot_condition` at S5).
- **Argument-level displacement** — `displaces[]` may name a clause path inside another unit's expression (an `arg` tagged `@clause`); only that argument is removed (§7.5 rule 2): 600.60.40(2)(A) displaces 10.20.40.10(1)(C)(ii) (the 10.0 m argument), so `max(overlay(HT) @(C)(i); 10.0 m @(C)(ii))` keeps HT. The spike's whole-unit drop returned 10.5 m where the by-law gives 12.0 m (HT 12.0).
- **Named enactment date** — `enacted(569-2013)` resolves from the pinned page header ("enacted on May 9, 2013" → 2013-05-09), so a clause that says "on the day of the enactment of this By-law" (RD 587) carries no date literal absent from its text.
- **`ratio`** — the unit for a bare FSI number (S0.5 convention fix, M-17 note 2026-10-07): `0.6 ratio × lot_area_m2`.

**Operator ruling 2026-10-07 (Spec 69 M-54; evidence `.cursor/mcbylaw/phase2-trial/TRIAL-REPORT.md` §1.4, 166,909 coverage-null lots):**
- **`unregulated`** — "the by-law sets no limit here", distinct from `unlimited` ("not limited by this regulation") and from `not_evaluated` (we cannot tell): 10.20.30.40(1)(B) (and 10.40/10.60/10.80.30.40(1)(B)) "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" → `lot_coverage_pct = unregulated @(1)(B)`. It is terminal (a whole value or a band / if / by_type arm, never an operand of `max`, `min` or arithmetic); a finite bound at the same layer beats it (rule 4a) and a higher layer replaces it (rule 4). **An `unregulated` result carries the clause that says so** (`evaluate()` returns the statement path, `effective()` the unit id). The R zone has no principal-building coverage regulation at all, so no clause can be carried: R coverage stays `no_candidate` until a ruling on regulation-by-absence.
- **Label letter `au`** — 10.5.1.10(3)(C): "the letters "au" and a numerical value indicates the required minimum lot area for each dwelling unit on a lot, in square metres" → `label(au)`, unit `m2` (read by 10.20/10.40/10.60.30.10(2) for townhouses and 10.80.30.10(2)–(3) for apartment buildings and townhouses; 1,622 lots). Label letters are `f` (m), `a` (m2), `au` (m2), `u` (units), `d` (ratio).

**Layer 3 grammar extension (RATIFIED 2026-10-07, Spec 69 M-72; to be built).** The Phase 3 matrix executed the core report formulas against this grammar and they fail (`.cursor/mcbylaw/phase3-check/dsl-try.mjs`, re-run on the merged tree, same output; red-team `redteam/attacks-eval.mjs` R1–R11). Layer 3 formulas (§11.1) need, and Layer 1 rows may not use:
- **Unit algebra.** `m2 × storeys → m2`, `storeys × m → m`, `m × m → m2`; any other product or quotient of two dimensioned units is `unit_mismatch` statically and `not_evaluated:expression_error` at run time (never a number with `unit: null`, red-team R2/R2b). `ratio` is never the declared unit of a count or storey input.
- **`pct` is a typed quantity.** `pct × X` scales X by value ÷ 100; `pct ÷ number`, `pct × pct` and `pct ± ratio` are `unit_mismatch` (catches the ÷ 100 and percent-of-percent errors, red-team R1/R1b). Each `*_pct` logic variable declares `scale` ∈ {percent, fraction}; a fraction never binds a `pct` slot.
- **Names.** `lv(<id>)` reads an admin logic variable; its unit, bounds and scale come from `logic_variables.json` (`unknown_variable` closes for k, R7). `l2(<target>)` reads the Layer 2 winner by `dsl_target` name. A report-field target (`main_gfa_m2`, `suite_gfa_m2`, `total_gfa_m2`, …) is declared in `vocab.report_target`, disjoint from `dsl_target` and from geometry inputs.
- **Layer 2 winner always beats any raw lot-vector value.** A name that is a `dsl_target` resolves only through Layer 2; a lot-vector key equal to a target name is a structural error, never a silent override (red-team T7: `fsi` 1.0 in `lot.vars` returned 400 m² against the winner's 240 m²; the evaluator today reads `lot.vars` first, `evaluate.mjs variable()`). Lineage comes from the evaluator trace, not from declared `inputs[]`.
- **`floor`, `ceil`, `round`** (one argument, unit preserved): `main_storeys = floor(l2(height_m) ÷ lv(storey_height_m))` (B6).
- **Variable-to-variable comparisons** in `cond`: `atom := expr cmp expr`, units equal (`suite_gfa_m2 < main_gfa_m2`, B7); and **`regulated(<target>)`**, true unless the Layer 2 winner is `unregulated` or `unlimited`.
- **`unregulated` / `unlimited` propagation (closed table).** In `min`: the term is dropped (`min(x; unregulated) = x`); if every term is dropped the result is that value. In `max`: the result is that value. In `+ − × ÷`: the result is that value, carrying the clause that set it. A comparison against it: `regulated()` must guard it, else `not_evaluated:condition_unknown`. A Layer 3 result that is `unregulated` / `unlimited` is a declared result with its clause (shown as "no limit"), never `not_evaluated:*_in_arithmetic` (B2, B3, R5).
- **Map nodes stay in Layer 2.** A Layer 3 formula may not contain `label()`, `overlay()` or `existing()` (red-team T8: an absent `label(d)` in `min` was dropped and 0.6 returned); the `inputs[]` closure check covers every node kind.
- **Alternatives inside one unit** (150.7.60.70(1) "(A) … or (B)") are `max(…)` of the alternatives inside one statement, each `arg` tagged with its clause: the clause's own "or" makes it permissive; §7.5 rule 4a (most restrictive across units) is not engaged.

Red tests: the eight `dsl-try.mjs` probes and R1, R1b, R2, R2b, R4, R5, R6, R7, R10, R11 become fixtures in a planned `bylaw-p3-dsl.logic.test.ts`, red on this grammar, green on M-72. The evaluator change is new code under its own WF, not an arm on an existing gate.

### 7.5 Precedence — one function, data-driven

```
effective(lot, target, candidates) =      (the loader builds candidates per rule 1; effective applies rules 0, 2-7)
  0. the lot has no 569-2013 zone (Spec 69 M-27) => no effective value; disclosed "not evaluated"
  1. [loader] collect applicable units for target: base units for the lot's zone; overlay units (Ch.600) whose
     applies_to binds the lot; the lot's exception units (INCLUDE-expanded); provincial units.
     Keep only units whose condition holds for the lot. A unit whose unit-of-measure differs from the
     target's declared unit is a G-CLAUSE failure, never a candidate
  2. drop units named in an applicable DISAPPLY or in another applicable unit's displaces[]. A displacer
     with a target drops only units of its own target; an entry naming an argument path inside a unit
     drops only that argument (§7.4)                                                          (Spec 69 M-48)
  3. an applicable unit whose displaces[] names a PROCEDURAL unit with non-empty ranks_layers[]
     is not outranked by the layers that unit ranks (read from ranks_layers[], never an id)   (Spec 69 M-38, RATIFIED 2026-10-06)
     - tie-break: it ranks just above the highest layer that rule ranks, so it beats a unit at that
       layer outright; rule 4a (most restrictive) never runs between them                      (Spec 69 M-49)
  4. otherwise the highest layer wins: provincial > exception > overlay > base               (900.1.10(3); Spec 69 M-34)
     - a higher-layer unit replaces only lower-layer units with the same bound direction; a
     different direction is additional. A provincial unit whose regulation says a by-law prevails
     (O. Reg. 299/19 ss.4(2), 5(2)) only restrains a lower-layer unit, per its `limits_bylaw`, so the result
     is the more permissive of the two; it is never ADDITIONAL under rule 6 — with no lower-layer unit the
     target resolves by rule 7 / 7a (an absent limit stays `unregulated`)                     (Spec 69 M-55)
  4a. several applicable units at the same layer: all apply and the most restrictive wins
     (bound min => the largest; bound max => the smallest); two different exact values, or an
     applicable min above an applicable max, => CONFLICT (eval_conflict; an agreed row is failed)
  5. PREVAILING units never change the value; they add "alternate path not evaluated"
  6. a unit whose target has no lower-layer unit for the lot is ADDITIONAL: applied on its own
  7. no candidate remains => "not evaluated" (never a silent default)
  result: {value | not_evaluated | conflict, applied[], winner, trace}

  7a. unregulated BY ABSENCE (Spec 69 M-54 note 2026-10-07): when no candidate of any layer exists for the target
     and the lot's exception (if any) is captured, a cited `absence-rulings.json` entry (zone, target, stated absence,
     checked against the pinned page) gives `unregulated` with evidence kind `absence` — never a clause — flagged for
     the M-29 expert sample; first entry ABS-1: R-zone principal-building coverage (no 10.10.30.40; only 10.10.60.70)
permitted(lot, building_type) applies the same rules to PERMIT / PROHIBIT units
  (result: permitted | prohibited | not_evaluated); a PERMIT and a PROHIBIT at the same rank → prohibited, both
  clauses traced, flagged for the M-29 expert sample (operator ruling (a) 2026-10-07); the M-38 fixture runs through it.

lot gate (operator rulings 2026-10-07, before rules 1–7, for every target and for permitted()):
  (e) a lot label letter outside vocab.label_letter => not_evaluated "label_letter_unknown:<letter>" (fail closed)
  (d) the lot's exception, or one in its INCLUDE closure, not authored for the target (permitted(): use_permission)
      => not_evaluated "exception_not_authored:<exception>" — base and overlay values included, never a base value
      under an exception nobody has read

building type unknown (lot.building_type NULL) and a candidate's applicability depends on it: evaluate
  every residential building type (the list pinned in vocab.json at S6b); return the value only if all
  types agree, else not_evaluated "needs_user_input:building_type" with the per-type values in the
  trace (Spec 69 M-50; V12 is its fixture)
```
**Hardening notes 2026-10-07 (Spec 69 M-60, provisional):**
- *Rule 2, argument level:* a same-target displacer naming an argument takes that argument's place in the host expression, and the rewritten unit carries the higher of the two layers; this is the reading under which the §7.4 example gives 12.0 m (HT 12.0), and the code implements it.
- *Rule 4, provincial:* a provincial unit (only from `external.json`, scope resolved through `vocab.provincial_scope`) restrains a more restrictive by-law value of its own bound direction per `limits_bylaw`; it is never additional and never switches rule 7a off.
- *Rule 4a:* `unlimited` and `unregulated` at one layer report `unlimited`; ties go to the first unit in the declared total order (layer, `unit_id`, content).
- *Rule 7a:* absence needs the lot's exception and its INCLUDE closure authored for the target and no by-law unit (keyed or pending) for the target; else `not_evaluated:exception_not_authored:<exception>` or `no_candidate`. Every ruling is executed against its page, case-insensitive and structural.
- *Undecided applicability:* every combination of undecided units (at most 8) is resolved; a value only if all agree (M-50 generalised), else `not_evaluated` with the declared-priority reason. Every result lists `inputs[]`, the lot inputs read (conditions included).
- ~~*Held:* PERMIT vs PROHIBIT at the same rank stays `conflict` for an operator ruling.~~ **Ruled 2026-10-07 (a):** PROHIBIT wins; the result names both clauses and carries `expert_sample: true`.

**Operator rulings 2026-10-07 (Spec 69 M-60, M-55 dated notes):** (a) PERMIT vs PROHIBIT at the same rank → PROHIBIT. (d) An unauthored exception (or one in its INCLUDE closure) blocks every target on the lot, not only rule 7a — *[measured, local DB 2026-10-07]* 339,125 of 440,094 residential lots (77.1 %) carry an exception and none is authored yet; after authoring wave 1 (220 exception keys) 85,622 (19.5 %) stay blocked, after wave 2 (295 more) 38,509 (8.75 %, the 2,378 keys under 100 lots). (e) A label letter outside the grammar fails closed; the letters that occur in residential dominant labels are exactly `f` 249,981 · `d` 222,130 · `a` 198,309 · `u` 54,891 · `au` 1,622 lots — none outside the grammar (5 lots carry the holding prefix `(H)`, not a label letter). (b) Provincial scope maps a detached / semi-detached houseplex (and duplex / triplex) only up to 3 lot units, as cited, inferred data for the M-29 expert sample. (c) `parcel_of_urban_residential_land`: an explicit lot input wins; else a declared citywide default `true` (Planning Act s. 1(1)); 6 septic-permit parcels are `unknown` → `not_evaluated:missing_input`.

Rules 2 and 3 differ: 600.60.40(1)(A) displaces base Ch.10 unit-count rows (rule 2); 600.60.40(1)(B) displaces the 900.1.10 precedence rules themselves (rule 3). Rule 2's own-target limit is from S0.5: "Despite regulation 10.20.40.70(3)" in 10.20.40.70(6) (street side yard) dropped every (3) unit, so the corner lot lost its interior side yard (1.5 m, 10.20.40.70(3)(D)) *[measured, spike]*. Rule 3's tie-break: with a plain tie, rule 4a would let an exception max of 9.0 m beat an overlay "Despite 900.1.10(3)" max of 10.5 m; the spike fixture expects 10.5 *[measured, spike]*. Replace-vs-additional is computed from whether a lower-layer unit exists for the same `target` (Phase 0b pitfall 5): only **3.6 %** of exception clauses say "Despite" *[measured]*; the rest override implicitly under 900.1.10(3) *[read]*. Precedence is therefore keyed on `target`, never on a cited regulation id. Because this implicit-override reading decides most exception outcomes, the 900.1.10 rows are always in the expert sample (Spec 69 M-29).

### 7.6 The evaluator — executed in Phase 1 (Spec 69 M-43)

`scripts/analysis/bylaw/evaluate.mjs` is a pure function (no DB, no network, no clock): `evaluate(expr, lot) → {value, unit, trace}`, `effective(lot, target, candidates)` and `permitted(lot, building_type)` (§7.5), plus the candidate loader. A **lot vector** holds the zone and label parameters read from the parcel's **dominant label + exception key** (Spec 69 M-42, never the aggregated `bylaw_*` columns; a residential label's `d` is the zone FSI), lot metrics, and user inputs as scenarios. `map_lookup` and `existing_as_of` evaluate to `not_evaluated` with a reason unless the vector supplies the value.

**Vectors** (`scripts/seeds/bylaw/eval-vectors.json`): the six Spec 67 worked examples — 41 Derwyn Rd, 64 Eastbourne Cres, 96 Futura Dr, 68 Cordella Ave, parcel 5071306 (RT row), 7 Bijou Walk — and V1–V25. None of the six examples carries an exception. Inputs are extracted from the examples' recorded query results. Each vector has a closed `vector_status`: `by_law_expected` (expected value with its Spec 67 anchor **and** the by-law clause it reads, checked against the page text, not Spec 67 prose), `no_expected:<reason>` (V16 has none; V12's NULL is a fallback policy, mapped to `not_evaluated`), or `model_composite` (V25's footprint is a model `LEAST(…)`; excluded from value checks). A transcribed value is an `eval_vector` adjudication. G-EVAL applicability comes from the row's generated chapter zone, not the keyed `application`, so a mis-scoped draft cannot hide from a vector. The S0.5 spike drafts the vectors in its own directory; S6b promotes them. **V1–V4 and V25's side setback are wrong as Spec 67 states them** (KFM-4): they key 10.20.40.70(3) on measured frontage, but the clause keys on the *required* minimum lot frontage, i.e. label `f` (default 12.0 m, 10.20.30.20(1)(B)). S6b corrects them from the spike evaluator — with no `f` the by-law value is 1.2 m; with `f` = the stated frontage it is 0.6 / 0.9 / 1.8 / 3.0 / 1.8 m — and records each as an `eval_vector` adjudication; Spec 67 itself is regenerated at S13 (Spec 69 M-51).

## 8. Anti-spaghetti rules

1. **No per-row code.** No regulation id or exception number appears as an executable literal in `scripts/` or `src/` (G-EXC-LIT, Phase 2); no branch on a regulation id.
2. **One handler per archetype** (Phase 3); handler keys equal `vocab.archetype`, both directions.
3. **Generator-only population.** Rows come only from the slicer + authored sidecars; `--check` regenerates byte-identically.
4. **Facets, not combinations.** A new shape is a `value_form` or qualifier first; a new archetype only when no facet expresses it.
5. **Precedence is data.** Layer, `displaces[]`, `include_ref` and `target` decide precedence; one function (§7.5) applies them.
6. **The pre-sorter is never the authority.** It is a dev tool; its output is not committed; its disagreement rate with the agreed label is reported (Spec 69 M-40).
7. **Every pin moves through one door.** A change to a pinned count or page set is `--accept --ruling=<id>`, where `<id>` is a RATIFIED Spec 69 row cited literally; the ledger `ratchet-exceptions.json` copies `scripts/analysis/gates/ledger.mjs` semantics (row shape, orphan row = RED, literal spec-anchor citation). An adoption that changes per-page counts on already-pinned pages re-pins under its adoption id.
8. **Small modules, one registry.** One module per word under `scripts/analysis/bylaw/`, each `check…() → {pass, violations, checked}` + `selfTest()` (the `scripts/analysis/gates/*.mjs` shape); a frozen gate registry (data) whose keys equal the fixture directories, both ways; the word verdict is derived only from gate results and computed row states (step-validate's `FIVE_WORD_GATES` pattern, copied as a pattern, not imported).
9. **Reuse, don't rebuild:** `gates/generated-blocks.mjs` (Spec 67 blocks), `gates/red-evidence.mjs` (red-first proof, committed under `docs/reports/red-evidence/bylaw/`), `gates/ledger.mjs` (`matchLedger` reused; row shape, orphan = RED and literal-anchor semantics copied, since its `validateRow` is closed to gates A–K), `scripts/lib/sql-witness/resolve.cjs` (census SQL), the `typescript` compiler API (AST; the `src-sql-ledger.mjs` precedent). Never `step-validate.mjs` or the Spec 79 runner.

## 9. The validator

`scripts/generate-bylaw-provisions.mjs --validate` prints the five lines. Exit 2 = structural, or a gate threw (the gate is named; nothing written); 1 = drift, a `failed` row or a gate failure; 0 = pass. Every gate collects all its failures. **Every named reason code has a known-bad fixture that fails for that reason, plus a good twin** (`--self-test`); its red-first evidence is committed with the capability that introduces it. A report-only arm never changes the exit code or a word verdict (fixture).

**13 gates (v0.4 had 24).**

| Gate | Word | Mechanical check (reason codes kept from the merged gates) | When |
|---|---|---|---|
| **G-TEXT** (was G-ID + G-SLICE + G-PIN) | STANDARDIZED | ids and clause paths unique; slices round-trip; per-page counts equal the lock; slices + declared non-regulation spans cover each page; **structure from the HTML** (Spec 69 M-57): the slicer reads the City page's clause cells (`<TD ALIGN=RIGHT>(x)</TD>` + `<A Name>` anchors) and their depth from table nesting; text patterns split only an inline list inside ONE cell, and every such split is declared in the lock; **the unit set equals the HTML clause-cell set + the declared inline splits, both directions** (`cell_set_mismatch`, `inline_split_undeclared`); a **data table** is units keyed (table, row, column) with their row and column headers; **numbering at every level**: a gap FAILS (`numbering_gap_unproven`) unless the page proves the number absent (no cell and no standalone `(x)` for it), and a division a cell still holds unsplit fails the same way; proven gaps are counted; **a repeat is never merged**: it is a status-tagged variant row/unit (`~under_appeal`, `~tribunal_order`), and an unstatused repeat with different numbers FAILS (`unstatused_variant`); verbatim equals the slice; clauses concatenate to the verbatim; each authored unit's pin current, else `pending:stale`; source defects logged as counted disclosures `source_defect` (e.g. the garbled character in 600.60.40(3)(A) *[measured]*), never failures. *(v0.5 text "every `(n) Term` head in 800.50 is a row, the definition matcher is case-insensitive …" is superseded by the cell rule: 800.50 (410) and (695) are cells *[measured]*.)* | pre-commit |
| **G-SHAPE** (was G-VOCAB + G-FIELDS + G-KIND + G-ORPHAN) | STANDARDIZED | JSON Schema on every seed and authored file; every value in `vocab.json`; on rows with an agreed or adjudicated record: every authored field present ("none" written), no generated field authored (a sealed `.a` without its `.b` is `pending`, never a failure); §7.3 shape per unit; every authored key resolves to a row (renumbering via `adoptions.json`); **computes `row_status` (§4 (a)–(e)) from all gate results**, so it runs last among content gates | pre-commit |
| **G-PROV** (was G-PROV + G-AMEND) | OBSERVABLE | page, enacting-PDF and extraction shas match the manifest (the page-sha lock **is** `manifest.json`; there is no separate lock file); manifest complete; every `[ By-law: … ]` tag has an `amendments.json` entry and a `clause_path`; per-page tag counts pinned (two-directional); **keyer provenance** per shard (§10 stage 5): two distinct keyers; A's seal equals A's draft hash; **witnessed** — the `.a` path is absent from the tree of B's recorded worktree commit (`git ls-tree`); **declared-only** — B's engine-ledger read paths contain no `.a` path (the ledger lives outside the repo, so only its recorded sha and extracted paths are checked); a staged `.a` with no staged or committed `.b` fails. **Ruling citations:** `--accept` entries in `ratchet-exceptions.json` cite a RATIFIED Spec 69 row literally; `deferred_by_ruling:<id>` may cite a PROPOSED row (counted); an adjudication cites its adjudicator, and a `consolidation_mismatch` one cites M-39; a Spec 69 parse that yields 0 rulings FAILS | pre-commit |
| **G-DRIFT** | OBSERVABLE | `--check` regenerates in memory and byte-compares (total sort, LF, no locale APIs, no run timestamp); `--self-test` proves every reason-code fixture fails; registry keys = fixture dirs | pre-commit + pre-push |
| **G-CLAUSE** (was G-NUM + G-APP) | ACCURATE | expression and application literals are in the **cited clause**; every clause literal used or listed with a closed reason; variables licensed; units bind per §7.4; anti-vacuity: every digit run and number word covered; application evidence ≥ 2 words inside the cited clause and matching the token's patterns; `any` only when the clause names none. For a unit with an adjudicated `consolidation_mismatch`, the cited clause is the `enacting_source` excerpt | pre-commit |
| **G-XREF** | ACCURATE | `cross_refs[]`, `displaces[]`, `include_ref` resolve to a row or an `external.json` `ref` (an `include_ref` to a `ref` fails); includes acyclic; `displaces[]` irreflexive and acyclic; `ref` entries carry kind, citation, url and a closed reason, and their count is printed; **anti-vacuity:** every occurrence of a `vocab.displacement_triggers` phrase in a clause unit has an extracted `displaces[]` entry or a `not_an_override` reason (fixture per trigger, incl. a subordinate "Despite") | pre-commit |
| **G-AGREE** | ACCURATE | each ⧉ projection agrees canonically, or records `adjudicated` by someone who is neither keyer; an unadjudicated disagreement is `pending`, never a gate failure; agreement rate rendered with `agreement≠correctness` | pre-commit |
| **G-EVAL** (new) | ACCURATE | (a) every agreed/adjudicated `numeric_expression` parses and evaluates, unit-consistent, on every applicable vector in `eval-vectors.json`; (b) for each `by_law_expected` vector whose target has agreed candidates, `effective()` equals it or an `eval_mismatch` adjudication (with the by-law clause and reasoning) names which side is wrong — a vector whose inputs are pending is counted `pending`, not failed; (c) the §7.5 fixtures (rules 0–7, conflict, `permitted()`) return the expected result; an agreed conflict fails the row. Mismatch adjudications are counted on the ACCURATE line | pre-commit |
| **G-CODE** | ACCURATE | (i) blocking: a `modelled` row has ≥ 1 resolved ref — a column (`schema.ts` ∪ `01_database_schema.md`), a module member resolved by the `typescript` AST, or a `logic_variables.json` row; constant refs declare `expects`; no row cites an entry of `vocab.banned_code_refs` (e.g. `bylaw_standard_setback_m` as a setback; Spec 67 KFM-14); `code_refs` paths outside `vocab.code_roots` fail closed. (ii) report-only until a Phase 3 ruling: live constant vs `expects` → `bylaw-code-findings.md`. (iv) report-only: every numeric constant in `vocab.code_roots` is **by-law · heuristic · unmapped** (§6.3); unmapped is a counted finding. The ACCURATE line prints `code_linkage: declared-only` | pre-commit |
| **G-READ** (was G-DEF + G-EXPL + G-EXT) | UNDERSTANDABLE | `definitions_used[]` resolve; the map `vocab.dsl_input → Ch.800 definition | null_reason` is total; every mapped definition carries `input_fidelity`; `differs`/`unknown`, or a null-mapped measurement input (reason ≠ `not_a_measurement`), forbids `modelled`; explanations mention every expression literal, respect the word bound and banned words, cite nothing outside `cross_refs`; external rows complete, `verified_*` rows carry citation + url + `source_sha256`, `unverified` rows make no substantive claim; heuristic rows complete; each kind counted separately | pre-commit |
| **G-UNIVERSE** (was G-TOC + G-EXH) | SCALABLE | **TOC:** every TOC entry that can touch a residential lot maps to a pinned page or a page rule with a reason; a chapter with no pinned page is ruled at **chapter level** (each City page lists every chapter but sections only for its own chapter *[measured]*); the TOC root page is pinned and a TOC that parses to 0 entries FAILS; an entry awaiting a ruling is `deferred_by_ruling:<id>`, counted; never fetches. **Scope:** each row matches exactly one scope rule; in-scope counts equal the lock. **Census:** `census.json` renders the backlogs; it records the `census.sql` blob sha (FAIL ≠ working tree), the DB name, the row count per source table and the adoption id it was run against (stale ⇒ `not_run` for the census arm); it is excluded from G-DRIFT's offline byte-compare; `census.sql` parses through the sql-witness resolver as SELECT-only with catalog columns. **Not yet consolidated** (Spec 69 M-57): every refresh records the City's list of enacted, not-yet-consolidated by-laws (url, page sha256, fetch time; `unconsolidated.json`) and the pinned regulations each one's enacting text cites; a listed by-law citing a pinned regulation is an open G-UNIVERSE item (`unconsolidated_uncaptured`) until its enacting text is captured under Spec 69 M-36. Phase 2 adds the INCLUDE-edge anti-vacuity and ≥ 100 INCLUDE-closed membership | pre-commit (offline) |
| **G-CHANGE** | SCALABLE | `--refresh` writes a change report (added / removed / changed / tag and consolidation delta / stale units); `--adopt` re-validates and refuses partial or old staging | on demand (network) |
| **G-AUDIT** | SCALABLE | committed bar (strata + seed) before `--sample`; the bar's commit is an ancestor of the sample record's commit; exactly 50 rows per Spec 69 M-29 (≥ 20 whose verbatim contains a numeric literal, ≥ 1 per archetype present, every EXT-* row, the 900.1.10 rows, adjudicated rows eligible); PASS computed on the sample as drawn; until Phase 1 closes, a PASS is invalidated if a sampled row's content hash changes. A FAIL is fixed, then a **new full audit** (new seed, same bar; the failed rows are forced in and replace seeded rows of their own strata, so the count stays 50); after a third FAIL the operator rules before any further audit; every record kept, audit count printed. Post-closure re-audit cadence is a Phase 2 ruling | on demand |
| *G-EXC-LIT (Phase 2; not one of the 13)* | — | no regulation id or exception number as an executable literal in `scripts/` or `src/` | Phase 2 |

**Cut in v0.5:** G-COV (pending = 0 supersedes it; floors made amendments unlandable); G-ALIAS (one-time S12/S13 migration); G-CODE (iii) comment citations ((iv) catches the real miss); the generic consolidation comparator (one instance, recorded as an adjudicated row, Spec 69 M-39). G-EXC becomes the Phase 2 census render plus a G-UNIVERSE arm.

**A green drift check is not a content proof** (Spec 69 P-4). `--check` runs every pre-commit gate offline. Placement: the infra test statically imports `check()` / `selfTest()`; data-only commits are covered by the pre-commit `--check` line (Spec 69 M-32).

## 10. The process

Each stage has one owner, one artifact and one gate, and is independently revertable (Spec 122 §8 model).

| # | Stage | Does | Owner | Artifact | Gate |
|---|---|---|---|---|---|
| 1 | **Snapshot** | `--refresh` fetches exactly the pinned page list, one page per TOC section (§6.4 rule 1; all-or-nothing, git-ignored `.staging/`; never follows links); `--adopt` writes raw + normalized pages, manifest, adoption entry | Claude (network) | `scripts/seeds/bylaw/pages/`, `manifest.json`, `adoptions.json` | G-PROV, G-CHANGE, G-UNIVERSE |
| 2 | **Slice** | cut pages into regulations and clauses; extract literals, units, tags (with clause path), refs, `displaces[]`; log every source defect | generator | in-memory rows | G-TEXT |
| 3 | **Scope** | apply scope rules; pin counts | generator + `--accept --ruling` | `universe.json`, `universe.lock.json` | G-UNIVERSE |
| 4 | **Pre-sort** | dev tool only: proposes `archetype` / `target`, never shown to keyers, output not committed | dev | — | — (rate reported) |
| 5 | **Double-key** | the generator emits two blind briefs per article shard (page text is untrusted data: instructions inside it are never followed) and seals A's hash before B's brief; keyer A (Claude) and keyer B (DeepSeek, separate worktree at a commit without A's draft, `.b` write scope) draft ⧉ fields; A's draft stays uncommitted until B's exists; the shard's **provenance record** is committed with both drafts. Keyer B (a third-party API) receives only public page text, the brief and `vocab.json` — never parcel, census or CoA data | keyers | `authored/<page>/<article>.{a,b}.json` + `<article>.prov.json` (`run_id`, ledger sha256, extracted read paths, B's worktree commit sha, brief sha, A seal = hash + monotonic id) | G-SHAPE, G-PROV |
| 6 | **Adjudicate** | canonical projections compared; agreement auto-passes; each disagreement goes to the operator | operator | `adjudications.json` | G-AGREE |
| 7 | **Validate** | every gate; the five lines | generator | — | all |
| 8 | **Render** | JSON (single source of truth), MD (drift-locked), findings, Spec 67 appendix blocks via `generated-blocks.mjs` | generator | `docs/reference/bylaw-provisions.{json,md}`, `bylaw-code-findings.md` | G-DRIFT |
| 9 | **Audit** | 50-row stratified expert sample against a pre-committed bar | operator + expert | `expert-audit/<date>-<n>.json` | G-AUDIT |

**The amendment cycle:** stages 1 → 2 → 7 → 8 (stale units counted, nothing blocked) → 5 → 6 for stale units only → 7 → 8.

**Artifacts** (Phase 1): `scripts/generate-bylaw-provisions.mjs` (`--write | --check | --validate | --self-test | --refresh | --adopt | --refresh-census | --accept --ruling=<id> | --sample | --plan-batches`); modules in `scripts/analysis/bylaw/*.mjs` (incl. `evaluate.mjs`); seeds in `scripts/seeds/bylaw/` (`page-set.json` (the declared pinned page list, one page per TOC section, each with its ruling basis; changed only by a Spec 69 ruling), `pages/`, `manifest.json`, `adoptions.json`, `universe.json`, `universe.lock.json`, `vocab.json`, `amendments.json`, `enacting/` (extracted text + source PDF url and sha256 + extraction sha + extractor version; the PDF is not committed), `external.json`, `eval-vectors.json`, `ratchet-exceptions.json`, `census.sql`, `census.json`, `authored/`, `adjudications.json`, `expert-audit/`); red evidence under `docs/reports/red-evidence/bylaw/`. Layout follows `generate-lineage-docs.mjs` (Spec 119 §4.6; Spec 122 §6.0).

**Determinism and safety rules** (no `process.exit()`, no empty catch, no `new Date()` / `Date.now()` / `Math.random` / locale APIs) are enforced by a grep lock in `bylaw-provisions.infra.test.ts` over the generator and `scripts/analysis/bylaw/` — `clock.mjs` (fetch time, snapshot age) is the one named exemption — plus a test that runs `--check` twice under different `TZ` / locale and byte-compares, because `npm run lint` does not lint `scripts/` and `scripts/analysis/**` is exempt from the restricted-syntax rule *[measured, panel]*.

## 11. Phase boundaries

| Phase | Delivers | Does not |
|---|---|---|
| **1 — the table** | the generator; the 569-2013 table (standard regulations, definitions, 900.1 precedence rows, the Ch.600.60 overlay rows (Spec 69 M-37, ratified 2026-10-06), and the M-47 sections — 1.20, 1.40, 150.15/.20/.22/.25/.30/.45/.48/.50, 200.10/.15/.20/.25, Ch.220, Ch.230, 970.30, 995.20/.30/.41/.50/.60, Ch.990 by a map rule, and the cited clauses 15.10.40.50, 40.10.20.10, 40.10.40.10, 80.5.40.40, 80.10.40.40); external and heuristic rows; the **evaluator + `effective()`** under G-EVAL; the direct-lot census render; the validator; the expert audit | write the DB; change any live output; build Ch.900 exception rows; rank by INCLUDE-closed lots |
| **2 — our fields, user inputs, Ch.900** | a one-way DB load as a pipeline step under Specs 122/124, validated by Spec 79; NF/EF fields re-keyed to `regulation_id`; user inputs as scenarios; the Ch.900 pages `ch900_2..6` pinned, exception rows (≥ 100 INCLUDE-closed lots, two waves); `dsl_target` extended; address → parcel and street-abutment inputs; overlay geometry; CoA harness (SC-5); **the resolution layer (Layer 2, Spec 69 M-53)** — a converted pipeline step that runs `effective()` per parcel × target × structure and records candidates, winner, why the others lost (the §7.5 rule), status (`evaluated` / `not_evaluated` / `not_modelled` with a closed reason) and the inputs used; storage shape (per lot vs per rule signature) chosen from a measured trial | correct live outputs |
| **3 — output correction** | calculated outputs (Layer 3) read **only** the resolution layer, never the provisions directly, and record the resolution rows they used (lineage); drive calculations from the table through one handler per archetype and `effective()`; shadow columns + Reality-Check bounds through the existing plausibility executor; CoA validation before switching; G-CODE (ii) blocking; label FSI (E2) | — |

**Future improvements (beyond Phase 2):** the Ch.900 tail. Of 339,125 excepted residential lots (2,893 zone + exception pairs), the 515 exceptions with ≥ 100 direct lots (Phase 2 waves, Spec 69 M-15) cover 300,616 lots (88.6 %); the other 2,378 exceptions cover 38,509 lots (11.4 %) and, until authored, resolve as `not_evaluated:exception_not_authored` (counted, never silently base-resolved) *[measured, `census.json` adoption-1]*. Future work authors that tail in descending lot-count order until every excepted lot resolves.

Held until Phase 3 (Spec 69 M-25): F-1..F-5 (plan). **Carve-out:** E1 (dominant-label zoning parameters) is zoning *application* under Spec 69 M-42, approved 2026-10-06 and run as its own WF3; it also removes the STAND_SET-as-setback path from residential parcels (Spec 67 KFM-14). E2 (label FSI) is deferred to Phase 3.

### 11.1 Layer 3 — report fields as declared formulas (RATIFIED 2026-10-07; Spec 69 M-61..M-72; detail Spec 78 §6)

**Contract.** Each calculated report field is a formula-registry row (data): a §7.4 expression — with the M-72 Layer 3 extension — over Layer 2 winners (`l2()`), admin logic variables (`lv()`) and declared geometry inputs, run by the §7.6 evaluator per parcel × catalogue scenario × tier. Code = the evaluator (extended by M-72: new code, its own WF), one handler per archetype (§8 rule 2) and one converted step; no code names a zone, scenario or regulation id. A formula literal cites a clause or is an `lv()` read.
**Status (closed, declared in `vocab.json`; PLANNED).** Scenario level (parcel × scenario × tier): `permitted` · `not_permitted:<clause>` · `collapsed_into:<scenario>:<rule>` · `not_evaluated:<reason>`. Field level (× field): `computed` · `unregulated:<clause>` / `unlimited:<clause>` (shown as "no limit") · `not_applicable:<clause>` (DISAPPLY) · `not_evaluated:<reason>`. New reasons: `layer2_conflict:<target>` (a Layer 2 `conflict` row), `coa_factor_unfitted:<form>`, `no_producer:<field>`, `insufficient_comps`; `not_permitted` adds `requires_severance`. **Conflicts (decided 2026-10-07, conservative):** a value conflict on a target is field-level `layer2_conflict`; a permission conflict (PERMIT vs PROHIBIT at the same rank, still `conflict` under M-60) makes the scenario `not_evaluated:layer2_conflict` — never shown, never treated as permitted. A value is displayed iff its scenario is `permitted` and the field is `computed`, `unregulated` or `unlimited`; a `collapsed_into` scenario is listed as "same as <scenario>"; the rest are counted.
**Lineage** (from the evaluator trace): formula id, scenario id, tier, the Layer 2 rows read with `table_version`, each `lv()` id with its value and version, `evaluator_version`.
**Gates.** Arms on built hosts: G-SHAPE (formula-row shape, literal licence, status and reason sets), G-AGREE (⧉ incl. `literals[]`), G-EVAL (a vector per formula × scenario × branch), G-UNIVERSE (report-field totality, scenario totality), G-PROV. **Entry conditions, not yet built:** G-DRIFT `--check` (Phase 1 S8; built on `wf1/mcbylaw-s7`, uncommitted at 2026-10-07 — the inventory, catalogue and registry arm is added after it lands); G-EXC-LIT (Phase 2, unbuilt); G-CODE (iv) blocking over the Phase 3 modules with an inline-literal arm (new); the per-parcel shadow-diff classifier (a new `step-validate` arm, Spec 78 §6.9 — G8's free-text `why` cannot carry it). The step adds Spec 124 checks.

## 12. Behavioral contract and testing

**Inputs:** the committed snapshot and authored files; code files named by `code_refs` or `vocab.code_roots`, parsed, never executed; `--refresh-census` only: one session under `BEGIN TRANSACTION READ ONLY` (server-enforced), running the witness-checked `census.sql`. No mode writes to the DB.

**Order** (`--check` / `--validate`): schema-load (exit 2) → G-PROV → slice, G-TEXT → G-UNIVERSE → G-CLAUSE, G-XREF, G-READ, G-AGREE, G-EVAL → G-CODE → G-SHAPE (shape + `row_status`, folding every earlier gate) → render in memory → G-DRIFT (a drift failure is a file defect, not a row state) → five lines + `PHASE 1`.

**Edge cases that change an answer:** page restructure (G-TEXT fails; adopt refuses without a ruling) · renumbering (orphan until mapped) · partial fetch (nothing staged) · unparseable code file (G-CODE (i) fails) · verbatim containing `|`, `#`, `<!--` (escaped) · INCLUDE cycle (G-XREF names it) · consolidation ≠ enacting text (Spec 69 M-39) · an amendment (units `pending:stale`, nothing blocked) · a pinned page grows past the engine read limit (windowed reads; never truncated silently).

<!-- TEST_INJECT_START -->
- **Logic (PLANNED):** `src/tests/bylaw-provisions.logic.test.ts` — one known-bad fixture per reason code plus a good twin; one fixture per archetype × allowed value form (§7.3); precedence fixtures for §7.5 rules 0–7; G-EVAL vectors.
- **Infra (PLANNED):** `src/tests/bylaw-provisions.infra.test.ts` — statically imports `check()` / `selfTest()`, offline, 60 s; real-universe G-TEXT and G-UNIVERSE; page-set equality; the determinism grep lock; Spec 67 unchanged outside its generated blocks except the S13 allow-list.
<!-- TEST_INJECT_END -->

## 13. Benchmarks and design rationale

Established practices the design follows, stated as practice, not as sourced claims.

| Practice | Where this design uses it | Why |
|---|---|---|
| **Rules as code** — each rule as structured data with its citation, source text and version | §6, §7.4, §7.5 | A number without its clause cannot be checked; a clause without a structured value cannot be applied. |
| **Executable specifications** — a rule is trusted only once it runs on known cases | §7.6, G-EVAL | A grammar nobody executes fails late and in bulk. |
| **Effective-dating / versioned sources** | `source`, `adoptions.json`, `last_changed_in`, `amendments[]`, unit pins | Says which text a value came from and when it changed. |
| **Double data entry with adjudication** | ⧉ fields, G-AGREE, operator adjudication | Disagreement concentrates a person's time on the uncertain rows. |
| **Controlled vocabulary + faceted classification** | §7.1–7.2, `vocab.json`, G-SHAPE | A single label collided on 71.7 % of standard clauses *[measured]*. |
| **Golden-master testing** | G-DRIFT, Spec 67 generated blocks | A hand edit to a generated row cannot land silently. |
| **Provenance (source hash + fetch time, recorded at fetch)** | `manifest.json`, `fetch_id`, provenance records | The legacy `fetched_at` came from file mtimes *[measured]*. |
| **Separate authored judgment from derived data** | G / A ownership, `value_form` derived | Each kind of error has one home and one check. |
| **Known-bad fixtures (red-first)** | `--self-test`, committed red evidence | A check that cannot fail proves nothing. |
| **Spike before build, with kill criteria** | S0.5 (Spec 69 M-44) | Measures the load-bearing assumptions before ≈ 600 rows are built on them. |
| **Independent expert sampling** | G-AUDIT, SC-4 | Gates prove consistency with the text, not correctness of the reading. |

## 14. Known limits — what this design still cannot guarantee

1. **Interpretation ambiguity.** Two keyers can agree on the wrong reading. Only the expert sample and CoA decisions catch that; neither is exhaustive.
2. **Correlated keyers.** Both keyers are language models; agreement is weaker evidence on genuinely ambiguous clauses (the line prints `agreement ≠ correctness`).
3. **Evaluation is a sample.** G-EVAL executes every expression but checks *values* only on the `by_law_expected` vectors among six worked examples and V1–V25 (no Phase 1 vector carries an exception); a wrong expression with no vector touching it can still evaluate cleanly.
4. **Code linkage is declared-only until Phase 3.** G-CODE proves a referenced symbol exists and compares declared constants; SQL-builder formulas are not executed against the table until the Phase 3 parity test.
5. **Consolidation lag and errors.** The consolidation trails enactment and can differ from the enacting text (600.60.40(3)(C) omits items (i)–(ii) *[measured]*). We detect this only where we hold the enacting text.
6. **Map-based provisions.** Overlay areas, zone-label letters, exception diagrams (34 exceptions, 3.4 % of lots) and former-by-law lands depend on maps we hold only partly; such units are not `modelled` and are disclosed.
7. **Address and lot matching.** Named-lot clauses (95 exceptions, 31 % of excepted lots) need address → parcel matching (Phase 2).
8. **Input fidelity.** A correct rule on a differently measured input is still wrong; frontage/depth are rectangle approximations and established grade is unknown.
9. **As-built facts.** "As it existed on [date]" clauses need building facts we lack (42 exceptions, 5.8 % of lots).
10. **In-force status.** Tags and appeals are `not_verified` until researched; the table shows status, it does not establish it.
11. **Audit power.** 0 numeric disagreements on ≥ 20 numeric rows bounds the error rate only loosely (≈ 15 % at 95 % confidence on 20 numeric rows, rule of three).
12. **Implicit override.** Most exception outcomes rest on one reading of 900.1.10(3); if it is wrong, many rows change together. The expert confirms it explicitly.
13. **Held outputs.** Until Phase 3, live outputs may disagree with the table (Spec 69 P-1).
14. **Outside constraints.** Tree protection, the Building Code, TRCA and former by-laws are disclosed, never evaluated.

---

## 15. Operating Boundaries

### Target Files
**Created in the spec commit:** `docs/reports/mcbylaw-phase0-audit.md`, `docs/reports/mcbylaw-phase0b-exceptions.md`, `docs/reports/mcbylaw-zoning-validation.md` (the ground-truth reports), `docs/reports/mcbylaw-phase1-plan.md` (the authorized Phase 1 plan). **Created at S1 (2026-10-07):** `docs/reports/mcbylaw-s05-spike.md`.

**PLANNED — not created yet:**
- `scripts/generate-bylaw-provisions.mjs`, `scripts/analysis/bylaw/`, `scripts/seeds/bylaw/` (incl. `page-set.json` and a scoped `scripts/seeds/bylaw/.gitattributes` marking `pages/*` `-text`, so the pinned page bytes never change line endings on checkout)
- `docs/reference/bylaw-provisions.json`, `docs/reference/bylaw-provisions.md`, `docs/reference/bylaw-code-findings.md`, `docs/reports/red-evidence/bylaw/`
- `src/tests/bylaw-provisions.logic.test.ts`, `src/tests/bylaw-provisions.infra.test.ts`, `src/tests/fixtures/bylaw/`
- S8 registrations: `scripts/analysis/spec-split-check.mjs` `SPEC_FILES` + `122_split_manifest.json` `budgets` (68/69); `.husky/pre-commit`; `hooks-composition.infra.test.ts`; `package.json`.

**Edits to existing specs (S13 only):** `67_maxbuild_bylaw_derivation.md` (generated appendix blocks via `generated-blocks.mjs`; an allow-list for §0, L2459, §4, KFM-11, the "frozen" relabels, the header NF/EF id ranges and the Appendix E heading H1–H28; line endings preserved); `58_source_zoning_bylaw.md` (§13 mirror — NF/EF tables, L1–L28 ledger, additional provisions — deleted, leaving a pointer; L439 sentence); `78_optimal_lot_configuration.md` (§5.1 pointer).

### Out-of-Scope Files
- `scripts/lib/max-build.js`, `scripts/lib/optimal-config.js`, `scripts/lib/compute/enrich-parcels.js` — parsed, never edited; `scripts/lib/compute/load-parcels.js` — cited for input fidelity, never edited; Phase 1 changes no output (Spec 69 M-25).
- `scripts/lib/zoning-precedence.js`, the `load_zoning` / `enrich_parcels` descriptors — owned by Specs 58/65 and the E1 WF3 (Spec 69 M-42).
- `migrations/`, `scripts/*.descriptor.json`, `scripts/manifest.json`, goldens, `scripts/analysis/step-validate.mjs`.
- The content of former general zoning by-laws, the Building Code, Ch.813, TRCA rules — disclosed, never modelled.

### Cross-Spec Dependencies
- **Relies on:** Spec 69 (governs on conflict); Spec 124 (R-BA, R-BF, Rule 6, Rule 9, §4.2, §4.4, R-H, R-AG, R-AA budgets); Spec 122 §6.0 / §8 / §10.3; Spec 119 §4.6; Spec 79 (the not-run state only); Specs 58, 65 (zoning application, M-42); Specs 59, 61 (risk-row pointers); Spec 67 (worked examples, V-vectors).
- **Consumed by:** Spec 67 (generated appendices); Spec 78 §P2.1 (Phase 3); the Phase 2 load step and buyer report.
