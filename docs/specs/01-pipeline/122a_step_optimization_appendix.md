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

**⚠️ RE-FREEZE #5 — pilot 9 commit 9 cutover (2026-09-11): the ENRICHER profile is proven; `frozen_at` advances.** Filed after #6 in this file because #6 (EP-D17) LANDED first (`d9a90035`, 2026-09-11) while this refresh is the cutover commit of the same day — the numbering follows the FREEZE-1 plan's ledger ("RE-FREEZE #5, not #4 — #4 is already spent at commit 8 P5"), not the landing order, exactly as #6's own paragraph anticipates. Content of the price paid: `scripts/steps/_schema/template-freeze.json` `archetype_profiles[ENRICHER]` re-derived from `{shapes:[], runners:[], first_step:null, proven:false}` to `{shapes:["enrich"], runners:["runEnrichPhase"], first_step:"enrich_parcels", proven:true}` — the first (and, by `frozen_after_pilot: 9`, last) archetype whose `proven` flag flips at a cutover rather than at a library WF; `batching_prereq_snapshot` shrinks 2 → 1 (`STD-7` → BUILT with the CLOUDPARITY evidence — GH run 34506962436, `pipeline_runs` row 4588, all 9 converted slugs present, none skipped — leaving `FREEZE-1` as the sole open precondition, which its own two-phase WF closes next). `schema_sha256` is UNCHANGED by this refresh (no `step.schema.json` edit), so `checkFrozenSchemaConsistency` returns green at its first branch and never consults §8 — the Spec 122 §8 pointer line exists because §8's house rule and Spec 124 §R-8's same-commit spec-diff rule require it, not because the checker would have caught its absence (the FREEZE-1 plan names this exact blind spot). `src/tests/template-freeze.infra.test.ts`'s pin flips in the same commit (`enricher.proven` false→true, `first_step` null→`enrich_parcels`, every profile proven) — the lock reads RED against the pre-refresh artifact and GREEN after, both directions measured before the commit.

**⚠️ RE-FREEZE #7 — warn_limit (2026-09-11, operator ruling for batch1 I1, `.cursor/batch1_i1_assert_global_coverage_active_task.md` Fold B).** `assert_global_coverage`'s own conversion (C4 batch 1, step I1) halted at commit 7 on a measured library gap, not a discovery this WF invented cold: 183 of its census rows (`coverageRow`/`calibratedRow`/`externalRow`) are 3-tier PASS/WARN/FAIL coverage checks with BOTH thresholds carried as logic variables, but `resolveLimit` (`scripts/lib/step/verdict.js`) only ever substituted `limit_from_config` into a STRING-form `limit`, and the `{warn, fail}` object form (already a two-tier, higher-is-worse bound) is never config-substituted at all — so neither existing mechanism could express a config-driven 3-tier PASS/WARN/FAIL bound on one metric. The estate's only other precedent for a two-severity metric — a second `checks[]` entry per metric (`enrich_parcels`'s `_warn`/`_fail` pairs) — would have DOUBLED all 183 rows and broken `FreshnessTimeline.tsx`'s metric-name lookups (two differently-named rows for one logical metric, where the consumer expects one).

**RULED:** a library WF2 lands FIRST, ahead of `assert_global_coverage`'s own commit 7 resuming on top of it. `checks[]` gains two OPTIONAL fields: `warn_limit` (the SAME frozen string bound grammar as `limit` — `definitions.bound`'s string arm, byte-for-byte duplicated onto `warn_limit`'s own schema node rather than `$ref`'d, because `bound` itself carries `x-frozen: true` and this ruling does not touch it) and `warn_limit_from_config` (the same substitution semantics as the existing `limit_from_config`, OPERATOR RULING A-4). Evaluation, in `scripts/lib/step/verdict.js`'s `checkRow`: `limit` ok → PASS; else, if `warn_limit` is declared and its own `evaluateLimit` reads ok → WARN; else the check's own declared `severity` (unchanged fallback). One audit row per metric — never two — with both thresholds config-substituted: `threshold` keeps rendering `limit`'s resolved value exactly as before (byte-for-byte when `warn_limit` is absent), and a NEW `warn_threshold` key appears on the row ONLY when the check declares a `warn_limit`, rendering that tier's own resolved value (Nothing Hidden: the value in force, not merely the fact a warn tier exists).

**Both directions locked** in `src/tests/step-library.logic.test.ts`: a check with no `warn_limit` reads identically to before (no `warn_threshold` key, same PASS/FAIL-only cascade); a check with a declared `warn_limit` reads PASS above `limit`, WARN between `limit` and `warn_limit`, and the check's declared severity below `warn_limit`; `warn_limit_from_config` substitutes the resolved config value into `warn_threshold` the same way `limit_from_config` already does for `threshold`. A `warn_limit` whose grammar is not the string arm (e.g. the `{warn,fail}` object form) is schema-rejected by `warn_limit`'s own `type:"string"` node — AJV fixture-proven RED. A `warn_limit` declared alongside an object-form `limit` is rejected by a new `checks[].allOf` clause (`if limit is object, then not required:[warn_limit]`) — the object form is already its own two-tier cascade, and stacking a second, textually-distinct mechanism on top of it would give one metric two independently-drifting warn definitions.

**Nested-field precedent, not a new top-level category:** `warn_limit`/`warn_limit_from_config` live inside `definitions.check` (an array-item shape referenced from the top-level `checks` category, itself `type:"array"`), the SAME nesting depth as RE-FREEZE #2's `plausibility[].count_field` and RE-FREEZE #4's `counter.why` — `generate-schema-baseline.mjs`'s `currentFields` walks only direct, OBJECT-typed top-level category properties (`objectBranches`), so an array-item's own nested field does not trip the G-1 ratchet (measured live: `--check` reports 0 new fields both before and after `--write`, matching the RE-FREEZE #2/#4 precedent exactly). `x-ruling:{rungs_tried, why}` is still carried on `warn_limit`'s own schema node, as a documentation convention (mirroring `order_guarantee`'s own nested-but-annotated precedent), not because G-1's baseline mechanism requires it here.

