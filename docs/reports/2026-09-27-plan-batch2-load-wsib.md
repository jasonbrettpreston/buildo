# Active Task: batch-2 Phase 3 row 3.5 — `load_wsib` conversion (INGESTOR, compressed ①②③, class A `guarded_upsert`)
**Status:** Authorized 2026-09-27 (operator "y", all 11 recommendations accepted incl. ci_green_for_sha)
**Workflow:** WF2 (step conversion). Architecture Spec 122, procedure Spec 123, policy Spec 124 (13 rules + §5 register), method Spec 121 §4.3 (zero behaviour change; defects pinned, fixed after).
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`).
**Execution Provider:** deepseek (SUB-ENG-1) for mechanical writes (briefs ≤5 KB; every brief carries the `## Gate answers` field, `docs/runbook/engine-brief-template.md:46-52`). **claude** for goldens, forced-change proof, `registry_reserved` edits, `npm run cutover`, `step-validate --write`, and every landing that changes compute (G8). Downgrade reason: verification seats, live DB, registries. Draft engine run `20260928T005022Z-55da566a` (skeleton only; every claim below re-grounded by the orchestrator).
**Form:** `**Commit form: compressed (R-PACE-1)**`. INGESTOR has 4 converted members (`load-ravines`, `load-address-points`, `load-parcels`, `load-centreline` in `converted.json`) [READ converted.json]; R-AH makes compressed the default.
**Depends on (in order):** (1) `.cursor/wf2_conversion_simplification_active_task.md` items 1, 2, 4, 7, 8, 9 landed. Items 2+7 are staged in the main tree now (`capture-guard.js`, `capture-rerun-proof.js`) [MEASURED git status]. Items 8 (row conservation) and 9 (`code_sha`) have LANDED in `5ece69b1` (`rowConservation` index.js:1238 via `scripts/lib/step/conservation.js`; `code_sha` 6 hits in index.js) [MEASURED 2026-09-28; supersedes the earlier "0 hits"]. (2) Library rung `0fs` (§4). (3) Queue order: massing ②③ → neighbourhoods (0w) → this step. One committer.

## Context
* **Goal:** convert `scripts/load-wsib.js` (448 lines [READ full]) to the standard step with zero behaviour change. Pin its defects with WS-D ids and fix them after the cutover. The step must be diagnosable from its own descriptor, notes and audit rows.
* **Target Spec:** `docs/specs/01-pipeline/52_source_wsib.md` (owner, 3.3 KB [READ full]) + `43_chain_sources.md` step 19 [READ 43:50, :176, :211, :289]. System map row 43/52 index these files [READ 00_system_map.md:43,:52].
* **Key Files:** `scripts/load-wsib.js` → frozen shell; new `scripts/load-wsib.descriptor.json`, `scripts/load-wsib.notes.json`, `scripts/lib/compute/load-wsib.js`, `src/tests/steps/load_wsib/violations.test.ts`.
* **Database Impact:** NO schema change. The `wsib_registry` end state must be byte-identical between legacy and converted runs over the same file (G8).

## 1. Target file review (four sections, operator ruling 2026-09-27)
Reproduce with:
```
git grep -n -E "load_wsib|load-wsib" -- scripts src docs/specs ':!docs/reports'
git grep -n "wsib_registry" -- scripts src ':!src/lib/db/generated'
git grep -n -E "unique_class_g|skipped_non_g|skipped_no_name|total_csv_rows|skip_no_name_rate" -- scripts src
git grep -n -E "naics_description|subclass_description|is_gta" -- scripts src
grep -n -i wsib migrations/*.sql
```
READ key: **full** = the whole file; **hits** = every grep-hit line with ±5–20 lines of context.

### 1a. FILES: the Spec 122 §4.1 set derived from the slug. Each must be in Spec 52 `### Target Files` (today that list has one line [READ 52 §5])
| File | READ | Touched | Behaviour impact | Registration | Spec updated same commit |
|---|---|---|---|---|---|
| `scripts/load-wsib.js` | full | ② → 3-line `pipeline.step()` shell | the whole step; lock 97 [READ :84] | Spec 52 §5 ✓; manifest :38; census :361-366 `INGESTOR/C5` | 52 §5 as-built at ② |
| `scripts/load-wsib.descriptor.json` | n/a (new) | ② create | declares everything the script did | add to 52 §5 at ② | ② |
| `scripts/load-wsib.notes.json` | n/a (new) | ② create | operator annual-refresh procedure (moves from the chain-skip audit rows :113-116) | add to 52 §5 at ② | ② |
| `scripts/lib/compute/load-wsib.js` | n/a (new) | ② create | `coerceKey` (=`normalizeName` :34-42), `shapeRecord` (G-filter :289-292, `buildRow` :60-82, `isGTA` :54-58), `dedupeBySourceId` (G-preference :311-317), checks | add to 52 §5 at ② | ② |
| `src/tests/steps/load_wsib/violations.test.ts` (+ fixtures) | n/a (new) | ① create | the red suite | add to 52 §4/§5 at ① | ① |
| `scripts/lib/step/acquire.js`, `scripts/lib/step/index.js`, `scripts/steps/_schema/step.schema.json` | hits (index.js :636-760, :790-900; write.js :1275-1300; schema `externals` item) | `0fs` only (§4) | library rung, all INGESTORs | Spec 122 Target | 0fs commit (Spec 122 §8 RE-FREEZE row) |

