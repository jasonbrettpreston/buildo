# Active Task: Step Optimization Programme — implementation plan
**Status:** Planning

> **Prior task records preserved, nothing discarded:** Spec 122 authoring → `.cursor/closed_task_spec122_authoring_2026-08-23.md` · P0 + Phase B + step-runner programme context → `.cursor/closed_task_p0_phaseb_programme_2026-08-23.md`.

## Context

* **Goal:** Standardize all 27 `sources` steps **in place** — each script keeps its path, lock ID and `run-chain.js` invocation — by moving every non-compute concern into `pipeline.step(descriptor, compute)` with the validator baked in. Then the estate's remaining 37 distinct steps.
* **Target Specs:** **122** (architecture) · **123** (assessment + validation procedure) · **121** (method — GOVERNS) · **119** (backend verification doctrine — governs over all).
* **Domain Mode:** **Backend/Pipeline** (`scripts/`, `migrations/`) → `scripts/CLAUDE.md`. Stages **S4** and **C4** additionally touch admin consumers → **Cross-Domain** for those two only.
* **Workflow:** WF1 per S-stage · WF2-C per conversion (reduced grounder roster, Spec 121 §12.14b) · WF3 for P0/P1.
* **Rollback anchor:** `1cb4e308`.

### Why this plan is generated

Spec 121 measured a **~60% citation-error rate on hand-written plan detail**, and its §12.9 coverage matrix mapped ID *spaces* to stages — looking complete while **162 of 283 claims (57%) were cited nowhere**. This plan is emitted per-claim by a committed tool that **hard-fails on a single unassigned claim**:

```
node scripts/violations/plan-claims.mjs docs/reports/generated/123-claim-plan.md
node scripts/violations/plan-claims.mjs --checklist docs/reports/generated/123-per-step-checklist.md
```

**290 claims · 235 UNIVERSAL · 55 PER_STEP · zero unassigned · tiers sum to 290.**

---

## ⛔ THE THREE GATES BEFORE ANY CONVERSION

These are not stages of the programme. They are **preconditions**, and each answers a defect that would otherwise corrupt everything measured after it.

### P0 — The audit instrument is lying `[MEASURED 2026-08-23]` · ~1 hour · **WF3**

Four scripts default to the **pre-cutover database** when `DATABASE_URL` is unset: `parcel-sanity-audit.js`, `parcel-field-dump.js`, `cost-estimates-sanity-audit.js`, `generate-db-docs.mjs`.

| Same audit, same commit | `localhost:5432/buildo` (default) | `127.0.0.1:54322/postgres` (authoritative) |
|---|---:|---:|
| migrations applied | 222 | **241** |
| HIGH/MED violations | **2,394** | **30,288** |
| FAIL-gated checks | **0** | **1** |
| `max_build_dim_below_floor` | **0 — PASS** | **27,984 — GATE→FAIL** |

That check's own text reads *"inert-INFO expected post-fix"* — someone fixed it, verified against a database where the defect could not appear, and closed it. **This is the mechanism behind "every fix produced a surprise": the feedback loop was corrupted, not the reasoning.**

- [ ] Make `DATABASE_URL` **required** in all four — fail loud, no silent fallback. Red-first: a test asserting the scripts refuse when unset.
- [ ] Re-run both Reality-Check instruments against `54322`. **This is the first true defect inventory.**
- [ ] Re-verify every bug whose closure was certified against the stale DB. `max_build_dim_below_floor` is one; the `why` text suggests more.
- [ ] File anything the re-baseline surfaces.

> **Nothing downstream is measurable until this lands.** 6 register claims (§A.20) discharge here.

#### P0b — ⚠️ `npm run verify` FAILS ON THIS BRANCH TODAY `[MEASURED 2026-08-23]`

**You cannot start a 27-step conversion from a red tree.** Three separate problems, all pre-existing, none from the working tree (which is docs-only, 68 insertions across 5 files, zero `scripts/`/`src/`/`migrations/`):