**Paid the same way as every prior RE-FREEZE:** `generate-template-freeze.mjs --refresh` re-derives `frozen_at`/`schema_sha256` against the tree at the time it ran, paired with this Appendix §A9 paragraph and the §8 pointer line, landed in the SAME commit (the R-E lock's own "a re-freeze must be paired with a spec text change in the same commit" rule). Spec 124 §5 gains register row **R-AD** (the next free letter after R-AC — Spec 124 R-Z's own register note: "the next ruling ... is R-AA, then R-AB, …" continues the same double-letter sequence).

**⚠️ RE-FREEZE #8 — the generic ENRICHER runner (2026-09-15, batch-2 Phase 0.10, `.cursor/wf2_enrich_runner_generic_active_task.md`).** `runEnrichPhase` was not an ENRICHER runner — it was `enrich_parcels` with a descriptor-shaped front door. Measured, not inferred: the Spec 58 §9/§11 contract read was `compute.readZoningContract(pool)` by literal name (a second enrich-shaped step dies at `TypeError: compute.readZoningContract is not a function` BEFORE its first phase); the Spec 122 §3.0b defer decision was `compute.computeDeferScope(pool, Number(config.enrich_parcels_defer_threshold_rows))`, whose NaN threshold made `scope_count >= NaN` false forever — the early return was dodged BY ACCIDENT, not by design; and the heartbeat/lock-timeout intervals were two more hardcoded `config.enrich_parcels_*` reads whose NaN silently disabled the ticker and the `SET LOCAL lock_timeout` alike (ER-D1, filed HIGH, Spec 48 §3.6 silence class — `last_heartbeat_at` NULL for a whole run with no warning, no audit row and no throw, latent only because ENRICHER had exactly one member).

**Content of the price paid.** Three new `execution.*` fields, each carrying `x-ruling{rungs_tried, why}` and each written into `schema-baseline.json` by the reviewed `--write` path (G-1, 92 → 95 fields): `heartbeat_minutes_from_config` and `lock_timeout_ms_from_config`, REQUIRED on the ENRICHER profile (Ask A2 ruled BOTH in one commit — `:2415` was the identical NaN class and splitting it leaves half a defect), and the optional, closed `enrich_hooks` object (Ask A1 ruled STEP-LEVEL, not per-pass: both hooks fire exactly once, before phase 1, so a per-pass home would declare a lifecycle the runner does not have). Resolution is LOUD — `Number.isFinite`, never `!x`, so a deliberate `0` still disables the ticker while a non-finite value throws above the lock; `startHeartbeatTicker` carries the same refusal at its own construction, which is where ER-D1's unit lock drives it. The `matched` duration key is derived from `identity.name` (`<slug>_duration_ms`), so no other ENRICHER inherits `enrich_parcels`' telemetry key name.

**Reachability growth, not behaviour change.** The enrich path reached NO write executor at all before this row — `write.` appeared in `runEnrichPhase` only as `assertWritePrivileges`/`targetKey`, so `recovery.before_image: "generated"` was a **no-op** on an enrich shape (honoured only in `runLinkPhase`/`runCascadePhase`/`runLinkKeyedPhase`) and there was no ENRICHER idiom for a class-O retraction to copy. Two runner-owned `passCtx` seams now exist, mirroring `stream`/`flushBatch`'s own injection pattern (Spec 122 §5.5): `ctx.retract(writesRef, scopeParams)` runs `buildWritePlan` → `writeBeforeImage` (deliberately UNWRAPPED, R-M: a failed before-image fails the run before anything is retracted) → `executeSetBasedClear` and refuses both a non-class-O target and a step whose `recovery.before_image` is not `"generated"`; `ctx.joinUpdate(writesRef, sql, params)` routes a class-N write through `executeSetBasedJoinUpdate`, whose structural refusal of `INSERT INTO`/`ON CONFLICT` text is what makes `geocode_permits`' declared insert-free contract enforceable rather than merely stated. `enrich_parcels` declares neither class and `before_image: "none"`, so not one line of its path changes; the accumulated before-image artifacts enter `matched` ONLY when non-empty, precisely so its committed goldens do not move for a mechanism that never ran.

**`phase_order` moves, and honestly.** `phase_runners[runEnrichPhase]` gains four entries (`write.buildWritePlan`, `write.writeBeforeImage`, `write.executeSetBasedClear`, `write.executeSetBasedJoinUpdate`) between `preWriteGate` and `pipeline.withTransaction`. Stated rather than glossed: that position is where the seam FACTORY is *declared*, not where it *executes* — the seams run inside the phase loops, after the transaction opens. The extractor is a first-occurrence scan of library CALL text and cannot distinguish a closure's definition from its invocation; the same is true of every other runner that builds its write plans before its transaction (`runLinkPhase`'s own `specs.map(write.buildWritePlan)` at the top of its body). No other runner's `phase_order` changes.

