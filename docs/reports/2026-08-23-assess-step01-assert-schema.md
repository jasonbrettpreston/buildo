# Assessment — `sources` step 1, `assert_schema`

**Purpose:** a dry-run of Spec 123's procedure on one real script, to answer two questions: *does the standardized form read clearly at script level*, and *is the assessment robust enough to catch what is actually there.*
**Target:** `scripts/quality/assert-schema.js` — 571 lines, lock 102, **fix density 24/36 = 66.7%** (two-thirds repair by commit count → risk class A).
**Status:** ASSESSMENT ONLY. No code changed. The conversion below is a proposal.
**Method:** Spec 123 §2 phases P0 · P5 · P6 executed here; P3 archaeology dispatched separately.

> ⚠️ **Citation note.** Every `file:line` below was **re-executed against the file** after first drafting. Four were off by ~2 lines and one count was an inherited 13 against a measured **12** — corrected in place. This is the §12.1a rule (*every number carries the command that produced it*) applied to this document, and it drifted inside a single sitting.

> **Why this file first:** it is step 1, it is a **shared step across 3 chains** (Specs 41/42/43), and it is the worst of the three strand factories. If the procedure survives this one it will survive most.

---

## P0 — Boundary freeze (the observable surface)

**Nothing outside this table is behaviour.**

| Surface | Detail |
|---|---|
| **Domain tables written** | ⚠️ **NONE.** This step writes no domain data at all |
| **Bookkeeping written** | `pipeline_runs` — its OWN row, and **only when `!CHAIN_ID`** (`:270` INSERT, `:548` UPDATE). In-chain, `run-chain.js` owns the row |
| **`records_meta`** | `checks_passed` (⚠️ the string `'all'` or `undefined`, not a count) · `checks_failed` (count) · `errors` (string[]) · `audit_table` |
| **`audit_table`** | ⚠️ **three mutually exclusive shapes**, selected by `CHAIN_ID` — permits (5 rows) · coa (5 rows) · sources (2 rows) · plus a standalone fallback preferring permits |
| **Exit code** | `throw` on `!allPassed` (`:567`) ⇒ non-zero. **Halting by design** |
| **stdout contract** | `PIPELINE_SUMMARY` + `PIPELINE_META`; `emitMeta` declares reads `{"CKAN API":["metadata"]}`, writes `{"pipeline_runs":["checks_passed","checks_failed"]}` |
| **Reads** | zero DB reads. All input is network |

## P5 — Seam map

| Seam | Where | Note |
|---|---|---|
| **DB** | `pool` from `pipeline.run` | one INSERT + one UPDATE, both bookkeeping |
| **Clock** | `Date.now()` ×2 (`:262`, `:539`) | ✅ **correct** — elapsed only; DB timestamps use SQL `NOW()` |
| **Network** | `fetch()` — CKAN `datastore_search` ×2 · CSV header ranges ×2 · GeoJSON ×1 · reachability HEADs ×6 · zoning DataStore ×10 | **21 network calls, no timeout, no retry** |
| **argv / env** | `PIPELINE_CHAIN` **only**. No argv at all | manifest declares `supports_full:false`, `supports_dry_run:false` — consistent |

## P6 — Behaviour classification

### CONTRACT — must survive conversion

| # | Behaviour | Evidence it is load-bearing |
|---|---|---|
| C1 | **Halt on drift** — `if (!allPassed) throw` | comment `:563-564`: *"allowing downstream scripts to run with malformed data would silently corrupt 240K+ permit records"* |
| C2 | **Chain-scoped check selection** (`runPermitChecks` / `runCoaChecks` / `runSourceChecks`) | one step, three chains; each validates only its own sources |
| C3 | **`parcels_*` rows appear in BOTH permits and coa audit tables** | ⚠️ deliberate — Spec 79 CRIT-3a, `:452-458`. Parcels feeds both chains |
| C4 | **`hasCoordinateSource` OR-contract** (geometry OR LAT+LNG) | WF3 2026-05-30 — the flat LAT/LONG requirement was *dead on arrival*; the live CSV ships `geometry` |
| C5 | **Own ledger row only when `!CHAIN_ID`** | in-chain double-write otherwise |
| C6 | **Lock 102** | registry-pinned, 3 axes in `pipeline-advisory-lock.infra.test.ts` |

### INCIDENTAL — do not assert on

Console banner text · check ordering within a chain · `(durationMs/1000).toFixed(1)` formatting · the `=== CQA Tier 1 ===` header.