### 1b. DATA: the legacy script's measured reads/writes, each with its migration
| Table / column set | READ | Touched | Behaviour impact | Registration | Spec updated |
|---|---|---|---|---|---|
| `wsib_registry` W: `legal_name, trade_name, legal_name_normalized, trade_name_normalized, mailing_address, predominant_class, naics_code, naics_description, subclass, subclass_description, business_size, is_gta, last_seen_at` [READ :225-229] | migrations `040` full; `044`, `054`, `056`, `063`, `066`, `227`, `243`, `244` hits | ② (declared, same rows) | UNIQUE `(legal_name_normalized, mailing_address)` [READ 040:24; MEASURED pg_indexes]; `mailing_address` NULLABLE [READ 040:12] → WS-D6 | 52 §2 table | 52 §2 at ② (adds `last_seen_at`, `first_seen_at` DB default) |
| `wsib_registry` NOT written by this step: `linked_entity_id, match_confidence, matched_at` (link_wsib), `primary_phone, primary_email, website, last_enriched_at` (enrich_wsib_registry), `first_seen_at` (DB default), `id` | hits 044/063 | no | fence: the step must never write these columns (test `link-wsib-ledger-gate.logic.test.ts:110-114` locks `linked_entity_id`) | 46, 60 | — |
| RLS on `wsib_registry` | hits 227:100 | no | `relrowsecurity=true`, 0 policies, `rolbypassrls=true` [MEASURED] → `guards.requires` rls_bypass | 124 guards | ② |
| FK `wsib_registry.linked_entity_id → entities` | [MEASURED pg_constraint] | no | no inbound FKs, so a DELETE/reinsert perturbation is safe (not used anyway) | — | — |
| Input: local CSV `BusinessClassificationDetails(YYYY).csv` via `--file` [READ :87-133] | the 2025 file, 64,164,918 B, md5 `9fc9adbf…ef37` [MEASURED]. **It is in `~/Downloads/`, NOT `data/`** [MEASURED 2026-09-28]. `/data/` is gitignored (.gitignore:51), so it must be copied into `data/` of the capturing tree before PRE/POST | ② via `0fs` | 345,416 rows; 212,056 non-G; 0 no-name; 121,116 unique [MEASURED parse] | 52 §2 | ② |
| `pipeline_runs` (standalone self-insert + finalize :143-154, :428-443) | full | ② (runner-owned) | the runner owns the row in both modes | 47/122 | — |

