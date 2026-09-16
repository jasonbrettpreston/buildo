# Active Task: WF1 — Specs 126/127/128, the MaxBLD Surface Standard
**Status:** Planning
**Domain Mode:** Admin (`.claude/domain-admin.md` read; docs-only in Phase A, `src/`+`scripts/` from Phase B)
**Branch:** `wf2/deep-scrapes-restore-l0` (main tree) · **no commits made during authoring**

## Context
* **Goal:** Establish the surface descriptor as the contract for the whole rendering estate — mobile screens, web pages and admin tools — mirroring the pipeline's Spec 122/123/124 standard, and absorbing Spec 125 (which becomes SUPERSEDED). Phase A authors the three specs + the mirror generator; Phase B lands the data model; Phase C converts the pilot surface.
* **Target Spec:** `docs/specs/02-web-admin/126_maxbld_surface_standard.md` (this task authors it) · `docs/specs/02-web-admin/127_surface_conversion_procedure.md` · `docs/specs/02-web-admin/128_surface_standard_policy.md`
* **Grounding inputs (measured, not trusted):** `docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md` (the census — authoritative) · `docs/reports/2026-09-15-spec125-mobile-parcel-cost-tool-gap-analysis.md` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md` (the 22-surface admin catalogue)
* **Key Files (Phase A, all NEW):**
  - `docs/specs/02-web-admin/126_maxbld_surface_standard.md`
  - `docs/specs/02-web-admin/127_surface_conversion_procedure.md`
  - `docs/specs/02-web-admin/128_surface_standard_policy.md`
  - `scripts/violations/generate-spec-mirror.mjs` (the mirror generator)
  - `scripts/surfaces/_schema/surface.schema.json` (DRAFT descriptor schema: 21 categories, 11 archetype profiles, `x-frozen: false`)
  - `scripts/surfaces/_schema/surface-census.json` (the measured source of record for the registry)
  - `scripts/violations/generate-surface-registry.mjs` (the registry generator)
  - `docs/reports/generated/127-surface-registry.md` (**the reviewable artifact** — Spec 127 §8)
  - `src/tests/surface-registry.infra.test.ts` (the registry drift lock)
  - `docs/specs/00-architecture/00_system_map.md` (REGENERATED, not hand-edited)

## Operator rulings taken as FIXED (not re-litigated — recorded as Spec 128 §5 rows)
1. Parcel tool = its own metered product; product key **`parcel_tool`** (exercises Spec 116 OD5's own override clause) — **R-01**
2. UI archetypes are **LOAD-BEARING** — they gate which descriptor fields must be answered — **R-02**
3. **Spec 100 stays fenced** — no LeadDetail / flight-board / lead-feed linkage; a declared id-translation seam only — **R-03**
4. Unit set = SURFACE + CONTRACT + JOB + the ENTITLEMENT and LEDGER registries — **R-05**
5. `StepEngine` → **`SurfaceEngine`**; the pipeline keeps "step" — **R-06**
6. **20** categories (not 18); React Native (not FlutterFlow); web = Next.js RSC on Vercel, mobile = fetched projection, zero client business logic — **R-22**
7. `app_outputs` = materialised projection written by a converted pipeline step at the END of chain `sources`; the ONLY seam the app reads — **R-07**
8. One generic `usage_events` ledger = meter + observability spine; the dead `lead_view_events` meter is knowingly retired — **R-08**
9. Declare-and-assert schemas; **no generated migrations** (`db:generate` is introspect) — **R-19**
10. Guardrails exist from **Phase 1** — **R-15**
11. Admin surfaces are catalogued in the SAME pass; `platforms[]` is a descriptor field — **R-21**

## Technical Implementation
* **New/Modified Components:** none in Phase A (docs + one generator). Phase B/C add `surface.schema.json`, `contract.schema.json`, `job.schema.json`, `surface-validate.mjs`, the archetype component sets, `apply-surface-descriptors.js`.
* **Data Hooks/Libs:** `scripts/violations/generate-spec-mirror.mjs` — reads `scripts/steps/_schema/step.schema.json` (R2-canonical: 20 `required` categories, 8 archetypes, 6 `x-profile` blocks), Spec 123 §6/§6.1/§7, Spec 124 §2/§4/§5, and splices six mirrored tables into 126/127/128 between `<!-- generated:mirror:<id> -->` markers. `--check` for drift, `--self-test` for the tooling gate, `BUILDO_SPEC_MIRROR_*_PATH` test-only overrides.
* **Database Impact:** **NO in Phase A.** YES in Phase B — **nine** net-new tables (`app_outputs`, `usage_events`, `advertisers`, `placements`, `offers`, `pdf_exports`, `surface_descriptors`, `contract_descriptors`, `archetype_registry`) plus one CHECK widening on `entitlements` that adds **both** `parcel_tool` and `agent_reports` in one statement. `surface_ledger` was in an earlier draft and is deleted before being built (R-25): the fan-out and orphan joins derive from the CONTRACT's own `consumers[]`. All hand-authored per Spec 126 §6.1; migration numbers claimed by **re-measuring** (`ls migrations/ | tail -1` → 247 today, next free 248), never by trusting Spec 122 §7.5's reservation (broken three times, its own text now says to re-measure). No ALTER on a 100K+ row table is planned; `entitlements` is small.

## Standards Compliance
* **Try-Catch Boundary:** N/A in Phase A (no API route). Phase B/C: every new route wraps in `withApiEnvelope` with an overarching try-catch and `logError(tag, err, context)`.
* **Unhappy Path Tests:** Phase A — the generator's `--self-test` proves all six refusal paths FIRE (missing disposition · vanished source · unknown disposition value · missing marker pair · inverted markers · empty source section). Phase B/C — 400/403/404/429/500 per contract, plus the declared render states (`miss`, `ambiguous`, `schema_drift`, `offline`, `error_*`).
* **logError Mandate:** N/A in Phase A — the generator throws rather than logs, by design (a silent empty mirror is the defect it exists to prevent).
* **UI Layout:** N/A in Phase A. Admin = desktop-first, no UI kit (shadcn/ui is NOT initialized), destructive confirm = `role="alertdialog"`, icons = inline `<svg>`, forms = `useState` + Zod. Expo = mobile-first. Touch targets ≥44px is a required `a11y` declaration.
* **§11 note:** Phase A touches no DB, no API route, no UI component and no shared logic — items 1–33 are N/A. The applicable items are the Cross-Layer Contracts check (36–38): the mirrored tables are **generated from `step.schema.json`** rather than duplicated as literals, which is that rule applied to prose; and item 34, the pre-review self-checklist.

## Execution Plan

### Phase A — Authoring (THIS TASK)
- [x] A1: Read the census, the gap analysis, the admin report, Specs 125/122/122a/123/124/100/99/90/116/26/117/113/114, `_spec_template.md`, `CLAUDE.md`, `.claude/domain-admin.md`, and how `docs/reports/generated/*` are produced.
- [x] A2: **Measure the folder question.** `scripts/generate-system-map.mjs:24-31` `SECTIONS` is a hard-coded directory allow-list — an unlisted directory is **silently dropped** (no throw); `src/tests/system-map.infra.test.ts` hard-codes the same four sub-dirs at `:49`, `:300`, `:325`. ⇒ `docs/specs/04-platform/` is **NOT supported**. Place 126/127/128 in `docs/specs/02-web-admin/` next to Spec 125; file the folder question as `ASK-06` in Spec 128 §6.
- [x] A3: Write `scripts/violations/generate-spec-mirror.mjs` — six mirror blocks, `--check`, `--self-test`, `--print=<id>`, bidirectional totality throws, the authored disposition map kept small and auditable by eye (the `map-categories.mjs` posture).
- [x] A4: Author Spec 126 (contract), 127 (procedure), 128 (policy) with marker pairs; run the generator to populate them; hand-author around the generated blocks.
- [x] A5: Fold in the admin catalogue (22 surfaces), the 11 admin principles, and the RLS role matrix — corrected against Spec 114's **actual** class model (A/B/C + new **D**), its role vocabulary (`anon` / `authenticated` / `service_role` / table owner; **no `admin` Postgres role** — `profiles.is_admin` is a column flag), and its policy naming convention `` `<table>_<operation>_<scope>` ``.
- [x] A6: Detail the Supabase build-out — the five-step declare-and-assert flow, RLS as descriptor data, indexes justified by declared reads, the seeded-projection tables and their bidirectional drift lock, Storage buckets (Spec 114 §6, of which this is the **first consumer**), and how the admin reads the same tables **through** RLS.
- [x] A7: Classify `scripts/dispatch-notifications.js` and `scripts/classify-lifecycle-phase.js` in Spec 126's Out-of-Scope Files (Spec 124 R-AF arm of `system-map.infra.test.ts`).
- [x] A8: `node scripts/generate-system-map.mjs`; fix the three `Status:` headers so the map reads **DRAFT**, not the `Done` fallback.
- [x] A9: Verify — `npx vitest run src/tests/system-map.infra.test.ts` (13/13 PASS) · `node scripts/analysis/spec-split-check.mjs --check` (clean) · `generate-spec-mirror.mjs --check` (clean) · `--self-test` (11/11).
- [ ] A10: **PLAN REVIEW panel** (Spec 08 §6.4 Admin PLAN column): Gemini + DeepSeek lens set + Code Reviewer + **Integration (MAIN tree, standing member)** + Schema-Fidelity + Ground-truth → Compliance. Round-2 adjudication. Check each seat's declared `tools:` against its lens (the substrate rule).
- [x] A10b: Apply the Cross-read Adversary fold (simplicity rulings, collision fixes, ledger model, one-sequence rule, the two gap closures) and the grounder fold (Spec 114 counts, JOB reconciliation, x-profile totality, the stale header note, the vacuous G0 lock). Amend the existing specs whose claims were measured wrong, additively and dated.
- [ ] A11: **Ratification — CLOSED.** After the grounding fold and the operator's rulings of 2026-09-15, **Spec 128 §5 has ZERO `PROPOSED` rows**: nine of the twelve that opened `PROPOSED` were already decided by a ratified spec, an executed code fact, a prior operator ruling or law; one (R-14) was decided WRONGLY and was corrected rather than ratified (its "before C3" deadline expired 2026-09-04 and never applied to its own answer); and the three genuinely open — **R-10** (RLS class D), **R-13** (page granularity + `owns.components[]`) and **R-17/R-34** (ad disclosure) — were ruled by the operator on 2026-09-15. Every `ACCEPTED` row names a deciding source **outside this pass**, per §4.7a. No row reads `BUILT`: the locks are Phase-1 work.

  Open **asks** still needing an answer before the phase they gate: `ASK-05` (P7), `ASK-06` (folder), `ASK-10` (P2b), `ASK-11` (P1), `ASK-12` (P4), `ASK-13` (P0). `ASK-01/02/03/04/07/08/09/14` were closed during the folds — see Spec 128 §6's "Closed during the review folds" table.
- [ ] A12: **WF6** — harden and commit. The commit MUST include the regenerated `00_system_map.md`; mark Spec 125's status **SUPERSEDED** in the same commit (Spec 126 §0).

### Phase B — The data model (separate WF, gated on A11)
*Sequencing is Spec 127 §4.4's; the ids below are that table's, never a second numbering.*
- [ ] **P0** (Spec 127 pre-batch): close the **9 unaudited admin mutations** (one WF3, nine sites) + reconcile the two orphan sweeps and adjudicate the uncalled `/api/admin/*` routes (`ASK-13`), by a different party than the one that wrote them.
- [ ] **P1**: Author `surface.schema.json` / `contract.schema.json` / `job.schema.json` with archetype `allOf` profiles; prove a missing required field throws.
- [ ] **P1**: Declare every table each feature needs, **with its admin view**, as descriptor data — columns, PK, FKs, CHECK vocabularies, RLS block (`class` ∈ A/B/C/D, `owner_col`, per-role `grants`, `why_none`), and each index paired with the declared read that justifies it.
- [ ] **P1**: Hand-author the migrations (numbers re-measured), land the introspect round trip, and land the **bidirectional** drift locks — declared vs introspected types, declared vs live `pg_policies` — each with a **RED canary**, under `BUILDO_TEST_DB=1 npm run test:db` (not pgTAP: `supabase test db` runs in no workflow, `ASK-08`).
- [ ] **P1**: `seeds/roles.json` + class D + the `surface-exports` Storage bucket (R-31), + `seeds/entitlements.json` + `seeds/usage-events.json`, mirrored into `docs/specs/_contracts.json` and grep-pinned in `contracts.infra.test.ts`, on the `entitlement_products` precedent.
- [ ] **P1**: `apply-surface-descriptors.js` — `ON CONFLICT … DO UPDATE` keyed on `git_sha`, logging every changed row. **Never `DO NOTHING`** (the measured cloud-parity blind spot).
- [ ] **P1**: Guardrails, in this same phase (R-15): `surface-validate.mjs` seeded from the three existing mobile lint tests (943 lines / 41 cases), the golden-PAIR harness, the boundary lint rules, and `generate-spec-mirror.mjs --check` wired into `npm run verify`.

### Phase C — The pilot surface (separate WF, gated on B)
*Sequencing is Spec 127 §4.4's — batches **B1**, **B1a**, **B2**. Note two eligibility facts read off that table rather than assumed: the pilot converts the estate's **only** SLOT member, so SLOT has one proven member after B1 and stays in full form; and B1 contains **no** SEARCH member, so SEARCH is not eligible at B2 and `parcel_search` converts in full form.*
- [ ] **B1**: `parcel_detail` → **REPORT** (+ SLOT + EXPORT + GATE), full nine-commit form per Spec 127 §4, carrying its dependencies (`pdf_exports`, the bucket, class D). Kill criterion declared before commit 1: **if the descriptor exceeds ~250 lines, the profile design is wrong.**
- [ ] **B1**: Generate the mobile Zod mirror from the CONTRACT descriptor — killing the four-site transcription, the strictness drift (server `.strict()` ×6 vs client `.passthrough()`/`z.record` ×5), the missing parcel lock, and the CI-excluded cross-tree test, together.
- [ ] **B1a**: Admin pilot `admin_surface_registry` → `/admin/surfaces`, 100% generated, with the staleness lock + RED canary. Usage column renders `"not_yet_metered"`, never a blank or a zero (`ASK-10`).
- [ ] **B2**: `parcel_search` → SEARCH and `admin/parcel-cost` as the third projection — two proven members unlock the compressed 3-commit form per archetype.

## Known gotchas carried into this task
- **The system map is regenerated and part of this change** — `system-map.infra.test.ts:49` asserts every `src/`/`scripts/` path in a spec's Target Files list appears in its map row. Re-run `node scripts/generate-system-map.mjs` if any boundary line changes.
- **That lock matches the FIRST occurrence of the canonical Target-Files heading literal in the file**, so quoting the heading in prose silently redirects it — measured, and filed MED in `docs/reports/review_followups.md` under "Spec 126 WF1". Never write the canonical heading outside the Operating Boundaries section.
- **Cite by greppable anchor, not line number.** Plan citations rot exactly where the plan's own earlier steps edit the file.
- **Worktree-isolated reviewers cannot see untracked files.** Every inventory claim in the review panel must be verified from the MAIN tree — and every file this task produced is currently untracked.
- **Bash-tool heredocs mangle escape sequences on Windows** — use the Edit tool for any edit containing them. (Hit once during A4; the template literal was repaired with Edit.)
- **One committer at a time** — subagents never commit concurrently on this branch.

> **PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**
> §11 note: Phase A is doc-only, so §11's DB / API / UI / shared-logic arms are N/A; the applicable arm is Cross-Layer Contracts (36–38), satisfied by generating the mirrored tables from `step.schema.json` rather than transcribing them.