### DEFECT — pin in current form, fix after (Spec 121 §4.3)

> ## ⚠️ CORRECTED BY P3 — the archaeology pass refuted two of the defects below
>
> **This is the single most important result in this document, and it is a result about the *method*, not the file.** The P0/P6 pass (reading the code) produced eight defects. The independent P3 pass (git history + structural re-derivation) **refuted D2 outright, narrowed D1, downgraded D5, and found one defect P0/P6 missed entirely.**
>
> **Spec 123 §7.1's rule — *"never let the same pass both discover and retire a fence"* — is what produced this.** Had one pass done both, four wrong dispositions would have gone into the conversion.
>
> ⚠️ **And D2 is a repeat offence.** The learnings report §9.1 already recorded that B6.6's `assert-schema` strand claim cited the wrong lines and that *"the risk is real via a different path."* **I reproduced that exact error from the same file** by reasoning from `8 throws / 0 finally` instead of positioning each throw. The corrected finding below is what §9.1 said a year of sessions ago.

| Was | P3 verdict |
|---|---|
| **D1** all three verdicts are parallel-boolean | ⚠️ **NARROWED — and sharper.** `:483` and `:506` *are* row-derived (`auditRows.some(r => r.status==='FAIL')`). **Only `:534` (sources) is not** — it reads `sourceErrors.length` from the raw array, never touching `sourceAuditRows`. **The sources chain is the one branch that never received `d2036181`'s fix** — the commit filed precisely because a raw-array verdict returned PASS on a crashed script. That is the chain we are converting |
| **D2** 8 throws / 0 finally ⇒ any of 12 awaits strands the row | ⛔ **REFUTED. 0 of 8 throws can strand it.** Verified: **10 `try` blocks** — the outer at `:289` plus nine inner ones at `:318,:339,:352,:363,:374,:381,:391,:400,:432` — catch all 7 helper throws and convert them to `allPassed = false`. The 8th (`:567`, the circuit breaker) fires **after** the finalize, on a row already written `status='failed'` |
| **D5** `sources_checked: 18` silently lies | ⚠️ **DOWNGRADED.** Re-derived: 8 body-level source checks + 10 zoning = **18 ✓ correct today**, with a full recorded value history 4→14→15→17→18. It is a hand-maintained literal, not a live lie |

**The real strand surface, corrected** — and it is still real, just elsewhere:

| # | Actual strand path |
|---|---|
| 1 | **Process death** (OOM / SIGTERM / cloud step timeout) anywhere in the 12-await window — which fans out to **21 HTTP requests to a single host** |
| 2 | **The swallowed `.catch()` on the finalize UPDATE itself** (`:554`) — a DB error here leaves `running` and emits only a warn |
| 3 | ⚠️ **NEW — D9, missed by P0/P6 entirely** (below) |

> **Six defects survive, one is new, and the two strongest were re-scoped by the pass that was supposed to be routine.**

