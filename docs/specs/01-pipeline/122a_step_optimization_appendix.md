# SPEC 122a — Pipeline Step Optimization: Appendix (superseded drafts, evidence tables, revision logs)

> Sibling of `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (Spec 122). Created 2026-08-28 per the operator's intelligibility ruling: Spec 122 was growing unreadable, so appendix-grade material — superseded drafts, long evidence tables, generated revision logs, the historical ratification checklist — moved HERE, never deleted. Each section below states which Spec 122 location it was moved from; each original Spec 122 location keeps a one-line pointer back.

**Governance:** this file carries no rulings of its own and decides nothing. Spec 122's dated `R-A..R-F` block and its R1–R6/V1–V7 tables remain the live rulings; where anything below conflicts with current Spec 122 text, Spec 122 governs (it is the live standard; this is history).

---

## Appendix §A1 — The coverage-audit refutation (moved from Spec 122 §1) — superseded 2026-08-23, closed by V1–V7/R2

This callout originally sat at the top of §1 ("THE STANDARD STEP") and blocked the 18-category contract from being frozen. The six vocabulary conflicts it found were adjudicated by operator rulings V1–V6 (round-2 ratification, see Spec 122's top rulings tables) and encoded directly in `step.schema.json` per R2. The categories now stand at 18 (Spec 122 §1.3). Retained verbatim below as the historical record of what the audit found.

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

---

## Appendix §A2 — Vocabulary-extraction conflict-discovery detail (moved from Spec 122 §1.2) — superseded 2026-08-23, resolved by V1–V6/R2

This is the detail behind Spec 122 §1.2's "SUPERSEDED BY R2" note: how `extract-vocab.mjs` found the six conflicting fields that seeded rulings V1–V6. Retained as the record of how the conflicts were found; not a live gate.

**The vocabulary was originally extracted from Spec 120 §3.2:**

```
node scripts/violations/extract-vocab.mjs docs/reports/generated/122-vocabulary.md
```

`[generated 2026-08-23 — 56 field rows]`. The extractor **emits the vocabulary and then exits 1** over an unresolved conflict — `fs.writeFileSync` runs before the conflict check (`extract-vocab.mjs:267` writes, `:271-274` reports and returns 1 unless `--allow-conflicts`), so the artifact is always produced and the *exit code* is the gate. It does refuse outright on only one condition: an unproven parser (`:252`).

⚠️ **It found 6 fields declared twice with differing values, independently reproducing the 3 that Spec 121 §12.1a already named** — `identity.archetype` (`INGESTOR|…` vs `ING|…`) · `identity.lock` (uniqueness scope) · `guards.schema_drift` (**one variant carries `warn`, the other does not — both contain `propagate`; the differing tokens are `warn` · `severity` · `blocking`, and a generator cannot choose**) — plus 3 borderline (`outputs.replay` bans `append_unsafe` two different ways; `staleness.pending`; `guards.empty_source`). ✅ **All six RESOLVED 2026-08-23 by operator rulings V1–V6 (see the round-2 ratification block), encoded in `step.schema.json` per R2.**

---

## Appendix §A3 — The measured case (moved from Spec 122 §3) — size, vocabulary divergence, broken instrument

Originally Spec 122 §3, this is the evidence base for why the standardization is warranted: corpus size and ceremony-ratio measurements (§3.1), the vocabulary-divergence census across 27 steps (§3.2), and the discovery that four analysis scripts defaulted to the pre-cutover database (§3.3). All `[MEASURED 2026-08-23]`. The design conclusions it supports live in the current Spec 122 §1–§8; this is the supporting data, not the standard itself.

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

## Appendix §A4 — What changes from Spec 120 — GENERATED claim classification (moved from Spec 122 §9)

The generated claim-by-claim classification of Spec 121's 290-claim register against Spec 122's architecture: 181 UNCHANGED, 66 RESHAPED, 40 STRENGTHENED, 3 DEAD (#1, #145, #158). Regenerate with `node scripts/violations/extract-claims.mjs docs/reports/generated/122-claim-classification.md`. This is a point-in-time artifact description, not itself a rule.

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

## Appendix §A5 — Ratification checklist — historical (moved from Spec 122 §12, "OUTSTANDING BEFORE VERIFICATION")

The 2026-08-23 pre-freeze checklist: blocking items (B1–B3), missing P0 categories, missing fields inside existing categories, tool debt in dependency order, and refuted claims that must not be re-asserted. Closure status as of the 2026-08-23 rulings is annotated inline (B1 CLOSED, B3 DISSOLVED, B2 re-scoped — see R2/R5/R6 in Spec 122's top rulings tables). Kept for audit trail; do not treat an item here as still open without checking Spec 122's current text and the pilot 1–3 assessment reports.

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

---

## Appendix §A6 — Open questions (originally Spec 122 "Appendix A")

Unresolved design questions as of 2026-08-23, retained verbatim.

## Appendix A — open questions

| # | Question | Why it is not answered here |
|---|---|---|
| **Q1** | Does `records_meta`'s **shallow merge** (`run-chain.js:889`) collide once the library emits a fixed key set? 13 top-level keys are taken `[READ]` | needs a key-collision census before S |
| **Q2** | Should the three §9 frozen contracts (§5.2) become **declared `emits` blocks** with a generated consumer assertion, retiring the hand-rolled `read*Contract()` HALT functions? | strongly indicated, but it changes 6 scripts' behaviour and wants its own WF |
| **Q3** | Which of the 8 gate mechanisms (§3.2) is the **canonical** `staleness.pending`? `enrich_parcels`' comps window is **clock-relative** (`:1085`), so no count- or watermark-based gate can ever skip it | a design decision, not a port — and the learnings report already refuted "mirror P11-2" |
| **Q4** | Do the ~600 `assert-global-coverage` profiling lines (§2.1) become **declared checks**, collapsing that file? | the single largest LOC swing in the corpus |
| **Q5** | Is `assert_engine_health`'s AST+REC hybrid still dispatched by **name prefix** (`run-chain.js:544-550`), and does the descriptor's `archetype` retire that? | renaming a step currently changes its runtime behaviour `[READ]` |