| # | Failure | Cause | Fix |
|---|---|---|---|
| 1 | **`lint` — 3 errors ⇒ `verify` exits before `test` ever runs** | `A require() style import is forbidden` at `enrich-heritage-418.logic.test.ts:111` and `enrich-parcels-optconfig.logic.test.ts:213,:214` — all three introduced by **`a81c6a7c` (B3 fold D)** | convert to `import`; one commit |
| 2 | **`test` — 6 deterministic failures** across `enrich-heritage-418.logic` (3), `compute-parcel-cost-ledger-gate.logic` (2), `logic-vars-registry.infra` (1) | ⚠️ **Windows CRLF.** `core.autocrlf=true`, **no `.gitattributes`**, `scripts/enrich-heritage.js` has CRLF terminators — source-scan regexes anchored on `\n` cannot match `\r\n` | `.gitattributes` with `text eol=lf`, **as its own commit on a quiet tree** |
| 3 | **`test` — 2 flakes** (`control-panel-shell.ui`, `run-chain-step-timeout.logic`) | pass in isolation; 5000 ms timeout under full-suite load | widen or isolate |

⚠️ **`c64b81b4` already filed the CRLF cause — but understates it.** That entry names **one markdown file** (`logic-variables-registry.md`) and holds the one-line fix back to avoid whole-tree renormalization mid-Phase-B. **Measured: the same gap breaks 5 further tests across 2 source-scan test files, and it reds the load-bearing Husky pre-commit gate.** Widen the followup; the "quiet tree" moment arrives when Phase B lands (P2).

- [ ] Fix the 3 lint errors · [ ] `.gitattributes` on a quiet tree · [ ] widen `c64b81b4` · [ ] triage the 2 flakes
- [ ] **Exit: `npm run verify` green.** ⚠️ On an LF checkout (CI/cloud) the branch is *probably* already green — but that is an **inference, not a measurement**, and it was not verifiable without normalizing the tree.

#### P0c — ⚠️ Two CI holes that make this programme unenforceable `[MEASURED 2026-08-23]`

1. **No workflow runs the main vitest suite.** All **8,739 tests** are gated by `.husky/pre-commit` alone — bypassable with `--no-verify`. `pipeline-lint.yml` exists because that bypass was a known hole *for migrations*; it is wide open for the whole TS suite.
2. **`db-tests.yml` has no `scripts/**` path filter** — only the literal `scripts/migrate.js`. **A PR changing a pipeline step cannot trigger the DB tier**, though the halt-classification `.db.test.ts` files spawn those very scripts.

> **Both close at P0**, or ~290 claims are enforced by a skippable hook and the per-step DB tests never run in CI.

### P1 — The centroid invalidator · **WF3** · the one sanctioned behaviour-change-before-conversion

`parcels.centroid_lat/lng` is geometry-derived, has **no invalidator on any path**, and is a **join key for `link-parcels.js:415-423`** — ⚠️ **and NOT for `link_massing`, corrected 2026-08-23:** `link-massing.js:237`/`:434` is the same line, a NOT-NULL *eligibility filter* (`centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL`); the real predicate at `:293` joins parcel **geom** against the **building's** centroid, and `:227` says so in-file. So it is **one join plus one eligibility filter**, not two joins. Migration 242 covers two stamps; `load-parcels.js:353-361` covers three others; **neither covers centroids**. Filed HIGH 2026-08-23.

⚠️ **Spec 121 §4.3 uses this exact defect as its worked example of "pin, then fix after."** It is being fixed *first* instead, deliberately, because **it is upstream of the differential itself** — pinning a wrong join key and converting on top of it poisons every downstream conversion's golden master. Recorded as a declared deviation from §4.3, not a silent one.

- [ ] Red-first test: move a parcel's geometry → assert both centroid columns go NULL.
- [ ] Fix: a fourth arm on migration 242's trigger (universal — preferred, centroids are geometry-derived exactly like the stamps it already covers).
- [ ] Assert the next `compute_centroids` run refills them.
- [ ] Re-measure the `link_parcels` link rate before/after. ⚠️ **Not `link_massing`** — corrected: `:237`/`:434` is a NOT-NULL eligibility filter, and the real predicate at `:293` joins parcel geom vs the **building's** centroid, so the defect barely touches it.

### P2 — Phase B lands · **20 unlanded commits, migrations 240/242/243/244**

Phase B is **prerequisite and golden master**. Its B1/B2/B3 gating machinery is *subsumed* by `pipeline.step()` — but subsumed does not mean discardable: if it does not land, the golden master captures **pre-Phase-B** behaviour and the conversion **silently reverts Phase B behind a green differential** (Spec 122 §1.2, Spec 120 §14.2).

⚠️ **CORRECTED BY MEASUREMENT 2026-08-23 — three figures I had wrong:**

