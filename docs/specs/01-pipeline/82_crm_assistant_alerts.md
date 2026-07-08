# 82 CRM Assistant & Alerts

> **Status:** IMPLEMENTED (engine LIVE + chain-wired) — The Communication Layer
> **KEEP decision (2026-07-07):** After a supersession review against Specs 81 (LOS scoring), 85 (forecast), and 77 (flight board), this spec is **KEPT, not superseded**. It owns push/dedup/archive duties that no other spec covers — see §Relationship to Specs 77 / 81 below.
> **Implementation state:** `scripts/update-tracked-projects.js` is shipped and wired as a permits-chain step (immediately after `compute_opportunity_scores`; see §2). It writes `tracked_projects`, `lead_analytics`, and `notifications`. The **user-facing tables (`tracked_projects`, `notifications`) are empty in the dev DB only because there are no onboarded users**, not because the engine is inert — the engine runs every chain pass. `trade_configurations` is seeded (35 rows live). **The saved-lead dual-table split that muted notifications for real users is RESOLVED via the Step-0 self-feed (see §Known Failure Modes KFM-1).**
> **Purpose:** Formal specifications for the CRM Assistant, which delivers high-signal logic alerts and monitors tracked projects.

### Relationship to Specs 77 / 81 (why this spec is KEPT)
- **Spec 81 (LOS scoring) is a downstream CONSUMER, not a replacement.** Spec 81's opportunity-score engine reads the `lead_analytics` aggregation this spec produces (competition penalties): `scripts/compute-opportunity-scores.js:155` (`LEFT JOIN lead_analytics la ON la.lead_key = tf.lead_id` in the main scoring query) and the drift-probe at `:449`/`:463`. If this engine stops populating `lead_analytics`, Spec 81 loses its saturation signal. This is a hard producer→consumer dependency.
- **Spec 77 (Flight Board) is pull-only and does NOT replace this engine.** The flight board renders current state on demand; it does not own the push-notification delivery, the cross-run dedup memory (`last_notified_urgency` / `last_notified_stalled`), or the auto-archive/disappearance duties. Those live here. Retiring Spec 82 would silently drop push/dedup/archive.

## 1. Goal & User Story

Monitor user-tracked leads and deliver high-signal alerts only when project reality shifts (Stalls, Recoveries, or Imminent starts).

**User Story:** A claimed plumber receives a "Back to Work" alert the moment a stop-work order is cleared, allowing them to re-mobilize their crew without manual site checks.

**Refocused Purpose: The "User Handshake"**
Maintaining a synchronous state between the project's physical reality and the user's digital Flight Board. The script’s success is measured by the accuracy of lead disappearances and the timeliness of status shifts.

---

## 2. Technical Architecture

### Database Schema

#### `tracked_projects` (Persistence Memory)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `last_notified_urgency` | VARCHAR | | Prevents duplicate "Imminent" alerts. |
| `last_notified_stalled` | BOOLEAN | | Tracks if user was already alerted of current stall. |

#### `trade_configurations` (NEW - Manual Variable Table)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `trade_slug` | VARCHAR | PRIMARY KEY | e.g., 'plumbing', 'framing' |
| `imminent_window_days` | INTEGER | | Default 14. How many days out to trigger "Imminent" alert. |
| `bid_phase_cutoff` | VARCHAR | | e.g., 'P6'. When the strategic window closes. |
| `work_phase_target` | VARCHAR | | e.g., 'P9'. When the actual work is predicted to start. |
| `allocation_pct` | DECIMAL | | Trade's percentage of total construction cost. |

#### `lead_analytics` (Behavioral Signals)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `lead_key` | VARCHAR | PRIMARY KEY | Format: `'permit:{permit_num}:{LPAD(revision_num, 2, '0')}'` |
| `tracking_count` | INTEGER | | Count of active "Claimed" pros. |
| `saving_count` | INTEGER | | Count of "Watchlist" watchers. |

