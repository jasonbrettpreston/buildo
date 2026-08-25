# Migration UP/DOWN Self-Rollback Audit — 2026-05-01

**Workflow:** WF5 (Audit, code subsection)
**Trigger:** Followup #3 from `feat(13_authentication): wire Firebase Admin SDK init at backend boot` (commit `403adcc`); root finding from `fix(00_engineering_standards): comment out DOWN sections in migrations 113/115/116` (commit `68643b3`).
**Scope:** All 113 files under `migrations/*.sql` as of HEAD `d64a861`.

## Bug class summary

`scripts/migrate.js` runs each `.sql` file as a single transaction and treats `-- DOWN` as a SQL comment, not a section directive. A migration that contains uncommented DDL statements under `-- DOWN` will execute the rollback statements immediately after the UP statements within the same transaction — silently undoing the migration's effects while still recording the file as applied in `schema_migrations`. The bug was first surfaced in 113/115/116 (fixed in `68643b3`); migration 114 happened to have its DOWN section fully commented out and was unaffected.

This audit static-analyses all migration files for the same pattern.

## Methodology

```bash
for f in migrations/*.sql; do
  awk '
    BEGIN { in_down = 0 }
    /^-- DOWN|^-- =+ DOWN/ { in_down = 1; next }
    in_down && /^(DROP|ALTER|DELETE|TRUNCATE|CREATE|INSERT|UPDATE|GRANT|REVOKE|COMMENT|REINDEX|REFRESH|RENAME)/ { print FILENAME ":" NR ": " $0; exit }
  ' "$f"
done
```

Then for each candidate, schema-check the migration's intended effect against the live DB to classify severity:
- **CRITICAL** — effect is MISSING from current schema (a fresh checkout running from zero would not have it)
- **HIGH** — effect is PRESENT in current schema (re-applied by a later migration, or hand-restored; bug is in file only)
- **MEDIUM** — intent obsolete (no consequence either way)

## Findings

15 migrations flagged. **All 15 are HIGH** — the DB state happens to be correct (effects either re-applied by later work or never lost in their original run before DOWN-section was retroactively added per checksum drift), but the file content remains buggy and a fresh checkout running migrations from zero would land in a broken schema.

| # | File | DOWN content (the offending statements) | DB state | Severity |
|---|---|---|---|---|
| 1 | `041_records_meta.sql` | `ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS records_meta;` | `pipeline_runs.records_meta` PRESENT | HIGH |
| 2 | `042_entities.sql` | `DROP TABLE IF EXISTS entity_projects;` (and likely more — first match exit) | `entity_projects` PRESENT | HIGH |
| 3 | `044_wsib_entity_link.sql` | `DROP INDEX IF EXISTS idx_wsib_linked_entity;` | index PRESENT | HIGH |
| 4 | `045_permit_inspections.sql` | `DROP INDEX IF EXISTS idx_permit_inspections_outstanding;` | index PRESENT | HIGH |
| 5 | `046_performance_indexes.sql` | `DROP INDEX IF EXISTS idx_coa_hearing_date;` (and more) | index PRESENT | HIGH |
| 6 | `051_engine_health_snapshots.sql` | `DROP TABLE IF EXISTS engine_health_snapshots;` | `engine_health_snapshots` PRESENT | HIGH |
| 7 | `059_enriched_status.sql` | `DROP INDEX IF EXISTS idx_permits_enriched_active;` | index PRESENT | HIGH |
| 8 | `060_scraper_queue.sql` | `DROP TABLE IF EXISTS scraper_queue;` | `scraper_queue` PRESENT | HIGH |
| 9 | `100_updated_at_triggers.sql` | `DROP TRIGGER IF EXISTS set_updated_at ON trade_mapping_rules;` (and more) | function PRESENT (recreated this session via WF2 commit `68643b3`) — **see note below** | HIGH |
| 10 | `101_logic_variables_coverage_thresholds.sql` | `DELETE FROM logic_variables ...` | rows PRESENT | HIGH |
| 11 | `102_los_decay_divisor.sql` | `DELETE FROM logic_variables WHERE variable_key = 'los_decay_divisor';` | row PRESENT | HIGH |
| 12 | `103_snowplow_buffer_days.sql` | `DELETE FROM logic_variables WHERE variable_key = 'snowplow_buffer_days';` | row PRESENT | HIGH |
| 13 | `108_notification_prefs.sql` | `ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;` | column PRESENT | HIGH |
| 14 | `111_notification_prefs_repair.sql` | `ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;` | column PRESENT | HIGH |
| 15 | `112_notification_prefs_repair_2.sql` | `ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;` | column PRESENT | HIGH |

