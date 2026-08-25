# C7 Tripwire Evidence — pipeline_runs 1603/1604 (legacy 5432 DB export)

**Exported:** 2026-08-03
**Why this file exists:** Reality-Check reviewer finding, 2026-07-31 (`docs/reports/review_followups.md`, "Wrong-database hazard: hardcoded legacy PG_* fallbacks in the Python pipeline"). The Spec 79 **C7 tripwire** (`outcome_write_failures` — FAIL iff attempted > 0 and failures >= attempted) fired for the **first time live** during the 2026-08-01 dev run of `chain_deep_scrapes` — but the run was recorded on the **WRONG database**: the legacy pre-Supabase local Docker Postgres on port 5432. Root cause: `aic-orchestrator.py:128-132` and `aic-scraper-nodriver.py:319-323` hardcode fallback defaults (`localhost:5432/buildo`, `postgres`/`postgres`) that are exactly the legacy DB's identity, so any Python invocation missing env-injected `PG_*` silently connects there. The firing was only caught because migration 236 (`permit_scrape_outcomes`) is absent on the legacy DB — all 3 outcome writes failed (attempted=2), tripping C7. These rows are the **only artifact of that firing** and are exported here verbatim before the legacy DB is cleaned up / decommissioned.

**Source database identity (read-only export):**
- Container: `buildo-postgis` (image `postgis/postgis:15-3.3`), the legacy dev DB per `docker-compose.yml` (volume `buildo_pgdata`)
- Host/port: `127.0.0.1:5432` (loopback-only bind) · Database: `buildo` · User: `postgres`
- Server version: PostgreSQL 15.4 (Debian 15.4-1.pgdg110+1)
- Confirmations at export time: `to_regclass('public.permit_scrape_outcomes')` IS NULL (table absent — the C7 root trigger); residue matches the RC finding: `scraper_queue` = 10,871 rows, 5 permits with `last_scraped_at` set; `max(pipeline_runs.id)` = 1610.

**Row map:** id **1603** = the `chain_deep_scrapes` orchestrator aggregate (`completed_with_errors`, step_verdicts.inspections=FAIL). id **1604** = the `deep_scrapes:inspections` step run carrying the C7 FAIL audit row (`outcome_write_failures: failures=3 attempted=2 → FAIL`, phase-1 verdict FAIL). ids **1605–1610** are the sibling step rows of the same chain run (this schema records step runs as sibling `pipeline_runs` rows, not a child table; no FK-child tables reference `pipeline_runs`). No `pipeline_step_runs` / `pipeline_run_steps` table exists on this DB.

---

## 1. pipeline_runs 1603 & 1604 — expanded display (psql `\x`)

