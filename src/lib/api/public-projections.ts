// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §4.3 ("Never SELECT * —
//               always project specific columns") + §4.4 (envelope)
//             docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 + §5
//               (the gated `parcels` consumer whitelist this must not undercut)
//             docs/specs/02-web-admin/37_entity_model.md §3 (entity vocabulary)
//
// The column allow-lists served by the UNAUTHENTICATED `PUBLIC_PREFIXES`
// routes (`/api/permits`, `/api/permits/[id]`, `/api/builders`,
// `/api/builders/[id]`, `/api/coa`, `/api/entities`, `/api/entities/[id]`).
//
// WHY THIS FILE EXISTS (measured 2026-09-15, WF3 SEC-1): those routes ran
// `SELECT *` / `SELECT pa.*` / `SELECT e.*` against tables that have grown to
// 158 (`parcels`), 171 (`permits`) and 146 (`coa_applications`) columns. A
// column added anywhere by the pipeline was published to the open internet on
// its next deploy, with no code change and no test able to notice. The worst
// concrete case: `/api/permits/[id]` served the whole `parcels` row — the
// `parcel_cost_menu` and the twelve `cost_*` scalars that Spec 100 §5 says
// "we will not serve to a lapsed or deleted account even if a stale client
// bypasses the UI gate", plus the raw PostGIS `geometry`/`geom` polygons.
//
// EVERY list below is derived from MEASURED consumer reads (the fields the
// pages/components actually render), never from a page's local `interface` —
// several of those interfaces are inherited from the legacy `builders` table
// (dropped by migration 056) and name columns `entities` does not have.
// Adding a column here is a DISCLOSURE DECISION: name the consumer that reads
// it.
//
// These arrays are interpolated into SQL (identifiers cannot be bound as
// parameters). They are module-local literals — never request-derived — and
// the shape assertion below fails the module load if one is ever malformed.

/** Identifier shape gate — a belt-and-braces guard on SQL interpolation. */
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

function cols(...names: string[]): readonly string[] {
  for (const n of names) {
    if (!SAFE_IDENT.test(n)) {
      throw new Error(`[public-projections] unsafe column identifier: ${n}`);
    }
  }
  return Object.freeze(names);
}

/**
 * Prefix an allow-list with a table alias for use in a JOIN.
 * `qualify(PARCEL_PUBLIC_COLS, 'pa')` → `pa.id, pa.lot_size_sqft, …`
 */
export function qualify(columns: readonly string[], alias: string): string {
  if (!SAFE_IDENT.test(alias)) {
    throw new Error(`[public-projections] unsafe table alias: ${alias}`);
  }
  return columns.map((c) => `${alias}.${c}`).join(', ');
}

/** Join an allow-list into a bare SELECT list. */
export function selectList(columns: readonly string[]): string {
  return columns.join(', ');
}

// ---------------------------------------------------------------------------
// parcels — served ONLY as the `parcel` sub-object of GET /api/permits/[id]
// ---------------------------------------------------------------------------
/**
 * Consumers: `src/app/permits/[id]/page.tsx` renders `is_irregular`,
 * `lot_size_sqft`, `lot_size_sqm`, `frontage_ft`, `depth_ft`, `feature_type`;
 * `frontage_m` + `depth_m` are held because `validateParcelShape`
 * (`src/tests/api.infra.test.ts`) declares them as the parcel contract; `id`
 * is load-bearing — the route's massing block queries `parcel_buildings` by
 * it. `match_type` and `link_confidence` come from the `permit_parcels` JOIN,
 * not from this list.
 *
 * DELIBERATELY ABSENT (was served, now is not): `parcel_cost_menu`, every
 * `cost_*` scalar, `geometry`/`geom`, and the ~129 zoning / bylaw / heritage /
 * ravine / centreline / `existing_*` / `opt_*` / `max_build_*` internals. The
 * authenticated, subscription-gated `/api/parcels/lookup` remains the only
 * route that serves the cost payload (Spec 100 §5); this route is a different,
 * narrower posture and must stay narrower.
 */
