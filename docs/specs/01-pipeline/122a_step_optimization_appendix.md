# SPEC 122a — Pipeline Step Optimization: Appendix (superseded drafts, evidence tables, revision logs)

**Status:** ACTIVE (non-normative — this file carries no rulings of its own, see Governance below; the status
line exists only so `scripts/generate-system-map.mjs`'s `/^\*\*Status:\*\*\s*(.+)$/m` match does not silently
default this file to `'Done'`, added 2026-09-10).

> Sibling of `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (Spec 122). Created 2026-08-28 per the operator's intelligibility ruling: Spec 122 was growing unreadable, so appendix-grade material — superseded drafts, long evidence tables, generated revision logs, the historical ratification checklist — moved HERE, never deleted. Each section below states which Spec 122 location it was moved from; each original Spec 122 location keeps a one-line pointer back.

**Governance:** this file carries no rulings of its own and decides nothing. Spec 122's dated `R-A..R-F` block and its R1–R6/V1–V7 tables remain the live rulings; where anything below conflicts with current Spec 122 text, Spec 122 governs (it is the live standard; this is history).

---

## Appendix §A1 — The coverage-audit refutation (moved from Spec 122 §1) — superseded 2026-08-23, closed by V1–V7/R2

This callout originally sat at the top of §1 ("THE STANDARD STEP") and blocked the 18-category contract from being frozen. The six vocabulary conflicts it found were adjudicated by operator rulings V1–V6 (round-2 ratification, see Spec 122's top rulings tables) and encoded directly in `step.schema.json` per R2. ~~The categories now stand at 18 (Spec 122 §1.3).~~ **CORRECTED 2026-09-10 (measured): 20** (`step.schema.json.required.length`, per Spec 122 §1.3's own 2026-09-09 amendment — `invariants`/`plausibility` joined between `checks` and `override`). Retained verbatim below as the historical record of what the audit found.

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

### 3.0b Write discipline — pointer (added 2026-09-10, restoring a dangling forward-reference)

**`§3.0b` was cited from the day Spec 122 was created (`aeb5703d`, 2026-08-23 — see the file's own top-of-file category table, row 3/17) but a literal `### 3.0b` heading was never authored under `## 3.` — the census that authorized this task's checker found it as a 21-site dangling citation; `git log -S "3.0b"` over Spec 122's full history confirms no such content ever existed to "restore" in the literal sense (checked, not assumed). The topic it named — the write-discipline class taxonomy, "the 13 measured classes" — DOES exist today, just under a different, later heading: Spec 122 §1.4 (`outputs.write_discipline`, now 15 classes per the 2026-09-09 correction). This sub-heading exists so every `§3.0b` citation resolves to something real rather than staying dangling.**

Full text: Spec 122 §1.4.

### 3.0e Chain sharing — pointer (added 2026-09-10, restoring a dangling forward-reference)

**Same shape as §3.0b above — cited from creation (`aeb5703d`) with no literal `### 3.0e` heading ever authored. The topic ("is this step shared across chains, and what varies by chain") lives today in Spec 122 §1.8's concern index, row 34 ("Chain sharing").**

Full text: Spec 122 §1.8 (concern index, row 34).

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


---

## Appendix §A7 — Operator rulings R-A..R-R (moved from Spec 122 §top-of-file rulings table) — HISTORICAL, 2026-09-10

Moved from Spec 122 — R-J's own words: "Spec 124 §5 is the authoritative rulings register going forward; this table remains as history"; 15 of 18 rows already read "Full text: Spec 124 §5".

~~The heading below reads "R-A..R-R"~~ — **CORRECTED 2026-09-10 (measured):** by the time of this move the live table already held R-A through R-O plus **R-R, R-T, R-W** (R-S was never written, R-U/R-V/R-X/R-Y/R-Z landed directly in Spec 124 §5, never here) — the heading's own "..R-R" was already stale before this move, not something the move itself caused. Spec 124 §5 reaches **R-Z** (+R-K.1/R-K.2); the next ruling id anywhere in the estate is **R-AA** (Spec 124 §5, this task's own R-AA row). The heading text below is preserved verbatim per this move's own content-hash guarantee — corrected here, in the mutable bridging note, never in the frozen block.

~~The R-K row below says `converted.json.pending` names a not-yet-converted step FILE~~ — **CORRECTED 2026-09-10 (measured):** `converted.json` has no `.pending` sibling file; `pending` is a KEY **inside** `scripts/steps/_schema/converted.json` (`converted.pending[]`, currently 1 entry: `scripts/enrich-parcels.js`, stage `shape_clean_pending_recapture`). Same "frozen block, corrected in the bridging note" discipline as the row above.

## Operator rulings R-A..R-R (2026-08-28/29, post pilot 3 cutover `68b8e361`; R-K..R-O post pilot 4 cutover `903fe5a7`; R-R post pilot 5, WF1 "Spec 123 integrated validation") — ✅ ACCEPTED

