# Weekly Review-Queue Triage — 2026-06-15

_Inaugural triage. No prior `review_triage_*.md` exists — no deltas to compare._
_Source: `docs/reports/review_followups.md` (276 KB, ~800 lines). Today: 2026-06-15. Latest repo commit: `1e6e5d9` (2026-05-20)._

---

## 1. Stale / Elevated-Urgency Items

Items where **phase completion since filing changes urgency**. None of the checks below found a code-side resolution; these are urgency re-ratings, not closures.

| # | Item (source section) | Filed note | Phase-completion evidence | Action |
|---|---|---|---|---|
| **S1** | `lead_analytics` lead_key regex pre-filter missing in `migrate-to-lead-id.js` lines 217-229 (migrate-to-lead-id.js Phase C hardening, HIGH) | "Empty per R0.7 audit — no immediate exposure. Harden when Phase D populates." | Phase D close-out: commit `58a0b8f` 2026-05-13. Script now backfills `lead_analytics` rows. `grep` at lines 217-229 confirms NO `~ '^(permit\|coa):.+$'` pre-filter. | **ELEVATE to HIGH-NOW** — condition for action is met. Malformed `lead_key` hits CHECK constraint (opaque error) not pre-filter (skip). |
| **S2** | `lifecycle_status_history` `date_trunc('second')` natural key allows silent row drops within same second (classify-coa-scope.js R5.3, CRIT) | "Out of R5.3 scope — separate spec section + script." | Phase I.1 added `lifecycle_status_history` writers: commit `d579bc0` 2026-05-06. `git log --all -S 'lifecycle_status_history' -- scripts/` confirms writers are now live. | **ELEVATE** — risk is no longer theoretical. File as Spec 84 hardening WF. |
| **S3** | Phase G downstream-consumer verification before PRE-permit retirement (Spec 42 §6 WF2 R0, MED) | "Add Phase G gate criterion: every consumer verified." | Phase G complete: commits `3944f88` + `0de4cab` 2026-05-05. | **ESCALATE or CLOSE** — if Phase G shipped without the gate criterion, it is now a post-hoc gap. Verify against `3944f88` diff before acting. |

**No items found where a named file/function was deleted** (all verified files still exist: `classify-coa-scope.js`, `get-lead-feed.ts`, `cost-model-shared.js`, `load-massing.js`, `apiClient.ts`, `PaywallScreen.tsx`).

---

## 2. Top 5 Actionable Items This Week

Ranked by: (a) severity, (b) items unblocked, (c) whether file is in active-flux.

### #1 — HIGH: `get-lead-feed.ts:478` builder LEFT JOIN acts as INNER JOIN
**Source:** WF3 2026-05-08 DeepSeek HIGH  
**Evidence:** `grep -n 'business_size IS NOT NULL' src/features/leads/lib/get-lead-feed.ts` → line 478. `AND w.business_size IS NOT NULL` on a LEFT JOIN `wsib_per_entity` converts the join to an INNER JOIN, silently dropping ~30-50% of builder leads (new contractors, GTA-condition failures).  
**Why now:** File was touched in the most recent commit (`1e6e5d9`, 2026-05-20 — CoA UNION arm). High-flux file, builder-lead drop is live in production.  
**Fix:** Remove `AND w.business_size IS NOT NULL`; let UI handle `NULL business_size` per Spec 91 §4.3 builder-display contract. Verify against spec before changing.

### #2 — HIGH (×3): `cost-model-shared.js:193,234,293` falsy-`||` triple
**Source:** Gemini WF2 #3 review, three bundled items  
**Evidence:** `grep -n 'storeys || 1\|pct > 0\|complexity_factor ||' src/features/leads/lib/cost-model-shared.js`:
- Line 193: `(row.storeys || 1)` — 0-storey foundation permit gets GFA of 1 floor (inflates).
- Line 234: `pct !== undefined && pct > 0` — `pct=0` matrix entry (valid "no-construction" config) falls through to full-GFA default.
- Line 293: `complexity_factor || 1.0` — operator-set `complexity_factor=0` overridden to 1.0.  

**Why now:** All three explicitly earmarked as one WF3 bundle. File was touched in `58a0b8f` (WF1 R5.6) but these lines were not addressed. Fixes are `??` swaps (1 char each).

### #3 — HIGH: `compute-cost-estimates.js:242` scopeMatrix key missing `.trim()`
**Source:** Gemini WF3 2026-05-08 HIGH  
**Evidence:** `grep -n 'toLowerCase' scripts/compute-cost-estimates.js` → line 242: `` `${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}` `` — no `.trim()`. Spec 83 §3 explicitly requires `.toLowerCase().trim()`. A trailing space in a DB `permit_type` or `structure_type` value causes a matrix miss → full-GFA fallback → inflated cost estimates.  
**Why now:** One-line fix with explicit spec citation. Cost estimates affect all downstream pipeline stages (trade forecasts, opportunity scores) that recently shipped in Phases F.1-F.4.

