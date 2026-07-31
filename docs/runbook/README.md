# Operator Runbook Index

The single lazy-Read entry point for AI operators and engineers running the
Buildo pipeline: every runbook, every one-off maintenance script, and the
deploy-ordering rules that keep a run from corrupting data. Read the linked
file for the full procedure; this index is the map.

> **Cross-refs:** Spec 47 (`docs/specs/01-pipeline/47_pipeline_script_protocol.md`, the §R1–R12 script skeleton + §A.5 lock registry + §14 RUN_AT discipline) · root `CLAUDE.md` Allowed Commands table.

---

## 1. Runbooks

### `docs/runbook/` — first-deploy spikes & recovery procedures

| File | Purpose |
|------|---------|
| `58_zoning_first_deploy_spike.md` | Spec 58 `load_zoning` first-deploy spike & profiling |
| `65_enrich_parcels_spike.md` | Spec 65 `enrich-parcels.js` first-deploy spike & data profiling |
| `66_enrich_permits_spike.md` | Spec 66 `enrich-permits.js` data profiling & first-deploy spike |
| `db_rebuild_2026-06-10.md` | Full DB rebuild — 2026-06-10 drift recovery |
| `db_rebuild_post_p2.md` | DB `--force` rebuild after Spec 80 v-next Phase 2 |
| `F1_baseline_quiet_period.md` | Phase F.1 baseline quiet-period operator procedure |
| `I1_first_deploy_spike.md` | `lifecycle_status_history` first-deploy spike |
| `lead_products_coa_first_deploy.md` | CoA `lead_products` first deploy (Spec 80 §5.B, mig 184) |
| `max_build_envelope_first_deploy.md` | Max-build envelope first deploy (Spec 65 §4, migs 185/186) |
| `permit_occupancy_first_deploy.md` | Spec 78 Phase 1 permit-occupancy + build-norms first-deploy spike |
| `pipeline_step_validation_walkthrough.md` | Generic pipeline step-validation walkthrough (Spec 79) |
| `scope_intensity_matrix_rekey_baseline_spike.md` | `scope_intensity_matrix` production-vocab re-key baseline spike (carries the detached-run pattern) |
| `source_heritage_first_deploy_spike.md` | `load_heritage` first-deploy spike (Spec 61 §8c; `HERITAGE_ACCEPT_MASS_DELETE` re-key) |
| `source_ravines_first_deploy_spike.md` | `source-ravines` first-deploy spike (Spec 48 §3.7 baseline-spike pre-ack) |
| `spec80_coa_bundle_first_deploy_spike.md` | Spec 80 §5.B.5 Phase 3 CoA archetype-bundle first-deploy spike |
| `stripe_cancel_failed_sweep.md` | Weekly sweep of `stripe_cancel_failed_at` markers — deleted users whose delete-time Stripe cancel failed (Spec 20 §6; a missed sweep = a deleted user still being billed) |
| `WF1_parcel_address_bridge_first_deploy.md` | WF1 parcel↔address bridge first deploy |

### `docs/specs/01-pipeline/runbooks/` — spec-scoped procedures

| File | Purpose |
|------|---------|
| `83_archetype_cost_rollback.md` | Roll back the WF2 archetype cost derivation (Spec 83 §3-ARCHETYPE) |
| `migration-093-094.md` | Apply migrations 093 + 094 to production |

---

## 2. Maintenance script inventory

These are **not** chain steps (not in `scripts/manifest.json` / no 6 AM cron). Run them by hand for the one-time job noted.

### `scripts/one-time/` — idempotent one-shots (7)

| Script | Owning spec | Job |
|--------|-------------|-----|
| `backfill-address-points-geom.js` | 54 | Populate `address_points.geom` from lat/lng (parcel↔address bridge) |
| `backfill-building-footprints-geom.js` | 56 | Populate `building_footprints.geom` for link-massing |
| `backfill-coa-products.js` | 80 §5.B | Backfill CoA `lead_products` |
| `backfill-coa-street-name-normalized.js` | 42 / 54 | Normalize CoA street names for the bridge JOIN key |
| `backfill-coa-structure-type.js` | 42 §6.6.D | Classify CoA `structure_type` from description |
| `backfill-parcels-zoning-index.js` | 65 §2 | Build the parcels zoning index (`CREATE INDEX CONCURRENTLY`) |
| `backfill-permits-coa-zoning-index.js` | 66 §2 | Build the permits/coa zoning index (`CREATE INDEX CONCURRENTLY`) |

### `scripts/backfill/` — historical backfills (3)

