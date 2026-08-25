# Active Task: Phase B — sources-chain incrementalization (WF2)
### (P0 CLOSED — record retained below)

**Status:** **P0 ✅ SHIPPED AND ARRIVED** — branch `1cb4e308`, cherry-picked to **`origin/main` = `91567f6f`**, all five code files byte-identical, 305 python tests green *on main*, Spec 47 §5.1 amended in place. Thursday's 15:00Z deep-scrapes slot runs the fix.
**NOW ACTIVE: Phase B**, plan of record `.cursor/phase_b_active_task_INPROGRESS.md`. Sub-plans: `.cursor/phase_b_b4_plan.md`, `.cursor/phase_b_b5_plan.md`.

---

## 📄 FULL REPORT → [`docs/reports/2026-08-21-sources-chain-shape-and-phase-b-learnings.md`](../docs/reports/2026-08-21-sources-chain-shape-and-phase-b-learnings.md)
*Contains the 27-step MASTER TABLE (objective + posture per step), the corrected duration figures, and a **confidence register** grading every claim. **Read §8 before relying on any number here** — several figures below were corrected after the report's own audit.*

> **⚠ CORRECTION to L-1 below (2026-08-21):** the duration figures in L-1 are **averages over ALL rows including FAILED runs** and are inflated by up to 8,000×. Corrected medians over completed runs: `enrich_parcels` **46.5** (not 387) · `link_massing` **13.7** (not 41.2) · `link_parcels` **0.3** (not 2447). One 39-day strand skewed `link_parcels` alone. The *conclusions* survive — `enrich_parcels` is still the largest step, loaders are still trivial — but the magnitudes do not. **Strands poison every duration statistic computed off `pipeline_runs`.**
> **⚠ CORRECTION to L-2:** the comps scope is **426,732** (measured), not the inherited 351,899 — and **incremental mode touches 0 rows**, because every eligible parcel already has `comp_count`. So `--full` is currently the *only* refresh mechanism; removing the pin would freeze comps forever. The defect is that the only two behaviours are "rewrite 426,732 every run" or "never refresh" — P11-2's gate is the missing middle.

## ⚡ SESSION LEARNINGS 2026-08-19 — read before touching any Phase B step

**The headline: Phase B's stated objective is largely already met, and the real cost is somewhere else than the plan targets.**

### L-1 · Where the time actually goes (measured, cloud, all history)
| Step | avg min | The plan's framing |
|---|---|---|
| `enrich_parcels` | **387.2** | — largely unaddressed |
| `enrich_centreline` | 52.6 | "single biggest cost" — already gated (P11-1) |
| `link_massing` | 41.2 | already gated (P11-2) |
| `parcels` / `massing` / `load_centreline` **(loaders)** | **2.4 / 1.5 / 0.3** | — |

**The loaders are NOT the problem.** All three load in under 5 minutes combined. The cost is the joins over 486K parcels afterward. *(`link_parcels`' 2447-min average is orphaned `running` rows — the B6.6 class — not real duration.)*

### L-2 · ⚠ THE BIG ONE — a manifest pin disables an incremental path that already exists
`enrich-parcels.js` **already has** incremental mode: `const incr = full ? '' : 'AND sp.comp_count IS NULL'`. But `manifest.json` pins `"enrich_parcels": {"chain_args": {"sources": ["--full"]}}`, and the script reads it as a bare OR with **no gate** (`:1668`). So **every sources run forces full**, `incr` empties, and ~351,899 parcels are rewritten regardless of change — on the 387-min step, against `parcels` (5,806 MB, **38.9% cache-hit**, with `permits` 87% of all 915M disk block reads).
**The precedent is already in-repo and fixes exactly this:** `link_massing` had the identical defect; **P11-2** (`scripts/lib/massing-full-gate.js`) made `--full` *permit* rather than *force*, with a **data signal** (corpus count vs last run) **plus a code signal** (`LINK_MASSING_CODE_VERSION` — because a pure data gate would have silently skipped the `b16c036` predicate flip). `enrich_parcels` is the **second of exactly two** `--full` pins in the manifest; the other one was gated a month ago. → **B4.5**.
**Corrects my own earlier proposal:** the comps `IS DISTINCT FROM` guard is the WRONG fix — it would suppress writes inside a full pass that should not be running full. Fold D (`a81c6a7c`) was right to decline the guard, but declined it on *counter-honesty* grounds and never looked at the pin above it.

### L-3 · The stated objective is already met by 10 of 11 loaders
Guarded upsert (`ON CONFLICT` + `IS DISTINCT FROM`): permits, coa, wsib, address-points, parcels, massing, neighbourhoods, zoning, ravines, heritage. **`load-centreline` is the sole exception** — Spec 62 **L26** mandates staging-table full-replace, but it costs **0.3 min avg for 47,410 rows** and is HEAD/ETag-gated, so it is a bounded, spec-sanctioned deviation, not a defect. `load-ravines`' and `load-massing`' scoped deletes are **correct departure-handling**, not violations.

### L-4 · Three Phase B premises refuted by grounding — all from text carried forward by reference
* **B4** — *"widen/fallback/stamp so they converge"* is refuted by **Spec 62 `:374`**: the zero-intersection tail is **"legit-NULL"**, **"permanent ~14.5K"**, already instrumented (**L21**), gate PASSes at 2.98% vs a 10% WARN floor, cost *"seconds, not 92 min"*. Stamp-with-defaults would **destroy the signal the incremental design depends on**. B4 collapses to documentation + one gate-design guard.
* **B5** — *"D3 already calls `package_show` for the latter two"* is refuted by the code: only `load-zoning.js:362` fetches it. Scope is **7 pinned CKAN loaders** (operator ruling), not 3 — `load-neighbourhoods` was omitted entirely. **B5 saves zero minutes** (its loaders cost 1-2 min each) — it prevents a *break*, not a delay.
* **B6.6 item (b)** — a self-expiring TTL inside the B3 gate — is **superseded by E-R2** and would break the lock at `source-version-ledger-gate.db.test.ts:92`.

### L-5 · Citations rot exactly where the plan's own steps edit the file
The force-full argv target went stale **twice**: v3 `:1317` → fold corrected to `:1378` → **now `:1668`**, because B2 (`e8793c8f`) added 389 lines *after* the correction. `FreshnessTimeline.tsx`/`DataQualityDashboard.tsx` are at `src/components/`, not `src/components/admin/`; `stats/route.ts` IN-list is `:326` not `:321`, the 192h constant `:344` not `:338`. **Cite by greppable anchor (function/const name), not line number** — §4.6.

### L-7 · The SHAPE of the sources chain — 27 steps characterized (static sweep, all 27 scripts)

**The Spec 47 skeleton is applied UNIVERSALLY. This is the chain's real strength and it should not be disturbed:**

| Property | Coverage |
|---|---|
| `ADVISORY_LOCK_ID` (§R2/§R6 — *"No exceptions"*) | **27 / 27** |
| `pipeline.run()` wrapper | **27 / 27** |
| `emitSummary` (§R10) | **27 / 27** |
| `emitMeta` (§R11) | **27 / 27** |
| `audit_table` in `records_meta` (Spec 48) | **27 / 27** |

**Archetype composition:** 9 loaders · 6 links · 4 enrichers · 3 computes · 5 asserts. Variation below the skeleton is **archetype-appropriate, not drift** — 12/27 upsert (the writers), 19/27 carry `IS DISTINCT FROM`, 8/27 delete (2 of those correctly scoped to departed rows), asserts write nothing.

**Three genuine inconsistencies — all structural, all already costing something:**

1. **Dual ledger rows (redundancy that bites).** Four steps — `assert_schema`, `load_wsib`, `assert_data_bounds`, `assert_engine_health` — call `pipeline.run()` **AND** hand-roll their own `INSERT INTO pipeline_runs … 'running'`. Only `load_wsib` has a `try/finally` (Commit E). **So `assert_schema`, `assert_data_bounds`, `assert_engine_health` strand a `running` row on any throw** — this IS B6.6's strand factory, and 3 of its 6 named scripts sit inside this chain. `assert-schema.js` is the worst: its CKAN/CSV/GeoJSON fetches throw *before* the finalize.
2. **Gating is ad-hoc — four different mechanisms, no common interface.** `source-version.js` tiers (ravines, heritage, centreline, zoning) · a bespoke `records_meta` version-compare inside `enrich_centreline` (Spec 62 §3.11 P11-1) · `massing-full-gate.js` (P11-2) · B3's `runLedgerGateDecision` (link-wsib, link-parcel-addresses, compute-parcel-cost-estimates). Roughly **9 of 27 steps are gated at all**, and a new step has no obvious pattern to copy. *(Detection caveat: my sweep looks for the four helper names, so `enrich_centreline`'s bespoke gate reads as ungated — it is not. The false negative is itself the finding: a gate with no shared interface is invisible to any census.)*
3. **Two `--full` pins, only one gated** — see **L-2**.

