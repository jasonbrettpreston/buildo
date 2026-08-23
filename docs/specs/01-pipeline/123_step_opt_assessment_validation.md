# SPEC 123 — Step Optimization: Assessment & Validation

> ## ⛔ UNRATIFIED DRAFT — NOT REGISTERED
>
> **No human has approved this document.** It is absent from `docs/specs/00_system_map.md` and has no governance force. `npm run system-map` has deliberately not been run.
>
> Specs 120 and 121 were both promoted by an automated agent without authorization, and one carried a **false attestation of human ratification**. This banner exists so that does not recur.

**Status:** UNRATIFIED DRAFT · **Scope:** the procedure applied to each of the 27 `sources` steps, then the estate's 64
**Spec 121 is the method and GOVERNS this document.** 123 does not restate 121; it **instantiates** it for one job — converting a pipeline step in place. Where they differ, 121 wins and 123 is wrong.
**Spec 122** is the target architecture. **Spec 119** owns backend verification doctrine and governs over both.

> ⚠️ **TWO `P` NAMESPACES — disambiguated 2026-08-23.** A grounding audit found `P1` carrying **three incompatible meanings** across four documents. They are now distinct: **`PH-0`…`PH-8`** are Spec 121 §3's **assessment phases** (archaeology, structure, risk class…), used inside this spec. **`P0`…`P3`** are the **programme stages** in `.cursor/queued_task_step_opt_programme.md` (audit instrument · centroid · Phase B · envelope + green run). ⚠️ **A reader who takes the programme's `P1` as satisfying Spec 122 §10's S-gate silently deletes the green-cloud-run precondition** that §11 failure-mode 7 exists to enforce.

**Grounding tiers.** `[READ file:line]` · `[MEASURED <date>]` command recorded · `[generated]` emitted by a committed tool · `[DESIGN]` reasoned, **unverified**.

---

## 1. What this is

Spec 121 answers *how do you read an existing system so you know the right tests to write.* Spec 122 answers *what shape does a step become.* **Neither answers: what exactly do I do, in order, when I sit down in front of `load-parcels.js` — and how do I know I did it.**

That is this document. It is a **procedure run 27 times**, and its success test is:

> **Two different engineers converting two different steps produce assessment artifacts of the same shape, and a third can tell from the artifacts alone whether either conversion is safe to merge.**

### 1.1 The one rule that makes the rest work

> ⚠️ **A conversion commit never contains a behaviour change** (Spec 121 §4.3). Refactor and behaviour-change are two hats and are never worn at once.

Everything downstream follows from this. It is why the differential gate can be zero-diff, why a defect gets pinned in its wrong form first, and why the plan has a **programme stage P1** that fixes the centroid bug **before** the programme starts rather than during it.

### 1.2 What is generated, and what is authored

⚠️ Spec 121 measured a **~60% citation-error rate on hand-written detail** and named the corrective: *"the plan must be GENERATED from the spec, not written from it."* This spec obeys it.

| Artifact | How | Regenerate |
|---|---|---|
| Claim → tier / scope / stage / test | **generated** | `node scripts/violations/plan-claims.mjs docs/reports/generated/123-claim-plan.md` |
| The per-conversion checklist (55 items) | **generated** | `node scripts/violations/plan-claims.mjs --checklist docs/reports/generated/123-per-step-checklist.md` |
| Claim survive/die vs Spec 120 | **generated** | `node scripts/violations/extract-claims.mjs docs/reports/generated/122-claim-classification.md` |
| This prose | authored | — |

Both generators **self-test against a known-bad fixture and refuse to emit if the check does not fire** (Spec 121 §12b.6). `plan-claims.mjs` additionally **hard-fails on a single unassigned claim** — there is no default bucket, because a planner that silently defaults reports coverage it has not earned.

---

## 2. The assessment — Spec 121 §3, split into batch and per-step

⚠️ **PH-1, PH-2 and PH-4 are mechanical and must NOT be run per step.** Script them once over all 27 and produce one table. Running them per step is how a 0.5-day job becomes a 27-day job.