| # | Defect | Evidence | Ledger |
|---|---|---|---|
| **D1** | ⚠️ **RESCOPED — the sources verdict is not row-derived** (`:534` `sourceErrors.length > 0 ? 'FAIL' : 'PASS'`) | reads the **raw `errors[]` array**, never `sourceAuditRows`. `:483`/`:506` *are* row-derived and are fine. ⚠️ **`d2036181` was filed precisely because a raw-array verdict returned PASS on a crashed script — and it fixed permits/CoA only. The sources branch, the one we are converting, never got it** | `AS-D1` |
| **D1b** | ⚠️ **`verdictCascade` exists in NO shared library** | `grep -rn verdictCascade scripts/lib/ src/lib/` → **0**. It is not exported from `pipeline.js`; it survives as **~10 independent per-script local copies**. Spec 120 §9.3 ①'s *first* work item is "export `verdictCascade`" — still undone | `AS-D1b` |
| **D2** | ⚠️ **RESCOPED — strand surface is process death, not throws** — INSERT `:270`, no `try/finally`, **12 awaits fanning out to 21 HTTP requests to one host** | ⛔ the "8 throws strand it" reading is **refuted** (all caught). The real exposure is OOM / SIGTERM / step-timeout inside that window, where `run-chain.js`'s ceiling kill lands | `AS-D2` |
| **D3** | ⚠️ **INSERT failure is SWALLOWED** (`:276` → `log.warn`, `runId` stays null) | a failed INSERT yields **no row and no error**; the finalize is then silently skipped | `AS-D3` |
| **D4** | ⚠️ **Finalize UPDATE error is SWALLOWED** (`:554` `.catch(warn)`) | **identical to the `load-wsib.js` E#1 defect fold E fixed** — and it is still here. `tasks/lessons.md:30` verbatim | `AS-D4` |
| **D5** | ⚠️ **DOWNGRADED — `sources_checked: 18` (`:527`) is correct today**; the defect is the *unrecorded maintenance obligation* | re-derived 8 + 10 = 18 ✓. The sharper sibling is the alternation regex `:524` `/address\|parcel\|massing\|…/i` — **"add a source ⇒ add a token here" is recorded nowhere** | `AS-D5` |
| **D9** | ⚠️ **NEW — on lock contention the step emits NOTHING.** `if (!lockResult.acquired) return;` (`:570`) returns with **no `emitSummary`** | the chain sees no summary at all, not a skip. ⚠️ `src/tests/quality.logic.test.ts:2181` enforces exactly this emit-before-return guard **for `compute-cost-estimates.js`** — **no equivalent test exists for this file** | `AS-D9` |
| **D10** | ⚠️ **NEW — the file exports nothing and is untestable** | `grep -c module.exports` → **0**. `isSentinelValue`, `parseCost`, `checkColumns` and all four fetchers are **unreachable from a test**. **Zero tests execute this file**; ~43 of ~48 assertions (≈90%) are `readFileSync` + `toContain` against source text | `AS-D10` |
| **D6** | ⚠️ **Error attribution by substring match** — `errors.filter(e => e.toLowerCase().includes('permit'))` | the code already carries a patch for this (*"exact-phrase filters … avoid false positives from generic 'missing'/'api' tokens"*) — a fix applied to a fundamentally string-matching design | `AS-D6` |
| **D7** | `checks_passed: errors.length === 0 ? 'all' : undefined` (`:515`) | a string or absent — **never a number**. Downstream cannot count what passed | `AS-D7` |
| **D8** | 21 network calls with **no timeout and no retry** | one slow CKAN response hangs step 1 of three chains | `AS-D8` |

⚠️ **D3/D4/D9 compound into one silent-green failure mode.** The INSERT can fail silently (D3) leaving no row; the finalize error is swallowed (D4) leaving ; and on lock contention nothing is emitted at all (D9). **All three end in a run that looks fine.** D2 is the fourth path but only under process death, not under any throw.

---

## The proposed conversion

### 1. `scripts/quality/assert-schema.js` — the whole file

```js
#!/usr/bin/env node
/**
 * CQA Tier 1 — pre-ingestion schema validation.
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 */
'use strict';

const pipeline   = require('../lib/pipeline');
const descriptor = require('./assert-schema.descriptor.json');
const compute    = require('../lib/compute/assert-schema');

// Literal only. Kept textually so pipeline-advisory-lock.infra.test.ts's three
// source-text loops (:248, :259-260, :289-292) stay green. The conformance suite
// asserts descriptor.identity.lock === this constant -- it is NOT spliced in at
// runtime, so the JSON and the constant cannot drift apart.
const ADVISORY_LOCK_ID = 102;

module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;   // #163 compute-swap test
module.exports.compute    = compute;
```

**That is the entire step file — 7 executable lines, and the only legal shape (§5.1).** Everything else is either declaration or compute.

### 2. `scripts/quality/assert-schema.descriptor.json` — the declaration

> ⚠️ **CORRECTED 2026-08-23 (operator).** The first draft of this descriptor had all 13 categories but **omitted sub-fields inside them** — `staleness` had no `checkpoint`/`interval`, `guards` had no `requires`/`empty_source`, `execution` had no `batch`/`needs_disk_mb`. **That violates the rule the descriptor exists to demonstrate:** §3.1 says *omission is a build failure; `"none"` is a valid value* — and it applies **per field**, not just per category. A category present with fields missing is the same "we forgot something again" the design is answering. Corrected below: **every field from §3.1 appears, `"none"` where unused.**
>
> ⚠️ **And a genuine gap in Spec 120, found by the same reading: there is no database declaration anywhere in the 13 categories.** Verified — zero mentions of database/DSN/target/connection in §3.1–§3.2.
>
> **Why the register demoted it, and why that reasoning does not close the case.** Claim **#257** (*"each script declares its permitted database class"*) was demoted as tier-0 — *"a hand-maintained contract in 64+ files"* — in favour of `current_database()` + `application_name` at connection open (#255/#256) and an invocation-level flag. **The demotion is right about a DSN and wrong about a requirement.** §A.20 states the residual itself: *"#41, #42 and #119 guard the **runner**. They do not guard analysis, backfills, one-off scripts, reviewer agents, or a query typed in a session — which is where this failure actually bites."*
>
> **That residual is the P0 defect, measured this session:** four analysis scripts default to the pre-cutover DB and report **2,394 violations / 0 FAIL gates** where the authoritative DB has **30,288 / 1**.
>
> **Resolution — zero-sum, no 14th category:** `guards.requires` already declares *"the runner asserts these exist before running"* (extensions · indexes · functions · columns · SRID). **`database` joins that list.** It declares a **requirement the runner checks**, never a DSN — which moves it from tier 0 (documented, rots) to **tier 3 (consumed by the dependent code)**. A step pointed at a 222-migration database **refuses to run** instead of silently grading it.

