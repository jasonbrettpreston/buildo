import type {
  Permit,
  RawPermitRecord,
  Trade,
  TradeMatch,
  TradeMappingRule,
  Builder,
  SyncRun,
  PermitChange,
} from '@/lib/permits/types';
import type { Parcel } from '@/lib/parcels/types';
import type { Neighbourhood } from '@/lib/neighbourhoods/types';
import type { DataQualitySnapshot } from '@/lib/quality/types';
import type { BuildingFootprint, ParcelBuilding } from '@/lib/massing/types';

export function createMockRawPermit(
  overrides: Partial<RawPermitRecord> = {}
): RawPermitRecord {
  return {
    PERMIT_NUM: '24 101234',
    REVISION_NUM: '01',
    PERMIT_TYPE: 'Building',
    STRUCTURE_TYPE: 'Small Residential',
    WORK: 'Interior Alterations',
    STREET_NUM: '123',
    STREET_NAME: 'QUEEN',
    STREET_TYPE: 'ST',
    STREET_DIRECTION: 'W',
    CITY: 'TORONTO',
    POSTAL: 'M5V 2A1',
    GEO_ID: '1234567',
    BUILDING_TYPE: 'Row House',
    CATEGORY: 'Permit',
    APPLICATION_DATE: '2024-01-15T00:00:00.000',
    ISSUED_DATE: '2024-03-01T00:00:00.000',
    COMPLETED_DATE: '',
    STATUS: 'Issued',
    DESCRIPTION: 'Interior renovation including new plumbing and electrical work',
    EST_CONST_COST: '150000',
    BUILDER_NAME: 'ACME CONSTRUCTION INC',
    OWNER: 'JOHN DOE',
    DWELLING_UNITS_CREATED: '0',
    DWELLING_UNITS_LOST: '0',
    WARD: '10',
    COUNCIL_DISTRICT: 'Toronto Centre',
    CURRENT_USE: 'Residential',
    PROPOSED_USE: 'Residential',
    HOUSING_UNITS: '1',
    STOREYS: '2',
    ...overrides,
  };
}

export function createMockPermit(overrides: Partial<Permit> = {}): Permit {
  return {
    permit_num: '24 101234',
    revision_num: '01',
    permit_type: 'Building',
    structure_type: 'Small Residential',
    work: 'Interior Alterations',
    street_num: '123',
    street_name: 'QUEEN',
    street_type: 'ST',
    street_direction: 'W',
    city: 'TORONTO',
    postal: 'M5V 2A1',
    geo_id: '1234567',
    building_type: 'Row House',
    category: 'Permit',
    application_date: new Date('2024-01-15'),
    issued_date: new Date('2024-03-01'),
    completed_date: null,
    status: 'Issued',
    description:
      'Interior renovation including new plumbing and electrical work',
    est_const_cost: 150000,
    builder_name: 'ACME CONSTRUCTION INC',
    owner: 'JOHN DOE',
    dwelling_units_created: 0,
    dwelling_units_lost: 0,
    ward: '10',
    council_district: 'Toronto Centre',
    current_use: 'Residential',
    proposed_use: 'Residential',
    housing_units: 1,
    storeys: 2,
    latitude: 43.6532,
    longitude: -79.3832,
    geocoded_at: null,
    data_hash: 'abc123def456',
    first_seen_at: new Date('2024-03-01'),
    last_seen_at: new Date('2024-03-01'),
    neighbourhood_id: null,
    raw_json: null,
    ...overrides,
  };
}

export function createMockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    slug: 'plumbing',
    name: 'Plumbing',
    icon: 'droplet',
    color: '#2196F3',
    sort_order: 8,
    ...overrides,
  };
}

export function createMockTradeMatch(
  overrides: Partial<TradeMatch> = {}
): TradeMatch {
  return {
    permit_num: '24 101234',
    revision_num: '01',
    trade_id: 1,
    trade_slug: 'plumbing',
    trade_name: 'Plumbing',
    tier: 1,
    confidence: 0.95,
    is_active: true,
    phase: 'structural',
    lead_score: 75,
    ...overrides,
  };
}

export function createMockTradeMappingRule(
  overrides: Partial<TradeMappingRule> = {}
): TradeMappingRule {
  return {
    id: 1,
    trade_id: 8,
    tier: 1,
    match_field: 'permit_type',
    match_pattern: 'Plumbing',
    confidence: 0.95,
    phase_start: 3,
    phase_end: 9,
    is_active: true,
    ...overrides,
  };
}

export function createMockBuilder(overrides: Partial<Builder> = {}): Builder {
  return {
    id: 1,
    name: 'ACME CONSTRUCTION INC',
    name_normalized: 'ACME CONSTRUCTION',
    phone: '416-555-1234',
    email: 'info@acmeconstruction.ca',
    website: 'https://acmeconstruction.ca',
    google_place_id: null,
    google_rating: 4.2,
    google_review_count: 15,
    obr_business_number: null,
    wsib_status: null,
    permit_count: 12,
    first_seen_at: new Date('2023-01-01'),
    last_seen_at: new Date('2024-03-01'),
    enriched_at: null,
    ...overrides,
  };
}

