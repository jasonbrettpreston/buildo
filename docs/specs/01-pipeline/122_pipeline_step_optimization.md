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

## Six programme rulings — ✅ OPERATOR-RATIFIED 2026-08-23 (round 2)

Reviewed and accepted by the operator 2026-08-23. **These amend the sections named; where older text in this spec or the plan conflicts, these govern.**

| # | Ruling | Amends |
|---|---|---|
| **R1** | **This is a re-architecture of the entire non-compute lifecycle, delivered incrementally — budget it as that, never as a per-step cleanup pass.** The §1 coverage audit is the evidence: 3 structurally failed menus · 6 missing P0 categories · an extractor covering 8/17 · §3f write-class labels wrong for 5 of 27 steps (2 of the 13 classes wrong at source) · 54 unadjudicated orphans | framing throughout |
| **R2** | **The schema is the canonical vocabulary, not the prose.** `scripts/steps/_schema/step.schema.json` is authored directly, encoding the V1–V6 conflict rulings below plus the reshaped menus (per-target `write_discipline`, 3-axis `staleness`, the four `on_*_error` fields). `122-vocabulary.md` and this spec's menu tables are **generated FROM the schema**. `extract-vocab.mjs` is demoted to a one-time migration tool; §12.1 **B3 dissolves** — the nine categories are born in the schema, never extracted from prose. Downstream corollary: once the Violation Suite exists, the **test manifest becomes the claim register** and the prose appendix stops being the certified artifact | §1.2 · §12.1 B1/B3 · §12.4.5 · Spec 123 §1.2/§5 |
| **R3** | **The P-track and S-track run in PARALLEL.** §10.1's green-cloud-run criterion gates **C1 (first conversion)**, not S1 — building the library, schema, ledger and conformance suite converts nothing. The one real coupling stands: **no golden master until Phase B (P2) lands** | §10.1 · the plan's stage table |
| **R4** | **S2 is a vertical slice, not a monolith.** Build the minimal `pipeline.step()` the `assert_schema` pilot needs, convert it, and grow the library pilot-by-pilot. Consistent with §7.2's *"freeze the template after the eighth, never the first"* — a fully-finished S2 before C1 buys less than it costs | §9 S2 · the plan |
| **R5** | **Per-step re-verification folds into PH-0** (the boundary freeze reads every write anyway): the 5 mislabeled write classes are re-derived per step there, not in an upfront S1 sweep. The **54 orphans are adjudicated in triage batches** (contract-must-express / runner-owned / defer-with-reason), pilot-archetype-touching first — not as a monolithic freeze gate | §12.1 B2 · §12.5 · Spec 123 §2 |
| **R6** | **The six missing P0 categories go through a categories-vs-fields adjudication before any lands as a category.** `acquisition` is arguably `staleness.trigger`'s missing lifecycle position plus an `inputs.externals` cache policy; `maintenance` arguably `execution.maintenance`; `terminals` and `plan_shape` look genuinely new. 17→23 is real complexity-clock spend (§12.12 B2) and is decided deliberately, not by default | §12.2 |

### The six vocabulary-conflict rulings — ✅ ADJUDICATED 2026-08-23 (operator-delegated)

Encoded in `step.schema.json` per R2. Spec 120 §3.2 is annotated, not re-litigated.

| # | Field | Ruling | Why |
|---|---|---|---|
| **V1** | `identity.archetype` | **full words** — `INGESTOR\|MATERIALIZER\|LINK\|MATCHER\|ENRICHER\|BACKFILL\|ASSERT\|RECORDER` | descriptors optimize for human/LLM legibility; the `ING|…` forms are display shorthand only |
| **V2** | `identity.lock` | **unique across manifest ∪ `one-time/` ∪ `backfill/`** (the wider universe); the generated registry *derives* from it | registry-only uniqueness readmits collisions from scripts outside the registry |
| **V3** | `guards.schema_drift` | **`none \| propagate \| pause`** — `warn` dropped | a drift response is an *action*; warn-ness belongs to the orthogonal `severity ⊥ blocking` axes. Same conflation class as the impossible `severity: PASS` (§12.5) |
| **V4** | `outputs.replay` | **`append_unsafe` stays in the enum, ⛔ banned for new steps** | same grandfathering mechanism as write-discipline classes D/H — an existing step must be able to declare its truth |
| **V5** | `staleness.pending` | **dissolved by the §1.5 reshape** — `scope: <sql predicate> \| all \| none`; `source_changed` is not a scope, it is `trigger: source_validator \| content_hash` | the conflict existed because one name carried three axes |
| **V6** | `guards.empty_source` | **typed form `<table> \| [<table>, …] \| none`** — *amended 2026-08-24: the array form was a schema-authoring generalization (multi-source ENRICHERs need it), surfaced by review and ratified rather than left as silent drift* | notation ruling; prose variant retired |
| **V7** | `outputs.writes[].write_discipline` | **mechanic ⊥ guard ⊥ scope ⊥ retract — decoupled axes** *(ruled 2026-08-24)*: `class` = mechanic only; guardedness = `guard` (`none` requires `why`, grandfathered-only for new steps); `scope` a required field; D/H bans restated as predicate rules (`no_retraction`, `unscoped_set_based`, `unguarded_write`) | resolves S1's menu-completeness BLOCKING gap — the §3f enum fused mechanic with guard, leaving 7 measured sites inexpressible |

Notation-only duplicates (`identity.contract_version` · `inputs.expect_nonempty` · `outputs.retract` · `staleness.checkpoint`): **the schema's typed form is canonical** wherever prose and notation differ.

---

## 1. THE STANDARD STEP

