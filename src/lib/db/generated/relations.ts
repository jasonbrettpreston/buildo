import { relations } from "drizzle-orm/relations";
import { trades, tradeMappingRules, permitTrades, entities, entityContacts, builders, builderContacts, parcels, permitParcels, parcelBuildings, buildingFootprints, wsibRegistry, entityProjects } from "./schema";

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
	parcel: one(parcels, {
		fields: [parcelBuildings.parcelId],
		references: [parcels.id]
	}),
	buildingFootprint: one(buildingFootprints, {
		fields: [parcelBuildings.buildingId],
		references: [buildingFootprints.id]
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