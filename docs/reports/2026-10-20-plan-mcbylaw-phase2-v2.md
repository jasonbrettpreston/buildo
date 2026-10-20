# Active Task: McBylaw Phase 2: our fields, user inputs as scenarios, Ch.900 exceptions and the resolution layer (Layer 2)
**Status:** Planning. **v2 DRAFT — locks after the K7 re-run (after Phase 1 A1).** It does not lock before three things: the Phase 2 entry block (§K, E-1..E-6) has landed; gate **P2-0** (the K7-R re-run = validation round 0) has passed; and a second seat has re-executed P2-0's numbers against the same pinned `table_version` (the "double check", Q2 answered in §K.4).
**Supersedes:** `.cursor/mcbylaw/phase2-plan-DRAFT.md` (kept unchanged). This v2 folds `phase2-check/MATRIX.md` (95 rows, 8 HIGH), `phase2-check/REDTEAM.md` (34 attacks, 15 silent), today's landings, the in-flight lanes, the CoA spike and the authorized `load_coa_notices` plan (Spec 129), `phase3-prework/coa-analysis.md`, and the Phase 3 scenario scan. Every finding and every attack has a disposition in **§FR (fold record)**. **§XR** is the Cross-read Adversary pass on this v2.
**Workflow:** WF1 (Genesis). Two new pipeline steps, four new tables, a new owner spec (Spec 72), new generator arms.
**Domain Mode:** **Backend/Pipeline** (`scripts/CLAUDE.md`) for everything except P2-11. P2-11 (trace display) is **Cross-Domain** (`.claude/domain-crossdomain.md`), because the Expo app consumes its API route.
**Drafted:** 2026-10-07 (v2), read-only. No commit. DB: none touched by this drafter (the recounts in §RX read the trial's committed-to-disk extract).
**Governing principle:** Spec 69 M-0 (simplicity). Each step names the mistake it prevents, and each change says what it replaces.

**Evidence tags:** **[measured]** a script run produced it, source named. **[re-executed v2]** re-run by this drafter on 2026-10-07, logged in §RX. **[read]** file text read. **[inferred]** a judgment, not executed. **[from MATRIX/REDTEAM]** executed by that seat and not re-run here; nothing the lock depends on rests on such a tag alone (P2-0 re-measures it).
**State tags used in the register (§A):** **ENFORCED** gate in code at HEAD `9027972f` and its test green · **LANDED** same, landed today · **IN FLIGHT `<branch>`** built in a lane, uncommitted · **PLANNED** new in this plan · **DECLARED-ONLY** prose, no gate (labelled).

---

## Context
* **Goal.** Phase 2 has two halves.
  * **Layer 1 completion.** Ch.900 exception rows (two waves, every exception covering ≥ 100 INCLUDE-closed residential lots), plus the 206-2026 / 650-2026 lands. Extend `dsl_target`; re-key the NF/EF fields to `regulation_id`.
  * **Layer 2, the resolution layer** (Spec 69 M-53). A converted step that runs `effective()` per resolution cell × target × structure, **for every scenario class the law distinguishes** (§S: scenarios are Layer 2 inputs, system-enumerated, no user choice). It records candidates, the winner, why each loser lost, a closed status and reason, the evidence (clause or absence), and the inputs read. Storage is **b2** (operator-locked), with scenario-class results carried inside the row (§S.3). It writes an L2-CHANGE report and re-resolves incrementally by changed unit.
  * The Layer 2 step's data dependencies (address → parcel, street abutment, overlay geometry), the CoA harness (SC-5, now fed by `load_coa_notices`, Spec 129), and a read-only trace for operators and users.
  * **Live outputs do not change until Phase 3** (Spec 69 M-25). Layer 2 has no numeric consumer in Phase 2.
* **Target Spec:** Spec 68 §11 (Phase 2 row) and Spec 69: M-15, M-17, M-25, M-29, M-41, M-42, M-50, M-52, M-53, M-54 (+ absence note), **M-55** (provincial, + `limits_bylaw` note; *the draft's "in-flight provincial row / F-B" is resolved: `e3ab3bd9` renumbered it to M-55*), M-56, M-57, and **M-60 (PROPOSED, in flight, hardening)**. Specs 122/124 (step standard), Spec 79 (validation), Spec 129 (`load_coa_notices`, oracle C source; plan authorized 2026-10-07). New owner spec **Spec 72 "McBylaw resolution steps"** (72 is free and earmarked by the Spec 129 plan for this purpose *[re-executed v2: no `72_*` in docs/specs]*).
* **Ground truth (read for v2):**
  * `.cursor/mcbylaw/phase2-check/{MATRIX,REDTEAM}.md` (+ `redteam/`, `deepseek/`)
  * `.cursor/mcbylaw/phase2-trial/TRIAL-REPORT.md`, `.cursor/mcbylaw/phase2-panel/*`
  * `.cursor/mcbylaw/coa-spike/REPORT.md` + `measure.json`; `.cursor/wf1_load_coa_notices_active_task.md` (authorized, Implementation)
  * `.cursor/mcbylaw/phase3-prework/{scenario-scan,coa-analysis,field-inventory}.md`; `.cursor/mcbylaw/phase3-check/MATRIX.md` (storage + structure findings that bind Phase 2)
  * `.cursor/QUEUE.md` TODAY 2026-10-07 (rulings: R zones only; 600.10/.50 retired; Ch.500 empty; 206/650 captured now, rows in Phase 2; storage b2; coverage-null = `unregulated`; K7 → re-run after A1 + ≈ 30 keyed wave-1 exceptions; `unregulated` + `au`; Phase 3 approach approved: closed scenario catalogue, every scenario computed, no user choice)
  * git log `wf2/deep-scrapes-restore-l0` to `9027972f` (§RX E-1)
* **Key Files:** in full under Technical Implementation and the register (§A). New:
  * `scripts/load-bylaw-provisions.{js,descriptor.json}` + `scripts/lib/compute/load-bylaw-provisions.js`
  * `scripts/resolve-bylaws.{js,descriptor.json}` + `scripts/lib/compute/resolve-bylaws.js`
  * migration `<NNN>_bylaw_layers.sql` — **number assigned at landing; 252 is claimed by `load_coa_notices`** *[read, wf1_load_coa_notices_active_task.md:16; re-executed v2: migrations tip = 251]*
  * `scripts/seeds/bylaw/{field-map.json,cell-key.json,layer2-map.json,maps/,exception-audit/}`
  * `scripts/seeds/bylaw/validation/{prereg-<n>.json,rounds/<n>.json,disagreements.json,regression-pool.json,root-cause-kinds.json}`
  * `scripts/analysis/bylaw/oracle-b/` (**built, uncommitted**, lane `wf1/mcbylaw-oracleb`), `scripts/analysis/bylaw/validate-round.mjs`
  * `src/tests/resolve-bylaws.*.test.ts`, `src/tests/load-bylaw-provisions.*.test.ts`, the trace route and views (P2-11)
* **Execution Provider:** `deepseek` for mechanical module and test bodies and as **keyer B** of every exception brief (`node scripts/deepseek-exec.js --brief <file> --provider=deepseek --max-iterations 40`); small briefs with a directory-anchored `write_scope`.
  * **Downgraded to `claude`, logged reasons:** keyer A (independence); migrations (CLAUDE.md rule 11); captures, cohorts, chain runs (H lane); P2-0 and every verification or grounder seat; address-match and CoA-link precision sampling (verification); CoA ground-truth adjudication (operator); landings and registry-reserved files (`LARGE_TABLES` edit, logic variables, Spec 69 ids).
  * **Oracle B's author must differ from keyer B's engine** (MATRIX H8). Keyer B = DeepSeek ⇒ oracle B = a Claude seat with no access to keyer-A drafts; the residual correlation with keyer A (same family) is disclosed on the ACCURATE line. The built lane's author is recorded in its `.prov` before landing (Q17).
  * Engine `run_id`s are recorded per step and in each shard's `.prov.json`.

## Technical Implementation
* **New/Modified Components:**
  * **Generator (Layer 1, offline):** arms added to existing gates (§A rows L1–L14) and the planned **G-EXC-LIT**. No other new McBylaw gate; Layer 2 checks live on the step (Spec 124 Rule 13 — "a step validates itself"; the scorecard floor is gate F ≥ 14/17).
  * **`load_bylaw_provisions`:** one-way load of the committed `docs/reference/bylaw-provisions.json` (produced by Phase 1 S7/S8 — **in flight `wf1/mcbylaw-s7`**, absent at HEAD *[re-executed v2]*) into `bylaw_regulations` + `bylaw_units`. Archetype INGESTOR; provisional until PH-0 re-derives it (R-AO).
  * **`resolve_bylaws`:** Layer 2. Archetype ENRICHER (provisional, R-AO). Writes only its own two tables, never `parcels`. Three phases:
    * **(1) inputs:** one narrow scan of `parcels` builds the lot vector + `inputs_hash`, with named-lot matches, street abutment, map membership and the lot gates (§A.2 D7) joined in.
    * **(2) cells:** `effective()` / `permitted()` once per cell × target × structure × **scenario class** (§S), with the per-cell **exception-closure authorship gate** applied *before* the evaluator (I4).
    * **(3) apply + write:** per-lot application of formula winners that read measured inputs; then the link rows. The prior state of every touched row is snapshotted first (L2-CHANGE needs it, D4). Writes are `IS DISTINCT FROM` upserts over the **result columns only** (§A.2 D3) behind an anti-join prefilter, plus a **reset arm** that deletes link rows leaving the population (R-AY).
  * **L2-CHANGE:** computed from the snapshot and the new rows inside the same transaction, written before commit; scope comes only from the G-CHANGE record (R-STALE, §A.2 D4).
  * **Trace read path (P2-11):** an admin route plus the parcel-lookup payload extension. Read-only; numbers untouched.
* **Data Hooks/Libs:**
  * `scripts/analysis/bylaw/evaluate.mjs` (production evaluator, imported, never forked) **as hardened by M-60** (in flight `wf1/mcbylaw-harden`, staged in the main tree at drafting time *[re-executed v2: byte-identical]*): absence closure rule, provincial `limits_bylaw`/`scope`, declared total order, `inputs[]` incl. condition reads, threshold-token validation, undecided-applicability enumeration. Plus a pre-parse/compile cache per unit.
  * `scripts/lib/step/*` (runner, verdict, plausibility). `buildDistributionQuery` is made generic beyond `FROM parcels` (Integration F5). `invariants[]` are SQL-only (`plausibility.js:124`), so the Layer 2 checks that need JS (I12, I6 live reconciliation is SQL and stays there) are **compute-dispatched checks** with their own budget variables (§A.2).
  * `scripts/lib/sql-witness/*` (#44): the UNION-arm blind spot (draft F-D) is **fixed and landed** (`0fa2e169`, merged `f2c37f0c`). Layer 2 SQL may use set operations.
* **Database Impact: YES.** One migration, four new tables, **no `parcels` column** (K6: never rewrite 6.7 KB parcel rows over a 3.9 GB heap *[from panel data-measured §1.5]*):
  * `bylaw_regulations` (PK `regulation_id`; `table_version`, `adoption_id` as separate columns)
  * `bylaw_units` (PK `unit_id`; generated fields only; `row_status` carried)
  * `bylaw_resolution_cells` (PK `cell_id, target, structure`; scenario-class results inside the row as `by_class` jsonb with `collapsed_into`; CHECK-constrained closed columns). Size: **re-measured at P2-0** (the trial measured 625,992 rows / 380 MB at S = 1; the 3-structure projection is 1.03 GB with a 1.84 GB risk *[from TRIAL-REPORT:56, cited by phase3-check MATRIX E2]*; scenario classes add bytes on ≈ 1/3 of targets *[inferred, scenario-scan §5.3]*).
  * `bylaw_resolution_lots` (PK `parcel_id`; ≈ 440 K rows, 55 MB with 3 indexes *[measured, trial]*)
  * **Update strategy for the 440 K-row table:** created empty, filled by one INSERT … SELECT from the narrow scan, never an UPDATE of `parcels`. Later runs touch only rows whose `inputs_hash`, `cell_id` or result columns changed (anti-join prefilter, then `IS DISTINCT FROM`); rows leaving the population are deleted by the reset arm and counted.
  * Indexes are created on the empty tables in the same migration. **Correction (MATRIX D1):** `validate-migration.js` does not see new tables (its CONCURRENTLY rule is the fixed list `LARGE_TABLES`, `validate-migration.js:33` *[re-executed v2]*). At landing the orchestrator **adds `bylaw_resolution_cells` and `bylaw_resolution_lots` to `LARGE_TABLES`**, so every later migration on them must be CONCURRENTLY.
  * `chain_run_id` is **nullable** (Spec 124 R-U: "`null` when a step runs standalone" *[re-executed v2, 124:220]*).
  * DOWN = drop the four tables. **Disk on Supabase cannot shrink** *[read, batch2_c5:340]*; the budget is declared before cutover (P2-8).

## Standards Compliance
* **Try-Catch Boundary:** the steps follow the runner contract: rows written and checks run on the same PoolClient (Spec 122 §7.2); verdict computed from rows. A FAIL rolls back the step transaction (rows, L2-CHANGE, run row) — nothing partial survives; the run row is written last, so a crash leaves the previous complete run as the skip baseline. P2-11 routes: overarching try/catch with `logError(tag, err, context)`; the admin route calls `verifyAdminAuth(request)` first (401 on null, `admin/app-health/route.ts` pattern *[read]*); `{ data, error, meta }` envelope.
* **Unhappy Path Tests:** one known-bad fixture per new reason code / check, plus a good twin; red evidence via `red-evidence.mjs`. Load-bearing ones:
  * an excepted lot whose exception **or any exception in its INCLUDE closure** is unauthored never takes a winner (I4) — including targets the evaluator would still resolve from base (A14, executed: side setback 0.9 from base on an unauthored exception, HEAD and hardened alike *[re-executed v2]*)
  * a sentinel (−1) lot never resolves from the exception layer; `label_exception_mismatch` fires when exactly one side is present (the real 80) or xN ≠ number (0 today) (I5)
  * an ambiguous lot (flag true **or NULL**) never gets a winner
  * a missing input is never defaulted (I10, column `inputs_defaulted`)
  * a changed lot outside the L2-CHANGE scope → FAIL; null perturbation → 0 moved lots
  * an orphan `cell_id` or a candidate unit id absent from `bylaw_units` → FAIL (I9)
  * lot-level vs cell-level disagreement on the rotating sample → FAIL (I12)
  * `row_sha` recomputed ≠ stored (a direct DB edit) → FAIL (I14)
  * an absence result whose `evidence.ruling` is not in `absence-rulings.json` → FAIL (I2)
  * a reason string emitted by the evaluator but absent from `NOT_EVALUATED_CODES` → FAIL (R-EMIT)
  * parcels changed, L1 unchanged → not skipped (R-SKIP)
  * a parcel leaving the population → its link row deleted and counted (R-AY reset arm)
  * a by-law id, exception number or parcel id literal in compute → G-EXC-LIT FAIL
  * the loaded DB rows ≠ the JSON content hash → FAIL
  * an INCLUDE cycle in Ch.900; a numbering gap not proven by anchors → FAIL (landed G-TEXT `numbering_gap_unproven`)
  * a duplicate Spec 69 id → G-PROV `ruling_duplicate` FAIL (landed `c89f35bc`)
  * API: 400 (bad parcel id), **401 (admin auth null)**, 404 (no link row), 500 (DB error, logged).
* **logError Mandate:** every new catch in `src/` uses `logError`. Step code follows the runner (no empty catch, no `process.exit()`).
* **UI Layout:** admin = desktop-first `md:`. Expo = mobile-first, touch targets ≥ 44 px, 375 px viewport test.
* **§11 checklist items that apply:** DB (UP/DOWN, backfill strategy above, `factories.ts`, `db:generate` → `typecheck`, SQLFluff, `validate-migration.js`, parameterized SQL, the `LARGE_TABLES` registration) · API (types in `src/lib/bylaw/types.ts`, envelope, try-catch, unhappy paths incl. 401, admin guard, projected fields) · UI (375 px, escaping) · Pipeline SDK (the converted `pipeline.step()` runner) · Cross-Layer Contracts (every threshold — budgets, ceilings, the population predicate, the scenario-class cap — lives in `logic_variables` / `_contracts.json` with a `contracts.infra.test.ts` row; `on_invalid: fail` for every verdict- or write-affecting one, Rule 3, enforced by gate B `on-invalid.mjs`) · Pre-Review Self-Checklist.

## Spec 122 / 124 compliance (standing rule, operator 2026-10-06)
**Five-word baseline:** new steps have none; each is measured at its ① commit. No existing step is edited (`enrich_parcels`, `load_zoning`, `enrich_centreline` are read-only upstreams, read through declared `staleness.pins`). Every commit re-measures the five words.

| Rule | How Phase 2 meets it | Evidence class |
|---|---|---|
| R-BA (five words, closed sets) | `step-validate --step=<slug>` gates A–K from ① (hard stop, no ledger rows). Content stays on the Spec 68 five lines. | PLANNED; mechanism ENFORCED fleet-wide |
| R-BF (declared == observed) — *the rule's own status is NOT MET (Spec 122 §6.6.1); Phase 2 applies its three witnesses separately* | (a) #44 executed-SQL witness on every capture (set-op arms now resolved, `0fa2e169`); (b) `content_hash_equal` on the load; (c) I12 lot-vs-cell equivalence on the resolve. Three witnesses, three ids. | PLANNED |
| Rule 1 + Rule 3 (nothing only in code; `on_invalid: fail`) | Ceilings, budgets, population predicate, scenario-class cap, sample seeds are logic variables / seeds, each `on_invalid: fail` (gate B catches a non-`fail` at ①). | PLANNED; gate B ENFORCED |
| Rule 6 (every descriptor category answered; `"none"` written) | **Re-mapped (MATRIX MX-3):** every descriptor category of both steps is present and answered, `"none"` written where empty (AJV `required` at ①). The row-status obligation formerly cited here is I3 (closed reason on every non-value row). | PLANNED |
| Rule 10 (verdict from rows) | Runner-derived verdict; no McBylaw-specific verdict code (`checkVerdictSingleSource`). | PLANNED |
| Rule 12 (recovery posture) | `recovery.interrupted: "none"`, `before_image: "none"` — one step-scoped transaction; the reset arm deletes only rows outside the declared population, inside that transaction. | PLANNED |
| Rule 13 (a step validates itself) | **Re-cited (MX-4):** gate F scorecard ≥ 14/17 is named in the P2-8 lock. Layer 2 invariants are descriptor `invariants[]` (SQL) or compute-dispatched `checks[]` (JS) — never generator gates. | PLANNED |
| R-P (pre checks) | ≥ 1 `checks[].when: "pre"` (the R-SKIP predicate), because the gated-skip path exists. | PLANNED |
| R-U (chain_run_id) | Stamped by the runner; **nullable** standalone; **outside** the `IS DISTINCT FROM` column list. | PLANNED |
| R-Q | FAIL and WARN counters split. | PLANNED |
| R-AS (forced-change cohort) | **The rule presumes a legacy step; these steps are new (MX-6).** Proposed adaptation, needs a ruling row (Q20): (i) forced-change cohort = one perturbed unit, moved set == L2-CHANGE scope; (ii) **negative control** = a declared cell set whose candidates hold no perturbed unit, byte-equal before/after; (iii) idempotency = a forced full run on unchanged content writes 0 rows (possible because `table_version` is no longer in the guard, D3). | PLANNED + HOLD (Q20) |
| R-BK / R-BM | `write_inventory.by_mode` {full, incremental}. A skip is a run row with `records_meta.skipped = true` and the predicate values, never a 0-row incremental (MX-7). Any `full_rescan` invalidation carries evidence. | PLANNED |
| R-BL | `staleness.pins[]` on the `load_zoning` / `enrich_parcels` / `enrich_centreline` stamps and on `load_bylaw_provisions.table_version`; the same pins are the R-SKIP predicate (A26). | PLANNED |
| R-BQ / R-BR | Captures ledger-recorded `captured`. Gate G per-target written counts via `count_path` (declared `int` in `emits[]`). | PLANNED |
| R-AY (population + reset arm) | **Fixed (MATRIX H5):** population = logic variable `bylaw_l2_population_zone_classes` (registered list, default R/RD/RS/RT/RM; operator "R zones only") — never a literal; **reset arm** deletes link rows for parcels that leave it (rezoned, merged, split, retired) and counts them; fixture both directions. | PLANNED |
| R-AJ | `execution.budget` executed; values from P2-0 measurements. | PLANNED |
| R-AF / R-BE / R-BB | Spec 72 classifies both scripts; Target Files generated; owner-spec diff is a cutover gate. | PLANNED |
| R-PACE-1 / R-AH | ENRICHER (6 converted) and INGESTOR (9) are proven archetypes *[from MATRIX, `template-freeze.json`]*; the compressed 3-commit form is the default. Caveat: the compressed form assumes a legacy conversion — the R-AS adaptation (Q20) covers the difference. | PLANNED |
| R-AQ.1 | No cloud dispatch until the sources conversions are complete. An operator ruling with no mechanical gate (DECLARED-ONLY, labelled). | ratified, DECLARED-ONLY |
| Spec 79 | **Corrected (MX-11):** `resolve_bylaws` is a Spec 79 §10 **"Calculation step"**; joining the §11 calc-step list is a Spec 79 edit in P2-1. "Silent-quiet profile" was panel vocabulary, not a Spec 79 class: the designed-quiet populations are WARN rows with declared ceilings (R-H). | PLANNED |

---

## K. The K7 circular ordering — resolved (MATRIX H4)
**The cycle as found.** The plan locks on P2-0. P2-0 needs ≈ 30 keyed wave-1 exceptions. Keying them needed the Ch.900 pin, the slicer arms (P2-2) and double-keying with G-AGREE (P2-5) — all post-lock steps. So the lock waited on work that waited on the lock.

**What changed today (re-executed v2):** the slicer arms (S4 rework, `8e0f93e2`: `cell_set_mismatch`, `inline_split_undeclared`, `numbering_gap_unproven`, `unstatused_variant`) and the double-keying gates (S6g, `c89f35bc`: G-AGREE, G-CLAUSE, G-XREF incl. generated `include_ref`, G-SHAPE `row_status`, G-PROV keyer + `git ls-tree` witness) are landed. The Ch.900 pages are listed in `page-set.json` as "pinned at Phase 2 entry (M-15 v0.5 note)". So keying 30 exceptions needs **no Phase 2 code at all** — only Phase 1 doors.

**Resolution: the 30 are keyed in a pre-lock *Phase 2 entry block* that uses only Phase 1 doors and landed gates. Nothing in it is a post-lock step.**

### K.1 Entry block E (pre-lock; each item lands before P2-0 runs)
| # | Item | Door / branch | State |
|---|---|---|---|
| E-1 | Phase 1 S7/S8: renderer, `--check` (G-DRIFT), `docs/reference/bylaw-provisions.json`, the unconditional pre-commit `--check` line (closes RT-A1/A2) | `wf1/mcbylaw-s7` | IN FLIGHT |
| E-2 | Phase 1 **A1**: RD/RS/RT/RM + 10.5 envelope rows double-keyed and adjudicated; the ⧉ set re-measured (M-17 note c) | Phase 1 plan | NOT STARTED |
| E-3 | Evaluator hardening (M-60): absence closure rule, provincial direction/scope, determinism, `inputs[]`, threshold tokens | `wf1/mcbylaw-harden` (staged in main tree) | IN FLIGHT; M-60 ratification owed (Q21) |
| E-4 | Pin `ch900_2..6` through the existing `--refresh` / `--adopt` door (windowed reads); slice with the landed S4-rework slicer; G-TEXT, G-PROV, G-UNIVERSE green | Phase 1 doors; M-15 note authorizes "at Phase 2 entry" | NOT STARTED; **operator y/n (Q-K7a)** |
| E-5 | Key **exactly the top 30 exceptions by INCLUDE-closed residential lots** (deterministic from `census.json` + the slice's generated `include_ref` edges) through the A1 process: generated briefs, keyer A (Claude) sealed first, keyer B (DeepSeek, worktree without `.a`, `ls-tree` witnessed), G-AGREE / G-SHAPE / G-CLAUSE / G-XREF / G-PROV keyer arm, operator adjudication | Phase 1 A1 process | NOT STARTED; **operator y/n (Q-K7a)** |
| E-6 | P2-0a: oracle B + `validate-round.mjs` + prereg/record schemas + infra lock; R-DET lock extended to `oracle-b/` first | `wf1/mcbylaw-oracleb` (built, uncommitted) | IN FLIGHT; landing y/n (Q17) |

**Status of the 30 after E-5:** `double_keyed + adjudicated`, **`audit: not_run`** (G-AUDIT is unbuilt — Phase 1 S14). They become **wave-1 shard 0** in P2-5 and are never re-keyed; all 30 are forced into the P2-6 second-bar audit population. P2-0 therefore validates **expressibility and storage**, not correctness of those 30; correctness waits on D (expert) and C (CoA).
**INCLUDE closure:** where a top-30 exception INCLUDEs one outside the 30, that included exception is unauthored, so its lots count as K7-R class (i) `exception_not_authored:<id>` (the hardened evaluator's code + the I4 gate). This is printed, not hidden.
**Order:** E-1 → E-2 → E-3 → E-4 → E-5 → E-6 → P2-0 → (pass) → lock → P2-1. E-1/E-3/E-6 can land in parallel (one committer serialises the landings).

### K.2 K7-R (folds MATRIX Q1 amendments a–d)
* **(a) Split by closed codes, not prose.** Class (i) planned-unkeyed = `exception_not_authored:*` (now a real evaluator code under M-60) **plus** the Layer 2 lot gate `exception_closure_unauthored` (I4 fires before the evaluator, so on gated lots the code never appears; §XR X-14) **plus** `not_modelled:target_not_keyed` **only** where a named plan step keys that (zone, target) pair. Everything else unavailable = class (ii) structural (missing data dependency, input, grammar form, map). The mapping is a committed file `validation/prereg-0.json` `k7r_class_map` over `NOT_EVALUATED_CODES` (`evaluate.mjs`) ∪ the L13 lot gates — total, both directions, locked.
* **(b) Kill on (ii) both item-weighted and lot-weighted:** (ii) > 5 % either way, or (i) + (ii) > 20 % within the keyed scope (wave 0 + the 30).
* **(c) Structural probe outside the 30:** a seeded sample of 10 exceptions from wave-1 ranks 31–220 (seed in prereg-0), each read only far enough to classify every clause as expressible or not in the current grammar. Grammar gaps concentrate in rare forms; the top-30-by-lots scope would hide them. Kill: any clause class with no grammar form ⇒ a named grammar extension in P2-4 before wave 1, not a kill of the plan.
* **(d) Disclosure:** the 5 % line was chosen **after** the trial's 0.34 % baseline (352 / 102,960) *[from MATRIX §5]*. prereg-0 labels it `post_hoc: true` and the report prints the original single K7 (> 20 % of all items) beside K7-R.

### K.3 What P2-0 re-measures (all numbers the lock depends on)
(a) b2 cells and bytes/row at TS = targets × {principal, suite, ancillary} **with scenario classes inside the row** (§S.3), against K5; (b) ms/lot and ms/cell with the **hardened** evaluator (M-60(f) enumerates up to 8 undecided units per result — its cost is unmeasured); (c) I12 equivalence with the hardened `inputs[]` ∪ static closure key (the trial's 602-lot static miss must be 0); (d) WAL of a no-change run with the anti-join prefilter and `table_version` out of the guard (trial: 194 MB without the prefilter); (e) the evaluable share per target; (f) the K7-R splits, item- and lot-weighted; (g) every count cited in this plan's invariants (I1, I5, I6, I7 bases), regenerated by the script cited beside it (R-FACTS).

### K.4 The double check (Q2, answered)
The double check on the **plan** is done: MATRIX + REDTEAM, folded here. The double check on **P2-0** is a second Claude seat that re-executes every K7-R number from the scripts against the **same pinned `table_version`, `evaluator_version`, prereg-0 sha and DB counts** recorded in round record 0; any difference > 0 on a deterministic number fails the round. It is not the A1 keyer re-measure.

---

## A. The register: every artifact and step, its closed answer set (with its file), gate, state and five-word mapping
Words: **S**tandardized, **O**bservable, **A**ccurate, **U**nderstandable, **Sc**alable. "Closed set → file" names the committed file that holds the set; a set marked PLANNED names the file this plan creates.

### A.1 Layer 1 (offline generator; Spec 68 five lines)
| # | Artifact | Closed set → file | Gate | State | Drift-proof by | Words |
|---|---|---|---|---|---|---|
| L1a | Ch.900 pages `ch900_2..6` | `scripts/seeds/bylaw/page-set.json` (entries present, ruling M-15); `manifest.json` (only `ch900_1` today) | G-PROV page-sha, G-UNIVERSE TOC | ENFORCED (mechanism); pin = E-4 | sha-pinned; changes only via `--refresh`/`--adopt` | O, Sc |
| L1b | 206-2026 / 650-2026 / 1075-2026 enacting text | `scripts/seeds/bylaw/enacting/manifest.json` (all three captured) | G-UNIVERSE enacting arm | LANDED (S4 rework, M-57 R5) | sha-pinned | O |
| L1c | Enacted-not-consolidated list | `scripts/seeds/bylaw/unconsolidated.json`; codes `unconsolidated_missing · unconsolidated_invalid · unconsolidated_uncaptured` (`unconsolidated.mjs`) | G-UNIVERSE unconsolidated arm | **LANDED** (closes RT-A10; the 875-tag count stays as backstop) | url + sha + fetch time recorded per refresh | O, Sc |
| L1d | Windowed reads, never truncated | — | none | DECLARED-ONLY (labelled; Spec 68 §12 edge case) | — | Sc |
| L2a | Slices, numbering sequence | G-TEXT reason codes (`slice.mjs`, `standardized.mjs`) | G-TEXT | ENFORCED | generated (G-DRIFT from E-1) | S |
| L2b | R1–R4: HTML cells, tables as units, gap FAILS unless anchors prove absence, repeats never merged | `cell_set_mismatch · inline_split_undeclared · numbering_gap_unproven · unstatused_variant` | G-TEXT arms | **LANDED** (`8e0f93e2`, M-57) | both directions | S |
| L2c | Unit pin → `pending:stale` | `change.mjs` stale-unit arm | G-CHANGE | **mechanism ENFORCED in a fixture test only; UNWIRED** (RT-A9: `adopt()` records no per-unit shas; no caller of `staleUnits`/`changeRecord` outside `change.mjs` *[re-executed v2]*) | **R-STALE (P2-8 ① prerequisite):** `adopt()` records per-unit shas; every authored unit carries `verified_against_sha256`; `--check` FAILs a changed unit whose pin is not `pending:stale` | A, O |
| L3a | Census | `census.json` + `census.sql` (blob sha) | G-UNIVERSE census | ENFORCED | witness-checked SQL | Sc |
| L3b | Membership + wave | **`wave ∈ {0, 1, 2, tail}` + separate field `lands ∈ {none, 206-2026, 650-2026}`** (MX-L3b; wave 0 = the E-5 30). File: `scripts/seeds/bylaw/exception-audit/waves.json` (PLANNED) | G-UNIVERSE membership (≥ 100 INCLUDE-closed) + INCLUDE anti-vacuity | PLANNED | **R-CENSUS (RT-A4b):** `census.json` carries a content hash of its row set + DB snapshot id; `--accept` re-derives wave membership read-only and FAILs on a mismatch | Sc |
| L3c | `--accept --ruling` pin; duplicate Spec 69 ids | `parseRulings` statuses; `ruling_duplicate` (`keyer-prov.mjs`) | G-PROV ruling-id arm | **LANDED** (`c89f35bc`) | ids allocated by the orchestrator at landing (reserved today: M-58 S7/S8, M-59 S6g, M-60 hardening *[read, memory resume 2026-10-07]*) | S |
| L4a | G-AGREE | `agree.mjs` REASON_CODES | G-AGREE | **LANDED** (`c89f35bc`; s6g tests green *[re-executed v2]*) | `.a` sealed before `.b` | A |
| L4b | G-SHAPE schema + `row_status` (a)–(e) | `shape.mjs` REASON_CODES; `vocab.json` `row_status` | G-SHAPE | **LANDED** | off-vocab FAIL | S |
| L4c | G-PROV keyer arm, `git ls-tree` witness | `keyer-prov.mjs` REASON_CODES | G-PROV | **LANDED** | brief sha in `.prov` | O |
| L4d | Generated briefs | Spec 68 §10 stage 5 | — | PLANNED (A1 builds it; E-2) | brief sha in `.prov` | A |
| L5a | `dsl_target`, `lot_condition`, `uses`, `requirement` extensions | `vocab.json` (`version`) | G-SHAPE; feeds totality | ENFORCED (mechanism) | versioned vocab | S |
| L5b | "Additions only by a ratified row" | `vocab.json` `$changes[]` (PLANNED) citing a RATIFIED Spec 69 id | **New arm on G-PROV's ruling arm:** a `version` bump without a `$changes[]` row citing a RATIFIED id FAILs (MX-L5b) | PLANNED | — | S |
| L5c | Threshold tokens | `vocab.json` `lot_condition.*.threshold` + declared `reads` | `checkThresholdTokens` (M-60(e)) | IN FLIGHT `wf1/mcbylaw-harden` (closes RT-A18) | both directions vs units | S |
| L6a | Expressions evaluate | `DSL_ERROR_CODES` (`dsl.mjs`) | G-EVAL (a) | ENFORCED | every `--check` (from E-1) | A |
| L6b | Literals in the cited clause | `clause.mjs` REASON_CODES | G-CLAUSE | **LANDED** | anti-vacuity | A |
| L6c | Row-resolving `include_ref` / `displaces[]` | `xref.mjs` REASON_CODES | G-XREF (generated refs, acyclic, trigger anti-vacuity) | **LANDED**; Phase 2 adds the arm "an in-scope `include_ref` resolves to a **row**, never a `phase2_exception` ref" (PLANNED) | generated from the slice API | A |
| L7 | Exception eval vectors | `vocab.json` `vector_status` | G-EVAL (b) | ENFORCED (mechanism); new sources: CoA-required values (`coa_notice_variances`, Spec 129) and keyed exceptions, each with a clause anchor. **Add rule-4a vectors** (RT-A7: the vector set did not move when 4a was reversed) | a transcribed value is an `eval_vector` adjudication | A |
| L8 | No per-exception / per-lot code | — | **G-EXC-LIT** (PLANNED): regex for `\d{3}\.\d+\.\d+\(\d+\)`-shaped ids, exception numbers in executable position, and parcel-id literals, over `scripts/lib/compute/**`, `scripts/analysis/bylaw/**` (non-fixture, recursive), `src/**`. **Gate E does not cover this** (numeric constants only, `scripts/lib/compute/**` only — MX-L8) | PLANNED | pre-commit | Sc, S |
| L9 | Exception expert audit (second bar) | `agree · disagree` | **G-AUDIT — unbuilt** (Phase 1 S14). The second bar is a second committed bar file under it | **PLANNED; blocks P2-6 and Phase 3 entry (D)** | bar committed before `--sample` | Sc |
| L10 | `field-map.json` (NF-1..NF-28, EF-1..EF-22 → target) | `kind ∈ {target, derived, heuristic, not_bylaw, retired}` (PLANNED file `scripts/seeds/bylaw/field-map.json`) | G-CODE (v) totality, both directions | PLANNED (G-CODE i/ii/iv ENFORCED) | generated MD view; single-drafted by A + operator review (declared) | A, U |
| L11 | Named-lot refs | address tokens, ≥ 2-word evidence | G-CLAUSE evidence rule | PLANNED (host LANDED) | generated | A |
| L12 | Map seeds `scripts/seeds/bylaw/maps/` | `match_status ∈ {matches_diagram, differs, unverified}` | G-PROV, G-CHANGE; ≠ `modelled` until `matches_diagram` (M-41) | PLANNED | refresh/adopt cycle. *(Audit ids R-10/R-11 are renamed here AUD-R10/AUD-R11 to stop the clash with §F rows, MX-L12.)* | O, A |
| L13 | Layer 2 vocabularies | PLANNED file **`scripts/seeds/bylaw/layer2-map.json`**: the declared **evaluator → Layer 2 mapping** (see below) | **NEW infra lock**, both directions, against `evaluate.mjs` `NOT_EVALUATED_CODES` and the **emitted** strings (R-EMIT) | PLANNED | `evaluator_version` = content hash of `evaluate.mjs` + `dsl.mjs` | S |
| L14 | `cell-key.json` | key = (zn_string, exception, HT/ST/LC overlay values) + lot flags + bands; **dependencies = static closure of every variable, label letter, overlay code and flag token in the conditions and expressions of all candidate units, transitively through referenced targets, ∪ the hardened `inputs[]`** (R-DEP; RT-A25) | G-DRIFT (E-1) + I12 runtime witness | PLANNED; `inputs[]` IN FLIGHT (M-60(d)) | a unit introducing a new input forces re-keying, "all cells" scope | Sc, A |

**L13 mapping (fixes MATRIX H3).** The evaluator's result statuses are `value · not_evaluated · conflict` *[re-executed v2]*; it has no `evaluated`, `not_modelled` or `dropped_by`. Layer 2 does not pretend otherwise: `layer2-map.json` declares, and the lock proves total both directions:
* `resolution_status` = evaluator status **or** a Layer 2 gate: {`value` → `evaluated`, `not_evaluated` → `not_evaluated`, `conflict` → `conflict`} ∪ {lot gate fired → `not_evaluated`, target with no complete unit in scope → `not_modelled`}.
* `value_kind` {number, unlimited, unregulated}; `evidence_kind` {clause, absence, provincial} (the hardened evaluator's `evidence.kind`).
* `lot_gate` {none, no_569_2013_zone, ambiguous_zone, lot_metric_missing, label_exception_mismatch, label_unparsed, exception_closure_unauthored} — **Layer 2 only, never passed to the evaluator.** `ambiguous_zone` lives **only** here (it is not an evaluator code, re-executed); `no_569_2013_zone` is both an evaluator code and a lot gate, so the map binds the two.
* `cell_reason` = `NOT_EVALUATED_CODES` (23 with M-60, incl. `exception_not_authored`) ∪ {`not_modelled:<not_modelled_reason>` from `vocab.json`}. The draft's separate `exception_not_authored:<pending|wave2|tail>` member is dropped: the hardened evaluator emits `exception_not_authored:<id>`, and the wave is joined from `waves.json` (resolves draft F-E without a second set).
* `dropped_by` {rule2_displaced, rule2_arg_displaced, rule3_outranked, rule4_higher_layer, rule4_provincial_restraint, rule4a_less_restrictive, condition_false, order_tiebreak}: the evaluator records losers only as free-text `trace[]`, so **P2-8 adds a structured `losers[]` to `effective()`'s result** (an additive evaluator change, its own red-first fixture per member; Phase 1 owner sign-off at landing). Until it lands, `dropped_by` is `not_recorded` and I2 is WARN for that column only.
* **R-EMIT (RT-A6e):** the lock compares the **returned** reason strings (static extraction of every `ne(` / `NE_RESULT(`-style literal + a runtime wrapper asserting membership) with the list, and every code has a fixture that produces it (6 codes had none: `no_569_2013_zone`, `all_arguments_displaced`, `displaced_argument_not_found`, `condition_unknown`, `named_lots_only`, `target_cycle`).

### A.2 Layer 1 load and Layer 2 steps (pipeline; `step-validate` five words + #44)
| # | Artifact / step | Closed set → file | Gate | State | Drift-proof by | Words |
|---|---|---|---|---|---|---|
| D1 | Migration (4 tables) | CHECK constraints from `layer2-map.json`; NOT NULL on `table_version`, `evaluator_version`; **`chain_run_id` nullable** | `validate-migration.js`, SQLFluff, schema-baseline, `db:generate` + typecheck, #44 column witness; `LARGE_TABLES` registration | PLANNED | UP/DOWN; schema-baseline regenerated | S, A |
| D2 | `load_bylaw_provisions` (INGESTOR) | input = `docs/reference/bylaw-provisions.json` (E-1); **`table_version` = sha256 of the canonical serialization** (sorted keys, LF, no adoption id); `adoption_id` a separate column | Gates A–K + #44. **`content_hash_equal`** (FAIL): rows read back and serialized by the **same** `canonicalRow()` used by the writer, sha256 both sides (no md5/sha mix, MX-D2). Gate G forced-nonzero on a version change | PLANNED | one-way; gate D producer registry; `IS DISTINCT FROM` | O, A |
| D3 | `resolve_bylaws` (ENRICHER) | rows per L13; one link row per in-population parcel; rows = distinct `cell_id` × targets_modelled × structures (MX-I1: "cell" = a distinct `cell_id`) | Gates A–K + #44 + invariants below. **`IS DISTINCT FROM` column list, explicit:** `status, reason, value, value_kind, evidence_kind, evidence_ref, winner_unit_id, winner_layer, candidates, losers, inputs_used, by_class` (cells); `cell_id, inputs_hash, applied_values` (link). **Excluded:** `chain_run_id`, `evaluator_version`, `table_version`, `adoption_id`, timestamps (fixes H6/H7; `computed_under_version` is set only when a row changes) | PLANNED | trace-derived ∪ static key (L14); rotating witness (I12); `row_sha` (I14) | all five |
| D4 | L2-CHANGE (`records_meta.l2_change` + a generated report per version change) | {winner_changed, value_changed, status_transition(from→to)} × target × changed `unit_id` | **`l2_change_in_scope`** (FAIL): moved lots ⊆ lots whose cell's stored candidates held a changed unit **per the G-CHANGE record (R-STALE)**; with no record the run is `not_run` (never incremental). Order: snapshot prior rows → resolve → diff → write rows + report in one transaction | PLANNED | scope computed, never asserted | O, Sc |
| D5 | Trace read path (P2-11) | response typed in `src/lib/bylaw/types.ts`, generated from `layer2-map.json` | route tests 400/401/404/500; consumer lock: the existing `CONSUMER_HEADLINE_COLS` fields byte-equal (**same parcel ids, same DB state, JSON-canonical compare**, MX-D5) before and after; gate D registers the reader | PLANNED | renders stored rows, no recompute | U, O |
| D6 | CoA harness (SC-5), oracle C | `coa_parcel_link ∈ {linked_unique, ambiguous, unlinked}`; `match ∈ {match, mismatch, not_comparable:<reason>}`; reasons = Spec 129 D8's closed set (`law_changed_after_hearing`, `amendment_status_unverified`, `former_bylaw`, …) ∪ {`target_not_modelled`, `parse_failed`, `lot_gate`} | Link path is Spec 129 D7 (`application_number → coa_applications.lead_id → lead_parcels`); link precision from Spec 129's seeded 50-read file, **reported with its rule-of-three bound** (0/50 wrong ⇒ precision > 94 % at 95 %; MX-D6 — the 95 % threshold is Spec 129's, unchanged); SC-5 printed with n; **report-only (WARN, R-H) in Phase 2** | source PLANNED → **`load_coa_notices` authorized, Implementation** (`wf1/load-coa-notices`) | `coa_mismatch` adjudications name the wrong side: table, parse, link or law change (`vocab.json` `adjudication_kind` + `coa_mismatch`) | A |
| D7 | Lot-vector inputs | input `source ∈ {parcel_column, label, overlay, map_seed, named_lot_match, centreline, scenario_class}`; named-lot `match_status ∈ {matched_unique, matched_multiple, unmatched}`; `input_fidelity` from `scripts/seeds/bylaw/input-fidelity.json` (`vocab.json` `input_fidelity_status`) | I10. "differs / unknown forbids `modelled`" is now hostable on the landed G-SHAPE `row_status` arm (PLANNED arm). A proxy needs an `approximates` row + evidence (lesson 13; G-READ has no such code yet — PLANNED). **R-LABEL (RT-A20/A23):** the label parser is total over `vocab.json` `label_letter` + numbers + `H` as a declared holding token; anything else → `lot_gate = label_unparsed`, with an offender census (5 lots carry an unparsed "(H)" token today *[from REDTEAM]*) | PLANNED | `inputs_hash` covers exactly the L14 closure | A, U |
| D8 | **Scenarios = system-enumerated classes (replaces "user inputs as scenarios")** | §S: class catalogue file `scripts/seeds/bylaw/scenario-classes.json` (PLANNED, generated from the ratified catalogue); each class = a fixed input vector | I13 | PLANNED; catalogue ratification = Q12 | stored inside the cell row (`by_class`) | U, A |

**`resolve_bylaws` invariants and checks (descriptor data; FAIL unless marked).** SQL invariants are `invariants[]`; JS ones are compute-dispatched `checks[]` with their own budget variable (MATRIX I12 finding: `invariants[]` are SQL-only and the every-run budget is 5,000 ms, `logic_variables.json:5100` *[re-executed v2]*).
- **I1** Status sums: Σ by status = distinct cells × targets_modelled × structures, exactly; Σ over `by_class` entries = rows × classes applicable. Link rows = the live in-population count (same transaction).
- **I2 (rewritten, fixes H2)** `evaluated` ⇒ either (a) `winner_unit_id` ∈ `bylaw_units` ∪ provincial units and `evidence_kind ∈ {clause, provincial}` and `evidence_ref` = the winner's `regulation_id` (derived by Layer 2: the evaluator's own `clause` field is null on rule-path results, executed `clause: null` with winner `10.20.40.70(3)#(B)` *[re-executed v2]*), or (b) `value_kind = unregulated`, `winner_unit_id` null, `evidence_kind = absence`, `evidence_ref` ∈ the `id`s of `scripts/seeds/bylaw/absence-rulings.json`. A non-empty trace either way.
- **I3** `not_*` ⇒ closed reason and a null winner. `conflict` ⇒ ≥ 2 candidate ids; count ≤ `bylaw_l2_conflict_max` (default 0; `on_invalid: fail`).
- **I4 (widened, RT-A13/A14)** No winner on a lot with `lot_gate ≠ none`. **No winner on any target of a lot whose exception or any exception in its INCLUDE closure is not fully authored** (`lot_gate = exception_closure_unauthored`) — applied by Layer 2 before `effective()`, so it holds even where the evaluator would resolve from base (held M-60 item, Q21b). Oracle B applies the same gate, or the lot is `not_comparable:lot_gate`.
- **I5 (redefined, RT-A23)** Sentinel (−1) lots never take an exception-layer winner. `label_exception_mismatch` = (xN ≠ `exception_number`) **or exactly one side present**: 80 lots today, all "number set, no (xN)"; the literal xN ≠ number test fires on 0 *[re-executed v2]*.
- **I6** `exception_closure_unauthored` lot count = a **live read-only count** in the same transaction (R-CENSUS), never `census.json` (stale ⇒ `not_run`, MX-I6).
- **I7** Base-path reconciliation: base-only-eligible lots = no-exception + sentinel lots, counted live; within `bylaw_l2_base_tolerance_pt` (default 0.1; `on_invalid: fail`).
- **I8 (rewritten, fixes H2)** No value without a winner unit **or** an absence ruling: never a `HEUR-*` row; `unregulated` by absence passes only under I2(b).
- **I9** Lineage: every link row's `cell_id` exists in `bylaw_resolution_cells`; every `candidates[]` / `winner_unit_id` exists in `bylaw_units` at the current `table_version` (orphan = FAIL).
- **I10** `inputs_defaulted = 0` (a link-row integer column written by phase 1).
- **I11** Rows written only for the R-AY population; the reset arm's deletions = parcels that left it (both counted).
- **I12 (compute-dispatched, R-WITNESS)** Equivalence: full per-lot `effective()` == cell result + per-lot apply for every target, structure and class, on a **rotating** sample seeded from `chain_run_id`/run id (coverage printed as cells and lots; full cell coverage within `bylaw_l2_witness_rotation_runs` runs), **plus** the pinned P2-0 ids as a fixed regression subset. Budget: `bylaw_l2_equivalence_budget_ms` (from P2-0). Over budget ⇒ the check is `not_run` and the verdict cannot be PASS. 0 disagreements.
- **I13 (rewritten for §S)** Every class in `by_class` ∈ `scenario-classes.json`; class count per cell ≤ `bylaw_l2_class_cap` (FAIL above; never `needs_user_input`); **no `needs_user_input:<scenario axis>` reason survives on any row** (scenario axes are enumerated; `needs_user_input` stays legal only for `existing_*`, `current_stories`, `lawfully_existing_status`, `roof_type`, `pool`, `suite_wall_openings`).
- **I14 (new, RT-A24)** `row_sha` over the canonical result columns, recomputed by SQL every run: stored ≠ recomputed ⇒ FAIL (a direct DB edit). Write grants on both tables go to the step's role only (cloud; declared until the role exists).
- **I15 (new, RT-A16)** Determinism: the run's result hash is invariant to candidate order (the hardened evaluator's declared total order); a seeded shuffle of the pinned subset every run, 0 differences.
- **WARN with a retighten condition (R-H):** the per-target zone-aware plausibility bound table (declared data with `keyed_on`, e.g. side setback keyed on label `f`, never `frontage_m`, KFM-4); the winner-layer histogram and `not_evaluated` share vs the last run; designed-quiet populations (unzoned, ambiguous, tail lots), each with a ceiling variable.
- **Scheduled shadow full re-resolve (R-WITNESS):** compute everything, compare to stored, write nothing; any diff FAILs. Cadence = a logic variable (Q22).

**`resolve_bylaws` run modes.**
- **Skip (R-SKIP, RT-A26):** the `when: "pre"` predicate is the conjunction of every `staleness.pins` stamp + `table_version` + `vocab.version` + `evaluator_version` + the population-variable hash + `scenario-classes.json` sha, each recorded on the run row (`records_meta.skipped = true`). The previous run must be complete (its run row exists). Fixture: parcels changed, L1 unchanged → not skipped.
- **Incremental (default):** scope = cells whose stored candidates hold a changed or stale unit **per the G-CHANGE record**; **all** cells when an overlay or provincial unit, `vocab` version, `evaluator_version` or the class catalogue changed; link rows whose `inputs_hash` changed; the reset arm always.
- **Full:** the recovery path; a declared `--full`, never the scheduled default. With content unchanged it writes 0 rows (the idempotency proof).

---

## S. Scenarios are Layer 2 inputs (folds the Phase 3 scenario scan)
**Operator, 2026-10-07 (Phase 3 approach approved):** there is no user choice; every applicable scenario is computed for every parcel; only permitted ones are displayed; non-permitted ones are recorded with status and clause. The scan (`phase3-prework/scenario-scan.md`) derived the axes from the law: **P** principal form + units (9 envelope classes after the §2.2 collapses), **A** ancillary suite {none, garden, laneway}, **K** parking {none(=pad), integral, detached garage}, **T** tier (CoA tier is Layer 3, not Layer 2).

**S.1 What Layer 2 resolves.** Layer 2 resolves **law**; Layer 3 does geometry. For each cell × target × structure, Layer 2 evaluates the candidate set **once per envelope class whose input vector changes the applicability of at least one candidate** for that target; every other class is recorded `collapsed_into:<class>` with the §2.2 evidence rule id. A class's input vector is fixed data in `scenario-classes.json`: `building_type` (from `vocab.json` `building_type`), `has_secondary_suite`, `has_garden_suite`, `has_laneway_suite`, `house_units`, `ancillary_units`, `parking_config` (needs a `vocab.json` addition, P2-4). These are today's `vocab.json` `user_input` members; the Phase 3 amendments (worktree `wf1/mcbylaw-p3spec`, PROPOSED M-61..M-71) move them to a `scenario_axis` vocabulary.
**S.2 Permission.** `permitted(lot, class)` returns `permitted` or `not_permitted` + clause per class; `not_permitted` classes still get their law values (internal), flagged, never displayed. A semi / townhouse class on a single detached lot is `not_permitted` vs `not_evaluated` by ruling (scenario-scan §7 Spec 69 item 3; Q12).
**S.3 Storage (operator-locked b2; grain = law signature cell × envelope class).** Rows stay keyed `(cell_id, target, structure)`; the class results live inside the row as `by_class` (only the classes that differ; the rest `collapsed_into`). Keying rows by class would be ≈ 5.6 M rows ≈ 2.9 GB, over K5 *[inferred, scenario-scan §5.3]*; rejected unless P2-0 measures otherwise. **Structure vs class (collision resolved, §XR X-3):** `structure` says which building a target describes (principal, suite, ancillary); the class says which scenario vector was assumed. Ancillary-structure rows are evaluated only for classes with A ≠ none; suite-structure rows only for classes with a suite. P2-0 measures bytes at TS = targets × 3 structures with `by_class`, against K5 (Q4/Q5).
**S.4 What it replaces.** The draft's D8 ("user inputs as scenarios", fan-out over user inputs, `bylaw_scenario_cap` → `needs_user_input:<field>`) and P-7 building-type inference (Q12 superseded). M-50 / M-60(f) enumeration stays only for undecided facts that are **not** scenario axes.
**S.5 Dependency.** The class catalogue is PROPOSED (Phase 3 amendments). **P2-8 ① needs it ratified** (Q12). If it is not ratified by then, Layer 2 ships with the building-type enumeration only (today's M-50 behaviour) and re-resolves when the catalogue lands (an "all cells" incremental, by the catalogue sha in the skip predicate).

---

## V. Phase 2 validation regime (operator-approved 2026-10-07; amended)
**Principle unchanged:** gates prove the table matches the text; invariants prove rows are well-formed; neither proves the answer is right. The regime checks answers against independent oracles on a pre-registered schedule.

**One runner, one record.** `scripts/analysis/bylaw/validate-round.mjs --round=<n>` writes `scripts/seeds/bylaw/validation/rounds/<n>.json` (never overwritten; a re-run is a new round id). The record holds `table_version`, `evaluator_version`, `vocab.version`, oracle B's sha, the prereg blob sha, the class-catalogue sha, the DB name and source-table counts, per-element verdicts and counts.
* **Closed round verdict:** `pass · fail · not_run`. An element not run is never a PASS.
* **Staleness (fixes MX-V1):** a record is stale when **any** of `table_version`, `evaluator_version`, `vocab.version`, B's sha, prereg sha, class-catalogue sha differs from current; a stale element is `not_run`.
* An infra test re-parses every record (schema + ancestry). The `PHASE 2 VALIDATION` line prints each element.

### V-1. Exhaustive enumeration
| Item | Closed set | Gate | Threshold |
|---|---|---|---|
| V-1a every b2 cell × target × structure × class | L13; violations by invariant id I1–I15 | `resolve_bylaws` invariants on the whole population | 0 on every deterministic invariant |
| V-1b pairwise coverage over lot-input dimensions per law signature in authored scope (building type, suite flags, corner / through / flanking, frontage / depth / area bands from `cell-key.json`, every class axis) | a covering array generated by a seeded deterministic builder → `validation/pairwise-<table_version>.json` (byte-identical regeneration, G-DRIFT); vector count **derived from the dimension sizes and printed** (the draft's "≈ 60" was not derived, MX-V1b) | pair coverage computed | 100 % of value pairs; 0 results outside the closed sets |

### V-2. N-version oracles
| Oracle | What | Closed set | Gate and independence | Availability (2026-10-07) |
|---|---|---|---|---|
| **A** | production `resolve_bylaws` | L13 | the step's gates | P2-8 |
| **B** | independent per-lot resolver from Spec 68 §7.4–§7.6, `vocab.json`, `absence-rulings.json`, `external.json`, `bylaw-provisions.json` only; never reads `evaluate.mjs` / `dsl.mjs` / resolve compute | agree, or `disagree:<V-5 root cause>` | **Author ≠ keyer B's engine** (H8). Independence witness at build (`git ls-tree`) **and every round**: a static import scan of `oracle-b/**` (no import of the banned paths; `compare.mjs` is the comparator and may import A) + the determinism lock extended recursively to `oracle-b/` (R-DET). Permanent. | **BUILT, uncommitted** (`wf1/mcbylaw-oracleb`): 94.21 % → **97.89 %** agreement (28,037 / 28,641) after the hardening lane *[from harden `oracleb-rerun.json`]*. Residual classes R1–R5 (604 items) must enter `disagreements.json` with **operator** adjudication before landing (the lane's "B_wrong" labels are proposals, not adjudications). Depends on `bylaw-provisions.json` (E-1) |
| **C** | **CoA decision notices** (Spec 129 `coa_notice_variances`): the *required-by-by-law* value per variance item, compared to our effective value under the law in force at the hearing date | `match · mismatch · not_comparable:<reason>` (D6) | link precision (Spec 129 D7) with its bound; parse precision (Spec 129: ≥ 0.95 Layer-2 / ≥ 0.90 all, 60-row sample) | **Partially available.** Spike: 81 % of notices carry ≥ 1 Layer-2 pair; 97 % hand precision on Layer-2 pairs; ≈ 1,450 lots from the 2017 notices; ≈ 20 K if the City supplies a bulk export *[read, coa-spike/REPORT.md]*. The DB descriptions cannot serve: 2 of 26,342 hold a parsable pair *[read, measure.json]*. **Scope limit:** 2017 hearings vs 2026 law → many items `not_comparable:law_changed_after_hearing`; the comparable n is measured, not assumed |
| **D** | expert examiner's stratified sample | `agree · disagree` | G-AUDIT (**unbuilt**, Phase 1 S14) | operator engaging (Spec 69 §4 Q6) |
| **E** | shadow diff vs current production values (`field-map.json` columns) | closed classifier: `law_vs_code:<G-CODE id>` · `aggregation_sliver:M-42` · `exception_now_applied` · `unregulated_vs_default` · `input_fidelity:<input>` · `held_F:<F-1..F-5>` (Phase 1 plan's held findings, Spec 68 §11) · **`l2_no_value:<resolution_status>:<reason>`** (H8: L2 has no value where production has a number; mapped 1:1 onto L13, proven total by a fixture) · `layer2_defect` · `unexplained` | `layer2_defect` = 0 and `unexplained` = 0; each class counted with 10 sample lots | runnable at P2-0 (read-only) |

* A ≠ B on any lot is a disagreement; "majority" never decides; V-5 decides.
* **R-ORACLE (RT-A27):** B reads the same keyed table as A, so **A = B is labelled "resolver agreement", never accuracy.** Accuracy evidence about the *table* comes only from D (and C where comparable).
* **CoA ≠ Layer-2 truth about outcomes.** The CoA analysis shows approved FSI variances run ≈ 1.27× the by-law's permitted FSI *[read, coa-analysis §2.4]*: C validates the **required** (by-law) side only; the approved side feeds Phase 3's CoA tier, never Layer 2.

### V-3. Metamorphic, property and change tests (permanent fixtures)
| Test | Relation | Declared how | Gate |
|---|---|---|---|
| Monotonicity | result monotone in an input | **derived from the parsed expression, closed over the full DSL operator set** {`+`, `−`, `×`, `÷`, `max`, `min`, `band`, `if`, `by_type`} (`dsl.mjs` OPS *[re-executed v2: `−` and `÷` exist]*): `−` is increasing in its left and decreasing in its right operand; `÷` by a positive literal is monotone; `var ÷ var`, `if`, `by_type` are "not declared" — **fail closed** (no monotonicity claim) | 0 violations |
| Irrelevant-change invariance | changing an input outside the L14 dependency set leaves the result byte-equal | L14 closure | 0 violations |
| Idempotency | re-run on unchanged inputs: same result hash, 0 rows | R-AS (iii) | 0 rows |
| Candidate-order independence | k = 5 seeded shuffles → identical result incl. winner and reason | prereg seeds; the hardened evaluator passes this today on the vector set (`bylaw-harden` §3 *[re-executed v2, green]*) | 0 differences |
| Property / fuzz | seeded plausible vectors (zone-aware, NULL / extreme / band edges): closed results, unit = target unit, min ≤ max, no NaN/negative/infinite except `unlimited`/`unregulated` | prereg | 0 violations |
| Change (L2-CHANGE) | only cells whose candidates hold a changed unit move; null perturbation moves 0 | one fixture per archetype × layer + the null fixture + the negative control | D4 |

### V-4. Sampling discipline
* **Pre-registration first:** `validation/prereg-<n>.json` (thresholds, seeds, strata, n per stratum, held-out commitment) committed before the round; ancestry + blob-sha check. *(The draft said "the G-AUDIT bar-ancestry rule, reused": G-AUDIT is unbuilt, so `validate-round.mjs` implements the ancestry check itself and G-AUDIT later reuses it — MX-V4.)*
* **Held-out set B (lots):** drawn per stratum from an operator-held seed; prereg commits `sha256(sorted ids ‖ salt)`; verified at reveal. **Rotated every round.** Revealed sets join **`validation/regression-pool.json`** (committed), and `heldout_status = reused` is computed against it (MX-V4). Seed custody is **declared-only** (labelled). **Round 0 reuses the trial's published K-sample ids for K-measurements; those are not held-out, and round 0's held-out set is drawn fresh** (MX-V4 / DS partial).
* **Sample sizes:** rule of three (0 errors in n ⇒ < 3/n at 95 %); ≈ 300 clean lots per stratum bounds < 1 %; strata ≤ 300 taken exhaustively (all 451 ambiguous lots, all sentinel-signature lots). Strata = the trial's 17 + {wave 0, wave 1, wave 2, 206/650 lands, every overlay type, every structure, every permitted class}.
* **Closed sets:** `prereg_status ∈ {committed, missing, mismatched}`; `heldout_status ∈ {verified, mismatch, reused}`.

### V-5. Learning loop
* `validation/disagreements.json` (append-only): `round`, `oracle_pair`, `parcel_id | cell_id`, `target`, both values, `adjudication_basis ∈ {law_text:<unit_id/clause>, coa_decision:<application_number>, expert:<audit record id>}` (no majority vote), `adjudicated_by` (operator), `status ∈ {open, adjudicated, fixed}`, `root_cause` (closed list unchanged), `fix_ref = {commit, kind}`.
* **`validation/root-cause-kinds.json` (new, fixes MX-V5):** a declared total map root_cause → allowed fix kinds; adds kinds `oracle_b_fix`, `coa_parse_fix`, `coa_link_fix`, `production_fix:<F-n>`. Lock: total both directions.
* **Gates:** every `fixed` row has basis + root cause + fix_ref of an allowed kind; every fix_ref adds a permanent regression fixture that fails on the pre-fix commit; **no per-lot patch** (G-EXC-LIT incl. parcel ids). An `open` row is legal mid-phase (the fix_ref "deadlock", MX-V5) with a count ceiling; Phase 3 entry needs 0 open.
* **Trend:** disagreement rate per round and per wave shard, by root cause, rendered from the record.
* **Phase 3 entry criteria** (pre-registered; checked mechanically by the last round): (1) held-out round: A = B on every lot, n ≥ 300 clean per stratum or exhaustive — **labelled resolver agreement**; (2) V-1 and V-3 pass; (3) E: 0 `unexplained`, 0 `layer2_defect` (`l2_no_value` counted and disclosed); (4) **D PASS on every stratum (table accuracy, R-ORACLE)**; (5) C: match rate ≥ the SC-5 target on comparable items where C has n; elsewhere `not_run` disclosed (Q8); (6) 0 `open` disagreements.

### V-6. Round 0 = P2-0 (§K).
### V-7. Folded rulings and facts
- Storage b2 LOCKED (operator, trial).
- Coverage-null lots are `unregulated` by law (clause B; M-54).
- R-zone principal coverage `unregulated` **by absence** — **LANDED** as the M-54 note (`819799ef`, ABS-1). Hardening (M-60(a), in flight) makes it **structural, case-insensitive, every ruling executed (no id filter)** and requires the exception's INCLUDE closure authored for the target and no by-law unit (keyed or pending) for it — closes RT-A11/A12/A13. The absence result carries `evidence {kind: absence, ruling: ABS-1, expert_sample: true}` *[re-executed v2]*. It is re-executed under vitest today and on every `--check` once E-1 lands (QUEUE: S8 wiring loads `absence-rulings.json` into `checkEval`).
- **Provincial (M-55 + `limits_bylaw` note):** a provincial unit restrains a more restrictive by-law value only, inside its scope; never additional; never switches absence off — implemented by M-60(b) (in flight; closes RT-A15).
- Unconsolidated by-laws: **LANDED** (L1c).
- Oracle B is permanent.

---

## Execution Plan
Order is gated: no step starts before its predecessor's lock is green. One committer (M-33). L lane for code and docs; H lane for captures, local migrations and the full suite.

**Entry conditions for implementation:** (i) §K entry block E-1..E-6 landed; (ii) P2-0 passes and the plan is locked; (iii) ZV-1..ZV-4 PASS on `load_zoning` / `enrich_parcels` (R-ZV); (iv) cutover of `resolve_bylaws` additionally needs `PHASE 1: DONE` and wave 1 complete.

- [ ] **E-1..E-6:** §K.1 (pre-lock, Phase 1 doors only).
- [ ] **P2-0: K7-R re-run = validation round 0 (claude; local DB read-only; scratch schema only if Stage 3 is re-run — operator y/n).** prereg-0 committed first (incl. `k7r_class_map`, the 5 % `post_hoc` flag, the ranks-31–220 probe seed); held-out set drawn. Inputs: the post-A1 table, wave 0 (the 30), the hardened evaluator with pre-parse, the trial's pinned sample ids for K-measurements. Re-measure per §K.3. Output `phase2-trial/TRIAL-REPORT-K7R.md`, every number tagged. Pass → lock eligible; fail → the named K's remedy before any code. Double check per §K.4.
- [ ] **P2-1: Spec work (claude; docs).** Spec 72 (template + Operating Boundaries): both steps, table schemas, `layer2-map.json`, invariants I1–I15, L2-CHANGE, run modes, §S. Spec 69 rows for §F (ids at landing). **Spec 69 hygiene:** M-54's row text still says "the R zone … stays `no_candidate`", superseded by its own dated note — add a pointer (stale line, §XR). Spec 79 §11 calc-step list edit. Spec 68 §11 one-line pointer (Spec 68 is over budget, F-C). `npm run system-map`. **Lock:** `spec-split-check`; R-AF; R-AM.
- [ ] **P2-2: Ch.900 remainder (claude fetch; engine arms).** E-4 already pinned and sliced the pages; here: the 206/650 lands' rows, the row-resolving G-XREF arm (L6c), windowed-read disclosure. **Lock:** G-TEXT, G-PROV, G-XREF row arm.
- [ ] **P2-3: Membership, ranking, waves (claude census; engine arm).** INCLUDE-closed ranking re-derived (519 at ≥ 100 *[from panel; re-derived here]*); `waves.json` with `wave ∈ {0,1,2,tail}` + `lands`; R-CENSUS (row-set hash + snapshot id; `--accept` re-derives); `--accept --ruling=<id>`. **Lock:** G-UNIVERSE membership + INCLUDE anti-vacuity + R-CENSUS.
- [ ] **P2-4: Vocabulary extension (engine drafts; claude reviews; operator rules).** Exception-only `dsl_target` / `lot_condition` / `uses` / `requirement` entries (each with `aspect`, unit, evidence patterns; any grammar gap from the K.2(c) probe); `parking_config`; `layer2-map.json`; the L5b `$changes[]` arm. **Locks:** G-SHAPE, feeds totality, L13 both directions incl. R-EMIT.
- [ ] **P2-5: Exception authoring, wave 1 (double-keyed; §D).** Shard 0 = the E-5 30 (not re-keyed). Shards of ≈ 25 units by lot weight; INCLUDE targets keyed before includers. Exception eval vectors incl. rule-4a vectors. `--check` green throughout (unfinished = `pending`). **Lock:** G-AGREE, G-EVAL, G-XREF row arm, G-EXC-LIT.
- [ ] **P2-6: Exception expert audit, wave 1 (operator + expert; §D).** Needs G-AUDIT (Phase 1 S14). Second bar PASS before Layer 2 cutover.
- [ ] **P2-7: Wave 2 + the 206/650 lands' rows.** As P2-5; incremental re-resolution; wave-2 sub-sample of the second bar.
- [ ] **P2-8: `load_bylaw_provisions` + `resolve_bylaws` (compressed 3-commit form).** **Prerequisites (each its own red-first commit, Phase 1 owner sign-off):** R-STALE (G-CHANGE wired), R-EMIT, structured `losers[]` in `effective()`, R-DET extended to `scripts/lib/compute/resolve-bylaws.js` (the recursive lock over `scripts/analysis/bylaw/**` with the expanded ban list — `performance.now`, `process.hrtime`, `crypto.random*`, `Reflect.construct(Date`, `Date(`, `os.*` — lands at E-6, before oracle B).
  * **P2-8.0 (was P2-9 "inside P2-8"; moved ahead of ① — MX ordering finding): lot-vector data dependencies**, each landed red-first: (a) named lots → `address_points` → parcel, `match_status`, 50-match precision sample with its bound; (b) street abutment / major street — source per Q10 (`on_policy_road` is true on 21 residential lots *[from trial]*, so never used without an `approximates` row); (c) map seeds (L12; AUD-R10 Sixplex layer vs Diagrams 1/2; AUD-R11 former-by-law layer); (d) input-fidelity rows for every new input; (e) R-LABEL parser + `label_unparsed` gate.
  * **① Assessment + red tests:** descriptors (every category answered, Rule 6); migration; invariants I1–I15; L2-CHANGE; budgets (from P2-0); `staleness.pins`; population variable + reset arm; consumer seam; generic `buildDistributionQuery`; `LARGE_TABLES` registration.
  * **② Implementation + captures:** POST capture (gate G forced-nonzero, `count_path`); forced-change cohort + negative control + null perturbation + forced-full-zero-writes (R-AS adaptation, Q20); #44 witness on every capture; a local full run timed against the budget.
  * **③ Cutover:** `converted.json`, manifest chain placement (Q3), owner-spec diff (R-BB), scorecards (gate F ≥ 14/17).
  * **Locks:** step-validate gates A–K, #44, invariants, I12, I14, I15, the consumer lock (M-25). **Cloud:** partial acceptance only after R-AQ.1 lifts.
- [ ] **P2-10: Scenario classes (inside P2-8 phase 2).** §S; needs the catalogue ratified (Q12) or ships M-50-only per §S.5.
- [ ] **P2-11: Trace read path (Cross-Domain WF).** Admin parcel-lookup panel (candidates, winner, `dropped_by`, inputs, citation or absence ruling, consolidation date, amendment notice); `bylaw_basis` payload block (Expo view gated by Q6). **Lock:** consumer byte-equality; 400/401/404/500; 375 px.
- [x] **P2-12a: CoA notice acquisition spike — DONE 2026-10-07** (`coa-spike/REPORT.md`: partially viable; 2017 PDFs free, AIC reCAPTCHA-gated). Its kill (< 20 % usable-pair yield) did not fire (81 %). Successor: `load_coa_notices` WF1 (Spec 129), **authorized, Implementation**, worktree `wf1/load-coa-notices` — this plan does not duplicate it.
- [ ] **P2-12: CoA harness (SC-5) (claude; operator adjudicates).** Reads `coa_notice_variances` via the Spec 129 D7 link path; compares the required value with the effective value under the law in force at the hearing date (`amendments.json`, Spec 129 D8); `not_comparable` reasons closed (D6). Report SC-5 with n and the comparable share; adjudicate mismatches. Report-only in Phase 2; target set at close (Q8).
- [ ] **P2-13: NF/EF re-key (engine draft; claude checks; operator reviews).** `field-map.json` + G-CODE (v). Note for the operator: `max_newbuild_coa_gfa_sqm` (×1.05) is the better-validated CoA figure for single dwellings (APE 0.204 vs 0.253) *[read, coa-analysis §2.4]*; its `field-map.json` kind is `heuristic` (Layer 3), not a Layer 2 target, and Phase 2 does not retire it.
- [ ] **P2-14: Close (claude + panel).** Five lines PASS; both steps' five words PASS; SC-5 reported; L2-CHANGE rehearsed on a real adoption; output-altitude panel (Integration, Observability, Reality-Check on re-run values, Regression Guardian on existing-file edits incl. the evaluator `losers[]` change, DeepSeek lenses, all grounder-adjudicated); the final round checks V-5's Phase 3 criteria; Pre-Review Self-Checklist; `npm run test` green; re-audit cadence ruled (Q16).

---

## B. Lessons from Phase 1 applied (updated)
| # | Lesson | Control in Phase 2 |
|---|---|---|
| 1 | A spike before building | P2-0 is gate 0; K7-R is an explicit ruling with its post-hoc line disclosed (K.2 d). |
| 2 | Misattribution passed "every number present" | Landed: G-TEXT R1–R4 (M-57). |
| 3 | Gaps counted, never failed | Landed `numbering_gap_unproven`; I6/I7 reconcile against **live** counts. |
| 4 | Unconsolidated by-laws missed | Landed L1c. |
| 5 | Polluted signature count | Cell key from law-relevant fields (L14); P2-0 re-derives counts. |
| 6 | Static dependency enumeration missed 602 lots | L14 = static closure ∪ hardened `inputs[]`; I12 rotates every run. *(The draft's "every run" claim was not achievable as an SQL invariant; it is now a compute-dispatched check with a budget.)* |
| 7 | b1's change diff was blind | D4 from the G-CHANGE record (R-STALE), snapshot-before-overwrite. |
| 8 | Agreement ≠ correctness | Generated briefs; R-ORACLE labels A = B as resolver agreement; correlated keyers and oracle B disclosed. |
| 9 | Vectors keyed on measured frontage | Clause anchors (L7); `keyed_on` (WARN table). |
| 10 | Spec 69 id collision | **Resolved** (`e3ab3bd9` → M-55); duplicate-id gate **landed** (`ruling_duplicate`); ids reserved per lane (M-58/59/60). |
| 11 | Pending never blocks | ENFORCED (G-EVAL "every vector pending"). |
| 12 | Null meaning from the clause | M-54 + absence evidence; I2/I8 rewritten to admit absence. |
| 13 | Proxy inputs | `approximates` fidelity row required (D7). |
| 14 | Re-parse cost | Pre-parse cache; P2-0 re-measures with the hardened evaluator. |
| 15 | WAL on unchanged rows | Anti-join prefilter; `table_version` and `chain_run_id` out of the guard. |
| 16 | Stale retyped facts | R-FACTS: every lock-bearing count regenerated by its cited script (§K.3 g). This v2 corrected 1,653 → 1,202 and the CoA description counts. |
| 17 | Lanes editing shared spec text | Lanes propose; the orchestrator lands (M-33). |
| 18 | Specs over budget | Spec 72. |
| 19 | Self-consistency ≠ correctness | §V; Phase 3 needs D per stratum. |
| 20 (new) | **Red-team found 2 CRITICAL fail-open paths in the absence rule that every gate passed** | Every "default-to-permissive" path (absence, provincial yield, base fallback) needs a closure precondition and a known-bad fixture per precondition (M-60(a); I4). |

## C. Operator principles
| Principle | Control |
|---|---|
| Mechanical, closed responses, no drift | Every Layer 2 column is a CHECK enum from `layer2-map.json`, locked both directions against the evaluator's **emitted** strings; pins move only via `--accept --ruling`; G-DRIFT from E-1; witnessed (#44, I12, I14, `content_hash_equal`). |
| Five words | Register §A maps every artifact to a word and a gate with its real state. |
| Simple, no spaghetti | Two steps, four tables, one evaluator imported never forked, no per-exception code (G-EXC-LIT), Layer 2 checks are step data. One additive evaluator change (`losers[]`). |
| Trace shown | Rows store candidates, losers with `dropped_by`, inputs, citation or absence ruling. |
| Ambiguous lots `not_evaluated` | `lot_gate = ambiguous_zone` (451 lots, flag true; NULL treated as ambiguous) — R-2. |
| Outputs unchanged until Phase 3 | Consumer byte-equality lock (D5); gate D shows the trace API as the only reader. |

## D. Exception rows: double-keying and expert audit
1. **Blind double-keying** (Spec 68 §10 stage 5; gates landed in S6g): A = Claude (fresh context), B = DeepSeek (worktree without `.a`, `ls-tree` witnessed). B sees only public page text, the generated brief and `vocab.json`. The ⧉ set is whatever A1 leaves (M-17 note c).
2. **Shards:** shard 0 = the E-5 30; then ≈ 25 units each by lot weight; INCLUDE targets keyed before includers.
3. **Adjudication:** operator rules on every disagreement; time per unit measured (A1's figure replaces the S0.5 proxy).
4. **Mechanical checks:** G-CLAUSE, G-XREF, G-EVAL, G-EXC-LIT.
5. **Expert audit (second bar) — needs G-AUDIT (unbuilt).** Exactly 50 rows; strata committed before sampling: ≥ 20 numeric-literal rows; ≥ 1 per archetype; every PREVAILING instrument class (65.6 % of ≥ 100-set lots *[from M-35]*); every exception with an explicit "Despite" of a precedence rule; RD 1462 / RS 336 / RT 352; **all wave-0 (E-5) exceptions' rows on the sampled targets**; ≥ 10 lot-weighted wave-1 rows; ≥ 5 from the 206/650 lands; every absence row and every M-55 provincial direction reading (M-55 note). Bar = M-29's. Wave 2 sub-sample ≥ 15 (Q7).
6. **Independent ground truth:** CoA (D6) on excepted lots feeds `eval_vector` / `coa_mismatch` adjudications.

## E. Estimates (*inferred*; re-estimated at P2-0 and after wave 1's first 5 shards)
| Block | Sessions | Change vs draft |
|---|---|---|
| E-4/E-5 Ch.900 pin + 30 keyed (pre-lock) | 2–3 + ≈ 1 operator-hour | moved ahead of lock (§K) |
| E-6 oracle B landing + round runner | 1–2 | oracle B already built |
| P2-0 + double check | 1–1.5 | — |
| Rounds (≈ 6) | 0.5 each | — |
| P2-12a | 0 | DONE |
| P2-1 | 1–1.5 | + Spec 79 / Spec 69 hygiene |
| P2-2/P2-3 | 1.5–2 | pin/slice moved to E-4 |
| P2-4 | 1 | + `layer2-map.json`, `parking_config` |
| P2-5 wave 1 (190 after shard 0) | 5–8 + ≈ 7 operator-hours | shard 0 done in E-5 |
| P2-6, P2-7 | as draft | — |
| P2-8 incl. prerequisites + P2-8.0 | 8–11 | + R-STALE, R-EMIT, `losers[]`, R-DET, I14/I15, reset arm |
| P2-10 classes | 1–2 | system-enumerated classes |
| P2-11 | 2–3 | — |
| P2-12 harness | 1.5–2 | source built by Spec 129 |
| P2-13, P2-14 | 1 + 1–2 | — |
| **Total** | **≈ 40–57 sessions + ≈ 15 operator-hours + V-5 adjudication + expert turnaround** | |

**Runtime and disk:** P2-0 replaces every figure. Trial baselines: full ≈ 4.4 min local; incremental ≈ 9 s per changed unit; 380 MB at S = 1; 1.03 GB projected at 3 structures (1.84 GB risk) before classes *[from trial]*.

## F. Rulings Phase 2 needs (proposed Spec 69 rows; ids at landing)
- **R-1** Storage b2 — LOCKED (record the ruling); grain = cell × class inside the row (§S.3).
- **R-2** Ambiguous lots (share < 0.6, or flag NULL) → `not_evaluated:ambiguous_zone`; 0.6–0.9 (**1,202 lots** *[re-executed v2]*) evaluated under the dominant label with the share disclosed.
- **R-3** Layer 2 closed sets = `layer2-map.json`, incl. `conflict`; unauthored INCLUDE closure never resolves (I4).
- **R-4** Exception expert audit (second bar), §D.5.
- **R-5** CoA harness report-only in Phase 2; SC-5 target at close.
- **R-6** K7-R (§K.2), with the post-hoc disclosure.
- **R-7** Trace display policy (Q6).
- **R-8** Post-closure re-audit cadence (Q16).
- **R-9** Map-seed source and the AUD-R10 acceptance criterion.
- **R-10** Chain placement (Q3).
- **R-11** `bylaw_l2_class_cap` (replaces `bylaw_scenario_cap`).
- **R-12** Absence evidence — **already landed** as the M-54 note; hardening amends it (M-60 note, PROPOSED). Not a new row.
- **R-13** The validation regime and Phase 3 entry criteria (V-5, incl. R-ORACLE).
- **R-14** Oracle B independence rule (author ≠ keyer-B engine; per-round re-witness) and permanence.
- **R-15 (new)** The R-AS adaptation for new steps (Q20).
- **R-16 (new)** The pre-lock entry block E-4/E-5 (Q-K7a).

## G. Open operator questions
*Resolved since the draft:* Q11 (number corrected to 1,202; recommendation unchanged — answer still owed, kept below) · **Q12 superseded** by the Phase 3 approach (no user choice) → re-asked as the catalogue ratification · **Q13 resolved** (`e3ab3bd9`, M-55) · **Q15 resolved** (1075-2026 captured in `enacting/manifest.json`) · **Q19 resolved** (`load_coa_notices` authorized with robots/terms recorded, Spec 129) · **Q2 answered** (§K.4).
1. **K7-R:** accept the split reading (with K.2 a–d), or keep K7 as a single > 20 % measure?
2. *(answered, §K.4)*
3. **Chain placement:** `sources` after `enrich_parcels` (recommended) or its own chain?
4. **Structures modelled in Phase 2:** principal only, or principal + suite + ancillary (1.03 GB projected before classes)?
5. **Supabase tier / K5 budget:** keep 10 % of the DB?
6. **User-facing trace in Phase 2:** "by-law basis, not yet used in your numbers", or admin-only until Phase 3?
7. **Exception expert audit:** second 50-row audit + ≥ 15-row wave-2 sub-sample? And who builds G-AUDIT (Phase 1 S14) and when — it blocks P2-6 and Phase 3 entry.
8. **SC-5 / oracle C:** report-only in Phase 2; may Phase 3 enter with C covering only the comparable 2017 subset (`not_run` elsewhere)? Pursue the City bulk export (≈ 20 K lots) as Spec 129's future source?
9. **Overlay map source:** McBylaw map seeds (recommended) or a Spec 58 ingestion step?
10. **Major street / street abutment:** authoritative source?
11. **Ambiguous 0.6–0.9 (1,202 lots):** dominant label + share disclosed (recommended), or `not_evaluated`?
12. **Scenario-class catalogue:** ratify the P/A/K axes + collapse rules (scenario-scan §2) before P2-8 ①? Semi/townhouse classes on single detached lots: `not_permitted` (recommended) or `not_evaluated`?
14. **Layer 2 beside `enrich_parcels`' `bylaw_*`** (no replacement until Phase 3, M-25) — confirm.
16. **Re-audit cadence:** per adoption changing ≥ N audited rows, or yearly?
17. **Oracle B:** land the built lane? Its author must not be keyer B's engine (DeepSeek); if it was a DeepSeek run, rebuild or disclose. Record the author in `.prov`.
18. **Held-out seed custody:** operator file outside every worktree (recommended).
20. **(new) R-AS for new steps:** accept the adaptation (forced-change + negative control + forced-full-zero-writes) as a Spec 124 ruling row?
21. **(new) M-60 hardening:** ratify (a)–(g)? And the held items: (a) PERMIT vs PROHIBIT at the same rank; (b) **should an unauthored exception stop a base value inside the evaluator** (Layer 2 stops it anyway via I4); (c) is a duplex/triplex a provincial "detached house"; (d) which lot input proves "urban residential land".
22. **(new) Shadow full re-resolve cadence** (R-WITNESS): per chain run, weekly, or per adoption?
- **Q-K7a (new, blocks the lock):** authorize the pre-lock entry block — pin `ch900_2..6` and double-key the top-30 exceptions (wave-0) with operator adjudication — before PLAN LOCKED?

## H. Findings surfaced (*re-executed v2* unless marked)
- **F-A:** Spec 69 §4 Q3 (overlay geometry) still open; P2-8.0(c) depends on AUD-R10/AUD-R11.
- **F-B:** *resolved* (M-55).
- **F-C:** Specs 68/69 over their declared byte budgets (declared-only until S8 registers them) *[from draft]*; Phase 2 text → Spec 72.
- **F-D:** *resolved* (`0fa2e169`).
- **F-E:** *resolved* by M-60's `exception_not_authored` code (L13).
- **F-F:** superseded by the spike: DB descriptions hold 2 parsable pairs in 26,342 (`measure.json`); oracle C = `load_coa_notices`.
- **F-G (new):** the evaluator's `clause` field is null on rule-path value results; Layer 2 derives `evidence_ref` from the winner unit (I2).
- **F-H (new):** at HEAD, an RD lot on an unauthored exception still resolves its side setback from base (0.9), before and after hardening — held M-60 item; Layer 2's I4 is the control.
- **F-I (new):** Spec 69 M-54's row text ("R stays `no_candidate`") contradicts its own landed note and M-60 — a stale line for P2-1.
- **F-J (new):** migration 252 is claimed by `load_coa_notices`; Phase 2's migration takes its number at landing.

---

## FR. Fold record (every MATRIX finding and every REDTEAM attack)
**Dispositions:** **FIX-P** fixed in this plan's text (§ named) · **FIX-L** fixed by a landed commit · **FIX-F** fixed by an in-flight lane (branch) · **REF** refuted by execution (evidence) · **HOLD** held for the operator (Q) · **CAUGHT** the attack was caught; no action · **ACC** accepted by design, disclosed.

### FR.1 MATRIX HIGH
| Id | Finding | Disposition |
|---|---|---|
| H1 | Six "Existing" gates unbuilt | **Split.** G-AGREE, G-CLAUSE, G-XREF, G-SHAPE `row_status`, G-PROV keyer + duplicate-id: **FIX-L** `c89f35bc` (+ `3d087484` live-slice fixtures); s6g 207 tests green *[re-executed v2]*. G-DRIFT / `--check`: **FIX-F** `wf1/mcbylaw-s7` (E-1). **G-AUDIT: still unbuilt** → FIX-P (L9 PLANNED, blocks P2-6; Q7). Register relabelled with real states (§A). |
| H2 | I2/I8 contradict the absence path | **FIX-P** (I2(b), I8 rewritten; evidence kind `{clause, absence, provincial}`); absence shape re-executed. |
| H3 | L13 sets have no evaluator source | **FIX-P** (`layer2-map.json` mapping; `ambiguous_zone` only a lot gate; `dropped_by` via an additive `losers[]`, P2-8 prerequisite); `exception_not_authored` now an evaluator code (**FIX-F** harden). |
| H4 | P2-0 circular ordering | **FIX-P** §K (entry block from Phase 1 doors + landed gates; 30 = wave 0, unaudited) + **HOLD** Q-K7a for authorization. |
| H5 | No R-AY reset arm; literal population | **FIX-P** (logic-variable predicate + reset arm + I11 fixture). |
| H6 | `chain_run_id NOT NULL` vs R-U | **FIX-P** (nullable; excluded from the guard; explicit column list D3). |
| H7 | `table_version` incl. adoption id, in the guard | **FIX-P** (content-only hash; `adoption_id` separate; `table_version` out of the guard; `computed_under_version`). |
| H8 | E classifier not total; B correlated with keyer B | **FIX-P** (`l2_no_value:*` class; author ≠ keyer-B engine; per-round re-witness) + **HOLD** Q17 (built lane's author). |

### FR.2 MATRIX MEDIUM / LOW (by section)
| Id | Finding | Disposition |
|---|---|---|
| MX-1 | R-BF cites a NOT-MET rule; lumps three witnesses | FIX-P (Spec 122/124 table: three ids) |
| MX-2 | `on_invalid` unstated (Rule 3) | FIX-P (Standards §11, Rule 1+3 row) |
| MX-3 | Rule 6 mis-mapped | FIX-P (re-mapped) |
| MX-4 | Rule 13 mis-read; gate F floor unnamed | FIX-P (re-cited; P2-8 ③ names ≥ 14/17) |
| MX-6 | R-AS presumes a legacy step; no negative control | FIX-P (adaptation with negative control) + HOLD Q20 |
| MX-7 | Skip vs no-op indistinguishable (DS-I8) | FIX-P (`records_meta.skipped`, R-SKIP) |
| MX-8 | `count_path` must be `int` in `emits[]` | FIX-P (R-BQ row) |
| MX-10 | R-AQ.1 has no gate | ACC (labelled DECLARED-ONLY) |
| MX-11 | "silent-quiet profile" not a Spec 79 class; §11 list edit | FIX-P (Spec 79 row; P2-1) |
| MX-12 | Compressed form assumes legacy | FIX-P (R-PACE caveat → Q20) |
| L1c | Unnamed red test for the unconsolidated arm | FIX-L (S4 rework `unconsolidated_uncaptured`) |
| L1d | Windowed reads declared-only | ACC (labelled) |
| L2b | R1–R4 no fixtures | FIX-L (`8e0f93e2`) |
| L3b | Wave enum lacks the 206/650 lands | FIX-P (`wave` + `lands`) |
| L3c | Duplicate ids silently last-win | FIX-L (`ruling_duplicate`, `c89f35bc`) |
| L4d | Generated briefs unbuilt | FIX-P (E-2 / A1 builds them; PLANNED) |
| L5b | Vocab additions not bound to a ruling | FIX-P (L5b arm) |
| L8 | Gate E does not catch string ids or scan `scripts/analysis/bylaw` | FIX-P (G-EXC-LIT scope stated; gate E not claimed) |
| L12 | R-10/R-11 id reuse | FIX-P (AUD-R10/AUD-R11) |
| L14 | G-DRIFT absent | FIX-F `wf1/mcbylaw-s7` |
| D1 | "the validator verifies" CONCURRENTLY is false | FIX-P (`LARGE_TABLES` registration at landing; re-executed `validate-migration.js:33`) |
| D2 | md5 vs sha256 canonical serialization | FIX-P (one `canonicalRow()`, sha256 both sides) |
| D4 | Report before overwrite unordered | FIX-P (snapshot → resolve → diff → write, one txn) |
| D5 | 401 missing | FIX-P |
| D5b | Consumer byte-equal ambiguity | FIX-P (same ids, same DB state, canonical JSON) |
| D6 | Draft regex unpublished; counts differ | FIX-P (superseded by `measure.json`: 520/140/2; the spike script `.cursor/mcbylaw/coa-spike/measure.mjs`, untracked — commit it with P2-12) |
| D7 | "forbids modelled" arm needs `row_status` | FIX-L host (`c89f35bc`) + FIX-P (arm PLANNED) |
| D8 | Per-scenario winners don't fit the PK (DS-I2) | FIX-P (§S.3 `by_class`) |
| I1 | "cell" defined twice | FIX-P (distinct `cell_id`) |
| I6/I7 | Census staleness degrades to `not_run` | FIX-P (live counts) |
| I10 | No column | FIX-P (`inputs_defaulted` int) |
| I12 | Cannot be SQL `invariants[]`; budget 5 s | FIX-P (compute-dispatched check, own budget, rotating) |
| Run modes | Crash then skip (DS-E13) | FIX-P (run row last; previous run must be complete) |
| V-1 | Round staleness bound to `table_version` only | FIX-P (six-way binding) |
| V-1b | "≈ 60 vectors" not derived | FIX-P (derived and printed) |
| V-2 B | B needs `bylaw-provisions.json`; independence after build declared-only | FIX-F (E-1 produces the file) + FIX-P (per-round import scan + recursive R-DET) |
| V-2 C | n = 50 cannot separate 95 % from 94 % | FIX-P (report the bound; threshold stays Spec 129's) |
| V-3 | Monotonicity ignores `−`, `÷` | FIX-P (closed over the operator set, fail closed) |
| V-4 | Ancestry rule "reused" from unbuilt G-AUDIT | FIX-P (runner implements it) |
| V-4b | Regression pool uncommitted; round 0 reuses trial ids; custody | FIX-P (`regression-pool.json`; round-0 statement) + ACC (custody declared-only) |
| V-5 | `kind` not total over `root_cause` | FIX-P (`root-cause-kinds.json`) |
| V-5b | fix_ref deadlock | FIX-P (`open` status with ceiling; 0 open at Phase 3) |
| V-7 | "on every `--check`" false | FIX-F (E-1 wires absence rulings into `checkEval`); today vitest-only (stated) |
| V-7b | Forcing absence rows into the sample needs G-AUDIT | FIX-P (§D.5) + HOLD Q7 (G-AUDIT owner) |
| Lesson 1 | K7-R 5 % post hoc | FIX-P (K.2 d) |
| Lesson 10 | Stale | FIX-L (`e3ab3bd9`; `ruling_duplicate`) |
| Lesson 16 | Draft carries stale facts | FIX-P (this v2: M-55, F-B/F-D/Q13/Q15 resolved, 1,202, CoA counts) |
| DS: Rule 12 posture; Rule 8 per-target; FAIL rollback; `evaluator_version` content hash; Phases 1/3 snapshot; P2-9 inside P2-8 ordering; two-phase crash; y/n fork + Q2 NITs | VALID (L/M) | FIX-P (Rule 12 row; R-BA at ①; Try-Catch rollback sentence; L13 `evaluator_version`; D4 snapshot; P2-8.0 moved first; run row last; Q2 answered) |
| DS: double check must be frozen | VALID (M) | FIX-P (§K.4) |
| DS: C waivable | VALID (M), design | HOLD Q8 |
| DS refuted by MATRIX (`pre_write`, gates C/I, bare numbers, I13 vs D8, M-54 renumber, auth inside try, pins content vs timestamp, fix_ref renumbering, `au` value kind, `held_F` undefined) | REF (MATRIX §6, executed there); R-P `"pre"` and R-U re-executed here | — |
| MATRIX Q1 a–d | FIX-P (§K.2) |
| MATRIX Q2 | FIX-P (§K.4) |

### FR.3 REDTEAM attacks
| Id | Attack | Disposition |
|---|---|---|
| A1, A2 | Page tamper passes pre-commit | **FIX-F** `wf1/mcbylaw-s7`: unconditional `node scripts/generate-bylaw-provisions.mjs --check` in `.husky/pre-commit` *[re-executed v2, diff read]* |
| A3, A4a, A6a–d, A7c, A8, A9b, A19 | — | CAUGHT |
| A4b | Census identity swap across rank 220 | FIX-P (R-CENSUS, P2-3; I6 live) |
| A5 | `bylaw-code-findings.md` edit | ACC (M-32 shape-only) + FIX-F (E-1 renders it via G-DRIFT) |
| A6e | Emitted-code rename passes the list lock | FIX-P (R-EMIT, P2-8 prerequisite) |
| A7 | Vectors blind to rule 4a | FIX-P (rule-4a vectors, L7/P2-5) |
| A9 | G-CHANGE unwired; stale authored unit | FIX-P (R-STALE, P2-8 prerequisite; D4 `not_run` without a record). Not in any lane today *[re-executed v2: no callers, incl. the s7 lane]* |
| A10 | Unconsolidated list | FIX-L (S4 rework L1c) |
| A11 | Only ABS-1 executed | FIX-F `wf1/mcbylaw-harden` (`checkAbsenceRulings`, no id filter) |
| A12 | Case-sensitive absence phrases (CRITICAL) | FIX-F harden (structural, case-insensitive; M-60(a)) |
| A13 | Absence despite pending / partial / INCLUDE-unauthored exception (CRITICAL) | FIX-F harden (executed: `exception_not_authored:EXP/EXQ/EXB`; tests green *[re-executed v2]*) + FIX-P (I4 closure gate) |
| A14 | Unauthored exception resolves from base | **Partly FIX-F** (absence path); **base path still open** *[re-executed v2: 0.9]* → FIX-P (I4 Layer 2 gate) + HOLD Q21(b) |
| A15 | Provincial `bylaw_prevails`/scope unread | FIX-F harden (M-60(b); `limits_bylaw` 14 refs) |
| A16 | Candidate-order dependence (650 / 9,156) | FIX-F harden (M-60(c); permutation property green) + FIX-P (I15 every run) |
| A17 | Determinism lock non-recursive, narrow ban list | FIX-P (R-DET, before oracle B lands — E-6 — and in P2-8 prerequisites) *[re-executed v2: `readdirSync` non-recursive]* |
| A18 | Threshold-token flip | FIX-F harden (`checkThresholdTokens`) |
| A20 | Unknown label letter → silent default | FIX-P (R-LABEL, `label_unparsed`) |
| A21 | building_type NULL reason flips | FIX-F harden (declared reason priority) |
| A22 | NULL ambiguous flag = not ambiguous | FIX-P (NULL ⇒ `ambiguous_zone`; 0 residential NULLs today, 1 in the full extract *[re-executed v2]*) |
| A23 | `label_exception_mismatch` definition misses the 80 | FIX-P (I5 redefined; 80 / 0 re-executed) |
| A24 | Direct DB edit of a Layer 2 row | FIX-P (I14 `row_sha`; rotating I12; shadow re-resolve; role grants) + HOLD Q22 (cadence) |
| A25 | Trace omits condition inputs → incomplete key | FIX-F harden (`inputs[]`, sufficiency property green) + FIX-P (R-DEP static closure ∪ inputs) |
| A26 | Skip on `table_version` only | FIX-P (R-SKIP conjunction + fixture) |
| A27 | A = B blind to keying errors | FIX-P (R-ORACLE; Phase 3 criterion 4 per stratum) |
| A28 | 1,653 vs 1,202 | FIX-P (re-executed: 1,202 in 0.6–0.9; 451 < 0.6) |
| R-1..R-17 controls | — | Each mapped above: R-ABS → A11–A13 (FIX-F); R-AUTH → A13/A14; R-PROV → A15; R-STALE → A9; R-HOOK → A1; R-EMIT → A6e; R-ORDER → A16; R-DEP → A25; R-WITNESS → A24; R-SKIP → A26; R-VOCAB → A18 (+ L5b); R-LABEL → A20/A23; R-CENSUS → A4b; R-DET → A17; R-ORACLE → A27; R-UNCONS → A10; R-FACTS → A28 / §K.3(g) |

---

## RX. Re-execution log (this drafter, 2026-10-07, main tree HEAD `9027972f`, read-only)
| # | What was run | Result |
|---|---|---|
| E-1 | `git log` on the branch; `git show --stat c89f35bc 3d087484 0fa2e169` | S6g gates, live-slice fixtures and the witness set-op fix are landed |
| E-2 | `cmp` main-tree vs `Buildo-wt-mcbylaw-harden` for `evaluate.mjs`, `dsl.mjs`, Spec 69 | byte-identical (hardening is staged in the main tree, uncommitted) |
| E-3 | `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/bylaw-harden src/tests/bylaw-s6g src/tests/bylaw-s6b-eval` | 6 files, **359 / 359** pass (104.5 s) |
| E-4 | Node probe of `evaluate.mjs` at HEAD (git archive) and hardened | codes 22 → 23 (+`exception_not_authored`; no `ambiguous_zone` in either); result statuses `value/not_evaluated/conflict`; `dropped_by` 0 occurrences; R-lot coverage → `unregulated`, winner null, clause null, evidence `{kind: absence, ruling: ABS-1, expert_sample: true}`; R lot on an exception with no units: `no_candidate` → `exception_not_authored:900.2.10(777)`; RD lot on `900.3.10(99999)` side setback **0.9 from base in both**; `inputs[]` only in the hardened build |
| E-5 | `generate-bylaw-provisions.mjs:37`; s7 worktree `git status` + `.husky/pre-commit` diff | HEAD modes: refresh/adopt/accept/refresh-census; `--check`, `render.mjs`, `validate.mjs`, `docs/reference/bylaw-provisions.json` exist only in `wf1/mcbylaw-s7` (uncommitted); its hook line is unconditional |
| E-6 | `manifest.json`, `page-set.json` grep | 1 `ch900` page pinned; `ch900_2..6` listed, ruling M-15 "pinned at Phase 2 entry" |
| E-7 | `ls scripts/analysis/bylaw`; grep `ruling_duplicate` | no audit module; `keyer-prov.mjs` has `ruling_duplicate` |
| E-8 | grep callers of `staleUnits` / `changeRecord` / `adoptionUnitShas` in `scripts/` (HEAD and s7) | none outside `change.mjs` |
| E-9 | `bylaw-provisions.infra.test.ts:87` | `readdirSync` non-recursive |
| E-10 | `validate-migration.js:33`; `logic_variables.json:5100` | fixed `LARGE_TABLES` list; `invariants_every_run_budget_ms` 5000 |
| E-11 | grep S4-rework codes; `unconsolidated.mjs`; `enacting/manifest.json` | all four G-TEXT codes present; `unconsolidated_uncaptured` present; 1075/206/650-2026 captured |
| E-12 | Spec 69 register ids | M-50..M-57, M-60 present; no duplicates; M-58/M-59 absent (reserved) |
| E-13 | awk over `phase2-trial/scratch/parcels-extract.csv`, residential filter | 440,094 lots; ambiguous flag true 451 (all share < 0.6); share 0.6–0.9 = **1,202**; exception set without (xN) = **80**; (xN) ≠ number = **0**; R = 104,544 |
| E-14 | `ls migrations`; `ls docs/specs/*` | tip 251; no 72/73/129 spec files |
| E-15 | `coa-spike/measure.json` `A_db_descriptions` | `{n 26342, anyNum 520, fromTo 9, required 140, pairs 2}` |
| E-16 | Spec 124 lines 215/220/262 | R-P `"pre"`; R-U "`null` when a step runs standalone"; R-AY "never a literal … reset arm" |
| E-17 | `dsl.mjs:36,107,112` | `−` and `÷` operators exist |
| E-18 | oracle-B lane files; `resolve.mjs` imports; harden `oracleb-rerun.json` | B imports only `fs`/`path`/`url`/`./expr.mjs`; `compare.mjs` imports A (comparator); 97.89 % after hardening, residual classes R1–R5 |

---

## XR. Cross-read Adversary pass (second pass by the drafter on this v2: pairwise fold collisions, stale lines, test coherence)
**Pairwise collisions checked and resolved in the text above:**
| # | Pair | Collision | Resolution |
|---|---|---|---|
| X-1 | H7 (`table_version` out of the guard) × I9 (lineage "at the current `table_version`") | I9 could read as "every row stamped with the current version", which the guard change no longer guarantees | I9 rewritten as existence of `cell_id` and candidate unit ids in the current `bylaw_units`; `computed_under_version` is informational |
| X-2 | H7 × R-AS (draft: "guard includes `table_version`, so a forced full run proves nothing") | direct contradiction | R-AS row rewritten: forced full on unchanged content must write 0 rows (idempotency), value change proven by the forced-change cohort |
| X-3 | §S classes × `structure` dimension × I1 | double fan-out / undefined count | §S.3: structure keys the row, classes live inside it; I1 counts both; ancillary/suite rows only for classes that have them |
| X-4 | §K E-5 (30 keyed pre-lock) × P2-5 shards × §D.5 audit | the 30 could be re-keyed, or skip the audit | shard 0, never re-keyed; forced into the second-bar population |
| X-5 | Oracle B author rule × keyer roles | any single-family B correlates with one keyer | B ≠ keyer-B engine; residual correlation with keyer A disclosed; Q17 |
| X-6 | I4 (Layer 2 gate) × M-60 held item (evaluator still resolves base) × oracle B | A and B could disagree on every gated lot | B applies the same gate or the lot is `not_comparable:lot_gate` |
| X-7 | Migration number 252 × Spec 129 plan | both claimed 252 | Phase 2 takes its number at landing (F-J) |
| X-8 | P2-12a removal × Spec 129 plan's references ("§V-2 row C, D6, P2-12") | renumbering would break its cross-references | ids D6, P2-12 and V-2 C kept stable; P2-12a kept and marked DONE |
| X-9 | I13 (no `needs_user_input:<scenario axis>`) × M-60(f) enumeration of undecided units | M-60(f) can still emit `needs_user_input:building_type` | Layer 2 always passes the class's `building_type`, so the code cannot arise on scenario axes; it stays legal for `existing_*` inputs only |
| X-10 | R-SKIP × §S.5 (catalogue lands later) | a catalogue change could be skipped | the catalogue sha is in the skip predicate and forces "all cells" |
| X-11 | I12 rotating sample × V-4 pinned K-sample | the pinned set could be mistaken for held-out | pinned ids are a fixed regression subset of I12; held-out sets are drawn fresh and never pinned |
| X-12 | E-6 (oracle B landing pre-lock) × GOD MODE (no implementation before lock) | landing code before lock | oracle B lives in `scripts/analysis/` (offline validation tooling), lands only on the operator's y (Q17); no `src/` and no pipeline step before lock |
| X-14 | K7-R class (i) (`exception_not_authored:*`) × I4 (Layer 2 gates unauthored closures **before** `effective()`) | on gated lots the evaluator code never appears, so class (i) would under-count and the lots would fall into class (ii) — a false kill | class (i) also includes the lot gate `exception_closure_unauthored` (K.2 a); the `k7r_class_map` lock is total over codes ∪ gates |
| X-15 | E-6 R-DET × P2-8 prerequisite R-DET | the same control listed twice with different scopes | one lock: lands at E-6 (recursive, `scripts/analysis/bylaw/**`), extended in P2-8 to the resolve compute file |
| X-13 | P2-13 note on `max_newbuild_coa_gfa_sqm` × Phase 3 amendments (KFM-78-1 retires it) | Phase 2 could be read as ruling on Phase 3 | Phase 2 only classifies it `heuristic`, does not retire or keep it |

**Stale-line sweep** (grep of this file for the draft's superseded facts): "in-flight provincial row", "F-B open", "Q13 open", "463", "6 from-to", "252_bylaw_layers", "silent-quiet profile", "NOT NULL `chain_run_id`", "1,653", "`needs_user_input:<field>`", "every `--check`" as a present-tense claim, "Existing" gate labels, "G-AUDIT … reused" — each appears only inside a correction, a fold-record row or the §XR table, never as a live claim. **One stale line is outside this file:** Spec 69 M-54's row text (F-I) — queued for P2-1.
**Suite coherence:** the new fixtures (I4 closure, I5 one-side, I14 `row_sha`, I15 shuffle, R-SKIP, reset arm, R-EMIT, R-STALE, R-LABEL, `l2_no_value` totality, root-cause-kind totality) each name one closed code from `layer2-map.json`, `NOT_EVALUATED_CODES`, or the validation files; no two fixtures assert contradictory outcomes for the same input (the only near-pair, A14 base path, is asserted at Layer 2 (no winner) and left unasserted at the evaluator until Q21(b)).
**Residual risks the fold does not close:** G-AUDIT has no owner or date (Q7); oracle C's comparable n is unknown until Spec 129 runs; the hardened evaluator's cost under M-60(f) enumeration is unmeasured (P2-0 b).

---

> **PLAN LOCKED. Do you authorize this WF1 (McBylaw Phase 2) plan? (y/n)** *(not yet — v2 DRAFT; locks after the entry block E-1..E-6, the K7-R re-run (after Phase 1 A1) and its double check; Q-K7a authorizes the pre-lock block)*
> §11 note: Database Impact = YES. Four new tables, created empty and filled by INSERT … SELECT from one narrow scan; no `parcels` column, no UPDATE of `parcels` (K6). Indexes built on the empty tables; the two Layer 2 tables are added to `LARGE_TABLES` at landing so later migrations must be CONCURRENTLY. `chain_run_id` nullable (R-U).


> **Operator decision 2026-10-07:** Q-K7a APPROVED — pin Ch.900 pages 2–6 and double-key the top 30 wave-1 exceptions before PLAN LOCKED (K7 re-run after A1).

---

## Addendum 2026-10-16: §P2-10 "Suite scenario (M-177)" and the disclosure-wiring item (operator y 2026-10-16; Spec 69a M-177 / M-178 / M-179)

**Status.** Recorded, not built. M-177(1) option (b) moves the suite pin change from "before P3-5" (M-63 note, Q12-a) into P2-10. This section replaces P2-10's one line ("§S; needs the catalogue ratified (Q12) or ships M-50-only per §S.5") for the suite classes. The M-50-only fallback still applies to any class the catalogue has not ratified.

### §P2-10 Suite scenario (M-177)

**Classes (the `scenario-classes.json` pin change).** A axis {none, garden, laneway} (150.7.20.1(2) = 150.8.20.1(2)). P suite variants: detached / semi-detached + secondary suite (`has_secondary_suite` = 1, 150.10.20.1(2)). Class vectors carry `has_garden_suite`, `has_laneway_suite`, `has_secondary_suite`, and `ancillary_units` = 1 when A ≠ none (M-160).

**Rows (§S.3 grain: cell × target × structure; classes inside `by_class`).**

| structure | target | units (69a ruling) |
|---|---|---|
| principal | `lot_coverage_pct` | 150.7.60.70(1)(A)/(B) as one `max(…)` alternative (M-179(1); **blocked on ADJ-1**); 150.8.60.70(1)(A) (laneway suite excluded from lot coverage) |
| principal | `gfa_m2` / `fsi` | 150.7.60.50(1), 150.8.60.50(1) (suite GFA excluded from the lot's GFA and FSI) |
| suite | `height_m` | 150.7.60.40(1)(A) 4.0 m / (B) 6.3 m; laneway twin 150.8.60.40(1) (M-177(2): the 6.3 m arm where the lot depth fits the 7.5 m separation, else 4.0 m; the other arm disclosed) |
| suite | `separation_m` | 150.7.60.30(1)(A)/(B)/(C), 150.8.60.30(1) |
| suite | `rear_setback_m`, `side_setback_m`, `side_setback_street_m` | 150.7.60.20(2)–(6), 150.8.60.20(2)–(3); restrictive design-choice arms not_modelled + disclosed (M-172(3), corrections 2026-10-16); 150.7.60.20(6)(C) corner lots only (M-179(2)) |
| suite | `gfa_m2` / `interior_floor_area_m2`, `height_storeys` | min(120 m², < principal GFA), 60 m² one storey; 2 storeys (M-177(2)) |
| ancillary | `ancillary_coverage_pct` (new target, M-179(1)) | 150.7.60.70(1)(B) 20 % (ADJ-1), 150.7.60.70(2)(A) 20 % (**ADJ-2: not keyed**), 150.8.60.70(1)(B) 30 % (corrected 2026-10-16) |
| secondary suite | Layer 3 field `avg_unit_gfa_sqm` | 150.10.40.40(1) 45 % of the host unit; (2) whole basement of a one-storey detached house (M-177(4)) |

Report fields, not envelope limits (M-177(5)): parking 150.7.80.1(1) / 150.8.80.1(1)(B), bicycles 150.7.80.1(2) / 150.8.80.1(2), landscaping 150.7.50.10(1) / 150.8.50.10(1) (P3-3 inventory).

**The four principal-lot exclusions** (why the suite is in Phase 2: each changes the principal lot's answer once A ≠ none): 150.7.60.50(1) and 150.8.60.50(1) (suite GFA out of the lot FSI / GFA), 150.7.60.70(1) (garden: 45 % all-buildings, or LC overlay for the house + 20 % ancillary), 150.8.60.70(1)(A) (laneway suite out of the lot coverage).

**Inputs needed.**
- Laneway abutment: P3-11 (`lane_abutting_length_m` ≥ 3.5 m for the 150.8.30.20(1) permission, Spec 62 WF3). Until it lands, the laneway class is `not_evaluated:missing_input` (phase3-plan-DRAFT l.100); `abuts_lane` stays data-filled from `parcels.abuts_laneway` (M-172 note) for the setback arms.
- Corner lot (`corner_lot`): 150.7.60.20(6)(A)–(C) select on it (M-179(2)).
- Through lot (`through_lot`): 150.7.60.20(3)(A), (4).
- Lot depth: the M-177(2) arm test (room behind the principal's rear wall for the 7.5 m separation, the suite depth and its rear setback) is Layer 3 geometry; Layer 2 resolves both arms.
- M-178 vocab: `lawfully_existing_caveat.cutoff.suite_transition` = 24 July 2025; `lot_condition.suite_transition_permit` in `undetermined_condition_disclosure`.

**Prerequisites.** ADJ-1 and ADJ-2 (`.cursor/mcbylaw/envelope-review-findings-2026-10-16/adjudication-items-2026-10-16.md`); the M-176 / M-179 corrections patch landed after E-LAND commits (same file); the disclosure wiring below (every suite answer carries an M-172 / M-177 disclosure).

**Tests (red first).**
- `bylaw-rulings` M-177: class vectors for A ∈ {garden, laneway} and the secondary-suite P variants; `ancillary_units` = 1 when A ≠ none.
- `bylaw-rulings` M-178: the cut-off is chosen by the cited clause; the permit-history token is in exactly one M-172 class.
- G-EVAL vectors: garden lot with LC 35 % (principal per ADJ-1, ancillary ≤ 20 %); laneway lot, ancillary ≤ 30 %; garden suite side setback on a corner lot vs an interior lot (150.7.60.20(6)(C) vs (5)(B)); suite height 6.3 m vs 4.0 m by separation; secondary suite ≤ 45 % of the host unit.
- Regression: an A = none lot's principal answers are byte-identical before and after the pin change.

**Effort (*inferred*).** Vocab + class pin: 0.5 day. ADJ-1 / ADJ-2 keying (keyer A + B, adjudication): 1 day. Vectors + rulings tests: 1 day. The structure dimension is P2-8's (§S.3); the suite geometry tests are Layer 3. About 2.5–3 days inside P2-8 phase 2.

### Disclosure wiring (P2-0 seat, owed; recorded, not built)

`evaluate.mjs` reads only `vocab.accessory_structure_use` (M-175). It does not yet read `undetermined_condition_disclosure` (M-169 / M-172(2)), `design_choice_disclosure` incl. `default_overrides` and `unit_sentences` (M-172 / M-173 / M-176), `measure_deduction_disclosure` (M-171) or `lawfully_existing_caveat` (M-158 / M-178). So restrictive design-choice units (status `not_modelled`, e.g. 150.7.60.20(2)(C), (5)(A); 10.80.40.10(2)(A)/(B)) still enter `effective()` as candidates, and site-fact conditions return `not_evaluated` instead of "answer + disclose". The item: (1) `applies()` takes a design-choice token in its `default_overrides` / M-172 direction and records the disclosure; (2) a site-fact token is taken as not holding and its sentence attached; (3) a `not_modelled` unit is never a candidate and contributes its `disclosure`; (4) the result carries `disclosures[]` in a fixed order. Tests: one G-EVAL vector per class (townhouse 5.0 m with the 6.0 m disclosure; sixplex 10.5 m achieved-if; shoreline "If …"; GFA deduction). Lock: G-EVAL. Its own WF (new evaluator code), Regression Guardian on `evaluate.mjs`. Effort *inferred* 1.5–2 days.