> ## ⛔ NOT FREEZABLE YET — the coverage audit REFUTED the central claim (2026-08-23)
>
> **The claim under test was: *17 categories with closed menus express every behaviour in the 27 steps.* It does not.** A vocabulary-coverage sweep over the corpus found **three menus that fail STRUCTURALLY** — not by a missing enum value, but because the declared shape is wrong for the behaviour:
>
> | Menu | Why it fails structurally |
> |---|---|
> | `outputs.write_discipline.class` | declared as a **step-level scalar**; **≥9 of 27 steps perform two or more disciplines**, several to the same table. ⚠️ And the ported §3f taxonomy is **wrong for 5 steps** — `load-neighbourhoods` is labelled class A while doing **6 unguarded set-based UPDATEs** (`:474,487,507,544,564,604`, only **2** `IS DISTINCT FROM` in the file): **a class-A label hiding banned class H** |
> | `execution.on_row_error` | **3 values for 14 measured behaviours** across 58 catch sites. **10 have no legal value** — batch-level swallow (3 steps), loop-abort, prior-snapshot substitution (`refresh-snapshot.js:342-346`), 4 true silent swallows |
> | `staleness.pending` | conflates **three axes**: *scope* (which rows), *trigger* (what makes the step eligible), *mode-select* (skip / incremental / full / defer). Cannot express the ledger gate's 4 arms, the two-tier pre/post-download split, the tri-state `decideCentrelineMode`, or scope-defer |
>
> **Six further P0 categories are missing**, each present in 2+ steps: **`acquisition`** (⚠️ four loaders use `fs.existsSync` as their entire freshness policy — a 9th, undeclared gate that *defeats* `pending: source_changed`; `load-massing.js:28-36` records the 86-minute production failure it caused) · **`terminals`** (10 exit paths in one step, each with a hand-written `records_meta` — the source of the 7 hardcoded skip-path `'PASS'`es) · **`maintenance`** (VACUUM on 4 tables in 3 steps; it *constrains* `txn_scope` and an ASSERT does it while `outputs` is forced `"none"`) · **`plan_shape`** · **`source_key_policy`** · **`guards.requires.on_missing`** (6 steps use a missing extension as an **algorithm selector**, which makes `outputs.columns` a fiction).
>
> **Three defects in this spec's own instruments:**
> 1. ⚠️ **`extract-vocab.mjs` covers 8 of 17 categories** — `identity · inputs · outputs · staleness · guards · execution · checks · recovery` only. **Nine have no machine-extracted menu**, including all four this spec adds. *"The vocabulary is GENERATED, never transcribed" is true of less than half of it.*
> 2. ⚠️ **`checks[].kind` was cited as 12; it is 9.** The 12 is Spec 120 §5.0's separate list of *generators*. Corrected throughout.
> 3. **`outputs.write_discipline` is absent from the generated vocabulary entirely** — hand-ported from evidence base §3f, and that source is itself wrong for 5 steps.
>
> **17 menu values have ZERO instances in the corpus** — all of `publish: pointer`, `when: pre`, `quarantine`, `checkpoint`, `interval`, `on_fingerprint_change`, and all three `schema_drift` values. They are aspirational, which is legitimate for a target state but must not read as descriptive. ⚠️ **`severity: PASS` is impossible** — `PASS` is a runtime outcome, never a declarable escalation target; the menu conflates the result vocabulary with the declaration vocabulary.
>
> **Two §1.6 promises are refuted by the corpus:** `ASSERT ⇒ counters: null` (**0 of 5** ASSERTs emit null — they emit `0,0,1,1,tableResults.length`), and *"declaring `archetype` retires `run-chain.js:544-550`'s prefix dispatch"* (`isInfraStep` spans **four archetypes plus name-specific exceptions**; it is not derivable from an 8-value enum).
>
> ⚠️ **The unifying pattern across every P0 gap is one shape: the descriptor would say one thing and the code would do another.** `pending: source_changed` defeated by `existsSync`. `outputs: "none"` on a step that VACUUMs. `retract: departed` on a step migrating a key space. **That is concern 15's exact failure — which is the strongest argument that the Concern Index was worth writing, and that it is not finished.**
>
> **The design below stands. The vocabularies do not. Closure path amended by R2/R5 (ratified 2026-08-23):** the six conflicts are closed by the V1–V6 operator rulings encoded directly in `step.schema.json` — the canonical vocabulary, from which the menu tables are generated (**no extractor extension is needed; B3 dissolves**) — and the 54 orphans (post-F1) are triaged in batches per R5, pilot-archetype-touching first.


> ### One shape · one menu · one compute
>
> **Every step in the estate is the same step, except for its compute.** It declares **17 categories**; those declarations answer **49 concerns**; every answer is chosen from a **closed menu**, and `"none"` is always a legal answer that must be written down. The library does everything else — identically, 64 times.
>
> **Three machines, and a step author touches only the first:**
>
> | | Machine | Who writes it | What it is |
> |---|---|---|---|
> | **1** | **DECLARE** | the step author | `<slug>.descriptor.json` — 17 categories, closed menus |
> | **2** | **DELEGATE** | nobody — the library | `pipeline.step(descriptor, compute)` runs the lifecycle |
> | **3** | **VERIFY** | nobody — generated | the validator, the checks, the ledger, the differential |
>
> **The compute is the only thing anyone writes twice.** That is the whole design, and §1.8's Concern Index is the proof: 48 of 49 concerns resolve to a menu, a runner behaviour, or an explicit `"none"`. Concern 40 is the compute. There is no fourth thing.

### 1.0 THE BLOCK — the whole standard on one page

**Read left to right: what you declare · what the menu allows · who writes it · which concerns it closes.**
**`"none"` is a legal answer everywhere and must be written.** ⬦ = open, the only two.

| # | Category | Declares | Menu | Written by | Concerns |
|---|---|---|---|---|---|
| 1 | `identity` | name · display_name · owner · lock (+`why_lock`) · spec · archetype · contract_version | closed | author | 13, 41 |
| 2 | `inputs` | producer steps · tables · externals · version pins · expect_nonempty · on_missing | closed | author | 12 |
| 3 | `outputs` | table · key · columns · **write_discipline** · retract · replay · publish · invalidates | closed | author | **17**, 18, 19, 20 |
| 4 | `staleness` | pending · checkpoint · interval · fingerprint~ · logic_version | closed | author | 5, 14, 21 |
| 5 | `guards` | extensions · indexes · functions · columns · srid · **database** · empty_source · schema_drift | closed | author | 27, 28, 29 |
| 6 | `execution` | budget · txn_scope · chunked · statement_timeout · step_timeout · batch · on_row_error · criticality · needs_disk_mb · network · **invocation** · partial_fill | closed | author | 1, 3, 7–11, **15**, 30, 31 |
| 7 | `checks` | ⚠️ **never `"none"`** — the validator | **half** ⬦ | author | 24, 25, 26, **38 ⬦** |
| 8 | `override` | force env var | closed | author | 16 |
| 9 | `emits` | extra `records_meta` keys | closed | author | — |
| 10 | `deviations` | `{from, why, adjudicated_by, date}` | closed shape | author | 36 |
| 11 | `limitations` | `{what, measured, check_id}` | closed shape | author | 37 |
| 12 | `interpretation` | → `notes.json`, capped at 12 | ⬦ **prose** | author | **39 ⬦** |
| 13 | `recovery` | reset · resume · force · rollback · verify_clean · cascades~ | closed | author | 35 |
| 14 | `database` | class · min_migration · assert_current_database | closed | author | 32 |
| 15 | `counters` | what feeds `records_total` / `_new` / `_updated` | closed | author | 22 |
| 16 | `config` | logic_variables consumed + bounds + validation posture | closed | author | 33 |
| 17 | `sharing` | chains~ · slug_forms~ · varies_by_chain · on_contention | closed | author | 6, 34 |
| — | **THE RUNNER** | ledger · verdict · audit rows · reconcile · WAP · error class · skip_reason · step_error · budget + duration tripwires · OpenLineage | — | **nobody** | 2, 4, 23 |
| — | ⬦ **COMPUTE** | the domain logic | **OPEN** | author | **40 ⬦** |