| Phase | Scope | Output | Gate |
|---|---|---|---|
| **PH-1** archaeology — relative churn · fix density · **fence density** · 20% change coupling | **BATCH, once** | one row per step | G1 |
| **PH-2** structure — churn × complexity, four quadrants | **BATCH, once** | the top-right quadrant, named | G2 |
| **PH-4** risk class A/B/C → test intensity ••• / •• / • | **BATCH, once** | class per step | G4 |
| **PH-0** boundary freeze — tables/columns written, audit rows, exit codes, stdout | **PER STEP** | I/O surface doc | G0 |
| **PH-3** intent ledger — `git log -S` every non-obvious constant | **PER STEP**, and ⚠️ **only for the top-right quadrant + anything with fence density > 0** | ledger + evidence | G3 |
| **PH-5** seam map — DB, clock, network, argv/env | **PER STEP** | seam list | G5 |
| **P6** behaviour classification — CONTRACT / INCIDENTAL / DEFECT | **PER STEP** | classification | G6 |
| **PH-7** test design, then **prove red** | **PER STEP** | tests | G7 |
| **PH-8** score and exit | **PER STEP** | gate score | G8 |

**The PH-3 restriction is what makes archaeology affordable at 64 steps.** Do not relax it to "be thorough" — that is the failure mode it exists to prevent.

### 2.1 Risk class drives intensity, and the multipliers are ours

Spec 121 §3 PH-4, verbatim: **Risk = chance × impact**, chance = churn + fix density + fence density, impact = blast radius.

**Impact multipliers to hard-code**, each drawn from a real defect in this repo:

| Multiplier | The defect it came from |
|---|---|
| blanket `UPDATE` with no `IS DISTINCT FROM` guard | `enrich-parcels` comps: 426,732 rows rewritten every run |
| writes outside a transaction | `load-massing.js:208-223` |
| non-idempotent accretion | the stuck-interim collision |
| ⚠️ **derived values with no invalidation path** | **`parcels.centroid_lat/lng` — open, and it is a join key (§3.2)** |
| failure is silent (no audit row) | `rf:2334` — 525K rows NULL at verdict PASS |

---

## 3. PIN vs FIX — the decision that keeps the differential honest

Spec 121 §4.2's four questions, in order, for **every** observable behaviour:

1. **Is it observed?** No consumer reads it → **INCIDENTAL: do not assert on it.** ⚠️ Over-pinning is a real cost — every false failure during conversion trains you to rubber-stamp the next one.
2. **Does a spec or invariant assert the opposite?** Yes → **DEFECT.** No spec speaks but a downstream consumer depends on it → **CONTRACT, even if ugly.** *Someone depending on the wrongness makes it a contract.*
3. **Is it load-bearing?** The Regression Guardian's fence question. **An undefended fence is CONTRACT until proven otherwise.**
4. **DEFECT only:** does carrying it through cost more than diverging?

### 3.1 The rule for DEFECT

> **Pin it anyway, in its current wrong form, annotated `KNOWN-DEFECT` with a Defect Ledger ID, and keep the differential gate at zero-diff. Fix it in a separate commit *after* the conversion is green, whose diff shows exactly one thing: the pinned expectation flipping.**

### 3.2 ⚠️ The worked example is live, and it changes the plan

Spec 121 §4.3 uses `compute_centroids` as its worked example of a DEFECT: *"`compute_centroids` never invalidates its derived value on upstream geometry change. That is DEFECT. Pin the non-invalidation → convert → prove bit-identical output → then land `fix(compute_centroids): invalidate centroid on geometry change`."*

**That defect is real, still open, and worse than 121 knew** `[MEASURED 2026-08-23, filed HIGH]`:

- `compute-centroids.js:105` fills centroids only `WHERE geom IS NOT NULL AND centroid_lat IS NULL`
- **nothing NULLs them on a geometry change** — migration 242 covers `massing_enriched_at`/`zoning_enriched_at`; `load-parcels.js:353-361` covers the three `*_dataset_version_when_enriched` stamps; **neither covers centroids**
- and they are **join key for `link-parcels.js:415-423`** — ⚠️ **and NOT for `link_massing`, corrected 2026-08-23:** `link-massing.js:237`/`:434` is the same line, a NOT-NULL *eligibility filter* (`centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL`); the real predicate at `:293` joins parcel **geom** against the **building's** centroid, and `:227` says so in-file. So it is **one join plus one eligibility filter**, not two joins