**Paid the same way as every prior RE-FREEZE:** `generate-template-freeze.mjs --refresh` re-derives `frozen_at`/`schema_sha256`, paired with this Appendix §A9 paragraph and the Spec 122 §8 line, in the SAME commit (the R-E lock). Spec 124 §5 gains register row **R-AK**. Locks: L1–L2 (undeclared/declared-but-missing hooks), L4 (ER-D1, both directions incl. the deliberate-0 arm), L5 (before-image strictly before the retraction, and the two class refusals) in `src/tests/step-library.logic.test.ts`; L3 (hook parity against the real descriptor + the real compute exports) in `src/tests/steps/enrich_parcels/violations.test.ts`; L6 (`runnerReachability` re-derived for the `enrich` shape against the live source) and L7 (the three new fields carry a well-formed `x-ruling`) in `src/tests/step-conformance.infra.test.ts`. Every one proved RED first.

**Filed, not fixed (the residue this row deliberately did not smuggle in):** `runEnrichPhase`'s counter block still assigns `written[write.targetKey(0..4)]` from five hardcoded pass-result names, so an ENRICHER with fewer than five write targets throws `TypeError` there and one with five gets `enrich_parcels`' own counter semantics — filed HIGH in `docs/reports/review_followups.md`, because a correct fix is a descriptor-declared counter mapping, not a silent `if (target)` skip. `seam.js`'s chain-unawareness (Ask A3) is filed MED, not fixed here: it is a `seam.js` concern with no consumer until `address_points` converts in batch-2 Phase 3.

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

**RE-FREEZE #9 — the COLUMN-STAMPING LINK runner (2026-09-16, batch-2 I4 `link_neighbourhoods`):** `execution.shape`'s `x-frozen` enum gains a TENTH value, `link_column`, and `phase_runners` gains a NINTH runner, `runLinkColumnPhase`. Ask 1 ruling (B) FORK, re-ruled 2026-09-16 after the I4 plan panel established that this step's surviving write is ONE unbatched `set_based_join_update` statement rather than the batch loop the draft descriptor had declared. All THREE share-rungs were refuted by EXECUTION against `scripts/lib/step/index.js` and `write.js`, and each is recorded in the `shape` node's own `x-ruling.rungs_tried` (extended, never overwritten — the `enrich` ruling's three rungs are preserved beside them): (a) `link_keyed` is UNRUNNABLE for a one-target descriptor (`runLinkKeyedPhase` destructures `plans[1]` and dereferences `deletePlan.table` before its loop, and its own frozen `phase_order` contains no `write.executeSetBasedJoinUpdate`); (b) `link` pages an integer `lastId` over a surrogate `id` column `permits` does not have; (c) `backfill` — the closest phase-order match and still not shareable, on four measured grounds: it hard-codes `compute_centroids`' matched vocabulary, it EARLY-RETURNS on a zero backlog (which this step must not do — its eligible set is 0 in the measured steady state, so an early return would suppress every `when: "post"` check, including a standing WARN and the whole `failed_link_rate` arm, on every ordinary run), it dispatches through `executeBackfillUpdate` (LG-20, class E) not `executeSetBasedJoinUpdate` (LG-11, class N), and its `force_full` branch requires a declared SECOND write target this step does not have. LG-21 fork-over-share settles it: sharing any of the three would make a CONVERTED step's golden captures (`link_parcels`' or `compute_centroids`') collateral for an unconverted step's convenience. `runLinkColumnPhase` takes `runBackfillPhase`'s PHASE ORDER (guards — overrides — RLS preflight — prior read under its declared posture — corpus + eligible counts — pre_write gate — the ONE statement — post round trip) and none of its mechanism. No other runner's `phase_order` changes. — — ⚠️ **THE RE-FREEZE IS SPLIT ACROSS TWO COMMITS, and that is a property of the generator, not a choice:** `deriveArchetypeProfiles` iterates `converted.json.converted` and NEVER reads `pending`, so `archetype_profiles[LINK].shapes` and `.runners` cannot gain `link_column`/`runLinkColumnPhase` until the CUTOVER commit registers the file. This commit carries the `schema_sha256` move and the new `phase_runners` row; the `archetype_profiles` half and the `template-freeze.infra.test.ts` LINK-shapes pin flip land at cutover. Payment record: `122a_step_optimization_appendix.md` Appendix §A9 (after #8).

