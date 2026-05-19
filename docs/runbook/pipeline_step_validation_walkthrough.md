# Pipeline Step Validation Walkthrough

> Companion to **Spec 79** (`docs/specs/01-pipeline/79_pipeline_step_validation.md`).
> Audience: developer/engineer executing the per-step validation framework.

---

## Pre-execution prep (do once at start of run)

```bash
# 1. Confirm working tree clean on main
git status

# 2. Create the validation branch (auto-unblock fixes commit here, not main)
git checkout -b auto-unblock/validation-$(date +%Y-%m-%d)

# 3. Confirm directory scaffold
ls docs/reports/pipeline-validation/
# Expect: permits/  coa/  admin/

# 4. Confirm DB connection (.env should have PG_HOST/PG_PORT/PG_DATABASE)
node -e "console.log(require('dotenv').config())"

# 5. Verify advisory locks aren't held by stuck processes
psql -c "SELECT pid, locktype, classid, objid FROM pg_locks WHERE locktype = 'advisory';"
```

---

## Per-step execution template

### Setup before running the step

```bash
# Capture HEAD commit for the validation record
HEAD_SHA=$(git rev-parse --short HEAD)
echo "Validating at $HEAD_SHA"

# Snapshot pre-run state (substitute <output_table> per step)
psql -c "SELECT COUNT(*) AS pre_count FROM <output_table>;"
psql -c "SELECT id, verdict FROM (SELECT id, records_meta->'audit_table'->>'verdict' AS verdict, started_at FROM pipeline_runs WHERE pipeline = '<chain>:<slug>' ORDER BY started_at DESC LIMIT 1) p;"
```

### Run the step

```bash
START_MS=$(node -e "console.log(Date.now())")
node scripts/<step-file>.js 2>&1 | tee /tmp/step-stdout.log
EXIT=$?
END_MS=$(node -e "console.log(Date.now())")
echo "Exit: $EXIT, Duration: $((END_MS - START_MS))ms"
```

### Capture post-run state

```bash
psql -c "SELECT COUNT(*) AS post_count FROM <output_table>;"

# New pipeline_runs row
NEW_ID=$(psql -tA -c "SELECT id FROM pipeline_runs WHERE pipeline = '<chain>:<slug>' ORDER BY started_at DESC LIMIT 1;")
echo "New run: $NEW_ID"

# Audit table verdict + rows
psql -c "SELECT records_meta->'audit_table'->>'verdict' FROM pipeline_runs WHERE id = $NEW_ID;"
psql -c "SELECT records_meta->'audit_table'->'rows' FROM pipeline_runs WHERE id = $NEW_ID;"

# records_meta minus audit_table
psql -c "SELECT records_meta - 'audit_table' FROM pipeline_runs WHERE id = $NEW_ID;"
```

### Run the 12 checklist queries (C1-C12)

Substitute step-specific values. **N/A items omitted; INVESTIGATE on missing evidence.**

```sql
-- C1 evidence: bash exit code + duration captured above
-- C2 evidence: post-run pipeline_runs row
-- C3 evidence: verdict field — fail if 'WARN', 'FAIL', or 'SKIP'

-- C4 evidence: parse audit_table.rows JSON; cross-ref against spec expected metrics list
-- C5 evidence: source grep
grep -n "rows.some(r => r.status === 'FAIL')" scripts/<step-file>.js
grep -n "auditVerdict\s*=" scripts/<step-file>.js  -- compare to expected cascade pattern

-- C6 evidence (ledger writers only): grep for *_inserted push
grep -nB2 "metric: '.*_inserted'" scripts/<step-file>.js
-- Verify the push is NOT inside `if (count > 0)` — read 2 lines before

-- C7 evidence: records_meta key inventory; cross-ref emitMeta declarations
grep -n "pipeline.emitMeta\|emit_meta\|records_meta:" scripts/<step-file>.js

-- C8 evidence: pre_count + post_count from above; compare to records_new + records_updated
-- Compute: actual_delta = post_count - pre_count
-- audit_claim = records_new + records_updated
-- C8 PASS iff actual_delta == audit_claim (exact)

-- C9 evidence: schema column presence vs script's INSERT/UPDATE column list
psql -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<output_table>' ORDER BY ordinal_position;"
grep -nE "INSERT INTO <output_table>|UPDATE <output_table>" scripts/<step-file>.js

-- C10 evidence: per-step §11 invariants — see "Per-step invariant pages" below
-- C11 evidence: records_total / records_new / records_updated values + spec §11.1 primary entity definition
-- C12 evidence: applicable tripwires from the per-risk-class profile — see "Tripwire SQL" below
```

