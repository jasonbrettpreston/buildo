# SPEC 124 — Step Standard Policy (the McDonald's standard)

> ## ✅ RATIFIED 2026-08-28 — R-G..R-J
> Extracted from Spec 122/123 (P1–P5, the architecture decisions, the programme and vocabulary rulings) by a read-only policy audit, then finalized and ratified by operator ruling R-G..R-J. Registered in `docs/specs/00_system_map.md`. Spec 122's own §1.2a now points back here (R-J) — this is the standalone home of the policy, not a summary of it.

**Status:** RATIFIED · **Scope:** every step in the pipeline estate, present and future — not scoped to the
Step-Opt conversion programme.
**Relationship to Spec 122:** 122 is the *architecture* (descriptor + library + generated validator, under
islands); 124 is the *policy* (what any step, in any architecture, must hold). 122's P1–P5 and its permanent
rulings are the source this spec was extracted from; where 122 is retired or superseded, 124 survives it.
**On conflict during the transition, Spec 122 governs** (it carries the live schema).
**Relationship to Spec 123:** 123 is the *procedure* for getting an existing step to comply; 124 does not
restate it.

---

## §1. Purpose

Every step in this estate is the same step, except for its compute. That is the creed: nothing about how a
step is gated, guarded, validated, recovered, or observed is a per-step invention — it is a declaration
chosen from a closed menu, and the library, the schema, and a small set of shape rules make every other
answer either impossible to omit or impossible to hide. A step author's discretion begins and ends at the
compute. This spec is the durable half of that standard — the part that must still be true after Spec 122's
conversion programme finishes and the packaging it describes is forgotten.

## §2. The rules

Thirteen rules (Rule 13 added by R-R, 2026-08-29). Each is enforced today, or marked ⚠ GAP with the artifact that would close it.

---

