# QUEUED — Active Task: Structurally-unscrapeable year_seqs recirculate every slice (WF3)
**Status:** QUEUED (not authorized — plan ceremony required before any `src/`/`scripts/` code)
**Domain Mode:** Backend/Pipeline (`scripts/aic-scraper-nodriver.py`, Spec 44)
**Workflow:** WF3 (Fix). **Sequencing:** after Phase A step 8 (F3 cron re-enable) — see `.cursor/active_task.md`. Does NOT block the step-7 proving slice.
**Discovered:** 2026-08-05, during the step-7 proving slice (run 31009693871), from operator challenge ("we also have the permit/application number — a tiered approach should resolve that").

## Context
* **Goal:** A bounded set of queue entries can never succeed under the current `TARGET_SECTIONS` filter, never retires from the queue, and is therefore re-attempted at the head of EVERY slice — burning slice time forever and poisoning head-of-queue miss-rate statistics. Diagnose the cause (currently unknowable — see F1), then resolve the disposition.
* **Target Spec:** `docs/specs/01-pipeline/44_chain_deep_scrapes.md` (outcome taxonomy table :124-133; empty-outcome taxonomy note :167-176).
* **Key Files:** `scripts/aic-scraper-nodriver.py` (`TARGET_SECTIONS` :94; failure path :2591-2595; success-path folder log :2597-2599; permit_num construction :2358/:2482), `scripts/aic-orchestrator.py` (mirrored miss-rate classifier).

## Evidence (measured 2026-08-05 against SUPABASE_DATABASE_URL — cloud, not legacy PG_*)
* **58 pending `scraper_queue` year_seqs have NO BLD-section permit at all** (of 9,355 joined pending = 0.6%). Their permits carry sections `B01–B44`, `D01–D20`, `H01–H44`, `P01–P44`, `SHO`. Zero pending year_seqs lack a `permits` row entirely.
* **Perfect separation in the live ledger:** every `scraped` / `no_stages` / `no_inspection_link` / `address_not_found` row on 2026-08-05 carries section `BLD`; every `no_target_folders` row carries `B01`–`B11`.
* **Recurrence proves non-retirement:** 4 of the 5 distinct `no_target_folders` year_seqs seen today also failed on 2026-08-03. `21 157190` appears on both days (48 ledger rows). `no_target_folders` deliberately does not stamp `last_scraped_at` (Spec 44:129), so these never enter the 7-day cooldown and re-enter every slice.
* **Head-of-queue distortion:** the 2026-08-05 slice's first 10-min bucket ran 56% anomalous (117 items, 66 anomalous); the next bucket ran 4%. The permanent residue is attempted first, every slice.
* **ANALYSIS TRAP (document this):** `no_target_folders` is **year_seq grain** but the ledger writes **one row per queued permit sharing that year_seq** (`21 157190` → 48 rows). Anomalous rate computed over ledger ROWS overstates badly (36.7% vs the true 14.2% by distinct year_seq on the same sample: 155 attempted / 22 anomalous). `classify_miss_rate` (:3107) divides by `permits_attempted` — per-attempt counters, NOT ledger rows.

## Findings → Fixes
* **F1 — Observability gap blocks diagnosis (do this FIRST; it is the prerequisite for F2).** The failure path at :2591-2595 logs only `"{year_seq}: no target folders found"` and returns; the full folder listing (sections + `statusDesc`) is logged ONLY on the success path at :2597-2599. Verified against the Aug 3 run log (30854595411): six `no target folders found` lines, zero folder detail. **We therefore cannot distinguish "portal returned zero folders" from "portal returned folders whose sections we filter out."** Fix: log the returned folder list (folderYear/folderSequence/folderSection/statusDesc) on the failure path too. One slice after this lands, the 58 are diagnosed.
* **F2 — Disposition (BLOCKED on F1's evidence; do not pre-judge).** Two mutually exclusive outcomes:
  * If the portal DOES return folders under `B0x`/`D0x`/`H0x`/`P0x` sections → the defect is `TARGET_SECTIONS = ['BLD']` (:94) being narrower than our own feed's section vocabulary. Widening it must account for permit_num construction at :2358/:2482 and for whatever downstream consumers assume a `BLD` suffix.
  * If the portal genuinely holds nothing → these year_seqs need bounded retirement (attempt counter / dead-letter) so they stop recirculating.
  * **FENCE (Spec 44:129) — the no-stamp behavior is DELIBERATE**: a permit deleted from source must stay visible to staleness monitoring. A dead-letter must therefore be its own attempt counter, NEVER implemented by stamping `last_scraped_at`.
* **F3 — Premise correction to record (no code):** the scraper does NOT search by address. It queries the portal with `folderYear` + `folderSequence` (:2324) — the permit number IS already the search key. `address_not_found` = the portal rejected that year/sequence; `no_target_folders` = folders returned, none matching `TARGET_SECTIONS`. Any future "tiered lookup" proposal must start from this, not from an address-search premise.

## Standards Compliance
* Idempotency: F1 is log-only. F2's attempt counter (if chosen) must be re-run safe and must not alter the outcome vocabulary (`OUTCOME_VOCABULARY` :1933 is grep-pinned against `docs/specs/_contracts.json` + migration 236's CHECK — any new outcome value is a contract change, not a runtime discovery).
* Unhappy paths (Red Lights): failure-path log emits folder detail when folders exist AND when the list is empty; section-filter decision table (BLD matches / B0x under each F2 branch / empty list); attempt-counter retirement fires at the bound and NOT before; `last_scraped_at` remains unstamped for anomalous outcomes (regression lock on the Spec 44:129 fence).
* DB impact: none for F1. F2 attempt counter would touch `scraper_queue` (migration) — decide at plan ceremony.

## Execution Plan (draft — subject to plan ceremony)
- [ ] 1. Reproduction/Red Light: test asserting the failure path logs the returned folder list.
- [ ] 2. F1 fix + push; let one slice run.
- [ ] 3. Read the new log for the 58 year_seqs; classify into the two F2 branches with counts.
- [ ] 4. Author the F2 plan from that evidence (own ceremony — it may be a section-vocabulary change with downstream consumers, which is WF2-shaped, not WF3).
- [ ] 5. Doc: record the year_seq-vs-ledger-row grain trap in Spec 44's taxonomy note (:167-176) so future analysis doesn't recompute miss rate over ledger rows.

## Known risks
* Widening `TARGET_SECTIONS` changes which permits get scraped at all — a coverage change, not a bug fix; needs Reality-Check on the resulting permit population before it ships.
* 58 year_seqs is 0.6% of the backlog — the drain cost is negligible; the real costs are (a) those permits' inspection data is never collected and (b) the head-of-queue statistical distortion. Size the fix accordingly; do not over-engineer.