### Apply the per-step §11 invariants (calculation steps only)

See "Per-step invariant pages" section below. Each step has 4-6 SQL queries that MUST return 0 violation count.

### Write the validation record

Save to `docs/reports/pipeline-validation/<chain>/step_<NN>_<slug>.md`.

```markdown
# Step <NN>: <slug>
**Chain:** permits | coa | both
**Validated:** YYYY-MM-DD
**HEAD commit at validation:** <sha>
**Final status:** PASS | INVESTIGATE | FAIL

## Pre-run state
- last `pipeline_runs.id` for this slug: <id>
- output-table row counts: `<table>`: <count>
- prior audit_table.verdict: PASS|WARN|FAIL|SKIP

## Execution
- Command: `node scripts/<file>.js`
- Exit code: <N>
- Duration: <ms>
- New `pipeline_runs.id`: <id>

## Post-run state
- output-table row counts: `<table>`: <count> (Δ <delta>)
- audit_table.verdict: PASS|WARN|FAIL
- records_meta keys present: [...]

## Checklist evidence

### C1. Script ran to completion
**Evidence:** exit 0, 12,340ms
**Derived:** PASS

### C2. pipeline_runs row created
**Evidence:**
```
id=12345 status=completed completed_at=2026-05-19 14:23:11+00
```
**Derived:** PASS

### C3. audit_table.verdict
**Evidence:** "PASS"
**Derived:** PASS

### C4. audit_table.rows complete
**Evidence (paste rows array):**
```json
[
  {"metric": "permits_dirty", "value": 247013, "status": "INFO"},
  ...
]
```
**Expected metrics (from spec/source):** permits_dirty, permits_updated, ...
**Derived:** PASS — all expected metrics present

### C5. Verdict cascade row-derived
**Evidence (grep):**
```
const auditVerdict = hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS');
```
**Derived:** PASS

### C6. Zero-row preservation (if Tier 3 ledger writer)
**Evidence:** ...
**Derived:** PASS / N/A

### C7. records_meta distributions
**Evidence:** keys present: [phase_distribution, coa_distribution, ...]
**Derived:** PASS

### C8. Output-table delta
**Evidence:**
- pre_count: N
- post_count: N + 232
- actual_delta: 232
- audit_claim (records_new + records_updated): 232
**Derived:** PASS (exact match)

### C9. Schema present for written columns
**Evidence:**
- script writes: phase, stalled, matched_status, matched_rule, unmapped_status
- information_schema: all 5 columns present with expected types
**Derived:** PASS

### C10. Calculation invariants (calc steps only)
**C10a Universal invariants:**
- I1: violation_count = 0 ✓
- I2: violation_count = 0 ✓
- ...
**C10b Conservation re-derivation:**
- audit claim `permit_unmapped_status_count = 1`
- re-derive: `SELECT COUNT(*) FROM permits WHERE unmapped_status = true → 1` ✓
**C10c Distribution baseline:**
- top bucket Δ vs 7-run median: ...% ✓ within ±30%
**Derived:** PASS

### C11. §11 counter semantics
**Evidence:**
- records_total = 247013 (== dirtyPermitsCount, primary entity per §11.1)
- secondary CoA volume in audit_table.rows[coa_evaluated] = 32844 (§11.2 Overflow Rule)
**Derived:** PASS

### C12. Hidden-failure tripwires (per-risk-class profile)
- T1 SAVEPOINT errors: 0 ✓
- T3 IS DISTINCT FROM: actual delta = audit claim ✓
- ...
**Derived:** PASS

## Specialized agent finding
<agent's narrow-scope output — appended after agent runs>

## Final status: PASS | INVESTIGATE | FAIL
<one-paragraph summary if not all PASS>
```