**1. Nothing about a step's behaviour may live only in code — it is descriptor data, a declared check, a shape rule, or (last resort) a new schema field.**
- **Enforced by:** `checks` cannot be omitted (`step.schema.json:1095-1099`, `type:"array", minItems:1`); `scripts/ast-grep-rules/compute-shape.yml`'s five rules block the commonest hiding places (console, bare fetch, wall clock, `process.env`, forbidden `require`s) inside compute.
- **Archetype variance:** none.
- **Evidence:** pilot 1's four fences (`assert_schema`) were each moved to descriptor data or a named check rather than left as unexplained code.
- **Violation reads as:** a build failure at `pipeline.step()` construction (AJV) or a red `compute-shape` ast-grep scan in `.husky/pre-commit`.
- ✅ **GAP G-1 CLOSED (2026-08-29).** The *preference order itself* still cannot be verified after the fact (there is no artifact proving a cheaper rung was tried first) — what closes instead is that reaching for the last-resort rung must now be DECLARED, in writing, at the moment it happens. `scripts/steps/_schema/schema-baseline.json` snapshots every `category.field` pair the schema declares; `scripts/steps/_schema/generate-schema-baseline.mjs --check` (shelled by `step-conformance.infra.test.ts`'s "G-1" lock) requires any field NOT in that snapshot to carry `x-ruling: {rungs_tried, why}` on its own schema node, or fails the build — the same "adjudication is a reviewed diff, not something a descriptor grants itself" posture `grandfathered.json` already uses for V7. `--write` regenerates the baseline, intended to run only after a human reviews the new field's `x-ruling` in the same diff. Proven both directions (RED on a fixture field with no `x-ruling`, GREEN on the same field once one is added).

**2. Compute contains domain logic only — no gating, ledger, lock, emission, logging side-channel, environment read, or policy comment.**
- **Enforced by:** `compute-shape.yml` (5 rules) + `check-step-shape.mjs` (blocking over `scripts/lib/compute/**`) + `step-conformance.infra.test.ts:532-620` (dispatch keys ≡ declared check ids, proven to fire on a known-bad fixture).
- **Archetype variance:** none, except ASSERT's compute never opens `ctx.pool` at all (its `outputs`, `recovery`, `counters` are forced `"none"`).
- **Evidence:** the compute-shape gate's own blocking loop was found missing on 2026-08-25 (it scanned and reported but never failed the build) — fixed the same day; the incident is the strongest argument for keeping this a shape rule rather than a review checklist.
- **Violation reads as:** a red ast-grep scan naming the file, line, and rule id.

**3. Every threshold, sample size, byte window, timeout, retry count, limit, or rate a step consumes is a registered logic variable resolved through `ctx.config`, never a literal — PRESENCE of its `logic_variables` row is always FAIL (R-G), and VALIDITY is per-variable via the closed `on_invalid` enum: `fail` is MANDATORY for a verdict- or write-affecting variable, `default`/`clamp` are allowed only for the rest, each carrying a stated `why`.**
- **Enforced by:** `compute-no-literal-url-tunable`/`-byte-window`/`-threshold` (`compute-shape.yml`) + `step-conformance.infra.test.ts:772-943` (declared ⊆ registry, declared ⊆ admin GROUPS, consumed ≡ declared, each direction proven RED) + `scripts/lib/step/config.js` (PRESENCE half: throws when a declared name has no `logic_variables` row, naming the remedy — LM-D15).
- **Archetype variance:** none.
- **Evidence:** pilot 1's own first violation (`assert_schema` declared `config:"none"` while compute hard-coded `limit=20`, `Range: bytes=0-2048` and `bytes=0-8192`), remediated before pilot 2. **R-G's grounding:** the old P4 sentence ("no row ⇒ FAILED run") never distinguished presence from validity, and practice already contradicted its literal reading — `link-massing.descriptor.json` uses `on_invalid:"fail"` for only 3 of 6 variables, `load-ravines`/`assert-schema` use `default`/`clamp` for every one, each justified in `deviations[]`. This rule states the split that was already true.
- **Violation reads as:** a red conformance test naming the literal, or a runtime throw naming the missing registry row (presence). No machine reads a validity failure yet.
- ✅ **GAP G-4 CLOSED for the VERDICT half (2026-08-29), WRITE-affecting stays PROSE-ONLY.** VERDICT-affecting is mechanically decidable — a `config.logic_variables[]` entry is verdict-affecting iff some `checks[].limit_from_config` in the same descriptor names it, the schema's own established mechanism for "this value moves a check's PASS/WARN/FAIL boundary." `scripts/analysis/step-validate.mjs`'s `checkOnInvalidFail` requires `on_invalid:"fail"` for every such variable, UNLESS `deviations[]` carries a dated, adjudicated exception naming `on_invalid`/`fail` — real descriptors already have one: `load_ravines`'s 6 variables are all `default` despite 3 being verdict-affecting, ratified against the mig-099 cloud-seed-timing hole (`fail` would halt the `sources` chain on every un-seeded database). Measured live 2026-08-29: **0 violations across all 5 converted steps** — every verdict-affecting variable is already correctly `fail`, or covered by a reviewed deviation. WRITE-affecting has no equivalent named schema mechanism anywhere (no `*_write_affecting` field convention exists) and stays an honest GAP rather than an invented one.
- ⚠ **GAP (R-D)** — the chain-start presence check (`declared_logic_variables_present` on `assert_schema`, blocking, `when:"pre"`) is not yet in the descriptor; `config.js`'s runtime throw (LM-D15) is the interim backstop. See Spec 122 R-D.

**4. A rule kept in compute rather than declared data must still be written down — as a check's `why`, not a comment.**
- **Enforced by:** nothing machine-checked. Applied narratively in the Intent Ledger, whose discoverer≠ adjudicator role split is Spec 123 §7.1 (§4.2 below states the *rule*).
- ✅ **GAP G-2 CLOSED (2026-08-29), narrowed honestly.** A disposition (a markdown table row in an assessment report) and a specific check's `why` (a JSON string in a descriptor) share no id to join on — there is no mechanical way to prove row N's rule IS check id X's `why` without semantic understanding this tool does not have. What closes instead, matching the report culture's own existing practice (pilot 3's Intent Ledger already writes *"preserved-in-compute (`buildMatchSql`, A-2) ... DECLARED in `notes.json`"*): `scripts/analysis/step-validate.mjs`'s `checkPreservedInComputeHasWhy` requires every `preserved-in-compute` Intent Ledger row to itself NAME where the rule is written down (`why`/`notes.json`/`checks[]` appearing in the same row) — feeds the Rule-4 policy-matrix status. Proven both directions in the tool's own self-test (Spec 121 §12b.6), exercised on every `step:validate` run. **Measured live 2026-08-29, not massaged:** 2 of 5 converted steps (`assert_schema` 5/6 rows ungrounded, `link_wsib` 4/8) currently fail this check — real, pre-existing findings, left as-is per the same "do not retroactively fix pilots 1-4" discipline `review_followups.md`'s R-R backfill entry already states.
- **Archetype variance:** none.
- **Evidence:** pilot 1's coordinate-source OR-contract — kept in compute, its rule stated in the descriptor `checks[].why` and `limitations` by ruling, not by a check.
- **Violation reads as:** nothing today (this is exactly the ⚠ GAP).

**5. `checks` may never be `"none"` — every step declares at least one.**
- **Enforced by:** `step.schema.json:1095-1099` — `checks` is typed `array, minItems:1`; a step cannot construct without it.
- **Archetype variance:** none — the one category every archetype leaves untouched, even ASSERT (which forces `outputs`/`recovery`/`counters` to `"none"` but not `checks`).
- **Evidence:** all 3 converted steps carry 8–19 checks each; ASSERT (`assert_schema`) has the fewest live categories of any archetype but still declares 9.
- **Violation reads as:** a schema-validation throw at `pipeline.step()` construction, before compute runs.

**6. Every category is present, and every field inside it is answered — `"none"` is legal but must be written, never omitted.**
- **Enforced by:** `step.schema.json`'s top-level `required` (18 categories) plus per-field `required` arrays nested throughout.
- **Archetype variance:** none.
- **Evidence:** the schema itself is the enforcement; a descriptor missing any of the 18 fails AJV outright.
- **Violation reads as:** a schema-validation throw naming the missing field.

**7. A step's archetype determines which categories are live — a step may not omit a category its archetype requires, and may not answer a category its archetype forbids.**
- **Enforced by:** `step.schema.json`'s `allOf` blocks keyed on `identity.archetype` (`step.schema.json:1373-1443`) — six profiles, one per non-degenerate archetype grouping.
- **Archetype variance:** this rule *is* the variance mechanism — see §3 below.
- **Evidence:** the schema comment on the ENRICHER profile names claim #54 (a `staleness.scope` on a lineage column implies a declared invalidator) as "the centroid defect made unexpressible."
- **Violation reads as:** a schema-validation throw at construction naming the archetype and the forbidden or missing field.

**8. A write target's discipline class, guard, and scope are declared per write target — never assumed for the whole step.**
- **Enforced by:** `step.schema.json`'s `outputs.writes[].write_discipline` shape, with `if`/`then` blocks requiring `guard_why` when `guard:"none"` (`:279-280`) and `why` for `staging_full_replace` (`:291-292`).
- **Archetype variance:** applies to INGESTOR/LINK/MATCHER/ENRICHER (any archetype whose `outputs` is an object); N/A for ASSERT (`outputs` forced `"none"`).
- **Evidence:** `link_massing`'s E1/E2 targets declare two different disciplines (`set_based_scoped` guarded none, `guarded_upsert`) on two different write targets in the same step.
- **Violation reads as:** a schema-validation throw naming the write target and the missing `why`.

**9. A banned write shape (an unguarded set-based write, an insert-only step with no retraction) may ship only with a dated, committed, SHA-anchored ledger entry naming who approved it — a `why` string alone is not enough (promoted from pilot practice, R-I.2).**
- **Enforced by:** `scripts/steps/_schema/grandfathered.json`, read by `assertGrandfathered` at `pipeline.step()` construction (before any pool opens) — refuses a banned value with no matching entry even when the schema's own `guard_why` is present.
- **Archetype variance:** applies wherever `outputs` is an object; N/A for ASSERT.
- **Evidence:** `link_massing`'s E1 target (`write_discipline.guard:"none"`) is grandfathered against commit `5bb31faf`, operator name, and date — the schema's own fixture for this shape is grandfathered the same way, so the rule cannot be satisfied by weakening the fixture.
- **Violation reads as:** a construction-time throw refusing the descriptor, naming the ungrandfathered path.

**10. The verdict is always derived from the declared checks' rows — never a parallel boolean, never a hardcoded literal.**
- **Enforced by:** `scripts/lib/step/verdict.js` (`deriveVerdict(rows)`) is the only place a verdict is computed; `step-library.logic.test.ts:145-283` — "the verdict is ROW-DERIVED, and all three values are reachable."
- **Archetype variance:** none — runner-owned, no archetype may opt out.
- **Evidence:** AS-D1 (sources verdict read the raw error array, not the row set) and LM-D2 (a hand-rolled per-script cascade plus a boolean-driven severity) both closed by routing through this single function; a repo-wide grep for `'FAIL'`/`'WARN'` literals across the library returns exactly the rows inside `verdict.js` itself.
- **Violation reads as:** a red `step-library.logic.test.ts` assertion, or (pre-conversion) a fleet-wide finding that a script structurally cannot emit WARN or FAIL.
- **R-Q / R-R note (2026-08-29):** `step-library.logic.test.ts` is outside `step:validate`'s own run scope (spec-named as step-conformance + golden-fingerprint + `src/tests/steps/<slug>/` only), so `step:validate`'s policy matrix prints this rule PROSE-ONLY per step rather than claiming a false enforced-green — a scope caveat, not a claim the rule is unenforced elsewhere. Separately, this commit's G6 ledger-normalization work fixed one concrete instance of a severity-conflated counter reaching the ledger (`LPA-D2`), the same defect class R-Q (`checks_failed`/`checks_warned` split, `LPA-D6`) closed in the library itself.

> **R-H addendum (2026-08-28).** Rule 10 governs HOW the verdict is derived, not WHICH severity a check should choose. That gap let pilot 3's ruling A-6 dispose `nearest_footprint_gt_lot_count` and `shared_primary_buildings` as INFO for a standing non-zero population — conflicting with Spec 48 §4.9 / `tasks/lessons.md:117`: **a metric expected to be permanently non-zero is WARN with a declared, machine-observable retighten condition — never FAIL, never INFO-by-taste.** INFO is legal ONLY for a purely descriptive counter no threshold could bound, and that exception must itself be declared in `checks[].why`. Consequence: **LM-D6/LM-D11 re-dispositioned OPEN → WARN + a declared retighten condition, carried to pilot 4** (defect ledger + review followups amended in the same commit). ⚠ **GAP G-5** — no check yet distinguishes "purely descriptive, no threshold possible" from "INFO chosen to avoid a red"; author judgment only, same class as G-2.

**11. A ruling that reorders a step's phases must re-derive every "before X" guarantee stated in that step's own governing spec, in the same commit (promoted from pilot practice, R-I.1).**
- **Enforced by:** nothing generic. The one instance found (Spec 59 L7/L8's "abort before any write") was closed by adding `checks[].when:"pre_write"` to the schema and a pre-write gate to `scripts/lib/step/index.js` — a per-incident fix, not a standing check that the *next* phase-order change will be audited the same way.
- ⚠ **GAP G-3** — no mechanism re-checks a step's governing spec for "before X" language when the library's phase order changes generically (e.g. a future ordering change to ENRICHER or LINK phases).
- **Archetype variance:** matters most for INGESTOR (acquire→validate→write→score) and any archetype using `checks[].when:"pre_write"`; N/A for ASSERT (no writes to order against).
- **Evidence:** LR-D9 — converting `load_ravines` to the INGESTOR archetype silently retired Spec 59's write-order guarantee until the Regression Guardian caught it in a fold review, one commit after it shipped.
- **Violation reads as:** nothing today, absent a reviewer catching it by hand (⚠ this is the GAP).

**12. A write target with a destructive full retraction (`retract_when:full_only` or `retract:"all"`) declares a truthful crash-recovery posture — `"none"` is legal only with a stated why.**
- **Enforced by:** `step.schema.json`'s `recovery.interrupted` field (required when a destructive retraction target exists) + `step-conformance.infra.test.ts:1039-1073` (RED on `"none"`, RED on missing).
- **Archetype variance:** applies to LINK and any INGESTOR with a full-retraction write; N/A for ASSERT/RECORDER.
- **Evidence:** a killed `link_massing` forced-FULL run left `parcel_buildings` at 29,330/520,492 rows; the next run's gate read "unchanged" and the hole persisted silently — this is the incident the rule exists to make undeclarable.
- **Violation reads as:** a schema-validation throw at construction. *(Note, updated 2026-08-29: BOTH halves are now CLOSED. The DECLARATION half — `recovery.interrupted` and the paired `recovery.before_image` (R-M), both required, truthful, schema-enforced fields, R-M's before-image mechanism BUILT and LIVE-FIRED (`d07529af`, LG-17 — `link_massing`'s genuine forced-FULL wrote a 520,492-row before-image file before its retraction ran). The RUNTIME half — `staleness.detectInterruptedRetraction` auto-detects a `crashed`/stuck-`running` prior run for a step's own producer slugs and `selectMode` forces FULL unconditionally, wired into `runCascadePhase`/`runLinkPhase` (`LW-D20`/`LG-19`, Spec 122 R-B) — closed by a live kill-and-rerun proof against `link_wsib` that found and fixed two real bugs (a step self-detecting its own just-opened row; the check being unreachable behind the ledger gated-skip), both now regression-locked fast (fake-pool) and against real Postgres. "Declared" and "automatically enforced" are now the same posture.)*

**13. A step validates itself — the Spec 123 §6 scorecard and this spec's own policy-coverage matrix are generated by one command, run for every converted step, and enforced (never a separate, hand-maintained track).**
- **Enforced by:** `scripts/analysis/step-validate.mjs` (`npm run step:validate -- --step=<slug>` / `--all`): runs `validateDescriptor` (Rules 1, 5–9), the ast-grep shape gate scoped to the step's own file + compute (Rules 1–2), the step's own `src/tests/steps/<slug>/` + the shared conformance/golden-fingerprint suites, the golden-capture invocation/fingerprint/diff check (G8), and derives the full G0–G9 scorecard plus a Rules-1–13 coverage matrix — all from committed artifacts. `step-conformance.infra.test.ts` asserts every converted step's assessment report carries a `## Validation scorecard (generated)` block equal to a fresh run (drift is red). `.husky/pre-commit` runs `step:validate --all --fast` first (the vitest spawn skipped, everything else run, plus 7 always-on fast invariants); `.husky/pre-push` re-runs it plus `typecheck` (defeats a bare `--no-verify`).
- **Archetype variance:** none — every archetype's descriptor is validated, shape-gated, and scored the same way.
- **Evidence:** pilots 1–5 backfilled by `step:validate --all --write` (R-R, 2026-08-29) — `link_parcel_addresses` scored 8/17 on the FIRST honest run (real hard-stop: `LPA-D2`'s ledger status wasn't literally `CLOSED`/`PIN`, and a later WF3 fix's `records_meta` shape change wasn't yet re-explained in the report), fixed by two real documentation commits rather than by loosening the gate — 14/17 after.
- **Violation reads as:** a red `step-conformance.infra.test.ts` assertion naming the stale/missing scorecard block, or a non-zero `step:validate` exit (a hard stop on G6/G7/G8/G9 or a fast invariant) in `.husky/pre-commit`/`pre-push`.
- **Rule 13's own boundary (R-T addendum, filed 2026-08-29, BUILT 2026-08-30 — this same programme's follow-on WF2).** `step:validate` conflates two different questions under one name: whether a step's *process* was followed (G0–G9, the policy coverage matrix) and whether a step's *data* is plausible (Spec 79/120/30 §5.4.1's bound doctrine — **not bare "§5"**, Fold B-6, 2026-08-30: Spec 30 §5 is the CI/CD section; §5.4.1 is the runtime verdict/halting-semantics section the bound doctrine actually lives in). **The rule: "the validator validates DATA (Spec 79/120/30 §5.4.1); the scorecard validates process, from structured artifacts."** Both halves are now BUILT: the scorecard half (G0–G9, as specified above) and the DATA half — `invariants[]`/`plausibility[]` bounds (threshold-derived/reachable/last-measured-value-beside-the-bound, §9 below), the seam-validation pass (`scripts/lib/step/seam.js` — over `inputs.reads.steps[]` declared step-edges, corrected from the original "`outputs.invalidates` edges" phrasing: that category is `{table,column,when}`-shaped, a step's own re-eligibility scope, not a producer→consumer edge — closes VAL-3/LDG-2/LDG-7's concern), chain-end synthesis automation (`scripts/analysis/chain-end-synthesis.mjs`, the `sources` chain's roll-up + the declared cloud trigger for `validate_only` invariants, Ask 6(b)), and R-U's chain-run correlation (`records_meta.chain_run_id`, below) that both the seam pass and chain-end synthesis join on. The layer table above states WHERE each half lives (descriptor declares, library executes, compute only measures). **The DATA/PROCESS split has a SECOND enforcement point, not just declaration (Fold B-3):** every synthetic invariant/plausibility row carries a REQUIRED, closed `source: check|invariant|plausibility` field distinct from `kind` (`scripts/lib/step/verdict.js`'s `checkRow`) — so a consumer reading only the EMITTED audit table (never the descriptor) can still tell a DATA row from a PROCESS row without re-deriving it from naming convention; chain-end synthesis and `step-validate.mjs`'s scorer both key off this field. **Scoped as BUILT, not fully DE-REGEXED**: the scorecard's own six prose-regex gates (`G0`/`G1`/`G3`/`G4`/`G5`/`G9`, `section()`/`splitTableRow()`-scraped from free-form report text) are UNCHANGED — only `G2`'s vacuous-green (Spec 123 §6's own documented defect) and the defect-ledger/`notes.json` strict-row-schema parse (`G6`/`G7`/`G4d`) were fixed, per Ask 3's own scoped default; the larger de-regex lift is filed as `nice_to_have` in `programme-items.json` (§9 below), not silently dropped. Programme item `VAL-WF2` (`batching_prereq`) CLOSES with this commit; `REGEXSC` is `SUPERSEDED` by it (unchanged from the original filing); `G2` is `PARTIAL` — the vacuous-green half closes here, the churn×complexity-plot BUILD half stays its own `S6b` item (operator ruling 2026-08-25 decision 2, `review_followups.md:2994`, unchanged).