export const PARCEL_PUBLIC_COLS = cols(
  'id',
  'lot_size_sqft',
  'lot_size_sqm',
  'frontage_ft',
  'frontage_m',
  'depth_ft',
  'depth_m',
  'feature_type',
  'is_irregular',
);

// ---------------------------------------------------------------------------
// permits
// ---------------------------------------------------------------------------
/**
 * GET /api/permits/[id] → `permit`.
 * Consumer: `src/app/permits/[id]/page.tsx` renders 23 of these. The
 * remainder are HANDLER-INTERNAL and must survive the projection or the route
 * changes behaviour:
 *   - `revision_num`               — response identity
 *   - `neighbourhood_id`           — gates the neighbourhoods lookup
 *   - `project_type`, `scope_tags` — read, and back-filled in-route by
 *                                    `classifyScope` when absent
 *   - `housing_units`              — read by `extractNewHouseTags`
 *   - `current_use`, `proposed_use`, `structure_type`, `permit_type`,
 *     `work`, `description`, `storeys`, `building_type`
 *                                  — inputs to `classifyScope` /
 *                                    `classifyUseType` / `inferMassingUseType`
 * DELIBERATELY ABSENT: `raw_json` (the entire upstream record), `data_hash`,
 * `location` (PostGIS), `owner`, and the lifecycle/matched/zoning internals.
 */
export const PERMIT_DETAIL_COLS = cols(
  'permit_num',
  'revision_num',
  'permit_type',
  'structure_type',
  'work',
  'street_num',
  'street_name',
  'street_type',
  'city',
  'ward',
  'status',
  'description',
  'est_const_cost',
  'builder_name',
  'building_type',
  'application_date',
  'issued_date',
  'completed_date',
  'first_seen_at',
  'current_use',
  'proposed_use',
  'housing_units',
  'storeys',
  'latitude',
  'longitude',
  'neighbourhood_id',
  'project_type',
  'scope_tags',
);

/**
 * GET /api/permits → `data[]`.
 * Consumers: `src/components/permits/PermitFeed.tsx` (its `PermitWithTrades`
 * interface) ∪ `src/components/permits/PermitCard.tsx` (`project_type`,
 * `scope_tags`, `storeys`). `trades[]` is attached separately from an
 * already-explicit pick.
 */
export const PERMIT_LIST_COLS = cols(
  'permit_num',
  'revision_num',
  'permit_type',
  'work',
  'street_num',
  'street_name',
  'street_type',
  'city',
  'ward',
  'status',
  'description',
  'est_const_cost',
  'issued_date',
  'builder_name',
  'project_type',
  'scope_tags',
  'storeys',
);

// ---------------------------------------------------------------------------
// permit_trades
// ---------------------------------------------------------------------------
/**
 * GET /api/permits/[id] → `trades[]` (the `pt.` side; `trade_slug`,
 * `trade_name`, `icon`, `color` come from the `trades` JOIN and are already
 * an explicit pick). Consumer: the page's `PermitDetail['trades']` interface
 * reads `lead_score`, `confidence`, `phase`, `tier`.
 * DELIBERATELY ABSENT: `id`, `permit_num`/`revision_num` (request identity),
 * `trade_id` (internal surrogate), `is_active`, `classified_at`,
 * `attachment_basis` (classifier provenance).
 */
export const PERMIT_TRADE_COLS = cols('tier', 'confidence', 'phase', 'lead_score');

// ---------------------------------------------------------------------------
// permit_history
// ---------------------------------------------------------------------------
/** GET /api/permits/[id] → `history[]`. Consumer reads exactly these four. */
export const PERMIT_HISTORY_COLS = cols(
  'changed_at',
  'field_name',
  'old_value',
  'new_value',
);

