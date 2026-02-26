export interface BuildingFootprint {
  id: number;
  source_id: string | null;
  geometry: Record<string, unknown>;
  footprint_area_sqm: number | null;
  footprint_area_sqft: number | null;
  max_height_m: number | null;
  min_height_m: number | null;
  elev_z: number | null;
  estimated_stories: number | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  created_at: Date;
}

export interface ParcelBuilding {
  id: number;
  parcel_id: number;
  building_id: number;
  is_primary: boolean;
  structure_type: StructureType;
  match_type: string;
  confidence: number;
  linked_at: Date;
}

export type StructureType = 'primary' | 'garage' | 'shed' | 'other';

export interface BuildingMassingInfo {
  primary: {
    footprint_area_sqft: number | null;
    estimated_stories: number | null;
    max_height_m: number | null;
    stories_source: string | null;
  } | null;
  accessory: {
    structure_type: StructureType;
    footprint_area_sqft: number | null;
  }[];
  building_coverage_pct: number | null;
}
