# 82 CRM Assistant & Alerts

> **Status:** ARCHITECTURE LOCKED — The Communication Layer
> **Purpose:** Formal specifications for the CRM Assistant, which delivers high-signal logic alerts and monitors tracked projects.

## 1. Goal & User Story

Monitor user-tracked leads and deliver high-signal alerts only when project reality shifts (Stalls, Recoveries, or Imminent starts).

**User Story:** A claimed plumber receives a "Back to Work" alert the moment a stop-work order is cleared, allowing them to re-mobilize their crew without manual site checks.

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
| `lead_key` | VARCHAR | PRIMARY KEY | Format: `'permit:num:rev'` |
| `tracking_count` | INTEGER | | Count of active "Claimed" pros. |
| `saving_count` | INTEGER | | Count of "Watchlist" watchers. |

### Implementation
- **Script:** `scripts/update-tracked-projects.js`
- **Logic:** The script fetches settings from `trade_configurations` at runtime to decide when to notify.
- **Wired Into:** Nightly Chain (Final Step).

---

## 3. System Logic Flow

How the global scoring and alert logic flows using the configurations:

1. **The "Stamper" (`compute-trade-forecasts.js`):** Joins `trade_configurations` to determine if a project is in the bid window. If it is beyond `bid_phase_cutoff`, it stamps the lead as work.
2. **The "LOS Engine" (`compute-opportunity-scores.js`):** Reads the stamp. `bid` = 2.5x multiplier; `work` = 1.5x multiplier.
3. **The "Assistant" (`update-tracked-projects.js`):** Joins this table for claimed projects. If the `predicted_start` is within the `imminent_window_days`, it sends the "Last Minute" start alert.
4. **The "Slicer" (`compute-cost-estimates.js`):** Uses the `allocation_pct` to divide the total $ value into trade-specific JSONB values.

---

## 4. Behavioral Contract

### Inputs
Nightly run processing `tracked_projects` JOIN `trade_configurations`.

### Core Logic
- **Fetch Config:** Script pulls `imminent_window_days` per trade.
- **Stall Alert:** Triggered if `lifecycle_stalled` is `TRUE` and `last_notified_stalled` is `FALSE`.
- **Imminent Alert:** Triggered if `predicted_start` is within the trade's `imminent_window_days` and `last_notified_urgency !== 'imminent'`.
- **Sync:** Aggregates trackers to `lead_analytics` to update competition penalties in the LOS engine.

### Outputs
Mutates `tracked_projects` (status/memory) and `lead_analytics`.

### Edge Cases
- **Contradictory State:** If a site is stalled, "Imminent" alerts are suppressed even if the date is close.
- **Unmapped Trade:** Defaults to 14-day imminent window if trade is missing from config table.

---

## 5. Testing Mandate

- **Logic:** `tracked-projects.logic.test.ts` — verify stall alerts fire once; verify imminent alerts respect the custom `imminent_window_days` from the database.
- **Infra:** `tracked-projects.infra.test.ts` — assert cross-table sync between `tracked_projects` and `lead_analytics` is atomic.

---

## 6. Operating Boundaries & Seed Data

### Future Updates
Plan to move manual variables into a Retool or Admin Panel UI for non-technical adjustments. Create tables for manual changes to important variables like `imminent_window_days`. Alert driven by the trade configurations.

### Control Panel (migration 092)
The CRM assistant now JOINs `trade_configurations` to get per-trade `imminent_window_days` instead of the hardcoded 14. Operators can set excavation to 7 days (heavy equipment scheduling), elevator to 21 days (long lead time), etc.

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