| Script | Job |
|--------|-----|
| `backfill-permits-location.js` | Write `permits.location` from lat/lng for ~219K historical rows |
| `migrate-entities.js` | Migrate legacy entity rows |
| `seed-pipeline-runs.js` | Seed `pipeline_runs` history |

### Root + analysis one-offs

| Script | Job |
|--------|-----|
| `scripts/backfill-realtor-permit-trades.js` | Realtor-append permit-trade backfill (lock 114) |
| `scripts/analysis/wf2-reset-coa-trade-classification.js` | Reset `coa_applications.trade_classified_at` so the classify-coa-trades dirty predicate drains ALL rows (backs up `(id, trade_classified_at)` first; re-fires downstream cost) |
| `scripts/analysis/backfill-admin-watchlist.js` | Spec 36 [PF6]: seed `admin_watchlist` (mig 215) from the admins' `lead_views.saved=true` rows (reads `ADMIN_USER_IDS` env; `--confirm` to write; idempotent ON CONFLICT). Run ONCE after migration 215 |
| `scripts/analysis/_tmp_reset_coa_links.js` | Ad-hoc CoA link reset (temporary) |
| `scripts/seed-pipeline-schedules.js` | Spec 115 §6: seed/re-seed `pipeline_schedules`' operator-ruled cadences for all 5 chains (idempotent `ON CONFLICT (pipeline, COALESCE(chain_id,'__ALL__'))`) |
| `scripts/seed-cron-secret.js` | Spec 113 §8.1/§11: generate + write a random `CRON_SECRET` into Supabase Vault via `vault_upsert_secret` (mig 234); re-running rotates the secret |

---

## 3. Deploy-ordering rules (violate these and a run corrupts data)

1. **Seed BEFORE code.** A logic-variable's seed row must land before code that reads it via a required Zod field — the config-loader throws on a missing var (`assert-coa-freshness` `coa_freshness_fail_days`, the forecast threshold pair, etc.). Migration first, then deploy the reader.
2. **`npm run migrate -- --verify` in pre-flight.** Confirms the DB is caught up to code before any chain runs. **Both DRIFT and MISSING are blockers** — `scripts/migrate.js:164` exits non-zero on `missing > 0 || drift > 0`, and this rule previously said only "Drift = stop", which is why the MISSING case had no documented answer. (Known-accepted drift set is documented; a NEW drift is a blocker.)
   * **MISSING = a migration is committed but not yet applied to that database.** Apply it (2a), then re-run the chain.
   * **DRIFT = an applied file's checksum changed.** Do NOT apply — investigate. If it is the known CRLF class, use `node scripts/analysis/reconcile-migration-checksums.js --target=cloud|local`.
   * ⚠ **Ordering:** merging a migration to `main` makes `--verify` fail in **five scheduled workflows** (`chain-coa-permits`, `chain-deep-scrapes`, `chain-entities`, `chain-sources`, `pipeline-watchdog`) until 2a is done. **Nothing in CI applies migrations.** Plan the apply to happen with the merge, not after it.

2a. **Applying a migration to cloud — the procedure (Spec 113 §7: `migrate.js` is the sole schema authority).**
   Until this section existed there was no written procedure at all; the de-facto method was an ad-hoc shell command. Use:
   ```bash
   SUPABASE_CA_CERT_PATH=supabase/prod-ca-2021.crt node -r dotenv/config \
     -e "process.env.DATABASE_URL = process.env.SUPABASE_DATABASE_URL; require('./scripts/migrate.js');"
   ```
   * **Direct/session mode (port 5432), never the transaction pooler (6543).** `CREATE INDEX CONCURRENTLY` cannot run through Supavisor transaction pooling, and `migrate.js` routes CONCURRENTLY files outside a transaction.
   * **Never** `supabase db push` / `db reset` / `db remote commit` — FORBIDDEN by Spec 113 §7 and locked by `src/tests/schema-authority.logic.test.ts`.
   * A failed `CREATE INDEX CONCURRENTLY` leaves an **INVALID** index behind that `IF NOT EXISTS` will then skip forever. Check `pg_index.indisvalid` after any CONCURRENTLY apply; recover with `DROP INDEX` + rebuild, or `REINDEX INDEX CONCURRENTLY`.
   * Verify after: `node scripts/migrate.js --verify` should report `0 missing, 0 drift`.
