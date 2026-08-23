# SPEC 122 — Pipeline Step Optimization (in-place standardization)

> ## ⛔ UNRATIFIED DRAFT — NOT REGISTERED
>
> **No human has approved this document.** It is not in `docs/specs/00_system_map.md` and has no governance force. `npm run system-map` has deliberately not been run.
>
> This banner is deliberate. Specs 120 and 121 were both promoted to numbered specs by an automated agent without authorization, and one of them additionally carried a **false attestation of human ratification** for a period. That is the failure this banner exists to not repeat.

**Status:** UNRATIFIED DRAFT · **Scope:** the `sources` chain's 27 steps first, then the estate's 64
**Relationship to Spec 120:** 122 **keeps Spec 120's design and replaces its packaging.** Where they conflict on *design*, 120 governs. Where they conflict on *where code lives*, 122 governs.
**Relationship to Spec 121:** unchanged and fully inherited. 121's method — claim register, Violation Suite, enforcement tiers, ratchet, incident replay — is architecture-independent by construction (121 §1) and applies here verbatim.
**Relationship to Spec 119:** 119 owns backend verification doctrine and **governs on any conflict.**
**Evidence base:** `docs/reports/2026-08-22-sources-chain-evidence-base.md` · `docs/reports/2026-08-21-sources-chain-shape-and-phase-b-learnings.md`

**Grounding tiers.** `[READ file:line]` verified in code · `[MEASURED <date>]` executed this session, command recorded · `[SOURCED url]` external · `[DESIGN]` reasoned, **unverified — these are the review agenda, not settled decisions.**

---

## Three architecture decisions — ✅ OPERATOR-RATIFIED 2026-08-23

These were put to the operator as the three questions the spec could not answer for itself. **All three ratified as proposed.** Recorded here as decisions, not assumptions; each is load-bearing for the sections named.

