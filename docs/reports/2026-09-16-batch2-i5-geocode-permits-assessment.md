# Batch 2 I5 Assessment — `geocode_permits`

> ## ✅ STATUS: CUT OVER — `geocode_permits` is the 14th converted step and the ENRICHER archetype's SECOND member
>
> **Scorecard: 17/17 · G9 PASS · G4d PASS · G-shape PASS · hard-stop=false.** `converted.json` 13 → 14, `pending: []`. The cutover's own consequence is the point of the whole step: `archetype_profiles[ENRICHER]` now has **two** converted members, so R-AH / R-PACE-1 eligibility is **MET** and batch 2's Phase 2 turns from *1 full + 3 compressed* into *4 compressed*. §9.10 is the cutover record.
>
> ## ▶ RESUMED at the folded commit 5 — the stop is CLOSED, §7 is superseded by §9
>
> Commits **1–4** ran on 2026-09-16 and stopped at a clean boundary because three plan premises were refuted by measurement (table below). **Batch-2 row 0.10b (`13ee7669`) then landed the ENRICHER post-phase seam**, which closes premise 1, and the orchestrator ruled premises 2 and 3. The conversion **resumed at the folded commit 5** and §9 is the record of the resumed work. §7 is kept verbatim as the stop's own evidence — it is not deleted, because the three refutations are the most reusable thing this step produced.
>
> | # | Plan premise | Measured reality |
> |---|---|---|
> | 1 | §0b / §3.1 / Ask A2: *"0.10 (`d7668b8a`) unblocks commit 7d"* | **Partially true only.** The runner's pre-phase hooks, write seams and per-target counters are generic; `scripts/lib/step/index.js:3430-3510` is still hardcoded to `enrich_parcels` — an unguarded `compute.computeAggregateRecordsUpdated` call that throws **after COMMIT**, and a `matched` literal with no `newly_geocoded` key and no per-phase contribution seam, so `records_total`/`records_updated` would resolve **`null` forever**. Found independently by two seats, re-executed here |
> | 2 | §0.3: *"Draft descriptor, validated directly → **PASS — no throw**"* | **FALSE at HEAD.** `d7668b8a` made `execution.heartbeat_minutes_from_config` and `lock_timeout_ms_from_config` **required** on the ENRICHER profile; `validateDescriptor` throws on both. Plan §5's *"one variable, and only one"* is FAIL — ruled to **3** variables (§6.2 INT-2) |
> | 3 | §9 commit 5: *"`stage: "red_suite"` … excludes G7/G8/G9 + Rules 4/11/12 from the hard stop, so early registration manufactures no false red"* | **FALSE.** Those exclusions belong to `descriptor_only`; `red_suite` is *deliberately absent* from the exclusion table. Applied, measured (`hard-stop=true`, `REAL EXIT=1`), and **reverted**. §7.1 |
>
> A fourth, smaller correction rides along: the plan's `GP-D1` mechanics were wrong in a way that makes the defect **worse**, not weaker (§2.6).
>
> **How each resolved:** (1) CLOSED by `13ee7669` (0.10b) — `execution.enrich_hooks.post_phase`, a declared step-level export called once after COMMIT, with `matched` merged under a runner-owned-key refusal and `matched.compute` finite-or-throw. (2) RULED — **three** logic variables, not one. (3) RULED **by ordering, not code** — commits 5 + 6 + 7a fold into ONE that registers `pending` at `stage: "descriptor_only"` and lands the red suite **and** the descriptor together; the validator's exclusion table is untouched. **A FOURTH ordering constraint was then measured during the resume and is recorded in §9.1** — the seeds cannot be deferred to 7b either.

**Full form reason:** the ENRICHER archetype has **one** converted member (`enrich_parcels`), so R-AH / R-PACE-1 eligibility (`template-freeze.json.archetype_profiles[ENRICHER].proven === true` **AND** ≥ 2 `converted.json` members sharing the archetype) is **NOT MET** — measured, §1.2b. The compressed form is therefore unavailable, not declined; `step-validate.mjs` fast invariant #24 (COMPRESSED-FORM-DEFAULT) is **vacuous** for this slug. This conversion is the archetype's SECOND member: it is the commit-9 cutover here that makes ENRICHER compressed-eligible and turns batch 2's Phase 2 from *1 full + 3 compressed* into *4 compressed*.

**Governing plan:** `.cursor/i5_geocode_permits_active_task.md` (Status: Implementation, AUTHORIZED 2026-09-16, all six Asks at their stated defaults — A1 `identity.spec = "60"` · A2 CLOSED by batch-2 row 0.10 (`d7668b8a`) · A3 declare the edge **and** file the accepted WARN · A4 re-measure GP-D1 at commit 1 and floor to the nearest 5 below · A5 add the Toronto-bbox plausibility row · A6 one push per step).

