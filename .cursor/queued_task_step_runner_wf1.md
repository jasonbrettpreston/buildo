# Queued Task (WF1): Pipeline Step Runner & Validator — the 64-step conversion programme

**Status:** ⛔ **BLOCKED — not startable.** Two independent blockers, both requiring a human:
1. **Specs 120 and 121 are UNRATIFIED and UNREGISTERED.** `npm run system-map` has deliberately not been run; registration *is* the authorization.
2. **Gate D is open** — eight decisions in Spec 121 §12.0 must be dispositioned before S1.

**Queued behind:** Phase B (`.cursor/active_task.md` → `.cursor/phase_b_active_task_INPROGRESS.md`), which holds the active-task slot at *Implementation — AUTHORIZED*.
**Domain Mode:** Backend/Pipeline — read `scripts/CLAUDE.md` + `docs/specs/00_engineering_standards.md`
**Doctrine:** Spec 119 (backend verification — **governs on any conflict with Spec 121 §5–§7**) · Spec 08 §11 (grounded verification) · Spec 05 §5 (lesson routing)

## ⚠️ Plan of record — DO NOT RESTATE IT HERE

> **The plan is `docs/specs/01-pipeline/121_assessment_and_verification_methodology.md` §12.**
> This file is a pointer, deliberately. **Copying §12 into a task file is transcription, and transcription measured a ~60% citation-error rate in this repo on 2026-08-22** (Spec 121 header). The plan is generated and checked; a hand-copy would be neither.

| Artifact | Where | Size |
|---|---|---|
| **The sequence** | Spec 121 **§12** (35 subsections, canonically ordered) | the plan |
| **Entry point** | Spec 121 **§12.EXEC** — one table, every stage | start here |
| **Claim register** | Spec 121 **Appendix A** | **284 rows / 290 claims** (rows expand: `109–115`) |
| **Claim → tier → stage** | Spec 121 **Appendix E** (GENERATED) | **290 mapped, 0 unassigned** |
| **Table-row registry** | Spec 121 **Appendix H** (GENERATED) | **171 rows / 18 tables** |
| **Per-item done-tests** | Spec 121 **§12.16** (GENERATED) | 49 items, 0 without a check |
| **Runner/validator design** | Spec **120** | §3 step file · §4 runner · §5 validator |

## Context
* **Goal:** replace 64 bespoke pipeline step scripts with one declarative runner + validator, so gates, pins, thresholds, contracts, observability and emits are identical for every step and only compute differs.
* **Scope:** 64 distinct steps across **86 estate slots** in 6 chains; `sources` (27 steps) first.
* **Why now:** Spec 119 §4.6 names three live tier-0 surfaces — counter semantics, status/skip vocabulary, upstream dependency sets — and files closing them as *"a WF1, filed."* **This programme is that WF1.**

## ⚠️ Overlaps to resolve before starting
* **`.cursor/queued_task_step_contracts_wf1.md`** targets the SAME three tier-0 surfaces (Spec 119 §4.6). **Decide: does step-contracts land first as a narrower WF1, or is it absorbed into S4?** Doing both independently duplicates the work and risks two competing generators.
* **Phase B** is incrementalizing the `sources` chain right now. Its B3 run-ledger gate touches `link-wsib`, `link-parcel-addresses`, `compute-parcel-cost-estimates` — **three of the 27 steps this programme converts.** Converting a step Phase B is mid-change on will collide.

## Standards Compliance
* **Try-Catch Boundary:** N/A at plan stage — the runner owns error handling (Spec 120 §4.1 ㉜, `step_error` table).
* **Unhappy Path Tests:** the entire programme is unhappy-path — see §12.16 done-tests and Spec 120 §16 (red team).
* **logError Mandate:** runner-originated errors carry `class:'runner'` (Spec 120 §4.4 ②).
* **UI Layout:** admin surface is Cross-Domain (Spec 121 §12.1c A4–A8) — read `.claude/domain-crossdomain.md` at that stage, not before.
* **Database Impact:** **YES** — migrations 245–248 (four state tables), plus a `pipeline_runs.status` CHECK constraint. Verified free: highest existing migration is 244.

---

### 12.0 Decision gate — resolve Spec 120 §11 before anything is built

⚠️ **Spec 120 §11 lists eight open decisions and labels them "the review agenda." An earlier draft of this sequence resolved only two of them (via S1) and started building.** Several are structural blockers, not review nits — each carries the ID it must be closed against.

