# McBylaws handbook amendments v3 — proposals for the operator (2026-10-30, final fold)

Status: **PROPOSED**. Nothing here is a rule until the operator approves it (O-1) and it is recorded with its lock.
v3 folds round 2 of the PLAN panel (`~/Buildo-scratch/plan-1030/ds/ADJUDICATION-r2.md`, KEEP F-28..F-50) on top of round 1 (`ds/ADJUDICATION.md`) and the operator's CARD P3-DATA-MODEL. Earlier drafts: `HANDBOOK-AMENDMENTS.v1.md`, `HANDBOOK-AMENDMENTS.v2.md`.
Paths: specs in `~/Buildo-wt-p3model/docs/specs/`; `124:42` = `01-pipeline/124_step_standard_policy.md` line 42; `08:` = `00-architecture/08_agents.md`.

## What we calculate
The catalogue rows come from the Phase 2 target vocabulary (`vocab.json`: 94 `dsl_target`, `building_type`, `scenario_class_units`) and from the product's five questions: can I build this type, footprint, height/storeys, GFA, units. The table is in `MCBYLAWS-QUEUE.v3.md` ("What we calculate"). Spec 78 P5.2 (method), P5.9 (settings) and P5.10 (output schema) were written for the old engine and are **reference only**.

## 0. The anchor: this was ruled on 2026-10-07

**Formulas as data, run by the one evaluator, were ruled on 2026-10-07. Phase 3 did not follow the ruling. This plan enforces it.** (F-40)

