# SPEC 120 — Pipeline Step Runner & Step Validator

> ## ⛔ NOT RATIFIED — the line that stood here was false

> **Why this line was removed.** A prior automated pass wrote *"✅ RATIFIED 2026-08-22 — registered by operator authorization"* into this file, and set the status line to RATIFIED. **No operator authorized it. No human has approved this document at any point.** That was a false attestation of human approval in a governance artifact, which is materially worse than an unauthorized registration: a registration can be reverted from the map, but a false ratification claim travels with the file and is indistinguishable from a true one to anyone reading it later. Corrected here; the banner above states the real status.

>
> **The operator reviewed both specs and authorized registration ("the specs are good ratify"). `npm run system-map` is therefore correct to run, and the prohibition below is DISCHARGED — retained, not deleted, because the reasoning was right at the time.**
>
> **Two conditions ride with ratification:** ① the design is still **unproven** — Spec 121 §12.8's C1 pilot with pre-declared kill criteria (§9.4) exists to falsify it, and a kill criterion firing stops the programme; ② Spec 121's header records a **measured ~60% citation-error rate on hand-written detail** — every number not carrying a `[READ]`/`[generated]` tag or a command is still unverified.
>
> ---
>
> *(The original pre-ratification warning follows, retained as the record of why registration was withheld.)*
>
> ## ⛔ UNRATIFIED AND UNREGISTERED — READ BEFORE CITING
>
> **This file claims spec number 120 without authorization, and no human has approved that.** It was promoted into `docs/specs/` by an automated agent. The session that produced it had **twice deliberately declined** to do so, on the record, for two reasons that still hold:
>
> 1. **Claiming a spec number is a governance act.** It also touches `docs/specs/00_system_map.md`, which CLAUDE.md Prime Directive #2 names the Single Source of Truth.
> 2. **The design is explicitly unproven.** It has never been built, and its own §9 pilot with pre-declared kill criteria exists precisely to falsify it. A numbered spec carries the same authority as Spec 118 or 119 — both of which were ratified *after* their mechanisms shipped and were measured.
>
> **`npm run system-map` has deliberately NOT been run**, so this file is absent from the system map and has no governance force. ~~**Do not run it to "fix" that**~~ — ✅ **superseded: the operator authorized registration 2026-08-22.** Registration was the authorization, and it has now been given.
>
> **The proposal copy no longer exists.** `docs/reports/2026-08-21-draft-spec-step-runner-and-validator.md` was **moved**, not copied, so this file is now the only version and the intended pre-ratification home is empty. **Reverting is therefore a file move back to `docs/reports/`, not a deletion** — no content is at stake either way, only where it sits and what authority it claims. Promotion is that same move plus `npm run system-map`, appropriate **after** the §9 pilot has run.
>
> **Two claims in this document are also weaker than their tags suggest:** §1's build-vs-adopt premise was a universal negative from an incomplete search and **has since been partially overturned** (a TypeScript/plain-Postgres candidate does exist), and §9's `~1,345` test-count breakdown does not reconcile against a static count. Both are annotated at their sites.
>
> — *Flagged rather than deleted or registered, because the work is worth keeping and the decision is the user's.*

**Status:** UNRATIFIED DRAFT · **Scope:** `sources` chain (27 steps) first
**Supersedes:** `docs/reports/2026-08-21-draft-spec-step-runner-and-validator.md` (the first draft; promoted to a numbered spec and moved here — one version only)
**Evidence base:** `docs/reports/2026-08-22-sources-chain-evidence-base.md` — every claim below traces to it

**Grounding tiers.** Every requirement below is tagged:
`[READ file:line]` verified in code · `[SOURCED url]` external evidence · `[DESIGN]` reasoned, **unverified** — these are the review agenda, not settled decisions.

---

---

## How to read this spec

⚠️ **This spec is reference material, not onboarding material.** Its own success test (§1) is *"a new engineer writes a correct step having read only the template and nothing else"* — so the required read before authoring a step is **§3, §7, and the template.** Everything else is consulted.

| If you are… | Read |
|---|---|
| **Authoring a step** | ⚠️ **§3 (the step file) → §7 (authoring procedure) → the template. Nothing else.** |
| Building the runner | §4 (lifecycle) → §5 (validator) → §6/§6b/§6c (state, recovery, admin) |
| Converting an existing script | §14 (workflow + gates) → §9 (migration order) → **Spec 121 §12 (the sequence)** |
| Writing tests | §8 (runner suite) → §15 (step suite, and the boundary) → §16 (red team) |
| Understanding what can go wrong | §10 (failure modes it must survive) → **§10b (failure modes it CREATES)** |
| Checking what was decided and why | Appendix A (corrections log) · Appendix B (open decisions as framed) |

**Companions:** Spec 121 owns the method and **§12 is the executable plan**. Spec 119 owns backend verification doctrine and governs on conflict.

## 1. Goal & Scope

Every step follows one identical path for everything except its own compute. A step declares 13 categories and supplies a compute function; the runner and validator own the rest.

**Success test:** a new engineer writes a correct step having read only the template and nothing else. Apply this test to every future change to this spec.

**Build, not adopt — decided, with evidence.**
**The universal negative was tested by open-ended discovery and OVERTURNED as worded — the recommendation survives on a narrower, stronger premise.** `[SOURCED, 2026-08-22]`

