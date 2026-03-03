// Admin dashboard types — extracted from admin/page.tsx for testability
// SPEC LINK: docs/specs/26_admin.md

export interface SyncRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  records_total: number;
  records_new: number;
  records_updated: number;
  records_unchanged: number;
  records_errors: number;
  error_message: string | null;
  duration_ms: number | null;
}

export interface PipelineRunInfo {
  last_run_at: string | null;
  status: string | null;
}

export interface AdminStats {
  total_permits: number;
  active_permits: number;
  total_builders: number;
  permits_with_builder: number;
  permits_with_parcel: number;
  permits_with_neighbourhood: number;
  coa_total: number;
  coa_linked: number;
  coa_upcoming: number;
  total_trades: number;
  active_rules: number;
  permits_this_week: number;
  last_sync_at: string | null;
  notifications_pending: number;
  permits_geocoded: number;
  permits_classified: number;
  builders_with_contact: number;
  address_points_total: number;
  parcels_total: number;
  building_footprints_total: number;
  parcels_with_massing: number;
  permits_with_massing: number;
  neighbourhoods_total: number;
  coa_approved: number;
  pipeline_last_run: Record<string, PipelineRunInfo>;
}

export type HealthStatus = 'green' | 'yellow' | 'red';
