# Phase B · B4 — the zero-intersection floor (WF2)

**Status:** Planning — grounding in progress, **design decision BLOCKED on one measurement (§2)**.
**Becomes `.cursor/active_task.md` once P0 arrives on `main`.** Phase B plan of record: `.cursor/phase_b_active_task_INPROGRESS.md`.
**Domain Mode:** **Cross-Domain** (Phase B as a whole — B6 touches `schedules/route.ts`, `stats/route.ts`, three `.tsx`). **B4 itself is Backend/Pipeline-only** → read `scripts/CLAUDE.md`; the Cross-Domain declaration binds at B6, not here.
**Workflow:** **WF2** (`.claude/workflows.md:67-95`) — Self-Checklist runs BEFORE the panel (GT F9 order restored).
**Doctrine:** Spec 119 §1 (nine stages), §2 (ladder), §4.7, §5.6 · Spec 08 §11.1–§11.6.
**Governing specs:** Spec 62 (centreline) · Spec 65 (enrich_parcels) · Spec 48 (observability §3.9/§4.9) · Spec 49 (completeness) · Spec 30 §5.4.1 (halting posture / threshold rule).
**Rollback anchor:** `15951ec8`. **Database Impact: NO** (no migration — the remedy is a constant and/or a fallback join, plus one audit row).

---

## §0 Grounding ledger — executed claims only

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| G1 | The radius is a hardcoded constant, not a logic var | read | `CENTRELINE_PROXIMITY_M = 20` at `scripts/enrich-centreline.js:39`; header says *"Hardcoded — change here to tune (NOT via logic_variables)"* | [ME] |
| G2 | The join is proximity, not containment | read | `JOIN toronto_centreline c ON ST_DWithin(p.geom::geography, c.geom::geography, 20)` (`:86`), guarded by `WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)` (`:87`) | [ME] |
| G3 | The in-code probe already characterises the tail | read `:36-38` | 1000-parcel probe: **p50 9.9 m, p90 12.9 m, 97.1% within 20 m** — so ~2.9% are structurally outside the radius | [ME] |
| G4 | The dirty predicate is version-stamp based | read | `centreline_dataset_version_when_enriched IS DISTINCT FROM $1` at `:265`, `:282`, `:309` | [ME] |
| G5 | **The floor mechanism** | derived from G2+G4 | a valid-geom parcel with no centreline within 20 m never enters `parcel_segments`, is never stamped, so `IS DISTINCT FROM $1` stays true **forever** — it is re-processed every run and the convergence count never reaches zero | [ME] |
| G6 | L24c is a HALT, not a warning | read `enrich-permits.js:320-330` | reads `logic_variables.centreline_propagation_coverage_min`; **throws** below it — *"refusing to propagate"*. A remedy that UNstamps can hard-halt the daily **permits and coa** chains | [ME] |
| G7 | Historical L24c margin | panel record 2026-08-06 | 472,004/486,530 = **97.014%** vs a **0.90** floor — 7 points of headroom. ⚠ **13 days stale; being re-measured (§2)** — `lessons:93` forbids planning on it | [RECORD] |
| G8 | Stuck-set size + trend | panel record 2026-08-06 | 14,510+16 = **14,526**, trend 14,528→14,528→14,526 — shrinking by ~1/run against a 486K table, i.e. **not converging** | [RECORD] |

## §2 ⛔ THE GATING MEASUREMENT — the design decision is selected BY this, not argued into

B4 is explicitly *"a design decision"* with three candidate remedies. **Which one is correct is a function of one distribution I do not yet have**: for every valid-geom parcel that is currently unstamped, the distance to its NEAREST centreline segment (KNN via `<->`, then `ST_Distance(::geography)`).

**Running now.** The query is deliberately the full set, not a sample, because the tail is the whole question.

**Decision table — pre-committed BEFORE seeing the number (`lessons:104`, predict before you look):**