### Implementation
- **Script:** `scripts/update-tracked-projects.js`
- **Logic:** The script fetches settings from `trade_configurations` at runtime to decide when to notify.
- **Wired Into:** Permits Chain — registered as `update_tracked_projects` in `scripts/manifest.json` (`chains.permits`). It runs **immediately after `compute_opportunity_scores`** so alerts and `lead_analytics` UPSERTs see the freshest `opportunity_score` and `urgency` values from this chain. It is **not** the terminal step: three quality/backup steps follow it (`assert_entity_tracing`, `assert_global_coverage`, `backup_db`). As of the live manifest it is position 29 of the 32-step permits chain (verify against `manifest.json`, not a fixed number, before quoting a position). Auto-archives claimed leads where `urgency='expired'` (WF3 2026-04-13).

---

## 3. System Logic Flow

How the global scoring and alert logic flows using the configurations:

1. **The "Stamper" (`compute-trade-forecasts.js`):** Joins `trade_configurations` to determine if a project is in the bid window. If it is beyond `bid_phase_cutoff`, it stamps the lead as work.
2. **The "LOS Engine" (`compute-opportunity-scores.js`):** Reads the stamp. `bid` = 2.5x multiplier; `work` = 1.5x multiplier.
3. **The "Assistant" (`update-tracked-projects.js`):** Joins this table for claimed projects. If the `predicted_start` is within the `imminent_window_days`, it sends the "Last Minute" start alert.
4. **The "Slicer" (`compute-cost-estimates.js`):** Uses the `allocation_pct` to divide the total $ value into trade-specific JSONB values.
5. **Terminal Phase Handling:** Phases P19 (Occupancy) and P20 (Closed) act as global "Kill Switches" that immediately archive all associated leads regardless of trade-specific targets.

---

## 4. Behavioral Contract

### Inputs
Nightly run processing `tracked_projects` JOIN `trade_configurations`.

### Core Logic & Delivery Mechanism
The CRM Assistant must `INSERT` into the `notifications` table using the standard `STALL_WARNING`, `STALL_CLEARED`, and `START_IMMINENT` type codes.
- **Fetch Config:** Script pulls `imminent_window_days` per trade.
- **Stall Alert:** Triggered if `lifecycle_stalled` is `TRUE` and `last_notified_stalled` is `FALSE`.
- **Imminent Alert:** Triggered if `predicted_start` is within the trade's `imminent_window_days` and `last_notified_urgency !== 'imminent'`.
- **Sync:** Aggregates trackers to `lead_analytics` to update competition penalties in the LOS engine.

### The "Disappearance" Contract
Leads automatically leave a user's board when:
1. **Target Completion:** The project ordinal has exceeded the trade's `work_phase_target`.
2. **Lead Expiry:** The project timeline has drifted beyond the platform's `lead_expiry_days` threshold.
3. **Global Closure:** The project has reached terminal phases P19 or P20 (or `lifecycle_group IN ('C4','BP7')` post-Phase E).

### CoA Lead Handling (WF1 #coa-pipeline-parity-phase-a, 2026-05-13)

**Phase F.2 (DELIVERED 2026-05-16 commit `66884af`):** `update-tracked-projects.js` now branches on `lead_id` prefix. The CoA branch implements 3-tier per-status stall thresholds, hearing-date-keyed imminent window, decision-keyed auto-archive (with `'Closed'` status terminal state per v4 CRIT-DD covering 87.6% of CoAs), and 3 new notification types. Mig 153 relaxes `tracked_projects` schema (drops FK + nullable permit_num/revision_num + adds partial UNIQUE on `(user_id, lead_id, trade_slug) WHERE lead_id LIKE 'coa:%'` + adds `notified_decision_rendered BOOLEAN` column). Mig 154 seeds `coa_stall_threshold_postponed_days=60` (operator-tunable; previously hardcoded).

CoA-stage leads (`lead_id LIKE 'coa:%'`) require different stall thresholds, alert windows, and disappearance rules than permit-stage leads. The script branches on `lead_id` prefix (`permit:` vs `coa:`):