**RE-FREEZE #10 — the ENRICHER POST-PHASE seam (2026-09-16, batch-2 Phase 0.10b):** `execution.enrich_hooks` gains ONE optional field, `post_phase`, and completes the job RE-FREEZE #8 started — #8's own record named the residue it was leaving, and this is that residue paid rather than re-derived. What #8 generalised was the PRE-phase hooks, the class-O/class-N write seams and the per-target `written[]` counters; what it left behind was the post-phase OBSERVATION region, which ran three unconditional `SELECT COUNT(*) … FROM parcels` queries for EVERY enrich-shaped step, read five pass results by LITERAL `enrich_parcels` pass name, built `matched` as a hand-written ~30-key literal with no per-step contribution seam, and called `compute.computeAggregateRecordsUpdated(…)` with **no function guard** — unlike `contract_read`/`defer_scope`, which do guard — so an ENRICHER whose compute lacks that export died at `TypeError` after every pass had run and, on a shared-txn step, after COMMIT. I5 (`geocode_permits`) measured that and stopped at commit 4 rather than build on it. `post_phase` names the compute export the runner calls once at that position; the NAME is resolved above the phases with its two siblings, so a mis-declaration is a named throw before any work rather than a crash after the commit (measured: zero passes run, no `BEGIN` issued). The export returns `{matched, compute}` — `matched` merges under a reserved-key refusal enumerating `passes`, `compute`, `before_image`, `<slug>_duration_ms` and the four `scope_*` RETIREMENT keys (enumerated rather than prefix-matched on purpose: three of the twenty-five keys that MOVE are also `scope_`-prefixed, so a prefix rule would have silently swallowed `pending_scope_parcels`, `scope_recovery_recovered_count`, `scope_recovery_batches` and `scope_stamped_without_recompute_count`); `compute` becomes `matched.compute`, every value checked FINITE. Omitting the hook DERIVES that block by summing the `written[]` counters of the DISTINCT `execution.phases[].writes_ref` set — the declared-phase targets ONLY, since a class-based target is filled by the runner after the phase loop from rows its own phases already reported, and including it would double-count under the same key name a hook fills with a distinct-id union. **Declare the root that RESOLVES:** a counter source is resolved against `{matched, written, records_meta}`, so `matched.compute.<name>` and `written.e<N>.<slot>` both resolve and a BARE `compute.*` resolves NULL for every ENRICHER — `enrich_parcels` included, whose three declared counters have read null since conversion for exactly that reason (filed HIGH 2026-09-16; NOT fixed here, because it moves the emitted summary and Spec 123 §1.1 forbids that inside a behaviour-neutral library row). `phase_runners[runEnrichPhase].phase_order` does **not** move: `LIBRARY_CALL_RE` matches only `staleness|write|verdict|ledger|acquire|pipeline` plus `preWriteGate`, and this row removes only `pool.query(` and `compute.` calls — measured by `--refresh`, whose diff is `schema_sha256` + `frozen_at` and nothing else, and re-verified independently by the output-panel Regression Guardian. `enrich_parcels` declares the hook, its compute exports `computePostPhase` carrying every retired expression verbatim, and its POST goldens were recaptured under R-C (both the descriptor and the compute module are `computeSourceFingerprint` inputs, so `step-validate` read `G8 … stale-fingerprints=2 … hard-stop=true`); the classification lives at `docs/reports/golden/enrich_parcels/phase010b-post-phase-seam-recapture.md`. Residue still open, narrowed and named: the two CLASS-BASED write targets are named by no `execution.phases[]` entry, so the declaration-driven loop structurally cannot reach them and two literal pass names survive in the `stampsIdx` block (down from five) — the honest fix is a declared per-target counter source, its own field and its own re-freeze. Payment record for Spec 122 §8 RE-FREEZE #10.

**RE-FREEZE #11 — the RECORDER read-phase bound (2026-09-18, WF3 `wf3_deep_scrapes_failures`, Spec 118 cause B).** `execution` gains two OPTIONAL, any-archetype fields: `statement_timeout_minutes_from_config` (a `SET LOCAL statement_timeout` issued before the step's own reads/writes) and `phase_deadline_minutes_from_config` (a wall-clock deadline over the whole phase, armed via `startPhaseDeadline`/`pg_cancel_backend` on a dedicated connection distinct from the phase's own — EP-PHASE-DEADLINE's own mechanism, generalized past the ENRICHER-only `execution.phases[]` array to a step-level declaration for shapes with one implicit phase, e.g. RECORDER). First and only consumer: `refresh_snapshot`'s `runRecorderPhase`, whose 8-read main loop had `execution.statement_timeout: "none"` and zero phase bound before this row — the 2026-09-15 incident named in Spec 118 §1 cause B (a healthy 110-121s run rode a decorrelated permits heap to the 15-minute platform axe with no trace of which read was slow). Both fields admit the literal `"none"` (the declared disable, same escape `execution.phases[].timeout_minutes_from_config` already carries) and a non-finite resolution THROWS (`resolveRecorderBoundMinutes`, `scripts/lib/step/index.js`, ER-D1's class) — deliberately a THIRD, unexported, RECORDER-scoped copy of the same finite-or-throw pattern `resolveInterval`/`phaseTimeouts` already carry for ENRICHER, not a shared extraction (dedupe filed LOW, `docs/reports/review_followups.md` — extracting one would need the two ENRICHER call sites' own goldens re-verified hash-equal for zero behavioural gain outside this WF3's scope). `phase_runners`/`archetype_profiles` unchanged — `runRecorderPhase` is the SAME registered runner, now reading two more optional descriptor fields; no new runner, no shape widened, no other converted step's descriptor touched. `refresh_snapshot`'s 5 POST goldens recaptured under R-C (descriptor + compute are both `computeSourceFingerprint` inputs): Class A non-empty and expected (new `records_meta.read_timings[]` key, `config.logic_variables` 2→4), Class B empty, Class C non-empty (duration/live-count jitter only) — see the WF3's own commit body for the measured diff against this prediction. Payment record for Spec 122 §8 RE-FREEZE #11.


---

## Appendix §A12 — The standard step as built (moved from Spec 124 §8) — HISTORICAL, 2026-09-18

Moved from Spec 124 — R-AA prerequisite move (WF2 'Cloud acceptance model + cron cadence', operator Ask 1, 2026-09-18): Spec 124 grew to 129,491 bytes against its stale 117,729-byte measured_at (10 bytes of headroom left, ceiling 129,501), so a new §5 register row (R-AQ) could not be added without a move. No §5 register row (R-AA..R-AP) is itself historical/superseded — every one carries a live 'Enforced by' clause. §8 is Spec 124's largest non-Rules, non-register section: a regenerated-per-pilot-cutover illustrative snapshot ('what a converted step actually looks like TODAY'), not one of Rules 1-13's binding policy statements, and its own text says the layer table is 'Mirrored, condensed, at Spec 122 §5.6' — a condensed equivalent survives in-place even after this move. The '## §8.' heading itself is PRESERVED by the stub (per this tool's own heading-anchor convention), so every existing 'Spec 124 §8' citation (docs/specs, .cursor plans) still resolves to a real heading; none needed a known_dangling entry.

## §8. The standard step as built (R-T, 2026-08-29 — ~~6/8 archetypes proven, HEAD `d9057a54`~~ **CORRECTED 2026-09-10 (measured): 7/8 proven** — `template-freeze.json`'s `archetype_profiles`: all proven `true` except ENRICHER (`false`, unexercised until pilot 9's cutover); the pinned HEAD is 8 pilots stale)

*The concrete, code-grounded description Spec 122 §1's aspirational contract needed and did not have — what a converted step actually looks like TODAY, not what it is designed to look like. Regenerated from the live tree at each new pilot cutover, never transcribed from a prior report (per this programme's own "no transcription from prior artifacts" discipline) — the version below was grounded fresh 2026-08-29.*