**Three machines. An author touches one.**

| | Machine | Artifact | Who |
|---|---|---|---|
| **1** | **DECLARE** | `<slug>.descriptor.json` — 17 categories | the author |
| **2** | **DELEGATE** | `pipeline.step(descriptor, compute)` | nobody — the library |
| **3** | **VERIFY** | validator · checks · ledger · differential | nobody — generated |

**The four questions, answered in one line each:**

| Question | Answer |
|---|---|
| **How is UPDATE mandated over rewrite?** | `outputs.write_discipline` — **declare** the class (13 measured, D and H banned) → the runner **generates** the SQL from it → `IS DISTINCT FROM` guards every declared column → **`idempotent_rerun: zero_writes` is asserted**: run twice, second run updates 0 |
| **Where does VERIFICATION live?** | **the runner, always.** Verdict row-derived, ledger in a `finally`, counters scoped by `writes.key`. A step declares nothing about it and cannot opt out |
| **Where does VALIDATION live?** | **`checks`** — the one category that may never be `"none"`. Shape closed (`kind`·`limit`·`severity`⊥`blocking`·`when`), subject open (`expect`·`why`) |
| **What does the ARCHETYPE do?** | decides **which of the 17 you must answer**. ASSERT forces 6 to `"none"`; ENRICHER makes a missing invalidator *unexpressible* |

> **The one-sentence standard:** *everything but the compute is declared from a closed menu, generated by the library, and proven by a check — and the archetype decides which declarations are live.*

---

### 1.1 Where each machine lives — and the three questions this answers

Three questions get asked of this design repeatedly. Here they are, answered once.

#### ⓵ "How do we mandate UPDATE and never a rewrite?" — §1.2, and it is declared, generated and proven

**This is the concern that made `enrich_parcels` the chain's largest cost, and it is standardized in four moving parts. None of them is discretion.**