**Stall thresholds for CoA-stage (3-tier per-status):**
- `status = 'Hearing Scheduled'` (Universal Stream B1.B / P2) can sit for 1–3 months as normal hearing-prep — NOT a stall. Use `coa_stall_threshold_p2_days` (logic_variable, default 90) instead of the global `coa_stall_threshold` (default 30 — generic/intake-stall threshold).
- `status IN ('Postponed','Deferred')` triggers stall on > `coa_stall_threshold_postponed_days` (logic_variable, default 60 — mig 154, operator-tunable per v2 HIGH-I fold).

**Imminent-alert window for CoA-stage:**
- Keyed on `coa_applications.hearing_date - NOW()` rather than `trade_forecasts.predicted_start - NOW()` (permit-stage anchor).
- New `logic_variable` `coa_imminent_window_days` (Spec 86, default 7).
- Alert fires when `0 < (hearing_date - NOW()) <= coa_imminent_window_days` AND `last_notified_urgency != 'imminent'`.

**Decision-keyed auto-archive (Spec 82 §4):**
- `decision IN ('Refused', 'Withdrawn', 'Closed')` → archive immediately. No `lead_expiry_days` wait.
- **`status IN ('Complete', 'Closed')`** (P20 lifecycle-terminal per Spec 84 §3) → archive immediately. v4 CRIT-DD fold adds 'Closed' status to terminal set — 87.6% of CoAs have `status='Closed'` (mostly `decision='Approved'` = lifecycle-complete approved variances). Without this, those CoAs would never auto-archive.
- `decision = 'Final and Binding'` → keep the lead (NOT in `COA_APPROVED_DECISIONS` per v2 CRIT-G — FaB does NOT fire `COA_DECISION_RENDERED` alert because the spec contract is "keep the lead; linked permit handles it"). The linked permit (if any) will surface as a new lead with `lead_type='permit'` once it lands in CKAN.

**`notifications.permit_num` polymorphism for CoA:** the 3 new notification subtypes (`COA_HEARING_IMMINENT`, `COA_DECISION_RENDERED`, `COA_STALLED`) store the CoA `application_number` in the existing `notifications.permit_num` column (already nullable). Mobile app discriminates via `type LIKE 'COA_%'` prefix check. v4 CRIT-CC: fallback chain `coa_application_number || permit_num || 'unknown-coa'` prevents NULL in the column for malformed lead_id inputs. F.4 (Spec 76 §3.5 Lead Inspector CoA panel) may revisit this with a dedicated `notifications.lead_id` column.

**Notification subtypes (extensions to `notifications` table):**
- `COA_HEARING_IMMINENT`: "Your variance hearing is in N days — confirm crew availability for likely-approved trade."
- `COA_DECISION_RENDERED`: "Variance approved — permit application expected within 12 months (typical lag)."
- `COA_STALLED`: "CoA stalled at <status> for > <threshold> days — project may be on hold."

**`tracked_projects` keying:** `lead_id` field (added Phase B) holds `'coa:<application_number>'` for CoA-side rows and `'permit:<num>:<rev>'` for permit-side rows. The `lead_id` prefix is the canonical discriminator — no `lead_type` column exists on this table (WF3 2026-05-14 amendment: the prior `lead_type` reference was a spec-text artifact; the R5.3 trigger-based dual-write pivot, commit `872ec73`, retired the discriminator-column design).

### Outputs & Notification Payload
Mutates `tracked_projects` (status/memory) and `lead_analytics`. Generates an entry in the `notifications` table:
- **`STALL_WARNING`:** Triggers a push notification: "Site Stalled - Check your schedule."
- **`STALL_CLEARED`:** Triggers a notification: "Back to Work - Site is active again."
- **`START_IMMINENT`:** Triggers a notification: "Job Starting Soon - Confirm your crew."

