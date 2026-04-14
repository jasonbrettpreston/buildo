◇ injected env (18) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
🔍 Adversarial review of scripts/update-tracked-projects.js

Here is my adversarial code review.

---

-   **[CRITICAL]** (line 50): Unbounded `SELECT` query will cause catastrophic out-of-memory errors at scale. The query fetches all active tracked projects into memory before processing begins. As the `tracked_projects` table grows, this will inevitably exceed the Node.js heap limit and crash the process. This is a direct violation of engineering standard §3.2.
    **Problem:** The entire dataset is loaded into memory, which is not scalable.
    **Fix:** Refactor the query to use a streaming approach. Replace `pool.query` with `pipeline.streamQuery` and process each row individually within the stream's event handlers. This will keep memory consumption constant regardless of the table size.

-   **[CRITICAL]** (line 249): The database update logic uses an N+1 query pattern inside a loop. The script iterates through `mergedUpdates` and issues a separate `UPDATE` statement for each project. With thousands of updates, this will generate thousands of individual network round-trips to the database, causing extreme performance degradation and potentially overwhelming the database with small, frequent writes.
    **Problem:** Inefficient, non-scalable database updates that will not perform under load.
    **Fix:** Perform a single bulk update. Either use a temporary table to store the updates and `JOIN` against it in a single `UPDATE` statement, or construct a single `UPDATE` query using a `CASE` statement. Example: `UPDATE tracked_projects SET status = CASE id WHEN $1 THEN $2 ... END, ... WHERE id IN ($n, ...)`

-   **[HIGH]** (line 191): The state-change detection logic for imminent alerts is flawed and will miss alerts. The code checks `row.last_notified_urgency !== 'imminent'` and then sets it to `'imminent'`. However, it never resets this value if the project's urgency later changes *away* from `imminent` (e.g., to `high` or `medium`). If the project's start date is pushed out and then later becomes imminent again, no new alert will be sent because the `last_notified_urgency` flag is permanently stuck on `'imminent'`.
    **Problem:** Users will miss critical, time-sensitive alerts for projects that fluctuate in urgency.
    **Fix:** Store the actual urgency value in `last_notified_urgency`. The condition should then check for a state change *to* `'imminent'`: `row.urgency === 'imminent' && row.last_notified_urgency !== 'imminent'`. When updating, set the field to the current `row.urgency`, not a hardcoded string: `updates.push({ id: row.tracking_id, last_notified_urgency: row.urgency });`. This correctly tracks the last notified state, whatever it was, and allows re-triggering if the state changes away and then back.

-   **[MEDIUM]** (line 109): The script silently skips tracked projects for trades that are not configured in `trade_configurations`. The spec implies that unmapped trades should be handled with defaults, but the `if (!targets) continue;` line causes them to be ignored entirely. This leads to a silent gap in monitoring where users' tracked projects are not processed for archiving or alerts if a new trade slug is introduced without a corresponding config entry.
    **Problem:** Data is silently ignored, violating the user's expectation that their tracked projects are being monitored.
    **Fix:** Instead of skipping, use the `TRADE_TARGET_PHASE_FALLBACK` imported on line 25. If `targets` is falsy, assign a default object to it using the fallback values. This ensures all tracked projects are processed, even for unconfigured trades. Log a warning when a fallback is used to alert operators to the missing configuration.

-   **[MEDIUM]** (line 297): The construction of `lead_key` using `LPAD(tp.revision_num::text, 2, '0')` is brittle. It assumes `revision_num` will never exceed 99. If a permit revision number reaches 100, the `LPAD` will not truncate it, resulting in a key like `'permit:123:100'` which will not match a key generated for revision 99 (`'permit:123:99'`). This will cause data integrity issues in `lead_analytics` where counts for the same permit are split across differently formatted keys.
    **Problem:** A hardcoded padding assumption creates a future data corruption vector.
    **Fix:** Do not pad the revision number. Store it as a plain integer string in the `lead_key` (e.g., `'permit:num:rev'`). This is more robust and has no arbitrary limits. The `lead_key` format specification in the documentation should be updated to reflect this.

-   **[LOW]** (line 116): The script silently ignores projects where `lifecycle_phase` is not in `PHASE_ORDINAL` or a trade's `work_phase_target` is not in `PHASE_ORDINAL`. The `currentOrdinal != null && targetOrdinal != null` check correctly prevents runtime errors, but it masks underlying data or configuration problems. These projects will never be auto-archived based on phase progression, potentially accumulating indefinitely.
    **Problem:** Silent failures hide configuration or data integrity issues.
    **Fix:** Add `else` blocks to the null checks. If `currentOrdinal` or `targetOrdinal` is null, log a warning with the `tracking_id`, `trade_slug`, and the invalid phase string (`row.lifecycle_phase` or `targets.work_phase`). This makes configuration gaps visible to operators.

-   **[LOW]** (line 344): The full `alerts` array is embedded in the `PIPELINE_SUMMARY` telemetry event. If a run generates thousands of alerts (e.g., after a major data backfill or logic change), this will create an enormous JSON log entry. This can overwhelm logging infrastructure, make logs difficult to parse, and incur unnecessary costs.
    **Problem:** Potentially unbounded log data creates an operational risk.
    **Fix:** Do not include the raw `alerts` array in the summary. The summary should contain aggregates and counts only (`total_alerts`). If examples are needed for debugging, include a small, fixed-size sample, e.g., `alerts.slice(0, 5)`.

-   **[NIT]** (line 129): The check `if (!CLAIMED_STATUSES.has(row.tracking_status)) continue;` is redundant. The main SQL query on line 70 already filters `tp.status` to include only `saved` and the statuses in `CLAIMED_STATUSES`. Since the preceding block handles `saved` and then `continue`s, this check is guaranteed to be true for any row that reaches it.
    **Problem:** Unnecessary code that adds minor clutter.
    **Fix:** Remove the check on line 129.

### Overall Verdict
The script is logically complex and demonstrates a good understanding of the business requirements, particularly with its state-change detection and transactional updates. However, it suffers from two critical, show-stopping scalability flaws—loading the entire dataset into memory and using an N+1 update pattern—that render it unfit for a production environment of any significant size. Furthermore, a high-severity logic bug in the imminent alert mechanism will cause it to fail its primary function of reliably notifying users. While the use of transactions and idempotent logic is commendable, the foundational performance issues and the critical alerting bug must be addressed before this code can be considered stable or scalable.

---
⏱  58165ms
📊 Tokens: 13753 (input: 7668, output: 1686)