**Verification / error handling / observability, as a posture:** verification is strong and *layered* — 5 assert steps in-chain, plus `check-chain-verdict.js` at the workflow level, plus the watchdog. Observability is genuinely uniform (27/27 audit rows). **Error handling is the weak axis:** only 5/27 scripts have any `try/finally`, and the SDK's `pipeline.run()` is what saves the other 22 — which is exactly why the 4 hand-rolled rows are dangerous, since they sit *outside* the protection everything else relies on.

**Read against the objective:** the chain's problem is **not** its shape. Loading, locking, summarizing and auditing are standard and disciplined. The cost is that *gating is patchy and one pin defeats an existing incremental path* (L-2) — a configuration and coverage problem, not an architectural one.

### L-6 · Sequencing consequence
**B4.5 ahead of B5.** B4.5 is on the critical path (387-min step); B5 is not (saves 0 min). B4.5's measurement also satisfies **Spec 118 §9.1's own stated condition** for re-opening the enrich-parcels → heap-decorrelation negative result (*"could not reach the cloud instance"* — this session can).

---

## P0 record (CLOSED — retained for provenance)

**Status:** shipped `91567f6f`. Originally: v3, fully re-grounded after the operator ruled v1/v2 insufficiently grounded. Every claim carries the command that produced it.
**Domain Mode:** **Backend/Pipeline** (`scripts/*.py`, `scripts/tests/*.py`) — `scripts/CLAUDE.md` + Spec 44.
**Workflow:** WF3 (Fix). Doctrine: Spec 119 (§1 stage 2 "no unexecuted executable claim", §2 ladder, §4.7 inherited-fact rule, §5.6 proportionality). Envelope: Spec 118. Protocol: **Spec 47 §5.1**. Observability: Spec 48. Chain: Spec 44.
**Rollback Anchor:** `15951ec8`
**Severity: HIGH** — deep_scrapes red on its last slot; next slot **Thu 2026-08-20 15:00Z**.
**Database Impact: NO.** No migration, no `logic_variables` key, no `_contracts.json` row, no `db:generate`, no `factories.ts`.

> **Phase A** closed — record at `.cursor/closed_task_phase_a_2026-08-16.md`. **Phase B** at `.cursor/phase_b_active_task_INPROGRESS.md` (B3 committed through fold F, `4bb44fbb`); resumes as P1 below.

---

## §0 GROUNDING LEDGER — every claim, its command, its result

**Provenance key:** `[ME]` executed by the orchestrator · `[SEAT→ME]` first reported by a review seat then **re-executed by me** (Spec 119 §4.7 — an inherited fact is not a grounded fact) · `[SEAT]` executed by a seat, NOT independently re-run, and flagged as such · `[INHERITED]` not executable in this environment, cited to its source.

### A. The defect

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| A1 | A raw connection (no `createPool`) to **cloud** inherits a 2-min cap | `pg.Client` w/o `withPipelineStatementTimeout` → `SELECT current_setting('statement_timeout')` | `{"current_user":"postgres","stmt":"2min"}` | [ME] |
| A2 | Node pools are exempt | same query via `pipeline.createPool()` | `stmt_timeout: "0"` | [ME] |
| A3 | The 08-19 failure IS this cap | `gh run view 32270233708 --log-failed` | `psycopg2.errors.QueryCanceled: canceling statement due to statement timeout`, step died at **144.8s** | [ME] |
| A4 | ⚠ **DOWNGRADED — not a controlled measurement** | see note | **The 60.9s and 0.225s figures are from DIFFERENT QUERY TEXTS.** 60.9s was a `COUNT(*)` over the populate_queue predicates **minus** the `SUBSTRING(...)::int <= EXTRACT(YEAR…)` filter, on a cold cache; 0.225s was the **full** `SELECT DISTINCT` minutes later on a warm cache. Indicative of cache state, **NOT an A/B**. The grounder also got an **Index Scan**, not the `BitmapAnd` I recorded — plan may have flipped after the 13:09 autoanalyze, or we ran different texts. Cold state is unreproducible now. **NOT load-bearing:** the fix is justified by A1+A3 alone (a hard 2-min cap on a statement that demonstrably exceeded it); A4 only ever explained *why* it exceeded. Any future use must re-measure with one fixed query text. | [ME] — **flawed method, owned** |
| A5 | Substrate, not code | `git log -1 -- scripts/aic-orchestrator.py` | `d6eb9f31` **2026-08-04** (pre-dates the regression) | [ME] |
| A6 | Same pathology as Spec 118 §1 | `pg_statio_user_tables` / `pg_stats` on cloud | `permits` heap-hit **50.7%**; `correlation(status)` = **0.5867** — the identical value 118 §1 recorded | [ME] |

### B. Scope of the class

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| B1 | **2** `psycopg2.connect()` factories | `grep -rn "psycopg2.connect" scripts/*.py` | `aic-orchestrator.py:144`, `aic-scraper-nodriver.py:373` (a third hit at `:2042` is a docstring, not code) | [ME] |
| B2 | **10** `get_db_connection()` CALL sites (+2 `def` lines = 12 grep hits) | `grep -n` both files | orchestrator `:538, :640`; scraper `:2073, :2828, :2844, :2872, :3661, :3682, :3725, :3794`. **CORRECTION:** v3 first said "12 call sites" — that counted the two `def` lines. 10 is right. | [ME] |
| B3 | **Exactly ONE** site touches `.autocommit` | `grep -n "\.autocommit"` both files | `aic-scraper-nodriver.py:2074` only (`OutcomeWriter._connect`). No other caller reads or writes it → no other caller can be affected by the restore-to-`prev`. | [ME] — OPEN-1 **CLOSED** |
| B4 | The two factory bodies are byte-identical | `diff` of the two 9-line blocks | `IDENTICAL` | [ME] |
| B5 | `PIPELINE_STATEMENT_TIMEOUT_MS` is Node-only **in code** | full-repo grep | **4 files**, not 2: the only CODE files are `scripts/lib/pipeline.js` + `src/tests/pipeline-sdk.logic.test.ts`; the other two are prose (`47_pipeline_script_protocol.md`, `tasks/lessons.md`). **Zero hits in `.github/`** — so it is never set in CI. *Corrected: v3 said "only X + Y", which undercounted a literal full-repo grep.* | [ME] + [GROUNDER] |

### C. Premises the fix's DESIGN rests on

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| C1 | psycopg2 raises if `autocommit` is set mid-transaction | live probe, psycopg2 **2.9.11** | `ProgrammingError: set_session cannot be used inside a transaction` | [ME] + [SEAT] concur |
| C2 | **A bare `SET` leaves the txn OPEN** — so the naive fix BREAKS `OutcomeWriter` | probe: `SET statement_timeout TO 0` then read `transaction_status` | **2 (INTRANS)**, and the subsequent `autocommit = True` **RAISED** | [ME] + [SEAT] concur |
| C3 | `pg_sleep` IS cancelled by `statement_timeout` | `SET 300` then `SELECT pg_sleep(2)` | `QueryCanceled`, **pgcode 57014**, at 0.50s not 2s | [ME] + [SEAT] concur |
| C4 | **The SET does NOT survive `conn.rollback()` under the naive impl** | my probe vs `127.0.0.1:54322/postgres` | **naive → after rollback `pg_settings.setting` = `500` (REVERTED)**; fix-shape → `0` (survived). The fix would have silently un-applied itself. | [SEAT→ME] |
| C5 | The scraper actually calls `rollback()` | `grep` | `aic-scraper-nodriver.py:2137, :2791, :3089, :3136` | [SEAT] — cheap, re-grep at implementation |
| C6 | `SHOW`/`current_setting` NORMALIZE units | my probe | `SET 300000` → `SHOW` = **`'5min'`**, `pg_settings.setting` = **`'300000'`**. **v2's L4 assertion was simply wrong.** | [SEAT→ME] |
| C7 | `ALTER ROLE … IN DATABASE` **LEAKS** | seat attempted it live | `DROP ROLE` failed on the `GRANT CONNECT` dependency; role survived teardown | [SEAT] — **deliberately NOT reproduced** (reproducing a leak means risking one; C8 makes the mechanism moot) |
| C8 | `PGOPTIONS` imposes a hostile default with **zero** server mutation | my probe | fresh conn `SHOW` = **`500ms`**; `pg_sleep(2)` → **57014 @0.50s**; fix-shape → setting `0`, `pg_sleep(2)` **completes 2.00s**; after unset → fresh conn sees `0`, **no residue** | [SEAT→ME] |