---

## Hidden-failure tripwire SQL (T1-T12)

Apply only the tripwires in the step's risk-class profile (Spec 79 §10).

```sql
-- T1. SAVEPOINT-swallowed ledger errors (Tier 3 writers)
SELECT jsonb_path_query_first(records_meta,
  '$.audit_table.rows[*] ? (@.metric like_regex "_errors$")'
) FROM pipeline_runs WHERE id = <new-id>;
-- Expected: value = 0 on every *_errors counter

-- T2. Zero-row emission preservation (grep, not SQL)
-- For every audit_table push, verify NOT wrapped in `if (count > 0) {...push}`
-- Expected: INFO rows emit unconditionally

-- T3. IS DISTINCT FROM silent skips
-- Compare records_updated to: SELECT COUNT(*) FROM <output_table> WHERE <input_changed_predicate>
-- Expected: equal (no silent skip)

-- T4. NULL = NULL trap
-- For every join key, count NULLs on both sides
SELECT COUNT(*) FILTER (WHERE <join_col> IS NULL) FROM <left>;
SELECT COUNT(*) FILTER (WHERE <join_col> IS NULL) FROM <right>;
-- Expected: NULL-rate matches spec bound; LEFT JOIN/COALESCE handling explicit

-- T5. LEFT JOIN drop
SELECT COUNT(*) FILTER (WHERE right_side.<pk> IS NULL) AS unmatched_drops
FROM <left> LEFT JOIN <right> ON <fk>;
-- Expected: drop rate matches spec orphan rate

-- T6. Stale read/write race
SELECT COUNT(*) FROM <output_table>
WHERE last_seen_at > <classified_at_or_equiv>;
-- Expected: ≈ 0 (catastrophic-halt trigger if > 0)

-- T7. Sentinel misclassification
SELECT
  COUNT(*) FILTER (WHERE phase IS NULL AND status IN (<dead_set>)) AS dead_path,
  COUNT(*) FILTER (WHERE phase IS NULL AND status NOT IN (<dead_set>) AND status IS NOT NULL) AS unclassified_path
FROM <table>;
-- Expected: dead_path matches DEAD_STATUS_SET fires; unclassified_path = rule-15 catchall count

-- T8. Off-by-one time-bucket
SELECT permit_num, daysSinceIssued, phase
FROM permits WHERE daysSinceIssued IN (<p7aMax>, <p7bMax>);
-- Expected: row at exactly p7aMax lands in P7a (per <= comparator)

-- T9. Distribution drift vs baseline
WITH last_7 AS (
  SELECT records_meta->'<distribution_key>' AS dist
  FROM pipeline_runs WHERE pipeline = '<chain>:<slug>' AND status = 'completed'
  ORDER BY started_at DESC LIMIT 7 OFFSET 1
)
SELECT key, current_value, median(prior_values),
       abs(current_value - median(prior_values)) / NULLIF(median(prior_values), 0) AS drift_pct
FROM <unpacked_distribution_join>;
-- Expected: every bucket drift_pct < 0.30; new buckets flagged INVESTIGATE

-- T10. Calibration cohort thinning
SELECT cohort_key, bucket_count, fallback_method
FROM phase_stay_calibration WHERE last_updated > <RUN_AT - 1 hour>;
-- Expected: every cohort meets bucket_threshold OR fallback_method NOT NULL

-- T11. Catchall firing rate
SELECT COUNT(*) FILTER (WHERE matched_rule = <catchall_rule_n>) * 100.0 / COUNT(*)
FROM <table>;
-- Expected: ≤ 0.1% (Spec 84 §2.5.a baseline)

-- T12. STDERR pipeline.log.warn lines
grep "pipeline.log.warn\|\\[.*\\] WARN" /tmp/step-stdout.log
-- Expected: 0 lines
```