```jsonc
{
  // ── 1. IDENTITY ────────────────────────────────────────────────────────────
  "identity": {
    "name": "assert_schema",
    "owner": "data",
    "description": "Fail the chain before ingestion if an upstream source schema has drifted.",
    "lock": 102,
    "why_lock": "102 is not a spec number. This step is shared by Specs 41/42/43 and predates per-spec lock assignment; allocated sequentially 102-108 across the 7 quality scripts by cc2f5d5d.",
    "spec": "43",
    "also_governed_by": ["41", "42"],        // ← shared step: 3 SPEC LINK headers, one `spec` field
    "spec_version": "1.0",
    "archetype": "ASSERT",
    "contract_version": 1
  },

  // ── 2. INPUTS ──────────────────────────────────────────────────────────────
  "inputs": {
    "reads": [
      { "kind": "external", "id": "ckan_permits", "resource": "6d0229af-…", "chains": ["permits"] },
      { "kind": "external", "id": "ckan_coa",     "resource": "51fd09cd-…", "chains": ["coa"],
        "why": "Active resource only. Closed ships WARD_NUMBER (int4) + CONTACT_NAME; Active ships WARD (text)." },
      { "kind": "external", "id": "csv_address_points",      "chains": ["sources"] },
      { "kind": "external", "id": "csv_parcels",             "chains": ["permits", "coa", "sources"] },
      { "kind": "external", "id": "geojson_neighbourhoods",  "chains": ["sources"] },
      { "kind": "external", "id": "zip_massing",             "chains": ["sources"] },
      { "kind": "external", "id": "zip_ravine",              "chains": ["sources"] },
      { "kind": "external", "id": "zip_heritage_register",   "chains": ["sources"] },
      { "kind": "external", "id": "zip_heritage_hcd",        "chains": ["sources"] },
      { "kind": "external", "id": "zip_centreline",          "chains": ["sources"] },
      { "kind": "external", "id": "ckan_zoning", "resources": 10, "chains": ["sources"] }
    ],
    "version_pin": "none",      // externals carry no producer version
    "assert_health": "none",    // no producer step to health-check
    "expect_nonempty": true,
    "on_missing": "halt"
  },

  // ── 3. OUTPUTS ─────────────────────────────────────────────────────────────
  "outputs": {
    "writes": "none",           // ← ASSERT archetype: zero domain writes. step-config.json declares output_tables: []
    "why": "CQA gate. Its only durable trace is the runner-owned ledger row; that row is bookkeeping, not output.",
    "table": "none", "key": "none", "columns": "none",
    "retract": "none", "replay": "none", "publish": "none",
    "invalidates": "none"
  },

  // ── 4. STALENESS ───────────────────────────────────────────────────────────
  "staleness": {
    "pending": "all",           // an assert always runs
    "checkpoint": "none",       // atomic; nothing to resume
    "interval": "none",         // not interval-partitioned
    "logic_version": "none",    // no author override; the computed fingerprint governs
    "on_fingerprint_change": "queue"
  },

  // ── 5. GUARDS ──────────────────────────────────────────────────────────────
  "guards": {
    "requires": {
      "extensions": "none",
      "indexes":    "none",
      "functions":  "none",
      "columns":    "none",
      "srid":       "none",
      // ⚠️ NEW — the gap this conversion found. NOT a DSN: a requirement the runner
      // asserts at connection open (tier 3), so a step pointed at the pre-cutover
      // database REFUSES rather than silently grading it.
      "database": { "class": "pipeline", "min_migration": 244, "assert_current_database": true }
    },
    "empty_source": "none",     // reads no table
    "schema_drift": "pause",
    "network": true
  },

  // ── 6. EXECUTION ───────────────────────────────────────────────────────────
  "execution": {
    "budget": "5m",
    "txn_scope": "none",        // no transaction: no domain writes
    "txn_budget": "none",
    "chunked": false,
    "statement_timeout": "none",
    "batch": "none",
    "on_row_error": "fail_fast",
    "criticality": "required",
    "needs_disk_mb": "none",    // metadata + byte-range prefixes only; nothing downloaded
    // ⚠️ NEW — 21 HTTP requests to ONE host, today with no timeout and no retry (D8)
    "network": { "timeout": "30s", "retries": 2, "hosts": ["ckan0.cf.opendata.inter.prod-toronto.ca"] }
  },

  // ── 7. CHECKS — never "none" ───────────────────────────────────────────────
  "checks": [
    { "id": "permit_columns_present", "kind": "schema", "chains": ["permits"],
      "expect": ["PERMIT_NUM","REVISION_NUM","PERMIT_TYPE","STATUS","DESCRIPTION","EST_CONST_COST",
                 "STREET_NUM","STREET_NAME","BUILDER_NAME","ISSUED_DATE","APPLICATION_DATE"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "schema drift before ingestion silently corrupts 240K+ permit records" },

    { "id": "permit_types_coercible", "kind": "schema", "chains": ["permits"], "sample": 20,
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "CKAN ships sentinel rows (DO NOT UPDATE OR DELETE THIS INFO FIELD); sample raised 5->20 by aeb6e6c2 to reduce all-junk risk" },

    { "id": "coa_columns_present", "kind": "schema", "chains": ["coa"],
      "expect": ["REFERENCE_FILE#","IN_DATE","STATUSDESC","STREET_NUM","STREET_NAME","STREET_TYPE",
                 "C_OF_A_DESCISION","HEARING_DATE","WARD","DESCRIPTION","SUB_TYPE"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "corrected twice: APPLICATION_DATE->IN_DATE + STATUS->STATUSDESC (4ec51db1); WARD not WARD_NUMBER (10b98004)" },

    { "id": "address_points_columns_present", "kind": "schema", "chains": ["sources"],
      "expect": ["ADDRESS_POINT_ID","ADDRESS_NUMBER","LINEAR_NAME_FULL","ADDRESS_FULL","LO_NUM","HI_NUM",
                 "MAINT_STAGE","ADDRESS_STATUS","ADDRESS_CLASS_DESC","CLASS_FAMILY_DESC","PLACE_NAME"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "canonical source for ADDRESS_NUMBER + LINEAR_NAME_FULL since Toronto stripped them 2026-05-20" },

    { "id": "address_points_has_coordinate_source", "kind": "invariant", "chains": ["sources"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "OR-contract: geometry OR (LATITUDE+LONGITUDE). C4 — fence 646ea5a7, Severity HIGH: the flat LAT/LONG requirement was dead on arrival and chain-blocking" },

    { "id": "parcel_columns_present", "kind": "schema", "chains": ["permits","coa","sources"],
      "expect": ["PARCELID","FEATURE_TYPE","STATEDAREA","geometry"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "C3 — parcels feeds link-parcels (permits) AND link-coa-to-parcels (coa). Spec 79 CRIT-3a" },

    { "id": "neighbourhoods_id_property_present", "kind": "schema", "chains": ["sources"],
      "expect_any_of": ["AREA_SHORT_CODE","AREA_ID"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "AREA_S_CD was removed upstream; the loader already had a fallback chain, so only the assertion false-failed (b09bdcf1)" },

    { "id": "source_archives_reachable", "kind": "freshness", "chains": ["sources"],
      "subjects": ["zip_massing","zip_ravine","zip_heritage_register","zip_heritage_hcd","zip_centreline"],
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "HEAD reachability only; attribute validation runs post-download in each loader" },

    { "id": "zoning_resources_present", "kind": "schema", "chains": ["sources"], "subjects": 10,
      "limit": "viol == 0", "severity": "FAIL", "blocking": true, "when": "pre",
      "why": "10 DataStore resources (Spec 58); full attribute drift enforced at load time by zoning-attr-drift.js" },

    { "id": "sources_checked_count", "kind": "field_coverage", "chains": ["sources"],
      "limit": "pop >= 18", "severity": "INFO", "blocking": false, "when": "post",
      "why": "D5 — DERIVED from the checks that ran. Replaces a hand-maintained literal whose history is 4->14->15->17->18" }
  ],

  // ── 8. OVERRIDE ────────────────────────────────────────────────────────────
  "override": "none",           // a gate must not be bypassable

  // ── 9. EMITS ───────────────────────────────────────────────────────────────
  "emits": "none",              // runner defaults only

  // ── 10. DEVIATIONS ─────────────────────────────────────────────────────────
  "deviations": [
    { "from": "outputs.writes must name a table",
      "why": "ASSERT archetype writes no domain data; the ledger row is runner-owned",
      "adjudicated_by": "PENDING", "date": "2026-08-23" }
  ],

  // ── 11. LIMITATIONS ────────────────────────────────────────────────────────
  "limitations": [
    { "what": "reachability proves the URL responds, not that the archive parses",
      "measured": "2026-08-23", "check_id": "source_archives_reachable" },
    { "what": "13 of 32 constants carry no recorded rationale; 4 URLs, 2 Range windows and 3 regexes originate in b4e3d56e, whose commit body is empty",
      "measured": "2026-08-23", "check_id": "none" }
  ],

  // ── 12. INTERPRETATION ─────────────────────────────────────────────────────
  "interpretation": "assert-schema.notes.json",

  // ── 13. RECOVERY ───────────────────────────────────────────────────────────
  "recovery": {
    "reset": "none",            // writes nothing to reset
    "resume": "none",
    "force": "none",
    "rollback": "none",
    "verify_clean": "none",
    "cascades": "none"
  }
}
```