export function createMockSyncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 1,
    started_at: new Date(),
    completed_at: null,
    status: 'running',
    records_total: 0,
    records_new: 0,
    records_updated: 0,
    records_unchanged: 0,
    records_errors: 0,
    error_message: null,
    snapshot_path: null,
    duration_ms: null,
    ...overrides,
  };
}

export function createMockPermitChange(
  overrides: Partial<PermitChange> = {}
): PermitChange {
  return {
    permit_num: '24 101234',
    revision_num: '01',
    field_name: 'status',
    old_value: 'Application Filed',
    new_value: 'Issued',
    ...overrides,
  };
}

export function createMockParcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    id: 1,
    parcel_id: '5090819',
    feature_type: 'COMMON',
    address_number: '5000',
    linear_name_full: 'Jane St',
    addr_num_normalized: '5000',
    street_name_normalized: 'JANE',
    street_type_normalized: 'ST',
    stated_area_raw: '500.00 sq.m',
    lot_size_sqm: 500.0,
    lot_size_sqft: 5381.96,
    frontage_m: 15.0,
    frontage_ft: 49.21,
    depth_m: 33.33,
    depth_ft: 109.35,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.5, 43.75],
        [-79.4999, 43.75],
        [-79.4999, 43.7503],
        [-79.5, 43.7503],
        [-79.5, 43.75],
      ]],
    },
    is_irregular: false,
    date_effective: new Date('2020-01-01'),
    date_expiry: new Date('3000-01-01'),
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockNeighbourhood(overrides: Partial<Neighbourhood> = {}): Neighbourhood {
  return {
    id: 1,
    neighbourhood_id: 129,
    name: 'Agincourt North',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.28, 43.80],
        [-79.26, 43.80],
        [-79.26, 43.82],
        [-79.28, 43.82],
        [-79.28, 43.80],
      ]],
    },
    avg_household_income: 95000,
    median_household_income: 78000,
    avg_individual_income: 42000,
    low_income_pct: 14.5,
    tenure_owner_pct: 72.3,
    tenure_renter_pct: 27.7,
    period_of_construction: '1961-1980',
    couples_pct: 48.2,
    lone_parent_pct: 18.5,
    married_pct: 52.1,
    university_degree_pct: 35.8,
    immigrant_pct: 68.2,
    visible_minority_pct: 78.4,
    english_knowledge_pct: 88.1,
    top_mother_tongue: 'Mandarin',
    census_year: 2021,
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockDataQualitySnapshot(
  overrides: Partial<DataQualitySnapshot> = {}
): DataQualitySnapshot {
  return {
    id: 1,
    snapshot_date: '2024-03-01',
    total_permits: 237000,
    active_permits: 180000,
    permits_with_trades: 156600,
    trade_matches_total: 204000,
    trade_avg_confidence: 0.82,
    trade_tier1_count: 91800,
    trade_tier2_count: 77520,
    trade_tier3_count: 34680,
    permits_with_builder: 165000,
    builders_total: 12000,
    builders_enriched: 8400,
    builders_with_phone: 6000,
    builders_with_email: 4800,
    builders_with_website: 3600,
    builders_with_google: 7200,
    builders_with_wsib: 2400,
    permits_with_parcel: 144000,
    parcel_exact_matches: 126000,
    parcel_name_matches: 18000,
    parcel_spatial_matches: 0,
    parcel_avg_confidence: 0.91,
    permits_with_neighbourhood: 162000,
    permits_geocoded: 171000,
    coa_total: 5000,
    coa_linked: 3500,
    coa_avg_confidence: 0.72,
    coa_high_confidence: 2800,
    coa_low_confidence: 350,
    permits_with_scope: 225000,
    scope_project_type_breakdown: { new_build: 37000, renovation: 55000, mechanical: 113000, addition: 15000, demolition: 2700, repair: 3000, other: 12000 },
    permits_updated_24h: 1200,
    permits_updated_7d: 8400,
    permits_updated_30d: 35000,
    last_sync_at: '2024-03-01T06:30:00Z',
    last_sync_status: 'completed',
    building_footprints_total: 820000,
    parcels_with_buildings: 540000,
    created_at: '2024-03-01T06:35:00Z',
    ...overrides,
  };
}

export function createMockBuildingFootprint(
  overrides: Partial<BuildingFootprint> = {}
): BuildingFootprint {
  return {
    id: 1,
    source_id: 'BLD-001',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.5, 43.75],
        [-79.4999, 43.75],
        [-79.4999, 43.7501],
        [-79.5, 43.7501],
        [-79.5, 43.75],
      ]],
    },
    footprint_area_sqm: 120.5,
    footprint_area_sqft: 1297.0,
    max_height_m: 9.5,
    min_height_m: 0.0,
    elev_z: 175.0,
    estimated_stories: 3,
    centroid_lat: 43.75005,
    centroid_lng: -79.49995,
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockParcelBuilding(
  overrides: Partial<ParcelBuilding> = {}
): ParcelBuilding {
  return {
    id: 1,
    parcel_id: 1,
    building_id: 1,
    is_primary: true,
    structure_type: 'primary',
    linked_at: new Date('2024-01-01'),
    ...overrides,
  };
}
