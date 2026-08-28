# Pilot 4 — `link_wsib` (MATCHER) — Step Optimization Assessment

**Status:** Commits 1-4 landed (§1 PH-0 boundary freeze; §2 PH-3 Intent Ledger, PROPOSED, 17 fences + 7 LW-D* rows opened; §3 PH-5 seam map, no PARTIAL seams remaining; §4 PH-6 classification, every candidate classified, 171-magnet exposure quantified 0-locally). §0 (seed), Fold A/B/C (2026-08-28, folded into `.cursor/active_task.md`) remain below as history. Sections §5 (non-determinism inventory), §6 (declared diffs), §R Reflection — NOT YET WRITTEN, land at commit 5 (golden master) / commit 7 (implementation) per the ledger.

**Governing plan:** `.cursor/active_task.md` (Pilot 4 — link_wsib). **Governing specs (operator correction 2026-08-28 — led by the step's own governing spec, not the architecture spec):** `docs/specs/01-pipeline/46_wsib_enrichment.md` (PRIMARY), `60_shared_steps.md` (§2 Step Registry row 19, §"Link WSIB"), `52_source_wsib.md`, `41_chain_permits.md` §Step Breakdown row 7, `43_chain_sources.md` §Step Breakdown row 19, then `docs/specs/01-pipeline/122_pipeline_step_optimization.md`, `124_step_standard_policy.md`, `123_step_opt_assessment_validation.md` (packaging/procedure).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-28, same session as §0's seed — every §0 number reconfirmed bit-for-bit against `172.20.0.10:5432/postgres` (`schema_migrations` count **242**, max filename `245_parcels_centroid_geom_invalidation.sql`, unchanged). §0 above is not superseded; this section is the formal G0 pass that re-executes it as commit 1's own claim, per Spec 123 §7's "PH-0 is a commit, not a planning artifact" convention (pilot 3 precedent: `2fa69840`).

**Re-confirmed this commit (`node -r dotenv/config`, `pipeline.createPool()`):**

| Check | §0 seed value | Re-executed 2026-08-28 (commit 1) | Match |
|---|---|---|---|
| `wsib_registry` total / linked | 121,116 / 13,965 | 121,116 / 13,965 | ✓ identical |
| `entities` total / wsib-registered | 3,948 / 938 | 3,948 / 938 | ✓ identical |
| `logic_variables` total | 432 | 432 | ✓ identical |
| `schema_migrations` count / max | 242 / `245_...` | 242 / `245_...` | ✓ identical |
| `wsib_registry` index count | 11 | 11 (`idx_wsib_class, idx_wsib_enrichment_queue, idx_wsib_is_gta_unenriched, idx_wsib_legal_norm, idx_wsib_legal_trgm, idx_wsib_linked_entity, idx_wsib_registry_unlinked, idx_wsib_trade_norm, idx_wsib_trade_trgm, wsib_registry_legal_name_normalized_mailing_address_key, wsib_registry_pkey`) | ✓ identical set |
| RLS (`wsib_registry`, `entities`) | enabled / 0 policies | `relrowsecurity=true` both tables (policy count not re-queried this pass — §0's "0 policies" stands, unchanged surface) | ✓ consistent |

**No drift found.** The DB has not moved since the planning session captured §0 — same host (`172.20.0.10:5432`, container-internal address for `127.0.0.1:54322`), same database (`postgres`), same migration floor.

**Additional G0 surface, re-executed this commit (not in §0's original seed):**
- `load-wsib.js`'s `ON CONFLICT (legal_name_normalized, mailing_address) DO UPDATE SET` (lines ~219-233) lists exactly `trade_name, trade_name_normalized, predominant_class, naics_code, naics_description, subclass, subclass_description, business_size, is_gta, last_seen_at` — confirmed by direct read. Never touches `linked_entity_id`/`match_confidence`/`matched_at`/`mailing_address`/`primary_phone`/`primary_email`/`website`.
- `grep -n "DELETE\|TRUNCATE" scripts/load-wsib.js` → **0 matches** (Fold C).
- `SELECT count(*), count(*) FILTER (WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL OR website IS NOT NULL), count(*) FILTER (WHERE linked_entity_id IS NOT NULL AND same) FROM wsib_registry` → **121,116 / 0 / 0** (Fold C — local dev DB carries zero Serper-enriched contact rows).
- `manifest.chains.sources` direct array index: `load_wsib` at 18, `link_wsib` at 19, of 28 (Fold C, G-19).

**Spec 46/60/52 cross-check (operator correction, 2026-08-28 — see `.cursor/active_task.md`'s "Before/after guarantees" table, now 19 rows G-1..G-19):** two measured CONFLICTS between Spec 60's own text and the code (G-16: Spec 60's Step Registry declares `link_wsib`'s write target as `entities` ONLY, refuted — the step also writes `wsib_registry`; G-17: Spec 60 names the method "Fuzzy string matching (Levenshtein distance)", refuted — the real method is `pg_trgm` trigram similarity in a 3-tier exact/exact/fuzzy cascade). Both are declared diffs, scheduled for the Spec Update step at commit 7, not resolved here. One genuine GAP (G-18: A-7's copyContacts reverse-clear pass has no contract anywhere in Spec 46 §2, which describes only the forward COALESCE-fill direction) — flagged as a ruling needed at commit 7, not resolved here. No BLOCKING conflict found against A-7's mechanism or A-8's cadence ruling.

### Action: `review_followups.md:3015` (finding 1 / A-6) — VERIFY-AND-SKIP, confirmed

Read verbatim this commit: the row at `docs/reports/review_followups.md:3015` (the `R-D, assert_schema` MED entry) already carries the 2026-08-28 correction — *"NOTE 2026-08-28: the R-D commit body wrongly cited link_wsib as a `wsib`-chain member — MEASURED: link_wsib sits in `permits` and `sources`, both assert_schema-headed... so pilot 4 is covered"* — landed at commit `188d7371`/`ad0c1682` (this branch's own HEAD before this pilot started). **No edit made** — Fold A's Integration S3 finding is confirmed correct; this pilot's action downgrades from "correct" to "verify," as scheduled.

### Two LOW followups filed this commit (`docs/reports/review_followups.md`)

1. The intermittent unnamed hook red (1 test, seen twice 2026-08-28 under load — see below).
2. Spec 52 §Edge Cases' "Truncated download → could drop previously matched builders (no rollback protection)" is STALE — `load-wsib.js` is UPSERT-only (0 DELETE/TRUNCATE), so a truncated download cannot drop a previously-matched builder; the real (different) risk is `trade_name_normalized` rewrite under an unchanged link (Fold C, feeds G-19/A-8's corpus-signal rationale).

---

## §2. PH-3 — Intent Ledger over the `fix(` corpus (commit 2, G3)

> **17 `fix(` commits, adjudicated by `git log -S`/`git show` per construct**, per pilot 3's own G1 ruling for its own zero-`Severity:`-footer file (this file: 0 `Severity:`/`lesson-routing:` footers too, same instrument-limit). Each row states: what the commit changed in `scripts/link-wsib.js`, whether that construct is STILL LIVE in the current 547-line file (verified this session), and a **PROPOSED** disposition from the closed Intent Ledger vocabulary (`preserved-in-runner \| preserved-in-validator \| preserved-in-compute \| encoded-as-descriptor-field \| encoded-as-deviation \| knowingly-retired`). **Per Spec 124 §4.2 (discoverer≠adjudicator): this table is PROPOSED by this pass — final ADJUDICATION is a separate operator ruling**, mirroring pilot 3's own split (`2fa69840` proposed 16 fences pending §7.1; `6dc6c40c` adjudicated them in a later commit). The commit ledger's own Done-test for this row states "a human adjudicates" — this table is that proposal.

| Commit | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|
| `4bb44fbb` (F1) | Phase-ordinal ternary `(PIPELINE_CHAIN==='sources')?19:7` | ✓ (`:163`, `:198`, `:526`) | **encoded-as-descriptor-field** | → `sharing.varies_by_chain.phase: {permits:7, sources:19}` (E3) — supersedes `5baaed5a`'s earlier 12/5 values (see below) |
| `a81c6a7c` | `FORCE_FULL_ENV`, `readThresholdVersionSignal`/`hasThresholdChanged`, honest `records_updated: totalLinked` | ✓ (`:36`, `:85-106`, `:510`) | **encoded-as-descriptor-field** (override/staleness) + **preserved-in-compute** (the honest aggregate) | `override.force_full` (E1, box already exists per pilot 3's own E1 finding); `staleness.trigger` gains `config_version` (A-3/LG-12) |
| `b92ad16f` | `buildSkipGateRecordsMeta` skip-path audit rows | ✓ (`:160-166`) | **preserved-in-runner**, PINNED pending commit 7's LG-15 ruling | Fold A's B1/LG-15 finding: this becomes the library's gated-skip mechanism; stays in compute until A-1 is ruled |
| `2633c1cb` (A1/A2/A3) | logicVars validation + `--dry-run` parse hoisted ABOVE the advisory lock/gate | ✓ (`:110-126`) | **encoded-as-descriptor-field** | `config.hoisted_above_gate: true` — the schema field already exists FOR THIS EXACT FENCE (G-4) |
| `2577e694` (AP1) | zero-unlinked `audit_table` shape (SKIPPED/reason INFO rows); `preRowCount`-before-DELETE half N/A (0 DELETE in this file, confirmed) | ✓ shape (`:190-207`); DELETE-guard half N/A | **encoded-as-descriptor-field** (the shape) | `terminals[]` gains the vacuous-zero-unlinked entry (G-12) |
| `52ad6527` (§11) | `records_total: totalUnlinked` (not `totalLinked`) — "full evaluation scope, not matched-only" | ✓ (`:508`, current/final value — see churn note below) | **preserved-in-compute**, PIN pending commit 7's `outputs.counters` declaration | commit message IS the `why` Rule 4 requires; carries forward verbatim into the descriptor |
| `76dcca28` (B1 Batch 3) | `parseInt`→`safeParsePositiveInt` ×4 sites | ✓ (`:185`, `:340`, `:494-495`) | **preserved-in-compute** | pure numeric-safety helper call, Rule 2 domain logic, no descriptor field warranted |
| `c1ef0b73` (Bundle G Wave 2) | `ADVISORY_LOCK_ID = 94`, `RUN_AT` via `getDbTimestamp`/`withAdvisoryLock` | ✓ (`:30`, `:128-129`) | **encoded-as-descriptor-field** | `identity.lock: 94` kept textually (§5.4, S1) |
| `714dc48e` (WF3-E20) | `wsib_fuzzy_match_threshold` externalized to `logic_variables` | ✓ (`:26-28`, `:114-117`) | **encoded-as-descriptor-field** | `config.logic_variables[]` (T1, already registered+GROUPed) |
| `d704a447` | Strip leading THE/A/AN before first-letter blocking comparison | ✓ (`:258-259`, `:272-273`) | **preserved-in-compute** + Rule-4 `why` owed | **Most consequential fence in the corpus** — the predicate this fix INTRODUCED is what today's tier-3 pass rate (38.1%) measures against; because the `WHERE linked_entity_id IS NULL` guard is monotone (G-8), the 60.5% pre-fix contamination this fix could not retroactively repair is exactly A-7's reason for existing (Fold A/Reality-Check). The article-stripping rule itself needs a `checks[].why` at commit 7, same treatment as LM-D13's tiebreak |
| `30ff8805` | `buildTier3Ctes(extraFilter)` parameterization + dry-run `pg_trgm` threshold parity | ✓ (`:251-285`, `:334`) | **preserved-in-compute** | correctness/safety refactor (fragile string-replace → parameterized function), Rule 2 |
| `647d0935` (8 fixes) | ORDER BY score DESC scoring rule; `SET pg_trgm.similarity_threshold` before Tier 3; `LIMIT 1000` safety cap; `copyContacts` aggregation+NULLIF guard; pairwise WHERE guard; dry-run tier1/2 exclusion; threshold 70%→5% | ✓ all (`:291`, `:431`, `:292` S3, `:219-241`, `:328-332`) | **SPLIT**: `LIMIT 1000` → **encoded-as-descriptor-field** (S3, structural); scoring ORDER BY → **preserved-in-compute** + Rule-4 why; `copyContacts` guard → **encoded-as-descriptor-field** (`write_discipline.guard_why`, G-15); `>=5%` value → **encoded-as-descriptor-field** (T2) | the single largest commit in the corpus (8 named fixes); none superseded |
| `0523947c` | Cumulative (not run-specific) link rate; threshold 70%→5% | ✓ (`:494-496`, `:503`) | **preserved-in-compute** (the cumulative-vs-run-specific choice) + **encoded-as-descriptor-field** (T2 value) | commit message states the `why` ("most WSIB entries have no matching entity in our 3.7K builder pool") — carries forward verbatim |
| `5baaed5a` | Phase ternary INTRODUCED (values 12/5) + sources-chain `assert_schema`/`link_neighbourhoods`/`load_wsib`/`compute_centroids` audit_table gaps (other files) | ⚠️ **SUPERSEDED** — mechanism survives, VALUES corrected by `4bb44fbb` (12/5 → 19/7) | **knowingly-retired** (this commit's specific values), superseded-by `4bb44fbb` | no separate LW-D needed — same E3 field, later value wins |
| `b71db6e0` | OR-join → `trade_matches`/`legal_matches`/`combined` CTE split (GIN index use) | ✓ (`:252-284`) | **preserved-in-compute** | Rule 4 already satisfied — the header comment (`:243-246`) already documents the "Nested Loop over 107K × 3.6K rows (~394M similarity calls)" rationale |
| `bd06751d` | `records_total: totalLinked` (reverting `412927ca`'s `totalUnlinked`) | ⚠️ **SUPERSEDED** by `52ad6527` (reverted back to `totalUnlinked`, the CURRENT value) | **knowingly-retired** | see churn note below — this is the middle flip in a 3-commit back-and-forth |
| `412927ca` (C3) | First `pipeline.emitSummary`/raw `PIPELINE_SUMMARY` console.log + `records_total: totalUnlinked` in the raw `pipeline_runs` UPDATE | ⚠️ **SUPERSEDED** by the Pipeline SDK migration (`0ef23550`, not itself in the 17-fix corpus — a `refactor(` commit) | **knowingly-retired** (the raw-console.log/raw-UPDATE mechanism); the semantic intent (`records_total` = the DENOMINATOR, not just matches) survives via `52ad6527` | the SDK's `emitSummary`/`emitMeta` triples (G-9) are the living descendant |

**Churn note — `records_total`'s semantic settled after 3 flips, not on the first try:** `412927ca` (Mar 7, 12:20) set it to `totalUnlinked`; `bd06751d` (Mar 7, 20:53, same day) reverted to `totalLinked`; `52ad6527` (Apr 18) reverted AGAIN to `totalUnlinked` — the value the code carries TODAY, justified as "full evaluation scope, not matched-only." This is exactly the kind of settled-but-unwritten-down semantic Rule 4 exists for: the FINAL value is correct and matches the current file, but a reader of the file alone cannot see that it survived two reversions — the descriptor's `outputs.counters` declaration (commit 7) must carry `52ad6527`'s stated rationale forward as the field's own `why`, not just the number.

**LW-D* rows opened this commit** (defect-ledger.md, adjudicated candidates — full classification at commit 4/PH-6):
- **LW-D1** — T2 (`>= 5%` link-rate floor) is an undeclared, verdict-bound literal — the P4 violation, parallel to `link_massing`'s T4.
- **LW-D2** — `manifest.json`'s `link_wsib` entry carries two FALSE flags (`supports_full: true`, `supports_dry_run: false`) — both refuted by measurement (finding 5).
- **LW-D3** — `manifest.json`'s `telemetry_tables: ["entities"]` under-declares the write surface (`wsib_registry` also written) — same class as Spec 60's own G-16 under-declaration (§1 above), a second independent confirmation of the same real defect at a different layer.
- **LW-D4** — the `[0.50, 0.60)` "med_conf" stats-bucket boundary (`:485`) is DEAD — no code path writes a confidence in that range (T5's declared limitation).
- **LW-D5** — `d704a447`'s article-stripping predicate fix could not retroactively repair the 8,450 links (60.5%) written under the pre-fix algorithm, because the `WHERE linked_entity_id IS NULL` guard is monotone — root cause of A-7's tier-3 repair. Not a bug in `d704a447` itself (the fix was correct going forward); the DEFECT is the absence of any repair mechanism for already-written links, which A-7 closes.
- **LW-D6** — S2's asymmetric length floors (`>= 3` exact-match tiers vs `>= 5` fuzzy tier) have no recorded `why` anywhere in the 17-commit corpus — the semantic reasoning (exact match tolerates short strings; fuzzy on short strings produces garbage similarity) is inferred by this pass, not found in any commit message. Needs a `checks[].why` at commit 7 (S2).
- **LW-D7** — `review_followups.md:3015`'s stale chain-membership claim (finding 1) — CLOSED this commit (verify-and-skip, §1 above; already corrected pre-pilot).

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/link-wsib.js` touches something outside pure computation — DB, clock, network, argv/env — with its current form and where the library seam replaces it. Re-verified this commit against the current 547-line file (all anchors re-greped, none moved since §0/§1).

### DB seam
- `pool` / `client` — supplied by `pipeline.run('link-wsib', main)` (`:544`), never a local `new Pool()` (Rule/lesson: "No `new Pool()` — use the pool provided by `pipeline.run`" already honoured).
- **9 `client.query`** sites, all inside `pipeline.withTransaction(pool, async (client) => {...})` (`:343-462`) — the ONE transaction boundary for all 3 tiers (G-11).
- **8 `pool.query`** sites — outside the transaction: the pre-transaction `beforeResult` unlinked-count read (`:182-184`), the dry-run simulation's 3 read-only queries (`:299-338`, its own `pool.query` calls, never `client.query` — dry-run never opens a transaction), the post-transaction final stats query (`:480-487`), and `readThresholdVersionSignal`'s `logic_variables` read (`:86-88`, called both inside and outside the gate).
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {...})` (`:128`) wraps the ENTIRE gate + tier cascade — the seam the library's runner phase must reproduce exactly (lock 94, kept textually per §5.4).
- Session-scoped GUC: `SET pg_trgm.similarity_threshold` / `RESET pg_trgm.similarity_threshold` (`:334` dry-run, `:431`/`:445` live) — issued on the SAME client as the query that depends on it (never `pool.query`, per the Supavisor-pooler lesson `tasks/lessons.md`). This is a seam the write phase's SQL-generation layer must preserve as a paired SET/RESET on one held client, not a fire-and-forget `pool.query`.

### Clock seam
- `pipeline.getDbTimestamp(pool)` → `RUN_AT` (`:129`) — the ONE DB-clock read, captured BEFORE any write (G-7), threaded as a bound param (`$1::timestamptz`) into all 3 tier UPDATEs.
- `new Date(` — **1 site** (`:90`, inside `readThresholdVersionSignal`), wraps a DB-READ value (`logic_variables.updated_at`) to normalize it to an ISO string — NOT a timestamp written to the DB, so the "`new Date()` banned for DB writes" rule does not apply here; this is a read-side normalization, cleanest seam split of any pilot to date (pilot 3's own seam was mixed).
- `Date.now()` — **2 sites** (`:178`, `:467`) — both elapsed-time-only (`durationMs`), never written to the DB as a timestamp; legal per the lesson's explicit carve-out.

### Network seam
- **0 `fetch(` calls** — `link_wsib` has no external network dependency (unlike `assert_schema`'s 21 HTTP requests or `load_ravines`'s archive download). Simplest network seam of any pilot: N/A, nothing to seam.

### argv/env seam
- **5 reads, ALL already have a declared home** (E1–E3, no invisible-to-lint read exists — contrast pilot 3's `isFullMode()` one-frame-up problem):
  - `process.argv.slice(2)` (`:123`) → `dryRun = args.includes('--dry-run')` → `override.dry_run` (E2)
  - `process.env[FORCE_FULL_ENV]` (`:125`, `FORCE_FULL_ENV = 'LINK_WSIB_FORCE_FULL'`) → `override.force_full` (E1)
  - `process.env.PIPELINE_CHAIN` ×3 (`:163`, `:198`, `:526`, all the SAME ternary) → `sharing.varies_by_chain.phase` (E3)

### Seam-map verdict (G5)
No PARTIAL seams remain unresolved for this pilot — DB/Clock/Network/argv-env are all either already-declared-field-bound (E1-E3) or structurally clean (Clock's read/write split, Network's absence). The ONE open library question is not a seam gap but a PHASE-SHAPE gap (LG-10/LG-15, Ask A-1) — whether the runner's `runLinkPhase` can express a 3-tier bulk cascade with a gated-skip, deferred to commit 7 as scheduled.

---

## §4. PH-6 — Classification (commit 4, G6)

> Every candidate named in the plan's G6 gate row + this pilot's own archaeology (§2's LW-D* rows), CLASSIFIED per Spec 123 §3's three-way split: **CONTRACT** (a downstream consumer depends on it, even if ugly) / **INCIDENTAL** (nothing observes it — do not assert on it) / **DEFECT** (a spec or invariant asserts the opposite). An undefended fence is CONTRACT until proven otherwise (Spec 124 §7 Step 1).

| Candidate | Ledger ID | Classification | Ground |
|---|---|---|---|
| T2 undeclared `>= 5%` link-rate floor | LW-D1 | **DEFECT** | Spec 124 Rule 3 — every verdict-affecting threshold must be a registered logic variable; this one is a bare literal. Externalization is a declared diff, not a behaviour change (the value 5 is unchanged) |
| `manifest.json`'s 2 false `supports_*` flags | LW-D2 | **DEFECT** | the manifest is declared data asserting a capability the code does not have (`supports_full`) and denying one it does (`supports_dry_run`) — a downstream consumer (an operator reading the manifest, or automation gating on `supports_full`) would be actively misled |
| `manifest.json`'s `telemetry_tables` under-declares `wsib_registry` | LW-D3 | **DEFECT** | same class as LW-D2 — Rule 1 ("nothing about a step's behaviour may live only in code") applies to the WRITE SURFACE too; confirmed independently by Spec 60's own G-16 under-declaration (§1) |
| `[0.50, 0.60)` dead stats-bucket boundary | LW-D4 | **INCIDENTAL** | nothing downstream reads or asserts on the `med_conf` bucket boundary specifically (it is a display-only stats query, `:480-487`, not fed into any check or written column) — PIN as a declared `limitations[]` entry (Spec 123 §3.1), not a fix |
| `d704a447`'s unrepaired pre-fix contamination (60.5% of linked rows) | LW-D5 | **DEFECT, BLOCKING** | `entities.is_wsib_registered`/contact fields are CONTRACT-consumed by `lead-inspect-query.ts:361-464`/`metrics.ts:384` (live product surface) — contamination reaching a product-visible field is the textbook DEFECT shape, not incidental. A-7's tier-3 repair is the fix, ruled at commit 7 |
| S2's asymmetric length floors (`>=3` vs `>=5`), no recorded why | LW-D6 | **INCIDENTAL, Rule-4 owed** | the VALUES are not wrong (both are defensible per this pass's inferred reasoning) — the defect is purely that the reasoning was never written down. Fix is documentation (`checks[].why`), not a value change |
| `review_followups.md:3015` stale chain-membership claim | LW-D7 | **CLOSED, was DEFECT** | already fixed pre-pilot (`188d7371`); this pilot only verified |
| **171-magnet contact-exposure quantification** (required BEFORE any FULL run, per Fold B BLOCKING a) | — | **DEFECT (pending measurement)** | see quantification below — this is the specific measurement Fold B's `copyContacts` reverse-pass amendment requires completed before A-7's FULL run, per the plan's explicit instruction that PH-6 (this commit) is where it happens |

### 171-magnet contact-exposure quantification (Fold B BLOCKING a — completed BEFORE any FULL run)

> Required by `.cursor/active_task.md` Fold B item 3 (A-7 copyContacts amendment): quantify contact mis-attribution exposure for the 171 magnet entities (fan-in ≥ 10) specifically, since `copyContacts`' NULLIF-guard means a magnet's contact fields are the highest-risk copy target if any of its 8,450-contaminated links wrote a wrong phone/email/website. **Local measurement (§1's Fold C finding already answers the general case): `wsib_registry` carries ZERO contact values locally (121,116 rows, 0 with any of `primary_phone`/`primary_email`/`website` populated)** — `copyContacts` has copied nothing, ever, on THIS database, so the 171-magnet exposure is **measured 0 locally by construction** (there is nothing in `wsib_registry.primary_phone`/`primary_email`/`website` for `copyContacts` to have copied FROM). Executed this commit:

```sql
SELECT count(*) AS magnet_entities_with_any_contact
FROM entities e
WHERE e.id IN (
  SELECT linked_entity_id FROM wsib_registry
  WHERE linked_entity_id IS NOT NULL
  GROUP BY linked_entity_id HAVING count(*) >= 10
)
AND (e.primary_phone IS NOT NULL OR e.primary_email IS NOT NULL OR e.website IS NOT NULL);
```
**Executed 2026-08-28: `magnet_entities_with_any_contact = 7`** (sanity check: the magnet-count sub-query independently returns 171, confirming the fan-in≥10 population matches §Fold A's measured figure). **Interpretation: these 7 are NOT attributable to `copyContacts`** — since `wsib_registry` carries zero contact values locally (confirmed above), `copyContacts` has never had anything to copy on this database; the 7 magnet entities that do carry a phone/email/website got it from a DIFFERENT source (most likely `enrich-web-search.js`'s direct Serper enrichment on `entities`, governed by Spec 45, out of this pilot's scope). **Conclusion: local exposure to A-7's copyContacts reverse-clear pass is 0 by construction, both by the general count (§1) and by this magnet-specific query — there is no locally-measurable false-positive risk to quantify further.** Per Fold C's declared cloud caveat: **this 0 is a LOCAL measurement only** — a cloud database that has run Serper enrichment (Spec 46) may carry populated `wsib_registry` contact fields, and the 171-magnet query above must be RE-RUN against cloud before any cloud FULL run, not assumed from this local result. Recorded as a `limitations[]` entry at commit 7: *"contact mis-attribution exposure is measured per-environment; the local-dev 0 (general and magnet-specific) does not bound cloud — re-run both queries against the cloud DB before the cloud FULL run."*

---

## §0. PH-0 seed — measured boundary table (2026-08-28 planning session)

> Executed against `127.0.0.1:54322/postgres` (schema_migrations row count 242, max applied filename `245_parcels_centroid_geom_invalidation.sql`) and the working tree at HEAD, branch `wf2/deep-scrapes-restore-l0`. This is a SEED for commit 1's full PH-0 pass, not the pass itself — commit 1 must re-execute every row below, not copy it.

### Source file surface

| Metric | Value | Command |
|---|---|---|
| Lines | 547 | `wc -l scripts/link-wsib.js` |
| `pool.query` sites | 8 | `grep -c "pool\.query" scripts/link-wsib.js` |
| `client.query` sites | 9 | `grep -c "client\.query" scripts/link-wsib.js` |
| `try` / `catch` / `finally` | 0 / 0 / 0 | `grep -c "try {\|catch\|finally"` |
| `throw` sites | 1 (`:116`, logicVars validation) | `grep -n "throw new Error"` |
| `emitSummary` sites | 3 (gate-SKIP, zero-unlinked, real-run) | `grep -n "emitSummary"` |
| `emitMeta` sites | 3 | `grep -n "emitMeta"` |
| `Date.now()` | 2 (`:178`, `:467` — elapsed time only) | `grep -n "Date\.now"` |
| `new Date(` | 1 (`:90`, wraps a DB-read value, not a write) | `grep -n "new Date("` |
| `process.env` reads | 4 (`FORCE_FULL_ENV` ×1, `PIPELINE_CHAIN` ×3) | `grep -n "process\.env"` |
| `process.argv` reads | 1 (`:123`) | `grep -n "process\.argv"` |
| `console.*` | 0 | `grep -c "console\."` |
| `fetch(` | 0 | `grep -c "fetch("` |
| `module.exports` | `{ main, ADVISORY_LOCK_ID, OWN_SLUGS, UPSTREAM_SLUGS, readThresholdVersionSignal, hasThresholdChanged, FORCE_FULL_ENV }` (`:547`) | `grep -n "module.exports"` |
| Module-scope guard | `if (require.main === module) { pipeline.run('link-wsib', main); }` (`:543-545`) — I1 fence, already fixed | `grep -n "require.main"` |
| `ADVISORY_LOCK_ID` | 94 | `grep -n "ADVISORY_LOCK_ID ="` |

### Write surface (per §1.4 re-derivation — NOT the evidence-base label)

| Target | Statements | Columns written | Guard mechanism | Scope |
|---|---|---|---|---|
| `wsib_registry` | 3 (tier 1/2/3) | `linked_entity_id`, `match_confidence`, `matched_at` | scope-as-guard (`linked_entity_id IS NULL` folded into the join) | per-tier `matched` CTE |
| `entities.is_wsib_registered` | 3 (one per tier) | `is_wsib_registered` | `AND e.is_wsib_registered = false` | `match_confidence = <tier value>` |
| `entities.{primary_phone,primary_email,website}` | 3 (one per tier, `copyContacts`) | 3 contact columns | `NULLIF(...) IS NULL` (only fills empty) | per-tier, via `w_agg` |

~~**6 write statements, 2 targets, 0 destructive retraction, 0 `K` (derived_recompute) target.**~~ **CORRECTED (Fold A, Integration S1, 2026-08-28): 9 statement executions / 7 distinct SQL texts / 3 write groups, 2 targets, 0 destructive retraction TODAY (see Fold A below — A-7 proposes adding one, scoped to the tier-3 target), 0 `K` (derived_recompute) target.**

### Chain membership (measured, not grep-context)

| Chain | Array index | Adjacent steps | Runs `assert_schema` at head? |
|---|---|---|---|
| `permits` (33 steps) | 6 | `["classify_scope","builders","link_wsib","geocode_permits","link_parcels",...]` | YES (`permits[0]`) |
| `sources` (28 steps) | 19 | `[...,"load_wsib","link_wsib","load_zoning",...]` | YES (`sources[1]`, after `reconcile`) |
| `wsib` (1 step) | — | `["enrich_wsib_registry"]` only | **`link_wsib` is NOT a member** |

### Live table state

| Table | Rows | Key facts |
|---|---|---|
| `wsib_registry` | 121,116 (13,965 linked, 11.53%) | 22 cols, 11 indexes incl. 2 GIN trigram, RLS on / 0 policies |
| `entities` | 3,948 (938 wsib-registered, 23.75%) | 19 cols, RLS on |
| `logic_variables` | 432 total, 1 wsib key (`wsib_fuzzy_match_threshold` = 0.6) | no min/max columns on the table |

### `pipeline_runs` history (4 slug forms, matching `OWN_SLUGS`)

| Slug | Completed | Failed | Skipped | Last completed |
|---|---:|---:|---:|---|
| `link_wsib` (bare) | 1 | 0 | 0 | 2026-03-05 |
| `permits:link_wsib` | 26 | 2 | 10 | 2026-07-17 |
| `sources:link_wsib` | 13 | 0 | 0 | 2026-07-08 |
| `link-wsib` (hyphen) | 0 | 0 | 0 | — (never written under this form) |

### Git archaeology

| Metric | Value |
|---|---|
| Total commits | 31 |
| `fix(` commits | 17 (54.8%) |
| `Severity:` footers | 0 |
| `lesson-routing:` footers | 0 |
| Date range | 2026-03-05 → 2026-08-16 |
| Most recent 5 commits | `4bb44fbb`, `a81c6a7c`, `b92ad16f`, `2633c1cb`, `74653a8f` (all 2026-08-16, Phase B B3 fold work) |

### Fold A (2026-08-28) additions — tier-3 contamination and fan-in (PLAN-altitude panel: Reality-Check BLOCKING + Integration, folded into `.cursor/active_task.md`)

> Measured live this session, same DB as §0 above (`127.0.0.1:54322/postgres`). Not yet a full PH-0/PH-6 pass — seeded here so commit 1/commit 4 extend rather than re-derive these numbers.

| Metric | Value | Note |
|---|---:|---|
| Linked rows failing today's tier-3 predicate | 8,450 / 13,965 (60.5% of all linked rows) | residue of the superseded pre-`d704a447` (2026-04-01) algorithm; `WHERE linked_entity_id IS NULL` is monotone, so a fixed bug never repairs an already-written link |
| Tier-3 (0.60) links failing today's predicate | 8,450 / 13,645 (61.9%) | tier-3-only view of the same contamination |
| Tier-3 current-predicate pass rate | 38.1% | 100 − 61.9; pinned as `wsib_tier3_current_predicate_pass_rate_pct` in `invariants.json` |
| Magnet entities (fan-in ≥ 10) | 171 | concentration of the contamination |
| Worst fan-in | MDK CONSTRUCTION — 2,118 links | pinned as `wsib_entity_fanin_max` |
| Second worst fan-in | COLE CONTRACTING — 1,404 links | |
| Fan-in = 1 share | 443 / 3,948 entities (11.2%) | replaces the "23.8% WSIB-registered plausible?" ask (Reality-Check SHOULD-FIX) |
| Cumulative link rate (raw) | 11.53% (13,965 / 121,116) | includes contamination |
| Clean link rate | 4.55% (5,515 / 121,116) | **below** the T2 `≥5%` WARN floor — corrects the plan's "6.53 points of headroom" claim |
| Tier split | 0.95: 75 · 0.90: 245 · 0.60: 13,645 | `GROUP BY match_confidence`; sums to 13,965. Corrects the plan's "not separately queryable" line |
| Write recount (Integration S1) | 9 statement executions / 7 distinct SQL texts / 3 write groups on 2 tables | corrects the plan's earlier "6 write statements" figure |

**PLAN CHANGE:** new operator ask A-7 "tier-3 repair" (declared full-mode retraction, `retract_when: full_only` scoped to `match_confidence = 0.60`) — see `.cursor/active_task.md` for the full ruling and its downstream consequences (Spec 124 R-B now satisfiable; `recovery.interrupted` becomes REQUIRED).

### Fold B (2026-08-28, fold-validation of Fold A — grounder CONFIRMED every number exactly; Cross-read Adversary amendments below)

> Grounder re-executed every Fold A number this fold against the same DB (`127.0.0.1:54322/postgres`): contamination 8,450/13,965 (60.5%) and 8,450/13,645 (61.9%), clean link rate 4.55% (5,515/121,116), 171 magnet entities, MDK CONSTRUCTION 2,118 / COLE CONTRACTING 1,404, fan-in=1 share 443/3,948 (11.2%), tier split 0.95:75 · 0.90:245 · 0.60:13,645, write recount 9/7/3. **No discrepancy found.** The Cross-read Adversary then walked A-1 and A-7's ruled/recommended mechanisms pairwise against the live codebase and found three BLOCKING gaps in A-7's mechanism plus one SHOULD-FIX in A-1. Full text and in-place amendments live in `.cursor/active_task.md`'s own "Fold B" section, PLAN-altitude asks (A-1, A-7), Library-growth table (new LG-16), P4 tunable inventory (new T7, T6 bounds amended), and the Operator rulings requested block. Summary:

| Item | Finding | Disposition |
|---|---|---|
| A-7 mechanism (BLOCKING b′) | `write.js`'s only retraction primitive is DELETE (`executeRetraction:486-489`) — unsafe for `wsib_registry` (owned by `load-wsib.js`, not this step) | New write executor **LG-16 "UPDATE-to-NULL"** — scoped `SET linked_entity_id=NULL, match_confidence=NULL, matched_at=NULL WHERE match_confidence=0.60`, `retract_when: full_only`, symmetric with LG-11 |
| A-7 convergence (BLOCKING b) | `TIER3_SELECT LIMIT 1000`/invocation; one FULL pass repairs ≤1,000 of ~5,515 clean rows | Mode `full` LOOPS to convergence, bounded by new tunable `link_wsib_tier3_full_max_iterations` (default 20, WARN `tier3_full_not_converged` on exhaustion); budget ≤ ~20 min one-time |
| A-7 copyContacts (BLOCKING a) | `copyContacts` only fills empty fields — contacts from retracted links persist uncleared | Scoped reverse pass in the same FULL write group, provenance-by-equality, audited `contacts_cleared_on_retraction`; PH-6 (commit 4) must quantify 171-magnet exposure BEFORE the FULL run, not merely by it |
| A-1 (SHOULD-FIX d) | `tiers.length===1` proof covers only the degenerate case; `runLinkPhase`'s batch loop (`index.js:605-634`) / hardcoded counters (`:558-565`) don't serve the bulk no-pagination cascade | Commit 7 must name+cost the non-degenerate branch inside `runLinkPhase`, or split to `runCascadePhase` if it exceeds ~150 lines/forks the write loop |
| LG-15 | Is the gated-skip genuinely new library work, or a naming decision? | **CONFIRMED genuinely new** — `staleness.js`'s `selectMode` is strictly `full\|incremental`; `'skip'` is not a mode |
| `chain.logic.test.ts:1568-1574` prose | Plan text read as a positive "`records_total` uses `totalUnlinked`" check | **Corrected**: it is a NEGATIVE constraint (`not /records_total\s*:\s*totalLinked/`) + `toContain('unlinked_start')` |
| dry-run duration | Not measured this session (would write a `pipeline_runs` row) | Plan step added: time `--dry-run` once, before commit 5's golden captures |
| Fan-in WARN default 20 | Recommended pending operator sign-off | **ACCEPTED** — fires immediately on the known-bad population (171 magnets, worst 2,118), intended, not a defect. Bounds amended min 2 / max 1000 (T6); new sibling tunable T7 `link_wsib_tier3_full_max_iterations` (20, min 1 / max 100) declared for A-7's convergence loop |

### Test re-homing surface (15 files, see `.cursor/active_task.md` for the full table)

15 files under `src/tests/` reference `link-wsib.js`/`link_wsib`. Two are **shared fences spanning steps outside this conversion's scope**: `src/tests/db/ledger-gate-callers.db.test.ts` (540 lines, tests 3 B3 callers together) and `src/tests/source-version.logic.test.ts` (505 lines, its `"adoption-lock"` test loops the same 3 files' source text).

---

*(§4–§6 and §R Reflection to be written per the commit ledger in `.cursor/active_task.md`. Do not fill ahead of the commit that owns each section.)*
