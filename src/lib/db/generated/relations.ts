import { relations } from "drizzle-orm/relations";
import { entities, entityProjects, parcels, permitParcels, permits, buildingFootprints, parcelBuildings, trades, permitTrades, entityContacts, tradeMappingRules, wsibRegistry } from "./schema";

export const entityProjectsRelations = relations(entityProjects, ({one}) => ({
	entity: one(entities, {
		fields: [entityProjects.entityId],
		references: [entities.id]
	}),
}));

export const entitiesRelations = relations(entities, ({many}) => ({
	entityProjects: many(entityProjects),
	entityContacts: many(entityContacts),
	wsibRegistries: many(wsibRegistry),
}));

export const permitParcelsRelations = relations(permitParcels, ({one}) => ({
	parcel: one(parcels, {
		fields: [permitParcels.parcelId],
		references: [parcels.id]
	}),
	permit: one(permits, {
		fields: [permitParcels.permitNum],
		references: [permits.permitNum]
	}),
}));

export const parcelsRelations = relations(parcels, ({many}) => ({
	permitParcels: many(permitParcels),
	parcelBuildings: many(parcelBuildings),
}));

export const permitsRelations = relations(permits, ({many}) => ({
	permitParcels: many(permitParcels),
	permitTrades: many(permitTrades),
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

export const permitTradesRelations = relations(permitTrades, ({one}) => ({
	trade: one(trades, {
		fields: [permitTrades.tradeId],
		references: [trades.id]
	}),
	permit: one(permits, {
		fields: [permitTrades.permitNum],
		references: [permits.permitNum]
	}),
}));

export const tradesRelations = relations(trades, ({many}) => ({
	permitTrades: many(permitTrades),
	tradeMappingRules: many(tradeMappingRules),
}));

export const entityContactsRelations = relations(entityContacts, ({one}) => ({
	entity: one(entities, {
		fields: [entityContacts.entityId],
		references: [entities.id]
	}),
}));

export const tradeMappingRulesRelations = relations(tradeMappingRules, ({one}) => ({
	trade: one(trades, {
		fields: [tradeMappingRules.tradeId],
		references: [trades.id]
	}),
}));

export const wsibRegistryRelations = relations(wsibRegistry, ({one}) => ({
	entity: one(entities, {
		fields: [wsibRegistry.linkedEntityId],
		references: [entities.id]
	}),
}));