### 3. `scripts/lib/compute/assert-schema.js` — what is left

```js
// The ONLY thing the step author writes. ~120 lines: the fetchers.
// No verdict. No audit rows. No pipeline_runs. No error attribution.
module.exports = async function compute(ctx) {
  const { checks, chain, http } = ctx;      // http: timeout+retry from execution.network

  return {
    permit_columns_present:  await http.ckanFields(RES.permits),
    permit_types_coercible:  await http.ckanSample(RES.permits),
    coa_columns_present:     await http.ckanFields(RES.coa),
    address_points_columns_present: await http.csvHeaders(URL.addressPoints),
    address_points_has_coordinate_source: hasCoordinateSource(/* … */),
    parcel_columns_present:  await http.csvHeaders(URL.parcels),
    neighbourhoods_id_property_present: await http.geojsonKeys(URL.neighbourhoods),
    source_archives_reachable: await http.reachable(ARCHIVES),
    zoning_resources_present: await http.ckanFields(RES.zoning),
  };
};
```

**The runner does the rest:** selects checks by `chains` ∋ `chain` (C2), evaluates each `limit`, derives the verdict **from the rows** (D1), builds the audit table, owns the ledger row in a `finally` (D2/D3/D4), derives `sources_checked` from the checks that ran (D5), attributes each error to its own check id rather than by substring (D6), emits `checks_passed` as a **count** (D7), and halts because `blocking: true` (C1).