| If the distribution shows… | Then the remedy is | Why |
|---|---|---|
| the mass sits at **21–35 m** with a thin tail | **widen `CENTRELINE_PROXIMITY_M`** to clear the mass | simplest close; one constant; but see the §3 trap |
| a **bimodal** split — a near cluster plus a far cluster (islands, ravine lots, rail lands) | **widen for the near cluster + nearest-segment fallback for the far one** | no single radius serves both |
| a long tail reaching **hundreds of metres** with no natural break | **stamp-with-defaults** (record "no centreline in range" as a terminal, stamped state) | no radius converges; the fix must be to make non-matching a *stamped outcome* rather than an absence |

**My pre-pinned expectation, written before the result:** a **bimodal** result — most of the 2.9% within 20–40 m plus a far cluster — selecting the middle row.

### RESULT (executed 2026-08-19, cloud, full set — not sampled) — **MY EXPECTATION WAS WRONG**

| Metric | Value |
|---|---|
| stuck set `n` | **14,510** (= 2.98% of valid-geom; cross-validates G3's "97.1% within 20 m" exactly) |
| min / **p50** / p90 / p99 / max | 20.0 m / **41.7 m** / 112.5 m / 335.5 m / **2,047.2 m** |
| fixed by 25 m | 3,141 (21.6%) |
| fixed by 30 m | 4,424 (30.5%) |
| fixed by 50 m | 9,393 (64.7%) |
| fixed by 100 m | 12,746 (87.8%) |
| **beyond 100 m** | **1,764 (12.2%)** |

**L24c live: 472,004 / 486,514 = 97.0128%** vs the `0.9` floor (threshold read from `logic_variables`, confirming G6's default). G7 **held** — the margin is stable across 13 days, not drifting.

**Why the expectation failed:** I extrapolated the *shape* of the tail from G3's probe, which only reported percentiles **inside** the 20 m radius (p50 9.9, p90 12.9). Those say nothing about the distribution **beyond** the cutoff. I inferred a near-cluster from data that was structurally incapable of showing one — the same defect class as C2's "397 permits": a true measurement used to support a claim it does not reach.

**What it actually is:** a **smooth, continuous long tail**, not bimodal. Half the stuck set is beyond 41.7 m; p99 is 335 m; the far end is 2 km.

### ⛔ STOP — READING SPEC 62 REFUTES B4's PREMISE (2026-08-19)

I proposed stamp-with-defaults before reading the governing spec. **Spec 62 has already ruled on this population, and the ruling is the opposite of a defect.** Six grounded facts, all executed:

| # | Spec 62 says | Where |
|---|---|---|
| S1 | The version signal reads **"the run row, never the per-parcel column (which carries a legit-NULL zero-intersection tail + strays)"** | `:374` |
| S2 | **"a permanent ~14.5K zero-intersection tail"** — named, sized, and expected | `:375` |
| S3 | Its cost is already measured and accepted: it keeps runs *"in the reduced band rather than a true zero-skip — **still seconds, not 92 min**"* | `:375` |
| S4 | The population is **already instrumented** — `parcels_with_zero_centreline_intersections` is locked decision **L21** | `:65` + `enrich-centreline.js:429,:576-577` |
| S5 | Its gate: **WARN ≥10%, FAIL ≥40%**. Live value **2.98%** → **PASS**. Not a standing red, not an alarm, not firing | `enrich-centreline.js:31-32,:430` |
| S6 | The 20 m constant's externalization to `logic_variables` is already a **filed follow-up**, not new work | `:380` |

**The word "legit-NULL" (S1) is the whole finding.** The NULL stamp on these parcels is not an unconverged state — it is the *designed signal* that no centreline is in range, and Spec 62 deliberately reads the run row **because** the per-parcel column carries it. **Stamp-with-defaults would destroy exactly the signal the incremental design depends on.** That is a Chesterton's Fence, and I was one step from knocking it down.

**B4's premise as written in v3/v4/v5 — *"widen / fallback / stamp-with-defaults so they converge"* — is the C2 failure shape:** a TRUE observation (14,510 parcels never converge) carrying a FALSE inference (therefore it is a defect needing a remedy). Nothing is broken. The gate passes with 7 points of headroom. The cost is seconds.

### REVISED RECOMMENDATION — **no remedy; B4 collapses to documentation + one gate-design guard**

1. **Do NOT converge the tail.** Record in Spec 62 that the zero-intersection population is **terminal by design**, citing `:374`'s legit-NULL ruling — so the next planner does not re-derive B4 a fourth time.
2. **THE RED — RESOLVED. And my first fix for it was wrong.**

   **The risk:** v3's convergence row WARNs when `count ≥ previous`. On a structurally-permanent population that fires **forever** — exactly what **Spec 119 §4.3** forbids: *"a FAIL gate on a population that is STRUCTURALLY expected to be nonzero … is a standing red that operators learn to ignore — worse than no gate, because it burns the 'red means look' signal for every OTHER gate too."*

   **My first fix — "scope it to the movable set" — is REFUTED by `:375` read in full.** The stale set is *"exactly {new, moved, **never-linked**}"*, and the zero-intersection tail **is** never-linked — `centreline_dataset_version_when_enriched IS NULL` is precisely what puts it there. **The tail lives INSIDE the movable set**, so scoping to that set changes nothing. I proposed this from a grep excerpt; reading the surrounding paragraph killed it. (§11.1: a line citation is *read*, not remembered — this is the case in point.)

   **The correct metric SUBTRACTS the tail:**
   ```
   convergence_count = stale_count − zeroCount
   ```
   where `zeroCount = geomTotal − intersecting` (`enrich-centreline.js:538`) is **already computed on every run, for free** — the count of valid-geom parcels with no centreline in range.

   **Why this satisfies §4.3:** the remainder is parcels that HAVE a centreline in range but are not yet stamped — genuinely unconverged work, which **can and should reach zero**. A WARN-on-not-shrinking gate over a population that can reach zero is legitimate; over one that cannot, it is the standing red §4.3 forbids. **The subtraction is what makes the gate honest.**

   **Implementation constraint the panel must verify:** `stale_count` and `zeroCount` must be scoped **consistently** — both global, or both over the stale set. A reduced run may scope the diagnostic query differently from the full run; if they disagree, the subtraction silently goes negative or under-reports. `Math.max(…, 0)` would *hide* that, so it must not be used to paper over a scoping mismatch.

   **Still required regardless:** a **Spec 48 §4.9 self-announcing retighten** naming the machine-checkable condition under which this tightens, and — per §4.4 — that condition must be checked for **reachability** before it is folded.
3. **Re-baseline (DS12) still applies** — B2/B3 may have moved the set; the live 14,510 vs the record's 14,526 is that drift.

**What the measurement was still worth:** it independently confirms S2's "~14.5K" (14,510) and proves the tail is a smooth continuous distribution to 2 km — so it also refutes the *widening* remedy on its own terms, not just by spec authority. Two independent lines of evidence, same conclusion.

---

### ~~REMEDY SELECTED BY THE DATA — row 3, stamp-with-defaults~~ *(SUPERSEDED — see above)*

Rows 1 and 2 are **refuted by measurement, not by argument**:
* *Widen the radius* — 30 m converges only **30.5%**; even **50 m converges 64.7%** and leaves 5,117 parcels permanently stuck. And §3's trap makes this far worse than it sounds: 20 m *already* over-flags corner/through (24%/16.7% vs ~13%/<5%); a 50 m "frontage" radius is 2.5× a constant that is already too loose. **Widening cannot converge the set at any defensible value.**
* *Bimodal split* — there is no break to split on.

**Therefore: a parcel with no centreline in range must reach a TERMINAL STAMPED state.** Stamp `centreline_dataset_version_when_enriched` with the current version and leave the frontage fields NULL — "processed, nothing in range" becomes a *recorded outcome* instead of a permanent absence.

**Consequences, checked:**
* **L24c direction of travel is SAFE** (G6) — this stamps ~14,510 additional parcels, moving coverage 97.01% → ~100%. It cannot approach the 0.90 halt.
* **Database Impact stays NO** — the stamp column already distinguishes processed from unprocessed; no sentinel column is needed.
* **⚠ The one real risk, for the Integration seat:** does any downstream consumer read `primary_frontage_street_name IS NULL` as *"not yet enriched"* rather than *"enriched, no street in range"*? If so, stamping silently changes that consumer's meaning. **This is the question that decides whether Database Impact stays NO** — a consumer needing to tell the two apart forces a sentinel column and re-authorisation.
* **Visibility (Spec 48):** the audit row must report the "stamped, no centreline in range" bucket as its own metric, so 14,510 parcels do not vanish into a converged count. A remedy that converges by *absorbing* the population is the silent-green class.

## §3 The trap that makes this harder than "raise the number"

Widening the radius is **not** free, and the in-code comment at `:40-47` is the evidence: the 20 m radius already **over-flags** the corner/through booleans (live: corner 24%, through 16.7% vs typical ~13%/<5%) *because it reaches streets the parcel does not abut*. That was fixed by a separate, tighter `CENTRELINE_ABUT_M = 13` discriminator.

So: **widening `CENTRELINE_PROXIMITY_M` degrades frontage-name precision for every parcel, to converge 2.9%.** Any widening remedy must state its blast radius on `primary_frontage_street_name` and show `CENTRELINE_ABUT_M` still holds the corner/through booleans at their validated ~13%/~8%. This is the Spec 30 §5.4.1 threshold rule applied: changing a constant re-derives everything sized against it.

**And the L24c asymmetry (G6):** stamping MORE parcels raises coverage — safe. Any remedy that *unstamps* (e.g. tightening geometry validity) moves toward the 0.90 halt. **Direction of travel is a safety property here, not a preference.**

## §4 Tests — as CODE in the plan, reviewed at plan altitude (Spec 08 §11.4)

Not a table of descriptions. This is the artifact the panel reviews.

```js
// src/tests/centreline-convergence.logic.test.ts   (pure — no DB)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md
//
// The convergence row must use IS DISTINCT FROM, not IS NULL. They agree ONLY while
// nonnull_stale === 0, so an IS NULL row silently reads 0 while stale-stamped parcels
// are still dirty. Red against the IS NULL shape.
describe('centreline convergence row', () => {
  it('counts stale-stamped parcels, not just unstamped ones', () => {
    const rows = [
      { stamp: null,       current: 'v3' },   // unstamped  -> dirty
      { stamp: 'v2',       current: 'v3' },   // STALE      -> dirty (IS NULL misses this)
      { stamp: 'v3',       current: 'v3' },   // converged
    ];
    expect(countDirty(rows)).toBe(2);          // IS NULL shape returns 1 -> RED
  });

  // The fallback that the precedent (readLastEnrichedVersion) exists to provide:
  // a bare `current >= previous` is FALSE when previous is undefined, which SILENTLY
  // suppresses the WARN on the very first run — the run where it matters most.
  it('WARNs when the dirty count fails to shrink', () => {
    expect(convergenceVerdict({ current: 14526, previous: 14528 })).toBe('PASS');
    expect(convergenceVerdict({ current: 14526, previous: 14526 })).toBe('WARN'); // >= , not >
    expect(convergenceVerdict({ current: 14530, previous: 14526 })).toBe('WARN');
  });

  it('does NOT silently pass when there is no previous run', () => {
    // `current >= undefined` is false in JS -> a naive impl returns PASS here.
    expect(convergenceVerdict({ current: 14526, previous: undefined })).not.toBe('PASS');
  });

  it('reports the coverage ratio alongside the count', () => {
    const row = convergenceRow({ dirty: 14526, validGeom: 486530 });
    expect(row.value).toBe(14526);
    expect(row.metric).toMatch(/coverage/);     // ratio reported, not just the raw count
  });

  // ---- THE RESOLVED RED (Spec 119 §4.3) ----------------------------------
  // The metric must EXCLUDE the structurally-permanent zero-intersection tail,
  // or it WARNs forever. The tail is INSIDE the stale set ({new, moved,
  // never-linked}, Spec 62:375) — so scoping to that set does NOT help; only
  // subtracting `zeroCount` does. `zeroCount` is already computed every run at
  // enrich-centreline.js:538 (geomTotal - intersecting).
  it('excludes the permanent zero-intersection tail from the convergence count', () => {
    // Steady state: every stale parcel IS the tail -> nothing is unconverged.
    expect(convergenceCount({ staleCount: 14510, zeroCount: 14510 })).toBe(0);
    // Real work outstanding: 40 parcels have a centreline in range, unstamped.
    expect(convergenceCount({ staleCount: 14550, zeroCount: 14510 })).toBe(40);
  });

  it('does NOT WARN in the steady state — the tail alone must read PASS', () => {
    // RED against the v3 shape, which counts the raw stale set and therefore
    // WARNs on every run forever (14510 >= 14510).
    const prev = convergenceCount({ staleCount: 14510, zeroCount: 14510 });
    const now  = convergenceCount({ staleCount: 14510, zeroCount: 14510 });
    expect(convergenceVerdict({ current: now, previous: prev })).toBe('PASS');
  });

  // A scoping mismatch between the two inputs must FAIL LOUD, never be clamped:
  // Math.max(x, 0) would silently render a mismatch as a healthy zero.
  it('throws on a negative remainder rather than clamping it', () => {
    expect(() => convergenceCount({ staleCount: 100, zeroCount: 14510 })).toThrow(/scope/i);
  });
});
```

```js
// src/tests/db/centreline-floor.db.test.ts  (BUILDO_TEST_DB=1)
// The floor itself: a parcel with valid geom and NO centreline in range must reach a
// TERMINAL state after one run. Red today — it stays dirty forever (G5).
it('a zero-intersection parcel converges after one enrich run', async () => {
  await seedParcelFarFromAnyCentreline(db);          // geom valid, nearest segment >> radius
  await runEnrichCentreline(db);
  const { rows } = await db.query(
    `SELECT centreline_dataset_version_when_enriched AS stamp FROM parcels WHERE id = $1`, [farId]);
  expect(rows[0].stamp).not.toBeNull();              // RED today
});

// L24c direction-of-travel guard (§3): the remedy must never LOWER coverage.
it('the remedy does not reduce L24c coverage', async () => {
  const before = await l24cCoverage(db);
  await runEnrichCentreline(db);
  const after = await l24cCoverage(db);
  expect(after).toBeGreaterThanOrEqual(before);
  expect(after).toBeGreaterThan(0.90);               // the HALT floor (G6)
});
```

**Red-first protocol:** every case above is proven red against the current shape and green after, at the designed assertion. The `IS NULL`-vs-`IS DISTINCT FROM` case is the one most likely to red for the wrong reason — it must red on the **count**, not on a missing helper.

## §5 Roster — Spec 08 §11.5 lean shape

**PLAN (4 seats):** **Integration** (main tree, live DB) · **Idempotency Lens** (main tree — the remedy changes a re-runnable enrich pass and its convergence semantics) · **Regression Guardian** (main tree, shell+git — `CENTRELINE_PROXIMITY_M` and `CENTRELINE_ABUT_M` both carry dense in-code fences with live-validated numbers; §3 is exactly its charter) · **Reality-Check** (main tree, live DB — B4 changes a derived parcel field, the subject-matter trigger).

**NOT convened:** Gemini/DeepSeek — §11.5 demotes CLIs to whole-file audit generators whose yield files to `review_followups.md` and never folds into a diff review. Code Reviewer / Observability are not plan seats in this shape; Observability is the charter match for the OUTPUT grounder if the audit-row contract changes.

**FOLD-VALIDATION (2, mandatory, before implementation):** grounder re-executes every claim in the fold · **Cross-read Adversary** — *"Hunt collisions between the plan's separately-folded decisions — pairwise, mechanically, with zero deference; walk every checklist line for staleness against the fold; verify the tests still cohere as a suite."*

**OUTPUT (2):** Regression Guardian + one grounded reviewer (Reality-Check if the re-run values move; Observability if the audit row's shape changed).

## §6 Execution plan (WF2, verbatim)

- [ ] **State Verification** — §0 ledger + §2's measurement. **BLOCKING: §2 is unresolved.**
- [ ] **Contract Definition** — N/A, no API route.
- [ ] **Spec Update** — Spec 62: record the chosen remedy, the new constant (if any) with its re-derivation, and the convergence row. `npm run system-map`.
- [ ] **Schema Evolution** — N/A (Database Impact NO). If §2 selects stamp-with-defaults and that needs a sentinel column, this flips to YES and the plan returns for re-authorisation.
- [ ] **Guardrail Test** — author §4 as written.
- [ ] **Red Light** — prove each red at its designed assertion; paste output.
- [ ] **Implementation.**
- [ ] **UI Regression** — N/A (no shared component).
- [ ] **Pre-Review Self-Checklist** — 5–10 items from Spec 62's Behavioral Contract, walked against the ACTUAL diff, PASS/FAIL before tests.
- [ ] **Panel** — the §5 PLAN roster.
- [ ] **Fold-validation** — the §5 pair. Mandatory, Backend/Pipeline.
- [ ] **Green Light** — `typecheck && lint && test && test:py && test:db` + `ruff check scripts/*.py`.
- [ ] **ARRIVAL** — B4 is branch work riding the B7/B8 train; state that explicitly rather than defaulting.

## §7 Known risks

* **§2 unresolved** — the remedy is unselected. Any plan text that assumes a remedy is a §11.1 violation.
* **Widening degrades frontage precision** (§3) — the blast radius is unmeasured.
* **G7/G8 are 13 days stale** and B2/B3 may themselves have moved the set (DS12 mandates re-baseline).
* **L24c is a live HALT on the daily chains** — direction of travel is a safety property.
* The stuck set shrinks ~1/run against 486K: **the floor is real, not a slow convergence.**

## §8 Post-measurement status

**§2 is RESOLVED.** The remedy is **stamp-with-defaults**, selected by the distribution rather than argued into. Widening is refuted at every defensible radius.

**Two open items before this can lock:**
1. **The consumer question (§2, Integration seat):** does anything read `primary_frontage_street_name IS NULL` as "not yet enriched"? This decides whether Database Impact stays **NO** or flips to **YES** (sentinel column + re-authorisation).
2. **A Reality-Check sanity item:** `max = 2,047.2 m` — a parcel 2 km from any centreline. Plausible for Toronto Islands / port / rail lands, but it should be *looked at*, not assumed. If it is instead a geometry defect, part of this "stuck set" is a data-quality bug wearing a coverage-gap costume, and that changes what stamping means for those rows.

**§4's tests need one addition now that the remedy is known:** a case asserting the terminal state is *distinguishable* — a stamped-with-no-centreline parcel must be tellable from a stamped-with-frontage one, and from an unstamped one. Three states, not two.

> **NOT YET PLAN LOCKED** — the design decision is now made and grounded, but item 1 above can still flip Database Impact, which changes the plan's shape and its authorisation. Resolving it is one Integration pass, not a phase.
