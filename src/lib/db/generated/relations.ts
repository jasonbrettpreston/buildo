import { relations } from "drizzle-orm/relations";
import { usersInAuth, adminBackupCodes, trackedProjects, trades, tradeMappingRules, permits, permitParcels, parcels, productGroups, leadProducts, neighbourhoods, neighbourhoodStoreyNorms, costEstimates, bylawResolutionLots, permitTrades, neighbourhoodBuildNorms, adminAuditLog, entities, wsibRegistry, userProfiles, profiles, notifications, archetypeCostRates, parcelCostLines, adminWatchlist, notificationDispatches, permitHistory, syncRuns, entityProjects, leadViews, deviceTokens, subscribeNonces, entityContacts, buildingFootprints, parcelBuildings, leadTrades, permitPhaseTransitions, addressPoints, parcelAddressPoints, tradeProducts, suppliers, supplierTrades, supplierProducts, universalStreamCatalog, universalStreamTradeSignals, leadViewEvents, leadParcels, permitProducts, entitlements, parcelAbutments } from "./schema";

export const adminBackupCodesRelations = relations(adminBackupCodes, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [adminBackupCodes.userId],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	adminBackupCodes: many(adminBackupCodes),
	trackedProjects: many(trackedProjects),
	adminAuditLogs: many(adminAuditLog),
	userProfiles: many(userProfiles),
	profiles: many(profiles),
	notifications: many(notifications),
	adminWatchlists: many(adminWatchlist),
	notificationDispatches: many(notificationDispatches),
	leadViews: many(leadViews),
	deviceTokens: many(deviceTokens),
	subscribeNonces: many(subscribeNonces),
	leadViewEvents: many(leadViewEvents),
	entitlements: many(entitlements),
}));

export const trackedProjectsRelations = relations(trackedProjects, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [trackedProjects.userId],
		references: [usersInAuth.id]
	}),
}));

export const tradeMappingRulesRelations = relations(tradeMappingRules, ({one}) => ({
	trade: one(trades, {
		fields: [tradeMappingRules.tradeId],
		references: [trades.id]
	}),
}));

export const tradesRelations = relations(trades, ({many}) => ({
	tradeMappingRules: many(tradeMappingRules),
	permitTrades: many(permitTrades),
	leadTrades: many(leadTrades),
	tradeProducts: many(tradeProducts),
	supplierTrades: many(supplierTrades),
	universalStreamTradeSignals: many(universalStreamTradeSignals),
}));

export const permitParcelsRelations = relations(permitParcels, ({one}) => ({
	permit: one(permits, {
		fields: [permitParcels.permitNum],
		references: [permits.permitNum]
	}),
	parcel: one(parcels, {
		fields: [permitParcels.parcelId],
		references: [parcels.id]
	}),
}));

export const permitsRelations = relations(permits, ({one, many}) => ({
	permitParcels: many(permitParcels),
	costEstimates: many(costEstimates),
	permitTrades: many(permitTrades),
	permitHistories: many(permitHistory),
	entityProjects: many(entityProjects),
	leadViews: many(leadViews),
	permitPhaseTransitions: many(permitPhaseTransitions),
	permitProducts: many(permitProducts),
	neighbourhood: one(neighbourhoods, {
		fields: [permits.neighbourhoodId],
		references: [neighbourhoods.id]
	}),
}));

export const parcelsRelations = relations(parcels, ({many}) => ({
	permitParcels: many(permitParcels),
	bylawResolutionLots: many(bylawResolutionLots),
	parcelBuildings: many(parcelBuildings),
	parcelAddressPoints: many(parcelAddressPoints),
	leadParcels: many(leadParcels),
	parcelAbutments_neighbourId: many(parcelAbutments, {
		relationName: "parcelAbutments_neighbourId_parcels_id"
	}),
	parcelAbutments_parcelId: many(parcelAbutments, {
		relationName: "parcelAbutments_parcelId_parcels_id"
	}),
}));

export const leadProductsRelations = relations(leadProducts, ({one}) => ({
	productGroup: one(productGroups, {
		fields: [leadProducts.productId],
		references: [productGroups.id]
	}),
}));

export const productGroupsRelations = relations(productGroups, ({many}) => ({
	leadProducts: many(leadProducts),
	tradeProducts: many(tradeProducts),
	supplierProducts: many(supplierProducts),
	permitProducts: many(permitProducts),
}));

export const neighbourhoodStoreyNormsRelations = relations(neighbourhoodStoreyNorms, ({one}) => ({
	neighbourhood: one(neighbourhoods, {
		fields: [neighbourhoodStoreyNorms.neighbourhoodId],
		references: [neighbourhoods.id]
	}),
}));

