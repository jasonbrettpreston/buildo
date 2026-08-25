# Active Task: WF1 #lifecycle-phase-engine-migration-F.4 — Lead Detail Inspector CoA Classification Panel

**Status:** Implementation (v4.1 PLAN LOCK direct per user authorization after Observability + Independent BOTH recommended PLAN LOCK; v4 trajectory: v1=28 → v2=30 → v3=~30 → v4=~28 with v4 findings being plan-completeness gaps not architectural issues; substrate FULLY verified clean at v4. v4.1 micro-patch applies ~22 folds: 1 CRIT (manual JSON gen CI check) + 10 HIGHs (cross-stream 3rd UNION ALL arm + NULL $2 defensive guard + Spec 76 §3.5 internal contradiction cleanup + `UniversalStreamCatalogRow` type export + generator Zod validation + generator emitSummary cleanup + 4 sub-schemas defined + source stub explicit + 110-row hardcode removal + plan flow clarity) + 7 MEDs + 8 LOWs/NITs.

**Status historical:** Planning (v4 — folded ~28 v3 findings; 3 user-authorized design choices collapse ~10 findings: (a) bundle universal_stream_catalog as JSON file per Gemini MED-v3-F (eliminates endpoint+hook+route+4 infra tests + Spec 35 §3.1 row + CRIT-DS-SEC cache directive + MED-v3-G try/catch + HIGH-Obs-1 fetch failure + Independent IMP-5 loading state); (b) backend returns 200+`coa: null` on COA_NOT_FOUND per Gemini CRIT-1 (consistent with cross-stream orphan handling); (c) DROP `hashAdminUid` entirely (CRIT-Ind-4 — dead code post HIGH-Obs-1 no-emit; eliminates HIGH-v3-A node:crypto + MED-v3-D unsalted hash + LOW-v3-N renaming + the helper itself). Independent worktree caught 5 substrate-column-name CRITs at v3 (`lifecycle_phase` phantom, `group_id`/`block_id`/`stage_id` phantom, `LeadInspectSourceSchema` missing field, `LifecycleSeqWidget` Props collision). Substrate now verified by re-reading mig 128 + mig 133.)
**Workflow:** WF1 (admin UI extension; substrate REVERIFIED after v3 findings — mig 128 columns: PK `seq` + cohort cols `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` (NOT `group_id` et al.) + `*_label`/`*_color`/`*_icon`; mig 133 columns on `coa_applications`: `lifecycle_seq`/`lifecycle_group`/`lifecycle_block`/`lifecycle_stage` (NOT `lifecycle_phase`) + `coa_type_class`/`project_type`/`scope_tags`/`structure_type`/`estimated_cost`/`cost_source`/`modeled_gfa_sqm`/`bid_value`/`linked_permit_num`; mig 127 `lifecycle_status_history` with `id BIGSERIAL`, `decision VARCHAR(60)`; mig 132 `permits.{lead_id, bid_value, linked_coa_application_number}`; mig 134 CHECK constraints; mig 145+ unrelated to F.4)
**Domain Mode:** **Admin** (`src/components/admin/`, `src/lib/admin/`, `src/lib/leads/`, `src/app/api/admin/`, `src/tests/`, `docs/specs/`)
**Rollback Anchor:** `7b1530c` (F.3 close-out; F.3 ship `632e57d`)
**Parent WF:** Phase F — Forecast / opportunity / CRM CoA extensions (Spec 42 §6.11)
**Sub-deliverable position:** F.1 → F.2 → F.3 → **F.4 (THIS task)** → END of Phase F
**Adversarial review:** USER-MANDATED — 4 reviewers at plan + diff stages.
**Standards adherence:** `00_engineering_standards.md` §1/§2/§4/§5/§6; `02-web-admin/33_web_admin_engineering_protocol.md` §3/§5/§8/§9 (NO `dark:`)/§10/§11 (NO read-only `lead_view` emit per §11 line 121)/§13; `02-web-admin/34_web_admin_testing_protocol.md` §4; `02-web-admin/35_web_admin_state_architecture.md` §2/§3 (1 NEW `lead_inspect` row only — universal_stream_catalog removed from API per JSON-file fold); `01-pipeline/76_lead_feed_health_dashboard.md` §3.5 Cycle 8 (4 text amendments: cost source line 253 + icon column names line 255 + lead_id format line 277 + DELIVERED note); `01-pipeline/83_lead_cost_model.md` §3; `01-pipeline/84_lifecycle_phase_engine.md` §2.5.h + §5; `01-pipeline/42_chain_coa.md` §6.6.B + §6.11.

---

## v3 → v4 Revision Summary

v3 round surfaced **~30 findings** (7 CRIT + 5 HIGH + 14 MED + 6 LOW/NIT) across 4 reviewers. Observability declared CONVERGING (0 CRIT/HIGH from its dimension); Independent caught 5 substrate code-breakers and bash agents caught 2 security-class issues. User authorized 3 design choices that COLLAPSE ~10 findings; v4 applies remaining ~20 real folds.

### CRITICAL (7 — all folded; 1 eliminated by design choice)

- **CRIT-v3-Ind-1 — `lifecycle_phase` phantom column** (Independent 100% conf, sole). Mig 133 has `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` — NO `lifecycle_phase`. **v4 fold:** SQL SELECT + Zod schema use `ca.lifecycle_group, ca.lifecycle_block, ca.lifecycle_stage` (NO `lifecycle_phase`). 3 distinct columns surfaced in the UI (replacing the singular `lifecycle_phase` text field).

- **CRIT-v3-Ind-2 — Phantom `group_id`/`block_id`/`stage_id` columns** (Independent 100% conf, sole). Mig 128 cohort columns are `lifecycle_group`/`lifecycle_block`/`lifecycle_stage`. **v4 fold:** under JSON-file bundling (Gemini MED-v3-F user authorized), no SQL SELECT for the catalog at runtime — but the JSON GENERATOR script (one-time at build time) must read these correct column names. JSON shape uses `seq` + `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` + `*_label`/`*_color`/`*_icon` (12 total fields per row).

- **CRIT-v3-Ind-3 — `LeadInspectSourceSchema` missing `linked_coa_application_number`** (Independent 95% conf, sole). Existing `LeadInspectSourceSchema` at `src/lib/admin/lead-schemas.ts:159-183` lacks this field. Plan reads `data.source.linked_coa_application_number` → TypeScript rejects. **v4 fold:** EXTEND `LeadInspectSourceSchema` with `linked_coa_application_number: z.string().nullable()`. Confirm the lead-inspect-query also projects it from `permits` (mig 132:30 column). Affects existing schema, so v4 EXTEND list grows by 1.

- **CRIT-v3-Ind-4 — `hashAdminUid` is dead code post HIGH-Obs-1 no-emit** (Independent 90% conf, sole). **v4 fold (per user "JSON file" + scope simplification):** **DROP `hashAdminUid` entirely.** F.4 emits NO `admin_action_performed` PostHog events (Spec 33 §11 read-only carve-out — Obs-1 self-correction). Only Sentry breadcrumbs remain (no PII/UID surface). This eliminates 4 findings simultaneously: CRIT-v2-1 (helper missing), HIGH-v3-A (node:crypto client breakage), MED-v3-D (unsalted hash security), LOW-v3-N (rename to maskAdminUid). NO change to `analytics.ts`. NO `server-only` boundary issue.

- **CRIT-v3-Ind-5 — `LifecycleSeqWidget` Props collision** (Independent 92% conf, sole). v3's `function LifecycleSeqWidget({...}: Props)` shadowed the outer `Props` interface; `lifecycleProps` reference was undefined. **v4 fold:** rename inner interface to `LifecycleSeqWidgetProps`; define explicitly. Props derived from `data` destructuring at call site: `<LifecycleSeqWidget seq={data.lifecycle_seq} group_label={data.group_label} group_color={data.group_color} group_icon={data.group_icon} block_label={data.block_label} block_color={data.block_color} block_icon={data.block_icon} stage_label={data.stage_label} stage_color={data.stage_color} stage_icon={data.stage_icon} bidValue={data.bid_value} />` (or use `{...data}` spread with explicit named-prop interface for type safety).

- **CRIT-v3-Gem-1 — `COA_NOT_FOUND` backend/frontend contract mismatch** (Gemini sole; **user authorized "200 + coa: null"**). **v4 fold:** backend `lead-inspect-query` returns `{ ok: true, data: { lead_id, lead_type: 'coa', source: {minimal stub}, /* other fields null */, coa: null } }` when a `coa:<num>` lead_id is provided but `coa_applications` row is missing. Mirrors the cross-stream orphan handling for consistency. `<ClassifierPendingBanner>` renders. Add inline note + RTL test #23.

- **CRIT-v3-DS-SEC — `s-maxage` cache directive credential exposure** (DeepSeek SECURITY, sole). **v4 fold (ELIMINATED by user-authorized JSON-file approach):** no admin endpoint = no cache directive = no exposure surface. Closed.

### HIGH (5 — 3 folded + 2 eliminated)

- **HIGH-v3-A — `node:crypto` client breakage** (DeepSeek sole). **v4 fold (ELIMINATED by CRIT-Ind-4 drop):** no `hashAdminUid` = no `node:crypto` import. Closed.

- **HIGH-v3-B — Cross-stream `OR ... LIKE` SQL planner anti-pattern** (Gemini sole). **v4 fold:** refactor to `UNION ALL`:
  ```sql
  SELECT lead_id, /* ... */ FROM lifecycle_status_history WHERE lead_id = $1
  UNION ALL
  SELECT lead_id, /* ... */ FROM lifecycle_status_history WHERE lead_id LIKE 'permit:' || $2 || ':%'
  ORDER BY transitioned_at ASC, id ASC
  ```
  Planner can use indexed seek for the equality + LIKE plan for the prefix without OR-poisoning. Mig 127 partial index on `lead_id` benefits from this.

- **HIGH-v3-C — Geometric-only invariant unenforced** (Gemini sole). **v4 fold:** UI renders a yellow warning badge "Unexpected cost_source: <value> — investigate Phase D classifier output" when `cost_source !== 'geometric' && cost_source !== null`. The geometric-only contract is now UI-asserted (not backend-filtered — operators still see the actual stored value for diagnosis). RTL test #18 covers (existing).

- **IMP-Obs3-2 — `LifecycleSeqWidget` three-state conflation** (Observability 85% conf). **v4 fold:** three distinct UI branches:
  - `catalogLoadError` → "Lifecycle catalog unavailable" (+ already-emitted `app_health` breadcrumb at JSON-file-load time)
  - `seq == null` → "Not classified yet (Phase D scheduler pending)"
  - `seq != null && catalogLoaded` → render scrubber

  Under JSON-file bundling: NO loading state (JSON is statically imported at build time). The three states collapse to TWO: error (JSON load fail — won't happen with static import; build-time enforced) + null seq.

- **IMP-Obs3-1 — `useUniversalStreamCatalog` hook code stub** (Observability 78% conf). **v4 fold (ELIMINATED by JSON-file approach):** no hook = no `onError` callback to specify. Closed.

### MEDIUM (12 — 9 folded + 3 eliminated)

- **MED-v3-D** (unsalted hash) — ELIMINATED by CRIT-Ind-4 drop.
- **MED-v3-E** (project_type enum) — Folded: `project_type: z.string().nullable()` (mirror MED-v2-G coa_type_class fix).
- **MED-v3-F** (catalog over-engineered) — Folded as user-authorized JSON-file approach (THE design choice driving v4 simplification).
- **MED-v3-G** (try/catch missing) — ELIMINATED by JSON-file (no route).
- **MED-v3-H** (scope_tags nullable) — Folded: `scope_tags: z.array(z.string()).nullable().default([])`. UI defaults to empty array.
- **MED-v3-I** (router.replace param loss) — Folded: use `useSearchParams` + `URLSearchParams` merge: `const params = new URLSearchParams(searchParams); params.set('lead_id', newLeadId); router.replace('?' + params.toString());`.
- **MED-v3-J** (PANEL_ORDER → component mapping) — Folded: define `const COMPONENTS: Record<PanelName, React.FC<{data: LeadInspect}>> = { identity: IdentityPanel, source: SourcePanel, ... }`. PANEL_ORDER iteration uses `<Components[name] key={name} data={data} />` or switch. The 'coa' name is a special case handled inline (banner OR panel).
- **MED-v3-Ind-IMP-1** (`Component` undefined in pseudocode) — Folded with MED-v3-J above.
- **MED-v3-Ind-IMP-2** (`extractCoaAppNum` undefined) — Folded: inline `const coaAppNum = activeId.replace(/^coa:/, '');` — 1 line, no helper needed.
- **MED-v3-Ind-IMP-3** (banner file locations) — Folded: Key Files now lists `src/components/admin/lead-inspector/ClassifierPendingBanner.tsx` (NEW, ~30 lines) + `src/components/admin/lead-inspector/OrphanLinkedCoaBanner.tsx` (NEW, ~30 lines).
- **IMP-Obs3-3** (ClassifierPendingBanner breadcrumb) — Folded: `useEffect(() => { Sentry.addBreadcrumb({ category: 'admin_action', level: 'info', message: 'classifier_pending_observed', data: { lead_id } }); }, [lead_id]);` in the banner.
- **IMP-Obs3-4** (empty cross-stream breadcrumb) — DEFER (Observability flagged as "or argue: too noisy"). Risk Register note added.

### LOW + NIT (6 — 5 folded + 1 documented)

- **LOW-v3-K** (idempotency check) — Folded: `if (newLeadId === activeId) return;` guard at top of `handleNavigate`.
- **LOW-v3-L** (LIKE ESCAPE for permit_num) — Folded: `LIKE 'permit:' || $2 || ':%' ESCAPE '\'` AND defensive `permit_num` value-sanitization (no `%`/`_` allowed in real permit numbers per mig 132 trigger format).
- **LOW-v3-M** (data_quality breadcrumb for missing usc.seq join) — N/A (no JOIN under JSON-file approach; lookup happens client-side from bundled JSON).
- **LOW-v3-N** (rename hashAdminUid) — ELIMINATED.
- **LOW-v3-O** (breadcrumb level consistency) — Folded: explicit `level: 'info'` on `inspect_navigate` breadcrumb; `level: 'warning'` on `data_quality_coa_substrate_missing`.
- **NIT-Obs3-6** (admin_action vs admin_action_performed naming) — DOCUMENTED in follow-up: add entry to `docs/reports/review_followups.md` post-ship — "Spec 33 §5 vs Spec 35 §7 + analytics.ts naming inconsistency; F.4 emits neither so reconciliation defers to standalone Spec 33 cleanup WF."

### Substrate verification PASSED (after v3 corrections)

Re-verified by Independent worktree at v3:
- mig 128 PK `seq INTEGER` ✓ (NOT `lifecycle_seq`)
- mig 128 cohort columns `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` ✓ (NOT `group_id`/`block_id`/`stage_id`)
- mig 128 icon columns `group_icon`/`block_icon`/`stage_icon` ✓
- mig 133 columns `lifecycle_seq`/`lifecycle_group`/`lifecycle_block`/`lifecycle_stage` ✓ (NOT `lifecycle_phase`)
- mig 132:30 `permits.linked_coa_application_number` ✓
- mig 127:28 `lifecycle_status_history.id BIGSERIAL` ✓

### Stale residue check PASSED at v3
All 6 v2 fold patterns verified clean: `usc.lifecycle_seq` gone, `mig 144` gone, `BaseLeadInspectSchema` rename gone, `lead_view` emit gone, `data_quality` category gone, v2 wrong cross-stream timeline gone.

---

## Why this task exists

F.1/F.2/F.3 produced the full CoA classifier output surface. F.4 adds the CoA Classification panel per Spec 76 §3.5 Cycle 8. After F.4 ships, Phase F closes.

**Scope discipline (v4 simplified):** F.4 = admin UI + data layer JOIN + Zod schema extension + bundled JSON catalog + 4 spec text amendments. NO new API endpoint (catalog is static JSON). NO new auth helper (no PostHog emit). Cleaner risk surface.

---

## Context

### Goal

Enable the admin Lead Detail Inspector to render a CoA Classification panel per Spec 76 §3.5 Cycle 8 when the inspected lead is CoA-stage OR when an inspected permit has a `linked_coa_application_number`. Includes 110-position lifecycle scrubber (using bundled JSON catalog), cross-stream timeline merge across ALL permit revisions, decision-history timeline, and orphan/classifier-pending banner states.

### Target Specs

All listed in Standards adherence (line 11).

### Key Files

- **`src/components/admin/lead-inspector/CoaClassificationPanel.tsx`** (NEW — ~380 lines; 12 sub-sections including 110-position scrubber per HIGH-v2-D accessibility folds)
- **`src/components/admin/lead-inspector/ClassifierPendingBanner.tsx`** (NEW — ~30 lines per MED-v3-Ind-IMP-3; useEffect-emits classifier_pending_observed breadcrumb per IMP-Obs3-3)
- **`src/components/admin/lead-inspector/OrphanLinkedCoaBanner.tsx`** (NEW — ~30 lines per MED-v3-Ind-IMP-3; warning banner for missing linked CoA reference)
- **`src/lib/admin/universal-stream-catalog.json`** (NEW — ~9KB; 110 rows × 12 fields; generated one-time from `universal_stream_catalog` DB table via a tiny standalone script `scripts/generate-stream-catalog-json.js` — committed to repo)
- **`scripts/generate-stream-catalog-json.js`** (NEW — ~25 lines; reads `universal_stream_catalog` DB table with CORRECT column names (`seq`, `lifecycle_group`/`lifecycle_block`/`lifecycle_stage`, `*_label`, `*_color`, `*_icon`), writes JSON file; manual `node scripts/generate-stream-catalog-json.js` re-run when catalog changes)
- **`src/lib/admin/lead-schemas.ts`** (EXTEND — ~+115 lines: append `coa: LeadInspectCoaSchema.nullable()` to existing `LeadInspectSchema` (no rename per CRIT-v2-4); ADD `linked_coa_application_number: z.string().nullable()` to existing `LeadInspectSourceSchema` per CRIT-v3-Ind-3; `LeadInspectCoaSchema` uses correct column names per CRIT-Ind-1+2: `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` + matching `*_label`/`*_color`/`*_icon`; `cost_source: z.string().nullable()` per CRIT-v1-E; `coa_type_class: z.string().nullable()` per MED-v2-G; `project_type: z.string().nullable()` per MED-v3-E; `scope_tags: z.array(z.string()).nullable().default([])` per MED-v3-H; datetime/date strict types per MED-v1-P)
- **`src/lib/leads/lead-inspect-query.ts`** (EXTEND — ~+200 lines: CoA JOIN with correct column names; cross-stream timeline via `UNION ALL` per HIGH-v3-B; linked-permit subquery LPAD in SQL per HIGH-Ind-D + ESCAPE per LOW-v3-L; backend returns 200+`coa: null` on COA_NOT_FOUND per CRIT-v3-Gem-1; `admin_action`/`level: 'warning'` Sentry breadcrumb on substrate-missing per CRIT-Obs-2; ALSO project `permits.linked_coa_application_number` into the source result)
- **`src/app/api/admin/leads/inspect/[id]/route.ts`** (EXTEND — ~+15 lines: relax `LeadIdSchema` regex; existing auth gate unchanged)
- **`src/components/admin/LeadDetailInspector.tsx`** (EXTEND — ~+65 lines: data-structure-driven panel ordering with `COMPONENTS: Record<PanelName, ...>` map per MED-v3-J; standalone `<ClassifierPendingBanner>` per HIGH-Ind-C; `<OrphanLinkedCoaBanner>` per HIGH-v2-E; `router.replace` with `URLSearchParams` merge per MED-v3-I; `handleNavigate` with idempotency guard per LOW-v3-K; NO `lead_view` admin_action emit per HIGH-Obs-1; `handleNavigate` order: addBreadcrumb → setActiveId → router.replace per IMP-Obs-1; placeholder + error text per HIGH-v1-L)
- **`src/tests/lead-inspect-query.infra.test.ts`** (EXTEND — Phase F.4 describe block ~18 tests)
- **`src/tests/db/lead-inspect-query.db.test.ts`** (EXTEND — Phase F.4 describe block ~8 tests including UNION ALL cross-stream merge per HIGH-v3-B + 200+coa:null contract per CRIT-v3-Gem-1)
- **`src/tests/CoaClassificationPanel.ui.test.tsx`** (NEW — ~22 RTL tests including SVG ARIA per HIGH-v2-D + JSON catalog mock)
- **`src/tests/ClassifierPendingBanner.ui.test.tsx`** (NEW — ~4 RTL tests including useEffect breadcrumb emit per IMP-Obs3-3)
- **`src/tests/OrphanLinkedCoaBanner.ui.test.tsx`** (NEW — ~3 RTL tests covering render + accessibility)
- **`docs/specs/02-web-admin/76_lead_feed_health_dashboard.md`** §3.5 Cycle 8 (AMEND — 4 text edits)
- **`docs/specs/01-pipeline/42_chain_coa.md`** §6.11 (AMEND — F.4 sub-deliverable row; Phase F → "COMPLETE")
- **`docs/specs/02-web-admin/35_web_admin_state_architecture.md`** §3.1 (AMEND — 1 NEW row `lead_inspect` + clarify existing `lead_detail` row; NO `universal_stream_catalog` row per JSON-file approach)

**No migrations.** Substrate verified after v3 corrections.

### Operating Boundaries

**Target Files (scope of this WF):**
- 6 NEW files (CoaClassificationPanel, ClassifierPendingBanner, OrphanLinkedCoaBanner, universal-stream-catalog.json, generate-stream-catalog-json.js, 3 ui test files)
- 5 EXTEND files (lead-schemas, lead-inspect-query, route, LeadDetailInspector, 2 existing test files)
- 3 spec amendments

**Out-of-Scope:** mobile UI; pipeline scripts; logic_variables; cost slicer extension; URL deep-link from Test Feed Tool; PostHog admin_action_performed events (Spec 33 §11 read-only carve-out).

---

## Technical Implementation

### Part 1.1 — Branch detection (unchanged)

### Part 1.2 — CoA JOIN block (CRIT-Ind-1 + CRIT-v2-2 corrected)

```sql
-- CRIT-Ind-1: lifecycle_phase REMOVED; lifecycle_group/block/stage are the actual columns (mig 133).
-- CRIT-v2-2: usc.seq (NOT lifecycle_seq) is the PK.
SELECT
  ca.application_number,
  ca.lead_id              AS coa_lead_id,
  ca.coa_type_class,
  ca.project_type,
  ca.scope_tags,
  ca.structure_type,
  ca.decision             AS decision_current,
  ca.decision_date,
  ca.hearing_date,
  ca.estimated_cost,
  ca.cost_source,
  ca.modeled_gfa_sqm,
  ca.lifecycle_seq,
  ca.lifecycle_group,
  ca.lifecycle_block,
  ca.lifecycle_stage,
  ca.bid_value,
  ca.linked_permit_num,
  usc.group_label,  usc.group_color,  usc.group_icon,
  usc.block_label,  usc.block_color,  usc.block_icon,
  usc.stage_label,  usc.stage_color,  usc.stage_icon
FROM coa_applications ca
LEFT JOIN universal_stream_catalog usc ON usc.seq = ca.lifecycle_seq
WHERE ca.lead_id = $1
LIMIT 1
```

**CRIT-v3-Gem-1 — 200 + coa:null contract:** when `ca.application_number IS NULL` after the JOIN (i.e., user entered `coa:<missing>` directly), backend returns `{ok: true, data: {lead_id, lead_type: 'coa', source: minimalStub, /* nullables */, coa: null}}` (NOT a 404 error). Frontend's `<ClassifierPendingBanner>` renders. Emit `admin_action`/`level: 'warning'`/`message: 'data_quality_coa_substrate_missing'` Sentry breadcrumb.

**Decision-evolution sub-query (HIGH-v1-F tiebreak):**
```sql
SELECT lsh.decision, lsh.transitioned_at, lsh.from_status, lsh.to_status
  FROM lifecycle_status_history lsh
 WHERE lsh.lead_id = $1 AND lsh.decision IS NOT NULL
 ORDER BY lsh.transitioned_at ASC, lsh.id ASC;
```

**Cross-stream timeline sub-query (HIGH-v3-B `UNION ALL` + LOW-v3-L ESCAPE + HIGH-DS-v4-A 3rd CoA arm + HIGH-DS-v4-B/Ind-v4-6 NULL guard):**
```sql
-- v4.1 fold (HIGH-DS-v4-A): 3rd arm captures the linked CoA's history when inspecting a permit.
-- v4.1 fold (HIGH-DS-v4-B/Ind-v4-6): NULL parameters resolve to LIKE NULL (matches nothing per SQL 3-value
--   logic — not a data leak as initially flagged, but defensive guard preserved). When the inspector is
--   loading a CoA primary lead with no linked_permit_num, $2 and $3 are NULL → arms 2+3 return zero rows
--   (safe). When inspecting a permit with linked CoA, all 3 arms fire. When inspecting a plain permit, only
--   arm 2 fires.
-- $1 = the active lead_id (primary). $2 = bare permit_num (for LIKE prefix, NULL if active is CoA without
--   linked_permit_num). $3 = linked CoA lead_id 'coa:<num>' (NULL if active is CoA primary OR if active is
--   permit without linked_coa_application_number).
SELECT lsh.lead_id,
       CASE WHEN lsh.lead_id LIKE 'coa:%' THEN 'coa' ELSE 'permit' END AS lead_type,
       lsh.from_status, lsh.to_status, lsh.transitioned_at, lsh.id
  FROM lifecycle_status_history lsh
 WHERE lsh.lead_id = $1
UNION ALL
SELECT lsh.lead_id, 'permit', lsh.from_status, lsh.to_status, lsh.transitioned_at, lsh.id
  FROM lifecycle_status_history lsh
 WHERE $2 IS NOT NULL
   AND lsh.lead_id LIKE 'permit:' || $2 || ':%' ESCAPE '\'
UNION ALL
SELECT lsh.lead_id, 'coa', lsh.from_status, lsh.to_status, lsh.transitioned_at, lsh.id
  FROM lifecycle_status_history lsh
 WHERE $3 IS NOT NULL
   AND lsh.lead_id = $3
ORDER BY transitioned_at ASC, id ASC;
```
Plus value-sanitization: backend rejects `$2` if it contains `%`/`_`/`\` (mig 132 trigger output is `permit:NUM:REV` where NUM is alphanumeric+hyphen; defensive). NULL `$2`/`$3` are explicitly handled via `IS NOT NULL` guards in each arm.

**Parameter assembly by inspect path (HIGH-Ind-v4-6):**
- Active = CoA primary, has linked_permit_num → `$1 = coa:APP`, `$2 = ca.linked_permit_num`, `$3 = NULL`
- Active = CoA primary, no linked_permit_num → `$1 = coa:APP`, `$2 = NULL`, `$3 = NULL` (only arm 1)
- Active = permit, has linked_coa_application_number → `$1 = permit:NUM:REV`, `$2 = permit_num`, `$3 = 'coa:' + linked_coa_application_number`
- Active = permit, no linked_coa_application_number → `$1 = permit:NUM:REV`, `$2 = permit_num`, `$3 = NULL`

**Linked-permit sub-query (HIGH-Ind-D — LPAD in SQL):**
```sql
SELECT p.permit_num,
       LPAD(p.revision_num::text, 2, '0') AS revision_num_padded,
       p.status,
       p.lead_id
  FROM permits p
 WHERE p.permit_num = $1
 ORDER BY p.revision_num DESC
 LIMIT 1
```

### Part 1.3 — Permit-side back-reference handling

(unchanged shape from v3, with corrected SQL column names per CRIT folds and `permits.linked_coa_application_number` now projected into source per CRIT-v3-Ind-3)

### Part 2 — Zod schema (column names corrected; LeadInspectSourceSchema EXTEND)

**v4.1 Sub-schema definitions (HIGH-Ind-v4-4):** the 4 sub-schemas referenced by `LeadInspectCoaSchema` must be defined explicitly:

```ts
export const LeadInspectCoaDecisionEntrySchema = z.object({
  decision: z.string(),
  transitioned_at: z.string().datetime(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
});
export const LeadInspectCoaLinkedPermitSchema = z.object({
  permit_num: z.string(),
  revision_num: z.string().regex(/^\d{2}$/),   // LPAD'd by SQL per HIGH-Ind-D
  status: z.string().nullable(),
  lead_id: z.string(),
});
export const LeadInspectCoaCrossStreamEntrySchema = z.object({
  lead_id: z.string(),
  lead_type: z.enum(['permit', 'coa']),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  transitioned_at: z.string().datetime(),
  id: z.number().int(),
});
export const LeadInspectCoaTradeSchema = z.object({
  trade_id: z.number().int().nullable(),
  trade_slug: z.string(),
  display_name: z.string().nullable(),   // falls back to trade_slug in UI per LOW-v1-Y
  confidence: z.number().nullable(),
});
```

**v4.1 Source stub for 200+coa:null contract (HIGH-Ind-v4-5):** when backend returns 200 + `coa: null` for missing CoA, the `source` field is populated with this explicit stub (no field omitted):

```ts
const sourceStubForMissingCoa = {
  permit_num: null, revision_num: null,
  permit_type: null, structure_type: null, status: null, enriched_status: null,
  description: null, est_const_cost: null, builder_name: null, owner: null,
  issued_date: null, application_date: null,
  address: { street_num: null, street_name: null, street_type: null, full: '' },   // 'full' is non-nullable string — empty placeholder
  linked_coa_application_number: null,
  last_seen_at: new Date().toISOString(), first_seen_at: new Date().toISOString(),
};
```
RTL test #23 fixture uses this exact stub. Existing 8 panels degrade gracefully on `null` fields per Spec 33 §9 empty-state mandate.

**v4.1 `UniversalStreamCatalogRow` type export (HIGH-Ind-v4-1):** the schema must also export the inferred type for import by `LifecycleSeqWidget`:

```ts
export type UniversalStreamCatalogRow = z.infer<typeof UniversalStreamCatalogRowSchema>;
```

```ts
// CRIT-v3-Ind-3: EXTEND existing LeadInspectSourceSchema with linked_coa_application_number.
// This is the ONLY change to existing schemas; NO BaseLeadInspectSchema rename.
export const LeadInspectSourceSchema = z.object({
  // ...existing fields preserved...
  linked_coa_application_number: z.string().nullable(),   // CRIT-v3-Ind-3 NEW field
});

// CRIT-Ind-1 + CRIT-v2-2: column names corrected. NO lifecycle_phase.
export const LeadInspectCoaSchema = z.object({
  application_number: z.string(),
  coa_type_class: z.string().nullable(),
  project_type: z.string().nullable(),                                            // MED-v3-E: not enum
  scope_tags: z.array(z.string()).nullable().default([]),                          // MED-v3-H
  structure_type: z.string().nullable(),
  decision_current: z.string().nullable(),
  decision_history: z.array(LeadInspectCoaDecisionEntrySchema),
  decision_date: z.string().date().nullable(),
  hearing_date: z.string().date().nullable(),
  estimated_cost: z.number().nullable(),
  cost_source: z.string().nullable(),
  modeled_gfa_sqm: z.number().nullable(),
  lifecycle_seq: z.number().int().nullable(),
  lifecycle_group: z.string().nullable(),                                          // CRIT-Ind-1
  lifecycle_block: z.string().nullable(),                                          // CRIT-Ind-1
  lifecycle_stage: z.string().nullable(),                                          // CRIT-Ind-1
  group_label: z.string().nullable(),  group_color: z.string().nullable(),  group_icon: z.string().nullable(),
  block_label: z.string().nullable(),  block_color: z.string().nullable(),  block_icon: z.string().nullable(),
  stage_label: z.string().nullable(),  stage_color: z.string().nullable(),  stage_icon: z.string().nullable(),
  bid_value: z.number().min(0).max(1).nullable(),
  linked_permit: LeadInspectCoaLinkedPermitSchema.nullable(),
  cross_stream_timeline: z.array(LeadInspectCoaCrossStreamEntrySchema),
  lead_trades: z.array(LeadInspectCoaTradeSchema),
});

// LeadInspectSchema redeclared inline with coa field appended (CRIT-v2-4 — no rename).

// universal-stream-catalog.json type shape:
export const UniversalStreamCatalogRowSchema = z.object({
  seq: z.number().int(),
  lifecycle_group: z.string().nullable(),
  lifecycle_block: z.string().nullable(),
  lifecycle_stage: z.string().nullable(),
  group_label: z.string().nullable(),  group_color: z.string().nullable(),  group_icon: z.string().nullable(),
  block_label: z.string().nullable(),  block_color: z.string().nullable(),  block_icon: z.string().nullable(),
  stage_label: z.string().nullable(),  stage_color: z.string().nullable(),  stage_icon: z.string().nullable(),
});
// JSON validated at build time by generate-stream-catalog-json.js; client imports statically.
```

### Part 3 — `CoaClassificationPanel.tsx` (CRIT-v3-Ind-5 Props collision fix + IMP-Obs3-2 three-state widget collapse)

```tsx
import catalog from '@/lib/admin/universal-stream-catalog.json';
// Static JSON import — no fetch, no hook, no loading state on client.
import type { UniversalStreamCatalogRow } from '@/lib/admin/lead-schemas';

const TYPED_CATALOG = catalog as UniversalStreamCatalogRow[];   // 110 rows

interface CoaPanelProps {
  data: LeadInspectCoa;
  parentLeadType: 'permit' | 'coa';
  onNavigate: (leadId: string) => void;
}

interface LifecycleSeqWidgetProps {
  seq: number | null;
  group_label: string | null; group_color: string | null; group_icon: string | null;
  block_label: string | null; block_color: string | null; block_icon: string | null;
  stage_label: string | null; stage_color: string | null; stage_icon: string | null;
  bidValue: number | null;
}

// CRIT-v3-Ind-5: distinct named Props interface; no shadowing.
function LifecycleSeqWidget({ seq, group_label, block_label, stage_label, bidValue }: LifecycleSeqWidgetProps) {
  if (seq == null) return <Field label="Lifecycle position" value="Not classified yet (Phase D scheduler pending)" />;
  // IMP-Obs3-2: 2-state collapse — no loading/error since JSON is statically imported at build time.
  // Render 110-marker scrubber with WCAG accessibility (HIGH-v2-D).
  return (
    <div data-testid="coa-panel-section-lifecycle">
      <div className="text-sm font-medium mb-2">Lifecycle position: seq {seq} — {group_label} / {block_label} / {stage_label}</div>
      <svg viewBox="0 0 1100 40" className="w-full" role="img" aria-label={`Project lifecycle progression — 110 stages, current position: seq ${seq} (${group_label} / ${block_label} / ${stage_label})`} data-testid="lifecycle-scrubber-svg">
        {TYPED_CATALOG.map((row) => (
          <rect
            key={row.seq}
            x={row.seq * 10}  y={10}  width={9}  height={20}
            fill={row.group_color ?? '#cccccc'}
            stroke={row.seq === seq ? '#000' : 'transparent'}
            strokeWidth={row.seq === seq ? 2 : 0}
            aria-current={row.seq === seq ? 'step' : undefined}
            data-testid={`scrubber-position-${row.seq}`}
            data-current={row.seq === seq ? 'true' : 'false'}
          >
            <title>{`Seq ${row.seq}: ${row.group_label ?? '?'} / ${row.block_label ?? '?'} / ${row.stage_label ?? '?'}`}</title>
          </rect>
        ))}
      </svg>
      {bidValue != null && (
        <div className="mt-2" role="progressbar" aria-valuenow={bidValue} aria-valuemin={0} aria-valuemax={1} aria-valuetext={`${(bidValue * 100).toFixed(0)}%`} aria-label="Bid value strength">
          <div className="text-xs text-gray-600">bid_value</div>
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${bidValue * 100}%` }} data-testid="bid-value-bar" data-bid-value={bidValue} />
          </div>
        </div>
      )}
    </div>
  );
}

const COA_TYPE_CLASS_COLORS: Record<string, string> = {
  residential:   'bg-green-100 text-green-800',
  commercial:    'bg-blue-100 text-blue-800',
  institutional: 'bg-purple-100 text-purple-800',
  mixed:         'bg-orange-100 text-orange-800',
  unclassified:  'bg-gray-100 text-gray-700',
};

function CoaTypeClassChip({ value }: { value: string | null }) {
  const colorClasses = COA_TYPE_CLASS_COLORS[value ?? 'unclassified'] ?? COA_TYPE_CLASS_COLORS['unclassified'];   // MED-v2-F fallback
  return <span className={`px-2 py-1 rounded text-xs ${colorClasses}`}>{value ?? 'Unclassified'}</span>;
}

export function CoaClassificationPanel({ data, parentLeadType, onNavigate }: CoaPanelProps) {
  return (
    <Section title="CoA Classification" subtitle={parentLeadType === 'permit' ? 'Linked CoA (cross-stream)' : 'Primary'}>
      <div data-testid="coa-panel-section-type-class"><CoaTypeClassChip value={data.coa_type_class} /></div>
      <div data-testid="coa-panel-section-project-type"><Field label="Project type" value={data.project_type} /></div>
      <div data-testid="coa-panel-section-scope-tags"><ScopeTagPills tags={data.scope_tags ?? []} /></div>
      <div data-testid="coa-panel-section-structure"><Field label="Structure type" value={data.structure_type} /></div>
      <div data-testid="coa-panel-section-decision"><DecisionTimeline current={data.decision_current} history={data.decision_history} /></div>
      <div data-testid="coa-panel-section-dates"><DatesRow decision_date={data.decision_date} hearing_date={data.hearing_date} /></div>
      <div data-testid="coa-panel-section-cost">
        <GeometricCostPanel estimated_cost={data.estimated_cost} cost_source={data.cost_source} modeled_gfa_sqm={data.modeled_gfa_sqm} />
        {/* HIGH-v3-C: warning badge when geometric-only invariant violated */}
        {data.cost_source != null && data.cost_source !== 'geometric' && (
          <div className="mt-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">⚠ Unexpected cost_source: <code>{data.cost_source}</code> — investigate Phase D classifier output</div>
        )}
      </div>
      <div data-testid="coa-panel-section-lifecycle">
        <LifecycleSeqWidget
          seq={data.lifecycle_seq}
          group_label={data.group_label} group_color={data.group_color} group_icon={data.group_icon}
          block_label={data.block_label} block_color={data.block_color} block_icon={data.block_icon}
          stage_label={data.stage_label} stage_color={data.stage_color} stage_icon={data.stage_icon}
          bidValue={data.bid_value}
        />
      </div>
      {data.linked_permit && <div data-testid="coa-panel-section-linked-permit"><LinkedPermitChip permit={data.linked_permit} onNavigate={onNavigate} /></div>}
      {data.cross_stream_timeline.length > 0 && <div data-testid="coa-panel-section-cross-stream"><CrossStreamTimeline rows={data.cross_stream_timeline} /></div>}
      <div data-testid="coa-panel-section-trades"><CoaTradesTable rows={data.lead_trades} /></div>
    </Section>
  );
}
```

### Part 4 — `LeadDetailInspector.tsx` integration (MED-v3-J COMPONENTS map + MED-v3-I router.replace params + LOW-v3-K idempotency)

```tsx
import { useRouter, useSearchParams } from 'next/navigation';
import { addBreadcrumb } from '@sentry/nextjs';
import { CoaClassificationPanel } from './lead-inspector/CoaClassificationPanel';
import { ClassifierPendingBanner } from './lead-inspector/ClassifierPendingBanner';
import { OrphanLinkedCoaBanner } from './lead-inspector/OrphanLinkedCoaBanner';

type PanelName = 'identity' | 'source' | 'scope' | 'trades' | 'entity' | 'spatial' | 'cost' | 'lifecycle' | 'forecast' | 'engagement' | 'coa';

// MED-v3-J: explicit component map for panel-ordering iteration.
const COMPONENTS: Record<Exclude<PanelName, 'coa'>, React.FC<{ data: LeadInspect }>> = {
  identity: IdentityPanel, source: SourcePanel, scope: ScopePanel, trades: TradesPanel,
  entity: EntityPanel, spatial: SpatialPanel, cost: CostPanel, lifecycle: LifecyclePanel,
  forecast: ForecastPanel, engagement: EngagementPanel,
};

const PANEL_ORDER_FOR_COA: PanelName[] = ['identity', 'coa', 'source', 'scope', 'trades', 'entity', 'spatial', 'cost', 'lifecycle', 'forecast', 'engagement'];
const PANEL_ORDER_FOR_PERMIT: PanelName[] = ['identity', 'source', 'scope', 'trades', 'entity', 'spatial', 'cost', 'lifecycle', 'forecast', 'engagement', 'coa'];

// ...inside LeadDetailInspector():
const router = useRouter();
const searchParams = useSearchParams();

const handleNavigate = (newLeadId: string) => {
  if (newLeadId === activeId) return;   // LOW-v3-K idempotency guard

  // IMP-Obs-1 order: breadcrumb (intent) → setState → URL update
  addBreadcrumb({ category: 'admin_action', level: 'info', message: 'inspect_navigate', data: { from: activeId, to: newLeadId } });
  setActiveId(newLeadId);

  // MED-v3-I: preserve other query params via URLSearchParams merge
  const params = new URLSearchParams(searchParams);
  params.set('lead_id', newLeadId);
  router.replace('?' + params.toString());
};

// HIGH-v1-L: placeholder + error help text use admin canonical format
<input placeholder="permit:NUM:REV or coa:APP-NUM (e.g. permit:24-101234:01 or coa:A1234567)" />

// Panel render block — MED-v3-R conditional ordering with explicit COMPONENTS map
const order = data.lead_type === 'coa' ? PANEL_ORDER_FOR_COA : PANEL_ORDER_FOR_PERMIT;
return order.map((name) => {
  if (name === 'coa') {
    // HIGH-Ind-C: standalone ClassifierPendingBanner for primary-CoA missing case
    if (data.lead_type === 'coa' && data.coa === null) {
      const coaAppNum = activeId.replace(/^coa:/, '');   // MED-v3-Ind-IMP-2 inline (no helper)
      return <ClassifierPendingBanner key="coa-pending" application_number={coaAppNum} lead_id={activeId} />;
    }
    // HIGH-v2-E: OrphanLinkedCoaBanner for permit-with-missing-linked-coa case
    if (data.lead_type === 'permit' && data.source.linked_coa_application_number != null && data.coa === null) {
      return <OrphanLinkedCoaBanner key="coa-orphan" linked_coa_application_number={data.source.linked_coa_application_number} />;
    }
    if (data.coa) {
      return <CoaClassificationPanel key="coa" data={data.coa} parentLeadType={data.lead_type} onNavigate={handleNavigate} />;
    }
    return null;   // Default: nothing to render (permit lead, no linked CoA)
  }
  const Component = COMPONENTS[name];
  return <Component key={name} data={data} />;
});
```

### Part 5 — Route handler (HIGH-v1-L message)

```ts
const LeadIdSchema = z.string().regex(
  /^(permit|coa):.+/,
  'lead_id must start with permit: (e.g. permit:24-101234:01) or coa: (e.g. coa:A1234567)'
);
```

### Part 6 — JSON catalog generator (NEW per Gemini MED-v3-F)

```js
// scripts/generate-stream-catalog-json.js
// Run manually: node scripts/generate-stream-catalog-json.js
// Output: src/lib/admin/universal-stream-catalog.json (110 rows)
'use strict';
const pipeline = require('./lib/pipeline');
const fs = require('node:fs');
const path = require('node:path');

pipeline.run('generate-stream-catalog-json', async (pool) => {
  // v4.1 HIGH-Ind-v4-2 + IMP-Obs-v4-2: column-drift sanity check — verify the expected column set
  //   matches the actual table schema. Throws if a future migration adds/renames columns.
  const expectedCols = new Set([
    'seq', 'lifecycle_group', 'lifecycle_block', 'lifecycle_stage',
    'group_label', 'group_color', 'group_icon',
    'block_label', 'block_color', 'block_icon',
    'stage_label', 'stage_color', 'stage_icon',
  ]);
  const { rows: actualCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'universal_stream_catalog'`
  );
  const actualColSet = new Set(actualCols.map((r) => r.column_name));
  const missing = [...expectedCols].filter((c) => !actualColSet.has(c));
  const unknown = [...actualColSet].filter((c) => !expectedCols.has(c));
  if (missing.length > 0) throw new Error(`universal_stream_catalog missing columns: ${missing.join(', ')}`);
  if (unknown.length > 0) {
    pipeline.log.warn('[generate-stream-catalog-json]',
      `universal_stream_catalog has new columns not in JSON shape: ${unknown.join(', ')} — re-run generator AND update UniversalStreamCatalogRowSchema`);
  }

  const { rows } = await pool.query(`
    SELECT seq, lifecycle_group, lifecycle_block, lifecycle_stage,
           group_label, group_color, group_icon,
           block_label, block_color, block_icon,
           stage_label, stage_color, stage_icon
      FROM universal_stream_catalog
     ORDER BY seq ASC
  `);

  // v4.1 HIGH-Ind-v4-2 + MED-Gem-v4-D: runtime Zod validation makes the "build-time validation" claim true.
  const { UniversalStreamCatalogRowSchema } = require('../src/lib/admin/lead-schemas');
  const validated = z.array(UniversalStreamCatalogRowSchema).parse(rows);
  // v4.1 HIGH-Gem-v4-B: 110-row hardcoded check REMOVED — brittle vs future migrations.

  const outputPath = path.join(__dirname, '..', 'src', 'lib', 'admin', 'universal-stream-catalog.json');
  fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2));
  pipeline.log.info('[generate-stream-catalog-json]', `Wrote ${validated.length} rows to ${outputPath}`);

  // v4.1 HIGH-Ind-v4-3: drop emitSummary/emitMeta entirely — this is a one-shot build-time generator,
  //   NOT a pipeline manifest step. No observer consumer; pipeline.run wrapper is used purely for
  //   pool lifecycle. The absent emitSummary would have produced a noisy WARN: 'no audit_table' →
  //   pipeline.js auto-stub UNKNOWN verdict. Cleaner to skip.
});
```

Spec 47 §R1-R12 compliance — this script is a one-shot generator (NOT in pipeline manifest), so most checks N/A. Run as needed when catalog changes.

### Part 7 — Test scaffolding (~50 new tests across 5 files; Step 0 verification per HIGH-v1-M)

**`lead-inspect-query.infra.test.ts` EXTEND** — Phase F.4 ~18 tests:
1-13: as v3 (CoA branch + permit back-reference + plain permit + decision-history ordering + cross-stream merge + correct usc.seq + linked-permit latest-revision + orphan + COA_NOT_FOUND → 200+coa:null per CRIT-v3-Gem-1 + cost from coa_applications + partial query failure 500 + decision sub-query CoA lead_id)
14: `admin_action`/`level: 'warning'` Sentry breadcrumb on substrate-missing (CRIT-Obs-2)
15: Cross-stream timeline via `UNION ALL` two-arm pattern (HIGH-v3-B) — text grep
16: LPAD'd revision_num in linked-permit subquery (HIGH-Ind-D)
17: `LeadInspectSchema.parse()` with coa field succeeds (CRIT-v2-4)
18: NO `admin_action_performed` event emitted (HIGH-Obs-1)

**`lead-inspect-query.db.test.ts` EXTEND** — Phase F.4 ~8 tests including `UNION ALL` cross-stream merge across multiple permit revisions (CRIT-v2-C + HIGH-v3-B) + 200+coa:null contract test (CRIT-v3-Gem-1).

**`CoaClassificationPanel.ui.test.tsx` NEW** — ~22 tests:
1-18: as v3
19: SVG accessibility — role="img" + aria-label + <title> per rect + aria-current="step" + role="progressbar" + aria-valuenow (HIGH-v2-D)
20: `<OrphanLinkedCoaBanner>` rendered for permit + linked_coa_application_number non-null + coa: null (HIGH-v2-E — tested in LeadDetailInspector.ui.test.tsx, not here)
21: `<ClassifierPendingBanner>` standalone rendered for lead_type==='coa' + coa: null (HIGH-Ind-C — tested in LeadDetailInspector.ui.test.tsx, not here)
22: COA_TYPE_CLASS_COLORS fallback for unmapped value (MED-v2-F)
23: cost_source !== 'geometric' renders yellow warning badge (HIGH-v3-C)

**`ClassifierPendingBanner.ui.test.tsx` NEW** — ~4 tests:
1: Renders banner text including `application_number`
2: `useEffect` fires `Sentry.addBreadcrumb({category: 'admin_action', level: 'info', message: 'classifier_pending_observed', ...})` on mount (IMP-Obs3-3 — mock @sentry/nextjs and assert call)
3: Accessibility — banner has `role="status"` + `aria-live="polite"`
4: Re-mount with different `lead_id` fires a new breadcrumb

**`OrphanLinkedCoaBanner.ui.test.tsx` NEW** — ~3 tests:
1: Renders banner text with `linked_coa_application_number`
2: `role="alert"` + `aria-live="assertive"` (orphan is a data-integrity issue)
3: Verifies the underlying Sentry breadcrumb was already emitted at the data layer (not in this banner)

### Part 8 — Spec amendments (3, was 5 in v3; reduced by JSON-file approach eliminating universal_stream_catalog Spec 35 §3.1 row)

- **Spec 76 §3.5 Cycle 8** — 4 text edits (lines 253 cost source, 255 icon columns, 277 lead_id format, F.4 DELIVERED note)
- **Spec 42 §6.11** — F.4 sub-deliverable row; Phase F → "COMPLETE"
- **Spec 35 §3.1** — 1 NEW row (lead_inspect) + 1 clarification (existing lead_detail = mobile)

---

## Pre-Review Self-Checklist (40 items)

(a)-(o) as v3 (SQL shape + module-scope helper + branch counters + per-branch UPDATE)
(p) `usc.seq` not `usc.lifecycle_seq` (CRIT-v2-2)
(q) `lifecycle_group`/`lifecycle_block`/`lifecycle_stage` (NOT `lifecycle_phase`) — both SQL + Zod (CRIT-Ind-1)
(r) `LeadInspectSourceSchema` EXTENDED with `linked_coa_application_number` (CRIT-Ind-3)
(s) NO `hashAdminUid` helper (CRIT-Ind-4 — dropped); NO `node:crypto` import
(t) `LifecycleSeqWidget` has dedicated `LifecycleSeqWidgetProps` interface (CRIT-Ind-5)
(u) Backend returns 200+`coa: null` on missing CoA (CRIT-v3-Gem-1)
(v) NO `universal_stream_catalog` API endpoint — JSON file at `src/lib/admin/universal-stream-catalog.json` (MED-v3-F user-authorized)
(w) NO `s-maxage` cache directive (eliminated — no admin endpoint)
(x) Cross-stream `UNION ALL` two-arm pattern (HIGH-v3-B) with ESCAPE on LIKE (LOW-v3-L)
(y) `cost_source !== 'geometric'` UI warning badge (HIGH-v3-C)
(z) `project_type: z.string().nullable()` (MED-v3-E)
(aa) `scope_tags: z.array(z.string()).nullable().default([])` (MED-v3-H)
(bb) `handleNavigate`: idempotency guard (LOW-v3-K) + URLSearchParams merge (MED-v3-I) + addBreadcrumb→setActiveId→router.replace order (IMP-Obs-1)
(cc) `COMPONENTS: Record<...>` map drives panel iteration (MED-v3-J)
(dd) `extractCoaAppNum` inline as `activeId.replace(/^coa:/, '')` (MED-v3-Ind-IMP-2)
(ee) `ClassifierPendingBanner` + `OrphanLinkedCoaBanner` listed in Key Files (MED-v3-Ind-IMP-3)
(ff) `<ClassifierPendingBanner>` emits useEffect breadcrumb (IMP-Obs3-3)
(gg) `<OrphanLinkedCoaBanner>` does NOT emit (data-layer breadcrumb fired earlier)
(hh) `IMP-Obs3-2` 2-state widget (under JSON-file: no loading state; just seq==null vs seq!=null)
(ii) NO `lead_view` admin_action_performed emit (HIGH-Obs-1)
(jj) `data_quality_*` Sentry breadcrumbs use `category: 'admin_action'`/`level: 'warning'` (CRIT-Obs-2)
(kk) `inspect_navigate` breadcrumb uses `level: 'info'` (LOW-v3-O)
(ll) 3 spec amendments (Spec 76 §3.5 × 4 edits + Spec 42 §6.11 + Spec 35 §3.1 × 2 changes)
(mm) Step 0 verification of pre-existing test text patterns (HIGH-v1-M)
(nn) ~55 tests across 5 files (18 infra + 8 db + 22 ui + 4 pending banner + 3 orphan banner)
(oo) v4.1: `UniversalStreamCatalogRow` type exported from `lead-schemas.ts` (HIGH-Ind-v4-1)
(pp) v4.1: Generator script runs `z.array(UniversalStreamCatalogRowSchema).parse(rows)` before `fs.writeFileSync` (HIGH-Ind-v4-2)
(qq) v4.1: Generator script `emitSummary`/`emitMeta` calls REMOVED (HIGH-Ind-v4-3 — one-shot, no observer)
(rr) v4.1: 4 sub-schemas explicitly defined: `LeadInspectCoaDecisionEntrySchema`, `LeadInspectCoaLinkedPermitSchema`, `LeadInspectCoaCrossStreamEntrySchema`, `LeadInspectCoaTradeSchema` (HIGH-Ind-v4-4)
(ss) v4.1: `sourceStubForMissingCoa` explicit shape for 200+coa:null path; `address.full: ''` (HIGH-Ind-v4-5)
(tt) v4.1: Cross-stream timeline 3-arm UNION ALL with `$2 IS NOT NULL` + `$3 IS NOT NULL` guards (HIGH-DS-v4-A + Ind-v4-6)
(uu) v4.1: Generator 110-row hardcoded check REMOVED (HIGH-Gem-v4-B)
(vv) v4.1: Generator column-drift `information_schema.columns` check ADDED (IMP-Obs-v4-2)
(ww) v4.1: Static JSON cast replaced with `z.array(UniversalStreamCatalogRowSchema).parse(catalog)` at module load in `CoaClassificationPanel.tsx` (MED-Gem-v4-D + IMP-Obs-v4-1)
(xx) v4.1: `CoaTypeClassChip` uses `value || 'unclassified'` (NOT `??`) for empty-string fallback (MED-DS-v4-D)
(yy) v4.1: `LifecycleSeqWidget` catalogLoadError branch REMOVED (no fetch in static import — MED-DS-v4-E)
(zz) v4.1: `COMPONENTS` map uses `satisfies Record<...>` for exhaustiveness (MED-DS-v4-F)
(aaa) v4.1: Spec 76 §3.5 internal contradiction cleanup added to Part 7 amendments (HIGH-Gem-v4-C — Cycle 7 amendment line 253 vs Goal/Endpoint line 301)
(bbb) v4.1: CI check OR pre-commit hook for `node scripts/generate-stream-catalog-json.js && git diff --exit-code` (CRIT-Gem-v4-1)
(ccc) v4.1: `scope_tags: z.array(z.string()).nullable().transform(val => val ?? [])` (LOW-Gem-v4-E)
(ddd) v4.1: Hardcoded `#cccccc` SVG fallback → design token via Tailwind class
(eee) v4.1: Breadcrumb data shapes spelled out explicitly: `{lead_id, application_number}` for substrate-missing; `{from, to}` for inspect_navigate; `{lead_id}` for classifier_pending_observed (NIT-Obs-v4-2)
(fff) v4.1: ClassifierPendingBanner test #2 documents React StrictMode double-fire behavior (NIT-Obs-v4-1)

---

## Execution Plan

- [ ] **Step 0** — Verify pre-existing `lead-inspect-query.infra.test.ts` text patterns
- [ ] **Generate JSON catalog** — Run `node scripts/generate-stream-catalog-json.js` to produce `src/lib/admin/universal-stream-catalog.json`. Commit the file.
- [ ] **Contract Definition** + **Spec Sync** (3 amendments) + **No migrations**
- [ ] **Test Scaffolding** — Author 3 NEW + 3 EXTEND test files. Confirm failures.
- [ ] **Red Light**
- [ ] **Implementation** — 6 NEW files + 5 EXTEND files; no hashAdminUid; JSON-file static import.
- [ ] **Pre-Review Self-Checklist** (40 items)
- [ ] **Multi-Agent Review (4 reviewers — diff stage)**
- [ ] **Triage**
- [ ] **Green Light** (`npm run verify` + `BUILDO_TEST_DB=1 npm run test:db`)
- [ ] **WF6 close-out** — `feat(76_lead_detail_inspector): WF1 Phase F.4 — Lead Inspector CoA Classification panel + 110-position scrubber (bundled JSON catalog) + cross-stream timeline (UNION ALL across all permit revisions) + decision history + linked-permit navigation — Phase F COMPLETE`. Tiny docs follow-up fills `[F.4-COMMIT]`.

---

## Risk Register

1-13 as v3 (with corrections).
14. **JSON catalog rebuild cadence** — `universal_stream_catalog` is reference data; manual `node scripts/generate-stream-catalog-json.js` re-run when catalog migration ships. Documented in Spec 76 §3.5 amendment notes.
15. **Spec 30 App Health Dashboard consumption** — `data_quality_coa_substrate_missing` breadcrumbs will surface in App Health alerts as warnings. Intended; first read-path emitter for this signal. Documented per Obs IMP-Obs3-5.
16. **Spec 33 §5 vs Spec 35 §7 naming inconsistency** — `admin_action` vs `admin_action_performed` event names. F.4 emits NEITHER. Defer reconciliation to standalone Spec 33 cleanup WF (filed at `docs/reports/review_followups.md` post-ship per NIT-Obs3-6).

---

> **PLAN LOCKED v4 — AWAITING 4-REVIEWER ROUND.**
> §10 note: v4 applies ~20 v3 folds (after 3 user-authorized design choices collapsed ~10 findings: JSON-file catalog, 200+coa:null contract, drop hashAdminUid). Substrate column names verified after v3 Independent worktree review. 0 active security concerns (s-maxage eliminated; unsalted hash eliminated).
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