// ---------------------------------------------------------------------------
// entities — ONE vocabulary for /api/entities, /api/entities/[id],
// /api/builders, /api/builders/[id] and the `builder` sub-object of
// /api/permits/[id]. `/api/builders` is documented as an ALIAS of the entity
// endpoint (`src/tests/entities.infra.test.ts`), so one allow-list keeps that
// alias contract true by construction.
// ---------------------------------------------------------------------------
/**
 * Consumers: `src/app/builders/page.tsx`, `src/app/builders/[id]/page.tsx`,
 * `src/app/permits/[id]/page.tsx`. `legal_name` / `name_normalized` /
 * `permit_count` are the spec-named entity identity (Spec 37 §3).
 *
 * DELIBERATELY ABSENT: `primary_phone`, `primary_email`, `linkedin_url` — the
 * direct-contact PII an unauthenticated caller could harvest in bulk through
 * the paginated list route; and `photo_url` / `photo_validated_at`, which no
 * consumer reads.
 *
 * KNOWN DRIFT (filed, NOT fixed here): the two builder pages' local
 * interfaces still name the LEGACY `builders`-table columns `name`, `phone`,
 * `email`, `obr_business_number`, `wsib_status`, `enriched_at`. Those columns
 * do not exist on `entities` (migration 056 dropped the old table), so those
 * fields are ALREADY `undefined` at runtime today under `SELECT *` — this
 * projection does not change what renders. Mapping them to
 * `legal_name`/`primary_phone`/`primary_email`/`is_wsib_registered`/
 * `last_enriched_at` is a page change and rides its own WF3.
 */
export const ENTITY_PUBLIC_COLS = cols(
  'id',
  'legal_name',
  'trade_name',
  'name_normalized',
  'entity_type',
  'website',
  'google_place_id',
  'google_rating',
  'google_review_count',
  'is_wsib_registered',
  'permit_count',
  'first_seen_at',
  'last_seen_at',
  'last_enriched_at',
);

// ---------------------------------------------------------------------------
// entity_contacts
// ---------------------------------------------------------------------------
/**
 * GET /api/builders/[id] → `contacts[]`. Consumer reads exactly these five.
 * DELIBERATELY ABSENT: `entity_id` (already the request parameter),
 * `contributed_by` (identifies the contributing user) and `created_at`.
 */
export const ENTITY_CONTACT_PUBLIC_COLS = cols(
  'id',
  'contact_type',
  'contact_value',
  'source',
  'verified',
);

// ---------------------------------------------------------------------------
// coa_applications
// ---------------------------------------------------------------------------
/**
 * GET /api/coa → `applications[]`.
 *
 * ZERO product consumers today (measured: no web or mobile caller). Projected
 * rather than retired — a projected route is safe either way, and retirement
 * is a separately reviewable decision (filed).
 *
 * The set is the `CoaApplication` vocabulary the two ALREADY-explicit CoA
 * projections use — the `COA-` branch of `/api/permits/[id]` and
 * `getCoaByPermit` (`src/lib/coa/repository.ts`) — kept in RAW column names
 * so no existing response key is renamed (those two alias
 * `application_number → application_num` etc. at their own boundary).
 *
 * DELIBERATELY ABSENT: the ~129 pipeline internals `coa_applications` has
 * accreted — every `lifecycle_*`, `scope_*`, `cost_*`, `bid_value`,
 * `modeled_gfa_sqm`, `latitude`/`longitude`, `data_hash`, `lead_id`.
 */
export const COA_PUBLIC_COLS = cols(
  'id',
  'application_number',
  'address',
  'street_num',
  'street_name',
  'ward',
  'status',
  'decision',
  'decision_date',
  'hearing_date',
  'description',
  'applicant',
  'sub_type',
  'linked_permit_num',
  'linked_confidence',
  'first_seen_at',
  'last_seen_at',
);