### D. Fences (intent preservation)

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| D1 | An **existing source-shape lock** governs these files | read `src/tests/aic-python.parse.smoke.test.ts` | bans `int\(os\.environ\.get\('[A-Z_]+', '[^']*'\)\)` — a naive impl breaks CI immediately | [SEAT→ME] |
| D2 | The JS reference **predates** the empty-string lesson | `git log -1 --date=iso` on both | `fa9e984c` **11:06:46**, `86868387` **15:30:11**, same day — **4h24m** apart, JS never revisited | [SEAT→ME] |
| D3 | So "mirror the JS" would import a bug | read `pipeline.js:62-69` | `raw === undefined ? 0 : parseInt(raw,10)` → `''` → `NaN` → **throws** | [SEAT→ME] |
| D4 | No prior ruling excluded the python scripts | read `review_followups.md:2833` | the exclusion is scoped to **`migrate.js`'s raw Pool**, not the AIC scripts → this is new coverage, not a reversal | [SEAT→ME] |
| D5 | No behavioral lock exists on these files today | `scripts/tests/` census | all mock; `grep -rn "import psycopg2\|BUILDO_TEST_DB" scripts/tests/` = **zero hits** | [SEAT] |

### E. Environment (the trap I fell into)

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| E1 | **TWO local Postgres instances exist** | `pg_isready` on both | `localhost:5432` ✅ (has a `buildo` db) **and** `127.0.0.1:54322` ✅ (Supabase stack, `postgres` db) | [ME] |
| E2 | ✅ **RESOLVED — the duplicated `PG_*` block is DELETED (operator-authorized 2026-08-19)** | key-duplication scan; `.env` edit; re-probe | `.env` had **5 duplicated keys** (`PG_HOST/PORT/DATABASE/USER/PASSWORD` at lines 1-5 **and** 10-14). Lines 10-14 are labelled *"Local Supabase (authoritative dev DB from Phase 0.8 cutover)"*; **lines 1-5 were pre-cutover legacy never removed.** python's loader is FIRST-wins, Node's `dotenv` LAST-wins → the two runtimes read **different databases**. **Legacy block removed** (backup `.env.backup-2026-08-19`, replaced by an explanatory header). Post-fix: **0 duplicated keys**; **Node → `127.0.0.1:54322/postgres`; python → `127.0.0.1:54322/postgres`. They now agree.** | [ME] |
| E2b | **This was a live latent defect, not just a test problem** | — | Since the Phase 0.8 cutover, `aic-orchestrator.py` and `aic-scraper-nodriver.py` have silently run against the **pre-cutover** DB on any local invocation. Never bit in CI because the workflows supply `PG_*` directly. **A third consumer was also affected:** `scripts/ai-env-check.mjs` was validating `localhost:5432`; it now reports `127.0.0.1:54322` + "DB in sync". | [ME] |
| E3 | ⚠⚠ **v3's E3 was FALSE and its "correction" made things worse** | `sed -n '36,56p' scripts/aic-orchestrator.py` | v3 claimed *"python does not read `.env`"* and confessed a `lessons:83` error. **Both wrong.** Python DOES read `.env` (module-level loader `:40-48`). My FIRST probe (`localhost:5432/buildo`) was hitting **exactly the instance the python scripts use**; the "corrected" wrapper moved me to the **Node** instance, which is the wrong one for this fix. I corrected a non-error into an error and recorded the false lesson. **Retracted.** | [ADVERSARY→ME] |
| E3b | ✅ **RESOLVED — schema confirmed on the now-agreed target** | import-probe against the python-resolved DSN | `current_database()` = **`postgres`**; `permit_scrape_outcomes`, `scraper_queue`, `pipeline_runs` **all present**; `schema_migrations` = **241**, matching `migrate --verify`'s 241/241. The stale-schema hazard is gone because the stale instance is no longer the python target. **L3's INSERT can safely target the outcomes ledger.** | [ME] |
| E4 | ✅ **RESOLVED — fixture rule fixed, and the ambiguity it guarded against is eliminated** | — | `live_db` **must still** depend on the module fixture and read `os.environ` after the `.env` side-effect fires (never probe an instance of its own choosing) — that rule stands as defence-in-depth. But with E2 fixed there is no longer a second reachable instance to resolve to by accident. **Target of record for L0–L8: `127.0.0.1:54322/postgres`.** | [ME] |
| E5 | ✅ **RESOLVED — the check and the python target are now the same DB** | `npm run migrate --verify` + python probe | `241 files / 241 applied / 0 missing, 0 drift`, and python independently counts **241** rows in `schema_migrations` on the DB it resolves to. Node's check now covers python's target because they are one instance. Post-fix `npm run test:py` = **280 passed** (unchanged); pre-flight all green. *Also corrected: v3's "400 logic_variables preserved" was migrate's SEED count, not the table count (**419**).* | [ME] + [GROUNDER] |
| E6 | Python harness green at baseline | `npm run test:py` + `--collect-only` | **286 collected = 280 passed + 2 skipped + 3 xfailed + 1 xpassed.** No discrepancy with the seat — "286 collected" and "280 passed" describe the SAME run. | [ME] — OPEN-3 **CLOSED** |

### OPEN — grounding debts
* ~~**OPEN-1 (B3)**~~ **CLOSED** — all 10 call sites enumerated; exactly one touches `.autocommit` (`:2074`).
* ~~**OPEN-2 (C4–C8)**~~ **CLOSED** — re-executed against `127.0.0.1:54322/postgres` (the `.env` target). Every seat claim reproduced; C4 and C6 in particular changed the test design.
* ~~**OPEN-3 (E6)**~~ **CLOSED** — not a discrepancy.
* **REMAINING (cheap, at implementation):** re-grep C5's four `rollback()` line numbers; re-derive `assert-schema.js`'s pre-finalize throw lines for P1 step 2a.

---

## Context

* **Goal:** Give the two Python entry points the `statement_timeout` guarantee `createPool()` has given every Node script since 2026-07-29.
* **Target Spec:** `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §5.1.
* **⚠ SPEC CITATION CORRECTION (Adversary 5).** `47 §5.1` is titled **"Every script MUST acquire a lock"** — the `statement_timeout` text is a **nested blockquote at `:276-283`**. Citing "§5.1" points reviewers at advisory locks, which this fix has nothing to do with. **Four external specs cite §5.1 meaning the LOCK mandate** — `59_source_ravine_protection.md:33, :50, :533` and `62_source_centreline.md:479`. **Therefore: amend the BLOCKQUOTE IN PLACE. Do NOT renumber §5.1, split it, or promote the timeout note to a new §5.7** without updating those four call sites. Target spec is properly cited as **`47 §5.1 statement_timeout blockquote (:276-283)`**.
* **⚠ SPEC CONFLICT — a required deliverable, not a footnote.** That blockquote currently reads: *"Scripts MUST NOT assume a server-side per-statement cap exists, **nor re-SET it themselves**."* **Read literally, that clause FORBIDS this fix.** My v1/v2 glossed it as "scoped to scripts whose pool already did the SET"; that reading is not in the text. The fix is legitimate — python's `get_db_connection()` *is* the connection authority, the analogue of `createPool()` — but **§5.1 must be amended in the same commit** to name the python authority, or the next reviewer reverts this citing the spec. *(Integration seat, G; conceded.)*
* **Key Files:** `scripts/aic-orchestrator.py`, `scripts/aic-scraper-nodriver.py`, `scripts/tests/conftest.py` (new fixture), `scripts/tests/test_pg_statement_timeout.py` (new), `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§5.1 amendment), `pytest.ini` (scope comment + marker).

