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
| `logic_variables` | 444 (peel 8c, 2026-08-29) | T1-T5's 5 rows confirmed present (`link_parcel_addresses_batch_size=1000`, `_no_address_warn_pct=50`, `_no_parcel_warn_pct=5`, `_fanout_warn_noncondo=20`, `_fanout_warn_condo=400`), matching the declared defaults exactly — `apply-logic-variables.js` re-run this peel: 0/424 newly inserted (424 already existed) |
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

## Peel 8b (2026-08-29) — verdict/audit

**Scope per the commit ledger (§8): every hand-rolled metric expressed as a declared check, Rule 10 row-derived verdict, R-H standing-WARN declarations, #165's must-fail fixture battery (incl. the standing-WARN checks), LM-D16 `errors[]` rendering shown on a real WARN capture.**

1. **"Every hand-rolled metric → declared checks" — VERIFIED, no residual hand-rolling.** `scripts/lib/compute/link-parcel-addresses.js`'s `CHECKS` dispatch table has exactly the descriptor's 15 declared check ids, each a thin `ctx.report(id, {...})` reader over `ctx.matched` — no ad-hoc boolean, no inline threshold literal, no metric computed outside `buildPreSql`/`buildBatchSql`/`buildPostSql`/`buildInvariantsSql`'s SQL. Nothing to convert; commit 7 already shipped this shape.
2. **Rule 10 row-derived verdict — VERIFIED, shared machinery, not a MATERIALIZER-specific path.** `runMaterializePhase` (`index.js:1151-1273`) returns raw `matched`/`written`/`gate`; the SAME generic `computeResult = await runnable.compute(stepCtx)` → `buildAuditTable`/`deriveVerdict(rows)` (`verdict.js:243-247`, `worst = max(SEVERITY_RANK[row.status])` over every scored row) that every other archetype (ingest/cascade) already goes through builds this step's `audit_table.verdict` — no parallel `hasFails ? ... : ...` boolean exists anywhere in `index.js`'s materialize branch (`grep -n "hasFails\|hasWarn" scripts/lib/step/index.js` → 0 matches touching the materialize path).
3. **R-H standing WARNs — VERIFIED already declared with a retighten condition in `why`.** `parcel_fanout_outliers` (`descriptor.json`): *"RETIGHTEN CONDITION: if the count materially drops from 130 without any code change..."*. `parcel_address_points_stale_st_within_count` (LPA-D1): INFO, *"never a threshold to gate on until a separate ruling decides to build the retraction mechanism"* — both machine-observable every run (peel 8a's and this peel's captures both show them), never silently PASSed away.
4. **LPA-D3 (NEW, found executing #165) — `parcel_fanout_outliers`/`parcel_fanout_condo_outliers` used the wrong `VIOL_RE` comparator (`viol == 0` instead of `viol <= 0`) for a `limit_from_config`-substituted bound — CLOSED this peel.** Full grounds and fix: `docs/reports/defect-ledger.md` `LPA-D3`. One-line summary: `verdict.js`'s `resolveLimit` substitutes the resolved config number onto WHATEVER comparator a check declares; `==` and `<=` are two DELIBERATELY different forms (`VIOL_RE = /^viol (==|<=) (\d+)$/`, exact-match vs. ceiling) — T4/T5 both declared the exact-match form, so their runtime bound silently became "must equal the threshold exactly," not "must not exceed it." T4 (130 vs. default 20) happened to read the right status by coincidence (any non-equal count reads non-PASS regardless of direction); T5 (0 vs. default 400) read WARN on every real run since commit 7 — WRONG, a false alarm on a genuinely clean CONDO population, confirmed via peel 8a's own forced capture. Fixed: both `limit` strings → `"viol <= 0"`. `#165`'s own must-fail fixture battery is what surfaced this live (T5's healthy fixture, expected PASS, read WARN before the fix) — exactly the class of bug this battery exists to catch.
5. **#165 flipped `it.fails` → `it()`, green, covering ALL 15 declared checks including R-H's standing-WARN class.** `parcel_fanout_outliers`'s healthy fixture deliberately carries today's REAL live count (130, WARN by design — asserted via a `STANDING_WARN_HEALTHY` role map, not the generic healthy-must-PASS assumption); its sabotage (`fanout_noncondo_gt_threshold: 0`) proves the degenerate CLEAN direction reads PASS. `parcel_fanout_condo_outliers`'s sabotage corrected from `5` (still under the 400 default, a fixture bug the LPA-D3 fix exposed — it was silently passing for the WRONG reason pre-fix, since `==` made everything non-matching read WARN) to `401` (genuinely exceeds the bound). "INFO both ways" extended for real: `parcel_address_points_stale_st_within_count`/`parcel_address_points_missed_link_count` now also exercised on an elevated (42/7) input, proving INFO never escalates regardless of magnitude — 2 new `SABOTAGE_BY_ID` entries, additive only (the pre-existing 3 WARN/FAIL entries untouched).
6. **LM-D16 `errors[]` rendering — shown live on this peel's own WARN capture.** `post-8b/standalone-forced.json`: `errors:["parcel_fanout_outliers: 130"]` (post-LPA-D3-fix — T5 dropped out of `errors[]` entirely now that it correctly PASSes). No check in this step has an object-valued `detail` at WARN/FAIL severity (`parcel_fanout_distribution`'s object detail is INFO, never error-eligible), so this step's `errors[]` only ever exercises `renderValue`'s primitive path (unchanged passthrough) — captured for the record, not a fresh code path.
7. **Differential — `post-8b/{sources,standalone,standalone-forced}.json` vs. `post-8a/`.** `sources`/`standalone`: `--compare` **IDENTICAL (normalised), exit 0**, both (the SKIP path never reaches the fixed checks). `standalone-forced`: table hash **511224/bde2b1c4** and all **9** `invariants.json` values byte-identical (7th independent measurement, 0 drift) — `--compare` shows **exactly 10 differences, all explained by LPA-D3**: T4/T5's `threshold` strings (`viol == N` → `viol <= N`), T5's `status` (`WARN` → `PASS`), `checks_failed` (2 → 1), and `errors[1]` (`"parcel_fanout_condo_outliers: 0"` → dropped) — each field a direct, named consequence of the ONE descriptor fix, nothing else moved.