**Frozen file** (`scripts/<slug>.js`, confirmed shape, e.g. `link-wsib.js` = 41 lines):

```js
const pipeline  = require('../lib/pipeline');
const descriptor = require('./<slug>.descriptor.json');
const compute    = require('../lib/compute/<slug>');
const ADVISORY_LOCK_ID = <n>;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute    = compute;
```

Enforced by `scripts/ast-grep-rules/step-shape.yml` via `scripts/hooks/check-step-shape.mjs`, scope = `scripts/steps/_schema/converted.json`'s `converted[]` array (**8 entries today** — corrected 2026-09-03, WF3 cloud-parity FIX 1.6; unconverted files are scanned report-only, never a vacuous pass — `src/tests/step-conformance.infra.test.ts`'s prove-red proves the rule still fires on every one of them).

**Descriptor** (`<slug>.descriptor.json`, ~~18~~ **20 (corrected 2026-09-10, measured)** categories, validated against `scripts/steps/_schema/step.schema.json`, AJV-checked at `pipeline.step()` construction — before compute exists, before any pool opens). `identity.archetype` drives which of the 20 collapse to `"none"` (Rule 7).

**Notes** (`<slug>.notes.json`) — interpretation, capped at 12 entries, may cite a check id, never a bare number.

**Compute** (`scripts/lib/compute/<slug>.js`) — the ONLY hand-written domain logic. Shape enforced by `scripts/ast-grep-rules/compute-shape.yml`: a `{[checkId]: fn}` dispatch table exported as `module.exports.checks`, every observation via `ctx.report()`, every I/O call through an injected seam (`ctx.fetch`, `ctx.clock`), every tunable through `ctx.config` (never `process.env` directly), file order = descriptor check order, policy text in `checks[].why` never in comments (Rule 4).

**Library phases per archetype, as they exist in `scripts/lib/step/index.js` (~~2,116 ln~~ **CORRECTED 2026-09-10 (measured): 3,776 ln, +78%**) today:**

| Archetype | Phase runner | Exercised by | Status |
|---|---|---|---|
| ASSERT | (no phase runner — writes nothing) | pilot 1 `assert_schema` | proven |
| INGESTOR | write-SQL generation + two-position staleness + acquisition seam (`ctx.acquire`) | pilot 2 `load_ravines` | proven |
| LINK | `runLinkPhase` | pilot 3 `link_massing` | proven |
| MATCHER | `runCascadePhase` (N-tier convergence loop, `runTierToConvergence`) | pilot 4 `link_wsib` | proven |
| MATERIALIZER | `runMaterializePhase` | pilot 5 `link_parcel_addresses` | proven |
| BACKFILL | `runBackfillPhase` (thin fork of the same guards→prior→gate→pre_write→RUN_AT→post shape, LG-20) | pilot 6 `compute_centroids` | proven |
| RECORDER | `runRecorderPhase` (publish/WAP pointer) | pilot 8 `refresh_snapshot` | proven (corrected 2026-09-03 — WF3 cloud-parity FIX 1.6; was mislabeled "pilot 7, unexercised") |
| ENRICHER | `runEnrichPhase` (LG-28; shared-txn passes 1-4 + a post_commit pass 5 on a dedicated connection; declared `execution.maintenance` executed by the library, EP-D17) | pilot 9 `enrich_parcels` | **proven — pilot 9 commit 9 (2026-09-11)**, the 8th and last archetype dispatched; `template-freeze.json`'s ENRICHER row flips to `proven:true` in the same commit (RE-FREEZE #5, Spec 122 §8) |