---

## Per-step §11 invariant pages (calculation steps)

### §11.1 close_stale_permits
```sql
-- I1. No closed_at in the future
SELECT COUNT(*) FILTER (WHERE closed_at > NOW()) FROM permits; -- expect 0
-- I2. No permit closed while actively classified
SELECT COUNT(*) FILTER (WHERE closed_at IS NOT NULL
  AND lifecycle_phase NOT IN ('P19','P20') AND lifecycle_phase IS NOT NULL) FROM permits; -- expect 0
-- I3. closed_at >= last_seen_at
SELECT COUNT(*) FROM permits WHERE closed_at IS NOT NULL AND closed_at < last_seen_at; -- expect 0
```

### §11.2 compute_cost_estimates
```sql
SELECT COUNT(*) FILTER (WHERE estimated_cost < 0) FROM cost_estimates; -- expect 0
SELECT COUNT(*) FILTER (WHERE cost_source NOT IN ('geometric','lookup','fallback','none')) FROM cost_estimates; -- expect 0
SELECT COUNT(*) FROM cost_estimates WHERE cost_source='geometric' AND modeled_gfa_sqm IS NULL; -- expect 0
SELECT COUNT(*) FILTER (WHERE tier IS NOT NULL AND tier NOT IN ('residential','commercial','mixed','industrial')) FROM cost_estimates; -- expect 0
SELECT (COUNT(*) FILTER (WHERE estimated_cost IS NULL))::float / COUNT(*) FROM cost_estimates; -- expect < 0.05
```

### §11.3 compute_timing_calibration_v2
```sql
SELECT COUNT(*) FILTER (WHERE gap_days < 0) FROM timing_calibration; -- expect 0
SELECT COUNT(*) FILTER (WHERE gap_days > 730) FROM timing_calibration; -- expect spec bound
SELECT cohort_key, bucket_count FROM timing_calibration
WHERE bucket_count < (SELECT value::int FROM logic_variables WHERE variable_key = 'timing_calibration_min_bucket')
  AND fallback_flag IS NOT TRUE; -- expect 0 rows
```

### §11.4 classify_lifecycle_phase
```sql
SELECT COUNT(*) FILTER (WHERE matched_rule NOT BETWEEN 0 AND 15) FROM permits; -- expect 0
SELECT COUNT(*) FILTER (WHERE matched_rule NOT BETWEEN 0 AND 9) FROM coa_applications; -- expect 0
SELECT COUNT(*) FROM permits WHERE matched_status IS NULL AND matched_rule NOT IN (0,1); -- expect 0
SELECT COUNT(*) FILTER (WHERE lifecycle_phase IS NULL AND status IS NOT NULL AND matched_rule NOT IN (1,2,15)) FROM permits; -- expect 0
SELECT COUNT(*) FROM permits WHERE unmapped_status = true AND matched_rule != 15; -- expect 0
SELECT (COUNT(*) FILTER (WHERE matched_rule=15))::float / COUNT(*) FROM permits; -- expect < 0.001
SELECT (COUNT(*) FILTER (WHERE matched_rule=9))::float / COUNT(*) FROM coa_applications; -- expect < 0.001
```

### §11.5 assert_lifecycle_phase_distribution
```sql
SELECT phase FROM (SELECT DISTINCT lifecycle_phase AS phase FROM permits WHERE lifecycle_phase IS NOT NULL) p
WHERE NOT EXISTS (SELECT 1 FROM logic_variables WHERE variable_key = 'lifecycle_band_'||p.phase||'_min'); -- expect 0
-- conservation: seq_bands_failing + warn + passing + null_catalog = total
```