```
-[ RECORD 1 ]---+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
id              | 1603
pipeline        | chain_deep_scrapes
started_at      | 2026-08-01 01:34:12.853047+00
completed_at    | 2026-08-01 01:35:08.967765+00
status          | completed_with_errors
records_total   | 0
records_new     | 0
records_updated | 0
error_message   | 
duration_ms     | 56132
records_meta    | {"step_verdicts": {"inspections": "FAIL", "assert_staleness": "WARN", "refresh_snapshot": "PASS", "assert_data_bounds": "PASS", "assert_engine_health": "PASS", "assert_network_health": "WARN", "classify_inspection_status": "PASS"}, "pre_flight_audit": {"name": "Pre-Flight Health Gate", "rows": [{"value": "0.0%", "metric": "sys_db_bloat_permit_inspections", "status": "PASS", "threshold": "< 50% (warn)"}, {"value": "0.0%", "metric": "sys_db_bloat_permits", "status": "PASS", "threshold": "< 50% (warn)"}, {"value": "0.0%", "metric": "sys_db_bloat_scraper_queue", "status": "PASS", "threshold": "< 50% (warn)"}, {"value": "0.0%", "metric": "sys_db_bloat_data_quality_snapshots", "status": "PASS", "threshold": "< 50% (warn)"}, {"value": "0.0%", "metric": "sys_db_bloat_engine_health_snapshots", "status": "PASS", "threshold": "< 50% (warn)"}], "phase": 0, "verdict": "PASS"}}
-[ RECORD 2 ]---+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
id              | 1604
pipeline        | deep_scrapes:inspections
started_at      | 2026-08-01 01:34:12.934478+00
completed_at    | 2026-08-01 01:34:45.0808+00
status          | completed
records_total   | 2
records_new     | 0
records_updated | 0
error_message   | 
duration_ms     | 32142
records_meta    | {"telemetry": {"counts": {"permits": {"after": 254091, "delta": 0, "before": 254091}, "scraper_queue": {"after": 10871, "delta": 10871, "before": 0}, "permit_inspections": {"after": 792, "delta": 0, "before": 792}}, "engine": {"permits": {"idx_scan": 20, "seq_scan": 0, "seq_ratio": 0, "dead_ratio": 1, "n_dead_tup": 11, "n_live_tup": 0}, "scraper_queue": {"idx_scan": 10877, "seq_scan": 3, "seq_ratio": 0.0003, "dead_ratio": 0.0004, "n_dead_tup": 4, "n_live_tup": 10871}, "permit_inspections": {"idx_scan": 0, "seq_scan": 1, "seq_ratio": 1, "dead_ratio": 0, "n_dead_tup": 0, "n_live_tup": 0}}, "pg_stats": {"permits": {"del": 0, "ins": 0, "upd": 13}, "scraper_queue": {"del": 0, "ins": 10871, "upd": 4}, "permit_inspections": {"del": 0, "ins": 0, "upd": 0}}, "null_fills": {}}, "audit_table": {"name": "Data Ingestion (Multi-Worker)", "rows": [{"value": 1, "metric": "workers_total", "status": "INFO", "threshold": null}, {"value": 0, "metric": "preflight_failures", "status": "PASS", "threshold": "< 2 and < workers_total"}, {"value": "attempted=2 pending=10869", "metric": "zero_attempted_with_pending_queue", "status": "PASS", "threshold": "attempted > 0 when pending > 0"}, {"value": 2, "metric": "permits_attempted", "status": "INFO", "threshold": null}, {"value": 0, "metric": "permits_found", "status": "INFO", "threshold": null}, {"value": 1, "metric": "enriched_updates", "status": "INFO", "threshold": null}, {"value": 2, "metric": "no_stages_yet", "status": "INFO", "threshold": null}, {"value": 0, "metric": "no_inspection_link", "status": "INFO", "threshold": null}, {"value": "0.0%", "metric": "anomalous_miss_rate", "status": "PASS", "threshold": "< 20%"}, {"value": "failures=3 attempted=2", "metric": "outcome_write_failures", "status": "FAIL", "threshold": "FAIL iff attempted > 0 and failures >= attempted; WARN iff failures >= 1"}, {"value": 0, "metric": "outcome_resolution_failures", "status": "INFO", "threshold": null}, {"value": "{\"no_stages\": 2, \"scraped\": 0}", "metric": "scrape_outcome_breakdown", "status": "INFO", "threshold": null}, {"value": 0, "metric": "records_inserted", "status": "INFO", "threshold": null}, {"value": 0, "metric": "records_updated", "status": "INFO", "threshold": null}, {"value": 28696, "metric": "duration_ms", "status": "INFO", "threshold": null}, {"value": 10869, "metric": "queue_pending", "status": "INFO", "threshold": null}, {"value": 2, "metric": "queue_completed", "status": "INFO", "threshold": null}, {"value": 0, "metric": "queue_failed", "status": "INFO", "threshold": null}, {"value": 0, "metric": "exit_code", "status": "PASS", "threshold": "== 0"}, {"value": true, "metric": "pipeline_summary_emitted", "status": "PASS", "threshold": "== true"}], "phase": 1, "verdict": "FAIL"}, "orchestrator": {"workers": 1, "batch_size": 10, "queue_stats": {"pending": 10869, "completed": 2}}, "pipeline_meta": {"reads": {"permits": ["permit_num", "status", "enriched_status", "permit_type"], "scraper_queue": ["year_seq", "status", "claimed_by"]}, "writes": {"permits": ["enriched_status", "last_scraped_at"], "scraper_queue": ["year_seq", "status", "claimed_at", "completed_at", "claimed_by", "error_msg"], "permit_inspections": ["permit_num", "stage_name", "status", "inspection_date", "scraped_at"], "permit_scrape_outcomes": ["permit_num", "year_seq", "outcome", "detail", "transport", "run_id", "observed_at"]}, "external": ["AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)"]}, "scraper_telemetry": {"capped": true, "latency": {"max": 7241, "p50": 7241, "p95": 7241}, "workers": 1, "transport": "http", "last_error": null, "proxy_host": null, "proxy_mode": "none", "noise_visits": 0, "proxy_errors": 0, "schema_drift": [], "http_requests": 10, "permits_found": 0, "relay_blocked": 0, "relay_bytes_up": 0, "status_changes": 0, "http_bytes_down": 24402, "max_permits_cap": 2, "not_found_count": 2, "permits_scraped": 0, "enriched_updates": 1, "error_categories": {}, "proxy_configured": false, "relay_bytes_down": 0, "session_failures": 0, "permits_attempted": 2, "workers_completed": 1, "preflight_failures": 0, "session_bootstraps": 1, "not_found_breakdown": {"no_stages": 2}, "relay_bytes_by_host": {}, "consecutive_empty_max": 0, "scrape_outcome_run_id": "87bb08d3dbea447186b95fe6f8e7b2d0", "outcome_write_failures": 3, "outcome_resolution_failures": 0}}

```