Policy frame: §1.2a "nothing hidden" + McDonald's standardization — declare everything, fail loudly, externalize tunables, closed vocabularies, one place per concept, machine-checkable. **These amend the sections named; where older text in this spec conflicts, these govern.**

| # | Ruling | Amends |
|---|---|---|
| **R-A** | **Retirement of a tunable is a declaration, never a live registry row.** A tunable EXISTS iff declared in `config.logic_variables[]` AND consumed via `ctx.config.<name>`/a `*_from_config` field — retiring it is a declaration (`config.retired: [{name, since, why, ledger}]`), never deletion of the seed row (an operator-editable knob with zero effect is a FALSE AFFORDANCE — pilot 3's `link_massing_grid_degrees` "RETIRED KNOB" seed row was removed at commit 9). `retired ∩ logic_variables = ∅`; a retired name in no seed, no `GlobalConfigCard` GROUP, no `ctx.config` read; a retired name still holding a live `logic_variables` DB row is a WARN audit row `retired_var_row_present` until an operator deletes it — **the runtime WARN reuses `scripts/lib/step/config.js`'s existing declared-names presence query, widening its `$1` array to declared ∪ retired; no new query path.** `config: "none"` stays legal only for a step that has never declared any variable, live or retired; a step with retired-only vars keeps an object `config` with `logic_variables: []`. Pilot 3: `config.retired = [{name: link_massing_grid_degrees, since: 2026-08-28, why: "JS-fallback grid span; path retired A-8", ledger: LM-D7}]` | §1.2a P4 · `config` category (§1.0/§1.3, concern 33) |
| **R-B** | **Interrupted retraction — recovery must be TRUE, not decorative.** Measured 2026-08-28: a `link_massing` forced FULL killed mid-rebuild left `parcel_buildings` at 29,330/520,492 rows; the next run's gate read "unchanged" → incremental → the hole persists, while the descriptor declared `recovery.resume: "checkpoint"` — FALSE. Every `outputs.writes[]` entry with `retract_when: full_only` (or `retract: "all"`) REQUIRES a declared `recovery.interrupted` ∈ `{force_full_on_next_run, none(+why)}` — a **NEW schema field on `recovery`** (`step.schema.json` amendment); `"none"` is a WARN in conformance. **Mechanism (lands at pilot 4):** the staleness gate's prior-run reader is widened to also detect a `crashed` or stuck-`running` `pipeline_runs` row more recent than the last `completed` row for this producer; if found, mode resolves FULL regardless of code/data signals (`full_mode_reason: "recover_interrupted_retraction"`, INFO audit row). **No new column, table, or marker** — the `running` row is already committed OUTSIDE the retraction transaction (a marker inside it would roll back on kill). Declared residuals: (1) the permits chain runs no `reconcile` step, so a permits-chain kill leaves the row `running` until the reaper; (2) the golden harness stands in for `run-chain` and opens no ledger row, so a harness-side kill leaves no row at all — a declared test-harness limitation. Until the reader lands, pilot 3's descriptor must be TRUTHFUL: `recovery.resume: "none"` (checkpoint is false today), `recovery.interrupted: "force_full_on_next_run"` with the pending-gap declaration; Spec 56's operator line (manual forced re-run) stays as the interim | `recovery` category (§1.0/§1.3, concerns 21b/35) · `outputs.writes[].retract`/`retract_when` |
| **R-B (runtime reader) CLOSED 2026-08-29** | `LW-D20`/`LG-19`. `staleness.detectInterruptedRetraction` (scoped to `recovery.interrupted:"force_full_on_next_run"`, `own` ledger slugs only) + `selectMode`'s new unconditional branch (`reason:"recover_interrupted_retraction"`), wired into `runCascadePhase`/`runLinkPhase`. Two bugs a LIVE kill-and-rerun proof against `link_wsib` found (neither visible from reading the code): (1) a step's OWN just-opened `running` row self-triggered on every run until excluded by `ownRunId`; (2) the check was unreachable whenever `ledgerGatedSkip` would otherwise SKIP, fixed by checking it BEFORE the gate and folding it into `bypassed`. Live proof: killed a real `LINK_WSIB_FORCE_FULL=1` run 5s in; the next plain invocation resolved `FULL (recover_interrupted_retraction)`, `gated_skip:false`, ran the real repair to completion (631.5s, 2 iterations, 548 rows relinked, before-image written per R-M), `verdict:PASS`; post-state verified consistent (`wsib_registry` 121,116 rows, `entities.is_wsib_registered` 301). Locked fast (fake-pool, `step-library.logic.test.ts`) and against real Postgres (`staleness-interrupted-retraction.db.test.ts`), both suites naming the two bugs as regression cases. Full record: pilot 4 assessment §R addendum | Spec 124 Rule 12 / §5 R-B |
| **R-C** | **Differential is a mechanical gate — the batching precondition.** The golden capture is a LOCKFILE: `capture-step-golden.js` stamps `source_fingerprint` = sha256 over the step file + descriptor + notes + compute module (sorted, LF-normalized) into every capture. A conformance test (`src/tests/golden-fingerprint.infra.test.ts`) asserts, for every `converted.json` step, that `docs/reports/golden/<slug>/post/*.json` exist for every declared invocation (derived from manifest chains + `chain_args` + standalone) and each capture's `source_fingerprint` equals the current one. Editing a converted step's compute/descriptor without re-capturing → RED in `npm run test` (pre-commit hook); **a commit-message claim of "differential green" is no longer evidence.** Capture files are matched to the derived invocation set by each capture's own recorded chain/args fields, **never by filename** (filenames are scenario labels, e.g. `sources-full-forced-2.json`). Every file under `.../post/` must carry the current fingerprint — a stale extra scenario capture fails the gate and must be re-run or deleted (git keeps history). A capture whose `git_head` could not be resolved is a **hard failure** of the harness, never recorded as "unknown." Pilots 1–3's captures must be re-stamped by re-capture (no retroactive restamp without execution). **R-C's mechanism lands BEFORE the R-A/R-B/R-D descriptor edits, which ship with fresh captures in the same commit** | §5.3 (golden-master differential) · Spec 123 §6 G8 |
| **R-D** | **Cloud parity is a chain-start assertion — narrowed to where `assert_schema` actually runs.** `assert_schema` gains one declared check `declared_logic_variables_present`: for every converted descriptor, every `config.logic_variables[].name` has a `logic_variables` row; FAIL (chain halts) naming the remedy `node -r dotenv/config scripts/seeds/apply-logic-variables.js`. It fires in every chain that runs `assert_schema` today — **permits** and **coa** (1st step) and **sources** (2nd, after `reconcile`, the ratified §7.4 A3 head) — **it is NOT chain-start-universal**: `entities`, `wsib` and `deep_scrapes` run no `assert_schema`; LM-D15's mid-step throw remains the **sole backstop** there until a WF adds `assert_schema` to them (filed as a followup). The check declares `inputs.reads.tables: [logic_variables]` and `blocking: true` (`when: "pre"`) — a FAIL without `blocking` does not halt a chain. `scripts/seeds/apply-logic-variables.js` becomes a declared deploy-path step (runbook + §1.2a P4 addendum below). LM-D15's mid-chain throw stays as the second fence | §1.2a P4 addendum · deploy/runbook line |
| **R-E** | **G7 mutation clause (Spec 123).** Replace the unsatisfiable "class-A: mutation ≥80% on covered code" with the enforced standard: every class-A behaviour has a both-directions lock proven RED then GREEN at the designed assertion (Spec 119 tier "Behaviorally red-first"), listed in the assessment report's G7 row by test id. Mutation testing over `scripts/lib/compute/**` is filed as a bounded followup spike (Stryker's `mutate` is currently scoped to `src/features/leads/lib/`, 3 files), **not a gate**. Claim 214 (A.16) in `scripts/violations/plan-claims.mjs` states the retired ≥80% mutation text; it is amended and `docs/reports/generated/123-claim-plan.md` regenerated in the same commit | Spec 123 §6 G7 |
| **R-F** | **Standing Reflection gate, starting pilot 4.** Every pilot's assessment report gains a required `§R Reflection — low-confidence items and recurring issues` section, written AFTER cutover and BEFORE the next pilot's plan, with two closed tables: (a) LOW-CONFIDENCE — item · why confidence is low (measured evidence) · what would raise it · owner (pilot N+1 / library / spec / followup); (b) RECURRING/STANDARD-SHAPING — issue · first seen (pilot, commit) · expected to recur in which archetypes · resolution (`RULED (id)` / `DEFERRED-TO` pilot N+1 with a declared pending gap / `FOLLOWUP (id)`). Every DEFERRED item MUST appear in the next pilot's active-task plan as a named step, not prose. Spec 123 gains gate **G9 "Reflection"**. Pilot 3's own §R is a placeholder pointer to this block (seeded from R-A..R-E) | §8 (pilot procedure/commit ledger) · Spec 123 §6 |
| **R-G** | **Presence vs validity split for tunables (rewrites §1.2a P4).** PRESENCE of a declared variable's `logic_variables` row is always FAIL (LM-D15, R-D); VALIDITY is per-variable via the closed `on_invalid` enum — `fail` MANDATORY for a verdict- or write-affecting variable, `default`/`clamp` allowed otherwise, each with a `why`. **Full text now lives in Spec 124 §2 Rule 3** — this row is a pointer, not the register | §1.2a P4 (moved to Spec 124 §2 — Rule 3) |
| **R-H** | **Severity selection for a standing non-zero metric.** Spec 48 §4.9 / `tasks/lessons.md:117` stands: WARN + a declared, machine-observable retighten condition — never FAIL, never INFO-by-taste. INFO only for a purely descriptive counter no threshold could bound, declared in `checks[].why`. LM-D6/LM-D11 re-dispositioned OPEN → WARN+retighten, carried to pilot 4. **Full text: Spec 124 §2 Rule 10 addendum** | `docs/reports/defect-ledger.md` LM-D6/LM-D11 (moved to Spec 124 §2 — Rule 10 addendum) |
| **R-I** | **Four pilot-practice promotions to standing policy.** (1) a phase-reordering ruling must re-derive every "before X" guarantee (already Spec 124 Rule 11); (2) a banned/grandfathered exception needs a dated, SHA-anchored, named-approver ledger entry (already Spec 124 Rule 9); (3) discoverer ≠ adjudicator restated as a policy rule, not just a procedure step (Spec 124 §4); (4) a document move/consolidation is verified by a line-set diff before commit (Spec 124 §4). **Full text: Spec 124 §4** | Spec 123 §7.1 (moved to Spec 124 §4) |
| **R-J** | **Spec 124 is the standalone home of this policy.** §1.2a below becomes a pointer; Spec 124 §5 is the authoritative rulings register going forward; this table remains as history | §1.2a (whole section, see below) |
| **R-K** | **Stage-gated tests are declared data, not a code skip.** `converted.json.pending` names a not-yet-converted step file; every genuinely-red claim is wrapped `it.fails(...)` with a "flips at commit N" comment; conformance ties every `it.fails` under `src/tests/steps/<slug>/` to its `pending` slug (`pending ∩ converted = ∅`); cutover deletes the `pending` entry and flips the tied `it.fails` to plain `it()` in the SAME commit. Commit 7 (`69de8a13`) declared `link_wsib`'s `pending` entry; commit 9 (`903fe5a7`) deleted it. **Full text: Spec 124 §5** | §4.6 |
| **R-L** | **A destructive-repair step's autonomous mode-`full` trigger is a `chain_args` argv declaration, not a bare corpus check.** `manifest.json`'s `link_wsib.chain_args: {"sources": ["--full"]}` makes `explicitFull` structurally true only on `sources`, so `selectMode` resolves `full` off the real corpus-change signal there; `permits` (no `--full`) can never resolve `full`. **Full text: Spec 124 §5** | `staleness`/mode-select |
| **R-M** | **Destructive retractions require a declared before-image.** New `recovery.before_image` (`generated`\|`none`+`before_image_why`), mirroring R-B's shape but recording the AUDIT TRAIL rather than the crash-recovery posture — the library mirrors the write plan's own scope/keys/columns as a read-only SELECT, written before the retraction on the same transaction client, unwrapped by try/catch. **Full text: Spec 124 §5** | Rule 12 (`recovery`) |
| **R-N** | **T2 link-rate denominator is the entity population, not the source-row count.** `link_rate_warn` moved from `wsib_registry` ROWS to `entities.is_wsib_registered=true`/total entities — a single magnet's rows no longer inflate a row-based ratio; the floor value is unchanged, now validated against measured entity-level truth. **Full text: Spec 124 §5** | Rule 3 worked example |
| **R-O** | **A matcher's accuracy is a sampled precision/recall number against a before-image, never a predicate's self-agreement or a link rate.** `tier3_token_overlap_pass_pct` at 100.00% coexisted with a 60-row sample measuring up to 46.7% genuine precision (pilot 4 §8d) — resolved by hardening the declared stopword/token mechanism, not a new bypass tunable. **Full text: Spec 124 §5** | Rule 10; MATCHER accuracy doctrine |
| **R-R** | **Validation is integrated and enforced, never a separate track.** `scripts/analysis/step-validate.mjs` (`npm run step:validate`) is the ONE command that runs validateDescriptor, the shape gate, the per-step vitest suites, the golden-capture/fingerprint check, and computes the Spec 123 §6 G0–G9 scorecard plus the Spec 124 policy coverage matrix — from artifacts, never hand-typed. Wired into `.husky/pre-commit` (`--fast`) and `.husky/pre-push`, asserted by `step-conformance.infra.test.ts` (a stale or missing scorecard block is red), and is Spec 124's new **Rule 13**. **Full text: Spec 124 §5** | Spec 123 §6/§7; Spec 124 §2 Rule 13 |
| **R-T** | **Cross-cutting programme promises are declared data, generated, and gated — never re-discovered by a manually-commissioned inventory.** Six pilots shipped their own archetype's contract, but promises owned by no single pilot (the eight-archetype coverage claim, the four Spec 120 §6 state tables, "freeze after the eighth" itself) had no owner and no gate — found only by a full grounding pass, the exact "found by noticing" failure class this programme exists to retire elsewhere. `scripts/steps/_schema/programme-items.json` (schema: `programme-items.schema.json`) declares every such item — `status`, `evidence`, `owner`, and a `gate` of `batching_prereq` \| `cutover_prereq` \| `nice_to_have` — generated to `docs/reports/generated/122-programme-backlog.md` (`npm run programme-backlog`), drift-guarded by `src/tests/programme-backlog.infra.test.ts`, and enforced: a slug already in `converted.json` may not carry an unmet `cutover_prereq` item naming it (proven both directions with a fixture), and `step:validate`'s hook fast path prints the live "blocks batching: N" count on every run. **Full text: Spec 122 §10.3; Spec 124 §5, §8, §9** | §8.2 (freeze mechanism); §10 (sequencing) |
| **R-W** | **Compute must not branch on PostGIS availability.** `hasPostGIS`/`pg_extension`/`postgis_version` (identifier, property access, or a string/SQL fragment) and a `try`/`catch` around a PostGIS-only call are the same anti-pattern — a second, silently-selected algorithm inside compute; `guards.requires: {kind: "extension", name: "postgis", on_missing: "fail"}` is the only legal form. Third application of the `link_massing` A-8 / `compute_centroids` A-1(a) precedent, filed by the pilot 7 (`link_parcels`) plan's own A-1 ruling; enforced by a new ast-grep rule, `compute-no-postgis-branch`. **Full text: Spec 124 §2 Rule 2 addendum, §5** | Spec 124 §2 Rule 2 |

