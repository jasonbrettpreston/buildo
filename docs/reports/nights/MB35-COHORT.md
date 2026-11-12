# Night record: MB35-COHORT (MB-35, the Layer 3 cohort load, 2026-11-11/12) and its capture rerun MB35-RECAP

McBylaws task MB-35 (with MB-31 (e), the step's runtime loader), local database only (127.0.0.1:54322). The night loaded
`parcel_maxbld_scenarios` for the first time: the golden 25 plus the City neighbourhood Fenside-Parkwoods (cohort A), 1,921 lots,
for the admin-only internal preview (MB-93; customers unchanged). Layer 2 was not written.

Citations: `L:<n>` is a line of `~/Buildo-scratch/mcbylaws/mb35/night/night.log`; other files are in `~/Buildo-scratch/mcbylaws/mb35/night/`
unless a path is given.

- Rulings: operator "1a 2a" (2026-11-11, build the loader, load golden 25 + a bounded cohort); "a yes" (2026-11-11, decision list D-1..D-7
  and cohort A, `~/Buildo-scratch/mcbylaws/inc3/open-questions.md`); "option 2 a y b y" (2026-11-11, STOP-11: no runner change, the 309
  index kept, the houseplex coverage exemption intended, `~/Buildo-scratch/mcbylaws/mb35/DECISIONS.md`).
- **The go**, verbatim: `OPERATOR-GO MB35-COHORT`. The lock records it on every attempt, e.g. attempt 5:
  `dblock taken (mb35-cohort, MB35-COHORT, go: OPERATOR-GO MB35-COHORT)` (L:12738).
- Plan: `~/Buildo-scratch/mcbylaws/mb35/NIGHT-STEPS.md`; run sheet `RUN.md` (blocks b1-b6, r-release, r-restore, the INC4-NIGHT form);
  constants `blocks/expect.zsh`; block files hash-pinned in `blocks/BLOCKS.sha256`; the NIGHT3 library unchanged. Refuse-path self-check
  before each attempt: `SELFCHECK.txt` (16 runs without the go, each exit 2, nothing written).
- Tree of the passing attempt: `f662f2913` (origin), holding the MB-31 (e) build `913797b72` and the three night fixes below.

## What the night stored (attempt 5, 2026-11-12 10:45:16-10:51:59)
| Fact | Value | Source |
|---|---|---|
| Migrations applied, one at a time, each `--only` with `--dry-run` first | 276, 292, 294, 296, 310, 309, 311, 313 | L:12742-12912 |
| Declared settings present | 27 of 27; retired old-engine keys left 0 of 22 | L:12914, L:12916 |
| Tables | `parcel_maxbld_scenarios`, `parcel_maxbld_population`, RLS on both, 0 policies; `idx_parcels_primary_frontage_street_name` | L:12918-12922 |
| Population | cohort rows 1,897; with the golden 25: 1,921; every lot has a parcels row and a current stamp (0/0/0) | L:12926-12930 |
| Layer 2 untouched | one stamp pair `4e7ea5d17e90…/54c20374745f…` on 440,093 lots | L:12932 |
| Dry page (b3, read-only + a rolled-back write probe) | 500 lots, 153 rows a lot, 0 stale words, 0 other table_version, 0 CHECK violations, clean census, write probe PASS (5 rows through the runner plan, rolled back, table empty after); projection 417.2 MiB | L:12938-12940 |
| Rows loaded | 293,913 = 1,921 x 153; per type 47 / 55 / 51 | L:12959, L:12965-12973 |
| Runs | first run `1921|293913|0` (records_total, new, updated); rerun `1921|0|0`; both `completed` (pipeline_runs 4443, 4444); `rows_emitted` 293,913; capture verdict PASS, rerun proof PASS, git_head `f662f2913` | L:12957, L:12987-12995 |
| Content | one settings_sha, one catalogue_sha, one switchboard_sha; 0 rows on a stale Layer 2 version; 0 stale disclosure words; 0 computed values without a trace; both CHECKs present | L:12975-12985 |
| Status mix | computed 234,058; not_evaluated 48,036 (16.3 %); not_applicable 5,762; permitted 5,751; not_buildable 276; unregulated 18; not_permitted 12 | L:12996 |
| not_evaluated share by type | detached_house 15.1 %, detached_houseplex 19.2 %, house_with_secondary_suite 14.4 % (measured read-only after the night; the b5 line errored, see Findings) | read-only query, 2026-11-12 |
| Golden 25 | 150 of 150 detached_house cells equal the McProof key | L:13004 |
| Storage | scenarios 368.91 MiB; population 0.27 MiB; street index 3.49 MiB; Layer 2 754.95 MiB; total 1,127.62 MiB under the 1,300 MiB line | L:13006 |

## Timeline of attempt 5 (EST)
| Block | Time | Result |
|---|---|---|
| b1 preconditions, lock, dump of logic_variables + schema_migrations | 10:45:16-10:45:33 | PASS |
| b2 eight migrations and checks | 10:45:33-10:45:38 | PASS |
| b3 dry page and write probe | 10:45:38-10:46:12 | PASS |
| b4 capture (run + rerun proof) | 10:46:26-10:51:48 | PASS; 293,913 rows by 10:49:48 |
| b5 verify | 10:51:53-10:51:55 | PASS |
| b6 release | 10:51:59 | dblock released |
Machine time b1 to b6: 6 min 43 s.

## Stops before the pass (every one before or undone by r-restore; nothing of a stopped attempt stayed in the DB)
| Attempt | When | Stop | Cause | Fix |
|---|---|---|---|---|
| 1 | 2026-11-11 20:19:36 (before the lock) | b1 refused | zsh read `$BUILD:s…` as a history modifier | `${BUILD}` (orchestrator, re-pinned) |
| 1 | 20:20:48 | b2 `rls_on is 'true|true', want 't|t'` (L:1358); r-restore PASS (L:2542) | Postgres boolean||text gives `true` | the expectation fixed (orchestrator, re-pinned) |
| 2 | 20:23:15 | b4 the capture did not start (L:5129); r-restore PASS (L:6327) | the descriptor declared `retract: "departed"` on the composite key; the runner's write plan refuses it | `c137d509d` retract none (the recorded limitation), locked by runner-plan.logic.test.ts |
| 3 | 2026-11-12 08:58:58 | b4 the capture did not end RC=0 (L:7719): `invalid input syntax for type json`; r-restore PASS (L:8905) | trace and switches (jsonb) bound as JS arrays, which node-pg renders as Postgres array literals | `57a8995d3` JSON text at the write boundary (resolve-bylaws jsonText precedent), locked with node-pg prepareValue; b3 gained the rolled-back write probe |
| 4 | 09:54:39 | b5 `runs_completed_2plus is 'f'` (L:10332): both runs completed_with_warnings, 22 retired_var_row_present; r-restore PASS (L:11516) | the 22 old-engine variables of migrations 283/286, retired by L31-10, never deleted | `46954be37` migration 313 deletes exactly those 22 names, locked by retired-rows.logic.test.ts; the b5 check unchanged |
Stopped attempts are kept: `aborted-1`, `aborted-2-after-r-restore`, `aborted-20261112t085914`, `aborted-20261112t095512`.

## Findings
1. Non-gating: b5's "not_evaluated share by type" line errored (`aggregate function calls cannot be nested`, L:12998). Fixed in
   `blocks/b5.zsh` (the aggregate in a grouped subquery) for the next night; the figures above were measured read-only.
2. not_evaluated is 16.3 % over the cohort; no step check holds a limit on it (recorded follow-up in the MB-31 panel record).
3. Every number the preview shows reads Layer 2 version `4e7ea5d17e90`; a Layer 2 table_version move makes every Layer 3 row stale
   (the content_sha guard re-derives on the next run).
4. The night's own capture and witness trace were NOT committed: #44 arm (a) could not witness the declared logic_variables lookup
   (the witness resolver counts logic_variables as runner-owned). Decision D-54 (option A) moved the zone list to a declared shared config
   entry (commits 26196f898, fb2a4d875 on wf1/mb-rulings); the POST capture was retaken by the capture rerun job MB35-RECAP below, and
   that capture is the one committed.

## The capture rerun MB35-RECAP (2026-11-12, after D-54)
Job folder `~/Buildo-scratch/mcbylaws/mb35/recap/` (`RUN.md`; blocks c1-c4, r-release, r-restore; hash-pinned; `JOB_TARGET` picks the
database). It retakes only the step's POST capture the way `recapture.json` records it: the descriptor recovery.reset (DELETE the
detached_house rows), then capture-step-golden (run + rerun-zero proof). Every run was rehearsed on the local test stack (127.0.0.1:55322)
first, with the real commit hooks on the rehearsal captures (operator rule "1 and 2", 2026-11-12; `REHEARSAL.pass`).
Citations `R:` are lines of `recap/dev/recap.log`.