## 2. pipeline_runs 1603 & 1604 — JSON dump

```json
[
    {
        "id": 1603,
        "status": "completed_with_errors",
        "pipeline": "chain_deep_scrapes",
        "started_at": "2026-08-01T01:34:12.853047+00:00",
        "duration_ms": 56132,
        "records_new": 0,
        "completed_at": "2026-08-01T01:35:08.967765+00:00",
        "records_meta": {
            "step_verdicts": {
                "inspections": "FAIL",
                "assert_staleness": "WARN",
                "refresh_snapshot": "PASS",
                "assert_data_bounds": "PASS",
                "assert_engine_health": "PASS",
                "assert_network_health": "WARN",
                "classify_inspection_status": "PASS"
            },
            "pre_flight_audit": {
                "name": "Pre-Flight Health Gate",
                "rows": [
                    {
                        "value": "0.0%",
                        "metric": "sys_db_bloat_permit_inspections",
                        "status": "PASS",
                        "threshold": "< 50% (warn)"
                    },
                    {
                        "value": "0.0%",
                        "metric": "sys_db_bloat_permits",
                        "status": "PASS",
                        "threshold": "< 50% (warn)"
                    },
                    {
                        "value": "0.0%",
                        "metric": "sys_db_bloat_scraper_queue",
                        "status": "PASS",
                        "threshold": "< 50% (warn)"
                    },
                    {
                        "value": "0.0%",
                        "metric": "sys_db_bloat_data_quality_snapshots",
                        "status": "PASS",
                        "threshold": "< 50% (warn)"
                    },
                    {
                        "value": "0.0%",
                        "metric": "sys_db_bloat_engine_health_snapshots",
                        "status": "PASS",
                        "threshold": "< 50% (warn)"
                    }
                ],
                "phase": 0,
                "verdict": "PASS"
            }
        },
        "error_message": null,
        "records_total": 0,
        "records_updated": 0
    },
    {
        "id": 1604,
        "status": "completed",
        "pipeline": "deep_scrapes:inspections",
        "started_at": "2026-08-01T01:34:12.934478+00:00",
        "duration_ms": 32142,
        "records_new": 0,
        "completed_at": "2026-08-01T01:34:45.0808+00:00",
        "records_meta": {
            "telemetry": {
                "counts": {
                    "permits": {
                        "after": 254091,
                        "delta": 0,
                        "before": 254091
                    },
                    "scraper_queue": {
                        "after": 10871,
                        "delta": 10871,
                        "before": 0
                    },
                    "permit_inspections": {
                        "after": 792,
                        "delta": 0,
                        "before": 792
                    }
                },
                "engine": {
                    "permits": {
                        "idx_scan": 20,
                        "seq_scan": 0,
                        "seq_ratio": 0,
                        "dead_ratio": 1,
                        "n_dead_tup": 11,
                        "n_live_tup": 0
                    },
                    "scraper_queue": {
                        "idx_scan": 10877,
                        "seq_scan": 3,
                        "seq_ratio": 0.0003,
                        "dead_ratio": 0.0004,
                        "n_dead_tup": 4,
                        "n_live_tup": 10871
                    },
                    "permit_inspections": {
                        "idx_scan": 0,
                        "seq_scan": 1,
                        "seq_ratio": 1,
                        "dead_ratio": 0,
                        "n_dead_tup": 0,
                        "n_live_tup": 0
                    }
                },
                "pg_stats": {
                    "permits": {
                        "del": 0,
                        "ins": 0,
                        "upd": 13
                    },
                    "scraper_queue": {
                        "del": 0,
                        "ins": 10871,
                        "upd": 4
                    },
                    "permit_inspections": {
                        "del": 0,
                        "ins": 0,
                        "upd": 0
                    }
                },
                "null_fills": {
                }
            },
            "audit_table": {
                "name": "Data Ingestion (Multi-Worker)",
                "rows": [
                    {
                        "value": 1,
                        "metric": "workers_total",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "preflight_failures",
                        "status": "PASS",
                        "threshold": "< 2 and < workers_total"
                    },
                    {
                        "value": "attempted=2 pending=10869",
                        "metric": "zero_attempted_with_pending_queue",
                        "status": "PASS",
                        "threshold": "attempted > 0 when pending > 0"
                    },
                    {
                        "value": 2,
                        "metric": "permits_attempted",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "permits_found",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 1,
                        "metric": "enriched_updates",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 2,
                        "metric": "no_stages_yet",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "no_inspection_link",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": "0.0%",
                        "metric": "anomalous_miss_rate",
                        "status": "PASS",
                        "threshold": "< 20%"
                    },
                    {
                        "value": "failures=3 attempted=2",
                        "metric": "outcome_write_failures",
                        "status": "FAIL",
                        "threshold": "FAIL iff attempted > 0 and failures >= attempted; WARN iff failures >= 1"
                    },
                    {
                        "value": 0,
                        "metric": "outcome_resolution_failures",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": "{\"no_stages\": 2, \"scraped\": 0}",
                        "metric": "scrape_outcome_breakdown",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "records_inserted",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "records_updated",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 28696,
                        "metric": "duration_ms",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 10869,
                        "metric": "queue_pending",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 2,
                        "metric": "queue_completed",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "queue_failed",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "exit_code",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": true,
                        "metric": "pipeline_summary_emitted",
                        "status": "PASS",
                        "threshold": "== true"
                    }
                ],
                "phase": 1,
                "verdict": "FAIL"
            },
            "orchestrator": {
                "workers": 1,
                "batch_size": 10,
                "queue_stats": {
                    "pending": 10869,
                    "completed": 2
                }
            },
            "pipeline_meta": {
                "reads": {
                    "permits": [
                        "permit_num",
                        "status",
                        "enriched_status",
                        "permit_type"
                    ],
                    "scraper_queue": [
                        "year_seq",
                        "status",
                        "claimed_by"
                    ]
                },
                "writes": {
                    "permits": [
                        "enriched_status",
                        "last_scraped_at"
                    ],
                    "scraper_queue": [
                        "year_seq",
                        "status",
                        "claimed_at",
                        "completed_at",
                        "claimed_by",
                        "error_msg"
                    ],
                    "permit_inspections": [
                        "permit_num",
                        "stage_name",
                        "status",
                        "inspection_date",
                        "scraped_at"
                    ],
                    "permit_scrape_outcomes": [
                        "permit_num",
                        "year_seq",
                        "outcome",
                        "detail",
                        "transport",
                        "run_id",
                        "observed_at"
                    ]
                },
                "external": [
                    "AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)"
                ]
            },
            "scraper_telemetry": {
                "capped": true,
                "latency": {
                    "max": 7241,
                    "p50": 7241,
                    "p95": 7241
                },
                "workers": 1,
                "transport": "http",
                "last_error": null,
                "proxy_host": null,
                "proxy_mode": "none",
                "noise_visits": 0,
                "proxy_errors": 0,
                "schema_drift": [
                ],
                "http_requests": 10,
                "permits_found": 0,
                "relay_blocked": 0,
                "relay_bytes_up": 0,
                "status_changes": 0,
                "http_bytes_down": 24402,
                "max_permits_cap": 2,
                "not_found_count": 2,
                "permits_scraped": 0,
                "enriched_updates": 1,
                "error_categories": {
                },
                "proxy_configured": false,
                "relay_bytes_down": 0,
                "session_failures": 0,
                "permits_attempted": 2,
                "workers_completed": 1,
                "preflight_failures": 0,
                "session_bootstraps": 1,
                "not_found_breakdown": {
                    "no_stages": 2
                },
                "relay_bytes_by_host": {
                },
                "consecutive_empty_max": 0,
                "scrape_outcome_run_id": "87bb08d3dbea447186b95fe6f8e7b2d0",
                "outcome_write_failures": 3,
                "outcome_resolution_failures": 0
            }
        },
        "error_message": null,
        "records_total": 2,
        "records_updated": 0
    }
]
```