### Edge Cases
- **Stall Suppression:** "Imminent" alerts are strictly suppressed if `lifecycle_stalled` is `TRUE`, even if the predicted date is close.
- **Unmapped Trade:** Defaults to 14-day imminent window if trade is missing from config table.

---

## Known Failure Modes

### KFM-1 — Saved-lead dual-table split mutes ALL push notifications for real users (2026-07-07) — **RESOLVED (P9a, option C self-feed)**

> **FIXED 2026-07-07 (P9a WF3).** The engine now SELF-FEEDS: a Step-0 UPSERT (`scripts/lib/self-feed-tracked-projects.js`, run from `update-tracked-projects.js` inside the advisory lock, before the SOURCE stream) materializes a `tracked_projects` row per `lead_views.saved = true` row for `permit` + `coa` lead_types. `ON CONFLICT DO NOTHING` (no conflict target — handles all three unique arbiters incl. the GLOBAL `uniq_tracked_projects_lead_id`) so existing rows' memory columns (`last_notified_*`, `notified_decision_rendered`, `status`, `claimed_at`) are never clobbered. A second targeted UPDATE re-activates a re-saved-after-archive row (`archived → saved`) touching only `status`/`updated_at`. `lead_analytics` restoration is automatic — the existing Step-4 rebuild reads `tracked_projects`. Telemetry: `self_feed_inserted` / `self_feed_reactivated` INFO audit rows. **Latency (Gemini, confirmed):** the engine evaluates once per chain run, so self-feed adds zero incremental save-to-notification latency vs any dual-write. **Known residual (pre-existing schema, filed as follow-up, NOT introduced by P9a):** `uniq_tracked_projects_lead_id` (mig 140) is GLOBAL on `lead_id`, so a `coa:` lead can have only ONE tracker across all users — a second user's save is silently skipped by DO NOTHING. Permit leads are unaffected (their `lead_id` stays NULL; they dedup on `uq_tracked_user_permit_trade`). The original defect analysis is retained below for history.

**Mechanism.** The live save API (`src/app/api/leads/save/route.ts`) persists a user's save into **`lead_views.saved = true`** (see also `src/app/api/admin/stats/route.ts:181` counting `lead_views WHERE saved = true`). This alert engine, however, reads its work queue **`FROM tracked_projects`** (`scripts/update-tracked-projects.js:289`/`:342`). **No production code path copies a `lead_views.saved` row into `tracked_projects`.** The trigger-based dual-write shipped in commit `872ec73` (§2 R5.3) mirrors a **DIFFERENT** table pair — `permit_trades → lead_trades` and `permit_parcels → lead_parcels` — for the CoA-parity lead-key derivation. It does nothing for `lead_views → tracked_projects`. So the "dual-write" that the §4 keying note leans on does not bridge the save→track gap.

**Scope — `lead_analytics` is a SECOND muted consumer (2026-07-07 Guardian fold [GRD P9a-2]).** Not just the notification queue is starved. This engine **rebuilds `lead_analytics` FROM `tracked_projects`** (`scripts/update-tracked-projects.js:1025-1078` — `INSERT INTO lead_analytics … SELECT … FROM tracked_projects`). With `tracked_projects` empty, `lead_analytics` stays empty, so **Spec 81's competition/saturation signal reads zero for every lead** (Spec 81's LOS engine LEFT-JOINs `lead_analytics`; see §Relationship to Specs 77 / 81). The fix must restore this path too, not only the push-notification queue.

**Consequence.** For real onboarded users, saving/claiming a lead writes `lead_views.saved` but leaves `tracked_projects` empty, so this engine's work queue is empty → **every STALL / IMMINENT / recovery / CoA push notification is silently muted, AND every lead's competition penalty (Spec 81) is silently zero.** The dev DB masks this because it has zero users (empty on both tables looks the same as "no work").

**Severity.** **LAUNCH BLOCKER, not a live incident** — there are zero real users today (pre-launch; `lead_views` empty), so nothing is broken *for a user* yet. It becomes a P0 the moment mobile launches and the first save lands. Until then, treat any "0 notifications generated" / "0 `lead_analytics` rows" telemetry as EXPECTED-BROKEN, not healthy.