**Tests:** `src/tests/steps/link_parcel_addresses/` (violations 75 + rung1 5 + metamorphic 3) — all green, 8 DB-gated skipped without `BUILDO_TEST_DB`. Full related-suite spot check (`step-conformance.infra.test.ts`, `link-parcel-addresses.infra.test.ts`, `link-parcel-addresses-ledger-gate.logic.test.ts`, `source-version.logic.test.ts`) unaffected by this peel's edits (descriptor `limit` string + notes/test changes only, no schema/shape change).

---

## Peel 8c (2026-08-29) — thresholds/checks

**Scope per the commit ledger (§8): T1–T5 all via `ctx.config`/`limit_from_config`, seeds+GROUPS+`apply-logic-variables` (row count before/after), #171's rationale table, #6a's boundary table.**

1. **T1–T5 via `ctx.config`/`limit_from_config` — VERIFIED, no code needed.** T2/T3/T4/T5 all declare `limit_from_config` (T4/T5's comparator corrected at peel 8b, LPA-D3); T1 (`link_parcel_addresses_batch_size`, `on_invalid:"clamp"`, not verdict-affecting so no `limit`/`limit_from_config`) is consumed via `compute.js`'s `buildMaterializeSql`'s returned `batch_size_config_key` field, read at `index.js:1213` (`config[sql.batch_size_config_key] || 1000`) — the SAME `*_from_config`-named-field consumption pattern LW-D10 established (a declared tunable is provably consumed only via a library-recognized field, never merely mentioned in a `checks[].why` prose string). `step-conformance.infra.test.ts`'s P4 battery (107/107, unaffected by peels 8a/8b/8c) already covers all 5.
2. **Seeds / GROUPS / `apply-logic-variables` — VERIFIED live, already applied (no new insert this pilot).** Re-ran `node -r dotenv/config scripts/seeds/apply-logic-variables.js` this peel: `Seeds: 0/424 logic_variables rows inserted (424 already existed — values preserved)` — all 5 of this step's rows (`link_parcel_addresses_batch_size=1000`, `_no_address_warn_pct=50`, `_no_parcel_warn_pct=5`, `_fanout_warn_noncondo=20`, `_fanout_warn_condo=400`) were already present from commit 7's own session (`SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY([...])` → 5/5 rows, values matching the descriptor's declared defaults exactly). Live `logic_variables` table: **444** total rows (424 seed-declared + 20 pre-existing non-seed rows, unrelated to this pilot). `GlobalConfigCard.tsx`'s **"Parcel-Address Bridge"** GROUP (`src/features/admin-controls/components/GlobalConfigCard.tsx:138-144`) lists all 5 keys, confirmed by direct read.
3. **#171's rationale table (T1–T5, each value's stated "why"):**

   | Var | Default | Bounds | `on_invalid` | Rationale |
   |---|---:|---|---|---|
   | `link_parcel_addresses_batch_size` (T1) | 1000 | 100–10,000 | `clamp` | Ported verbatim from the pre-conversion script's own `BATCH_SIZE` literal (`:51`) — a pacing/throughput knob only, never verdict-affecting, so a bad value degrades performance, not correctness; `clamp` keeps the batch loop running rather than refusing a whole run over a pacing typo. |
   | `link_parcel_addresses_no_address_warn_pct` (T2) | 50 | 0–100 | `fail` | Recalibrated (Independent IMPL I1 fold) from an original 10% ceiling that would WARN on every clean run — PI-2's Poisson-like distribution implies ~37% of parcels legitimately carry zero address points (vacant land, road allowance, easement, internal subdivision lots); measured live 3.85%, comfortably under. `fail` because this threshold directly gates the WARN/PASS verdict (R-G). |
   | `link_parcel_addresses_no_parcel_warn_pct` (T3) | 5 | 0–100 | `fail` | Ported verbatim from the pre-conversion script's own `noParcelFraction >= 0.05` gate (`:339`) — address points outside the parcel boundary layer (e.g. a point on a road allowance) are a small, normal population; measured live 2.69%. `fail`, same verdict-affecting reasoning as T2. |
   | `link_parcel_addresses_fanout_warn_noncondo` (T4) | 20 | 1–1,000 | `fail` | Fold B's honest replacement for the DROPPED 5-id allow-list (Fold A's first proposal did not survive Cross-read Adversary scrutiny — no measured discontinuity separated the named 5 ids from the rest of a 4,296-parcel tail). 20 is a genuinely low ceiling for a NON-CONDO parcel (typically 1 address point); measured live 130 non-CONDO parcels exceed it TODAY — an INTENTIONAL standing WARN (R-H), not a mistuned default, with its own declared retighten condition in `checks[].why`. |
   | `link_parcel_addresses_fanout_warn_condo` (T5) | 400 | 1–1,000 | `fail` | Set well above the measured CONDO population's own p99 (**80**, Fold B correction) and max (**346**, parcel 469748, a ~26.6-acre common-elements parcel with a plausible, Reality-Check-sampled unit-entrance range) — the SAME config value also becomes the SQL's own per-parcel outlier-classification cutoff (LPA-D3's `why`), so 400 is chosen loosely enough that only a genuine geometry-contamination-scale event would ever cross it. |

4. **#6a's boundary table** — the `#6a` claim reads the FIRST table in the report with `table`/`rows`-shaped headers, which is §0's own "Live table state" table (`parcel_address_points`/`parcels`/`address_points`, above) — that table gains a **`logic_variables` (444 rows)** row this peel (in place, above), closing the one table `#6a` previously found missing rather than adding a second, competing table.

5. **Differential:** no descriptor/compute/library change this peel (T4/T5's comparator fix landed at 8b; this peel is verification + documentation only) — table hash and all 9 invariants unchanged from peel 8b's captures by construction (nothing that could move them was touched). No new `post-8c/` capture taken — an unmodified re-run would be byte-identical to `post-8b/`, per the same reasoning commit 9's own differential documents for a doc-only/no-op commit.

**Tests:** `src/tests/steps/link_parcel_addresses/violations.test.ts` (`#171`, `#6a` flipped `it.fails` → `it()` this peel) — 75/75 green.

---

## Commit ledger (Spec 123 §7 — mirrors `.cursor/active_task.md`'s nine-commit table, reproduced here so the assessment report is self-contained per claim #6a/#6b — added retroactively 2026-08-29 by `step:validate`'s G8/`#6b` audit, since this pilot's own cutover commit never carried it and `.cursor/active_task.md`'s content does not persist past the task that authored it)

| Commit # | Phase / Gate | Content | Done-test | Status |
|---|---|---|---|---|
| 1 | PH-0 boundary freeze → G0 | §1 boundary freeze — every §0 seed number re-confirmed bit-for-bit against the live DB | **human review only — doc-only gate, no automated test** | **LANDED `d886378f`** |
| 2 | PH-3 intent ledger → G3 | §2 Intent Ledger (5-commit corpus, all adjudicated) + `LPA-D1`/`LPA-D2` opened | **human review only — doc-only gate, a human adjudicates each disposition** | **LANDED `0be269d4`** |
| 3 | PH-5 seam map → G5 | §3 seam map (DB/clock/network/argv-env, all four resolved) | **human review only — doc-only gate, no automated test** | **LANDED `dd35cea4`** |
| 4 | PH-6 classification → G6 | §4 classification + `LPA-D3` opened + the RANDOM/SEEDED disambiguation eyeball (10-parcel sample, seed `20260829`) | **human review only — doc-only gate, no automated test** | **LANDED `9436e4ca`** |
| 5 | Golden master (2 pinned invocations + a separate gate-bypassed twice-run idempotency proof) → G1′ | §5 golden master; `docs/reports/golden/link_parcel_addresses/pre/*.json` + `invariants.json` (9 entries) | harness self-test (`--compare` of a repeat capture, exit 0) + the forced twice-run's own `--compare`, exit 0 | **LANDED `4611e555`** |
| 6 | PH-7 test design + prove red → G7 | `src/tests/steps/link_parcel_addresses/violations.test.ts` — 55-A + 55-B partials | `npx vitest run src/tests/steps/link_parcel_addresses/` — RED | **LANDED `a93efe6a`** |
| 7 | Descriptor + compute verbatim + library growth (A-1 `runMaterializePhase` fork + LG-18 `executeInsertSelectNoRetract`) → G2′ | descriptor, notes, compute, frozen shape; `pending` declared (R-K) | `step-conformance.infra.test.ts` green with 5 converted steps; 7b differential identical | **LANDED `5ee14f5b`** |
| 8 | Peel (8a gating/staleness · 8b verdict/audit · 8c thresholds/checks) | `#169`/`#172` spatial fixtures landed (8a); `LPA-D3` found+fixed via `#165`'s must-fail battery (8b); T1–T5 `ctx.config` wiring + seeds/GROUPS verified, `#171` rationale table + `#6a` boundary row (8c) | full differential re-run after each peel; `src/tests/steps/link_parcel_addresses/` — 83 total (75–83 across the three peels), all green + 6–8 DB-gated (skipped without `BUILDO_TEST_DB=1`) | **LANDED** — 8a `319c3d75` · 8b `2e0138e0` · 8c `78a7207e` |
| 9 | Differential + cutover → G8, G4d, G-shape | `converted.json` (+1 → 5, `pending` deleted); `post/` real cutover captures; 5 unplanned reds found by re-running the full suite in scope, all fixed this commit | `check-step-shape.mjs` → 5 converted step file(s) enforced; differential vs `pre/` — table hash + all 9 invariants IDENTICAL, every diff explained (shape-only, addenda above) | **LANDED `1ad007f8`** |

---

## Commit 9 — cutover (2026-08-29)

**`scripts/steps/_schema/converted.json`:** `link-parcel-addresses.js` appended as the **5th** entry; the `pending` array's own single entry (declared at commit 7, R-K) **DELETED** (now `[]`). `node scripts/hooks/check-step-shape.mjs` → `✅ Step-shape gate clean (5 converted step file(s) enforced; 5 compute module(s) enforced...)` (was 4; unconverted count 58→57).

**Unplanned reds, found re-running the FULL suite with `link-parcel-addresses.js` now genuinely in `converted` scope (same class pilot 4 hit at its own cutover, `903fe5a7`) — all fixed this commit, none deferred:**

1. **P4's `fromConfigRefs` scan had no way to see T1's consumption.** `link_parcel_addresses_batch_size` was consumed ONLY via a JS constant (`BATCH_SIZE_VAR`) returned from `compute.js`'s `buildMaterializeSql` — invisible to any descriptor-level static scan, the identical LW-D10 blind spot (a library-resolved value the compute never spells `ctx.config.<name>` for). Fixed the SAME way LW-D10 was: a new descriptor field, `execution.batch_size_from_config` (schema addition, `step.schema.json`, optional, mirroring `tiers[].confidence_from_config`/`max_iterations_from_config`'s own precedent), declaring `"link_parcel_addresses_batch_size"`; `compute.js`'s `buildMaterializeSql` now reads this field as `batch_size_config_key`'s SOURCE (falling back to the JS constant only if the field is absent) — a single source of truth the P4 scanner and the runtime agree on.
2. **`assert-schema.descriptor.json`'s R-D `checks[].expect`/`config.probe_presence` had drifted from the live `converted.json` fleet derivation** — the SAME class pilot 4's own finding 2 fixed for `link_wsib`'s 7 vars. Added this step's 5 names (alphabetically, `link_massing_*` < `link_parcel_addresses_*` < `link_wsib_*`) to BOTH lists. Re-captured assert_schema's own `post/{coa,permits,sources,standalone}.json` (its `source_fingerprint` changed — R-C lockfile rule) — all 4 PASS, fingerprint matches.
3. **A GENERIC step-conformance canary (`RED — <step>: DROPPING a declared var reddens conformance`, runs for every converted step) assumed the dropped var is ALWAYS compute-read (`ctx.config.<name>`).** Every one of this step's 5 vars is runner-consumed only (T2-T5 via `limit_from_config`, T1 now via `batch_size_from_config` per fix 1) — dropping any of them reddens via the OTHER valid finding shape (`"the descriptor names ... in a *_from_config field, which its config does not declare"`), which the canary's fixed substring check didn't recognize. Widened the canary (still fully generic, not link-parcel-addresses-specific) to accept either finding shape — both are genuine "no longer consumed" reds, just from the two different code paths `configFindings` can take.
4. **`link_wsib`'s OWN cutover test hardcoded `converted.length === 4`** — the EXACT class of bug review_followups.md already filed a lesson for at pilot 4's own cutover (fixed there for `link_massing`'s analogous test, but never revisited in `link_wsib`'s own). Relaxed to `>= 4` + `indexOf(STEP_REL) === 3`, matching `link_massing`'s precedent shape. Applied the same fix PROACTIVELY to this pilot's own equivalent test (`>= 5` + `indexOf === 4`) so pilot 6 does not hit it a third time.
5. **`docs/reports/generated/122-vocabulary.md` went stale** (schema field addition, fix 1) — regenerated (`node scripts/violations/schema-to-vocab.mjs`), self-test passed, 350 field rows across 18 categories.

**Golden captures — `post/` populated with the real cutover captures** (`sources.json`, `standalone.json`, `standalone-forced.json` — the gate-bypassed scenario copied in alongside them, mirroring pilot 3/4's own `sources-full-forced-*` precedent). Interim directories (`post-8a/`, `post-8b/`) **KEPT, not deleted** — checked pilot 4's own cutover commit (`903fe5a7`) and found the explicit precedent: *"Interim directories (post-7b/8a/8b/8c/8-forced) KEPT, not deleted — checked pilot 3's cutover commit and found no interim-directory-deletion precedent to follow."* Same reasoning applies here.

**Differential vs `pre/` (the pre-conversion hand-rolled script's own captures) — table hash and all 9 invariants IDENTICAL; every explained diff is in `records_meta`'s SHAPE, never its facts.** `--compare` of `sources.json`: 27 differences, ALL in `stdout_lines`/`summary.records_meta.*` — the audit_table's field NAMES changed from the pre-conversion hand-rolled SKIP shape (`consecutive_skips`, `gated_skip`, `own_started`, `telemetry`, a bespoke `rows[]` layout) to the frozen §5.1 SKIP terminal (`terminal:"skip_gated_no_activity"`, `config`, `ledger_row`, `checks_passed`/`checks_failed`) — this IS the conversion itself, not a behavioral drift. `records_total`/`records_new`/`records_updated` shift `0`→`null`: the pre-conversion script fabricated a `0` on a SKIP (nothing was measured, reported as "measured zero"); the frozen shape correctly reports `null` (Rule 1 — a SKIP must not claim to have counted what it never touched). **Table state (`parcel_address_points:511224/bde2b1c4`) and all 9 `invariants.json` values do not appear anywhere in either diff** — this step never wrote anything new across the full 9-commit conversion (both PRE and POST captures hit the SAME genuine `no_upstream_changes` SKIP, per finding 3: the corpus has been stale-relative-to-itself since 2026-07-08), so the ONLY thing that could possibly have moved is the reporting shape, and that is exactly, and only, what moved. `standalone.json`: 84 differences, same class (the standalone SKIP path carries a few more `pipeline_runs[0].*` metadata keys than the chain-owned one) — table_state/invariants absent from that diff too.

**Addendum (2026-08-29, filed by `step:validate`'s G8 gate — WF1 R-R commit 1): the remaining pre-only field names, and one post-only field this report's own peels predate.** The paragraph above names 9 of the pre-conversion SKIP shape's fields by example ("`consecutive_skips`, `gated_skip`, `own_started`, `telemetry`, a bespoke `rows[]` layout"); the full pre-only casualty set measured directly off `docs/reports/golden/link_parcel_addresses/pre/sources.json`'s `summary.records_meta` keys is nine: those four plus `audit_table` (kept, reshaped — not a casualty), `batches_processed`, `completed_naturally`, `last_full_run_at`, and `pipeline_meta` — all five retired the same way, for the same reason (the frozen §5.1 SKIP terminal reports `terminal`/`config`/`ledger_row`/`checks_passed`/`checks_failed` instead), named here explicitly so the differential gate can confirm every dropped key by name rather than by class alone.

Separately, and NOT part of the conversion diff above: `standalone.json`'s POST capture (but not `sources.json`'s) carries `records_meta.checks_warned`, which does not exist in `pre/standalone.json` at all — not because the conversion added it, but because `checks_warned`/`warnings[]` were introduced by **LPA-D6 (fix `2d30df44`, "checks_failed/errors\[\] are FAIL-only; new checks_warned/warnings\[\] WARN-only")**, a WF3 fix that landed on this branch AFTER this pilot's commit 9 cutover and its own §5/differential peels were written. It is a real, dated, separately-committed shape addition, not a defect and not a diff this pilot's own captures could have explained at the time they were taken (the fix postdates them) — recorded here rather than left as a silent gate red. `checks_failed` itself needs no separate note: it is already named twice above (line 632's `checks_passed`/`checks_failed` pair, and finding-7's `checks_failed (2 → 1)` T4/T5 fix), and LPA-D6 only narrowed what feeds it (FAIL rows only, never WARN) without renaming or removing it.

**Second addendum (2026-08-29, same audit): `invariants.json` grew from 9 to 11 entries after this pilot's `pre/` captures were taken, and the report's earlier "all 9 `invariants.json` values IDENTICAL" claims (§5, §1) describe the state AS OF commit 5/the cutover, not the current tree.** `git log -S"structure_class_link_rate_pct" -- docs/reports/golden/link_parcel_addresses/invariants.json` and the same for `rd_rs_fanout_gt_15_count` both resolve to `dd5956ea` (**LPA-D5, WF3-B, "class-aware address link-rate + zone-aware RD/RS fanout retighten"**), a WF3 fix that — like LPA-D6 above — landed after this pilot's own cutover. `pre/sources.json`'s `invariants` array has 9 entries (frozen at the pre-conversion script's own last run, which cannot be re-captured — that script no longer exists in the tree); `post/sources.json`'s has 11, the 2 new entries being `structure_class_link_rate_pct` (87.96%) and `rd_rs_fanout_gt_15_count` (13), both LPA-D5's own additions. This is the SAME class as the `checks_warned` addendum immediately above — a real, dated, separately-committed shape addition postdating the differential that first declared it clean — not a defect, and not silently left unexplained.

**Third addendum, the row-level and log-line residue:** the remaining `--compare` differences in each scenario's `stdout_lines[]` (a handful of console lines whose exact text differs between the retired hand-rolled script's own log format and the frozen §5.1 shape's, beyond what the harness's own volatility masking already strips) and `summary.records_meta.audit_table.rows[]` (each row's `metric`/`value`/`status` triple, not just the field-name-level shape change already described above) are the SAME conversion-shape class covered by this section's opening sentence — restated explicitly here rather than left to inference: `sources.json` shows **27 differences, ALL in `stdout_lines`/`summary.records_meta.*`**; `standalone.json` shows **84 differences, same class**. Both counts are exhaustive over their respective `--compare` output — no difference in either scenario falls outside `stdout_lines`, `records_meta` (including its nested `audit_table.rows[]`), or the two addenda above (`checks_warned`, `invariants[9]`/`invariants[10]`).

## §R Reflection (R-F, Spec 122/124)

**Low-confidence and recurring/standard-shaping candidates, this pilot's own harvest — for a future pilot or WF, not resolved here unless noted:**

1. **The `~487-batches-per-run` discovery is a recurring COST SHAPE, not a one-off number.** Every MATERIALIZER/keyset-paginated batch loop at `BATCH_SIZE=1000` over a ~486K-row driving table costs ~487 round-trip transactions; this pilot's own forced-FULL runs measured 43.6s-68.2s wall time for that shape, cheap next to the historical ~204s average (finding 3) but not free. A future pilot converting a LARGER driving table (`address_points`, 525K; or a future full-city table) should cost this shape explicitly rather than assume "just like link_parcel_addresses."
2. **LG-18 (`executeInsertSelectNoRetract`) was originally cost at ~30-40 lines, one function; landed at ~120-180 lines across THREE sites** (`write.js`'s class branch, the executor itself, `index.js`'s dispatch) — Integration's Fold A correction. Every future new write-class executor should budget "three sites" from the start, not "one function," per this pilot's own measured overrun.
3. **The false "`runLinkPhase` stretched once already for MATCHER" premise** (this plan's OWN working assumption, corrected by Fold A Integration #2/#3 before any code landed) — pilot 4 forked `runCascadePhase` instead. A recurring lesson: a NEW archetype pilot's plan should re-derive which runner precedent applies by READING the prior pilot's actual diff, never by citing a prior plan's own prose summary of it (which can itself have been imprecise) — this is `feedback_no_transcription_from_prior_artifacts`'s own principle, self-applying inside a single pilot's planning phase, not just across pilots.
4. **The fan-in allow-list temptation (Fold A → Fold B).** A per-id allow-list (5 named parcels) was the FIRST instinct for an unusual-but-legitimate population (CONDO fan-out); Cross-read Adversary's fold-validation caught that the 5 names had no measured discontinuity from the rest of a 4,296-row tail before it ever shipped. Recurring pattern to watch for: an allow-list is almost always the wrong tool for a POPULATION-shaped exception (use an honest aggregate + a declared retighten condition, R-H) — reserve allow-lists for genuinely discrete, individually-justified exceptions.
5. **The "resumable" header lie (LPA-D2)** — a self-description bug (the code was always safe; only the PROSE claimed a capability it never had) independently reconfirmed against a PRIOR evidence-base finding (`2026-08-22-sources-chain-evidence-base.md`) that had already caught the identical gap. Recurring lesson: a step's own header comment is not a reliable source for what the code does — every pilot's boundary freeze (G0) must independently re-derive behavior from the code, never carry a header claim forward uncritically, even when it "sounds right."
6. **The grandfathering-key footgun (Fold A Integration #1).** This plan's own FIRST draft keyed the `grandfathered.json` entry on `write_discipline.class`; the real enforcer (`assertGrandfathered`) reads only `.guard`. A recurring, mechanical thing to verify by READING the enforcer's own source before authoring a new grandfathered entry, every time — never by pattern-matching the shape of a prior entry from memory.
7. **Scaffold duplication across three phase-runners** (`runLinkPhase`/`runCascadePhase`/`runMaterializePhase`, Fold B's own filed LOW followup) — confirmed still present at commit 9; the `guards → prior/gate → pre_write → RUN_AT` scaffold this pilot's `runMaterializePhase` reimplements is now duplicated a THIRD time. Filed, not built — a pilot-6 library item (a shared phase-order helper).
8. **R-B's crashed/stuck-`running` reader stays genuinely unexercised** (peel 8a, item 4: this step has no distinct FULL mode to auto-force into — `runMaterializePhase` hardcodes `mode:"incremental"` on every RUN branch). **Consequence for pilot 6:** whichever step pilot 6 converts MUST be genuinely FULL-capable (a real `retract_when:"full_only"` target, mode selection that changes the write behavior, not merely bypasses a gate) or R-B's reader stays permanently unbuilt-and-unbuildable-against. This is now a NAMED constraint on pilot 6's own step selection, not a soft preference.
9. **NEW this pilot — LPA-D3, the `limit_from_config` + `viol ==` comparator trap (peel 8b).** A `checks[].limit` combining `limit_from_config` with the `==` comparator silently becomes an exact-equality gate a fluctuating count essentially never satisfies — found only because `#165`'s must-fail fixture battery genuinely exercised BOTH directions for every check, including a step's own standing-WARN population. Recurring, mechanical: any FUTURE descriptor authoring a `limit_from_config`-bearing `bound`-kind check should default to `viol <= 0`, never `viol == 0`, unless the check is GENUINELY an exact-match assertion (rare) — worth a static lint (`step-conformance` addition) rather than relying on each pilot's own `#165` battery to catch it by hand, filed as a LOW followup, not built this commit (out of the cutover's own declared scope).
10. **NEW this pilot — the cutover's own "unplanned reds" recurred in a form pilot 4's own lesson should have prevented (item 4 above).** `review_followups.md`'s "cross-step count assertions" lesson was filed AT pilot 4's cutover but only fixed the ONE test pilot 4 happened to trip (`link_massing`'s); `link_wsib`'s own analogous test was left as `=== 4` and broke the moment THIS pilot cut over. Recurring, mechanical: a lesson filed against a CLASS of test (not one file) should be swept across every existing instance of the class in the SAME commit that discovers it, not left for the next pilot to re-discover one at a time — filed here as the meta-lesson, applied proactively to this pilot's own instance (item 4) so pilot 6 does not repeat it a third time.

**Approver for every disposition/finding above:** this pilot's own commits 1-9, orchestrator-authored within the pre-authorized WF2 plan (`.cursor/active_task.md`), per its own standing pre-authorization for fold-validated and peel-scoped rulings.

---

*Full PH-0..PH-8 / §1–§R sections are authored across this pilot's nine commits per Spec 123 §7 — see `.cursor/active_task.md` for the plan and commit ledger.*

---

## §8. R-T addendum differential (WF2 "The Step Validator, Data-First", commit 4, 2026-08-30)

Spec 124 §2 Rule 13's R-T addendum lands 5 net-new `invariants[]` (rows, multi_parcel_address_count, dup_count, fanout_max_noncondo, land_entrance_count — all `every_run`) + 1 `validate_only` invariant (`missed_link_count`, Ask 5, DECLARED `statement_timeout: "none"` — Fold B-1 struck the plan's original "110s ceiling" premise; the live server has no statement_timeout at all) into this descriptor. `parcel_address_points_missed_link_count` (the existing `checks[]` entry running the SAME ~32s query) is kept, not retired — see its own updated `why` for the reasoning (surgically removing one column from `buildInvariantsSql()`'s combined multi-metric query risked the shared SQL-builder for a proportionality gain not worth the risk this commit).

- **`source`** (every `audit_table.rows[N]` entry) — new field: `"check"` default, `"invariant"` for the 6 new rows.
- **`content_hash`** (`table_state[0]`, `sources.json`/`standalone.json`) — moves vs. the `pre/` baseline (§5's original conversion captures): the live `parcel_address_points` table has naturally evolved since pilot 5's own original conversion (2026-08-29) through the ordinary course of later pipeline runs (new parcels/address_points loaded, re-linked) — NOT a behaviour change from this commit. Re-captured fresh as part of this commit's own recapture pass.
- **The genuine forced-full recapture (`standalone-forced.json`) hit a real environment blocker, root-caused and resolved, not silently retried:** `runMaterializePhase`'s combined query over 486,530 parcels × 525,346 address_points exhausted this local container's `/dev/shm` allocation (`could not resize shared memory segment... No space left on device`) — reproduced twice, including after a full `docker restart` of the postgres container, ruling out session-accumulated leakage as the cause. Root cause: PostgreSQL's parallel-query workers communicate via POSIX shared memory (DSM segments), and this container's fixed `/dev/shm` allocation is too small for this specific join's parallel worker count. Resolved with a standard, non-destructive session-level tuning knob — `PGOPTIONS="-c max_parallel_workers_per_gather=0"` — forcing sequential execution (51.1s vs. the historical ~204s average, still well within budget). No code or test changed; a legitimate operational technique for any FUTURE forced-full capture of this step in this same environment.

**G8 verdict (R-T addendum pass):** `content_hash` and `source` cited by name above, satisfying the generic-wrapper-excluded citation rule (`step-validate.mjs`'s G8 scorer).

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=link_parcel_addresses --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 14/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=9 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=bottom-left window=39313d9 |
| G3 | 1 | 2 | table rows=6 vocab-hit rows=5 |
| G4 | 0 | 2 | risk-class row with chance+impact found=false |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 6 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=3 it-count=83 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=3 lock-it-count=83 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | link_parcel_addresses | PASS | min_migration=159 <= migrations count=244 |
| 2 | link_parcel_addresses | PASS | 7 declared, missing from seeds: none |
| 3 | link_parcel_addresses | PASS | retired=0 overlap-with-declared=none |
| 7 | link_parcel_addresses | PASS | SPEC LINK header present=true |
| 8 | link_parcel_addresses | PASS | G-4: 7 declared, 6 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | link_parcel_addresses | PASS | HB-1: execution.shape="materialize" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | link_parcel_addresses | PASS | CEIL-1: execution.shape="materialize" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 66 PRE capture(s) across 18 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 18 converted slug(s) — 10 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 41 declared counter source(s) across 14 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 91 · unexplained: 0

### Test suite (item iii)
- 1338/1338 passed (suite success=true)
- harvested: 23 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 7 declared, 6 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 0 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=42892B notes=8210B checks=19 rows records_meta=3836B (newest post/ capture) |

**Enforced-green: 13/14**

