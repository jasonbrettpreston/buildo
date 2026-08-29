# Pilot 5 — `link_parcel_addresses` (MATERIALIZER) — Step Optimization Assessment

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. §0's seed re-confirmed bit-for-bit against the same
DB this commit; the chain-schedule question (finding 3) stated plainly below, not resolved.

**Governing plan:** `.cursor/active_task.md` (Pilot 5 — link_parcel_addresses). **Governing specs (owner row
first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/54_source_address_points.md` (PRIMARY, §Bridge),
`55_source_parcels.md` (SECONDARY), `41_chain_permits.md` §Step Breakdown row 9, `42_chain_coa.md` §Step
Breakdown row 9/§6.6.B, `47_pipeline_script_protocol.md` §A.5 (lock 115), `43_chain_sources.md` §Step
Breakdown (index 8/28), then `122_pipeline_step_optimization.md`, `124_step_standard_policy.md`,
`123_step_opt_assessment_validation.md` (packaging/procedure).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-29, same session as §0's seed — every §0 number reconfirmed bit-for-bit against
> `172.20.0.10:5432/postgres` (`node -r dotenv/config`, `pipeline.createPool()`; a bare `createPool()` with no
> `dotenv/config` preload silently connects to `localhost:5432/buildo` instead — the exact class of mistake
> `tasks/lessons.md`'s "verify against the DB the code will actually use" lesson warns against, caught this
> commit before any number was trusted: the first attempt read `schema_migrations` count 222 / `logic_variables`
> 417 against `buildo`, both wrong).

**Re-confirmed this commit:**

| Check | §0 seed value | Re-executed 2026-08-29 (commit 1) | Match |
|---|---|---|---|
| `current_database()` / host:port | `postgres` / port 5432 | `postgres` / `172.20.0.10:5432` | ✓ identical |
| `schema_migrations` count / max | 242 / (unstated) | 242 / `245_parcels_centroid_geom_invalidation.sql` | ✓ identical |
| `logic_variables` total | (unstated in §0) | 439 | consistent with pilot 4's post-LW-D19 count (`fcb0111e`, this branch's HEAD) |
| `parcel_address_points` rows | 511,224 | 511,224 | ✓ identical |
| `parcels` total / NULL geom | 486,530 / 0 | 486,530 / 0 | ✓ identical |
| `address_points` total / NULL geom | 525,346 / 0 | 525,346 / 0 | ✓ identical |
| `parcel_address_points` indexes | 1 reverse btree + PK | `idx_parcel_address_points_address_point_id`, `parcel_address_points_pkey` | ✓ identical set (2) |
| RLS / policies | on / 0 | `relrowsecurity=true` / 0 policies | ✓ identical |
| `pipeline_runs` (`sources:link_parcel_addresses`) | 8 completed / 0 failed / 0 skipped, latest 2026-07-08 | 8 completed (0 failed/skipped rows exist for the other 2 slug forms either), latest `2026-07-08T13:59:38.532Z`, avg duration 203,750.75 ms | ✓ identical |
| First (origin) run | 2026-06-10, `records_new: 511224` | `started_at: 2026-06-10T14:40:29.291Z`, `records_new: 511224`, `records_total: 486530` | ✓ identical — confirms Fold B correction 3 (origin ≠ re-run) |
| `stale_st_within` (finding 1 live exposure) | 0/511,224 | 0 | ✓ identical |

**No drift found.** The DB has not moved since the planning session captured §0 — same host
(`172.20.0.10:5432`, container-internal for the local dev Postgres), same database (`postgres`), same
migration floor (242).

### The chain-schedule question (finding 3) — stated plainly, not resolved this commit

Finding 3 flagged that the B3 run-ledger gate has never fired live for this step (last recorded run
2026-07-08, the gate landed 2026-08-16, 39 days later) and named `tasks/lessons.md:103`'s "a workflow
disabled in the GitHub UI cannot be re-enabled by editing its cron" as a plausible, not proven, cause. This
commit checked it directly rather than leaving it a guess:

- `gh workflow list --all` → `chain-sources` is **`active`** (not disabled in the GitHub UI) — the
  `lessons.md:103` disabled-in-UI hypothesis is **refuted** for this specific workflow, this specific check.
- The committed YAML's OWN header comment (`.github/workflows/chain-sources.yml:6-7`, unchanged since
  `1c3948c0c`, 2026-07-20) reads *"Inertness (P3-D6, Spec 115 §3): `schedule:` committed COMMENTED OUT. Phase
  4.3 activation = one PR uncommenting it."* — **this comment is now STALE.** `git blame` shows the
  `schedule:`/`cron` lines (`:13-14`) were uncommented by `d2d06c6b2` ("chore(115_scheduling): activate
  pipeline chain cron schedules (Phase 4.3 / F2)", 2026-07-25) and the file's own header comment was never
  updated to match — a documented instance of the same class as `tasks/lessons.md:125`'s LW-D12 lesson ("a
  comment citing a real ratified decision can be citing the wrong layer/moment"), here a comment that is
  simply out of date against its own file's later commit.
- The cron is live: `0 13 * * 0` (weekly, Sunday ~13:00 UTC / ~8am ET). `gh run list --workflow=chain-sources`
  (30-run window, 6 runs total exist) shows exactly **one** `event: schedule` run ever —
  `2026-08-02T14:21:07Z`, **`conclusion: failure`**, duration 1m21s (a fast failure, consistent with an early
  step erroring rather than a mid-chain timeout). Every other recorded run (5 of 6) is `workflow_dispatch`
  (manual): two on 2026-08-24 (main, one success/one failure), one on 2026-08-07 (this branch, success), two
  on 2026-08-03 (main, both failure).
- **The open question, stated plainly, not resolved here:** since activation (2026-07-25) there have been
  multiple Sundays (08-03, 08-10, 08-17, 08-24) with no corresponding `event: schedule` run in the visible
  history at all — not even a failed one. Whether the cron is silently not firing (a GitHub Actions
  scheduled-workflow quirk, e.g. suppressed on a low-activity default branch — `main` has commits throughout
  this window, so that specific known cause does not obviously apply), whether `gh run list`'s 30-run window
  is somehow eliding older schedule runs (checked: only 6 runs exist for this workflow total, so this is not
  a windowing artifact), or whether the 2026-08-02 failure led to some other suppression, is **not resolved
  by this pilot** — resolving the chain-schedule question is explicitly out of this pilot's scope (per the
  plan's finding 3 framing). What IS newly established, live, this commit: the workflow is not
  UI-disabled, the YAML's own `schedule:` block is genuinely live (not commented out despite the stale
  header comment saying otherwise), and the B3 gate's `gate.skip` branch remains untested-live regardless of
  which of the above explains the silence — this commit's finding narrows the cause space without closing it.

### Additional G0 surface, re-executed this commit (not in §0's original seed)

- `manifest.json`'s `chains.sources` array: `link_parcel_addresses` at index 8 of 28, confirmed by direct
  read this commit (unchanged from §0).
- `write.js`'s executor set (`executeSetBasedClear`, `executeUpsertBatch`, `executeRetraction`,
  `executeSetBasedJoinUpdate`) — confirmed 4 exist, 0 express "INSERT…SELECT…ON CONFLICT DO NOTHING, no
  retraction" (re-grep this commit, unchanged from Fold A/B).
- `scripts/steps/_schema/converted.json` — 4 entries, `link-parcel-addresses.js` in neither `converted` nor a
  `pending` file (re-confirmed this commit; commit 6 of this pilot adds the `.pending` entry, per R-K and the
  plan's own note that pilot 4 added it at its commit 7 but this pilot's `it.fails`-without-`pending` is
  correct at commit 6 because the conformance suite's `pending` describe requires shape-clean).

No BLOCKING conflict found against Fold A/B's rulings. G0 is CLOSED this commit.

---

## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)

> **5 total commits (2 `fix(`, 3 `feat(`), all adjudicated — the smallest corpus of any pilot to date.** Per
> Spec 124 §4.2 (discoverer≠adjudicator): this table is PROPOSED by this pass; final ADJUDICATION is a
> separate operator ruling, mirroring pilots 3/4's own split. `a81c6a7c` and `b92ad16f` are the SAME two B3
> output-fold commits pilot 4's G3 already adjudicated for `link-wsib.js` (both touch 3 files in one commit:
> `link-wsib.js`, `link-parcel-addresses.js`, `compute-parcel-cost-estimates.js`) — re-adjudication here is for
> THIS file's hunks specifically, verified by direct `git show <sha> -- scripts/link-parcel-addresses.js` this
> commit, not a re-read of unfamiliar work.

| Commit | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|
| `d44b4458` (origin, 2026-05-23) | The whole script: batched `INSERT…SELECT…JOIN ST_Within…ON CONFLICT DO NOTHING`; `finalLinks===0` hard FAIL gate (`:288-300`, comment: *"A complete failure … silently produces final_link_count = 0 and the chain would proceed to unlink every permit downstream"*); NULL-geom guards both sides; `ADVISORY_LOCK_ID=115` | ✓ (all cited lines current) | **encoded-as-descriptor-field** (write target class D, the FAIL gate as a `blocking:true` check, the lock id in `identity`) | G1–G13 (Before/after guarantees table); the FAIL gate's own comment already states its Rule-4 `why` verbatim — carries forward unchanged |
| `1f8ca38a` (feat, 2026-07-07) | `parcel_link_rate_pct` INFO audit row added (`:307-317`) — no FAIL gate touched, no other line in this file changed (verified: `git show 1f8ca38a -- scripts/link-parcel-addresses.js` is a single 11-line hunk) | ✓ (`:308-317`) | **encoded-as-descriptor-field** (a declared `checks[]` INFO row) | Spec 43 §6.7-A cited in-file; carries forward as a check with `severity:"INFO"`, no threshold |
| `74653a8f` (feat, 2026-08-16) | The B3 run-ledger gate itself (`runLedgerGateDecision`, `gate.skip` branch, `:96-119`) | ✓ | **encoded-as-descriptor-field** (`staleness.ledgerGatedSkip`, wired into the new `runMaterializePhase` per A-1's ruling) | this is the load-bearing mechanism finding 3 measured as untested-live — preserved verbatim in the phase-shape ruling, not re-derived |
| `b92ad16f` (fix, 2026-08-16) | `buildSkipGateRecordsMeta` skip-path audit rows replacing a bare hardcoded `verdict:'PASS'` — carries forward `address_points_with_no_parcel_pct`+`errors`, `own_started`/`last_full_run_at`, `consecutive_skips` (verified live diff this commit: `git show b92ad16f -- scripts/link-parcel-addresses.js`) | ✓ (`:97-107`, current file) | **preserved-in-runner** — the mechanism becomes the library's gated-skip shape (`staleness.ledgerGatedSkip`), same disposition pilot 4 gave the identical commit for `link-wsib.js` | same B3 remediation this pilot's own finding 3 depends on; the skip path is genuinely untested-live regardless of disposition |
| `a81c6a7c` (fix, 2026-08-16) | `FORCE_FULL_ENV = 'LINK_PARCEL_ADDRESSES_FORCE_FULL'`; `bypassGate = process.env[FORCE_FULL_ENV]==='1'`; `gate = bypassGate ? null : await runLedgerGateDecision(...)` (verified live diff this commit) | ✓ (`:66-72`, `:88-100`, `module.exports` `:393`) | **encoded-as-descriptor-field** (`override.force_full`, R-L's `chain_args` argv-gated pattern — this step is `sources`-only so `chain_args:{sources:["--full"]}` would make `explicitFull` structurally true there, mirroring `link_massing`/`link_wsib`'s already-ratified R-L pattern) | R-L (Spec 124 register); the env var itself (not an argv flag) — R-L's pattern generalizes the TRIGGER, not the mechanism name, since this step already reads an env var rather than `process.argv` (finding 5: 0 `process.argv` reads, confirmed again this commit) |

**Approver for every disposition above:** this pilot's PH-3 pass (agent, 2026-08-29), grounded in direct
`git show`/`git blame` re-verification this commit (not transcribed from the plan's own G3 table, which named
the commits but did not re-diff them) — per Spec 124 §4.2's discoverer≠adjudicator split, PROPOSED here,
stands until a human operator ratifies or overturns at commit 7.

### `LPA-D1` — the W3 retraction breach, KNOWN-DEFECT pin (Spec 123 §3.1)

**Classification (Spec 123 §3, the four questions):** (1) Is it observed? Yes — `link-parcels.js:282`'s own
code comment states the consumer's reliance in-file (*"parcel_address_points guarantees the AP geom is INSIDE
the parcel"*). (2) Does a spec/invariant assert the opposite of what the code does? **Yes — DEFECT.** The
class-D `ON CONFLICT DO NOTHING` write (`link-parcel-addresses.js:176`, `0` DELETE anywhere) never re-evaluates
or removes a row after an upstream `geom` UPDATE (`load-parcels.js:293-294`, `load-address-points.js:215` both
`DO UPDATE geom`), so the guarantee the consumer trusts CAN go stale with zero repair mechanism — the exact
opposite of "guarantees." (3) Load-bearing? Yes — Strategy 1a (0.97 confidence, `link-parcels.js`) and Tier 1a
(0.95, `link-coa-to-parcels.js`) both trust it unconditionally, both TOP-of-cascade. (4) Cost of carrying vs.
diverging: **measured live exposure is 0/511,224 rows today** (re-confirmed commit 1, §1 above) — carrying it
through the conversion costs nothing observable; building a retraction mechanism this pilot would be
undefended scope-creep against a defect with zero current blast radius.

**Per Spec 123 §3.1: PIN it in its current wrong form, annotated KNOWN-DEFECT with a Defect Ledger ID, keep
the differential at zero-diff. Fix in a separate commit/WF3 after conversion is green.** `LPA-D1` opened below.
The `checks[].why` this pilot's commit 7 descriptor must carry (Rule 4 — a rule kept in compute/undeclared-as-
mechanism must still be written down): *"class D (`insert_only_no_retraction`) has no re-evaluation mechanism
for an upstream geom UPDATE on `parcels`/`address_points` — a stale `parcel_address_points` row is a possible,
zero-measured-incidence-today, KNOWN-DEFECT (LPA-D1). The staleness gate's crashed/stuck-`running` reader
(Spec 124 R-B, still ⚠ OPEN) is unrelated — this is a data-staleness gap, not a crash-recovery gap."*

### `LPA-D2` — the resumability header claim (self-description bug, not a behavior bug)

**Classification:** (1) Observed? The header comment itself is the only "consumer" — no code reads or branches
on the claim. (2) Spec/invariant conflict? The comment (`:32-34`) asserts *"a re-run picks up where we left
off"*; the code (`lastParcelId = -1` at `:148`, never persisted) does not. **This is a DEFECT in the
DESCRIPTION, not the BEHAVIOR** — the behavior (`ON CONFLICT DO NOTHING` makes every re-scan idempotent) is
correct and safe; only the claim that a re-scan is skipped is false. (3) Load-bearing? No downstream consumer
reads or depends on the resumability claim — an operator reading the comment could form a wrong expectation
about how fast a post-Ctrl-C re-run completes, but nothing breaks. (4) Cost of carrying: zero functional cost,
but a false operational claim in a header is worth correcting cheaply.

**Resolution rung: (a) descriptor** — `notes.json`/the descriptor's own prose states the truth
(idempotent-not-resumable, matching `docs/reports/2026-08-22-sources-chain-evidence-base.md:285`'s
independent finding) at commit 7. No behavior change, no library growth. `LPA-D2` opened below as a tracked,
low-cost correction (not a KNOWN-DEFECT pin — the code is not wrong, the comment is).

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/link-parcel-addresses.js` (393 lines) touches something outside pure computation — DB,
> clock, network, argv/env — re-derived by direct read this commit, not copied from §0/G5's preliminary pass.

### DB seam
- `pool` — supplied by `pipeline.run('link-parcel-addresses', main)` (`:390`), never a local `new Pool()`.
- **2 `pool.query`** sites, BOTH outside any transaction: the pre-run stats read (`:123-130`, parcel/AP geom
  counts + existing link count) and the post-run stats read (`:222-233`, final link/coverage counts) — pure
  reporting queries, no write side effect.
- **1 `client.query`** site (`:160-183`) — the ONE write statement, inside `pipeline.withTransaction(pool,
  async (client) => {...})` (`:154`). **Genuinely different transaction shape from every pilot so far**:
  `withTransaction` is called ONCE PER BATCH, inside a `while(true)` loop (`:152-218`) — pilot 4's `link_wsib`
  opens ONE transaction for all 3 tiers (`:343-462`); this step opens up to ~487 independent transactions (one
  per 1,000-parcel batch), each committing before the next begins. This is the write-discipline table's own
  `txn_scope: batch` field, re-confirmed here as a genuine seam distinct from `runLinkPhase`'s single-write-plan
  shape (Fold A finding 3) — `runMaterializePhase` must reproduce a PER-BATCH transaction loop, not one
  transaction wrapping a single write plan.
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {...})` (`:74`) wraps the ENTIRE gate + batch
  loop — lock 115, kept textually (already declared in `identity`, §5.4 precedent).
- **0 session-scoped `SET`/`RESET` GUC calls** — unlike `link_wsib`'s `pg_trgm.similarity_threshold` pairing,
  this step has no session-config dependency. Simplest DB seam of any pilot to date on this axis.

### Clock seam
- `pipeline.getDbTimestamp(pool)` → `RUN_AT` (`:81`) — the ONE DB-clock read, captured BEFORE the batch loop
  starts, threaded as a bound param (`$3::timestamptz`) into every batch's INSERT (`:171`, `:183`).
- `Date.now()` — **2 sites** (`:75` `t0`, `:220` elapsed) — both elapsed-time-only (`durationMs`/`elapsedMs`),
  never written to the DB as a timestamp; legal per the lesson's explicit carve-out.
- **0 `new Date(`** anywhere — cleaner than `link_wsib`'s 1 read-side-normalization site; this step has no
  read-value-to-ISO-string conversion at all.

### Network seam
- **0 `fetch(` calls** — no external network dependency, same as `link_wsib`.

### argv/env seam
- **1 read, already has a declared home:**
  - `process.env[FORCE_FULL_ENV]` (`:88`, `FORCE_FULL_ENV = 'LINK_PARCEL_ADDRESSES_FORCE_FULL'`) →
    `override.force_full` (E1, the box already exists per pilots 3/4's own E1 finding) — §2's G3 disposition
    (`a81c6a7c`) already named this the encoded-as-descriptor-field target.
- **0 `process.argv` reads** — no invisible-to-lint argv read exists (finding 5, re-confirmed: 0 hits).

### Seam-map verdict (G5)
No PARTIAL seams remain unresolved for this pilot — DB/Clock/Network/argv-env are all either
already-declared-field-bound (E1) or structurally clean (Clock's read/write split; Network's absence; 0 GUC
pairs). The ONE open library question is not a seam gap but the PHASE-SHAPE gap (A-1, RULED Fold A —
`runMaterializePhase`), and this commit's DB-seam finding sharpens exactly why: the per-batch transaction
loop (up to ~487 independent commits) is a shape `runLinkPhase`'s single-write-plan model cannot express
without breaking G2's verbatim guarantee, consistent with Fold A/Integration finding 3.

---

## §4. PH-6 — Classification (commit 4, G6)

> Every finding from the plan's "six findings" list + this pilot's own archaeology (§2), classified per
> Spec 123 §3's three-way split: **CONTRACT** (a downstream consumer depends on it, even if ugly) /
> **INCIDENTAL** (nothing observes it — do not assert on it) / **DEFECT** (a spec or invariant asserts the
> opposite).

| Candidate | Ledger ID | Classification | Ground |
|---|---|---|---|
| Finding 1 — class-D W3 retraction breach | LPA-D1 | **DEFECT, PIN (Spec 123 §3.1)** | opened commit 2; §2 above states the full four-question classification |
| Finding 2 — resumability header claim | LPA-D2 | **DEFECT in the description, not the behavior** | opened commit 2; the code (idempotent) is correct, only the comment is false |
| Finding 3 — B3 gate untested-live / chain-schedule silence | *(no LPA-D — process/ops, not a step defect)* | **INCIDENTAL to this step's correctness; a genuine ops gap, stated plainly not resolved** | the gate's `gate.skip` branch has zero live evidence of correct behavior, but nothing in `link-parcel-addresses.js` itself is wrong — the silence is either an unfired cron or an upstream scheduling question (§1's chain-schedule finding), out of this pilot's scope per the plan. Filed as a LOW followup (below) so it is not silently dropped |
| Finding 4 — 3 undeclared literal tunables (`BATCH_SIZE`, `noAddressFraction`, `noParcelFraction`) + Fold B's 2 NEW fan-out tunables (T4/T5, replacing the dropped allow-list) | **LPA-D3** (opened this commit, below) | **DEFECT** | Spec 124 Rule 3 — every verdict-affecting threshold must be a registered logic variable; T2/T3 gate the WARN/PASS verdict directly (bare literals today), T1 gates pacing only. Same class as pilot 4's LW-D1. Externalization is a declared diff (P4 tunable inventory table), not a behavior change — every default value is UNCHANGED from its current literal |
| Finding 5 — `manifest.json`'s 2 `supports_*` flags | *(no LPA-D)* | **CLOSED, was never a defect** | both flags are TRUE-to-the-code, re-confirmed this session (0 `process.argv`/`--full`/`--dry-run` reads) — a genuinely clean node, stated plainly rather than manufacturing a finding where none exists |
| Finding 6 — shared test files already narrowed to 2 callers | *(no LPA-D)* | **INCIDENTAL to correctness; a re-homing work item, not a defect** | tracked in the commit 7 execution plan (narrow to the final single caller, `compute-parcel-cost-estimates.js`), no behavioral claim at stake |
| Fold A/B's fan-out WARN (`parcel_fanout_outliers`) + G9's 4th `address_class_desc` value (`"Land Entrance"`) | *(no LPA-D — new declared checks, not fixes to an existing wrong behavior)* | **CONTRACT-adjacent, new observability** | descriptor/notes.json work at commit 7, per Fold A/B's rulings; not a defect in the current script (the script writes correctly today, it simply doesn't yet SURFACE the fan-out distribution or name the 4th tier) |

### `LPA-D3` — 3 undeclared literal tunables (opened this commit)

Same Rule 3 violation class as pilot 4's LW-D1. `BATCH_SIZE = 1000` (`:51`, pacing only, non-verdict-affecting)
· `noAddressFraction >= 0.50` (`:330`, gates the `parcels_with_no_address_pct` WARN) ·
`noParcelFraction >= 0.05` (`:339`, gates the `address_points_with_no_parcel_pct` WARN). `SELECT variable_key
FROM logic_variables WHERE variable_key ILIKE '%link_parcel%' OR variable_key ILIKE '%batch_size%'` → **0
rows** (re-run this commit against 439 total rows — unchanged from finding 4's original measurement).
Resolution: rung (c), admin logic variable — the P4 tunable inventory table (T1–T5, including Fold B's two new
fan-out tunables) at commit 7. `LPA-D3` closes at commit 7 alongside `LPA-D1`'s pin and `LPA-D2`'s descriptor
fix.

### The RANDOM/SEEDED disambiguation eyeball (Fold A item d, executed this commit — seed `20260829`)

> Fold A's Reality-Check item d ruled the commit 4/5 sample MUST be random and seeded, never lowest-id (a
> lowest-id sample is systematic, not representative). Executed live this commit against
> `172.20.0.10:5432/postgres`: `SELECT setseed(0.20260829)` on a held client, then `ORDER BY random() LIMIT 10`
> over the fan-out population (`parcel_address_points` grouped by `parcel_id`, `HAVING COUNT(*) > 1` —
> 14,235 parcels with 2+ linked address points; single-link parcels have nothing to disambiguate).

**Sample (10 parcels, seed `20260829`):**

| `parcel_id` | fan-out `n` | `feature_type` | `lot_size_sqm` |
|---:|---:|---|---:|
| 195029 | 4 | COMMON | 297.4 |
| 411946 | 2 | COMMON | 206.9 |
| 218382 | 5 | CONDO | 3481.2 |
| 120678 | 2 | COMMON | 278.9 |
| 13778 | 5 | CONDO | 1058.0 |
| 335945 | 2 | COMMON | 209.9 |
| 463473 | 2 | COMMON | 99.7 |
| 484095 | 2 | COMMON | 1796.7 |
| 330483 | 2 | COMMON | 233.1 |
| 355871 | 2 | COMMON | 434.8 |

**Eyeball (each parcel's full linked address-point set, `address_class_desc` + `address_number` +
`linear_name_full`):** all 10 parcels show a coherent pattern — every linked address shares the SAME street
(`linear_name_full`), civic numbers are adjacent/sequential (e.g. parcel 195029: `275`/`277`/`277A`/`279`
Augusta Ave; parcel 218382: `344`/`346`/`348`/`350`/`352` Front St W; parcel 13778: `2391`/`2393`/`2395`/
`2401`/`2405A` Yonge St), and each parcel carries exactly ONE `Land`-class address (the parcel's own base
civic address) plus one or more `Structure`/`Structure Entrance` addresses (subdivided units/entrances on the
same lot) — exactly the pattern Spec 54 §3's disambiguation hierarchy (Structure > Structure Entrance > Land >
area-ASC > id-ASC, G9) is built to resolve downstream. Parcel `463473` surfaced a live `"Structure Entrance"`
row (`986A Dovercourt Rd`), confirming Fold A's note that the 4th `address_class_desc` value is genuinely in
the linked population, not a theoretical edge case. **No defect found in this sample**: no cross-street
contamination, no address-number outliers, no evidence of a spatial-join or geometry defect across CONDO
(218382, 13778) or COMMON (the other 8) parcels — a fixed-rule plausibility eyeball per this step's MATERIALIZER
disposition (R-O's sampled-precision/recall doctrine is N/A here — no fuzzy predicate to sample against; this
is a spatial containment join, not a matcher).

### Two LOW followups filed this commit (`docs/reports/review_followups.md`)

1. Finding 3's chain-schedule silence (§1) — the `chain-sources` workflow's `schedule:` block is genuinely
   live but only 1 of 6 total runs ever recorded is `event:schedule` (and it failed) — cause not established,
   filed for a future investigation outside this pilot's scope.
2. Fold A/Reality-Check item c — `scripts/analysis/parcel-sanity-audit.js` has zero bridge-table checks; this
   bridge is health-checked only by this step's own golden harness (commit 5), not the standing estate-wide
   audit.

---

## §5. Golden master (commit 5, G1′) — 2 invocations (this step's sole chain membership + standalone),
## plus a separate gate-bypassed twice-run write-path idempotency proof

> **Every capture below is a REAL run of the unconverted `scripts/link-parcel-addresses.js`** via
> `scripts/analysis/capture-step-golden.js`, run sequentially against `172.20.0.10:5432/postgres`. Files:
> `docs/reports/golden/link_parcel_addresses/pre/{sources,standalone,standalone-repeat,standalone-forced-1,
> standalone-forced-2}.json` + `docs/reports/golden/link_parcel_addresses/invariants.json` (9 entries).
> `--tables=parcel_address_points` (the step's ONE write target, per §1.4's re-derivation — `address_points`
> is a source table, not this step's output), `--table-columns`/`--table-order` both
> `parcel_id,address_point_id` (excludes `computed_at`, Fold A NOTE 8, precedent `link_massing`) — bypasses
> the 100,000-row ceiling via the projection mechanism (`ceiling_bypassed: 'projected'`), since 511,224 rows
> exceeds the harness's default 100,000 ceiling.

### The 2 pinned invocations — `sources` (this step's ONLY chain membership, index 8/28) + `standalone`

Both invocations **SKIPPED** (`gate.skip: true`, reason `no_upstream_changes`) — neither `parcels` nor
`address_points` has changed since this step's own last completed run (2026-07-08), so the B3 gate correctly
short-circuited before the batch loop ever ran. This is the expected shape per the plan's own G8 preliminary
note ("both cheap, `records_new: 0` on a repeat run") — **not a capture-harness limitation**: the corpus is
genuinely stale-relative-to-itself today.

| Invocation | Chain | `gate.skip` | `parcel_address_points` rows/hash | Wall time |
|---|---|---|---|---:|
| `pre/sources.json` | `sources` | `true` (`no_upstream_changes`) | 511,224 / `bde2b1c4` | 0.1s (SKIP) |
| `pre/standalone.json` | `none` | `true` (`no_upstream_changes`) | 511,224 / `bde2b1c4` | 0.1s (SKIP) |

`--compare` of the two: **1 difference — the `chain` metadata field only** (`"sources"` vs `"none"`); every
other normalised field (summary, table_state, invariants) is byte-identical. Both captures show `ledger=[]`
(no NEW `pipeline_runs` row inserted by either) — this is **not** the harness docblock's aspirational "standalone
exercises the ledger path" claim playing out: `link-parcel-addresses.js` itself never calls an
`openLedgerRow`/`finalizeLedgerRow`-shaped function (confirmed by direct read, §1's key-files table) — its
historical `pipeline_runs` rows (`pipeline='sources:link_parcel_addresses'`) were written externally, by
`run-chain.js`, which `capture-step-golden.js` does not invoke (it spawns the script directly, mirroring
`spawnStepChild` but not the ledger-row lifecycle around it). Consistent with finding 3 (zero SKIP-path
ledger rows exist under any slug form) — noted here as a factual observation about the capture, not a defect
in the step or the harness.

### Harness self-test (Done-test requirement)

Re-ran the `standalone` capture a second time (`pre/standalone-repeat.json`) and diffed via `--compare`:
```
[capture-step-golden] IDENTICAL (normalised): docs/reports/golden/link_parcel_addresses/pre/standalone.json == docs/reports/golden/link_parcel_addresses/pre/standalone-repeat.json
```
Exit code 0. **Harness self-test PASSES.**

### Separate: gate-bypassed twice-run write-path idempotency proof (`LINK_PARCEL_ADDRESSES_FORCE_FULL=1`)

The 2 pinned invocations above never reach the batch/write loop (both SKIP). Per the write-discipline table's
`idempotent_rerun: "zero_writes"` claim ("to be formally proven by commit 5's twice-run acceptance test,
Spec 122 §1.4"), the batch loop itself needed to be genuinely exercised — done here via the step's OWN
declared escape hatch (`FORCE_FULL_ENV`, bypasses the gate, `gate=null`), run TWICE, standalone, NOT part of
the differential's pinned invocation set (A-1's ruling: this MATERIALIZER ships `recovery.reset` declare-only,
no forced-full/reset scenario belongs in the diffed set) — a separate proof, captured for the record.

| Run | Batches | Elapsed | `new_links_written` | `final_link_count` | `parcel_address_points` hash |
|---|---:|---:|---:|---:|---|
| `standalone-forced-1.json` | 487 | 30.7s | 0 | 511,224 | `bde2b1c4` |
| `standalone-forced-2.json` | 487 | 30.9s | 0 | 511,224 | `bde2b1c4` |

`--compare` of the two forced runs: **IDENTICAL (normalised), exit 0.** The real `INSERT…SELECT…JOIN
ST_Within…ON CONFLICT DO NOTHING` batch statement ran all 487 batches both times (confirmed via the real
stdout log lines, not simulated), wrote 0 new rows both times, and left the table hash unchanged —
`idempotent_rerun: "zero_writes"` is now **measured, not merely inferred from `pipeline_runs` history**.
Wall time (30.7–30.9s) is far under the historical avg (~204s, finding 3) — consistent with a fully warm
buffer cache / already-populated bridge (no new rows to write, every batch's `ins` CTE returns 0 rows), not
a regression.

### Non-determinism inventory (declared BEFORE the first diff, Spec 124 §7 Step 4)

Each capture's own `nondeterminism` field (auto-detected, not hand-curated) is a 5-entry set, verified this
commit by direct read of each JSON file. The 2 SKIP captures (`sources`, `standalone`) match:
`key:summary.records_meta.duration_ms, pattern:duration_literal, pattern:iso_timestamp, row:sys_duration_ms,
row:sys_velocity_rows_sec` — the `own_started`/`last_full_run_at` ISO-8601 timestamps carried into the
skip-path audit metadata trigger `pattern:iso_timestamp`. The 2 forced captures instead show
`key:summary.records_meta.duration_ms, pattern:duration_literal, pattern:run_id_literal, row:sys_duration_ms,
row:sys_velocity_rows_sec` — no ISO timestamp appears in the real-run audit table (`own_started`/
`last_full_run_at` are skip-path-only fields), but the "Batch N: ... running total: 0" stdout log lines
trigger the harness's `run_id_literal` pattern instead. Both shapes are the SAME 5-hit class of known-volatile
elapsed-time/timestamp noise; none touch the pinned `table_state` hash or the 9 `invariants.json` values in
either shape.

| key | disposition |
|---|---|
| `summary.records_meta.duration_ms` | `excluded-with-reason` — elapsed wall time, never written to a table |
| `sys_duration_ms` | `excluded-with-reason` — same, harness-computed |
| `sys_velocity_rows_sec` | `excluded-with-reason` — derived from duration |
| `pattern:duration_literal` | `normalize-then-match` — any duration-shaped string is masked before comparison |
| `pattern:iso_timestamp` | `normalize-then-match` — any ISO-8601 timestamp is masked before comparison |
| `pattern:run_id_literal` | `normalize-then-match` — a bare `PIPELINE_SUMMARY` field name matching `run[_ -]?id` shape (forced captures only, harness auto-detection) |

Every disposition drawn from the closed vocabulary (`must-match-exactly` \| `normalize-then-match` \|
`excluded-with-reason`).

### Invariants pinned (`docs/reports/golden/link_parcel_addresses/invariants.json`, 9 entries, identical across
### all 5 captures — measured values, live this commit)

`rows=511224` · `stale_st_within_count=0` · `missed_link_count=0` · `multi_parcel_address_count=0` ·
`dup_count=0` · `fanout_max_condo=346` · `fanout_max_noncondo=155` · `noncondo_gt_20_count=130` ·
`land_entrance_count=449`. **Every structural invariant reads 0 (clean)** — no stale spatial-containment rows
(LPA-D1's live exposure, re-confirmed a 3rd time this pilot), no missed in-parcel address points, no
multi-parcel address points, no duplicate `(parcel_id, address_point_id)` pairs. The 4 distribution figures
exactly reproduce Fold B's corrected measurements (CONDO max 346, non-CONDO max 155, 130 non-CONDO parcels
over the T4 default-20 threshold, 449 `"Land Entrance"`-class linked address points) with zero drift across 3
independent re-measurements this pilot (§1's boundary freeze, §4's disambiguation-eyeball population check,
and this commit's capture).

---

## §0. PH-0 seed — measured boundary table (2026-08-29 planning session)

> Executed against the local dev DB (`current_database() = postgres`, port 5432 — **not** the
> `127.0.0.1:54322` instance pilots 3/4 cited; same `schema_migrations` COUNT, **242**, confirming no drift)
> and the working tree at HEAD, branch `wf2/deep-scrapes-restore-l0`. This is a SEED for commit 1's full PH-0
> pass, not the pass itself — commit 1 must re-execute every row below, not copy it.

### Source file surface

| Metric | Value | Command |
|---|---|---|
| Lines | 393 | `wc -l scripts/link-parcel-addresses.js` |
| `pool.query` sites | 2 | `grep -c "pool\.query" scripts/link-parcel-addresses.js` |
| `client.query` sites | 1 | `grep -c "client\.query" scripts/link-parcel-addresses.js` |
| `try` / `catch` / `finally` | 1 / 1 / 0 | `grep -c "\btry\b\|\bcatch\b\|\bfinally\b"` — the batch loop's own error counter, `:153-217` |
| `throw` sites | 0 | `grep -c "\bthrow\b"` |
| `emitSummary` sites | 2 (gate-SKIP path, real-run path) | `grep -n "emitSummary"` |
| `emitMeta` sites | 2 | `grep -n "emitMeta"` |
| `Date.now()` | 2 (`:75` `t0`, `:220` elapsed — both elapsed-time only) | `grep -n "Date\.now"` |
| `new Date(` | 0 | `grep -n "new Date("` |
| `process.env` reads | 1 (`FORCE_FULL_ENV`, `:88`) | `grep -n "process\.env"` |
| `process.argv` reads | 0 | `grep -n "process\.argv"` |
| `console.*` | 0 | `grep -c "console\."` |
| `fetch(` | 0 | `grep -c "fetch("` |
| `ON CONFLICT` (code, not comments) | 1 (`:176`, `DO NOTHING`) — grep's raw count is 4 (3 are comment/doc-string mentions at `:25`,`:34`,`:159`) | `grep -n "ON CONFLICT"` |
| `DELETE` | 0 | `grep -c "DELETE"` |
| `module.exports` | `{ main, ADVISORY_LOCK_ID, OWN_SLUGS, UPSTREAM_SLUGS, FORCE_FULL_ENV }` (`:393`) | `grep -n "module.exports"` |
| Module-scope guard | `if (require.main === module) { pipeline.run('link-parcel-addresses', main); }` (`:389-391`) — I1 fence, already present | `grep -n "require.main"` |
| `ADVISORY_LOCK_ID` | 115 (free-range; Spec 47 §A.5 registry row confirms: `link-parcel-addresses.js`, Wave "2 — Link", `Writes Timestamps? NO`) | `grep -n "ADVISORY_LOCK_ID ="` |
| `pipeline.run(` hits | 2 — the doc comment at `:387` (historical note: "formerly ran `pipeline.run(...)` unconditionally at module scope") + the live guarded call at `:390` | `grep -n "pipeline\.run("` |
| Declared `logic_variables` consumed | **0** — no `loadMarketplaceConfigs` call, no `ctx.config` read anywhere in the file | `grep -c "loadMarketplaceConfigs\|ctx.config"` |

### Write surface (per §1.4 re-derivation — NOT the evidence-base label, though this one confirms it)

| Target | Statements | Columns written | Guard mechanism | Scope |
|---|---|---|---|---|
| `parcel_address_points` | 1 (the per-batch `INSERT…SELECT…JOIN ST_Within`, `:169-177`) | `parcel_id`, `address_point_id`, `computed_at` | **none** — `ON CONFLICT (parcel_id, address_point_id) DO NOTHING` is a duplicate-suppressor, not a change guard (there is nothing to guard: the row is immutable once written) | unscoped INSERT over the full un-linked parcel population, batch-paginated by `id > lastParcelId` |

**1 write statement, 1 target, class D `insert_only_no_retraction` (Spec 122 §1.4 — confirmed, not ported blind: evidence base §3f's own label for step 8 already reads `D`, and this session's independent read of the file agrees). 0 destructive retraction. 0 `K` (derived_recompute) target — the SOLE archetype-forced MATERIALIZER example, per Spec 122 §8.2's table.**

**The W3 breach, concretely reachable (not merely theoretical):** both upstream producers UPDATE `geom` on `ON CONFLICT` for an *existing* row — `load-parcels.js:293-294` (`geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326)` inside its `DO UPDATE`) and `load-address-points.js:215` (`geom = EXCLUDED.geom`). A parcel boundary correction (subdivision, consolidation, Toronto Open Data re-survey) or an address-point coordinate correction therefore CAN silently invalidate an already-written `parcel_address_points` row's spatial truth — `ST_Within` no longer holds — and class D's `ON CONFLICT DO NOTHING` has no mechanism that ever re-evaluates or removes that row. **This is not incidental**: `scripts/link-parcels.js:282` states the consumer's own relied-upon guarantee in a code comment — *"parcel_address_points guarantees the AP geom is INSIDE the parcel"* — so a stale link is a guarantee violation reaching Strategy 1a (confidence 0.97) and Tier 1a (confidence 0.95) matches, silently.

### Chain membership (measured, not grep-context)

| Chain | Array index | Adjacent steps | Runs `assert_schema` at head? |
|---|---|---|---|
| `sources` (28 steps) | 8 | `["load_heritage","load_centreline","link_parcel_addresses","compute_centroids","link_parcels"]` | YES (`sources[1]`, after `reconcile`) |

**`link_parcel_addresses` is a member of `sources` ONLY** — not `permits`, not `coa`, not `entities`, not `wsib` (confirmed via `node -e` over `manifest.json`, one hit). Simpler invocation-set shape than pilot 4's dual-chain (`permits` + `sources`) MATCHER. `manifest.json:27` declares `"supports_full": false, "supports_dry_run": false, "telemetry_tables": ["parcel_address_points"]` — **both `supports_*` flags are measured TRUE-to-the-code** (unlike pilot 4's link_wsib, where both were false-to-the-code): the file has 0 `--full`/`--dry-run` argv reads anywhere, confirmed by the 0 `process.argv` count above.

### Live table state

| Table | Rows | Key facts |
|---|---|---|
| `parcel_address_points` | 511,224 | PK `(parcel_id, address_point_id)`, 1 reverse btree on `address_point_id`, 2 FKs (`parcels.id` / `address_points.address_point_id`, both `ON DELETE CASCADE`), RLS on / 0 policies |
| `parcels` | 486,530 (all with non-NULL `geom`, 0 with NULL) | upstream producer 1 |
| `address_points` | 525,346 (all with non-NULL `geom`, 0 with NULL) | upstream producer 2 |
| Coverage | 467,786 / 486,530 parcels linked (96.15%) · 511,224 / 525,346 address points linked (97.31%) | matches Spec 54 §Bridge's stated "~511K bridge rows over ~468K linked parcels" |
| `parcels_with_no_address` | 18,744 (3.85% of geom-bearing parcels) | under the file's own 50% WARN ceiling |
| `address_points_with_no_parcel` | 14,122 (2.69% of geom-bearing APs) | under the file's own 5% WARN ceiling |
| Fan-out distribution | 453,551 / 467,786 linked parcels (96.96%) carry exactly 1 address point; max fan-out 346 (`parcel_id=469748`) | healthy long tail; the top-5 fan-out parcels (346, 290, 281, 204, 197) are a Reality-Check plausibility item — large apartment/condo footprint or a geometry defect swallowing neighbours, ~~undetermined this session~~ ~~**RESOLVED (Fold A, Reality-Check item a, 2026-08-29): feature_type-conditioned — CONDO p99 75 / max 346 (plausible); the tail's 5 non-CONDO outliers carry `feature_type='COMMON'` (parcel ids 110057, 139809, 232823, 379177, 479786; 120-155 addresses each) — declared as a closed allow-list, not silently subsumed under a flat bound. See Fold A below.**~~ **AMENDED (Fold B, 2026-08-29, fold-validation — Cross-read Adversary verdict: AMEND): feature_type-conditioned, CONDO p99 CORRECTED to 80 (max 346, not p99 75); the 5 named ids are merely the top-5 of a 4,296-parcel non-CONDO tail with no measured discontinuity vs ranks 6–10 (86–104) — the per-id allow-list is DROPPED, replaced by an honest aggregate WARN (`parcel_fanout_outliers`). See Fold B below.** |
| Address points linked to >1 parcel | **0** | confirms parcels are non-overlapping over the linked population — a structural invariant worth pinning |

### `pipeline_runs` history (3 slug forms, matching `OWN_SLUGS`)

| Slug | Completed | Failed | Skipped | Last completed |
|---|---:|---:|---:|---|
| `sources:link_parcel_addresses` | 8 | 0 | 0 | 2026-07-08 |
| `link_parcel_addresses` (bare) | 0 | 0 | 0 | — (never written under this form) |
| `link-parcel-addresses` (hyphen) | 0 | 0 | 0 | — (never written under this form) |

**Zero SKIP-path rows exist in the ledger for this step under ANY slug form.** The B3 run-ledger gate (`74653a8f`, 2026-08-16) postdates the last recorded run (2026-07-08) by 39 days — **the gate has never fired in production for this step**, a genuinely untested-live code path (`gate.skip` branch, `:96-119`), unlike pilot 4's link_wsib where the gate had at least run inside a live chain. Avg duration over the 8 completed runs: ~204s (203,750 ms).

### Git archaeology

| Metric | Value |
|---|---|
| Total commits | 5 |
| `fix(` commits | 2 (40.0%) |
| `Severity:` footers | 0 |
| `lesson-routing:` footers | 0 |
| Date range | 2026-05-23 (`d44b4458`, origin, Phase 2c) → 2026-08-16 (`a81c6a7c`, B3 output fold D) |
| All 5 commits, newest first | `a81c6a7c` (fix, B3 fold D — FORCE_FULL_ENV escape hatch added) · `b92ad16f` (fix, B3 fold B — skip-path audit rows) · `74653a8f` (feat, B3 — the run-ledger gate itself) · `1f8ca38a` (feat, sources-chain honesty gates — `parcel_link_rate_pct` INFO row + `final_link_count > 0` FAIL gate) · `d44b4458` (feat, origin — 314-line first commit) |

**Smallest commit corpus of any pilot to date** (pilot 3: 3+ digit; pilot 4: 31) — the fence-adjudication surface at commit 2/G3 is correspondingly small, but not zero: `a81c6a7c` and `b92ad16f` are the SAME two B3 output-fold commits pilot 4's G3 already adjudicated for `link-wsib.js` (they touch 3 files in one commit: `link-wsib.js`, `link-parcel-addresses.js`, `compute-parcel-cost-estimates.js`) — re-adjudication here is for THIS file's hunks specifically, not a fresh read of unfamiliar work.

### Test re-homing surface (9 files reference `link-parcel-addresses`/`link_parcel_addresses`)

| File | Lines | `it(`/`test(` count | Relationship |
|---|---:|---:|---|
| `src/tests/link-parcel-addresses.infra.test.ts` | 157 | 20 | **step-owned** — the step's dedicated infra suite |
| `src/tests/link-parcel-addresses-ledger-gate.logic.test.ts` | 56 | 5 | **step-owned** — the B3 gate's logic suite |
| `src/tests/db/ledger-gate-callers.db.test.ts` | 409 | 13 | **shared fence** — spans `link-parcel-addresses.js` + `compute-parcel-cost-estimates.js` (`link-wsib.js` already re-homed out at pilot 4 per LW-D16) |
| `src/tests/source-version.logic.test.ts` | 513 | 50 | **shared fence** — its `"adoption-lock"` source-text loop (`:474`) now iterates `['link-parcel-addresses.js', 'compute-parcel-cost-estimates.js']` only (link-wsib.js already narrowed out at pilot 4 commit 7) |
| `src/tests/backfill-address-points-geom.infra.test.ts` | 111 | 15 | incidental — one lock-ID-registry comment mention (`:35`), not a behavioural fence |
| `src/tests/pipeline-advisory-lock.infra.test.ts` | 340 | 6 | incidental — lock-registry table row + comment |
| `src/tests/quality.logic.test.ts` | 2,219 | 184 | incidental — chain-membership census (3 mentions, `sources` step count) |
| `src/tests/load-address-points.csv-drift.logic.test.ts` | 149 | 15 | incidental — 1 comment mention |
| `src/tests/load-parcels.csv-drift.logic.test.ts` | 164 | 15 | incidental — 1 comment mention |

**2 step-owned, 2 shared fences (both already narrowed from 3→2 callers by pilot 4), 5 incidental.** A smaller re-homing surface than pilot 4's 15-file table, and the shared-fence pattern is now familiar (pilot 4 already worked out the re-homing shape for the same two files).

### Golden captures / conversion state

**None exist** — `docs/reports/golden/link_parcel_addresses/` does not exist on disk (`ls` confirms; sibling dirs `assert_schema`, `load_ravines`, `link_massing`, `link_wsib` do). `scripts/steps/_schema/converted.json` lists 4 entries (`assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`); `link-parcel-addresses.js` is in neither `converted` nor a `pending` file (none exists — pilot 4's cutover deleted its own `pending` entry per R-K, and no pilot 5 entry has been declared yet; commit 1 of this pilot's procedure declares it).

---

### Fold A (2026-08-29) additions — grandfathering key, phase-shape ruling, fan-in bound, missed-link invariant (PLAN-altitude panel: Integration + Reality-Check, both executed)

> Measured live this session, same DB as §0 above (`current_database() = postgres`, port 5432; `schema_migrations` COUNT 242, unchanged from §0). Not yet a full PH-0/PH-6 pass — seeded here so commit 1/commit 4 extend rather than re-derive these findings. `.cursor/active_task.md` is amended in place, row by row, with strike-through + correction pointing back to this section.

**Integration (BLOCKING at plan altitude — all 4 corrected in `.cursor/active_task.md` in place):**

| # | Finding | Grounds |
|---|---|---|
| 1 | `grandfathered.json` entries are keyed on `outputs.writes[].write_discipline.guard` (value `"none"`), never `.class` — `assertGrandfathered` (~~`scripts/steps/_schema/validate.js:165-186`~~ **Fold B correction: `scripts/lib/step/validate.js:165-186`** — confirmed the only `validate.js` on disk, `find scripts -iname validate.js`) reads only `GUARD_PATH`. `link_massing`'s own E1 entry (`grandfathered.json:24-31`) already keys on `.guard`, not `.class` — this pilot's plan had the key backwards. As written, commit 7's descriptor would throw at `pipeline.step()` construction. | ~~`validate.js:165-186`~~ **`scripts/lib/step/validate.js:165-186`**, `grandfathered.json:24-31` |
| 2 | A-1's "stretched once already for MATCHER" premise is wrong. Pilot 4 FORKED `runCascadePhase` (`scripts/lib/step/index.js:792`, `:261-266`) rather than extending `runLinkPhase` a second time. `runLinkPhase` is used by `link_massing` ONLY. | `index.js:792`, `:261-266` |
| 3 | `runLinkPhase`'s write path is SELECT → JS row materialization → `executeUpsertBatch` (`index.js:585-742`, `:687`, `:1101`; `write.js:602`). This step's real write is ONE server-side `INSERT…SELECT…JOIN…ON CONFLICT DO NOTHING` (`link-parcel-addresses.js:169-177`) — routing it through `runLinkPhase` would split that single statement into a SELECT plus a batched INSERT, breaking G2's "verbatim" guarantee. | `index.js:585-742`, `link-parcel-addresses.js:169-177` |
| 4 | `executeUpsertBatch` always emits `ON CONFLICT DO UPDATE … WHERE <guard>` (`write.js:344-350`). With `guard:none` the `WHERE` clause is empty — a SQL syntax error, not a degenerate no-op. LG-18 is genuinely THREE sites, not one: the `buildWritePlan` class branch (`write.js:282`, `:316`), a new executor, and `executeOrderedWrites`'s dispatch (`index.js:1101-1130`). Recost ~120-180 lines. **STRENGTHENED (Fold B, 2026-08-29, grounder-confirmed): TWO distinct crashes exist under `guard:none`, not one — an UNDECLARED `guard_columns` throws a `TypeError` at plan-build (`.map` called on `undefined`, `write.js:346`); a DECLARED empty array `guard_columns: []` instead produces the syntax error already named (`WHERE \n`, no predicate — same line). Neither degrades gracefully. Separately: `executeSetBasedJoinUpdate` (LG-11) structurally REFUSES to run any SQL containing `INSERT INTO` or `ON CONFLICT` (`write.js:618` the forbidden regex, `:638` the throw) — the concrete reason LG-18 MIRRORS LG-11's shape rather than reusing it: LG-11's executor is categorically the wrong tool for an insert-only target.** | `write.js:282`, `:316`, `:344-350`, `:618`, `:638`; `index.js:1101-1130` |

**A-1 RULING (orchestrator, within the pre-authorized plan — no further operator sign-off required):** class-D's write is a new compute-authored-SQL executor, `executeInsertSelectNoRetract`, mirroring LG-11's `executeSetBasedJoinUpdate` shape (SQL text supplied by compute, `client.query` direct, zero row materialization, `ON CONFLICT DO NOTHING` preserved verbatim, an INSERT-only assertion at the executor boundary — no `UPDATE`/`DELETE` token permitted in the supplied text). Phase order (guards → prior/gate → pre_write → batch → post) is kept, inside a short new `runMaterializePhase` — a FORK, per the pilot-4 `runCascadePhase` precedent, not an extension of `runLinkPhase`/`link_massing`'s phase. `staleness.ledgerGatedSkip` is wired into `runMaterializePhase` explicitly (it exists in `runCascadePhase` only today — `runLinkPhase`/`link_massing` stay untouched by this pilot). SHOULD-FIX 6: `runLinkPhase`'s hardcoded `cumulative.parcels_with_centroid` counter key is filed as a pilot-6 (`compute_centroids`) library item, out of this pilot's scope. SHOULD-FIX 7: Spec 122 V7's no-retraction rule is not code-enforced today (~~`validate.js`~~ **`scripts/lib/step/validate.js`, Fold B correction** reads only `GUARD_PATH`) — one line in this report + a conformance-hook followup, not built this pilot. NOTE 8: commit 5's golden-capture `--table-columns` projection is `[parcel_id, address_point_id]` (excludes `computed_at`), precedent `link_massing`.

**Reality-Check (non-blocking — all numbers reproduced live this session):**

| # | Item | Measured / Disposition |
|---|---|---|
| a | Fan-in bound is `feature_type`-conditioned, not a flat 346 ceiling: CONDO parcels p99 75, max 346; non-CONDO p99 2 (tight) — with 5 non-CONDO outliers carrying `feature_type='COMMON'` (parcel ids 110057, 139809, 232823, 379177, 479786; 120-155 addresses each) | ~~**DECIDED: a WARN row, not a hard bound** — a closed allow-list (the 5 named ids, reason `"townhouse-condo registered as COMMON (inferred)"`) declared in the descriptor; anything outside CONDO/allow-listed-COMMON exceeding the non-CONDO p99 WARNs, never FAILs~~ **AMENDED (Fold B, 2026-08-29): the 5 ids are merely top-5 of a 4,296-parcel non-CONDO tail, no discontinuity vs ranks 6–10 (86–104), "registered as COMMON" uncorroborated — allow-list DROPPED. Replacement: `parcel_fanout_outliers` (WARN) = count of non-CONDO parcels over tunable `link_parcel_addresses_fanout_warn_noncondo` (default 20, measured 130 today) + INFO `{condo_max, noncondo_max, noncondo_gt_threshold}`; CONDO ceiling separately as tunable `link_parcel_addresses_fanout_warn_condo` (default 400; p99 CORRECTED to 80, max 346). No per-id exemptions. See Fold B below.** |
| b | No invariant exists today for an address point inside a parcel with no bridge row (a genuine miss, distinct from the already-declared "APs with no parcel"). Measured 0 today. | Add `parcel_address_points_missed_link_count` to commit 5's `invariants.json`, alongside `stale_st_within_count`, `fanin_max`, `multi_parcel_count`, `dup_count` |
| c | The standing `scripts/analysis/parcel-sanity-audit.js` has zero bridge-table checks | Filed as a LOW followup in `review_followups.md`; this report states the bridge is health-checked ONLY by this step's own golden harness, not by the standing audit |
| d | The commit 4/5 disambiguation eyeball sample was specified as lowest-id — a systematic, non-representative sample | Commit 4/5's sample MUST be RANDOM and SEEDED, not lowest-id |

**Additional Reality-Check notes (non-blocking):** `address_class_desc` carries a 4th value, `"Land Entrance"` (449 rows), beyond the three G9 already names (Structure, Structure Entrance, Land) — the descriptor/notes.json must state it is tier 4 by Spec 54 §3's own ordering, not omit it. `computed_at` is a SINGLE timestamp shared across all 511,224 rows (one run's stamp, not a per-row audit trail) — any reset mechanism designed later must not rely on `computed_at` to distinguish rows by run.

---

### Fold B (2026-08-29, fold-validation of Fold A — grounder + Cross-read Adversary)

> Grounder re-executed every executable claim in Fold A against the same DB (`current_database() = postgres`, port 5432; `schema_migrations` COUNT 242, unchanged) and the working tree at HEAD. **CONFIRMED all Fold A claims except the four corrections below.** Cross-read Adversary walked the folded decisions pairwise: **A-1 (phase-shape + `executeInsertSelectNoRetract` ruling) — ACCEPT.** **R-B carry-forward (Spec 124's staleness crashed/stuck-`running` reader, deferred per R-F item 1's conditional-dependency framing) — ACCEPT.** **R-M declare-only (`recovery.before_image` truthfully `"none"` alongside the declare-only `recovery.reset`) — ACCEPT.** **Fan-in allow-list — AMEND** (the one folded decision that does not survive pairwise scrutiny).

**Corrections (four; each amended IN PLACE — strike-through + correction — everywhere it was previously stated in this report and in `.cursor/active_task.md`; nothing measured is deleted):**

1. **Fan-in WARN AMENDED — the 5-id allow-list is DROPPED.** Re-run this fold: the 5 named ids (110057, 139809, 232823, 379177, 479786) are merely the top-5 of a **4,296-parcel non-CONDO tail** — ranks 6–10 sit at 86–104, no measured discontinuity separates the "named 5" from the rest of the tail, and `"townhouse-condo registered as COMMON (inferred)"` is uncorroborated (no `feature_type` sub-code, zoning join, or unit-count field confirms it — it was an inference from the address-number range alone). A per-id allow-list is not a defensible bound and does not survive the Cross-read Adversary's pairwise check. **Replacement — an honest aggregate, no exemptions:**
   - `parcel_fanout_outliers` (WARN) = count of NON-CONDO parcels with fan-out > tunable `link_parcel_addresses_fanout_warn_noncondo` (default **20**; measured **130** today → the WARN fires, expected, not a false alarm) + an INFO detail object `{condo_max, noncondo_max, noncondo_gt_threshold}`.
   - CONDO ceiling ships as a SEPARATE INFO/WARN, tunable `link_parcel_addresses_fanout_warn_condo`, default **400** (measured max 346, p99 80 — correction 2 below).
   - R-H's retighten condition is declared in the check's own `why`: *"retighten `link_parcel_addresses_fanout_warn_noncondo` when `noncondo_gt_threshold` drops below N."*
   - **No per-id exemptions anywhere** — the allow-list mechanism is retired for this check, not merely its 5 entries. Both new tunables join T1–T3 as **T4** and **T5** in the P4 inventory (`.cursor/active_task.md`).

2. **CONDO p99 = 80, not 75.** Re-run this fold against the same live table; 80 is the corrected value. Max is unchanged at 346 (single outlier, parcel 469748).

3. **Idempotent re-run history is 7/8 with `records_new: 0`, not "8/8 recorded live runs show `records_new: 0`."** The origin run (2026-06-10) wrote all `511,224` rows in that one completed run (`records_new: 511224`) — it is the FIRST of the 8 completed runs, not a re-run of an already-populated table. The remaining 7 completed runs each show `records_new: 0`. G3's idempotency claim is unaffected by this correction (7 genuine re-runs against a stable corpus all wrote zero new rows) — only the "8/8" framing overstated the re-run sample size; the origin run is not a re-run.

4. **`validate.js`'s real path is `scripts/lib/step/validate.js`, not `scripts/steps/_schema/validate.js`.** Confirmed on disk this fold (`find scripts -iname validate.js` → exactly one hit); `assertGrandfathered`/`GUARD_PATH` both live there, lines 165-186 as originally cited — only the DIRECTORY in the citation was wrong. Every citation in Fold A and the plan is corrected to this path (see the strike-throughs above and in `.cursor/active_task.md`).

**Additional grounder findings this fold (new information, not corrections to a specific Fold A number):**

5. **`stale_st_within` query cost is session-variable.** Re-run this fold: **≈1.4 s**, against the ~2.0 s this plan's own finding 1 cited (itself rounded up from an earlier ~916 ms single-session reading) — the query plan is not stable session-to-session (table statistics, cache warmth). Either figure is **trivial** next to the step's own ~200 s average run time (finding 3) — noted for completeness; it changes no gate or bound.

6. **`write.js`'s `guard:none` codegen has TWO distinct failure modes, both confirmed live, not one.** An UNDECLARED `guard_columns` field throws a `TypeError` at plan-build time (`.map` called on `undefined`, `write.js:346`). A DECLARED-but-empty `guard_columns: []` instead produces the syntax error already named in Fold A finding 4 (`WHERE \n`, no predicate — same line, `write.js:346`). Neither degrades gracefully — LG-18's own plan-build path must not accidentally hit either shape. See the Integration finding 4 amendment above, which also adds the `executeSetBasedJoinUpdate` refusal citation (`write.js:618`, `:638`) as the concrete reason LG-18 mirrors LG-11's shape rather than reusing it.

**Follow-up filed for a future pilot, NOT this pilot's scope (LOW):** the `guards → prior/gate → pre_write → RUN_AT` scaffolding this pilot's new `runMaterializePhase` reimplements will be duplicated a THIRD time across `runLinkPhase` / `runCascadePhase` / `runMaterializePhase` once this pilot lands. A shared helper — extract the common phase-order scaffold, let each runner supply only its write-mechanic-specific middle — is a pilot-6 library item, not a blocker on this pilot's commit 7.

---

## Peel 8a (2026-08-29) — gating/staleness

**Scope per the commit ledger (§8): the B3 ledger gate wiring, `config_version`/`FORCE_FULL_ENV` override, plus the two spatial-fixture claims (`#169`/`#172`) this pilot elected to schedule here rather than defer further.**

1. **`staleness.ledgerGatedSkip` wiring in `runMaterializePhase` — VERIFIED, not re-built.** `scripts/lib/step/index.js:1157` calls `staleness.ledgerGatedSkip(pool, descriptor, {now: clockNow, bypassed})` before any read/write, mirroring `runCascadePhase`'s call (LG-15, reused per Fold A SHOULD-FIX 5); the SKIP branch (`:1158-1170`) returns a full `{mode:null, gate, matched:null, written:null, prior, overrides, skipped:true, gatedSkip}` shape — never a bare skip with no audit trail — and `prior` carries the gate's own `ownLastRecordsMeta` forward so a SKIP re-emits the standing audit row rather than downgrading it (the `b92ad16f` fence, `notes.json fences[1]`). Confirmed live in both `post-8a/sources.json` and `post-8a/standalone.json` (`terminal:"skip_gated_no_activity"`, `verdict:"PASS"`, the full `audit_table` present).
2. **`skip_gated_no_activity` terminal audited — CONFIRMED live.** Both SKIP captures (peel 8a) show `records_meta.terminal:"skip_gated_no_activity"` with a populated `audit_table` (2 INFO rows: `sys_velocity_rows_sec`, `sys_duration_ms`) — never a hardcoded PASS with no rows, consistent with the descriptor's declared `skip_gated_no_activity` terminal (`records_meta: {audit_table: "object", terminal: "string"}`).
3. **`staleness.fingerprint_inputs` (`parcels:count`, `address_points:count`) — VERIFIED against the sibling convention, unchanged.** `link-wsib.descriptor.json` uses the identical `wsib_registry:count` shape for its own corpus signal; this step's `["scripts/lib/compute/link-parcel-addresses.js", "parcels:count", "address_points:count"]` is the same pattern (source-file fingerprint + a `:count` corpus proxy per table read), not a fresh design. No code change needed.
4. **R-B's carry stated as NOT EXERCISABLE HERE (no FULL mode) — added explicitly to `link-parcel-addresses.notes.json` `decisions[]`.** `runMaterializePhase` has exactly one `mode:` literal on every RUN branch — `"incremental"` (`index.js:1264`) — there is no second, behaviourally-distinct FULL code path for `LINK_PARCEL_ADDRESSES_FORCE_FULL` to select; the env var only flips `bypassed` on `staleness.ledgerGatedSkip`'s SKIP decision (`:1154`). A crashed/stuck-`running` reader that auto-forces FULL (R-B's runtime half) has nothing distinct to force this step INTO — a plain re-run already does everything a forced run would. R-B genuinely stays a future obligation for a step whose FULL mode differs behaviourally from incremental (a `retract_when:"full_only"` target); this pilot's shape can never satisfy it, not merely hasn't yet.
5. **`#169`/`#172` (spatial fixtures) — LANDED this peel.** `src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts` (5 tests: inside/outside/NULL-geom/idempotent-rerun through the production `buildBatchSql()`, plus a no-DB guard that the SQL text is genuinely `ST_Within`/`ON CONFLICT DO NOTHING`/`ap.geom IS NOT NULL`) and `src/tests/steps/link_parcel_addresses/metamorphic.test.ts` (M1 translation invariance across `[0,0]`/`[-79.4,43.7]`/`[10,-20]`/**`[1000,1000]`** — the claim's own worked example — plus M2 insertion-order invariance). Both gated `describe.skipIf(!dbAvailable())`, green under `BUILDO_TEST_DB=1` (8/8 passing). `#169`/`#172` flipped from `it.fails` to `it()` in `violations.test.ts`; both also needed a source-location correction unrelated to the fixtures themselves — see finding 6.
6. **Correction: `#169`/`#172`'s own assertions read the wrong file post-conversion.** As authored at commit 6 (pre-conversion), both claims read `STEP_REL` (`scripts/link-parcel-addresses.js`) for an `ST_Within`/`ST_\w+` token — correct THEN, since the 393-line hand-rolled script held its own SQL. Commit 7 moved the spatial predicate into `scripts/lib/compute/link-parcel-addresses.js` (G2's "verbatim" guarantee, Rule 2 compute-owns-SQL) and shrank `STEP_REL` to the frozen §5.1 wrapper, which has zero SQL text — so both assertions would read `false` against the CURRENT correct code, not merely against a not-yet-converted state. Fixed by pointing both at `computeSource()` (`COMPUTE_REL`) instead — the claim's own intent (a spatial compute needs rung-1/metamorphic coverage) is unchanged; only the file the assertion reads from moved, tracking where commit 7 actually put the SQL.
7. **`interpretation.entries` bumped 8 → 9** (`scripts/link-parcel-addresses.descriptor.json`) to match the real prose count in `notes.json` after finding 4's new `decisions[]` entry (`fences[]` is NOT counted toward the 12-entry cap — `NOTES_PROSE_BLOCKS` in `violations.test.ts` excludes it, confirmed by reading the test's own block list).
8. **Differential — `post-8a/{sources,standalone,standalone-forced}.json` vs. `post/{sources,standalone}.json` (commit 7).** `sources`/`standalone`: `--compare` **IDENTICAL (normalised), exit 0**, both. `standalone-forced` (no prior forced `post/` capture to diff against — commit 7's own "7b differential identical" forced run was not persisted to disk under `post/`): table hash **511224/bde2b1c4**, all **9** `invariants.json` values (`rows=511224 stale_st_within_count=0 missed_link_count=0 multi_parcel_address_count=0 dup_count=0 fanout_max_condo=346 fanout_max_noncondo=155 noncondo_gt_20_count=130 land_entrance_count=449`) **byte-identical** to every prior capture this pilot (§0's boundary freeze, §4's eyeball, §5's commit-5 golden, and this peel) — 0 drift across 6 independent measurements now. `verdict:"WARN"` on the forced run (`parcel_fanout_outliers:130` > the T4 default 20 — the expected, by-design standing WARN, R-H) — see finding 9 for the capture-time environment issue this run surfaced (unrelated to the differential's own correctness).
9. **Environment finding (not a code defect) filed to `review_followups.md`, MED:** the forced/gate-bypassed capture crashed twice with a Postgres shared-memory error (`could not resize shared memory segment ... No space left on device`) from `runMaterializePhase`'s invariants query — root-caused to the local dev DB container's 64 MB `--shm-size` under the 8-subquery invariants `SELECT`'s concurrent parallel-worker demand, NOT a logic error (a `PGOPTIONS='-c max_parallel_workers_per_gather=0'` capture-time-only diagnostic override reproduced a clean, byte-identical run). Full record: `review_followups.md`, "peel 8a, first live-fire of the real run path."

**Tests:** `src/tests/steps/link_parcel_addresses/` (violations + rung1 + metamorphic) — 83 total, 77 passing + 6 DB-gated skipped without `BUILDO_TEST_DB=1`/`DATABASE_URL`, 8/8 passing WITH it. `step-conformance.infra.test.ts` (107), `link-parcel-addresses.infra.test.ts` (13), `link-parcel-addresses-ledger-gate.logic.test.ts` (4), `source-version.logic.test.ts` (50) — all green, unchanged by this peel's edits.

---

*Full PH-0..PH-8 / §1–§R sections are authored across this pilot's nine commits per Spec 123 §7 — see `.cursor/active_task.md` for the plan and commit ledger.*