⚠️ **So the procedure's own worked example forces a plan change.** Pinning a wrong join key and converting on top of it means every downstream conversion in the same programme diffs against poisoned data. **P1 fixes the centroid invalidator BEFORE the programme starts** — the one sanctioned exception to §1.1, taken because the defect is upstream of the differential itself, and taken as its own WF3 with its own red-first test.

**This is also why P0 precedes everything:** the instrument that would have shown the poisoning defaults to the wrong database (§4.4).

---

## 4. The test taxonomy

> ⚠️ **EXTEND the existing taxonomy; do not fork it.** `docs/specs/00_engineering_standards.md` §5.2 (`:101`) and §5.5 (`:119`) already document the layer map. What is missing is a **pipeline-step row** and formal status for two undocumented-but-load-bearing suffixes. Everything below is `[MEASURED 2026-08-23]`.

### 4.0 The constraint that shapes every decision in this section

> ⚠️ **`vitest.config.ts:20` includes `src/**/*.test.ts` AND `src/**/*.test.tsx` — nothing else. Vitest cannot see `scripts/` at all.** `scripts/tests/` is **Python/pytest — 311 tests across 15 files, zero TypeScript** (`python -m pytest scripts/tests --collect-only -q`; 292 `def test_` definitions, the balance parametrized).

**Consequence:** every TypeScript test *about* a pipeline step lives under `src/tests/` and reaches the step from outside — historically by `fs.readFileSync('scripts/…')` and asserting on **source text**. That is the failure mode this spec replaces (§4.5), and it is also why the per-step suite path is `src/tests/steps/<slug>/` rather than beside the step.

**The layers that exist** — 382 files, **8,739 tests collected** by `npm run test`:

| Suffix | Files | Means | Status |
|---|---:|---|---|
| `.logic.test.ts` | 173 | pure functions; no DB, no net | documented §5.2 |
| `.infra.test.ts` | 167 | API routes, mocked pool, unhappy-path-first | documented §5.2 |
| `.db.test.ts` | 87 | **real Postgres**; spawns real scripts as child processes | documented §12.10 |
| `.regression.test.ts` | 9 | pins a fence a diff must not retire | documented; Spec 120 calls it a **hard fence** |
| `.property.test.ts` | 1 | `fast-check` invariants | documented §12.12 |
| ⚠️ `.behaviour.test.ts` | 1 | **spawn the real thing, assert the exit code** | **undocumented — and it is this spec's template (§4.5)** |
| ⚠️ `.parse.smoke.test.ts` | 2 | parse-only smoke for files `tsc`/`eslint` cannot see | **undocumented** |

> **§5.2 documents 6–8 layers; the tree runs ~16.** The two carrying real methodological weight are the two nobody wrote down. **Spec 123 formalizes `.behaviour` and `.parse.smoke` and adds the pipeline-step row.**

**The DB tier is ~5% visible by default.** All **87** `.db.test.ts` files use `describe.skipIf(!dbAvailable())` (`setup-testcontainer.ts:182-184`) — matching the table above; the 88th grep hit in `src/tests/db/` is the helper's own JSDoc at `setup-testcontainer.ts:180`. `vitest list` therefore collects **12 of ~496** without `BUILDO_TEST_DB=1`. Per-step DB tests inherit this — and inherit the risk that a skipped tier reads as a green one.

### 4.1 Four shapes, from the claim's own shape

Spec 121 §5.7. **The register declares the shape; the shape decides the test.** Never choose it by taste.

| Shape | Test form | Who produces the evidence | Count `[generated]` |
|---|---|---|---:|
| **P** prohibition | violation test — do the forbidden thing, assert the *specific* failure | the machine, every run | **169** |
| **B** behavioural | **reversion patch + kill-set EQUALITY** | the machine — the red set is *observed*, never declared | **58** |
| **R** reachability | **observed-set equality** — execute the corpus, assert emitted set == declared vocabulary | the machine — **an observed set cannot be authored** | **8** |
| **W** wiring | consumer census — assert ≥1 reader, and that deleting it reds a named test | a repo-wide query, not a judgement | 0 declared; covered by the census |
| *(unstated)* | defaults to a violation test | | **55** |

⚠️ **Kill-set EQUALITY, not "at least one test fails."** Non-empty proves the behaviour is detected; *not larger than the claimed set* proves the label is honest rather than collateral damage from a broad integration test.