### §11.6 compute_phase_calibration
```sql
SELECT COUNT(*) FILTER (WHERE median_days <= 0) FROM phase_stay_calibration; -- expect 0
SELECT COUNT(*) FROM phase_stay_calibration WHERE bucket_count <
  (SELECT value::int FROM logic_variables WHERE variable_key = 'calibration_min_bucket')
  AND fallback_method IS NULL; -- expect 0
SELECT COUNT(*) FROM phase_stay_calibration WHERE coa_type_class IS NOT NULL AND permit_type IS NOT NULL; -- expect 0
SELECT COUNT(*) FROM phase_stay_calibration WHERE from_seq >= to_seq; -- expect 0
```

### §11.7 compute_trade_forecasts
```sql
SELECT COUNT(*) FILTER (WHERE predicted_start_date <= anchor_date) FROM trade_forecasts; -- expect 0
SELECT COUNT(*) FROM trade_forecasts WHERE lead_id !~ '^(permit|coa):.+$'; -- expect 0
SELECT (COUNT(*) FILTER (WHERE predicted_start_date IS NULL))::float / COUNT(*) FROM trade_forecasts; -- expect < 0.10
SELECT COUNT(*) FROM trade_forecasts WHERE anchor_source IS NULL AND predicted_start_date IS NOT NULL; -- expect 0
```

### §11.8 compute_opportunity_scores
```sql
SELECT COUNT(*) FILTER (WHERE opportunity_score < 0 OR opportunity_score > 1) FROM trade_forecasts; -- expect 0
SELECT COUNT(*) FROM trade_forecasts WHERE opportunity_score IS NULL AND predicted_start_date IS NOT NULL; -- expect 0
SELECT COUNT(*) FILTER (WHERE opportunity_score = 0 AND trade_slug != 'realtor'
  AND lifecycle_phase NOT IN ('P3','P4','P5','P6','P1','P2','P19','P20')) FROM trade_forecasts; -- expect 0
```

### §11.9 update_tracked_projects
```sql
SELECT COUNT(*) FROM tracked_projects WHERE lead_id !~ '^(permit|coa):.+$'; -- expect 0
SELECT COUNT(*) FROM tracked_projects WHERE archived_at IS NOT NULL AND archived_reason IS NULL; -- expect 0
SELECT COUNT(*) FROM notifications n
JOIN coa_applications c ON c.application_number = SUBSTRING(n.permit_num FROM 5)
WHERE n.type='COA_STALLED' AND c.lifecycle_phase NOT IN ('P1','P2'); -- expect 0
```

### §11.10 compute_coa_cost_estimates
```sql
SELECT COUNT(*) FROM coa_applications WHERE estimated_cost IS NOT NULL AND cost_source != 'geometric'; -- expect 0
SELECT COUNT(*) FROM coa_applications WHERE cost_source='geometric' AND modeled_gfa_sqm IS NULL; -- expect 0
SELECT COUNT(*) FILTER (WHERE estimated_cost < 0) FROM coa_applications; -- expect 0
SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%'; -- expect 0
```

---

## Specialized-agent briefing template

Every agent invocation includes this scaffold (Claude assembles automatically):