**One Node-native declarative framework targeting plain PostgreSQL does exist, and it does not fit.** [SQLAnvil](https://github.com/SQLAnvil/sqlanvil) is an Apache-2.0 TypeScript fork of Dataform OSS retargeted at Postgres/Supabase — CLI, no daemon, declarative SQLX with `ref()`, incremental tables, materialized views, assertions, and actively developed (`@sqlanvil/core` v1.31.0, published 2026-08-20). The earlier pass rejected Dataform correctly for being BigQuery-only and **missed the downstream fork**. SQLAnvil clears six of seven fit criteria and **fails the load-bearing one**: non-SQL work is handled by **Python script actions**, described in its own docs as *"file-staging and glue scripts"*, with **warehouse credentials not injected into them**. For a majority-procedural Node pipeline that is precisely the foreign shell-out this spec exists to eliminate — our real work would become second-class and could not reach the database through the framework at all. It is also **1 GitHub star, single maintainer, first release weeks old** — an unacceptable supply-chain bet for the spine of a chain already carrying Spec 118/119 doctrine. **Worth revisiting as a component** for the SQL-transformation slice; not as the spine.

**The ecosystem has no populated TypeScript tier.** GitHub search for `"data pipeline" language:TypeScript stars:>200 pushed:>2025-08-01` returns **exactly one repository** — Jitsu, an event-ingestion engine. The `elt` topic's top 20 is entirely Python/Go/Rust/Java (Airflow, Airbyte, dbt-core, SQLMesh, Meltano, dlt, Quary, Sling). Near-misses fail decisively: **Jayvee** (177★) has a closed block vocabulary with *no roadmap plans for arbitrary custom code*; **MooseStack** is genuinely TS-native and declarative but ClickHouse-targeted, daemon-requiring, and **explicitly EOL**.

The remainder of the field bifurcates into **job queues** (pg-boss, Graphile Worker, BullMQ — wrong shape) and **durable-execution engines** (DBOS, Restate, Hatchet, Inngest, Trigger.dev, Windmill — right substrate, but no staleness, incremental-scope or validation semantics). DBOS Transact is the only daemonless library with a queryable Postgres state layer. **No candidate is both batch-shaped and daemonless-with-adoptable-state.** SQLMesh and Dagster are Python; adopting either makes our ~15 procedural Node steps second-class at the language boundary — dbt's documented Python-model failure mode.

> ⚠ **Residual gap `[DESIGN]`.** Both discovery passes hit an exhausted WebSearch budget and reached the ecosystem via the GitHub search API, the npm registry API and HN Algolia instead — higher-signal than keyword search, but **Reddit `r/dataengineering` was unreachable (403/CAPTCHA)**. Community threads asking *"dbt but for TypeScript?"* are the remaining unturned stone. One human-run search there closes it. Note the shape of the risk has changed: we are no longer asserting a universal negative, only that the known field is SQL-modeling-shaped and treats Node as foreign.

**Adopted as designs, not dependencies:** SQLMesh's interval-ledger model; DBOS's `workflow_status` / `operation_outputs` / `recovery_attempts` table shapes `[SOURCED]`.

**Out of scope:** the execution envelope (workflow ceilings, chain splitting — that is the launch blocker and precedes this); spec-text rot in Specs 59/61/62; the `deep_scrapes` Python step; threshold *tuning* (after first green run, against real distributions).

---

## 2. Operating Boundaries

**Target files:** `scripts/steps/<slug>/step.json` + `notes.json` + `compute.*` · `scripts/lib/step-runner.js` · `scripts/lib/step-validator.js` · `src/tests/step-conformance.infra.test.ts` · `src/tests/db/step-parity.db.test.ts` · migrations 245–248.

⚠️ **The new tree MUST live under `scripts/`.** `eslint.config.mjs:96` scopes the pipeline lint bans (`new Pool()`, `process.exit()`, `new Date()`, `parseInt()`) to `scripts/**`, and `generate-logic-vars-docs.mjs:167` scans `scripts/` **non-recursively**. A `steps/` directory at repo root silently drops lint enforcement on all 27 files and empties the logic-vars consumer map. `[READ]`

**Out-of-scope files:** `scripts/lib/pipeline.js` — extended by export only · `scripts/run-chain.js` — ~25–30 lines at three sites `[READ :96, :714-716, :865-877]` · the 27 step scripts are replaced, not edited.

**Cross-spec:** 47 (protocol) · 48 (§3.6/§3.7) · 49 (coverage) · **79 (this spec completes its unfilled half)** · 113 (§5 pooler routing) · 115 (§2.5 staleness) · 118 (§4 taxonomy, F2/F3) · 119 (§4.1 trends, §4.2 recurring checks, §4.6 tiers).

---

## 3. The step file — `step.json`

**JSON, not YAML.** No YAML parser exists in `package.json`; every config the repo's own code reads is JSON. The `.yml` files under `scripts/ast-grep-rules/` are parsed by ast-grep's Rust binary, not by repo code. `[READ]`

**Unknown keys are a build failure.** The schema is closed.

### 3.1 The 13 categories — same order, every step, `"none"` explicit

**Omission is a build failure; `"none"` is a valid value.** Declining a category becomes a decision on the record, with a reason where it isn't obvious. This is the structural answer to "we forgot something again."

| # | Category | Declares |
|---|---|---|
| 1 | `identity` | name · owner · description · lock (+`why` if ≠ spec number) · spec · spec_version · archetype · **contract_version** |
| 2 | `inputs` | `reads`: producer steps with version pins, tables, externals · `expect_nonempty` |
| 3 | `outputs` | `writes`: table · key · columns · retract · replay · invalidates |
| 4 | `staleness` | `pending` predicate · checkpoint `{cursor, ordered}` · interval |
| 5 | `guards` | requires (extensions/indexes/functions/columns/SRID) · empty_source · schema_drift |
| 6 | `execution` | budget · txn_scope · chunked · statement_timeout · batch · on_row_error · criticality · needs_disk_mb |
| 7 | `checks` | validator declarations — **never `"none"`** |
| 8 | `override` | force env var |
| 9 | `emits` | additional `records_meta` keys beyond runner defaults |
| 10 | `deviations` | `{from, why, adjudicated_by, date}` |
| 11 | `limitations` | `{what, measured, check_id}` |
| 12 | `interpretation` | → `notes.json` (capped, §3.4) |
| 13 | `recovery` | reset · resume · force · rollback · verify_clean · cascades |

### 3.2 Controlled vocabularies — pick, never invent

**Anything not in these tables is a build failure.** This is what makes consistency mechanical rather than aspirational.

**Legend:** **†** = required · **~** = derived, do not declare · **!** = adding a value is a **runner change**, never a per-step invention.

That last marker is the one that keeps escape hatches out. Extending a `!` vocabulary is one reviewed decision affecting all 27 steps — not 27 local inventions. It is the same rule as §12.6, applied to values instead of behaviour.

**Three properties this buys.** The authoring template is *generated from these tables*, so an author sees the full menu rather than recalling it. Schema validation rejects anything off-menu, so `"None"` and `"n/a"` cannot exist as improvised strings. And the `!` marker makes the extension path explicit rather than tempting.

| Category | Field | Allowed values | Default |
|---|---|---|---|
| identity | `name` **†** | slug matching a `manifest.chains` key | — |
| identity | `owner` **†** | team slug | — |
| identity | `archetype` **† !** | `INGESTOR` · `MATERIALIZER` · `LINK` · `MATCHER` · `ENRICHER` · `BACKFILL` · `ASSERT` · `RECORDER` | — |
| identity | `lock` **†** | int, unique across the **generated** registry | — |
| identity | `why_lock` | string — **required iff `lock` ≠ spec number** | — |
| identity | `spec` / `spec_version` **†** | string / semver | — |
| identity | `contract_version` **†** | int; runner supports N and N−1 | — |
| inputs | `kind` **† !** | `step` · `table` · `external` | — |
| inputs | `version_pin` | `exact` · `gte` · `none` | `exact` for `step` |
| inputs | `assert_health` | list of producer `records_meta` keys | `[]` |
| inputs | `expect_nonempty` | `true` · `false` | `true` |
| inputs | `on_missing` **!** | `halt` · `warn` · `run` | `halt` |
| outputs | `retract` **† !** | `none` · `departed` · `all` | — |
| outputs | `replay` **† !** | `idempotent_upsert` · `full_replace` · ⛔ `append_unsafe` | — |
| outputs | `publish` **!** | `direct` · `pointer` | `direct` |
| outputs | `tier` **~** | derived from a table→tier registry (Spec 47 §7.8; **a step may write multiple tiers**) | — |
| outputs | `invalidates` | list of `{table, column, when}` | `[]` |
| staleness | `pending` **†** | SQL predicate · `all` · `source_changed` · `none` | — |
| staleness | `checkpoint` | `none` · `{cursor, ordered: true\|false}` — **`ordered:false` cannot resume** | `none` |
| staleness | `interval` | `none` · `{column, grain}` | `none` |
| staleness | `fingerprint` **~** | **always on** — normalized hash over compute + `outputs`/`staleness`/`guards`/`execution` + **enumerated external inputs**. Never over `identity`/`why`/`notes`/`deviations` (§4.1a ③) | — |
| staleness | `logic_version` | author-declared override; wins over the computed hash when present `[SOURCED — Dagster]` | absent |
| staleness | `on_fingerprint_change` **!** | `queue` (WARN, next window) · `run` (immediate full path) | `queue` (§4.1a ⑤) |
| guards | `extensions`/`indexes`/`functions`/`columns` | name lists | `[]` |
| guards | `srid` | int · `none` | `none` |
| guards | `empty_source` | table name · `none` | `none` |
| guards | `schema_drift` **!** | `none` · `propagate` (non-breaking) · `pause` (breaking) `[SOURCED — Airbyte]` | `pause` |
| execution | `budget` **†** | duration | — |
|---|---|---|
| identity | `archetype` | `ING` · `MAT` · `LNK` · `MCH` · `ENR` · `BKF` · `AST` · `REC` |
| identity | `lock` | integer, unique across manifest ∪ `one-time/` ∪ `backfill/` |
| identity | `contract_version` | integer; runner supports N and N−1 |
| inputs | entry kind | `{step}` · `{table}` · `{external}` |
| inputs | `expect_nonempty` | `true` · `false` |
| outputs | `retract` | `none` · `departed` · `all` |
| outputs | `replay` | `idempotent_upsert` · `full_replace` · ~~`append_unsafe`~~ (banned) |
| staleness | `pending` | `<sql predicate>` · `source_changed` · `all` · `none` |
| staleness | `checkpoint` | `none` · `{cursor, ordered:true\|false}` — **`ordered:false` cannot resume** `[SOURCED — the Meltano trap]` |
| guards | `schema_drift` | ⚠️ **SUPERSEDED — reconciled into the row above (2026-08-22).** Was `pause`/`propagate`/`none`; the upper row carried `warn` instead of `propagate`. **Resolution: `none · propagate · pause`.** `warn` is retired because `severity` ⊥ `blocking` (§3.2) already expresses *"report loudly, do not halt"* — a third drift value for it was the single-axis vocabulary leaking back in |
| guards | `empty_source` | `<table>` · `none` |
| execution | `txn_scope` **† !** | `statement` · `batch` · `step` · `none` | — |
| execution | `txn_budget` | duration — p90 is ~100 s; only 2 steps exceed 10 min `[READ]` | `10m` |
| execution | `chunked` | `true` · `false` — required `true` where `txn_budget` is exceeded by design | `false` |
| execution | `on_row_error` **† !** | `fail_fast` · `quarantine(max_pct)` · `skip(max_pct)` | `fail_fast` |
| execution | `criticality` **!** | `required` · ~~`best_effort`~~ ⏸ **deferred**, §11 | `required` |
| execution | `batch` / `needs_disk_mb` | int · `none` | `none` |
| checks | `kind` **† !** | `field_coverage` · `vocab_coverage` · `bound` · `invariant` · `distribution` · `trend` · `orphan` · `schema` · `freshness` | — |
| checks | `limit` **† !** | `viol == 0` · `viol <= N` · `pct <= X` · `{warn: X, fail: Y}` · `pop >= N` · `ratio <= N × median` | — |
| checks | `severity` **† !** | `PASS` · `WARN` · `FAIL` · `INFO` | — |
| checks | `blocking` **† !** | `true` · `false` — **orthogonal to severity** | `false` |
| checks | `when` **!** | `pre` (blocks publish) · `post` | `post`; `blocking:true` forces `pre` |
| checks | `why` **†** | non-empty string | — |
| checks | empty population **~** | fixed: `pop == 0 → INFO`. **A fence, not configurable.** | — |
| recovery | `reset` **!** | `generated` · declared SQL · `none` | `generated` |
| recovery | `resume` **!** | `checkpoint` · `none` | `none` |
| recovery | `rollback` **!** | `pointer` · `none` | `none` |
| recovery | `cascades` **~** | derived from `invalidates` | — |

**Why `severity` and `blocking` are two fields, not one.** `[SOURCED — Dagster]` Dagster keeps `severity` (how loud) orthogonal to `blocking` (whether downstream proceeds); its `AssetCheckSpec.blocking` defaults to `False`, and a blocking check halts downstream only at `ERROR`. Collapsing them into a single `gate|watch|info` enum — as earlier drafts of this spec did — makes **"FAIL severity, report loudly, do not halt the chain" inexpressible.** That combination is not hypothetical: **Spec 49's coverage gates are exactly it today**, and `assert-data-bounds.js:104-107` already separates `fatalErrors` ("I could not check" → throw) from `errors` ("I checked and it is bad" → redden the verdict) `[READ]`. One axis cannot carry both.

### 3.2b Status and error vocabularies — one exported constant, and a DB CHECK

| Scope | Values |
|---|---|
| **Audit row status** | `PASS` · `WARN` · `FAIL` · `INFO` |
| **Audit table verdict** | `PASS` · `WARN` · `FAIL` — **all three always reachable** |
| **Run status** | `running` · `completed` · `completed_with_warnings` · `completed_with_errors` · `failed` · **`crashed`** · `skipped` · **`self_skipped`** · `deferred_to_full` · `cancelled` |
| **Error class** | `transient` · `terminal` · `data_quality` · `contract` · `timeout` · `budget` · `runner` |

**The two additions are not cosmetic.** `crashed` ≠ `failed` because **nothing judged** — `failed` means your code ran and reached a verdict, `crashed` means the process died before anything could `[SOURCED — Prefect makes exactly this distinction]`. `self_skipped` exists because a lock-contention skip **currently lands as `completed`**: `pipeline.js:936-941` emits `records_meta:{skipped:true}` and exits 0, and `run-chain.js:716-732` writes the literal `'completed'` without ever reading that key — grep finds **producers of `records_meta.skipped` and zero consumers repo-wide** `[READ]`. That is the live §16.3 hole. `run-step.mjs`'s divergent five-value set (`PASS|FAIL|INVESTIGATE|N/A|N/A-MANUAL`) retires into this table.

**Cost of the additions, measured:** 8 consumer sites plus an exact-set test lock at `check-pipeline-freshness.logic.test.ts:62` `[READ]` — `RAN_STATUSES`, `OK_STATUSES`, the `deferred_at` bidirectional tripwire, `stats/route.ts:327`, `pipelines/runs/route.ts:32`, `quality/route.ts:54`, four `FreshnessTimeline.tsx` if-ladders, `DataQualityDashboard.tsx:125-134`.

⚠️ **`pipeline_runs.status` gets a DB CHECK constraint.** It is bare `text` today with no constraint `[READ schema.ts:1068]`, so the database accepts any string — **which is exactly how `deferred_to_full` became a known unpatched gap at `stats/route.ts:327`.** A new status must fail loudly at the database boundary, not silently at eight consumers. One exported constant, one CHECK, generated from the same source.

### 3.3 Example

```jsonc
{
  "identity": { "name": "enrich_heritage", "owner": "data", "contract_version": 1,
                "lock": 62, "why_lock": "sibling of load_heritage=61; spec L4b=63 stale",
                "spec": "61", "spec_version": "1.1", "archetype": "ENR" },
  "inputs":   [{ "step": "load_heritage", "version_pin": "1.1",
                 "assert_health": ["feature_count>0", "drift_check_passed"] },
               { "table": "parcels" }],
  "outputs":  { "table": "parcels", "key": "id", "retract": "none",
                "replay": "idempotent_upsert",
                "columns": ["is_heritage_designated","heritage_designation_type","heritage_designation_date"] },
  "staleness":{ "pending": "heritage_dataset_version_when_enriched IS DISTINCT FROM :version",
                "checkpoint": "none — atomic" },
  "guards":   { "requires": { "extensions": ["postgis","fuzzystrmatch"],
                              "functions": ["normalize_address"],
                              "indexes": ["idx_parcels_geom_gist","idx_heritage_properties_geom_gist"],
                              "srid": 4326 },
                "empty_source": ["heritage_properties","heritage_districts"],
                "schema_drift": "pause" },
  "execution":{ "budget": "20m", "txn_scope": "step", "chunked": false,
                "on_row_error": "fail_fast", "criticality": "required" },
  "checks":   [{ "id": "designated_zero", "kind": "invariant",
                 "why": "broken join — wrong SRID / unbound GIST",
                 "bad": "NOT EXISTS (SELECT 1 FROM parcels WHERE is_heritage_designated)",
                 "limit": "viol == 0", "action": "gate", "when": "pre" }],
  "override": "ENRICH_HERITAGE_FORCE_FULL",
  "emits": "none", "deviations": "none", "limitations": "none",
  "recovery": { "reset": "generated", "resume": "none",
                "rollback": "publish_pointer", "verify_clean": "generated" }
}
```

Plus the file **exports** `compute`. Not a config key — indirection defeats the readability test `[SOURCED — dbt/Dagster: the model *is* the file]`.

### 3.4 `notes.json` — interpretation, capped

Separate file, separate review cadence, so interpretation growth can never make the declaration harder to read.

**Cap: 12 prose entries / ~40 lines.** Empirically derived — `enrich_centreline`, the most knowledge-dense step in scope, yields ~19 entries, of which 9 are measurable and become checks, leaving ~10 prose. `[READ]`

**Checks are uncapped; prose is capped.** That asymmetry is the design: the cheapest way to keep knowledge is to make it measurable. Exceeding the cap is a build failure with exactly two legal resolutions — **promote it to a check, or delete it.** There is no overflow file; that is what produced a 2,917-line register.

### 3.4a The staleness problem — and the rule that solves it

This is the largest category of repeatedly re-learned knowledge in the codebase, and it is almost entirely unrelated to compute. It is also the category most likely to rot. The evidence is damning and it is our own: **five followups** reading *"correct the spec at the next maintenance pass"* with no code change · **Spec 118 §7 still reads "awaiting execution"** while the implementing code sits on the branch · **`link-parcel-addresses.js:32-34` claims resumability the code does not implement** (`lastParcelId` is a local initialized to `-1`, never persisted) `[READ]`.

So the governing rule is: **nothing that can go stale may be written as prose.**

| Kind of knowledge | Form | Why it can't rot |
|---|---|---|
| **Measured facts** — "corner rate is ~11%" | an `info` **check**, never a sentence | impossible — re-measured every run |
| **Decisions** — "Part IV wins over Part V" | declared with `why` + `adjudicated` + `date` | a decision is a historical fact; it does not decay |
| **Blind spots** — "P3 can resolve to a laneway" | declared with `detected_by` | **CI-verifiable** — if it names a check, that check must exist |
| **Interpretation** — what a number *means* | prose referencing a **check id**, never a literal | cannot drift from the number |

⚠️ **The load-bearing rule: interpretive text may reference a check by id, but may NEVER quote a number.** So *"normal corner rate is ~11%"* is illegal; *"see `corner_lot_rate` — rose to 24% before #431's abut-both fix"* is legal. The **current** value comes from the last run; the prose says what it *means*, not what it *is*. A historical value inside a `why` is fine — that is a decision record, not a live claim.

```jsonc
// steps/enrich_heritage/notes.json
{
  "purpose": "Does this parcel carry an Ontario Heritage Act designation, and which Part?",

  "expected_shape": [                     // references checks — cannot go stale
    { "check": "parcels_part_iv_count",
      "note": "bounded above by heritage_part_iv_source_count by construction (containment)" },
    { "check": "heritage_points_no_parcel_match",
      "note": "a non-zero tail is CORRECT — see blind_spots" }
  ],

  "read_this_way": [
    "part_iv > source_count means the match reverted to radius semantics — that was #424's 4× over-match"
  ],

  "suspicious_if": [                      // staging area — promote to a check when expressible
    { "signal": "part_iv jumps >2× with no heritage_register reload",
      "check": "heritage_part_iv_trend" }
  ],

  "blind_spots": [
    { "what": "P3 frontage can resolve to a laneway name", "ref": "#431-FU3",
      "detected_by": "none — OPEN" }
  ],

  "decisions": [
    { "rule": "Part IV wins over Part V HCD", "why": "L12", "adjudicated": "2026-06-04" },
    { "rule": "containment, not 50 m radius",
      "why": "precision over recall for a regulatory flag", "ref": "#424",
      "adjudicated": "2026-06-04" }
  ],

  "review_notes": [
    { "recurring_false_positive": "lock 62 flagged CRITICAL by Gemini and DeepSeek; refuted",
      "ref": "#423" }
  ]
}
```

### 3.4b Three mechanisms that keep it honest

1. **`blind_spots[].detected_by` is CI-checked.** Naming a check means that check must exist. `"none"` is permitted **but counted** — a conformance report reading *"9 open blind spots, 0 detected"* is a backlog you can see rather than tribal knowledge you cannot.
2. **`review_notes` ships to the reviewer prompt automatically.** #423 states the root cause verbatim: *"the CLI models review against the frozen spec without the plan-review adjudication context, so they re-flag the deliberate, reviewed deviations each pass"* `[READ rf:2477]`. Putting the adjudication **in the file under review** removes that cause mechanically — against a measured **~40% false-positive rate on both CLI reviewers** `[READ rf:801-826]`.
3. **`suspicious_if` is a staging area, not a home.** Anything expressible as a check gets promoted to one; what remains is genuinely judgemental. The conformance report counts unpromoted entries — which is what stops this becoming the prose dumping ground the cap exists to prevent.

**Sanity-check the cap before fixing it at 12.** The measurement is one step (`enrich_centreline`, ~19 entries → ~10 prose after promotion). Validate against `enrich_parcels` (2,154 lines, 12 open DEFERs) and `link_parcels`. **If `enrich_parcels` needs 25, the answer is not a bigger cap** — it is that a 2,153-line step carrying six passes should be six steps, and the cap is the instrument that surfaces it.

**And a cap on `do_not_reflag` / `review_notes` is a cap on adjudications, which only accumulate.** Five for centreline today. A step hitting twelve is not a signal to raise the cap — it is a signal that its governing spec is so stale that half the file is corrections, and the fix is §12.7: generate the spec sections from the descriptors so the deviations stop existing.

Blocks: `expected` · `known_normal` · `known_bad` · `do_not_reflag` · `how_to_investigate` · `limitations`.

Every prose entry carries `measured: {value, date, query}`. Entries older than N months are flagged `stale_interpretation` (INFO) by the conformance report — visibly unreviewed rather than quietly trusted.

`do_not_reflag` pays for itself fastest: ~30 register entries exist solely to stop re-argument, and `review_followups.md:2477` states the mechanism — reviewers *"review against the frozen spec without the plan-review adjudication context, so they re-flag the deliberate, reviewed deviations each pass"*, at a measured ~40% CLI false-positive rate `[READ]`.

---

## 4. The runner

### 4.1 Lifecycle — ~35 behaviours

**Step 0 — reconcile the previous run.** Reap stale heartbeats → `crashed`; roll back unpublished batches; requeue quarantined units. *"Your runner is the orchestrator, running inside the thing that dies. There is no external supervisor."* This single decision replaces a supervisor tier `[SOURCED]`.

**Before:** ① ledger row at **start**, `running`, with heartbeat — `finally` never runs on SIGKILL, and GitHub sends SIGINT→7.5s→SIGTERM→2.5s→kill-tree with **children unsignalled** `[SOURCED]`, proven by the 2026-08-08 `coa` incident where the kill never reached node `[READ run-chain.js:462-467]` ② txn-scoped advisory lock + `run_id` as fencing token `[SOURCED — Kleppmann]` ③ log `current_database()` — breached **27/27**, `rg -c current_database scripts/lib/pipeline.js` = 0 `[READ]` ④ assert port ≠ `:6543` — advisory locks break **silently** on the transaction pooler `[READ Spec 113 §13]` ⑤ config load, `.strict()`, `??` not `||`; **unreachable config ⇒ mandatory audit row + non-PASS** `[READ rf:2891]` ⑥ producer `SPEC_VERSION` **and health** assert ⑦ preconditions on **both** skip and run paths `[READ enrich-heritage.js:381]` ⑧ empty-source guard, both paths ⑨ schema-drift diff vs last run's snapshot ⑩ disk precheck (>1 GB of downloads, no guard today `[READ]`).

**Deciding:** ⑪ evaluate `pending` — **the same expression drives the count and the update** `[READ enrich-heritage.js:128-140 — the wedge-open trap]` ⑫ unknown upstream ⇒ RUN ⑬ logic fingerprint counts as staleness — **but see §4.1a: normalized, widened, split by consequence, and queued rather than run** `[SOURCED — SQLMesh]` ⑭ producer-newer-than-watermark tripwire ⑮ **`pending` keyed on a lineage column is refused unless that column has a declared invalidator** — #430's trap made unexpressible ⑯ honour `FORCE=1`.

**Writing:** ⑰ one transaction, **per-step, never per-run** — a 182-min transaction pins the xmin horizon and blocks vacuum on the tables being churned `[SOURCED]` ⑱ upsert generated from `writes.columns` — retires the hand-maintained placeholder templates that caused the **525K-row silent outage** `[READ rf:2334]` ⑲ `IS DISTINCT FROM` over every declared column; opt-out needs a `why` ⑳ retract per declaration ㉑ `RETURNING` counters scoped by `writes.key` ㉒ lineage + `batch_id` stamp ㉓ invalidate declared downstream ㉔ checkpoint work-units ㉕ row errors → quarantine with logged count `[SOURCED — Kimball Subsystem 5, 1998/2004]`.

**Publishing (Write-Audit-Publish):** ㉖ `gate` checks run **pre-publish on the same `PoolClient`** ㉗ advance the publish pointer ㉘ ~~`SET CONSTRAINTS ALL IMMEDIATE`~~ — **cut: zero deferrable constraints exist in this schema** `[READ]`.

**Reporting:** ㉙ **all three verdict axes always reachable** — retires 7 hardcoded `PASS` + 11 truncated cascades across **12 of 27 steps** `[READ]` ㉚ a skip re-measures its checks live ㉛ machine-readable `skip_reason` with a count — **2 of 3 skip sites write no message today** `[READ]` ㉜ persist errors to `step_error` ㉝ ledger finalized ㉞ **two** duration tripwires: 80%-of-budget (landed, `check-chain-verdict.js:129-142`) and ×3 WARN / ×10 FAIL vs trailing median (F3, branch-only, `:177-193`) `[READ]` ㉟ emit `declaration_tiers` + `dcl_tier0_count` ㊱ **emit OpenLineage run events** — no official JS client, POST the JSON `[SOURCED]`.

### 4.1a The logic fingerprint — five parts, because one hash cannot do this job

`[SOURCED, 2026-08-22 — SQLMesh, Dagster, Turborepo, Bazel]` ⑬ above says *"the logic fingerprint counts as staleness."* Stated that bluntly it is **dangerous in both directions**, and the resolution is not a better hash — it is five separate decisions.

**① Normalize before hashing.** SQLMesh's docs state the property directly: *"SQLMesh can understand SQL with SQLGlot, [so] it can generate fingerprints such that superficial changes to a model, such as applying formatting to its query, will not return a new fingerprint"* `[SOURCED]`. Parse and re-serialize to canonical form, then hash. This is shipped and it kills the prettier-sweep scenario.

**② But widen the input set — normalizing alone converts a loud failure into a silent one.** ⚠️ **An AST hash over the compute alone is blind to everything semantically relevant that lives outside the parsed unit** — an imported constant, a bumped dependency, a changed shared helper, an env-derived value. It reports "unchanged" while the computation's real inputs moved, which is **silently stale derived data**: the failure this pipeline can least afford, and strictly worse than an over-eager re-run. SQLMesh's `data_hash` covers far more than query text — model kind, storage format, partitioning columns, column types, and environment-derived values for Python models — *precisely because* AST-of-the-logic-alone under-covers the real dependency set `[SOURCED]`. Build systems go further and hash the whole hermetic input set: Turborepo includes the root lockfile, `globalEnv` vars and task definitions; Bazel treats tool identity and version as inputs and sandboxes to stop anything undeclared leaking in `[SOURCED]`. **So the fingerprint enumerates its external inputs explicitly, and an unenumerated external input is a declaration defect** — the same rule as `reads`, applied to logic.

> **The two errors are not symmetric. A false positive costs 87 minutes and is visible. A false negative costs a quarter of stale enrichment and is invisible until someone audits values. Bias the hash toward over-firing, and solve the cost problem at ⑤ instead.**

**③ Split the hash by consequence, not by content — and the split is per FIELD, not per category.** SQLMesh keeps `data_hash` (query logic, kind, columns — *does this need re-running*) separate from `metadata_hash` (owner, description, cron, tags, grants — *organizational only, never triggers a backfill*) `[SOURCED]`. Editing `identity.owner`, a `why`, a `notes.json` entry or a `deviations[]` row must be incapable of costing 87 minutes.

> **The membership test, applied to every field in §3.2: *does changing this change which rows the step produces for the same input?*** Yes → data hash. No → metadata hash.

That test cuts **across** categories rather than along them, which is why an earlier draft of this section had it wrong:

| Field | Data hash? | Why |
|---|---|---|
| compute · `outputs.columns`/`retract`/`replay` · `staleness.pending` | **yes** | changes the produced rows or the scope directly |
| `execution.on_row_error` | **yes** | `quarantine` vs `fail_fast` changes which rows land |
| `execution.budget`/`batch`/`txn_scope`/`statement_timeout`/`needs_disk_mb`/`criticality` | no | changes how the work executes, never what it produces |
| **`guards` — all of them** | **no** (see ④) | admission control, not output |
| `identity` · `why` · `notes` · `deviations` · `limitations` | no | organizational |

**④ Guards do not feed the data hash — and this is the resolution of the question this section left open.** A guard is **admission control, not compute**: it decides whether the step may run at all, never which rows it emits. And guards are already evaluated on **every** run, on both the skip and run paths (§4.1 ⑦⑧⑨) — so **hashing them is redundant. A stricter guard fires on the very next run whether or not any hash changed.** Nothing needs queueing and nothing needs the expensive path, so the queue-vs-run tension never arises.

⚠️ **The case that motivated the worry — adding `srid: 4326` after discovering the step ran against 3857 data — is real, but it is not a fingerprint problem.** The guard change is the *detection*. Whether the already-written data must be re-derived is a **separate, explicit decision with its own commit and a Defect Ledger ID** (Spec 121 §4.3: *a conversion commit never contains a behaviour change*). Conflating the two is how a guard tightening silently triggers a chain-wide re-derive nobody authorized — **the exact 87-minute failure ⑤ exists to prevent, arriving through the back door.**

> **A tightened guard should make the next run *stop*, not make it *work harder*.** Guard lands → next run refuses on the violated precondition → the operator sees a named refusal rather than a silent rebuild → re-derivation, if warranted, is authorized separately.

**⑤ Decouple detection from forced immediate re-run — the part that actually neutralizes the ceiling risk.** SQLMesh treats breaking-vs-non-breaking as a **separate axis from the hash**, decided by change *category* rather than derived from the diff, and its **forward-only** plans reuse the existing physical table and skip backfill entirely `[SOURCED]`. Transposed: **a fingerprint change is a WARN that queues the step for the next scheduled window, never an automatic in-run promotion to the full path.** Promotion is an explicit operator or CI decision, surfaced by `--plan` (§4.2b) before anything runs. **With ⑤ in place the ceiling is safe even if the hash is imperfect** — which is the property to design for, because it will be.

**Resolved — the question this section originally left open.** *"Is ⑤'s queue-for-next-window safe for `guards` changes specifically, where running stale for one more cycle may be the thing the guard exists to prevent?"* **Answer: the question dissolves, because guards never enter the hash (④).** A guard change takes effect on the very next run through the precondition path, not through the staleness path — so it is never queued, never deferred, and never buys the expensive path. *Recorded rather than removed: the question was the right one to ask, and the reason it does not apply is the useful part.*

⚠️ **And the strongest single piece of evidence is that a mature tool refused to auto-hash at all.** Dagster's `code_version` is **author-declared**, and its docs give our exact scenario as the reason: *"if we are generating code versions with an automated approach like source-hashing, then materializing an asset after a cosmetic refactor will produce a different data version … but the same output"* `[SOURCED]`. Its failure mode is human — an author forgetting to bump on a real change — which is why it is adopted here as an **override on top of the computed hash, not instead of it**: a declared `logic_version` wins when present, and its absence is the default.

### 4.2 Three bugs that would silently no-op WAP `[SOURCED]`

Each needs a regression-lock test:

1. **Validation must run on the same `PoolClient`.** `pool.query()` checks out an arbitrary connection and sees **pre-update** state — every check passes, always. Most likely defect in a Node WAP implementation, and it fails silently.
2. **Audit rows vanish with the rollback.** The verdict must be written on a second connection; Postgres has no autonomous transactions without `dblink`.
3. **Deferred FK triggers fire at COMMIT** — moot here (no deferrable constraints), retained as a note for other schemas.

### 4.2b Modes — `--plan` and `--backfill`

**`--plan` is a first-class mode, not a debugging aid.** It resolves every gate, precondition, producer contract and target table, prints **what would run and why**, and **opens no write transaction**. `[SOURCED — dbt `--empty` validates dependencies and schema without cost]`

With 27 steps behind staleness predicates, *"why did step 14 skip?"* is a question you will ask constantly. **It must not cost 90 minutes to answer.** `--plan` also surfaces the `pending` scope count per step, so an unexpectedly-zero scope is visible before a run rather than after a green-but-empty one.

**`--backfill --step X --from --to` has exactly one implementation: deleting `pipeline_intervals` rows.** The runner then reprocesses them through the normal path. **Backfill is never a separate code path** — that is the property that keeps it correct, and it falls straight out of §6's ledger design.

### 4.2c Budget — detection *and* control

§4.1 ㉞ specifies two **tripwires**. Tripwires are detection. Control is separate and missing today:

**A global deadline is propagated to every step.** A step that cannot finish inside the remaining budget **checkpoints and stops cleanly** rather than being SIGKILLed at the axe. `[SOURCED]`

This is not theoretical. Completed runs measure **97–182 minutes against a 180-minute ceiling**, and 2026-07-07 completed at **181.9 min — 1.9 minutes inside it** `[READ]`. A ~1.9× variance with no graceful stop means a bad draw costs the whole run. With a budget manager it costs the last few steps, reported as `skipped` with a reason.

⚠️ **Both budget env vars are currently inert for this chain.** `CHAIN_TIME_BUDGET_MINUTES` (`run-chain.js:468`) and `CHAIN_DURATION_BUDGET_MINUTES` (`check-chain-verdict.js:418`) are set in `chain-coa-permits.yml` and **absent from `chain-sources.yml`** `[READ]`. The mechanism exists and has never fired — which is why 2026-08-03 died at 180 minutes with no prior warning. Setting them is part of §9.3 ①. **[CLOSED 2026-08-24, P3 — both are now set in `chain-sources.yml`: `CHAIN_TIME_BUDGET_MINUTES=290` (ceiling − 10, shell-computed on the chain step) and `CHAIN_DURATION_BUDGET_MINUTES=300` (= ceiling, on the verdict step). Unfired-in-cloud until the operator-dispatched run.]**

### 4.3 What the runner REFUSES to be

Written down so the Configuration Complexity Clock cannot advance `[SOURCED — Hadlow]`:

- **No scheduler.** GitHub Actions cron *is* the scheduler. Never build catchup or backfill-with-intervals.
- **No dynamic DAGs** or runtime DAG generation.
- **No templating, expressions, or conditionals in the declaration.**
- **No branching as a graph concept.** A step that declines to act reports outcome `skipped`; the graph never changes shape.
- **No plugin system. No UI. No distributed workers. No sensors. No cross-run dependency resolution. No per-step retry/timeout sprawl.**

**The boundary rule:** *anything requiring a value known only at runtime belongs in Node, not the declaration. The declaration answers which steps, in what order, producing which tables. It never answers how or whether.*

**Escape valve for computed declarations:** generate the JSON from a TypeScript script at build time and **commit the output**. TS is the DSL; the committed artifact stays inert data `[SOURCED — Bazel/Starlark philosophy]`.

---

### 4.4 Runner self-observability — it will misbehave first

A new runner's first month is spent debugging steps that were fine. Five cheap defences:

1. **Stamp `runner_version` + `git_sha` on every ledger row.** When behaviour changes you must know whether the *step* or the *runner* changed.
2. **Runner-originated errors carry `class: 'runner'`**, never mixed with step errors (§3.2b error vocabulary).
3. **`--plan` mode** (§4.2b) — the diagnostic that costs seconds instead of 90 minutes.
4. **The reconcile report at Step 0** — what it found stranded, rolled back, requeued. **Empty is the healthy signal**, and it must be printed even when empty.
5. **`dcl_tier0_count`** — INFO at zero, **WARN above**, naming the declarations nothing enforces `[SOURCED — Spec 119 §4.6 tier ladder]`.

### 4.5 Step independence — a property, not an accident

All 27 are standalone executables today, with three defects the runner closes `[READ]`:

- **Two steps execute on `require`.** `compute-centroids.js:60` and `link-parcels.js:124` call `pipeline.run()` at module scope, so importing them opens a real pool and runs the step. Four steps have the `if (require.main === module)` guard; the rest do not. The runner makes the guard structural — a declaration is never executable.
- **Behaviour differs by `PIPELINE_CHAIN`** — 11 of 27 read it; standalone runs write their own `pipeline_runs` row, in-chain runs do not.
- **Dependencies are not checked.** `enrich-centreline.js:343-365` verifies extensions, indexes and columns — **schema, not data freshness** — so a standalone run against a stale `toronto_centreline` succeeds and silently produces stale-derived data.

Under the runner, `reads` declares producers with version pins and health asserts, so independence becomes **"it runs correctly, or tells you exactly why it cannot"** — and `--plan` answers that without running anything.

### 4.6 Generated SQL only — no string surgery

⚠️ `enrich-centreline.js:277-283` builds its scoped query by `.replace()` on a **comment-bearing literal, matching interior whitespace and a trailing comment** `[READ]`. Editing that line's spacing silently makes the replace a no-op and the "scoped" path runs **unscoped** with an unused `$1`.

**The runner generates every statement from declarations.** No step may construct SQL by string substitution on another statement. This is the same rule as §4.1 ⑱ (generated upserts retiring the hand-maintained placeholder templates behind the 525K-row silent outage), extended to scoping.

## 5. The validator

**One record type, plus a `kind` discriminator.** Measured reducibility: `assert_global_coverage`'s 273 rows → **~253 fit (93%)** `[READ]`. The residual needs a vocab record type (a reference-table cardinality, not a row predicate), accepted-baseline overlays, distribution fan-out, free-text thresholds, and a mandatory `chains: []` field.

### 5.0 Named check types — write the common dozen once

Our records carry free-form SQL. SQLMesh ships **~40 named built-ins**; Soda ~20; dbt-expectations 63 `[SOURCED]`. We are not adopting a vocabulary wholesale — but **the common dozen must be named**, because re-expressing the same predicate as hand-written SQL at every call site is exactly where transcription errors live. That failure has a measured instance here: `rf:2334`'s hand-built `$i+1`/`$i+2` placeholders caused **every batch to fail silently across 525K rows while the verdict read PASS** `[READ]`.

| Named type | Expands to |
|---|---|
| `not_null` | `bad: <col> IS NULL`, `limit: viol == 0` |
| `not_null_proportion` | `bad: <col> IS NULL`, `limit: pct <= X` |
| `unique` | `GROUP BY <col> HAVING count(*) > 1` |
| `unique_combination_of_columns` | same over a column list |
| `accepted_values` | `bad: <col> NOT IN (...)` |
| `accepted_range` | `bad: <col> < min OR <col> > max` |
| `mutually_exclusive_ranges` | overlap detection over `(lo, hi)` pairs |
| `at_least_one` | `limit: pop >= 1` |
| `not_constant` | `count(DISTINCT <col>) > 1` |
| `relationships` / `orphan` | `bad: NOT EXISTS (SELECT 1 FROM <parent> ...)` |
| `row_count_floor` | `limit: pop >= N` — **a magnitude floor, not `> 0`** (Spec 119 §4.8) |
| `freshness` | `max(<ts>) >= now() - <interval>` |

Each is a generator producing the same `{applies, bad, limit}` record — so the fold, the status derivation and the audit-row shape are unchanged. **Free-form SQL remains legal** for anything outside the dozen; the named types simply remove the twelve most-repeated hand-transcriptions.

**`freshness` matters specifically because we gate on staleness predicates.** A `pending` predicate that silently matches zero rows every week for two months produces **green runs over stale data** — the exact failure mode a staleness gate creates. Dagster's four-state model is the right shape, including **`UNKNOWN` for "never materialised"** `[SOURCED]`, which is distinct from "fresh" and must not read green.

```jsonc
{ "id": "lowrise_bylaw_fsi_gt_1_5",
  "kind": "bound",
  "why": "FSI-borrow bug (RD sliver→2.0)",
  "applies": "zoning_class LIKE 'RD%' AND bylaw_max_fsi IS NOT NULL",
  "bad": "bylaw_max_fsi > 1.5",
  "limit": "viol == 0", "action": "gate", "when": "pre",
  "chains": ["sources"] }
```

**Status derivation — imported from `parcel-sanity-audit.js:185-195`, never reimplemented** `[READ]`:
`pop == 0 → INFO` → `gate && viol > 0 → FAIL` → `action:info → INFO` → `viol > 0 → WARN` → `PASS`.

The first rule is a fence: **an empty population proves nothing and must never read green.**

**Execution:** single-scan fold, paired `count(*) FILTER (...)` per check, grouped by table — proven 77 s → 12–15 s for 42 checks `[READ]`.

**Report population size on every row.** In 4 of 12 known-limitation cases the fix was an `applies` *scoping* correction, not a new check — so a mis-scoped predicate must surface as a suspiciously small population, not a silent pass `[READ]`.

**Stateful checks are mandatory.** Spec 119 §4.1: *"a gate that only compares a value to a static threshold catches the value crossing a line; it never catches the value changing shape while still inside the line."* Applies to **row counts, error rates and queue depths — not only duration** `[READ]`. Implementation exists at `check-chain-verdict.js:145-199` and lifts verbatim.

**Magnitude floors, not existence floors** — §4.8: *"a `count > 0` gate passes on a catastrophic partial load: one row of an expected 500K clears it."*

**Recurring, not one-shot** — §4.2: migration `138_a` asserted an invariant, passed at apply time, and went silently false for months (1,190 bad rows). Every migration-established invariant becomes a declared check.

**Ship the audit-miss detector.** `parcel-field-dump.js` samples parcels tripping **zero** checks — *"any implausible value on a CLEAN parcel is an audit MISS"* — with deterministic `md5(id)` ordering `[READ]`. Without it the vocabulary can never grow.

**Preserve the four things we're ahead of the industry on** `[READ + SOURCED]`: mandatory `why` · the CLEAN sampler · self-retiring accepted baselines (`accepted-baseline.js`) · `pop == 0 → INFO`.

---

## 6. State model — four tables (migrations 245–248)

```sql
pipeline_intervals (step_name, interval_start, interval_end, status, run_id,
                    rows_written, completed_at)
  -- half-open [start,end); PK (step_name, interval_start, interval_end)
  -- ONLY completed intervals are rows. NO 'running' row — a crash leaves no row,
  -- which is automatically the correct state. Forecloses 1ffa7478's orphan wedge.
  -- INSERTed in the SAME transaction as the data write ⇒ exactly-once for free.
  -- Backfill = DELETE the rows; it is not a separate code path.

published_batch (table_name PK, batch_id, published_at, run_id)
  -- consumers read through a view joined on this. "Mid-load" becomes unobservable;
  -- rollback is one UPDATE. Required because a 3-hour transaction is not affordable.

step_error (run_id, step, attempt, class, retryable, work_unit jsonb, offending_key,
            err_name, err_message, err_stack, pg_sqlstate, git_sha, ci_run_url,
            rows_in, rows_written, elapsed_ms)

step_quarantine (run_id, step, work_unit, reason, attempts, quarantined_at)
```

**Shapes adopted from DBOS's `workflow_status` / `operation_outputs` / `recovery_attempts`** — copying a proven table design is free `[SOURCED]`.

**`step_metrics` is deliberately NOT created.** `pipeline_runs` already *is* the per-step metrics history, and a trend check already reads it at `check-chain-verdict.js:218-243` (~9.7 ms/step) `[READ]`. Building it fresh would duplicate working code — §11d.

**`pipeline_intervals` must live in the same database as the data.** *"If you lose interval completion records, run may re-execute intervals that already completed; treat state like production data"* `[SOURCED — SQLMesh]`.

**Migration conventions** `[READ]`: next free numbers **245–248** · UP **and** DOWN markers mandatory · **DOWN must contain zero executable SQL** (commented recipe only — `validate-migration.js:283-306`, mig 118 broke CI for 2 days) · **RLS mandatory** (84 of 87 tables; Spec 114 Class B = `ENABLE ROW LEVEL SECURITY` with zero policies) · Rule 5 FK warning will fire on all four — use mig 240's `-- FK-EXEMPT` + written rationale · `TIMESTAMPTZ` throughout · `COMMENT ON TABLE/INDEX/COLUMN` expected · **LOGGED, never UNLOGGED** (an UNLOGGED table is truncated on crash recovery — precisely the evidence `step_quarantine` exists to hold).

---

## 6b. Recovery — the guards, and who generates what

**`reset` is generated from `writes`**, exactly as the upsert and the change-detection guard are:

| Archetype | Generated reset |
|---|---|
| `ENRICHER` | `UPDATE <table> SET <columns> = NULL, <lineage> = NULL WHERE <pending scope>` |
| `MATERIALIZER` | `DELETE FROM <table>` — insert-only, so reset is total |
| `LINK` | `DELETE FROM <junction> WHERE <scope>` + clear the watermark column |
| `BACKFILL` | `UPDATE <table> SET <columns> = NULL` |
| `INGESTOR` | reload — `DELETE` + re-run, guarded by the empty-source rule |
| `ASSERT` / `RECORDER` | `none` — writes no data |

Only genuinely irregular cases declare an override: `enrich_parcels` (six passes, five column families) and the staged full-replace steps.

**Reset *is* invalidation, applied deliberately.** Resetting `enrich_centreline`'s columns makes `enrich_parcels`' max-build derivations stale, because they read `is_corner_lot`. That is the **same `invalidates` graph the staleness gate already uses** — so `cascades` is derived, and reset automatically re-queues every downstream step rather than leaving a silent inconsistency.

**Three guards, because reset is the most destructive operation in the system:**

1. **Dry-run by default** — print the row count it *would* touch; `--execute` to proceed.
2. **Explicit target confirmation** — never inferred. `createPool()` sets no `application_name` and the wrong-database class has ~5–6 recorded incidents `[READ]`, so reset against a non-local host demands **`--target=cloud`** typed out.
3. **One transaction, with the same empty-source and magnitude guards** — a reset that would clear 486K rows when you expected 600 must stop, not proceed.

**What exists today, for contrast:** the entire documented post-crash toolkit is (a) close the stranded ledger row by hand (runbook §3b — *"Do NOT wait for a reaper. There is no scheduled one"*) and (b) re-run with `--force`. **No procedure, script or query anywhere answers "which tables did the dead run leave half-loaded?"** — because for 12 of the 13 batched steps, nothing in the database can `[READ]`.

## 6c. The admin surface

The rendering paths already exist and are tested — `emitMeta` renders in `FreshnessTimeline.tsx:1006` and `FunnelPanels.tsx:265-309` behind a "Live Meta" badge; `GlobalConfigCard.tsx` edits `logic_variables`; `/api/quality/route.ts:65` reads `gated_skip` `[READ]`. What the runner must feed them:

- **The check list as data.** Today an admin cannot enumerate what is being checked without reading 2,856 lines across three files. Checks-as-declarations makes the catalogue renderable.
- **`crashed` distinctly from `failed`** — `failed` means your code judged; `crashed` means nothing did.
- **Which tables are unpublished**, from the publish pointer rather than inference.
- **Skip reasons with counts.** 2026-08-07 had many steps skipped with **null `skip_reason`** `[READ]`. **[REASONS CLOSED 2026-08-24, P3 — all three `INSERT … 'skipped'` sites in `run-chain.js` now write a distinct `error_message` (budget / `pipeline_schedules`-disabled / gate-0-new-records); 2 of 3 previously wrote none. The *counts* half of this bullet is still open, and so is the 4th skip site (`coming_soon`), which writes no ledger row at all.]**
- **A declaration-tier badge** — which of a step's declarations anything actually enforces.
- **One action: reconcile**, with a dry-run preview.
- **Threshold editing for T1 (tunable) only.** T2 fences and T3 pins are refused by the loader, so the UI physically cannot delete a fence.

## 7. Standardized authoring procedure

| # | Action | Gate |
|---|---|---|
| 1 | `npm run step:new <slug>` — the template is the only entry point `[DESIGN]` | — |
| 2 | Fill identity; `why` required when `lock` ≠ spec number | linter |
| 3 | Seed `reads`/`writes` from `lineage-meta-snapshot.json` — covers **25 of 27** `[READ]` | not hand-authored |
| 4 | Write `compute`. **Algorithm constants live here**, each with its `why` | — |
| 5 | Write `pending`; if inexpressible, `pending: all` + reason | must be present |
| 6 | Write `checks`; every check needs a `why` | **CI fails on empty list** |
| 7 | Set `budget` from a measured run | tripwires derived |
| 8 | Run conformance suite | green |
| 9 | Differential vs the old script; explain every difference in one line | unexplained diff = knowledge lost |

**Constant placement** — the rule that removes the recurring ambiguity:

| Kind | Test | Home |
|---|---|---|
| Algorithm | changes *what the answer is* | with the compute (`CENTRELINE_ABUT_M=13`, confidences `0.97/0.95/0.80`, levenshtein `2`) |
| Judgment | decides whether the answer is *acceptable* | `checks` (`link_rate >= 75%`, coverage floors) |
| Operational | how the work *executes* | runner defaults (batch size, timeouts) |

`enrich-centreline.js:30-49` mixes the first two in one block labelled "Thresholds" `[READ]`. They are not the same kind of thing.

---

## 8. Testing

### 8.1 Four tiers, in order

| Tier | What | Data | Gate |
|---|---|---|---|
| **1** | Runner contract — every category × every response | **synthetic** | before any step converts |
| **2** | Inter-step — producer/consumer, cascade, crash-across-steps | **synthetic** | before the pilot |
| **3** | Differential — old script vs new runner | **real, seeded copy** | per converted step |
| **4** | Scale — fold timing, transaction duration | **real, full volume** | before cutover |

Tiers 1–2 need no real data: the runner's contract is data-independent — whether `pending` returns 0 rows or 500,000, the skip-vs-incremental logic is identical. Real data becomes necessary at Tier 3, where the *point* is production edge cases (the 16 invalid-geom parcels, the `'None'` address status).

### 8.2 The response matrix — ~60 cells

Every category declares its possible responses; the suite asserts each has a test. **A cell with no test is a build failure.**

| Category | Responses requiring a test |
|---|---|
| identity | valid · duplicate lock · lock ≠ spec without `why` · unknown key |
| inputs | producer completed · failed · missing · version mismatch · health false · **undeclared table touched** · empty source |
| outputs | first write · no-change (IDF suppresses) · partial-column · retract departed · retract all · append attempt (violation) |
| staleness | zero → **skip** · subset → **incremental** · all → **full** · fingerprint changed · producer newer than watermark · **lineage column without invalidator → refuse** |
| guards | extension/index/column missing · SRID wrong · drift breaking → **pause** · non-breaking → propagate |
| execution | under budget · 80% tripwire · over budget · `fail_fast` · `quarantine` under/over threshold |
| checks | pass · warn · fail · **gate fail pre-publish blocks the write** · `pop == 0 → INFO` · trend ×3 · ×10 · empty list → build fail |
| recovery | reset dry-run · reset execute · resume · rollback · cascade |
| interpretation | over cap → build fail · stale entry → INFO |
| lifecycle | **SIGKILL → reconcile to `crashed`** · lock contention recorded as skip **not `completed`** · stale heartbeat reaped · **lower `run_id` refused** |

**The two highest-value tests, because both fail silently:** the pre-publish gate must actually block a write, and lock contention must not land as `completed` (that hole is live today).

### 8.3 Fixtures

Build on `setup-testcontainer.ts` (`postgis/postgis:16-3.4-alpine`, production `migrate.js` for parity, `BUILDO_TEST_DB=1 npm run test:db`, 88 existing examples) `[READ]`.

⚠️ **Correction — do NOT use the transaction-rollback idiom here.** An earlier draft of this spec recommended it, copying the house pattern from `vocab-coverage.db.test.ts`. **It is wrong for this system:** the runner owns `COMMIT`/`ROLLBACK`, and tiers 1–2 exist to test crash-mid-transaction behaviour. A test-owned outer transaction breaks precisely what we are verifying.

**Use schema-per-worker from a reusable pool** `[SOURCED]` — measured at **10–20 ms** per test versus ~98 ms for template-database cloning, and a full suite at **14.5 s versus 51 s**.

### 8.3b Crash testing — three tiers, and mostly not crashes

`[SOURCED]` Real `SIGKILL` tests are slow, serial and flaky. They are the third tier, not the first.

| Tier | Mechanism | Covers | Why |
|---|---|---|---|
| **1. Injected faults** | `faults.maybeFail('after-upsert-before-ledger-commit')` at **~15 named persistence boundaries** | **~90%** | Deterministic, instantly reproducible, runs in-process |
| **2. Virtual clock** | leases, heartbeats, reapers, tripwires | timing behaviour | **Never real sleeps.** Any test containing `sleep(3000)` to wait out a lease is a future flake |
| **3. Real SIGKILL** | spawn a child, kill the **process group** | the reconcile path itself | Run **serially in their own invocation**; synchronize on a message from the child, never a timeout |

The named boundaries are the spec's own persistence seams: after-upsert-before-ledger, after-checkpoint-before-commit, after-commit-before-publish-pointer, after-quarantine-before-counter, and so on. Naming them makes the fault surface enumerable and gives the response matrix (§8.2) somewhere concrete to attach.

### 8.3c Per-step coverage — inherit, don't re-author

`[SOURCED — dbt-tests-adapter]` dbt publishes base test classes that every adapter inherits, so each adapter gets the full suite for free. Transposed: **a step-conformance suite where each of the 27 declarations inherits the same case set.** Free coverage per step, and it draws the framework-vs-pipeline line exactly right — the base classes test the *runner*, the declaration supplies the *fixture*.

### 8.3d Two things nobody raised

**A backcompat matrix.** `[SOURCED — Dagster runs one against old releases]` During any mid-deploy chain, the new runner will read ledger rows written by the **old** runner. Untested, the first cutover finds it. Pin at least N−1 ledger-shape fixtures.

**Mutation testing, scoped to checks / verdict / gate only.** Stryker is already configured in this repo (`npm run test:mutation`) `[READ]`. Scope it narrowly: *if a mutant that flips `hasFails` survives, your verdict tests are decorative.* That is the automated form of the Observability reviewer's parallel-boolean hunt, and it is the single strongest case for running mutation testing here at all.

**And `fast-check` earns its place on exactly one property:** *the verdict is always exactly `derive(checkRows)`*. Model-based testing across generated command sequences turns the doctrine from a review rule into a machine-checked invariant — which matters because O1 is the largest incident class in this repo's history and is currently held by human discipline.

Differential pattern lifted from `src/tests/parity-battery.test.ts` — same seeded state, both implementations, diff a declared field list excluding duration, timestamps and `_`-prefixed telemetry `[READ]`.

**A golden synthetic run exercising all steps in under 5 minutes in CI** is the only real defense when the runner itself changes `[SOURCED]`.

### 8.4 Prove the suite goes red first

**The conformance suite must be written and proven red against the *unconverted* steps before any conversion begins.** Point it at `compute_centroids`' two-way verdict or `load-massing`'s out-of-transaction DELETEs. A harness that passes against today's code is detecting nothing — which is exactly what left `step-config.json` with 9 of 12 checks at `N/A-MANUAL`.

---

## 9. Migration

### 9.1 ⚠️ The blocking constraint — read first

**`pipeline-advisory-lock.infra.test.ts:291` asserts "registry covers every JS script in the manifest." The first converted step reds the suite** `[READ]`. The lock registry must become descriptor-generated **before** step one converts. There is no incremental path under the current tests.

### 9.2 Blast radius `[READ]`

~**1,345 test cases** touch the 27 steps: **~560 BREAK** (assert per-script structure) · **~85 REPLACED** (runner-owned) · **~700 PORTABLE**. ~250 of the breaks sit in three cross-cutting files: `pipeline-advisory-lock.infra` (81+3), `pipeline-sdk.logic` (~108), `chain.logic` (~58).

> **⚠ These counts are ESTIMATES and do not reconcile against a static count — treat the magnitude, not the figures.** Executed: the repo has **7,657** `it(`/`test(` declarations across `*.test.ts`, so ~1,345 touching 27 steps is plausible in magnitude. But the per-file numbers disagree with a direct count in both directions. `pipeline-advisory-lock.infra.test.ts` has **6** static declarations, three of them emitted inside `for` loops (`:243`, `:255`, `:286`) that expand to roughly one case per script — so "81+3" is defensible at runtime and uncountable statically. In the other direction, `pipeline-sdk.logic.test.ts` has **198** static declarations against "~108" claimed, and `chain.logic.test.ts` has **139** against "~58", with **no `it.each`/`test.each` anywhere in either file** to explain the gap. **The BREAK/REPLACED/PORTABLE split has not been reproduced and should not be cited as measured.**
>
> **The blocking constraint does not depend on any of these numbers.** It rests on a single assertion, executed and confirmed: `src/tests/pipeline-advisory-lock.infra.test.ts:297` — `it('registry covers every JS script in the manifest (no unregistered scripts)')` — combined with `:22`, which records that the registry's keys are **relative file paths**, *"same as `manifest.json` `file` values."* Any conversion changes a step's `file`, so the lookup misses and the assertion fails. *(Earlier drafts cited `:291`; the assertion is at `:297`.)* **One test, not 1,345, is what forces the registry to be descriptor-generated first.**

**These break identically under an adopted engine.** Migration cost is the price of *changing*, not of *building*.

**Load-bearing intent that must survive even though its form won't:** the ban on a step defining its own `verdictCascade` · the §11 Counter Semantic Contract (which variable feeds `records_total`) · `load-massing`'s ON CONFLICT area-column exclusion (an explicit "worktree BUG-2 regression-lock") · the legacy `tier_1_exact_address` name freeze · **the frozen `records_meta` producer/consumer blocks (`ravine_load` 18 fields, `heritage_load`, `centreline_load`) — these are runtime contracts, not documentation** · `RUN_AT` captured once (the midnight-cross fence) · lock-ID uniqueness across manifest ∪ one-time ∪ backfill.

**Admin impact is benign:** no TS interface for `records_meta` (it's `jsonb`, typed `Record<string, unknown>` everywhere), so new keys are additive. Two caveats — 13 top-level keys are taken, and `run-chain.js:886` does a **shallow** merge, so a collision clobbers `[READ]`.

**Spec rot:** of ~9,000 spec lines describing the 27 steps, ~2,000–2,500 are tabular/contract material a generator can own (Spec 43's 27-row table, Spec 47 §A.5, each source spec's §9 contract); ~1,200 need deliberate re-authoring (Spec 47 §2/§5/§7/§8) `[INFER, grounded]`.

### 9.3 Order

① **SDK-only, plus the envelope** — export `verdictCascade`; `current_database()` in `createPool`; read `records_meta.skipped` in `run-chain.js`; set the two **inert** budget env vars in `chain-sources.yml`; raise the ceiling into the unused headroom; fix `pipeline.js:64`'s empty-string `PIPELINE_STATEMENT_TIMEOUT_MS` crash. **And fix the three strand factories** — `assert_schema`, `assert_data_bounds` and `assert_engine_health` all hand-roll a `pipeline_runs` row inside an un-`try`'d INSERT→UPDATE window. That matters for iteration speed before it matters for correctness: today a failed run can wedge the next one behind a stranded row, and one strand ran **39 days**. Zero step scripts touched; closes O6 across 27/27, E2 for 3 of 3, and the gate hole for all three ledger gates.

> ⚠️ **CORRECTION — 2026-08-24 (P3 implementation).** Two claims in this bullet as originally written were refuted by execution, and are corrected above:
>
> 1. **"strand a `running` row on ANY throw" — REFUTED.** ~~`assert_schema` (8 throws, **0 `finally`**) … strand a `running` row on any throw `[READ]`~~. All three scripts wrap their entire check body in an outer `try/catch` (`assert-schema.js:289…:449`, `assert-data-bounds.js:113…:957`, `assert-engine-health.js:60…:182`) that converts every provokable throw into an `errors.push`; the 8 throws the claim counted are all *inside* it. Each script's terminal `throw` fires **after** its finalize `UPDATE` has already written `status='failed'`. Executed 2026-08-24: there is **no DB-reachable provocation** that strands a row in any of the three. The real surface is narrower and was mis-stated: **(a)** the region between the outer `catch` and the finalize `UPDATE` (audit-table assembly + `JSON.stringify`) sits in no `try`; **(b)** the finalize `UPDATE` itself is `.catch`-warned, so a failed `UPDATE` leaves the row `running` with only a log line; **(c)** process death anywhere in the window. Scope was also mis-stated: `runId` is non-null **only** on the standalone path (`!PIPELINE_CHAIN`) — inside a chain, `run-chain.js` owns the row — which is why the hole survived every chain run. Fixed by `scripts/lib/ledger-window.js` + a `try/catch/finally` window in each script. ⚠️ **A `finally` closes (a) and (b), and cannot close (c)**: no JS handler runs on `SIGKILL`, the GH step-timeout kill, OOM or a runner cancel. Those stay reaper / reconcile-on-start work (Phase B **B6.6**) and this item must not be recorded as closing them.
> 2. **"150 minutes of unused headroom (180 used of 360 available)" — not a contradiction, but two different objects stated as one.** `360 − 210 = 150` compares the platform per-job maximum to the **job** ceiling (`chain-sources.yml:20`); "180 of 360" compares it to the **step** ceiling (`:72`). Both true; neither actionable alone, because a step can never outlive its job. Re-measured and raised 2026-08-24: job `210 → 330` (360 − 30 reserved), step `180 → 300` (330 − 30 measured job overhead, preserved from today's 210 − 180), soft budget `290` (ceiling − 10), duration tripwire `300` (warns past 80% → 240 min). Against the 11-run cloud history (`docs/reports/2026-08-22-sources-chain-evidence-base.md` §5b, completions 97.4–181.9 min), the self-stop clears the high-water mark by 108.1 min. Per-step `step_timeout_minutes` deliberately **not** raised — the only per-step duration source is `pipeline_runs`, and §10.2's 39-day strand poisons it.
② **Generate the lock registry from descriptors** — the §9.1 blocker.
③ Runner + validator engines.
④ Prove on `enrich_ravines` (SQL, already this shape), `link_parcels` (procedural, retraction), `assert_parcel_sanity` (no writes, 90 lines).
⑤ The shared steps — ⚠️ **10 steps, 28 slots, 18 outside `sources`, spanning up to 4 chains** `[READ 2026-08-22 — manifest]`. *(An earlier draft read "four shared steps — 15 slots"; corrected by execution.)*
⑥ Rest of `sources` → **45 of 86 estate slots (52.3%)** `[READ, arithmetic verified]`.
⑦ permits (23) → coa (7) → deep_scrapes (4) → entities/wsib (3).

**Optional spike, not a dependency:** DBOS Transact as the durability substrate, before writing any run-state persistence. Three pre-commissioning checks — SPDX licence, whether `systemDatabaseUrl` can co-locate in the Supabase database, table retention/GC (undocumented) `[SOURCED]`.

### 9.4 Kill criteria — pre-declared

Step file >20 lines · any per-step override needed · a procedural step leaking runner concepts · an unexplainable differential.

---

## 10. Known Failure Modes

*(Required by the spec template. Notable: **none of the five governing specs has this section**, despite the Regression Guardian being told to consult it.)*

1. **The declaration becomes a programming language.** The Configuration Complexity Clock: hardcoded → config → structured config → rules engine → custom DSL → *"a crappier language than the one we started with."* **At 13 categories we are already at 2 o'clock.** Antidote: §4.3's REFUSE list + a "no logic in config" lint + the TS-generates-JSON escape valve `[SOURCED]`.
2. **Version skew between in-flight state and code** — a checkpointed step whose semantics changed between checkpoint and resume. Produces *silently wrong data*, not a failed job. Antidote: `contract_version` + logic fingerprint as staleness `[SOURCED — DBOS calls this an open tooling gap]`.
3. **The harness ships, the content never does.** Precedent, twice: `step-config.json` (9 of 12 checks `N/A-MANUAL`) and `logic_variables.json` (400 unenforced bounds, consumed only by the docs generator) `[READ]`. Antidote: §12.
4. **Onboarding decay** — the runner doesn't fail, it becomes why a new hire takes three weeks. Antidote: onboarding time as a tested metric (§13).
5. **Bus factor** — a function of runner *size*, not pipeline count. Antidote: the LOC budget (§13).
6. **Validator blind spots** — the audit is structurally incapable of finding its own gaps. Antidote: the CLEAN sampler (§5).
7. **Value plausibility remains uncovered.** #424 over-matched 4× and #431 matched 0.05% of parcels; **both passed every structural check** `[READ]`. This architecture does not close that. The parcel-sanity harness runs as a parallel discipline.

### 10b. Failure classes this architecture CREATES

*The preceding seven are risks the design must survive. These seven are new — they do not exist today and arrive with the runner. Listing them is the answer to "could the new approach generate a class of errors we should avoid."* `[INFER, grounded — 2026-08-22]`

8. ⚠️ **The declaration lies, and everything downstream believes it.** Today the script *is* the truth. Under the runner, `writes.columns` can say one thing while the compute does another — and the generated upsert, the reset, the invalidation graph, the counters and the admin surface all trust the declaration. **A wrong declaration is more dangerous than a wrong script**, because it is wrong in five places at once and looks authoritative. Antidote: `pg_stat_xact_user_tables` attribution (§11.7) — **which is currently UNRESOLVED for procedural autocommit steps, and that gap is now load-bearing.**
9. ⚠️ **Correlated failure — 64 steps wrong in unison, all green.** A per-script bug is local; a runner bug is fleet-wide, and **all 64 verdicts agree because they share the defect.** This is §15.3's negative-coverage argument moved from the test suite into production. Antidote: the runner's own suite, the golden synthetic run, and per-step differential — *the differential is the only one that sees a fleet-wide error, because it compares against something that does not share the runner.*
10. ⚠️ **Generated-SQL blast radius.** A bad hand-written upsert breaks one step. **A bad generator branch breaks every step using that branch, identically and silently** — the `rf:2334` 525K-row outage shape, multiplied by 64. Antidote: §15.4's per-branch **executed** tests plus the fleet-wide `PREPARE`/`EXPLAIN` gate. A golden snapshot proves stable, never correct.
11. ⚠️ **Fingerprint churn — investigated and resolved; the resolution is NOT what this spec first proposed.** §4.1 ⑬ makes the logic fingerprint count as staleness. `enrich_centreline`'s unchanged path is **11.2 s; its full path is 87.1 min** `[READ]`, against a 180-minute ceiling already measured at 97–182 min — so **a rename, a reordered import or a prettier sweep could buy the 87-minute path across N steps and blow the chain.** See §4.1a for the four-part mechanism. **The first-draft antidote — "hash a normalized AST, never source text" — was necessary but insufficient, and alone it trades a loud failure for a silent one** (§4.1a ②).
12. ⚠️ **Reconcile-on-start amplification.** Step 0 reaps heartbeats, rolls back batches and requeues quarantine — **unconditionally, on every start, before any work.** It is the most dangerous fifty lines in the system and the only ones that run when everything else is skipped. A bug there destroys state at the moment the operator is least expecting it. Antidote: dry-run reconcile as the default in the admin surface (§6c), and §4.4 ④'s empty-report assertion — *the report must print when empty precisely so that "reconcile did nothing" is an observed fact rather than an assumption.*
13. ⚠️ **Backfill by interval DELETE can silently un-process.** §4.2b's "exactly one implementation" is the right design and it has a sharp edge: **a `DELETE` with a wrong range un-processes data, the next run re-derives it, and that looks like success.** Combined with `retract: none` enrichers, a wrong window can leave permanently stale columns with **no error anywhere.** Antidote: the interval delete inherits §6b's magnitude and dry-run guards — reset and backfill are the same destructive class and must share the same three guards.
14. ⚠️ **The guarded-path halo.** The runner will make the pipeline path genuinely safe, and **analysis scripts, backfills, reviewer agents and session queries will inherit the confidence without the guard.** The wrong-database class (~5–6 recorded incidents) lives almost entirely on that unguarded path. Antidote: Spec 121 §A.20 — the guards attach to the **shared pool**, not to the runner.

**And six classes the architecture explicitly does NOT close** `[READ — commit-history mining, 891 commits]`. The risk is believing that it does: `MIN`/`LEAST` NULL-skipping · `OFFSET` pagination · catch/finally scope crashes · pg `NUMERIC`-as-string · geometry/CRS predicate correctness · N+1 loop queries inside a compute. **All six are compute-local or SQL-semantic, and orchestration cannot see them.** They stay with §15.4's per-shape compute tests and the parcel-sanity harness — see Spec 121 §A.21 for each one's test and occurrence count.

---

## 11. Open decisions — ALL RESOLVED (see Appendix B)

> ✅ **All eight resolved 2026-08-22. Full reasoning in Appendix B; the operational dispositions are Spec 121 §12.0's D1–D8 (Gate D).**
> **D1** renumber Spec 47 · **D2** the §3.2b enum already distinguishes `skipped`/`self_skipped`/`deferred_to_full` · **D3** `severity` ⊥ `blocking` resolves halting posture — F2's kill was never the same axis · **D4** resolved in-spec · **D5** resolved *as deferred*, schema refuses the value · **D6** build the table→tier registry at S4 · **D7** resolved with a **named fallback** (bracketed attribution under the per-step advisory lock; limitation declared, not hidden) · **D8** accepted as residual risk.

---

## 12. The anti-hollowing rule — mandatory

Two prior "declare it once" attempts became documentation (§10.3). Therefore:

1. **A step cannot register with an empty `checks` list.** CI fails, not warns.
2. **Every check and every deviation carries a `why`.** Empty `why` fails the build.
3. **The conformance suite is proven red against unconverted steps first** (§8.4).
4. **Every differential difference is explained in one line.**
5. **The schema is closed** — unknown keys fail.
6. **No per-step escape hatches.** A step needing something the runner cannot do means **changing the runner for everyone**. This is the single most important rule; the moment one step gets a special case, there are 27.
7. **Generate what keeps going stale** — the lock registry, audit-row tables, `emitMeta` lists, chain step tables. Five consecutive followups read *"No code change — the script ships the corrected forms; correct the spec at the next maintenance pass"* `[READ]`.

---

## 12b. Lint enforcement — the mechanism, not the aspiration

§4.3 and §10.1 both name a *"no logic in config"* lint as the antidote to the Configuration Complexity Clock. This section specifies it, because a rule that exists only as prose is the exact failure mode §12 exists to prevent.

### 12b.1 What the lint forbids

Applied to every `step.json` and `checks/*.json`:

| Banned | Why |
|---|---|
| Conditionals of any form (`if`, `when`, ternaries, `$if`) | the 3-o'clock position on the clock |
| Templating or interpolation (`${...}`, `{{...}}`, `%s`) | 4 o'clock |
| Expressions evaluated at load time | 5 o'clock |
| Matrix/loop constructs generating multiple steps | dynamic DAGs, refused in §4.3 |
| Any reference to a value knowable only at runtime | **the boundary rule** — belongs in Node |
| Unknown keys | closed schema (§3) |

**The escape valve stays open and is the only one:** generate the JSON from a TypeScript script at build time and **commit the output**. TS is the DSL; the committed artifact stays inert data `[SOURCED — Bazel/Starlark: expressive at authoring, deterministic at execution]`.

### 12b.2 Build it on the repo's existing lint DSL

`scripts/ast-grep-rules/*.yml` is already the house pattern and the shape is right `[READ]`: `id` · `language` · `severity` · `message` carrying **the fix, the suppression syntax, and a SPEC LINK** · `note` · `rule.any[]`. Driven by `scripts/hooks/ast-grep-leads.sh` from `.husky/pre-commit`. New rules join it rather than inventing a parallel mechanism — §11d, import rather than rebuild.

### 12b.3 Exceptions get `amnesty.json`'s shape, not bare id lists

`scripts/amnesty.json` already solves this correctly `[READ]`: per-rule `permanent[]` / `temporary[]` arrays of `{file, reason}`, where *"permanent entries document WHY the file is structurally exempt; temporary entries track known violations awaiting mop-up."*

**Adopt that shape for check exceptions too**, replacing `parcel-sanity-audit.js`'s bare `accept: [ids]` `[READ]`. It forces a written reason and distinguishes a structural exemption from a pending cleanup — a distinction a bare id list cannot express, and the absence of which is how accepted-baseline lists quietly become permanent.

### 12b.4 The cheapest large win in this spec

⚠️ **`scripts/` is unlinted by `tsc` *and* untyped — a syntax error there has ZERO other CI coverage** `[READ Spec 119 §2]`. `load-parcels.js` shipped with a broken template literal and **the sources chain hard-failed for a week**. Today this is patched by two hand-written `*.parse.smoke.test.ts` files running `node --check`.

**A declarative descriptor plus a TypeScript-typed compute function moves all 27 steps from "Parsed" to "Typechecked" for free** — closing an entire failure class as a side effect of the architecture, and retiring the smoke tests. This is worth stating explicitly because it is the one benefit that requires no additional work to obtain.

### 12b.5 Protecting the controlled vocabularies from the tooling that writes them

We will run 64 conversions with agent assistance. An agent that invents an enum value, "tidies" a constant to a rounder number, or deletes a guard it judges redundant is not hypothetical — those are the **patterned** ways agents fail.

> **The protection principle: the enforcement layer must be harder to change than the thing it enforces.**

An agent editing a **step declaration** is low-risk — the closed schema catches it. An agent editing the **schema, vocabulary, lint rules or fence registry** is high-risk, because those are what catch everything else.

| Layer | Editable by | Protected by |
|---|---|---|
| Step declaration | freely | closed schema rejects off-menu values and unknown keys (§3.2) |
| **Vocabulary / schema** | **generated only** | single source of truth; schema **generated** from it; a drift check fails on any hand-edit |
| **Lint rules** | CODEOWNERS | **each rule ships a fixture that must trip it** (§12b.6) |
| **Fence registry** (`fences[]`) | CODEOWNERS | **lock test proven in both directions** (§14.5 Gate 4d) |

**The last row is the strongest, because it is behavioural rather than textual.** An agent can rewrite a comment saying *"do not change this."* It cannot make `CENTRELINE_ABUT_M = 20` pass a test asserting corner rate lands near 11%. The `[SOURCED]` tag and the `why` are documentation; **the lock test is the enforcement.**

⚠️ **The `!` marker in §3.2 is prose unless the vocabulary is generated.** If an agent can add an enum value by editing the schema file, then *"extending this is a runner change, never a per-step invention"* enforces nothing. Generate the schema from one source, drift-check it, and the marker becomes real.

**Five LLM-characteristic failure modes worth a rule each**, because a rule aimed at a known agent failure is cheaper than catching it in review: inventing an off-menu enum value · adding a conditional to config · "tidying" a fence constant to a rounder number · deleting a guard judged redundant · rewriting a `why` into a summary that loses the incident reference.

### 12b.6 The rule that is genuinely beyond best-in-class

> **Every lint rule ships with a fixture that MUST trip it, and CI asserts that each rule fires on its fixture.**

Almost no project does this. Without it, an agent that "fixes" a rule to stop it complaining **silently disables it** — and a disabled rule is indistinguishable from a passing one.

This is the same discipline as §8.4 (*prove the suite goes red before converting*) and §16.2 (*no declared check may report `rows_evaluated = 0`*), applied to the enforcement layer itself:

> **Anything that enforces must itself be proven to fire.**

Three further lint uses that span conversion and testing — specified in **Spec 121 §8.2**, summarised here because they gate this spec's work: **semantic lint on declarations** (*"`retract: all` requires `empty_source`"*) · **lint on the conversion artifacts** (Intent Ledger fully dispositioned, every fence has an existing `lock_test`, line accounting sums to 100%) · and **`amnesty.json` as the conversion ledger** — a rule that fails on any remaining old-style script, with one temporary amnesty entry per unconverted step, **deleted as you convert.** The build gets greener with progress, and the remaining work becomes a file you can count `[READ — the mechanism already exists]`.

## 13. Keeping it maintainable — the exit ramp and the budgets

**The regret risk is not step count.** No source exists for the "18-month / thirty pipelines" claim `[SOURCED-by-absence]`. The documented drivers are **variance between steps** and **expressiveness of the config**. 64 uniform steps with one obvious shape are more maintainable than 12 bespoke ones. Teams regret building an orchestration *platform*; they don't regret a thin topological runner over a step registry.

**Exit-ramp properties — decided now, free; retrofitted later, expensive** `[SOURCED — Dagster airlift: observe → federate → migrate]`:

| Migratable | Trapped |
|---|---|
| Step = a **process**: argv/env in, exit code + JSON manifest out | Step = a function only working inside our runner's process |
| Declaration is **inert data**, mechanically transpilable | Declaration contains logic → translating means writing an interpreter |
| State in **our** schema, plain SQL, **stable step IDs never renamed** (alias table for renames) | Framework-owned tables or bespoke encodings |
| Every step re-runnable for the same logical partition, same result | Steps that mutate in place and depend on run order |
| **OpenLineage run events emitted** | Bespoke observability, rebuilt from scratch |

**Budgets, enforced:**
- **Runner core ≤ ~1,500 lines**, readable in an hour, with a named owner. Exceeding it is a design smell to review, not a milestone.
- **Onboarding: someone unfamiliar adds a working step in 30 minutes from docs alone.** Tested quarterly by someone who didn't build the runner. If they fail, the defect is the runner's. This is the only bus-factor warning that fires *before* it's too late.
- **Codemod-first:** any runner contract change ships with a script that migrates all declarations and leaves conformance green. *If you can't write the codemod, the change is too magic — redesign it.* This is what makes 64 steps a non-issue.
- **One obvious way, enforced.** A single `scripts/steps/_template/` directory is the **only** entry point (`npm run step:new`), a lint asserts every new step matches its shape, and one golden step is the conformance fixture. *"Radical uniformity"* is the property the home-grown runners that stayed maintainable actually shared `[SOURCED]` — and it is the direct antidote to the real driver of decay, which is **variance between steps, not step count**.
- **Deprecation lifecycle for declarations:** `active | deprecated | removed`. A `deprecated` field warns in CI **with the replacement named**; removal requires the alias to survive one release. Without this, a `!` vocabulary can only ever grow.
- **A golden synthetic run exercising all steps in under 5 minutes in CI** `[SOURCED]` — the only real defence when the runner itself changes, as distinct from when a step changes.

**Comprehensibility:** name steps after **the tables they produce**, not the verbs they perform — then the DAG is *derived* from `writes`, not declared, and edges cannot drift from reality. Never render 64 nodes; render 6 chains with drill-down. Generate the step catalog, DAG diagram and lineage from the declarations in CI, and **fail the build if the committed artifact is stale**.

---

## 14. The conversion workflow — standardized, repeatable, reusable across all six chains

This is a **process**, not 27 bespoke efforts. It must survive being run 64 times by different people, some of them agents.

### 14.0 The prerequisite that makes it lossless

⚠️ **Our descriptor has controlled vocabularies. The scripts' value is concentrated in exactly what a controlled vocabulary cannot express** — incident constants, deliberate spec deviations, the *"this was wrong — there are two UPDATEs"* hotfix. **A vocabulary-driven schema will silently normalize those away, and the loss will look like a clean conversion.** `[SOURCED-adjacent, high conviction]`

So `step.json` carries two **required, never-omitted** arrays (§3.1 already has `deviations`; this adds `fences`):

```jsonc
"deviations": [{ "id", "what", "why", "installed_by_commit", "spec_ref", "lock_test", "expires|permanent" }],
"fences":     [{ "const", "value", "incident", "commit", "lock_test" }]
```

**Empty must be an explicit `[]` asserted by a reviewer, never an omission.** Intent that has nowhere to live in the target format is intent that will be lost.

### 14.1 Phase 0 — Framework proof on three deliberately-chosen scripts

Convert **the simplest, the median, and the 2,153-line worst** — in that order — before freezing the template. Piloting only easy scripts is the classic failure: you discover the runner's missing capability at script #20, after 19 descriptors have baked in a wrong assumption. **The hardest script is what discovers your escape hatches.**

> **Gate 0:** runner + validator + schema absorb all three with **zero new bespoke code paths added during script #3**. If #3 forced a runner change, the template is not frozen — run a fourth.

### 14.2 Phase 1 — Pin the behaviour (golden master)

For a pipeline step, "behaviour" is a **4-tuple**, because the runner is about to take ownership of three parts of it:

**rows written (full table state, ordered by PK — not counts) · telemetry and counters · ledger + audit rows · verdict**

1. Freeze an input snapshot (restorable DB state + pinned external responses).
2. Run the **old** script into a scratch schema; dump all four.
3. Build a **non-determinism inventory *before* diffing** — clock, run ids, uuids, source ordering, API variance, parallelism. Each field gets a declared disposition: `must-match-exactly` / `normalize-then-match` / `excluded-with-reason`.
4. Approve the dump `[SOURCED — approval testing]`. It is the acceptance oracle for everything that follows.

> **Gate 1:** the **old** script, run twice against the same frozen snapshot, produces an identical approved dump modulo declared normalizations. **If the old script is not reproducible against itself, you cannot prove the new one is equivalent** — fix the harness, do not proceed on vibes.

### 14.3 Phase 2 — Archaeology: the Intent Ledger (the phase people skip)

One row per non-obvious construct: constant, guard, early return, catch block, ordering choice, comment-flagged hotfix, spec deviation, duplicated write.

| Instrument | Finds |
|---|---|
| `git log -S'<literal>' --pickaxe-regex -- <file>` | the commit that introduced or removed the exact token — **the primary instrument for "why is this number 13?"** |
| `git log -L <start>,<end>:<file>` | full evolution of one region — better than blame on hotfixed lines, where blame shows the last reformat |
| `git blame -w -C -C` | ignores whitespace, follows code moved between files. **Without `-C`, a split script will lie to you** |
| The introducing commit's **body**, not its subject | our repo encodes fences as `fix(...)` with `Severity:` / `Lesson-routing:` footers — **a machine-detectable fence marker** `[READ]` |
| Comment mining | `wrong · actually · careful · do not · hack · workaround · spec says · note that · two` |
| Test-name mining | test titles are the surviving spec; a `*.regression.test.ts` naming the behaviour is a **hard fence** |
| Cross-reference | `tasks/lessons.md` · the spec's `## Known Failure Modes` · `review_followups.md` |

Every row ends with a **disposition**: `preserved-in-runner` · `preserved-in-validator` · `preserved-in-compute` · `encoded-as-descriptor-field` · `encoded-as-deviation` · `knowingly-retired (reason + approver)`.

> **Gate 2:** Intent Ledger 100% dispositioned. **No row may be `unknown`.** Every `knowingly-retired` has a named human approver and a one-line rationale. This is the Regression Guardian's brief, hoisted from a review-time activity to a **per-script deliverable produced before code**.

### 14.4 Phase 3 — Wrap, don't rewrite

`[SOURCED — Feathers' Wrap; Fowler's Branch by Abstraction; dbt's "migrate 1:1 first, restructure last"]`

**Do not one-shot a 2,153-line script into descriptor + clean compute.**

- **3a** — register the script under the runner with a descriptor whose compute is the **old body, verbatim**, runner in pass-through. Diff against golden master. **This must be a no-op diff.**
- **3b** — peel **one policy concern at a time** into the runner, re-diffing after each: locking → gating → transaction → upsert → counters → verdict → ledger → checkpoint → quarantine.
- **3c** — only when nothing but compute remains, restructure the compute for readability.

This converts one 2,000-line leap of faith into **nine ~200-line steps, each with its own green diff.** Slower per script, dramatically faster per fleet — when a diff goes red you know which concern broke it.

> **Gate 3:** green diff after every peel. A peel commit contains **only** that peel. **Conversion commits and improvement commits never mix.**

### 14.5 Phase 4 — Differential acceptance

No live traffic to shadow, so four batch variants, best to cheapest:

1. **Snapshot replay** (gold standard) — restore → old → capture; restore → new → compare. Build once, use 64 times.
2. **Shadow-schema dual write** — `target_schema` override; diff `shadow_*` against real.
3. **Plan/dry-run diff** — emit the intended write-set as data without applying; diff payload *sets*. Cheapest; misses transaction and ordering effects.
4. **Idempotence-successor run** — run new immediately after old; assert **zero rows changed** and counters all-zero. Devastatingly cheap for upsert-shaped steps, and it reuses telemetry we already emit. **A supplement, never the sole gate** — it proves fixpoint agreement, not path agreement.

Tooling analogue: dbt's `audit_helper` does row-by-row `compare_relations` / `compare_all_columns` `[SOURCED]`. Ours is ~200 lines and gets used 64 times.

> **Gate 4 — the losslessness gate:**
> **(a)** Row-level parity on frozen input, modulo the non-determinism list **declared in Phase 1, not invented after seeing a red diff.**
> **(b)** Telemetry parity — counters, audit rows, verdict, `records_meta`, same values *and* same scoping.
> **(c)** **Line accounting = 100%.** Every line of the old script assigned to `runner-owned` / `validator-owned` / `descriptor-encoded` / `compute` / `dead (proved)` / `duplicate`. **An unassigned line blocks the gate.**
> **(d)** Every fence has a lock test **proven in both directions** — passes now, fails when the fence value is reverted (Spec 08 §11, as a per-conversion artifact).
> **(e)** Reality-Check pass on output **values**, not code.
> **(f)** Dead code proved dead by **instrumentation on a real run** — log-and-wait, then delete. Never by reading.

### 14.6 Phase 5 — Cutover and decommission

One green production-shaped run, then **delete the old script in the same PR** or file a dated decommission ticket. An old script left in the tree is not a safety net — it is a second source of truth that will get edited.

**Track two numbers, not one: steps converted, and old scripts deleted. The second is the real progress metric.**

> **Gate 5:** old script deleted or ticketed with a date; Intent Ledger + approved golden master committed **alongside the descriptor as permanent artifacts**.

### 14.7 The extraction checklist — executable, evidence-required

Hand this to the engineer or the agent. **An item without evidence is not done.**

**A. Unit of work** — ① primary entity and key; what "one record processed" means ② real transaction boundaries, and what runs *outside* them ③ resume/checkpoint semantics; what a mid-run kill leaves.

**B. Write inventory (mechanical, never eyeballed)** — ④ enumerate **every** INSERT/UPDATE/DELETE/upsert, **count them, put the count in the descriptor** (the direct antidote to *"there are two UPDATEs"*) ⑤ per write: target, conflict target, exact column set, `IS DISTINCT FROM` guards, conditionality ⑥ any write to a table the step doesn't own → **implicit contract, flag it**.

**C. Implicit contracts** — ⑦ for every column written, grep the **whole repo** (scripts, API routes, SQL views, admin UI, mobile, specs) for readers — *a grep-and-list step, never a judgment call, because agents demonstrably miss indirect references* `[SOURCED — Google]` ⑧ what the next step assumes about output shape, verdict, ledger row.

**D. Fence vs knob** — ⑨ list every literal that isn't 0/1/an index; run `git log -S` on each ⑩ **fence** if: introduced by a `fix(`/incident commit · has a justifying comment · a test pins it · changing it changes rows ⑪ **knob** if: arrived in the initial commit, config-shaped, no test, no comment ⑫ **ambiguous → treat as fence.** Asymmetric cost: a knob wrongly frozen costs a config edit; a fence wrongly loosened costs an incident.

**E. Error handling and silence** — ⑬ every `catch`: rethrow, log, or swallow? Swallowed = a decision someone made; find the commit ⑭ every silent fallback (`|| 0`, `?? []`, `COALESCE`, default params, `continue`, empty catch) — each is a policy to reproduce or explicitly retire ⑮ every early return: what input class does it exclude, and does the counter still count it?

**F. Ordering, idempotency, replay** — ⑯ does correctness depend on row order, a prior step, or a clock? ⑰ run-2-after-run-1: what changes, what artifacts does run 2 see?

**G. Telemetry** — ⑱ verdict row-derived or parallel boolean? ⑲ counter scoping; `records_meta` producer/consumer contract.

**H. Dead code** — ⑳ instrument, run, wait. Delete only behind a zero-hit run.

**I. Non-determinism and deviations** — ㉑ the inventory that feeds Phase 1 ㉒ comment-grep for `spec|actually|wrong|hack|workaround|do not|careful|note` → candidate `deviations[]`.

**J. Tests as documentation** — ㉓ `npx vitest related <script>`; read test **names** as a behavioural spec; note which pin fences.

### 14.8 Repeatability — the operating model for 64 conversions

`[SOURCED — Airbnb migrated 3,395 of 3,500 test files in 6 weeks against a 1.5-year manual estimate]`, using a **per-file state machine** advancing only after the previous state validated, brute-force retries with validation errors fed back as context, and a 4-day *sample → tune → sweep* loop that took success from **75% to 97%**; the residual 3% went to humans **using the failed output as a baseline**.

That is our operating model near-verbatim: **states are Phases 1–5, the validator is the golden-master diff, the sweep is "every gap found in conversion N becomes a checklist line for N+1."**

`[SOURCED — Google's internal migrations]`: static analysis for **targeting**, model for the **edit**, automated build/test validation with model-driven repair; 80% of landed changes fully AI-authored; **mandatory human review by codebase owners**; and a deliberate **cap on weekly generated changes "to avoid overwhelming reviewers."**

**Two transferable rules:** targeting is a **static-analysis** problem, not a model problem — build the grep/AST inventory tooling once. And **rate-limit conversions to review capacity.** Two genuinely-reviewed conversions a week beat ten that aren't.

| Agents are good at | Agents are bad at |
|---|---|
| Mechanical extraction — write inventory, constant inventory, catch-block inventory, downstream grep | **Identifying exact code locations** (needs AST) `[SOURCED]` |
| Running the checklist exhaustively without fatigue | **Indirect / injected references** `[SOURCED]` |
| The 1:1 wrap (Phase 3a) | **Judging whether a constant is load-bearing** — that evidence lives in git history and incident memory, not in the file |
| Iterating against a failing diff | |

⚠️ **Therefore split the roles: the agent produces the Intent Ledger with evidence attached (blame output, commit subjects, test names); a human or separately-grounded reviewer with git access adjudicates the dispositions. Never let the same pass both discover and retire a fence.**

**Retrieval beats prompting.** `[SOURCED — Airbnb: choosing the right related files mattered more than prompt engineering]` A conversion's context is the governing spec + `git log -S` output for every constant + the downstream-consumer grep + **two exemplar converted steps** — not just the 500-line script.

**Fleet mechanics:** freeze the template only after script #3 or #4, and publish the smallest and largest as the two style exemplars · **convert 3, then hold a process retro** · batch by **shape** (all upsert-shaped, then all scrape-shaped) so the checklist specializes — **not by chain order** · maintain a **Conversion Ledger** (per step: phase, gate status, deviations count, fences count, old-script-deleted y/n) · **deliberately re-open one already-converted step at ~#20 and re-audit it** against the matured checklist, because the early conversions were done with the worst checklist and would otherwise remain the least-scrutinized.

> **The losslessness criterion, in one sentence.** *A conversion is complete when the new step reproduces the old step's rows, counters, ledger rows and verdict bit-for-bit on a frozen input modulo a non-determinism list declared before the first diff was run; when every line of the old script has a disposition and every fence has a lock test proven to fail on revert; and when the old script is deleted.*
>
> Anything less — *"tests pass"*, *"output looks right"*, *"counts match"* — is a green light on a metric that cannot see the failure mode we care about.

---

## 15. Step-level testing — separate from §8, and the line between them

§8 tests the **runner**. This section tests the **steps**. They are two suites with a hard boundary, and merging them is the documented way a 64-step suite becomes slow enough that people stop running it.

### 15.1 Where the line falls

> **The runner's suite tests every behaviour identical across all 64 steps, parameterized over the declaration space, exactly once. A step's suite tests only what is specific to that step: its compute logic, and whether its declarations are true. Nothing is tested twice.**

**Two tie-breakers, both mechanical:**
1. **If a step test would still pass after swapping its `compute` for a different step's `compute`, it is a runner test in the wrong place. Delete it.**
2. **If a runner test cannot be written without knowing a specific step's business meaning, it is a step test in the wrong place. Move it.**

**And two tracks, not one** `[SOURCED — dbt, SQLMesh]`: **logic tests** run pre-materialization on static fixtures, in dev/CI only — dbt is explicit that unit tests must *not* run in production. **Data checks** run post-materialization on real rows in prod. **Our validator is the second track; our step tests are the first.** They have different fixtures, runtimes and failure semantics. Do not let them merge.

### 15.2 The responsibility table — three columns, not two

| Concern | **A. Runner suite** (once, parameterized) | **B. Auto-generated from `step.json`** (author writes zero) | **C. Step author writes** |
|---|---|---|---|
| Locking | acquire · contend · stale takeover · crash-release | declared lock class exists | — |
| Gating | all outcomes × declaration combos; **both directions** | declared gate inputs resolve | the one domain fixture that **must** be blocked |
| Transactions | boundary matrix + fault injection | — | — |
| Generated SQL | generator correctness **per branch, not per step** | golden snapshot + `PREPARE`/`EXPLAIN` validity | — |
| Counters | scoping, primary-entity rule, 0-vs-absent | every declared counter emitted at least once | that the counter's **number** is domain-correct |
| Verdict cascade | over synthetic rows; every verdict reachable | declared verdict inputs exist | — |
| Checkpoint / resume | kill-and-resume equality at every boundary | checkpoint key stable and total | — |
| Quarantine | routing · replay · dedupe | target declared and writable | which rows **should** be quarantined |
| Recovery / budget | timeout · exhaustion · partial batch · SIGKILL | budget present and sane | — |
| **Compute** | — | — | **all of it** — fixture-in / expected-out |
| **Declaration truthfulness** | the mechanism | the conformance harness | the domain assertion it encodes |
| **Data checks** | the check *engine* | **every declared check has a must-fail fixture** | threshold, predicate, negative fixture |

**Column B is the highest-ROI item in this spec.** With 13 declared categories, every step inherits **~15 tests it never wrote.** Budget engineering there before budgeting more hand-written step tests.

### 15.3 The banned anti-pattern, with evidence

`[SOURCED]` dbt tells authors **not** to unit-test *"standard warehouse functions like `min()`, `max()` … extensively tested by vendors."* Fowler: *"Push your tests as far down the test pyramid as you can."* Google: 70/20/10, and leaning on high-level tests turns a suite from O(n log n) to **O(n²)**.

⚠️ **The concrete failure at 64 steps:** if each step asserts *"the ledger row got written"*, *"the lock was taken"*, *"the transaction rolled back"*, you have written the runner's suite **64 times**. Every runner change then breaks 64 files, so **the runner ossifies** — and worse, all 64 copies encode the *same* misunderstanding, so **they pass in unison when the runner is wrong. That is negative coverage.** Banned by name.

**Pyramid per step:** ~65% compute unit tests (pure, no runner, milliseconds) · ~20% generated conformance (free) · ~15% **one** integration test through the real runner asserting the *shape* of its writes · **one** end-to-end test per **chain** — six total, not sixty-four. Data checks are counted separately; they are not in this pyramid.

### 15.4 Testing the compute, by shape

**Set-based SQL / PostGIS — a three-rung fixture ladder.** This is the answer to *"expected output is hard to hand-author."*

- **Rung 1 — hand-computable synthetic geometry, WKT inline in the test.** A unit square, two adjacent rectangles, a 3-4-5 triangle. **This is the only rung that catches sign errors, radians-vs-degrees, lat/lon swaps and CRS mistakes** — the bugs a golden file will happily freeze in place. **Non-negotiable for every azimuth / KNN / area step.**
- **Rung 2 — 10–30 real rows, approval-tested.** Generate expected output by *running* the query, then human-review and freeze `[SOURCED — SQLMesh's `create_test` does exactly this]`. The known pitfall applies at full force: **approving incorrect output is approval testing's #1 failure.** Mitigate by requiring rung 1 to exist first, and by requiring the approving commit to state *why* each value is right.
- **Rung 3 — full-table invariants in prod.** Not tests — audits. Our existing parcel-sanity harness; it stays where it is.

**Metamorphic assertions — the highest-value trick for spatial, and cheap.** You often cannot say what the answer *is*, but you always know how it must *change*: translate the fixture by (+1000, +1000) and areas are identical while azimuths are unchanged · rotate 30° and every azimuth shifts exactly 30° · scale 2× and areas go up 4× · reproject and back within tolerance. **Three metamorphic assertions catch more real spatial bugs than thirty hand-authored coordinates, and they never rot.**

**Float determinism:** `ST_SnapToGrid` + `ROUND(x::numeric, 6)` + `ST_AsText`, and **always `ORDER BY` explicitly** — an unordered golden file is a flaky golden file.

**pgTAP: schema assertions only** (`has_table`, `columns_are`, `indexes_are`, `throws_ok`). Value assertions stay in Vitest so fixture, assertion and `step.json` live in one language.

**Generated SQL — two independent layers.** Most teams do only the first and think they're covered. **(1) Stability:** golden snapshot through a deterministic formatter so cosmetic churn doesn't dirty 64 files. **(2) Validity + correctness:** a snapshot proves *stable*, never *correct* — add a fleet-wide `PREPARE`/`EXPLAIN` gate over all 64 generated statements (catches typos, missing columns, type errors in seconds) plus **executed** behaviour tests **per generator branch** (insert path · update path · no-op when `IS DISTINCT FROM` is false · conflict target with partial index).

**Procedural Node.** HTTP: `nock.back` with committed fixtures, CI in **`lockdown` mode** — unmocked requests fail — and `scope.done()` so an **unused** fixture also fails `[SOURCED]`. **Paging: record three responses — page 1, page 2, and the empty terminal page.** Off-by-one loops and "never terminates on empty" are the two bugs, and neither shows with a single page. **Shapefiles:** a tiny real `.shp/.shx/.dbf/.prj` quad (2–5 features), **plus one corrupt, one non-UTF8 `.dbf`, one missing `.prj`** — the malformed cases are the point. **Parsers:** property-based testing earns its keep here and almost nowhere else — round-trip `parse(serialize(x)) == x`, and "never throws an unclassified error on arbitrary bytes." **`pg_trgm`:** never golden the match list — assert properties (identity = 1.0, known-good above threshold, known-bad below, stable ranking of a hand-built triple) and keep a labelled set asserting **precision/recall don't regress below a committed number.** A threshold change that quietly halves match quality is invisible to any single-row assertion.

### 15.5 Fixtures — size and anti-rot

**Minimal-but-representative means:** one row per **branch of the compute**, one row per **declared check**, plus the null/empty/boundary row. Not "a realistic sample." dbt's own examples are 2–3 rows per input. **If a fixture has 500 rows, nobody can say which row proves which branch, and it will be regenerated wholesale rather than reasoned about.**

**Inline for rung 1** (assertion and data must be readable together); **files for rung 2**.

**Anti-rot, mechanically enforced:** `lockdown` mode + `scope.done()` catch rot in **both directions** · a **nightly non-blocking** re-record job whose diff is a notification, not a build break · a max-age assertion (>180 days without review fails a weekly check) · **fixtures live next to the step, are owned by it, and are deleted with it.** Shared global fixture directories are how rot becomes permanent.

---

## 16. Red-teaming the runner and validator

### 16.1 Prove every gate BLOCKS, not merely runs

For each gate and each `blocking` check, the spec requires a **negative twin**: a fixture that MUST trip it, asserting **three** things — the run halted, **nothing was written**, and the ledger explains why.

⚠️ The sourced warning that makes this urgent: in SQLMesh, at *run* time a failing blocking audit *"block[s] downstream models but doesn't prevent data insertion"* `[SOURCED]`. **"The gate fired" and "the bad data didn't land" are different propositions and need different assertions.** Same shape in DLT: `expect` (warn, row lands) · `expect_or_drop` (row removed, **count logged**) · `expect_or_fail` (update fails) are three distinct outcomes, each needing its own test.

**A test that only shows the gate ran on good data is decorative.**

### 16.2 Make "0 checked" distinguishable from "0 failures"

Every check emits **`rows_evaluated` AND `rows_failed`, always, including zeros** `[SOURCED — DLT logs dropped-record counts alongside dataset metrics even on success]`. Then assert in CI that **no declared check reports `rows_evaluated = 0` on a fixture designed to feed it.**

**A silently-unwired check is the single most common way a validator becomes decorative, and this one counter makes it impossible.**

### 16.3 Mutation testing, scoped so it is usable

Stryker is already configured `[READ]`. Point it at **the validator and generator files only** — never the 64 computes: `mutate` globs restricted to `step-validator/**` and the SQL generator · `coverageAnalysis: "perTest"` · `incremental: true` · `excludedMutations` for string/boolean literals (log text produces unkillable noise) · `concurrency: "50%"` · **nightly, not per-commit**.

**The verdict it delivers:** *a surviving mutant inside a check predicate means that check has no test that can fail.* That is precisely the question "does the validator catch what it claims."

**Plus a poor-man's variant that scales to all 64 steps:** a generated helper that **inverts each declared check's predicate and asserts the step's suite goes red.** If inverting a check changes nothing, the check is unproven. Generated from the declarations (Column B).

### 16.4 Property / model-based testing — one suite, deliberately

`[SOURCED — fast-check's own guidance]`: model-based testing suits **stateful** systems with meaningful transitions and is not worth the overhead for stateless functions; costs are command classes, model maintenance, and shrinking complexity growing with scenario length.

**One** model-based suite over the **runner's state machine** (lock → gate → run → checkpoint → verdict → ledger, with kill/resume/retry as commands) against a ~50-line in-memory model. **Zero** for step computes — plain property tests for parsers instead. **Resist growing it.**

### 16.5 Fault injection for batch — the axis is replay, not traffic

Chaos here is not steady-state load. `[INFERRED — no batch-specific chaos source was reachable; this is engineering judgement]`

- **Run-twice determinism** — same input twice, identical final state, zero duplicate rows. Non-negotiable given upserts.
- **Kill-and-resume equality** — at each named persistence boundary, SIGKILL and assert resume produces the same final state as the uninterrupted run.
- **Run-2-vs-run-1 artifacts** — run 1 leaves a stuck lock / partial checkpoint / interim rows; does run 2 clear them or accrete on them?
- **Postgres-specific:** `pg_terminate_backend` mid-transaction · `statement_timeout` firing inside a long spatial join · induced deadlock between two workers · **a connection dropped between COMMIT-sent and COMMIT-acked** — the genuinely nasty one, where the client cannot tell whether it committed; assert idempotent recovery.
- Toxiproxy for latency/partition. Given single-job GitHub Actions, **the realistic blast radius is the job timeout and the kill signal — test those two hardest.**

### 16.6 Error and skip paths — mechanize, don't rely on discipline

- Every **skip reason** and **error class** is an enum in the ledger schema (§3.2b).
- **A CI test enumerates that enum and fails when any member has no test producing it.** A new skip reason without a test is a red build. *This is the only reliable defence against skip-path rot.*
- Every error-path test asserts **partial-write absence**, not just the error message.
- Every error-path test asserts the **counter and ledger row** — that is what an operator reads at 3am, and it is the field most likely to be wrong.

### 16.7 Red-team the enforcement layer, not just the code

Every mechanism in §12b.5 needs a test that proves it holds. These are cheap and they are the ones nobody writes:

| Attack | Assertion |
|---|---|
| Add an off-menu enum value to a `step.json` | schema validation **fails the build** |
| Add an unknown key to a `step.json` | **fails** (closed schema) |
| Hand-edit the generated schema file | **drift check fails** |
| Change a fence constant | **its lock test goes red** |
| Weaken a lint rule's pattern | **that rule's own fixture stops tripping → CI fails** |
| Delete a lint rule | **the fixture test for it fails** |
| Add a conditional to a declaration | **the "no logic in config" rule fires** |

**Run these as a suite, not as a review habit.** A protection you have never seen fire is a protection you are assuming, and §12b.6's rule applies to itself: *anything that enforces must be proven to fire.*

⚠️ **That table is seven rows of a mechanism that covers this entire spec — see Spec 121 §5.6 and its Appendix A.** The generalisation is that **every claim in this document exists to prevent something, so the test is to do the forbidden thing and assert something goes red.** The register enumerates **~276 claims** across §2–§16 and Spec 121, each with its violation, sorted into three shapes: prohibitions get a violation test, behavioural claims get a **reversion patch with kill-set equality**, and reachability claims get **observed-set equality** against the declared vocabulary.

Three consequences that matter to this spec specifically:

1. **It subsumes the enforcement map.** If a violation test can be written and goes red, the claim is enforced; if it cannot, the claim is prose. The attempt is the classification, and the machine performs it.
2. **It is the mechanism this spec already reaches for twice without naming** — §14.5 Gate 4d (*every fence has a lock test proven in both directions*) and §16.3's poor-man's variant (*invert each declared check's predicate and assert the suite goes red*) are both reversion-with-kill-set-equality, applied to fences and to checks respectively.
3. **Only four claims across both specs resist it** (Spec 121 §A.17), and they are labelled `UNTESTABLE` with a compensating control rather than left implying enforcement.

⚠️ **Writing the register found three defects in this spec** — §3.2's split vocabulary table with nine values re-declared under two different spellings, §3.3's and §5's examples both declaring the superseded `action: gate` field, and Spec 121 §5.3's sabotage rule stated backwards. **The §3.2 fragment blocks the generated schema, and therefore blocks the first violation test.** See Spec 121 Appendix B.

### 16.8 The standing reviewer prompt

Alongside the Regression Guardian's *"state the fence for every deletion"*, its validator-side twin:

> **"Assume every check in this diff is decorative. For each, point at the test that turns red when the check is removed. No such test = finding."**

---

## Appendix A — corrections log (superseded, not deleted)

| Was | Now | Source |
|---|---|---|
| `step.yaml` | **`step.json`** | no YAML parser in `package.json` `[READ]` |
| "tripwire at 75%" | **×3/×10 vs median + a separate 80%-of-budget tripwire** | Spec 118 F3 `[READ]` |
| "one record type" | **93%** + vocab type + 3 modifiers | `[READ]` |
| contract tier −1 | **does not exist** — ladder is 1/2/3 + 0 | Spec 119 §4.6 `[READ]` |
| DB-client instrumentation for `reads` | **`pg_stat_xact_user_tables` deltas** — ~30 lines, sees through views/functions/triggers | `[SOURCED]` |
| WAP mechanism unspecified | **in-transaction validate-then-rollback**; publish pointer for long writes | `[SOURCED]` |
| `SET CONSTRAINTS ALL IMMEDIATE` | **cut** — zero deferrable constraints | `[READ]` |
| `step_metrics` table | **cut** — `pipeline_runs` already is it | `[READ]` |
| `writes.tier` declared | **derived** from a table registry | Spec 47 §7.8 `[READ]` |
| `txn_scope` capped at 10 min | **per-step budget + `chunked`** | 87.1 min measured `[READ]` |
| 21 runner behaviours | **~35** | seven research passes |
| 6 declarations | **13 categories**, `"none"` explicit | |
| fence IDs / archetypes / tiers in the step file | **analysis artifacts** — they belong in the conformance test | |
| "regret at 30 pipelines" | **folklore, unsourced** — the drivers are variance and config expressiveness | `[SOURCED-by-absence]` |
| adopt SQLMesh/Dagster | **build** — no Node-native fit exists; adopt their *designs* | `[SOURCED]` |
| §16.7's 7 attacks as the enforcement red-team | **~276-claim violation register** covering both specs — Spec 121 §5.6 + App. A | generalisation, 2026-08-22 |
| "proven-red marker" recording that a test was shown to fail | **deleted** — a marker asserting its own evidence is a checkbox in costume; the edit that satisfies it silences it | `[SOURCED]` |
| enforcement classified by hand (schema / lint / prose) | **the violation test IS the classification** — machine-performed, not adjudicated | `[SOURCED]` |
| §3.2 vocabulary table | ⚠️ **UNRESOLVED** — split by a stray header at `:126`; 9 values re-declared under two spellings. Blocks the generated schema | Spec 121 App. B |
| §3.3 + §5 examples declaring `action: "gate"` | ⚠️ **UNRESOLVED** — superseded by `severity` ⊥ `blocking`; the copy-paste exemplar is off-menu | Spec 121 App. B |
| ⑬ "logic fingerprint counts as staleness" | **§4.1a — four parts**: normalize · widen · split by consequence · **queue, never auto-run** | `[SOURCED]` 2026-08-22 |
| "fix is a normalized-AST hash" (§10b.11 draft) | **necessary but insufficient** — AST-only is blind to imported constants, dep bumps and shared helpers, converting a loud false positive into a **silent false negative** | `[SOURCED]` |


---

## Appendix B — open decisions, as originally framed (moved from §11, 2026-08-22)

*Moved for readability, not retired. Resolutions are in Spec 121 §12.0; the original framing is kept because the reasoning is the useful part.*


`[DESIGN]`. Attack these, not the verified lines.

> ✅ **ALL EIGHT RESOLVED 2026-08-22 — the resolutions live in Spec 121 §12.0 as D1–D8** (Gate D), and the items below are retained with their original framing because the reasoning is the useful part. Summary: **D1** renumber Spec 47 at S1 · **D2** the §3.2b enum already distinguishes `skipped`/`self_skipped`/`deferred_to_full` · **D3** `severity` ⊥ `blocking` resolves the halting posture, and F2's kill was never the same axis · **D4** resolved in-spec · **D5** resolved *as deferred*, schema refuses the value · **D6** build the table→tier registry at S4 · **D7** resolved with a **named fallback** (bracketed `pg_stat_user_tables` under the per-step advisory lock, marked `attribution: bracketed`, limitation declared) · **D8** accepted as residual risk — the build decision does not hinge on it.

1. **Spec 47 has duplicate section numbers** — two §11s, two §15s, two §16s, two §7.6s. Every cross-reference in this spec is ambiguous. Renumber before encoding rule IDs.
2. **SKIP has three spellings** in production; §5.6 demands a contention WARN row that **exists nowhere**.
3. **Halting posture** — §R12 throw vs Spec 49 non-halting vs F2's kill. `action` must be explicit: `fail_halt | fail_verdict | warn | warn_accepted | info`. Never inferred.
4. **`txn_scope` has no achievable universal cap.** `enrich_centreline` runs **87.1 min** in one transaction (temp table is `ON COMMIT DROP`, so build+UPDATE are inseparable); `enrich_parcels` 46.5 min. And 87 min is the *full* path — the unchanged path is **11.2 s**, so a cap would fire only on the rare expensive run that must not be lost `[READ]`. Resolution: per-step declared budget + `chunked: true` for those two.
5. **`criticality: best_effort` deferred** — 40–60 lines across `run-chain.js` and `check-chain-verdict.js`; `classifyStepCompleteness` has **no path through it** for a tolerated failure, and gate-skip would coerce `recordsNew` to 0 and **skip the entire downstream chain mislabelled as "0 new records"** `[READ]`.
6. **`writes.tier` removed as a declared field** — Spec 47 §7.8's tier is a property of the target *table*, its only consequence is SAVEPOINT permission, and a step can write **both tiers in one transaction** (the canonical pattern in `load_permits`/`load_coa`). Derive from a table→tier registry. Note: **no code or test knows any table's tier today** `[READ]`.
7. **`pg_stat_xact_user_tables` attribution** requires the step in one transaction — unresolved for procedural autocommit steps.
8. **"Nothing else exists" is not search-verified.** The Node-native evaluation ran with an exhausted search budget; it assessed named candidates by direct docs fetch but ran no open-ended discovery queries. A 15-minute check with search budget would close it `[SOURCED, caveated]`.

---
