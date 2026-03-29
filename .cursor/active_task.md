# Active Task: Fix folderTypeDesc filter, batch size, enable Decodo proxy
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `e018e90f` (e018e90fa2ec0228974fc614b7be58ee11d65fae)

## Context
* **Goal:** Fix 3 issues discovered during WF5 live testing:
  1. **folderTypeDesc taxonomy mismatch** — `fetch_permit_chain()` and `scrape_year_sequence()` filter folders by `folderTypeDesc in TARGET_TYPES`, but TARGET_TYPES contains our DB strings (`'Small Residential Projects'`) while AIC uses different labels. Fix: filter on `folderSection` (AIC permit code: `BLD`, `HVA`, `PLB`, etc.) which is documented and stable, not the human-readable `folderTypeDesc`.
  2. **Batch size override** — `.env` has `SCRAPE_BATCH_SIZE=50`, overriding our aligned default of 10.
  3. **Proxy must be default** — all future runs must go through Decodo. Running 200+ permits from a residential IP got us WAF-blocked by Akamai.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-scraper-nodriver.py` — fix folder filter (lines 410, 473)
  - `.env` — fix SCRAPE_BATCH_SIZE to 10

## Technical Implementation

### Bug 1: folderTypeDesc → folderSection filter
- **Root cause:** `folderTypeDesc` is AIC's human-readable label (unknown values). `folderSection` is the AIC permit type code (`BLD`, `HVA`, `PLB`, `DRN`, `DEM`, `FSU`, `DST`, `SHO`, `TPS`). All 3 target types (SR, BA, NH) have `folderSection = 'BLD'`.
- **Fix:** Replace `TARGET_TYPES` string filter with `TARGET_SECTIONS` code filter:
  ```python
  TARGET_SECTIONS = ['BLD']  # Covers SR, BA, NH — all use BLD section code
  ```
  And change both filter lines (410, 473) from:
  ```python
  [f for f in folders if f.get('folderTypeDesc') in TARGET_TYPES]
  ```
  to:
  ```python
  [f for f in folders if f.get('folderSection') in TARGET_SECTIONS]
  ```
- Keep `TARGET_TYPES` for the DB queue population query (it uses our `permit_type` strings correctly).

### Bug 2: Batch size
- Change `.env` `SCRAPE_BATCH_SIZE=50` → `SCRAPE_BATCH_SIZE=10`

### Bug 3: Proxy default
- Spec already documents Decodo as default. `.env` already has `PROXY_HOST=ca.decodo.com`. Stop passing `PROXY_HOST=""` in manual testing.

* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** Test that folderSection filter matches BLD permits
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** `e018e90f`
- [x] **State Verification:** Confirmed via live WF5 output — 100% miss rate because `folderTypeDesc` values from AIC don't match DB `permit_type` strings. Spec §3.3 documents all target types use `BLD` section code.
- [x] **Spec Review:** §3.3 maps permit types → AIC codes. All 3 targets = `BLD`.
- [ ] **Reproduction:** Add test confirming folderSection-based filter catches BLD permits.
- [ ] **Red Light:** Verify test targets the gap.
- [ ] **Fix:** Replace folderTypeDesc filter with folderSection filter. Update .env batch size.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
- [ ] **Live Test:** Single permit through Decodo proxy to confirm MV3 extension + folderSection filter works.
      Output visible execution summary. → WF6.