---


---

## Appendix §A8 — Concerns 41 and 15, discovery narrative (moved from Spec 122 §1.8) — HISTORICAL, 2026-09-10

Moved from Spec 122 — Discovery narrative for a table (the 49-concern index) that stays in 122; [MEASURED 2026-08-23], blame aeb5703d, untouched 18 days.

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


---

## Appendix §A9 — RE-FREEZE #1-#4 payment records (moved from Spec 122 §8.2) — HISTORICAL, 2026-09-10

Moved from Spec 122 — One-time R-E payment records for landed commits (64c45463, 7e75c50e, 819ccfdc); the mechanism (R-E lock) stays live in §8.2, only the paid-and-closed payment narratives move.

**⚠️ RE-FREEZE #1 — pilot 9 commit 7a (2026-09-04): `execution.shape` gains `"enrich"`, the ENRICHER profile gains `execution.phases[]`.** The first commit to spend `does_not_freeze`'s *"Additive fields carrying x-ruling"* clause with the R-E lock armed, and the concrete case §8.2's own escape clause anticipated (*"if any of the eight forces a contract change…"*). `enrich_parcels`'s five passes fit none of the eight frozen shapes: passes 1–4 share ONE `pipeline.withTransaction` while pass 5 streams on a SEPARATE connection AFTER that transaction COMMITs (Spec 78 §P3A.1 — a same-txn read of what passes 1–4 just wrote would be invisible), and **none of the seven frozen `phase_runners` orders contains a phase that runs after the step's own COMMIT.** So the enum gains a ninth value `"enrich"` (carrying its `x-ruling`, the Rule 1 / G-1 ratchet), and the ENRICHER profile gains `execution.phases[]` — a CLOSED, ordered per-pass array (`name`/`order`/`txn`/`writes_ref`/`scope`/optional `invalidator_ref`/`timeout_minutes_from_config`) required for that archetype alone, so the other seven profiles and all eight converted descriptors are byte-untouched. It exists because the step-level `staleness.scope` + `outputs.invalidates[]` pair answers for every pass AT ONCE — which is exactly how `enrich_parcels` pass 4's absent comps invalidator (`EP-D4`, Spec 78 §P3C.1's "standing limitation") stayed unexpressed while claim #54's ENRICHER arm read satisfied; per-pass, that gap becomes a reviewable `scope: "incremental"` with no `invalidator_ref`. **The price is paid in this same commit, as the mechanism demands:** `generate-schema-baseline.mjs --write` (G-1), `generate-template-freeze.mjs --refresh` (`schema_sha256` re-derived, `frozen_at` advanced; the ENRICHER row stays `proven: false` — it flips only when pilot 9's cutover registers `enrich_parcels` in `converted.json`), this amendment, §1.10's profile-table row, and a regenerated `122-vocabulary.md`. The runner (`runEnrichPhase`, LG-28), the descriptor and the compute land at **commit 7b** — commit 7 is deliberately SPLIT into schema/freeze half then port half, the `d7f1f983` (pilot 8) precedent.

