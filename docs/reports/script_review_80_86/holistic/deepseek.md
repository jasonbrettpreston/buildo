◇ injected env (18) from .env // tip: ⌘ suppress logs { quiet: true }
🔍 Adversarial review of docs/reports/script_review_80_86/_ctx/holistic_bundle.md

- **[CRITICAL]** (line N/A in `compute-timing-calibration-v2.js`): Missing advisory lock. Concurrent runs will race on UPSERTs, corrupting `phase_calibration` table with non-deterministic median values; consumer flight tracker then produces inconsistent predictions. Fix: Add `pg_try_advisory_lock(86)` on a dedicated client held for the run duration, matching sibling script pattern.

- **[CRITICAL]** (line N/A in `update-tracked-projects.js`): Missing advisory lock. Two instances (e.g., manual re-run during nightly) will double-fire alerts, corrupt memory columns (`last_notified_*`), and race on analytics UPSERT. Fix: Add `pg_try_advisory_lock(82)` and exit cleanly if held.

- **[CRITICAL]** (line ~71 in `compute-trade-forecasts.js`): `expiredThreshold` can be `undefined` if config missing. `-Math.abs(undefined)` → `NaN`, making `daysUntil <= NaN` always false, so no permit ever classifies as 'expired' — graveyard logic broken. Fix: Fallback to default 90 days in config-loader or code: `const threshold = -Math.abs(expiredThreshold ?? 90)`.

- **[CRITICAL]** (line ~271–273 in `compute-trade-forecasts.js`): `stall_penalty_precon`/`active` can be `undefined`. Adding `undefined` to `Date` results in `Invalid Date`, crashing at `predictedStart.toISOString()`. Fix: Validate in config-loader (`Number.isFinite`) or apply `Math.abs()` in script; default to 45/14 days.

- **[HIGH]** (line ~299 in `run-chain.js`): No child process timeout. If a pipeline script hangs (e.g., deadlock, infinite loop), the orchestrator blocks forever, stalling the entire chain and requiring manual kill. Fix: Add `timeout` option to spawn (e.g., 30 minutes) and `child.kill('SIGTERM')` on exceed.

- **[HIGH]** (line ~25–55 in `run-chain.js`): No SIGTERM/SIGINT handler. Killing the orchestrator leaves child processes orphaned, continuing to consume DB connections and compute. Fix: Attach `process.on('SIGTERM', ...)` to forward signal to active child and set chain status to `cancelled`.

- **[HIGH]** (line ~73–75 in `compute-opportunity-scores.js`): `parseFloat(row.multiplier_bid)` on non-numeric string (e.g., `'2.8x'`) returns `NaN`, causing `::int` cast to throw and batch UPDATE to fail — earlier batches already committed, leaving partial updates. Fix: Use `Number.isFinite` guard; fallback to `vars.los_multiplier_*`.

- **[MEDIUM]** (line ~146–147 in `classify-lifecycle-phase.js`): `COA_STALL_THRESHOLD_DAYS` can be `undefined` if config missing. `classifyCoaPhase` may treat `undefined` as falsy, incorrectly marking stalled CoAs as active. Fix: Default to 30 days in config-loader or inline: `logicVars.coa_stall_threshold ?? 30`.

- **[MEDIUM]** (line ~76–89 in `compute-timing-calibration-v2.js`): Hardcoded `PHASE_ORDINAL_SQL` duplicates lib's `PHASE_ORDINAL`. Drift causes forward-transition filter to incorrectly reject valid pairs, skewing calibration. Fix: Import `PHASE_ORDINAL` from `lifecycle-phase.js` and generate SQL dynamically.

- **[MEDIUM]** (line ~29 in `compute-trade-forecasts.js`): `SKIP_PHASES` includes phantom `O4` — unreachable phase that adds noise and misleads future maintainers. Fix: Remove `'O4'` from the set.

- **[LOW]** (line ~121–122 in `run-chain.js`): Pre-flight bloat thresholds (30%/50%) hardcoded, violating spec 86 Control Panel pattern. Operators cannot tune for scale. Fix: Promote to `logic_variables.bloat_warn_threshold`/`bloat_abort_threshold`.

- **[LOW]** (line ~142–146 in `run-chain.js`): `sys_db_bloat_${table}` metric names unsanitized. Table names with dots or dashes produce invalid metric keys, breaking dashboard parsing. Fix: Replace non-alphanumeric with underscores: `table.replace(/[^a-zA-Z0-9]/g, '_')`.

**Overall verdict**: The bundled scripts contain multiple critical concurrency and configuration-safety gaps beyond those cataloged in the triage. Most severe are missing advisory locks in two scripts (`compute-timing-calibration-v2.js`, `update-tracked-projects.js`) that allow concurrent corruption, and undefined config values that silently break core classification and date math. The orchestrator also lacks timeout and signal handling, risking production hangs. These issues must be fixed before any script is safe for production deployment.

---
⏱  260849ms (260.8s)
📊 Tokens — total: 66677, input: 59712, output: 6965, reasoning: 5853