| §11 | Decision | Blocks | **RESOLUTION (2026-08-22)** |
|---|---|---|---|
| **D1** | Spec 47 has **duplicate section numbers** ~~— two §11s, §15s, §16s, §7.6s~~ ⚠️ **that list is wrong; see §12.1a** | every cross-reference in 120 | ✅ **RESOLVED — renumber Spec 47 mechanically at S1.** Doc-only, no code. ⚠️ **The duplicate list is CORRECTED by execution (`[READ 2026-08-22]`): `## 15` ×2 · `## 16` ×2 · `### 7.6` ×2 · `### 8.6` ×2. There is NO duplicate §11, and `### 8.6` was missed by every prior pass** — the original claim was wrong in both directions |
| **D2** | **SKIP has three spellings**; §5.6 demands a contention WARN row that **exists nowhere** | §3.2b vocabulary, claims #24, #26 | ✅ **RESOLVED — §3.2b's enum already is the answer.** Three spellings become **three distinct meanings**: `skipped` (scope or gate declined the work) · `self_skipped` (lock contention) · `deferred_to_full`. The missing contention WARN row is `self_skipped` **plus** a WARN audit row — one status, one row, both required |
| **D3** | **Halting posture** — §R12 throw vs Spec 49 non-halting vs F2's kill | §3.2, claims #15–16 | ✅ **RESOLVED — `severity` ⊥ `blocking` IS the resolution**, and the three "conflicting" positions are not in conflict; they occupy different cells. §R12's throw = `blocking:true`. Spec 49's non-halting gate = `blocking:false, severity:FAIL`. **F2's kill is budget control (§4.2c), not a check at all** — it was never the same axis |
| **D4** | `txn_scope` has **no achievable universal cap** (87.1 min measured) | §3.2 `execution`, claim #56 | ✅ **RESOLVED in-spec** — per-step declared budget + `chunked: true` for the two long steps. No universal cap is attempted |
| **D5** | `criticality: best_effort` **deferred** | claim #14 | ✅ **RESOLVED AS DEFERRED — and a deliberate deferral is a resolution.** The schema **refuses** the value; `classifyStepCompleteness` has no path for a tolerated failure and gate-skip would coerce `recordsNew` to 0, mislabelling a skipped downstream chain as *"0 new records"*. Revisit only as its own WF with the 40–60 lines |
| **D6** | `writes.tier` **derived** — no code or test knows any table's tier today | claim #12 | ✅ **RESOLVED — build the table→tier registry at S4.** One generated JSON, ~87 rows, seeded from Spec 47 §7.8's definition. Its only consequence is SAVEPOINT permission, so an error is cheap and visible |
| **D7** | **`pg_stat_xact_user_tables` attribution unresolved for autocommit steps** | claims #234, #8 (§10b.8) | ✅ **RESOLVED WITH A NAMED FALLBACK.** Steps with a transaction use `pg_stat_xact_user_tables` (exact). Steps at `txn_scope: none` **bracket `pg_stat_user_tables` around the step** — attribution is reliable because the runner executes steps **sequentially under a per-step advisory lock**, so no concurrent writer exists in-chain. ⚠️ **Limitation, declared not hidden:** a standalone run concurrent with another chain can mis-attribute. The report marks those rows `attribution: bracketed` rather than `exact`, and §10b.8 keeps its risk rating |
| **D8** | "Nothing else exists" not search-verified — one Reddit check | §1 build-vs-adopt | ✅ **ACCEPTED AS RESIDUAL RISK — the build decision does not hinge on it.** SQLAnvil already overturned the universal negative and **the recommendation survived on a narrower premise** (§1). A 15-minute human search would close the wording; it cannot change the conclusion |

**Plus the two Appendix-B defects** (handled at S1): the §3.2 split vocabulary table, and the `action: "gate"` examples in §3.3/§5.

> **Gate D is now closed: eight of eight dispositioned — six resolved, one resolved-as-deferred, one accepted as residual risk.** D3 and D6 unblock S4. **D7 remains the one to watch** — not because it is unresolved, but because §10b.8 makes declaration-truthfulness the architecture's signature new failure mode, and the fallback is *bracketed* rather than *exact*. **A resolution with a declared limitation is not the same as a solved problem, and the register should keep saying so.**

---

#### 12.18a Entry criteria — the half of Fagan this spec cited and did not implement

⚠️ **Zero stages had an entry criterion.** §6.1 explicitly cites Fagan inspection for *"entry criteria before a phase begins, exit criteria before it advances"* — **and only exit criteria (done-tests) were built.** A stage with no entry criterion starts on optimism.