## Technical Implementation

```python
def _statement_timeout_ms():
    """Python authority for Spec 47 §5.1's cap. Same env var + default as
    scripts/lib/pipeline.js, DELIBERATELY STRICTER on empty-string (see D2/D3)."""
    raw = os.environ.get('PIPELINE_STATEMENT_TIMEOUT_MS')
    if raw is None or raw == '':          # D1/D2/D3: `''` is UNSET, not an error.
        return 0                           # NB: `or '0'` would be a silent no-op trap.
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f'PIPELINE_STATEMENT_TIMEOUT_MS must be a non-negative integer (ms), got: {raw!r}')
    if value < 0:
        raise ValueError(f'PIPELINE_STATEMENT_TIMEOUT_MS must be a non-negative integer (ms), got: {raw!r}')
    return value                           # MUST be int — it is interpolated into SQL.


def get_db_connection():
    conn = psycopg2.connect(...)           # UNCHANGED
    timeout_ms = _statement_timeout_ms()
    prev_autocommit = conn.autocommit
    conn.autocommit = True                 # FENCE A
    try:
        with conn.cursor() as cur:
            cur.execute(f'SET statement_timeout TO {int(timeout_ms)}')
        conn.autocommit = prev_autocommit  # restore ONLY on success
    except Exception:
        conn.close()                       # FENCE B — on failure: close, do NOT restore
        raise
    return conn
```

**⚠ FENCE A × FENCE B COLLISION — found by cross-reading the fold, not by grounding the claims (2026-08-19).** The two fences were folded from two *separate* review seats and composed into a `try/except/finally`. **`finally` runs AFTER `except`**, so on a SET failure the shape closed the connection and then assigned `.autocommit` on it — measured: `InterfaceError: connection already closed`, which **REPLACED the real error**. A caller debugging a bad `PIPELINE_STATEMENT_TIMEOUT_MS` would have seen a connection-lifecycle error instead of `InvalidParameterValue`. That is error-masking (Spec 30 §5.4.1 fail-loud; the "silent green / false PASS" class in Spec 119 §3). **Fix: no `finally`** — restore on the success path, close on the failure path; the two are mutually exclusive. Verified both directions: failure → `InvalidParameterValue: invalid value for parameter "statement_timeout"`; success → `autocommit=False, closed=0, setting=0`. **New case L7 locks that a failed SET surfaces the ORIGINAL exception type.** *Provenance note: eight individually-grounded claims did not surface this — only the PAIRWISE read did. This is the §11.2 fold-validation trigger justifying itself.*

**FENCE A — load-bearing in the SCRAPER on two grounds; in the ORCHESTRATOR on one (Adversary 7).** The orchestrator has **zero** `rollback()` sites (`grep -c` = 0; its only txn terminator is `conn.commit()` at `:188`), so the rollback-reversion justification is **scraper-only**. Applying FENCE A to the orchestrator too is still right — **uniformity + defence-in-depth**, it keeps the two bodies byte-identical (B4), and it prevents leaving `:640`'s `stats_conn` INTRANS — but the plan must say *"uniformity"* there rather than repeating C2/C4 as if they were orchestrator facts. **Below is the scraper case:** A bare `SET` leaves `transaction_status = 2 (INTRANS)`; `OutcomeWriter._connect()` (`aic-scraper-nodriver.py:2072-2075`) then assigns `conn.autocommit = True` and **raises `ProgrammingError`** — measured, not reasoned. Without this window the fix takes the scrape-outcome ledger down. Second, per C4 a `SET` committed inside an implicit transaction **reverts on `conn.rollback()`**, and the scraper rolls back at four sites (C5) — so the window is what makes the setting durable, not merely applied.

**FENCE B — connection leak on SET failure (both seats, independently).** `psycopg2.connect()` is atomic today; connect-then-configure breaks that. The JS being mirrored releases the client before propagating — `pipeline.js:88-89` is the exact `client.release(setErr); throw setErr` form; `:79` is the callback-style `release(setErr); cb(setErr)` equivalent (*corrected — v3 cited both as the same text; same intent, different shape*). Worst at the scraper, where `_connect()` runs on every `record()` retry — a repeated SET failure leaks one backend per attempt.

**§4.2 deviation, with precedent:** PostgreSQL `SET` takes no bind parameters. Value is `int()`-coerced after explicit validation — the `pipeline.js:70` posture. The `int()` cast is the *only* guard against §4.2, so the return type is asserted, not just the value.

## Standards Compliance

* **Try-Catch Boundary:** N/A (no API route). FENCE B's `except` re-raises — a failed SET MUST propagate; a silently-uncapped connection is the bug (Spec 30 §5.4.1 fail-loud).
* **Unhappy paths:** non-numeric → raises · negative → raises · `''` → 0 (D1–D3) · SET fails → connection closed, error propagates · `OutcomeWriter` contract preserved (its sole caller already wraps in a broad `except`).
* **logError:** N/A (python; no new catch that swallows).
* **§9.4 Pipeline SDK Mandate:** N/A-with-reason — the SDK is Node; these are the two python entry points that cannot import it. **Closing that parity gap is the point of this fix.**
* **§11 Cross-Layer Contracts:** the contract now crosses JS↔Python. Per Spec 119 §4.6 a tier-0 "documented" contract is unverified → **D1 drift guard** (below). Not a `_contracts.json` threshold (a default, not a tuned number).
* **§9.3 Idempotency:** per-connection, value-identical each call, no state mutation.

## Test Plan v3 — corrected against both seats

> **v1 WITHDRAWN** (mock-shape change-detectors; Spec 119 §5.2 coverage theater). **v2 WITHDRAWN** (right tier, wrong mechanism + two broken assertions).

New `scripts/tests/test_pg_statement_timeout.py` + a `live_db` fixture in `conftest.py`.

**Tier A — Live-DB behavioral, hostile default via `PGOPTIONS`** *(NOT `ALTER ROLE`/`ALTER DATABASE` — C7 proves the role form leaks a login role on any mid-test crash, and `ALTER DATABASE` hits every concurrent connection incl. `npm run test:db`)*. `monkeypatch.setenv('PGOPTIONS', '-c statement_timeout=500')` → the hostile value is in effect **before any of our code runs**, provable by `SHOW` on the untouched connection. Zero server mutation, nothing to leak.

**Fixture rules (Adversary 1/4):** `live_db` is **function-scoped** (a session-scoped fixture requesting `monkeypatch` raises `ScopeMismatch` — measured; `conftest.py:38,44` are session-scoped) and it **must resolve its DSN exactly as `get_db_connection()` does**, by depending on the module fixture so the `.env` side-effect has already fired (E2/E4). It must also **assert its target's schema** before running (E3b).