### #4 — HIGH (ELEVATED): `migrate-to-lead-id.js` `lead_analytics` missing lead_key regex guard
**Source:** Stale item S1 above (elevated from "Phase C hardening" deferral)  
**Evidence:** Phase D live (`58a0b8f`). `grep` at `scripts/migrate-to-lead-id.js:217-229` shows UPDATE block with no `~ '^(permit|coa):.+$'` pre-filter. The `chk_lead_analytics_lead_id_format` CHECK catches bad rows, but as a constraint violation (opaque), not a pre-filter skip with a diagnostic breadcrumb.  
**Fix:** Add `AND lead_key ~ '^(permit|coa):.+$'` to the WHERE clause of the UPDATE at line ~222, with a `pipeline.log.warn` on mismatch count.

### #5 — HIGH: `PaywallScreen.handlePrimary` missing try/catch
**Source:** DeepSeek WF3 telemetry batch 2026-05-06, "WF3 Spec 96 PaywallScreen hardening cycle"  
**Evidence:** `grep -A 20 'handlePrimary' mobile/src/components/paywall/PaywallScreen.tsx` → `const ok = await openCheckout()` with no try/catch. If `openCheckout()` throws, checkout state is indeterminate with no user feedback. Note: the premature-haptic bug (4th HIGH in the telemetry batch) is already fixed — `successNotification()` now fires only when `ok === true`.  
**Why now:** Revenue-flow gap. The file is stable (last touched `58a0b8f`); a small try/catch + errorNotification() call is a contained, high-value fix.

---

## 3. Proposed Sweep WFs

### Sweep A — `cost-model-shared.js` falsy-0 hardening (WF3)
**Files:** `src/features/leads/lib/cost-model-shared.js`  
**Scope:** Lines 193, 234, 293, 393, 421-425  
**Items:** 2 HIGH + 1 MED + 1 LOW + 1 NIT = **5 items** (all Gemini WF2 #3 review)  
**Spec:** Spec 81 §3, Spec 83 §3  
**Summary:** All `||`→`??` falsy-0 swaps + proportional-rounding JSDoc note + magic-number extraction. Single file, no DB impact.

### Sweep B — `get-lead-feed.ts` correctness pass (WF3)
**Files:** `src/features/leads/lib/get-lead-feed.ts`  
**Scope:** Lines 120, 478, 985-986, cursor/competition sections  
**Items:** 2 HIGH + 2 MED = **4 items** (DeepSeek WF3 2026-05-08 review)  
- builder LEFT JOIN → remove `IS NOT NULL` guard (#1 above)
- `clampedKm`/`clampedLimit` NaN protection (verify upstream Zod validation first)
- cursor pagination NULL CASE
- `competition_count` trade-scoping  

**Spec:** Spec 91 §4.3  
**Risk note:** File was modified in `1e6e5d9` (Pass-2.5 CoA arm). Confirm no rebase conflict before starting.

### Sweep C — `compute-cost-estimates.js` Spec 83 pass (WF3)
**Files:** `scripts/compute-cost-estimates.js`  
**Scope:** Lines 242, `data_quality_snapshots` UPDATE block, `BULK_COLUMN_COUNT`  
**Items:** 1 HIGH + 1 MED + 1 LOW = **3 items** (Gemini WF3 2026-05-08 review)  
- scopeMatrix `.trim()` (#3 above)
- `data_quality_snapshots` UPDATE → INSERT...ON CONFLICT
- `BULK_COLUMN_COUNT = 15` → derive from column-list array  

**Spec:** Spec 83 §3  
**Domain:** Backend/Pipeline

---

## 4. Queue Health

| Metric | Value |
|---|---|
| Estimated total active deferred items | ~100 (234 severity-tagged lines in file; ~43% in active-deferral tables, rest in "Applied"/"Rejected"/resolved sections) |
| HIGH / CRIT items | ~22 active |
| MED items | ~33 active |
| LOW / NIT items | ~45 active |
| Items age ≥ 6 weeks (filed before 2026-05-04) | ~15 — hygiene rule §2 (dormancy >2 weeks → archive) has NOT been applied; recommend archival sweep |
| Prior triage report | None (inaugural) |
| Repo commits since oldest queue entry | 75 (2026-05-05 → 2026-05-20) |
| Phases completed since oldest entries | D, E.5, F.1, F.2, F.3, F.4, G, I.1, I.1.1a/b |
| Items whose deferral reason is now stale (phase completed) | 3 confirmed (S1-S3 above); estimate 5-8 more in Spec 42 §6 WF2 R0 section |

**Hygiene recommendation:** Apply `review_followups.md` §Hygiene rule §2 (archive items dormant >2 weeks) to the "Spec 42 §6 WF2 R0 Multi-Agent Review" and "WF2 #3" sections. Estimated 15-20 LOW/NIT items with no escalation path that predate all phase completions — collapse to 1-line historical index entries.

**Next suggested sweep:** Sweep A (`cost-model-shared.js` falsy-0, WF3) — smallest blast radius, highest LOC-to-defect ratio, no DB migrations required.