⚠️ **Two harness rules that close real holes:** read test identities from **vitest's JSON reporter, never from file text** (text extraction is satisfied by a comment mentioning the claim id); and **hard-fail when a patch applies cleanly but the red set is EMPTY** — *"removing the behaviour changed nothing"* is the single most valuable alarm this harness produces.

### 4.2 Why agent-written tests get no benefit of the doubt

LLM-generated properties measure **25.99% mutation score against 31.75% for human experts**, and iterative self-repair actively *degrades* oracle fault-detection `[SOURCED — Spec 121 §5.7]`.

> **Do not assume an agent-written test asserts anything until a reversion has made it go red.**

### 4.3 Enforcement tier — most claims are not tests

⚠️ **290 claims is not 290 tests, and reading it that way is what would make this a big production.** Spec 121 §5.12: assign the **cheapest tier that actually holds it**.

`[generated — plan-claims.mjs]`

| Tier | Mechanism | Claims | Artifact |
|---|---|---:|---|
| 0 | JSON Schema | 20 | `scripts/steps/_schema/step.schema.json` + invalid fixtures |
| 1 | DB constraint (CHECK / NOT NULL) | 20 | migrations 245–248 — **free, they are written anyway** |
| 2 | Lint rule | 40 | `scripts/ast-grep-rules/*.yml` — **free, §12b.6 already requires a fixture per rule, and the fixture IS the violation test** |
| 3 | Drift check | 19 | one assertion over all generated artifacts |
| 4 | Census / observed-set | 31 | ~5 queries over the fleet |
| 5 | Incident replay | 39 | ~39 tests — ⚠️ **patches are FREE via `git revert`; the fence-commit population is 87–175, and which number you get is the predicate.** Record-delimited: `git log --format='%H%x1fSUBJ:%s%x1f%b%x1e' \| tr '\n' ' ' \| tr '\036' '\n' \| grep -cE …` → **87** (`fix(` subject AND a `Severity: CRITICAL\|HIGH` or `Lesson-routing:` footer) · **111** (`Severity:` alone) · **160** (`Lesson-routing:` alone) · **175** (either footer, any subject). ⚠️ The previously cited *"96"* reproduces under none of the four |
| 6 | Reversion patch | 74 | ~10 lines each — **the cost centre** |
| 7 | Per-conversion | 47 | `src/tests/steps/<slug>/` |
| | **TOTAL** | **290** | |

### 4.4 ⚠️ The tooling gate — proven to fire, or its output is not evidence

> **Anything that enforces must be proven to fire on a known-bad fixture before its output is believed** (Spec 121 §12b.6).

This is not theoretical hygiene. Measured in this repo:

- **Nine checker bugs in one session** reported green or falsely-red because the check never looked properly (Spec 121 App. G) — including a citation checker keyed on basename, so every `route.ts` collided and resolved against the wrong file.
- ⚠️ **A tenth, found 2026-08-23 and the worst of them:** `parcel-sanity-audit.js`, `parcel-field-dump.js`, `cost-estimates-sanity-audit.js` and `generate-db-docs.mjs` **default to the pre-cutover database** when `DATABASE_URL` is unset. Same commit, two databases: **2,394 violations / 0 FAIL gates** versus **30,288 / 1**. One HIGH gate-bearing check reads `0 — PASS` on the default and **27,984 — GATE→FAIL** on the authoritative DB — and its own description says *"inert-INFO expected post-fix."* **A fix was certified by an instrument pointed at a database where the defect could not appear.**
- ⚠️ **An eleventh, found while building this spec's own tooling:** `plan-claims.mjs` importing `parseRegister` from `extract-claims.mjs` **executed the entire CLI at module scope** — claim **#86** verbatim (*"a declaration is never executable"*), violated by the tool that catalogues it. Fixed with an entry-point guard; recorded because it is the exact failure the claim describes, found by the only method that finds it.

**Therefore, binding:** every checker in this programme ships a known-bad fixture, and CI asserts the checker FIRES on it. Both generators in §1.2 already do; a self-test failure blocks emission.

### 4.5 ⚠️ The source-text problem — and the template that replaces it

