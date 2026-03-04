// ---------------------------------------------------------------------------
// Auto-generated table types via Drizzle InferSelectModel.
// Source of truth: src/lib/db/generated/schema.ts (from `npm run db:generate`)
//
// These types represent raw DB row shapes. Application-layer types (in
// src/lib/*/types.ts) may differ — e.g. numeric columns are string here
// but number in app types after parseFloat(). Use these for DB-layer code;
// use app types for business logic.
//
// Regenerate after adding a migration:
//   npm run migrate && npm run db:generate
// ---------------------------------------------------------------------------
import type { InferSelectModel } from 'drizzle-orm';
import {
  permits,
  permitHistory,
  syncRuns,
  trades,
  tradeMappingRules,
  permitTrades,
  builders,
  builderContacts,
  coaApplications,
  notifications,
  parcels,
  permitParcels,
  neighbourhoods,
  dataQualitySnapshots,
  addressPoints,
  pipelineRuns,
  buildingFootprints,
  parcelBuildings,
} from './generated/schema';

// -- Core --
export type PermitRow = InferSelectModel<typeof permits>;
export type PermitHistoryRow = InferSelectModel<typeof permitHistory>;
export type SyncRunRow = InferSelectModel<typeof syncRuns>;

// -- Classification --
export type TradeRow = InferSelectModel<typeof trades>;
export type TradeMappingRuleRow = InferSelectModel<typeof tradeMappingRules>;
export type PermitTradeRow = InferSelectModel<typeof permitTrades>;

// -- Builders --
export type BuilderRow = InferSelectModel<typeof builders>;
export type BuilderContactRow = InferSelectModel<typeof builderContacts>;

// -- CoA --
export type CoaApplicationRow = InferSelectModel<typeof coaApplications>;

// -- Notifications --
export type NotificationRow = InferSelectModel<typeof notifications>;

// -- Parcels & Spatial --
export type ParcelRow = InferSelectModel<typeof parcels>;
export type PermitParcelRow = InferSelectModel<typeof permitParcels>;
export type AddressPointRow = InferSelectModel<typeof addressPoints>;

// -- Neighbourhoods --
export type NeighbourhoodRow = InferSelectModel<typeof neighbourhoods>;

// -- Quality & Admin --
export type DataQualitySnapshotRow = InferSelectModel<typeof dataQualitySnapshots>;
export type PipelineRunRow = InferSelectModel<typeof pipelineRuns>;

// -- Massing --
export type BuildingFootprintRow = InferSelectModel<typeof buildingFootprints>;
export type ParcelBuildingRow = InferSelectModel<typeof parcelBuildings>;