| Was | Actually |
|---|---|
| "20 unlanded commits" | **17.** `git cherry` shows 20 `+`, but **three** are already on main under amended hashes — `67663a81`→`cdaea415`, `eff28a7e`→`bc87d292`, and ⚠️ **`1cb4e308`→`91567f6f`** (memory listed only two). Content-verified by `git diff origin/main HEAD --stat -- <that commit's files>` returning empty |
| "migrations 240/242/243/244 pending" | **all four APPLIED locally** (`schema_migrations` is keyed by `filename`, not `version`; 241 rows, zero pending). **Pending is cloud-side only** — local dev already sits on the post-B3 schema |
| "F2/F3 are Spec 120 §9.3 ① envelope work" | **REFUTED** — §9.3 ① contains zero mentions of them. Corrected in Spec 121 §12.P in place |

- [ ] Land the **17** as ONE unit in dependency order: **B1 → B2 → F2 → F3 → B3+folds A–F.** ⚠️ **Do not cherry-pick a subset** — B3 needs B1's lib, **F2/F3 need B2's `run-chain.js` region and `step_completeness` contract**, and folds A–F are corrections that make the gate correct. Landing partially destroys the diff baseline.
- [ ] ⚠️ **Do NOT capture a golden master for `link-wsib` / `link-parcel-addresses` / `compute-parcel-cost-estimates` / `enrich-heritage` until this closes.**
- [ ] Close before the cloud deploy: the `parcel-lookup.db.test.ts` schema-drift RED (**B2's** mig-240 `massing_enriched_at`, not B3's — invisible to `npm run test` because Husky never sets `BUILDO_TEST_DB=1`).
- [ ] Exit: `git cherry origin/main HEAD` clean of Phase B; 240/242/243/244 applied **to cloud** and verified.

#### What the library takes, and what stays in the descriptor `[READ 2026-08-23]`

| → the library (UNIVERSAL) | → the step descriptor (STEP-SPECIFIC) |
|---|---|
| **all of `source-version.js`** (483 lines, absent from main) — ⚠️ `classifyOutcome` + the 3 `OUTCOME_*` consts have **zero production callers**: adopt as the real outcome enum or **knowingly retire** | the four `load-*.js` local `skipCheckDecision` thunks + per-dataset style/options |
| **`buildSkipGateRecordsMeta`** — already the row-derived verdict cascade this programme needs | `carryMetricNames` / `carryMetricPrefixes`, `phase`, `name` |
| `parseDeferMarker` + `resolveChainStatus` + 4-consumer status propagation — ⚠️ **make it ONE ladder; `run-chain.js:110-121` is hand-synced today** | `computeDeferScope`'s four per-pass counts + the threshold |
| the **`step_completeness` 6-field contract** — F3's input, treat as an interface | — |
| the massing-gate **archetype** (data-signal + code-signal veto; `--full` as a *permit*) ⚠️ note `massing-full-gate.js` is **on main already, not Phase B** | `building_footprints`, `'v2-building-centroid-in-parcel'`, slug IN-lists |
| `*_FORCE_FULL` as a standard descriptor field (4 exist, all ad hoc) | the env var name |

