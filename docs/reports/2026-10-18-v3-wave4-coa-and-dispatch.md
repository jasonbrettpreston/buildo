# V3 wave 4: the CoA chain, plus dispatch_notifications options (2026-10-18, PLAN ONLY)

**Status:** READ-ONLY planning. No code, commit or DB write was made. Every file was read at `~/Buildo` HEAD `69c1a1ef`. Ledger rows come from `effectiveLedger()` (`scripts/lib/ledger.js:210`). Row counts and catalog facts come from read-only `SELECT`s against the `$HOME/Buildo/.env` database (the "DB" lines below).

**Standard:** McDonald's Airtight V3.
- Spec 124 R-DF, the seven questions (`124_step_standard_policy.md:252`).
- The V3 row, six parts (`124:273`).
- R-DT (`124:265`), R-BZ (`124:220`), R-CQ (`124:237`), R-DD (`124:250`), R-DL (`124:258`).
- R-BC (`124a_step_standard_policy_appendix.md:213`).
- Spec 122 §1.10 archetypes (`122_pipeline_step_optimization.md:608-643`).
- The conversion ladder. The brief cites §5, but the nine-commit ladder is §8.1 (`122:1187-1197`); §5 is the enforcement conditions.

**Inputs:**
- `.cursor/v3-phase4-key-steps-plan-2026-10-17.md` (waves 1–3, and wave 4 = dispatch).
- `.cursor/v3-runner-lane-rulings-2026-10-18.md` (R-DU, R-DV, R-DM, R-DW, R-DX, R-EA; the RE-FREEZE #37 sequence §6).

**Operator direction (2026-10-18):** "dispatch_notifications: draft options — wave 4 should focus on the COA pipeline if possible."

---

## 0. Headline

1. **dispatch_notifications is not in the coa chain.** It runs only in `chains.permits` (`scripts/manifest.json:93`). Spec 101 keeps it out of the CoA chain in v1 (`101_notification_dispatch.md:83`). So wave 4 = CoA blocks nothing on the dispatch side.
2. **dispatch_notifications is inert today:**
   - DB: `notifications_dispatch_enabled = 0`;
   - `notifications` 0 rows, `notification_dispatches` 0 rows, `device_tokens` 0 rows;
   - its last run was `permits:dispatch_notifications`, 2026-07-17, `skipped: true`.

   Its ledger row reads only `logic_variables` and writes nothing, because lineage was taken on the kill-switch SKIP path (`dispatch-notifications.js:127-141`). The declared lineage (`:602-617`) never ran.
3. **Recommendation for dispatch: option (b), a new outbound archetype**, built in the permits-completion wave rather than wave 4. It has a second real member: `backup_db`, an S3 upload plus remote prune with no DB write (`scripts/backup-db.js:303`, `:403`, `:455`). That answers SCALABLE.
4. **The coa chain has 16 slugs** (`manifest.json:97-101`):
   - 5 are converted (`converted.json`: assert_schema, refresh_snapshot, assert_data_bounds, assert_engine_health, assert_global_coverage);
   - waves 1–3 take 5 (coa, link_coa, classify_lifecycle_phase, assert_lifecycle_phase_distribution, compute_phase_calibration);
   - **wave 4 = the remaining 6:** assert_coa_freshness, link_coa_to_parcels, enrich_coa_zoning, classify_coa_scope, classify_coa_trades, compute_coa_cost_estimates.

   This corrects the phase-4 plan §3 tail ("11 − 6"). compute_cost_estimates is not in the coa chain, so waves 1–3 take 5 coa slugs, not 6. Also, `chains.permits` is 32 slugs, not 23.
5. **Wave 4 needs no new library form from the runner lane**, and none of R-DU, R-DV, R-DM, R-DW or R-DX has a wave-4 user. Two steps *consume* R-DW's `last_seen_at` semantics. Four decisions are owed instead (§B.3):
   - the one-file-two-slugs identity of `enrich-permits.js`;
   - link_coa_to_parcels' write-once marker and per-row savepoints;
   - the MATERIALIZER JS-row form that wave 3 owes;
   - lead_products' per-key replace.
6. **No coa step lacks an archetype.** Two (classify_coa_trades, compute_coa_cost_estimates) fit MATERIALIZER only once wave 3 lands a JS-computed guarded_upsert form: `runMaterializePhase` today executes compute-authored `INSERT … SELECT` only (`scripts/lib/step/index.js:2822-2847`, class D).
7. **coa chain completion (R-BC (b)) also needs a permits fix.** The only `standard-gates-ledger.json` row in the estate is `refresh-snapshot compute-ledger-sql … CP-PERMITS`, and refresh_snapshot is a coa-chain step. It closes only when `permits` stops writing `sync_runs` (wave 1, `load-permits.js:725`).

---

## Part A — dispatch_notifications: archetype options

### A.1 What the step does (evidence)

| Fact | Evidence |
|---|---|
| The one sender. It reads the `notifications` queue (enqueued by classify_lifecycle_phase and update_tracked_projects) and delivers at most once per (user, lead, type, Toronto date) | `dispatch-notifications.js:3-10`; `101:8`; `101:27-46` |
| Kill-switch: SKIP when `notifications_dispatch_enabled != 1` | `:127-141` |
| **Outbound effects**: Expo receipt fetch `fetchReceipts` (`:181`) and Expo send `sendPushChunk` (`:468`), chunked by `MAX_CHUNK = 100` | `scripts/lib/push-dispatch.js:26-27` (URL literals), `:31`, `:68`, `:108` |
| Transport seam today: a test-only global, `global.__BUILDO_PUSH_TRANSPORT__` | `:124`; `push-dispatch.js:34-37` |
| DB writes, 12 statements: <br>• `device_tokens` DELETE (`:198`, `:511`) <br>• `notification_dispatches` UPDATE `receipt_checked_at` (`:202`) <br>• `notification_dispatches` INSERT `ON CONFLICT DO NOTHING` (`:253`, `:494`, `:515`, `:545`) <br>• `notifications` UPDATE `is_sent`/`sent_at` (`:264`, `:406`, `:420`, `:501`, `:560`) | — |
| The ledger is written in a transaction **after** each chunk's network call (§R9). A crash between `:468` and that transaction's commit leaves `is_sent = false` and no ledger row, so the next run re-sends. Delivery is at-least-once inside that window, not the "exactly once" of `101:8`. | `:484-523` |
| Non-fatal receipt pass: `catch` → `log.warn` | `:166-212` |
| Declared lineage (never executed in the snapshot): <br>• reads 4 tables; <br>• writes `notification_dispatches`, `notifications`, `device_tokens`; <br>• external `ExpoPush` | `:602-617` |
| `manifest.telemetry_tables` = `notifications`, `notification_dispatches`. `device_tokens` is missing. | `manifest.json:55` |
| The four `notifications_*` variables are seeded only by migrations, and are **absent from `scripts/seeds/logic_variables.json`** | `migrations/218_notification_dispatch_ledger.sql:72`; `222_notification_gateflip.sql`; grep of the seeds file = 0 hits |
| Census row: `UNDECLARED`, batch C6 | `step-archetype-census.json:230` |
| Proxy counts (same columns as phase-4 §1, recomputed here; identical) | 621 lines; query 15 (+1 `streamQuery`); write 12; clock 0; INTERVAL 2; const 3; catch 4 |

**EXTERNALIZED findings any option must close** (R-DF; V3 part 5 "no literal fallback"):
- `.default(168).catch(168)` (`:71`);
- `STALE_SWEEP_BATCH = 5000` (`:237`);
- `ELIGIBLE_CEILING = 50000` (`:282`);
- `INTERVAL '5 days'` and `'1 hour'` (`:176-177`);
- delivery windows 6–9 and 17–20 (`:97-98`);
- the persisted `detail` cap `slice(0, 200)` (`:518`; the same class as runner-lane finding #7, `verdict.js:358`);
- the zone literal `'America/Toronto'` (`:78`, `:88`), against R-CE "the zone is never a literal" (`124:225`).

`MAX_CHUNK = 100` is the Expo protocol limit, category (D) under R-DY.

### A.2 The frozen enum

`identity.archetype` is frozen at 8 values (`step.schema.json:2002-2015`, `x-frozen`). The census mirrors them plus `UNDECLARED` (`step-archetype-census.schema.json:79-81`). `execution.shape` is a frozen 10-value enum, and `template-freeze.json` holds 8 `archetype_profiles` with 9 `phase_runners`.

**No schema field describes an outbound sink.** `externals` exists only under `inputs.reads` (`step.schema.json:2085`). The runner's network seam `ctx.fetch` exists in the closed `STEP_CTX_KEYS` (`scripts/lib/step/index.js:158-162`, default at `:6458`), but nothing declares a *send* through it.

### A.3 Options

#### (a) Fit an existing archetype: ENRICHER over `notifications`

**What fits:**
- the pending set is a column of the input table (`is_sent = false`);
- `runEnrichPhase` supports JS compute and multi-target writes (enrich_parcels, compute_parcel_cost_estimates).

RECORDER is rejected by R-AE's "only write is a ledger table it exists to record" (`124a:146`): dispatch also writes `notifications` and `device_tokens`, and sends.

**What does not fit:**
1. **The send.** No declared home exists, so it needs a new schema field anyway.
2. **Transactions.** The step runs one post-network transaction per chunk (`:484`, a loop). `execution.phases[].txn` allows `shared` or `post_commit`, with at most one post_commit and only last (`122:634`).
3. **The invalidator.** The ENRICHER x-profile requires `staleness.pending` ⇒ a declared invalidator (claim #54, `step.schema.json:5405`). Nothing invalidates `is_sent`; new queue rows are inserts.
4. **Phases.** The receipt pass is an external *read* before the phases.
5. **Rule 1.** The label would say "enriches notifications" for a step whose output is pushes.

**Assessment against the standard:**
- **Frozen-schema impact:** a RE-FREEZE is still needed (an outbound field plus a multi-txn phase arm). This is the same cost as (b) without the truthful label.
- **R-BZ:** sends must leave compute (G10 fires on the `push-dispatch.js:26-27` URL literals through the G0 closure, `122a §A26`). A send through `ctx.fetch` inside compute is not a G-code, but it makes compute side-effecting, which Rule 2 bans in spirit.
- **#38:** same as (b).
- **#44:** `notifications` is produced by two unconverted enqueuers. `device_tokens` is written by the app (the `src` section).
- **R-DL:** see (b).
- **R-DF seven:**
  - STANDARDIZED ✗ (a label that misdescribes);
  - OBSERVABLE ✓;
  - RECORDED ✓;
  - SCALABLE ✗ (backup_db fits even worse: no input table);
  - ACCURATE ✗ (claim #54 cannot be honestly answered);
  - SIMPLE ✗ (a RE-FREEZE anyway);
  - EXTERNALIZED ✓ once the §A.1 literals become variables.
- **Verdict: reject.**

#### (b) A new archetype: DISPATCHER (outbound delivery)

**Rule text (draft).** A step whose output is an external side effect through a runner-owned transport is a DISPATCHER.
1. **Declared sink.** It declares `outputs.sinks[]` `{id, url, transport:"fetch", chunk_max (protocol constant), idempotency_key:[cols], ledger:<writes index>, on_send_error:"record_row", on_aux_error:"fail_step"|"warn_row" (+why)}`.
2. **Runner order.** The runner owns:
   1. the declared reads;
   2. an optional pre-send aux fetch (receipts);
   3. `compute.plan(rows, {config, run_at, descriptor})` → `{sends[], ledgerRows[], retire[]}`, which is pure;
   4. the send, per chunk, through `ctx.fetch`;
   5. `compute.settle(chunk, responses, …)` → ledger and prune rows, which is pure;
   6. one transaction per chunk **after** the network call (the §R9 invariant, now runner-owned).
3. **Idempotency.** `idempotency_key` must equal a unique index on the ledger table. This is probed like R-DV (c), the catalog-derived conflict index.
4. **Captures.** A capture runs a **recording transport**: responses come from committed fixtures, never the network. That makes R-CZ "reproducible from committed data alone" hold.
5. **Delivery semantics.** Declared `delivery: "at_least_once_in_crash_window"`, not hidden.

**Frozen-schema impact: one RE-FREEZE** (#38, after the runner lane's #37), with all schema bytes in one commit, as §8 requires (`122:1109+`):
- `identity.archetype` +`DISPATCHER`;
- the census enum +`DISPATCHER`;
- `execution.shape` +`dispatch`;
- `phase_runners` +`runDispatchPhase`;
- an `x-profile` (must declare `sinks`; `outputs.writes` = the ledger only);
- `outputs.sinks[]`.

Further costs:
- `archetype_profiles[DISPATCHER]` is proven only with its second member (RE-FREEZE #15 precedent, `122:1132`), so it should land with backup_db or before it.
- Spec 122 §1.10 table plus profile rows. Spec 122 has 7 B of headroom (runner lane §0 item 6), so a sanctioned move (M26 or a successor) must land first.

**R-BZ:** compute = `plan` and `settle`, rows in and rows out. Zero `query`, transaction, clock or literal: the Toronto date and hour come from `run_at` plus a zone variable (R-CE). The receipt `catch` (`:210`) becomes the declared `on_aux_error:"warn_row"`, with a declared check reading `written.aux_errors`. That is the R-DM reporting form (runner lane §3.3) on the RE-FREEZE #22 vocabulary (`122:1148`).

**R-DD:** not applicable. R-DD guards a *source-version* skip on INGESTORs (`124:250`). The dispatcher's skips are:
- the kill-switch, which becomes a declared config-gated skip (`notifications_dispatch_enabled`, bound `=1`);
- an empty queue, which is 0 work, not a skip.

**R-DM:** per-ticket failures are *primary outcomes* (`status:'error'` rows, `:514-519`), not swallowed writes. So R-DM's `warn_row` does not apply to them. It applies only to the aux pass, as above.

**Captures and #38:**
- A forced bracket seeds a cohort: queue rows plus a synthetic device token plus a config override `enabled = 1` *inside the bracket only*. It runs on the recording transport and proves `notification_dispatches` inserts > 0. The restore deletes the synthetic rows (the R-DP pair-restore shape, `124:261`).
- The plain capture over today's empty DB is a 0-row SKIP, so #38 *requires* the bracket.
- Harness work: `capture-step-golden.js` has no transport injection today (grep `fetch` = 0 hits).

**#44:** these rows join the runner fingerprint set:
- reads `notifications` (producers classify_lifecycle_phase and update_tracked_projects, both unconverted, UNWITNESSED until they convert);
- reads `device_tokens` and `user_profiles` (app-written, `src` section);
- `notification_dispatches` is a self-read: no producer edge (R-DG G3, `124:253`);
- the chunk statements are runner-attributed.

**R-DL:**
- `PIPELINE_REGISTRY` ✓ (`src/components/FreshnessTimeline.tsx:90`) and `STEP_DESCRIPTIONS` ✓ (`src/lib/admin/funnel.ts:705`).
- **`PIPELINE_TABLE_MAP` has no entry** (`funnel.ts:953-985`); it would add `notification_dispatches`.
- `manifest.telemetry_tables` must add `device_tokens`.
- These are aggregate tiles only. The row inspector already excludes the notification tables as PII (`src/lib/admin/manifest-utils.ts:10-20`), and that stays.
- The operator verifies delivery in the Spec 102 tool (`src/components/admin/NotificationsTool.tsx`, `src/app/api/admin/notifications/route.ts`).

**R-DF seven:**
- STANDARDIZED: the runner owns transactions, clock and network, exactly as for INGESTOR acquisition (`ctx.fetch`; R-DV (c) probe form; RE-FREEZE #22 vocabulary).
- OBSERVABLE: `dispatch-phase.logic` (new) plus `src/tests/db/dispatch-notifications.db.test.ts` (exists; mock transport).
- RECORDED: a new row.
- SCALABLE: two members, dispatch_notifications and backup_db (see the backup_db note at the end of A.3).
- ACCURATE: §A.1 citations plus red-first locks.
- SIMPLE: one archetype and one runner. Wider than (c), but it is the only option with no behaviour change and no permanent exception.
- EXTERNALIZED: the §A.1 literals become `notifications_*` variables, seeded into `logic_variables.json` (the R-CV form).

**Recommendation: adopt (b) as the target, with a dated PIN.** Do not build it in wave 4.

#### (c) Leave it unconverted, with a closed grandfather entry

**Form:** a fourth census exemption reason (for example `outbound_side_effect`) beside `python_step_excluded`, `no_file` and `runner_owned` (`step-archetype-census.schema.json:40-43`), plus a 124 row in the R-AP form (`124a:171`).

**Frozen-schema impact:** none in `step.schema.json` (the census schema carries no `x-frozen`), so no RE-FREEZE.

**R-BZ, #38 and admin:** no compute, so R-BZ and #38 are not applicable. R-DL covers only converted or pending steps, so no admin change is forced.

**But:**
- R-BC (a) for permits passes only through the exemption.
- **R-BC (c) still fails.** The ledger row stays the SKIP-path snapshot (reads `logic_variables` only), which is the LDG-10 "declared ≠ runtime" class the phase-4 plan §1 already flagged. An exemption does not reconcile lineage.
- The only step that touches end users would be the only permanently non-V3 step.

**R-DF seven:**
- STANDARDIZED ✓ (the R-AP precedent);
- OBSERVABLE ✓ (the census generator);
- RECORDED ✓;
- SCALABLE ✓ (a closed list);
- ACCURATE ✗ (lineage stays wrong);
- SIMPLE ✓;
- EXTERNALIZED ✗ (the §A.1 literals stay).

**Verdict: reject as a permanent answer.** It is acceptable only as an *interim* census `UNDECLARED`, which is today's state and needs no entry.

#### (d) Split: a MATERIALIZER that queues outbox rows, plus a non-step sender

**Form:**
- The step keeps every gate (dedup, prefs, throttle, window, stale sweep) and writes `notification_dispatches` rows with a new `status:'queued'`, plus `notifications` retirements. This uses existing write classes: class D `insert_only_no_retraction` (`ON CONFLICT DO NOTHING`) and `set_based_scoped`.
- A non-step sender drains `queued` → `sent`/`error`, prunes tokens, and runs receipts.

**Frozen-schema impact:**
- no new archetype;
- a migration widens the CHECK (`migrations/222_notification_gateflip.sql:46-47`);
- the step is captureable and purity-clean with today's forms.

**Behaviour changes** (each needs a ruling):
1. A whole-chunk failure today writes **no** ledger row, so the tuple retries (`:469-479`). Under (d) the `queued` row already holds the (user, lead, type, date) UNIQUE slot (`218:45`), so a new retry rule is needed for yesterday's `queued`/`error` rows.
2. The throttle refund-on-failure (`:430-447`, `:526-529`) moves to the sender.
3. Send timing moves to wherever the sender runs.

The sender is outside V3 entirely: no captures and no R-DL. Only Rule 13 observability covers it.

**R-DF seven:**
- STANDARDIZED ✓ (existing forms);
- OBSERVABLE ½ (the sender is unlocked);
- RECORDED ✓;
- SCALABLE ✗ (backup_db cannot split this way);
- ACCURATE ✓;
- SIMPLE ✗ (three behaviour rulings plus a new process);
- EXTERNALIZED ½.

**Verdict: reject.** It trades one RE-FREEZE for three behaviour changes and an unstandardized process.

**A note on backup_db (supports (b)).** backup_db is in `chains.permits`, census `UNDECLARED` (`step-archetype-census.json:101`), and writes no DB table (`backup-db.js` has no `.query(`). Its effects:
- pg_dump streamed into an S3 multipart upload (`:303`);
- a manifest sidecar upload (`:403`);
- a remote retention prune (`:455`), declared non-fatal (`:13`).

That is the same shape: transport-only output, an idempotency key (the object key), and a non-fatal aux operation. Its fit is to be confirmed at its own assessment. This plan claims only the measured effects above.

### A.4 Recommendation (Part A)

**(b) DISPATCHER, deferred to the permits-completion wave with backup_db, with a dated PIN now. Do not build it in wave 4.** Reasons:
1. It is the only option that is truthful (Rule 1) and changes no behaviour.
2. It has two members, so it is SCALABLE.
3. Captures become possible without ever sending: a recording transport over committed fixtures (R-CZ).
4. The cost (one RE-FREEZE plus a runner) is paid once for both members. Nothing reads dispatch's outputs, so the deferral blocks no step.

**Draft PIN:** `PIN DISPATCH-ARCH (dated 2026-10-18; owner: permits-completion wave)`: dispatch_notifications and backup_db convert as DISPATCHER (RE-FREEZE after #37). The transport is the existing `ctx.fetch` seam, and a capture runs the recording transport, never the network.

This supersedes the phase-4 draft "ctx.transport" seam (phase-4 plan §4 item 2): `ctx.fetch` already exists in `STEP_CTX_KEYS`, so no new key is needed.

---

## Part B — wave 4 = the CoA chain

### B.1 The coa chain (`manifest.json:97-101`), 16 slugs

| # | Slug | Status | Also in permits? |
|---|---|---|---|
| 1 | assert_schema | converted | yes |
| 2 | coa | wave 1 (INGESTOR; pending at ②) | — |
| 3 | **assert_coa_freshness** | **wave 4** | no |
| 4 | **link_coa_to_parcels** | **wave 4** | no |
| 5 | **enrich_coa_zoning** | **wave 4** | **file shared** with `enrich_permits` (`manifest.json` both → `scripts/enrich-permits.js`, env `ENRICH_TARGET`) |
| 6 | **classify_coa_scope** | **wave 4** | no |
| 7 | **classify_coa_trades** | **wave 4** | no |
| 8 | **compute_coa_cost_estimates** | **wave 4** | no; its twin compute_cost_estimates (permits, wave 3) shares the `cost_estimates` table and `src/features/leads/lib/cost-model-shared.js` |
| 9 | link_coa | wave 2 | yes |
| 10 | classify_lifecycle_phase | wave 2 | yes |
| 11 | assert_lifecycle_phase_distribution | wave 2 | yes |
| 12 | refresh_snapshot | converted (V2: CP-PERMITS purity row) | yes |
| 13 | assert_data_bounds | converted | yes |
| 14 | assert_engine_health | converted | yes |
| 15 | compute_phase_calibration | wave 2 | yes |
| 16 | assert_global_coverage | converted | yes |

The slugs shared with permits are `assert_schema link_coa classify_lifecycle_phase assert_lifecycle_phase_distribution refresh_snapshot assert_data_bounds assert_engine_health compute_phase_calibration assert_global_coverage` (computed from `chains`). None of the six wave-4 slugs is shared, except enrich_coa_zoning through its file.

All six are census `UNDECLARED` (`step-archetype-census.json` rows at `:108`, `:115`, `:171`, `:266`, `:321`, `:459`). All six are in `gate.blocks` of LDG-10 (PARTIAL), CHAIN-TOOLING (NOT_STARTED) and EP-PIN-D17 (PARTIAL), each with 38 slugs (`programme-items.json:331`, `:387`, `:1633`).

### B.2 Per step

The proxy columns are the phase-4 plan's: `.query(` (+`streamQuery`) / writes; clock / INTERVAL / module numeric const / catch. They were recomputed with one counter. For dispatch it reproduces the phase-4 numbers exactly. For `load-coa.js` it reads write 3 vs the plan's 2 (it also counts the `last_seen_at` touch UPDATE at `:576`).

Every write target below is RLS-on (DB `relrowsecurity = true` for `coa_applications`, `lead_parcels`, `lead_trades`, `lead_products`, `cost_estimates`), so each needs `rls_bypass_or_policy` (R-CT `124:240`; trap 2, `122a:798+`).

#### B.2.1 assert_coa_freshness — `scripts/quality/assert-coa-freshness.js`, 140 lines

| | |
|---|---|
| Archetype | **ASSERT**: "read-only — no database writes" (`:9`); one `SELECT MAX(last_seen_at)…` (`:54-61`); a WARN/FAIL verdict on `coa_freshness_warn_days`/`_fail_days` (`:31-36`, `:91-94`) |
| Proxies | q 1 / w 0; clock 3 (`:42`, `:87`, `:112`; only `:87` decides, the other two are duration) / intv 0 / const 1 (lock `:37`) / catch 0 |
| Ledger | reads `coa_applications(last_seen_at, hearing_date, decision_date)`. That table has 19 readers and 8 writers (the six wave-4 steps write it except this one, plus coa, link_coa and classify_lifecycle_phase). |
| Precedent | **assert_data_bounds** (`4661bb5f`): ASSERT with `ctx.clock()` plus `pipeline_timezone` (`scripts/lib/compute/assert-data-bounds.js:106`, `:188`, `:454`) and RE-FREEZE #7 `warn_limit_from_config` for the two-tier bound |
| Owner specs | 41, 42, 43 (`:22-24`) |
| Runner forms | none of the five new forms. It **consumes R-DW**: its metric is MAX(`last_seen_at`), which the coa root moves to `written:"seen"`, touched for every fed key (runner lane §3.4). This is parity with legacy's out-of-transaction touch (`load-coa.js:565-582`). |
| Notes | 1. The empty-table → WARN branch (`:68-80`) becomes a declared check. <br>2. **EXTERNALIZED breach:** `STEP_DESCRIPTIONS` hard-codes ">45 days" (`src/lib/admin/funnel.ts:721`), a copied number for `coa_freshness_warn_days` (default 45, `scripts/seeds/logic_variables.json:432`). R-DF bans copied bounds in admin text. <br>3. Folding it into assert_data_bounds' coa branch is rejected: that changes chain position (it runs right after `coa` today) and stales a converted step's goldens. |

#### B.2.2 link_coa_to_parcels — `scripts/link-coa-to-parcels.js`, 722 lines

| | |
|---|---|
| Archetype | **LINK**: an address-tier cascade to parcels with retraction (the ghost DELETE). <br>• writes `lead_parcels` (`:458` upsert `ON CONFLICT (lead_id, parcel_id)` guarded); <br>• writes `coa_applications` lat/lng/neighbourhood/`parcel_linked_at` (`:532`, `:551`, pre-pass `:322`); <br>• ghost `DELETE FROM lead_parcels … LIKE 'coa:%' AND NOT EXISTS` (`:587-595`). <br>The same shape as link_parcels (census rationale for link_coa, `step-archetype-census.json:372+`) |
| Proxies | q 19 / w 5 (+4 SAVEPOINT statements `:370`, `:559`, `:566`, `:567`); clock 2 (duration) / intv 0 / const 2 (lock `:48`, `GHOST_CLEANUP_BATCH_SIZE` `:59`) / catch 3 |
| Ledger | reads parcels, address_points, neighbourhoods, coa_applications, parcel_address_points. Writes:<br>• `lead_parcels`: 4 readers (assert_global_coverage, compute_coa_cost_estimates, enrich_coa_zoning, refresh_snapshot), **1 declared writer**;<br>• `coa_applications`: 19 readers, 8 writers. |
| Precedent | **link_parcels** (`b37087f3` → cutover `a4d80a26`; `link_keyed`, `permit_parcels` guarded_upsert + link_full_retraction + `permits.parcel_linked_at` marker); **link_neighbourhoods** (`2f704d8f` → `1a48520b`, `link_column`) for the neighbourhood back-fill |
| Owner specs | 42 (§6.5 step 9, §6.8, §6.11.1), 47 (`:34-35`) |
| Runner forms | none of the five. It needs the existing `link_keyed` and `link_column` forms. |
| Decisions owed | 1. **Write-once vs re-check.** Today it only processes `parcel_linked_at IS NULL` (`:351`), so nothing ever re-links a CoA when its parcel changes. The LINK x-profile requires a non-empty `outputs.invalidates` (`step.schema.json:5367`). The precedent is link_parcels O4 row 7 (operator 2026-10-03): re-check every eligible row every run, `mode_select: "none"`, with an invalidator on `parcel_linked_at` (`scripts/link-parcels.descriptor.json:264`, `:277-278`). Copying it is a **behaviour change**. <br>2. **Per-row SAVEPOINT isolation** (`:366-570`; the `:15-16` rationale) is G4 transaction control. link_parcels has no per-row form (its legacy at `b37087f3^` has 0 SAVEPOINTs), and `on_row_error` is descriptive only: the runner does not read it (`compute-parcel-cost-estimates.js:319-321`). Set-based `fail_fast` like link_parcels is a declared deviation (R-BD). <br>3. **PostGIS / Turf fallback** (`:211-245`): retire it whole per R-W (`124a:137`) and add a `guards.requires postgis` (`link-parcels.descriptor.json:314-320`). <br>4. Literal fallbacks `?? 0.95` and `?? 0.80` (`:207-208`) duplicate seeds (`logic_variables.json` `coa_parcel_conf_tier1a`/`1b`); delete them. <br>5. **Trigger co-writer:** `lead_parcels` is also written by `trg_mirror_permit_parcels_to_lead_parcels` on `permit_parcels` (`migrations/144_…:66`; DB confirms the trigger), i.e. by converted link_parcels. DB: 245,270 `permit:` rows vs 29,627 `coa:` rows. The scope `lead_id LIKE 'coa:%'` must be declared on every write and retraction. The ledger's "1 writer" undercounts. <br>6. `supports_full: true` is a dead declaration: no `--full` path in the file; the GP-L1 precedent is `geocode-permits.js:14-20`. |

#### B.2.3 enrich_coa_zoning — `scripts/enrich-permits.js` with `ENRICH_TARGET=coa`, 834 lines

| | |
|---|---|
| Archetype | **ENRICHER**: copies the dominant-parcel zoning feed onto `coa_applications` through `lead_parcels`. It is a temp-table materialize (`:488-489`), then a guarded set-based UPDATE (`:500`, builder `:470`), then an orphan nullify (`:506`, builder `:546`). Always full (`:5-6`). |
| Proxies | q 35 / w 2 (template `UPDATE ${c.table}`, plus temp DDL); clock 2 (duration `:605`, `:782`) / intv 0 / const 4 (lock 66 `:14`; `PERMITS_COVERAGE_FAIL`/`COA_COVERAGE_FAIL = 80` `:20-21`; `CENTRELINE_COVERAGE_MIN_DEFAULT = 0.90` `:73`) / catch 0 |
| Ledger | reads parcels (98 cols), lead_parcels, coa_applications. Writes `coa_applications` (97 columns plus `zoning_enriched_at`): 19 readers, 8 writers. The twin `enrich_permits` writes the same 97 columns on `permits` (29 readers, 13 writers). |
| Precedent | **geocode_permits** (`ef515c1c` → `7853342f`; ENRICHER `set_based_join_update` + `set_based_null_retract`, one slug in two chains through `execution.invocation`); **enrich_heritage** (`08f3dabd`) |
| Owner specs | 66 (`:7`); 58 (WF3 header `:2`) |
| Runner forms | none of the five. It uses existing ENRICHER `temp_materialize` / `set_based_join_update` / `set_based_null_retract` (`write-class-disposition.json` write_classes). |
| Decisions owed | 1. **Identity: one file, two slugs** (`enrich_permits`, `enrich_coa_zoning`; census `:259`, `:266`). A descriptor has one `identity.name`, `converted.json` is keyed by file, and `execution.invocation` is per *chain*, not per slug (`step.schema.json:4129+`; `ledger.js:179-183`). `scripts/enrich-web-search.js` has the same shape (two slugs). Proposal: two thin shells (`enrich-permits.js`, a new `enrich-coa-zoning.js`) over one compute module, so each slug gets its own descriptor. That changes `manifest.scripts.enrich_coa_zoning.file`. <br>2. **G1:** compute reads `logic_variables` by SQL (`:320`), the `compute-ledger-sql` code; make it a declared config. **G3:** `information_schema` probes (`:343` and the `:160-290` precondition reads) become `guards.requires` / R-CX probes. <br>3. **EXTERNALIZED:** the `= 80` thresholds are "pinned against `_contracts.json`" (`:18-19`), a copied number, so register them as variables. The `0.90` default is a literal fallback; delete it. <br>4. The closure includes `scripts/lib/max-build.js`, already in the closure of converted, V3 `enrich_parcels` (`scripts/lib/compute/enrich-parcels.js:90`), so no new purity risk is expected. |

#### B.2.4 classify_coa_scope — `scripts/classify-coa-scope.js`, 284 lines

| | |
|---|---|
| Archetype | **ENRICHER**: a per-row JS classifier (`scripts/lib/coa-scope-classifier.js`) writing 6 columns on its own input table (`:134-145`). Pending cursor: `scope_classified_at IS NULL OR < last_seen_at` (`:165-173`). |
| Proxies | q 1 (+1 stream) / w 1; clock 2 (duration) / intv 0 / const 2 (lock `:37`, `COA_SCOPE_COL_COUNT` `:49`; plus the `Math.min(1000, …)` batch literal `:50`) / catch 0 |
| Ledger | reads `coa_applications(6)`; writes `coa_type_class, project_type, scope_tags, structure_type, scope_classified_at, scope_source` |
| Precedent | **compute_parcel_cost_estimates** (`d79191cf` → `01a07218`): ENRICHER, JS per-row compute, one `post_commit` phase (`compute-parcel-cost-estimates.descriptor.json` `execution.phases`) |
| Owner specs | 42 (§6.5 step 5, §6.6.D), 47 (`:25-26`); 84 §7 dual-path (`:12-13`) |
| Runner forms | none of the five. It **consumes R-DW**: the pending cursor keys on `last_seen_at`. |
| Notes | 1. **Stale comment vs code:** `:158-163` says `last_seen_at` moves "ONLY when data_hash changes", but legacy `load-coa.js:565-582` touches it for every fed key. So today the cursor re-classifies every CoA in each feed. R-DW keeps that exactly (parity). The claim-#54 invalidator is `coa.last_seen_at` (a `seen` column), and the notes must say so. <br>2. No IS DISTINCT FROM guard, by design (`:123-131`), so `scope_classified_at` is a run-clock column outside the guard (LG-9/D-5, `link-parcels.descriptor.json:245-253`). <br>3. `supports_full: true` is a dead declaration (no `--full` path). |

#### B.2.5 classify_coa_trades — `scripts/classify-coa-trades.js`, 646 lines

| | |
|---|---|
| Archetype | **MATERIALIZER** (proposed): derived per-lead rows. <br>• `lead_trades` upsert `ON CONFLICT (lead_id, trade_id)` with **no guard** (`:203-215`); <br>• `lead_products` per-lead DELETE + INSERT (`:228`, `:241`); <br>• watermark `coa_applications.trade_classified_at` (`:252`). <br>Cursor `trade_classified_at < scope_classified_at` (`:273`). |
| Proxies | q 6 (+1 stream) / w 4; clock 2 (duration) / intv 0 / const 4 (lock `:52`, col counts `:84`, `:88`, `SLUG_MISS_CAP = 50` `:172`) / catch 0 |
| Ledger | writes:<br>• `lead_trades`: 3 readers (assert_global_coverage, compute_coa_cost_estimates, compute_trade_forecasts), 1 declared writer;<br>• `lead_products`: 1 reader, 1 writer;<br>• `coa_applications.trade_classified_at`. |
| Precedent | **link_parcel_addresses** (`5ee14f5b` → `1ad007f8`, the only converted MATERIALIZER). The twin is compute_trade_forecasts (wave 3, census MATERIALIZER). The lead_products per-key replace is semantically link_parcels' `guarded_upsert` + `link_full_retraction`, which today runs only under `runLinkKeyedPhase` (`write-class-disposition.json` `link_full_retraction.executor.runners`). |
| Owner specs | 42 (§6.5 step 5, §6.8, §6.11), 47, 80 §5, 84 §7 (`:32-35`) |
| Runner forms | none of the five. **Owed by wave 3:** `runMaterializePhase` runs compute-authored `INSERT … SELECT` only (`index.js:2822-2847`), and classify_coa_trades computes rows in JS. **Owed new or reused:** the per-key replace form. |
| Notes | 1. **Trigger co-writer:** `trg_mirror_permit_trades_to_lead_trades` (`migrations/143_…:90`; live in the DB). DB: 1,784,196 `permit:` vs 940,769 `coa:` rows. Scope `lead_id LIKE 'coa:%'`. <br>2. **Legacy defect, not fixed here (parity):** a trade that drops out of a CoA's scope is never retracted from `lead_trades` (upsert only), and every conflict rewrites `classified_at` (no guard). A converted `guarded_upsert` would stop rewriting unchanged rows, so the `records_updated` semantics change. Declare that as a deviation, or keep it unguarded. <br>3. Compute reads `manifest.json` (`:49`, `:563` `telemetry_vocab_cols`). In the converted form that becomes a declared `vocab_coverage` check (`step.schema.json` `definitions.check`). <br>4. Alternative archetype: **LINK `link_keyed`**, whose runner forms exist today. That is a truthful fit for lead_products but not for lead_trades (no retraction). See question B4. |

#### B.2.6 compute_coa_cost_estimates — `scripts/compute-coa-cost-estimates.js`, 921 lines

| | |
|---|---|
| Archetype | **MATERIALIZER** (proposed; matches its twin compute_cost_estimates, census MATERIALIZER `step-archetype-census.json:178-182`, so both writers of `cost_estimates` share one archetype). <br>• `cost_estimates` guarded upsert `ON CONFLICT (lead_id)` (`:359-397`); <br>• second target `coa_applications` cost columns and `cost_classified_at` (`:421-436`). |
| Proxies | q 8 (+1 stream) / w 2; clock 2 (duration) / intv 0 / const 2 (lock `:78`, `COST_ESTIMATES_COL_COUNT` `:87`; plus the 1000 cap `:88`) / catch 0 |
| Ledger | reads 11 tables (coa_applications 31 cols, lead_trades, lead_parcels, parcels, …). Writes:<br>• `cost_estimates`: 5 readers (assert_data_bounds, assert_global_coverage, refresh_snapshot, assert_entity_tracing, compute_opportunity_scores), 2 writers (this step and compute_cost_estimates);<br>• `coa_applications`.<br>DB: 20,486 `coa:` rows in `cost_estimates`. |
| Precedent | **compute_parcel_cost_estimates** (`d79191cf` → `01a07218`) for the JS Brain. Wave-3 **compute_cost_estimates** for the MATERIALIZER form, the second target and the shared `cost-model-shared.js` closure (`:75`; `compute-cost-estimates.js:33`). |
| Owner specs | 42 (§6.5 step 12, §6.8), 47, 48 §3, 83 §3-ARCHETYPE (`:51-55`) |
| Runner forms | none of the five. It needs the same wave-3 MATERIALIZER JS-row plus second-target form as its twin. |
| Notes | 1. `--full` is real (`:130`, `:520-521`), so it needs `override.force_full` / mode. `--dry-run` / `--limit` (`:120-123`, `:315`) are operator knobs and must be declared or retired (R-BD). <br>2. **Parity defect:** when the Brain returns NULL, the existing `cost_estimates` row is not deleted, while `coa_applications.cost_source = 'none'` (`:310-311`). Keep it and declare it. <br>3. Converting either cost step puts `src/features/leads/lib/cost-model-shared.js` (992 lines, 8 module numeric consts) in a gate-E G0 closure for the first time. Waves 3 and 4 must agree on one scan result. |

### B.3 Decisions owed before any wave-4 descriptor

| # | Decision | Why |
|---|---|---|
| D1 | ARCH-CENSUS rows for the six (ASSERT, LINK, ENRICHER, ENRICHER, MATERIALIZER, MATERIALIZER) | No descriptor exists without an archetype (`122:608`); ARCH-CENSUS is PARTIAL (`programme-items.json:1923`) |
| D2 | The enrich-permits identity split, and whether `enrich_permits` converts in the same series | §B.2.3 D1 |
| D3 | link_coa_to_parcels: copy O4 row 7 (re-check every run), retire Turf, drop per-row SAVEPOINTs | §B.2.2 D1–D3; all three are behaviour-adjacent |
| D4 | The MATERIALIZER JS-row plus second-target form comes from wave 3 (compute_cost_estimates, compute_trade_forecasts) | Wave 4's two MATERIALIZERs cannot land first |
| D5 | lead_products per-key replace: reuse `link_full_retraction` under MATERIALIZER (a runner arm, possibly a RE-FREEZE) or archetype LINK | §B.2.5 note 4 |

**RE-FREEZE count for wave 4:** 0 if D4 is delivered by wave 3 and D5 = LINK. 1 if D5 needs a MATERIALIZER retraction arm; it could ride the wave-3 re-freeze. Every runner-side change still rides one `--replay-all` night (R-CZ / #39; phase-4 plan §3 "any" row).

### B.4 Ordering and night plan

**Data order inside the coa chain** (from the ledger edges):
1. coa;
2. assert_coa_freshness (reads `last_seen_at`);
3. link_coa_to_parcels, which writes `lead_parcels` (read by enrich_coa_zoning and compute_coa_cost_estimates);
4. enrich_coa_zoning;
5. classify_coa_scope, which writes `scope_tags` (read by classify_coa_trades);
6. classify_coa_trades, which writes `lead_trades` (read by compute_coa_cost_estimates and compute_trade_forecasts);
7. compute_coa_cost_estimates.

That is chain order (`manifest.json:98`). All six sit **between** the coa root (wave 1) and link_coa (wave 2), and none of them reads any wave-2 or wave-3 output. So wave 4's build (assessment, red suite, descriptor, compute; no DB) can run in parallel with waves 2–3, one worktree per step.

**Nights.** R-CQ (`124:237`) allows one dev-DB writer at a time. These follow the runner lane N1 and phase-4 P0–P3.

| Night | Carries |
|---|---|
| **P3** (existing) | adds **wave-4 PRE captures** on legacy code, in chain order: assert_coa_freshness, link_coa_to_parcels, enrich_coa_zoning (and enrich_permits if D2 bundles it), classify_coa_scope, classify_coa_trades, compute_coa_cost_estimates. A PRE must precede any compute change (trap 7, `122a:808`). |
| **P4** (new) | **Wave-4 POSTs and forced brackets** in the same order. <br>• assert_coa_freshness: no write, so only its checks are captured. <br>• link_coa_to_parcels: bracket `parcel_linked_at` NULL on a `coa:` cohort, or R-DP delete-and-reinsert on `lead_parcels` (no inbound FK and no DELETE trigger on `lead_parcels`, per the DB; `124:261`). <br>• classify_coa_scope, classify_coa_trades, compute_coa_cost_estimates: bracket NULL `scope_`/`trade_`/`cost_classified_at`. Their writes cascade, so run them in order. <br>Then the **downstream replay**: the coa readers of the wave-4 tables (link_coa, classify_lifecycle_phase, assert_lifecycle_phase_distribution, refresh_snapshot, assert_data_bounds, assert_global_coverage, compute_phase_calibration, compute_trade_forecasts for `lead_trades`, compute_opportunity_scores for `cost_estimates`). They are expected golden-neutral; an output change is an `explained-diffs.json` entry (R-DA). <br>Then `step-validate --all --write`, a parcel_sanity descriptor regeneration, read-only validate, test:db and the full suite (phase-4 plan §3 "Minimum"). |

Each wave-4 step adds a converted producer edge on `coa_applications` (8 writers). The G2 skip-gate effect (`staleness.js:667-672`, phase-4 plan §2) therefore reaches every converted reader of `coa_applications`, including wave-2's link_coa and classify_lifecycle_phase. That is why P4 replays them.

**Cutover constraint:** under R-EA (runner lane §5.1), every non-sources legacy slug stays in `EP-PIN-D17.gate.blocks` regardless of status. `checkCutoverPrereqs` (`step-validate.mjs:847-871`) therefore stops ③ for all six (and for coa/link_coa/classify) until the end-of-sources cloud acceptance. ② (the frozen shell swap) can land. Each step stays `pending` and reads V3 by R-DT once its stage hides no red (`124:265`).

### B.5 What completes the coa chain (R-BC (a)–(e), `124a:213`)

| Condition | State after waves 1–4 | Still owed |
|---|---|---|
| (a) CONVERTED: all 16 files in `converted[]` | 5 converted; 11 `pending` at ② (waves 1, 2, 4) | ③ for 11 slugs: blocked by EP-PIN-D17 (R-EA). The enrich-permits split (D2) changes which file `enrich_coa_zoning` names. |
| (b) NO LEDGER: zero `standard-gates-ledger.json` rows for chain steps | **1 row**: `E refresh-snapshot compute-ledger-sql@e230841952758fbf#1`, closing `CP-PERMITS` (the file holds exactly one row) | **A permits dependency.** CP-PERMITS closes when `permits` writes `pipeline_runs` (wave 1, `load-permits.js:725`) and refresh_snapshot stops reading `sync_runs` (`refresh-snapshot.js:240`). |
| (c) LEDGER COMPLETE (LDG-10) | LDG-10 PARTIAL. Its title and #50 are scoped to **sources** (`programme-items.json:333`; R-DI `124:255`) | A coa-scoped conjunction: widen #50 per chain, or a new item. Plus the two trigger co-writers (`lead_parcels`, `lead_trades`), which today appear as 1 writer each. |
| (d) CLOUD ACCEPTED (EP-PIN-D17) | PARTIAL | A per-slug ACC-1 row for all 16 |
| (e) TOOLING (CHAIN-TOOLING) | NOT_STARTED (`programme-items.json:387`) | Pre-commit `--check`s, a per-chain preflight line, cloud:pre seeds (R-DJ) |

**So waves 1–4 deliver (a) to the ② boundary only.** coa chain completion additionally needs CP-PERMITS (from the permits root), a coa-scoped (c), and the two cloud and tooling items.

### B.6 Archetype-less coa steps

**None.** The six fit ASSERT, LINK, ENRICHER, ENRICHER, MATERIALIZER and MATERIALIZER. The two MATERIALIZERs depend on a wave-3 runner form (D4), and lead_products' per-key replace on D5. dispatch_notifications, the only step with no archetype, is not in the coa chain.

---

## Questions for the operator (y/n, one recommendation each)

**Part A — dispatch_notifications**

1. Keep dispatch_notifications out of wave 4? It is permits-chain only (`manifest.json:93`), inert (kill-switch 0, 0 rows), and has no readers. **Recommend y.**
2. Adopt **(b) DISPATCHER** as its target archetype, built in the permits-completion wave with `backup_db` as the second member (one RE-FREEZE after #37), and record PIN DISPATCH-ARCH dated 2026-10-18 now? **Recommend y.**
3. In that design, is the transport the **existing `ctx.fetch` seam** (`index.js:6458`, already in `STEP_CTX_KEYS`), with captures on a recording transport over committed fixture responses? This replaces the phase-4 "ctx.transport" draft. **Recommend y.**
4. Reject (c), a permanent `outbound_side_effect` exemption, because it leaves the lineage wrong and the literals in place? **Recommend y.**
5. Reject (d), the outbox split, because it needs three behaviour rulings (retry slot, throttle refund, timing) and a non-V3 sender? **Recommend y.**
6. When dispatch converts, also seed the four `notifications_*` variables into `scripts/seeds/logic_variables.json`, add `device_tokens` to `telemetry_tables`, and add a `PIPELINE_TABLE_MAP` entry (`notification_dispatches`), all in the same landing rather than before it? **Recommend y.**

**Part B — wave 4 = CoA**

7. Wave 4 = the six coa steps: assert_coa_freshness, link_coa_to_parcels, enrich_coa_zoning, classify_coa_scope, classify_coa_trades, compute_coa_cost_estimates? **Recommend y.**
8. ARCH-CENSUS rows for the six: ASSERT, LINK, ENRICHER, ENRICHER, MATERIALIZER, MATERIALIZER? **Recommend y.**
9. Split `enrich-permits.js` into two thin shells over one compute module (one descriptor per slug), and convert `enrich_permits` in the same series so no second implementation lives on? **Recommend y.**
10. link_coa_to_parcels: copy link_parcels O4 row 7 (re-check every run, `parcel_linked_at` invalidator), retire the Turf fallback (R-W), and replace per-row SAVEPOINTs with set-based `fail_fast`, all declared as deviations? **Recommend y.**
11. classify_coa_trades lead_products: archetype stays MATERIALIZER, and the per-key replace reuses `link_full_retraction` under `runMaterializePhase` (riding the wave-3 re-freeze), not a switch to LINK? **Recommend y**, for STANDARDIZED with the twin compute_trade_forecasts.
12. Keep the two legacy parity defects (unretracted stale `lead_trades`; stale `cost_estimates` on cost → NULL) as declared deviations, each with a follow-up, rather than fixing them inside the conversion? **Recommend y** (SIMPLE; a fix is a behaviour change with its own capture).
13. Night plan: wave-4 PREs ride P3, and a dedicated P4 carries the wave-4 POSTs plus the downstream replay of the converted coa readers? **Recommend y.**
14. R-BC (c) for coa: widen #50 / LDG-10 to print a per-chain conjunction (coa next to sources), and declare the two mirror triggers as `lead_parcels`/`lead_trades` writers? **Recommend y.**
15. Correct the `STEP_DESCRIPTIONS` ">45 days" copy (`funnel.ts:721`) and the stale `last_seen_at` comment (`classify-coa-scope.js:158-163`) inside each step's own conversion commit, not as a separate edit? **Recommend y.**
