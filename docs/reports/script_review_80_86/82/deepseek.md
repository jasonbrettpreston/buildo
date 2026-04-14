◇ injected env (18) from .env // tip: ⌘ suppress logs { quiet: true }
🔍 Adversarial review of scripts/update-tracked-projects.js

**[CRITICAL]** (line 72-75): The `isWindowClosed` logic has a critical flaw in ordinal comparison. If `currentOrdinal` or `targetOrdinal` is `null` (phase not in PHASE_ORDINAL), the condition `currentOrdinal != null && targetOrdinal != null && currentOrdinal >= targetOrdinal` short-circuits to false, but `TERMINAL_PHASES.has(row.lifecycle_phase)` might also be false for unknown non-terminal phases. A permit could be in phase "UNKNOWN" (not in PHASE_ORDINAL, not P19/P20) and never be archived even if it's clearly beyond work_phase_target. This violates the spec's window-closure detection. **Fix**: Either ensure PHASE_ORDINAL contains all possible phases, or add explicit handling for unknown phases (e.g., treat as window closed if not in PHASE_ORDINAL and not in an early phase list).

**[HIGH]** (line 47-60): No validation that `tradeConfigs` contains all trades present in `rows`. If a trade_slug exists in tracked_projects but not in trade_configurations, the row is skipped entirely (`if (!targets) continue`). This silently drops alerts/archiving for that project. The default `imminent_window_days` from COALESCE in SQL won't help because the row is skipped before reaching alert logic. **Fix**: Either load a default configuration for missing trades, or log a warning and apply safe defaults (e.g., use TRADE_TARGET_PHASE_FALLBACK).

**[HIGH]** (line 85-86): Auto-archiving saved projects when `urgency === 'expired'` relies on `row.urgency` from LEFT JOIN trade_forecasts. If no forecast exists (tf row missing), `row.urgency` is NULL, not 'expired', so expired saved projects won't archive. This creates data rot. **Fix**: Explicitly check for NULL? Or ensure upstream forecast generation always produces a row for every tracked project.

**[HIGH]** (line 103): The recovery alert triggers when `row.lifecycle_stalled === false && row.last_notified_stalled === true`. However, if a site stalls, sends alert, then unstalls (recovery alert), then re-stalls, `last_notified_stalled` is already `true` from the first stall, so the second stall won't alert. The memory column tracks "was notified about stall", not "was notified about *current* stall". **Fix**: Reset `last_notified_stalled` to NULL or a timestamp when stall clears, or track stall state ID.

**[MEDIUM]** (line 119-123): Imminent alert suppression when `lifecycle_stalled === true` is correct, but what about when `lifecycle_stalled` is NULL? The condition `row.lifecycle_stalled !== true` passes for NULL, potentially sending imminent alerts for sites with unknown stall status. **Fix**: Explicitly handle NULL as "maybe stalled" and suppress, or treat NULL as false only if business logic allows.

**[MEDIUM]** (line 153-176): The batched UPDATE uses parameterized queries but builds SET clauses dynamically. This is safe from SQL injection but creates N database roundtrips (one per merged update). At scale (thousands of updates), this is inefficient. **Fix**: Use a single UPDATE with a VALUES list or CASE statements, or batch into chunks.

**[MEDIUM]** (line 183-218): The analytics sync UPSERT and zero-out are in a transaction, good. However, the zero-out query uses a correlated subquery that may be expensive on large tables. The condition `AND (la.tracking_count > 0 OR la.saving_count > 0)` prevents unnecessary writes, but the subquery still runs for every lead_analytics row. **Fix**: Consider using a CTE or materialized subquery to optimize.

**[MEDIUM]** (line 72): Reliance on `PHASE_ORDINAL` from `./lib/lifecycle-phase`. If that module changes (adds/removes phases), the comparison logic here may break. No versioning or checksum validation. **Fix**: Add a unit test that validates PHASE_ORDINAL against a known snapshot, or import a hash/version.

**[LOW]** (line 31-36): `TRADE_TARGET_PHASE` is built by mapping `tradeConfigs`. If `tradeConfigs` is empty (e.g., config loader fails), `TRADE_TARGET_PHASE` is an empty object, causing all rows to be skipped (`if (!targets) continue`). No fallback to `TRADE_TARGET_PHASE_FALLBACK`. **Fix**: Merge fallback into the mapping, or use fallback if targets missing.

**[LOW]** (line 85): The condition `row.urgency === 'expired'` is case-sensitive. What if upstream classifies as 'Expired'? **Fix**: Use case-insensitive comparison or enforce lowercase in upstream classification.

**[LOW]** (line 130-133): Stall alert message uses `row.predicted_start` which may be NULL, defaulting to 'TBD'. However, if predicted_start is NULL, the urgency classification likely wouldn't be 'imminent', but stall alerts could still fire. This is okay but could confuse users ("target date has been pushed back to TBD"). **Fix**: If predicted_start is NULL, phrase differently: "target date is now uncertain."

**[NIT]** (line 47): `const { tradeConfigs } = await loadMarketplaceConfigs(pool, 'tracked-projects')` — the second argument 'tracked-projects' is not documented in config-loader. What does it do? Might be a magic string. **Fix**: Add JSDoc or constant.

**[NIT]** (line 72): `currentOrdinal != null` uses loose inequality (`!=`), which also catches `undefined`. This is fine but inconsistent with `targetOrdinal != null`. Consider `currentOrdinal !== null && currentOrdinal !== undefined` for clarity.

**Overall verdict**: This script has critical logic gaps in phase comparison and missing trade handling that could lead to silent data loss (projects never archived) and missed alerts. The stall/recovery alert memory logic is flawed and will suppress repeated stall alerts. The code is well-structured and uses transactions correctly, but the business logic has several edge cases that violate the spec's intent. Immediate fixes required for the CRITICAL and HIGH issues before deployment.

---
⏱  125226ms (125.2s)
📊 Tokens — total: 10974, input: 7041, output: 3933, reasoning: 2548