`[MEASURED 2026-08-23]` **134 test files read a `scripts/` file and assert on its SOURCE TEXT — 2,543–3,116 such assertions**, the spread being how the assertion's subject is bounded. Corpus: `grep -rl readFileSync src/tests --include=*.ts | xargs grep -l 'scripts/'` → 134 files. Then, over those files: **2,543** counting only a `.toContain`/`.toMatch` whose subject is a variable assigned directly from `readFileSync`; **3,116** when a variable bound through an in-file `readFileSync` wrapper (`const read = (rel) => fs.readFileSync(…)`) also counts; **4,369** is the loose ceiling — every `.toContain(`/`.toMatch(` in those 134 files, source-text or not. That is an order of magnitude beyond Spec 120 §9.2's "~560 BREAK" estimate, and §9.2 already flags its own counts as unreconciled. Worst offenders (widened metric): `compute-trade-forecasts.infra` (277) · `update-tracked-projects.infra` (188) · `classify-lifecycle-phase.infra` (173) · `compute-opportunity-scores.infra` (171) · `chain.logic` (142) · `assert-global-coverage.infra` (122). ⚠️ The *"198"* previously cited for `compute-trade-forecasts.infra` is the **test count of `pipeline-advisory-lock.infra`** quoted 25 lines below — a transposition.

**The repo has already written the indictment of this style**, in the header of `src/tests/migration-hooks.behaviour.test.ts:1-19`:

> *"`enforcement.logic.test.ts` 'covered' these hooks with six assertions on their SOURCE STRINGS — one literally named `it('scans only staged migration files')` that asserted `source.toContain('git diff')`. **The hooks do not scan staged files; they scan the WORKTREE.** A test that checks for a substring cannot notice that, which is precisely why the bug survived a test claiming to cover it."*

> ⚠️ **That is this spec's thesis, already proven in this repo, by this repo.**

**The template, and Spec 123 mandates its shape for every behavioural claim:** mint a real temp git repo (`mkdtempSync` + `git init`), copy the real script in, provoke the bad condition, **run the thing, assert the exit code** (`:67-77` mints the repo and copies the real script in; `:28-44` are the SQL fixtures; `:83-93` provokes, runs, and asserts the exit code):

```ts
expect(git(['status','--short']).trim()).toMatch(/^AM/);
expect(runHook('validate-migrations.sh')).toBe(1);   // the checker must FIRE
```

**Three shapes to copy, all already in the tree:**

| Shape | Exemplar | Use for |
|---|---|---|
| spawn-and-assert-exit-code | `migration-hooks.behaviour.test.ts` | every **B** claim |
| per-script `for` loop emitting one `it()` per file, so failures name the file | `pipeline-advisory-lock.infra.test.ts:241-251` | the conformance suite |
| shell the generator's own `--check` and treat non-zero as drift | `data-lineage-map.infra.test.ts:26-39` | every tier-3 drift claim |

⚠️ **`pipeline-advisory-lock.infra.test.ts` also parses the Spec 47 §A.5 markdown table and asserts bidirectional agreement with the TS constant (`:222-235`, `:309-329`).** That spec↔code parity axis is exactly what the descriptor↔`LOCK_ID_REGISTRY` check (Spec 122 §4.2) should copy — it is not a new pattern here.

**Reconciling Spec 120 §9.2's estimates, so they can be closed:** measured runtime for its three named files is **198 / 331 / 184 = 713 tests**, against its ~250 estimate — understated 2.4–3.2×, because `pipeline-advisory-lock` is almost entirely loop-generated (3 of 6 declarations sit inside `for` loops; **zero `it.each` anywhere**). ⚠️ **Its blocking-constraint finding is unaffected and confirmed.**

### 4.6 DB fixtures — the idiom, and a ruling already made

`[MEASURED]` across `src/tests/db/` (87 files): **`TRUNCATE` 0 · `DELETE FROM` 63 · `BEGIN`/`ROLLBACK` 29/25** (files, within the 87 `.db.test.ts` scope; the 30th `BEGIN` is `setup-testcontainer.ts`, outside it).

The house idiom is **per-file hand-seeding with a sentinel-prefixed fixture key and exact-slug cleanup** — `src/tests/db/ledger-gate-callers.db.test.ts:24-26`: *"cleaned up by exact slug list in `afterEach` (never a LIKE-prefix wildcard)."*

⚠️ **`src/tests/factories.ts` is NOT a DB seeder.** 712 lines, **30** exports, **in-memory typed objects only**, imported by 14 files. §5.1 mandates it for mocked tests; it has no role in the DB tier.