| Fact | Value | Source |
|---|---|---|
| The go | `OPERATOR-GO MB35-RECAP` | dev/recap.log |
| Tree | origin `008e95c60` (the D-54 commits plus MF-81); Layer 2 table_version in the repo `d312906ff10e…`; stored stamps `4e7ea5d17e90…` | REHEARSAL.pass, c1 |
| Rows | 293,913 on 1,921 lots before and after; per type 47 / 55 / 51 | c1, c3 |
| Runs | first `1921|90287|0` (records_total, new, updated), rerun `1921|0|0`, both completed (pipeline_runs 4447, 4448); capture exit 0, verdict PASS, rerun proof PASS, git_head `008e95c60` | dev/c3-runs.out, cap.out |
| Row check | values (status, value, unit) equal on all 293,913 rows; flags changed on 73,158 detached_house rows, each only by gaining `phase2_disclosures_not_current` in place of family words; 0 other rows rewritten | dev/c3-rowcheck.out |
| Golden 25 | 150 of 150 cells equal the McProof key | dev/c3-g25.out |
| Status mix | unchanged from the night: computed 234,058; not_evaluated 48,036; not_applicable 5,762; permitted 5,751; not_buildable 276; unregulated 18; not_permitted 12 | dev/c3-status.out |
| VACUUM FULL (operator "S2") | 638,623,744 -> 403,308,544 bytes (heap 592.2 -> 381.0 MB) in about 1 s | dev/c2-size-before.out, c2-size-after.out |
| Storage | scenarios 384.63 MiB; population 0.27; street index 3.49; Layer 2 754.95; total 1,143.34 MiB, under the 1,300 MiB line | dev/c3-storage.out |
| Timeline | c1 16:51:42-16:51:47; c2 capture 16:52:09-16:55:09, VACUUM FULL 16:55:09-16:55:10; c3 16:55:10-16:55:13; c4 16:55:13, both locks released | dev/recap.log |