**Fix — validated direction (2026-07-07 adversarial review; see `.cursor/active_task.md` P9a).** Queued as a WF3, not fixed in this doc-currency pass. Three options were validated for complexity; the ranking overturns the naive "just repoint to `lead_views`" instinct:

- **(a) Repoint SOURCE_SQL to `lead_views` — HIGH complexity, NOT simple.** The three cross-run dedup-memory columns (`last_notified_urgency`, `last_notified_stalled`, `notified_decision_rendered`) and the `archived` status live **only** on `tracked_projects` (migs 090 / 153). `lead_views.saved = false` is a **user-visible un-save**, not an archive sink — it cannot carry archive state. Repointing needs a hot-table `lead_views` migration + a `lead_analytics` rewrite, and it **retires the archive-state design**.
- **(b) `lead_views → tracked_projects` dual-write trigger — MEDIUM.** A hot-path trigger; adds a drift surface between the two tables.
- **(c) RECOMMENDED — the engine SELF-FEEDS (Guardian-discovered).** Add an idempotent **step-0 UPSERT** that materializes a `tracked_projects` row per `lead_views.saved = true` row, `ON CONFLICT DO NOTHING` on the dedup-memory columns (the unique constraints `uq_tracked_user_permit_trade` (mig 089) + `uq_tracked_user_coa_trade` (mig 153, partial) **already exist**). One file, **no migration**, and it **preserves all dedup / archive / analytics machinery**. Single design point to decide: re-save-after-archive re-activation (a re-saved lead should re-enter the active board — the `ON CONFLICT DO NOTHING` must not resurrect stale `archived` state without intent).

**Tests the fix must update knowingly:** `update-tracked-projects.infra.test.ts:35` (phase-map build) + `:232-236` (the `tracked_projects tp` JOIN pins). **Observability pre-ack (Spec 48 §3.7):** `assert-global-coverage`'s `tracked_projects` / `lead_analytics` INFO rows will move off zero once real saves flow — expected, not a regression.

---

## 5. Testing Mandate

- **Logic:** `tracked-projects.logic.test.ts` — verify stall alerts fire once; verify imminent alerts respect the custom `imminent_window_days` from the database.
- **Infra:** `tracked-projects.infra.test.ts` — assert cross-table sync between `tracked_projects` and `lead_analytics` is atomic.

---

## 6. Operating Boundaries & Seed Data

### Variable Propagation
`trade_configurations.imminent_window_days` is the "Master Threshold" for both the Forecast Engine (labeling) and the CRM Assistant (alerting).

### Control Panel (migrations 092 + 093)
The CRM assistant now JOINs `trade_configurations` to get per-trade `imminent_window_days` instead of the hardcoded 14. Operators can set excavation to 7 days (heavy equipment scheduling), elevator to 21 days (long lead time), etc. Config is loaded via the shared `loadMarketplaceConfigs(pool)` loader in `scripts/lib/config-loader.js`.

### Seed: Trade Configurations (migration 092, replaces 091 reference)
This logic calibrates the Bid Cutoff (when the 2.5x multiplier expires), the Work Target (the date the pro is aiming for), and the Imminent Window (when the final "Last Minute" alert fires).