export const neighbourhoodsRelations = relations(neighbourhoods, ({many}) => ({
	neighbourhoodStoreyNorms: many(neighbourhoodStoreyNorms),
	neighbourhoodBuildNorms: many(neighbourhoodBuildNorms),
	permits: many(permits),
}));

export const costEstimatesRelations = relations(costEstimates, ({one}) => ({
	permit: one(permits, {
		fields: [costEstimates.permitNum],
		references: [permits.permitNum]
	}),
}));

export const bylawResolutionLotsRelations = relations(bylawResolutionLots, ({one}) => ({
	parcel: one(parcels, {
		fields: [bylawResolutionLots.parcelId],
		references: [parcels.id]
	}),
}));

export const permitTradesRelations = relations(permitTrades, ({one}) => ({
	permit: one(permits, {
		fields: [permitTrades.permitNum],
		references: [permits.permitNum]
	}),
	trade: one(trades, {
		fields: [permitTrades.tradeId],
		references: [trades.id]
	}),
}));

export const neighbourhoodBuildNormsRelations = relations(neighbourhoodBuildNorms, ({one}) => ({
	neighbourhood: one(neighbourhoods, {
		fields: [neighbourhoodBuildNorms.neighbourhoodId],
		references: [neighbourhoods.id]
	}),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [adminAuditLog.adminUid],
		references: [usersInAuth.id]
	}),
}));

export const wsibRegistryRelations = relations(wsibRegistry, ({one}) => ({
	entity: one(entities, {
		fields: [wsibRegistry.linkedEntityId],
		references: [entities.id]
	}),
}));

export const entitiesRelations = relations(entities, ({many}) => ({
	wsibRegistries: many(wsibRegistry),
	entityProjects: many(entityProjects),
	leadViews: many(leadViews),
	entityContacts: many(entityContacts),
}));

export const userProfilesRelations = relations(userProfiles, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userProfiles.userId],
		references: [usersInAuth.id]
	}),
	subscribeNonces: many(subscribeNonces),
	leadViewEvents: many(leadViewEvents),
}));

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [notifications.userId],
		references: [usersInAuth.id]
	}),
}));

export const parcelCostLinesRelations = relations(parcelCostLines, ({one}) => ({
	archetypeCostRate: one(archetypeCostRates, {
		fields: [parcelCostLines.archetype],
		references: [archetypeCostRates.archetype]
	}),
}));

export const archetypeCostRatesRelations = relations(archetypeCostRates, ({many}) => ({
	parcelCostLines: many(parcelCostLines),
}));

export const adminWatchlistRelations = relations(adminWatchlist, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [adminWatchlist.adminUid],
		references: [usersInAuth.id]
	}),
}));

export const notificationDispatchesRelations = relations(notificationDispatches, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [notificationDispatches.userId],
		references: [usersInAuth.id]
	}),
}));

export const permitHistoryRelations = relations(permitHistory, ({one}) => ({
	permit: one(permits, {
		fields: [permitHistory.permitNum],
		references: [permits.permitNum]
	}),
	syncRun: one(syncRuns, {
		fields: [permitHistory.syncRunId],
		references: [syncRuns.id]
	}),
}));

export const syncRunsRelations = relations(syncRuns, ({many}) => ({
	permitHistories: many(permitHistory),
}));

export const entityProjectsRelations = relations(entityProjects, ({one}) => ({
	entity: one(entities, {
		fields: [entityProjects.entityId],
		references: [entities.id]
	}),
	permit: one(permits, {
		fields: [entityProjects.permitNum],
		references: [permits.permitNum]
	}),
}));

export const leadViewsRelations = relations(leadViews, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [leadViews.userId],
		references: [usersInAuth.id]
	}),
	entity: one(entities, {
		fields: [leadViews.entityId],
		references: [entities.id]
	}),
	permit: one(permits, {
		fields: [leadViews.permitNum],
		references: [permits.permitNum]
	}),
}));

export const deviceTokensRelations = relations(deviceTokens, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [deviceTokens.userId],
		references: [usersInAuth.id]
	}),
}));

export const subscribeNoncesRelations = relations(subscribeNonces, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [subscribeNonces.userId],
		references: [usersInAuth.id]
	}),
	userProfile: one(userProfiles, {
		fields: [subscribeNonces.userId],
		references: [userProfiles.userId]
	}),
}));