Stops on the way (all undone; rows restored and checked each time):
| When | Stop | Cause | Fix |
|---|---|---|---|
| 14:41:19 (dev, first try) | c2 §reset: a vitest process was running (it started after c1's idle check) | another lane's suite; nothing written | amendment "recap a": c1 holds SUITE.lock for the whole job; c2 refuses before its claim instead of stopping |
| 14:52:50 (dev) | c3 `fp_detached_equal` | MCINC moved the repo table_version to d312906ff10e after the 12:4x rehearsal; the stored stamps are 4e7ea5d17e90, so re-derived rows carry the stale word in place of family words (values identical); the run also rewrote 172,472 other rows by flags only | amendment "recap a": a row check on values plus the stale-word rule; content fingerprints recorded, not a STOP; the rehearsal gate records origin_tip and table_version |
| 14:54:23 (dev) | r-restore `fp_others_equal` | same cause | the amended r-restore PASSED 16:03:40 (detached exact; others values-equal with the stale-word rule) |
| 15:54 (test stack, rehearsal B) | c3 storage line: 610.96 MiB scenarios | free space left in the table file by the rewrites (live rows about 334 MiB) | operator "S2": VACUUM FULL in c2, the line stays a STOP |

Findings of the rerun:
5. While the stored Layer 2 stamps (4e7ea5d17e90) are older than the repo table_version (d312906ff10e), every re-derived Layer 3 row
   carries `phase2_disclosures_not_current`; the committed capture records that honestly (73,158 detached rows plus the 172,472 other
   rows rewritten by the first dev try). The Layer 2 re-stamp night clears it on the next Layer 3 run.
6. The capture commit lands recapture.json (the bracket recipe), explained-diffs.json (no diffs, the first committed POST) and the census
   line legacy "none" (R-DK); with the registration pins that follow (EP-PIN-D17 blocks only steps whose legacy is not "none"),
   step-validate prints compute_maxbld_scenarios 17/17, #44 PASS, `standard=V3`.