`runLinkPhase`/`runCascadePhase`/`runMaterializePhase`/`runBackfillPhase` are four independent implementations of the same shape (fork-over-share, chosen three times with measured reasons — pilot 3, pilot 5, pilot 6 Fold D). A shared `runPhaseScaffold` (`LG-21`) is RATIFIED fork-over-share at the freeze (`e029c37d`, `template-freeze.json`'s `lg21_decision`), not built inline — pilot 4 forked `runCascadePhase` (a `tiers[]` branch inside `runLinkPhase` would split its keyset loop), pilot 5 forked `runMaterializePhase` (`runLinkPhase`'s SELECT-then-batch write would split a single server-side statement and break G2's verbatim-SQL guarantee), and pilot 6 deferred a shared scaffold a third time (Fold D); consolidating all 7 runners AT the freeze commit would rewrite every one of them in the one commit that promises they stop changing — the inversion of "enforcement must be harder to change than the enforced" (§10b.1). See §9's BACKFILL row and the programme backlog item `LG-21` (now `SUPERSEDED`).

**Validator, captures, tests, scorecard — uniform across all 6 landed pilots:** `checks[]` (9 named kinds + free-form SQL, Spec 122 §12.5/R6 ⚠️ **miscitation, noted not silently widened (2026-09-10):** `### 12.5` does exist in 122a, but it is "Refuted claims that must not be re-asserted" — a different topic from the `checks[]` menu cited here; arm (iii)'s presence-only check passes this by design, filed MED — the "12 canned generators" of Spec 120 §5.0 is a SUPERSEDED promise, not an unbuilt one, programme item `VAL-1`) → row-derived verdict (never a parallel boolean, Rule 10) → `capture-step-golden.js` fingerprint-locked golden captures (R-C) → `src/tests/steps/<slug>/violations.test.ts` (prove-red, then green) → `scripts/analysis/step-validate.mjs`'s G0–G9 scorecard + this spec's Rules 1–13 policy matrix, generated and enforced pre-commit/pre-push (Rule 13).

**The layer table — who declares, who executes, who measures** (operator scope addition, R-T addendum commit 7 — the concrete answer to Rule 13's own reworded boundary, §2 above: "the validator validates DATA; the scorecard validates process"). Mirrored, condensed, at Spec 122 §5.6.

| Layer | File(s) | Declares / Executes / Measures | Enforced by |
|---|---|---|---|
| Shell | `scripts/<slug>.js` | Neither — wires descriptor + compute into `pipeline.step()` and nothing else (frozen-file shape, above) | `scripts/ast-grep-rules/step-shape.yml` |
| Descriptor | `<slug>.descriptor.json` | **DECLARES** — `checks[]`/`invariants[]`/`plausibility[]` (the bound, `frequency`, `when`, `severity`, `blocking`, the SQL/rule text itself) + `config.logic_variables[]` (the tunables a run may consume) | AJV `step.schema.json`; `step-conformance.infra.test.ts` |
| Notes | `<slug>.notes.json` | Interpretation only — `fences[]`/dispositions, capped, may cite a check id, never a bare number | `scripts/analysis/step-validate.mjs` (G7/G4d, R-T addendum commit 6's strict-shape parse) |
| Compute | `scripts/lib/compute/<slug>.js` | **MEASURES ONLY** — one function per declared check id, reports a raw observation via `ctx.report()`; NEVER compares an observation against a bound, NEVER decides pass/fail, NEVER writes an audit row itself (Rule 2) | `compute-shape.yml` ast-grep + `step-conformance.infra.test.ts`'s harness-fidelity battery |
| Library | `scripts/lib/step/{index,verdict,plausibility,staleness,write,config,ledger,seam}.js` | **EXECUTES** — runs the declared checks/invariants/plausibility against the declared bound (`verdict.js`'s `evaluateLimit`), derives the row + verdict (row-derived, Rule 10), applies the declared `frequency`/`when` gating (R-T addendum commit 3, Fold A-2/A-3/B-2), resolves `config` (§5.5 item 6), stamps `records_meta.chain_run_id` (R-U, below), runs the seam pass (`scripts/lib/step/seam.js`) and `validate_only`-tier invariants/plausibility at chain-end only (`scripts/analysis/chain-end-synthesis.mjs`, Ask 6(b)) | `step-library.logic.test.ts`, `step-conformance.infra.test.ts` |

Rule 2 ("compute is just compute") is this table's own normative claim, restated concretely: a compute file containing an `if (value > threshold)` branch that decides a STATUS is a Rule-2 violation even when it never touches the DB directly — the bound comparison belongs to `verdict.js`, one place, machine-checkable, never re-implemented per compute.

**Per-run phase order** — the common shape underneath every archetype's own phase runner (the table above):
1. `assertDatabaseTarget` + open the ledger row (if `owns`, Rule 13-adjacent `ownsLedgerRow(chainId)`).
2. Resolve `config` — hoisted ABOVE the advisory lock when `hoisted_above_gate: true`, else inside it (§5.5 item 6 of Spec 122).
3. Acquire the step's own advisory lock (`identity.lock`) — a contended lock is a row-derived SKIP (Rule 1), never a bare, unexplained skip.
4. Staleness/gate decision (archetype-specific: `preAcquisitionDecision` for INGESTOR, `ledgerGatedSkip` for MATCHER/MATERIALIZER, `selectMode`'s tri-state for LINK) — a legitimate skip re-emits the PRIOR run's declared block (LG-15), never a silent no-op.
5. `when:"pre"`/`when:"pre_write"` checks + invariants/plausibility (`frequency:"every_run"` ONLY — `validate_only` never fires here, R-T addendum commit 3).
6. The archetype's own write phase (`runLinkPhase`/`runCascadePhase`/`runMaterializePhase`/`runBackfillPhase`/INGESTOR's write-SQL generation) — a before-image (R-M) is written strictly BEFORE any destructive retraction.
7. `when:"post"` checks + invariants/plausibility (`frequency:"every_run"` ONLY).
8. `buildAuditTable` — the row-derived verdict (Rule 10); synthetic invariant/plausibility rows are folded in through the SAME selected-check pipeline as a declared `checks[]` entry (Fold A-2), not a second, parallel path.
9. `records_meta` assembly (`chain_run_id`, `config`, `terminal`, `ledger_row`, `checks_failed`/`checks_warned`) → `emitSummary`/`emitMeta`.
10. A `blockingFailures.length > 0` throw happens INSIDE the lock, AFTER the emit (Write-Audit-Publish, Spec 122 §7.2) — the audit rows are already on stdout even though the enclosing transaction rolls back.
11. Ledger finalize (`finalizeLedgerRow`) — the strand window closes only a THROWN error; a process kill is reaper territory, not this window's.
12. Chain-end ONLY (once per chain run, never per step): the seam pass + `validate_only`-tier invariants/plausibility + the chain-end synthesis artifact.

**Failure-semantics table** (severity × `blocking` → verdict / chain effect / admin surface — grounded against `scripts/lib/step/verdict.js:330` and `scripts/lib/step/index.js`'s terminal-selection block):

| Severity | `blocking` | Row status | Verdict contribution | Chain effect | Admin surface |
|---|---|---|---|---|---|
| INFO | n/a (never checked for blocking) | INFO | never moves the verdict off PASS | none | audit row only, no flag |
| WARN | n/a (`blocking` is only consulted on a FAIL row, `verdict.js:330`) | WARN | verdict = WARN unless a FAIL row also exists | run completes `completed_with_warnings`; chain CONTINUES | flagged WARN, non-halting; R-H requires a `retighten_when` for a standingly-nonzero WARN |
| FAIL | `false` | FAIL | verdict = FAIL | `override.accept_anomaly[]` covers it → `completed_with_errors`, chain continues; uncovered → `failed`, THROWS, chain halts at the next step (an uncaught rejection propagating to `run-chain.js`, Fold B-8's corrected citation) | red row; hard-stop candidate at `step:validate` (G6/G7/G8/G9) |
| FAIL | `true` | FAIL | verdict = FAIL, ALSO added to `blockingFailures` | THROWS immediately inside the lock, regardless of `accept_anomaly[]` — the strongest halt, before the override path is even consulted | red row; a `blocking:true` FAIL can never be silently accepted |

**The admin intersection** — three kinds of number/rule a descriptor can carry, and only one is an admin-editable knob:
- **Values** = `config.logic_variables[]` — live in the `logic_variables` DB table, surfaced in the admin `GlobalConfigCard` GROUPS, each with a declared `min`/`max`/`on_invalid`, stamped into `records_meta.config` on every run that consumes one (Spec 122 §5.5 item 6). An operator can change these without a code deploy. **One render path** (WF2 "ADMIN-1 ratchet to zero", 2026-09-09): GROUPS is generated (`scripts/generate-logic-variable-groups.mjs`) from each seed key's declared `admin.group`/`admin.hidden` field (`scripts/seeds/logic_variables.json`), which is a required, exhaustive, closed-enum declaration for every one of the 451 seed keys — a key can no longer be silently absent from GROUPS while still admin-editable, or vice versa (the reverse-coverage gap this ratchet closed). `GlobalConfigCard.tsx` no longer carries a second, bespoke render path alongside GROUPS for any key family.
- **Rules** = `checks[]`/`invariants[]`/`plausibility[]`'s bound text (`limit`/`bound`) — DESCRIPTOR-declared, ruling-only: changing one is a WF (a reviewed commit), never an admin action. `limit_from_config` is the one declared bridge between a rule and a value (Rule 3's `on_invalid:fail` binding, R-G).
- **Physical invariants** = constants with a stated `why` (e.g. a PostGIS distance tolerance, a CRS assumption) — neither admin-editable nor descriptor-tunable; changing one is a data-model decision, documented inline where the constant lives, never surfaced as a knob.

**The orphan `run-step.mjs` tripwires, enumerated by name** (Fold A-4e, R-T addendum commit 7 — filed as a TODO by commit 4, closed here): `scripts/validation/step-config.json` names 3 of the 6 converted steps (`assert_schema`, `link_wsib`, `link_massing`); `scripts/validation/run-step.mjs`'s `runTripwires()` hardcodes several tripwire IDs as UNCONDITIONALLY `N/A-MANUAL` regardless of which step runs (`:286-297`) — these do NOT migrate into a descriptor's `checks[]`/`invariants[]` as a side effect of a pilot converting; each is either genuinely per-step-bespoke (no generic library home) or simply not yet ported. Checked against each of the 3 steps' own `tripwire_profiles` entry:
- **`assert_schema`** (`sanity` profile → `[T12]` only) — T12 is a real, computed check (STDERR `pipeline.log.warn` line count) that already parallels the descriptor's own `checks[]`/audit-row mechanism; **zero orphans**.
- **`link_wsib`** (`ingest_linkage` profile → `[T3, T4, T5, T12]`) — **T4** (`N/A-MANUAL`, "requires join-key knowledge per step") and **T5** (`N/A-MANUAL`, "requires LEFT JOIN context per step") are the genuine orphans. T3 is real but INFO-only (reports `records_total`/`records_new`/`records_updated`, never scores pass/fail) — not orphaned, but not a bound either; T12 as above.
- **`link_massing`** (`ingest_linkage` profile, same shape) — **T4** and **T5** are the same two orphans, for the same reason (this profile's hardcoded status doesn't vary by step).

Neither T4 nor T5 has a migrated descriptor equivalent as of this commit — both remain reachable only via a manual `node scripts/validation/run-step.mjs` invocation. Filed as a `nice_to_have` programme-items.json row (`TRIPWIRE-T4T5`, §9 below) rather than silently left unenumerated.

**What is NOT yet proven**, because no RECORDER or ENRICHER has converted: the publish/WAP pointer mechanism end-to-end; whether ENRICHER's 5-pass/scope-defer shape fits inside `pipeline.step()` unmodified; whether the two remaining archetypes force further "zero library growth" refutations the way BACKFILL just did (3 of the last 4 pilots needed real library growth, not zero — INGESTOR and ASSERT were the only "port verbatim" cases); Spec 120 §6b's reset-SQL generator and its 3 destructive-reset guards (programme items `STA-2`/`STA-3`, `cutover_prereq` blocking `refresh_snapshot` specifically, since RECORDER is the first archetype in the pilot order likely to need a real scoped reset).


---

## Appendix §A13 — Pilot retrospective (moved from Spec 124 §R-8) — HISTORICAL, 2026-09-22

Moved from Spec 124 — WF2 'runner row-error policy' prerequisite move (2026-09-22): Spec 124 had ~1.2 KB of its 10%-headroom budget remaining and this WF2's own R-AX register row (~2.6 KB) could not land without a move. §R-8 is explicitly retrospective ('after the eighth [pilot]'), carries no 'Enforced by' clause, and matches M06's own criterion ('a regenerated-per-pilot-cutover illustrative snapshot, not one of Rules 1-13's binding policy statements') exactly — it is a dated lessons table, not live policy. The '## §R-8' heading itself is PRESERVED by the stub (this tool's own heading-anchor convention), so every existing 'Spec 124 §R-8' citation still resolves to a real heading.

## §R-8 Pilot retrospective (after the eighth, 2026-09-03)

| Lesson | Evidence (hash) | Standardisation |
|---|---|---|
| Gates authored before measurement block on theory | `32eec17f` | `gate.applies_when` (RS-D-STA) |
| Checkers widened to fit compute have blind spots | `32eec17f` | known-bad fixtures required at widening (§4.4) |
| Declaration drift between descriptor and ledger | `3f41f2a5`, `87834ac2` | tier-3 cross-check + snapshot freshness gate — **OPEN** |
| A descriptor is a fingerprint, not free-edit text | `87834ac2` | recapture procedure (Spec 123 §7 commit 5) |
| Same-commit spec amendment missed 4× | `f5446fa3` | commit-9 spec-diff-or-N-A line (Spec 123 §7 commit 9) |
| Hand-maintained trackers rot | `3ca3180b` | R-R extends to plan files and spec counts |
| stdout ≠ observable, and skip verdicts read as PASS | `00659574` | Rule 10 / Spec 48 checkers — **CLOSED** (WF3 VRD-SKIP, 2026-09-09, LG-29 — `skipRecordsMeta`'s `status` row now declares `WARN`) |
| 302/436 tunables admin-invisible → measured 280/451 (the 302/436 figure was stale by both numbers) → **0/451, RESOLVED** (WF2 "ADMIN-1 ratchet to zero", 2026-09-09, 5 reviewed batches) | `00659574` | Rule 3 reverse test — **CLOSED**; monotonic ratchet (`scripts/steps/_schema/admin-unclassified-high-water-mark.json`, pinned at 0) + `unclassified` retired from the closed hidden-reason enum keep a new admin-invisible key structurally impossible |
| Cloud parity was never a per-step gate | `3ca3180b` | CLOUDPARITY per step |
| One committer at a time; concurrent full suites collide on the local DB's temp state | session evidence: `restore-db.infra.test.ts` temp-file collisions, hook retries | operating discipline, not yet a built gate |
| Freeze not claimable at 8; KFM 5 reported per batch | `programme-items.json`: **2** `batching_prereq` items open (corrected 2026-09-09, WF2 "FREEZE-1, the freeze precondition" commit 2 — was stale "7"; WD-1 and ADMIN-1 both closed 2026-09-09, measured `node -r dotenv/config scripts/analysis/step-validate.mjs --staged --fast` → `blocks batching: 2`) → **1** (STD-7 → BUILT, pilot 9 commit 9, 2026-09-11 — `FREEZE-1` alone remains open) | programme-backlog (§9 above) |
| **Spec prose rots exactly like a tracker** — Specs 122/123/124's own citations, line counts, and section numbers were found dangling/stale at a genuinely large scale (49+ sites for one mislabel alone) despite this register's own "hand-maintained trackers rot" lesson above | this task's own ground-truth census, 2026-09-10 | standardisation: `npm run spec:split-check -- --check` (R-AA) — hook-wired, `.husky/pre-commit`/`pre-push` |
| A cloud dispatch against a branch name, not a pinned commit, can silently grade stale code (EP-D13, 2026-09-08) | `defect-ledger.md` EP-D13: run 34231689122 graded the LEGACY script because `origin/…` was 191 commits behind local at dispatch — every hypothesis built on the observed budget-kill was reasoning about code that never executed | `gh run view <id> --json headSha == git rev-parse HEAD` (and push first), asserted before trusting any cloud acceptance run — `tasks/lessons.md` |
| The ENRICHER archetype (pilot 9) needed a genuine schema bump (`execution.shape`, `execution.phases[]`, then `execution.maintenance.txn_scope:"step"`) — the first pilot the frozen 8-shape enum could not absorb | RE-FREEZE #1-#6 (Spec 122 §8 / 122a §A9); `template-freeze.json`'s `does_not_freeze` clause paid explicitly, once per bump | `does_not_freeze`'s stated price is not theoretical — a real archetype needed it on its very first (and, by `frozen_after_pilot: 9`, last) contact with the freeze |

---

## Appendix §A14 — RE-FREEZE detail, massing prerequisites 0t/0u (2026-09-24)

**⚠️ RE-FREEZE #23 — outputs.writes[].geometry_repair (2026-09-24, prerequisite 0t).** The validator always repaired (`ST_MakeValid(geom) AS repaired`, unconditional); legacy massing stores the UNREPAIRED source (16 invalid geoms survive in `parcels`, measured 2026-09-24) and no declaration could say so — repair was hard-wired by `geometry_kind`. `geometry_repair` (`enum:["make_valid","none"]`, `x-frozen:true`): a THIRD geometry fact, orthogonal to family. Absent = `"make_valid"` = the pre-0t text, byte-identical — pinned by T0 (`src/tests/ingest-prereq-0t.logic.test.ts`, hashes `validation_sql`/`upsert_sql` for ravines/address-points/parcels). `"none"` renders `geom AS repaired`, same alias; only `repairExpr` differs, the CASE/`is_valid_original`/`geom_wkb` text stays shared. `x-ruling.rungs_tried`: `geometry_kind`, `polygon_raw` kind, check/var, compute SQL — `why`: repair ⊥ family. Counter `invalidStored` derives from `is_valid_original` per carried row (not `classify`'s three) → `acquired.invalid_geometry_stored`, 0 under default. G-1 baseline UNCHANGED (`--check`: 0 new fields, `x-ruling` exempts it). `frozen_at`/`schema_sha256` re-derived by `--refresh` at landing.