> ⚠️ **INHERITED RULING — do not re-derive.** Spec 120 §9.2 (`:631`): *"**do NOT use the transaction-rollback idiom here.** An earlier draft recommended it, copying the house pattern from `vocab-coverage.db.test.ts`. **It is wrong for this system:** the runner owns `COMMIT`/`ROLLBACK`, and tiers 1–2 exist to test crash-mid-transaction behaviour."* That reasoning transfers to `pipeline.step()` unchanged.

### 4.7 Red-first — rigorous in practice, documented nowhere

`00_engineering_standards.md:112-114` §5.3 states the Golden Rule. **The house dialect that makes it work exists only in test headers**, concentrated in `src/tests/db/`, and Spec 123 promotes it to spec text:

| Convention | Exemplar |
|---|---|
| a header block naming **`THE RED-FIRST PROOF`** and the plan section it discharges | `assert-network-health-halt.db.test.ts:4-5` |
| *"the fix is NOT landed by this file — tests are red-first"* | `:13` |
| ⚠️ **explicit `⛔ TRAP` blocks recording why a naive test proves nothing** — *"it would pass identically whether the fix landed or not"* | `:20-26`, `:38-52` |
| an inline `// THE red-first assertion` marking the exact line | `:238`, `assert-data-bounds-halt.db.test.ts:317` |
| a sibling explicitly disclaiming the role — *"This is NOT the red-first proof and must not be mistaken for it"* | `assert-lifecycle-phase-distribution.logic.test.ts:7` |
| export-absence AS the diagnostic | `check-chain-verdict-duration-trend.logic.test.ts:30` |

**Binding for this programme:** every programme-stage P0/P1 fix and every class-A behaviour carries a red-first proof in this shape, including the `⛔ TRAP` note where a naive version would false-green.

### 4.8 ⚠️ Two CI holes that make this spec unenforceable — fix at P0

Both `[MEASURED 2026-08-23]`, both verified by direct grep:

1. **No workflow runs the main vitest suite.** `grep -rn "npm run test\|npx vitest" .github/workflows/` returns only `test:db`, mobile's jest `test:ci`, and `test:mutation`. **All 8,739 tests are gated by `.husky/pre-commit` alone — bypassable with `--no-verify`.** `pipeline-lint.yml` exists precisely because that bypass was a known hole *for migrations*; the same hole is wide open for the entire TS suite.
2. **`db-tests.yml` has no `scripts/**` path filter** — only the literal `scripts/migrate.js`. **A PR that changes a pipeline step cannot trigger the DB tier**, even though the halt-classification `.db.test.ts` files spawn those very scripts.

> **Both must close at P0.** Otherwise this programme's ~290 claims are enforced by a hook anyone can skip, and the per-step DB tests never run in CI at all.

⚠️ **And G7's mutation gate is a NEW dependency, not existing capability.** Stryker is live but mutates **3 files, all under `src/features/leads/lib/`** (`stryker.config.mjs:30-36`), with `break: 75` at `:59`. **`scripts/*.js` is outside `src/` and therefore outside Stryker's reach entirely.** There is also **no line/branch coverage tooling anywhere** in the repo. So §6's G7 (*mutation ≥80% on covered code for class-A steps*) requires new tooling — size it, or drop it to class-A-only and say so. *(Doc drift noted: `00_engineering_standards.md:381` still says ≥50% and lists a deleted file; the real gate is 75 and 3 files.)*

---

## 5. Claim → test — the mapping, generated

`[generated — plan-claims.mjs, 290/290 assigned, zero unassigned, totality hard-checked]`

| Scope | Claims | Meaning |
|---|---:|---|
| **UNIVERSAL** | **235** | discharged **once**, before any step converts |
| **PER_STEP** | **55** | authored at **every** conversion — ×27 for `sources`, ×64 for the estate |

> **235 of 290 are front-loaded.** The per-step tail is **55 claims per conversion**, and those are the ones that *cannot* be written in advance — they need the step's own tables, predicates and fences.

### 5.1 Where each stage's claims land