## §3. Archetype variance table

`✓` = must answer per the schema's `allOf` profile · `N/A` = category is forced `"none"`/inapplicable by
profile · text = modified how.

| Rule | ASSERT | INGESTOR | LINK | MATCHER | ENRICHER | BACKFILL | MATERIALIZER | RECORDER |
|---|---|---|---|---|---|---|---|---|
| 1 Nothing hidden | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 Compute is just compute | ✓ (no `ctx.pool` reachable) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 Tunables externalized (presence/validity) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 Compute rule declared | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 checks ≥ 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 Omission fails | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 Archetype gates categories | forces `outputs`/`recovery`/`counters`→`none` | `outputs` must be an object | `invalidates` non-empty, `counters` object | `invalidates` non-empty, `counters` object | `invalidates` required when `staleness.scope` keys a lineage column | `recovery.reset` ≠ `none` | `recovery.reset` ≠ `none` | `outputs.publish` ∈ {direct,pointer} |
| 8 Per-target write discipline | N/A (`outputs:"none"`) | ✓ | ✓ | ✓ | ✓ | ✓ (if it writes) | ✓ (if it writes) | ✓ (if it writes) |
| 9 Banned write needs ledger | N/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 Verdict row-derived (+severity, R-H) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 Phase-order re-derive | N/A (no writes) | ✓ (acquire→validate→write→score) | modified — link/retract ordering | modified | modified | modified | modified | N/A (verdict_only) |
| 12 Truthful crash posture | N/A | ✓ if full-retraction write | ✓ | ✓ if applicable | ✓ if applicable | ✓ if applicable | ✓ if applicable | N/A |
| 13 A step validates itself | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## §4. When the policy is unclear — the ruling protocol