---

## Findings

### Does it read clearly? — **Yes, and the ratio is the answer**

| | Before | After |
|---|---:|---:|
| Step file | 571 | **~10** |
| Descriptor | — | ~95 (declaration) |
| Compute | — | **~120** |
| **Ceremony that disappears** | **~340** | **0** |

What vanishes: 3 hand-built audit tables (~80 lines) · the `pipeline_runs` INSERT/UPDATE + both swallowed catches (~30) · substring error attribution (~20) · 3 parallel-boolean verdicts · the `(() => {…})()` IIFE selecting the audit table by chain (~35) · the `meta` JSON assembly.

⚠️ **The chain-scoping becomes visible.** Today `runPermitChecks/runCoaChecks/runSourceChecks` are three booleans read at `:286-288` and re-tested at nine call sites. In the descriptor each check declares `chains: [...]` **on itself** — you can see which chains validate parcels by reading one line, instead of tracing three booleans through 160 lines.

### Is the assessment robust? — **Yes, with one caveat**

**It found 8 defects from P0+P5+P6 alone, before archaeology ran.** Three of them (D2/D3/D4) compound into one silent-green failure mode, and **D4 is a defect fold E already fixed in a sibling file and never swept here** — exactly the "a guard on one pass is a latent bug on the other" class in `tasks/lessons.md:30`.