**⚠️ RE-FREEZE #2 — pilot 9 commit 7b (2026-09-04): `plausibility[].count_field` (new, optional).** A second `does_not_freeze` payment inside the same nine-commit pilot, this time NOT touching an `x-frozen` value — the EP-D8 small-N caveat (`comp_fsi_p50` sourced from < 3 non-null comps, Fold C2) needs a plausibility row to report ITS OWN count under a named metric key, and the closed `bound` grammar (`viol`/`pct`/`pop`/`ratio`/`value_min`/`value_max`) has no field for an arbitrary metric name — every prior plausibility row's own `id` already WAS the reported metric, which does not hold for a row whose bound is a sample-size caveat on a DIFFERENT field. `count_field` is nested inside the `plausibility` item definition, not a direct top-level category field, so it does **not** trip the G-1 ratchet (`schema-baseline.json`'s tracked grain is 18-category/direct-field only — confirmed live, `plausibility.*` carries zero tracked entries, `generate-schema-baseline.mjs --check` reports 0 new fields). It **does** trip R-E regardless, because `template-freeze.json`'s `schema_sha256` hashes the whole schema file byte-for-byte, not merely the frozen surface — paid the same way RE-FREEZE #1 did: `generate-template-freeze.mjs --refresh` (`frozen_at` stays `64c45463`, i.e. commit 7a, since commit 7b had not yet landed when this ran) and this amendment. No `x-ruling` node is required on `count_field` itself (that annotation is G-1's own mechanism, and G-1 was never armed for this field); this paragraph is R-E's own price, a distinct clause from G-1's.

