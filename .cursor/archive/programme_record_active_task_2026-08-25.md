# Active Task: Step Optimization Programme — implementation plan (v2, R1–R6 applied)
**Status:** Implementation *(authorized by operator 2026-08-23; grounding pass + DeepSeek review running concurrently with P0)*

> **SOURCE OF RECORD** for the programme sequence (Spec 122 §10). Promoted 2026-08-23 from `.cursor/queued_task_step_opt_programme.md` (now a pointer) with the six operator-ratified rulings **R1–R6** and vocabulary rulings **V1–V6** applied — see Spec 122's round-2 ratification block. ⚠️ `build-active-task.mjs` still targets the old path — retarget or retire at S0; do not run until then.
> Prior task records preserved: Spec 122 authoring → `.cursor/closed_task_spec122_authoring_2026-08-23.md` · P0 + Phase B + step-runner context → `.cursor/closed_task_p0_phaseb_programme_2026-08-23.md`.

## Context

* **Goal:** Standardize all 27 `sources` steps **in place** — each script keeps its path, lock ID and `run-chain.js` invocation — by moving every non-compute concern into `pipeline.step(descriptor, compute)` with the validator baked in. Then the estate's remaining 37 distinct steps.
* **R1 framing (binding):** this is a **re-architecture of the entire non-compute lifecycle, delivered incrementally** — budgeted as a programme, never as a per-step cleanup pass. The Spec 122 §1 coverage audit is the evidence: 3 structurally failed menus · 6 missing P0 categories · extractor coverage 8/17 · §3f write-class labels wrong for 5 of 27 steps (2 of the 13 classes wrong at source) · 54 unadjudicated orphans.
* **Target Specs:** **122** (architecture, incl. round-2 rulings R1–R6/V1–V6) · **123** (assessment + validation procedure) · **121** (method — GOVERNS) · **119** (backend verification doctrine — governs over all).
* **Domain Mode:** **Backend/Pipeline** (`scripts/`, `migrations/`) → `scripts/CLAUDE.md`. S4 and C4 additionally touch admin consumers → **Cross-Domain** for those two only.
* **Workflow:** WF1 per S-stage · WF2-C per conversion (reduced grounder roster, Spec 121 §12.14b) · WF3 for P0/P1.
* **Rollback anchor:** `1cb4e308`.
* **Claims:** `[generated — plan-claims.mjs]` **290 claims · 235 UNIVERSAL · 55 PER_STEP · zero unassigned · tiers sum to 290.** Full per-claim table: `docs/reports/generated/123-claim-plan.md`. Per-step checklist: `docs/reports/generated/123-per-step-checklist.md`. *(Terminology, so three numbers stop reading as a contradiction: "zero unassigned" is `plan-claims.mjs`' tier/scope/stage axis; the **54 orphans** are `map-categories.mjs`' contract-home axis; the **3 DEAD** (#1/#145/#158) stay counted in the 290 with verdict DEAD — three generators, three axes.)* **R2 corollary:** the certified artifact migrates off prose — `step.schema.json` is canonical from S1; the S6 test manifest becomes the claim register.

## ⚠️ THE SHAPE: TWO PARALLEL TRACKS (R3)

| Track | Stages | Gates what |
|---|---|---|
| **P-track** (make the estate measurable + landable) | P0 → P0b → P0c → P1 → P2 → P3 | **C1** — no conversion before P3 green + P2 landed |
| **S-track** (build the standard) | S0 → S1 → S2 (vertical slice, R4) → S3 → S4 → S5 → S6 | C1 needs S1 + S2-min + S3(A2) only |

The tracks run **concurrently**. The one hard coupling: **no golden master is captured until P2 (Phase B) lands** — capturing earlier freezes pre-Phase-B behaviour and the conversion silently reverts Phase B behind a green differential.

---

## P-TRACK

### P0 — The audit instrument is lying `[MEASURED 2026-08-23]` · **WF3** · first

Four named scripts default to the pre-cutover database when `DATABASE_URL` is unset — but the class is **24 files**, in three tiers (`grep -rln "localhost:5432\|host: 'localhost'\|host: process.env.PG_HOST" scripts/`):

| Same audit, same commit | `localhost:5432/buildo` (default) | `127.0.0.1:54322/postgres` (authoritative) |
|---|---:|---:|
| migrations applied | 222 | **241** |
| HIGH/MED violations | **2,394** | **30,288** |
| FAIL-gated checks | **0** | **1** |
| `max_build_dim_below_floor` | **0 — PASS** | **27,984 — GATE→FAIL** |

| Tier | Files | Resolution today | Does "require `DATABASE_URL`" help? |
|---|---:|---|---|
| 1 — no env escape | **3** | hardcoded pool: `p14-trade-attachment-evaluation.js:80` · `wf3-cost-coherence-sanity.js:32` · `wf3-sample-full-dump.js:13` | ⛔ no |
| 2 — `PG_*` only | **11** | `PG_HOST \|\| 'localhost'`; ⚠️ **includes `cost-estimates-sanity-audit.js`** (`grep -c DATABASE_URL` → 0) | ⛔ no |
| 3 — reads `DATABASE_URL` | **10** | incl. `parcel-sanity-audit.js` (6 refs), `migrate.js` (5) | ✅ yes |

- [x] `scripts/lib/resolve-db.js` — **one** resolver. Fails loud with no target; **asserts `current_database()` + a `min_migration` floor** before returning a pool (same mechanism as concern 32, applied to tooling).
- [x] Convert all **24**: tier 3 first (⚠️ **`migrate.js` first of all** — a migration applier that can silently target the wrong DB is the worst instance; ⚠️ and migrate.js is the ONE sanctioned floor exemption — its job is raising below-floor DBs, so it gets explicit-target + `current_database()` assert but NO floor), then tier 2, then tier 1.
- [x] ⚠️ **GROUNDER FINDING (2026-08-23) — the census has a blind spot: the target is *every tool that opens a pool*, derived, not the literal grep's 24.** `createPool()` (`scripts/lib/pipeline.js:112-145`) defaults to `PG_HOST||'localhost'` / `'buildo'` — the 222-migration DB — and the grep pattern misses that idiom. **13 further tooling files** call it (incl. `generate-lineage-docs.mjs` — **S5's own generator** — ~7 `scripts/analysis/*`, the backfill, 2 one-time, `local-cron.js`, `run-step.mjs`): convert them too. Do NOT change `createPool()`'s default itself in P0 (blast radius = 27 steps + run-chain + cloud cron, unmeasured) — file a followup: retire the default fail-loud in a separate measured commit. **[DONE 2026-08-23 — 13 converted; `supabase-load-gates.js` + `run-step.mjs` stand in for `backfill-smeared-enriched-status.js`, which uses `pipeline.run` not `createPool()` and is filed MED in review_followups.]**
- [x] Red-first: each refuses with no target, and refuses a below-floor database.
- [ ] Re-run both Reality-Check instruments against `54322` — **the first true defect inventory**. Re-verify every fix certified against the stale DB (`max_build_dim_below_floor` is one; *"inert-INFO expected post-fix"* wording suggests others). File findings.

### P0b — `npm run verify` FAILS ON THIS BRANCH `[MEASURED 2026-08-23]` — the failed tests ARE plan items

Three pre-existing problems, none from the working tree:

| # | Failure | Cause | Fix |
|---|---|---|---|
| 1 | **lint — 3 errors** (verify exits before `test`): `A require() style import is forbidden` at `enrich-heritage-418.logic.test.ts:111` · `enrich-parcels-optconfig.logic.test.ts:213` · `:214` | introduced by `a81c6a7c` (B3 fold D) | convert to `import`; one commit |
| 2 | **test — 6 deterministic failures**: `enrich-heritage-418.logic` (3) · `compute-parcel-cost-ledger-gate.logic` (2) · `logic-vars-registry.infra` (1) | **Windows CRLF** — `core.autocrlf=true`, no `.gitattributes`; `scripts/enrich-heritage.js` has CRLF terminators; `\n`-anchored source-scan regexes cannot match `\r\n` | `.gitattributes` (`text eol=lf`) **as its own commit on a quiet tree** — the quiet moment is after P2 lands. Widen followup `c64b81b4` (it names one markdown file; measured blast is 5 more tests across 2 files + the Husky gate) |
| 3 | **test — 2 flakes**: `control-panel-shell.ui` · `run-chain-step-timeout.logic` | pass in isolation; 5000 ms timeout under full-suite load | widen or isolate |

- [ ] **Exit (scoped): `npm run verify` green EXCEPT the 6 known CRLF failures + 2 flakes**, each recorded above — the CRLF fix is deliberately deferred to the post-P2 quiet tree, so full-green-before-P2 is unachievable as a criterion (DeepSeek HIGH, confirmed). **Full verify green + `git add --renormalize` becomes a P2 exit criterion.** (LF/CI checkout is *probably* green already — an inference, not a measurement.)

### P0c — Two CI holes `[MEASURED 2026-08-23]`

1. **No workflow runs the main vitest suite** — all 8,739 tests gated by `.husky/pre-commit` alone, bypassable with `--no-verify`.
2. **`db-tests.yml` has no `scripts/**` path filter** — only the literal `scripts/migrate.js`; a PR changing a pipeline step cannot trigger the DB tier.

- [x] Close both, or ~290 claims are enforced by a skippable hook and per-step DB tests never run in CI.

### P1 — The centroid invalidator · **WF3** · the one sanctioned behaviour-change-before-conversion

`parcels.centroid_lat/lng`: geometry-derived, **no invalidator on any path**, join key for `link-parcels.js:415-423` — and **NOT** for `link_massing` (`:237`/`:434` is a NOT-NULL eligibility filter; the real predicate at `:293` joins parcel geom vs the building's centroid). Migration 242 covers two stamps; `load-parcels.js:353-361` covers three others; neither covers centroids. Filed HIGH 2026-08-23. **Declared deviation from Spec 121 §4.3** (fix-before-convert): the defect is upstream of the differential itself — pinning a wrong join key poisons every subsequent golden master.

- [x] Red-first: move a parcel's geometry → both centroid columns go NULL.
- [x] Fix: a **NEW migration** (next free number) that `CREATE OR REPLACE`s migration 242's trigger **function** to add the fourth arm (universal — centroids are geometry-derived exactly like the stamps it covers). ⚠️ **Never edit 242 in place** — it is applied locally; an in-place edit would not re-run locally and would ship a divergent 242 to cloud (DeepSeek CRITICAL, adjudicated CONFIRMED).
- [x] Assert the next `compute_centroids` run refills them.
- [ ] Re-measure the **`link_parcels`** link rate before/after (not `link_massing`).

### P2 — Phase B lands · **17 unlanded commits** · prerequisite AND golden master

`git cherry` shows **23 `+`** (20 at the v1 census, +3 Spec-122 doc commits since), of which three are on main under amended hashes (`67663a81`→`cdaea415` · `eff28a7e`→`bc87d292` · `1cb4e308`→`91567f6f`; content-verified by empty `git diff origin/main HEAD --stat -- <files>`, subjects grounder-verified on origin/main). Migrations 240/242/243/244 are **applied locally** (`schema_migrations` keyed by `filename`); **pending is cloud-side only**.

**The commit manifest** `[git cherry origin/main HEAD, 2026-08-23; hashes+subjects grounder-verified]` — 23 `+` total = 3 amended-landed (dropped at rebase) + **17 landing set** + 3 Spec-122 doc commits (branch-only, ride along, not part of the unit):

| Group | Commits (dependency order) |
|---|---|
| **B1** | `0b230472` source-version lib + tier-2 content-hash gate · `e279b2b0` docs: heritage tier-1 helper inconsistency |
| **B2** | `912a640a` migration 240, massing watermark + pass-3 scope · `e8793c8f` B2+C5 scope-defer + `step_completeness` one-contract |
| **F2/F3** | `766424fe` per-step ceilings · `c856c093` duration trend tripwire · `539c40a7` F2 followup (flaky 60ms margin) |
| **B3** | `74653a8f` run-ledger gate ×3 + enrich-heritage #418 port |
| **B3 folds A–F** | `2633c1cb` A · `b92ad16f` B · `11594fcc` C · `a81c6a7c` D · `1ffa7478` E · `4bb44fbb` F |
| **docs** | `c64b81b4` B3-verification findings · `514568fa` stats-reaper masking · `15951ec8` comparable_builds blanket UPDATE |
| *(separate)* | Spec-122 authoring: `aeb5703d` · `843cc44f` · `623a1ce8` — land whenever, not P2-coupled |

- [ ] Land the **17 as ONE unit** in dependency order: **B1 → B2 → F2 → F3 → B3 + folds A–F.** ⚠️ No subsets — B3 needs B1's lib; F2/F3 need B2's `run-chain.js` region + `step_completeness` contract; folds A–F make the gate correct. Partial landing destroys the diff baseline.
- [ ] **Landing mechanics (explicit):** rebase onto `origin/main` **dropping the 3 amended-landed commits**, or cherry-pick the landing set onto a fresh branch off main — "content-verified by empty diff" does not by itself guarantee a clean merge from a stale merge-base (DeepSeek MED, confirmed). Later branch commits (P0/P0b/P1 fixes, the lint fixes to fold-D's test files) **ride along in the landing** — they are commits on top of the unit, not conflicts with it. Verify after: `git cherry origin/main HEAD` clean + empty diffs.
- [ ] ⚠️ **No golden master for `link-wsib` / `link-parcel-addresses` / `compute-parcel-cost-estimates` / `enrich-heritage` until this closes.**
- [ ] Fix the `parcel-lookup.db.test.ts` schema-drift RED **on the branch, as part of the landing unit — the landing must be green, not fixed-after** (DeepSeek HIGH, confirmed). (**B2's** mig-240 `massing_enriched_at` — invisible to `npm run test` because Husky never sets `BUILDO_TEST_DB=1`.)
- [ ] Exit: `git cherry origin/main HEAD` clean of Phase B; 240/242/243/244 applied **to cloud** and verified.

**Library vs descriptor split** (feeds S2) `[READ 2026-08-23]`:

| → the library (UNIVERSAL) | → the descriptor (STEP-SPECIFIC) |
|---|---|
| all of `source-version.js` (483 lines, absent from main) — ⚠️ `classifyOutcome` + 3 `OUTCOME_*` consts have zero production callers: adopt as the real outcome enum or knowingly retire | the four `load-*.js` local `skipCheckDecision` thunks + per-dataset options |
| `buildSkipGateRecordsMeta` — already the row-derived verdict cascade | `carryMetricNames` / `carryMetricPrefixes`, `phase`, `name` |
| `parseDeferMarker` + `resolveChainStatus` + 4-consumer propagation — make it ONE ladder (`run-chain.js:110-121` is hand-synced) | `computeDeferScope`'s four per-pass counts + threshold |
| the `step_completeness` 6-field contract (F3's input — an interface) | — |
| the massing-gate archetype (data+code veto; `--full` as a *permit*; note `massing-full-gate.js` is on main, not Phase B) | `building_footprints`, `'v2-building-centroid-in-parcel'`, slug IN-lists |
| `*_FORCE_FULL` as a standard descriptor field (**6** exist, all ad hoc — grounder-measured 2026-08-23; v1's "4" was an undercount, consistent with Spec 122 §3.2's 6-hatch census) | the env var name |

**Six fences a conversion must KNOWINGLY preserve:** ① `link-wsib` config validation + `--dry-run` parse hoisted above lock and gate (A1/A2) · ② own-version signal for operator-edited inputs with no `pipeline_runs` producer (`wsib_fuzzy_match_threshold`; `archetype_cost_rates` + `cost_escalation_index`) — absent prior ⇒ CHANGED · ③ `rates_as_of = MAX(updated_at)`, never `MAX(as_of_date)` (D#2) · ④ D#3 single-query read of index value + version · ⑤ `enrich-heritage` ordering `assertPreconditions` → `assertVersionColumn` → `countStale` on both branches, `countStale` mirroring `ENRICH_SQL`'s geom predicate · ⑥ `gated_skip: true` for `/api/quality`'s `detectDurationAnomalies`.

⚠️ Do NOT assume the massing-gate shape generalizes to `enrich_parcels` — its comps window is clock-relative (`:1085`); no count/watermark gate can ever skip it (Spec 122 Q3).

### P3 — Envelope + ONE GREEN CLOUD RUN — **gates C1 (R3), not the S-stages**

`chain_sources` runs clean locally, never cleanly in the cloud (six runs `completed_with_warnings`; every failure is envelope, none data).

- [ ] Raise ceilings into the unused headroom — ⚠️ the inherited figures disagree (v1 said "150 minutes of headroom" and "180 of 360 used"; 360−180=180): **re-measure the actual workflow budget at P3 entry** before picking ceilings (DeepSeek LOW, confirmed inconsistency).
- [ ] Port F2 (per-step ceilings) + F3 (duration tripwire) — already written, branch-only (lands with P2).
- [ ] ⚠️ Strand fix targets **process death inside the un-`try`'d INSERT→UPDATE windows** (`assert-schema.js:276→:289`, `:449→:546`) — the "strand on any throw" premise was refuted; correct Spec 120 §9.3 ① in the same commit.
- [ ] Fix null `skip_reason` — only 1 of 3 `INSERT … 'skipped'` sites writes a message.
- [x] **Exit — AMENDED BY OPERATOR RULING 2026-08-25 and MET: "envelope-clean"** — `completed`, or `completed_with_warnings` where **every** warning traces to a step-verdict data-quality WARN, none envelope-class. Evidence: runs 32753034613 (243.6 min, full backlog) + 32779094469 (202.8 min, exit 0 — first green workflow run ever); no kills/strands; all ceilings held; all 8 WARNs classified (6 known flat tails, 2 check-calibration defects filed as WF3 followups: `parcels_null_address_pct` unsatisfiable-by-design, `massing_zero_link_ghost` false day-one claim). The original literal bar would have held the C-gate hostage to data cleanup unrelated to the gate's purpose (distinguishing conversion regressions from envelope failures). **P3 CLOSED. P-track complete.**

---

## S-TRACK

### S0 — tool debt (order matters)

- [x] **F1 CLOSED** — `extract-claims.mjs` violation-column laundering bug; orphans now **54**.
- [x] Retarget or retire `build-active-task.mjs` (source of record moved to this file) and `active_task_programme.md`.
- [x] ⚠️ **`plan-claims.mjs` hardcodes a superseded stage table into its generated artifact** (grounder finding): `123-claim-plan.md` still emits "P2 — 20 commits" and "C1 — Pilot 3, simplest/median" — both refuted by v2 (17-commit unit; 8 archetype pilots). The staleness lives in the generator's own table, so "regenerate + assert zero drift" would re-emit it and pass. Fix the generator's stage table alongside the retarget.
- [x] Four spelling relaxations in `map-categories.mjs` — `empty.source` · `audit.row` · `pipeline.name` · `records_meta` (pure defects, 4 orphans).
- [x] Add the **`COMPUTE` bucket** to `map-categories.mjs` — §1.8 has three homes; the mapper implements two (the hole that let F1 hide).
- [ ] Remaining keywords only after the above.
- [ ] ~~Extend `extract-vocab.mjs` to nine categories~~ ⛔ **RETIRED BY R2** — schema is canonical.
- [ ] Run the `supports_full` census now (catches all 14 at k=0): 7 of 14 declare and do not honour; nothing reads either flag.

### S1 — the contract, **schema-canonical (R2)** · WF1 · entry: S0 (⚠️ NOT P3 — R3)

- [x] **The 6 vocabulary conflicts: RESOLVED** — operator-delegated rulings **V1–V6** recorded in Spec 122's round-2 block (archetype full words · lock unique across manifest ∪ `one-time/` ∪ `backfill/` · `schema_drift` = `none|propagate|pause`, `warn` dropped · `append_unsafe` stays in enum ⛔ banned-for-new · `pending` dissolved into the 3-axis reshape · `empty_source` typed `<table>|none`).
- [ ] **Author `scripts/steps/_schema/step.schema.json` directly as the canonical vocabulary**, encoding V1–V6 + the reshaped menus: per-target `outputs.writes[].write_discipline` (13 classes, D/H ⛔ banned-for-new) · 3-axis `staleness` (`scope`/`trigger`/`mode_select` + `fingerprint_inputs`) · `execution.on_row_error`/`on_batch_error`/`on_check_error`/`on_degrade` · `execution.invocation` (manifest⟷descriptor drift check) · `identity.display_name`.
- [ ] **Generate `122-vocabulary.md` and Spec 122's menu tables FROM the schema**; demote `extract-vocab.mjs` to one-time migration tool.
- [ ] **R6 adjudication — categories vs fields** for the six missing P0 behaviours: `acquisition` (candidate: `staleness.trigger` lifecycle position + `inputs.externals` cache policy) · `maintenance` (candidate: `execution.maintenance`) · `terminals` · `plan_shape` · `source_key_policy` · `guards.requires.on_missing`. Record each ruling; the B2 complexity-budget spend is a decision, not drift.
- [ ] ⚠️ **`guards.schema_drift` needs a per-target/conditional form** (grounder finding): `load-zoning.js:405-407` is a CONDITIONAL drift response — base layers FAIL (pause), non-base WARN (propagate), in one step. A scalar cannot express it. Adjudicate the field shape here with R6, not at pilot 6 (`load_zoning` sits behind the INGESTOR pilot). V3's `warn`-drop itself is grounder-CONFIRMED safe — the three corpus warn-sites re-home onto `propagate` + `severity: WARN`.
- [ ] Five missing fields (Spec 122 §12.3): `outputs.columns[].vocabulary` · `checks[].accept_until` · `outputs.write_inventory` · `why` liveness · redaction.
- [ ] **Orphan triage (R5):** 54 orphans in batches — contract-must-express / runner-owned / defer-with-reason — **pilot-archetype-touching first**. Not a monolithic freeze gate.
- [ ] `identity.archetype` drives the required-field profile — port the census (ING 9 · ENR 6 · AST 5 · LNK 3 · MAT 1 · MCH 1 · BKF 1 · REC 1 = 27). An ENRICHER cannot omit its invalidator; an ASSERT must declare `outputs: "none"`.
- [ ] Retire `run-chain.js:544-550` name-prefix dispatch — **`identity.gate_exempt` is an explicit schema field, listed here as a deliverable** (the archetype-alone claim is refuted; without the field the retirement cannot happen — DeepSeek MED, confirmed).
- [ ] `sharing`: membership + slug forms `~` derived from `manifest.chains`; `phase` an explicit map never a ternary (`link_parcels` `:186` `6:9` vs `:660` `6:7`); `on_contention` declared. ⚠️ The map's correct non-sources VALUE for `link_parcels` is **adjudicated at that step's PH-3 intent ledger** (git-history question), not at S1 — S1 defines the field; the conversion supplies the truth (DeepSeek MED, resolution assigned).
- [ ] ⚠️ Write-class re-derivation stays per-conversion PH-0 (R5) — **except the 5 already-known §3f mislabels** (`load_heritage` · `load_zoning` · `neighbourhoods` · `link_wsib` · `refresh_snapshot`): re-derive those at S1 as the **menu-completeness check**, so the schema's 13-class enum is not authored against known-bad data (DeepSeek MED, confirmed in part — the enum, not per-step labels, is what S1 freezes).
- [ ] **The contract FREEZES at C3** (after the eighth pilot), not at S1 exit. S1 ships the schema as v0.

### S2 — `pipeline.step()` + validator, **as a vertical slice (R4)** · WF1 · entry: S1

- [ ] **S2-min:** the minimal library the `assert_schema` pilot needs — descriptor AJV-validate-before-compute (factory, opens no pool: claim #86) · ledger row in a `finally` · row-derived verdict from `checks` (never a parallel boolean) · advisory lock with `run_id` fencing · `records_meta` emit · reconcile hand-off (A3's `reconcile` head step) · ⚠️ **per-chain check selection (`checks[].chains` + minimal `sharing.varies_by_chain`)** — `assert_schema` is shared ×3, so S2-min without it cannot run the first pilot, and a shared pilot's differential must be green in **every chain it appears in** even at C1 (the C4 rule applies to any shared step regardless of stage; DeepSeek HIGH, confirmed).
- [ ] **Growth waves, pilot-by-pilot:** generated write SQL from `write_discipline` (INGESTOR pilot) · staleness/gating axes + run-ledger gate (INGESTOR/ENRICHER) · invalidation + counters scoped by `writes.key` (LINK/MATCHER) · quarantine/checkpoint/partial_fill (BACKFILL) · publish/WAP (RECORDER) · scope-defer (ENRICHER).
- [ ] The 63 S2 claims discharge **across the waves**; the stage closes when all 63 hold — after pilot 8, not before pilot 1.
- [ ] Ledger-row ownership consolidates from `run-chain.js:716-732` into the library (claim #39, within the ~25–30-line budget).

### S3 — enforcement trio · WF1 · entry: S2-min (A2 ships **with the first pilot**, not later)

- [ ] **A1** data-only sibling `<slug>.descriptor.json`.
- [ ] **A2** the ast-grep shape rule — the frozen file shape (Spec 122 §5.1: 7 code lines incl. the two re-exports), `pipeline.run(` banned in manifest files, known-bad fixture, wired to pre-commit + CI. **Without it §4 is a style guide.**
- [ ] **A3** `reconcile` step at the head of `manifest.chains.sources` (owns `published_batch` rollback).
- [ ] Conformance suite incl. `loaded.length === manifest file count` (silent-import-death guard) and the §5.4 source-text-loop convention (`const ADVISORY_LOCK_ID = <n>;` stays textual; one regex widening at `pipeline-advisory-lock.infra.test.ts:259-260`).

### S4 — state tables · WF1 **Cross-Domain** · entry: S2

- [ ] Migrations 246–249 (⚠️ 245 consumed by P1's centroid invalidator) + DB CHECKs (18 claims). "Optional" = deferrable to the second wave, not unnecessary — `pipeline_intervals` (#74: `--backfill` has no implementation without it), `published_batch`, `step_error`, `step_quarantine`.

### S5 — cross-step ledger · WF1 · entry: S1

- [ ] Execute `.cursor/queued_task_step_contracts_wf1.md` (GENERATE → GUARD → CONSUME): `stepUpstreams(slug)` derived from lineage, retiring the 3 hand-written upstream arrays (`link-parcel-addresses.js:61-64` · `link-wsib.js:69-72` · `compute-parcel-cost-estimates.js:85`) — lands red-first by construction.
- [ ] Five edge classes; ordering-consistency claim (a reader may not precede its producer — replaces dead #145); re-derive lineage numbers (L-4: the map does not reconcile with itself).
- [ ] Fix the false ordering lock `chain.logic.test.ts:173-174` (`enrich_ravines` does not read `link_parcels` output).

### S6 — violation suite · WF1 · entry: S2, S5

**S6a — PRECEDES C1 (in the C-gate):** the two items C1's gate math depends on (DeepSeek HIGH, confirmed — without them "55-A proven red" is undefined at pilot 1):
- [x] K-axis in `plan-claims.mjs`: **229 PER_STEP · 48 MIXED · 13 FLEET** *(derived 2026-08-25 — supersedes the earlier 227/50/13 estimate; the ±2 is the #20/#197 boundary ruling: single-artifact-fixed-at-S1 obligations are PER_STEP, documented at `EXPECTED_K`)*; totality `stage >= arming_stage` + monotone-partial are ONE mechanism, both hard-fail, proven by 17 self-test assertions + 6 real-register mutations.
- [x] 55-item split: **55-A (44, hard gate) / 55-B (5, partial-now, two time-armed) / 55-C (6, deferred with k named: #160 k=2 · #161 k=20 · #168 k=27→C6 cross-chain · #177/#178/#179 k=27 AND blocked on `nock` — S6b must resolve the library before any conversion gates on them)**. Derived (A=PER_STEP, B=MIXED, C=FLEET within the 55), not hand-listed. k=27 arms at **C5** (rest of sources); only cross-chain #168 names C6.

**S6b — the suite proper (may trail into the pilot window):**
- [ ] Every FLEET claim carries a monotone partial (`⊆` not `==`) or the generator hard-fails.
- [ ] Vacuity DECLARED, never grepped (`load_zoning` is fully spatial via `lib/geometry-validator.js:46`).
- [ ] `nock` not installed — claims 177/178/179 unimplementable as written; resolve.
- [ ] Register, ratchet, reversion harness (vitest JSON reporter identities; hard-fail on clean-patch-empty-red-set), census, incident replays (fence population 87–175 by predicate — state which).

---

## C-TRACK — conversions · entry: **P3 green + P2 landed + S1 + S2-min + S3(A2) + S6a**

⚠️ **Pilot ORDER within C1:** S5-independent pilots first — `assert_schema` → `load_ravines` → `link_massing` → `compute_centroids` → `refresh_snapshot` → `enrich_parcels`; **`link_wsib` and `link_parcel_addresses` run only after S5** — their hand-written upstream arrays retire into `stepUpstreams()`, and converting them before S5 would enshrine the arrays in descriptors (DeepSeek HIGH, confirmed in part).

| Stage | What |
|---|---|
| **C1** | **Pilot BY ARCHETYPE — 8** (below), starting `assert_schema` against S2-min, each pilot growing the library (R4). Per-step: 55-A claims proven red, nine commits, G0–G8 + G4d + G-shape. WF2 full panel |
| **C2** | Kill criteria evaluated — any one fires ⇒ stop and redesign (descriptor >20 lines beyond categories · any per-step override · runner concepts leaking into compute · unexplainable differential) |
| **C3** | **Freeze the contract + template — after the eighth pilot, never the first.** Publish smallest + largest exemplars |
| **C4** | Shared steps — 10 touching `sources` / 28 slots (14 / 36 estate-wide); ⚠️ differential green in EVERY chain, up to 4. WF2-C Cross-Domain |
| **C3b** | **Fleet descriptor view** *(operator-requested 2026-08-25)*: generator sweeping `scripts/*.descriptor.json` → a steps × 18-categories matrix (tier-2, drift-guarded like the lineage map — A1 makes this executable-free) + an admin **Step Registry** page rendering declaration beside last-run observation (Cross-Domain; complements S5's edge ledger — settings view vs dependency view). Lands after C3 so it renders the frozen contract, seeded with the 8 pilot descriptors |
| **C5** | Rest of `sources` (WF2-C) |
| **C6** | permits (23) → coa (7) → deep_scrapes (4) → entities/wsib (3) |

**The eight pilots** (contract coverage is an archetype property; four are forced single-member):

| Archetype | Members | Representative | Write class |
|---|---:|---|---|
| ASSERT | 5 | `assert_schema` ✅ audited — 39/40 concerns land, gap #41 found | L |
| MATERIALIZER | 1 forced | `link_parcel_addresses` — class **D**, a W3 retraction breach | D ⛔ |
| MATCHER | 1 forced | `link_wsib` — dual-chain, run-ledger gate, A1/A2 config-hoist fence | K |
| BACKFILL | 1 forced | `compute_centroids` — the centroid defect itself | E |
| RECORDER | 1 forced | `refresh_snapshot` — verdict PASS-only, all rows INFO | M |
| INGESTOR | 9 | `load_ravines` — class B, 4 `finally`, drift + mass-delete overrides, two-tier gate | B |
| LINK | 3 | `link_massing` — the only code+data signal, full retraction | F |
| ENRICHER | 6 | `enrich_parcels` — 2,153 lines, 5 passes, scope-defer, clock-relative gate | J |

⚠️ 8 archetypes do NOT cover the 13 write classes (ING spans A/B/C; ENR spans G/H/I/J/K) — accepted: classes are covered by the schema enum, not by conversion. **Per conversion (R5): PH-0 re-derives the step's write classes from code** — §3f mislabels 5 steps (`load_heritage` A→A+B · `load_zoning` A→A+B+C · `neighbourhoods` A→A+H · `link_wsib` K→E+G+K · `refresh_snapshot` M→daily-keyed upsert); verify, never trust the port. Expect the 55 to GROW per step — growth is PH-3 working.

## Standards Compliance

* **Try-Catch Boundary:** P0's resolver fails loud on a missing target — the silent fallback IS the defect.
* **Unhappy Path Tests:** every checker ships a known-bad fixture and CI asserts it FIRES (Spec 121 §12b.6 — eleven measured green-because-it-never-looked instances).
* **logError Mandate:** N/A for `scripts/` (corpus uses `pipeline.log.*`; `logError` is 0/27) — the library standardizes this.
* **UI Layout:** N/A except S4/C4 admin consumers — desktop-first `md:`.
* **Database Impact:** **YES** — migrations 246–249 (S4) + P1's trigger arm. UP+DOWN, RLS, `-- FK-EXEMPT` rationale, `validate-migration.js` exit 0.

## Execution Plan

1. **P-track start:** P0 (WF3) → P0b failed tests → P0c CI → P1 (WF3) → P2 (Phase B, one unit) → P3 (green cloud run)
2. **S-track concurrently:** S0 → S1 (schema-canonical, R6 adjudication, orphan triage) → S2-min → S3 → S4/S5 → S6
3. **C-gate:** P3 green + P2 landed + S1 + S2-min + S3(A2) ⇒ **C1** pilots (8, `assert_schema` first, library grows per pilot) → C2 → **C3 freeze** → C4 → C5 → C6
4. Regenerate generated artifacts and assert zero drift at every stage exit.

**PLAN COMPLIANCE GATE (§11):** Database Impact YES (246–249 + P1 trigger) · Pipeline Script Modified YES at C-stages · Cross-Layer Contracts: status vocabulary crosses to 8 admin consumers + exact-set lock at `check-pipeline-freshness.logic.test.ts:62`; S4's DB CHECK is the tier-1 guard · Pre-Review Self-Checklist per conversion.

> ## PLAN LOCKED. Do you authorize this programme plan (v2, R1–R6 + V1–V6 applied)? (y/n)
>
> §11 note: **P1 remains a declared deviation from Spec 121 §4.3** (fix-before-convert — the defect is upstream of the differential). New in v2: S-track no longer waits on P3 (R3); the contract freeze moves from S1-exit to C3 (R4/R5) — both are recorded rulings, not drift.