3. **Detached run for >10 min chains + the dying-session chain-lock hazard.** The interactive harness kills a foreground shell at ~10 min. Launch long chains DETACHED and poll `pipeline_runs` — see `docs/runbook/scope_intensity_matrix_rekey_baseline_spike.md` for the proven pattern. Hazard: a session that dies mid-run leaves the transaction-level advisory lock held only until the connection drops; a step relying on `withAdvisoryLock` will **SKIP (not queue)** on contention, so never start a second chain that shares steps while one is still running.
4. **`HERITAGE_ACCEPT_MASS_DELETE=1` is a one-time re-key guard.** `load-heritage.js` refuses a mass-delete re-key without it; set it (and back up `heritage_properties`) only for the deliberate register re-key — see `source_heritage_first_deploy_spike.md`.
5. **Reset-then-drain for terminal-row reclassification.** ~87% of CoAs are terminal and never re-seen, so the incremental dirty predicate won't touch them; a corpus-wide reclassify needs a scoped, logged, backed-up `*_classified_at = NULL` reset FIRST (e.g. `wf2-reset-coa-trade-classification.js`), which also re-fires the downstream cost step.

---

## 4. pgTAP RLS suite (release-gating, Spec 114 §10)

**What:** `supabase/tests/rls_class_a.test.sql` / `rls_class_b.test.sql` /
`rls_class_c.test.sql` — pgTAP positive+negative locks for every RLS policy in
the Spec 114 catalog (Class A owner tables incl. `entitlements`, Class B
default-deny + the §11 "table added without RLS" introspection guard, Class C
`profiles` + the `is_admin` self-escalation trigger).

**Invoke:** `supabase test db` (local stack must be up — `supabase start`;
runs pg_prove against `127.0.0.1:54322`). Each file is a single transaction
that seeds throwaway `auth.users` rows, applies TRANSIENT grants (the live
posture keeps zero standing grants for `anon`/`authenticated`, Spec 114 §1),
asserts, and rolls back — no state persists.

**Cadence (D12: release-gating, NOT per-commit):** run alongside the
`migrate.js` fresh-replay validation before any push that touches
`migrations/` or auth/RLS-adjacent code — i.e. the same gate where
`BUILDO_TEST_DB=1 npm run test:db` runs. It is NOT wired into Husky
pre-commit or `npm run verify`. A red introspection row means a migration
added a table without `ENABLE ROW LEVEL SECURITY` (Spec 114 §11) — fix the
migration, never the exclusion list, unless Spec 114 §2 is amended first.

## 5. WSIB annual refresh (registry + contact enrichment)

The Ontario WSIB contractor registry is a MANUAL annual download — there is no stable URL,
so the scheduled `chain_sources` `load_wsib` step SKIPs (PASS + instructions row) on runners
(Spec 52). Cloud state as of 2026-07-29: 121,116 Class G rows (2026-03-05 snapshot), 0 contacts.

1. Download the Business Classification CSV from wsib.ca (annual).
2. From a machine with cloud credentials in `.env`:
   `node scripts/load-wsib.js --file "data/BusinessClassificationDetails(YYYY).csv"`
   — keeps all of Class G (builders AND trades: G1/G3/G4/G5/G6), computes `is_gta` per-row
   (this also repairs the 2026-03 all-false `is_gta` state that blocks the enrichment queue),
   and never overwrites previously-enriched contact columns (Spec 46 edge case).
3. Serper contact enrichment IN THE CLOUD: GitHub → Actions → `chain-wsib` → Run workflow.
   Requires the `SERPER_API_KEY` repo secret (real API spend — Spec 46 "on-demand,
   cost-sensitive"). Each dispatch processes ≤ `ENRICH_LIMIT` (manifest: 6000) rows and
   finishes inside the GH job cap; progress is durable per-row (`last_enriched_at`
   skip-forever) — **re-dispatch until the workflow's queue notice reports 0 pending**.
4. No further action: the nightly permits chain's `link_wsib` step propagates registry
   contacts onto matched entities automatically (COALESCE copy, Spec 46 §2).

Note: rows once enriched with no contacts found are never retried; a true refresh pass
requires resetting `last_enriched_at` (deliberate — Spec 45/46 spend control).

## Python harness (`npm run test:py`)
Unit tests for `scripts/*.py` live in `scripts/tests/` (pytest, no DB / no browser / no network). Install once with `pip install -r scripts/requirements-dev.txt`; the chains install `requirements.txt` only, so the harness can never affect a production run. CI runs it as the `Pytest (Pipeline Python)` job in `pipeline-lint.yml`. Added 2026-07-29 after three consecutive cloud-only failures (GH runs 30485096998 / 30487133930 / 30490094619) all turned out to be pure-logic seams costing a ~6-minute Actions round-trip each. Run it before pushing any `scripts/*.py` change.