**⚠️ RE-FREEZE #3 — pilot 9 commit 7d/commit 2 (2026-09-04): `runEnrichPhase` (LG-28) lands, the 8-runner dispatch surface goes live.** The runner promised at RE-FREEZE #1 — `phase_order: [staleness.resolveOverrides, staleness.detectInterruptedRetraction, write.assertWritePrivileges, staleness.readPriorEmit, write.targetKey, preWriteGate, pipeline.withTransaction]` (`template-freeze.json`) — folds `staleness.detectInterruptedRetraction` UNCONDITIONALLY into `full` (Rule 12 reachability: this archetype has no `staleness.ledgerGatedSkip`/`selectMode` to fold into instead, `step-validate.mjs`'s `runnerReachability` gains a third recognized shape for it), issues per-shared-phase `SET LOCAL statement_timeout`/`lock_timeout` (reverting each COMMIT/ROLLBACK, never leaking onto a later pooled checkout), and runs the post_commit phase on a DEDICATED connection inside its OWN transaction (Fold B2 — a live `SET LOCAL` needs an open transaction to bind to; `SHOW statement_timeout` on that session is the regression lock's own assertion, never a config-value inspection). **A generator side-effect, found at commit 7d and CLOSED at commit 7e/1 (2026-09-04), not left as a standing limitation:** at commit 7d, `generate-template-freeze.mjs`'s `runnerRanges` bounded each runner's phase_order extraction by the NEXT `async function run\w+(` match in the file — a `run\w+`-named function is not a real runner boundary, it is an accident of naming, and when no such function follows (or the next one is several non-"run" functions away), the range silently swallows whatever sits in between. `runRecorderPhase` was, until commit 7d, the LAST such match, so its own frozen `phase_order` had (incorrectly) inherited `write.executeSetBasedClear`/`write.executeUpsertBatch` from the UNRELATED `executeOrderedWrites` function that follows it in file order; commit 7d's refresh corrected `runRecorderPhase` by coincidence (its range now ended at `runEnrichPhase`'s own start) while `runEnrichPhase` — the new LAST `run\w+` match — inherited the identical artifact in turn, exactly as commit 7d's own note here predicted ("a KNOWN, self-correcting limitation of the boundary heuristic … fixed the same way for whichever runner is added next"). Commit 7e/1 fixes the HEURISTIC ITSELF rather than waiting for a ninth runner to trip it again: `runnerRanges` now bounds every runner by the next TOP-LEVEL DECLARATION OF ANY KIND (`^(?:async )?function \w+\(`, not merely a `run\w+`-named one) — every top-level declaration in `index.js` starts at column 0, so this bound is both correct (it stops at `executeOrderedWrites` itself, a real function, rather than skipping past it) and a strict narrowing of the old one (the new boundary set is a superset of the old, so ranges can only shrink), which is why regenerating leaves the other seven runners' `phase_order` byte-identical and fixes only `runEnrichPhase`'s: `[staleness.resolveOverrides, staleness.detectInterruptedRetraction, write.assertWritePrivileges, staleness.readPriorEmit, write.targetKey, preWriteGate, pipeline.withTransaction]` — its real 7-call sequence, no `executeOrderedWrites` calls attached. `frozen_at` advances to `7e75c50e` (commit 7d's own second half, the last commit before this refresh ran); `archetype_profiles`'s ENRICHER row stays `proven: false` per RE-FREEZE #1's own stated condition — it flips only at pilot 9's cutover (commit 9), not here.