```markdown
## Agent role
You are the <Calculations | Observability | Multi-domain | Compliance | Integration | Adversarial> agent for pipeline step validation.

## Project context
Buildo is a Toronto building-permit + Committee-of-Adjustment (CoA) data pipeline that
produces actionable construction leads for trades. Daily runs ingest from city open data,
classify into a Universal Stream (110-position lifecycle), compute cost estimates, forecast
trade timing, score opportunity, produce CRM-ready leads. Lead identity is `lead_id` in
canonical form `(permit|coa):<key>`.

## Recent changes (phase-by-phase)
Phase A (2026-05-13, commit a56212b) — spec amendments + system map regen.
Phase B (2026-05-13, commits 4b63793, 96d0bf9, 06ddb8b) — schema migrations + Universal Stream seeds.
Phase C (2026-05-13, commits fdf505d, 27b3c3f, 872ec73) — lead_id backfill + trigger-based dual-write.
Phase D (2026-05-13 → 2026-05-14, commits cea6d47..9d32ba3) — CoA classification scripts.
Phase E (2026-05-14 → 2026-05-16, commits 7003683..0d90571) — lifecycle engine migration.
Phase F (2026-05-16 → 2026-05-17, commits 4d58444..9fec4df) — trade forecasts UNION + opportunity scores + Lead Inspector CoA panel.
Phase G (2026-05-17, commits 3944f88..0de4cab) — PRE-permit retirement.
Phase I.1 (2026-05-18, commit d579bc0) — lifecycle_status_history Tier 3 ledger writers.
Phase I.1.1a (2026-05-18, commit 2d5dd43) — semantic verification + spec amendments + first-deploy spike runbook.
Phase I.1.1b (2026-05-18, commit 73b257b) — classifyLifecyclePhase matchedStatus extension per Spec 84 §3.7 18-rule precedence.

## Step under review
- Step: <NN>. <slug>
- Chain: <permits | coa | both>
- Script: scripts/<file>.js
- Step objective (verbatim from spec): <one sentence>
- Was this step touched by recent phases (C-I.1.1b)? <yes/no + which phase>

## Your scope (narrow — only check these dimensions)
<per-agent scope per Spec 79 §3a>

## Relevant spec sections
- <Spec NN §X.Y — one-line relevance>

## Evidence from this step's validation record
<paste relevant evidence blocks — actual SQL outputs, audit_table.rows JSON, source greps>

## What to produce
For every finding: severity (CRIT/HIGH/MED/LOW); category; suspected_root_cause (one sentence,
AI-suggested with confidence low/med/high); proposed_action_type (fix-now / WF3 / WF1);
effort (XS/S/M/L); pattern_id (if cross-step).

Be skeptical that PASS items are proven by their evidence (not asserted). Flag any
checklist item where the evidence is hand-waving rather than concrete query output.
```

---

## SUMMARY.md format (chain-end synthesis)

```markdown
# Pipeline Step Validation — Summary Report
**Run dates:** YYYY-MM-DD → YYYY-MM-DD
**HEAD commit at run:** <sha>
**Unblock branch:** auto-unblock/validation-<date>
**Per-step records:** docs/reports/pipeline-validation/{permits,coa}/step_*.md
**Steps validated:** 29 permits + 6 unique CoA = 35 records
**Steps with findings:** N
**Total findings:** N (CRIT: x, HIGH: y, MED: z, LOW: w)

---

## Unblock Interventions
<list of auto-unblock commits on the unblock branch; user reviews + cherry-picks to main>

---

## Pass 1 — Findings dataset (mechanical extraction)
<18-column markdown table>

---

## Pass 2 — Cross-step patterns (adversarial review — AI-SUGGESTED)
<patterns with `ai_confidence` per cluster>

---

## Pass 2.5 — User-confirmed columns
<user adjustments to AI suggestions>

---

## Pass 3 — Execution plan (small-batch bias)
<batches per Spec 79 §3b>

### Anti-monster check
- Total proposed: N small units of work, max M files per unit
- ✓ No single proposal touches >6 files
- ✓ No single proposal estimated >300 lines

---

## Chain-end §6 cap results
- §6.1 Spec 49 — permits: [link]
- §6.1 Spec 49 — CoA: [link]
- §6.2 observe-chain narrative — permits: [link]
- §6.2 observe-chain narrative — CoA: [link]
- §6.3 Admin UI — 7 surfaces: see docs/reports/pipeline-validation/admin/

---

## User-decision authorization gates
- [ ] Authorize B-docs commit
- [ ] Authorize B-fix-now-1 commit
- [ ] Authorize WF3 #1
- ...
```