1. An agent pass (or a reviewer) **discovers** the ambiguity and proposes a disposition, using the closed Intent Ledger vocabulary (`preserved-in-runner \| preserved-in-validator \| preserved-in-compute \| encoded-as-descriptor-field \| encoded-as-deviation \| knowingly-retired`).
2. **A different party adjudicates — never the pass that discovered it.** This is a **policy rule**, not merely a procedure step (Spec 123 §7.1, restated here per R-I.3): the same pass may never both discover a fence/ambiguity and rule on its disposition. The adjudicator is named and dated.
3. The ruling is recorded in **§5's Register of rulings** with an id, the statement, and what it amends.
4. **A rule without a lock is not yet a rule** — the same commit that records the ruling adds a both-directions test (red on the old behaviour, green on the new) proving it.
5. If the ruling changes what §2 says generically (not just for one step), this spec is amended in the same commit as the lock — a ruling that only lives in a pilot report or a defect-ledger row has not yet reached policy.
6. **Promotion criterion — pilot-local → estate-wide.** A ruling stays pilot-local (a Defect Ledger row, `<PREFIX>-D<n>`) until it is **expected to recur in another archetype** — that expectation is what promotes it into this register as a lettered ruling. The feeder is the `§R Reflection` "RECURRING/STANDARD-SHAPING" table (Spec 122 R-F; Spec 123 G9): an issue entered there with a named archetype match becomes a register candidate at the next ruling pass, not before. A ruling with no recurrence claim stays a ledger row.
7. **A document move or consolidation this protocol produces is verified by a line-set diff before commit (R-I.4)** — every non-empty moved line found verbatim in the destination, nothing dropped; a mismatch is filed as a defect, never silently merged. A transcription claim is executable, and is therefore executed.

## §5. Register of rulings

**This section is the authoritative register going forward (R-J, 2026-08-28).** Spec 122's own top-of-file
tables — the three architecture decisions (A1–A3), the six programme rulings (R1–R6), the seven vocabulary
rulings (V1–V7), and its copy of R-A..R-F — remain as **history**: read them there for full pre-2026-08-28
text and evidence. This table is live for anything estate-wide from here on.