```sql
-- Migration 091: Trade Configuration Seed
-- Logic: Strategic Bidding vs. Operational Execution Anchors

INSERT INTO trade_configurations 
    (trade_slug, bid_phase_cutoff, work_phase_target, imminent_window_days, allocation_pct)
VALUES 
    -- 1. Structural & Site Prep (Immediate strategic need)
    ('demolition',         'P6',  'P9',  7,  0.0200),
    ('plumbing',           'P6',  'P9',  10, 0.0800), -- Groundworks/Drains
    ('foundation',         'P6',  'P10', 10, 0.1000),
    ('concrete',           'P6',  'P10', 7,  0.0800),
    ('waterproofing',      'P6',  'P10', 7,  0.0200),
    ('shoring',            'P6',  'P9',  14, 0.0200),
    ('excavation',         'P6',  'P9',  7,  0.0300),

    -- 2. Shell & Envelope (Window closes as framing begins)
    ('framing',            'P9',  'P11', 21, 0.1200), -- Needs high notice for lumber
    ('structural-steel',   'P9',  'P11', 21, 0.1000),
    ('masonry',            'P9',  'P11', 14, 0.0600),
    ('roofing',            'P9',  'P11', 14, 0.0500),
    ('glass-glazing',      'P9',  'P11', 30, 0.0300), -- Long lead times for glass

    -- 3. Systems / MEP (Strategic window closes during groundworks)
    ('electrical',         'P9',  'P12', 14, 0.0800),
    ('hvac',               'P9',  'P12', 14, 0.1000),
    ('fire-protection',    'P9',  'P12', 14, 0.0300),
    ('drain-plumbing',     'P9',  'P12', 10, 0.0400), -- Rough-ins phase
    ('solar',              'P9',  'P12', 21, 0.0200),
    ('security',           'P11', 'P15', 14, 0.0100),

    -- 4. Enclosure & Interior (Long strategic runway)
    ('insulation',         'P11', 'P13', 7,  0.0300),
    ('drywall',            'P11', 'P14', 10, 0.0400),
    ('painting',           'P13', 'P15', 7,  0.0300),
    ('flooring',           'P13', 'P15', 14, 0.0400),
    ('tiling',             'P13', 'P15', 14, 0.0200),
    ('trim-work',          'P13', 'P15', 14, 0.0100),
    ('millwork-cabinetry', 'P13', 'P15', 30, 0.0200), -- Needs time for fab
    ('stone-countertops',  'P13', 'P15', 14, 0.0100),
    ('caulking',           'P13', 'P15', 5,  0.0100),

    -- 5. Final Exterior & Specialized
    ('exterior-siding',    'P11', 'P16', 14, 0.0200),
    ('eavestrough',        'P11', 'P16', 7,  0.0100),
    ('landscaping',        'P13', 'P17', 14, 0.0200),
    ('decking-fences',     'P13', 'P17', 14, 0.0100),
    ('pool-installation',  'P11', 'P17', 21, 0.0200),
    ('elevator',           'P9',  'P15', 45, 0.0500)  -- Highest lead time

ON CONFLICT (trade_slug) DO UPDATE SET
    bid_phase_cutoff = EXCLUDED.bid_phase_cutoff,
    work_phase_target = EXCLUDED.work_phase_target,
    imminent_window_days = EXCLUDED.imminent_window_days,
    allocation_pct = EXCLUDED.allocation_pct;
```

---

## 7. Front-end Preparation (Detailed View)

### A. Admin Panel (The Marketplace Dashboard)
The Admin UI now manages the "Sensitivity" of the entire CRM Assistant:
- **Per-Trade Windows:** Editable `imminent_window_days` (e.g., 45 days for Elevators, 7 days for Painting).
- **Alert Telemetry:** A "Notification Health" chart showing the ratio of Stall vs. Imminent alerts generated in the last 24 hours.
- **Archive Audit:** A view to see "Force Archived" leads (P19/P20) to ensure site-completion logic is functioning.

### B. Lead Status & Disappearance Logic
The following fields must be consumed by the Front-End to ensure the user understands their "Flight Board" state.

#### 1. Disappearance (Why did my lead go away?)
When a lead is no longer returned in the "Active" query, the Front-End should use these fields from the archived logs to explain the removal:
- **`isWindowClosed` (Calculated):** If `current_phase > work_phase_target`.
  - *UI Explanation:* "This project has moved past the phase where your trade is required."
- **`urgency === 'expired'`:** Based on the `lead_expiry_days` variable.
  - *UI Explanation:* "This project has drifted too far off schedule and is no longer considered a valid lead."