export const entityContactsRelations = relations(entityContacts, ({one}) => ({
	entity: one(entities, {
		fields: [entityContacts.entityId],
		references: [entities.id]
	}),
}));

export const parcelBuildingsRelations = relations(parcelBuildings, ({one}) => ({
	buildingFootprint: one(buildingFootprints, {
		fields: [parcelBuildings.buildingId],
		references: [buildingFootprints.id]
	}),
	parcel: one(parcels, {
		fields: [parcelBuildings.parcelId],
		references: [parcels.id]
	}),
}));

export const buildingFootprintsRelations = relations(buildingFootprints, ({many}) => ({
	parcelBuildings: many(parcelBuildings),
}));

export const leadTradesRelations = relations(leadTrades, ({one}) => ({
	trade: one(trades, {
		fields: [leadTrades.tradeId],
		references: [trades.id]
	}),
}));

export const permitPhaseTransitionsRelations = relations(permitPhaseTransitions, ({one}) => ({
	permit: one(permits, {
		fields: [permitPhaseTransitions.permitNum],
		references: [permits.permitNum]
	}),
}));

export const parcelAddressPointsRelations = relations(parcelAddressPoints, ({one}) => ({
	addressPoint: one(addressPoints, {
		fields: [parcelAddressPoints.addressPointId],
		references: [addressPoints.addressPointId]
	}),
	parcel: one(parcels, {
		fields: [parcelAddressPoints.parcelId],
		references: [parcels.id]
	}),
}));

export const addressPointsRelations = relations(addressPoints, ({many}) => ({
	parcelAddressPoints: many(parcelAddressPoints),
}));

export const tradeProductsRelations = relations(tradeProducts, ({one}) => ({
	productGroup: one(productGroups, {
		fields: [tradeProducts.productId],
		references: [productGroups.id]
	}),
	trade: one(trades, {
		fields: [tradeProducts.tradeId],
		references: [trades.id]
	}),
}));

export const supplierTradesRelations = relations(supplierTrades, ({one}) => ({
	supplier: one(suppliers, {
		fields: [supplierTrades.supplierId],
		references: [suppliers.id]
	}),
	trade: one(trades, {
		fields: [supplierTrades.tradeId],
		references: [trades.id]
	}),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	supplierTrades: many(supplierTrades),
	supplierProducts: many(supplierProducts),
}));

export const supplierProductsRelations = relations(supplierProducts, ({one}) => ({
	productGroup: one(productGroups, {
		fields: [supplierProducts.productId],
		references: [productGroups.id]
	}),
	supplier: one(suppliers, {
		fields: [supplierProducts.supplierId],
		references: [suppliers.id]
	}),
}));

export const universalStreamTradeSignalsRelations = relations(universalStreamTradeSignals, ({one}) => ({
	universalStreamCatalog: one(universalStreamCatalog, {
		fields: [universalStreamTradeSignals.seq],
		references: [universalStreamCatalog.seq]
	}),
	trade: one(trades, {
		fields: [universalStreamTradeSignals.tradeSlug],
		references: [trades.slug]
	}),
}));

export const universalStreamCatalogRelations = relations(universalStreamCatalog, ({many}) => ({
	universalStreamTradeSignals: many(universalStreamTradeSignals),
}));

export const leadViewEventsRelations = relations(leadViewEvents, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [leadViewEvents.userId],
		references: [usersInAuth.id]
	}),
	userProfile: one(userProfiles, {
		fields: [leadViewEvents.userId],
		references: [userProfiles.userId]
	}),
}));

export const leadParcelsRelations = relations(leadParcels, ({one}) => ({
	parcel: one(parcels, {
		fields: [leadParcels.parcelId],
		references: [parcels.id]
	}),
}));

export const permitProductsRelations = relations(permitProducts, ({one}) => ({
	permit: one(permits, {
		fields: [permitProducts.permitNum],
		references: [permits.permitNum]
	}),
	productGroup: one(productGroups, {
		fields: [permitProducts.productId],
		references: [productGroups.id]
	}),
}));

export const entitlementsRelations = relations(entitlements, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [entitlements.userId],
		references: [usersInAuth.id]
	}),
}));

export const parcelAbutmentsRelations = relations(parcelAbutments, ({one}) => ({
	parcel_neighbourId: one(parcels, {
		fields: [parcelAbutments.neighbourId],
		references: [parcels.id],
		relationName: "parcelAbutments_neighbourId_parcels_id"
	}),
	parcel_parcelId: one(parcels, {
		fields: [parcelAbutments.parcelId],
		references: [parcels.id],
		relationName: "parcelAbutments_parcelId_parcels_id"
	}),
}));