### Special case — Migration 100

Earlier in this session (during the WF2 that produced `68643b3`), we discovered `trigger_set_timestamp()` was missing from the DB despite migration 100 being recorded as applied. Most-likely cause was a `pg_dump`/`pg_restore` cycle that didn't preserve the function. **It is also entirely consistent with this WF5 bug class** — the function is created in UP, then the DOWN section drops triggers (the function definition itself isn't in the DOWN block, but the triggers depend on it semantically). This audit cannot prove which root cause produced the missing-function state we observed; either is plausible.

The function was recreated inline during `68643b3`. The trigger on `permits` was created in `115_permits_updated_at.sql` (now fixed). Whether the triggers on the original migration-100 tables (`trade_mapping_rules`, `user_profiles`, `pipeline_schedules`, `tracked_projects`, `lead_analytics`, `logic_variables`, `trade_configurations`, `trade_sqft_rates`, `scope_intensity_matrix`) currently exist is **out of scope for this audit** but worth a separate verification when a developer next touches those tables.

## Why all 15 are HIGH (not CRITICAL)

Two contributing histories:

1. **Some files (041, 042, 044, 045, 046, 059) appear in the migration runner's checksum-drift WARN list** (see commit `68643b3` discussion). Their files were edited AFTER they were applied. The applied content may not have included the DOWN block; the DOWN was added retroactively. The original effects landed.
2. **Other files (051, 060, 100, 101–103, 108, 111, 112) ran with the buggy DOWN in place from day one**, but their effects are still in the DB — implying the bug's net effect was either (a) a no-op because the UP didn't fully commit before DOWN ran, then a separate hand-application, or (b) the effect was re-applied by a later repair migration (notably 111/112 are explicitly named "notification_prefs_repair").

In neither case does this WF5 attempt to reconstruct the exact history. The actionable finding is: **the file content is buggy regardless of how the DB ended up correct.** A fresh `pg_restore` from a pre-100 dump (the same scenario we hit earlier this session) followed by `npm run migrate` would land in a broken state.

## Pattern Routing — Spec 05 §4 escalation

Per `docs/specs/00-architecture/05_knowledge_operating_model.md` §4 (and §6 cadence rules), a recurring failure class with 3+ instances must route to a **stronger destination** than `tasks/lessons.md`. With **15 findings**, this is far past the threshold.

**Destination upgrade (proposed for the follow-up WF2):** a pre-commit script `scripts/hooks/check-migration-down-comments.sh` that runs the same awk discovery used for this audit, and rejects any commit that adds a `migrations/*.sql` file with uncommented DDL under `-- DOWN`. Hooks the same Husky `pre-commit` that already runs `validate-commit-msg.sh` and `check-lesson-routing.sh` (commit `df96861`).

That pre-commit hook converts the advisory `tasks/lessons.md` rule ("ALWAYS comment out every line of the DOWN section") into hard enforcement — bug class can never recur in committed code.

## Recommended remediation

Two follow-up workflows:

1. **WF3 (or batch WF3) — fix the 15 buggy migration files.**
   Mechanical: comment out every line of each `-- DOWN` section, matching the convention used in 114 and 113/115/116 (post-`68643b3`). One commit, all 15 files. Test verification: `npm run test` unaffected (migrations don't run in tests). DB unchanged. The fix is purely defensive — protects future fresh checkouts.

2. **WF2 — add the pre-commit lint rule.**
   ~30 lines in `scripts/hooks/check-migration-down-comments.sh`, chained into `.husky/pre-commit` (or `.husky/commit-msg` — whichever runs first). Single test (a fixture migration with bad DOWN, verify hook rejects). Per Spec 05 §4 destination ranking, this upgrades the lesson from advisory to enforced.

Both are appropriate to authorize separately. Recommend doing #1 first (immediate hardening of existing files) and #2 second (prevent future occurrences).

## Verdict

**NO-GO** for fresh checkouts running migrations from zero. The current production DB is unaffected, but the file state is a latent landmine that would surface during:
- Local dev environment rebuild (`pg_restore` from old dump + `npm run migrate`)
- New developer onboarding
- CI pipeline that runs migrations against an empty DB
- Disaster recovery from an old backup

**GO** for the current production / dev-running DB state — no immediate intervention needed beyond the two follow-up workflows.

## Followup tracking

Adding to `docs/reports/review_followups.md` under a new heading:

```
## WF5 — Migration UP/DOWN audit (commit: TBD, 2026-05-01)
| HIGH | Static analysis | 15 migrations have uncommented DDL under -- DOWN — fresh checkouts would silently fail | WF3 batch fix + WF2 pre-commit lint rule |
```