| Stage | Claims |
|---|---:|
| P0 audit instrument | 6 |
| S1 descriptor schema + vocabularies | 22 |
| S2 `pipeline.step()` + validator | 63 |
| S3 conformance suite + ast-grep shape rule | 26 |
| S4 state tables + DB CHECKs | 18 |
| S5 cross-step ledger + drift guard | 19 |
| S6 violation suite (register, ratchet, harness, census, replays) | 81 |
| **C\*** every conversion — the per-step checklist | **55** |

Full per-claim table: `docs/reports/generated/123-claim-plan.md`.

### 5.2 The per-step checklist

`docs/reports/generated/123-per-step-checklist.md` — 55 rows, each with its claim id, test id (`R-030`…), the claim text, and **the violation to write**. Copy it into each conversion task.

> **Gate:** all 55 present and **proven red** before that conversion's Gate 4d passes. A per-step claim with no test is not a deferral; it is an incomplete conversion.

⚠️ **These 55 are step-specific by nature.** They cover `notes.json` interpretation (A.3), the conversion gates (A.12), step-level testing (A.13) and load-bearing intent (A.15) — the four sections whose content is *about this step*, not about the library. **Expect the count to grow per step**, because PH-3's Intent Ledger and P6's classification will surface fences that become additional locks. That growth is the procedure working, not scope creep.

---

## 6. Gates — Spec 121 §6.1, per conversion

| # | Phase | Objective exit criterion (binary) | Pts |
|---|---|---|---|
| **G0** | Boundary freeze | every table/column written, every audit row, exit codes, stdout — enumerated | 1 |
| **G1** | Archaeology | churn + fix density + fence density + 20% coupling computed **(batch)** | 1 |
| **G2** | Structure | churn×complexity plot; top-right quadrant named | 1 |
| **G3** | Intent Ledger | 100% of top-right + fence>0 constructs have a recovered *why* or an explicit `INTENT-UNKNOWN` | 2 |
| **G4** | Risk class | A/B/C **with chance and impact factors shown**, not just the total | 2 |
| **G5** | Seam map | DB, clock, network, argv/env each have a named seam | 1 |
| **G6** | Classification | every behaviour CONTRACT / INCIDENTAL / DEFECT; **every DEFECT has a ledger ID** | 3 |
| **G7** | Test adequacy | class-A: **mutation ≥80% on covered code**; every class-A behaviour **proven red** | 3 |
| **G8** | Differential | **zero unexplained diffs**; every explained diff points at a Defect Ledger ID | 3 |

> **Ship at ≥14/17 with G6, G7 and G8 full. Any zero in G6–G8 is a hard stop regardless of total.**

### 6.1 The two gates specific to this conversion

| Gate | Criterion |
|---|---|
| **G4d** | every fence found in P3 has a **both-directions** lock test. *A both-directions lock test IS a violation test with its reversion patch* — recording it is a line in a file, not new work |
| **G-shape** | the converted file passes the ast-grep shape rule (Spec 122 §4.1) and `pipeline.run(` no longer appears in it |

### 6.2 Stopping rule — and it must be able to fire

Assessment is DONE for a chain when **all three** hold:

1. **Saturation** — two consecutive independent passes produce **zero** new Intent Ledger entries and **zero** new class-A behaviours.
2. **Gate score ≥14/17** with G6–G8 full.
3. **Time-box** — assessment ≤ **30% of the conversion budget**. ⚠️ Hit the box before saturation → **stop anyway** and record `ASSESSMENT-INCOMPLETE` on the affected steps. *(30% is a `[DESIGN]` target, not a measurement — calibrate on chain one.)*

> **A stopping rule that cannot fire is not a stopping rule.**

---

## 7. Per-step procedure — the nine commits

| # | Phase | Gate | Class A | Class C |
|---|---|---|---|---|
| 1 | **PH-0** boundary freeze | G0 | 1 h | 20 m |
| 2 | **PH-3** intent ledger — **a human adjudicates** (Spec 121 §12.5) | G3 | 4 h | **skip** unless top-right or fence>0 |
| 3 | **PH-5** seam map | G5 | 30 m | 15 m |
| 4 | **PH-6** classification | G6 | 2 h | 30 m |
| 5 | **Golden master** — 4-tuple: rows ordered by PK · telemetry · ledger+audit · verdict. **Non-determinism inventory declared BEFORE the first diff** | G1′ | 2 h | 1 h |
| 6 | **PH-7** test design + **prove red** | G7 | 4 h | 1 h |
| 7 | **Descriptor + compute verbatim** — ⚠️ **must be a genuine no-op diff** | G2′ | 1–2 d | 2 h |
| 8 | **Peel** — one policy concern per commit: gating → verdict/audit → thresholds/checks | green diff after **every** peel | | |
| 9 | **Differential + cutover** | G8, G4d, G-shape | 3 h | 1 h |