## 3. Sibling step rows of chain run 1603 (ids 1605–1610) — summary

```
  id  |                pipeline                 |          started_at           |         completed_at          |  status   | records_total | records_new | records_updated | duration_ms 
------+-----------------------------------------+-------------------------------+-------------------------------+-----------+---------------+-------------+-----------------+-------------
 1605 | deep_scrapes:classify_inspection_status | 2026-08-01 01:34:45.088852+00 | 2026-08-01 01:34:48.583353+00 | completed |             0 |           0 |               0 |        3493
 1606 | deep_scrapes:assert_network_health      | 2026-08-01 01:34:48.587667+00 | 2026-08-01 01:34:48.857313+00 | completed |             0 |           0 |               0 |         270
 1607 | deep_scrapes:refresh_snapshot           | 2026-08-01 01:34:48.861516+00 | 2026-08-01 01:35:07.17102+00  | completed |             1 |           1 |               0 |       18318
 1608 | deep_scrapes:assert_data_bounds         | 2026-08-01 01:35:07.175651+00 | 2026-08-01 01:35:07.530828+00 | completed |             0 |           0 |               0 |         355
 1609 | deep_scrapes:assert_engine_health       | 2026-08-01 01:35:07.53553+00  | 2026-08-01 01:35:08.074767+00 | completed |            91 |           0 |               0 |         538
 1610 | deep_scrapes:assert_staleness           | 2026-08-01 01:35:08.080355+00 | 2026-08-01 01:35:08.964712+00 | completed |             0 |           0 |               0 |         884
(6 rows)

```