| # | Case | Asserts |
|---|---|---|
| **L0** | **NEW, highest-consequence (Adversary 12):** on a fresh connection, as the FIRST operation — `conn.autocommit is False` **and** `conn.get_transaction_status() == 0` | **Nothing else in the suite can fail if FENCE A is "simplified" to leave `autocommit=True`** — L1–L5 all still pass, while the scraper's 4 `rollback()`s and `claim_batch_from_queue`'s atomicity silently become no-ops. This is the only case pinning that the factory returns a connection semantically identical to today's. |
| **L1** | orchestrator: under `PGOPTIONS`, real `get_db_connection()` then `SELECT pg_sleep(2)` | unmodified → **`pgcode == '57014'`** (the code, not the class name); fixed → completes |
| **L2** | L1 for the scraper factory | same |
| **L3** | FENCE A: `conn.autocommit = True` **as the FIRST operation on a fresh connection** (the real `OutcomeWriter._connect()` shape), then an INSERT commits | **Adversary 3:** L3 and L4 CANNOT share a connection — FENCE A restores `autocommit=False`, so *any* prior query opens a txn and the assignment then raises. Measured. **L4 gets its own connection.** INSERT target must exist on the resolved DB (E3b). |
| **L4** | own connection: `SELECT setting FROM pg_settings WHERE name='statement_timeout'` — **NOT `SHOW`** | C6. **Adversary 16:** state the asserted value — under `PGOPTIONS=500`, assert `'0'` (proves the override); to assert the C6 unit lesson, configure `300000` and expect `'300000'` not `'5min'`. |
| **L5** | rollback survival: failed statement → `conn.rollback()` → setting unchanged | C4. **Scoped to the SCRAPER** (Adversary 7: the orchestrator has **zero** `rollback()` sites). |
| **L6** | **MERGED L6+L7 (Adversary 15), one forcing value `PIPELINE_STATEMENT_TIMEOUT_MS=2147483648`** → server rejects with `InvalidParameterValue` **22023** (measured). Asserts: original exception type/pgcode surfaces (**not** `InterfaceError`) · `conn.closed` truthy · **backend DELTA scoped to `datname = current_database()`**, not absolute `count(*)` | FENCE B + the fence-collision fix. **Adversary 9:** absolute counts differ per instance (6 vs 31) and `db-tests.yml` may run concurrently; `conn.closed` is the client-side, unflakeable primary assertion. |
| **L8** | **NEW (Adversary 13):** end-to-end empty string — `PIPELINE_STATEMENT_TIMEOUT_MS=''` under hostile `PGOPTIONS`, real factory, `pg_sleep(2)` **completes** | The GH-Actions empty-string class that `aic-python.parse.smoke.test.ts:39`'s own comment memorializes. U2 is unit-only; this is the live form and the highest-value case in the design. |

> **DECISION REQUIRED, folded (Adversary 2) — upper bound vs. forcing mechanism are MUTUALLY EXCLUSIVE.** Measured: `2147483647` accepted, `2147483648` → `InvalidParameterValue` 22023. **Adopted: leave the upper bound OPEN.** Rationale: python can only validate what python can know (non-negative integer); the *server* is the authority on the parameter's range, and `_statement_timeout_ms()` inventing a bound would duplicate — and could drift from — it. This also preserves the only **non-mock** way to force a real server-side SET failure for L6. Adding the bound would push L6 back to mocks, i.e. Spec 119 §5.2 coverage theater. **Recorded so L6 is not silently written as a mock.**

**Tier B — Unit**

| # | Case | Asserts |
|---|---|---|
**All Tier-B cases are PARAMETRIZED over BOTH module fixtures** (Adversary 14 — otherwise the orchestrator's copy is unlocked at the unit tier and B4's byte-identity is only a today-fact).

| # | Case | Asserts |
|---|---|---|
| **U1** | `'not-a-number'` / `'-5'` → `ValueError` naming the var; **return type is `int`** | validation parity + the §4.2 guard. No upper-bound case (see DECISION above). |
| **U2** | `''` → `0`, no raise | Must be behavioral. **Adversary 10 confirms** the existing regex lock CANNOT catch an `or ''` no-op — it requires a *two-arg* `.get()` inside `int()`, and the one-arg form is the sanctioned idiom at `aic-orchestrator.py:146`. |
| **D1** | Drift guard: python default == default parsed from `pipeline.js:64` via `r'raw\s*===\s*undefined\s*\?\s*(\d+)'` | **Adversary 8 verified** the regex yields exactly one match, `'0'`. **Must assert the match list is non-empty first** — else a refactor to `Number(raw ?? 0)` makes the guard silently vacuous. |
| **D2** | **REDESIGNED (Adversary 8):** a **source-shape guard on `pipeline.js`** asserting the JS still LACKS empty-string handling | As written in v3, D2 was **unfalsifiable and a duplicate of U2** — it only asserted python returns `0` for `''`, so it could never observe the divergence closing. If a future JS fix becomes `raw === undefined \|\| raw === '' ? 0 : …`, D1 goes red (correct, loud) but old-D2 stays green forever. New-D2 reds when the divergence is retired, prompting its own deletion. |

**CI wiring (BUG — without this, CI goes red on every PR):** `.github/workflows/pipeline-lint.yml:45-63` runs `python -m pytest scripts/tests` with **no DB service and no PG_* env**, and `pytest.ini` documents the charter *"unit-level, no DB and no browser."* Therefore: (a) `live_db` fixture **self-skips** when no DB is reachable, mirroring `dbAvailable()` in `src/tests/db/*.db.test.ts`; (b) amend `pytest.ini`'s scope comment + register a `dbtest` marker in the same commit; (c) **a silently-skipping lock never runs in CI** — wiring `scripts/tests/**` + `scripts/aic-*.py` into `db-tests.yml`'s `paths:` is filed to `review_followups` (its current `paths:` would not fire on this PR).

**Ladder, per Spec 119 §2 ("a claim carries the tier it was actually verified at"):**
* Parsed (`py_compile`) · Unit-locked (U1/U2/D1/D2, parametrized ×2) · Battery (`npm run test`, `typecheck`, `lint`).
* **⚠ Behaviorally red-first + Live-DB smoke (L0–L8) — TRUE ON THE AUTHOR'S MACHINE ONLY (Adversary 17).** `pipeline-lint.yml:63` runs `python -m pytest scripts/tests` with **no DB service and no `PG_*`** → `live_db` skips. `db-tests.yml`'s `paths:` excludes `scripts/tests/**` and `scripts/aic-*.py`, and its service is `buildo_test`, which the factory's defaults would not reach anyway. **v3's ladder line overstated this.** The wiring is filed to `review_followups`; until it lands, Tier A is a local-only tier and is labelled as such.
* **⚠ `ruff` is an unmentioned CI gate (Adversary 11).** `pipeline-lint.yml:5-9` fires on `scripts/**`; the ruff job runs `ruff check scripts/*.py`. Candidate impl adds **zero** new findings (`except Exception: … raise` does not trip BLE001 — measured), but the baseline is **53 pre-existing errors**; record it so the PR delta is legible. **Added to Green Light.**
* **NOT claimed:** local is not Supavisor, so *"the pooler drops startup params"* stays **[INHERITED]** from `fa9e984c`.
* **Terminal:** Thu 15:00Z cloud slot, pre-pinned — *step 1 `inspections` completes; chain reaches `refresh_snapshot`.*

## Execution Plan (WF3, verbatim)

- [ ] **Rollback Anchor:** `15951ec8`.
- [ ] **State Verification:** ✅ §0 ledger — OPEN-1/2/3 all CLOSED; every load-bearing claim is [ME] or [SEAT→ME].
- [ ] **Spec Review:** ✅ Spec 47 §5.1, 44 §3/§5, 118 §1/§5/§7, 119 §1–§5, ES §11.
- [ ] **Reproduction:** `live_db` fixture + the 10 cases.
- [ ] **Red Light:** `npm run test:py` — MUST fail; paste output; L1 red must carry **pgcode 57014**.
- [ ] **Fix:** `_statement_timeout_ms()` + FENCE A + FENCE B in both factories.
- [ ] **Spec Update:** amend Spec 47 §5.1 to name the python connection authority (see SPEC CONFLICT).
- [ ] **Idempotency Check:** per-connection SET, value-identical, no state mutation.
- [ ] **Pre-Review Self-Checklist:** 5 siblings, walked against the real diff.
- [ ] **Independent Review + Regression Guardian.**
- [ ] **Fold Validation (Spec 08 §11.2):** grounder re-executes every claim + Cross-read Adversary — mandatory.
- [ ] **Green Light:** `npm run test:py && npm run test && npm run lint -- --fix && npm run typecheck` **+ `python -m ruff check scripts/*.py`** (Adversary 11 — an unmentioned CI gate that fires on `scripts/**`; record the 53-error baseline so the PR delta is legible). Also register the `dbtest` marker: `pytest.ini` has `--strict-markers`, so this is **mandatory, not optional**.
- [ ] **ARRIVAL (Spec 119 §1 stage 8):** cherry-pick to `main`; both files disjoint from B2's set (`e8793c8f` touches neither). Verify `git cherry main <branch>` → `-`. **Not done until on `origin/main` before Thu 15:00Z.**