⚠️ **Step 7 is where Spec 122 is structurally better than Spec 120.** Under a file-relocating runner the "wrap verbatim, no-op diff" phase is a *simulated* intermediate state. Here it is literally the first commit and the no-op is real — old and new are **the same file at two commits, invoked identically by the same `spawnStepChild`**.

### 7.1 Role split — the rule that must not be relaxed

> ⚠️ **The agent produces the Intent Ledger with evidence attached (blame output, commit subjects, test names). A human or separately-grounded reviewer adjudicates the dispositions. Never let the same pass both discover and retire a fence** (Spec 121 §12.5, register #162).

| Agents are good at | Agents are bad at |
|---|---|
| mechanical extraction — write/constant/catch inventories, downstream grep | **identifying exact code locations** (needs AST) |
| running the checklist without fatigue | **indirect / injected references** |
| the 1:1 verbatim wrap | **judging whether a constant is load-bearing** — that evidence is in git history, not the file |

**Retrieval beats prompting.** A conversion's context is: the governing spec + `git log -S` for every constant + the downstream-consumer grep + **two exemplar converted steps** — not just the 500-line script.

---

## 8. Known Failure Modes

| # | Mode | Guard |
|---|---|---|
| 1 | ⚠️ **A checker reports green because it never looked** | §4.4 — eleven measured instances. Every checker ships a fixture and CI asserts it fires |
| 2 | **Over-pinning** — asserting INCIDENTAL detail | §3 question 1. Symptom: false failures during conversion, then rubber-stamping |
| 3 | **A DEFECT gets fixed during conversion** | §1.1. Symptom: a differential with diffs you adjudicate by hand — *"how migrations quietly ship two bugs"* |
| 4 | **PH-1/PH-2/PH-4 run per-step** | §2. Turns 0.5 days into 27 |
| 5 | **P3 relaxed to "be thorough"** | §2. It is affordable only because it is restricted |
| 6 | ⚠️ **An agent both discovers and retires a fence** | §7.1 |
| 7 | **A per-step claim quietly deferred** | §5.2 — an incomplete conversion, not a deferral |
| 8 | **The 55-item checklist stops growing** | §5.2 — growth is P3 working; a flat count means archaeology stopped |

---

## Operating Boundaries

**Target files:** `scripts/violations/**` (generators) · `src/tests/violations/**` (the suite) · `src/tests/steps/<slug>/**` (per-conversion) · `docs/reports/generated/123-*.md` (generated, committed).

**Out-of-scope:** the 27 step scripts (Spec 122 owns their shape) · `manifest.json` · Spec 121's method text — **123 instantiates it and may not contradict it.**

**Cross-spec:** **121 (governs)** · 122 (architecture) · **119 (governs over both)** · 120 (design) · 08 (§6.4 altitudes, §11 grounded verification) · 47 · 48 · 118.

---

## Appendix A — open questions

| # | Question | Status |
|---|---|---|
| **Q1** | test-suffix taxonomy + which CI job runs each | ✅ **CLOSED** — §4.0. ~16 suffixes run, 6–8 documented; `.behaviour` and `.parse.smoke` formalized here |
| **Q2** | which tests assert per-script **source text** | ✅ **CLOSED** — §4.5. **134 files, 2,543–3,116 assertions.** ⚠️ Still open: the BREAK-vs-PORTABLE split within them is *not* measured, and Spec 120 §9.2's warning stands for that axis |
| **Q3** | does mutation tooling exist for G7? | ✅ **CLOSED — it is a NEW dependency.** §4.8: Stryker mutates 3 files under `src/features/leads/lib/`; `scripts/*.js` is outside `src/` and unreachable. No coverage tooling at all |
| **Q4** | Do the 55 per-step claims need per-archetype variants (INGESTOR vs ASSERT write nothing)? | `[DESIGN]` — decide at C1 |
| **Q5** | Is 30% the right assessment time-box? | `[DESIGN]` — calibrate on chain one, per §6.2 |