### 1c. CONSUMERS: `emits[].consumers` + `consumer-registry.json` rows + grep for undeclared readers
Declared today: **none**. `consumer-registry.json` has no `load_wsib` producer row [READ :145-165]; its only `wsib_registry_count` rows are link_wsib self-consumption. The emitted flat keys (`unique_class_g`, `skipped_non_g`, `skipped_no_name`, `total_csv_rows`) have 0 readers outside one source-text test [MEASURED grep → `chain.logic.test.ts:655-658` only].
| Reader | READ | Touched | Reads | Impact / fence | Registration |
|---|---|---|---|---|---|
| `scripts/link-wsib.js` + `.descriptor.json` + `.notes.json` + `lib/compute/link-wsib.js` (converted) | hits (descriptor :23 `load_wsib gte`, staleness `upstream_ledger` table `wsib_registry` count; compute :26, :467) | no | `wsib_registry` COUNT (trigger); names/addresses for matching | load_wsib must keep row identity; count unchanged under zero-diff. VERIFY-INT-1: what `version_pin:"gte"` compares once load_wsib has a descriptor | 60, 43 |
| `scripts/enrich-wsib.js` (claude_only, PII [READ exec-policy.json:55]) | hits :480-570 | no | `is_gta = true`, `naics_description IN (6 strings)` :509-527, contact cols | **fence for WS-D1:** its whitelist holds the SUBCLASS strings that `naics_description` actually carries. Fixing WS-D1 alone empties this queue | 46 |
| `src/features/leads/lib/get-lead-feed.ts` | hits :100-115 | no | `is_gta = true` + enriched rows | WS-D5 data defect: 0 GTA rows locally ⇒ empty builder CTE | none (unregistered; followup) |
| `scripts/enrich-web-search.js` :342, :581; `src/lib/builders/enrichment.ts` :51, :180; `src/app/api/entities/[id]/route.ts` :54-55 | hits | no | `naics_description`, contacts via `linked_entity_id` | route shows `naics_description` as NAICS text; it is subclass text (WS-D1) | 46/F92 |
| `scripts/lib/compute/assert-data-bounds.js` :301-329 + `assert-data-bounds-fields.js` :223-226 + `assert-data-bounds.descriptor.json` :133, :1122-1197 | hits | no | no-name, non-G, bad NAICS, orphan links | unchanged under zero-diff | 43/41 |
| `scripts/lib/compute/assert-global-coverage.js` :460 + fields :277-278 + descriptor :464, :4405-4442 | hits | no | link coverage | none | 41 |
| `scripts/quality/audit-fk-orphans.js` :142; `scripts/validate-migration.js` :33; `scripts/generate-assert-data-bounds-descriptor.js` :84 | hits | no | FK/size lists | none | — |
| `src/lib/admin/funnel.ts` :280, :666, :830-835, :953 | hits | no | loader slug list; expected bounds `records_total [0,500]` | first converted real load writes ≈47K updates, which exceeds the funnel bound, so the funnel shows WARN once. Expected; stated in notes | 26/48 |
| `src/app/api/admin/stats/route.ts` :186-198, :422; `src/app/api/quality/route.ts` :234; `src/components/{FreshnessTimeline.tsx:62-63, DataQualityDashboard.tsx:29}`; `src/lib/quality/types.ts:687` | hits | no | counts / labels | none | — |
| `scripts/lib/step/{index.js:1596-1853, write.js:111, :1586}`, `scripts/lib/source-version.js:333` | hits | no | comments naming load-wsib as sole row creator | stays true | 122 |
| `scripts/seeds/lineage-meta-snapshot.json` :3171-3200; `scripts/surfaces/**` (16 files, lineage `produced_by: load_wsib`) | hits | no | lineage data (slug unchanged) | none | surfaces census |
| `scripts/steps/_schema/{step-archetype-census.json:361, programme-items.json:1718/2037/2069, staleness-disposition.json:122, standard-gates-ledger.json:1397, write-class-disposition.json, step.schema.json:704/1984/2008}` + census fixtures | hits | ③ via `npm run cutover` (census status, write-class `declared_by`) | registries | CLOUD-PRE, VEL-1, VEL-2 cutover_prereqs all BUILT [MEASURED] | — |
| `scripts/manifest.json` :38, :106; `scripts/amnesty.json` :83 | hits | ③ parity only; amnesty row retires with the legacy `NOW()` | — | — |
| `scripts/analysis/probe-csv-acquire.mjs` :18 | hits :1-30 | `0fs` (adds a local-file arm) | heap measurement tool | 122 |
| `docs/runbook/README.md` §5 :295-320 | full section | ② | procedure changes with decision D1 | runbook |

### 1d. TESTS: `src/tests/steps/load_wsib/**` + every test naming the script or its table
| Test | READ | Touched | Disposition |
|---|---|---|---|
| `src/tests/steps/load_wsib/violations.test.ts` | new | ① | red suite (§6) |
| `wsib.infra.test.ts` :60-110, :190 | hits | ② | `:82` "requires --file flag" is a source-text lock on the retired seam. Re-point it to the descriptor's declared filesystem external, same intent |
| `wsib.logic.test.ts` :1-30 | hits | ② | mirrors `normalizeName` inline. Re-point to `require` the compute (one resolver). Its SPEC LINK `docs/specs/35_wsib_registry.md` does not exist [MEASURED ls] → fix to 52 |
| `chain.logic.test.ts` :615-625, :655-660, :935-945 | hits | ③ via cutover (derived fleet lists, simplification item 4) | `:655-660` asserts the `>= 110000` literal → re-home to the descriptor's `limit_from_config` (address_points/parcels precedent) |
| `pipeline-sdk.logic.test.ts` :1110-1118, :2065-2105, :2745 | hits | ③ | `:2068` B4 flush lock (`DEDUP_FLUSH`) re-homed to a heap measurement (Guardian fence c5ced678); `:2096` chain-skip lock → the declared skip terminal |
| `pipeline-advisory-lock.infra.test.ts` :55-65 | hits | ② verify | lock 97 via `identity.lock` |
| `link-wsib-ledger-gate.logic.test.ts` :29-37, :74-136 | hits | ② | `:110-114` reads the legacy DO UPDATE SET text → re-point to the descriptor's written-column list (fence intact: `linked_entity_id` never written) |
| `steps/link_wsib/violations.test.ts` :526-554, :1013-1019, :1378, :1406 | hits | no | load_wsib-owned column exclusion; stays green |
| `db/load-wsib-finalize.db.test.ts` (spawns the script with `--file`) | hits :4-113 | ② | Commit-E fence (stranded running row). Re-point to the converted invocation; the runner owns finalize |
| `deepseek-exec-pii-globs.infra.test.ts` :92-104 | hits | no | load-wsib.js stays engine-writable ✓ |
| `quality.{logic:649,:1338; infra:976}`, `step-library.logic.test.ts:2836,:5044`, `admin-manifest-utils.logic:57`, `capture-step-golden.logic:367`, `db/lead-feed-saved-state.db:147-207`, `db/ledger-gate-callers.db:143-145`, `db/migration-244…:5-30`, `db/migration-246…:49`, `enrich-wsib.infra:5`, `entities.infra:61`, `gate-captures.infra:363`, `gate-consumer-registry.infra:20`, `gate-emits-equiv.infra:17`, `link-wsib-registry-count.logic:3-14`, `steps/assert_data_bounds/missing-table-guard:9-25` | hits | no | slug/table name references; stay green |

