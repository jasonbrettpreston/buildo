# Spec 37 -- Corporate Identity Hub

## 1. Goal & User Story
Replace the fragmented `builders` table with a unified `entities` hub and `entity_projects` junction table, enabling single-pass enrichment per entity, role-based portfolio views, and WSIB/regulatory linkage directly to the entity hub.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read entities list, entity detail + portfolio |
| Admin | Read/Write, trigger enrichment, manage entity data |

## 3. Behavioral Contract
- **Inputs:** Permits (builder_name), CoA applications (applicant), WSIB registry entries. Data migration from existing `builders` table.
- **Core Logic:**
  - **Entity Resolution:** Each unique normalized name maps to one `entities` row. Normalization: uppercase, collapse whitespace, strip corporate suffixes (INC, LTD, CORP, etc.). Implemented in `src/lib/builders/normalize.ts`.
  - **Junction Linking:** `entity_projects` connects entities to permits (via permit_num/revision_num) and CoA applications (via coa_file_num) with a role enum (Builder, Architect, Applicant, Owner, Agent, Engineer).
  - **Backward Compatibility:** `builder_name` stays on permits as a read-only legacy field. `/api/builders` kept as alias querying `entities` + `entity_projects WHERE role = 'Builder'`. `Builder` TypeScript type aliased to `Entity`.
  - **WSIB Repointing:** `wsib_registry.linked_entity_id` FK replaces `linked_builder_id` for new linkages. Migration backfills from existing builder links.
  - **Enrichment:** All enrichment scripts (Google Places, web search) target `entities` table instead of `builders`.
- **Outputs:**
  - `GET /api/entities` — paginated list with search, role filtering
  - `GET /api/entities/[id]` — entity detail with portfolio (all linked permits + CoAs)
  - `GET /api/builders` — alias returning entities with Builder role
  - `GET /api/builders/[id]` — alias returning entity detail
- **Edge Cases:**
  - Empty/null builder_name on permits: skip entity upsert, no junction row
  - Duplicate normalized names across permits and CoA: merge into single entity via ON CONFLICT
  - WSIB entries with no builder match: linked_entity_id stays NULL
  - Entity with zero linked projects: still persists (may have been enriched)
  - Very long builder names (>500 chars): truncated by VARCHAR(500) constraint

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** Entity name normalization (suffix stripping, whitespace collapse, uppercase). Entity factory shape validation. EntityProject junction constraints. Role enum validation. Portfolio aggregation logic. (`entities.logic.test.ts`)
- **UI:** N/A (no new UI components — existing components updated to reference entities)
- **Infra:** Migration 042/043/044 DDL existence. GET /api/entities response shape. GET /api/entities/[id] response shape. /api/builders alias returns same data. entity_projects junction constraints. (`entities.infra.test.ts`)
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `migrations/042_entities.sql` — DDL for entities + entity_projects tables
- `migrations/043_entities_data_migration.sql` — Data migration from builders
- `migrations/044_wsib_entity_link.sql` — Add linked_entity_id to wsib_registry
- `src/lib/permits/types.ts` — Entity, EntityProject interfaces
- `src/lib/builders/normalize.ts` — Shared normalization function
- `src/tests/factories.ts` — Entity factories
- `src/lib/quality/metrics.ts` — Builder queries → entities
- `src/app/api/permits/[id]/route.ts` — Builder lookup via entity_projects
- `src/app/api/builders/route.ts` — Alias querying entities
- `src/app/api/builders/[id]/route.ts` — Alias querying entities
- `src/app/api/admin/builders/route.ts` — Stats from entities
- `src/app/api/entities/route.ts` — Primary entity list API
- `src/app/api/entities/[id]/route.ts` — Entity detail + portfolio
- `src/lib/builders/enrichment.ts` — Target entities table
- `src/lib/analytics/queries.ts` — Top builders via entities
- `scripts/extract-entities.js` — Replaces extract-builders.js
- `scripts/enrich-builders.js` — Target entities table
- `scripts/enrich-web-search.js` — Target entities table
- `scripts/link-wsib.js` — linked_entity_id
- `scripts/load-permits.js` — Inline entity upsert
- `scripts/load-coa.js` — Inline entity upsert
- `src/components/FreshnessTimeline.tsx` — PIPELINE_REGISTRY update
- `src/components/EnrichmentFunnel.tsx` — Builder row → entities
- `src/components/DataQualityDashboard.tsx` — Builder circle labels
- `src/app/permits/[id]/page.tsx` — Entity link
- `src/components/permits/PermitCard.tsx` — Entity link
- `src/app/builders/page.tsx` — Fetch from entities
- `scripts/run-chain.js` — Chain definitions update
- `src/tests/entities.logic.test.ts` — New
- `src/tests/entities.infra.test.ts` — New

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08.
- **`scripts/classify-permits.js`**: Governed by Spec 08.
- **HCRA/OBR integration**: Deferred to future spec.
- **`permits.builder_name` column**: Stays as read-only legacy field. No FK added.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)** — migration numbering.
- Relies on **Spec 02 (Data Ingestion)** — permit loading pipeline.
- Modifies **Spec 11 (Builder Enrichment)** — enrichment targets entities table.
- Modifies **Spec 28 (Data Quality Dashboard)** — metrics source changes.
- Modifies **Spec 35 (WSIB Registry)** — linked_entity_id replaces linked_builder_id.
- Relies on **Spec 12 (CoA Integration)** — CoA applicant extraction.