**Target Spec / governing specs:** `docs/specs/01-pipeline/60_shared_steps.md` §"Geocode Permits" (the only spec carrying a behavioural section for this file, and the system map's Spec 60 owner row lists it first) → `identity.spec = "60"`. Cross-cited chain specs `docs/specs/01-pipeline/41_chain_permits.md` (step 8) and `docs/specs/01-pipeline/43_chain_sources.md` (step 4); protocol spec `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§A.5 lock registry row 5; §11 Counter Semantic Contract, which names **this step twice** as its own worked example); then 122 / 122a / 123 / 124 / 119 / 121; admin consumer contract via Spec 26 (`src/lib/admin/funnel.ts`).

**Domain Mode: Cross-Domain.** `src/lib/admin/funnel.ts:39` binds this step's `geocode_coverage` audit-row **id** as the `auditMetric` of the admin "Address Matching" funnel stage; `:724-731` declares expectation bounds on its summary counters, mutations and row-delta; `:842` maps the slug to the `permits` table; `src/lib/parcels/geometry.ts:244` states in prose that it *"Mirrors the WHERE clause logic in scripts/geocode-permits.js"*. **No admin file is edited by this conversion** — §12 carries the handoff obligation, and §12 already has one live finding (below).

**Measurement environment for every number in this report:** local dev DB `postgres` @ `127.0.0.1:54322` (the `.env` target; `[i5-measure] target: … database=postgres user=postgres migrations=244 (floor 223)`), `SELECT count(*) FROM schema_migrations` = **244**, measured **2026-09-16** at HEAD `1a48520b` on branch `wf2/deep-scrapes-restore-l0`. **No cloud writes were made and no chain was run.** Every number below carries the command that produced it. **Nothing is transcribed** — the plan's §0 was measured in an isolated worktree at base `824ef357` with no DB access, and every figure here was regenerated from the tree and the live database at this commit. Where a regenerated number **differs** from the plan's, the difference is called out explicitly rather than quietly adopted (§1.7).

---

## 1. §0 / PH-0 — BOUNDARY FREEZE (G0)

> Derived by READING `scripts/geocode-permits.js` end to end (188 lines, read in full), not from the manifest, the specs or any prior report. Spec 122 R5: the ported `write_discipline` labels are re-derived here, never trusted.

### 1.1 Target-file grounding (Spec 124 R-AF — run BEFORE commit 1, per the batch-2 preamble)

R-AF: every spec naming a chained step script must classify it in exactly one Operating Boundaries list. Measured this commit, `grep -n "geocode-permits.js"` over each spec plus the system map:

| Spec | In `### Target Files`? | System-map owner row? | Action |
|---|---|---|---|
| **60** `01-pipeline/60_shared_steps.md` (owner) | **YES** — `:255`, `- \`scripts/geocode-permits.js\`, \`scripts/link-parcels.js\`, \`scripts/link-neighbourhoods.js\`` | **YES** — row 60, listed **first** | none — already classified |
| **41** `01-pipeline/41_chain_permits.md` | **YES** — `:253`, `- \`scripts/geocode-permits.js\` — step 8 \`geocode_permits\`` | **YES** — row 41 | none |
| **43** `01-pipeline/43_chain_sources.md` | **YES** — `:182`, `- \`scripts/geocode-permits.js\` — step 4 \`geocode_permits\`` | **YES** — row 43 | none |
| **47** `01-pipeline/47_pipeline_script_protocol.md` | n/a — **exempt reader** (cross-cutting architecture spec; R-AF exempts 30/40/47/48/79/118–124) | n/a | none |
| **26** Admin Dashboard | no — names `funnel.ts`, not the script | n/a | §12 handoff note only |

Spec 60 additionally carries `:264` — `- \`load-address-points.js\` — sources-chain step whose \`address_points\` table \`geocode-permits.js\` reads; referenced as context, not governed here` — i.e. the producer edge of §3 below is already written down in the owner spec's own Out-of-Scope prose. **R-AF is satisfied with no edit required at commit 9**; the commit-9 obligation for these three specs is the *prose* correction (§1.6), not the classification.

### 1.2 The file, the quadrant, the archaeology

| Measure | Value | Command |
|---|---|---|
| Lines | **188** | `wc -l < scripts/geocode-permits.js` |
| Churn (commits) | **19** | `git log --oneline -- scripts/geocode-permits.js \| wc -l` |
| `fix(` commits | **11** → fix density **57.9 %** | `git log --format="SUBJ:%s" -- … \| grep -cE '^SUBJ:fix\('` |
| Quadrant | **bottom-left** (commits 19 · lines_changed 472 · LOC@window_end 94 · branches 9) | `grep geocode_permits docs/reports/generated/122-churn-complexity.md` → `:30` |
| Advisory lock | **5** — Spec 47 §A.5 registry row 5, category "4 — Load/Ingest", *Writes Timestamps = YES (`geocoded_at`)* | `grep -n ADVISORY_LOCK_ID scripts/geocode-permits.js` → `:179`, `:183` |
| Archetype (census) | **ENRICHER**, batch C4, "C4 batching-entry §3.2 order 5" | `scripts/steps/_schema/step-archetype-census.json` |
| Chain positions | `permits` **8 of 33** · `sources` **4 of 28** — **2 chains** | `node -e` over `scripts/manifest.json.chains` |
| Manifest entry | `{file, supports_full: true, supports_dry_run: false, telemetry_tables:["permits"], telemetry_null_cols:{permits:["latitude","longitude"]}}` — **no `chain_args`** | `node -e` over `scripts/manifest.json.scripts.geocode_permits` |
| Migrations floor | `database.min_migration: 18` = `018_address_points.sql`, the migration creating the joined table (`permits.geocoded_at` predates it — it originates in `001_permits.sql`). Fast invariant #1 is `min_migration <= migrations COUNT` (`step-validate.mjs:1242`), i.e. **18 ≤ 244** ✅ | `ls migrations/ \| grep '^01'` · `grep -ln geocoded_at migrations/*.sql` · `sed -n 1239,1244p scripts/analysis/step-validate.mjs` |
| Golden dir | **14 dirs, no `geocode_permits`** — captures are net-new | `ls docs/reports/golden/` |
| Fix density note | 57.9 % on a **bottom-left** file — comparable to `enrich_parcels`' 57 %, the highest of any pilot, on the *least* churned quadrant. The fixes are concentrated in **correctness of the numbers this step reports**, not in the join it performs (§2 at commit 2). | — |

The quadrant is **bottom-left**, so Spec 123 §2's PH-3 Class-C short form is permitted; it is taken, **but not to zero** — fence density is > 0, so every fence still owes a recovered *why* (commit 2).

### 1.2b Archetype eligibility — measured, not asserted

`node -e` over `scripts/steps/_schema/{converted.json,template-freeze.json}` + each converted `*.descriptor.json`:

| Fact | Value |
|---|---|
| `converted.json.converted` | **13** entries (I4 `link_neighbourhoods` cut over at `1a48520b`), `pending: []` |
| ENRICHER members among them | **1** — `scripts/enrich-parcels.js` only |
| `archetype_profiles[ENRICHER]` | `{shapes:["enrich"], runners:["runEnrichPhase"], first_step:"enrich_parcels", proven:true}` |
| R-AH / R-PACE-1 eligibility | **NOT MET** — `proven` ✅ **AND** ≥ 2 members ❌ → **full nine-commit form is mandatory** |
| Fast invariant #24 (COMPRESSED-FORM-DEFAULT) | **vacuous** for this slug — not satisfied by an excuse |

### 1.3 Reads

| Table | Columns | Site |
|---|---|---|
| `permits` | `permit_num`, `revision_num` (the key), `geo_id`, `latitude`, `longitude`, `geocoded_at` | `:42-52` before-counts · `:108-121` after-counts · both UPDATEs |
| `address_points` | `address_point_id`, `latitude`, `longitude` | `:62` COUNT · `:79-86` the join |

`emitMeta` (`:171-174`) already declares exactly this read set plus the write set; the descriptor's `inputs`/`outputs` are a line-by-line port, not a re-derivation.

**5 SQL execution sites** (`grep -c '\.query(' scripts/geocode-permits.js` = 5): `:42` before-counts SELECT · `:62` `address_points` COUNT · `:74` W1 (on the txn `client`) · `:93` W2 (same client) · `:108` after-counts SELECT. The run clock is `pipeline.getDbTimestamp(pool)` at `:36` — SDK-owned, and not one of the five.

### 1.4 Writes — ALL of them

`grep -cE '^\s*(UPDATE|INSERT|DELETE)'` = **2**. Zero INSERT, zero DELETE. The `pipeline_runs` ledger row is SDK-owned (`pipeline.run`), retired under conversion, not declared.

| # | Site | Statement | Target columns | Scope (verbatim) | Guard | Class (re-derived) |
|---|---|---|---|---|---|---|
| **W1** | `:74-86` | `UPDATE permits p SET latitude=ap.latitude, longitude=ap.longitude, geocoded_at=$1::timestamptz FROM address_points ap WHERE …` | `permits.latitude`, `.longitude`, `.geocoded_at` | `p.geo_id IS NOT NULL AND p.geo_id != '' AND p.geo_id ~ '^[0-9]+$' AND ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END` | `(p.latitude IS DISTINCT FROM ap.latitude OR p.longitude IS DISTINCT FROM ap.longitude)` — **two columns, NOT three** | **`set_based_join_update`** (class N, LG-11) — an `UPDATE … FROM` whose SET values are per-row join results |
| **W2** | `:93-99` | `UPDATE permits SET latitude=NULL, longitude=NULL, geocoded_at=NULL WHERE …` | same three columns | `(geo_id IS NULL OR geo_id = '') AND latitude IS NOT NULL AND geocoded_at IS NOT NULL` | the `latitude IS NOT NULL` term **is** the IS-DISTINCT-FROM-NULL guard | **`set_based_null_retract`** (class O, LG-16) |

* **Both are inside ONE `withTransaction`** (`:72-101`). `execution.txn_scope: "step"`; both `execution.phases[]` declare `txn: "shared"`. **No post-commit phase.**
* `write_inventory.statements = 2` — invariant across chains and modes; **there is no mode** (§1.5).
* `grep -c "IS DISTINCT FROM"` = **2** — both executable, `:84`/`:85`: one guard, two columns.
* ⚠ **W1 has NO incremental predicate.** It is a full re-join of every permit with a numeric `geo_id`, every run; the IS DISTINCT FROM guard — not a lineage scope — is what makes it cheap. The pre-run `to_geocode` count (`latitude IS NULL AND geo_id IS NOT NULL AND geo_id != ''`) is a **reporting** scope feeding `backlog_remaining` and nothing else. **Three different "needs geocoding" definitions coexist** in this step's blast radius: W1's scope, the reporting scope, and `idx_permits_needs_geocode`'s `WHERE geocoded_at IS NULL`. The descriptor states which artifact uses which (`notes.json` `decisions[3]`, `limitations[]` GP-L3).

### 1.5 Environment / argv / logic variables / error handling

| Axis | Measured | Command |
|---|---|---|
| `process.env` | **1 site** — `process.env.PIPELINE_CHAIN` at `:164`, the audit-phase ternary. **No env override of any kind** | `grep -c process.env` = 1 |
| argv | **0 hits** for `process.argv` / `isFullMode` / `--full`. `supports_full: true` is a **dead declaration** (GP-L1) | `grep -cE 'process\.argv\|isFullMode\|--full'` = 0 |
| try / catch | **0 / 0** — no error handling at all; every failure propagates to `pipeline.run`. Nothing to port, nothing to lose | `grep -c 'try {'` = 0, `grep -c catch` = 0 |
| network | **0 hits** for `google` / `fetch(` / `http` / `axios` / `node-fetch` — the measured refutation of the Google-fallback prose in all three governing specs (§1.6) | `grep -ciE 'google\|fetch\(\|https\?://\|axios\|node-fetch'` = 0 |
| logic variables | **none exist today**; the conversion adds exactly **one** (`geocode_permits_coverage_warn_pct`). `SELECT variable_key FROM logic_variables WHERE variable_key ILIKE '%geocode%'` returns **0 rows** against 520 live rows total | live DB |
| literal thresholds | **exactly one value: `95`, twice** — `:142` (the row's `threshold: '>= 95%'` string *and* its `status` comparison) and `:166` (the verdict comparison). Rule 3 externalisation is a **one-variable** job | `grep -n 95 scripts/geocode-permits.js` |
| batch / retry / timeout / limit | **none exist** | full-file read |

### 1.6 ⚠ Every governing spec's prose for this step is STALE (the largest G0 surprise)

| Spec | What it says | What the code does |
|---|---|---|
| **60 §3** (anchor `### Geocode Permits (\`geocode-permits.js\`)`, `:30`) | *"Match against `address_points` table by **street number + name**"*; *"If no match: fall back to **Google Maps Geocoding API**"*; *"Modes: Incremental (default: only NULL coords) / Full (`--full`: all permits)"*; *"Edge Cases: Google API quota exhausted…"* | A single `geo_id::INTEGER = address_point_id` equijoin. **Zero** network egress (measured, §1.5). **No** mode split; W1 is unconditionally full-scan |
| **41** `:57` | *"Assign lat/lng via address point lookup **or Google fallback**"* | same |
| **43** `:35` | *"**Re-geocode permits missing coordinates**"* | Re-geocodes **all** permits with a numeric `geo_id` — the scope carries no `latitude IS NULL` narrowing at all |

**No spec in the tree describes what this file actually does.** This is exactly Spec 123 §6 G0's reason for filling the owner row FIRST: reading 122/123/124 first would have produced a plan grounded on a step that does not exist. **Recorded here as a commit-9 spec-diff obligation** (Spec 123 §7 row 9(b), Spec 124 §4.5) and as descriptor `limitations[]` entry **GP-L4**.

### 1.7 The plan's §0 re-measured — two figures MOVED, flagged rather than adopted

Every §0.1 row regenerates identically at HEAD `1a48520b` **except**:

| Row | Plan said (base `824ef357`) | Measured now (`1a48520b`) | Why it moved |
|---|---|---|---|
| §0.1 #17 existing tests | **9** files reference the step | **11** — adds `src/tests/step-library.logic.test.ts` and `src/tests/step-seam.logic.test.ts` | `step-library.logic.test.ts` gained a `fixture_geocode` ENRICHER fixture in `a062eb79` (I4's fleet-wide repair); `step-seam.logic.test.ts` gained the 13-descriptor registry lock in `1a48520b` (I4 commit 3). **Neither existed when the plan was drafted.** See §1.8 — one of them is a commit-9 obligation |
| §0.1 #20 golden dirs | **12** | **14** (`link_neighbourhoods` from I4; `fixture_geocode`, a library-fixture before-image dir, not a step capture) | I4 + 0.10 landed between the draft and now. The conclusion is unchanged: **no `geocode_permits` dir — captures are net-new** |
| §0.2 `converted.json` | **12** converted | **13** converted, `pending: []` | I4 cut over at `1a48520b` |

Everything else — 188 lines, lock 5, 19 commits, 11 `fix(`, bottom-left, 2 chains at 8/33 and 4/28, 5 `.query(` sites, 2 DML statements, 2 `IS DISTINCT FROM`, 0 try/catch, 1 `process.env`, 0 argv, 1 literal threshold — reproduces exactly. `git log --oneline 824ef357..HEAD -- scripts/geocode-permits.js` is **empty**: the subject file itself has not changed since the plan measured it.

### 1.8 ⚠ A source-string lock that WILL go red at commit 9 — budgeted here, not discovered there

`src/tests/step-seam.logic.test.ts:57-69` hard-codes the **13-slug converted registry** and asserts `deriveSeamPairs` yields exactly **6** live pairs. Its own comment, written by I4 one commit ago, says it in words:

> `// link_neighbourhoods (batch-2 I4, cut over 2026-09-16) declares inputs.reads.steps:`
> `// [neighbourhoods, geocode_permits] — BOTH still unconverted, so neither resolves to a`
> `// registered producer … The moment `geocode_permits` converts, this count moves.`

At commit 9 the registry becomes **14** and a new pair `geocode_permits → link_neighbourhoods` appears (the downstream already declares the edge). `npx vitest related` **cannot see this** — it is a source-string/registry lock, not an import graph edge. It is the I4 lesson-1 failure mode exactly, and it is written down **now**, at commit 1, as a commit-9 obligation. The full `npm run test` run that gates commit 9 is what will prove it.

### 1.8b A drafted descriptor cannot sit on disk before commit 7b — three fleet suites say so

The plan's §0.3 measured `validateDescriptor()` against the draft **in the tree** and recorded PASS. That is true and also insufficient: a `*.descriptor.json` file **existing on disk while its slug is unregistered** is a fleet-wide red. Measured — the full `npm run test` run that gates this commit (`VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2`, 424 files / 10,710 tests, 515 s) came back **3 files failed** with the drafts present, and all three name this slug:

| Suite | Assertion |
|---|---|
| `src/tests/step-schema.logic.test.ts` | *"every step descriptor on disk is registered in `converted.json` (and vice versa)"* — `expected [ …(14) ] to deeply equal [ …(13) ]`, the extra entry being `scripts/geocode-permits.descriptor.json` |
| `src/tests/execution-budget-disposition.infra.test.ts` | *"`geocode_permits` declares `execution.step_timeout` with no manifest wiring and is absent from the registry's `pending[]` list — an undeclared inert declaration is exactly what R-X forbids"* |
| `src/tests/write-class-disposition.infra.test.ts` | `checkOnContentionBannedDeclared` fleet count `expected 13, received 14` |

Moving `scripts/geocode-permits.{descriptor,notes}.json` out of the repo turns all three green in 2.1 s. **Where the drafts live, so the next attempt does not re-author them:** `.claude/worktrees/agent-a486632e47faebf18/scripts/geocode-permits.descriptor.json` (27,632 B) and `…/geocode-permits.notes.json` (13,596 B) — the planning worktree that produced them under R-AC. They must NOT be copied into `scripts/` until commit 7b, and when they are, they need the two `execution.*_from_config` fields §6.2 INT-1 measured as newly required. **The baseline at HEAD `1a48520b` is therefore genuinely clean: 3 failed / 420 passed becomes 423 passed, and the repo owed no pre-existing red.**

Two consequences, both now binding:

1. **Commits 1–6 run with no descriptor on disk.** This is not a workaround, it is what R-K.1 already requires — `stage: "red_suite"` is *defined* as "the violations suite has landed, the sibling descriptor does NOT exist yet", and `step-conformance.infra.test.ts` REDs a `pending` entry whose descriptor exists while the stage still reads `red_suite`. The three suites above are the same rule enforced from the fleet side. **Deviation from the plan, flagged:** the plan's §0.3 implied the draft could stay in the working tree throughout; it cannot.
2. **At commit 7b the descriptor and the `pending` stage advance must land in the SAME commit** (`red_suite → descriptor_only`), because `step-schema.logic.test.ts` exempts a descriptor only when its `.js` sibling is in `pending[]`, and `step-conformance` reds if the stage has not advanced. One commit, both edits, or the tree is red either way.

### 1.8c The library-level lock this step already has — and which the plan never cites

`src/tests/step-library.logic.test.ts:4078-4209` (the L9 / L9b / L9c describe block, landed with `d7668b8a`) is a regression lock built around a synthetic `twoTargetDescriptor()` fixture whose own comment reads *"TWO write targets, TWO phases — the `geocode_permits` shape, not `enrich_parcels`'"*, and whose preamble names the defect it exists to prevent: the generic runner's post-phase counters failing **after every pass had run and, for a shared-txn step, after the transaction had already COMMITted**. The same file also carries the `fixture_geocode` ENRICHER descriptor fixture at `:3759`.

This is the closest existing proof that the generic ENRICHER runner will not mis-route W1's and W2's rowCounts, and it was written *for this slug, in advance, by 0.10*. The plan's §0.1 row 17 inventory does not list the file and §10's panel roster directs no seat to it. **Recorded here as the standing library-level lock for B-4 and B-9's mechanism — complementary to, never a substitute for, commits 5/7e's golden captures.**

### 1.8d ⚠ UNDEFENDED FENCE — the `opts.withTransaction` injection seam

`scripts/geocode-permits.js:34-35`:

```js
async function geocodePermits(pool, opts) {
  const withTransaction = (opts && opts.withTransaction) ? opts.withTransaction : pipeline.withTransaction.bind(pipeline);
```

Introduced by `3e44218a` — *"Extracted `geocodePermits(pool, opts)` with injectable `withTransaction` for testing (so tests can inject a mock transaction without fighting module mock resolution)."* It is the **entire reason** `src/tests/geocode-permits.infra.test.ts` can prove the WF3-S2 atomicity guarantee without a live database: case 1 asserts `pl.withTransaction` ran once, exactly 2 `UPDATE`s went through the injected client, `_committed === true`; case 2 throws on the 2nd `UPDATE` and asserts `_rolledBack === true`, `_committed === false`.

**The plan names this nowhere** — not in §1.5's Intent Ledger seed, not in §2's B-1..B-13 table, not in §4's descriptor categories. Its commit-6 line says only *"`src/tests/geocode-permits.infra.test.ts` kept and re-pointed, never deleted"*, with no target, no mock shape and no mapping from the two assertions to library seams. A frozen thin shell over `pipeline.step()` does not retain an exported `geocodePermits(pool, opts)` with an injectable transaction override — the transaction moves into `execution.phases[].txn: "shared"` inside the library. **This is a calling convention, and calling conventions do not survive "port verbatim into compute" by default.** It is the single highest-risk item in the conversion, above the CASE fence, because unlike the CASE fence it has no descriptor field to carry it.

**Disposition, decided here rather than deferred:** the re-pointing target is named at commit 6 as part of the red-suite design, and the two cases are re-proven against the real two-phase shared-transaction path (the `pool2()` mock idiom `step-library.logic.test.ts` already uses for L9), not against a synthetic fixture only. The test is neither deleted nor weakened. Recorded as a **plan gap closed by the panel, not by the plan**.

### 1.8e `safeParsePositiveInt` — an INTENT-UNKNOWN-BY-OMISSION the plan does not rule on

`67711003` replaced every `parseInt` with `safeParsePositiveInt` because *`parseInt(undefined)` silently produced `NaN`* and the replacement throws instead. Under conversion, Rule 2 bans error handling in compute, so the count-parsing defence has to land *somewhere* — library-owned count parsing, or compute keeps the call. The plan says neither. **Commit 7c states explicitly where this defence lives**; until then it is INTENT-UNKNOWN-BY-OMISSION, which is a weaker state than INTENT-UNKNOWN-BY-HISTORY and is recorded as such.

### 1.9 G0 verdict

The boundary is frozen: **2 write statements, 1 table, 1 transaction, 2 chains, 8 audit rows, 1 literal threshold, 0 argv, 0 network, 0 try/catch.** The one genuine surprise is §1.6 — the specs describe a different step. The one genuine risk is §1.8 plus the atomicity lock (`src/tests/geocode-permits.infra.test.ts`), both named before any code is written.

---

## 2. The measurements the plan blocked commit 1 on — every `PENDING-MEASUREMENT` executed

> Harness: `node -r dotenv/config <scratch>/measure1.js`, a read-only script using `scripts/lib/resolve-db.js#createResolvedPool`. **SELECT only — no UPDATE, no chain, no capture.** Timings are single-session wall-clock and are re-taken across ≥ 2 sessions at commit 5 before any `last_measured` block is written (Fold B-1).

### 2.1 The permits population (one query, 728 ms)

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS geocoded,
       count(*) FILTER (WHERE latitude IS NULL AND (geo_id IS NULL OR geo_id = '')) AS no_geo_id,
       count(*) FILTER (WHERE latitude IS NULL AND geo_id IS NOT NULL AND geo_id != '') AS has_geo_id_no_match,
       count(*) FILTER (WHERE geo_id IS NOT NULL AND geo_id != '') AS has_geo_id,
       count(*) FILTER (WHERE geo_id IS NOT NULL AND geo_id != '' AND geo_id ~ '^[0-9]+$') AS has_numeric_geo_id,
       count(*) FILTER (WHERE geo_id IS NOT NULL AND geo_id != '' AND geo_id !~ '^[0-9]+$') AS has_nonnumeric_geo_id,
       count(*) FILTER (WHERE geocoded_at IS NOT NULL) AS geocoded_at_set
FROM permits;
```

| Measure | Value |
|---|---|
| `total` | **254,082** |
| `geocoded` (both coords non-NULL) | **231,930** |
| **`geocode_coverage`** | **91.2816 %** (renders as `'91.3%'` under the step's own `toFixed(1)`) |
| `no_geo_id` (the permanent tail) | **7,660** |
| `has_geo_id_no_match` = pre-run `to_geocode` | **14,492** |
| `has_geo_id` | **246,422** |
| `has_numeric_geo_id` | **246,416** |
| **`has_nonnumeric_geo_id`** | **6** |
| `geocoded_at IS NOT NULL` | **231,930** — exactly equal to `geocoded`, i.e. **every** coordinate in the table was written by this step |
| `address_points` rows | **525,346** (207 ms) |

**The `6` is the single most important number in this section.** The B-5 fence — the `CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END` join expression that exists because PostgreSQL may evaluate the `::INTEGER` cast before the sibling regex predicate — is **live, not theoretical**. Six rows in the live table would crash the statement if the fence were generated away. `notes.json` `fences[0]` is now measured, not merely recovered.

### 2.2 The invariant candidates (all three read ZERO — commit 5's `last_measured` seeds)

| Candidate | Query | Value | Time |
|---|---|---|---|
| `lat_xor_lng_null_count` | `(latitude IS NULL) <> (longitude IS NULL)` | **0** | 581 ms |
| `geocoded_at_set_but_no_geo_id_count` | `geocoded_at IS NOT NULL AND (geo_id IS NULL OR geo_id = '')` | **0** | 541 ms |
| `zombie_coords_count` (W2's own target population) | `(geo_id IS NULL OR geo_id='') AND latitude IS NOT NULL AND geocoded_at IS NOT NULL` | **0** | 544 ms |

The first is the cross-field invariant that the two coordinate columns are always written together (they are — W1 sets both, W2 nulls both). The second and third are the same guarantee stated from the retraction's side: **W2 has nothing to do right now**, which is what a healthy steady state looks like.

### 2.3 The plausibility bound (Ask A5) — the Reality-Check-shaped row this step has never had

| Candidate | Query | Value | Time |
|---|---|---|---|
| `coords_outside_toronto_bbox_count` | `latitude NOT BETWEEN 43.5 AND 43.9 OR longitude NOT BETWEEN -79.7 AND -79.1` over non-NULL coords | **0** | 325 ms |
| same bound over the **source** table `address_points` | | **0** | 434 ms |

Zero on both sides, and 325 ms is cheap enough for `frequency: every_run`. The bound is worth declaring precisely **because** it reads zero: a `geo_id` typo that resolves to a valid-but-wrong address point produces a *populated, plausible-looking, wrong* coordinate — the class no code reviewer and no coverage metric catches. Measuring the source table too is what distinguishes "this step placed a permit outside Toronto" from "the address-point corpus contains one".

### 2.4 The steady state — W1 would write ZERO rows right now

```sql
SELECT count(*) FROM permits p JOIN address_points ap
  ON ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END
WHERE p.geo_id IS NOT NULL AND p.geo_id != '' AND p.geo_id ~ '^[0-9]+$'
  AND (p.latitude IS DISTINCT FROM ap.latitude OR p.longitude IS DISTINCT FROM ap.longitude);
```
→ **0** rows, 2,588 ms. W1's guard admits nothing today; W2's scope is empty (§2.2). **A run right now is a genuine zero-work run**, which is what makes it a clean golden-capture subject — and is also exactly the state in which a broken conversion would look identical to a working one. The differential at commit 7e therefore proves *shape*, not *work*; the proof that the write still works is the fence-lock suite (commit 6) and the invariants above, not the capture diff. Said out loud here so no later reader over-reads a clean differential.

### 2.5 Run history — `records_updated` distribution, verdict distribution, and the audit-phase map

`SELECT … FROM pipeline_runs WHERE pipeline ILIKE '%geocode%' ORDER BY started_at DESC LIMIT 40` (65 rows exist in total; first `2026-03-03`, last `2026-07-17`).

* Slug forms in the ledger: **`permits:geocode_permits`** and **`sources:geocode_permits`** — both chains, confirmed live.
* **Audit phase is `6` on every permits-chain row and `3` on every sources-chain row.** The descriptor's `sharing.varies_by_chain.phase = {permits: 6, sources: 3}` is therefore a **measured** map, not a transcription of the ternary.
* **Verdict distribution over the last 40 runs: `WARN` × 15, `null` × 25** (the nulls are runs with no audit table — skips and pre-audit-table history). **`PASS` × 0.** See §2.6.
* `records_updated` distribution over the last 40: **`0` × 33**, then `169`, `369`, `530`, `669`, `1193`, `1284`, `8465` — one run each. The zero-work steady state `notes.json` `read_this_way[0]` describes is **33/40 of observed reality**.
* `zombies_cleaned` is `0` on every run in the window except one (`3`, run id 1107) — consistent with §2.2's live zero.
* `has_geo_id_no_match` grows monotonically across the window: `14,407 → 14,411 → 14,431 → 14,440 → 14,454 → 14,492`. **The ungeocodable backlog is growing, and nothing in the step's verdict can see it** (GP-L2).

### 2.6 **GP-D1 re-measured (Ask A4) — the threshold and the seeded floor**

**⚠ The plan's mechanics for GP-D1 are WRONG, and the corrected version is worse, not better.** The plan's §1.7 said `4de16d00` (2026-03-27) lowered the coverage threshold 95 → 85 against a measured 90.9 %, and `d24c964c` (2026-04-01) *"restored the false WARN the first commit had measured away."* The Regression Guardian seat refuted that at plan altitude and this pass re-executed the refutation:

```
$ git show 4de16d00:scripts/geocode-permits.js | grep -n "verdict\|threshold: '>="
101:  { metric: 'geocode_coverage', …, threshold: '>= 85%', status: geocodeCoverage >= 85 ? 'PASS' : 'WARN' },
118:      verdict: geocodeCoverage < 95 ? 'WARN' : 'PASS',          ← UNCHANGED
$ git show fcd6ff68:scripts/geocode-permits.js | grep -n "verdict"
118:      verdict: geocodeCoverage < 95 ? 'WARN' : 'PASS',          ← the SAME literal, 6 days earlier
$ git show 4de16d00 -- scripts/geocode-permits.js | grep -E "^[-+].*(95|85)"
-  { metric: 'geocode_coverage', …, threshold: '>= 95%', status: geocodeCoverage >= 95 ? … },
+  { metric: 'geocode_coverage', …, threshold: '>= 85%', status: geocodeCoverage >= 85 ? … },   ← the ONLY line it touched
```

`4de16d00` changed **one literal of two**. The `audit_table.verdict` comparison has read `< 95` continuously since `fcd6ff68` introduced it on 2026-03-21 and has **never once been lowered**. So:

* The measured fix of 2026-03-27 **never took effect on the verdict at all.** For the five days it stood, the step emitted a row reading `PASS` beside a table verdict reading `WARN` — an internal contradiction, not a lowered gate.
* `d24c964c`'s *"Align audit threshold to 95% to match verdict threshold (was 85%)"* is therefore **not** a reckless side effect that destroyed a working fix. It is an accurate description of reconciling a row to a verdict that was never changed.
* **The defect is still real and is now sharper:** the coverage gate has been evaluated at **95, without a re-measurement, for its entire life** — and the one commit that ever measured it (`4de16d00`, 90.9 %) produced a change that silently did nothing and was undone five days later. A measured fix that lands on the wrong one of two literals is a worse failure mode than a fix that gets reverted, because nothing about the tree afterwards records that a measurement was ever taken.

**The commit-2 `defect-ledger.md` filing uses these corrected mechanics, not the plan's "silent restoration" framing** — otherwise a future reader re-diagnoses the five-day window and reaches the wrong conclusion about which commit was careless.

**And the plan's "plausibly WARNed on every run since" is now measured, so the hedge can be removed:**

> **15 of the last 40 runs carry an audit verdict. All 15 read `WARN`. Zero read `PASS`.**

And the coverage that produces them, today: **91.2816 %** (231,930 / 254,082), against a threshold of **95**. The 2026-03-27 reading of 90.9 % has moved by **+0.38 points in five and a half months** — it has not converged on 95 and, with `no_geo_id` at 7,660 permanently ungeocodable rows (a structural ceiling of `1 − 7,660/254,082` = **96.99 %`), it never can *cleanly*: the achievable range is bounded above by ~97 %, so a 95 bound leaves a ~2-point margin against a metric that is 3.7 points below it and drifting on the other input (`has_geo_id_no_match`, §2.5).

**Ask A4's default, applied:** the seeded default is the measured coverage **floored to the nearest 5 below** = **90**. It is NOT 85 — restoring 85 by transcription would repeat `d24c964c`'s own error with the sign flipped. The measurement above is quoted verbatim in the check's `retighten_when`.

**Disposition, unchanged from the plan:** `geocode_permits_coverage_warn_pct` is **seeded at 95** for commits 1–7 so the conversion differential is a genuine zero-diff, and **commit 8's peel P1** is the one commit whose diff shows exactly one thing — the default moving 95 → 90 — with this section as its rationale. PIN-vs-FIX (Spec 123 §3): observed ✅ (a consumer, `funnel.ts:39`, reads the metric) · a commit body asserts the opposite ✅ → **DEFECT**, ledger id **`GP-D1`**, filed at commit 2.

### 2.7 The index named for this step does not serve it (GP-L3 — verified, not assumed)

`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='permits'` returns 28 indexes. The one named for this step reads, **verbatim**:

```
idx_permits_needs_geocode :: CREATE INDEX idx_permits_needs_geocode ON public.permits
  USING btree (permit_num, revision_num) WHERE (geocoded_at IS NULL)
```

W1's predicate is `geo_id`-shaped; W2's is `geocoded_at IS NOT NULL` — the index's exact complement. **Neither statement can use it.** The draft's GP-L3 claim was carried as a citation of `src/lib/db/generated/schema.ts:2297`; it is now confirmed against the live catalog. `guards.requires` stays `[]` and GP-L3 stands as a declared limitation so no future reader assumes an index named for this step is load-bearing for it.

### 2.8 §12 — a live admin-consumer finding, surfaced at commit 1 (file, do not fix)

`src/lib/admin/funnel.ts:724-731` declares, for this slug:

```ts
summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 100] },
mutations: { permits: { ins: [0, 0], upd: [0, 500], del: [0, 0] } },
row_delta: { permits: [0, 0] },
```

Measured against the run history in §2.5: **`records_total` / `records_updated` have exceeded these bounds on 5 of the last 40 runs** — `169`, `369`, `530`, `669`, `1193`, `1284` and `8465` all breach `records_updated ≤ 100`, and four of them breach `records_total ≤ 500` as well. The bounds are not a contract this conversion breaks; they are a contract *pre-conversion reality* already breaks. Per the plan's §12 ruling this is **filed, not fixed** — the conversion preserves the emitted values byte-for-byte, and re-tightening or widening an admin expectation bound is an admin-domain change outside this step's Operating Boundaries. Routed to `docs/reports/review_followups.md` at commit 2 alongside the A3 seam WARN.

The `ins: [0,0]` / `row_delta: [0,0]` half of the same block is the machine-readable statement that neither write target may ever INSERT — which class N's own executor enforces structurally. That half is **preserved and strengthened** by the conversion (B-13).

---

## 3. §PH-3 — Intent Ledger (G1 / G3, commit 2)

> Spec 121 §7.1, human-adjudicated. The quadrant is **bottom-left**, so Spec 123 §2 permits the Class-C short form — taken, **but not to zero**: fence density is > 0, so every construct below carries a recovered *why* with its commit, or is marked `INTENT-UNKNOWN` rather than given an invented one. **Every `git show` below was executed this commit**, not carried from the plan's §1.5 seed; three rows differ from that seed and the differences are stated in place.
>
> Full 19-commit archaeology (Regression Guardian seat, re-executed): `67057269` (creation — raw `pg.Pool`, ONE update, `CAST(p.geo_id AS INTEGER)` with **no** CASE, no zombie cleanup, no lock) → `8287291e` → `412927ca` → `6d20c449` → `bd06751d` → `0ef23550` (SDK migration) → `32da93c5` → `59d63070` → `fcd6ff68` (audit_table born, threshold 95) → `5baaed5a` → `4de16d00` → `d24c964c` → `3e44218a` → `745a1b4d` → `46275ef1` → `67711003` → `e37eaab9` → `f69b561d` → `da6db77a`. **11 of 19 are `fix(`** (57.9 %), and the fixes cluster almost entirely in *the correctness of the numbers this step reports*, not in the join it performs — five of the eleven move a counter or a threshold.

| # | Construct | Recovered why (`git show`, verbatim where quoted) | Commit | Disposition — one of `preserved-in-runner` / `preserved-in-validator` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired` |
|---|---|---|---|---|
| F1 | `CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END` inside the join predicate, beside a sibling regex term | *"CASE expression guarantees regex validation before INTEGER cast (PostgreSQL can reorder WHERE conditions, crashing on non-numeric geo_id)"*. **Live, not theoretical: 6 rows carry a non-numeric `geo_id` today** (§2.1) | `d24c964c` | **preserved-in-compute** — ported verbatim into `outputs.writes[0].write_discipline.scope`; the rule is written down in that target's `why` and again in `notes.json` `fences[0]`, and locked by `checks[]`-adjacent fence tests at commit 6. ⚠ `write.js`'s class-N executor is **descriptive, not generative** for the scope string (the SQL text is compute-authored), so this fence's survival is a **commit-7c** verification, not a plan-altitude one |
| F2 | `IS DISTINCT FROM` over `latitude`/`longitude` **only** — never `geocoded_at` | *"add IS DISTINCT FROM guard to geocode-permits UPDATE … **Eliminates ~6,001 ghost updates per sources pipeline run**"*. The pre-fix predicate was `p.latitude IS NULL`, i.e. a one-column existence test, not a change test | `32da93c5` | **encoded-as-descriptor-field** — `guard_columns: ["latitude","longitude"]` with a mandatory `guard_columns_why` naming the LG-9 run-clock trap: `geocoded_at` is `source: "run_at"` and is DISTINCT FROM its stored value on *every* run, so `all_declared` would rewrite all 246,416 numeric-`geo_id` permits every run |
| F3 | `pipeline.withTransaction` wrapping **both** UPDATEs | *"The original comment 'Single UPDATE is inherently atomic' was wrong — there are two … so a dashboard read between them cannot see coordinates that disagree with the zombie-cleanup state."* **The removal-then-restoration is on record and both diffs were re-read this commit:** `d24c964c` deleted a one-statement wrapper as *"redundant"* on 04-01; `3e44218a` restored it around *two* statements on 04-16 | `3e44218a` (removal: `d24c964c`) | **encoded-as-descriptor-field** — `execution.txn_scope: "step"` + both `execution.phases[].txn: "shared"`, **no `post_commit`**. The shape is one field away from wrong: `enrich_parcels`, the only prior ENRICHER, declares `post_commit` on its pass 5 |
| F4 | `geocoded_at IS NOT NULL` narrowing the retraction scope | *"guarded by geocoded_at IS NOT NULL to avoid wiping other geocoding sources"* — load-bearing **even though no second geocoding source exists in the tree today**: it is what makes adding one safe. Measured corroboration: `geocoded_at IS NOT NULL` = 231,930 = exactly the count of coordinate-bearing permits, i.e. this step wrote every coordinate in the table (§2.1) | `d24c964c` | **preserved-in-compute** — ported verbatim into `outputs.writes[1].write_discipline.scope`; the rule is stated in that target's `why` and in `notes.json` `fences[3]`. The original three-term WHERE is **decomposed**, not copied: `latitude IS NOT NULL` becomes `guard_columns: ["latitude"]` (is-distinct-from-null) and the other two terms stay in `scope`, per the `link_wsib` LG-16 precedent — byte-equivalence of the decomposition is a **commit-7c/7e** proof, not a plan-altitude claim |
| F5 | `records_total = updated`, not `before.to_geocode` | Spec 47 §11 gained its Counter Semantic Contract in the **same commit**, and it names this step by id: *"Pre-run backlog sizes — e.g. `before.to_geocode` in `geocode-permits` … MUST NOT be used as `records_total`"*. The value had been the pre-run backlog twice before (`412927ca`, then again via `d24c964c`) | `e37eaab9` | **encoded-as-descriptor-field** — `counters.records_total.source = matched.newly_geocoded`, and `counters.records_updated.why` states the §11 scoping decision explicitly: `scoped_by: "step"` does **not** mean every write target contributes |
| F6 | `after.total` as the coverage denominator | *"Fix read-skew: use after.total as denominator for coverage metric"* — a concurrent permits load made the pre- and post-run denominators disagree and the percentage jump | `d24c964c` | **encoded-as-descriptor-field** — pins `total_permits` to `when: "post"`, which is the one counter-intuitive `when` on the step and is defended in that check's `why` |
| F7 | `Math.max(0, before.to_geocode - updated)` | The subtrahend is a **post-transaction rowCount** measured against a **pre-transaction count**; a permits load committing between them makes the difference negative | `e37eaab9` | **preserved-in-compute** — the floor is pinned, not tidied; the reason is written down in the `backlog_remaining` entry of `checks[]` and is not restated in `notes.json` (the descriptor is the binding artifact) |
| F8 | `95`, twice — the row threshold and the verdict comparison | **DEFECT `GP-D1`.** See §2.6: `4de16d00` measured 90.9 % and lowered only the ROW literal; the `verdict:` literal has read `< 95` continuously since `fcd6ff68`, so the measured fix never took effect, and `d24c964c` reconciled the row back up. The gate has been evaluated at 95 for its entire life with exactly one measurement ever taken against it, which then vanished | `fcd6ff68` → `4de16d00` → `d24c964c` | **encoded-as-descriptor-field, PINNED** — externalised as `geocode_permits_coverage_warn_pct` via `checks[geocode_coverage].limit_from_config`, seeded at **95** so commits 1–7 are a genuine zero-diff. The value ruling is **commit 8's peel P1** (→ 90). Filed in `defect-ledger.md` this commit |
| F9 | `verdict: geocodeCoverage < 95 ? 'WARN' : 'PASS'` at `:166` | No why recovered — it is the pre-`verdict.js` house style, introduced whole with the audit table. It is a **parallel-boolean recomputation** of the comparison `:142` already performed (Rule 10) | `fcd6ff68` | **knowingly-retired** (the recomputation) / **preserved-in-runner** (the emitted verdict) — `verdict.js#deriveVerdict` folds the row severities, so the two literals can no longer disagree. F8's five-day contradiction window is the concrete proof this class of defect is not hypothetical |
| F10 | `manifest.scripts.geocode_permits.supports_full: true` | No why recovered; **no argv reader has ever existed in this file**, in any of the 19 commits | `67057269` | **encoded-as-descriptor-field** — declared as `limitations[]` **GP-L1** rather than silently dropped; `staleness.mode_select` and `override.force_full` are both `"none"`, which is truthful. Retiring the manifest flag is optional peel **P3** |
| F11 | `geocodePermits(pool, opts)`'s `opts.withTransaction` injection seam, `:34-35` | *"Extracted `geocodePermits(pool, opts)` with injectable `withTransaction` for testing (so tests can inject a mock transaction without fighting module mock resolution)."* It is the **entire mechanism** of `src/tests/geocode-permits.infra.test.ts`, the WF3-S2 atomicity lock | `3e44218a` | **knowingly-retired** (the seam — a frozen shell over `pipeline.step()` exports no such function) / the guarantee it proved is **preserved-in-runner** (`execution.phases[].txn: "shared"`). ⚠ **The plan names this nowhere** — found by the Regression Guardian seat; §1.8d. The re-pointing target and mock shape are a **commit-6** deliverable, and the test is neither deleted nor weakened |
| F12 | `safeParsePositiveInt` on every count, replacing `parseInt` | *`parseInt(undefined)` silently produced `NaN`*; the replacement throws instead. A silent `NaN` in a count feeds a silent `NaN` coverage and a silently wrong verdict | `67711003` | **preserved-in-runner** — Rule 2 bars the defence from compute, so it lands with library-owned count parsing. ⚠ **INTENT-UNKNOWN-BY-OMISSION until commit 7c states where it lives** (§1.8e) — a weaker state than an unrecovered history, and recorded as such rather than assumed closed |
| F13 | `p.geo_id != ''` beside `p.geo_id IS NOT NULL` | **INTENT-UNKNOWN.** Present since the creation commit; **no body in any of the 19 commits explains it.** The obvious reading is a NULL-vs-empty-string defence on a TEXT column, but that reading is inference, and inference is not a recovered why | `67057269` | **preserved-in-compute** — carried verbatim in `outputs.writes[0].write_discipline.scope` and in W2's complementary `(geo_id IS NULL OR geo_id = '')`, so preservation is not at risk; the *why* is recorded as unknown in `notes.json` rather than invented. Gets its own row here instead of being folded into F1, per the Guardian |
| F14 | `pipeline.getDbTimestamp(pool)` at `:36`, not `new Date()` | Spec 47 §R3.5 — RUN_AT is captured from the **DB** clock **before any write**; two statements straddling a second would give `geocoded_at` two values for one run. `745a1b4d` first did it as an inline `SELECT NOW()`; `46275ef1` moved it to the SDK helper | `46275ef1` (orig. `745a1b4d`) | **preserved-in-runner** — the library captures RUN_AT pre-compute, inside the lock (`staleness.trigger[].position: "pre_compute"`) |
| F15 | The `emitMeta` read/write column lists | Added with the SDK migration and unchanged since; they already declare exactly the read set §1.3 derives independently | `6d20c449` / `0ef23550` | **encoded-as-descriptor-field** — `inputs.reads.tables` + `outputs.writes[].columns`, verified line by line against `:171-174` rather than copied |
| F16 | `phase: (process.env.PIPELINE_CHAIN === 'sources') ? 3 : 6` | *"chain-aware audit phase"* — one step, two chains, two dashboard positions. Before `5baaed5a` it was a hardcoded `6`, wrong on the sources chain | `5baaed5a` | **encoded-as-descriptor-field** — `sharing.varies_by_chain.phase = {permits: 6, sources: 3}`, an explicit map, which is what `step.schema.json`'s own `phase` description demands (*"a map cannot disagree with itself"*). **Measured against 40 live ledger rows** (§2.5), not transcribed from the ternary |
| F17 | `if (!lockResult.acquired) return;` at `:186` | Spec 47 §R6/§R12 verbatim. Genuinely reachable: lock 5 is shared by both chains, and ledger run 1518 is a recorded `skipped` | `745a1b4d` | **preserved-in-runner** — `sharing.on_contention: "self_skip"` + the `lock_held_elsewhere` terminal; VRD-SKIP (LG-29) makes the skip's own status row WARN so an all-INFO table cannot fold to a bare PASS |
| F18 | `if (zombiesCleaned > 0) pipeline.log.info(...)` | Added with the zombie cleanup itself; cosmetic, not a data fence | `d24c964c` | **knowingly-retired** — Rule 2 bars logging from compute, and the number it announced is carried by the `zombies_cleaned` audit row, which is strictly more visible than a conditional log line |

**Fence density:** 18 constructs adjudicated, **4 declared as `notes.json` `fences[]`** (F1, F2, F3, F4), **2 INTENT-UNKNOWN** (F13 by history, F12 by omission), **1 DEFECT with a ledger id** (F8 → `GP-D1`), **3 knowingly-retired** (F9's recomputation, F11's seam, F18's log line), **0 rows with no disposition**. G4d requires the violations suite to carry at least one `it(` per declared fence — 4 minimum, landing at commit 6.

---

## 4. §PH-5 — Seam map (G5, commit 3)

> Every boundary across which this step touches something it does not own, with the library phase that owns it after conversion. Derived from the 188-line read, not from the manifest.

| Seam | What crosses it | Sites | Library home after conversion |
|---|---|---|---|
| **DB seam** | One `pg.Pool`, supplied by `pipeline.run`. **5 execution sites** (`:42` before-counts SELECT · `:62` `address_points` COUNT · `:74` W1 on the txn `client` · `:93` W2 on the same client · `:108` after-counts SELECT) across **2 tables** (`permits` read+written, `address_points` read only). The step creates no pool of its own (`grep -c 'new Pool'` = 0) | `:42`, `:62`, `:74`, `:93`, `:108` | `inputs.reads.tables` (2 tables, 9 columns) + `outputs.writes[]` (2 targets, class N and class O). The transaction boundary is `execution.txn_scope: "step"` with both `phases[].txn: "shared"` — one `withTransaction`, two statements, no `post_commit` |
| **Clock seam** | `RUN_AT = await pipeline.getDbTimestamp(pool)` — the **database's** clock, captured **before any write** and bound as `$1::timestamptz` into W1's `geocoded_at`. `Date.now()` also appears twice, but only for elapsed-time arithmetic (`durationMs`), never for a value written to the DB — which is exactly the Spec 47 §R3.5 split | `:36` (DB clock) · `:37`, `:123` (elapsed only) | `staleness.trigger[{signal: "always", position: "pre_compute"}]`; the runner captures RUN_AT pre-compute, inside the lock. `outputs.writes[0].columns[geocoded_at].source: "run_at"` is what tells the guard machinery to keep it OUT of `guard_columns` (fence F2 / B-7) |
| **Network seam** | **NONE.** `grep -ciE 'google\|fetch\(\|https?://\|axios\|node-fetch'` = **0**. This is the measured refutation of the Google-Maps-fallback prose carried by all three governing specs (§1.6) — there is no egress, no API key, no quota, and no retry, because there is no network call | — | `execution.network: "none"` and `inputs.reads.externals: []`, both truthful. Declared as `limitations[]` **GP-L4** so the spec drift is visible from the descriptor as well as from the commit-9 spec diff |
| **argv / env seam** | **argv: NONE** — `grep -cE 'process\.argv\|isFullMode\|--full'` = **0** across all 19 commits; `manifest.supports_full: true` has never had a reader (fence F10 / GP-L1). **env: exactly ONE** — `process.env.PIPELINE_CHAIN` at `:164`, read once, solely to pick the audit-table phase number (6 on permits, 3 on sources). It is a chain **identifier**, not an override: it changes no scope, no predicate and no threshold | `:164` | `execution.invocation.{permits,sources}.argv: []`; `staleness.mode_select: "none"`; all three `override.*` fields `"none"`; and the env read becomes `sharing.varies_by_chain.phase = {permits: 6, sources: 3}` — an explicit map rather than a ternary, **measured against 40 live ledger rows** (§2.5) |
| **Cross-chain producer seam** ⚠ | `address_points`, produced by `load-address-points.js` — a **sources-only** step. On the `permits` chain the declared producer **never runs**, so the permits-chain invocation reads whatever the last sources run left behind | `:62`, `:79-86` | `inputs.reads.steps: [{step: "address_points", version_pin: "gte"}]`. The edge is declared because Rule 1 requires it, and it **will WARN permanently on every permits chain-end from the moment `address_points` converts** — `deriveSeamPairs` has no chain filter, `chainId = 'sources'` is a parameter default, and `chain-end-synthesis.mjs` passes the live chain (re-executed, §4.2 INT-6). No `chains` qualifier exists on `inputs.reads.steps[]` today, so **Ask A3 resolves to its fallback: the accepted WARN is filed** in `review_followups.md` this commit |
| **Advisory-lock seam** | `withAdvisoryLock(pool, 5, …)` with `if (!lockResult.acquired) return;`. Genuinely contended: both chains run this step under the same lock id, and ledger run 1518 is a recorded `skipped` | `:183-186` | `identity.lock: 5` + `sharing.on_contention: "self_skip"` + the `lock_held_elsewhere` terminal. `skipRecordsMeta()` is descriptor-generic and emits the skip's status row at **WARN** against threshold `'ran'`, so an all-INFO table cannot fold to a bare PASS (VRD-SKIP / LG-29) |
| **Error seam** | **NONE in the file** — `grep -c 'try {'` = 0, `grep -c catch` = 0, `grep -c 'process.exit'` = 0. Every failure propagates whole to `pipeline.run`. Nothing to port and nothing to lose | — | The boundary becomes the library's: `execution.on_batch_error` / `on_check_error` = `fail_step`, `criticality: "required"`, `on_row_error: "fail_fast"` (a set-based statement has no survivable per-row error — the whole statement fails). Compute contains no error handling and no logging (Rule 2) |
| **Test seam** ⚠ | `geocodePermits(pool, opts)`'s `opts.withTransaction` override — a **calling convention**, not a data boundary, and the entire mechanism of `src/tests/geocode-permits.infra.test.ts` | `:34-35` | **No descriptor category owns this.** Retired with the exported function; the guarantee it proved moves to `execution.phases[].txn: "shared"` and the test is re-pointed at the library's own two-phase shared-transaction path at **commit 6** (§1.8d). Named here because a seam map that lists only data boundaries is how the plan walked past it |

### 4.1 Non-determinism inventory — declared BEFORE the first differential (R-C, commit 5's precondition)

| # | Source of variance | Disposition |
|---|---|---|
| ND-1 | `geocoded_at` = RUN_AT — a new value on every run | **Excluded from the projection.** `capture-step-golden.js`'s `deriveTableSpecs` would auto-INCLUDE it (`written: "step"`, not `db_default`) — the identical trap pilot 3 hit with `link_massing` / `linked_at` — so commit 5 passes `--table-columns=permits:permit_num,revision_num,latitude,longitude` **explicitly, on both sides** |
| ND-2 | `records_meta.duration_ms` and the `${identity.name}_duration_ms` telemetry key | Excluded — wall-clock |
| ND-3 | Physical row order | Projected **ordered by the declared key** `(permit_num, revision_num)` via `--table-order`, never the heap order |
| ND-4 | **`address_points` content is an UNCONTROLLED INPUT** | A sources run reloading `address_points` between PRE and POST legitimately changes W1's output. Captures are taken with no chain running (`node scripts/check-chain-running.js`) and the `address_points` row count (**525,346** at commit 1) is recorded beside each capture |
| ND-5 | `permits` is **254,082 rows — over the 100,000-row capture ceiling**, and at commit 5 no descriptor exists to derive a projection from | The PRE captures must carry `--tables` / `--table-columns` / `--table-order` explicitly (a projection bypasses the ceiling), and the POST captures must repeat them **identically** or the pair is incomparable. Not named in the plan's §8; added by the Integration seat (§6.2 INT-9) |
| ND-6 | Concurrent permits load between the before-counts SELECT and the transaction | Structural, not excludable — it is the same race fences F6 and F7 exist for. Captures are taken solo, which removes it in practice |

---

## 5. §PH-6 — Classification + risk class (G4 / G6, commit 4)

### 5.1 Every behaviour classified — CONTRACT / INCIDENTAL / DEFECT

Spec 123 §6 G6: **every DEFECT carries a ledger id**, and nothing is left unclassified. The 18 constructs of §3 resolve to:

| Class | Count | Members |
|---|---|---|
| **CONTRACT** (a behaviour the conversion must preserve) | **12** | F1 CASE cast guard · F2 two-column IS DISTINCT FROM · F3 the shared transaction · F4 `geocoded_at IS NOT NULL` narrowing · F5 `records_total = updated` · F6 `after.total` denominator · F7 `Math.max(0, …)` floor · F13 `geo_id != ''` (preserved on an unknown why) · F14 the DB clock · F15 the `emitMeta` column lists · F16 the chain-aware audit phase · F17 the advisory-lock skip |
| **INCIDENTAL** (present, not load-bearing, declared rather than dropped silently) | **3** | F10 `supports_full` (→ `limitations[]` GP-L1) · F12 `safeParsePositiveInt` (→ library-owned count parsing, home stated at commit 7c) · F18 the conditional zombie log line (→ the `zombies_cleaned` audit row, strictly more visible) |
| **DEFECT** (a behaviour that is wrong, with a ledger id) | **2** | **F8 → `GP-D1`** (the coverage threshold, filed PIN at commit 2) · **F9 → structural** (the Rule 10 parallel-boolean verdict recomputation — retired by construction under `verdict.js#deriveVerdict`, so it has no independent ledger row: it is not a value that needs ruling, it is a *duplication* that stops existing. F8's five-day silent-no-op window is the concrete damage it caused, and that damage IS ledgered, under GP-D1) |
| **UNDEFENDED / UNOWNED** (found by the panel, not by the plan) | **1** | **F11** the `opts.withTransaction` test seam — not a defect in the code, a gap in the *standard*: no descriptor category owns a calling convention. Filed LOW/standard-shaping in `review_followups.md` at commit 2; the re-pointing is a commit-6 deliverable |

`limitations[]` disposition: **GP-L1** (dead `supports_full`) → declared, optional peel P3 · **GP-L2** (`has_geo_id_no_match`, 14,492 live rows, no audit row) → declared, peel P2 · **GP-L3** (`idx_permits_needs_geocode` serves neither statement) → declared, **verified against the live catalog at commit 1** (§2.7), no peel · **GP-L4** (all three specs' prose is stale) → declared, closed by the commit-9 spec diff. A fifth candidate surfaced at the panel and was filed rather than declared: the empty-`address_points` silence class, **peel P4** (§6.3 OBS-5).

### 5.2 Risk class — **B**

> **Risk class B** — *chance* LOW-MEDIUM (of an *undetected* change: MEDIUM), *impact* HIGH on one axis (a destructive NULL-retraction on a foreign table whose pre-image is unrecoverable) and LOW on every other. The two axes are expanded below.

| Axis | Assessment |
|---|---|
| **Chance** (how likely is the conversion to change behaviour?) | **LOW-MEDIUM.** The step is 188 lines, bottom-left quadrant, 2 statements, 1 table, 1 transaction, 1 threshold, 0 argv, 0 network, 0 error handling — the smallest surface of any step converted so far. Both write classes are proven (N and O are LG-11/LG-16 mechanics first measured on `link_wsib`), neither is `x-banned-for-new`, and `assertNoRetraction()` returns clean. **But** the differential cannot detect a regression: W1's guard admits 0 rows and W2's scope is empty today (§2.4), so a clean capture diff is guaranteed whether or not the conversion works. The chance of an *undetected* change is therefore materially higher than the chance of a change |
| **Impact** (what happens if it does?) | **HIGH on one axis, LOW on the rest.** `permits.latitude/longitude` is read by `link_parcels`, `link_neighbourhoods`, the admin funnel, the lead feed and every map surface; W2 is a **destructive NULL-retraction on a table this step does not own**, and the retracted coordinate exists nowhere else afterwards (which is why `recovery.before_image: "generated"` is mandatory under R-M). A guard expansion that included `geocoded_at` would rewrite 246,416 rows per run (the LG-9 trap, fence F2). Against that: the step INSERTs nothing, DELETEs nothing, and `row_delta.permits [0,0]` is structurally enforced by class N's own executor |
| **Risk class** | **B.** Not A: there is no schema change, no migration, no new column, no cross-table cascade, and the population at risk is a 254,082-row UPDATE scope that is currently converged to zero work. Not C: one of the two write targets is a destructive retraction on a foreign table whose pre-image is unrecoverable, and the step's own output feeds five downstream consumers. **The mitigations are named and not optional:** the before-image (now deliverable — B-9 unblocked by `d7668b8a`), the 4 fence locks at commit 6, and an executed fake-pool lifecycle test for `ctx.retract`, because the goldens structurally cannot reach class O (§6.2 INT-10) |

### 5.3 What class B buys, concretely

1. **The fence locks are the proof, not the differential.** G4d requires `it(` ≥ declared fences (4), landing at commit 6.
2. **An executed `ctx.retract` → `writeBeforeImage` → `executeSetBasedClear` lifecycle test** is mandatory, not optional — `zombies_cleaned` will read 0 in all three golden pairs and no before-image file will be produced, so the class-O path has zero capture coverage. This is the same gap `a062eb79` had to close for I4 after the fact; it is budgeted here in advance.
3. **The atomicity lock survives or the conversion does not proceed.** `src/tests/geocode-permits.infra.test.ts` is re-pointed, never weakened (§1.8d).

---

## 6. Panel roster — who ran, at PLAN altitude (accretes through commit 9)

Spec 08 §6.4, both altitudes mandatory. I5 is a FULL-form first member, so the full roster stands (plan §10). PLAN seats dispatched at commit 1; findings and their adjudications are recorded at the commit that closes each.

| Seat | Agent / instrument | Status at commit 1 |
|---|---|---|
| Integration | `general-purpose`, main tree | **REPORTED — 1 REFUTED (plan §0.3), 3 NEW runner findings, 3 capture hazards; see §6.2** |
| Regression Guardian | `regression-guardian`, main tree | **REPORTED, commit 1 — 2 FAIL, 1 REFUTED-correction, 1 STALE, 1 INTENT-UNKNOWN; see §6.1** |
| Observability | `observability-reviewer` | **REPORTED — 4 PASS, 1 FAIL (§11 counter scoping under the landed runner), 1 unfiled silence class; see §6.3** |
| Reality-Check | `pipeline-reality-check`, main tree | commit 5 (plan altitude on the plausibility bound; §2.3 is its input) |
| Idempotency Lens | `general-purpose`, main tree | commit 5 |
| DeepSeek lens set ×4 | `npm run review:deepseek` | commits 2 / 7 |
| Gemini | `npm run review:gemini` | OUTPUT altitude |

### 6.1 Regression Guardian — PLAN altitude, findings and adjudications (commit 1)

The seat walked all 19 commits, recovered a why for every construct, and ruled on the 13 B-guarantees. **Every finding below was re-executed by this pass before being acted on**; none was adopted on the seat's word alone.

| # | Finding | Grounder re-execution | Disposition |
|---|---|---|---|
| **GRD-1** | **FAIL — undefended fence:** the `opts.withTransaction` injection seam (`:34-35`, `3e44218a`) has no stated successor and `geocode-permits.infra.test.ts`'s two cases have no re-pointing target | Re-read the seam and the test: confirmed the test depends on the `opts` override and on nothing else | **ACCEPTED.** §1.8d written; the re-pointing target and mock shape are a commit-6 deliverable, named there rather than deferred |
| **GRD-2** | **FAIL — test inventory undercounts by 2** (`step-library.logic.test.ts`, `step-seam.logic.test.ts`) | Independently measured by this pass before the seat reported: `grep -rln` returns **11**, not 9 (§1.7) | **ACCEPTED, and already recorded.** §1.8b/§1.8c/§1.8 carry the three consequences |
| **GRD-3** | **REFUTED-correction on GP-D1's mechanics:** `4de16d00` changed only the ROW literal; the `verdict:` literal has read `< 95` continuously since `fcd6ff68`, so the measured fix never took effect and `d24c964c` did not "restore" anything | Re-executed: `git show 4de16d00:…` line 118 reads `< 95`; `git show fcd6ff68:…` line 118 reads `< 95`; the `4de16d00` diff touches exactly one line. **Confirmed** | **ACCEPTED, and it makes GP-D1 worse, not better.** §2.6 rewritten; commit 2's ledger row uses the corrected mechanics |
| **GRD-4** | **STALE plan prose:** §2's B-9 row says before-image is undeliverable on an enrich shape. `d7668b8a` landed and made it deliverable; the draft descriptor already declares `recovery.before_image: "generated"` | `git merge-base --is-ancestor d7668b8a HEAD` → true. Confirmed | **ACCEPTED.** B-9 is deliverable; the plan's §2 prose is stale, the artifact is not. Corrected in this report rather than in the frozen plan |
| **GRD-5** | **INTENT-UNKNOWN:** `p.geo_id != ''` beside `p.geo_id IS NOT NULL` — present since `67057269`, never explained in any of 19 commit bodies | `git log -S` over the term: no body explains it | **ACCEPTED.** Gets its own Intent Ledger row at commit 2, marked `INTENT-UNKNOWN`, rather than being folded into the CASE-fence row. Carried verbatim in `scope` regardless, so preservation is not at risk |
| **GRD-6** | **NOTE:** `safeParsePositiveInt`'s defence (`67711003`) has no declared home under Rule 2 | Re-read `67711003`: it replaced `parseInt` because `parseInt(undefined)` silently yielded `NaN` | **ACCEPTED.** §1.8e; commit 7c states where the defence lives |
| **GRD-7** | **NOTE:** `pipeline-sdk.logic.test.ts`'s assertions were not read line-by-line and are the most likely in the 11-file set to be literal-SDK-call-text locks | not yet re-executed | **CARRIED to commit 7d** — read in full before the shell lands |
| — | **PASS** on every other fence: CASE cast guard, two-column IS DISTINCT FROM, the transaction wrapper (removal `d24c964c` → restoration `3e44218a`, both diffs verified), `geocoded_at IS NOT NULL` narrowing, `records_total`/`after.total`/`Math.max(0,…)` counters, `getDbTimestamp`, `emitMeta` column lists, the advisory-lock skip | | preserved with correct recovered-why and correct commit citations |

The seat also raised a caveat this pass endorses: `write.js`'s class-N executor is **descriptive, not generative** for the scope string — the SQL text is compute-authored, so the CASE fence's survival depends entirely on `scripts/lib/compute/geocode-permits.js` reproducing it byte-for-byte. *"Descriptor says the right thing" ≠ "compute did the right thing"* — verified at OUTPUT altitude (commit 7c), not at plan altitude.

### 6.2 Integration — PLAN altitude (commit 1). **The plan's §0.3 is REFUTED and Ask A2's closure is incomplete.**

| # | Finding | Grounder re-execution | Disposition |
|---|---|---|---|
| **INT-1** | **REFUTED — plan §0.3 row 3 ("Draft descriptor, validated directly → PASS — no throw") is FALSE at HEAD.** `d7668b8a` amended the ENRICHER `x-profile`: `execution.required` went from `["phases"]` to `["phases","heartbeat_minutes_from_config","lock_timeout_ms_from_config"]`. The draft declares neither | **Re-executed this pass** against the held draft: `validateDescriptor` throws `/execution: must have required property 'heartbeat_minutes_from_config'` + `'lock_timeout_ms_from_config'` + `(root): must match "then" schema`. **Confirmed** | **ACCEPTED.** The plan's §0.3 measurement was taken at base `824ef357`, before 0.10 amended the schema. Both fields are added at commit 7b. **Plan §5 ("one variable, and only one") is consequently FAIL** — see INT-2 |
| **INT-2** | **Plan §5 is FAIL.** The two new required fields each name a `config.logic_variables[].name` or the literal `"none"`. Either I5 declares **3** logic variables (+2 seed rows, +2 GROUP_ORDER entries) or it declares `"none"` twice — and `"none"` for the heartbeat means `last_heartbeat_at` stays NULL for every run, which is the ER-D1 condition 0.10 just closed, only now *declared* rather than silent | Confirmed by reading the schema (`{type:"string",minLength:1}`, required on ENRICHER) and `step-conformance.infra.test.ts:1059`, whose dead-declaration scan skips the literal `"none"` | **RULING (this pass, the plan does not cover it): declare BOTH as real logic variables, not `"none"`.** A step that runs inside two chains, holds advisory lock 5, and wraps a full-table join in a transaction is exactly a step whose heartbeat and lock timeout should be observable and tunable. `"none"` would be choosing silence one commit after 0.10 paid to remove it. → **3 variables at commit 7b.** Flagged as a deviation from plan §5 |
| **INT-3** | **NEW — `compute.computeAggregateRecordsUpdated(...)` is called UNCONDITIONALLY** at `scripts/lib/step/index.js:3487`, with no `typeof fn === 'function'` guard — unlike the genuinely optional `contract_read`/`defer_scope` hooks, which do guard. A compute without that export throws `TypeError` **after every pass has run and, on a shared-txn step, after COMMIT** | **Re-executed this pass**: `sed -n 3415,3500p scripts/lib/step/index.js` — `records_updated_aggregate: compute.computeAggregateRecordsUpdated({…})`, unguarded, inside the `matched` literal. **Confirmed** | **BLOCKING for commit 7c/7d.** §5 below |
| **INT-4** | **NEW — three hardcoded `parcels` COUNT queries** at `:3430-3436` (`geom IS NOT NULL`, `zoning_class IS NOT NULL`, `opt_aor_gfa_sqm IS NOT NULL AND max_buildable_gfa_sqm IS NULL`) run for **every** enrich-shaped step, and the pass names at `:3436-3440` are the literal `enrich_parcels` five (`zoning`, `max_build`, `existing_structure`, `comparable_builds`, `optimal_config`). `geocode_permits`' phases are `geocode` / `zombie_cleanup`, so all five resolve to `{}` | **Re-executed**: same `sed` range. **Confirmed verbatim** | **BLOCKING for commit 7d** (3 wasted full scans per run and `zone_class_pct` / `opt_aor_without_max_gfa` in this step's `matched`). §5 |
| **INT-5** | Fast invariants **#20 HB-1 / #21 CEIL-1 are substantively vacuous** — both are token greps over the extracted `runEnrichPhase` **source**, descriptor-independent, so they pass for any enrich-shaped slug. The plan's §3.1 line *"they fire on this slug … against a heartbeat that today cannot start"* is **REFUTED**: HB-1 cannot see whether a ticker resolves | Read `heartbeatReachability` / the CEIL-1 checker in `step-validate.mjs`; `--step=enrich_parcels --fast` shows both PASS on token presence alone | **ACCEPTED, recorded.** They are not a safety net for I5; the real heartbeat proof is INT-2's declared variable plus a lock |
| **INT-6** | `inputs.reads.steps[]` has `additionalProperties: false` and exactly three properties (`step`, `version_pin`, `assert_health`) — **no `chains` qualifier**, and `d7668b8a`'s own body files it *"NOT FIXED: seam.js is not chain-aware (Ask A3, no consumer until address_points converts in Phase 3)"* | Confirmed by reading `step.schema.json` | **Ask A3 resolves to its stated fallback:** declare the edge, **file the accepted WARN (MED) at commit 2**. Done this commit |
| **INT-7** | **Registration precedent:** every prior nine-commit step registered `stage: "red_suite"` **at commit 6, in the same commit as the violations suite** (`272d8ae0` I1, `58c35378` I2, `c9534fbd` pilot 9, `4b1e1722` p8, `37b15d3b` p7, `c44a4c07` p6). The plan's commit-5-before-the-suite registration is **legal but unprecedented** | Confirmed via `git log -S'"stage": "red_suite"'` | **ACCEPTED and declared as novel.** The plan's rationale (G8/#22 cannot gate an unregistered slug's PRE captures) is sound; recorded as a first, not smuggled in |
| **INT-8** | **Capture hazard 1 — `geocoded_at` auto-derives into the `permits` content hash.** `capture-step-golden.js`'s `deriveTableSpecs` projects `key ∪ columns[].name` filtered only by `written !== 'db_default'`; `geocoded_at` is `written: "step"` ⇒ included ⇒ every POST capture false-diffs on the run clock. The identical trap is on record from pilot 3 (`link_massing` / `linked_at`) | Accepted on the seat's read of `capture-step-golden.js:407-423`; **to be re-executed at commit 5 before the first capture** | **ACCEPTED.** Commit 5 passes `--table-columns=permits:permit_num,revision_num,latitude,longitude` explicitly on **both** sides. The plan's §8 non-determinism inventory names `geocoded_at` but not the flag that excludes it |
| **INT-9** | **Capture hazard 2 — `permits` (254,082 rows) exceeds the 100,000-row capture ceiling**, and at commit 5 there is no descriptor to derive a projection from, so the PRE captures must carry `--tables` / `--table-columns` / `--table-order` explicitly and the POST captures must repeat them **identically** or the pair is incomparable | same | **ACCEPTED.** Flag parity becomes part of the commit-5 capture log |
| **INT-10** | **Capture hazard 3 — W2 is a zero-row statement today**, so all three golden pairs will record `zombies_cleaned: 0`, no before-image file will be written, and the class-O path / `recovery.before_image: "generated"` / B-8 / B-9 are **untestable by the differential** | Independently measured by this pass at commit 1 (§2.2: W2's target population = 0) | **ACCEPTED, and already stated** (§2.4). The proof moves to an executed fake-pool lifecycle test of `ctx.retract` → before-image → `executeSetBasedClear` at commit 6 — the same remedy `a062eb79` had to build for I4 |

### 6.3 Observability — PLAN altitude (commit 1)

| # | Finding | Grounder re-execution | Disposition |
|---|---|---|---|
| **OBS-1** | **PASS — the verdict cascade is row-derived and byte-identical in BOTH directions.** The seat executed `buildAuditTable` against the real descriptor with the measured live numbers: coverage 91.2816 → `verdict: "WARN"`, row status `WARN`; coverage forced to 100 → `verdict: "PASS"`, row status `PASS`. `deriveVerdict` is a pure `Math.max` fold over `rows[].status` (`verdict.js:22`, `:363-367`); every INFO row is pinned INFO by `checkRow` and never contributes rank | Executed by the seat against the live library and the real draft | **ACCEPTED.** Rule 10 is satisfied by construction — the `:166` parallel boolean is retired, not re-implemented |
| **OBS-2** | **The emitted audit rows are NOT byte-identical, and that is the accepted fleet pattern**: every row gains `source: "check"`, `threshold` moves from `null` to the literal limit string, and `geocode_coverage`'s `value` loses its hand-rounded `'91.3%'` string for a raw float. The seat verified this exact drift in I4's already-committed PRE/POST goldens. **One thing is NOT precedented:** I4 deliberately set `identity.display_name` to match the legacy `audit_table.name` byte-for-byte; the I5 draft does not (`"Permit Geocoding"` → `"Permit Geocoding (Address Points lookup)"`) | Confirmed by the seat against `docs/reports/golden/link_neighbourhoods/{pre,post}/permits.json`; no consumer reads `audit_table.name` (only `.metric`/`.value`, `FreshnessTimeline.tsx:828`) | **ACCEPTED, and acted on: `identity.display_name` becomes the literal `"Permit Geocoding"` at commit 7b.** §12 says the emitted `audit_table` diff must be empty; a gratuitous name-text diff would be the one unexplained entry in it, for no gain |
| **OBS-3** | **FAIL — §11 counter scoping cannot resolve under the runner as landed.** `counters.records_total.source = "matched.newly_geocoded"` resolves via `resolveCounterSource` against `{matched, written}` — but `matched` (`index.js:3445-3510`) is a hand-written ~30-key `enrich_parcels` literal with **no `newly_geocoded` key and no generic mechanism for a phase to contribute one**. Even papering over INT-3's `TypeError`, both `records_total` and `records_updated` would resolve **`null` on every run, forever** — a step that really did count 231,930/254,082 rendering as "did not examine", with no check anywhere flagging the broken wiring. **Spec 48 §3.6 ("NULL is not zero") and Spec 79 C11 both fire** | **Re-executed this pass**: `sed -n 3445,3500p scripts/lib/step/index.js` — the `matched` literal, verbatim, with no per-step contribution seam. **Confirmed** | **BLOCKING for commit 7d.** §5 |
| **OBS-4** | **PASS — the SKIP terminal is generic.** `skipRecordsMeta()` (`index.js:3744-3759`) emits `{metric:'status', value:'SKIPPED', threshold:'ran', status:'WARN'}` with `verdict: deriveVerdict(rows)` → WARN, never a bare PASS. No archetype branching, and **both** lock paths route through it — the outer `identity.lock` (the pre-conversion `ADVISORY_LOCK_ID = 5`) and 0.10's inner two-key lock (`emitInnerLockDeniedSkip`) | Confirmed by the seat reading both call sites | **ACCEPTED.** VRD-SKIP / LG-29 is honoured for this step's shape without any I5-specific work |
| **OBS-5** | The `has_geo_id_no_match` deferral to a peel is **defensible** (adding a row is a behaviour change under Spec 123 §1.1, it is filed with its query, and it does not touch the verdict). **But the SECOND blind spot has no forward path at all:** `guards.empty_source: "none"` and no check on `address_points` row count means a truncated upstream produces a run indistinguishable from a healthy zero-work one — a genuine Spec 48 §3.6 silence class documented in `notes.json` `blind_spots[1]` and filed **nowhere**, not even as a peel candidate | Confirmed against the held `notes.json` and plan §9's peel list (P1 `GP-D1`, P2 `GP-L2`, P3 `GP-L1` — no fourth) | **ACCEPTED. New peel candidate P4** — an `address_points_loaded` bound, WARN, `when: "pre"`, cheap (the live COUNT is 207 ms). Filed in `review_followups.md` this commit so it has a forward path rather than a note |
| **OBS-6** | Spec 48 §3.7 (first-deploy spike / Tier-3 ledger writers) does **not** apply — this step writes no ledger table. Spec 79 C3 (SKIP is an execution failure, not a success) is satisfied by OBS-4 | | no action |

---

## 7. ⛔ PREMISE REFUTED — commit 7c/7d is BLOCKED on a 0.10 follow-up, and I5 must not close it itself

Two seats reached this independently, from opposite directions (Integration by tracing `d7668b8a`'s diff, Observability by tracing the counter's resolution path), and **this pass re-executed both**. The plan's §0b gate — *"commit 7d may not start until 0.10 has landed"* — is satisfied in letter and **not in substance**: `d7668b8a` generalised the **pre-phase hooks** (`enrich_hooks.contract_read`, `enrich_hooks.defer_scope`, `heartbeat_minutes_from_config`, `lock_timeout_ms_from_config`, the `${identity.name}_duration_ms` telemetry key), the **write seams** (`ctx.retract` → `writeBeforeImage` → `executeSetBasedClear`; `ctx.joinUpdate` → `executeSetBasedJoinUpdate`) and the **per-target `written[]` counters** — all of which I5 genuinely needs and now has, including a deliverable B-9. It did **not** generalise the **post-phase region**:

```
scripts/lib/step/index.js:3430-3436   3 unconditional `SELECT COUNT(*) FROM parcels …` queries, every enrich step
scripts/lib/step/index.js:3436-3440   literal enrich_parcels pass names — geocode/zombie_cleanup resolve to {}
scripts/lib/step/index.js:3445-3510   `matched` is a ~30-key enrich_parcels literal; NO per-phase contribution seam
scripts/lib/step/index.js:3487        compute.computeAggregateRecordsUpdated(...) called with NO function guard
```

Consequences for I5, in order of when they bite:

1. **`compute.computeAggregateRecordsUpdated` throws `TypeError` post-COMMIT** for any compute that does not export it — the worst possible failure site, and precisely the `readZoningContract` class `d7668b8a` set out to retire, relocated rather than removed.
2. If that were guarded, **`matched.newly_geocoded` does not exist**, so `records_total` and `records_updated` resolve `null` forever — Spec 48 §3.6 and Spec 79 C11, on the step Spec 47 §11 names *twice* as its own counter worked example.

**Why I5 does not fix this itself.** The plan's Operating Boundaries put `scripts/lib/step/**` **out of scope** *"beyond the growth A2 authorises"*, and A2 authorised that growth as **its own WF with its own Regression Guardian, gated on `enrich_parcels`' five committed goldens hashing EQUAL before and after** — because a runner widening is a behaviour change, and Spec 123 §1.1 forbids one inside a conversion commit. The growth is also **shared by all five ENRICHER conversions** (I5 plus batch 2 Phase 2's four), so paying for it inside I5 would charge one step for the archetype's bill and would land it without the Guardian gate that protects the archetype's only proven member.

**Required, and owned by a 0.10 follow-up WF, not by I5:**

* a **declared per-phase `matched`-contribution contract** — the mechanism by which `geocode`'s pass return value becomes `matched.newly_geocoded`, so `counters.*.source` can name it (the `written[]` per-target counters `d7668b8a` already built are the shape to mirror);
* **`computeAggregateRecordsUpdated` made optional and guarded**, exactly as `contract_read` and `defer_scope` already are;
* the three `parcels` COUNT queries and the five literal pass names **moved behind the same declaration**, so an enrich step that does not touch `parcels` does not scan it three times per run.

### 7.1 A THIRD refuted premise — `stage: "red_suite"` grants NO hard-stop exclusions, so the plan's commit-5 reorder is unworkable

The plan's commit-5 row says the early `pending` registration is safe because *"`stage: "red_suite"` … its stage-gating excludes G7/G8/G9 + Rules 4/11/12 from the hard stop, so early registration manufactures no false red."* **That is false, and the validator's own source says so in a comment written to prevent this exact misreading** (`scripts/analysis/step-validate.mjs:2004-2015`):

```js
const STAGE_HARDSTOP_EXCLUSIONS = {
  // red_suite and shape_clean are deliberately ABSENT — they fall through to
  // the `{gates:[], rules:[]}` default below …
  descriptor_only: { gates: ['G7','G8','G9'], rules: [4,11,12] },
  compute_ported:  { gates: ['G8','G9'],      rules: [] },
  runner_wired:    { gates: ['G9'],           rules: [] },
  shape_clean_pending_recapture: { gates: ['G8'], rules: [] },
};
```

The exclusions the plan attributes to `red_suite` belong to **`descriptor_only`**. Measured by execution, with the `pending` entry and the census flip actually applied to the tree:

```
$ node scripts/analysis/step-validate.mjs --all --fast ; echo REAL EXIT=$?
[step-validate] geocode_permits (pending) — 10/17, hard-stop=true
    (G7, G8, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13 — all unpinned enforced-red)
REAL EXIT=1
```

And the red is **not** curable by landing the violations suite at commit 6: Rules 5/6/7/8/9/13 read `enforced-red` for the single reason *"no descriptor"*, and the descriptor cannot land before commit 7b (§1.8b). **Any registration at any point before the descriptor exists produces `hard-stop=true`.**

This did not bite the twelve prior conversions because the pre-commit hook runs `step-validate.mjs --staged --fast`, which resolves **no step** from a staged registry JSON and exits 0 — measured, with the registration staged. Their `red_suite` entries passed the *hook*; nobody ran `--all`. This conversion's operating constraint is the stricter one — **`--all --fast` exit 0 and `hard-stop=false` on every step before EACH commit** — and the two are jointly unsatisfiable for an in-flight pending slug.

**Consequence: the registration was applied, measured, and REVERTED.** `converted.json.pending` is back to `[]`, the census row is back to `batch: "C4"`, and `--all --fast` is back to exit 0 with `hard-stop=false` on all 13.

### 7.2 Stopping point — **commit 4**, not commit 6

The three refutations compose, and they move the honest boundary earlier than §7's first reading suggested:

1. **Commits 7c–9 cannot land at all** (§7): the runner's post-phase region is still `enrich_parcels`-specific, and closing it is a 0.10 follow-up WF with its own Guardian gate, explicitly outside this plan's Operating Boundaries.
2. **Commit 5's registration cannot satisfy the stated gate** (§7.1), and commit 6's suite does not cure it.
3. Landing commit 5's PRE captures *without* registration would forfeit the only reason the plan reordered them (`#22` / G8 cannot gate an unregistered slug), and would pair captures taken today against POST captures taken after an unbounded delay — precisely the ND-4 hazard this report declared before capturing anything.

So the conversion stops at **commit 4**, which is a fully clean boundary: `converted.json.pending: []`, `step-validate --all --fast` exit 0 with `hard-stop=false` on all 13 steps, the full `npm run test` suite green, and nothing on disk that any fleet scanner can see. **The repo is in exactly the state the next agent's own entry gate expects** — which is the whole point of stopping here rather than two commits further in. Commits 1–4 stand on their own: the measured boundary freeze, the corrected `GP-D1`, the 18-construct Intent Ledger, the eight-seam map with its non-determinism inventory, and the risk-class-B classification. Commit 5 resumes when the 0.10 follow-up lands — and it resumes knowing all three of these walls in advance instead of hitting them one at a time.

---

## 8. §12 — Cross-Domain handoff (no admin file was edited)

Domain Mode was **Cross-Domain** because this step's output is bound into the admin surface by **id**, not merely by value. Measured at commit 1, and unchanged by commits 1–4 (which touch only `docs/reports/**`):

| Consumer | Binding | State after commits 1–4 |
|---|---|---|
| `src/lib/admin/funnel.ts:39` | `{id: 'address_matching', name: 'Address Matching', statusSlug: 'geocode_permits', triggerSlug: 'geocode_permits', yieldFields: ['latitude','longitude'], auditMetric: 'geocode_coverage'}` — the audit-row **id** `geocode_coverage` is the contract, not just its value | **Untouched.** The id is ported verbatim in the drafted `checks[]` and a rename would be a consumer break (B-13). The rename risk is recorded; nothing has moved |
| `src/lib/admin/funnel.ts:724-731` | `summary: {records_total: [0,500], records_new: [0,500], records_updated: [0,100]}` · `mutations.permits {ins:[0,0], upd:[0,500], del:[0,0]}` · `row_delta.permits [0,0]` | **One live finding, FILED not fixed** (§2.8): `records_updated ≤ 100` and `records_total ≤ 500` are **already breached by seven of the last forty PRE-conversion runs** (169 / 369 / 530 / 669 / 1193 / 1284 / 8465). Pre-existing, not caused by this work; re-tightening or widening an admin bound is an Admin-domain change. In `review_followups.md`, MED |
| `src/lib/admin/funnel.ts:561`, `:842` | `{summary: 'Matches permit addresses to address points for lat/lng coordinates', table: 'permits'}` and the slug→table map | **Untouched.** Note for whoever owns the prose: the summary sentence repeats the stale "matches permit **addresses**" framing (§1.6) — the step matches on `geo_id`, never on an address string. Cosmetic, no consumer branches on it |
| `src/lib/parcels/geometry.ts:244` | A prose claim: *"Mirrors the WHERE clause logic in scripts/geocode-permits.js"* | **Untouched, and now a named coupling.** `parseGeoId` re-implements the `geo_id` numeric test that fence F1's `CASE` expression guards in SQL. If the compute ever changes that predicate, this is the sibling that silently disagrees. Recorded here because a prose "mirrors" comment is the weakest possible link between two implementations of one rule |
| Spec 26 | Names `funnel.ts`, not the script — the contact is via `funnel.ts`, already a Spec 26 Target File | No R-AF obligation (§1.1) |

**Obligation carried forward, unchanged:** commit 9 must verify the emitted `audit_table` diff is empty against the PRE captures on **both** chains, and file — not fix — any funnel expectation bound the re-measured live values fall outside. One such bound is already filed. **No admin file was edited by commits 1–4 and none should be edited by commits 5–9.**

---

## 9. RESUMED — the folded commit 5 onward (supersedes §7)

### 9.1 A FOURTH measured ordering constraint — the seeds cannot be deferred to 7b either

The resume sequence handed down was *folded commit 5 → 7b (seeds ×3 + registry regen) → 7c compute → 7d shell → captures → 9 cutover*. Executed, the seeds half does not survive contact:

```
$ node scripts/analysis/step-validate.mjs --all --fast
| 2 | geocode_permits | FAIL | 3 declared, missing from seeds:
      geocode_permits_coverage_warn_pct, geocode_permits_heartbeat_minutes, geocode_permits_lock_timeout_ms
[step-validate] geocode_permits (pending) — 11/17, hard-stop=true (fast invariant)   REAL EXIT=1
```

**Fast invariant #2 requires every `config.logic_variables[].name` to have a seed row in the SAME tree as the descriptor.** A descriptor landing at commit 5 with its seeds at 7b leaves the tree hard-stopping in between — the identical class as premise 3, one field over. **The seeds, the `GROUP_ORDER` entries and the regenerated registry therefore FOLD INTO commit 5 as well**, which is exactly what I4's own commit 1 did (descriptor + 3 seed rows + `GROUP_ORDER` + the regenerated groups JSON, one commit). Flagged as a deviation from the handed-down sequence, for the same reason the other three are recorded: it is a measurement, not a preference. With the fold applied, `--all --fast` is **exit 0, `hard-stop=false` on all 14** and `geocode_permits` scores **11/17** at `descriptor_only`.

### 9.2 The four fleet suites a registration reds — predicted, then measured

The Integration seat's `a062eb79` checklist (§6.2 INT-7's neighbour) named them in advance. All four fired, exactly as predicted, and all four are repaired in the folded commit:

| Suite | What broke | Repair |
|---|---|---|
| `conversion-roadmap.infra.test.ts` | `buildRoadmap` **throws** when a file is in `pending[]` while its census row still names a batch | census `batch: "C4"` → `"pending"`, roadmap regenerated, and four counts repinned: remaining files 50 → **49**, remaining slugs 52 → **51**, `c4.size` 1 → **0** (C4's LAST member — the batch is now empty, which is it closing, not a stale count), `pendingBatch.size` 0 → **1** |
| `control-panel.logic.test.ts` | three new logic variables are "extra keys beyond the expected set" | the three added to `EXPECTED_LOGIC_VAR_KEYS` with a note on why there are three and not one |
| `execution-budget-disposition.infra.test.ts` | `execution.step_timeout: "15m"` declared with no `manifest.scripts.geocode_permits.step_timeout_minutes` — an inert declaration, which R-X forbids unless the slug is named in the registry's `pending[]` | appended to `declarations.step_timeout.pending` (11 → 12) with a `pending_why` stating that this step's honest ceiling is **not yet known** — its 65 recorded runs predate per-step duration capture on this branch — so it is declared pending rather than guessed |
| `write-class-disposition.infra.test.ts` | the `on_contention` fleet pin is **descriptor-scoped**, so it moves the instant a descriptor file lands | 13 → **14**, with the comment extended to say that explicitly |

### 9.3 The ENRICHER seam, as coded against

`execution.enrich_hooks.post_phase: "computePostPhase"`, plus the two fields `d7668b8a` made required on the profile. The load-bearing detail is **which root resolves**: the runner resolves `counters.<slot>.source` against `{matched, written, records_meta}`, so `matched.compute.<name>` and `written.e<N>.<slot>` resolve while a **bare `compute.*` resolves NULL for every ENRICHER** — `enrich_parcels`' own three counters have read null since its conversion for exactly that reason (filed HIGH by 0.10b, deliberately not fixed there because fixing it moves the emitted summary). This step therefore declares:

```
records_total   -> matched.compute.newly_geocoded
records_new     -> matched.compute.records_new_aggregate   (a finite literal 0, never omitted)
records_updated -> matched.compute.records_updated_aggregate
```

and `computePostPhase` returns `newly_geocoded` **twice** — once as a `matched` key, which the audit row of that id reads, and once under `matched.compute`, which the counter source reads. Two contracts over one measurement, and the violations suite locks both (a bare `compute.*` source reds it).

Spec 47 §11 is honoured as declared: `records_total` is W1's rowCount and never `before.to_geocode`; W2's rowCount is **excluded** from `records_updated` and carried on `zombies_cleaned` alone.

### 9.4 The before-image is a DECLARED SUPERSET of the retraction

`write.js#buildBeforeImageSelectSql` builds the before-image SELECT from `plan.scope` **only** and does not append the guard clause. W2's decomposition puts `latitude IS NOT NULL` into `guard_columns` (an IS-DISTINCT-FROM-NULL guard) and leaves `(geo_id IS NULL OR geo_id = '') AND geocoded_at IS NOT NULL` in `scope`, so the before image carries rows the retraction skips. Measured, the generated statement is:

```sql
UPDATE permits SET latitude = null, longitude = null, geocoded_at = null
WHERE (geo_id IS NULL OR geo_id = '') AND geocoded_at IS NOT NULL AND (latitude IS DISTINCT FROM null);
```

`latitude IS NOT NULL` ≡ `latitude IS DISTINCT FROM NULL` was **proven by execution** over all 254,082 live rows (231,930 each, zero disagreements) before the decomposition was accepted. The divergence is unobservable on this database (both sets measure 0 rows), a superset before-image is the safe direction for an audit trail, and it is **declared in `guard_columns_why` and locked both ways** by the violations suite's DECLARED DIVERGENCE case — so moving `latitude IS NOT NULL` back into `scope` reds the suite and forces the note to be retired in the same commit. Found by the Integration plan seat; not silently tolerated.

### 9.5 PRE captures must precede the shell — an ordering correction, stated

The handed-down sequence reads *… → 7d shell → 8 PRE captures*. A "PRE" capture taken after the shell is wired captures the **converted** behaviour, because `capture-step-golden.js` spawns whatever `scripts/geocode-permits.js` is on disk. The differential would then compare converted against converted and be vacuous in a second, worse way. **The PRE captures therefore land after 7c (compute present, shell still legacy) and before 7d**, which is I4's own precedent (`2ba8e705` PRE captures, then `230176c9` compute + shell + POST). The descriptor's `fingerprint_inputs` names only `scripts/lib/compute/geocode-permits.js`, so the fingerprint is stable across 7d and the pair stays comparable.

And the capture is still, by construction, unable to prove the write — §2.4 said so before anything was captured, and nothing since has changed it: W1's guard admits 0 rows, W2's scope is empty, so all three pairs record `zombies_cleaned: 0` and diff clean whether or not the conversion works. **The proof lives in the fence locks and in the executed `ctx.retract → writeBeforeImage → executeSetBasedClear` ordering test**, which asserts the SELECT is issued before the UPDATE against a recording fake client. That test is the reason this step's violations suite carries more weight than its differential.

### 9.6 RED-first evidence (G7) — what the suite asserted before the artifact existed

`src/tests/steps/geocode_permits/violations.test.ts` landed at the folded commit 5 carrying **three `it.fails(...)` claims about artifacts that did not exist**, each a real assertion that really failed. Vitest reports a failing `it.fails` as a pass and, the moment the claim comes true, as a **RED** — so a premature flip reddens the suite and each flip is forced into the commit that earns it:

| Claim | Asserted at commit 5 (RED) | Flipped |
|---|---|---|
| F1 — `buildGeocodeSql()` carries the `CASE … ::INTEGER END` cast guard verbatim beside its sibling regex, and the bare cast appears nowhere | `Cannot find module …/lib/compute/geocode-permits.js` | **7c** |
| F2 (SQL half) — the statement guards `latitude`/`longitude`, and `geocoded_at` appears exactly once, in the SET clause | same | **7c** |
| compute module — `passes[]` matches the declared phase names in order, `computePostPhase` is exported under the name the descriptor declares, and Rule 2 holds | same | **7c** |
| frozen shell — `module.exports = pipeline.step(descriptor, compute)`, `ADVISORY_LOCK_ID = 5` as source text, and no `withTransaction`/`emitSummary`/`UPDATE permits` left | still **RED** at 7c | 7d |
| registration — the file is in `converted[]` and its `pending` entry is gone | still **RED** | 9 |

**One of those flips found a real defect in this suite's own first cut, and it is recorded rather than quietly fixed.** The compute-module case asserted Rule 2 by scanning the raw file for banned tokens, and it went RED at 7c on the compute's **own docblock** — the sentence that says *"No pool creation, no logging, no `process.env`, no wall clock"*. A banned-token scan that cannot tell code from prose reports the sentence promising the rule as a violation of it. This is the LG-29 scanner class exactly (`step-validate.mjs#checkNoSecondDerivation` flagging a docblock phrase as a hand-rolled verdict assignment). Fixed by stripping comments before the scan, with the always-blocking parse-based enforcement left where it belongs, in `scripts/ast-grep-rules/compute-shape.yml`.

### 9.7 Rule 12 — the crash posture, and the checker gap underneath it

`checkInterruptedPostureTruthful` reds any target declaring `retract: "all"` unless `recovery.interrupted === "force_full_on_next_run"`. The draft declared `"none"`, arguing — correctly — that both writes share one transaction, so a killed run leaves **no half-retracted state** and there is nothing to recover. Measured, both readings were tested before either was adopted:

* `interrupted: "none"` → Rule 12 `enforced-red`, `hard-stop=true`.
* `interrupted: "force_full_on_next_run"` → Rule 12 `enforced-green`, and the checker's reachability arm reports *"shape=enrich runner=runEnrichPhase: … calls `staleness.detectInterruptedRetraction` directly and folds `interruptedRetraction.interrupted` into the full/incremental decision before any pass runs"*.

**The declaration is `force_full_on_next_run`, and it is not a concession to the checker.** It is REACHABLE (the runner has the live consumer, measured above — unlike the LN-D9 class, where a declared full mode issued the identical statement and promised a relink it could not perform) and it is ACCURATE (this step has no incremental scope at all: phase 1 re-joins every permit carrying a numeric `geo_id` on every run, so *"the next run does a full pass"* is a promise it keeps unconditionally). It is the **stronger** of the two postures and cannot under-promise recovery; `"none"` was the narrower truth about *state* while saying nothing about what the next run does. Both halves are written into `recovery.interrupted_why` so the reasoning is readable from the descriptor, not reconstructed from this report.

**The gap underneath is real and is filed, not fixed here:** the checker has no `applies_when` distinguishing a retraction that shares the step transaction (this step: `txn_scope "step"`, all phases `shared`, no `post_commit`) from one that can be separately committed (`link_massing`, `link_parcels` — both `txn_scope "batch"`, measured). That is the RS-D-STA class — a gate authored against one archetype's incident now reaching a shape whose declared transaction defeats its premise — and narrowing a fleet checker is a shared-infrastructure change that belongs to its own WF, never smuggled into a conversion commit (Spec 123 §1.1).

### 9.8 THE DIFFERENTIAL — 3 pairs, 36 / 36 / 38 diffs, every one classified

`capture-step-golden.js --compare` on each pair. **Nothing about the DATA moved:**

| Axis | permits | sources | standalone |
|---|---|---|---|
| `permits` table hash (projected, key-ordered) | `d293118b` → `d293118b` | identical | identical |
| All 10 declared invariant scalars | **identical** | **identical** | **identical** |
| `records_total` / `records_new` / `records_updated` | `0 / 0 / 0` → `0 / 0 / 0` | identical | identical |
| `audit_table.verdict` | `WARN` → `WARN` | identical | identical |
| The 8 pre-conversion audit rows, by id, in order, with their values and statuses | **identical** | **identical** | **identical** |
| exit code | `0` → `0` | identical | identical |

The `0 / 0 / 0` is the load-bearing one: it proves the `matched.compute.*` counter sources **resolve**, which is the exact thing that was `null` for every ENRICHER before 0.10b and is still `null` for `enrich_parcels` today.

**Every diff falls into six classes, and none is a data change:**

| Class | Count | What | Disposition |
|---|---|---|---|
| **A — stdout** | 6 lines/pair | The shell's own `[geocode-permits]` log lines are replaced by the library's `[geocode_permits]` target banner and per-phase start/complete lines | **Structural, caused by this change, expected.** The 188-line shell that printed them no longer exists |
| **B — audit-row shape** | ~24/pair | Every row gains `source: "check"`; `threshold` moves `null` → the literal limit string; `geocode_coverage.value` loses its hand-rounded `'91.3%'` string for the raw `91.28155477365574` | **The accepted fleet pattern**, verified by the Observability seat against I4's already-committed goldens. `audit_table.name` is `"Permit Geocoding"` on BOTH sides — the one place I4 set `display_name` to match and the I5 draft did not, corrected at commit 7b (§6.3 OBS-2) |
| **C — three NEW audit rows** | 3 + 3 `sys_*` | `lat_xor_lng_null_count` and `geocoded_at_set_but_no_geo_id_count` (`source: "invariant"`) and `coords_outside_toronto_bbox_count` (`source: "plausibility"`), each `PASS` at 0, plus their own `sys_*_duration_ms` timing rows | **DECLARED, not incidental** — the plan's commit-5 obligation and Ask A5. They enter `buildAuditTable` as synthetic selected checks (Fold A-2) and are tagged by `source`, so the eight ported rows stay distinguishable. This is the one place the conversion is deliberately NOT zero-diff, and §6 of the plan is why: a ninth *check* row would have been a behaviour change, but a declared invariant is the mechanism the standard provides for exactly this |
| **D — `records_meta` gains library-standard keys** | 9/pair | `code_version`, `config` (all three resolved variables, visible), `ledger_row`, `pool_errors`, `checks_failed`, `checks_warned`, `terminal`, `warnings`, `address_points_loaded` | **Structural.** `terminal: "geocoded_with_warnings"` is the declared live steady state being selected correctly, and `config` makes the three tunables readable from the run itself |
| **E — `meta.reads.permits` gains `geocoded_at`** | 1/pair | The pre-conversion `emitMeta` declared 5 read columns; the descriptor declares 6 | **MORE TRUTHFUL, and the diff is the point.** W2's scope reads `geocoded_at`; the hand-written `emitMeta` list simply omitted it. The conversion did not add a read, it stopped under-declaring one |
| **F — standalone only** | 2 | `audit_table.phase` **6 → 0**, and a `pipeline_runs` row appears | Both explained below |

**F1 — the standalone audit phase, 6 → 0.** `verdict.js#resolvePhase` returns the chain's own number when `PIPELINE_CHAIN` is set (permits **6 → 6**, sources **3 → 3**, both unchanged) and, for a standalone run, returns a value only when *every* chain agrees — otherwise **0**, by deliberate design: *"Standalone: unambiguous only when every chain agrees."* This step's map is `{permits: 6, sources: 3}`, which disagree. The pre-conversion `6` was not a decision; it was the else-branch of `(PIPELINE_CHAIN === 'sources') ? 3 : 6`, and the plan's own §8 flagged it in advance — *"the audit phase falls to the ternary's else-branch, 6 — the same number as permits. Note this in the capture log so a reviewer does not read it as a permits capture."* The library refuses to guess where the ternary silently picked. **Explained, and confined to an invocation neither chain uses:** both production invocations pass `PIPELINE_CHAIN`, and both are byte-identical.

**F2 — the standalone `pipeline_runs` row.** The converted step declares `ledger_row: "owned"` and writes its own row (`status: completed_with_warnings`); the pre-conversion standalone capture recorded none. An in-chain run correctly writes none on both sides (`run-chain` owns it), which is why permits and sources show no such diff. The converted behaviour is the library standard and is strictly more observable.

**The two families that have no field NAME to cite, acknowledged explicitly with their counts.** Across the three pairs the comparator reports **110 differences** in total. Of those, **18 differences** fall under `stdout_lines` — six per pair, indices 0–5 — and they are class A in full: the 188-line shell that printed `[geocode-permits] Starting permit geocoding`, `Before`, `Address points loaded`, `Running bulk UPDATEs (atomic)...` and `Geocoding complete` no longer exists, and the library prints its own target banner plus a start/complete line per declared phase in their place. Not one of the eighteen carries a measured value; every number those log lines used to print is now an audit row or a `records_meta` key, which is where a consumer can actually read it. A further **9 differences** fall under `audit_table.rows` at indices 8, 9 and 10 — three per pair, and they are class C in full: they are whole NEW row objects, not changed fields, namely the two declared `invariants[]` entries and the one `plausibility[]` entry, each `PASS` at 0 and each tagged with its own `source` (`invariant` / `plausibility`) so it can never be mistaken for one of the eight ported `check` rows, which keep indices 0–7, their ids, their order, their values and their statuses. Both families are structural consequences of the conversion, both were predicted before the captures were taken, and neither moves a measurement.

**What the differential CANNOT prove, said again because it has not changed:** W1's guard admitted 0 rows and W2's target population was 0 on both sides, so `zombies_cleaned` reads 0 in all six captures and the `permits` hash would be identical whether or not the write works. The proof of the write is the four fence locks, the re-pointed atomicity lock (now four cases, including the two the pre-conversion seam could not assert), and the `geocoded_at_set_but_no_geo_id_count` invariant — which is the only row-level evidence, on any run, that the destructive half executed over its own declared population.

### 9.9 One library gap the differential surfaced, filed not fixed

Both POST captures log `phase geocode starting (shared txn, timeout NaNmin)`. `execution.phases[].timeout_minutes_from_config` is declared `"none"` — truthfully, this step consumes no phase timeout — but that field is **not** routed through 0.10b's `resolveInterval`, so the runner evaluates `Number(config["none"])` → `NaN`, prints it, and arms nothing. Behaviourally correct (the pre-conversion step had no timeout either) and cosmetically wrong, but the real finding is the asymmetry: `heartbeat_minutes_from_config` and `lock_timeout_ms_from_config` **throw** on a non-finite resolution, while a **typo** in `timeout_minutes_from_config` is indistinguishable from the literal `"none"` — the exact silent-disable class ER-D1 retired, still open one field over. Filed.

---

### 9.10 CUTOVER — what commit 9 moved, and the one number the whole step existed to change

| Artifact | Before | After |
|---|---|---|
| `converted.json.converted` | 13 | **14** (`scripts/geocode-permits.js` appended) |
| `converted.json.pending` | 1 entry, `stage: "shape_clean"` | **`[]`** — deleted in the SAME commit that registers (R-K mutual exclusion) |
| `step-archetype-census.json` | `batch: "pending"` | **RETAINED** with `status: "converted"`, `converted_at: "commit-9"` (R-AO). The `archetype`/`batch` values are the census's OWN pre-cutover ones, never re-derived from the descriptor — that is what keeps fast invariant #25 a comparison of two independently-authored facts |
| **Converted ENRICHER members** | **1** (`enrich_parcels`) | **2** — R-AH / R-PACE-1 eligibility **MET** |
| C4 batch membership | 1 (this step) | **0 — the batch is CLOSED**, and the count going to zero is the batch finishing, not a pin going stale |
| Live seam pairs | 6 | **7** — `geocode_permits → link_neighbourhoods` |
| `template-freeze.json` | frozen at `eb8e6687` | RE-FREEZE, 20 categories / 9 runners / 0 open batching prereqs |

**The ENRICHER count is the deliverable.** This conversion was mandated in FULL nine-commit form *because* the archetype had one member and `step-validate.mjs` fast invariant #24 was vacuous for it. Registering the second member is what retires that condition: batch 2's Phase 2 goes from *1 full + 3 compressed* to *4 compressed*, which is roughly 30 minutes of gate time and 6 commits saved across the four remaining ENRICHERs — the arithmetic the plan used to justify paying full form here.

**The seam pair is the interesting one, and it arrived from a direction worth naming.** `geocode_permits` declares `address_points` as its own upstream, and `address_points` is still unconverted, so that edge still resolves to nothing. The new pair comes from the *other* side: `link_neighbourhoods` declared `geocode_permits` in its own `inputs.reads.steps` at ITS cutover the same day, and this registration is what resolves that already-declared read to a live producer. **A cutover can add a seam pair the converting step never declared.** §1.8 predicted the count would move — the prediction came from grepping the fleet's own test comments for this slug's NAME at commit 1 — and `src/tests/step-seam.logic.test.ts` now carries both the 6 → 7 arithmetic and the pre-announcement of the 8th pair, which starts WARNing permanently on every permits chain-end the moment `address_points` converts (Ask A3, filed MED).

**Spec diff (Spec 124 §4.5), all three owner specs, none deferred to "N-A":**

* **Spec 60 §3** — the largest correction. The section described *"Match against `address_points` table by street number + name"*, *"If no match: fall back to Google Maps Geocoding API"*, an *Incremental / Full (`--full`)* mode split and a *"Google API quota exhausted"* edge case. **None of that has been true since `67057269` (2026-02).** Rewritten to the measured behaviour: one `geo_id::INTEGER = address_point_id` equijoin, two phases in one transaction, the `CASE`-cast fence stated as load-bearing with its commit and its live 6-row population, the retraction's `geocoded_at IS NOT NULL` narrowing, and an explicit statement that there is no network fallback and never has been. The real edge cases replace the invented one: `has_geo_id_no_match` (14,492, no audit row — `GP-L2`), `no_geo_id` (7,660, the ~97 % structural ceiling), and the empty-`address_points` silence class.
* **Spec 41** step 8 — *"Assign lat/lng via address point lookup or Google fallback"* → the equijoin, with *"no address-string match, no network"* said out loud.
* **Spec 43** step 4 — *"Re-geocode permits missing coordinates"* → the truthful scope: it re-joins **every** permit with a numeric `geo_id`, guarded rather than narrowed, plus the retraction.

No `order_guarantee.anchor` needed re-pointing: this step declares no `pre_write` check, so Rule 11 is vacuous for it (the one case where I4's spec-amendment-and-re-point coupling does not apply).

**Regenerated, all by their own generators, none hand-edited:** `122-conversion-roadmap.md` (49 remaining rows), `122-programme-backlog.md` (123 items, blocks batching 0), `00_system_map.md` (100 specs), `template-freeze.json` (`--refresh`), and the fleet's scorecards via `step-validate.mjs --all --write` — the last of which is mandatory rather than tidy: the R-R staleness lock in `step-conformance.infra.test.ts` compares every committed scorecard against a fresh `--fast` run, and a registry that grows 13 → 14 moves the fleet-count line in **all** of them.

**Four things only the FULL suite saw — the I4 lesson, applied to this step's own cutover.** `step-validate --all --fast` was green and every targeted suite was green while all four of these were red, because `--fast` skips vitest and `vitest related` on a descriptor JSON or a registry JSON resolves nothing:

1. **The compute exported no `checks` dispatch table.** §5.5 (1) requires it so `step-conformance` can assert the dispatch keys are exactly the descriptor's check ids IN DECLARATION ORDER against the real object rather than a copy. Without the export the check reads `undefined` and **Rule 2 goes `enforced-red`**. Fixed here; fixing it changed a fingerprint input, which correctly staled all three POST captures (G8 3/3 → 0/3), so they were re-taken and the differential re-confirmed unchanged.
2. **`assert_schema`'s R-D probe list went stale**, 143 → 146 names. That step is step 1 of every chain that runs it and probes the static union of every converted step's `config.logic_variables[].name`, so that LM-D15's mid-chain throw becomes a minute-zero FAIL. Three new variables anywhere in the fleet stale it. Regenerated with its own generator — and regenerating it staled `assert_schema`'s **four** goldens in turn, which were re-captured (all PASS). The cascade my own notes predicted, arriving on schedule.
3. **`programme-items.json` rejected a `notes` key** — the item schema allows exactly nine properties and `notes` is not one. The CLOUD-PRE note was folded into `evidence`, which is where the schema says a measurement belongs.
4. **`LDG-D1` widened.** `link_parcels` reads `permits.latitude`/`longitude` and `geocode_permits` is the sole writer of both — but until this cutover `geocode_permits` was unconverted, so LDG-4's converted-producer restriction hid the gap. **The dependency is years old; only its derivability is new.** Pinned in `KNOWN_GAPS` with the same disposition and the same ledger id as the identical `compute_centroids` half, and filed — declaring it edits another step's descriptor and moves that step's own seam pairs and staleness gating.

**`CLOUD-PRE` — the open operator obligation, now covering THREE variables and proven necessary rather than assumed.** `geocode_permits` is added to the `CLOUDPARITY` item's `blocks`. The first end-to-end run of the converted step on the local database **failed loudly** on exactly this: `config: "geocode_permits_coverage_warn_pct" is declared by the descriptor but has no logic_variables row (a seed default exists … but a seed is BOOTSTRAP ONLY — never a runtime fallback for a converted step)`. `node -r dotenv/config scripts/seeds/apply-logic-variables.js` inserted 3 of 503 rows and the step then completed. **The cloud database must run the same command for all three before any dispatch that includes this step, on either chain.** That is not a theory about LM-D15; it is the error this conversion actually hit.

---

## §R. Reflection

### LOW-CONFIDENCE — what this assessment is least sure of at commit 1

| # | Claim | Why it is low-confidence | How it gets closed |
|---|---|---|---|
| R1 | That the generic ENRICHER runner (`d7668b8a`) drives a 2-target, 2-phase, one-transaction descriptor **without** summing both targets' rowCounts into `records_updated` | `d7668b8a`'s own commit message says "post-phase counters iterate declared targets — I5 with 2 targets no longer throws". "No longer throws" is not "emits the same number". Spec 47 §11 requires W2's rowCount to be EXCLUDED | Observability seat, commit 1; proven by the commit-7e differential |
| R2 | That class N's codegen preserves the `CASE …::INTEGER` fence verbatim | Not yet executed. 6 live rows would crash if it does not | Integration seat, commit 1; fence lock, commit 6 |
| R3 | That `src/tests/geocode-permits.infra.test.ts` survives the shell replacement **without weakening** | It injects `opts.withTransaction` into a function the frozen shell will no longer own | Guardian seat, commit 1; re-proven green at 7d |
| R4 | That the commit-7e differential proves anything about the WRITE | It cannot — W1 and W2 both have empty target populations today (§2.4). A zero-work run and a broken conversion produce the same capture | Said out loud in §2.4; the fence locks carry the proof instead |
| R5 | That 90 is the right peel value for GP-D1 | It is A4's stated rule (floor to the nearest 5 below the measured 91.2816 %), not an independent judgement. The structural ceiling is ~97 %, so 90 leaves ~7 points of headroom and ~1.3 points of live margin | Commit 8 P1, with §2.6 as its whole rationale |

### RECURRING / STANDARD-SHAPING — what this step teaches the standard

| # | Lesson | Generalises to |
|---|---|---|
| S1 | **A "plausibly" in a plan is a measurement that was not taken.** The plan said the step "has plausibly WARNed on every run since"; one query turned it into 15/15 WARN, 0 PASS — which is what makes GP-D1 a defect rather than a suspicion | every PIN-vs-FIX adjudication: the consumer-observed half of the test is a query, not an inference |
| S2 | **A fence's live population is a measurable number, and measuring it changes the fence's weight.** `has_nonnumeric_geo_id = 6` converts B-5 from "a commit body says PostgreSQL might reorder" into "six rows crash the statement today" | every `preserved-in-compute` fence: state how many live rows exercise it |
| S3 | **A zero-work steady state makes a golden differential structurally uninformative — say so before capturing, not after.** W1 admits 0 rows and W2's scope is empty; the capture will be clean whether or not the conversion works | any conversion whose step is in a converged state at capture time |
| S4 | **The test files a conversion breaks are named in the PRIOR step's comments.** `step-seam.logic.test.ts` says in prose "the moment `geocode_permits` converts, this count moves" — a grep of the fleet's own comments for this slug found the commit-9 obligation at commit 1 | every cutover: grep the test corpus for the incoming slug's NAME, not just its imports |
| S5 | **An admin expectation bound can be broken by history, not by the change under review.** `funnel.ts`'s `records_updated ≤ 100` is breached by 5 of the last 40 pre-conversion runs. A Cross-Domain handoff has to distinguish "the conversion broke this" from "this was already broken" before it files anything | every Cross-Domain step whose consumer declares numeric expectations |
| S6 | **A draft artifact in the working tree is part of the tree, and the fleet suites read the tree.** `validateDescriptor()` passing on a drafted descriptor says nothing about whether the descriptor may *exist* yet; three fleet suites red on its mere presence. "The draft validates" and "the draft may sit here" are different claims and only the first was measured | every conversion's PH-0 → commit-6 window; and generally, any registry-backed artifact whose existence is itself a registered fact |
| S7 | **A fence can be a calling convention, and a calling convention has no descriptor field.** `opts.withTransaction` is the load-bearing seam of this step's only regression lock, and every category in the 20-category descriptor is about *data* — reads, writes, guards, counters. Nothing in the standard has a home for "this function's signature is a test seam", so the Intent Ledger walked straight past it | every conversion replacing an exported function with a frozen shell: enumerate the **exported surface** as a fence class of its own, not just the SQL and the counters |
| S12 | **Four independent ordering constraints, each discovered by running the gate rather than reading it.** A conversion's commit order is not a matter of taste on this programme: `red_suite` grants no hard-stop exclusions (so the descriptor must land with the suite); fast invariant #2 requires the seeds in the SAME tree as the descriptor (so they cannot be deferred one commit); G8 hard-stops from the moment the shell is wired (so the shell and the POST captures are one commit); and a PRE capture taken after the shell captures the CONVERTED behaviour (so it must precede it). Every one was found by executing `--all --fast` at the boundary, not by reading the spec | any programme with a declared commit sequence: run the entry gate at each proposed boundary before writing the sequence down |
| S13 | **A known-bad fixture built by mutating real data goes vacuous the moment the real data moves past the mutation.** `missing-slug-totality.json` proved "a REMAINING slug with no census row throws" by omitting `geocode_permits` — and this cutover converted it, so the omission stopped describing a remaining slug and the fixture quietly stopped proving its own claim. It had to be re-pointed at a slug that is still remaining | every fixture derived from live data: the mutation's PREMISE is itself data and ages with it. Assert the premise, not only the outcome |
| S14 | **A cutover can add a seam pair the converting step never declared.** `geocode_permits`' own declared upstream (`address_points`) is still unconverted and still resolves to nothing; the new pair came from `link_neighbourhoods`, which had declared `geocode_permits` as ITS upstream a day earlier. Registering a step resolves every already-declared read that names it | seam/graph accounting at any cutover: count the inbound edges other descriptors already declare, not just the outbound ones the step declares itself |
| S15 | **The lock that catches its own author is the one that was worth writing.** Three did here: the F3 transaction lock reddened when `recovery.interrupted` moved and forced the reasoning into the descriptor; the Rule 2 banned-token scan reddened on the compute's own docblock and exposed a recurring scanner class; and the capture harness's `--out` guard refused to overwrite an untracked capture, which is the C4 step-H guard doing exactly its job | writing a lock that pins a value you are about to change is not redundant — it is how the change gets explained instead of just made |
| S9 | **A shared runner generalised for its first second-member is generic in the half the author was looking at.** `d7668b8a` correctly generalised everything upstream of the phases — hooks, config resolution, write seams, per-target counters — and left the post-phase summary region a hand-written literal for the one step that existed. The tell was in its own commit message: *"post-phase counters iterate declared targets — I5 with 2 targets no longer throws"*. "No longer throws" and "emits the right number" are different claims, and only the first was made | every "generalise the runner for archetype member 2" WF: the acceptance test is **the second member actually running**, not the first member's goldens still hashing equal |
| S10 | **A stage vocabulary's exclusions are not what the stage's NAME implies, and the plan quoted the name.** `red_suite` sounds like "the permissive early stage"; it is the one stage in the table with *no* exclusions, and the table says so in a comment written to prevent exactly this misreading. The plan attributed `descriptor_only`'s exclusion set to it | every plan that leans on a declared vocabulary's behaviour: quote the table, not the name — and run the gate once with the value actually applied before writing the commit that depends on it |
| S11 | **A hook that scopes by staged files and an invariant that scopes by "all" are different gates, and twelve conversions passed only the first.** Every prior `red_suite` registration went green through `step-validate --staged --fast`, which resolves no step from a staged registry JSON. `--all --fast` on the same tree exits 1. Nobody was wrong; nobody had run the stricter gate | any programme that tightens its own entry gate mid-flight: re-run the new gate against the *existing* green states before assuming they stay green |
| S8 | **A measured fix that lands on the wrong one of two literals is worse than one that gets reverted.** `4de16d00` measured 90.9 %, changed the row, missed the verdict, and left no trace in the tree that a measurement had ever been taken — so five days later a reconciliation commit correctly "aligned" the row back, and the measurement vanished with it | every Rule-10 parallel-boolean site: a duplicated threshold is not just a disagreement risk, it is a *silent-no-op-fix* risk |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=geocode_permits --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=52 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=bottom-left window=39313d9 |
| G3 | 2 | 2 | table rows=19 vocab-hit rows=19 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 1 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=4 it-count=17 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=4 lock-it-count=17 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | geocode_permits | PASS | min_migration=18 <= migrations count=244 |
| 2 | geocode_permits | PASS | 3 declared, missing from seeds: none |
| 3 | geocode_permits | PASS | retired=0 overlap-with-declared=none |
| 7 | geocode_permits | PASS | SPEC LINK header present=true |
| 8 | geocode_permits | PASS | G-4: 3 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | geocode_permits | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | geocode_permits | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 58 PRE capture(s) across 14 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 14 converted slug(s) — 6 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 110 · unexplained: 0

### Test suite (item iii)
- 1156/1157 passed (suite success=false)
- harvested: 19 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (1):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/geocode-permits.js (slug "geocode_permits") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 3 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 5 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=42234B notes=17907B checks=8 rows records_meta=2213B (newest post/ capture) |

**Enforced-green: 13/14**