**⚠️ RE-FREEZE #4 — pilot 9 commit 8 P5 (2026-09-08): `definitions.counter` gains an optional `why` field.** `enrich_parcels`'s `counters.records_updated` (`{source:"compute.records_updated_aggregate", scoped_by:"step"}`) is the estate's first counter whose own `scoped_by:"step"` does NOT actually count every write target that contributes rows: `computeAggregateRecordsUpdated` (`scripts/lib/compute/enrich-parcels.js`) deliberately EXCLUDES pass 4 (comparable-builds) from its distinct-union of pass 1/2/3/5 ids — a §11 counter-scoping decision (a row pass 4 alone touches is not "genuinely updated" work, since EP-D1/B4.5 PINNED that write's own guard as absent for most of this pilot, and pass 4's own `idempotent_rerun` only reached `"zero_writes"` at commit 8 P2/P3) — carried verbatim from the legacy script's own docblock (`enrich-parcels.js:1820-1829` pre-conversion), never merely an omission. `counter`'s closed object shape (`source`/`scoped_by`, `additionalProperties:false`) had no field to STATE that exclusion, so it lived only in source-code comments, invisible to a descriptor reader. `why` mirrors the existing `guard_why`/`idempotent_rerun_why` shape (`$ref: "#/definitions/why"`, `{text, liveness}`), OPTIONAL — every other converted step's counters need no such note (their `scoped_by` genuinely covers every contributing target) and are byte-untouched. Nested inside the `counter` object definition, not a direct top-level category field, so it does **not** trip the G-1 ratchet (confirmed live: `generate-schema-baseline.mjs --check` reports 0 new fields) — the same RE-FREEZE #2 precedent (`plausibility[].count_field`). Paid the same way: `generate-template-freeze.mjs --refresh` (`frozen_at` advances to `819ccfdc`, commit 8 P4, the last commit before this refresh ran) and this amendment. `enrich-parcels.descriptor.json`'s `counters.records_updated` gains the `why` in the SAME commit.

