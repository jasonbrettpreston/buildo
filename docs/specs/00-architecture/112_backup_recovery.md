# Spec 112 — Database Backup & Recovery

## 1. Goal & User Story

Provide a reliable, automated backup layer for the Buildo PostgreSQL database so that data can
be recovered following accidental deletion, migration failure, or infrastructure corruption.
Without this, the Data Safety production readiness vector is blocked (scored 1 in 2026-04-24
WF5 audit).

---

## 2. Two-Layer Strategy

| Layer | Mechanism | Frequency | Recovery Time |
|-------|-----------|-----------|---------------|
| **Layer 1 — Cloud SQL Automated Backups** | Built-in PITR (Point-in-Time Recovery) | Every 4 hours (configurable) | Minutes via Cloud Console |
| **Layer 2 — Logical pg_dump to GCS** | `scripts/backup-db.js` | On-demand or Cloud Scheduler | Minutes via `pg_restore` |

Layer 1 is infrastructure configuration — no code. Layer 2 is a portable logical backup that
can be restored to any PostgreSQL instance (not just Cloud SQL), useful for schema migration
testing and cross-environment seeding.

---

## 3. Behavioral Contract

### Layer 1 — Cloud SQL Automated Backup

Enable via `gcloud`:

```bash
# Enable automated backups with 7-day retention and PITR
gcloud sql instances patch buildo-production \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7

# Verify
gcloud sql instances describe buildo-production \
  --format="json(settings.backupConfiguration)"
```

**Point-in-Time Recovery (PITR):**

```bash
# Restore to a specific timestamp
gcloud sql instances clone buildo-production buildo-recovery \
  --point-in-time="2026-04-24T14:30:00.000Z"
```

### Layer 2 — Logical pg_dump Script

**Script:** `scripts/backup-db.js`
**Advisory Lock ID:** 112 (spec number convention, §5.2 of spec 47)

**Inputs:**
- `DATABASE_URL` or `PG_*` env vars (same as the pipeline pool)
- `BACKUP_GCS_BUCKET` (required — GCS bucket name, e.g. `buildo-db-backups`)
- `BACKUP_RETAIN_DAYS` (optional — default 30; structural constant; not in `logic_variables`)
- `GOOGLE_APPLICATION_CREDENTIALS` (optional — falls back to Application Default Credentials in Cloud environment)

**Outputs:**
- GCS object: `gs://${BACKUP_GCS_BUCKET}/pg_dump/${YYYY-MM-DD}/${ISO_TIMESTAMP}.dump`
- Custom format (`--format=custom`) — supports parallel `pg_restore -j N`
- `emitSummary` with `backup_size_bytes`, `gcs_path`, `blobs_pruned`, `retain_days`
- `emitMeta` reads: none; writes: none (external GCS only)

**Retention:** Any `.dump` object under `pg_dump/` older than `BACKUP_RETAIN_DAYS` days is
deleted at the end of a successful backup run. Prune failure logs WARN and does not abort.

**Restore procedure:**

```bash
# Download latest backup
gsutil cp gs://buildo-db-backups/pg_dump/2026-04-24/2026-04-24T03-00-00.dump ./restore.dump

# Restore to target database
pg_restore \
  --host=$PG_HOST \
  --port=$PG_PORT \
  --username=$PG_USER \
  --dbname=$PG_DATABASE \
  --jobs=4 \
  --no-owner \
  --no-acl \
  restore.dump
```

---

## 4. Edge Cases

- **Missing `BACKUP_GCS_BUCKET`:** Script throws before acquiring the advisory lock. No backup
  attempt is made. `pipeline.run` catches and records the failure in `pipeline_runs`.
- **pg_dump non-zero exit:** Error re-thrown inside the lock scope. `pipeline.run` records
  `status='failed'`. GCS upload is never initiated — no partial/corrupt object written.
- **GCS upload failure mid-stream:** Stream `error` event is caught, re-thrown. The partially
  uploaded object is abandoned (not deleted). Next successful run overwrites via a new timestamped
  object name. Orphan cleanup is handled by bucket lifecycle rules (set `Age` condition to
  `BACKUP_RETAIN_DAYS + 2` days as a safety net).
- **Retention prune failure:** Caught separately, logged as WARN. Backup is still considered
  successful — old objects accumulate until the next successful prune.
- **Concurrent runs:** Advisory lock 112 prevents two backup runs from overlapping. Second
  invocation emits a SKIP summary and exits 0.
- **Non-integer `BACKUP_RETAIN_DAYS`:** Zod validation throws at startup with a clear message.

---

## 5. Operating Boundaries

### Target Files
- `scripts/backup-db.js` — the backup script
- `scripts/manifest.json` — script registry entry
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 — lock ID 112 registration

### Out-of-Scope Files
- `src/app/api/` — no API trigger for backup (admin can run standalone or via Cloud Scheduler)
- `migrations/` — no schema changes
- Cloud Scheduler configuration — infrastructure provisioned outside this repo

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (script protocol)
- **Relies on:** `docs/specs/01-pipeline/40_pipeline_system.md` (pipeline_runs, SDK contracts)
- **Relies on:** `docs/specs/00-architecture/01_database_schema.md` (authoritative schema being backed up)

---

## 6. Producer / Consumer Contracts

This script is an **Observer archetype** — it reads the DB via pg_dump (not SELECT queries)
and writes only to GCS. It has no downstream consumers within the pipeline system.

`emitSummary` fields:
| Field | Type | Meaning |
|-------|------|---------|
| `records_total` | null | Observer pattern — no row-level processing |
| `records_new` | null | Observer pattern |
| `records_updated` | null | Observer pattern |
| `records_meta.backup_size_bytes` | number | Compressed dump file size |
| `records_meta.gcs_path` | string | Full GCS URI of the backup object |
| `records_meta.blobs_pruned` | number | Objects deleted by retention pruning |
| `records_meta.retain_days` | number | Effective retention window used |
| `records_meta.audit_table` | object | Phase 112, verdict PASS/FAIL |