| # | Ruling (one line) | Amends | Full text |
|---|---|---|---|
| R-A | Retirement of a tunable is a declaration (`config.retired[]`), never deletion of the live registry row; a retired name still holding a live row is a WARN | Rule 3 · `config` category | Spec 122 R-A |
| R-B | `recovery.interrupted` is a required, truthful declaration on any destructive-retraction write target. **CLOSED for the declaration + before-image (R-M) as of pilot 4** (`d07529af`, LG-17 — before-image live-fired on a genuine forced-FULL) **and CLOSED for the runtime reader as of 2026-08-29** (`LW-D20`/`LG-19` — `staleness.detectInterruptedRetraction` + `selectMode`'s unconditional FULL branch, wired into `runCascadePhase`/`runLinkPhase`; two bugs found and fixed by a live kill-and-rerun proof against `link_wsib` — see Spec 122 R-B and the pilot 4 assessment §R addendum). "Declared" and "automatically enforced" are now the same posture for any step declaring `force_full_on_next_run` | Rule 12 | Spec 122 R-B |
| R-C | The golden differential is a mechanical fingerprint lockfile gate, never a commit-message claim. **CLOSED** — `golden-fingerprint.infra.test.ts` was built at `3f7d6645` (pre-dates the R-T addendum programme); this row's own "not yet built" note was stale documentation debt, corrected 2026-08-30 while adding the row below. **Extended, R-T addendum commit 3 (Fold B-10):** the SAME "mechanical, not claimed" principle now also proves an invariant/plausibility MIGRATION preserves VALUES, not just declarations — before a migrated step's golden `invariants.json` is deleted, a round-trip regression lock proves the descriptor-driven executor's computed value is IDENTICAL to the retired file's value for the same `sql`, against real DB state (`link_massing`, commit 3, first migrated; the remaining 4 steps' commit-4 migrations inherit the same executor code path this lock validated, not a per-step re-proof) | §7 Step 4 | Spec 122 R-C; `golden-fingerprint.infra.test.ts` |
| R-D | `assert_schema` gains `declared_logic_variables_present` (blocking, `when:"pre"`) wherever it runs today; not yet in the descriptor (⚠ GAP) — LM-D15's throw is the interim backstop | Rule 3 | Spec 122 R-D |
| R-E | Gate G7's mutation-≥80% clause is replaced by a both-directions red-first lock per class-A behaviour; mutation testing is a bounded followup, not a gate | Spec 123 §6 G7 | Spec 122 R-E |
| R-F | A standing `§R Reflection` section (low-confidence + recurring/standard-shaping tables) is required after every pilot's cutover starting pilot 4; feeds §4.6's promotion criterion | §4.6 | Spec 122 R-F |
| R-G | PRESENCE of a declared variable's `logic_variables` row is always FAIL (LM-D15, R-D); VALIDITY is per-variable via the closed `on_invalid` enum — `fail` MANDATORY for a verdict-/write-affecting variable, `default`/`clamp` allowed otherwise with a `why` | Rule 3 (rewrites the old P4 sentence) | this spec, §2 Rule 3 |
| R-H | A metric expected to be permanently non-zero is WARN with a declared, machine-observable retighten condition — never FAIL, never INFO-by-taste; INFO only for a purely descriptive counter no threshold could bound, declared in `checks[].why`. LM-D6/LM-D11 re-dispositioned OPEN → WARN+retighten, carried to pilot 4 | Rule 10 addendum | this spec, §2 Rule 10 addendum; Spec 48 §4.9; `tasks/lessons.md:117` |
| R-I | Four pilot-practice promotions: phase-reorder re-derivation (Rule 11), grandfathered-ledger requirement (Rule 9), discoverer≠adjudicator as policy not just procedure (§4.2), document-move line-set-diff verification (§4.7) | §4 | this spec, §4 |
| R-J | Spec 124 is the standalone home of this policy; Spec 122 §1.2a is now a pointer here; this register is authoritative going forward | Spec 122 §1.2a | this spec (whole) |
| R-K | A stage-gated (not-yet-converted) step's tests are declared data, never a code skip: `scripts/steps/_schema/converted.json.pending` names the step file (`registers_at`/`reason`/`declared`) and every genuinely-red claim for it is wrapped `it.fails(...)` with a "flips at commit N" comment; conformance ties every `it.fails` under `src/tests/steps/<slug>/` to its `pending` slug and enforces `pending ∩ converted = ∅`. Cutover deletes the `pending` entry AND flips the tied `it.fails` calls to plain `it()` in the SAME commit — commit 7 (`69de8a13`) declared the `link_wsib` `pending` entry, commit 9 (`903fe5a7`) deleted it | §4.6 (promotion/staging mechanics) | Spec 122 R-K |
| R-L | A destructive-repair step's autonomous mode-`full` trigger is gated behind a per-chain `manifest.json` `chain_args` argv declaration, never a bare corpus-signal check: `chain_args: {"sources": ["--full"]}` makes `explicitFull` structurally true only on the chains authorized to retract, so `selectMode`'s `forced \|\| (explicitFull && changed)` resolves `full` off the real corpus-change signal on `sources` while `permits` (no `--full`) can never resolve `full` | Rule 3 worked-example pattern; `staleness`/mode-select | Spec 122 R-L |
| R-M | A write target with a destructive retraction declares `recovery.before_image` (`generated`\|`none`+`before_image_why`), mirroring R-B's exact shape — a runtime AUDIT TRAIL, distinct from R-B's crash-recovery POSTURE. The library mirrors the write plan's own scope/keys/columns as a read-only SELECT and writes it to `docs/reports/golden/<slug>/before-image/*.jsonl` on the SAME transaction client, strictly before the retraction, unwrapped by any try/catch — a write failure aborts the run before the retraction runs, never a silent skip | Rule 12 (`recovery` category) | Spec 122 R-M; `d07529af`, LG-17 |
| R-N | A cumulative link-rate floor's denominator is the primary entity population, never the linked-source row count: T2 (`link_rate_warn`) moved from `wsib_registry` ROWS to `entities.is_wsib_registered=true` / total entities — a single magnet's hundreds of contaminated rows no longer inflate a row-based ratio. The floor VALUE is unchanged; what changed is that it is now validated against measured entity-level truth instead of a row-inflated number | Rule 3 worked-example pattern | Spec 122 R-N; `e01cad11` |
| R-O | A matcher's accuracy is a sampled precision/recall number against a before-image, recorded in the assessment report at each repair — never inferred from a predicate agreeing with itself, and never from a link rate. `tier3_token_overlap_pass_pct` reading 100.00% (the write predicate's own self-consistency) coexisted with a fixed-rule 60-row sample measuring only up to 46.7% genuine precision (§8d table) — the fix hardened the declared stopword/token mechanism itself rather than adding a new bypass/threshold tunable ("same declared mechanism as LW-D14, no new tunable"), because the evidence showed the predicate, not its threshold, was wrong | Rule 10 (verdict derivation); MATCHER accuracy-measurement doctrine (new) | Spec 122 R-O; pilot 4 assessment §8d |
| R-P | A step that can gated-skip declares >=1 `checks[].when:"pre"` — the gated-SKIP narrowing (`onlyChecks`, `scripts/lib/step/index.js`) reduces `stepCtx.checks` to the `when:"pre"` set, and zero such checks means a SKIP's `audit_table` carries only the always-present `sys_*` rows with the skip reason unobservable outside a log line. "Can gated-skip" is a descriptor-level fact: a `terminals[]` entry of kind `"skip_gated"`. Row pending fold — full text lands in the docs commit | Rule 1 (nothing hidden) rung (b); §7 Step 2 | LPA-D4, `docs/reports/defect-ledger.md` |
| R-Q | A verdict-cascade counter never conflates severities: `records_meta.checks_failed`/`errors[]` count FAIL rows ONLY, `checks_warned`/`warnings[]` count WARN rows ONLY (`scripts/lib/step/verdict.js buildAuditTable`) — before this, a single conflated `errors[]` fed `checks_failed`, so a pure-WARN run reported `checks_failed > 0` with zero FAIL rows, measured live on `link_parcel_addresses`. Mirrors the un-converted `scripts/quality/assert-data-bounds.js`'s own pre-existing `errors`/`warnings`/`checks_failed`/`checks_warned` split, brought to parity rather than invented fresh. Row pending fold — full text lands in the docs commit | Rule 10 (verdict derivation) — a counter is a per-severity projection of the row-derived rows, never a mixed one | LPA-D6, `docs/reports/defect-ledger.md` |
| R-R | Validation is integrated and enforced, never a separate track (new **Rule 13**, §2 above). `scripts/analysis/step-validate.mjs` is the ONE command generating the Spec 123 §6 G0–G9 scorecard and the Rules-1–13 policy coverage matrix from artifacts, wired into `.husky/pre-commit --fast` and `.husky/pre-push`, asserted by `step-conformance.infra.test.ts`. Backfilled pilots 1–5's scorecards; Specs 122 and 123 ratified (their `⛔ UNRATIFIED DRAFT` banners retired) in the same commit, operator: *"it should be standard and enforced."* Closes GAPs G-1 (Rule 1 preference order — schema `x-ruling` field + baseline), G-2 (Rule 4 — `preserved-in-compute` names a check), G-4 (Rule 3 — `on_invalid:fail` binding), V7 `no_retraction` (Rule 9), and P3 (`execution.io_budget`) across the five follow-on WF3s this same task authorizes | §2 Rule 13 (new); Spec 123 §6/§7 | this spec §2 Rule 13; Spec 122 R-R; Spec 123 §6 |
| R-T | **Cross-cutting programme promises are declared data, generated, and gated — never re-discovered by a manually-commissioned inventory.** `scripts/steps/_schema/programme-items.json` declares every item owned by no single pilot (status/evidence/owner/gate, gate ∈ `batching_prereq`\|`cutover_prereq`\|`nice_to_have`), generated to `docs/reports/generated/122-programme-backlog.md` (`npm run programme-backlog`), drift-guarded and enforced by `src/tests/programme-backlog.infra.test.ts` (an unmet `cutover_prereq` blocking an already-converted slug is RED, proven both directions with a fixture); `step:validate`'s hook fast path prints the live "blocks batching: N" count on every run. Seeded 2026-08-29 with every row of a full six-pilot grounding pass, including the 11 previously-no-owner items this same ruling assigns an owner and a gate to (§6 R6-lettered items excepted, which stay R6's own territory) | §2 Rule 13 (extends it); §8/§9 (new) | Spec 122 §10.3; this spec §8, §9 |
| R-K.1 | `pending` entries gain a `stage` field (`"red_suite"` \| `"shape_clean"`), letting a new pilot declare `pending` contemporaneously with its commit-6 red suite instead of deferring past it — R-R's fast invariant #5 (`it.fails(` needs a declared pending slug) had never been exercised against a genuine pre-descriptor commit-6 file (only backfilled against already-converted pilots), making it and the pre-existing "pending must be shape-clean" test jointly unsatisfiable for any future pilot. A descriptor appearing while stage stays `"red_suite"` is itself RED ("stage not advanced"). `LW-D11`'s harness-fidelity lock amended in the same commit: a per-step test file with no ctx-builder is legal (assert only when a builder exists) — found the same incident, a BACKFILL archetype genuinely has none | R-K (pending mechanics); Rule 13 (`step-validate.mjs` fast invariants); LW-D11 | pilot 6 (`compute_centroids`) commit 6, `tasks/lessons.md` "a same-day gate must be exercised on the path it gates" |
| R-U | **Chain-run correlation is an explicit, propagated id, never re-derived from a timestamp window.** `scripts/run-chain.js` exports `CHAIN_RUN_ID=<its own pipeline_runs id>` (the id it already inserts for its own chain-level row — nothing new minted) as an env var to each spawned step child. `scripts/lib/step/index.js` stamps `records_meta.chain_run_id` on EVERY row it emits — both the happy path and the lock-contention-skip path — `null` when a step runs standalone (no env var, e.g. a manual `run-step.mjs` invocation). The seam pass and chain-end synthesis (R-V, below) JOIN on `chain_run_id` PRIMARILY; the LIKE-prefix + `started_at`/`completed_at` time-window correlation `observe-chain.js` already used (Spec 48) is demoted to the declared FALLBACK for legacy rows only (a chain run that predates this ruling). Ruled within Fold B-5's own scope (an orchestrator/regression ruling, not an operator-facing ambiguity) — proceeded without a separate sign-off | §7 Step 4 (write phase); Spec 48 §3 (`observe-chain.js`'s pre-existing correlation query) | R-T addendum commit 5, `scripts/lib/step/index.js`, `scripts/run-chain.js:638` |
| R-V | **The seam-validation pass + chain-end synthesis are DERIVED from declared step-edges, never hand-maintained; `validate_only` invariants execute exactly once, at chain-end.** `scripts/lib/step/seam.js` derives every "live" seam — an edge where BOTH endpoints are converted steps with a real descriptor — from `inputs.reads.steps[].step` (the declared producer→consumer edge; NOT `outputs.invalidates`, which is `{table,column,when}`-shaped, a step's own re-eligibility scope, e.g. migration 245's trigger, not an edge between two steps — a premise correction made live during R-T addendum commit 5). Measured against the 6 converted descriptors: exactly ONE pair qualifies (`compute_centroids` → `link_massing`). `scripts/analysis/chain-end-synthesis.mjs` is the `sources` chain's roll-up, spawned detached from `run-chain.js` the SAME way `observe-chain.js` already is (Spec 48), and is the declared cloud trigger point for `validate_only`-tier invariants/plausibility (Ask 6, option (b)) — the priced cost cap (summed `last_measured.cost_ms` medians vs. the chain's own measured duration) is REPORTED in the artifact, never a runtime gate: silently skipping these queries on cost would defeat Ask 6(b)'s whole point, which is that they finally run somewhere unattended. Ruled within Fold A-6/B-9's own scope | §2 Rule 13 (DATA half, above); this spec §8 (layer table) | R-T addendum commit 5, `scripts/lib/step/seam.js`, `scripts/analysis/chain-end-synthesis.mjs` |

