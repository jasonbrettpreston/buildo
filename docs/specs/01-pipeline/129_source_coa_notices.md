# 129 — Source: Committee of Adjustment decision notices (`load_coa_notices`)

**Status:** Implementation in progress (WF1, plan `.cursor/wf1_load_coa_notices_active_task.md` v3, operator-authorized 2026-10-07). Commit A has landed the table, the pure parser library (`scripts/lib/coa-notices/`), the PDF text extractor, the offline manifest tool and their tests. Commit B carries the compute (`scripts/lib/compute/load-coa-notices.js` and its tests), the acquisition seam (RE-FREEZE #32), the descriptor, the frozen shell and the chain. The compute cannot land alone: step-conformance pairs every compute module with a manifest step file, and the shell needs the RE-FREEZE. Commit B goes in with the fleet recapture in one H-lane slot, because gate G #39 refuses a `scripts/lib/step/**` edit without its recapture. The first pin, the first captures and the cutover come after that (§12).
**Archetype:** INGESTOR, converted under Specs 122/124 from day one. **Lock:** 129 (Spec 47 §A.5 row added in commit B).
**Chain:** `coa_notices` (standalone, operator-triggered, local-only).

**Steps:** 1 (`load_coa_notices`)

<requirements>
## 1. Goal

McBylaw Phase 2 needs an independent oracle: what the City's own zoning examiners said the by-law required on a real lot, on a real date. Toronto's Committee of Adjustment publishes a "Notice of Decision" for every minor-variance application. Each requested variance reads "To permit X, whereas the By-law requires Y" and cites a by-law chapter or section. `coa_applications` (Spec 51) stores none of this: it has no variance list, no required/proposed values, no citation and no decision text.

`load_coa_notices` reads a **pinned, sha256-verified manifest** of decision-notice PDFs (2017 first). It parses each variance item into one row of `coa_notice_variances` and stores **values only**: no PDF, no notice text and no names. The table is oracle C of McBylaw Phase 2 (`.cursor/mcbylaw/phase2-plan-DRAFT.md` §V-2 row C, D6, P2-12). The SC-5 comparison harness (Spec 72) consumes it.
</requirements>

---

<architecture>
## 2. Source and manifest (D2)

* **Source family `toronto_ca_decision_pdf`:** decision-notice PDFs under `https://www.toronto.ca/wp-content/uploads/2017/…`. They were found through the Wayback CDX index. `robots.txt` does not disallow the path (sha `ddc0e218…c8f7`, 2026-10-07).
* **The manifest** `scripts/seeds/coa-notices/manifest-toronto-2017.json` is committed after the first pin (§12). Its shape is `{source_family, user_agent, pace_ms, discovered_via:{cdx_query, run_at}, robots:{url, sha256, fetched_at, verdict}, terms:{url, sha256, fetched_at}, documents:[{doc_id, url, sha256, bytes, hearing_date, session, kind, revision, panel, pinned_at, wayback_ts}], excluded:[{url, reason}]}`. URLs carry the panel and the date only.
* **Closed sets** (`scripts/lib/coa-notices/manifest.js` `MANIFEST_CONTRACT`, validated by `validateManifest`): session ∈ {am, pm, full}; kind ∈ {committee, delegated}; revision ∈ {original, revised}; panel ∈ {etobicoke_york, north_york, toronto_east_york, scarborough, york, unknown}; excluded reason ∈ {http_404_at_pin, delegated_decision, operator_excluded}; pace floor 2000 ms. A manifest with a duplicate URL, a host outside the caller's allowlist, a malformed sha, a pace under the floor, or a document without `kind`/`session` is refused. A caller that supplies no allowlist is refused too (fail closed).
* `hearing_date` comes from the document title, because the notice text carries no hearing-date label (G8). It is verified at run time by check `mail_lag_out_of_bounds` (§10).
* **The offline tool** `scripts/analysis/coa-notices/build-manifest.mjs` is not a step. It reuses `sha256` and `stableStringify` from `scripts/analysis/bylaw/snapshot.mjs` by import, read-only. Extracting them into a new shared helper would have edited `scripts/analysis/bylaw/**`, which §13 puts out of scope.
  * `--discover [--cdx-file <saved>]` queries the CDX index (the query is recorded) and keeps the basenames that look like committee decisions.
  * `--pin` GETs each candidate strictly in sequence, with User-Agent `BuildInfo/1.0` (operator naming 2026-10-07; configurable with `--user-agent` and recorded in the manifest) and `--pace-ms` (default 3000, floor 2000). It checks the host allowlist on the request and on every redirect hop, caps the body, requires the `%PDF-` magic bytes and hashes the bytes in memory, then zero-fills them. It writes only the manifest row. robots.txt is fetched and its verdict is COMPUTED for every pinned path; a disallow, or an unreadable robots.txt, writes nothing.
  * `--verify` re-GETs every document and reports `{match, sha_changed, http_error}`; any non-match sets a non-zero exit code.
  * `--measure` runs the P0 measurements: per document, pages, notices, items and the mailed-lag days. It outputs numbers and ids only.
* **The 8 dead URLs** (HTTP 404 at pin) go to `excluded[]` (Q5 recommendation adopted). **Delegated decisions** are kept and flagged `decision_source = delegated` (Q11). `--exclude-delegated` moves them to `excluded[]` if the operator rules otherwise after P0.6.

## 3. PII contract (D3)

1. Raw bytes and extracted text exist **only in process memory**: inside the acquisition arm (fetch → extract) and inside `shapeDocument`. There is no cache, no temp file and no log line. The byte buffer is zero-filled after `shapeDocument` returns. Residual: JS strings are GC-managed (Known Failure Mode).
2. **No text column.** `variance_text` is not stored (Q7). Adjudicators read the source by `url` + `source_sha256` + `source_page`. The parser never reads the Owner/Agent header, so there is no name screen to get wrong.
3. Parser and extractor errors are **sanitised**: `COA_PARSE_E_<code> doc=<id> page=<n>`, `PDF_TEXT_E_BAD_ARGS`, and closed extraction codes {password, invalid_pdf, unknown}. They never carry text (T-PII-3, T-PDF-8).
4. **Column allowlist:** the table's columns are exactly `ROW_COLUMNS ∪ {retired_at, loaded_at}` (T-PII-1a/b/c). Every row `shapeRecord` returns has exactly `ROW_COLUMNS` keys (T-PROP-3). No module that holds text imports `fs`, writes a file or logs (T-PII-4).
5. P0/precision scratch text lives in the session scratchpad only and is deleted after measurement. CLI review seats and the DeepSeek engine receive synthetic text only. The spike tree `.cursor/mcbylaw/coa-spike/` is git-excluded through `.git/info/exclude`. That is local-only: on another clone it is declared, not enforced (LCN-D1).

## 4. Table `coa_notice_variances` (D4, migration 252)

One row per variance item. Column contract: see `migrations/252_coa_notice_variances.sql`.
* `variance_key` TEXT PK = `<source_family>|<application_number>|<item_ordinal>` (CHECK-enforced). It is a single key because `retract: "departed_mark"` refuses a composite key (`write.js:847`). The triple is also UNIQUE.
* `application_number` is a **soft reference** to `coa_applications`. There is no FK: an ingest compute cannot read the DB, and a 23503 would roll back the whole run. Plausibility P1 counts orphans.
* `item_ordinal` is the notice's **printed** item number, taken before any filtering. When a notice's printed numbers repeat (e.g. numbering restarts under a second by-law group) or are absent, the position within the printed section is used for the whole notice, and the notice is counted in `stats.ordinal_fallback_notices`.
* A `pair` row must carry both values AND both units (`chk_cnv_pair_values`).
* Closed sets are CHECK-enforced and equal `scripts/lib/coa-notices/vocab.json` `check_backed.*` in both directions (T-VOCAB): parse_status, parse_confidence, target_status (+ the sentinel coherence pair), decision, decision_source, citation_kind, unit {m, cm, m2, pct, ratio, storeys, spaces, units}, bound, plus the digit-initial `cited_bylaw` pattern, the 64-hex sha, positive page and ordinal, and non-negative values.
* `retired_at` is `written: insert_only` and is set or cleared only by the library MARK/UNMARK. `loaded_at` is `written: db_default`.
* RLS is enabled with zero policies (Spec 114 Class B). The pipeline role has `rolbypassrls`; the descriptor declares `guards.requires {kind: rls_bypass_or_policy}`.
* Indexes: PK; UNIQUE triple; `(application_number)`; `(target, target_status) WHERE retired_at IS NULL`. The table was new and empty at creation.

## 5. Parser and closed sets (D5)

* **Library** (`scripts/lib/coa-notices/parse-values.js`, pure, no tunables): `extractValues`, `relabelUnit`, `unitFamily`, `classifySide`, `splitPair`, `detectBound`, `isCompound`, `isQualified`, `parseCitation`, `classifyItem`, `mapTarget`. **Compute** (`scripts/lib/compute/load-coa-notices.js`): `shapeDocument(doc, cfg)` → `{doc_status, notices[], counts}`, and `reconcileNotices(docResults, {config})` → `{rows, stats}`. `doc` = `{doc_id, sha256, hearing_date, kind, revision, session, text_pages}`; each page is the `\n`-joined lines of the line-reconstruction contract (§11).
* **Changes from the spike `parse.mjs`.** Each one is a red-first case: T-PARSE-a…k, red against the committed spike baseline `src/tests/fixtures/coa-notices/spike-parser.cjs`.
  (a) `pair` requires both values in the same unit family, else `unit_family_mismatch`.
  (b) A compound required sentence (more than one united value, or plus / by (not By-law) / for each / no less than / where / or) is `multi_value_ambiguous`, confidence low; `high` needs exactly one required value. **See the open ruling below.**
  (c) Sides are classified by lexicon; a reversed `whereas` is `side_ambiguous`.
  (d) A number token has no internal space (`0 .357` yields no value); a comma followed by exactly 3 digits is a thousands separator (`1,200 m²` = 1200).
  (e) The unit relabel map is in `vocab.json`.
  (f) Page-number noise is filtered only at page edges, so a wrapped `10` mid-page survives.
  (g) The by-law token is digit-initial; a head ending `By-law No.` takes its token from the next line; `exception_ref` is kept beside a regulation; the full clause path is kept; more than one clause keeps the first, counted in `citation_multi`.
  (h) Dropped spike code: `sliceMatch`, `SLICE_*`, `descPairs`, `TOPICS`/`LAYER2`.
  (i) `qualified = true` for conditional / exception-qualified text, confidence at most medium.
  (j) The decision is read from the decision paragraph only. The first line naming a decision within `segmentation.decision_window_lines` of the anchor decides; conditions text is never read.
  (k) Consent (B-file) items inside a mixed notice are skipped and counted; the notice is kept.
  (l) Dates are calendar-validated before they can reach a DATE column (`February 30` → NULL, counted as unmeasured lag), so one bad mailed-on line cannot roll back the step-scoped write. A minor-variance block whose File Number cannot be read is counted `no_variance_section` (inside C4), never hidden as `not_minor_variance`.
* **Structural constants** (page-edge lines, head window, decision window, zone-label cap) are `vocab.json` `segmentation` data, versioned with `vocab_version`. They are not tunables.
* **Confidence:** `high` = pair + exactly one required value + `chapter_regulation` + not qualified; `medium` = any other pair; `low` = every other status.
* **Dedup** per application number (`reconcileNotices`). Keep the notice with a variance section; identical item lists are the same notice; a `revised` document beats `original`; differing lists keep the latest `hearing_date`; differing lists on the same date with neither revised → `duplicate_same_date_conflict`, all dropped. Tiebreak `source_sha256` asc, then page asc. A dropped notice's items become rows carrying `drop_reason`. `shapeRecord` turns them into counted skips, so row conservation holds: `rows_read` = every item.
* **⚠️ OPEN RULING (found at implementation, measured):** rule (b) collides with the pre-registered C3 thresholds. Re-parsing the spike's 579 items of By-law 569-2013 with the authorized rules gives pair 351, `multi_value_ambiguous` 160, pair rate **0.606** (P0.3, `parse-values` over `parsed-notices.json`, reconstructed bodies). C3 was pre-registered at WARN 0.85 / FAIL 0.80 from the spike's 0.883, which counted compound sentences as pairs. As authorized, every full run would FAIL C3 and write nothing. Measured alternatives on the same corpus: (i-a) keep `pair` when the required side has exactly one united value whatever the markers → 0.665; (i-b) keep `pair` when exactly one required value is in the proposed side's unit family → 0.672. Neither reaches 0.80, so the ruling (before the first run, §12) is between (ii) re-registering C3 against the new extractor's measured rate, or a real compound-sentence parse under a new `extractor_version`. C3 is seeded at the pre-registered 0.85/0.80 in commit B; the ruling must precede run 1 (LCN-D4).

## 6. Target mapping (D6)

`scripts/lib/coa-notices/target-map.json` holds `{version, entries:[{target, unit, any[], none[]}]}`. Every `target` is a McBylaw `dsl_target` (`scripts/seeds/bylaw/vocab.json`), and its `unit` equals that target's unit (T-MAP-1). **Rule:** an entry matches when one of its `any` phrases occurs in the required sentence and none of its `none` phrases occur; exactly one match ⇒ `mapped`, more than one ⇒ `ambiguous`, none ⇒ `unmapped`. Ambiguity is fixed by adding `none` phrases, never by a tiebreak. T-MAP-2 is red against the naive map (every target's own `patterns`, no `none`), which reproduces G9/G10.
* **Measured (P0.3, spike pairs):** 444 mapped, 7 ambiguous and 128 unmapped of 579 items of By-law 569-2013. C13 (`pair` rows whose unit family ≠ the target's) is 0. Restricted to pairs, because the 27 mismatches over all mapped rows sit on non-pair rows whose values are not claimed. C14 direction violations: 0 of 339 bound-known pairs.
* **Independence:** mapping uses only `vocab.json`, `target-map.json` and the library. T-IND walks the require graph of every ingestor module and fails on any path to `scripts/analysis/bylaw/evaluate.mjs`, `dsl.mjs`, the resolve-bylaws compute, `scripts/generate-bylaw-provisions.mjs` or `bylaw-provisions.json`. `regulation_id_as_cited` is stored verbatim; the harness joins it.

## 7. Linking (D7)

The step does not link. The consumer path is `application_number → coa_applications.lead_id → lead_parcels` (G1: 141/164 spike notices, `address_points_exact`, unique), with `retired_at IS NULL`. Link precision is measured at cutover (§12): a mechanical proxy (`zoning_as_stated` class vs the linked parcel's zone string) plus a seeded 50-notice sample read by a seat other than the plan author. Verdicts go to `scripts/seeds/coa-notices/link-precision-<extractor_version>.json` (`variance_key` + verdict only). Pre-registered: precision ≥ 0.95, else Spec 72 treats the source as `coa_link`-suspect (report-only).

## 8. Law at the hearing date (D8, consumer contract)

The comparison date is `hearing_date`, never CKAN `decision_date` (G3). The cited required value is the law as City staff read it that day, whatever the outcome; refused notices are equally valid. For a 2017 hearing the consumer compares only when every `[ By-law: … ]` tag on the cited unit has a verified `amendments.json` status and `in_force_on` (or `enacted_on` for a triggered in-force) ≤ `hearing_date`. Otherwise: `not_comparable:law_changed_after_hearing` or `not_comparable:amendment_status_unverified`. Untagged units are "presumed unchanged". That is **declared-only**, labelled in every round record (Q10 offers a Wayback law-as-of sample). `qualified = true` rows are compared against the notice's own `zoning_as_stated` first (G13). `cited_bylaw ≠ 569-2013` ⇒ `not_comparable:former_bylaw`.

## 9. Write order, idempotency, recovery (D9)

* `write_discipline`: class `guarded_upsert`, guard `is_distinct_from` over the value columns (not the version stamps, `loaded_at` or `retired_at`); `retract: "departed_mark"`; `scope: none` (the MARK is table-wide by construction); `retire_max_pct_from_config: coa_notices_retire_max_pct`; `txn_scope: step`; `idempotent_rerun: zero_writes`. No oracle row is ever deleted.
* **Staleness:** the triggers are the manifest's `content_hash` (computed inside the arm before any document GET) + `code_version`. `logic_version` is hand-bumped with `EXTRACTOR_VERSION` (gate #48). `fingerprint_inputs` = the compute, `parse-values.js`, `target-map.json`, `vocab.json`, `scripts/lib/pdf-text.js`. Unchanged → declared skip, no network. Changed → full re-acquisition.
* **Write order** (anchor for every `pre_write` check's `order_guarantee`): **no upsert and no MARK from a bad parse or an incomplete acquisition.** Every check that can reveal a broken extractor or a missing document (C1–C4, C7a, C9, C13, C15–C17) is `when: pre_write`, FAIL, or WARN with `on_warn: skip_write`. The library owns the empty-set and mass-retire guards. A tripped mass guard commits the upsert and suppresses the MARK with a FAIL row (Known Failure Mode).
* **Rule 12:** no `retract: all`/`full_only` target, so this is not a destructive full retraction. `recovery.interrupted: "none"`, `before_image: "none"`: one step-scoped transaction, a kill rolls back, and retire is soft and library-guarded.

## 10. Observability (D10)

* **Counters:** inserted + updated + retired on `coa_notice_variances` only.
* **Emits** (typed; object maps carry skeletons; `consumers: []` until Spec 72's harness exists): `docs_total`, `docs_by_status`, `docs_excluded`, `bytes_fetched`, `notices_by_status`, `items_total`, `items_by_parse_status`, `items_by_target_status`, `items_by_confidence`, `pair_rate_569`, `doc_pair_rates`, `citation_multi`, `consent_items_skipped`, `qualified_items`, `manifest_sha256`, `extractor_version`, `vocab_version` (`buildLoadMeta`).
* **Checks** (one compute function each, `fn.name === id`; T-CHECKS trips each one):

| id | when | measure | severity / limit |
|---|---|---|---|
| `doc_sha_mismatch` (C1) | pre_write | docs `sha_mismatch` | FAIL, `viol == 0` (a re-pin is a reviewed manifest commit) |
| `doc_acquire_failed` (C2) | pre_write | `http_error`+`timeout`+`too_large`+`extract_error`+`no_text_layer` | FAIL, `viol == 0` (a dead doc moves to `excluded[]` by commit; a skipped doc would get its rows retired) |
| `pair_rate_569` (C3) | pre_write | pairs / items of By-law 569-2013 | `value_min` from `coa_notices_pair_rate_warn_min`, `warn_limit` `value_min` from `coa_notices_pair_rate_fail_min`, FAIL, `on_warn: skip_write`; a null ratio is unevaluable ⇒ FAIL. **Registered only after the §5 ruling.** |
| `notices_without_section_pct` (C4) | pre_write | `no_variance_section` / minor-variance notices (signature pages excluded) | WARN `pct <=` `coa_notices_no_section_warn_max_pct` (10; spike 3.7 %), `on_warn: skip_write` |
| `mail_lag_out_of_bounds` (C7a) | pre_write | notices with mailed − hearing ∉ [0, `coa_notices_mail_lag_max_days`] | FAIL `viol <=` `coa_notices_mail_lag_viol_max`. Both are registered after `--measure` (P0.4) |
| `reason_totality` (C9) | pre_write | Σ by-status ≠ total at doc, notice and item level | FAIL `viol == 0` |
| `unit_target_mismatch` (C13) | pre_write | `pair` + `mapped` rows whose unit family ≠ the target's | FAIL `viol <=` `coa_notices_unit_target_viol_max` (0; P0.3 measured 0) |
| `doc_pair_rate_floor` (C15) | pre_write | docs with ≥ `coa_notices_doc_pair_rate_min_items` items of By-law 569-2013 and a pair rate < `coa_notices_doc_pair_rate_floor` | WARN `viol == 0`, `on_warn: skip_write` |
| `docs_no_notices` (C16) | pre_write | docs `no_notices_found` | FAIL `viol == 0` |
| `items_total_floor` (C17) | pre_write | `items_total` | FAIL `value_min` from `coa_notices_items_min` |
| `direction_violation_pct` (C14) | post | bound-known pairs with proposed on the permitted side | WARN `pct <=` `coa_notices_direction_viol_max_pct` (P0.3: 0 of 339) |
| `required_out_of_bounds` (C12) | post | required values outside the target-aware ranges `coa_notices_req_<range>_{min,max}` (`REQUIRED_RANGE_VARS`) | WARN `viol <=` `coa_notices_required_oob_max`; sample keys in detail, at most `coa_notices_oob_sample_max` |
| `precision_sample_version` | post | the committed precision sample for the current `EXTRACTOR_VERSION` | WARN `viol == 0` (declared-only at run time; the gating test is in §12) |

* **Plausibility** (post, own SQL, every query `WHERE retired_at IS NULL`, the `load-ravines` precedent): P1 `app_not_in_coa_applications` (anti-join, WARN `viol == 0`, retighten "0 on a full run"); P2 `decision_disagree` (refused vs CKAN refused); P3 `ckan_hearing_offset` (`|hearing_date − coa.hearing_date| > 1`, G11); P4 `active_dup_items` (active rows sharing application_number + item_ordinal across sources).
* **Pre-registration:** C3 at WARN 0.85 / FAIL 0.80 (spike 0.883, notice-clustered 95 % CI 0.851–0.912), precision ≥ 0.95 (Layer 2) / ≥ 0.90 (all), link precision ≥ 0.95. All are registered in `logic_variables.json` in a commit before the first full run. **A first-run WARN is resolved only by extractor work under a new `extractor_version`/`logic_version`, never by editing the threshold.** C3 is currently blocked by the §5 ruling.

## 11. Acquisition seam (D11, Spec 122 §8 RE-FREEZE #32 — commit B)

* **Rung ladder:** (a) existing formats: the payload is PDF. (a′) an offline tool → CSV → `filesystem` would move the parser out of the step (Rules 1/2). Multi-primary externals are format-bound and have no PDF format. A compute `ctx.fetch` is legal, but its output cannot reach the ingest write. (b)/(c) a check or shape rule cannot acquire. ⇒ `format: "pdf_document_set"` + a required `manifest` path; `allOf`: `pdf_document_set` ⇔ `manifest`, and `manifest` is forbidden on other formats.
* **Arm:**
  1. Read and hash the manifest; the skip decision comes before any GET, and `forced` from `override.force_run` is threaded through.
  2. Per document, sequentially: pace; host allowlist on the request and on every redirect hop; stream with a byte cap; check the `%PDF-` magic bytes; check the sha256 against the manifest.
  3. Extract in memory with `scripts/lib/pdf-text.js` `extractPdfText` (pdfjs-dist 6.4.299 pinned exactly; `isEvalSupported:false`; no font, cMap, worker or network fetch; page and text-character caps).
  4. Dispatch to `compute.shapeDocument`. The runner refuses a missing export before the HEAD, mirroring `shapeRecord`.
  5. Zero-fill the buffer.
  6. After all documents, `compute.reconcileNotices` → rows → the shared tail, with `rows_read` = items and drops counted as `shaped_skipped` reasons. `acquired.document_set` and `acquired.reconcile` carry the counts the checks read. The `else`-throw stays and its list gains `pdf_document_set`.
* **Line-reconstruction contract** (`extractPdfText`, T-PDF-2…4): text runs sorted by y descending then x ascending; a new line whenever |y − the line's first y| > `lineYTolerance`; runs within a line joined left-to-right with one space; whitespace collapsed.
* **Extractor (Q3):** `pdfjs-dist` (in-process, no host binary, no temp file, cloud-portable). `npm audit --omit=dev` was unchanged by the dependency (54 before and after, none in pdfjs-dist or @napi-rs/canvas; measured 2026-10-07). P0.2 parity against `pdftotext -layout` runs with the first fetch (§12).
* **Second source (a City bulk export):** the table, the closed sets, the parser contracts and the consumer path need no rework (`source_family` is a column). The **step** does: the library refuses two primaries targeting one table (B3) and filesystem/xlsx primaries (B9), and the `departed_mark` MARK is table-wide. So family 2 is a future WF: its own step writing its own table, or a scoped-`departed_mark` extension to `write.js` (its own RE-FREEZE) (Q13).

## 12. Chain, runtime, sequencing (D12, D13)

* Standalone chain **`coa_notices` = [`load_coa_notices`]**, operator-triggered. It is not in `chain_coa`: that chain is daily and CKAN-gated, and a toronto.ca failure must not stop the lead pipeline. It is not in `DISPATCHABLE_CHAINS` and is absent from `CHAIN_WORKFLOWS`, so cloud dispatch is impossible (ACC-1 `local_only`, Q6). Ordering against the `coa` chain is **declared-only**: `stepUpstreams` keeps same-chain producers only (`scripts/lib/ledger.js:160-161`), so no ORDER row exists for it.
* **Runtime (inferred until P0.2):** 69 docs × (3 s pace + 2–5 s download + extraction) ≈ 8–15 min; ≈ 0.4 GB per full acquisition, one document in memory at a time; ≈ 12K rows in one transaction. An unchanged manifest skips and transfers 0 bytes.
* **Sequence after commit A** (heavy steps are scheduled by the operator in the night H lane, never run by a seat):
  1. Commit B: RE-FREEZE #32, descriptor, notes, frozen shell, logic variables, chain wiring and the fleet recapture of the 27 converted steps (83 POST captures, gate #39), in one H-lane slot.
  2. Operator ruling on §5 (b) × C3; registration of the C3/C7a thresholds.
  3. `build-manifest --discover/--pin/--measure` (P0.1/P0.2/P0.4/P0.6), then the committed manifest (T-MAN-committed flips).
  4. Captures: run 1 captured (PRE empty → POST inserts; it must end `completed`), run 2 captured under `override.force_run` (0/0/0), run 3 unforced (skip); #44 trace; R-BQ `captured` rows.
  5. Precision sample (60 pairs) and link-precision sample (50 notices), read by seats other than the parser's author.
  6. OUTPUT panel, cutover (`converted.json`, census `converted`), `npm run test`, WF6.
* **Scorecard:** the assessment report at the dated `reportPathFor` path; G2 `ASSESSMENT-INCOMPLETE` ("net-new step, no churn history because no legacy script exists"); ledger rows `LCN-D<n>`, each CLOSED or PIN: LCN-D1 spike PII tree (CLOSED: moved + exclude; declared-only on other clones), LCN-D2 Spec 51 PK drift (PIN → review_followups), LCN-D3 CKAN hearing-date offset (PIN → review_followups), LCN-D4 the §5 (b) × C3 collision (PIN → operator ruling).
</architecture>

---

<behavior>
## 13. Behavioral contract

* **Inputs:** the pinned manifest; the documents it names (toronto.ca / web.archive.org only); logic variables `coa_notices_*`.
* **Core logic:** §11 arm → `shapeDocument` per document → `reconcileNotices` → guarded upsert + soft retire behind the §10 pre-write checks.
* **Outputs:** `coa_notice_variances` rows (values only); `records_meta` emits (§10); the audit table.
* **Edge cases:** sha mismatch; 404/500; timeout; cross-host redirect; HTML soft-404 (no `%PDF-`); oversized doc; page/text caps; no text layer; extractor exception; no notices; zero items of By-law 569-2013 (C3 null → FAIL); malformed manifest (bad sha, non-allowlisted host, duplicate URL); pace below 2000 → refused; extractor regression (pair rate under the floor) → no upsert, no MARK; mass-retire guard trip.
</behavior>

---

<failure_modes>
## 14. Known Failure Modes

- **Mass-retire guard trip** — an extractor change that shifts ordinals or drops items can retire more than `coa_notices_retire_max_pct` of the active rows. The library commits the upsert and suppresses the MARK with a FAIL row, so keys the new parse no longer yields stay ACTIVE (stale, not duplicated — the PK forbids duplicates within a family); the FAIL row's `retire_candidates` counts them, and P4 `active_dup_items` covers only cross-family duplicates. Remedy: fix the cause; raise `coa_notices_retire_max_pct` by ruling if the change is legitimate; rerun with `override.force_run`.
- **GC residual** — raw text lives in JS strings until garbage collection. The byte buffer is zero-filled, but string contents cannot be. Accepted: no disk, no log, no column ever holds them (T-PII-4).
- **Compound rule vs C3** — see §5 OPEN RULING (LCN-D4).
- **Consent-item heuristic unmeasured** — rule (k) recognises a consent item by a B-file number inside a variance item. Mixed-notice layouts were not in the spike sample, so the first `--measure` run reports `consent_items_skipped` for review.
- **Spike-text approximation in P0.3** — the spike stored split sentences, not raw bodies; P0.3 rebuilt bodies as `<proposed> whereas <required>`. The first real run re-measures every rate.
</failure_modes>

---

<testing>
## 15. Testing mandate (every file carries `SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md`)
<!-- TEST_INJECT_START -->
- **Logic (commit A):** `src/tests/steps/load_coa_notices/parse-values.logic.test.ts` (T-PARSE-a,b,c,d,e,g,i, T-BOUND, T-SIDE, T-MAPFN, T-PII-3), `target-map.logic.test.ts` (T-MAP-1/2), `manifest.logic.test.ts` (T-MAN), `src/tests/pdf-text.logic.test.ts` (T-PDF-1…10).
- **Logic (commit B, with the compute):** `parse.logic.test.ts` (T-PARSE-f,g-wrap,j,k, signature page, dedup, T-PII-text), `checks.logic.test.ts` (T-CHECKS), `src/tests/property/coa-notice-parse.property.test.ts` (T-PROP-1…4), `src/tests/ingest-prereq-pdf-acquire.logic.test.ts` (T-ACQ), `violations.test.ts` (C-1…C-14).
- **Infra:** `vocab-check-parity.infra.test.ts` (T-VOCAB), `library-shape.infra.test.ts` (T-SHAPE) in commit A; `pii.infra.test.ts` (T-PII-1, T-PII-4) and `independence.infra.test.ts` (T-IND) in commit B; `src/tests/db/coa-notice-variances.db.test.ts` (T-DB, `npm run test:db`).
- **Red evidence:** `docs/reports/red-evidence/load_coa_notices/*.json` (vitest JSON). Each red run selects the baseline by env: `COA_PARSE_IMPL=spike`, `COA_TARGET_MAP=naive`, `COA_CHECKS_IMPL=inert`, `COA_MANIFEST_IMPL=permissive`.
<!-- TEST_INJECT_END -->
</testing>

---

## 16. Future improvements

- **City bulk request (Q12, operator 2026-10-07: recorded, no work now).** Ask the City of Toronto for a machine-readable table of minor variances (application number, by-law, regulation, required and proposed values, decision). If granted it becomes source family 2, a CSV adapter writing the same columns (§11 second-source path), and it would extend the oracle from ~1,450 lots (2017 PDFs) to ~20,000.
- A Wayback law-as-of sample for 2017 (Q10), so the "presumed unchanged" consumer label can become measured.

---

<constraints>
## 17. Operating Boundaries

### Target Files
- `migrations/252_coa_notice_variances.sql`
- `scripts/lib/compute/load-coa-notices.js`
- `scripts/lib/coa-notices/parse-values.js`, `scripts/lib/coa-notices/vocab.json`, `scripts/lib/coa-notices/target-map.json`, `scripts/lib/coa-notices/manifest.js`
- `scripts/lib/pdf-text.js`
- `scripts/analysis/coa-notices/build-manifest.mjs`
- `scripts/seeds/coa-notices/` (manifest, precision and link-precision samples — after §12 steps 3/5)
- commit B: `scripts/load-coa-notices.js`, `scripts/load-coa-notices.descriptor.json`, `scripts/load-coa-notices.notes.json`, the `pdf_document_set` arm in `scripts/lib/step/acquire.js` and its dispatch in `scripts/lib/step/index.js`
- tests listed in §15; `src/tests/fixtures/coa-notices/`

### Out-of-Scope Files
- `scripts/load-coa.js` (Spec 51) — the CKAN loader; its PK/date drift is filed, not fixed here.
- `scripts/link-coa-to-parcels.js`, `scripts/enrich-permits.js` (Specs 42/66) — linking is the consumer's path (§7).
- `scripts/generate-bylaw-provisions.mjs`, `scripts/analysis/bylaw/**` (Spec 68) — independence (§6): imported only for `snapshot.mjs`'s pure `sha256`/`stableStringify`, never edited.
- The SC-5 comparison harness (Spec 72 / P2-12).

### Cross-Spec Dependencies
- **Relies on:** `51_source_coa.md` (`coa_applications.application_number`, soft reference), `68_mcbylaw_standard.md` / `69` (`vocab.json` `dsl_target`, `amendments.json`), `122_pipeline_step_optimization.md` / `124_step_standard_policy.md` (the step standard; RE-FREEZE #32), `114_rls_policy_catalog.md` (Class B).
- **Consumed by:** Spec 72 (McBylaw Phase 2 SC-5 harness, P2-12), `validate-round.mjs`.
</constraints>
