# PROJECT McBYLAW — Phase 1: the by-law provisions table (generator + five-word validator + evaluator)
**Authorized 2026-10-06** (operator, WF1 PLAN LOCKED → y). Committed copy of the plan; the closing PLAN LOCKED block is omitted.
**Status:** Implementation — v0.5, AUTHORIZED 2026-10-06 (operator: PLAN LOCKED → y; the consolidated v0.5 panel change package was approved the same day; `ranks_layers[]` approved as a ⧉ field)
**Workflow:** WF1 (Genesis — new generator, new spec pair, new generated reference artifact)
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`). The generator lives in `scripts/`. Phase 1 has no app code, no migration, no pipeline step and **no live-output change** (Spec 69 M-25; the E1 carve-out is its own WF3).
**Governing principle:** SIMPLICITY (Spec 69 M-0). Every step names the mistake it prevents.

**v0.5 (2026-10-06):** the approved change package from the design review (`.cursor/mcbylaw/panel/design-review.md`) and the Integration + Cross-read + DeepSeek panel (`.cursor/mcbylaw/panel/integration-crossread.md`) is folded into Specs 68/69 and this plan:
- **Simpler:** 24 Phase 1 gates → 13 (Spec 68 §9); G-COV, permanent G-ALIAS, G-CODE (iii) and the generic consolidation comparator cut; `external-rows.json` + `external-refs.json` → `external.json`; `presort.json`, `coverage-floor.json` and `absence-claims.json` dropped; `validated_against` is one table-level header; Spec 69 keeps only rulings that chose between alternatives (40 live rulings − 13 moved to Spec 68 §6.4 + 5 new (M-42..M-46) = 32).
- **Executed, not declared:** a DSL evaluator + `effective()` ship in Phase 1 under G-EVAL (Spec 69 M-43).
- **S0.5 spike** with kill criteria declared up front (Spec 69 M-44).
- **Blockers B1–B4** folded (M-45; M-15 note; committed provenance record; M-17 note).
- **One source:** S13 deletes the Spec 58 §13 mirror (M-20 note). **Zoning checks** live on the zoning steps (M-42, R-ZV ratified). **Reuse** `generated-blocks.mjs`, `red-evidence.mjs`, `ledger.mjs`, sql-witness, `typescript`. **Heuristic row kind** (M-46).
- **This plan no longer lists fields or gates** — Spec 68 §6 and §9 are the only lists.
- The spec drafts were moved to `docs/specs/01-pipeline/` (Specs 68/69) in the activation commit; one copy.

**Supersedes:**
- `.cursor/wf1_bylaw_provisions_table_active_task.md`: its DB table becomes Phase 2.
- `.cursor/wf2_spec67_generator_check_active_task.md`: absorbed as S7, S8 and S13.
- `.cursor/wf2_bylaw_formula_fixes_active_task.md`: re-scoped as Phase 2/3 input.

**Ground truth:** `docs/reports/mcbylaw-phase0-audit.md`, `docs/reports/mcbylaw-phase0b-exceptions.md`, `docs/reports/mcbylaw-zoning-validation.md` (2026-10-06), committed with this plan (`docs/reports/mcbylaw-phase1-plan.md`) and Specs 68/69.

**Governing specs (v0.5, RATIFIED 2026-10-06):** Spec 68 — the standard (`docs/specs/01-pipeline/68_mcbylaw_standard.md`); Spec 69 — the policy (`docs/specs/01-pipeline/69_mcbylaw_policy.md`). **Spec 69 governs on conflict.** Field list: Spec 68 §6. Gate list: Spec 68 §9. Row and gate states: Spec 68 §4.

## Context
* **Goal:** one exhaustive table of 569-2013 provisions, built by a generator, checked by a five-word validator, with every expression **executed** against worked examples; interpretive fields double-keyed; an expert sample; code ≠ by-law disagreements reported as Phase 3 findings.
* **Target Spec:** Spec 68 + Spec 69 — both new; numbers free *(measured 2026-10-06)*.
* **Key Files (all new):** `scripts/generate-bylaw-provisions.mjs` · `scripts/analysis/bylaw/*.mjs` (one module per word + `evaluate.mjs`) · `scripts/seeds/bylaw/**` · `docs/reference/bylaw-provisions.{json,md}`, `docs/reference/bylaw-code-findings.md` · `docs/reports/red-evidence/bylaw/` · `src/tests/bylaw-provisions.{logic,infra}.test.ts`, `src/tests/fixtures/bylaw/`. S13 only: Specs 67, 58, 78.
* **Read-only inputs (parsed, never edited):** `scripts/lib/max-build.js`, `scripts/lib/optimal-config.js`, `scripts/lib/compute/enrich-parcels.js`, `src/lib/db/generated/schema.ts`, `docs/specs/00-architecture/01_database_schema.md`, `scripts/seeds/logic_variables.json`, Spec 67 (worked examples, V1–V25).
* **Reused modules (Spec 68 §8 rule 9):** `scripts/analysis/gates/generated-blocks.mjs` (S13), `gates/red-evidence.mjs` (every red), `gates/ledger.mjs` (`ratchet-exceptions.json` + ruling citations), `scripts/lib/sql-witness/resolve.cjs` (S11), the `typescript` compiler API (S9; `acorn` is only transitive *[measured]*); legacy `norm.js` (versioned), the ordered-fragment verifier, `sqlparse.js`. **Not reused:** `step-validate.mjs`, the Spec 79 runner (only its `not_run` state is borrowed).
* **Execution Provider:** `deepseek` for mechanical module and test bodies, and as keyer **B** of every double-keyed brief (`node scripts/deepseek-exec.js --brief <file> --provider=deepseek`, one module or one article shard per brief, directory-anchored `write_scope`, `--max-iterations 40`; the engine edits, never rewrites, files over 200 lines).
  - **Downgraded to `claude`** (logged reasons): keyer **A** (independence: Claude is one of the two drafters, blind to B); S0.5 adjudication timing and the evaluator prototype (verification seat); S1 (operator); S3 network fetch/adopt (provenance); S11 read-only DB census; S12b research (citations); recording disagreements — **the operator adjudicates** (M-17); S13 spec edits; every landing.
  - `exec-policy.json` `bash_allow` entries are registry-reserved and Claude-only. Engine `run_id`s are recorded per step and in each shard's `.prov.json`.

## Technical Implementation
* **New components:** generator CLI (modes: Spec 68 §10); slicer (port of `.cursor/mcbylaw/phase0/universe.js` with the numbering-sequence check and the case-insensitive definition matcher); extractors with one numbers-only anti-vacuity scan; DSL parser + canonicalizer; **evaluator + `effective()`**; the 13 gates as one module per word with a frozen gate registry; AST code-ref resolver (`typescript`); renderer (JSON, MD, findings, Spec 67 blocks); change-report builder; stratified sampler.
* **Database Impact: NO.** No migrations, no writes. S11 opens one session under `BEGIN TRANSACTION READ ONLY` via `createResolvedPool`, running a witness-checked SELECT-only `census.sql`.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no API route). Each gate collects its failures; the run prints five lines and sets `process.exitCode`: 2 structural or a gate threw (named), 1 drift / failed row / gate failure, 0 pass. Writes atomic; `--refresh` transactional.
* **No `process.exit()`, no empty catch, no run timestamp / locale API:** enforced by a grep lock in `bylaw-provisions.infra.test.ts` over the generator and `scripts/analysis/bylaw/` — `npm run lint` does not lint `scripts/` and `scripts/analysis/**` is exempt from `no-restricted-syntax` *[measured, panel I-7]*.
* **Unhappy Path Tests:** one known-bad fixture **per reason code** of Spec 68 §9 plus a good twin, red evidence committed via `red-evidence.mjs` with the capability that introduces the gate. Load-bearing ones: an absent row stays `pending` and `--check` exits 0 (M-45, both directions); the S8 state with 0 agreed rows exits 0 (G-EVAL/G-AGREE count pending, never fail); a sealed `.a` with no `.b` is `pending`; a same-layer conflict (two exacts; min above max); a missed displacement trigger; a stale pin → `pending:stale`, not failed; two drafts disagreeing with no adjudication; an adjudicator who is also a drafter; a staged `.a` with no `.b`; B's read paths containing an `.a` path; an expression that fails to evaluate on a vector; an `effective()` mismatch with no `eval_mismatch` adjudication; an overlay without "Despite" replacing the base value (M-34 note); 600.60.40(1)(B) displacing 900.1.10(3) (M-38); a TOC entry with no page and no rule; a chapter-level TOC rule; 800.50 (410)/(695)-shaped definition heads; an INCLUDE cycle; `displaces[]` self-reference; a report-only G-CODE finding that must not change the exit code; a gate that throws → exit 2; `census.sql` that is not SELECT-only; a ruling id that is not RATIFIED; an unmapped root-module constant counted; one fixture per archetype × allowed value form (Spec 68 §7.3).
* **logError Mandate:** N/A (offline CLI). **UI Layout:** N/A.

## Spec 122 / 124 compliance
| Standard item | How Phase 1 meets it | Evidence class |
|---|---|---|
| R-BA: McDonald's Airtight | Five words, each PASS/FAIL from named gates over closed answer sets; gate state `pass · fail · not_run` (Spec 68 §4, §9). | proposed; locks at S4–S9 |
| R-BF: declared == observed | Table = text (G-TEXT, G-CLAUSE); every expression **executed** (G-EVAL, M-43); code linkage printed `declared-only` until Phase 3 executes it. | proposed |
| Simplicity (M-0) | 24 → 13 gates; 3 seed files dropped, 2 merged; 13 restating rulings moved to Spec 68; the plan carries no field or gate list. Each change says what it replaces (Spec 68 §9 "Cut in v0.5"). | proposed |
| Rule 1: nothing only in code | Scope rules, vocab, amendments, external + heuristic rows, eval vectors and the audit record are declared seeds with schemas. | proposed |
| Rule 6: "none" is written | G-SHAPE. | proposed |
| R-AA / R-BF: generated, never hand-kept | Table, findings, lock, census, Spec 67 blocks generated; the Spec 58 §13 mirror deleted (M-20 note). | proposed |
| Rule 9: dated ledger | `ratchet-exceptions.json` via `ledger.mjs` semantics; `--accept` always needs `--ruling=<RATIFIED id>` cited literally. | proposed |
| Rule 10: verdict from rows | Word lines derived only from gate results (frozen registry). | proposed |
| Rule 13 data half | ZV-1..ZV-4 live on `load_zoning` / `enrich_parcels` (M-42), not here. | ratified |
| R-H: WARN + retighten | G-CODE (ii)/(iv) report-only until a Phase 3 ruling; snapshot age WARN. | proposed |
| §4.2: discoverer ≠ adjudicator | Two drafters + the operator; enforced by G-AGREE + G-PROV. | proposed |
| §4.4: a ruling needs a lock | Every M-row names a §9 gate, another named lock, or declares itself a process / report rule (M-0, M-33, M-40, M-44); red evidence committed (gate K convention). | proposed |
| §4.7 / R-AA: moves are tool-performed | S13 edits Spec 67 only through `generated-blocks.mjs` plus an allow-list lock; budgets for 68/69 registered in `spec-split-check`. | proposed |
| R-AN: counts are derived | `universe.lock.json`, `census.json`. | proposed |
| R-AG: gate placement | Pre-commit `--check` (M-32, a stage under R-AG; Spec 124 not amended), positional lock in `hooks-composition.infra.test.ts`; wall time measured at S8. | ratified |
| Step descriptor / #44 / R-BE | N/A in Phase 1 (no step). `generate-target-files --check` exit 0 *(measured, panel)*; re-run at commit. | measured |
| Nothing hidden | Every row state, draft failure, disagreement, finding, heuristic and gate state counted on the five lines. | proposed |

## Execution Plan

### Held for Phase 2/3: corrections to live outputs (operator HOLD 2026-10-06, Spec 69 M-25)
No WF3 is opened for these (E1 is the approved carve-out, M-42; F-1 is an open operator question, Spec 69 §4 Q5).
- **F-1: suite constants (849-2025 / 847-2025).** `BYLAW.GARDEN_HEIGHT_HIGH_M` 6.0 vs 6.3 m; `BYLAW.GARDEN_SEP_LOW_M` 5.0 vs 4.0 m; cites 150.7.60.70(1)(C), which no longer exists; laneway height 6.3 m; laneway 60 m² ≠ 8.0 × 10.0 m. Live reach: garden 339,661, laneway 67,438, `garden_suite_fits` 299,416 *(measured, reproduced)*.
- **F-2: `max-build.js` constants.** `GARAGE_MAX_GFA_SQM` lacks the 40 m² branch for lots under 12 m; `ACCESSORY_MAX_COVERAGE_PCT` is 30 % of the rear yard vs 10 % of the lot; `GARDEN_SUITE_MIN_LOT_SQM` and `MIN_SOFT_LANDSCAPING_PCT` have no by-law source (classified by-law vs heuristic at S9, M-46).
- **F-3: R-zone outputs.** 104,544 parcels (E1 changes `bylaw_*` on some of them under the carve-out).
- **F-4: Ch.900-driven outputs.** **339,125** excepted residential lots (343,652 includes the 4,527-lot R −1 sentinel and is not a denominator). The **direct-lot** census: 515 exceptions ≥ 100 lots cover 300,616 = **88.6 %**. INCLUDE-closed ≥ 100 = **519** *(measured, panel)*, ranked at Phase 2 entry (M-15 note). Rows Phase 2, corrections Phase 3.
- **F-5: lots with no 569-2013 zone polygon.** 17,829 parcels; max-build envelopes on ≈ 12,762 of them *(measured, panel; was 12,764)*; Phase 3 marks them "not evaluated". Zone coverage is **96.41 %** (Spec 65 DEC-4 still says 96.8 %; R-13).
- **STAND_SET (Spec 67 KFM-14):** a CR standard-set selector (1/2/3), not metres, used today as a front setback. Not a separate F-item: E1 removes it from residential parcels, and G-CODE (i) forbids any row citing `bylaw_standard_setback_m` as a setback.

**Locks the eventual correction must update** (Regression Guardian + Integration, *read*): `optimal-config.js` 22–45, 143 · `docs/specs/_contracts.json` `optimal_config` (add the unpinned height constants) · `contracts.infra.test.ts` 354–413 · `optimal-config.logic.test.ts` 29–35, 84, 99, 179–180 · `enrich-parcels-optconfig.logic.test.ts` 83 · `db/enrich-parcels-optconfig.db.test.ts` · `db/optconfig-staleness.db.test.ts` (HIGH fence: check whether a `BYLAW_VERSION` bump forces a recompute) · Spec 78 §P2.1 / S6 · the `enrich_parcels` goldens, gate J2, `compute_parcel_cost_estimates` · `enrich-parcels-accessory.logic.test.ts` 162–164.

### Phase 1 steps (engine-sized unless marked; every gate lands with its committed red evidence — there is no standalone red step)
- [ ] **S0 — Pre-flight (claude).** `ai-env-check`; read `tasks/lessons.md`; confirm one committer (M-33). `spec-split-check --check` is **clean** (exit 0, 0 dangling, with the 68/69 drafts present *[measured, panel]*); Specs 68/69 must keep it clean — re-measure at commit.
- [x] **S0.5 — DONE 2026-10-07** (`docs/reports/mcbylaw-s05-spike.md`): kill fields PROCEED (expression 96.1 %, bound 100 %, off-vocab 0 %, UNUSUAL 0 %, 0 cycles, ≈ 1 min/unit proxy); K4 (grammar) and K5 (page set) tripped → ruled at S1.
  **S0.5 — Spike (≈ 1 session; Spec 69 M-44). Nothing in `src/` or `scripts/`; artifacts under `.cursor/mcbylaw/spike/`, report committed as `docs/reports/mcbylaw-s05-spike.md`.** Kill criteria are fixed here, before any measurement:
  1. **Blind A/B double-key of 25 regulations (≈ 60 clause units)** — RD side-yard bands, R zone rows, 150.7, 600.60.40, 10.20.40.70, plus 5 exception clauses from `phase0b/` — with a draft `vocab.dsl_target` and draft DSL. Keyer A = Claude (fresh context), keyer B = DeepSeek (separate worktree). **Measure:** agreement per ⧉ field; operator minutes per disagreement (timed). **Remedies (M-44):** `numeric_expression` or `bound` agreement < 80 % → grammar / vocabulary redesign + re-spike before S6; mean adjudication > 2 min per unit → narrow the ⧉ set to `archetype` / `target` / `bound` / `numeric_expression` (a Spec 69 row + the Spec 68 §6 edit); a rate between 70 % and 90 % → extend to 50 regulations before deciding.
  2. **Off-vocabulary targets:** count keyer proposals outside the draft `dsl_target`. **> 5 %** → redesign the vocabulary before S5.
  3. **True UNUSUAL share** on the keyed units. **> 8 %** → revisit the archetype set before A1.
  4. **DSL + evaluator prototype:** hand-write the DSL for the 14 Spec 68 §7.3 fixture clauses + RD 1462 FSI bands + 600.60.40(2)(A) (+ the 10.20.40.70 bands); run a prototype evaluator, `effective()` and `permitted()` on the six Spec 67 worked examples (41 Derwyn, 64 Eastbourne, 96 Futura, 68 Cordella, 5071306, 7 Bijou) and V1–V25, first assigning each vector a `vector_status` (V16 `no_expected`, V12 policy NULL, V25 `model_composite` *[read, cross-read]*). **Any inexpressible `by_law_expected` vector** → grammar change before S6; **any numeric mismatch** → explained (which side is wrong, citing the clause) or fixed. Output: the `eval-vectors.json` draft in `.cursor/mcbylaw/spike/`, promoted at S6b.
  5. **The G-UNIVERSE TOC logic (prototype) over all pinned pages now** (chapter-level for unpinned chapters). Any unmapped residential entry → a page-set ruling at S1, before S3.
  6. **In-force desk research** (R-1/R-10) on the 10 largest amending by-laws by tagged clauses. ≥ 1 under appeal → the `not_verified` notice (already designed) is mandatory in P-1; recorded, no kill.
  7. **INCLUDE-chain closure / cycle check** over the `phase0b/` edges (panel: 0 cycles, 519 ≥ 100). A cycle or depth > 3 → Phase 2 note.
  - **Operator action in parallel:** send the expert inquiry (Spec 69 §4 Q6).
- [x] **S1 — DONE 2026-10-07:** operator approved S0.5 rulings a–f as recommended → Spec 69 M-47..M-51 + dated notes on M-17 (calc-handling status single-drafted; conventions + conditional ⧉ narrowing at A1), M-36 (R-10: 654-2025 in force), M-44 (results); Spec 68 §6, §7.4–§7.6, §6.4, §10, §11 amended. SC-3 floor: S0.5 proposed none → set at A1.
  **S1 — Ratify (operator).** Spec 69 §4: the PROPOSED set M-21/M-26/M-27/M-28/M-37/M-38/M-39 together (dependency ordering: M-29 → M-27/28; M-36 → M-37); the page rules from S0.5 item 5; any S0.5 redesign row; SC-3 floor from S0.5.
- [ ] **S2 — deleted in v0.5** (reds land with their capability; panel I-4).
- [ ] **S3 — Snapshot and manifest (claude).** Versioned normalizer; transactional `--refresh` into git-ignored `.staging/`; diff against the Phase 0 pages in `.cursor/mcbylaw/pages/` (the only baseline for adoption 1; G-CHANGE gates adoption 2 onward); `--adopt` writes raw + normalized pages (incl. `Chapter600_60` once M-37 is ratified), manifest, lock, first adoption. **Per M-47 (S1):** pin one page per TOC section (a chapter URL holds only its first section), add the 23 M-47 entries and the Ch.15/40/80 clause carve-ins, and slice `ch150_13` / `ch970`. Prevents mtime provenance and silent drift. Lock: G-PROV (page shas).
- [ ] **S4 — Slicer and extractors (engine).** Clause paths; page coverage; **numbering-sequence check** and the case-insensitive definition matcher (800.50 (410) and (695) become rows; the 945 / 200 / 69 counts move and are re-pinned); literal, tag (with clause path) and cross-ref extractors; unit table and number words with the anti-vacuity scan; source-defect log (600.60.40(3)(A) garble). Lock: G-TEXT.
- [ ] **S5 — Scope, vocab, definitions, input fidelity, page set (engine drafts; claude reviews; judgment scope reasons and page rules go to the operator through `--accept --ruling`).** These are rules, not ⧉ fields, so M-17's operator adjudication of keyer disagreements does not apply here. Scope rules with precedence and evidence; `vocab.json` incl. `dsl_target` for the standard regulations, each `dsl_target` entry with its `aspect` and each `building_type` with its `structure` (the `feeds` maps, Spec 69 M-52; the G-SHAPE totality arm and the S9 G-CODE cross-check follow); the definitions matcher; input fidelity on each mapped Ch.800 measurement definition (Specs 55/65; `unknown` where nobody knows); TOC page rules (chapter-level where no page is pinned); the retired Ch.230 pages' rows become out-of-scope rows — 230.20 `apartment_building_only`, 230.30/.40/.50/.60/.80 `non_residential_zone_parking` (operator S3 2026-10-07) — visible and counted, never absent; `--accept --ruling` pins the in-scope counts (≈ 607 rows: 647 by class minus ~40 administrative, M-31; pinned here, quoted only from here on). Locks: G-UNIVERSE, G-READ (definitions arm).
- [ ] **S6 — Authored-field gates (engine, 3 briefs).** Schemas; DSL parser + canonicalizer; G-SHAPE (incl. `row_status`), G-CLAUSE, G-XREF, G-AGREE, G-PROV (keyer provenance arm, ruling-id arm via `ledger.mjs`). Archetype × value-form fixtures from real text.
- [ ] **S6b — Evaluator (engine 1–2 briefs; claude verifies).** `scripts/analysis/bylaw/evaluate.mjs` (`evaluate`, `effective`) from the S0.5 prototype; `eval-vectors.json` (inputs extracted from the Spec 67 recorded results; expected by-law values with Spec 67 anchors; transcribed values are `eval_vector` adjudications); precedence fixtures for Spec 68 §7.5 rules 0–7. **Per S1:** correct Spec 67 V1–V4 and V25 (side) from the spike evaluator as `eval_vector` adjudications (M-51; Spec 67 itself waits for S13); implement the M-48 grammar, own-target / argument-level displacement, the M-49 tie-break and the M-50 building-type rule, each with a fixture. Lock: G-EVAL.
- [ ] **S7 — Renderer and the five lines (engine).** Renderer contract: fixed heading, no Status line, escaping, total sort, LF, atomic writes, `gates pass/run/total`, row-state counts; table-level `validated_against`; `--validate`; `--plan-batches`. Lock: G-DRIFT.
- [ ] **S8 — `--check` / `--self-test` + infra test. FIRST LANDING (claude).** Static import; infra timeout measured here and set with 10 % headroom (WARN then tighten, R-H); the determinism grep lock; `package.json` script; the pre-commit `--check` stage + its positional lock in `hooks-composition.infra.test.ts` (M-32); measure and record its wall time; register 68/69 in `spec-split-check` `SPEC_FILES` + manifest `budgets`; each gate run once on the **real** snapshot, not only fixtures. Run the full gates.
- [ ] **S9 — Code linkage (engine; claude checks).** `typescript` AST resolution; `expects` on constant refs; report-only value comparison → `bylaw-code-findings.md`; the root-module constant classifier (by-law · heuristic · unmapped, M-46). Lock: G-CODE (i)(ii)(iv).
- [ ] **S10 — Amendments and change report (engine; claude researches).** `amendments.json` (default `not_verified`, clause-bound tags, per-page tag counts pinned); `enacting/` text for 654-2025 (PDF sha `bcfdfef3…0237`, extraction sha + extractor version); the 600.60.40(3)(C) `consolidation_mismatch` adjudication (M-39); adopt validation. Lock: G-PROV (amendment arm), G-CHANGE.
- [ ] **S11 — Census (claude; read-only DB).** `census.sql` (SELECT-only, witness-checked): the direct-lot Ch.900 backlog by zone and exception (sentinel on its own line), the unzoned parcels, and the coverage-null share (stated once, from data); `census.json` records the SQL blob sha, DB name and source-table row counts; `--refresh-census`. Lock: G-UNIVERSE (census arm). INCLUDE-closed ranking is Phase 2 (M-15 note).
- [ ] **S12 — Legacy-id migration (engine; claude adjudicates; one-time, M-21).** Build the legacy C/L/G/H → `regulation_id` map (exactly-once fragments); retire the 12 UNVERIFIED C-claims; re-derive absence claims once; H26–H28 → `external.json` refs; record the map in `docs/reports/`. No permanent alias field or gate.
- [ ] **S12b — External and heuristic rows (claude; research with citations).** The seven external rows of Spec 68 §6.1 (EXT-gov-1, EXT-prov-1, EXT-risk-1..5), each at the verification status the table states and `unverified` until its citation is confirmed; the `model_heuristic` rows from S9's classifier (≈ 60 constants; operator confirms the heuristic list). Lock: G-READ (external + heuristic arms).
- [ ] **A1..A7 — Double-keyed authoring batches.** Per article shard: (1) the generator emits two blind briefs and seals A's hash; A (Claude, fresh context, no `.b` reads) writes `.a.json`; B (DeepSeek, separate worktree at a commit without A's draft, `.b` write scope) writes `.b.json`; the `.prov.json` record (run_id, ledger sha, read paths, brief sha, seal) is generated; all three are committed together; (2) agreement auto-passes, disagreements go to the **operator**; (3) A drafts the free text and `code_refs` once; (4) `--check` stays green throughout (unfinished rows are `pending`). Membership from `--plan-batches`. Order: **A1** RD/RS/RT/RM + 10.5 principal-building envelope · **A2** R zone · **A3** 10.5.60 ancillary + 150.7/150.8/150.10 (G-CODE then reports F-1) · **A4** used definitions + input fidelity · **A5** Ch.5 subset + 200.5 · **A6** existing-building, permission and informational rows · **A7** 900.1 + 1.5.7(1) + 600.60 overlay rows + the direct-lot census review. Agreement rate and cost re-estimated after A1 (M-17).
- [ ] **S13 — One source (claude). After A1–A5.** Spec 67 App. A/B/C/E regenerated in place through `generated-blocks.mjs` (never a whole-file write; EOL preserved; red fixture = a half-open marker); edits outside the blocks only on the allow-list (§0, the current L2459 sentence, §4, KFM-11, "frozen" relabels, header NF/EF id ranges from data, the Appendix E heading generated from the ids left after S12); allow-list regions are anchored by heading text + a bounded context match, never by line number; lock = a wrapper that strips allow-listed regions, then `outsideMarkerChanged(pre, post)` (which alone flags any outside edit). **Spec 58 §13 mirror deleted** (NF/EF tables, L1–L28 ledger, additional provisions) leaving a pointer; the §13 ↔ §3.4–3.6 equality check is retired, not ported; Spec 58 pointer at the sentence now on L439 (anchored by text); Spec 78 §5.1 pointer; legacy ids rewritten from the S12 map. Locks: allow-list lock, target-files and owner-spec-diff pass.
- [ ] **S14 — Expert audit, then close (operator + claude), exactly per Spec 69 M-29.** Commit the bar file (strata, allocations, seed); `--sample` draws **exactly 50** rows; the operator engages a City zoning examiner (else a Registered Professional Planner, RPP); record `expert-audit/<date>-<n>.json`; G-AUDIT PASS required; a disagreement is fixed or answered by a reasoned operator ruling, **never silently waived**; a FAIL → new full audit (new seed, same bar, failed rows forced in within their strata, count stays 50; operator ruling after a third FAIL). Then: five lines PASS, pending = 0, failed = 0, `run = total`; Specs 68/69 → RATIFIED; full gates; Pre-Review Self-Checklist; OUTPUT-altitude panel (Integration, Regression Guardian, DeepSeek spec / idempotency / error-paths, each grounder-adjudicated).

### Registrations needed at commit time (not done now)
1. `npm run system-map` in the Specs 68/69 commit (two DRAFT rows); again at the first `docs/reference/*.md` write.
2. Copy the audits and this plan to `docs/reports/` (Spec 68 §15). The committed plan copy omits the closing PLAN LOCKED block.
3. Spec 68 §15 classifies `scripts/lib/compute/load-parcels.js` (Out-of-Scope) for `system-map.infra.test.ts` R-AF *(measured, passes)*.
4. `package.json` `bylaw:provisions`; `.husky/pre-commit` + `hooks-composition.infra.test.ts` (M-32); `spec-split-check` `SPEC_FILES` + `budgets` for 68/69 (S8).
5. `.gitignore` for `scripts/seeds/bylaw/.staging/`.
6. Runbook rows for `--refresh`, `--adopt`, `--refresh-census`, `--sample`.
7. Add the reference doc to the `scripts/CLAUDE.md:27` list.
8. Optional: an `exec-policy.json` `bash_allow` entry for the generator (Claude-only).
9. Not needed: a converted-step census row, `converted.json`, the pipeline `scripts/manifest.json`, an advisory lock, `_contracts.json`, a gate-J row (`docs/reference/` drift is covered by the infra test).

### Estimates (*inferred*)
- **S0.5:** ≈ 1 session (+ operator adjudication minutes, measured).
- **S3–S12b:** ≈ 24–30 engine briefs (13 gates in 5 word modules + evaluator; the merges remove ≈ 4 briefs, G-EVAL adds ≈ 2). ≈ 4 sessions with landings.
- **A1–A7:** ≈ 607 rows; ≈ 26–30 keyer-B briefs and the same from keyer A. ≈ 5–7 sessions (re-estimated at S0.5 and A1).
- **S12b:** ≈ 0.5 session. **S13:** ≈ 1 session. **S14:** ≈ 0.5 session + the expert's turnaround.
- **Total:** ≈ 12–15 sessions plus the expert. No `--full` runs and no recaptures.

## Phase 2 / Phase 3 roadmap (Spec 69 M-25, P-1..P-8; not authorized)
- **Phase 2:** the DB load as a pipeline step under Specs 122/124, validated by Spec 79 (never by extending `--validate`); NF/EF rows re-keyed to `regulation_id`; user inputs as scenarios (P-7); **Ch.900:** pin `ch900_2..6` (windowed engine reads), slice exception rows, rank by INCLUDE-closed lots (≥ 100; 519 measured), wave 1 = top 220 (≈ 74.38 % of excepted lots, direct shares), wave 2 ≈ 299; `dsl_target` extended; G-EXC-LIT; the census render with `direct_lots` + `inherited_lots`; new data deps (M-41) incl. overlay geometry (City GIS "Sixplex Permission" layer); CoA ground truth (P-5) after a CoA→parcel linkage gate; buyer report (P-1); `in_force_basis`. **Zoning entry condition (M-42):** ZV-1..ZV-4 PASS on `load_zoning` / `enrich_parcels`.
- **Phase 3:** F-1..F-5 with the lock list above; calculations driven from the table through one handler per archetype and `effective()`; a parity test executes the code against `effective()`; shadow columns + distribution report + Reality-Check bounds through the plausibility executor; CoA validation before switching; G-CODE blocking; **E2** (label FSI); Spec 78 §P2.1 regenerated; by-law values reach compute through the table load, never as new constants (Spec 124 gate E).

## Open research
- **R-1:** whether tagged amendments are in force or under appeal (S0.5 item 6 starts it).
- ~~R-2~~ RESOLVED (Phase 0b): `exception_number = -1` is a sentinel.
- **R-3:** per-regulation anchors on the City pages.
- **R-4:** unit / number-word census (S4 input).
- **R-5:** a data source for the Ch.5 shoreline / heritage override.
- **R-6:** carried table questions: KFM-4, -5, -6, -12, -13; R1; the "NULL, don't guess" fallback; the RS/RT/RM corner rule (5.10.30.20); 10.5.80.10(4)–(7); 10.5.40.71. (KFM-14 is settled: STAND_SET is a selector, not metres.)
- **R-7:** false-negative rate of the definitions matcher (S4's numbering-sequence check now bounds it).
- ~~R-8~~ RESOLVED (Explore map): Appendix E ids run H1–H28; its heading says H1–H18 and is fixed at S13.
- ~~**R-9:** primary text of Planning Act s.16(3) / s.35.1 and O. Reg. 299/19 as amended (e-Laws JS-rendered; CanLII 403).~~ ANSWERED 2026-10-07 (S12b): primary text read from the e-Laws Word downloads; O. Reg. 462/24 recorded as prevailing now (Spec 69 M-55).
- **R-10:** 648-2025 in force or under OLT appeal; Diagrams 1/2 parcels; 600.60.20 vs 800.50(181).
- **R-11:** which former by-law governs each unzoned parcel (candidate: City GIS "Not Part of This By-law" layer).
- **R-12:** risk-row citations (OBC regulation number, TRCA regulation, Ch.813).
- **R-13:** doc follow-ups: Spec 55 `frontage_m` / `depth_m` derivation (`load-parcels.js:205-243`); Spec 58 non-existent `in_trca_regulated`; Spec 65 DEC-4 zone coverage 96.8 % → 96.41 %; the coverage-null share is stated once, from `census.json`, never quoted in prose.

## Plan-altitude review: fold record
**v0.2 panel:** Integration, Regression Guardian, DeepSeek spec / idempotency / error-paths. Every finding was adjudicated; see v0.2 in v0.3 Spec 68 §2.6 (now Spec 69 M-0) and the table below.

| Finding (seat) | Verdict | Fold |
|---|---|---|
| Percentage ratchet over a growing universe (idem/err/spec) | valid | absolute floors; `--accept --ruling` |
| Unpinned in-scope denominator; inconsistent counts (spec/err) | valid | pinned in `universe.lock.json` |
| Literals/evidence checked against the whole regulation (spec) | valid | clause-scoped |
| Table-column units (spec) | **refuted** *(measured)* | — |
| `require` executes modules (idem/err) | partly valid (no side effects *measured*) | AST |
| Extractor vacuity (err) | valid for numbers | one scan (v0.3 simplicity) |
| One sidecar per page (idem, Integration) | valid | per article |
| Orphan keys (idem/spec) | valid | G-ORPHAN |
| Normalizer bump (idem/err) | valid | raw pages kept; re-pin via `--accept` |
| MD change log, per-row `fetched_at`, sort, clause ids, alias ambiguity, `expects` semantics, `-1`, vocab gaps, `planned_field`, M-4/M-16, absence claims, cross-refs, exit codes (lenses) | valid | folded |
| Ledger co-owned with a WF3 | superseded by the HOLD | report-only findings |
| Spec 67 other generated sections; byte-equality fence; whole-file clobber (RG, Integration) | valid *(measured)* | S13 |
| Legacy-id citations; C12/C13/C18 strings live (RG) | valid | G-ALIAS; register |
| Data-only commits not selected; system-map row; Spec 47 miscite; stale `schema.ts`; untracked ground truth; red commits blocked; ESLint (Integration, *measured*) | valid | folded |

**v0.3 delta review:** Integration + DeepSeek spec lens (deepseek-reasoner, 96 s), grounder-adjudicated.

DeepSeek findings, adjudicated against the spec text:

| Finding | Verdict | Fold |
|---|---|---|
| Claude is both keyer A and adjudicator (CRIT) | valid | the operator adjudicates (M-17) |
| The audit is pinned to `adoption_id`, which doesn't move on row edits (CRIT) | valid | table content sha + per-row drift FAIL (G-AUDIT) |
| Free-text ⧉ fields can never canonically agree (CRIT) | valid | compare structured projections only; free text single-drafted |
| G-PIN re-verified by an explanation edit (HIGH) | valid | requires a new draft pair after the adoption |
| `input_fidelity` has no consequence (HIGH) | valid | `differs`/`unknown` forbid `modelled` (G-DEF) |
| EXT-gov-1 overstated as `verified_primary`; 17,829 vs 17,828 (HIGH) | valid | "our zone layer", inferred; the 1 parcel has no geometry *(measured)* |
| EXT-prov-1 precedence unverified; conditions missing (HIGH) | valid | precedence `unverified`; condition stated |
| Audit strata exclude external rows (HIGH) | valid | every external row is sampled |
| `precedence` unresolved; 654-2025 district inexpressible (HIGH) | partly | precedence resolves; external rows are disclosure-only; no new area token (M-0) |
| Unverified risk rows assert content (MED) | valid | unverified rows carry title, authority and "citation pending" only |
| Defer report-only external rows (MED) | **rejected** | the operator explicitly asked for them in Phase 1 |
| Bill 139 row has no consumer (MED) | valid | moved to research |
| Bar can be back-dated (MED) | valid | committed bar file, blob sha recorded |
| "About 50" with no numeric quota (MED) | valid | exactly 50, ≥ 20 numeric |
| Independence is only id inequality (MED) | valid | blind briefs + seal |
| Field justification claim unverifiable (MED) | valid | reworded to point at v0.3 §2.6 (now Spec 69 M-0) |
| `drafts` state outside the SSOT (MED) | valid | agreement state rendered in the table |
| On-demand gates hidden in a PASS (MED) | valid | `gates run n/m` |
| Banned list / bound not in vocab (MED) | valid | moved to `vocab.json` |
| Open `input_fidelity` list (MED) | valid | derived from the DSL input variables |
| `code_refs` double-keyed needlessly; dead-clause comments ungated; reverse index ungated (MED) | valid | single-keyed; G-CODE (iii) comment-citation report; reverse index is a rendering |
| External rows' accounting (MED) | valid | counted separately |
| M-19/M-23 holes; KP8 wording; three denominators (LOW) | valid | tombstones; reworded; a denominators note |

Integration delta seat (*measured*, read-only):

| Finding | Verdict | Fold |
|---|---|---|
| Blindness unenforceable when both drafts share one file | valid | per-keyer `.a`/`.b` files; B in a separate worktree; ledger read check |
| The 17,829 are not all former-by-law land | valid | reworded to "no 569-2013 zone polygon" (former-by-law + coverage gaps) |
| "Not evaluated" contradicts live output (12,764 envelopes) | valid | recorded as F-5; Phase 3 |
| TRCA vs the Ch.658 10 m proxy | valid | EXT-risk-3 reworded |
| Fidelity: frontage/depth derivation undocumented in Spec 55 | valid | code cited; R-13 |
| Zone coverage now 96.41 % | valid | noted |
| Ch.900 operator numbers | reproduced exactly | — |
| New paths vs gates | PASS | — |

**v0.4 light review (2026-10-06):** Integration (main tree, read-only, *measured*) + DeepSeek spec lens (deepseek-reasoner) on Spec 68 and Spec 69, then a second DeepSeek pass on the folded Spec 68. Every finding was grounder-adjudicated against the text and the repo.

| Finding (seat) | Verdict | Fold |
|---|---|---|
| R-AF: Spec 68 names `load-parcels.js` unclassified (Integration) | valid *(measured, red)* | Out-of-Scope line; system-map infra now 12/13 (only the expected drift lock) |
| System-map drift; Status line noisy; preamble ratified list; stale .cursor cites; MBR scaling (Integration) | valid | regen at commit; Version/Domain off the Status line; preamble lists every ratified id; refs fixed; scaling stated |
| `layer` cannot hold overlay rows (DS CRIT) | valid | Ch.600 overlay units are base units with `applies_to.part = map_area` |
| One archetype per regulation vs mixed clauses (DS CRIT) | valid | facets and pins per **clause unit** |
| Audit fix vs hash-drift deadlock; strata/seed; power; post-closure cost (DS) | valid | FAIL → new full audit; seeded strata in the bar file; numeric stratum on a generated field; ≥ 1 per archetype; 900.1.10 always sampled; post-closure `audit_stale`; power in Known limits |
| Precedence algebra / ties / unknown zone / unit mixing (DS) | valid | rules 0, 4a, 6 clarified; unit-specific targets |
| M-36 asserted `in_force` while R-10 is open (DS) | valid | 654-2025 status `not_verified` |
| M-15 union vs sum; wave-1 "must include" (DS) | partly | shares are direct-lot (one label per lot, no double count); inherited counting decides membership only; ≥ 518; the cutoff claim is tagged inferred |
| G-TOC circular (DS) | **refuted** *(measured: the pinned Ch.600 page TOC lists 600.60)* | anti-vacuity + `deferred_by_ruling` added |
| Five-line states; `complete`; §7.3 fields; input_fidelity single-keyed; effective dates; external-refs hatch; on-demand gates; census sha; INCLUDE extraction; map/as-built LIMIT; DSL grammar; G-CODE roots; ruling ids; tag binding; untrusted page text (DS) | valid | folded (Spec 68 §4, §6, §7, §9, §10) |
| The register is hand-kept (DS CRIT) | partly | numbers are tagged evidence quotes; generated files win on disagreement; M-0/M-33 declared as process rules |
| A tracked spec cites the untracked plan (DS) | valid | plan committed as `docs/reports/mcbylaw-phase1-plan.md`; Spec 69 §6 glossary |
| Show the mismatch flag in Phase 1 outputs (DS) | **rejected** | operator HOLD (M-25): Phase 1 changes no output; recorded as Known limit 12 (now 13) and in P-1 |
| B can read A through git history (DS) | **refuted** | A's draft stays uncommitted until B's exists (A1..A7 step 1) |
| External-kind prefixes; EXT-risk-4/5 split; exit-code map (DS LOW) | deferred | cosmetic / an S6 detail |

**v0.5 — approved change package (2026-10-06).** Inputs: design review (architecture / red-team seat) and the Integration + Cross-read Adversary + DeepSeek lens panel (9 runs). The operator approved the consolidated package; every item below is applied.

| Item (seat) | Fold |
|---|---|
| 24 gates, 41 rulings, ceremony growth (design review §3) | 13 gates (Spec 68 §9); Spec 69 keeps decisions only (40 → 32 live); budgets declared; plan lists removed |
| Declared ≠ observed: DSL never executed; code linkage only proves existence (design review §2) | evaluator + `effective()` in Phase 1, G-EVAL (M-43); `code_linkage: declared-only` |
| Riskiest assumptions R1–R8 (design review §4) | S0.5 spike with pre-declared kill criteria (M-44) |
| B1 pending vs pre-commit (panel) | M-45; G-SHAPE computes `row_status` (a)–(e); G-COV cut |
| B2 page set lacks Ch.900 text (panel) | INCLUDE-closed ranking deferred to Phase 2 entry (M-15 note: simpler; no Phase 1 Ch.900 rows) |
| B3 blindness inputs outside the repo (panel) | committed `.prov.json` per shard; git-history ordering (Spec 68 §10, G-PROV) |
| B4 M-17 vs Spec 68 ⧉ set (panel) | M-17 note: ⧉ set = Spec 68 §6; operator re-confirmation recorded |
| I-1/I-2/I-3 S13 markers, allow-list, App B mirror (Integration) | `generated-blocks.mjs`; allow-list lock; Spec 58 §13 mirror deleted (M-20 note) |
| I-4 / red-first step S2 (Integration, design review) | S2 deleted; red evidence committed with each capability |
| I-5 acorn; I-6 census SQL; I-7 lint; I-8 H-lane coupling; I-9 M-32 wording; I-10 untracked cites; I-11 reuse | `typescript`; sql-witness + `BEGIN READ ONLY`; grep lock; coupling + wall time in M-32 note; R-AG stage wording; plan copy cited, QUEUE.md not; reuse list (Spec 68 §8) |
| X-1 F-4 denominator; X-2 stale S0; X-8 647 vs ≈ 607; X-18 small lines | fixed above |
| X-3 overlay vs most-restrictive | overlay layer (M-30, M-34 notes; Spec 68 §7.5) |
| X-4 M-39 vs G-CLAUSE; no terminal state | M-39 rewritten: adjudicated row, enacting excerpt is the cited clause; comparator cut |
| X-5 ratified rows depending on PROPOSED | M-36 single status; correction moved to M-37; S1 ratifies the set together |
| X-6 target vocabulary phase | stated once (Spec 68 §6.5) |
| X-7 S14 vs M-29 | S14 cites M-29 exactly |
| X-9 slicer misses (410), (695) | numbering-sequence check (G-TEXT) |
| X-10 source garble; X-11 TOC granularity; X-12 "Witnessed"; X-13 clause-bound tags; X-14 `applies_to.part`; X-15 null-mapped inputs; X-16 bare `--accept` | `source_defect`; chapter-level rules; §5 reworded; `amendments[].clause_path` + pinned tag counts; G-SHAPE cross-cutting rule; G-READ `not_a_measurement`; `--accept --ruling=<RATIFIED id>` via `ledger.mjs` |
| X-17 R-ZV unfolded; GIS layers | M-42 ratified, checks on the zoning steps; layers cited in Spec 69 §4 Q3 / R-10 / R-11 |
| DeepSeek LOW–MED (unit rule, `bound: count`, 4a condition, `displaces[]` acyclic, empty candidate, report-only exit, per-reason fixtures, gate throws, statuses, `audit_stale`, re-audit forcing, audit path, census identity, SC-2, SC-13) | folded in Spec 68 §3, §4, §6, §7.4, §7.5, §9 (`audit_stale` dropped; post-closure cadence is a Phase 2 ruling) |
| Heuristic constants (Explore map) | `model_heuristic` row kind (M-46; Spec 68 §6.3) |
| Explore-map contradictions | 96.41 % (R-13); coverage-null share once (S11); NF/EF id ranges and App E H1–H28 from data at S13; KFM-14 settled; map currency → ZV-3 freshness check (M-42) |
| Not applied: out-of-scope audit stratum (DeepSeek) | not added — M-29's strata are ratified; G-UNIVERSE judgment reasons carry evidence; revisit if S0.5 shows scope disagreement |

**v0.5 light delta review (2026-10-06).** Cross-read Adversary + grounder (main tree, read-only; ran `spec-split-check --check`: exit 0, 0 dangling) and the DeepSeek spec lens (deepseek-reasoner) on Spec 68, Spec 69 and this plan. Every finding was adjudicated against the text and the repo by the orchestrator.

| Finding (seat) | Verdict | Fold |
|---|---|---|
| G-EVAL (b) / G-AGREE fail while rows are pending, so `--check` would block every commit from S8 to A7 (xread BLOCKER) | valid | "pending never fails a gate" rule (Spec 68 §4); G-EVAL counts pending vectors; S8 zero-agreed fixture |
| A lone uncommitted `.a` fails G-SHAPE on every commit (xread) | valid | sealed `.a` without `.b` = `pending` |
| G-SHAPE ordered before G-CODE in §12 (xread, DS ×3) | valid | G-CODE moved before G-SHAPE; G-DRIFT is a file defect, not a row state |
| Coverage lost its lock with G-COV (DS-68 CRIT) | partly | no floor (operator cut G-COV); a computed `PHASE 1: DONE` line, which S14 requires, is the lock |
| `effective()` has no conflict outcome; min vs max undefined (DS ×2) | valid | `conflict` result, `eval_conflict`, fixtures |
| Rule 3 needs data no field holds; `displaces[]` granularity (DS ×2) | valid | ⧉ `ranks_layers[]` on PROCEDURAL precedence units (confirm at S1); unit ids `regulation_id#clause_path` |
| M-38's PERMIT example cannot run through numeric `effective()` (xread) | valid | `permitted(lot, building_type)` |
| V16 / V12 / V25 have no by-law expected value (xread) | valid *(read)* | closed `vector_status`; V25 `model_composite` |
| M-44 kill remedy does not address its own trigger; sample too small (xread, DS-69) | valid | per-criterion remedies; `bound` included; 70–90 % → extend to 50 regulations |
| Spec 69 header "every row names a §9 gate" false (xread, DS-69 CRIT) | valid | reworded: gate, named lock, or declared process / report rule |
| `displaces[]` extraction has no completeness check (DS-69 CRIT, DS-plan) | valid | displacement-trigger anti-vacuity in G-XREF |
| G-PROV git ordering vacuous when committed together; read paths self-reported (xread, DS ×2) | valid | ordering clause dropped; B's worktree commit tree witnessed via `git ls-tree`; ledger arm labelled declared-only |
| G-PROV demands RATIFIED citations while PROPOSED rules are encoded (DS-69) | valid | RATIFIED only for `--accept`; deferrals may cite PROPOSED (counted); 0 parsed rulings FAILS |
| Snapshot age vs the no-clock lock; fetch time vs the lock (DS ×2) | valid | one exempt `clock.mjs`; TZ / locale double-run test |
| `band` / `by_type` partial; "lesser of m and storeys" (DS) | valid / refuted | `not_evaluated` with reason; two unit-specific limits both apply, so no cross-target operator is needed |
| Higher-layer replacement with an opposite bound (DS-69) | valid | same bound direction only (M-34 row) |
| Label digits excluded and `label()` forced non-modelled (DS-68) | valid | `label()` evaluable from the dominant label (M-42); label patterns checked |
| `verified_against_sha256` authored (DS-68) | valid | generated |
| `include_ref` to a Ch.900 exception unresolvable in Phase 1 (DS-plan) | partly | `phase2_exception` ref allowed in Phase 1, counted |
| External rows six vs seven ids; unverified schema; "every external row" vs heuristics (DS-plan, xread) | valid | EXT-risk-4/5 split (seven); null fields on `unverified`; M-29 = EXT-* only |
| Heuristic examples prejudge F-2; file:line pins drift (xread) | valid | :92 / :107 removed from examples; `module#member` or logic variable, no line number |
| `ledger.mjs` reuse is pattern-only; `outsideMarkerChanged` flags any outside edit; line-number allow-list (xread, DS-plan) | valid | wording; strip-then-compare wrapper; text anchors |
| Ruling arithmetic 40→32; fixture count 14 vs cross product; G-TOC name; S2 tombstone; RPP; rule-of-three 15 %; "647"; known-limit number; S3 baseline; S5 adjudicator; census age; infra 60 s; G-EXC-LIT count; budget formula; M-15 fourth exception; M-36 vs sliced captures; STAND_SET row; P-1 zone flag; code_refs path; keyer-B data boundary; census vs G-DRIFT (xread, DS) | valid | folded as stated in Specs 68/69 and above |
| M-15 "88.8 % correction is wrong" (DS-69) | **refuted** *(computed)* | 305,143 / 343,652 = 88.8 % when the sentinel is in both numerator and denominator; the note now says so |
| Promote the dated notes to new ids (DS-69) | **rejected** | Spec 124's appended-note convention; the Rule column of M-34 was itself updated |
| `evaluated_by_us` double-keyed though single-valued (xread N-4) | **not applied** | the operator named it in B4; kept ⧉ |
| Heuristic stratum in the expert audit (DS-69); out-of-scope stratum | **rejected** | M-29 strata are ratified; heuristics are not by-law readings and the operator confirms the list at S9 |
| `relevance` should be ⧉ (DS-plan) | resolved otherwise | rule 3 now reads `ranks_layers[]`, so `relevance` is not load-bearing for precedence |
| Scope the pre-commit hook to by-law paths (DS-69) | **rejected** | M-32 is ratified; the H-lane fix is a one-line `code_refs` edit in the same commit (M-32 note) |
| `not_yet_in_force` status (DS-69); in-force trigger resolver (DS-68) | deferred | `not_verified` is accurate until R-10; status never changes Phase 1 candidacy |
| AST allow-list instead of grep; container for keyer B; machine-readable rulings index file (DS) | deferred | the grep + TZ test and the `git ls-tree` witness are the M-0-sized answers; revisit at S8 |
| E1 blast radius / ZV severities (DS-69) | out of scope | owned by the E1 WF3 and Specs 58/65 |

## Operator decisions and open questions
**RATIFIED 2026-10-06:** the ten v0.3 decisions (M-1, M-31, M-32, M-2, M-20, M-14, M-11, M-33, M-29, M-17); the faceted model and probe changes (M-30, M-15, M-34, M-35, M-40, M-41); M-0, M-22, M-25, M-36; **by approving the v0.5 package:** M-42 (R-ZV), M-43, M-44, M-45, M-46 and the v0.5 notes on M-15, M-17 (incl. the ⧉-set re-confirmation), M-20, M-25 (E1 carve-out), M-30, M-32, M-33, M-34.

**RATIFIED 2026-10-06 (second ratification, "yes to 1–4"):** M-21, M-26, M-27, M-28, M-37 (with the M-36 correction it carries), M-38, M-39 — so M-29 and M-36 are operative; the M-37 page rules as listed; `ranks_layers[]` added to the ⧉ set (M-17 dated note). S1's ratification is therefore already given; S1 only records it.

**RATIFIED 2026-10-07 (S1):** M-47..M-51 and the dated notes on M-17, M-36, M-44 (S0.5 rulings a–f).

**Open (Spec 69 §4 is authoritative):**
3. Overlay geometry and former-by-law lands from the City GIS layers (Phase 2) — direction agreed; the source is confirmed by R-10/R-11.
4. SC-3 floor (from S0.5) and SC-5 target (Phase 2 plan) — timing agreed; values not yet measured. *2026-10-07:* S0.5 gave rates but no floor; the floor is set at A1.
5. F-1 narrow WF3 now, despite the hold? (operator's call).
6. Send the expert inquiry now.