---

<!--
FOR THE LANDING ORCHESTRATOR: insert this paragraph under Spec 122
(docs/specs/01-pipeline/122_pipeline_step_optimization.md) Appendix §A9
("RE-FREEZE #6 — EP-D17 maintenance executor, 2026-09-10"). Leave a short
stub/pointer line in §8's own RE-FREEZE list ("RE-FREEZE #6 — see Appendix §A9")
rather than the full paragraph inline, matching the §8-declutter convention the
parallel commit-9 work has already applied to RE-FREEZE #1-#4.

This WF3's own patches (02_c1_c2b_c4_combined.patch) do NOT touch Spec 122 §8 or
create an Appendix §A9 — by explicit operator instruction, to avoid colliding
with the parallel restructuring. Land this paragraph (and the §8 stub) as ONE
commit, in the SAME commit that lands the schema/template-freeze changes below,
so R-E's "a re-freeze must be paired with a spec text change in the same commit"
rule reads GREEN at landing. It reads RED in this WF3's own patches taken alone
(`node scripts/steps/_schema/generate-template-freeze.mjs --check` on patch
02's tree, in isolation) — measured and disclosed, not fixed here, because the
fix IS this file's insertion.
-->

**⚠️ RE-FREEZE #6 — WF3 EP-D17 (2026-09-10): `execution.maintenance`'s `txn_scope`
conditional widens to admit `"step"`.** Numbered #6 regardless of landing order
relative to any parallel `--refresh` this same day (pilot 9 commit 9's own
cutover) — `frozen_at`/`schema_sha256` are re-derived by whichever `--refresh`
runs LAST against the merged tree, so this paragraph documents the CONTENT of
the price paid, not a claim about which numbered refresh's hash survives.

Before this WF3, `step.schema.json`'s own conditional narrowed a
maintenance-declaring step's `txn_scope` to `["statement", "batch", "none"]` —
reasoning stated inline as *"a step-scoped transaction cannot contain a
VACUUM"* — which structurally forbade `enrich_parcels` (`txn_scope:"step"`)
from ever declaring `execution.maintenance`, the field's own P11 grounding
(this WF3's Step 0) having already found it REQUIRED-and-frozen but with
**zero executors anywhere in `scripts/lib`** (all 8 converted descriptors said
`"none"` because nothing else was buildable). Operator structural ruling
(2026-09-10, "we don't want scope creep — this gap should be closed") decided
path (iii) IN this WF3 rather than deferring to a follow-on WF2: the
conditional's OWN stated reasoning is narrower than its enum encoded — the
constraint is that the VACUUM STATEMENT must never run inside an open
transaction, not that the STEP'S OWN `txn_scope` declaration must exclude
`"step"`. `scripts/lib/step/plausibility.js` gained a real executor
(`runMaintenance`, wired from `scripts/lib/step/index.js` — as of output-panel
fix F2, BEFORE the run-end `invariants[]`/`plausibility[]` checks, not after;
for an ENRICHER that means AFTER passes 1-4's shared transaction has committed
and pass 5's post_commit write is done) that always issues its
`VACUUM`/`ANALYZE`/`VACUUM (ANALYZE)`/`REINDEX TABLE` statement autocommit on
its own DEDICATED `pool.connect()` client (never the shared `pool.query()`
path), bound by its own declared ceiling (`${table}_maintenance_timeout_minutes`,
output-panel fix F5) — satisfying the conditional's real intent regardless of
what `txn_scope` says.

**Measured diff:** one line — the `then.properties.txn_scope.enum` array
widened from `["statement", "batch", "none"]` to `["statement", "batch",
"step", "none"]` — plus an expanded `description` string on the SAME
conditional node, plus a one-line correction to the schema's top-level
`x-categories["R6-maintenance"]` summary string (previously read as an
unqualified "VACUUM cannot run inside a transaction" ban; now states the
`statement|batch|step|none` narrowing explicitly, since `"step"` is now legal
provided the executor honours the real constraint). No other schema field
touched.

`enrich_parcels` is the first (and, as of this WF3, only) step to declare
`execution.maintenance` (`vacuum_analyze` on `parcels`, triggered by the same
`parcels_dead_tuple_ratio_warn_max` logic variable the descriptor's own new
`parcels_dead_tuple_ratio` plausibility check reads — one measurement, one
threshold name, two consumers that cannot silently disagree, per naming
convention).

Widens an existing frozen enum VALUE SET inside an `allOf` conditional's
`then` clause — it declares no new field, so `generate-schema-baseline.mjs
--check` (G-1's own tracked grain, confirmed live: 18/20-category direct-field
only) reports **0 new fields**, unlike RE-FREEZE #1/#3's genuinely new
top-level fields; closer in kind to RE-FREEZE #2/#4's "does not trip G-1"
shape, though those were nested leaf-definition additions and this is a
direct `execution` conditional edit.

**Paid the same way as every prior RE-FREEZE**, with two corrections against
an earlier draft of this paragraph (both measured, not assumed):

1. `generate-template-freeze.mjs --refresh` re-derives `frozen_at`/`schema_sha256`
   against the tree at the time it runs. Measured on THIS WF3's own tree: the
   refresh ALSO absorbed an UNRELATED, already-landed phase_order change — the
   ENRICH runner's frozen `phase_order` gained `pipeline.withAdvisoryLock`
   between the entries for `preWriteGate` and `pipeline.withTransaction`. This
   call was added to `scripts/lib/step/index.js` by commit `7242cc65` (EP-D16,
   landed in the base tree this WF3 branched from) — genuine, correct,
   pre-existing code that had simply never been swept into a `--refresh` before
   this one ran. Disclosed explicitly rather than silently absorbed under this
   WF3's own change: the `phase_order` diff a landing reviewer sees is NOT
   entirely EP-D17's own doing.
2. `docs/reports/generated/122-vocabulary.md` genuinely regenerates with a
   ONE-LINE diff, at the `R6-maintenance` row — the corrected
   `x-categories["R6-maintenance"]` summary string above (an earlier draft of
   this paragraph claimed a regeneration "paid the price" with no visible
   diff at all, because the FIRST regeneration attempt only widened the
   conditional's own enum/description, which the vocabulary generator does not
   render for a nested `allOf` conditional — only the top-level `x-categories`
   summary string renders, and only the SECOND schema edit, correcting that
   summary string, produced a real, checkable diff).

Also paid: the pinned `src/tests/step-schema.logic.test.ts` R6 assertion
flipped (it now asserts `"step"` IS present, alongside the three pre-existing
values, rather than absent).

## Appendix §A10 — The claim that replaces #145 (moved from Spec 122 §6) — HISTORICAL, 2026-09-10

Moved from Spec 122 — Claim-register bookkeeping (Spec 120 claim #145 vs its replacement) — a one-time disposition record, not live standard text.

#### The claim that replaces #145

Spec 120 claim #145 — *"the DAG is derived from `writes`, never declared"* — **is dead here** (§8): 122 keeps `manifest.chains`.

> **Replacement claim:** each descriptor's `reads`/`writes` must be **consistent with** manifest order — a step may not read a table written by a later step in the same chain. **Violation:** reorder two steps so a reader precedes its producer → the ledger check reds.

This is a *new* obligation the runner did not carry, because under a derived DAG ordering could not disagree with reality. Here it can, so it must be checked.

---


---

## Appendix §A11 — What this architecture creates that the runner did not (moved from Spec 122 §10b) — HISTORICAL, 2026-09-10

Moved from Spec 122 — Mis-nested under §11 (Known Failure Modes) at 0 citations; a comparative rationale versus the pre-Spec-122 runner, not live standard text.

### 10b. What this architecture creates that the runner did not

1. **Enforcement is distributed** — a loader is one gate; lint + conformance + library validation are three, and three can each be individually weakened. Spec 120 §12b.5's *"enforcement must be harder to change than the enforced"* carries more weight here, and SH6 (Violation Suite as a separate root under CODEOWNERS) becomes load-bearing rather than tidy.
2. **The step file is executable**, so every descriptor-consuming tool depends on A1 holding. If A1 is overridden, re-read §5 entirely.

---