## §6. What this spec does NOT do

- **No programme mechanics.** Assessment phases (PH-0..PH-8), conversion gates (G0–G9), the nine-commit procedure, and pilot ordering are Spec 123's territory. Spec 122's disk-I/O cost-adjudication discipline (P3 — every proposed box states its measured cost before the operator rules) is also programme mechanics and stays in Spec 122 §1.2a; it does not migrate here.
- **No library API.** `pipeline.step()`'s signature, `ctx`'s shape, and the runner's lifecycle are Spec 122 §4's territory — this spec states *that* a step must behave this way, never *how*.
- **No claim register.** The 290-claim tier assignment (Spec 121/123 §4.3) is verification-cost accounting, not policy.
- **No schema authoring detail.** The 18 categories' field-by-field menus live in `step.schema.json` (R2 — the schema is canonical); this spec cites it, never restates it.

## §7. How to resolve a problem in a step — the standard approach

**Every problem a step surfaces — a bug, a fence, a new requirement, an ambiguity — is resolved by this
ladder, in order, never ad hoc.** Rungs (a)/(b)/(e) are Rule 1's order of preference (descriptor →
declared check → last-resort compute); rung (c) is Rule 3's directive; rung (d) generalizes Spec 122 §4.3
"what the library owns" + Known Failure Mode 5 to a library bug rather than a missing declaration. §4 names
*who* rules; this names *where the answer goes*. Grounded in Spec 119 §1 (ground before reasoning; a claim
carries the query that proved it).