| Part | Where | What it does |
|---|---|---|
| **DECLARE the shape** | `outputs.write_discipline.class` | one of **13 measured classes** (§1.4). ⛔ Class **D** (insert-only, no retraction) and **H** (set-based, unscoped) are **banned for new steps** |
| **GENERATE the SQL** | the library | ⚠️ **`class` selects the statement.** The runner emits the upsert, the departure delete and the retraction *from the class* — a hand-written `INSERT … ON CONFLICT` in a compute **fails lint** (claim #57, the 525K-row silent outage) |
| **GUARD every column** | `write_discipline.guard` | `IS DISTINCT FROM` over **all declared columns**; opting out needs a `why` (claim #58). ⚠️ An unguarded `ON CONFLICT DO UPDATE` still writes a **new tuple version** when nothing changed — the heap-churn mechanism Spec 118 §1 identifies |
| **PROVE it** | `write_discipline.idempotent_rerun` + a check | `zero_writes` is **asserted, not asserted-to**: run twice, assert the second run updates 0 — the founding commit's own acceptance standard (`7e130bff`, Severity HIGH, `lessons.md:28`). Plus `expected_change_ratio` measured every run from `rows_scanned` / `rows_changed` |

> ⚠️ **The rule is not "never rewrite." It is "never rewrite silently."** `full_replace` stays legal — `load-centreline`'s staging replace is spec-sanctioned (Spec 62 **L26**, 47K rows, HEAD/ETag-gated) — but it must be **declared as class C**, and a class-C step that quietly becomes a class-A step is a schema change, reviewed once for all 64.
>
> **What this retires, measured:** comps rewriting **426,732 parcels every run** with no change detection · a manifest `chain_args` pin forcing `--full` past a working incremental path (now concern 15) · **≥9** incomplete-IDF-guard incidents, one of which would have NULL-overwritten a 427K column every quarterly reload.

#### ⓶ "Where does VERIFICATION live?" — in the library, never in a step

**Verification asks *did this run do what it said*.** It is entirely runner-owned; a step declares nothing about it and cannot opt out.

| What | Where |
|---|---|
| the verdict | **row-derived, always** — never a parallel boolean. Retires `hasFails ? 'FAIL' : 'PASS'` (3 scripts structurally cannot emit WARN) and 7 hardcoded skip-path `'PASS'`es |
| audit rows | emitted from `checks`, co-located with the write |
| the ledger row | written at start, finalized in a `finally`, `crashed` distinct from `failed` |
| counters | from `counters`, scoped by `writes.key` — retires **9 distinct semantics** for `records_total` |
| the differential | old vs new, same file at two commits, same invocation (§8) |

#### ⓷ "Where does VALIDATION live?" — in `checks`, and it is the one category that may never be `"none"`

**Validation asks *is the data right*.** It is the only half-open category: the **shape** is closed, the **subject** is yours.

| Closed — pick from the menu | Open — domain knowledge |
|---|---|
| `kind` (**9** named types) · `limit` · `severity` ⊥ `blocking` · `when` | `expect` (the columns, the bounds) · `why` |

⚠️ **`checks` may never be `"none"`** (claim #7), and `pipeline.step()` validates the descriptor **before compute runs** — so a step **cannot execute without declaring checks**, and cannot run them anywhere but through the validator.

> **No vocabulary could supply that `WARD` is text in the CoA *Active* resource and `WARD_NUMBER` is int4 in *Closed*.** That is what `expect` is for. **The machinery is canned; the domain facts are not.** Anyone claiming 100% canned is overselling it.

#### ⓸ And the archetype decides which of the 17 you must answer

`identity.archetype` is not a label — **it drives the required-field profile** (§1.10). Measured across `sources`: ING 9 · ENR 6 · AST 5 · LNK 3 · MAT 1 · MCH 1 · BKF 1 · REC 1 = **27**.

| Archetype | Forces |
|---|---|
| `ASSERT` | `outputs` **must** be `"none"`; `counters` `null`; `checks` ≥ 1 |
| `ENRICHER` | ⚠️ `pending` on a lineage column **⇒ a declared invalidator** — the centroid defect made *unexpressible* |
| `INGESTOR` | `write_discipline` + `retract` + `replay` + `empty_source` all required |
| `LINK` / `MATCHER` | `invalidates` required; counters scoped by `writes.key` |

**For an ASSERT, 6 of 17 categories collapse to `"none"`.** That is the archetype earning its place: it tells you which categories are live, and forces the rest to be *explicit* rather than *forgotten*.

---

### 1.2 ⚠️ THE CONTRACT — 17 categories, set in stone

> **This is the load-bearing rule of the whole programme.** The category list and the allowed responses are decided **once, for all 64 steps**. Extending a `!` vocabulary is a **runner change reviewed once**, never a per-step invention. A step that needs a value the menu lacks does not add one — it escalates (§7.3's kill criteria).
>
> ⚠️ **Omission is a build failure; `"none"` is a valid value — and it applies PER FIELD, not per category.** A category present with fields missing is the same *"we forgot something again"* the design exists to answer.

> ⚠️ **SUPERSEDED BY R2 (2026-08-23).** The canonical vocabulary is now **`scripts/steps/_schema/step.schema.json`, authored directly** (encoding rulings V1–V6 + the reshaped menus); `122-vocabulary.md` and this spec's menu tables are generated FROM the schema. `extract-vocab.mjs` is a **one-time migration tool** whose conflict list seeded the rulings — it is not extended and not re-run as a gate. The paragraph below is retained as the record of how the conflicts were found.

**The vocabulary was originally extracted from Spec 120 §3.2:**

```
node scripts/violations/extract-vocab.mjs docs/reports/generated/122-vocabulary.md
```

`[generated 2026-08-23 — 56 field rows]`. The extractor **emits the vocabulary and then exits 1** over an unresolved conflict — `fs.writeFileSync` runs before the conflict check (`extract-vocab.mjs:267` writes, `:271-274` reports and returns 1 unless `--allow-conflicts`), so the artifact is always produced and the *exit code* is the gate. It does refuse outright on only one condition: an unproven parser (`:252`).

⚠️ **It found 6 fields declared twice with differing values, independently reproducing the 3 that Spec 121 §12.1a already named** — `identity.archetype` (`INGESTOR|…` vs `ING|…`) · `identity.lock` (uniqueness scope) · `guards.schema_drift` (**one variant carries `warn`, the other does not — both contain `propagate`; the differing tokens are `warn` · `severity` · `blocking`, and a generator cannot choose**) — plus 3 borderline (`outputs.replay` bans `append_unsafe` two different ways; `staleness.pending`; `guards.empty_source`). ✅ **All six RESOLVED 2026-08-23 by operator rulings V1–V6 (see the round-2 ratification block), encoded in `step.schema.json` per R2.**

### 1.3 The 17 categories

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

### 1.4 ⚠️ `outputs.write_discipline` — update, never rewrite

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
// ⚠️ RESHAPED 2026-08-23 — `write_discipline` is PER WRITE TARGET, not per step.
// The scalar form was refuted: >=9 of 27 steps perform two or more disciplines,
// several to the SAME table in sequence. `load-neighbourhoods` was labelled
// class A while doing 6 unguarded set-based UPDATEs -- a class-A label hiding
// banned class H. A scalar cannot say "the retraction is step-scoped and the
// rebuild is batch-scoped", which is the chain's largest partial-fill exposure.
"outputs": {
  "writes": [
    { "table": "neighbourhoods", "key": "area_short_code",
      "columns": ["name", "geom"],
      "write_discipline": {
        "class": "guarded_upsert",         // ! one of the 13
        "guard": "is_distinct_from",       // ! is_distinct_from · none(+why)
        "guard_columns": "all_declared",
        "expected_change_ratio": "<= 0.05",
        "idempotent_rerun": "zero_writes", // ! run twice, second run updates 0
        "txn_scope": "batch"               // ! per-target, NOT per-step
      } },

    // The SAME table, a SECOND discipline, declared separately and in order.
    // Today this is 6 unguarded UPDATEs the class-A label concealed.
    { "table": "neighbourhoods", "key": "area_short_code",
      "columns": ["profile_pop", "profile_income"],
      "write_discipline": {
        "class": "set_based_scoped",       // G, not the banned H — because it is SCOPED
        "guard": "is_distinct_from",
        "guard_columns": "all_declared",
        "expected_change_ratio": "<= 1.0", // a profile refresh legitimately rewrites
        "idempotent_rerun": "zero_writes",
        "txn_scope": "step"
      } }
  ]
}
```

**Three rules the per-target form makes enforceable, and the scalar form could not:**

| Rule | What it retires |
|---|---|
| **Every write target declares its own class, guard and `txn_scope`** | the class-A label over 6 unguarded UPDATEs; `link_massing`'s step-scoped DELETE followed by ~870 batch-scoped inserts |
| ⚠️ **A target this step does not own is a `cascade`, never a `write`** | `load-massing.js:208,222` DELETEs from `parcel_buildings` (step 15's table) while `emitMeta:480-483` declares only `building_footprints` — the undeclared-telemetry class (orphan #234) |
| **Order is declared and the runner executes it in order** | "retract then rebuild" becomes a sequence the runner owns, not an ordering convention in prose |

⚠️ **Two of the 13 ported classes are wrong at the source and must be re-derived, not copied.** Evidence base §3f mislabels **5 steps**: `load_heritage` (A→A+B, and its `Del` column says 0 while it deletes at `:602`) · `load_zoning` (A→A+B+C, same `Del=0` error) · `neighbourhoods` (A→A+H) · `link_wsib` (K→E+G+K) · `refresh_snapshot` (M `snapshot_append` → a **daily-keyed upsert**, `:593` `ON CONFLICT (snapshot_date) DO UPDATE`). **§1.2 previously said "port, do not invent." That was right about the source and wrong about its accuracy — the port must be verified per step, not trusted.**

⚠️ **`class` is not decoration — it selects the generated SQL.** The runner emits the upsert, the departure delete and the retraction *from the class*, so class D's missing retraction and class H's missing scope become **unexpressible for a new step** rather than a breach discovered later.

**The runner enforces it, so it is tier 3 not tier 0:**
- generates the upsert from `outputs.columns` with the declared guard — a hand-written `INSERT … ON CONFLICT` in a compute **fails lint** (claim #57, the 525K-row silent outage)
- emits `rows_scanned` / `rows_changed` every run and **checks them against `expected_change_ratio`**
- ⚠️ **`idempotent_rerun: "zero_writes"` is asserted by the founding commit's own acceptance standard — `7e130bff`, Severity HIGH, `lessons.md:28`: run twice, assert the second run updates 0.** That check is what would have caught comps.

> **`full_replace` and `not_idempotent` remain legal — they require a `why`.** `load-centreline`'s staging-table full-replace is spec-sanctioned (Spec 62 **L26**, 47K rows, HEAD/ETag-gated) and must stay expressible. **The rule is not "never rewrite" — it is "never rewrite silently."**

### 1.5 ⚠️ `staleness` RESHAPED — `pending` was three axes wearing one name

**The scalar `pending` was refuted.** It cannot express the eight measured gate mechanisms because four of them do not declare *which rows* at all — they declare *whether to act* or *in which mode*.

| Axis | Question it answers | Menu |
|---|---|---|
| **`scope`** | **which rows** are eligible | `<sql predicate>` · `all` · `none` |
| **`trigger`** | what makes the step **eligible to act** | `source_validator` (HEAD/ETag, pre-fetch) · `content_hash` (post-fetch) · `upstream_ledger` · `code_version` · `interval` · `always` · `none` |
| **`mode_select`** | what the trigger **chooses** | `skip` · `incremental` · `full` · `defer` · `tri_state` |

```jsonc
"staleness": {
  "scope":       "heritage_dataset_version_when_enriched IS DISTINCT FROM :version",
  "trigger":     ["upstream_ledger", "code_version"],   // ! a SET, not a scalar
  "mode_select": "tri_state",                            // full | incremental | skip
  "checkpoint":  "none",
  "interval":    "none",
  "fingerprint": "~",                 // always on
  "fingerprint_inputs": ["scripts/lib/massing-full-gate.js"],  // ⚠️ NEW — see below
  "logic_version": "none",
  "on_fingerprint_change": "queue"
}
```

**Why each axis had to be separated — one measured mechanism per row:**

| Mechanism | The axis the scalar could not hold |
|---|---|
| **Run-ledger gate** (`source-version.js:293-380`) | a **4-arm** decision over `pipeline_runs`, fail-safe biased to RUN. `trigger: upstream_ledger` names it; the arms are runner-owned |
| **Two-tier metadata→hash** (`:161-188` pre-download, `:207` post-download) | ⚠️ **two gates at two lifecycle positions** — because tier-1 gives false negatives (*"CKAN re-stamps `last_modified` on files whose content never changed"*). `trigger` is a **set**, ordered by lifecycle position |
| **Massing code+data veto** (`massing-full-gate.js:36-58`) | the output is a **mode**, not a skip. `on_fingerprint_change` offered only `queue · run` — never *"run in full mode"* |
| **Scope-defer** (`enrich-parcels.js:1763`) | the **inverse** of a staleness gate: *too much* changed, so refuse. `mode_select: defer` |
| **`decideCentrelineMode`** (`enrich-centreline.js:420-424`) | returns **`full \| incremental \| skip`** from two inputs. `mode_select: tri_state` |
| ⚠️ **The 9th mechanism nobody counted** | four loaders short-circuit acquisition on `fs.existsSync` alone (`load-parcels.js:231-237`, ~327 MB; `load-massing.js:145-165`). **A step declaring `trigger: source_validator` while its acquisition short-circuits on a cached file is declaring a fiction** — and `load-massing.js:28-36` records the 86-minute production failure this caused. **This is why `acquisition` is a P0 missing category, not a `staleness` value** |

⚠️ **`fingerprint_inputs` is new and it closes a contradiction.** Spec 120 §4.1a ② rules that *"an unenumerated external input is a declaration defect"* — but `fingerprint` is marked `~ derived, do not declare`, so **there was no field to enumerate them in**. `LINK_MASSING_CODE_VERSION` lives in `scripts/lib/`, not in the step, and it triggers a full destructive rebuild. Claim **#52b** is an orphan today for exactly this reason.

### 1.6 ⚠️ `execution.on_row_error` RESHAPED — 3 values for 14 behaviours

**Measured: 14 distinct behaviours across 58 catch sites. Ten had no legal value.** The menu was row-scoped; the behaviours are not.

```jsonc
"execution": {
  "on_row_error":   "quarantine(max_pct: 0.01)",  // ! fail_fast · quarantine · skip
  "on_batch_error": "fail_step",                  // ⚠️ NEW — ! fail_step · drop_batch(+why) · retry
  "on_check_error": "fail_step",                  // ⚠️ NEW — ! fail_step · warn_row · omit_row(+why)
  "on_degrade":     "none"                        // ⚠️ NEW — ! none · prior_values(+why) · zeroes(+why)
}
```

| New field | The behaviour it names | Measured at |
|---|---|---|
| **`on_batch_error`** | a **whole batch** swallowed and discarded, counted as one row error | `load-address-points.js:374-378` · `load-parcels.js:550-554` · `load-massing.js:378-382`. The comment concedes *"lost rows inflate this count slightly"* |
| **`on_check_error`** | the **check query itself** errors — today the row is silently *omitted*, so a dropped table is indistinguishable from a healthy one | `assert-data-bounds.js:607-610` · `assert-schema.js:445-449` |
| ⚠️ **`on_degrade`** | on failure, **substitute prior-run values or zeroes and present them as current** | `refresh-snapshot.js:342-346,359-363,372-376,399-405` — reuses the last snapshot's numbers, **no audit row**, verdict still hardcoded `'PASS'` at `:651` |

> ⚠️ **`on_degrade` is the one that matters.** Nothing in the contract could express *"on failure, serve stale data as if it were fresh"* — and it is live in four places in one step, behind a PASS. **Declaring it does not make it acceptable; it makes it visible, and `+why` makes it adjudicated.**

**Four true silent swallows have no legal value under any of the four fields and must be fixed, not declared:** `link-massing.js:557-559` (invalid geometry → parcel silently reclassified as no-match, **no counter**) · `assert-engine-health.js:200,234` (`.catch(() => ({rows: []}))` → the ping-pong ratio computes 0 and **silently passes**) · plus the two `refresh-snapshot` zero-substitutions.

### 1.7 ⚠️ `sharing` — the second classification axis, and it is where the estate actually bites

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

### 1.8 THE CONCERN INDEX — 49 concerns, each with exactly one home

#### How a concern differs from a category — and why this is not a second list

**A category is a place you WRITE something. A concern is a question that must be ANSWERED.**

They are not parallel lists, and the Concern Index **adds no declaration surface**. Every concern resolves to exactly one of three homes:

| Home | Meaning | Count |
|---|---:|---:|
| one of the **17 categories** | the step declares it | **44** |
| **RUNNER** | the library owns it; **nothing is declared per step, and a step cannot opt out** | **4** |
| **OPEN** | the compute | **1** |

> **So the index is a lookup, not an inventory.** Ask *"where does timeout behaviour live?"* → concern 8 → `execution.statement_timeout`. Ask *"who owns the verdict?"* → concern 23 → **the runner, and you may not touch it.**

#### ⚠️ The four RUNNER concerns — the boundary between the step and the library

**These are the ones a step author cannot influence, and that is deliberate.** They are the behaviours that were divergent in every script before this contract existed:

| # | Concern | Why the runner owns it — measured |
|---|---|---|
| **2** | Step errors / throws | **8 distinct catch behaviours** across 27 scripts, incl. 4 silent swallows. `logError` is 0/27 |
| **3** | Crashes (SIGKILL / OOM / ceiling) | 3 steps strand a `running` row; one strand ran **39 days**. The ledger belongs in a `finally` nobody writes |
| **4** | Reconcile the previous run | there is no external supervisor — the runner is the thing that dies (A3) |
| **23** | **Verdict** | **9–11 distinct cascades**; 3 scripts structurally cannot emit WARN, 3 cannot emit FAIL, 7 hardcode `'PASS'` on the skip path. ⚠️ **Row-derived, always — never a parallel boolean** |

> ⚠️ **A step declares `checks`; the runner derives the verdict FROM them.** That is the single most important seam in the contract: the step says *what is true*, the library decides *what that means*. Collapsing the two is how `hasFails ? 'FAIL' : 'PASS'` became live in three scripts.

#### The 1:1 property is PROVEN, not asserted

```
node scripts/violations/map-concerns.mjs docs/reports/generated/122-concern-homes.md
```

Hard-fails on: a concern with **no** home · a concern with **two** homes · a home that is not a category/RUNNER/OPEN · **a category that is nobody's home** · a duplicate concern number.

⚠️ **Writing that check found three defects in this very section, which is why it exists:**

| Found | Fix |
|---|---|
| **concern 21 had TWO homes** — `staleness.checkpoint` *and* `recovery.resume` | split into **21** (checkpoint) and **21b** (resume). *This is exactly the overlap the index claimed could not happen* |
| ⚠️ **`emits` was nobody's home** — a declaration category no concern asked for | added as **9b** |
| the mapper's own id regex was digits-only and **silently dropped `9b`/`21b`** | widened. Same shape as the `[a-e]` bug that lost claims 52f–h — it reported a clean 41 and looked right |

> **`"none"` is always a legal answer and must be written explicitly.** Two fields are deliberately open, marked ⬦ — plus the compute.
>
> ⚠️ **How this section came to exist is also the point.** Four categories were found *reactively*: the operator noticed a gap. That is the failure Spec 121 §12.9 made — a coverage matrix that mapped ID *spaces*, looked complete, and hid 162 uncited claims. Two tools now close it: `map-concerns.mjs` proves concern↔home is 1:1, and **`map-categories.mjs`** maps all 290 claims to a home and **hard-fails on an orphan**. Gaps are found by a tool, not by noticing.

| # | Concern | Declared in | Allowed responses |
|---|---|---|---|
| 1 | **Row errors** | `execution.on_row_error` | `fail_fast` · `quarantine(max_pct)` · `skip(max_pct)` |
| 1b | ⚠️ **Batch errors** | `execution.on_batch_error` | `fail_step` · `drop_batch(+why)` · `retry` — **NEW: a whole batch swallowed, counted as one row error** |
| 1c | ⚠️ **Check-query errors** | `execution.on_check_error` | `fail_step` · `warn_row` · `omit_row(+why)` — **NEW: today a dropped table is indistinguishable from a healthy one** |
| 1d | ⚠️ **Degraded mode** | `execution.on_degrade` | `none` · `prior_values(+why)` · `zeroes(+why)` — **NEW: serving stale data as current, live in 4 places behind a PASS** |
| 2 | **Step errors / throws** | **RUNNER** | nothing declared — the library owns `try/finally`, `step_error`, and error class |
| 3 | **Crashes (SIGKILL, OOM, ceiling)** | **RUNNER** + `execution.partial_fill` | `atomic` · `batched` · `staged` · `none` · `mixed` — ⚠️ what a crash *leaves behind* |
| 4 | **Reconcile the previous run** | **RUNNER** (A3: a `reconcile` step at chain head) | nothing declared |
| 5 | **Gating / skip** | `staleness.pending` | `<sql predicate>` · `all` · `source_changed` · `none` — ⚠️ must express all **8 measured mechanisms** |
| 5b | ⚠️ **Eligibility trigger** | `staleness.trigger` | `source_validator` · `content_hash` · `upstream_ledger` · `code_version` · `interval` · `always` · `none` — **a SET, ordered by lifecycle position** |
| 5c | ⚠️ **Mode selection** | `staleness.mode_select` | `skip` · `incremental` · `full` · `defer` · `tri_state` — **what the trigger CHOOSES** |
| 14b | ⚠️ **External fingerprint inputs** | `staleness.fingerprint_inputs` | path list · `none` — **NEW: §4.1a ② demands enumeration and there was no field for it (orphan #52b)** |
| 6 | **Lock contention** | `sharing.on_contention` | `self_skip` · `wait` · `fail` |
| 7 | **Time budget** | `execution.budget` | duration · `none` |
| 8 | **Statement timeout** | `execution.statement_timeout` | duration · `none` |
| 9 | **Step ceiling** | `execution.step_timeout` | duration · `none` — ⚠️ **today this lives in the manifest and 1 of 67 declares it** |
| 9b | ⚠️ **Extra `records_meta` keys** | `emits` | key list · `none` — **NEW: `emits` was the one category no concern asked for** |
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
| 21 | **Checkpoint** — can this step record where it got to? | `staleness.checkpoint` | `none` · `{cursor, ordered}`; ⚠️ `ordered:false` **cannot** resume |
| 21b | **Resume** — will it use that checkpoint after a crash? | `recovery.resume` | `checkpoint` · `none` |
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

### 1.9 What is NOT a canned response

**15 of 17 categories are fully closed menus.** Two are deliberately not, and the boundary matters:

| Category | Closed part | Open part |
|---|---|---|
| **`checks`** — the validator | `kind` · `limit` · `severity` · `blocking` · `when` are **closed enums**; the verdict cascade is **runner-owned and row-derived** | the `expect` list and the `why` string are **domain knowledge** |
| **`interpretation`** — understanding the step | capped at 12 entries; **may reference a check id but may NEVER quote a number** | the prose itself |

> ⚠️ **No vocabulary could supply that `WARD` is text in the CoA *Active* resource and `WARD_NUMBER` is int4 in *Closed*.** That is what `checks[].expect` is for. Claiming 100% canned oversells it — the honest claim is: **the shape, the machinery and the verdict are canned; the domain facts and the interpretation are authored.**

### 1.10 ⚠️ `identity.archetype` becomes load-bearing — it drives required fields

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
> plus `require` calls, `const` declarations of **literals only**, and the two named re-exports below — and **nothing else executable**. `pipeline.run(` is banned outright in those files.

> ⚠️ **CORRECTED 2026-08-23 — three MANDATORY rules were mutually incompatible, and the only worked example violated all three.**
>
> §5.1 said *"nothing else executable"*; §5.2 requires **named exports** `descriptor` and `compute` (claim #163, the compute-swap test); §5.4 requires keeping **`const ADVISORY_LOCK_ID = 102;` textually** so three source-text loops stay green. A file cannot satisfy all three as they were written. **The frozen shape resolves it — this is the whole file, and it is the ONLY legal shape:**
>
> ```js
> const pipeline  = require('../lib/pipeline');
> const descriptor = require('./assert-schema.descriptor.json');
> const compute    = require('../lib/compute/assert-schema');
> const ADVISORY_LOCK_ID = 102;          // literal only — §5.4's source-text loops
> module.exports = pipeline.step(descriptor, compute);
> module.exports.descriptor = descriptor; // §5.2 / #163 compute-swap
> module.exports.compute    = compute;
> ```
>
> **What the ast-grep rule permits, exhaustively:** `require(...)` bindings · `const <ID> = <literal>` · exactly one `module.exports = pipeline.step(<identifier>, <identifier>)` · the two named re-exports · **the `'use strict'` directive prologue** *(ratified addition 2026-08-24 — banning it would silently switch converted steps to sloppy mode, a semantic change this list never intended)*. **Anything else is a build failure.**
>
> ⚠️ **Two consequences, stated because they were previously wrong:** the earlier example passed a **spread expression** `{ ...descriptor, identity: {...} }` where the rule demands an identifier — **illegal, and it also silently forked the descriptor** so the on-disk JSON was no longer what ran. And `identity.lock` is now **asserted against** the textual `ADVISORY_LOCK_ID` by the conformance suite rather than spliced into the object at runtime, so the JSON and the constant cannot drift apart.

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

`:297` passes (§1.4). But the **same file** carries three further per-script loops that assert *source text* `[READ]`:

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

## 10. Sequence — NOT restated here

> ⚠️ **CORRECTED 2026-08-23.** This section previously carried its own stage table, and it **disagreed with the plan**: it used `P1` for *"envelope repair + one clean cloud run"* while the programme plan uses `P1` for the **centroid invalidator** and `P3` for the envelope. A grounding audit found **`P1` carrying three incompatible meanings across four documents**, and this table was one of the three.
>
> **A reader who took this table's `P1` would satisfy the S-gate by fixing a centroid — silently deleting the green-cloud-run precondition that §11 failure-mode 7 exists to enforce.**

**The sequence has exactly one source of record: `.cursor/active_task.md`** (promoted from `.cursor/queued_task_step_opt_programme.md` 2026-08-23, which is now a pointer). ⚠️ `build-active-task.mjs` still targets the old path — retargeting or retiring it is an S0 item; until then do not run it:

```
node scripts/violations/build-active-task.mjs --write    # -> .cursor/active_task_programme.md
node scripts/violations/build-active-task.mjs --check    # exits 1 on drift
```

The generator hard-fails on a stage id defined twice, on a claim count that disagrees with `plan-claims.mjs`, and on a category count that disagrees with this spec — which is what stops this divergence recurring.

### 10.1 What this spec DOES own about sequencing

Two entry criteria belong to the architecture, not the plan, and they bind wherever the plan places them:

| Criterion | Why it is architectural |
|---|---|
| ⚠️ **No step converts before one clean `chain_sources` run in the cloud** — **gates C1, NOT the S-stages (R3):** library/schema/ledger/conformance work converts nothing and proceeds in parallel | converting while the chain cannot complete makes a conversion regression **indistinguishable** from the pre-existing envelope failure (§11 KFM 7) |
| ⚠️ **Phase B lands, and the golden master is captured AFTER it** | capturing earlier freezes pre-Phase-B behaviour, and the conversion then **silently reverts Phase B behind a green differential** |

### 10.2 The two namespaces, disambiguated

| Namespace | Used for | Where |
|---|---|---|
| **`PH-0` … `PH-8`** | Spec 121 §3's **assessment phases** — boundary freeze, archaeology, structure, intent, seams, classification, test design, score | Spec 123 |
| **`P0` … `P3`** | **programme stages** — audit instrument · centroid · Phase B · envelope + green run | the plan |

**A `P` token without its namespace is ambiguous. Do not write one.**

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

## 12. ⛔ OUTSTANDING BEFORE VERIFICATION — the ratification checklist

> **This spec is NOT verifiable until every row below is closed.** Two of its own generators exit non-zero today and are deliberately left that way: tuning a checker until it stops firing is the laundering the tool exists to prevent.

### 12.1 Blocking — a generator says no

> ⚠️ **CLOSURE PATHS AMENDED BY R2/R5 (2026-08-23):** **B1 is CLOSED** — the six conflicts are adjudicated by operator rulings V1–V6, encoded in `step.schema.json` (the canonical vocabulary per R2); `extract-vocab.mjs`'s exit 1 is now historical record, not a gate. **B3 DISSOLVES** — no extractor extension; the nine categories are born in the schema. **B2 is re-scoped** — the 54 orphans are triaged in batches per R5 (contract-must-express / runner-owned / defer-with-reason), pilot-archetype-touching first, not held as a monolithic freeze gate.

| # | Item | Signal | Why it blocks |
|---|---|---|---|
| **B1** | **6 unresolved vocabulary conflicts** in Spec 120 §3.2 | `extract-vocab.mjs` **exits 1** | Three are genuine value disagreements a generator **cannot arbitrate**: `identity.archetype` (`INGESTOR\|…` vs `ING\|…`) · `identity.lock` (uniqueness scope) · `guards.schema_drift`. **A frozen contract cannot be emitted over an unresolved conflict** |
| **B2** | **54 unadjudicated orphan claims** | `map-categories.mjs` **exits 1** | Each is a concern the contract may not be able to express. Was 62; the F1 fix **raised** it by removing a truncation — the count moved in the direction of honesty |
| **B3** | ⚠️ **`extract-vocab.mjs` covers 8 of 17 categories** | — | `identity · inputs · outputs · staleness · guards · execution · checks · recovery` only. **Nine have no machine-extracted menu**, including all four this spec adds. *"The vocabulary is GENERATED, never transcribed"* is currently true of **less than half of it** |

### 12.2 Missing categories — P0, each present in 2+ steps

> ⚠️ **R6 (2026-08-23):** each row below goes through a **categories-vs-fields adjudication** before landing as a category — `acquisition` and `maintenance` are candidate *fields* of existing categories (`staleness`/`inputs.externals`, `execution`); `terminals` and `plan_shape` look genuinely new. The gap is P0 either way; the *shape* of the fix is the adjudication.

| Category | The behaviour it would declare |
|---|---|
| ⚠️ **`acquisition`** | Four loaders use `fs.existsSync` as their **entire** freshness policy — a 9th, undeclared gate that **defeats `staleness.trigger`**. `load-massing.js:28-36` records the 86-minute production failure it caused |
| **`terminals`** | 10 exit paths in one step, each with a hand-written `records_meta`. **The source of the 7 hardcoded skip-path `'PASS'`es** this spec sets out to retire |
| **`maintenance`** | `VACUUM ANALYZE` on 4 tables across 3 steps. It **constrains `txn_scope`** (VACUUM cannot run in a transaction), is unbudgeted, targets tables the issuing step does not own — and an ASSERT does it while `outputs` is forced `"none"` |
| **`plan_shape`** | The physical query plan as a contract. `refresh-snapshot.js:29-42`: *"the fix is not 'make the query faster' but 'make the query's SHAPE immune to that statistic'"*. `guards.requires.indexes` says an index must **exist**, not that a statement must **bind** it |
| **`source_key_policy`** | Non-unique source keys, tie-breaks, and key-space migration (`load-massing.js:239-247` — *"Identical geometries produce duplicate hashes … Last write wins"*) |
| **`guards.requires.on_missing`** | ⚠️ **6 steps use a missing extension as an ALGORITHM SELECTOR, not a failure** — which makes `outputs.columns` a fiction on the degraded branch |

### 12.3 Missing fields inside categories that otherwise absorb their claims

| Field | Homes | Evidence |
|---|---|---|
| ⚠️ **`outputs.columns[].vocabulary`** | #202, #237 | A frozen **value domain** per column. `emits` declares **keys**; nothing declares **values** — which is why `ADDRESS_STATUS` read `'None'` for **525,346 of 525,346** rows and passed |
| **`checks[].accept_until`** | #99, #228 | Baseline acceptance and threshold expiry have **no declared surface**, and #228 already assumes it exists. Largest of the four |
| **`outputs.write_inventory`** | #236 | *"the runtime write count must equal the declared one"* needs a declared statement count |
| **`why` liveness** | #239 | Every category carries a `why`; nothing makes one **falsifiable** when its external dependent disappears |
| **redaction** (`execution.network.redact` or `secrets`) | #276 | Nowhere to declare a value must be scrubbed **before persistence** |

### 12.4 Tool debt — in this order, because order matters

1. ✅ **F1 CLOSED** — the violation column is header-named, not last. It was a **laundering bug**: A.18/A.21 are `# | Class | Occurrences | The test | Status`, so the last cell is the **adjudication**. 33 claims read a truncated haystack; #263/#265/#270 were homed to RUNNER on the words *"eslint … already bans"* while the spec's own verdict on those rows is *"the architecture does NOT close it"* — **and they never surfaced as orphans, so nothing flagged them.**
2. **Four spelling relaxations** — `empty.source` · `audit.row` · `pipeline.name` · `records_meta`. **Pure defects**: the rules were written in code spelling, the claims use prose spelling.
3. ⚠️ **Add the `COMPUTE` bucket to `map-categories.mjs`** — §1.8 has **three** homes (categories · RUNNER · **OPEN**); the mapper implements two. **That hole is what let F1's laundering hide.**
4. Remaining keywords — **only after 1–3**, so the rule set is sized against honest input.
5. ~~Extend `extract-vocab.mjs` to the nine unextracted categories (B3).~~ ⛔ **RETIRED BY R2** — the schema is canonical; the nine categories are authored there and never extracted.

### 12.5 Refuted claims that must not be re-asserted

| Claim | Status |
|---|---|
| *"An ASSERT forces `counters: null`"* | ⛔ **REFUTED — 0 of 5** ASSERTs emit null. They emit `0, 0, 1, 1, tableResults.length` |
| *"Declaring `archetype` retires `run-chain.js:544-550`"* | ⛔ **REFUTED** — `isInfraStep` spans **four archetypes plus name-specific exceptions**; not derivable from an 8-value enum. Needs a separate `gate_exempt` field |
| *"`checks[].kind` has 12 named types"* | ⛔ **9.** The 12 is Spec 120 §5.0's list of **generators** — a different list |
| *"Port the 13 update classes, do not invent"* | ⚠️ **Right about the source, wrong about its accuracy** — evidence base §3f mislabels **5 steps**, two with `Del=0` while they delete. **Verify per step; do not trust** |
| **17 menu values have ZERO instances** | `publish: pointer` · `when: pre` · `quarantine` · `checkpoint` · `interval` · all three `schema_drift`. Aspirational is legitimate for a target state but **must not read as descriptive**. ⚠️ **`severity: PASS` is impossible** — a runtime outcome, never a declarable escalation target |

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