⚠️ **The caveat: P6 alone would have over-pinned.** Reading the code, `sources_checked: 18` looks like a CONTRACT — a stable audit row consumers might read. It is only a DEFECT once you notice the comment is a hand-maintained sum. **Spec 123 §3 question 1 ("is it observed?") is what catches it**, and it needs the consumer census to answer, which is `[MEASURED]` work, not reading. The procedure is right that P6 depends on P0's consumer inventory.

---

## What we will encounter elsewhere — six things this one file predicts

| # | Encountered here | Expect across the fleet |
|---|---|---|
| **1** | ⚠️ **The descriptor needs a `chains:` field on each CHECK, which Spec 120 §3 does not have** | **10 shared steps / 28 slots.** Spec 120's `checks` vocabulary has no chain scoping. **This is a real gap in 122's inherited schema — add it before C1** |
| **2** | Lock 102 ≠ any of its 3 spec numbers, so `why_lock` is mandatory | ≥12 register entries; *"the highest re-litigation-per-line item"* |
| **3** | Three SPEC LINK headers on one file | the descriptor's `spec` is singular. Shared steps need `spec: []` or a primary + `also_governed_by` |
| **4** | An ASSERT writes nothing, so `outputs: "none"` and `recovery: "none"` | 5 ASSERT steps in `sources`. **Spec 120's "omission is a build failure, `none` is valid" is doing real work here** — without it these read as forgotten |
| **5** | `emitMeta` declares writes `{"pipeline_runs": [...]}` — **bookkeeping declared as a data write** | likely repo-wide. The ledger is runner-owned; declaring it as an output is a category error the descriptor removes |
| **6** | 21 network calls, no timeout/retry, on step 1 of three chains | every INGESTOR. `execution.network` must be in the vocabulary — **it is not in Spec 120 §3.2 today** |

> ⚠️ **Findings 1 and 6 are schema gaps in Spec 122's inherited declaration, found by converting one file.** That is the C1 pilot's stated purpose — *"if #3 forced a runner change, do not freeze the template."* It forced two on **#1**.

---

## Recommended dispositions

- **Pin all 8 defects** in current form; convert; prove zero-diff; then fix each in its own commit (Spec 121 §4.3).
- ⚠️ **Except D2/D3/D4** — the strand triple is already scheduled at **P0/P3** of the programme plan and is a *prerequisite*, not a per-step fix. Fixing it here duplicates that work; fixing it at P3 means this conversion inherits a clean ledger.
- **Add `checks[].chains` and `execution.network` to the descriptor schema before C1.**
- **Resolve `identity.spec` for shared steps** before C4 (28 slots).

---

## Contract coverage audit — does §3.0's 17 categories + 40 concerns cover this whole file?

**Method:** extract every declarable item from `assert-schema.js` mechanically (top-level consts, every `records_meta` key, every emit), then map each to a home. **Anything left over that is not compute is a gap.**

### Every declarable item, mapped

| Item in the file | Home | Concern |
|---|---|---|
| `SLUG = 'assert_schema'` | `identity.name` | — |
| `ADVISORY_LOCK_ID = 102` | `identity.lock` + `why_lock` | — |
| 3× `SPEC LINK` headers (41/42/43) | `identity.spec` + `also_governed_by` | — |
| `CKAN_BASE`, 2 resource IDs, 8 download URLs | `inputs.reads[]` (externals) | 12 |
| 4 × `EXPECTED_*_COLUMNS`, `NEIGHBOURHOOD_ID_PROPS` | `checks[].expect` / `.expect_any_of` | ⬦ **38 — OPEN** |
| `hasCoordinateSource` import | **COMPUTE** — already extracted to `lib/` by fence `646ea5a7` *"so it can be unit-tested"* | ⬦ 40 |
| `limit=0`, `limit=20` sample size | `checks[].sample` | 25 |
| `CHAIN_ID = process.env.PIPELINE_CHAIN` | `sharing` — ⚠️ **`~` derived; the step stops reading env at all** | 34 |
| `runPermitChecks` / `runCoaChecks` / `runSourceChecks` | `sharing.varies_by_chain.checks` | 34 |
| 3 mutually exclusive `audit_table` shapes | `sharing.varies_by_chain.audit_table` | 34 |
| `phase: 1` | `sharing.varies_by_chain.phase` (a **map**) | 34 |
| hand-rolled `pipeline_runs` INSERT/UPDATE | **RUNNER** | 2 |
| `allPassed`, `errors[]`, the 3 verdict ternaries | **RUNNER** — row-derived | 23 |
| `checks_passed` / `checks_failed` | `counters` | 22 |
| `records_total: 0`, `_new: null`, `_updated: null` | `counters` (observer → `null`) | 22 |
| `sources_checked: 18` | `checks[]` — **derived from checks that ran** | 24 |
| `metric` / `value` / `threshold` / `status` / `rows` | **RUNNER** — the audit-row shape | 24 |
| `if (!allPassed) throw` | `checks[].blocking: true` | 26 |
| `if (!lockResult.acquired) return` | `sharing.on_contention` | 6 |
| 21 `fetch()` calls, no timeout/retry | `execution.network` | 31 |
| `Date.now()` ×2 (elapsed only) | **RUNNER** | 7 |
| `pipeline.run` / `withAdvisoryLock` / `emitSummary` / `emitMeta` | **RUNNER** | 2, 24 |
| 2 × `amnesty.json` exemptions | `deviations` | 36 |
| the 4 fetchers, `isSentinelValue`, `parseCost` | ⬦ **COMPUTE** | 40 |
| console banner, `.toFixed(1)` | **INCIDENTAL** — not declared | — |