**Step 0 — Ground it.** Execute the query, grep, or read that establishes the problem is real — never infer
from a name or a comment. Cite the governing spec section — **cite the owner spec from the system map**
(`docs/specs/00-architecture/00_system_map.md`'s owner row for the step file), not only the architecture
specs (122/123/124): pilot 4's own plan draft first cited only 122/123/124 plus the step's upstream-source
spec, omitting the step's own governing Spec 46/60 until a correction pass found Spec 60's Step Registry
entry (Spec 123 G0). *(Spec 119 §1 stage 1–2; e.g. LM-D14 was found only because a forced-FULL capture was
inspected, not assumed — "found by EXECUTING, not by reading.")*

**Step 1 — Classify.** CONTRACT (a downstream consumer depends on it, even if ugly) / INCIDENTAL (nothing
observes it — do not assert on it) / DEFECT (a spec or invariant asserts the opposite). An undefended fence
is CONTRACT until proven otherwise. *(Spec 123 §3, the four PIN-vs-FIX questions.)*

**Step 2 — Resolve, stopping at the first rung that fits, in this order:**

| Rung | Resolution | Ground |
|---|---|---|
| **(a)** | Declare it in the descriptor — a field from a closed menu | §2 Rule 1 |
| **(b)** | A declared check / audit row — observable, verdict-bound | §2 Rules 1, 10 |
| **(c)** | An admin logic variable — never a literal | §2 Rule 3 |
| **(d)** | A library change — one fix, every step benefits | Spec 122 §4.3 "what the library owns"; KFM 5 |
| **(e)** | A compute change — last resort; compute is JUST compute | §2 Rule 2 (the rule itself still gets written down per Rule 4) |

**NEVER:** a second code path, a silent fallback, a hidden literal, a skip, or a commit-message claim in
place of one of the five rungs above. *(Each has a named incident: AS-D1/LM-D2 — a hand-rolled second verdict
path; LM-D14 — a check that silently read `undefined` and reported CLEAN, "green because it never looked";
pilot 1's original `config:"none"` — a hidden literal; R-C's own text — "a commit-message claim of
'differential green' is no longer evidence.")*

**Step 3 — If no rung fits, or two rungs conflict, the policy is unclear.** Do not pick one by taste — go to
**§4's ruling protocol.**

**Step 4 — Lock it.** A both-directions test, red on the old behaviour and green on the new, at the designed
assertion (Spec 119 §2 "Behaviorally red-first"); re-run the golden capture so the differential stays honest
(§5 register R-C — ⚠ today this re-run is a manual discipline, not yet a standing gate; see Rule 12's note
and R-C's GAP). **A rule without a lock is not yet a rule** (§4 step 4, restated here because it is the step
most often skipped under time pressure).

**Step 5 — Record.** A Defect Ledger id (`<STEP-PREFIX>-D<n>`) for a per-step disposition; a `§R Reflection`
entry (low-confidence or recurring/standard-shaping table) if the same shape is expected to recur in another
archetype — that recurrence claim is what §4.6 promotes into the register.

**The ladder itself is not exempt from §4.** It may be reordered, split, or have a rung added as the
optimization programme proceeds — but only through §4's ruling protocol, with a lock proving the change,
never by a single pilot quietly resolving a problem differently.

#### Worked examples from pilots 1–3

| Problem | Rung used | Resolution | Ground |
|---|---|---|---|
| The 345-line JS fallback link path (0 of 11 runs since 2026-04-02 took it) was dead weight with a silent swallow, orphaning its `link_massing_grid_degrees` tunable | (a) descriptor, dead compute deleted | `knowingly-retired` (Intent Ledger), replaced by declared `guards.requires` preconditions; the orphaned tunable gets `config.retired: [{name, since, why, ledger: LM-D7}]`, never a silent seed-row deletion | LM-D7, ruling A-8, R-A |
| `link_massing_link_rate_fail_pct` was the bare literal `50`, INTENT-UNKNOWN | (c) admin logic variable | `link_massing_link_rate_fail_pct` (default 50, 0–100, `on_invalid:fail`) + `checks[].limit_from_config` | LM-D5 |
| No tiebreak on equal-distance nearest-building matches — links could flip between runs | (e) compute change, last resort | `ORDER BY` rule fixed in `buildMatchSql`; the rule itself stated in the check's `why`, in `notes.json`, and in the compute header — not left as a bare code change | LM-D13 |
| A killed forced-FULL retraction left `parcel_buildings` at 29,330/520,492 rows; the next run's gate read "unchanged" | (a) descriptor | `recovery.interrupted` (`force_full_on_next_run`\|`none`+why) required on any destructive-retraction write target | R-B |
| A declared logic variable with no `logic_variables` row silently resolved to the seed default, stamped as if operator-set | (d) library change | `resolveConfig` (all steps, not just `link_massing`) issues one extra presence query and THROWs, naming the remedy | LM-D15 |
| A standing non-zero link-quality population (`nearest_footprint_gt_lot_count`) was dispositioned INFO with no gate | (b) declared check, severity corrected | INFO conflicted with Spec 48 §4.9; re-dispositioned WARN + declared retighten condition | R-H, LM-D6/LM-D11 |

## §8. The standard step as built (R-T, 2026-08-29 — 6/8 archetypes proven, HEAD `d9057a54`)

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

Enforced by `scripts/ast-grep-rules/step-shape.yml` via `scripts/hooks/check-step-shape.mjs`, scope = `scripts/steps/_schema/converted.json`'s `converted[]` array (**6 entries today**; unconverted files are scanned report-only, never a vacuous pass — `src/tests/step-conformance.infra.test.ts`'s prove-red proves the rule still fires on every one of them).

**Descriptor** (`<slug>.descriptor.json`, 18 categories, validated against `scripts/steps/_schema/step.schema.json`, AJV-checked at `pipeline.step()` construction — before compute exists, before any pool opens). `identity.archetype` drives which of the 18 collapse to `"none"` (Rule 7).

**Notes** (`<slug>.notes.json`) — interpretation, capped at 12 entries, may cite a check id, never a bare number.

**Compute** (`scripts/lib/compute/<slug>.js`) — the ONLY hand-written domain logic. Shape enforced by `scripts/ast-grep-rules/compute-shape.yml`: a `{[checkId]: fn}` dispatch table exported as `module.exports.checks`, every observation via `ctx.report()`, every I/O call through an injected seam (`ctx.fetch`, `ctx.clock`), every tunable through `ctx.config` (never `process.env` directly), file order = descriptor check order, policy text in `checks[].why` never in comments (Rule 4).

**Library phases per archetype, as they exist in `scripts/lib/step/index.js` (2,116 ln) today:**

| Archetype | Phase runner | Exercised by | Status |
|---|---|---|---|
| ASSERT | (no phase runner — writes nothing) | pilot 1 `assert_schema` | proven |
| INGESTOR | write-SQL generation + two-position staleness + acquisition seam (`ctx.acquire`) | pilot 2 `load_ravines` | proven |
| LINK | `runLinkPhase` | pilot 3 `link_massing` | proven |
| MATCHER | `runCascadePhase` (N-tier convergence loop, `runTierToConvergence`) | pilot 4 `link_wsib` | proven |
| MATERIALIZER | `runMaterializePhase` | pilot 5 `link_parcel_addresses` | proven |
| BACKFILL | `runBackfillPhase` (thin fork of the same guards→prior→gate→pre_write→RUN_AT→post shape, LG-20) | pilot 6 `compute_centroids` | proven |
| RECORDER | dispatch path referenced in comments only (`publish`/WAP pointer) | **none yet** | **unexercised — pilot 7 is the first real test** |
| ENRICHER | dispatch path referenced in comments only (scope-defer, clock-relative gate) | **none yet** | **unexercised — pilot 8 is the first real test** |

`runLinkPhase`/`runCascadePhase`/`runMaterializePhase`/`runBackfillPhase` are four independent implementations of the same shape (fork-over-share, chosen three times with measured reasons — pilot 3, pilot 5, pilot 6 Fold D). A shared `runPhaseScaffold` (`LG-21`) is explicitly DEFERRED to a post-pilot-8 library WF, not built inline — see §9's BACKFILL row and the programme backlog item `LG-21`.

**Validator, captures, tests, scorecard — uniform across all 6 landed pilots:** `checks[]` (9 named kinds + free-form SQL, Spec 122 §12.5/R6 — the "12 canned generators" of Spec 120 §5.0 is a SUPERSEDED promise, not an unbuilt one, programme item `VAL-1`) → row-derived verdict (never a parallel boolean, Rule 10) → `capture-step-golden.js` fingerprint-locked golden captures (R-C) → `src/tests/steps/<slug>/violations.test.ts` (prove-red, then green) → `scripts/analysis/step-validate.mjs`'s G0–G9 scorecard + this spec's Rules 1–13 policy matrix, generated and enforced pre-commit/pre-push (Rule 13).

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
- **Values** = `config.logic_variables[]` — live in the `logic_variables` DB table, surfaced in the admin `GlobalConfigCard` GROUPS, each with a declared `min`/`max`/`on_invalid`, stamped into `records_meta.config` on every run that consumes one (Spec 122 §5.5 item 6). An operator can change these without a code deploy.
- **Rules** = `checks[]`/`invariants[]`/`plausibility[]`'s bound text (`limit`/`bound`) — DESCRIPTOR-declared, ruling-only: changing one is a WF (a reviewed commit), never an admin action. `limit_from_config` is the one declared bridge between a rule and a value (Rule 3's `on_invalid:fail` binding, R-G).
- **Physical invariants** = constants with a stated `why` (e.g. a PostGIS distance tolerance, a CRS assumption) — neither admin-editable nor descriptor-tunable; changing one is a data-model decision, documented inline where the constant lives, never surfaced as a knob.