- **M-61** (`69a_mcbylaw_register.md:121`, RATIFIED 2026-10-07): "Layer 3 report fields are declared formulas, run by the one evaluator. Every user-visible calculated report field … is a row in a formula registry (data): one row per field × tier, a Spec 68 §7.4 DSL expression with the M-72 extension over Layer 2 winners (`l2()`), admin logic variables (`lv()`) and declared geometry inputs from a closed list in `vocab.json` (`lot_area_m2`, `lot_frontage_m`, `lot_depth_m` …), run by `evaluate.mjs` per parcel × scenario × tier. Code = the evaluator (extended by M-72: new code, its own WF), ≤ 10 archetype handlers (Spec 68 §8 rule 2) and **one** converted step (e.g. `compute_maxbld_scenarios`, Specs 122/124). No code names a zone, a scenario or a regulation id."
- **M-72** (`69a:132`, RATIFIED 2026-10-07): the Layer 3 grammar extension — "unit algebra …; `lv(<id>)` and `l2(<target>)` names …; `floor` / `ceil` / `round`; variable-to-variable comparisons and `regulated(<target>)`; a closed `unregulated` / `unlimited` propagation table …; **the Layer 2 winner always beats any raw lot-vector value**; … alternatives inside one unit as one `max`". Its lock is "the planned `bylaw-p3-dsl.logic.test.ts`", which does not exist yet (audit #64).
- What Phase 3 built instead: hand-written per-class modules that name zones and a regulation id, with typed numbers, outside the evaluator (audit #63).

So Layer 3 = **`evaluate.mjs` extended per M-72**, **≤ 10 archetype handlers** (M-61; Spec 68 §8 rule 2), and **one converted step** that feeds it the tables. There is no new runner. Rows below that re-state M-61 or M-72 are dated notes on them, not new rules.

### What the code is, after reconciling with M-61 / M-72
| Item | Status | Source |
|---|---|---|
| `l2(<target>)`, `lv(<id>)`, the geometry inputs, `floor`/`ceil`/`round`, unit algebra, `unregulated`/`unlimited` propagation (so `l2()` returns `applies`, `not_applicable`, `undecided`, `not_evaluated`, `unregulated`, `unlimited`, F-48) | already ruled, part of the M-72 extension | M-72 (69a:132) |
| "the largest across design options" | already ruled: "alternatives inside one unit as one `max`" | M-72 |
| archetype handlers (LIMIT, PERMIT/PROHIBIT, DISAPPLY …), ≤ 10 | already ruled | M-61; 78:496 handlers |
| **switchboard filter** in the step: drops catalogue rows whose switch is off before evaluation | new, step code (not in the evaluator) | M-378 below |
| ~~`search()`~~ | **withdrawn** (operator correction 2026-10-30, "your using the old code again here"): it came from the old engine's depth search (Spec 78 P5.5). If a later increment needs something the grammar cannot express, a card asks for an M-72 extension. | — |

Dropped since v2: H1 `l2()`, H2 `lv()` (named by M-61 / M-72) and H4 `best_of()` (covered by M-72's `max` over alternatives).

## 1. How these amendments are made

- **Add rows or dated notes, never delete** (69:7). Spec 133 and Spec 132 are generated; amend the registers, never the handbook pages (133:5, 132:5).
- **Rule and lock in the same commit** (124:186): each row names one owning task and is recorded by decision-log in that task's commit, with its lock. OWED clears only when the generator reads the lock's green run; the red proof is the test runner's own output ("a committed vitest JSON artifact", 124a:238).
- **One bootstrap exemption, BOOT-1 (F-28).** MB-66, MB-67 and MB-68 cite the operator's O-1 approval as their rule and are exempt from G2 and G3 until MB-67 lands. No other exemption. Decision-log steps run as provider `claude` (registry work is "orchestrator-only", 08:145).
- **The trust anchor is the operator at pre-push (F-34).** The operator pushes (queue v2 Process step 6). `.husky/pre-push` prints a one-screen summary of every change to the protected paths listed in one file, `mcbylaws/protected-paths.json` (catalogue rows, building types, switchboard, settings seed, oracle and worked-example files, floors, gate code, the loop set, the `pending/` count, held-patch count vs N, dirty McBylaws worktrees, whether each Layer 2/3 commit has its panel record); the operator approves the push. CI (`test.yml`, "the non-skippable backstop" per the `.husky/pre-push` header) re-runs the gates. Nothing else guards the gate.
- **The hold fails closed (F-41).** Layer 2/3 work is allowed only when the tracked file `mcbylaws/APPROVED` exists in the repo, committed by the operator at O-1. The gates refuse Layer 2/3 paths without it. One trigger: the operator's commit.
- **Ids are provisional**: Spec 69a **M-377…** (highest M-376, 69a:512); Spec 124a **R-KF…** (highest R-KE); Spec 131 not needed (all lot-configuration changes are dated notes).
- **Row formats**: 69a `| # | Rule | Why | Enforced by | Status |` (69a:45); 124a `| Id | Ruling | Amends | Enforced by |` (124a:984); Spec 68 §1 and §3 as at 68:37, 68:60.
- **Proposed defaults** (F-42) are labelled "proposed default, operator decides", with the reason. None is ruled.

## 2. The model the operator approved (CARD P3-DATA-MODEL, recorded as M-384)

- **Phase 1** = the by-law table. **Phase 2** = the application table (Layer 2, Spec 134). **Phase 3** = calculation tables run by the one evaluator:
  - (a) **building types** (dated note on LC-16);
  - (b) **formula catalogue** = M-61's formula registry (dated note on M-61);
  - (c) **settings** = logic variables (Spec 124 Rule 3, 124:68), register `scripts/seeds/logic_variables.json`;
  - (d) **one switchboard** (M-378);
  - (e) **results with full trace**, kept as JSON files in the loop, loaded into the table only at the DB night (F-43).
- **No old code imported** (card ruling 2; R-KJ).
- **Start small, then expand** (operator, verbatim, 2026-10-30: "the apporach should be to start small and test against the 25 cases or the coa and then expand using the loop you mentioned. The other approach was just a mess."): increment 1 = the detached house, core numbers only, on the 25 golden cases; each later increment adds one field, building type or case set (25 golden → CoA 172 / 4d / cumulative → proof set → all lots) and enters only when the previous is green in the loop. Recorded as clause (4) of the dated note on M-61; the increment list is in `MCBYLAWS-QUEUE.v3.md`. Owning task MB-68 (the loop record carries one increment id per round).
- **The test-and-validate loop**: change a row → run the loop set (worked examples, fresh expected answers, invariants, floors, committed CoA cases) → compare with the last accepted run → accept with a recorded reason, or revert (dated note on M-61 (3)).

## 3. The guardrails (G1–G13)

Each is red-first on its real incident. Each runs at commit, pre-push and CI; the operator's pre-push summary is the anchor.

| G | Guardrail | Incident | Rule | Mechanical enforcement | Owning task |
|---|---|---|---|---|---|
| G1 | Layer 3 logic only in the step + the evaluator. | Rulings and the rear suite in the harness (audit #1). | M-61 (69a:121); LC-15 (131:58); R-KF. | `step-closure.logic.test.ts`: the step's closure is the step files + `evaluate.mjs` (and its M-72 extension); the harness reaches Layer 3 only through the step. | MB-31 |
| G2 | OWED means blocked. | "HELD on P3-Q1" commits (41719d27 etc.) (audit #45). | R-KG. | Gate arm: a Layer 2/3 code commit may cite only rows RULED without OWED (generator status); BOOT-1 excepted. | MB-67 |
| G3 | A Layer 2/3 **code** commit cites a RULED rule from its task's pre-registered `rules[]` (F-17, F-37). | 1d4b20d9 "MB-18 commit attempt". | R-KH; R-IZ (2) (124a:984). | Gate arm on Layer 2/3 code paths only; product and night tasks carry a `Rules:` line in the queue. | MB-67 |
| G4 | Expected answers first; one Layer 3 writer. | MB-17 Q3 flip (queue v2:126). | M-358 (69a:492); M-380. | Oracle and example files are protected paths (pre-push summary); the loop record names the cases each accepted change made pass; one E-lane write scope (catalogue, step, evaluator extension, seeds, migrations) so the engine refuses a second claim (`CLAIM_CONFLICT`, 08:146). | MB-64, MB-68 |
| G5 | Register conflict search before a ruling is recommended. | MB17-Q1 vs M-180(1). | M-381. | `register-conflicts.mjs` + a `decision-log --check` arm. | MB-67 |
| G6 | WIP limit and definition of done. | 11 held patch files + the MB-64 patch, two unpushed branches (queue v2:4). | M-382. | Held count vs N in the pre-push summary; done = commit + named test + recorded ruling + queue line. | MB-67 |
| G7 | The loop set runs on every Layer 2/3 commit; a fall blocks. | d01e1458 red-floor edit; MB-17 Q3. | M-322 (69a:456); R-KI. | Fast set at pre-commit for staged Layer 2/3 files, full set at pre-push and CI; red-by-design tests in `pending/` (excluded) until made green. | MB-68 |
| G8 | No import of old code. | MB-14 restore (949879c2). | Card ruling 2; R-KJ; M-384. | `no-retired-import.logic.test.ts`: no step file requires a file on the retired-reference list (audit §7). | MB-31 |
| G9 | DONE claims checked (F-29). | MB-58 READY vs DONE 573a6cdf. | R-KK. | `mcbylaws-queue-check.mjs` checks one thing: every DONE line's commit exists on its branch. One status word per heading; READY is derived (all WAITS done). | MB-67 |
| G10 | No claim to the operator without a quoted rule; briefs runnable by the engine. | Unexecuted suspicions (queue v2:313); MB-64 engine run blocked [reported, unverified]. | 08:442; Spec 08 §7 rule 10 (proposed; does not exist today). | `card-cite-check.mjs`; brief command check against `bash_allow` (08:95-126). | MB-67 |
| G11 | Worktree hygiene. | 12 dirty McBylaws worktrees, 37 unpushed commits (audit §6). | R-KL. | The count is in the pre-push summary; MB-11 clears it. | MB-67 |
| G12 | No exception paths; panel record with each Layer 2/3 commit. | Harness logic; MB-30, MB-37 one lens (queue v2:186, :213). | 124:19; 124a:238; R-KM. | Gate arm keyed by `converted.json`; panel record `docs/reports/panels/<task>.json` shown in the pre-push summary. Held patches carry theirs when they land as commits at the night (F-35). | MB-67 |
| G13 | No by-law knowledge as a literal in step or evaluator-extension code (F-32, F-49). | `maxbld-invariants.mjs` 0.45, 0.2, 0.3, 4, 6.3, 3.5; `LIFT_ZONES`. | core.8 (132:153); R-KN. | One ast-grep arm (shape-scan family, 122:805): numbers limited to 0, 1, −1, 2, 100; strings limited to an allow list (the closed status words and table field names). | MB-67 |

## 4. Amendment rows

### 4.1 Spec 124a live register (generic step standard)

| Id | Ruling | Amends | Enforced by |
|---|---|---|---|
| R-KF (G1) | **A pending or converted step's compute closure is its step files plus the shared evaluator it declares; harnesses call only the step (McDonald's Airtight V3; provisional).** Five words: standardized, observable, scalable, accurate, understandable. Conflict check: Rules 1, 2 (124:32, :42) — applied; M-61 — applied. Owning task MB-31. | Applies Rule 1, Rule 2 | `step-closure.logic.test.ts` |
| R-KG (G2) | **OWED means blocked (provisional).** A step code commit cites only rules RULED with no OWED marker; rule and lock land together (124:186); OWED clears by the generator. One exemption, BOOT-1 (MB-66..MB-68, until MB-67 lands). Conflict check: 68:113 — refined; CHAT-73.nohalt — kept (building held work is allowed, landing it is not). Owning task MB-67. | Refines 124 §4.4 | gate arm |
| R-KH (G3) | **A step code commit cites a RULED rule from its task's pre-registered `rules[]` (provisional).** Code paths only. Owning task MB-67. | Applies R-IZ (2), M-321 | gate arm (red on 1d4b20d9's message) |
| R-KI (G7) | **A step's loop set runs at commit, push and CI; red-by-design tests live in `pending/` (provisional).** Inputs to the gate are protected by the operator's pre-push summary, not by the gate. Owning task MB-68. | Applies M-322, M-360 | hook arms; `hooks-composition.infra` |
| R-KJ (G8) | **A step in conversion imports no code from a superseded implementation (provisional).** Owning task MB-31. | Narrows L3-REBUILD | `no-retired-import.logic.test.ts` |
| R-KK (G9) | **Every DONE line's commit exists on its branch, checked by script (provisional).** Owning task MB-67. | Extends R-BF (124a:243) in reach | `mcbylaws-queue-check.mjs` |
| R-KL (G11) | **Dirty and unpushed worktrees of a programme are reported at pre-push (provisional).** Owning task MB-67. | — | pre-push summary line |
| R-KM (G12) | **No exception paths; each step code commit carries its panel record (provisional).** Applies to every step family, including permits when unfrozen. Owning task MB-67. | Applies 124:19, R-BA, Spec 08 §7 rule 4 | gate arm |
| R-KN (G13) | **Step and evaluator-extension code holds no by-law knowledge as a literal (provisional).** Numbers allowed: 0, 1, −1, 2, 100 — structural constants (counting, sign, halving, percent), not thresholds, limits or rates; everything else is `l2()`, `lv()` or a table value. Strings allowed: the closed status words and table field names. Conflict check: core.8 "or an exact zero" (132:153) — the allowed set is structural, stated with its reason. Owning task MB-67. | Applies Rule 3, core.8 | ast-grep arm (red on the held `maxbld-invariants.mjs` and on `LIFT_ZONES`) |

### 4.2 Spec 69a: new rows and dated notes (render as Spec 133 m.* lines)

| # | Rule | Why | Enforced by | Status |
|---|---|---|---|---|
| *Dated note on M-61* (was LC-70, F-40) | **The formula catalogue is M-61's formula registry, now built.** File `scripts/seeds/bylaw/layer3-catalogue.json` (protected path). Each row keeps M-61's form (field × tier, an M-72 expression over `l2()`, `lv()` and the `vocab.json` geometry inputs) and adds: `applies_to` (building types, scenarios), `clauses[]`, `status_map`, `example_ids[]` (the examples live in the T-lane oracle files, one owner, F-33), and `switch` (an M-378 id). (1) Changing a calculation = editing a row and its examples; (2) a form the grammar cannot express is a ruling to extend M-72, never per-row code; (3) every change goes through the loop: run, compare with the last accepted run (a committed JSON record), accept with a recorded reason, or revert; after K rounds without the MB-13 thresholds, an operator card (K: O-14). Retires `scripts/analysis/phase3/phase3-literals.json` as a source: each entry becomes a Layer 2 target or is removed (narrows M-376 SC-Q3, 69a:512). Supersedes Spec 78 §6.3's first-release deferral (78:496) and, for Layer 3, LC-28 (131:71). Owning task MB-31. | Card P3-DATA-MODEL; audit #3, #63. | `layer3-catalogue.logic` (every written field has a row; every input resolves to an `l2()` target, a seeded `lv()`, a `vocab.json` geometry input or another row; every switch id exists, F-45); `loop-record.logic` | PROPOSED |
| *Dated note on M-72* | Built in MB-31 with its planned lock `bylaw-p3-dsl.logic.test.ts`; no additions. | audit #64 | `bylaw-p3-dsl.logic.test.ts` | PROPOSED |
| **M-378** | **One switchboard (F-08, F-31).** File `scripts/seeds/bylaw/switchboard.json` (protected path). Row: `{id, kind, state, ruling, reason}`; kind ∈ `clause`, `formula`, `scenario`, `building_type`, `reading`. A `reading` switch id is part of every result key it affects, so two readings of one number never collide (F-45); a referenced switch id that does not exist fails the shape test. (1) Default on; (2) **off beats on**; (3) a `clause` switch turns off every catalogue row whose `clauses[]` names it — so a by-law is switched off in Layer 3 without changing Layer 2; (4) a `reading` group names its readings; the scoring reading is the operator's (or, until ruled, the proposed default) and the other is reported beside it; the reading id is part of the result key (F-45); (5) every result's trace lists the switches on its path; each run records the switchboard sha. Absorbs LC-48's `coxwell_generous_reading` (78:1041, dated note on LC-48), the MB-62 D1 two-reading group and MB-65. Conflict check: M-25 holds, `amendments.json` statuses — unchanged; Spec 134 — unchanged (no Layer 2 change). Owning task MB-31. | Operator 2026-10-30: "turn on and off bylaws". | `switchboard.logic` (each kind both ways; off beats on; unknown id fails) | PROPOSED |
| **M-379** | **House with a secondary suite differs from the detached house only through LC-33's closed gain reasons; INV-3 is about the rear suite.** As v2. Owning task MB-64. | audit #11, #49 | invariant row in the loop set | PROPOSED |
| **M-380** | **Expected answers are the authority.** Worked examples (M-358: operator-checked, never LLM-filled) and expected answers derived fresh from the keyed golden lot facts, the Phase 2 limits and the by-law text, by a seat that has never read the old engine, Spec 78 P5.2 / P5.9 or `hand.mjs`, then checked by the operator (MB-62 values are reference only) are protected paths; an accepted loop change names the cases it made pass; one Layer 3 writer. Owning task MB-64. | MB-17 Q3 | pre-push summary; loop record | PROPOSED |
| **M-381** | **Register conflict search before a ruling is recommended.** Owning task MB-67. | MB17-Q1 vs M-180(1) | `decision-log --check` arm | PROPOSED |
| **M-382** | **WIP limit and definition of done.** Done = commit + named test green + ruling recorded + queue line. At most N held patches (proposed default N = today's count, 12, and it may only fall — reason: a lower N would deadlock work already held; operator decides, O-6). A lane is one writer branch. Owning task MB-67. | queue v2:4 | pre-push summary; queue check | PROPOSED |
| **M-383** | **The five objectives bind every McBylaws phase** (R-BA 124a:238; Spec 68 §4). Owning task MB-66. | gap G-OBJ | `spec133-bylaw-handbook.logic` | PROPOSED |
| **M-384** | **Record CARD P3-DATA-MODEL and the narrowed CARD-L3-REBUILD** (operator words as v2). O-2 is answered. Owning task MB-66. | — | `decision-log.logic` | ANSWERED; to record |
| *Dated note on the 69a header* | "Next free id" is generated (69a:12 said M-334; highest is M-376). Owning task MB-66. | audit §3.2 | generator `--check` | PROPOSED |

### 4.3 Spec 131: dated notes only (render as Spec 133 lc.* lines)

| Row | Dated note | Owning task |
|---|---|---|
| LC-16 | The closed scenario set becomes the building-types table `scripts/seeds/bylaw/layer3-building-types.json` (first release: detached house; detached houseplex; house with a secondary suite; three renovations; rear-suite add-on). Semis are a recorded future build (M-376 SC-Q1): absent, counted `not_evaluated:future_build`. | MB-31 |
| LC-21 | "No FSI cap, no storey cap" is the zone-clause reading; on an exception lot M-180(2) as narrowed by M-252 decides. A0067, A0094, A0166, A0170 are a `reading` group until O-3 is ruled. | MB-31 |
| LC-48 | The Coxwell reading moves from a logic variable to a `reading` row of the switchboard. | MB-31 |
| New cards S-1, S-2, G-1 (replace the v2 "P5.2 item 4" note) | Storey height (S-1), first-floor height (S-2) and buildable-area shape (G-1) are NEW proposed settings or catalogue rows. Each needs a rule cite or an operator card. No value is carried from Spec 78 P5.9 (storey height 3.0, first floor 0.6, circulation 0.10, …). No geometry is carried from P5.2 (rectangular plate, attic cross-section, dormers, pitched/flat pair). Attic and roof form are a later increment with their own card G-2. | MB-31 (S-1, S-2, G-1); MB-27 (G-2) |

### 4.4 The settings register (F-09, F-38)
Every non-law number is `compute_maxbld_scenarios_<name>`, "seeded by migration in R-CV form with bounds and `scale`. Law numbers are never logic variables" (78:1018). Register: `scripts/seeds/logic_variables.json`, the seed migration, and the generated `docs/reference/logic-variables-registry.md` (drift guard `logic-vars-registry.infra.test.ts`). Written by provider `claude` (orchestrator-only registry, 08:145); declared from the catalogue's `lv()` inputs (nothing imported); migration applied at MB-35.

### 4.5 Spec 08 §7 — proposed rule 10 (does not exist today)
> **10. Claims and briefs are checked before they leave the orchestrator.** (a) No recommendation goes to the operator without its rule quoted with `file:line` (`card-cite-check.mjs`). (b) A DeepSeek brief names only checks runnable through `bash_allow` (§C.4); otherwise provider `claude` with the reason logged (§B). Owning task MB-67.

### 4.6 Spec 69 header — dated note
> "the five objectives" (69:26) are standardized, observable, scalable, accurate and understandable (R-BA; Spec 68 §4; M-383). Owning task MB-66.

## 5. Objectives and success criteria (Spec 68 rows; owning task MB-66)

| # | Objective | Phase |
|---|---|---|
| **O-9** | **Limits only from the table** (declared scoping; no code chooses a rule). | 2 |
| **O-10** | **Every Layer 2 result cites itself** (winner or absence ruling, losing candidates, closed status, inputs). | 2 |
| **O-11** | **Nothing typed in**: every Layer 3 number from Layer 2, catalogue rows, building types, switches, settings. | 3 |
| **O-12** | **Accurate against real cases**: MB-13 thresholds on the regression set, then on the proof set. | 3 |

| # | Criterion | Measure (closed) | Baseline | Target | Phase | Measured by |
|---|---|---|---|---|---|---|
| **SC-14** | Layer 2 scoping is data | rule-choice branches outside `evaluate.mjs` candidate selection | not measured | **0** | 2 | G-EXC-LIT (MB-18) |
| **SC-15** | Layer 2 results cite | Spec 134 I2 violations (134:85) | not run | **0**, checked at the MB-26 night; **not part of the Phase 3 exit** (F-30) | 2 | `resolve_bylaws` I2 |
| **SC-16** | Layer 2 never defaults | `inputs_defaulted` (134:91) | MB-54 finding | **0**, checked at the MB-26 night; not part of the Phase 3 exit (F-30) | 2 | `resolve_bylaws` I10 |
| **SC-17** | Layer 3 numbers sourced (F-36) | G13 findings + catalogue inputs that resolve to nothing | — | **0** | 3 | G13 (MB-67); `layer3-catalogue.logic` (MB-31) |
| **SC-18** | Calculations declared | written Layer 3 fields with no catalogue row | no catalogue | **0** | 3 | `layer3-catalogue.logic` |
| **SC-19** | Accuracy on real cases | per M-362 (GFA, height, storeys, footprint, units): direction; CAUGHT + CAUGHT-ESTIMATE; CAUGHT; false, soft alarms; wrong limits | round 1 (queue v2:117) | **≥ 90 % per measure; ≥ 70 %; ≥ 50 %; ≤ 10 (0 on existing-lot minimums, party walls); ≤ 15; ≤ 3, 0 with complete inputs** (M-362, 69a:498) | 3 | the loop (MB-27), the proof set (MB-28) — **the Phase 3 exit** (F-46) |
| **SC-20** | Shadow explains every difference | `unexplained`, `layer3_defect` | not built | **0, 0** (M-71, 69a:131) | after exit | shadow (MB-33) |

## 6. Proposed defaults (F-42) — none is ruled; each is "proposed default, operator decides"
| Parameter | Proposed default | Reason |
|---|---|---|
| N, held-patch limit (O-6) | today's count, 12 (11 files in `mb26/held/` + the MB-64 patch), only falls | below today's count the checker would block work already held |
| K, loop rounds before a card (O-14) | 3 | lets each finding get a fix and one correction before the operator is asked; a judgement, not a measured value |
| Proof-set re-keys (O-15) | 1 | each re-key costs the operator ≥ 25 new cases (M-362); after one failed proof set the operator decides |
| Operator check sample (O-10) | the first example of every formula + every boundary example | M-358 places examples "either side of every max/min switch"; the boundaries are where formulas change |
| Scoring reading for D1 (O-3) | M-180(2) (uncapped), the other reported beside it | x1462's "a permitted building type" names no type, so M-252(1)'s carve-out does not apply; a by-law reading for the operator |
| S-1, S-2, G-1 (O-4) | G-1: the rectangle from frontage and depth, disclosed. S-1, S-2: no proposed value; the operator gives one or a source is cited | frontage and depth are M-61's geometry inputs; any storey-height number would otherwise be inherited from P5.9 |
| `search()` (O-16) | withdrawn | it was the old engine's design |

## 7. What the operator approves at O-1
The anchor (§0), the model (§2), BOOT-1, the pre-push anchor and the `APPROVED` hold file (§1), rows R-KF…R-KN, M-378…M-384, the dated notes (M-61, M-72, LC-16, LC-21, LC-48, 69a header, Spec 69), cards S-1, S-2, G-1, Spec 08 §7 rule 10, Spec 68 O-9…O-12 and SC-14…SC-20, the audit's four **proposal** drops (`HANDBOOK-AUDIT.md` §5, F-50), and the defaults in §6 (each may be changed).

## 8. Fold record
Round 2 KEEP applied: F-28 (BOOT-1), F-29 (MB-69's check reduced to DONE commits, merged into MB-67), F-30 (SC-15/16 out of the exit; checked at MB-26), F-31 (no `bylaw` kind; `clause` switch in Layer 3), F-32 and F-49 (R-KN allowed sets), F-33 (examples in T-lane files; rows hold ids), F-34 (operator pre-push summary replaces `registry_reserved`, ruling-id binding, hashing and extra checkers), F-35 (panel records when patches land), F-36 (SC-17 redefined), F-37 (G3 code paths only; Rules lines on product and night tasks), F-38 (settings by `claude`), F-39 (committed CoA case files in MB-64), F-40 (anchor on M-61/M-72; LC-70 → dated note on M-61; no new runner; helpers re-checked), F-41 (`mcbylaws/APPROVED`), F-42 (§6), F-43 (loop results as JSON), F-44 (queue: dropped patches, MB-35 dump, one artifact per task), F-45 (reading in the result key; switch-id test), F-46 (exit = MB-13 thresholds on the proof set; queue), F-47 (MB-23 merged into MB-31), F-48 (`l2()` statuses from M-72), F-50 (audit). The seven round-1 follow-on defects (F-01, F-03, F-07, F-12, F-13, F-16, F-22, F-23) are closed by F-28, F-34, F-41, F-29, F-42, F-42, F-44, F-30. REJECT and MOOT findings not applied.
