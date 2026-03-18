# Active Task: Consolidate builders → entities & Drop Legacy Tables
**Status:** Implementation
**Rollback Anchor:** `abf3c9f`
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Finish the builders→entities consolidation (Spec 37). Create `entity_contacts` to replace `builder_contacts`. Update the 2 remaining runtime files that still reference `builder_contacts`. Drop `builders`, `builder_contacts`, and `sync_runs` (superseded by `pipeline_runs`). Regenerate Drizzle schema.
* **Target Spec:** `docs/specs/37_corporate_identity_hub.md`
* **Key Files:**
  - `migrations/055_entity_contacts.sql` — new table replacing builder_contacts
  - `migrations/056_drop_legacy_tables.sql` — drop builders, builder_contacts, sync_runs
  - `scripts/enrich-web-search.js` — writes to builder_contacts (line 385)
  - `src/app/api/builders/[id]/route.ts` — reads from builder_contacts (line 50)
  - `src/lib/db/generated/schema.ts` + `relations.ts` — regenerate after drops

## Technical Implementation
* **Migration 055 (entity_contacts):**
  - CREATE TABLE entity_contacts (id, entity_id FK→entities, contact_type, contact_value, source, contributed_by, verified, created_at)
  - Data migration: INSERT INTO entity_contacts SELECT ... FROM builder_contacts bc JOIN builders b JOIN entities e ON e.name_normalized = b.name_normalized
  - Indexes: entity_id, contact_type
* **Migration 056 (drop legacy):**
  - DROP TABLE builder_contacts (after 055 migrates data)
  - DROP TABLE builders (all consumers already use entities)
  - DROP TABLE sync_runs (superseded by pipeline_runs)
  - Remove wsib_registry.linked_builder_id FK + column
* **Script updates:**
  - `enrich-web-search.js:385` — `builder_contacts` → `entity_contacts`, `builder_id` → `entity_id`
  - `src/app/api/builders/[id]/route.ts:50` — `builder_contacts` → `entity_contacts`, `builder_id` → `entity_id`
* **Database Impact:** YES — 3 tables dropped, 1 created, 1 column dropped (wsib_registry.linked_builder_id)

## Standards Compliance
* **Try-Catch Boundary:** Existing try-catch in route.ts preserved; only SQL table name changes
* **Unhappy Path Tests:** Test that builder detail API returns contacts from entity_contacts
* **logError Mandate:** N/A — no new catch blocks
* **Mobile-First:** N/A — no UI changes

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- [x] UP + DOWN migration in `migrations/055_entity_contacts.sql` + `migrations/056_drop_legacy_tables.sql` (§3.2)
- [x] Backfill strategy: INSERT...SELECT from builder_contacts JOIN builders/entities for contact migration (§3.1) — builder_contacts is small (~500-1K rows)
- [x] `src/tests/factories.ts` — add createMockEntityContact factory (§5.1)
- [x] `npm run typecheck` planned after `db:generate` (§8.2)

### If API Route Created/Modified:
- [x] No new routes — only table name change in existing query
- [x] Existing try-catch + logError preserved
- [x] Unhappy path: test empty contacts, missing entity
- [x] Route already guarded in middleware
- [x] No secrets

### If UI Component Created/Modified:
- ⬜ N/A all sub-items

### If Shared Logic Touched:
- ⬜ N/A — no classification/scoring/scope changes

### If Pipeline Script Created/Modified:
- [x] enrich-web-search.js already uses Pipeline SDK (§9.4)
- [x] emitMeta updated to reference entity_contacts instead of builder_contacts

## Execution Plan
- [ ] **State Verification:** Confirm builder_contacts row count and that all builder_id values map to entities via name_normalized. Confirm sync_runs is not referenced by any active runtime code.
- [ ] **Contract Definition:** N/A — no new API routes, only table rename in existing query
- [ ] **Spec Update:** Update `docs/specs/37_corporate_identity_hub.md` to mark consolidation as complete. Run `npm run system-map`.
- [ ] **Schema Evolution:**
  1. Write `migrations/055_entity_contacts.sql` — CREATE TABLE + data migration + indexes
  2. Write `migrations/056_drop_legacy_tables.sql` — DROP builders, builder_contacts, sync_runs + remove wsib_registry.linked_builder_id
  3. Run migrations directly (pre-existing 030 failure is unrelated)
  4. `npm run db:generate` + `npm run typecheck`
- [ ] **Guardrail Test:** Add test for entity_contacts in entities.infra.test.ts; update enrichment tests
- [ ] **Red Light:** Verify new test fails before implementation
- [ ] **Implementation:**
  1. Update `scripts/enrich-web-search.js` — builder_contacts → entity_contacts
  2. Update `src/app/api/builders/[id]/route.ts` — builder_contacts → entity_contacts
  3. Update `src/tests/factories.ts` — add createMockEntityContact
  4. Update test assertions for entity_contacts
- [ ] **UI Regression Check:** N/A — no shared components modified
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