### ⚠️ ONE item has no home — and it is a cross-layer duplication

**`audit_table.name: 'Schema Validation'`.** `[MEASURED 2026-08-23]`

| Fact | |
|---|---|
| Declared **5 times across 3 layers** | `assert-schema.js:482,:505,:533` · `FreshnessTimeline.tsx:89` · `src/lib/quality/types.ts:634` |
| Pinned by a source-text test | `admin.ui.test.tsx:1155` |
| Distinct name strings across the 27 steps | **34**, no convention (`'Parcels Ingestion'` · `'LINEAR_26'` · `'Data Quality'` vs `'Data Quality Checks'`) |

> **Resolution — concern 41, `identity.display_name`.** One declaration, consumed by the admin layer instead of re-declared there. This is the same shape as the slug forms: **a value duplicated across layers because nothing owns it.**

### The verdict

**39 of 40 concerns land. One gap. Everything else that remains is compute — as intended.**

The compute surface for this step is **the 4 fetchers plus 2 pure helpers, ~120 lines** — and the two helpers *already* have a repo precedent for extraction (`hasCoordinateSource`, moved to `lib/address-points-csv-drift.js` by a HIGH fence specifically so it could be unit-tested).

---

## How the ASSERT archetype changes the approach

**The archetype's job is to tell you which categories are live and which are forced.** For `assert_schema`:

| Forced by archetype | To | Why |
|---|---|---|
| `outputs` | **`"none"`** | an ASSERT writes no domain data — `step-config.json:11` already declares `output_tables: []` |
| `recovery` | **`"none"`** | nothing written, nothing to reset |
| `counters` | **`null`** | observer archetype; Spec 47 §11's null convention |
| `override` | **`"none"`** | ⚠️ **a gate must not be bypassable** |
| `emits` | **`"none"`** | runner defaults only |
| `config` | **`"none"`** | confirmed: step 1 is in the evidence base §3b *"externalize nothing"* list |
| `write_discipline.class` | **`verdict_only`** (class L) | §3f's measured class for steps 1, 23, 24, 26 |
| `partial_fill` | **`none`** | no partial state possible |

**6 of 17 categories collapse to `"none"`, and 2 more are forced to a single value.** That is the archetype earning its place: it tells you which **11** categories you actually think about, and makes the other 6 explicit rather than forgotten.

⚠️ **And it is why `assert_schema` was a weak first test.** An ASSERT exercises the *least* of the contract — `outputs`, `recovery`, `staleness`, `counters` and the whole transaction/write-discipline machinery all come back `none`. **The pilot must include a writer.** `link_parcels` (LINK, full retraction, class F) and `enrich_parcels` (ENRICHER, multi-pass defer, class J, 2,153 lines) exercise the half this one left empty.

**The archetype also changes what the gates demand:**

| Archetype | The gate it forces |
|---|---|
| `ASSERT` | `checks` ≥ 1; `outputs` must be `none` |
| `ENRICHER` | ⚠️ `pending` on a lineage column **⇒ a declared invalidator** — this is the centroid defect made unexpressible |
| `INGESTOR` | `write_discipline` + `retract` + `replay` + `empty_source` all required |
| `LINK`/`MATCHER` | `invalidates` required; counters scoped by `writes.key` |