**The orphan `run-step.mjs` tripwires, enumerated by name** (Fold A-4e, R-T addendum commit 7 — filed as a TODO by commit 4, closed here): `scripts/validation/step-config.json` names 3 of the 6 converted steps (`assert_schema`, `link_wsib`, `link_massing`); `scripts/validation/run-step.mjs`'s `runTripwires()` hardcodes several tripwire IDs as UNCONDITIONALLY `N/A-MANUAL` regardless of which step runs (`:286-297`) — these do NOT migrate into a descriptor's `checks[]`/`invariants[]` as a side effect of a pilot converting; each is either genuinely per-step-bespoke (no generic library home) or simply not yet ported. Checked against each of the 3 steps' own `tripwire_profiles` entry:
- **`assert_schema`** (`sanity` profile → `[T12]` only) — T12 is a real, computed check (STDERR `pipeline.log.warn` line count) that already parallels the descriptor's own `checks[]`/audit-row mechanism; **zero orphans**.
- **`link_wsib`** (`ingest_linkage` profile → `[T3, T4, T5, T12]`) — **T4** (`N/A-MANUAL`, "requires join-key knowledge per step") and **T5** (`N/A-MANUAL`, "requires LEFT JOIN context per step") are the genuine orphans. T3 is real but INFO-only (reports `records_total`/`records_new`/`records_updated`, never scores pass/fail) — not orphaned, but not a bound either; T12 as above.
- **`link_massing`** (`ingest_linkage` profile, same shape) — **T4** and **T5** are the same two orphans, for the same reason (this profile's hardcoded status doesn't vary by step).

Neither T4 nor T5 has a migrated descriptor equivalent as of this commit — both remain reachable only via a manual `node scripts/validation/run-step.mjs` invocation. Filed as a `nice_to_have` programme-items.json row (`TRIPWIRE-T4T5`, §9 below) rather than silently left unenumerated.

**What is NOT yet proven**, because no RECORDER or ENRICHER has converted: the publish/WAP pointer mechanism end-to-end; whether ENRICHER's 5-pass/scope-defer shape fits inside `pipeline.step()` unmodified; whether the two remaining archetypes force further "zero library growth" refutations the way BACKFILL just did (3 of the last 4 pilots needed real library growth, not zero — INGESTOR and ASSERT were the only "port verbatim" cases); Spec 120 §6b's reset-SQL generator and its 3 destructive-reset guards (programme items `STA-2`/`STA-3`, `cutover_prereq` blocking `refresh_snapshot` specifically, since RECORDER is the first archetype in the pilot order likely to need a real scoped reset).

## §9. Known concerns per archetype (R-T, 2026-08-29 — lifted from the six pilots' §R Reflections)

*One row per proven archetype, citing the pilot report it was first measured in. Not a defect list (see `docs/reports/defect-ledger.md` for that) — this is the standing, archetype-level caveat a future pilot of the SAME archetype should read before assuming its predecessor's shape transfers cleanly.*

| Archetype | Pilot | Known concern |
|---|---|---|
| ASSERT | `assert_schema` | Compute never opens `ctx.pool` at all (Rule 2's stated exception) — the shape's thinnest test of the contract; `outputs`/`recovery`/`counters`/`config`/`override` all forced `"none"`, so ASSERT alone cannot exercise `write_discipline`, `recovery.reset`, or tunable-presence checks at all. Four fences moved to descriptor data or a named check at conversion (Rule 1 worked example). |
| INGESTOR | `load_ravines` | The richest archetype (9 members) but only ONE representative converted — class B/4-`finally`/drift+mass-delete-env-override coverage is real, but classes A and C (the OTHER two write mechanics INGESTOR spans, §8.2's coverage caveat) are validated only by the enum port, never by a converted INGESTOR exercising them directly. LR-D9 (a phase-reordering ruling silently retiring a "before X" write-order guarantee, Rule 11's origin incident) was FIRST found here, not in a more write-heavy archetype. |
| LINK | `link_massing` | E1's `guard:"none"` is a genuinely correct grandfathered case (an `IS DISTINCT FROM` guard here would skip the exact rows the clear exists to move) — the archetype's own worked example for why `guard:"none"` is sometimes RIGHT, not merely tolerated (Rule 9). Also the archetype that forced R-B's crash-recovery declaration (an interrupted forced-FULL retraction leaving a table at 29,330/520,492 rows with a FALSE `recovery.resume` claim). |
| MATCHER | `link_wsib` | Tier-3 precision required hardening post-cutover (LW-D18, a WF3) after a self-agreeing predicate (`tier3_token_overlap_pass_pct` at 100.00%) coexisted with a 60-row sample measuring as low as 46.7% genuine precision — R-O's "sampled precision/recall, never a link rate" accuracy doctrine originates here, and is the ONE Rule-10-adjacent doctrine every future MATCHER must apply, not just cite. |
| MATERIALIZER | `link_parcel_addresses` | LPA-D1 (`insert_only_no_retraction`, class D, banned-for-new under V7's `no_retraction` rule) is GRANDFATHERED, not fixed — a real, filed, zero-measured-live-exposure known defect the archetype's sole representative carries forward rather than resolving. A future MATERIALIZER pilot (if the estate ever gets a second one) inherits this as an open question, not a closed pattern. |
| BACKFILL | `compute_centroids` | `write.js`'s class-E (`write_once_backfill`) executor (`executeBackfillUpdate`) was newly built THIS pilot (LG-20) — the "zero library growth" hypothesis every pilot since 3 has tested was REFUTED here too, for the third time. Fork-over-share was chosen a THIRD time over a shared phase-runner scaffold (`LG-21`, explicitly deferred to a post-pilot-8 library WF — see §8 above). Downstream: this archetype's output (`parcels.centroid_lat/lng`) exposes a real, measured, pre-existing consumer defect in `link-parcels.js`'s Tier-3 join (CC-D2/CC-D3, `RT-CC3` — 6,808/17,500 spatial-tier links, 38.9%, would resolve to a different parcel under a containment-based join) that is NOT this archetype's own defect to fix, but is the first pilot where a downstream consumer's join STRATEGY, not just its data freshness, was found to be in question. |
| RECORDER | *(pilot 7, not yet run)* | **Untested, named in advance per §8's own gap list:** is `refresh_snapshot`'s daily-keyed upsert (`ON CONFLICT (snapshot_date) DO UPDATE` with no change guard, `step.schema.json`'s own GAP-2 worked example) going to force a NEW write-discipline class, or fit `guarded_upsert` with `guard:"none"` (declared, not invented)? This is also the FIRST real test of the WAP/publish-pointer dispatch path and of `STA-2`/`STA-3`'s reset-SQL generator and guards (both currently NOT_STARTED, `cutover_prereq` blocking this slug specifically). |
| ENRICHER | *(pilot 8, not yet run)* | **Untested, named in advance:** `enrich_parcels` is 2,153 lines, 5 passes, the largest single conversion in the programme; its clock-relative comps-window gate (Spec 122a's own open question Q3 — "no count- or watermark-based gate can ever skip it") has no analogue in any archetype converted so far, and is the last of the eight-archetype coverage table's rows to be proven against real code rather than the aspirational dispatch-map comment in `scripts/lib/step/index.js`. |

## Operating Boundaries

**Target files:** none — this is a policy document with no owned implementation. It is *read by* every
future step's descriptor author and reviewer.

**Out-of-scope files:** `scripts/lib/step/**`, `scripts/steps/_schema/step.schema.json`,
`scripts/ast-grep-rules/*.yml` — these implement the policy; Spec 122 owns their shape and this spec must not
duplicate their content, only cite it.

**Cross-spec dependencies:**
- **Relies on:** Spec 122 (architecture; §1.2a now points back here, R-J), Spec 123 (§4 generalizes its §7.1 discoverer≠adjudicator rule, R-I.3), Spec 119 (governs on any conflict), Spec 48 §4.9 (the severity rule Rule 10's addendum restates, R-H).
- **Consumed by:** every future step's descriptor and its reviewer; Spec 123's gates cite this spec's rule numbers instead of restating them.