| # | Decision | Rejected alternative | Load-bearing for |
|---|---|---|---|
| **A1** | The descriptor is a **data-only sibling `<slug>.descriptor.json`** | export it from the `.js` — under which a step whose module throws at import becomes unloadable and **silently drops out of every generated artifact** rather than failing loudly | §3.2, §4.2, **§5 in its entirety** (the ledger stops being buildable without executing 27 modules), and 8 claim verdicts |
| **A2** | The escape-hatch ban (claim #128) is enforced by a **mandatory ast-grep shape rule** | rely on review — under which a step need not opt out, it can simply never call in, which is today's situation | §4.1. **Without it, §4 is aspirational and this spec is a style guide** |
| **A3** | Step-0 reconcile becomes a **`reconcile` step at the head of `manifest.chains.sources`** | a `run-chain.js` preamble | §6.4 |

---

## 1. ⚠️ THE FROZEN CONTRACT — 17 categories, set in stone

> **This is the load-bearing rule of the whole programme.** The category list and the allowed responses are decided **once, for all 64 steps**. Extending a `!` vocabulary is a **runner change reviewed once**, never a per-step invention. A step that needs a value the menu lacks does not add one — it escalates (§7.3's kill criteria).
>
> ⚠️ **Omission is a build failure; `"none"` is a valid value — and it applies PER FIELD, not per category.** A category present with fields missing is the same *"we forgot something again"* the design exists to answer.

**The vocabulary is GENERATED from Spec 120 §3.2, never transcribed:**

```
node scripts/violations/extract-vocab.mjs docs/reports/generated/122-vocabulary.md
```

`[generated 2026-08-23 — 56 field rows]`. The extractor **emits the vocabulary and then exits 1** over an unresolved conflict — `fs.writeFileSync` runs before the conflict check (`extract-vocab.mjs:267` writes, `:271-274` reports and returns 1 unless `--allow-conflicts`), so the artifact is always produced and the *exit code* is the gate. It does refuse outright on only one condition: an unproven parser (`:252`).

⚠️ **It found 6 fields declared twice with differing values, independently reproducing the 3 that Spec 121 §12.1a already named** — `identity.archetype` (`INGESTOR|…` vs `ING|…`) · `identity.lock` (uniqueness scope) · `guards.schema_drift` (**one variant carries `warn`, the other does not — both contain `propagate`; the differing tokens are `warn` · `severity` · `blocking`, and a generator cannot choose**) — plus 3 borderline (`outputs.replay` bans `append_unsafe` two different ways; `staleness.pending`; `guards.empty_source`). **All six are S1 deliverables. The contract cannot be frozen until they are resolved in Spec 120 §3.2.**

### 1.1 The 17 categories

| # | Category | Declares | Vocabulary |
|---|---|---|---|
| 1 | `identity` | name · owner · description · lock (+`why_lock` if ≠ spec) · spec · spec_version · **archetype** · contract_version | closed |
| 2 | `inputs` | reads (steps w/ version pins · tables · externals) · expect_nonempty · on_missing | closed |
| 3 | `outputs` | writes: table · key · columns · retract · replay · publish · invalidates · **write_discipline** (§3.0b) | closed |
| 4 | `staleness` | pending · checkpoint · interval · fingerprint~ · logic_version · on_fingerprint_change | closed |
| 5 | `guards` | requires (extensions/indexes/functions/columns/srid) · empty_source · schema_drift | closed |
| 6 | `execution` | budget · txn_scope · chunked · statement_timeout · batch · on_row_error · criticality · needs_disk_mb · **network** | closed |
| 7 | `checks` | validator declarations — **never `"none"`** | **half-closed** (§3.0c) |
| 8 | `override` | force env var | closed |
| 9 | `emits` | additional `records_meta` keys beyond runner defaults | closed |
| 10 | `deviations` | `{from, why, adjudicated_by, date}` | closed shape |
| 11 | `limitations` | `{what, measured, check_id}` | closed shape |
| 12 | `interpretation` | → `notes.json`, capped at 12 | **prose** (§3.0c) |
| 13 | `recovery` | reset · resume · force · rollback · verify_clean · cascades~ | closed |
| **14** | ⚠️ **`database`** | class · min_migration · assert_current_database | closed |
| **15** | ⚠️ **`counters`** | which variable feeds `records_total` / `_new` / `_updated` | closed |
| **16** | ⚠️ **`config`** | logic_variables consumed, with bounds + validation posture | closed |
| **17** | ⚠️ **`sharing`** | is this step shared across chains, and **what varies by chain** (§3.0e) | closed; membership `~` derived |

**Why 14–17 exist. Each retires a MEASURED defect class that had no home** `[MEASURED 2026-08-23]`:

| Category | Evidence |
|---|---|
| **`database`** | 4 analysis scripts default to the pre-cutover DB → **2,394 violations / 0 FAIL gates** vs **30,288 / 1** on the authoritative DB. ⚠️ Claim #257 was demoted for declaring a *DSN* (tier 0, rots). This declares a **requirement the runner asserts at connection open** — tier 3. A step pointed at a 222-migration database **refuses**. §A.20 states the residual it closes: *"#41, #42 and #119 guard the runner. They do not guard analysis, backfills, one-off scripts, reviewer agents, or a query typed in a session — which is where this failure actually bites."* |
| **`counters`** | **9 distinct semantics for `records_total`** — 3 scripts emit `1` for "one audit pass", 2 emit `0` for the same thing. ≥13 counter-scoping incidents. ⚠️ **Spec 120 §9.2 names the §11 Counter Semantic Contract as load-bearing intent that must survive — and gives it nowhere to live.** Verified: zero mentions of counters in §3.1–§3.2 |
| **`config`** | **5 of 12** steps calling `loadMarketplaceConfigs` declare **no schema** (7 have `LOGIC_VARS_SCHEMA`, 12 call it). 400 logic-variable entries in `scripts/seeds/logic_variables.json` carrying **798 bounds** (400 `min` + 398 `max`) **with zero bound-readers** — agrees with §5.2. `.passthrough()` is **8 occurrences across 7 of the 27 corpus files, 38 repo-wide** (`git grep -c "\.passthrough()" -- '*.js' '*.ts' '*.mjs' '*.tsx'`); the *"14"* previously cited here is the number of times `passthrough` is mentioned in `docs/reports/review_followups.md` — an incident count, not a code count. ⚠️ `link-wsib`'s A1/A2 fence exists *because* config validation must be hoisted **above the gate** — a SKIP-eligible step must never let an invalid threshold hide behind a green SKIPPED summary |

| **`sharing`** | ⚠️ **14 shared steps across 36 slots, up to 4 chains each** — and the chain-varying behaviour has no home today. Measured: `link_parcels` carries **two different phase ternaries in the same file** (`:186` `chainId === 'sources' ? 6 : 9` vs `:660` `PIPELINE_CHAIN === 'sources' ? 6 : 7`) — **same axis, different non-sources value, different comparison idiom**. `link_wsib` hand-maintains **4 slug spellings** with a refuted entry recorded in-file. 11 of 27 read `PIPELINE_CHAIN` via 3 idioms. Pipeline-name drift is **8 recorded occurrences** |

**Rejected as a category — it already has a home:** *cadence*. The three-way contradiction is real (`chain-sources.yml` weekly vs Spec 43 *"quarterly"*), but B6.5's tripwire is a step comparing its own last-run age to an expected interval — that is `checks[] { kind: "freshness" }`, which exists. Zero-sum, no 17th category.

> ⚠️ **This spends Spec 120 §13's complexity budget.** §12.12 **B2** caps declaration categories at 13 — *"already 2 o'clock on the Configuration Complexity Clock"* — and requires a named deletion for growth. **Going to 17 is a recorded decision, not drift.** The justification is that each addition *removes* a class of per-step invention rather than adding one.

### 1.2 ⚠️ `outputs.write_discipline` — update, never rewrite

**This is the defect class that made `enrich_parcels` the chain's largest cost, and it was not standardized anywhere.**

Spec 120 has `outputs.replay` (`idempotent_upsert` · `full_replace` · ⛔ `append_unsafe`) and claim **#58** (*`IS DISTINCT FROM` over every declared column; opt-out needs a `why`*). **Those declare HOW you write and that a guard exists. Neither declares that you must PROVE you only touched what changed** — and that proof is what was missing:

| Measured | |
|---|---|
| `buildComparableBuildsUpdateSql` | rewrites **426,732 parcels every run** with no change detection |
| `enrich_parcels` `--full` | **pinned in the manifest**, so the existing incremental path is dead |
| Incomplete IDF guard | **≥9 incidents** — one would have NULL-overwritten a 427K column every quarterly reload |
| An unguarded `ON CONFLICT DO UPDATE` | still writes a **new tuple version** when nothing changed — the heap-churn mechanism Spec 118 §1 identifies |
| `parcels` | 5,806 MB at **38.9% cache-hit**; with `permits`, **87% of all 915M disk block reads** |

> ⚠️ **CORRECTED — the vocabulary already exists and was measured. Do not invent one.**
> A first draft of this section invented a `write_discipline` shape from scratch. **The evidence base §3f already contains a measured 13-class update taxonomy over all 27 steps** `[READ 2026-08-22]`, and §3g a 5-class partial-fill taxonomy. **This is the same mistake §5.0 corrects for the ledger** — treating an existing, grounded artifact as greenfield. The vocabulary below is *ported*, not authored.

**`outputs.write_discipline.class` — the 13 measured classes** `[READ evidence base §3f]`. Closed, `!` frozen:

| Class | Pattern | Steps today |
|---|---|---|
| **A** `guarded_upsert` | `ON CONFLICT … WHERE IS DISTINCT FROM` | 2, 4, 6, 14, 16, 18, 20 |
| **B** `upsert_scoped_departure_delete` | A + `DELETE … <> ALL($1)` | 5 |
| **C** `staging_full_replace` | temp → `DELETE` → `INSERT…SELECT` — **legal, requires `why`** | 7 |
| **D** ⛔ `insert_only_no_retraction` | `ON CONFLICT DO NOTHING` — **a W3 breach; banned for new steps** | 8 |
| **E** `write_once_backfill` | `UPDATE … WHERE <col> IS NULL` — ⚠️ **requires a declared invalidator (§5.4a)** | 9 |
| **F** `link_full_retraction` | upsert + DELETE stale + DELETE zero-match | 10, 15 |
| **G** `set_based_scoped` | one UPDATE, guard, **with** a scope predicate | 11 |
| **H** ⛔ `set_based_unscoped` | guard but **no scope predicate** — **banned for new steps** | 12 |
| **I** `temp_materialize` | TEMP table → UPDATE | 13 |
| **J** `multi_pass_defer` | N passes + scope-defer | 21 |
| **K** `derived_recompute` | bulk UPDATE of a derived column | 3, 17, 19, 22 |
| **L** `verdict_only` | writes `pipeline_runs` only | 1, 23, 24, 26 |
| **M** `snapshot_append` | INSERT into a snapshot table | 25, 27 |

**`execution.partial_fill` — the 5 measured classes** `[READ §3g]`: `atomic` (8 steps) · `batched` (13) · `staged` (1) · `none` (4) · `mixed` (1).

⚠️ **Only ONE step has a real recovery ledger** — `enrich_parcels_pass3_scope` (mig 240), deliberately `LOGGED` because *"an UNLOGGED table is truncated on crash recovery, destroying the exact evidence it exists for."* **For the other twelve batched steps nothing in the database can answer "is this table half-loaded?"** Two are worse than silent: `load-address-points.js:372-378` and `load-parcels.js:548-553` **swallow flush failures** (`catch → log → errors++ → batch=[] → continue`).

**The full declaration:**

```jsonc
"write_discipline": {
  "class": "guarded_upsert",          // ! one of the 13 above; D and H banned for new steps
  "guard": "is_distinct_from",        // ! is_distinct_from · none(+why)
  "guard_columns": "all_declared",    // all_declared · <subset>(+why)
  "expected_change_ratio": "<= 0.05", // rows_changed / rows_scanned, per run
  "idempotent_rerun": "zero_writes"   // ! zero_writes · bounded(+why) · not_idempotent(+why)
}
```

⚠️ **`class` is not decoration — it selects the generated SQL.** The runner emits the upsert, the departure delete and the retraction *from the class*, so class D's missing retraction and class H's missing scope become **unexpressible for a new step** rather than a breach discovered later.

**The runner enforces it, so it is tier 3 not tier 0:**
- generates the upsert from `outputs.columns` with the declared guard — a hand-written `INSERT … ON CONFLICT` in a compute **fails lint** (claim #57, the 525K-row silent outage)
- emits `rows_scanned` / `rows_changed` every run and **checks them against `expected_change_ratio`**
- ⚠️ **`idempotent_rerun: "zero_writes"` is asserted by the founding commit's own acceptance standard — `7e130bff`, Severity HIGH, `lessons.md:28`: run twice, assert the second run updates 0.** That check is what would have caught comps.

> **`full_replace` and `not_idempotent` remain legal — they require a `why`.** `load-centreline`'s staging-table full-replace is spec-sanctioned (Spec 62 **L26**, 47K rows, HEAD/ETag-gated) and must stay expressible. **The rule is not "never rewrite" — it is "never rewrite silently."**

### 1.3 ⚠️ `sharing` — the second classification axis, and it is where the estate actually bites

**Archetype answers *what kind of step is this*. Sharing answers *how many chains does it have to be correct in at once*.** They are independent, and the second is the one C4 exists for.

**Measured `[MEASURED 2026-08-23]`** — and ⚠️ **two correct-but-differently-scoped numbers have already caused one error in Spec 120**, so both are recorded with their scoping:

| Scope | Shared steps | Slots |
|---|---:|---:|
| **Estate-wide** (any step in >1 chain) | **14** | **36** |
| **`sources`-touching only** (the C4 conversion surface) | **10** | **28** |

The 4 estate-only extras are `permits ∩ coa`: `link_coa` · `classify_lifecycle_phase` · `assert_lifecycle_phase_distribution` · `compute_phase_calibration`.

> ⚠️ Spec 120 §9.3 ⑤ says *"four shared steps — 15 slots."* **Both figures are wrong.** State the scope with the number, always — this is the third recorded undercount of this same census.

| Fan-out | Steps |
|---|---|
| **×4 chains** | `refresh_snapshot` · `assert_data_bounds` · `assert_engine_health` |
| **×3** | `assert_schema` · `assert_global_coverage` |
| **×2** | `link_wsib` · `geocode_permits` · `link_parcels` · `link_neighbourhoods` · `link_massing` · `link_coa` · `classify_lifecycle_phase` · `assert_lifecycle_phase_distribution` · `compute_phase_calibration` |

**The declaration — membership is DERIVED, variation is DECLARED:**

```jsonc
"sharing": {
  "chains": "derived",              // ~ from manifest.chains — NEVER declared, or it drifts
  "shared": "derived",              // ~ chains.length > 1
  "slug_forms": "derived",          // ~ retires the hand-maintained OWN_SLUGS arrays
  "varies_by_chain": {
    "checks":      "per_chain",     // ! none · per_chain — checks[].chains selects
    "phase":       { "permits": 9, "sources": 6 },   // ! explicit map, never a ternary
    "audit_table": "per_chain",     // ! one · per_chain
    "scope":       "none"           // ! none · per_chain — does the work set differ?
  },
  "on_contention": "self_skip"      // ! self_skip · wait · fail — see below
}
```

**Why each field earns its place:**

- ⚠️ **`chains` and `slug_forms` are `~` derived and MUST NOT be declared.** `link-wsib.js:55` hand-maintains `['sources:link_wsib','permits:link_wsib','link_wsib','link-wsib']` — four spellings, with an in-file note at `:41-42` that `'entities:link_wsib'` was **refuted (zero such rows ever existed)**. Deriving them from `manifest.chains` retires the whole class: **pipeline-name drift, 8 recorded occurrences, 3 wasted reviewer cycles.**
- ⚠️ **`phase` is an explicit map, never a ternary.** `link_parcels` proves why: `:186` computes `chainId === 'sources' ? 6 : 9` and `:660` computes `PIPELINE_CHAIN === 'sources' ? 6 : 7` — **the same axis, in one file, disagreeing on the non-sources value.** A map cannot disagree with itself.
- **`checks: per_chain`** is what `assert_schema` needed (§3.0's `checks[].chains`) — permits validates permit columns, sources validates source archives, and `parcels` is validated by **all three** (Spec 79 CRIT-3a).
- ⚠️ **`on_contention` — RETRACTED AS JUSTIFIED, RETAINED AS A FIELD.** This section originally claimed contention is *"unobservable"* because `if (!lockResult.acquired) return;` *"emits nothing at all"*. ⛔ **That is FALSE.** `pipeline.js:906` computes `skipEmit = !opts || opts.skipEmit !== false` → **true** when no opts are passed, and `assert-schema.js:259` passes none — so `:932` emits `PIPELINE_SUMMARY` with `records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' }`. **Contention is already observable today.** The contrast case cited (`quality.logic.test.ts:2181`) needs its own test precisely *because* `compute-cost-estimates.js:894` passes `{ skipEmit: false }` and emits by hand. **The field survives on a narrower premise:** two chains can run concurrently, so a shared step needs a *declared* contention policy (`self_skip` is today's default, not a decision anyone made). It is no longer justified by an observability gap that does not exist.

**Sharing drives the conversion gate, not just the descriptor:**

> **A shared step's differential must be green in EVERY chain it appears in — up to 4.** Converting `refresh_snapshot` against `sources` alone proves a quarter of it. That is C4's whole reason for existing, and `sharing.chains` is what makes the gate enumerable instead of remembered.

### 1.4 ⚠️ THE CONCERN INDEX — every Spec 120 concern, its home, its allowed responses

> **This is the McDonald's table.** Every operational concern Spec 120 raises appears here exactly once, with a home and a closed menu. **`"none"` is always a legal answer and must be written explicitly.** Two fields are deliberately open, marked ⬦.
>
> ⚠️ **How this section came to exist is the point.** Four categories were found *reactively* — the operator noticed a gap. That is the same failure Spec 121 §12.9 made: a coverage matrix that mapped ID *spaces*, looked complete, and hid 162 uncited claims. **The fix is `scripts/violations/map-categories.mjs`**, which maps every one of the 290 claims to a home and **hard-fails on an orphan**. Gaps are now found by a tool, not by noticing.

| # | Concern | Declared in | Allowed responses |
|---|---|---|---|
| 1 | **Row errors** | `execution.on_row_error` | `fail_fast` · `quarantine(max_pct)` · `skip(max_pct)` |
| 2 | **Step errors / throws** | **RUNNER** | nothing declared — the library owns `try/finally`, `step_error`, and error class |
| 3 | **Crashes (SIGKILL, OOM, ceiling)** | **RUNNER** + `execution.partial_fill` | `atomic` · `batched` · `staged` · `none` · `mixed` — ⚠️ what a crash *leaves behind* |
| 4 | **Reconcile the previous run** | **RUNNER** (A3: a `reconcile` step at chain head) | nothing declared |
| 5 | **Gating / skip** | `staleness.pending` | `<sql predicate>` · `all` · `source_changed` · `none` — ⚠️ must express all **8 measured mechanisms** |
| 6 | **Lock contention** | `sharing.on_contention` | `self_skip` · `wait` · `fail` |
| 7 | **Time budget** | `execution.budget` | duration · `none` |
| 8 | **Statement timeout** | `execution.statement_timeout` | duration · `none` |
| 9 | **Step ceiling** | `execution.step_timeout` | duration · `none` — ⚠️ **today this lives in the manifest and 1 of 67 declares it** |
| 10 | **Transaction budget** | `execution.txn_budget` + `chunked` | duration · `none`; `chunked` **required `true`** where budget is exceeded by design |
| 11 | **Duration trend** | `checks[] {kind:"trend"}` | `{warn: 3x, fail: 10x}` vs trailing median · `none` |
| 12 | **Producer version pin** | `inputs.version_pin` | `exact` · `gte` · `none` |
| 13 | **Own spec / contract pin** | `identity.spec_version` · `contract_version` | semver · int |
| 14 | **Logic version pin** | `staleness.logic_version` | author override · `none` (the computed fingerprint governs) |
| 15 | ⚠️ **Invocation pin (argv/env)** | `execution.invocation` | **NEW — see below** |
| 16 | **Force override** | `override` | env var name · `none` |
| 17 | **Write discipline** | `outputs.write_discipline` | the **13 measured classes** (§3.0b); ⛔ D and H banned |
| 18 | **Retraction** | `outputs.retract` | `none` · `departed` · `all` |
| 19 | **Invalidation** | `outputs.invalidates` | `[{table, column, when}]` · `none` — ⚠️ **required when `pending` keys on a lineage column** (#54) |
| 20 | **Publish / WAP** | `outputs.publish` | `direct` · `pointer` |
| 21 | **Checkpoint / resume** | `staleness.checkpoint` + `recovery.resume` | `none` · `{cursor, ordered}`; ⚠️ `ordered:false` **cannot** resume |
| 22 | **Counters** | `counters` | which variable feeds `records_total` / `_new` / `_updated` · `null` for observers |
| 23 | **Verdict** | **RUNNER** | nothing declared — **row-derived, never a parallel boolean** |
| 24 | **Audit rows** | `checks` | co-located with the write; the runner emits them |
| 25 | **Thresholds** | `checks[].limit` | `viol == 0` · `viol <= N` · `pct <= X` · `{warn, fail}` · `pop >= N` · `ratio <= N × median` |
| 26 | **Severity / halting** | `checks[].severity` ⊥ `blocking` | `PASS·WARN·FAIL·INFO` ⊥ `true·false` — orthogonal, never collapsed |
| 27 | **Preconditions** | `guards.requires` | extensions · indexes · functions · columns · srid · **database** · `none` |
| 28 | **Empty source** | `guards.empty_source` | table · `none` |
| 29 | **Schema drift** | `guards.schema_drift` | `none` · `propagate` · `pause` |
| 30 | **Disk** | `execution.needs_disk_mb` | int · `none` |
| 31 | **Network** | `execution.network` | `{timeout, retries, hosts}` · `none` |
| 32 | **Database target** | `database` | class · min_migration · assert_current_database |
| 33 | **Config / logic vars** | `config` | keys consumed + bounds + validation posture · `none` |
| 34 | **Chain sharing** | `sharing` | membership `~` derived; `varies_by_chain` declared |
| 35 | **Recovery / reset** | `recovery` | `generated` · declared SQL · `none` |
| 36 | **Deviations** | `deviations` | `{from, why, adjudicated_by, date}` · `none` |
| 37 | **Limitations** | `limitations` | `{what, measured, check_id}` · `none` |
| 38 | ⬦ **Check subject matter** | `checks[].expect` / `.why` | **OPEN** — domain knowledge (§3.0c) |
| 39 | ⬦ **Interpretation** | `interpretation` → `notes.json` | **OPEN, capped at 12**; may cite a check id, **never a number** |
| 40 | **Compute** | `scripts/lib/compute/<slug>.js` | **OPEN — the only genuinely unstandardized artifact** |
| 41 | ⚠️ **Display name** | `identity.display_name` | string — **NEW, see below** |

#### ⚠️ Concern 41, found by auditing the contract against a whole real file

`audit_table.name: 'Schema Validation'` had no home. Measured `[2026-08-23]`: declared **5 times across 3 layers** — `assert-schema.js:482,:505,:533` · `FreshnessTimeline.tsx:89` · `src/lib/quality/types.ts:634` — and pinned by a source-text test at `admin.ui.test.tsx:1155`. Across the 27 steps there are **34 distinct name strings with no convention** (`'Parcels Ingestion'` · `'LINEAR_26'` · `'Data Quality'` vs `'Data Quality Checks'`).

**One declaration, consumed by the admin layer instead of re-declared there.** Same shape as the slug forms: a value duplicated across layers because nothing owns it.

#### ⚠️ Concern 15 is a NEW gap, found by enumerating this table `[MEASURED 2026-08-23]`

**The manifest pins argv that the descriptor cannot see:**

```
enrich_parcels  chain_args {"sources":["--full"]}
link_massing    chain_args {"sources":["--full"]}
```

**That pin *is* the defect L-2 records** — *"a manifest pin disables an incremental path that already exists."* `enrich-parcels.js` has a working incremental mode; the manifest forces `--full` past it on every run. A descriptor that declares `staleness.pending` while the manifest overrides it with argv is **declaring a fiction**.

Same shape for concern 9: `step_timeout_minutes` is manifest-only and **1 of 67 steps declares it**.

> **Resolution:** `execution.invocation` declares the argv/env the step is invoked with, **per chain**, and a drift check asserts **manifest ⟷ descriptor agree**. Neither may silently override the other.
>
> ```jsonc
> "invocation": { "args": { "sources": [], "permits": [] }, "env": "none" }
> ```
>
> ⚠️ **This is concern 15 of 40, and it was found by writing the table rather than by review.** That is the argument for the table.

### 1.5 What is NOT a canned response

**15 of 17 categories are fully closed menus.** Two are deliberately not, and the boundary matters:

| Category | Closed part | Open part |
|---|---|---|
| **`checks`** — the validator | `kind` · `limit` · `severity` · `blocking` · `when` are **closed enums**; the verdict cascade is **runner-owned and row-derived** | the `expect` list and the `why` string are **domain knowledge** |
| **`interpretation`** — understanding the step | capped at 12 entries; **may reference a check id but may NEVER quote a number** | the prose itself |

> ⚠️ **No vocabulary could supply that `WARD` is text in the CoA *Active* resource and `WARD_NUMBER` is int4 in *Closed*.** That is what `checks[].expect` is for. Claiming 100% canned oversells it — the honest claim is: **the shape, the machinery and the verdict are canned; the domain facts and the interpretation are authored.**

### 1.6 ⚠️ `identity.archetype` becomes load-bearing — it drives required fields

**No 17th category is needed for "type of step" — `archetype` already is it**, and Spec 120 §6b already uses it (*"`reset` generated per archetype"*, 6 archetype resets). **This makes it enforce rather than describe.**

**The classification already exists and is measured** — evidence base §2's master table assigns one to every step `[READ 2026-08-22]`. Port it; do not re-derive:

| Archetype | Count | Steps |
|---|---:|---|
| `INGESTOR` | **9** | 2 `address_points` · 4 `parcels` · 5 `load_ravines` · 6 `load_heritage` · 7 `load_centreline` · 14 `massing` · 16 `neighbourhoods` · 18 `load_wsib` · 20 `load_zoning` |
| `ENRICHER` | **6** | 3 `geocode_permits` · 11 `enrich_ravines` · 12 `enrich_heritage` · 13 `enrich_centreline` · 21 `enrich_parcels` · 22 `compute_parcel_cost_estimates` |
| `ASSERT` | **5** | 1 `assert_schema` · 23 `assert_global_coverage` · 24 `assert_parcel_sanity` · 26 `assert_data_bounds` · 27 `assert_engine_health` |
| `LINK` | **3** | 10 `link_parcels` · 15 `link_massing` · 17 `link_neighbourhoods` |
| `MATERIALIZER` | **1** | 8 `link_parcel_addresses` |
| `MATCHER` | **1** | 19 `link_wsib` |
| `BACKFILL` | **1** | 9 `compute_centroids` |
| `RECORDER` | **1** | 25 `refresh_snapshot` |
| | **27** | |

⚠️ **Step 27 `assert_engine_health` is an AST+REC hybrid** and gets ASSERT runtime treatment *only because `run-chain.js:544-550` dispatches on name prefix.* A declared archetype makes the hybrid explicit and retires the prefix dispatch.

The schema derives each step's **required-field profile** from its archetype:

| Archetype | Must declare | Must be `"none"` |
|---|---|---|
| `INGESTOR` | `outputs.write_discipline` · `retract` · `replay` · `guards.empty_source` · `staleness.pending` | — |
| `LINK` / `MATCHER` | `outputs.invalidates` · `write_discipline` · `counters` scoped by `writes.key` | — |
| `ENRICHER` | `staleness.pending` on a lineage column **⇒ a declared invalidator (claim #54)** · `write_discipline` | — |
| `MATERIALIZER` / `BACKFILL` | `outputs.replay` · `recovery.reset` | — |
| `ASSERT` | `checks` (≥1) | `outputs` · `recovery` · `counters` |
| `RECORDER` | `outputs.publish` | — |

> **This is the answer to *"will this help if we have similar problems in future?"*** — yes, and mechanically: a new ENRICHER **cannot omit its invalidator**, because its archetype makes the field required. That is the centroid defect (§5.4a) made **unexpressible** rather than merely visible.
>
> ⚠️ **One live consequence:** `run-chain.js:544-550` dispatches ASSERT runtime behaviour **on name prefix** — so renaming a step changes its runtime behaviour `[READ]`. Declaring `archetype` retires that, and the retirement is a required S1 deliverable, not a side effect.

---

## 2. What this is

**One sentence:** every step keeps its file, its path, its lock ID and its invocation, and hands its entire non-compute lifecycle to a shared library, so that all 27 steps have exactly one vocabulary, one set of controls, one database direction, and one validator.

```js
// scripts/load-parcels.js — same path, same lock, same run-chain invocation
const descriptor = require('./load-parcels.descriptor.json');
const compute = require('./lib/compute/load-parcels');
module.exports = pipeline.step(descriptor, compute);
```

### 2.1 Why this rather than Spec 120's runner

Spec 120 proposed the same declaration and the same lifecycle, delivered by relocating all 27 steps into `scripts/steps/<slug>/` under a central runner. **122 changes only the delivery.** The design survives; see §8 for the claim-by-claim classification, which is generated.

The case rests on one measured fact:

> **The SDK boundary is already clean at 27/27.** `pipeline.run` · `withAdvisoryLock` · `emitSummary` · `emitMeta` · `ADVISORY_LOCK_ID` · `audit_table` — universal `[MEASURED 2026-08-23]`. **Every divergence lives *above* that boundary — in what scripts put *into* those calls, never in whether they call them.**

A library already owns a lifecycle in this exact corpus, at full adoption. `pipeline.step()` extends that boundary upward to claim the layer where the divergence actually is. This is Template Method, and Jenkins' Declarative Pipeline + shared libraries, and Dagster's `@asset`, and Lambda Powertools' decorators — the conventional shape, not an invented one `[SOURCED]`. Spec 120 §1's build-vs-adopt finding is **unchanged and reaffirmed**: adopt the *pattern*, never the *dependency*.

### 2.2 What this buys that the runner did not

| | Evidence |
|---|---|
| **Spec 120 §9.1's "blocking constraint" does not occur** | `pipeline-advisory-lock.infra.test.ts:24` (`LOCK_ID_REGISTRY`, documented at `:22`) records registry keys as manifest `file` paths; `:297` filters manifest files against the registry. No file moves ⇒ `:297` passes on step 1 and step 27 `[READ]`. Spec 121 §12.18a's *"② is the hard blocker"* R-stage entry criterion is **void** |
| **Migrations 245–248 leave the critical path** | they land with the capability that needs them, not as a prerequisite block (§6.5) |
| **The ~560-test blast radius mostly does not fire** | path-keyed assertions survive because paths do not change; only *content* assertions break (§7.4) |
| **A runner defect no longer runs 64 times before anyone sees it** | conversion 1 exercises the library against real data on day one |
| **Spec 120's own tree would have broken the logic-vars map** | `generate-logic-vars-docs.mjs:38` scans `[scripts, scripts/quality]` **non-recursively** `[READ]`, so `scripts/steps/<slug>/compute.js` would have silently emptied the consumer map for all 27 steps — the exact failure 120 §2 warns about, which its warning does not cover. Islands remove the hazard by construction |

### 2.3 What this costs — stated up front, not buried

1. ⚠️ **Spec 120 §12b.4's "free typechecking" dies.** Files stay `.js` CommonJS under `scripts/` — the untypechecked zone (Spec 119 §2). Claim #132 survives; its free-ness does not. **This is the largest single benefit forfeited.** It is also orthogonal to this spec and shippable today via a `checkJs` project.
2. ⚠️ **#128's mechanism must be rebuilt** (§4.1). Under a loader a step *cannot* opt out; under a library it can simply not call in. Failure is silent.
3. **The fingerprint's include/exclude split becomes AST surgery** on the `pipeline.step()` call site rather than file selection (§6.3).

### 2.4 Out of scope

The execution envelope — workflow ceilings, chain splitting, the strand factories — **precedes this and is the launch blocker** (Spec 120 §1; learnings §23.5). ⚠️ **A clean cloud run of `chain_sources` is an entry criterion for §9's S-stage, not a nice-to-have.** Converting steps while the chain cannot complete makes a conversion regression indistinguishable from the pre-existing envelope failure.

---

## 3. The measured case

All figures `[MEASURED 2026-08-23]`. Corpus derived from the manifest, never assumed:
`node -e "const m=require('./scripts/manifest.json');console.log(m.chains.sources.map(k=>m.scripts[k].file).join(' '))"`

### 3.1 Size

| Fact | Value |
|---|---|
| Steps in `chain_sources` | **27** |
| Total LOC | **17,170** ⚠️ the evidence base's *"14,378"* is a **19% understatement**; use 17,170 |
| Comments / imports / blank | 4,523 (26.3% — high, because these files carry inline spec citations) |
| **Ceremony, absorbable** | **~3,000–3,600 lines** (17–21% of LOC; 24–28% of non-comment lines) |
| Compute (domain SQL + row transforms) | ~9,000–9,600 |

⚠️ **The largest judgment call in that number, declared:** **~384 lines** in `assert-global-coverage.js` are `COUNT(*) FILTER (...)` profiling queries whose only purpose is building audit rows — measured as the total line span of the **14** backtick template literals in that 1,464-line file that contain a `COUNT(*) FILTER` (246 such occurrences in all). They read domain tables, so they classify COMPUTE under the stated rule. Reclassify them and ceremony becomes ~3,384–3,984 lines: **20–23% of LOC, 27–31% of non-comment**. Recorded rather than silently chosen.

### 3.2 Vocabulary divergence — the finding this spec exists to close

The operator's estimate was *"the same mechanism in six different ways."* **Measured, that is understated.**

| Mechanism | Distinct spellings | The sharpest detail |
|---|---:|---|
| Verdict cascade | **9–11** | 9 local copies of one 3-line function, written two different ways (if-chain vs ternary) |
| Whole-step "did no work" | **10** | plus 6 more for the *per-record* meaning; **60 distinct `skip`-derived identifiers across the 27 files** — `grep -ohEi '[a-z0-9_]*skip[a-z0-9_]*' $FILES \| sort -u \| grep -ivE '^(skip\|skips\|skipped\|skipping)$' \| wc -l` (70 before dropping the four bare English forms) |
| `records_total` semantics | **9** | 3 scripts emit `1` for "one audit pass"; 2 emit `0` for the same thing |
| Threshold declaration | **7** | dominant pattern — **62 of the 81 `threshold: '…'` audit-row sites** in the corpus — writes the number **twice on one line**, once as code, once as a display string, synced by hand |
| Force-full override | **7 shapes, 11 names** | **21 of 27 steps have no operator-invocable escape hatch.** Method: grep the 27 for `FORCE[_A-Z]*\|--full\|forceFull\|--force` → 8 files hit, of which `link-parcels`' `--full` is a usage comment with no argv parser and `load-zoning`'s `FORCE_RELOAD_STALE_DAYS` is an internal constant, leaving **6** real hatches. Evidence base §3d says *"5 of 27"* on the narrower gate-bypass reading; it omits `link-wsib.js:36` `LINK_WSIB_FORCE_FULL` |
| Error handling | **8** | `logError` is **0/27** — the CLAUDE.md mandate never reached this corpus |
| Audit-row construction | **8** | `threshold:` present in **20** of the 27, absent in **7** (the 4 loaders + 3 enrichers on the geo datasets), ~10% in one |
| Gate / skip decision | **8 mechanisms** (evidence base §3d — *"Eight mechanisms, not seven"*), **15 gated + 12 ungated** | three separate shared libraries for one job |

**Two of these are correctness defects, not style** — and they are exactly what the Observability reviewer role exists to catch, still live:

- `hasFails ? 'FAIL' : 'PASS'` in **3 scripts** — structurally **cannot emit WARN**
- `hasWarns ? 'WARN' : 'PASS'` in **3 scripts** — structurally **cannot emit FAIL**
- hardcoded `verdict: 'PASS'` on the skip path in **7 scripts**

### 3.3 The instrument that certifies this data is itself broken

⚠️ `[MEASURED 2026-08-23]` **Four analysis scripts default to the pre-cutover database** when `DATABASE_URL` is unset — `parcel-sanity-audit.js`, `parcel-field-dump.js`, `cost-estimates-sanity-audit.js`, `generate-db-docs.mjs`. The first two are the Reality-Check instruments, the only pass in the entire system that reads output *values*.

| Same audit, same commit | `localhost:5432/buildo` (the default) | `127.0.0.1:54322/postgres` (authoritative) |
|---|---:|---:|
| migrations applied | 222 | **241** |
| HIGH/MED violations | **2,394** | **30,288** |
| FAIL-gated checks | **0** | **1** |
| `max_build_dim_below_floor` | **0 — PASS** | **27,984 — GATE→FAIL** |

That check's own description reads *"inert-INFO expected post-fix"* — a fix was verified against a database where the defect could not appear. **This is the mechanism behind "every fix produced a surprise": the feedback loop was corrupted, not the reasoning.**

⚠️ **This is a prerequisite, not a §9 stage.** Make `DATABASE_URL` required and fail loud in all four scripts, then re-baseline, before any conversion is measured. ~1 hour. It is also the tenth instance of the class Spec 121 App. G records, and it validates §12b.6 — *anything that enforces must be proven to fire* — against the one instrument nobody applied it to.

---

## 4. The step contract

### 4.1 Three files, one slug

| File | Content | Executable? |
|---|---|---|
| `scripts/<slug>.js` | the call site: 3 lines | yes — but only `require` + one `pipeline.step()` |
| `scripts/<slug>.descriptor.json` | Spec 120 §3's 13 categories | **no — data only** (A1) |
| `scripts/<slug>.notes.json` | Spec 120 §3.4's interpretation, capped at 12 prose entries | no |
| `scripts/lib/compute/<slug>.js` | the domain logic, exporting `compute` | yes |

**The declaration is inherited wholesale from Spec 120 §3** — the 13 categories, the controlled vocabularies, the `†`/`~`/`!` markers, `severity ⊥ blocking`, the status enum, `notes.json` and its cap, and the rule that interpretive text may reference a check id but never quote a number. **122 changes none of it.** Do not re-specify it here; §3 of Spec 120 is the text.

### 4.2 `pipeline.step(descriptor, compute)`

⚠️ **The library IS the loader — and this corrects a false dichotomy in the original proposal.** It was framed as *"enforcement by conformance test, not by a loader."* That is wrong in a way that matters: **`pipeline.step()` runs before compute does, so it AJV-validates the descriptor against the generated schema and throws.**

That is **strictly stronger** than Spec 120's build-time loader, which cannot fire on a hotfix that skipped CI. The conformance test replays the identical schema across all 27 files in CI; the library enforces it in production.

**Consequence for the claim register:** every claim about a descriptor's *value* — `retract: "sometimes"` rejects, missing `why_lock` rejects, `checks: "none"` rejects — is **UNCHANGED**, not weakened. Only claims about the file's *form* need new mechanisms (§4).

`pipeline.step()` is a **factory**: it returns a runnable, it does not run. Requiring a step file opens no pool and issues no query (claim #86). `compute-centroids.js:60` and `link-parcels.js:124` violate this today `[READ]`, which is why the conformance suite goes red against the unconverted corpus on day one — satisfying Spec 120 §8.4's *"prove the suite red first"* for free.

### 4.3 What the library owns

Everything in Spec 120 §4.1's ~35 lifecycle behaviours: reconcile hand-off · ledger row at start · advisory lock with `run_id` as fencing token · config `.strict()` · producer version + health assertion · preconditions on **both** skip and run paths · empty-source guard · schema-drift diff · staleness and `pending` · fingerprint · transaction scope · generated upserts with `IS DISTINCT FROM` · lineage + `batch_id` · retraction · invalidation · checkpoint · quarantine · interval row · publish pointer · **the validator (§6)** · audit rows · verdict cascade · `skip_reason` with a count · `step_error` · budget and duration tripwires · `declaration_tiers` · OpenLineage emit.

The step supplies: **a descriptor and a compute.** Nothing else.

---

## 5. Enforcement — the three conditions

⚠️ **This section is what separates a standard from a style guide.** Under a loader, non-conformance is impossible. Under a library, it must be made impossible by other means. Each condition names its mechanism and its fixture.

### 5.1 Condition 1 — the shape rule (claim #128) ⚠️ **the load-bearing one**

Spec 120 §12.6 calls *"no per-step escape hatches"* the single most important rule and enforces it by schema-rejecting an override key. **Under islands a step needs no override key — it can simply not call `pipeline.step()`.** That is today's situation, which this programme exists to end, and its failure mode is silent: *"the moment one step gets a special case, there are 27."*

> **Rule (A2, mandatory):** an ast-grep rule over every file in `manifest.chains[*].file` asserting the module's top level is exactly
> `module.exports = pipeline.step(<descriptor>, <function identifier>)`
> plus `require` calls, and **nothing else executable**. `pipeline.run(` is banned outright in those files.

Ships with its own known-bad fixture per Spec 120 §12b.6 (claims #134–#136). Built on the repo's existing DSL — `scripts/ast-grep-rules/*.yml`, driven from `.husky/pre-commit`. ⚠️ **ast-grep lints *code* natively; this is a case where islands are cheaper than the runner, which would have needed a new JSON-rule mechanism.**

This rule also carries claim #86's second half: only ast-grep catches a top-level `fs.readFileSync`, a `dotenv` load, or an env assertion that throws. A `pg.Pool` construction spy catches the pool and nothing else.

### 5.2 Condition 2 — the conformance suite

One test file iterating `manifest.chains[*].file`. Per step:

| Assertion | Claim |
|---|---|
| exactly one sibling `<slug>.descriptor.json`; no unknown `<slug>.*` file | #2, #31 |
| the descriptor validates against the generated schema | #3–#20 |
| `require()` under a `pg.Pool` spy → zero constructions, zero queries | #86 |
| named exports `descriptor` and `compute`; `typeof compute === 'function'` | #163 (SH3′) |
| `descriptor.identity.lock` agrees with `LOCK_ID_REGISTRY` | #9 |
| `descriptor.checks.length > 0` | #126 |
| ⚠️ **`loaded.length === manifest file count`** | **NEW — see below** |

⚠️ **A new claim this architecture requires and Spec 120's register does not contain.** Under Spec 120, a `step.json` that fails to parse fails loudly. Under islands — even with A1's sibling JSON — a step whose *module* throws at import becomes unloadable and **silently drops out of every generated artifact** rather than erroring. Every generator must assert it loaded exactly as many steps as the manifest lists.

### 5.3 Condition 3 — the golden-master differential, per conversion

Spec 120 §14.2's 4-tuple, unchanged: **rows** (full state, ordered by PK) · **telemetry** · **ledger + audit rows** · **verdict**. Non-determinism inventory declared *before* the first diff.

⚠️ **This is materially cheaper here than under the runner** and it is what makes "same read and write" a *proven* claim rather than an intention: old and new are **the same file at two commits**, invoked identically by the same `spawnStepChild` with the same argv and env. There is zero invocation-mechanism divergence to normalise away.

### 5.4 The lock-test convention ⚠️ initially missed, verified

`:297` passes (§1.2). But the **same file** carries three further per-script loops that assert *source text* `[READ]`:

| Site | Asserts |
|---|---|
| `:248` (inside the `describe` opened at `:241`) | source contains `const ADVISORY_LOCK_ID = <number>` |
| `:259-260` (inside the `describe` opened at `:253`) | source contains `withAdvisoryLock` |
| `:289-292` (inside the `describe` opened at `:284`) | the declared constant matches the registry |

**All three red on conversion #1** if the lock moves into `identity.lock` and `withAdvisoryLock` moves into the library.

> **Convention:** keep `const ADVISORY_LOCK_ID = 55;` textually in the step file and pass it as `identity.lock`. One line per step, reversible. `:259-260` needs a one-line widening to accept `pipeline.step`. **Do not discover this on conversion #1.**

---

## 6. The cross-step ledger

> ⚠️ **CORRECTED after measurement (2026-08-23). This section originally read *"the artifact the estate has never had."* That was wrong. A cross-step ledger has already been designed three times at increasing fidelity, and one of those designs is live, working, and drift-guarded today.**
>
> **Spec 122 §5 is therefore an EXTRACTION, not an invention.** Treating it as greenfield would rebuild a working mechanism and discard the one proof the repo already has that this pattern holds.

### 6.0 The three prior designs — inherit, do not re-derive

**① The working control case — column lineage, already tier-2** `[READ]`

| Artifact | Path |
|---|---|
| Generator | `scripts/generate-lineage-docs.mjs` — derives lineage from live `pipeline_runs.records_meta.pipeline_meta` (each step's `emitMeta`) |
| Committed snapshot | `scripts/seeds/lineage-meta-snapshot.json` — DB-free render source |
| Artifact | `docs/reference/data-lineage-map.md` |
| **Drift guard** | `src/tests/data-lineage-map.infra.test.ts:26-39` — **fails CI when the committed doc drifts from a fresh render** |

Spec 119 §4.6 names this the proven pattern: *"nobody hand-maintains column lineage, because `data-lineage-map.infra.test.ts` fails CI when the generated artifact drifts."* **The ledger is this generator, widened from columns to the five edge classes below.**

⚠️ **But do not inherit its numbers.** `data-lineage-map.md` **does not reconcile with itself**: 1,553 lines / 1,135 data rows / a header claiming **1,128 columns** — three figures, none agreeing, flagged as L-4 and still unresolved. Its snapshot also predates Phase B B3. Re-derive before use.

**② The governing doctrine — Spec 119 §4.6's tier ladder.** Every cross-step contract sits at a tier: **0** documented-only (treat as unverified) → **1** generated → **2** CI-drift-guarded → **3** consumed by the dependent code. The binding rule, verbatim:

> *"a step introducing a NEW cross-step dependency must state which tier its contract sits at, and a tier-0 answer is a finding."*

119 names three live tier-0 surfaces: **counter semantics**, **status/skip vocabulary**, **upstream dependency sets**. **§5 exists to move all three to tier 2.** The descriptor's `inputs`/`outputs`/`invalidates` become the tier-1 generated form; the ledger's drift test is the tier-2 guard; `pipeline.step()` consuming them is tier 3.

**③ The already-written WF1** — `.cursor/queued_task_step_contracts_wf1.md`, "Step Contracts — make cross-step contracts tier-2", status Planning, queued behind B3. It already carries the repeating shape Spec 122 adopts wholesale:

> **GENERATE → GUARD → CONSUME**

with Phase 0's per-contract tier map across all 66 in-chain steps, Phase 1's `stepUpstreams(slug)` derived from lineage (*"lands red-first by construction"* on the cost step), and Phases 2–5 for counters, the status enum, gate consumption and the step-contract template. **That task is not superseded — it is §5's implementation plan.**

### 6.1 What the ledger holds

Five edge classes. **All five are real today; none is declared anywhere a machine can read.**

| Class | Descriptor source | State today |
|---|---|---|
| **Table edges** | `outputs.writes` → another step's `inputs.reads` | `emitMeta` at runtime only. ⚠️ The manifest's `telemetry_tables` is the sole static form, is **table-level only**, and has **two proven omissions**: `massing` declares `["building_footprints"]` but DELETEs `parcel_buildings` (`load-massing.js:208`); `enrich_parcels` declares `["parcels"]` but INSERTs `enrich_parcels_pass3_scope` (`:1851`). **There is no `reads` field at all** |
| **`records_meta` contracts** | `emits` → named consumer | frozen by convention, enforced by HALT (§5.2) |
| **Version pins / watermarks** | `staleness.pending` reading another step's stamp | inline SQL predicates (§5.3) |
| **Invalidation** | `outputs.invalidates` | four mechanisms, and **one load-bearing gap** (§5.4) |
| **Ordering** | consistency against `manifest.chains` | **5 hand-written assertions for 27 steps, one of them wrong** (§5.5) |

### 6.2 `records_meta` contracts — verified, and they HALT

`[READ 2026-08-23]` The three §9 blocks are **runtime contracts, not documentation**. Each consumer *throws* on violation.

| Contract | Producer | Consumer | HALTs on |
|---|---|---|---|
| `ravine_load` (**18 fields**) | `load-ravines.js:522-547` | `enrich-ravines.js:31-67` | `spec_version ≠ '1.2'` · `delete_skipped_empty_guard` · drift/mass-delete check false · `invalid_geometry_skipped / feature_count > 5%` · null `source_dataset_version` |
| `heritage_load` (2 sub-blocks) | `load-heritage.js:751-765` | `enrich-heritage.js:54-89` | version mismatch · missing sub-block · zero `feature_count` · drift false · missing dataset version |
| `centreline_load` (18 fields) | `load-centreline.js:630-672` | `enrich-centreline.js:318-338` | version mismatch · `features_inserted` not > 0 · missing dataset version |

Regression-locked at `load-ravines.infra.test.ts:102`, `load-heritage.infra.test.ts:53`, `enrich-ravines.logic.test.ts:38-73`.

**Ten further CONTRACT keys** with real consumers: `step_verdicts` and `step_completeness` (→ `check-chain-verdict.js`, CI gates) · `deferred` (→ `run-chain.js:86-98`, routes `deferred_to_full`) · `gated_skip` (→ `api/quality/route.ts:59-65`) · `pipeline_meta` (→ `FunnelPanels.tsx`) · `audit_table` (→ `FreshnessTimeline.tsx` ×6, `observe-chain.js:77`) · `engine_health` · `telemetry` · `warnings`/`errors` · `zoning_layer_versions` (self, cross-run).

**And three WRITE-ONLY keys** — declared, emitted, consumed by nothing outside their own shape-lock test: `permit_rule_distribution`, `seq_violations`, `seq_violations_truncated_count`. ⚠️ **These are the wiring census's seed instances, found in the wild.** The census is per-**property**, not per-field (Spec 121 §12.1a instance 2: 798 declared bounds under 112 readers, zero bound-readers).

> **The distinguishing signal, and it is the ledger's definition of an edge:** a key is a CONTRACT only when code — not a test, not a comment — reads it from a *different* script, route or component and **branches on its value**. Everything else lands in an audit row for a human to eyeball.

### 6.3 Watermarks — and the tier-0 surface that must retire

Eight stamp columns drive incremental scope `[READ 2026-08-23]`. Six are **self-consumed** (the step reads its own stamp to re-scope). Two are genuine cross-step edges: `parcel_buildings.linked_at` (step 15) → `enrich-parcels.js:365-367`, and `coa_applications.parcel_linked_at` (**a different chain**) → `enrich-parcels.js:380-388`.

⚠️ **The tier-0 surface, and it has already been caught being wrong.** Three steps carry **hand-written upstream slug arrays** feeding `runLedgerGateDecision`:

| Site | Declares |
|---|---|
| `link-parcel-addresses.js:61-64` | `sources:address_points`, `sources:parcels` |
| `link-wsib.js:69-72` | `sources:load_wsib`, `permits:builders` |
| `compute-parcel-cost-estimates.js:85` | `sources:enrich_parcels`, `sources:parcels` |

The third carries its own confession in-file at `:77-84`: the omitted `sources:parcels` producer *"was already listed in the lineage map … this hand-maintained array simply hadn't been kept in sync with it (exactly how the gap was missed)."* Spec 119 cites this as the canonical proof that **generated beats documented**. Locked red-first at `ledger-gate-callers.db.test.ts:448-449`.

> **§5's first deliverable is `stepUpstreams(slug)` derived from the ledger, retiring all three arrays.** This is Phase 1 of the queued WF1 and it *"lands red-first by construction."*

Also write-only and worth retiring: `parcels.zoning_base_source_dataset_version` is stamped every run (`enrich-parcels.js:303-348`) and **compared by nothing** — read only for admin display.

### 6.4 Invalidation — four mechanisms, and one open gap that is not filed anywhere

`[READ 2026-08-23]`

| Mechanism | Trigger | NULLs | Consumed by |
|---|---|---|---|
| `migrations/242:32-48` — `BEFORE UPDATE OF geom, geometry` **trigger** | **any** write path | `parcels.massing_enriched_at`, `zoning_enriched_at` | `enrich-parcels.js:365-367, :183-186` |
| `load-parcels.js:353-361` — DEC-FENCE2, inside **one** `ON CONFLICT` clause | geometry change **via that loader only** | the three `*_dataset_version_when_enriched` stamps | `enrich-ravines`, `enrich-heritage`, `enrich-centreline` |
| `enrich-permits.js:518-549` | a lead loses **all** parcel links | `zoning_enriched_at` + derived columns; NOT-NULL booleans reset to `false` | itself, next run |
| `load-permits.js:363` + `close-stale-permits.js:129,148` | status moves off `'Inspection'` | `permits.enriched_status` | the three `classify-*` scripts |

Migration 242's own header states the rationale Spec 122 inherits verbatim: the `CASE WHEN` logic *"lives INSIDE one specific UPSERT statement and only fires for writes that go through it. A TRIGGER closes the gap for every write path."*

⚠️ **The asymmetry that follows, and it is a live defect:** `massing_enriched_at`/`zoning_enriched_at` are invalidated universally; the three `*_dataset_version_when_enriched` stamps are invalidated **only through `load-parcels.js`'s UPSERT**. A direct `UPDATE parcels SET geom = …` from any other script or admin tool leaves all three silently stale.

#### 6.4a ⚠️ THE CENTROID GAP — the fourth field nobody asked about

**`parcels.centroid_lat` / `centroid_lng` have NO invalidator at all**, and they are **join keys**:

| Fact | Site |
|---|---|
| geometry-derived, filled only where absent | `compute-centroids.js:105` — `WHERE geom IS NOT NULL AND centroid_lat IS NULL` |
| **join key** for `link_parcels` | `link-parcels.js:415-423, :437-439` |
| ⚠️ **NOT a join key for `link_massing`** — corrected 2026-08-23 | `:237`/`:434` are the same line, a NOT-NULL **eligibility filter**. The real predicate at `:293` joins parcel **geom** vs the **building's** centroid; `:227` says so in-file |
| nothing NULLs it on a geometry change | migration 242 covers two stamps; `load-parcels.js:353-361` covers three others; **neither covers centroids** |
| `compute_centroids` has no precondition guard | verified: zero matches for `assertPreconditions` / `no successful` in the file |

**A moved parcel keeps a stale centroid forever.** ⚠️ **One downstream step joins on it (`link_parcels`); a second only filters on it (`link_massing`).** The gap is real; the original *"two downstream steps join on it"* overstated it, and P1's *"re-measure link rates for `link_parcels` and `link_massing`"* was measuring a step the defect barely touches.

⚠️ **RETRACTED AND CORRECTED 2026-08-23.** This paragraph originally read: *"three of the four fields behind the same predicate were fixed **one incident at a time** — #409 (ravines), #424 (heritage), #430 (centreline)."* ⛔ **The triple is wrong and the narrative it supported is refuted.** Re-executed against `review_followups.md`: **#409** is a pipeline-slug bug (`source-ravines` vs `sources:load_ravines`), not an invalidator · **#424** is a heritage *match* redesign (containment vs 50 m radius), not an invalidator · **#418** is the real entry, and it NULLs *"the **ravine + heritage** stamps via a geometry-change-gated CASE"* — **both invalidators, in ONE commit** · **#430** is correct, and is a *deferred fence obligation* for centreline. **So two of the three landed together, and "nobody asked which other columns the predicate governs" does not hold as stated.** The centroid gap is still real and still unfiled-until-today — `load-parcels.js:353-361` NULLs three stamps and no centroid among them, verified — but it is a **gap in coverage, not evidence of one-at-a-time myopia**. The section previously called itself *"the single best argument in this spec for the ledger"*; that claim is withdrawn with the narrative. The ledger's case rests on claim #54 making the omission *unexpressible*, which is unaffected.

> **This is the single best argument in this spec for the ledger.** Claim #54 — *a `pending` keyed on a lineage column is refused unless that column has a declared invalidator* — makes the centroid gap **unexpressible**, not merely visible. `compute_centroids` could not declare `pending: "centroid_lat IS NULL"` without also declaring an invalidator, and the schema would refuse it.
>
> ⚠️ **It also needs filing to `review_followups.md` today, independent of this spec.** An open correctness defect with no followup is exactly the class the register exists to hold.

### 6.5 Ordering — 5 assertions for 27 steps, and one of them is wrong

`grep -c "dependsOn\|requires\|\"after\"\|needs" scripts/manifest.json` → **0**. `chains.sources` is a flat array; **array position is the only ordering the manifest encodes.** `run-chain.js:473` iterates it and validates no dependency — it checks only that a slug maps to an existing file.

What actually stands between "reorder the array" and "silently wrong data":

1. **Five `indexOf` assertions** in `chain.logic.test.ts:162-187` for a 27-step chain. Everything else is membership-only.
2. **Bespoke in-script HALT guards** — present on steps 11, 12, 13, 15, 21 and (run-level) 8, 19, 22. ⚠️ **Steps 9, 10 and 17 have none at all** (verified: zero matches).
3. Three `runLedgerGateDecision` calls on the hand-written arrays of §5.3.

⚠️ **And one of the five locks is false.** `chain.logic.test.ts:173-174` asserts `enrich_ravines == link_parcels + 1` with a comment claiming a dependency. `enrich-ravines.js:150-169` selects only from `parcels` and `ravines` — **no reference to `permit_parcels` or any `link_parcels` output anywhere in the file.** The real dependency is `parcels.geom` + `ravines`. The positioning is incidental array grouping recorded as a data dependency.

**Dependencies enforced by array position alone** — silently wrong if reordered: 2→3 · **4→9→10 and 4→9→15 (the centroid chain: no gate, no precondition, no invalidator — the highest-risk edge in the chain)** · 8→10 · 14→15 · 16→17 · 15→21 (row-level watermark, not step-level) · 21→22.

#### The claim that replaces #145

Spec 120 claim #145 — *"the DAG is derived from `writes`, never declared"* — **is dead here** (§8): 122 keeps `manifest.chains`.

> **Replacement claim:** each descriptor's `reads`/`writes` must be **consistent with** manifest order — a step may not read a table written by a later step in the same chain. **Violation:** reorder two steps so a reader precedes its producer → the ledger check reds.

This is a *new* obligation the runner did not carry, because under a derived DAG ordering could not disagree with reality. Here it can, so it must be checked.

---

## 7. The validator, baked in

**Spec 120 §5 and §5.0 are inherited unchanged** — one record type plus a `kind` discriminator, the 12 named check types, `pop == 0 → INFO` as a non-configurable fence, magnitude floors rather than existence floors, the CLEAN sampler, self-retiring baselines, `freshness` distinguishing `UNKNOWN` from fresh.

### 7.1 Why baking it into the library makes it *more* enforced

`checks` may never be `"none"` (claim #7), and `pipeline.step()` validates that before compute runs. A step therefore **cannot execute without declaring checks**, and cannot run its checks anywhere but through the validator. Under Spec 120 the same property held only for steps invoked *through the runner*.

This directly retires §2.2's live defects: the verdict cascade is computed **once, in the library, from the rows** — never a parallel boolean. The 6 scripts that structurally cannot emit WARN or FAIL stop being able to make that mistake, and claim #28's observed-set equality (`{PASS, WARN, FAIL}` all reachable) becomes checkable across the corpus.

### 7.2 Write-Audit-Publish

Unchanged from Spec 120 §4.1 ㉖㉗ and its two implementation bugs, both of which are *more* naturally avoided inside a single step process:

- ⚠️ gate checks must run **on the same `PoolClient`** as the write — `pool.query()` sees pre-update state and **every check passes, silently** (claim #63)
- audit rows must survive the validate-then-rollback (claim #64)

### 7.3 The fingerprint

Spec 120 §4.1a's five parts and claims #52a–#52h are inherited. ⚠️ **The mechanism changes:** compute and descriptor no longer sit in disjoint files, so the include/exclude split becomes AST extraction keyed on the `pipeline.step()` call-site node — hash the compute function node plus the whitelisted descriptor properties only. #52c (`identity`/`why`/`notes`/`deviations` never feed the hash) and #52g (per-**field** membership, seven assertions) are the regressions easiest to get wrong here. **Second-largest cost after §4.1.**

### 7.4 ⚠️ Step-0 reconcile (A3) — the one behaviour that is not naturally per-step

Spec 120 §4.1 Step 0 reconciles the previous run **once at start, before any work**. Islands have no single start: `run-chain.js:167` spawns each step as its own child process `[READ]`. Reconcile would either run 27 times — reaping *other steps'* rows — or have no home.

> **Resolution (A3):** a `reconcile` step at the head of `manifest.chains.sources`. It also owns `published_batch` rollback, which is otherwise ownerless. Claim #85's *"the report prints even when empty"* attaches to that one site.

### 7.5 The four state tables — "optional" is half-true, and the half matters

Migrations **245–248 are free** — 244 is the highest `[MEASURED]`. Sequencing relaxes: you can convert step one against today's tables and get gating, transaction, audit, verdict and ledger benefits immediately.

⚠️ **But the claims do not relax.** `pipeline_intervals` (#103–#106, and #74 — `--backfill` has *no implementation at all* without it) · `published_batch` (#107, #108, #123) · `step_error` (#67, #84, #195, #196, #253) · `step_quarantine` (#62, #192). **"Optional" means deferrable to the second wave, not unnecessary.** Say it that way in the plan, or the tables never get built.

---

## 8. The conversion process

### 8.1 Per step — nine commits, each independently revertable

| # | Phase | Gate |
|---|---|---|
| 1 | **Boundary freeze** — tables/columns written, audit rows, exit codes, stdout | G0 |
| 2 | **Intent Ledger** — `git log -S` every non-obvious constant; `blame -w -C -C`; **a human adjudicates** (Spec 121 §12.5) | **G3: 100% dispositioned, no `unknown`** |
| 3 | **Golden master** — the 4-tuple, non-determinism declared first | **G1: the old script reproducible against itself** |
| 4 | **Descriptor, compute verbatim** — extract `<slug>.descriptor.json`, move the body to `lib/compute/<slug>.js` unchanged, wire `pipeline.step()` | ⚠️ **G2: no-op differential.** This is a *genuine* first commit here, not a simulated intermediate state |
| 5–7 | **Peel** — one policy concern per commit: gating → verdict/audit → thresholds/checks | **green diff after every peel; one peel per commit** |
| 8 | **Differential** — Gate 4a–4f, incl. 100% line accounting and a both-directions lock test per fence | G4 |
| 9 | **Cutover** — delete the peeled ceremony; `pipeline.run(` gone from the file | G5 |

⚠️ **Phase 4 is where islands are structurally better.** Spec 120 §14.4's Phase 3a — *"register the script with a descriptor whose compute is the old body verbatim; this must be a no-op diff"* — required a file move first, so the no-op was simulated. Here it is literally the first commit and the no-op is real.

### 8.2 Order

**By shape, not by chain order** — all upsert-shaped, then all link-shaped, then all assert-shaped — so the checklist specialises and conversion N+1 inherits N's gaps. Within that, descending `relative_churn × fix_density × blast_radius` (Spec 121 §12.2).

#### ⚠️ The pilot is BY ARCHETYPE — corrected 2026-08-23

**Spec 120 §14.1 proposes simplest / median / worst. That is the wrong axis for validating this contract, and the `assert_schema` audit proved it:**

> An **ASSERT forces 6 of 17 categories to `"none"`** — `outputs`, `recovery`, `override`, `emits`, `config`, plus `counters: null` — and two more to a single value (`write_discipline: verdict_only`, `partial_fill: none`). **It exercises the least of the contract that any archetype can.** Picking by size would have frozen the template against the thinnest possible test.

**Because `identity.archetype` drives the required-field profile (§3.0d), contract coverage is an archetype property, not a size property.** One representative per archetype, and **four are forced — they have exactly one member each** `[MEASURED]`:

| Archetype | Members | Representative | Why this one | Write class |
|---|---:|---|---|---|
| **ASSERT** | 5 | `assert_schema` | ✅ **audited** — 39/40 concerns land, 1 gap found (#41) | L `verdict_only` |
| **MATERIALIZER** | **1** | `link_parcel_addresses` | ⚠️ forced — and it is class **D**, a **W3 retraction breach** | D ⛔ |
| **MATCHER** | **1** | `link_wsib` | ⚠️ forced — dual-chain, run-ledger gate, the A1/A2 config-hoist fence | K |
| **BACKFILL** | **1** | `compute_centroids` | ⚠️ forced — **and it is the centroid defect itself** | E |
| **RECORDER** | **1** | `refresh_snapshot` | ⚠️ forced — verdict is PASS-only, all rows INFO | M |
| **INGESTOR** | 9 | `load_ravines` | richest: class **B**, 4 `finally`, drift + mass-delete env overrides, two-tier gate | B |
| **LINK** | 3 | `link_massing` | the **only** step with a code+data signal (G3), full retraction | F |
| **ENRICHER** | 6 | `enrich_parcels` | **2,153 lines**, 5 passes, scope-defer, the clock-relative gate at `:1085` | J |

⚠️ **Coverage caveat, stated because it is not obvious:** eight archetypes do **not** cover the 13 write classes. `INGESTOR` alone spans A, B and C; `ENRICHER` spans G, H, I, J and K. **That is acceptable** — the classes are covered by the `write_discipline.class` **enum being ported from the measured taxonomy** (§3.0b), not by converting one of each. The archetype pilot validates the *required-field profile*; the enum validates the *write shapes*.

**Freeze the template after the eighth, never the first** — and if any of the eight forces a contract change, the count is not the eight, it is however many it takes.

### 8.3 Kill criteria — pre-declared, and amended

Spec 120 §9.4's four, with one correction: *"step file > 20 lines"* is meaningless when the file holds a call site.

| Criterion |
|---|
| The **descriptor** exceeds 20 lines beyond its declared categories |
| Any **per-step override** is needed |
| A procedural step **leaks runner concepts** into its compute |
| An **unexplainable differential** |

**Any one fires ⇒ stop and redesign, not proceed.** ⚠️ These gate C3 and C4, not just C5/C6 — Spec 121 §12.18a under-enforced its own declared order.

### 8.4 Blast radius

⚠️ Spec 120 §9.2's counts (~1,345 / 560 / 85 / 700) **do not reconcile against a static count and the spec says so.** Do not cite them as measured. What *is* verified: path-keyed assertions survive because paths do not change; only **content** assertions break — principally the source-text loops at `pipeline-advisory-lock.infra.test.ts:248`, `:259-260`, `:289-292` (§5.4) and shape assertions on `pipeline.run(`. A smaller, mechanical, convention-fixable set than a file move produces.

---

## 9. What changes from Spec 120 — GENERATED

> ⚠️ **GENERATED ARTIFACT.** `node scripts/violations/extract-claims.mjs docs/reports/generated/122-claim-classification.md`
> Full table: `docs/reports/generated/122-claim-classification.md` · the other fork: `…-js-export.md`
> The generator self-tests against a known-bad fixture and refuses to emit if the parser is unproven (§12b.6).

**290 claims parsed from Spec 121 Appendix A** — ⚠️ **not 288.** The spec's own formula (*"1–278 + 52a–h, 94a, 151a"*) **omits claims 6a and 6b.** The numeric sequence 1–278 has zero gaps. This also invalidates Spec 121 S2's and S3's done-tests, which assert 288 and 289 in different sections.

| Verdict | Count | |
|---|---:|---|
| **UNCHANGED** | **181** | hold identically |
| **RESHAPED** | **66** | survive; mechanism changes, replacement named |
| **STRENGTHENED** | **40** | cheaper or more enforceable than under the runner |
| **DEAD** | **3** | #1, #145, #158 |

**287 of 290 (99.0%) survive.** The design was almost entirely independent of its packaging.

⚠️ **An honest note on how this number was reached.** The generator's first run reported **0 DEAD**, produced by section-level rules too coarse for the job — the exact failure its own header warns against. An independent adjudication pass disagreed on 11 claims; each was checked and **the adjudication won every time.** The rule set now carries per-claim overrides and section rules are a fallback. *Two independently-computed answers disagreeing is why the second one was commissioned.*

**The three deaths are all simplifications:**

| # | Claim | Why it dies |
|---|---|---|
| **#1** | the step tree lives under `scripts/` | its violation test is **unauthorable** — no step can be anywhere else |
| **#145** | the DAG is derived from `writes`, never declared | 122 keeps `manifest.chains`; **replaced by §5.4's consistency claim** |
| **#158** | Gate 5 — the old script is deleted | there is no old script; replaced by *"`pipeline.run(` must not appear in any manifest file"* |

**Beyond the numbered register, five Spec 120 *constructs* also retire:** §9.1's blocking constraint (→ a one-line convention, §4.4) · **SH3** (dies by construction — replaced by SH3′, §4.2) · §9.4's 20-line criterion (§7.3) · §14.6's *"old scripts deleted"* metric · §12b.4's free typechecking (§1.3).

---

## 10. Sequence

| Stage | What | Entry criterion |
|---|---|---|
| **P0** | ⚠️ **Fix the four DB-default scripts; re-baseline the audit** (§2.3) | none — do this first, ~1 hour |
| **P1** | **Envelope repair + one clean cloud run** (§1.4) | P0 |
| **S** | Descriptor schema · `pipeline.step()` · conformance suite · ast-grep shape rule · ledger generator | ⚠️ **P1 green.** Not before |
| **C1** | Pilot 3 — simplest, median, `enrich-parcels` | S green; template unfrozen |
| **C2** | Kill criteria evaluated | C1 complete |
| **C3** | Freeze template; publish smallest + largest as exemplars | **C2 clean** |
| **C4–C6** | Shared steps (**10 steps, 28 slots, up to 4 chains** `[MEASURED]`) → rest of `sources` → the other 5 chains | C3 |

**Estate: 86 slots, 64 distinct steps** `[MEASURED]`.

⚠️ **Cost is NOT estimated here.** Spec 121 §12.18d records that 20 of 49 stages carried no estimate, and §12.6's *"~32 weeks"* covered setup only. **122 does not repeat that.** Setup (S) is the only stage this spec sizes, and it is deliberately gated behind a green run so the estimate is taken against a working chain.

---

## 11. Known Failure Modes

| # | Mode | Guard |
|---|---|---|
| 1 | ⚠️ **A step stops calling `pipeline.step()`** and nobody notices | §4.1's ast-grep rule. **Without it this spec is a style guide.** The failure is silent |
| 2 | A step's module throws at import and **silently vanishes** from every generated artifact | §4.2's `loaded.length === manifest count` assertion |
| 3 | Descriptor and manifest ordering **disagree** | §5.4's consistency claim |
| 4 | The library grows into the runner it replaced | Spec 120 §13's LOC budget, re-targeted at `scripts/lib/step/**` (SH2 restated) |
| 5 | Ceremony is *added* to the library rather than *absorbed* from steps | §2.1's 3,000–3,600 line figure is the budget; net corpus LOC must fall |
| 6 | The fingerprint's field split drifts | §6.3's seven per-field assertions (#52g) |
| 7 | ⚠️ **Conversion regressions are indistinguishable from envelope failures** | §9's P1 gate. This is why a green run precedes S |

### 10b. What this architecture creates that the runner did not

1. **Enforcement is distributed** — a loader is one gate; lint + conformance + library validation are three, and three can each be individually weakened. Spec 120 §12b.5's *"enforcement must be harder to change than the enforced"* carries more weight here, and SH6 (Violation Suite as a separate root under CODEOWNERS) becomes load-bearing rather than tidy.
2. **The step file is executable**, so every descriptor-consuming tool depends on A1 holding. If A1 is overridden, re-read §5 entirely.

---

## Operating Boundaries

**Target files:** `scripts/lib/step/**` · `scripts/lib/compute/<slug>.js` · `scripts/<slug>.descriptor.json` · `scripts/<slug>.notes.json` · `scripts/ast-grep-rules/step-shape.yml` · `src/tests/step-conformance.infra.test.ts` · `scripts/violations/**` · migrations 245–248.

**Out-of-scope files:** `scripts/manifest.json` — unchanged · `src/tests/pipeline-advisory-lock.infra.test.ts` — one regex widening at `:259-260` only (§5.4) · `scripts/lib/pipeline.js` — extended by export; **not** the home of the step runner (SH2) · `scripts/run-chain.js` — ⚠️ **one change is required, contrary to the original framing:** ledger-row ownership must consolidate into the library (claim #39), since `run-chain.js:716-732` writes the row for in-chain steps while standalone runs write their own and 11 of 27 branch on `PIPELINE_CHAIN`. That is inside Spec 120 §2's own *"~25–30 lines at three sites"* budget.

**Cross-spec dependencies:** 47 (script protocol — §R1–R12 becomes the library's contract, not each script's) · 48 (§3.6/§3.7 observability) · 49 (coverage) · 79 · 113 (§5 pooler) · 115 (§2.5 staleness) · 118 (envelope, F2/F3) · 119 (**governs on conflict**) · 120 (design) · 121 (method).

---

## Appendix A — open questions

| # | Question | Why it is not answered here |
|---|---|---|
| **Q1** | Does `records_meta`'s **shallow merge** (`run-chain.js:889`) collide once the library emits a fixed key set? 13 top-level keys are taken `[READ]` | needs a key-collision census before S |
| **Q2** | Should the three §9 frozen contracts (§5.2) become **declared `emits` blocks** with a generated consumer assertion, retiring the hand-rolled `read*Contract()` HALT functions? | strongly indicated, but it changes 6 scripts' behaviour and wants its own WF |
| **Q3** | Which of the 8 gate mechanisms (§3.2) is the **canonical** `staleness.pending`? `enrich_parcels`' comps window is **clock-relative** (`:1085`), so no count- or watermark-based gate can ever skip it | a design decision, not a port — and the learnings report already refuted "mirror P11-2" |
| **Q4** | Do the ~600 `assert-global-coverage` profiling lines (§2.1) become **declared checks**, collapsing that file? | the single largest LOC swing in the corpus |
| **Q5** | Is `assert_engine_health`'s AST+REC hybrid still dispatched by **name prefix** (`run-chain.js:544-550`), and does the descriptor's `archetype` retire that? | renaming a step currently changes its runtime behaviour `[READ]` |