## 2. Current-behaviour ledger → converted seat
| # | Legacy [READ line] | Converted seat |
|---|---|---|
| 1 | Input = `--file <csv>` argv :87-133; no file in chain ⇒ SKIPPED PASS + 4 INFO rows :90-125; no file standalone ⇒ throw :127 | `externals[0] {kind:"filesystem", path:"data/BusinessClassificationDetails*.csv", format:"csv", csv_options:{bom:true, relax_quotes:false}, key_property:"Legal name"}` + `0fs` path resolution (decision D1), plus `execution.shape:"ingest"` and `guards.srid:"none"` (both required by 0fs). An absent file lands the declared terminal `skipped_no_source_file`: kind `skip_gated`, status COMPLETED, `when:"pre"` checks only [READ index.js:5302-5313, :5648-5650]. 0fs refuses a path primary that lacks this terminal. `step-conformance.infra.test.ts:2109-2125` (LPA-D4) requires ≥1 `when:"pre"` check whenever a `skip_gated` terminal exists, so ② must declare one. **Retired:** the legacy chain-skip audit rows `status`/`current_file`/`file_date`/`reason`/`instructions` (:98-116). The instructions move to `notes.json` at ②; the resolved file surfaces as `acquired.source_path`. This is declared in the G8 explained diffs |
| 2 | Header check on the first row: `Legal name`, `Predominant class`, `Mailing Address` :274-284 (throws `Schema drift`) | declared `required_columns` check, `viol == 0`, run before the write (terminal `failed_schema_drift`) |
| 3 | G filter: `predominant_class` or `subclass` starts with `G` :286-292 | `shapeRecord` returns `"non_g"` (0p skip reason) ⇒ `shaped_skipped_by_reason.non_g` |
| 4 | `normalizeName` + no-name skip :294-299 | `coerceKey` ⇒ library `bad_key_count` (WS-D7 attribution) |
| 5 | Dedupe key `legalNorm|address`, prefer G-predominant; 5,000-row flush window :186-188, :305-333 | `compute.dedupeBySourceId` over the whole array, same preference. Window-vs-global delta = **0 keys** on the 2025 file [MEASURED] (WS-D2 retired as unexercised) |
| 6 | `buildRow` :60-82; `is_gta` = substring match on 25 GTA names :45-58 | `shapeRecord` (GTA list = vocabulary, Rule 4) |
| 7 | Upsert, batches of 2,000, one `withTransaction` per flush :198-259; 9-column IS DISTINCT FROM guard excluding `last_seen_at` :242-250 | class A `guarded_upsert`, `guard_columns` = the same 9, `last_seen_at` written but unguarded, `txn_scope:"step"` (address_points Fold B3 precedent: atomicity widens, success rows identical) |
| 8 | `unique_class_g` WARN `< 110000` :387 | check `wsib_unique_class_g`, `limit_from_config: load_wsib_unique_class_g_warn_min` |
| 9 | `skip_no_name_rate` WARN when `>= 1%`, denominator `unique + no_name` :378-392 | check emits the **percentage** (never a 0/1 flag; see `.cursor/wf3_skip_rate_never_fails_active_task.md`), `limit_from_config: load_wsib_no_name_skip_warn_pct`; ① locks the 1.0 boundary |
| 10 | counters `records_total = inserted + updated`, `records_new = inserted` :397-399 | counters parity (WS-D3 pinned) |
| 11 | flat `records_meta` keys `duration_ms, total_csv_rows, unique_class_g, records_inserted, records_updated, skipped_non_g, skipped_no_name` :401-407; `audit_table` phase 11 | `emits[]`: `audit_table` + one `wsib_load` block holding the seven keys (parcels `parcels_load` precedent [READ load-parcels.descriptor.json emits]). 0 readers ⇒ an explained G8 diff |
| 12 | `emitMeta` source/target column lists :373-376 | library-derived |
| 13 | lock 97; DB clock `RUN_AT` inside the lock :135-136 | `identity.lock:97`; runner clock → `last_seen_at` |
| 14 | standalone self-inserted `pipeline_runs` row + try/finally finalize (Commit E 1ffa7478) :143-182, :422-444 | runner owns the ledger row (fence preserved by design; the db test re-points) |
| 15 | no staleness gate (every run with a file parses and upserts) | `staleness.trigger:"none"` (parcels precedent [READ parcels descriptor]); rerun cost is borne by the guard |

