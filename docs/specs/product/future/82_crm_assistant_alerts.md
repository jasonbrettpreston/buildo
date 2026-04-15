# 82 CRM Assistant & Alerts

> **Status:** ARCHITECTURE LOCKED — The Communication Layer
> **Purpose:** Formal specifications for the CRM Assistant, which delivers high-signal logic alerts and monitors tracked projects.

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
- **Wired Into:** Permits Chain — final step 24 of 24. Runs after `compute_opportunity_scores` (23) so alerts and lead_analytics UPSERTs see the freshest `opportunity_score` and `urgency` values from this chain. Auto-archives claimed leads where `urgency='expired'` (WF3 2026-04-13).

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
3. **Global Closure:** The project has reached terminal phases P19 or P20.

### Outputs & Notification Payload
Mutates `tracked_projects` (status/memory) and `lead_analytics`. Generates an entry in the `notifications` table:
- **`STALL_WARNING`:** Triggers a push notification: "Site Stalled - Check your schedule."
- **`STALL_CLEARED`:** Triggers a notification: "Back to Work - Site is active again."
- **`START_IMMINENT`:** Triggers a notification: "Job Starting Soon - Confirm your crew."

### Edge Cases
- **Stall Suppression:** "Imminent" alerts are strictly suppressed if `lifecycle_stalled` is `TRUE`, even if the predicted date is close.
- **Unmapped Trade:** Defaults to 14-day imminent window if trade is missing from config table.

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

These six fixes are mandatory to ensure the "Communication Layer" actually communicates.

1. **Notification Sink Wiring (CRITICAL):** The script was logging alerts but not saving them. We are adding an `INSERT INTO notifications` block. Without this, the tradesperson never receives the "Back to Work" or "Imminent" alerts promised in the user stories.
2. **Cosmetic Knob Resolution (CRITICAL):** The `imminent_window_days` from the database was only used for text labels. We are refactoring the logic so this variable acts as the actual gate for the `START_IMMINENT` alert.
3. **Memory Flag Reset Path:** Fixed the "One-and-Done" bug. `last_notified_urgency` is now reset if a project moves out of a critical window, allowing the system to re-alert the user if a schedule shifts back into the danger zone.
4. **NULL Urgency Archive:** Added a safety check for leads with missing forecast data. If `urgency` is `NULL`, the script now uses the physical `lifecycle_phase` to archive the lead, preventing "ghost leads" from staying on the user's board forever.
5. **Off-by-One Boundary Fix:** The `isWindowClosed` logic was archiving leads the day they started. We have changed the operator to `>` (Greater Than), ensuring the lead stays visible on the Pro's board throughout their work phase and only disappears once they have physically passed it.
6. **Concurrency Advisory Lock:** Implemented `pg_try_advisory_lock(82)` to prevent the nightly automated run from colliding with a manual Admin "Re-Sync," which would cause duplicate notifications.

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
