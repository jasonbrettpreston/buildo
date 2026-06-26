import { relations } from "drizzle-orm/relations";
import { trades, tradeMappingRules, permits, permitHistory, syncRuns, permitTrades, neighbourhoods, neighbourhoodBuildNorms, permitParcels, parcels, buildingFootprints, parcelBuildings, entities, wsibRegistry, entityProjects, entityContacts, leadViews, costEstimates, permitPhaseTransitions, userProfiles, subscribeNonces, leadTrades, neighbourhoodStoreyNorms, productGroups, leadProducts, universalStreamCatalog, universalStreamTradeSignals, addressPoints, parcelAddressPoints, tradeProducts, supplierProducts, suppliers, leadViewEvents, leadParcels, permitProducts } from "./schema";

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
	universalStreamTradeSignals: many(universalStreamTradeSignals),
	tradeProducts: many(tradeProducts),
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

export const permitsRelations = relations(permits, ({one, many}) => ({
	permitHistories: many(permitHistory),
	permitTrades: many(permitTrades),
	permitParcels: many(permitParcels),
	entityProjects: many(entityProjects),
	leadViews: many(leadViews),
	costEstimates: many(costEstimates),
	permitPhaseTransitions: many(permitPhaseTransitions),
	permitProducts: many(permitProducts),
	neighbourhood: one(neighbourhoods, {
		fields: [permits.neighbourhoodId],
		references: [neighbourhoods.id]
	}),
}));

export const syncRunsRelations = relations(syncRuns, ({many}) => ({
	permitHistories: many(permitHistory),
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

export const neighbourhoodsRelations = relations(neighbourhoods, ({many}) => ({
	neighbourhoodBuildNorms: many(neighbourhoodBuildNorms),
	neighbourhoodStoreyNorms: many(neighbourhoodStoreyNorms),
	permits: many(permits),
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

export const parcelsRelations = relations(parcels, ({many}) => ({
	permitParcels: many(permitParcels),
	parcelBuildings: many(parcelBuildings),
	parcelAddressPoints: many(parcelAddressPoints),
	leadParcels: many(leadParcels),
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

export const wsibRegistryRelations = relations(wsibRegistry, ({one}) => ({
	entity: one(entities, {
		fields: [wsibRegistry.linkedEntityId],
		references: [entities.id]
	}),
}));

export const entitiesRelations = relations(entities, ({many}) => ({
	wsibRegistries: many(wsibRegistry),
	entityProjects: many(entityProjects),
	entityContacts: many(entityContacts),
	leadViews: many(leadViews),
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

export const entityContactsRelations = relations(entityContacts, ({one}) => ({
	entity: one(entities, {
		fields: [entityContacts.entityId],
		references: [entities.id]
	}),
}));

export const leadViewsRelations = relations(leadViews, ({one}) => ({
	entity: one(entities, {
		fields: [leadViews.entityId],
		references: [entities.id]
	}),
	permit: one(permits, {
		fields: [leadViews.permitNum],
		references: [permits.permitNum]
	}),
}));

export const costEstimatesRelations = relations(costEstimates, ({one}) => ({
	permit: one(permits, {
		fields: [costEstimates.permitNum],
		references: [permits.permitNum]
	}),
}));

export const permitPhaseTransitionsRelations = relations(permitPhaseTransitions, ({one}) => ({
	permit: one(permits, {
		fields: [permitPhaseTransitions.permitNum],
		references: [permits.permitNum]
	}),
}));

export const subscribeNoncesRelations = relations(subscribeNonces, ({one}) => ({
	userProfile: one(userProfiles, {
		fields: [subscribeNonces.userId],
		references: [userProfiles.userId]
	}),
}));

export const userProfilesRelations = relations(userProfiles, ({many}) => ({
	subscribeNonces: many(subscribeNonces),
	leadViewEvents: many(leadViewEvents),
}));

export const leadTradesRelations = relations(leadTrades, ({one}) => ({
	trade: one(trades, {
		fields: [leadTrades.tradeId],
		references: [trades.id]
	}),
}));

export const neighbourhoodStoreyNormsRelations = relations(neighbourhoodStoreyNorms, ({one}) => ({
	neighbourhood: one(neighbourhoods, {
		fields: [neighbourhoodStoreyNorms.neighbourhoodId],
		references: [neighbourhoods.id]
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

export const suppliersRelations = relations(suppliers, ({many}) => ({
	supplierProducts: many(supplierProducts),
}));

export const leadViewEventsRelations = relations(leadViewEvents, ({one}) => ({
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