## 4. Sibling step rows 1605–1610 — full JSON dump (verbatim, incl. records_meta)

```json
[
    {
        "id": 1605,
        "status": "completed",
        "pipeline": "deep_scrapes:classify_inspection_status",
        "started_at": "2026-08-01T01:34:45.088852+00:00",
        "duration_ms": 3493,
        "records_new": 0,
        "completed_at": "2026-08-01T01:34:48.583353+00:00",
        "records_meta": {
            "stalled": 0,
            "telemetry": {
                "counts": {
                    "permits": {
                        "after": 254091,
                        "delta": 0,
                        "before": 254091
                    }
                },
                "engine": {
                    "permits": {
                        "idx_scan": 134,
                        "seq_scan": 5,
                        "seq_ratio": 0.036,
                        "dead_ratio": 1,
                        "n_dead_tup": 8,
                        "n_live_tup": 0
                    }
                },
                "pg_stats": {
                    "permits": {
                        "del": 0,
                        "ins": 0,
                        "upd": 0
                    }
                },
                "null_fills": {
                }
            },
            "audit_table": {
                "name": "Inspection Status Classification",
                "rows": [
                    {
                        "value": 0,
                        "metric": "newly_stalled",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "reactivated",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 50,
                        "metric": "enriched_examination",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 4,
                        "metric": "enriched_permit_issued",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 1876,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 2,
                "verdict": "PASS"
            },
            "reactivated": 0,
            "distribution": [
                {
                    "count": 50,
                    "status": "Examination"
                },
                {
                    "count": 4,
                    "status": "Permit Issued"
                }
            ],
            "pipeline_meta": {
                "reads": {
                    "permits": [
                        "permit_num",
                        "revision_num",
                        "enriched_status",
                        "issued_date",
                        "application_date",
                        "last_seen_at"
                    ],
                    "permit_inspections": [
                        "permit_num",
                        "inspection_date"
                    ]
                },
                "writes": {
                    "permits": [
                        "enriched_status",
                        "last_seen_at"
                    ]
                }
            }
        },
        "error_message": null,
        "records_total": 0,
        "records_updated": 0
    },
    {
        "id": 1606,
        "status": "completed",
        "pipeline": "deep_scrapes:assert_network_health",
        "started_at": "2026-08-01T01:34:48.587667+00:00",
        "duration_ms": 270,
        "records_new": 0,
        "completed_at": "2026-08-01T01:34:48.857313+00:00",
        "records_meta": {
            "audit_table": {
                "name": "Network Health",
                "rows": [
                    {
                        "value": 0,
                        "metric": "schema_drift_count",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": "0.0%",
                        "metric": "proxy_error_rate",
                        "status": "PASS",
                        "threshold": "< 5%"
                    },
                    {
                        "value": 7241,
                        "metric": "avg_latency_ms",
                        "status": "WARN",
                        "threshold": "< 2000"
                    },
                    {
                        "value": 7241,
                        "metric": "max_latency_ms",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": false,
                        "metric": "consecutive_empty_hit",
                        "status": "PASS",
                        "threshold": "== false"
                    },
                    {
                        "value": 1,
                        "metric": "session_bootstraps",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "session_failures",
                        "status": "PASS",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 71,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 2,
                "verdict": "WARN"
            },
            "checks_failed": 0,
            "checks_passed": "all",
            "checks_warned": 1,
            "pipeline_meta": {
                "reads": {
                    "pipeline_runs": [
                        "records_meta",
                        "status",
                        "pipeline"
                    ]
                },
                "writes": {
                }
            }
        },
        "error_message": null,
        "records_total": 0,
        "records_updated": 0
    },
    {
        "id": 1607,
        "status": "completed",
        "pipeline": "deep_scrapes:refresh_snapshot",
        "started_at": "2026-08-01T01:34:48.861516+00:00",
        "duration_ms": 18318,
        "records_new": 1,
        "completed_at": "2026-08-01T01:35:07.17102+00:00",
        "records_meta": {
            "telemetry": {
                "counts": {
                    "data_quality_snapshots": {
                        "after": 29,
                        "delta": 1,
                        "before": 28
                    }
                },
                "engine": {
                    "data_quality_snapshots": {
                        "idx_scan": 1,
                        "seq_scan": 1,
                        "seq_ratio": 0.5,
                        "dead_ratio": 0,
                        "n_dead_tup": 0,
                        "n_live_tup": 1
                    }
                },
                "pg_stats": {
                    "data_quality_snapshots": {
                        "del": 0,
                        "ins": 1,
                        "upd": 0
                    }
                },
                "null_fills": {
                }
            },
            "audit_table": {
                "name": "Refresh Snapshot",
                "rows": [
                    {
                        "value": 1,
                        "metric": "snapshots_created",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "snapshots_updated",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 61.2,
                        "metric": "coa_cost_coverage_pct",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 50,
                        "metric": "coa_cost_coverage_open_pct",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 33400,
                        "metric": "servable_coa_funnel_total",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 3316,
                        "metric": "servable_coa_funnel_geo_open",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 1659,
                        "metric": "servable_coa_funnel_cost",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 1558,
                        "metric": "servable_coa_funnel_fresh_forecast",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 1558,
                        "metric": "servable_coa_funnel_score",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0.06,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 18079,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 18,
                "verdict": "PASS"
            },
            "duration_ms": 18018,
            "pipeline_meta": {
                "reads": {
                    "permits": [
                        "*"
                    ],
                    "entities": [
                        "*"
                    ],
                    "sync_runs": [
                        "*"
                    ],
                    "lead_parcels": [
                        "lead_id"
                    ],
                    "permit_trades": [
                        "*"
                    ],
                    "cost_estimates": [
                        "cost_source",
                        "estimated_cost"
                    ],
                    "permit_parcels": [
                        "*"
                    ],
                    "trade_forecasts": [
                        "lead_id",
                        "urgency",
                        "opportunity_score"
                    ],
                    "coa_applications": [
                        "*"
                    ],
                    "parcel_buildings": [
                        "*"
                    ],
                    "permit_inspections": [
                        "*"
                    ],
                    "building_footprints": [
                        "*"
                    ]
                },
                "writes": {
                    "data_quality_snapshots": [
                        "*"
                    ]
                }
            }
        },
        "error_message": null,
        "records_total": 1,
        "records_updated": 0
    },
    {
        "id": 1608,
        "status": "completed",
        "pipeline": "deep_scrapes:assert_data_bounds",
        "started_at": "2026-08-01T01:35:07.175651+00:00",
        "duration_ms": 355,
        "records_new": 0,
        "completed_at": "2026-08-01T01:35:07.530828+00:00",
        "records_meta": {
            "audit_table": {
                "name": "Data Quality",
                "rows": [
                    {
                        "value": 0,
                        "metric": "null_permit_num",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "null_stage_name",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "null_status",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "null_scraped_at",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "orphan_inspections",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "invalid_status",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "outstanding_with_date",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "completed_without_date",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "duplicate_stages",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "future_dates",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "ancient_dates",
                        "status": "PASS",
                        "threshold": "<= 5"
                    },
                    {
                        "value": 0,
                        "metric": "date_before_permit_year",
                        "status": "PASS",
                        "threshold": "== 0"
                    },
                    {
                        "value": 0,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 117,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 3,
                "verdict": "PASS"
            },
            "checks_failed": 0,
            "checks_passed": "all",
            "checks_warned": 0,
            "pipeline_meta": {
                "reads": {
                    "parcels": [
                        "*"
                    ],
                    "permits": [
                        "*"
                    ],
                    "address_points": [
                        "*"
                    ],
                    "neighbourhoods": [
                        "*"
                    ],
                    "coa_applications": [
                        "*"
                    ],
                    "permit_inspections": [
                        "*"
                    ],
                    "building_footprints": [
                        "*"
                    ]
                },
                "writes": {
                    "pipeline_runs": [
                        "checks_passed",
                        "checks_failed",
                        "checks_warned"
                    ]
                }
            }
        },
        "error_message": null,
        "records_total": 0,
        "records_updated": 0
    },
    {
        "id": 1609,
        "status": "completed",
        "pipeline": "deep_scrapes:assert_engine_health",
        "started_at": "2026-08-01T01:35:07.53553+00:00",
        "duration_ms": 538,
        "records_new": 0,
        "completed_at": "2026-08-01T01:35:08.074767+00:00",
        "records_meta": {
            "telemetry": {
                "counts": {
                    "engine_health_snapshots": {
                        "after": 1100,
                        "delta": 91,
                        "before": 1009
                    }
                },
                "engine": {
                    "engine_health_snapshots": {
                        "idx_scan": 91,
                        "seq_scan": 0,
                        "seq_ratio": 0,
                        "dead_ratio": 0,
                        "n_dead_tup": 0,
                        "n_live_tup": 91
                    }
                },
                "pg_stats": {
                    "engine_health_snapshots": {
                        "del": 0,
                        "ins": 91,
                        "upd": 0
                    }
                },
                "null_fills": {
                }
            },
            "audit_table": {
                "name": "Engine Health",
                "rows": [
                    {
                        "value": 0,
                        "metric": "live_rows",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 0,
                        "metric": "dead_rows",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": "0%",
                        "metric": "dead_tuple_pct",
                        "status": "PASS",
                        "threshold": "< 10%"
                    },
                    {
                        "value": 0,
                        "metric": "update_insert_ratio",
                        "status": "PASS",
                        "threshold": "< 5.0"
                    },
                    {
                        "value": null,
                        "metric": "last_autovacuum",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 251.38,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 362,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 6,
                "verdict": "PASS"
            },
            "checks_failed": 0,
            "checks_passed": "all",
            "checks_warned": 0,
            "engine_health": [
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_close_stale_20260707"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_coa_trade_classified_20260707"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_coa_watermark_pre_p16"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_lead_trades_coa_pre_p16"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_null_lot_20260708"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_p13_legacy_cost_tail"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_permit_trades_active_20260709"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_permit_trades_pre_p16"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_backup_permits_watermark_pre_p16"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "_shadow_cost_old"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "address_points"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "admin_audit_log"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "admin_watchlist"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "archetype_cost_rates"
                },
                {
                    "idx_scan": 5,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "building_footprints"
                },
                {
                    "idx_scan": 1,
                    "seq_scan": 2,
                    "seq_ratio": 0.6667,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "coa_applications"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 4,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "cost_estimates"
                },
                {
                    "idx_scan": 1,
                    "seq_scan": 1,
                    "seq_ratio": 0.5,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 1,
                    "table_name": "data_quality_snapshots"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "device_tokens"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "engine_health_snapshots"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 1,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "entities"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "entity_contacts"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "entity_projects"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "heritage_districts"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "heritage_properties"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "inspection_stage_map"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_analytics"
                },
                {
                    "idx_scan": 880,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_parcels"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_products"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_trades"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_view_events"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lead_views"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lifecycle_status_history"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "lifecycle_transitions"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 4,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "logic_variables"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "mv_monthly_permit_stats"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "neighbourhood_build_norms"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "neighbourhood_storey_norms"
                },
                {
                    "idx_scan": 8,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "neighbourhoods"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "notification_dispatches"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "notifications"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "parcel_address_points"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 1,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "parcel_buildings"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "parcels"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_history"
                },
                {
                    "idx_scan": 6,
                    "seq_scan": 16,
                    "seq_ratio": 0.7273,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_inspections"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 1,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_parcels"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_phase_transitions"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_products"
                },
                {
                    "idx_scan": 1,
                    "seq_scan": 1,
                    "seq_ratio": 0.5,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_trades"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "permit_type_classifications"
                },
                {
                    "idx_scan": 931,
                    "seq_scan": 49,
                    "seq_ratio": 0.05,
                    "dead_ratio": 0,
                    "n_dead_tup": 8,
                    "n_live_tup": 0,
                    "table_name": "permits"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "phase_calibration"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "phase_stay_calibration"
                },
                {
                    "idx_scan": 8,
                    "seq_scan": 1,
                    "seq_ratio": 0.1111,
                    "dead_ratio": 0.6,
                    "n_dead_tup": 3,
                    "n_live_tup": 5,
                    "table_name": "pipeline_runs"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 1,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "pipeline_schedules"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "product_groups"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "ravines"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "schema_migrations"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "scope_intensity_matrix"
                },
                {
                    "idx_scan": 10877,
                    "seq_scan": 4,
                    "seq_ratio": 0.0004,
                    "dead_ratio": 0.0004,
                    "n_dead_tup": 4,
                    "n_live_tup": 10871,
                    "table_name": "scraper_queue"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "spatial_ref_sys"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "stripe_webhook_events"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "subscribe_nonces"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "supplier_products"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "supplier_trades"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "suppliers"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 1,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "sync_runs"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "toronto_centreline"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "tracked_projects"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 4,
                    "seq_ratio": 1,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_configurations"
                },
                {
                    "idx_scan": 3318,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_forecasts"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_mapping_rules"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_products"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_sqft_rates"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trade_suppliers"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "trades"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "universal_stream_catalog"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "universal_stream_trade_signals"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "user_profiles"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "wsib_registry"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_building_setback_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_bylaw_areas"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_height_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_lot_coverage_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_parking_zone_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_policy_area_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_policy_road_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_priority_retail_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_queenstw_eat_overlay"
                },
                {
                    "idx_scan": 0,
                    "seq_scan": 0,
                    "seq_ratio": 0,
                    "dead_ratio": 0,
                    "n_dead_tup": 0,
                    "n_live_tup": 0,
                    "table_name": "zoning_rooming_house_overlay"
                }
            ],
            "pipeline_meta": {
                "reads": {
                    "pg_stat_user_tables": [
                        "relname",
                        "n_live_tup",
                        "n_dead_tup",
                        "seq_scan",
                        "idx_scan",
                        "n_tup_ins",
                        "n_tup_upd"
                    ]
                },
                "writes": {
                    "engine_health_snapshots": [
                        "table_name",
                        "n_live_tup",
                        "n_dead_tup",
                        "dead_ratio",
                        "seq_scan",
                        "idx_scan",
                        "seq_ratio"
                    ]
                }
            },
            "tables_checked": 91,
            "tables_vacuumed": 1
        },
        "error_message": null,
        "records_total": 91,
        "records_updated": 0
    },
    {
        "id": 1610,
        "status": "completed",
        "pipeline": "deep_scrapes:assert_staleness",
        "started_at": "2026-08-01T01:35:08.080355+00:00",
        "duration_ms": 884,
        "records_new": 0,
        "completed_at": "2026-08-01T01:35:08.964712+00:00",
        "records_meta": {
            "audit_table": {
                "name": "Staleness Monitor",
                "rows": [
                    {
                        "value": 58987,
                        "metric": "total_target_permits",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 59,
                        "metric": "scraped_permits",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 58928,
                        "metric": "never_scraped",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": "0.1%",
                        "metric": "coverage_pct",
                        "status": "WARN",
                        "threshold": ">= 10%"
                    },
                    {
                        "value": 140,
                        "metric": "max_days_stale",
                        "status": "WARN",
                        "threshold": "<= 60 days"
                    },
                    {
                        "value": 59,
                        "metric": "stale_over_30d",
                        "status": "WARN",
                        "threshold": "<= 10000"
                    },
                    {
                        "value": 0,
                        "metric": "sys_velocity_rows_sec",
                        "status": "INFO",
                        "threshold": null
                    },
                    {
                        "value": 604,
                        "metric": "sys_duration_ms",
                        "status": "INFO",
                        "threshold": null
                    }
                ],
                "phase": 4,
                "verdict": "WARN"
            },
            "checks_failed": 0,
            "checks_passed": "all",
            "checks_warned": 3,
            "pipeline_meta": {
                "reads": {
                    "permits": [
                        "permit_num",
                        "status",
                        "permit_type"
                    ],
                    "permit_inspections": [
                        "permit_num",
                        "scraped_at"
                    ]
                },
                "writes": {
                }
            }
        },
        "error_message": null,
        "records_total": 0,
        "records_updated": 0
    }
]
```

---
*Export performed read-only via `docker exec buildo-postgis psql`. No database rows were modified. Not committed — file staged for operator review per RC-finding instruction.*