## 3. Defect ledger (pin wrong-form in ①; fix after ③, each its own RED→GREEN)
| ID | Finding [evidence] | Disposition |
|---|---|---|
| WS-D1 | csv-parse `columns:true` keeps only the LAST of the two `Description` headers. The CSV header has `Description` twice [READ file head]; the parsed keys contain one [MEASURED]. So `naics_description` = subclass text (27 distinct = 27 subclasses vs 142 NAICS codes) and `subclass_description` NULL on 121,116/121,116 [MEASURED]. The `descKeys.length > 1` branch :64-66 is dead | Carry the code. Fix later as one WF3: library CSV duplicate-header naming (schema byte ⇒ RE-FREEZE) + move `enrich-wsib.js:509-517` whitelist to `subclass_description` **in the same commit** (claude-only file). Decision D3 |
| WS-D2 | G-preference only within the 5,000-row flush window :309 | Converted global dedupe is a behaviour change on paper only: 0 keys differ [MEASURED]. Declared deviation with that measurement |
| WS-D3 | `records_total = inserted + updated`, not rows read :397 | pinned; runner counters record `rows_read` separately |
| WS-D4 | Chain never loads (no `--file` in chain) [READ :89-126; ledger: last 6 runs `records_total 0` MEASURED] | Carried by decision D1 |
| WS-D5 (data) | `is_gta` true on **0/121,116** locally, while migration 066's own predicate matches **47,040** [MEASURED]. Runbook §5 records the same all-false state in the cloud [READ README:297-313]. The code is correct; the stale data predates 066 (first/last_seen 2026-03-05; 066 applied 2026-07-18) [MEASURED] | Not a code change. The forced-change proof repairs local; cloud is repaired by the first post-cutover run (runbook §5). Reality-Check invariant (§9) |
| WS-D6 | `mailing_address` nullable in a UNIQUE key: a NULL-address row never conflicts and would duplicate on every reload [READ 040:12,:24] | Latent: 0 NULL addresses [MEASURED]. Pinned as a limitation + an invariant check `wsib_null_address_count` `viol == 0` |
| WS-D7 | Attribution order: the library counts no-name before the G filter, legacy after (a non-G row with no name moves from `skipped_non_g` to `bad_key`) | 0 such rows on the 2025 file [MEASURED `nonGnoName=0`]; declared limitation |
| WS-D8 | Spec 52 §3 Edge Cases "truncated download could drop matched builders" is stale: the step never deletes [READ :224-252; followups :3194] | Spec 52 corrected at ② (doc only) |

