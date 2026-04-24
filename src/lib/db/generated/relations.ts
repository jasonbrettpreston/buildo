import { relations } from "drizzle-orm/relations";
import { trades, tradeMappingRules, permits, permitHistory, syncRuns, permitTrades, entities, entityContacts, builders, builderContacts, parcels, permitParcels, buildingFootprints, parcelBuildings, wsibRegistry, entityProjects, leadViews, permitPhaseTransitions, trackedProjects, permitProducts, productGroups, tradeForecasts, costEstimates, neighbourhoods } from "./schema";

export const tradeMappingRulesRelations = relations(tradeMappingRules, ({one}) => ({
	trade: one(trades, {
		fields: [tradeMappingRules.tradeId],
		references: [trades.id]
	}),
}));

export const tradesRelations = relations(trades, ({many}) => ({
	tradeMappingRules: many(tradeMappingRules),
	permitTrades: many(permitTrades),
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
	leadViews: many(leadViews),
	permitPhaseTransitions: many(permitPhaseTransitions),
	trackedProjects: many(trackedProjects),
	permitProducts: many(permitProducts),
	tradeForecasts: many(tradeForecasts),
	costEstimates: many(costEstimates),
	neighbourhood: one(neighbourhoods, {
		fields: [permits.neighbourhoodId],
		references: [neighbourhoods.id]
	}),
}));

export const syncRunsRelations = relations(syncRuns, ({many}) => ({
	permitHistories: many(permitHistory),
}));

export const permitTradesRelations = relations(permitTrades, ({one}) => ({
	trade: one(trades, {
		fields: [permitTrades.tradeId],
		references: [trades.id]
	}),
}));

export const entityContactsRelations = relations(entityContacts, ({one}) => ({
	entity: one(entities, {
		fields: [entityContacts.entityId],
		references: [entities.id]
	}),
}));

export const entitiesRelations = relations(entities, ({many}) => ({
	entityContacts: many(entityContacts),
	wsibRegistries: many(wsibRegistry),
	entityProjects: many(entityProjects),
	leadViews: many(leadViews),
}));

export const builderContactsRelations = relations(builderContacts, ({one}) => ({
	builder: one(builders, {
		fields: [builderContacts.builderId],
		references: [builders.id]
	}),
}));

export const buildersRelations = relations(builders, ({many}) => ({
	builderContacts: many(builderContacts),
}));

export const permitParcelsRelations = relations(permitParcels, ({one}) => ({
	parcel: one(parcels, {
		fields: [permitParcels.parcelId],
		references: [parcels.id]
	}),
}));

export const parcelsRelations = relations(parcels, ({many}) => ({
	permitParcels: many(permitParcels),
	parcelBuildings: many(parcelBuildings),
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

export const entityProjectsRelations = relations(entityProjects, ({one}) => ({
	entity: one(entities, {
		fields: [entityProjects.entityId],
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

export const permitPhaseTransitionsRelations = relations(permitPhaseTransitions, ({one}) => ({
	permit: one(permits, {
		fields: [permitPhaseTransitions.permitNum],
		references: [permits.permitNum]
	}),
}));

export const trackedProjectsRelations = relations(trackedProjects, ({one}) => ({
	permit: one(permits, {
		fields: [trackedProjects.permitNum],
		references: [permits.permitNum]
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

export const productGroupsRelations = relations(productGroups, ({many}) => ({
	permitProducts: many(permitProducts),
}));

export const tradeForecastsRelations = relations(tradeForecasts, ({one}) => ({
	permit: one(permits, {
		fields: [tradeForecasts.permitNum],
		references: [permits.permitNum]
	}),
}));

export const costEstimatesRelations = relations(costEstimates, ({one}) => ({
	permit: one(permits, {
		fields: [costEstimates.permitNum],
		references: [permits.permitNum]
	}),
}));

export const neighbourhoodsRelations = relations(neighbourhoods, ({many}) => ({
	permits: many(permits),
}));