| Stage | ⚠️ DO NOT START UNTIL |
|---|---|
| **S1** | Gate D closed — all eight §12.0 decisions dispositioned |
| **S2** | S1 green: §3.2 declares each field exactly once |
| **S3** | S2 green: the register exists and `UNPROVEN.txt` is seeded |
| **S4** | S3 green **and D3 (halting posture) + D6 (table→tier registry) resolved** — the schema encodes both |
| **S5** | S2 green (the harness needs the register to address claims) |
| **S6** | S2 green |
| **S7** | **S5 green** — the replays are proven red *through* the harness |
| **R1–R6** | **Gate S closed**, and §9.3 ① (SDK + envelope) + ② (descriptor-generated lock registry) landed. ⚠️ **② is the hard blocker: the first converted step reds the suite without it** |
| **A1–A8** | R1 green (the admin surface reads runner-emitted state) |
| **C1** | Gate R closed **and** the template unfrozen — C1 is what freezes it |
| **C4** | C3 green: template frozen and both style exemplars published |
| **C5/C6** | C2 evaluated and no kill criterion fired |

---

#### 12.18e Programme-level DONE

⚠️ **No definition existed.** The programme is complete when **all five** hold:

1. **64 distinct steps converted**, and **old scripts deleted == steps converted** (§14.6's second number — the real progress metric).
2. **`UNPROVEN.txt` is empty**, or every remaining entry carries a written, reviewed reason.
3. **`programme-status` is green on all four blocks** for three consecutive weeks — including **Block C**, the only one that reads output values.
4. **Every one of the 86 estate slots runs under the runner**, with no old-style script remaining and no amnesty entry outstanding.
5. **The method has converged** (§7.4): three consecutive conversions with zero new checklist items and zero class-A escapes.

---

## Appendix A — the claim register

**Status: hand-extracted, therefore provisional.** This is the first pass and its purpose is to prove the register is *tractable*, not to be the artifact. §5.8's extractor replaces it.

**Shape key:** **P** prohibition → violation test · **B** behavioural → reversion + kill-set equality · **R** reachability → observed-set equality.
Sections are Spec 120 unless prefixed `121:`.

---

### 12.EXEC ⭐ THE EXECUTION SHEET — one place, generated

> ⚠️ **GENERATED ARTIFACT — do not hand-edit.** Assembled from §12.16 (done-tests), Appendix E (claim→stage) and Appendix H (table rows).

**Why this exists:** the plan grew to **27 subsections across §12 plus four appendices in a 2,500-line file**. Executing one stage meant reading five places. **This sheet is the entry point; everything else is reference.**

| Stage | What | Est. | Claims | Detail | Done-test |
|---|---|---|---|---|---|
| **D1-D8** | Decision gate — resolve all eight before anything is built | — | — | §12.0 | **D1** Spec 47 heading `uniq -c` shows no count > 1 — currently `## 15`×2, `## 16`×2, `### 7.6`×2, `### 8.6`×2 · **D2** the status enum emits `skipped |
| **S1** | Fix the spec blockers — coherent §3.2 · corrected examples · Spec 47 renumber | 0.5 d | — | §12.1a | every field name appears exactly once in §3.2 (11 fail today) · `grep -c '"action": "gate"'` returns **0** (2 today) · Spec 47 heading `uniq -c` shows |
| **S2** | Claim register + ratchet — extractor · REGISTER.md · UNPROVEN.txt seeded | 0.5 d | **19** | §12.1a | extractor emits **289 rows** matching Appendix A · adding a claim with no test **reds CI** · editing a claim sentence **breaks its hash** and reds CI |
| **S3** | Tier every claim — the step that turns 290 into ~50 | 0.5 d | — | §12.1a | every claim has a tier (no nulls) · **the tier counts SUM to 289** · tier 7 is broken out, never left as "remainder" |
| **S4** | Tier 0/1/3 mechanisms — JSON Schema · DB CHECKs in migs 245-248 · drift check | 1 d | **65** | §12.1a | each invalid fixture **rejected with a named error** · each DB CHECK **rejects its bad INSERT** · hand-editing any generated artifact **reds the drift |
| **S5** | Reversion harness — kill-set equality · baseline-green guard | 0.5 d | — | §12.1a | a deliberately-weakened test **drops out of the red set and fails equality** · a no-op patch **hard-fails** · a dirty baseline **refuses to run** |
| **S6** | Wiring census — ~5 queries; the dominant recorded failure pattern | 0.5 d | **5** | §12.1a | **all five known wiring instances detected** · deleting the last consumer of any declared field **reds the census** · ⚠️ the census is **per-property, |
| **S7** | Incident replays — ~41 tests; patches free via git revert | 1 d | **41** | §12.1a | ⚠️ **every replay test proven red under its own `git revert`** — a test that stays green when its fix is reverted is detecting nothing |
| **R1** | Runner + validator core — the engines | — | **13** | §12.1b | `--plan` opens **no write transaction** — `pg_stat_xact_user_tables` shows zero writes anywhere (#72) |
| **R2** | Tier 1 response matrix — ~60 cells from the 13 categories | — | **14** | §12.1b | the response matrix is **TOTAL**: every cell of the cross-product from the **13 declaration categories** (`T3.1`) has a **runtime-reported** test name |
| **R3** | Fault injection — 15 named persistence boundaries | — | — | §12.1b | all **15 persistence boundaries** have an injected-fault test · ⚠️ **boundary 10 asserts NEITHER the data rows NOR the interval row survive** — the ex |
| **R4** | Reversion patches — 95 T6 claims — THE COST CENTRE | ~2 d | **60** | §12.1b | every **T6 claim (95)** has a reversion patch · **kill-set equality** holds for each · an **empty red set hard-fails** · baseline asserted green befor |
| **R5** | Tier 2 inter-step — producer/consumer · cascade · crash-across | — | — | §12.1b | producer/consumer, cascade and crash-across-steps green on **synthetic** data only — tier 2 needs no real rows |
| **R6** | Mutation run — scoped to validator + generator, nightly | — | — | §12.1b | a mutant that flips `hasFails` is **KILLED** — if it survives, the verdict tests are decorative (§16.3) |
| **A1-A8** | Admin + recovery — reset guards · catalogue · T1-only editing | — | **8** | §12.1c | **A1** six archetype resets generated; **`rowcount(T6b) == 6`** (Appendix H) · **A2** reset without `--execute` changes **zero rows** · a non-local ta |
| **TRIAGE** | Batch triage — all 27 steps at once; produces the conversion order | 0.5 d | — | §12.2 | see §12.2 |
| **C1** | Framework proof — simplest + median + 2,153-line worst | — | **18** | §12.8 | **Gate 0**: the runner diff across conversion **#3 is empty** — zero new bespoke code paths |
| **C2** | Kill criteria — four, pre-declared; any one fires -> stop | — | — | §12.8 | all four kill criteria **evaluated and recorded**; any one firing **stops the programme** rather than being renegotiated |
| **C3** | Freeze template — after #3 or #4, never #1 | — | — | §12.8 | `scripts/steps/_template/` exists and is the **only** entry point; a lint asserts every step matches its shape |
| **C4** | Shared steps — 10 steps, 28 slots, up to 4 chains each | — | — | §12.8 | differential green **in EVERY chain the step appears in** — up to **4** for `refresh_snapshot`/`assert_data_bounds`/`assert_engine_health` (10 shared  |
| **C5** | Rest of sources — 45 of 86 slots | — | — | §12.8 | **45 of 86 slots** converted; every per-step gate green |
| **C6** | Remaining chains — permits 23 -> coa 7 -> deep_scrapes 4 -> ent/wsib 3 | — | — | §12.8 | cumulative distinct converted **== 64** · **old scripts deleted == steps converted** (§14.6's second number) |
| **LOOP** | Per-step loop — x61, 10 phases with gates | 2-3 d (A) / 0.5 d (C) | **30** | §12.3 | see §12.3 |
| **M1-M14** | Standing cadence — continuous, not one-time | — | **9** | §12.10 | see §12.10 |

**Totals: 290 claims mapped across 12 stages · 18 tables / 171 implementable rows · 35 per-item done-tests.**

**Reading order for an implementer:** this sheet → the stage's row → its `Detail` section → its claims in **Appendix E** → its tables in **Appendix H**.

---

## Execution Plan (the task-file view — §12 is authoritative)
- [ ] **0.** Human: ratify Specs 120 + 121, or decide they stay unregistered and this task stays blocked.
- [ ] **1.** Human: disposition Gate D's eight decisions (§12.0). **D3, D6, D7 block S4.**
- [ ] **2.** Resolve the two overlaps above (step-contracts WF1; Phase B's three shared steps).
- [ ] **3.** S1 — fix the spec blockers. ⚠️ **§3.2 declares `guards.schema_drift` twice with different value sets; the JSON Schema cannot be generated until that is reconciled.**
- [ ] **4.** S2–S7, then Gate S. Then R, A, TRIAGE, C1–C6 per §12.EXEC.
- [ ] **5.** Re-run the six generators after every spec edit — they are the only thing that has reliably caught error in this material.

> **PLAN LOCKED. This task is BLOCKED pending human ratification + Gate D. Do not generate code.**