⚠️ **Six behaviours a conversion must KNOWINGLY preserve** — each an undefended fence otherwise:
1. `link-wsib`'s config validation + `--dry-run` parse **hoisted above the lock and gate** — validation is not bypassable behind a green SKIP (A1/A2).
2. An own-version signal for operator-edited inputs with **no `pipeline_runs` producer** (`wsib_fuzzy_match_threshold`; `archetype_cost_rates` + `cost_escalation_index`) — absent prior ⇒ CHANGED, fail-safe.
3. `rates_as_of = MAX(updated_at)`, **never** `MAX(as_of_date)` (D#2) — two distinct clocks, do not collapse them.
4. The D#3 **single-query** read of index value + version (torn-read fix).
5. `enrich-heritage` ordering: `assertPreconditions` → `assertVersionColumn` → `countStale`, on **both** branches; `countStale` mirrors `ENRICH_SQL`'s geom predicate exactly.
6. `gated_skip: true` — `/api/quality`'s `detectDurationAnomalies` cannot tell a gate skip from a fast run without it.

> ⚠️ **The highest-value thing the library can do that Phase B could not:** derive `UPSTREAM_SLUGS` from the generated lineage map. `compute-parcel-cost-estimates.js`'s hand-maintained array **had already drifted** — it omitted `sources:parcels`, a producer `data-lineage-map.md` already named — and the fix is filed as a followup in the file itself.
>
> ⚠️ **Do NOT assume the massing-gate shape generalizes to `enrich_parcels`.** Rated **LOW / unverified** and named as the main risk to that recommendation; `enrich_parcels`' comps window is **clock-relative** (`:1085`), so no count- or watermark-based gate can ever skip it.

### P3 — Envelope + **ONE GREEN CLOUD RUN** — the launch gate

⚠️ **`chain_sources` runs clean locally and has never completed cleanly in the cloud.** Six runs reached `completed_with_warnings`; every failure is envelope (timeout, kill, strand), none is data.

> **Converting steps while the chain cannot complete makes a conversion regression indistinguishable from the pre-existing envelope failure.** This is the sequencing error Spec 121 §12 made — it gated on the envelope *code* landing, never on a run *succeeding*.

- [ ] Raise ceilings into the **150 minutes of unused headroom** (180 of 360 used).
- [ ] Port F2 (per-step ceilings) + F3 (duration tripwire) — **already written**, branch-only.
- [ ] ⚠️ **CORRECTED — the strand premise was FALSE.** Spec 120 §9.3 ① says these three *"strand a `running` row **on any throw**"*. Re-executed: `assert-schema.js` has **11 `try` blocks**, `assert-data-bounds.js` 9, `assert-engine-health.js` 4 — **no explicit throw in any of the three can strand a row**; each is caught, or fires after the finalize. `"0 finally"` is also irrelevant to the lock: `pipeline.js:905` uses `pg_try_advisory_xact_lock` with its own `finally { client.release() }`. **The real surface is process death (OOM / SIGTERM / ceiling kill) inside the un-`try`'d INSERT→UPDATE windows** (`assert-schema.js:276→:289`, `:449→:546`). Fix THAT — a `try/finally` around the window — not the throw sites. Correct Spec 120 §9.3 ① in the same commit.
- [ ] Fix null `skip_reason` — only 1 of 3 `INSERT … 'skipped'` sites writes a message.
- [ ] **Exit: one clean `chain_sources` run in the cloud.** Not `completed_with_warnings`.

---

## THE PROGRAMME

Claim counts are `[generated]`. Full per-claim table: `docs/reports/generated/123-claim-plan.md`.

| Stage | What | Claims | WF | Entry criterion |
|---|---|---:|---|---|
| **S1** | ⚠️ **Freeze the 17-category contract** — detail below | 22 | WF1 | P3 green |
| **S2** | `pipeline.step()` core + **the validator, baked in** | 63 | WF1 | S1 |
| **S3** | Conformance suite + ⚠️ **the ast-grep shape rule** | 26 | WF1 | S2 |
| **S4** | State tables (migrations 245–248) + DB CHECKs | 18 | WF1 **Cross-Domain** | S2 |
| **S5** | Cross-step ledger generator + drift guard | 19 | WF1 | S1 |
| **S6** | Violation suite — register, ratchet, reversion harness, census, incident replays | 81 | WF1 | S2, S5 |
| **C1** | ⚠️ **Pilot BY ARCHETYPE — 8, not 3** (detail below) | +55 each | WF2 **full panel** | Gate S |
| **C2** | **Kill criteria evaluated** — any one fires ⇒ stop and redesign | — | — | C1 |
| **C3** | Freeze template; publish smallest + largest as exemplars | — | — | **C2 clean** |
| **C4** | Shared steps — **10 touching `sources` / 28 slots** (14 / 36 estate-wide) ⚠️ differential must be green in EVERY chain, up to 4 | +55 each | WF2-C **Cross-Domain** | C3 |
| **C5** | Rest of `sources` | +55 each | WF2-C | C4 |
| **C6** | permits (23) → coa (7) → deep_scrapes (4) → entities/wsib (3) | +55 each | WF2-C | C5 |

#### S1 in detail — the contract is frozen ONCE, for all 64 steps

**17 categories** (Spec 120's 13 + `database` + `counters` + `config` + `sharing`), every field explicit, `"none"` a valid value. **Spec 122 §3.0 is the contract; this stage lands it.** Operator-ratified 2026-08-23.

- [ ] **Resolve the 6 duplicate-declaration conflicts in Spec 120 §3.2** before anything is generated. `extract-vocab.mjs` **emits and exits non-zero** over them (it does not withhold output). Three were already named by Spec 121 §12.1a and independently reproduced by the extractor: ⚠️ `identity.archetype` (`INGESTOR|…` vs `ING|…`) · `identity.lock` (uniqueness scope) · ⚠️ `guards.schema_drift` (**one variant carries `warn`, the other does not — both contain `propagate`; a generator cannot choose**). Three more are borderline notation: `outputs.replay` (bans `append_unsafe` two different ways), `staleness.pending`, `guards.empty_source`.
- [ ] Generate the vocabulary — **never transcribe**: `node scripts/violations/extract-vocab.mjs docs/reports/generated/122-vocabulary.md`
- [ ] **`outputs.write_discipline`** — ⚠️ **PORT the 13 measured update classes from evidence base §3f**, do not invent. Classes **D** (`insert_only_no_retraction`, a W3 breach) and **H** (`set_based_unscoped`) are **banned for new steps**. `class` selects the generated SQL, so both become unexpressible rather than discovered later.
- [ ] **`execution.partial_fill`** — port §3g's 5 classes (atomic 8 · batched 13 · staged 1 · none 4 · mixed 1). ⚠️ **Only 1 of 13 batched steps has a recovery ledger**; two swallow flush failures outright.
- [ ] **`identity.archetype` drives a required-field profile** — port the measured census from evidence base §2 (ING 9 · ENR 6 · AST 5 · LNK 3 · MAT 1 · MCH 1 · BKF 1 · REC 1 = 27). An `ENRICHER` **cannot omit its invalidator**; an `ASSERT` **must** declare `outputs: "none"`.
- [ ] **Retire `run-chain.js:544-550`'s name-prefix dispatch** — renaming a step currently changes its runtime behaviour. `assert_engine_health` is an AST+REC hybrid held together by that prefix.
- [ ] **`sharing`** — membership and slug forms `~` **derived from `manifest.chains`, never declared** (retires `link-wsib`'s 4 hand-maintained spellings and the 8-occurrence name-drift class). `phase` becomes an explicit **map, never a ternary** — ⚠️ `link_parcels` carries two disagreeing ternaries in one file (`:186` `6 : 9` vs `:660` `6 : 7`). `on_contention` declared, because two chains CAN run concurrently and a shared step's contention is silent today (AS-D9).
- [ ] Record the **B2 budget spend**: §12.12 caps categories at 13; going to 17 is a decision, not drift.

> ⚠️ **Nothing in §3.0 may be re-litigated per step.** Extending a `!` vocabulary is **one reviewed runner change for all 64**. A step that needs an absent value escalates (§7.3 kill criteria) — it does not add one.

#### C1 in detail — one representative per archetype, four of them forced

⚠️ **Corrected 2026-08-23 from "simplest / median / worst".** Contract coverage is an **archetype** property, not a size property, because `identity.archetype` drives the required-field profile. The `assert_schema` audit proved the point: **an ASSERT forces 6 of 17 categories to `"none"`** and exercises the least of the contract any archetype can. Freezing the template against it would have frozen it against the thinnest test available.

| Archetype | Members | Representative | Write class |
|---|---:|---|---|
| ASSERT | 5 | `assert_schema` ✅ **audited — 39/40 concerns land, gap #41 found** | L |
| MATERIALIZER | **1 forced** | `link_parcel_addresses` — class **D**, a W3 retraction breach | D ⛔ |
| MATCHER | **1 forced** | `link_wsib` — dual-chain, run-ledger gate, A1/A2 config-hoist fence | K |
| BACKFILL | **1 forced** | `compute_centroids` — ⚠️ **the centroid defect itself** | E |
| RECORDER | **1 forced** | `refresh_snapshot` — verdict PASS-only, all rows INFO | M |
| INGESTOR | 9 | `load_ravines` — 4 `finally`, drift + mass-delete overrides, two-tier gate | B |
| LINK | 3 | `link_massing` — the only code+data signal (G3), full retraction | F |
| ENRICHER | 6 | `enrich_parcels` — 2,153 lines, 5 passes, scope-defer, clock-relative gate | J |

- [ ] Run the §3.0f **contract coverage audit** on each — every declarable item mapped to a home; anything left that is not compute is a gap
- [ ] ⚠️ **8 archetypes do NOT cover the 13 write classes** (ING spans A/B/C; ENR spans G/H/I/J/K). Accepted: classes are covered by the ported `write_discipline.class` enum, not by conversion. **Say so, do not let it read as full coverage**
- [ ] **Freeze the template after the eighth, never the first.** If any of the 8 forces a contract change, the count is however many it takes (§7.3)
- [ ] Each audit's gaps feed §3.0's frozen contract **before** C3

#### S3 — the three enforcement conditions (Spec 122 §5), operator-ratified 2026-08-23

- [ ] **A1** descriptor is a **data-only sibling `<slug>.descriptor.json`** — without it the ledger cannot be built without executing 27 modules
- [ ] **A2** ⚠️ **the ast-grep shape rule is MANDATORY** — step files must be exactly `module.exports = pipeline.step(desc, fn)`; `pipeline.run(` banned in manifest files. **Without it a step can simply never call in, and §4 is a style guide**
- [ ] **A3** Step-0 reconcile becomes a **`reconcile` step at the head of `manifest.chains.sources`** — it also owns `published_batch` rollback

### Per conversion — 55 claims, every time

`docs/reports/generated/123-per-step-checklist.md`. Nine commits per Spec 123 §7; gates G0–G8 plus **G4d** (every fence has a both-directions lock test) and **G-shape**.

> **Ship at ≥14/17 with G6, G7, G8 full. Any zero in G6–G8 is a hard stop.**
> ⚠️ **Expect the 55 to GROW per step** — P3's Intent Ledger surfaces fences that become additional locks. Growth is the procedure working.

---

## Standards Compliance

* **Try-Catch Boundary:** P0's four scripts must **fail loud** on a missing `DATABASE_URL` — a silent fallback is the defect.
* **Unhappy Path Tests:** every checker ships a known-bad fixture and CI asserts it FIRES (Spec 121 §12b.6) — **eleven measured instances of checkers reporting green because they never looked.**
* **logError Mandate:** N/A for `scripts/` — the corpus uses `pipeline.log.*` (`logError` is **0/27**, measured). The library standardizes this.
* **UI Layout:** N/A except S4 and C4 (admin consumers of the status vocabulary) — desktop-first `md:`.
* **Database Impact:** **YES** — migrations **245–248** at S4, plus P1's trigger arm. Both need UP+DOWN, RLS, `-- FK-EXEMPT` rationale, and `validate-migration.js` exit 0.

## Execution Plan

**Order of execution** (each stage's own checklist is above; this is the sequence, not a second list):

1. **P0** audit instrument (WF3, ~1h) → re-baseline → re-verify stale-certified fixes
- **P1** centroid invalidator (WF3, red-first)
- **P2** Phase B lands, migration order, byte-identity check on the two amended commits
- **P3** envelope + **one green cloud run**
- **Gate S:** S1–S6, each WF1 with full panel at both altitudes
- **C1** pilot 3 → **C2 kill criteria** → **C3** freeze → C4 → C5 → C6
- Regenerate both generated artifacts and assert zero drift at every stage exit


**PLAN COMPLIANCE GATE (§11):** Database Impact **YES** (migrations 245–248 + P1's trigger; UP/DOWN, RLS, FK-exempt rationale declared) · Pipeline Script Modified **YES** at C-stages (§9.4 — the library IS the SDK path) · Cross-Layer Contracts: the status vocabulary crosses to 8 admin consumers plus an exact-set lock at `check-pipeline-freshness.logic.test.ts:62` — S4's DB CHECK is the tier-1 guard · Pre-Review Self-Checklist per conversion.

### ⏳ Open before authorization

Two censuses in flight; both feed stages already written, neither changes the shape:
1. **Test-infrastructure census** → Spec 123 §4 must EXTEND the existing suffix/CI conventions, not invent a parallel set (Q1–Q3).
2. **Phase B integration census** → pins which Phase B machinery is UNIVERSAL vs STEP-SPECIFIC, and confirms `npm run verify` state on the branch.

> ## PLAN LOCKED. Do you authorize this programme plan? (y/n)
>
> §11 note: **P1 is a declared deviation from Spec 121 §4.3** — that section says pin a DEFECT and fix it after conversion; the centroid defect is fixed *before* because it is upstream of the differential itself, and pinning a wrong join key poisons every subsequent golden master. Stated rather than taken silently.
