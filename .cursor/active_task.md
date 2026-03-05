# Active Task: Corporate Identity Hub
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis

## Context
* **Goal:** Replace fragmented `builders` + `project_stakeholders` tables with unified `entities` hub and `entity_projects` junction table. Enables single-pass enrichment per entity, role-based portfolio views, and WSIB/regulatory linkage directly to the entity hub.
* **Target Spec:** `docs/specs/37_corporate_identity_hub.md`
* **Design Reference:** `docs/reports/corporate_identity_hub_strategy.md`
* **Key Files:** `migrations/042_entities.sql`, `migrations/043_entities_data_migration.sql`, `migrations/044_wsib_entity_link.sql`, `src/lib/builders/normalize.ts`, `src/lib/permits/types.ts`

## Technical Implementation

### Database Impact: YES
* **Migration 042:** DDL for `entities` + `entity_projects` tables (WRITTEN)
* **Migration 043:** Data migration from `builders` table (WRITTEN)
* **Migration 044:** `wsib_registry.linked_entity_id` FK (WRITTEN)

### Already Completed (Pre-Crash)
* Strategy doc, Spec 37, Migrations 042-044, `normalize.ts`, Entity/EntityProject types in `types.ts`

### Remaining Work
* **Factories:** Add `createMockEntity` + `createMockEntityProject` to `src/tests/factories.ts`
* **Tests:** Create `src/tests/entities.logic.test.ts` (normalization, factory shape, role enum)
* **Tests:** Create `src/tests/entities.infra.test.ts` (migration DDL, API response shapes)
* **Run migrations:** `npm run migrate` then `npm run db:generate` then `npm run typecheck`
* **API routes:** `src/app/api/entities/route.ts`, `src/app/api/entities/[id]/route.ts`
* **Builder API alias:** Update `src/app/api/builders/route.ts` and `[id]/route.ts`
* **Ingestion updates:** `scripts/load-permits.js` and `scripts/load-coa.js` inline entity upsert
* **Enrichment updates:** Scripts to target `entities` table
* **Dashboard updates:** EnrichmentFunnel, FreshnessTimeline, DataQualityDashboard
* **UI updates:** PermitCard, permit detail page, builders page

## Execution Plan
- [x] **Spec & Strategy:** `docs/specs/37_corporate_identity_hub.md` + strategy doc
- [x] **Schema Evolution:** Migrations 042-044 written
- [x] **Type Definitions:** Entity, EntityProject, Builder alias in `types.ts`
- [x] **Normalization Module:** `src/lib/builders/normalize.ts`
- [x] **Run Migrations:** DB already had entities (3,632 rows), entity_projects (14,542), WSIB links (1,321)
- [x] **DB Types:** `npm run db:generate` — schema.ts regenerated with entities
- [x] **Test Factories:** `createMockEntity` + `createMockEntityProject` added, `createMockBuilder` kept as alias
- [x] **Test Scaffolding:** `entities.logic.test.ts` (20 tests) + `entities.infra.test.ts` (9 tests)
- [x] **Implementation Phase 1 — Type fixes:** factories.ts, builders.logic.test.ts, enrichment.ts → Entity field names
- [x] **Implementation Phase 2 — SQL repoint:** builders → entities across 7 files (enrichment.ts, builders/route.ts, builders/[id]/route.ts, admin/builders/route.ts, admin/stats/route.ts, permits/[id]/route.ts, analytics/queries.ts, quality/metrics.ts)
- [x] **Implementation Phase 3 — New API routes:** entities/route.ts + entities/[id]/route.ts
- [x] **Green Light:** 1,569 tests passing, 0 type errors, lint clean
- [x] **System Map:** regenerated (39 specs)
- [ ] **Atomic Commit**
- [ ] **Founder's Audit**