- **`lifecycle_phase IN ('P19', 'P20')`:** Global termination.
  - *UI Explanation:* "This project is officially closed or occupied."

#### 2. Flight Status (Why is my lead Amber/Red?)
These fields drive the "High Signal" updates on the user's active board:
- **`last_notified_stalled`**
  - *Logic:* If `TRUE`, the UI must "Freeze" the project timeline.
  - *UI Action:* Display "Site Stalled" warning and gray out the `predicted_start` date.
- **`imminent_window_days`**
  - *Logic:* Used to calculate the "Alert Zone" per trade.
  - *UI Action:* If `predicted_start` is within this many days, change the status to "Action Required" and highlight in Amber.
- **`last_notified_urgency`**
  - *Logic:* Used to detect if the user has already seen the "Imminent" alert.
  - *UI Action:* If the user hasn't seen it, trigger a "High Priority" push notification.

#### 3. Competition & Saturation (Market Context)
- **`tracking_count`**
  - *Logic:* Aggregated from `lead_analytics`.
  - *UI Action:* Show "Market Density." Explains why a high-value lead has a lower score (e.g., "5 other pros are tracking this").

---

## 8. Temporary: Bug Fixes (The "WF3" Critical List)

These nine fixes are mandatory to ensure the "Communication Layer" actually communicates and aligns with Spec 47.

1. **Notification Sink Wiring (CRITICAL):** The script was logging alerts but not saving them. We are adding an batched `INSERT INTO notifications` block instead of an N+1 looping query structure.
2. **N+1 Query Elimination (Spec 47 §6.2):** Ban all queries mapping inside the loop. Process the notification generation offline in memory and flush out via ephemeral `pipeline.withTransaction()`.
3. **Graceful Shutdown (Spec 47 §5.5):** Bind a `SIGTERM` unlocker to the dedicated `pg_try_advisory_lock(82)` connection to prevent deadlocks.
4. **PII Logging Guard (Spec 47 §9.2):** Remove unbounded payload dumps; strictly ban the use of `raw: row` inside pipeline error logs.
5. **Cosmetic Knob Resolution (CRITICAL):** The `imminent_window_days` from the database was only used for text labels. Refactor the logic so this variable acts as the physical gate for the `START_IMMINENT` alert.
6. **Memory Flag Reset Path:** `last_notified_urgency` must be reset if a project moves out of a critical window, allowing re-alerting.
7. **NULL Urgency Archive:** If `urgency` is `NULL`, use the physical `lifecycle_phase` to archive the lead.
8. **Off-by-One Boundary Fix:** Change the `isWindowClosed` logic to `>` (Greater Than).
9. **Streaming Architecture:** Wrap the lookup in a bounded `for await (const row of pipeline.streamQuery)` instead of loading all tracked tasks simultaneously.
---

## 9. Implementation Plan

### Phase 1: Database & Seed (The "Config" Layer)
- **Apply Migration 093:** Ensure `trade_configurations` and `notifications` tables are ready.
- **Initialize `logic_variables`:** Set global defaults for `lead_expiry_days` and `coa_stall_threshold`.
- **Seed Trade Matrix:** Execute the 32-trade insert for `imminent_window_days` and `work_phase_target`.

### Phase 2: Script Refactor (The "Logic" Layer)
- **Refactor `update-tracked-projects.js`:** Implement the 6 Bug Fixes, focusing on the `INSERT INTO notifications` block.
- **Deploy `config-loader.js`:** Ensure the script pulls the latest Admin settings before every run.
- **Implement State Machine:** Ensure the script correctly writes `last_notified` flags to prevent duplicate alert spam.

### Phase 3: Front-End Wiring (The "User" Layer)
- **Flight Board Update:** Update the Pro App to query leads where `status != 'archived'`.
- **Notification Hub:** Connect the Front-End to the `notifications` table to display the history of Stall and Imminent alerts.
- **Calibration:** Use the Admin Panel to adjust a trade's `imminent_window_days` and verify that the App's "Amber Alerts" shift accordingly.