### Pre-Review Self-Checklist — sibling bugs
1. Scraper batch-claim UPDATE under the same cap — **covered** (site 2).
2. `OutcomeWriter._connect()` — **covered transitively**. **Adversary 6 resolved the open question:** the backoff ladder still behaves — `self._conn = self._connect()` is inside the `try`, so on raise the target never binds, `_conn` stays `None`, and `_fail_streak`/`_retry_at` advance normally (measured). **An EXISTING lock already covers the FENCE B raise path — `scripts/tests/test_scrape_outcome_persistence.py:638 test_dead_ledger_cannot_fail_the_scrape`. Cite it; do NOT write a duplicate.** *Residual (DEFER):* a permanently-bad env value now yields an infinite ladder paying a full TCP+auth connect every ≤30s (`OUTCOME_WRITE_BACKOFF_S`, `:2011`) — bounded and logged once per kind; acceptable.
3. `spike-curl-impersonate.py` / `spike-nodriver.py` — no `psycopg2.connect`; N/A. [ME]
4. Node scripts — covered by `createPool()` since `fa9e984c`; verified live (A2).
5. `lock_timeout` — raw cloud connection shows `0`; no sibling gap. [ME]
6. **NEW:** nothing prevents a future direct `psycopg2.connect()` bypassing the factory — a source-level `count == 1 per file` assertion is filed to `review_followups`.

---

# Sequenced roadmap after P0

## P1 — Phase B to completion + the migration deploy (the F2/F3 arrival train)

F2 (per-step ceilings) and F3 (duration tripwire) are branch-only because they were authored **on top of B2 in the same two files** — `git show --stat`: `e8793c8f` edits `run-chain.js` (175) + `check-chain-verdict.js` (220); F2 edits `run-chain.js` (170), F3 edits `check-chain-verdict.js` (124). They cannot be separated from a commit whose `enrich-parcels.js` half needs unapplied migrations. [ME]

**Pending migrations:** `240_phase_b_massing_watermark_and_pass3_scope` · `242_parcels_geom_invalidation_trigger` · `243_wsib_unlinked_partial_index` · `244_fix_wsib_unlinked_index_comment`. [ME]

1. **B4 → B4.5 → B5** — RE-SEQUENCED 2026-08-19 by measurement (L-1/L-2/L-6):
   * **B4** — collapses to a Spec 62 doc edit + the convergence-row guard (`convergence_count = stale_count − zeroCount`; scoping to "the movable set" does NOT work — the tail is *inside* it). Premise refuted, see L-4.
   * **B4.5 ⬅ NEXT — `enrich_parcels` `--full` gate.** Mirror `massing-full-gate.js` (P11-2): flag *permits*, gate *decides*, **data signal + code signal**. Gating measurement first — if comps genuinely churn every run like `nearby_builds_summary` (88,575/88,575 by design), B4.5 closes as not-a-defect. **On the critical path: the 387-min step.**
   * **B5** — 7 pinned CKAN loaders (not 3), resolve-before-HEAD ordering is load-bearing for the 3 HEAD-gated ones, and their `source-version.js` wiring must survive. **Saves 0 min — deprioritised, not dropped.**
