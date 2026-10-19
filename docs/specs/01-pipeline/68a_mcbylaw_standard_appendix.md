# SPEC 68a — McBylaw Standard: appendix (part of Spec 68)

**Status:** RATIFIED (this file holds historical, closed blocks of Spec 68 moved out for its byte budget; it carries no rule of its own)

> Sibling of `docs/specs/01-pipeline/68_mcbylaw_standard.md` (Spec 68). Created 2026-10-18: the McBylaws Airtight
> section (Spec 68 §5a; Spec 69 M-188) pushed Spec 68 past its `spec-split-check` arm (iv) budget, and the operator chose
> a sanctioned split move (operator 2026-10-18, the M24/M25 form). Blocks arrive here ONLY through
> `node scripts/analysis/spec-split-check.mjs --refresh` (moves `M28`–`M30` in
> `docs/specs/01-pipeline/122_split_manifest.json`, classification `HISTORICAL`); each source heading survives in Spec 68
> as a stub pointing here. Cite the moved text as before (`Spec 68 §13`, `Spec 68 §14`).

## Operating Boundaries

### Target Files
- `docs/specs/01-pipeline/68a_mcbylaw_standard_appendix.md` (this appendix). The files Spec 68 governs are listed in Spec 68 §15.

### Out-of-Scope Files
- Everything under `src/`, `scripts/`, `migrations/`: this appendix states no rule.

### Cross-Spec Dependencies
- **Relies on:** Spec 68 (the standard these blocks came from).
- **Consumed by:** `scripts/analysis/spec-split-check.mjs` (arms i, ii and vi verify the moves).


---

## Appendix §C1 — Benchmarks and design rationale (moved from Spec 68 §13) — HISTORICAL, 2026-10-18

Moved from Spec 68 — Spec 68 budget split (operator 2026-10-18); design rationale, no gate reads it.

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


---

## Appendix §C2 — Known limits of the v0.5 design (moved from Spec 68 §14) — HISTORICAL, 2026-10-18

Moved from Spec 68 — Spec 68 budget split (operator 2026-10-18); the v0.5 limits list, no gate reads it.

## 14. Known limits — what this design still cannot guarantee

1. **Interpretation ambiguity.** Two keyers can agree on the wrong reading. Only the expert sample and CoA decisions catch that; neither is exhaustive.
2. **Correlated keyers.** Both keyers are language models; agreement is weaker evidence on genuinely ambiguous clauses (the line prints `agreement ≠ correctness`).
3. **Evaluation is a sample.** G-EVAL executes every expression but checks *values* only on the `by_law_expected` vectors among six worked examples and V1–V25 (no Phase 1 vector carries an exception); a wrong expression with no vector touching it can still evaluate cleanly.
4. **Code linkage is declared-only until Phase 3.** G-CODE proves a referenced symbol exists and compares declared constants; SQL-builder formulas are not executed against the table until the Phase 3 parity test.
5. **Consolidation lag and errors.** The consolidation trails enactment and can differ from the enacting text (600.60.40(3)(C) omits items (i)–(ii) *[measured]*). We detect this only where we hold the enacting text.
6. **Map-based provisions.** Overlay areas, zone-label letters, exception diagrams (34 exceptions, 3.4 % of lots) and former-by-law lands depend on maps we hold only partly; such units are not `modelled` and are disclosed.
7. **Address and lot matching.** Named-lot clauses (95 exceptions, 31 % of excepted lots) need address → parcel matching (Phase 2).
8. **Input fidelity.** A correct rule on a differently measured input is still wrong; frontage/depth are rectangle approximations and established grade is unknown.
9. **As-built facts.** "As it existed on [date]" clauses need building facts we lack (42 exceptions, 5.8 % of lots); default "new build" plus a caveat, Spec 69a M-158.
10. **In-force status.** Tags and appeals are `not_verified` until researched; the table shows status, it does not establish it.
11. **Audit power.** 0 numeric disagreements on ≥ 20 numeric rows bounds the error rate only loosely (≈ 15 % at 95 % confidence on 20 numeric rows, rule of three).
12. **Implicit override.** Most exception outcomes rest on one reading of 900.1.10(3); if it is wrong, many rows change together. The expert confirms it explicitly.
13. **Held outputs.** Until Phase 3, live outputs may disagree with the table (Spec 69 P-1).
14. **Outside constraints.** Tree protection, the Building Code, TRCA and former by-laws are disclosed, never evaluated.


---

## Appendix §C3 — v0.5, S1 and S12b amendment notes (moved from Spec 68 §header) — HISTORICAL, 2026-10-18

Moved from Spec 68 — Spec 68 budget split (operator 2026-10-18); dated change notes.

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