## 4. Library prerequisite `0fs` (one plan file, one lean panel: Integration + Guardian on acquire/index)
Measured gap: `runIngestPhase` picks `externals.find(e => typeof e.url === 'string' && e.url.length > 0)` [READ index.js:650], so a `filesystem` external is never acquired. `validateGeometries` throws when no column binds `wkb_geometry` [READ write.js:1278], and wsib has no geometry. load_wsib would be the first INGESTOR without geometry.
* **(a) filesystem acquisition.** `externals[].kind:"filesystem"` (already in the frozen enum) plus one new optional field `path` (a repo-relative glob; newest match by name). `acquire.js` stream-hashes the local file (same `hashThrough`, fence 0b230472) and parses it with the existing `csv` arm. No HEAD. A missing file returns a declared skip reason. **Schema byte ⇒ RE-FREEZE (next free number at landing; #26 is taken by 27ca5bea and 0w will take the next one).**
* **(b) no-geometry INGESTOR.** When the plan binds no geometry column, the runner skips `validateGeometries` and carries every kept row. No schema byte. Locked both directions in `step-library.logic.test.ts`.
* Byte-identical for every converted INGESTOR: absent `path`/kind gives today's path. Orchestrator-lands with `load_ravines`, `address_points`, `parcels`, `load_centreline` recaptures only if their `fingerprint_inputs` name `acquire.js`/`index.js`.
* **Replaces:** the argv `--file` seam and the hand-written data/ scan (:93-104). **Removes:** the only per-step input that no descriptor can express.

## 5. Logic variables (all `on_invalid: "fail"`, seeds byte-equal to the legacy literals, admin group "WSIB Registry")
| Legacy literal [READ] | Variable | Consumer |
|---|---|---|
| `110000` :387 | `load_wsib_unique_class_g_warn_min` | `wsib_unique_class_g.limit_from_config` |
| `1` (%) :392 | `load_wsib_no_name_skip_warn_pct` | `wsib_no_name_skip_rate.limit_from_config` |
| `DEDUP_FLUSH_SIZE 5000` :186, `BATCH 2000` :200, `65000` :220, `50000` progress :335 | none. Retired with the library whole-array path and stride (declared deviation, address_points :485-497 precedent) | — |
Vocabulary, not tunables (Rule 4 → `notes.json` + check `why`): `SUFFIXES` :28-31, `GTA_CITIES` :45-52, the `G` prefix, the three required headers. No wsib variable is seeded today [MEASURED seeds grep: only `wsib_fuzzy_match_threshold`, `link_wsib_*`].

## 6. Commits
- [ ] **0fs** (library; own plan `.cursor/wf2_ingest_prereq_0fs_active_task.md`; claude plan → deepseek execute → orchestrator lands with RE-FREEZE row + freeze refresh). Lands before ②.
- [ ] **① red suite + assessment + PRE goldens + red evidence**: `feat(52_source_wsib): batch2 row 3.5 ① — assessment + red suite + PRE goldens (load_wsib, INGESTOR class A, compressed)`. Orchestrator-lands.
  * Report `docs/reports/2026-XX-XX-batch2-p3-5-load-wsib-assessment.md`: PH-0 boundary freeze (§2); Intent Ledger (fences: Commit E 1ffa7478, B4 streaming c5ced678, G-subclass replacement 7338b009, is_gta ba3ad8a2, `git log -S` each); seam map (DB, clock, filesystem, argv); WS-D1..D8 appended to `docs/reports/defect-ledger.md` (prefix free [MEASURED]); non-determinism inventory (`id`, `first_seen_at`, `last_seen_at`, file mtime).
  * `violations.test.ts` (SPEC LINK Spec 52): G filter both arms, no-name skip, dedupe G-preference, `is_gta` true/false + case-insensitivity, header-drift terminal, absent-file terminal, 9-column guard excludes `last_seen_at`, never writes `linked_entity_id`/contact columns, no-name rate at exactly 1.0 ⇒ WARN, WS-D1/D3/D6/D7 pinned. RED by construction. `converted.json.pending {stage:"red_suite"}`.
  * **Red evidence (gate K) at ①:** commit the vitest JSON of this red run now. Compute is absent, so the run is non-destructive. Centreline had to rebuild this in a throwaway worktree.
  * Heap probe: `0fs`'s local-file arm of `probe-csv-acquire.mjs` on the 2025 file; the number goes into the report (Guardian fence c5ced678).
- [ ] **② descriptor + compute + shell + seeds; POST goldens**: `feat(52_source_wsib): batch2 row 3.5 ② — descriptor + compute + frozen shell + seeds; POST goldens (zero-diff)`. Orchestrator-lands (G8).
  * Briefs: `b2-row3.5-c2a-descriptor.md`, `-c2b-compute.md`, `-c2c-shell-notes-seeds.md`, `-c2d-repoints.md` (§1d tests re-pointed in place, never weakened). Each carries Gate answers (§8).
  * Seeds applied locally (`apply-logic-variables.js`, verify VALUES). Spec 52 as-built in this commit: §2 columns incl. `is_gta`/`last_seen_at`, §3 edge cases (WS-D8), §5 Target Files, runbook §5.
  * POST captures come last (capture guard: five-word PASS first), then `--compare`.
- [ ] **③ cutover**: `npm run cutover -- --step=load_wsib` generates converted.json + pending delete, census, freeze check, groups/registry docs, consumer registry, roadmap/backlog, system map, `step-validate --all --write`. Then Spec 43 step 19 as-built; `B2-OWNER-SPEC-DIFF`. Exit: `npm run test` (1 fork). Orchestrator-lands.
- [ ] **④a WS-D1** (decision D3) · **④b WS-D6** hardening if D6 ruled.
- [ ] **④c stale-file tripwire** (operator 2026-09-30: follow-up after cutover). A skip on `no_source_file` (always, in the cloud) is PASS with no file name/age; legacy `current_file`/`file_date` rows retired. Needs a WARN when the last load (`MAX(wsib_registry.last_seen_at)`) is older than a new logic variable. Compute is pure, so this needs a declared read (design pass first). Source: ② output Observability finding 2.
- [ ] **④d B4 memory lock** (Guardian MED-LOW): the pipeline-sdk lock is source-string plus the deviation's "172.04 MB" text; pin it numerically (probe ceiling, or a numeric deviation field that a test compares).
- **Landing notes (2026-09-30):** G8 PRE key mismatch resolved by Spec 124 R-BD (ebb43d8f, operator ruling); ①+② land as ONE combined commit (operator); ② output panel: the Code Reviewer DeepSeek CLI findings were adjudicated, 1 cosmetic confirmed; fixes F1–F6 (INFO `records_unchanged` + `duplicate_key_count`, ordinal comments, deviations[2] widening text, D9 enrich-wsib pin, WS-D9 ledger row, Spec 52 checks bullet); same-session PRE+POST recapture in Buildo-wt-wsib2.

## 7. Captures and forced-change proof (claude; no other seat holds the DB)
Local DB carries a natural, real perturbation: WS-D5's 47,040 stale `is_gta` rows. A legacy or converted load of the 2025 file must update them, so no synthetic perturbation is needed.
1. `CREATE TABLE wsib_registry_bak_<date> AS TABLE wsib_registry;`
2. PRE sources: `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/load-wsib.js --chain=sources --args=--file,"<abs path>/BusinessClassificationDetails(2025).csv" --table-columns="wsib_registry:legal_name_normalized,mailing_address,legal_name,trade_name,trade_name_normalized,predominant_class,naics_code,naics_description,subclass,subclass_description,business_size,is_gta,linked_entity_id" --table-order=wsib_registry:legal_name_normalized,mailing_address --out=docs/reports/golden/load_wsib/pre/sources.json`. Expect `records_updated ≈ 47,040` (exact number recorded; the JS and SQL GTA predicates match the same 25 names).
3. Restore: `UPDATE wsib_registry w SET is_gta=b.is_gta, last_seen_at=b.last_seen_at FROM wsib_registry_bak_<date> b WHERE b.id=w.id;`. Then PRE standalone (`--chain=none`, same args) → `pre/standalone.json`.
4. After ②: restore, then POST sources (file placed per D1, no `--args`) → `post/sources.json`. The same-session check (item 2) and two-run proof (item 7: run 2 must write 0 through the guard) run inside the tool. Restore, POST standalone. `--compare=pre/X,post/X` for both: data hash identical.
5. Drop the backup. The final state keeps the repaired `is_gta` (true data).
Row conservation (item 8) on these runs: `rows_read 345,416 = non_g 212,056 + bad_key 0 + duplicates 12,244 + (inserted+updated+unchanged) 121,116` [MEASURED parse].

## 8. Five-word gate plan (R-BA; ZERO ledger rows: hard stop for new conversions)
| Word | Gate | Closed answer load_wsib uses | First passes |
|---|---|---|---|
| STANDARDIZED | A closed bounds | 2 checks `limit_from_config` (§5); every other check `viol == 0` | ② (from ① the pending slug is evaluated as-converted, item 1; descriptor gates are N/A until ② exists) |
| | I registries | census row, staleness-disposition (no `fingerprint_inputs` ⇒ no row owed), WS-D ids unique, banned values | ① |
| OBSERVABLE | C emits≡emitted | `audit_table` + `wsib_load` declared = POST captured keys | ② |
| | D consumer registry | generated rows only. The completeness scan must find 0 undeclared readers of `wsib_load` (0 today [MEASURED]) | ② |
| SCALABLE | B on_invalid | both variables `"fail"` | ② |
| | E compute literals | 0 numeric module constants; lists are strings (vocabulary) | ② |
| UNDERSTANDABLE | F floor 14/17 + LF | scorecard at ③ (`--write`), LF paths | ② measured, ③ written |
| | J spec staged | Spec 52 in ①, ②; Spec 43 in ③ | ① |
| ACCURATE | G nonzero + explained diffs | POST sources `records_updated ≈ 47,040`; the `wsib_load` regrouping explained in `explained-diffs.json` | ② |
| | K red evidence | committed vitest JSON at ① | ① |
| | two-run zero-writes | `idempotent_rerun:"zero_writes"`; run 2 = 0 through the guard | ② |
| | row conservation | identity in §7 | ② (needs simplification item 8) |
Ledger rows: **0**. No gate needs an exception.
**Canary (past bugs of this class the gates must catch):** (1) write.js TEXT-key 0-rows (`6457e713`; wsib's composite TEXT key) → row conservation + G nonzero. (2) Rewrite-every-row LS018 → two-run proof (`last_seen_at` accidentally in `guard_columns` would rewrite 121K rows per run). (3) camelCase rename evading the literal ban (`dedupFlushSize`) → gate E. (4) skip_rate reported as a 0/1 flag that can never FAIL → §2 row 9 + the WF3. (5) Stranded `running` row (Commit E) → runner-owned ledger + the re-pointed db test. (6) Silent column mis-map (WS-D1) → Reality-Check's distinct-count eyeball (no gate reads column semantics; stated, not claimed).

## 9. Reality-Check bounds (plan altitude; derived fields `is_gta`, `legal_name_normalized`)
* Invariant `is_gta = (mailing_address matches the 25 GTA names)` on every row: `viol == 0` post-load. Today 47,040 violations [MEASURED]. Share post-load ≈ 38.8% (47,040/121,116).
* `COUNT(*) ≥ load_wsib_unique_class_g_warn_min` (121,116 [MEASURED]); every row G by predominant or subclass (existing `wsib_no_g_class` check).
* `legal_name_normalized` non-null (NOT NULL [READ 040:10]); 211 rows still end in INC|LTD|CORP|LIMITED [MEASURED]. This is the two-pass suffix limit, INFO only.
* WS-D1 eyeball: `COUNT(DISTINCT naics_description) = COUNT(DISTINCT subclass) = 27` vs 142 codes. RC must report it as a known defect, never as sane.

## Gate answers (for every brief)
Variables: `on_invalid:"fail"` (gate B). Check limits: `limit_from_config` naming a declared variable, or `viol == 0` (gate A). `emits[]` keys = exactly `audit_table`, `wsib_load` (gate C). Consumers only from gate D generation. Compute: no numeric module constants; unit math only via `scripts/lib/units.js` (gate E). `write_discipline`: `class:"guarded_upsert"`, `guard:"is_distinct_from"`, 9 `guard_columns`, `retract:"none"`, `txn_scope:"step"`, `idempotent_rerun:"zero_writes"`.

## Panels (Spec 08 §6.4)
PLAN: Integration (VERIFY-INT-1 `version_pin gte`; -2 no-geometry path; -3 standalone ledger name `load_wsib`; -4 `--args` pass-through for the legacy PRE), Idempotency Lens (guard, rerun), Reality-Check (§9), one DeepSeek spec lens (grounded). OUTPUT: Regression Guardian (fences in ①; enrich-wsib whitelist fence), Code Reviewer grounded, Observability.

## Standards Compliance
* **Try-Catch / logError:** no new catch in compute (Rule 2); `0fs` catches use `logError`.
* **Unhappy paths:** absent file, header drift, empty CSV, NULL address, lock contention, duplicate keys across the old flush boundary.
* **§11:** pipeline script uses the SDK via `pipeline.step()`. Streaming (§9.5) is traded for the library whole-array path, measured at ① (address_points 525K precedent). No API/UI/migration. Cross-layer thresholds live in logic_variables, not literals.
* **DB Impact:** NO.

## Operator decisions
* **D1: where the file comes from.** (A) `path: "data/BusinessClassificationDetails*.csv"`, the same glob the legacy chain-skip already scans [READ :94-97]. The chain loads a dropped file; a re-drop costs 0 writes through the guard; the cloud has no file, so it skips exactly as today. (B) an env var path; chain behaviour stays byte-identical. **Recommend (A):** one declared input and no per-invocation seam (Spec 122 §5.1; R-AZ posture on argv seams). The only change fires when the operator drops a file. Declared as WS-D4's deviation.
* **D2: approve `0fs`** (RE-FREEZE, one optional schema field + no-geometry arm). **Recommend yes:** Spec 124 Rule 1 rung (d), reused by any file-fed INGESTOR; the alternative is a per-step hatch.
* **D3: WS-D1 fix timing.** **Recommend:** pin now; fix after chain_sources completes as one WF3 that renames the duplicate header in the library and moves the enrich-wsib whitelist in the same commit, so the Serper queue cannot silently empty.
* **D4: cloud `is_gta` repair.** It needs the first real cloud load (runbook §5) after cutover. **Recommend:** schedule it with the owed cloud mig 248 + seeds.

> **PLAN LOCKED. Do you authorize this WF2 plan (0fs, then ①②③, then ④)? (y/n)**
> §11 note: the streaming-ingest item (§9.5) is traded for the library whole-array CSV path; it is measured at ①, and a breach stops the plan, not the fence.

## Operator ruling 2026-10-01 — #27 ROW-ERROR-GATE
`wsib_no_name_skip_rate` severity WARN → **FAIL** (Spec 124 R-AX: a tolerant `on_row_error:"skip"` must cite a FAIL-severity bound check). Declared deviation WS-D# (legacy warned at ≥1% ≈1.2K rows; measured skipped_no_name = 0, so no behaviour change today). Edit descriptor + Spec 52 :61 + violations-test pin; merge main (census conflict vs 57f7bedb); re-run cutover; operator POST recapture (is_gta cohort first) + assert_schema ×4.