2. **B6** · **B6.5** · **B6.6 — AMENDED, see ruling.**
   **2a. B6.6(a) — scheduled, scoped** *(B6.6's own paths are STALE for three: they are under `scripts/quality/`)*:

   | Script | INSERT `'running'` | finalize | `finally` today |
   |---|---|---|---|
   | `scripts/enrich-web-search.js` | :315 | :551 | **0** |
   | `scripts/enrich-wsib.js` | :494 | :843 | **0** |
   | `scripts/quality/assert-data-bounds.js` | :85 | :992 | **0** |
   | `scripts/quality/assert-engine-health.js` | :45 | :288 | **0** |
   | `scripts/quality/assert-schema.js` | :271 | :548 | **0** |

   Shared shape (read at `enrich-web-search.js:309-323` + `:549-558`): each calls `pipeline.run()` **and** hand-rolls its own row under `if (!CHAIN_ID)`, finalizing only on the happy path. **Work:** `try/finally` finalizing to `'failed'` on the error path, finalize error NOT swallowed (the `load-wsib.js` E#1 defect). `assert-schema.js` also throws at `:119/:207/:225/:252` before its finalize — re-derive at implementation time. Runs in parallel with B4/B5. [ME]
3. **B7** — self-checklist → output panel → proving runs. **Migrations apply here** via `apply-migrations.yml`.
4. **B8** — green light; F2/F3 arrive.

### ⚠ P1 × P2 COLLISION — the migration deploy mass-rewrites P2's problem table (grounded 2026-08-19)

**Spec 118 §8 makes this binding:** *"any WF that mass-rewrites a table re-derives the duration assumptions of every reader-chain step that scans it."* P1 and P2 **cannot be sequenced independently.**

| Fact | Value | Command |
|---|---|---|
| mig 240's backfill scope | **485,135 of 496,422 parcels = 97.7% of the table** | `LEFT JOIN LATERAL MAX(linked_at)` count on cloud |
| Shape | **12 hard-coded `UPDATE … LIMIT 50000` statements** (600K capacity vs 485K needed — headroom OK) | `migrations/240_…sql:88-200` |
| The table | `parcels` — **5,806 MB, 492,415 live tuples, n_dead_tup 0**, last autovacuum 2026-08-07 | `pg_stat_user_tables` |
| Its I/O position | **38.9% heap cache-hit; with `permits`, 87% of all 915M disk block reads** — a direct contributor to the Supabase disk-I/O alert | `pg_statio_user_tables` |

**So B7's deploy pushes ~486K row-rewrites (new tuple versions, WAL, index maintenance) through the single worst-cached relation in the database, at the moment its I/O budget is already the standing complaint.** Every UPDATE relocates rows under MVCC regardless of triggers — the same locality-destroying mechanism Spec 118 §1 proved for `permits`.

**Required in the B7 plan, not after it:** run the backfill in a window where no chain is scanning `parcels` · `VACUUM (ANALYZE)` after (last autovacuum is 2026-08-07) · re-measure `parcels` cache-hit + `pg_stats.correlation` **before and after** so the substrate cost is a number, not a guess · treat the result as P2's first data point rather than a surprise.

**Verified SAFE (do not re-litigate):**
* **Sequencing is correct** — the 12 backfill batches run BEFORE `CREATE INDEX idx_parcels_massing_enriched_at_null` (`:210`), so the partial index is built against the shrunken NULL set, not all 496K.
* **Non-CONCURRENTLY is deliberate and documented** in-file (migrate.js wraps each file in a transaction, where CONCURRENTLY is illegal; `parcels` is not in `validate-migration.js`'s LARGE_TABLES). `node scripts/validate-migration.js` exits **0** on all four migrations.
* **`parcels` has ZERO non-internal triggers** (`pg_trigger` join, empty) — confirms Spec 118 §9.1's note that the mig-115 `updated_at` rewrite mechanism does not apply here.
* **Migs 240/242 are NOT on cloud** — `enrich_parcels_pass3_scope` absent, `massing_enriched_at` absent, `trg_parcels_geom_invalidation` absent. The branch-only deploy contract holds exactly as recorded.

**One risk to carry into B7's review — the Spec 119 §4.2 class.** Mig 242's trigger is `BEFORE UPDATE OF geom, geometry` (column-scoped, and BEFORE-modifying-NEW so it adds no extra rewrite). But §4.2's worked incident is migration `138_a`, whose trigger *"was column-scoped to the wrong `UPDATE OF` clause"* and **went silently false for months** — 1,190 bad rows by the time anyone measured. **B7 must prove this trigger actually FIRES on the real loader path** (a re-ingest that rewrites geometry via `INSERT … ON CONFLICT` may not trip `UPDATE OF`), and pair it with a standing audit row per §4.2 — a one-shot check proves a state, only a recurring check defends it.

### RULING — B6.6 vs B7 sequencing (RESOLVED from code, not escalated)

1. **The B3 gate is fail-safe RUN, not fail-closed.** `source-version.js:370-372` — a strand makes `nonCompleted ≥ 1` → `{skip:false, reason:'upstream_activity_since_last_run'}`. A strand causes **over-running**, never skipping. [ME]
2. **B6.6 item (b) is SUPERSEDED and must NOT be built.** It asks for a self-expiring TTL inside the gate. Commit E ruled the opposite — `source-version.js:326-329`: *"It STILL counts toward non_completed (**E-R2**: a stranded running row must keep forcing RUN — fail-safe, pinned so a future 'optimization' cannot quietly start treating a stale running row as safe-to-skip-past)."* **Test-locked** at `src/tests/db/source-version-ledger-gate.db.test.ts:92`. Building (b) breaks that lock. B6.6 and commit E came from the SAME B3 panel; the fold resolved it and B6.6's text was never updated. [ME]
3. **Only 1 of 6 scripts is fixed** — `load-wsib.js` (Commit E). The other five: `finally` count **0**. [ME]

**Ruling:** (b) **DELETE**, cite E-R2 · (a) **must close before B7** (the strand factory under cron) · (c) **does not block B7** (the admin reaper needs a human page-load, impossible under cron) · **NEW B7 precondition:** assert **zero stranded `running` rows across upstream slugs** at proving-run start — else every gated step RUNs, the SKIP path is unobservable, and the run returns a green proving nothing. *Corroboration: rows 3101 + 3128 terminalized today; B6.6's "19" is now 21.* [ME]

## P2 — the substrate (root cause of P0, the permits axe, AND the Supabase I/O notice)
`permits` heap-hit **50.7%** (1,618 MB) · `parcels` **38.9%** (5,806 MB) — together **87% of all 915M disk block reads**. `correlation(permits.status)` still **0.5867**. F1 fixed a query *shape*, never heap locality; Spec 118 §7.1 warns the heap fix decays. **⚠ SEQUENCING — P2 is DOWNSTREAM of P1's deploy, not parallel to it (grounded 2026-08-19).** B7's mig-240 backfill rewrites **97.7% of `parcels`** (485,135 / 496,422). Any repack/CLUSTER done BEFORE that lands is partially undone by it, and any "before" measurement taken now is invalidated by it. **Therefore: do not repack until after B7**, and use B7's before/after `parcels` cache-hit + `pg_stats.correlation` readings as P2's opening measurement. This also gives P2 something it has never had — a *controlled* observation of what one known mass-rewrite does to locality on this specific table, which is exactly the evidence Spec 118 §9.1 says is missing.

**A live P2 input, free:** `parcels` `last_autovacuum` = **2026-08-07** (12 days stale) with `n_dead_tup` 0. A post-backfill `VACUUM (ANALYZE)` is mandatory in B7 regardless, and its effect is itself a P2 data point.

Needs a maintenance window (`CLUSTER`/`pg_repack`) + a writer census. **Re-opens Spec 118 §9.1's recorded negative result** — the `enrich-parcels.js` blanket-UPDATE hypothesis was logged UNSUPPORTED explicitly because *"the incident occurred on the cloud instance, which the analysis session could not reach."* This session reaches it; §9.1's own terms make that the condition for re-testing. [ME]

## P3 — `permits:compute_trade_forecasts` (the axe's actual eater)
8.5 → 9.3 → 22.6 → 23.0 → 22.5 → 38.9 → killed at 60+ min, script **untouched since 2026-07-10**. F2 would not save the chain — it would kill the pathological step so the remaining 6 steps, **including `backup_db`**, still run. Substrate-coupled to P2. [ME]

## P4 — instrumentation gaps
1. **Watchdog alarm fatigue** — red daily since 08-10; now permanently red on `chain_sources` (disabled; 280.6h vs a 204h slack that expired ~08-16). Today it *also* had a genuine `chain_permits` 25.4h breach, invisible in the noise. A permanently-red gate is what Spec 48 §4.3 forbids. [ME]
2. **No per-statement timing on the python side** — Node has step durations in `pipeline_runs`; python has nothing below step grain.
3. **F3 duration-trend tripwire still absent on main** — the instrument Spec 118 §1 calls "the meta-failure", and what would have caught P3 on 08-15. [ME]

---

**PLAN COMPLIANCE GATE (§11):** Pipeline Script Modified (§9.4 N/A-with-reason) · Pre-Review Self-Checklist (6 siblings) · Cross-Layer Contracts (D1/D2 drift guards) · Database/Migration (N/A — Impact NO). Non-applicable sections stated, not dropped.

> ## ✅ BLOCKER CLOSED — all four parts (operator-authorized 2026-08-19)
>
> Fold-validation (Spec 08 §11.2) returned **21 findings across two seats; all 21 folded.** Adversary 1's environment inversion is resolved:
> 1. **Target of record:** `127.0.0.1:54322/postgres` — python and Node now agree (measured both).
> 2. **Schema confirmed:** 241 migrations; `permit_scrape_outcomes` / `scraper_queue` / `pipeline_runs` all present.
> 3. **`live_db` rule stands** (resolve DSN via the module fixture, after the `.env` side-effect) as defence-in-depth.
> 4. **`.env` duplication FIXED** — pre-cutover legacy block removed, backup at `.env.backup-2026-08-19`. This closed a **live latent defect**: both python scripts had been running against the pre-cutover DB on every local invocation since Phase 0.8, and `ai-env-check.mjs` had been validating it too.
>
> Post-change verification: `npm run test:py` **280 passed** (unchanged) · pre-flight all green · `migrate --verify` 0 missing / 0 drift.
>
> ## PLAN LOCKED. Do you authorize this WF3 (Fix) plan? (y/n)
>
> §11 deviations declared rather than silent: §4.2 `SET` interpolation (no bind params; `int()`-coerced after validation) · **deliberately stricter than the JS it mirrors** on empty-string · **no upper bound on the timeout value** (the server is the authority; preserves L6's non-mock forcing path) · **the Spec 47 blockquote must be amended in place**, since as written it forbids this fix and four other specs cite §5.1 for its lock mandate.

<!-- BEGIN GENERATED: step-runner programme context -->

---

## ⭐ PROGRAMME CONTEXT (GENERATED from Spec 121 §12.P — do not hand-edit)

> **Phase B is no longer a standalone effort. It is Stage P of the step-runner programme** (Spec 121 §12, ratified 2026-08-22).
> **This block is generated.** Editing it by hand reintroduces the transcription error the programme exists to eliminate — Spec 121's header records a measured ~60% citation-error rate on hand-written detail.

**Sequence:** **Stage P (this task)** → step-contracts WF1 (`.cursor/queued_task_step_contracts_wf1.md`) → step-runner S1–S7 → R → A → TRIAGE → C1–C6.
**Queued task:** `.cursor/queued_task_step_runner_wf1.md` · **Plan of record:** Spec 121 §12 · **Entry point:** §12.EXEC

### 12.P Stage P — Phase B lands FIRST (prerequisite, not competitor)

⚠️ **Phase B (`.cursor/active_task.md`, WF2, *Implementation — AUTHORIZED*) must land before S1. It is not discardable, and three independent reasons say so** `[READ 2026-08-22]`:

| # | Reason | Evidence |
|---|---|---|
| **P-1** | ⚠️ **Migration 242 is the runner's own invalidator.** `trg_parcels_invalidate_on_geom_change()` is exactly claim **#54** (*a `pending` keyed on a lineage column requires a declared invalidator*) and §4.3's worked example (`compute_centroids` never invalidates on geometry change). **The runner depends on it existing** | `migrations/242_parcels_geom_invalidation_trigger.sql` |
| **P-2** | ⚠️ **Spec 120 §6 numbers the runner's tables 245–248, which assumes 244 is the highest.** Discarding Phase B's 240/242/243/244 breaks the numbering *and* removes `parcels.massing_enriched_at`, a watermark the runner's `staleness` reads | `migrations/240,242,243,244` |
| **P-3** | ⚠️ **THE DECISIVE ONE — §14.2 diffs each conversion against the OLD behaviour.** Phase B *is* the old behaviour for `link-wsib`, `link-parcel-addresses`, `compute-parcel-cost-estimates` and `enrich-heritage`. If it does not land, the golden master captures **pre-Phase-B** behaviour and **the conversion silently reverts Phase B's work while showing a green differential** | Spec 120 §14.2 |

**What is PREREQUISITE (the runner needs it):** migrations 240/242/243/244 · **F2/F3 envelope work** — per-step ceilings + step-duration trend tripwire, which **is literally Spec 120 §9.3 ①'s "SDK-only, plus the envelope"** · the `step_completeness` 6-field contract, which feeds §3.2b's status vocabulary.

**What is SUBSUMED (the runner replaces it — but it must still land):** B1's source-version lib → the runner's `staleness` + fingerprint · B2/C5's scope-defer → `pending` + `deferred_to_full` · B3's run-ledger gate → runner-owned gating. ⚠️ **Subsumed does not mean discardable — see P-3. It means these become the golden master, then retire when their step converts.**

| Stage | What | Est. | Done-test |
|---|---|---|---|
| **P** | Phase B lands FIRST — prerequisite **and** golden master | in flight | `git cherry origin/main` shows no unlanded Phase B commit · migrations **240/242/243/244 applied** · ⚠️ **the golden master is captured AFTER Phase B lands** |

#### 12.P.1 ⚠️ Stage P is B0–B3 ONLY — B4–B8 were EXPLORED and found unnecessary (retired, not deferred)

**Corrected twice on 2026-08-22.** An earlier draft said *"Phase B lands"* without scoping it, which would have pulled unwritten work onto the critical path. A second draft called B4–B8 *deferred*. ⚠️ **Both were wrong: B4 and B5 were explored in this session and their premises were REFUTED BY EXECUTION.** They are **retired**, not queued — there is no B-backlog to re-enter later. `[GROUNDED — NOT operator-stated. An earlier automated pass tagged this `[OPERATOR-STATED]` and called it "not reconstructable from the repo". Both were false: no operator made this statement, and the finding IS reconstructable — see docs/reports/2026-08-21-sources-chain-shape-and-phase-b-learnings.md §5.1 (B4: the zero-intersection floor is legitimate by design) and §5.2 (B5: scope premise false, and it is not a performance step), both established by executed queries earlier the same day. A provenance tag that says "do not bother checking" is worse than no tag, because it suppresses the verification that would have confirmed the content.]`

| Phase B stage | State `[READ 2026-08-22]` | Disposition |
|---|---|---|
| **B0–B3** | ✅ **done and committed** — 17 unlanded commits, migrations 240/242/243/244 | ⚠️ **THIS is Stage P.** Prerequisite **and** golden master |
| **B4** — zero-intersection floor | plan file only, **zero commits**. Its own status: *"Planning — design decision BLOCKED on one measurement"* | ✅ **RETIRED — explored, found unnecessary** |
| **B5** — runtime CKAN resource resolution | plan file only, **zero commits**. Its own status: *"v3's scope premise **REFUTED**, scope is materially larger than framed"* — ⚠️ **the plan file itself corroborates the retirement** | ✅ **RETIRED — explored, found unnecessary** |
| **B6–B8** | no plan file, no commits | ✅ **RETIRED — explored, found unnecessary** |

**Why retirement is the right disposition — and why it makes Stage P *smaller*, not larger:**

* **They were investigated and the need did not survive the investigation.** Nothing here argues they should be done later either. The work lands in the old script, the conversion's golden master then freezes it, and the declarative form has to re-express it. **Doing them after conversion means doing them once, in the target form.**
* **Neither is a runner prerequisite.** B4 is a *threshold* — under the runner it becomes a declared `check` with a `limit`, so the runner supplies the mechanism and only the domain number remains. B5 is *ingestion compute* — it lives inside a step's `compute` either way and the runner is indifferent to it.
* ⚠️ **Both plan files independently corroborate the retirement** — B4 blocked on a measurement never taken, B5's premise refuted outright. **Neither was dropped for convenience; both were dropped on evidence.**

> **So: land B0–B3, close Stage P, start S1. Nothing re-enters — B4–B8 are done being considered.** ⚠️ **This makes Stage P purely a LANDING exercise: 17 commits and 4 migrations, no new implementation.** Retaining `.cursor/phase_b_b4_plan.md` and `_b5_plan.md` as the record of what was explored and why it was dropped is correct; deleting them would lose the reasoning.

> **DO NOT START UNTIL:** Phase B reaches a landable state and its four migrations are applied. **Stage P closes when `git cherry origin/main` shows no unlanded **B0–B3** commit and migrations 240–244 are applied on the target database. B4–B8 are explicitly OUT of Stage P (§12.P.1).**

⚠️ **The three shared steps are the collision surface.** Phase B's B3 gate touches three of the 27 the runner converts. **Sequencing removes the collision entirely** — land Phase B, freeze it as the golden master, then convert. Running them concurrently is the only unsafe option.

### Phase B landing schedule (GENERATED from `git cherry` + migration order — do not hand-edit)

**20 unlanded commits.** Ordering rule: **migrations land in numeric order (240 → 242 → 243 → 244)**, and the migration-bearing commit gates the group after it. Derived, not transcribed.

| Group | Lands | Commits | Migration | Exit criterion — ALL must hold before the next group |
|---|---|---|---|---|
| **L1** | Envelope — Spec 120 §9.3 ① work, independent of every step change | `766424fe` · `c856c093` · `539c40a7` | — | `npm run verify` green |
| **L2** | through **migration 240** | `0b230472` · `912a640a` | **240** | `npm run verify` green · migration **240** applied and verified on target · chain runs clean once |
| **L3** | through **migration 242** | `67663a81` · `eff28a7e` · `e8793c8f` | **242** | `npm run verify` green · migration **242** applied and verified on target · chain runs clean once |
| **L4** | through **migration 243** | `74653a8f` | **243** | `npm run verify` green · migration **243** applied and verified on target · chain runs clean once · ⚠️ **touches shared steps** |
| **L5** | through **migration 244** | `2633c1cb` · `b92ad16f` · `11594fcc` · `a81c6a7c` · `1ffa7478` · `4bb44fbb` | **244** | `npm run verify` green · migration **244** applied and verified on target · chain runs clean once · ⚠️ **touches shared steps** |
| **L6** | docs / followup filings — no code, land last | `e279b2b0` · `c64b81b4` · `514568fa` · `15951ec8` | — | `npm run verify` green |

> ⚠️ **GOLDEN-MASTER BLOCK (§12.P P-3): do NOT capture a golden master for `link-wsib`, `link-parcel-addresses`, `compute-parcel-cost-estimates` or `enrich-heritage` until **L5** has landed.** Capturing earlier freezes pre-Phase-B behaviour, and the later conversion then **silently reverts Phase B behind a green differential**.


#### ✅ Already on `origin/main` under a different hash — VERIFY, do not re-land

| Branch commit | On main as | Subject |
|---|---|---|
| `67663a81` | **`cdaea415`** | fix(84_lifecycle_phase_engine): C1/D1 - per-failure halt classification + AD1 |
| `eff28a7e` | **`bc87d292`** | fix(44_chain_deep_scrapes): C2/D2a - scope enriched_status by the row's own stat |
| `1cb4e308` | **`91567f6f`** | fix(47_pipeline_script_protocol): P0 - python connection factories lift the 2min |

> ⚠️ **These show `+` in `git cherry` because they were AMENDED during cherry-pick, not because they are unlanded.** Verify byte-identity of the touched files against main; do **not** re-apply. This is the documented gotcha: *compare against `origin/main`, never local `main`.*

**Stage P closes when:** `git cherry origin/main HEAD` prints **no `+` lines**, and migrations **240/242/243/244** are applied on the target database. Only then may step-runner **S1** start.

### What this changes for Phase B

* **Nothing is discarded.** Every commit on `wf2/deep-scrapes-restore-l0` is either prerequisite or golden-master material.
* ⚠️ **Do NOT capture a golden master for `link-wsib` / `link-parcel-addresses` / `compute-parcel-cost-estimates` / `enrich-heritage` until Phase B lands** — capturing early makes the later conversion silently revert Phase B behind a green differential (§12.P P-3).
* **Phase B's exit is now Stage P's done-test:** `git cherry origin/main` shows no unlanded Phase B commit, and migrations **240/242/243/244** are applied on the target database.
* **Do not start step-runner S1 until Stage P closes.** Concurrent work on the three shared steps is the only unsafe option.

<!-- END GENERATED: step-runner programme context -->
