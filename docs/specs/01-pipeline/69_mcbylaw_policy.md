# SPEC 69 — McBylaw Policy

> ## Rulings register — v0.5, 2026-10-06
> The POLICY half of the McBylaw pair. **Spec 68 — McBylaw: the By-law Table Standard**
> (`docs/specs/01-pipeline/68_mcbylaw_standard.md`) says what the table is and how it is built and proven; this spec
> holds **only the rulings that chose between alternatives**. Modelled on Spec 124 §5: one row per ruling — rule · why ·
> enforced-by · status. **Amended only by adding rows** (or appending a dated note to a row); a superseded ruling is
> struck through and points at its successor; **an id is never reused.** On conflict with Spec 68, this spec governs.
>
> **Ratification 2026-10-06 (operator).** The ten Phase 1 decisions (§2), the faceted archetype model and the Phase 0b
> probe changes (M-30, M-15, M-34, M-35, M-40, M-41), the standing directions M-0, M-22, M-25 and M-36, and — by approving
> the consolidated v0.5 panel change package — R-ZV (M-42), M-43..M-46 and the dated v0.5 notes on M-15, M-17, M-20,
> M-25, M-30, M-32, M-33 and M-34. **The status column is authoritative**; §4 lists what is still open.
>
> **Second ratification 2026-10-06 (operator, "yes to 1–4" on §4).** Every row that was PROPOSED — M-21, M-26, M-27,
> M-28, M-37 (with the M-36 correction it carries), M-38 and M-39 — is RATIFIED, so the dependencies of M-29 (the
> external rows M-27/M-28 define) and M-36 (the page M-37 adds) are satisfied and both rows are operative; and
> `ranks_layers[]` is added to the double-keyed set (M-17, dated note). **Every live row in §1 is now RATIFIED.**
>
> **McBylaw Phase 1 is AUTHORIZED** (operator, PLAN LOCKED → y, 2026-10-06): the plan is committed as
> `docs/reports/mcbylaw-phase1-plan.md`.
>
> **S1 ratification 2026-10-07 (operator, S0.5 rulings a–f approved as recommended):** M-47..M-51 and dated notes on
> M-17, M-36 and M-44. Evidence: `docs/reports/mcbylaw-s05-spike.md`.
>
> **Phase 3 ratification 2026-10-07 (operator, "yes to all, as long as they comply with Specs 68/69 and the five objectives"):**
> M-61..M-72 (Layer 3 report fields as declared formulas, the scenario catalogue, CoA, parking, cost scope, the Phase 3
> trial, the Layer 3 grammar) are RATIFIED, folded first with the grounded matrix and the red-team
> (`.cursor/mcbylaw/phase3-check/MATRIX.md`, `REDTEAM.md`); fold record Spec 78 §6.12. Quantities the Phase 3 trial must
> measure (storage, runtime, the fitted CoA uplifts) stay "to be measured (M-70)". The M-65 method follows the CoA second look
> (`.cursor/mcbylaw/phase3-prework/coa-second-look.md`). Standard: Spec 68 §11.1 and the §7.4 Layer 3 block; deliverable:
> Spec 78 §6. (M-58..M-60 are the `wf1/mcbylaw-harden` rows; M-60 stays provisional and no Phase 3 row depends on its held items.)
>
> **v0.5:** the standing rules that only restated a gate (M-3..M-10, M-12, M-13, M-16, M-18, M-24) moved into Spec 68
> §6.4; their ids are retired here and never reused. Numbers in this register are evidence quotes tagged with how they
> were obtained; the live values are the generated files (`universe.lock.json`, `census.json`) — on disagreement the
> generated file wins and the row is corrected by appending text. **A rule without a lock is not yet a rule** (Spec 124
> §4.4): every "Enforced by" names a Spec 68 §9 gate, or another named lock (the S13 allow-list lock, the hooks-composition
> lock, the S12/S13 migration scan, the zoning steps' checks), or declares itself a process / report rule (M-0, M-33,
> M-40, M-44). Gates and locks are built red-first with committed red evidence by the Phase 1 plan (committed as
> `docs/reports/mcbylaw-phase1-plan.md`; ids glossed in §6); a ratified row counts as *enforced* only once its fixture
> is proven both directions. A RATIFIED row that depends on a PROPOSED one is inoperative until that one is ratified
> (none remain after 2026-10-06). **Byte budget:** `measured_at × 1.1` (Spec 68 header).
>
> **Where the register lives (2026-10-07):** the §1 rows and their dated notes are in
> `docs/specs/01-pipeline/69a_mcbylaw_register.md` (spec-split move M19, for this file's byte budget). They are still
> cited as `Spec 69 M-n`; new rows and dated notes go in its §1a (the moved block is hash-locked). Programs read both files through
> `readSpec69Rulings` (`scripts/analysis/bylaw/universe.mjs`).

**Status:** RATIFIED

**Ratified:** 2026-10-06 (every live row; Phase 1 authorized). The open items in §4 are research and later-phase targets, not unratified rows.

**Version:** 0.5 · **Domain:** Backend/Pipeline (doc).

**Protocol.** Spec 124 §4 applies unchanged: a reviewer or keyer *discovers* an ambiguity and proposes a ruling; a different party (the operator) *adjudicates*; the ruling is added here with its gate; the gate's both-directions fixture lands with the code that enforces it.

---

## 1. The register

**MOVED to `69a_mcbylaw_register.md` ## §1. The register (moved from Spec 69 §1) — LIVE REGISTER, 2026-10-07 — 2026-10-08 (Spec 124 §4 R-I(4)).** LIVE register rows, moved for the byte budget, still in force; Spec 69 split (QUEUE follow-up 2026-10-07: Spec 69 at 77.6 KB, split the register into 69a like 124→124a). The M-rows and dated notes stay in force and are cited as Spec 69 M-n; programs read 69a + 69 through readSpec69Rulings (scripts/analysis/bylaw/universe.mjs). New rows and dated notes are added in 69a.


## 2. The ten Phase 1 decisions — operator ratification 2026-10-06

Decisions 1–10 of the v0.3 plan map to M-1, M-31, M-32, M-2, M-20, M-14, M-11, M-33, M-29, M-17 (each row's status cell names its decision number).

## 3. By-law 654-2025 — what is verified, and what is research

| Fact | Evidence |
|---|---|
| Enacting text | `https://www.toronto.ca/legdocs/bylaws/2025/law0654.pdf`, HTTP 200, 2,549,869 bytes, **sha256 `bcfdfef304fa9e290d6cc242f66b98577d16228eca097fe0a0734a08a0040237`** *[measured; reproduced by the panel]* |
| Authority, dates | Planning and Housing Committee Item PH22.4; Council vote 2025-06-26; Mayoral Decision 10-2025; enacted 2025-06-26 *[read]* |
| Scope (area) | Diagrams 1 and 2: the Toronto and East York Community Council boundaries as they existed on 2025-06-26, and Scarborough North (23) bounded by Steeles Ave, Neilson Rd / Rouge River, Highway 401 and Midland Ave *[read]* |
| What it does | Replaces Section 600.60: 600.60.20 definitions (apartment building ≥ 7 units; detached houseplex ≤ 6 units; fiveplex; sixplex); (1)(A) a "u" label value < 6 becomes a 6-unit maximum; (1)(B) a 5–6 unit detached houseplex is permitted despite 900.1.10(3) and (4)(A); (2)(A) height up to 10.5 m with a raised lowest level; (3) conversions of lawfully existing detached houses; (3)(D) no conversion of semi-detached houses or townhouses *[read]* |
| Coming into force | In force when by-law **648-2025** comes into force; repeals 47-2025 *[read]* |
| Status in the table | `not_verified` (M-14, M-36) until R-10 · **2026-10-07: `in_force`** (verified_primary; M-36 note) |
| In our consolidation? | **Yes**, on `ZBL_NewProvision_Chapter600_60.htm` (sha256 `dbf8d4dc8c3aaf99a490ae7f730eec9752f750f6d7cca33b6127eb3048b66932`), six `[ By-law: 654-2025 ]` tags *[measured; reproduced]* |
| Source defects | 600.60.40(3)(C) ends at "include:" and omits items (i)–(ii) (M-39); 600.60.40(3)(A) reads "subject to regulations 600.60.40(3)(B) and (�" — a garbled character in the City HTML, logged as `source_defect` *[measured, panel]* |
| **Research (R-10)** | Whether 648-2025 is in force or under OLT appeal; which parcels lie inside Diagrams 1 and 2 (candidate source: the City GIS "Sixplex Permission" layer, 80 features *[measured, zoning validation]*); the 600.60.20 vs 800.50(181) houseplex interaction · **2026-10-07:** in-force question answered (M-36 note); the other two stay open |

## 4. Operator questions — answered 2026-10-06, and what stays open

The operator answered "yes to 1–4" on 2026-10-06. Items 1–2 are closed; items 3–4 were agreed in direction but stay open because their content does not exist yet; 5–6 were not asked.

1. ~~**Ratify the PROPOSED rows together:** M-21, M-26, M-27, M-28, M-37, M-38, M-39.~~ **CLOSED — RATIFIED 2026-10-06** (§1 status column). The M-29 and M-36 dependencies are satisfied (dated notes in §1).
2. ~~**M-37 page rules:** 600.60 in; 600.10 / 600.50 in only for residential map areas; 600.20 / 600.30 / 600.100 out (`non_residential_use_condition`).~~ **CLOSED — approved as listed 2026-10-06**; applied at S5 with M-37.
3. **OPEN — overlay geometry (Phase 2).** Direction agreed 2026-10-06: candidate source for Diagrams 1/2 is the City GIS "Sixplex Permission" layer, and for former-by-law lands its "Not Part of This By-law" layer (R-11). The sixplex overlay boundary source is not confirmed until R-10/R-11 show the layer matches the by-law's Diagrams; until then those lots are disclosed, not evaluated (M-41).
4. **OPEN — SC-3 agreement floor** (set from the S0.5/A1 measured rate) and **SC-5 CoA target** (Phase 2 plan). Timing agreed 2026-10-06; the numbers are not yet known. *2026-10-07:* S0.5 measured per-field rates (M-44 note) but proposed no floor; the floor waits for the A1 re-measure (M-17 note, c).
5. **OPEN — F-1 now?** The F-1 suite constants are verbatim-verified and need no table; permit a narrow WF3 despite the M-25 hold, as E1 was? (Flagged by the design review; not overridden.)
6. **OPEN — Expert inquiry** (R7): send now so S14 is not blocked.
7. **OPEN — research R-10:** ~~whether 648-2025 is in force or under OLT appeal~~ (answered 2026-10-07: in force, M-36 note), and the 600.60.20 vs 800.50(181) houseplex interaction.
8. **OPEN (from S0.5, not ruled at S1):** Ch.500 heritage districts (M-47 deferral); the 2 RT front-landscaping vectors (10.5.50.10(1)(A), "percent of a stated base") still inexpressible after M-48; the S0.5 grammar items not in M-48 (per-building-type conditions in `application`; vocab additions) are S5/S6 work.

## 5. Recorded positions (roadmap; no Phase 1 lock)

| # | Position | Closed by |
|---|---|---|
| **P-1** | **Buyer-report contract.** The by-law basis is shown only from the table (explanation + id + consolidation date); `pending` / `failed` rows never authoritative; every non-`in_force` amendment status shown with a notice; every number with citation, confidence and a "not evaluated" list (risk references, former by-law, uncaptured exception, prevailing path, unmatched named lot, model heuristics, and "no 569-2013 zone — an envelope was still produced" until F-5 is corrected); an output computed from a constant with an open G-CODE finding carries a mismatch flag until Phase 3. | Phase 2 report test |
| **P-2** | **Phase 2 scope:** the DB load as a pipeline step under Specs 122/124 + Spec 79; fields mapped onto rows; user inputs; Ch.900 rows (M-15, M-30, M-34) with `ch900_2..6` pinned; Spec 58 §13 consumers re-keyed; `in_force_basis`. | Phase 2 plan |
| ~~P-3~~ | PROMOTED → M-31. | — |
| **P-4** | **A green drift check is not a content proof.** | — |
| **P-5** | **CoA decisions as independent ground truth** for the table and our calculations (SC-5); our CoA→parcel link needs its own gate first *[measured, zoning validation]*. | Phase 2/3 plan |
| **P-6** | **One source, many views:** every rendering reads the JSON; the DB is a one-way sink; outputs stamped with the table version; the law in force at a date comes only from `amendments.json` dates. | Phase 2 plan |
| **P-7** | **User inputs as scenarios, not guesses:** show both answers; infer building type with a confidence; the user confirms. | Phase 2 plan |
| | *Dated note 2026-10-07:* **M-63 (RATIFIED 2026-10-07) supersedes P-7** — every scenario computed, permitted ones shown, no user choice (operator).  | |
| **P-8** | **Phase 3:** drive calculations from the table; a parity test executes the code against `effective()` (ending "declared-only"); shadow columns + Reality-Check bounds through the existing plausibility executor; CoA validation before switching; G-CODE blocking; E2; Spec 78 §P2.1 regenerated; by-law values reach compute through the table load, never as new module constants (Spec 124 gate E). | Phase 3 plan |

## 6. Glossary of plan ids cited here

| Id | Meaning |
|---|---|
| S0–S14 | Phase 1 steps: S0 pre-flight · S0.5 spike · S1 ratify · S3 snapshot · S4 slicer · S5 scope + vocab + page set · S6 authored-field gates · S6b evaluator · S7 renderer + five lines · S8 `--check` + first landing · S9 code linkage · S10 amendments · S11 census · S12 legacy-id migration · S12b external + heuristic rows · S13 Spec 67/58/78 · S14 expert audit (S2 was deleted in v0.5: reds land with their capability) |
| A1–A7 | double-keyed authoring batches |
| F-1..F-5 | held output corrections: suite constants; `max-build.js` constants; R-zone outputs; Ch.900-driven outputs; no-zone parcels |
| E1, E2 | zoning-application WF3s (M-42): dominant-label parameters (approved); label FSI (Phase 3) |
| R-1..R-13 | open research, listed in the plan (R-ZV is the M-42 ruling, not research; R7 in §4 Q6 is the design review's assumption id) |

---

## Operating Boundaries

### Target Files
- `docs/specs/01-pipeline/69_mcbylaw_policy.md` (this policy) and `docs/specs/01-pipeline/69a_mcbylaw_register.md` (its §1 register). The files the rulings govern are listed in Spec 68 §15.

### Out-of-Scope Files
- Everything under `src/`, `scripts/`, `migrations/` — this spec rules; Spec 68's plan builds.
- `docs/specs/01-pipeline/124_step_standard_policy.md` — not amended; McBylaw applies its doctrine to content.

### Cross-Spec Dependencies
- **Relies on:** Spec 124 (§4 protocol, R-BA, R-BF, Rule 9, Rule 13, R-AG); Spec 68 (the standard it rules on); Specs 58/65 (M-42 step checks).
- **Consumed by:** Spec 68; the Phase 1 plan; the Phase 2/3 plans; the E1 WF3.
