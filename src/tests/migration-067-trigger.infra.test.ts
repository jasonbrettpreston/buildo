// Infra Layer Tests — Migration 067 (permits.location PostGIS column + trigger)
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '067_permits_location_geom.sql'
);

describe('Migration 067 — permits.location geom column + trigger', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('adds a geometry(Point, 4326) column on permits', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS location geometry\(Point, 4326\)/);
  });

  it('defines the permits_set_location trigger function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION permits_set_location\(\)/);
    expect(sql).toMatch(/ST_SetSRID\(ST_MakePoint\(NEW\.longitude::float8, NEW\.latitude::float8\), 4326\)/);
  });

  it('uses IS DISTINCT FROM guards so no-op updates skip recomputation', () => {
    expect(sql).toMatch(/NEW\.latitude IS DISTINCT FROM OLD\.latitude/);
    expect(sql).toMatch(/NEW\.longitude IS DISTINCT FROM OLD\.longitude/);
  });

  it('nulls location when latitude or longitude is null', () => {
    expect(sql).toMatch(/NEW\.location := NULL/);
  });

  it('attaches a BEFORE INSERT OR UPDATE OF latitude, longitude trigger', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF latitude, longitude ON permits/);
    expect(sql).toMatch(/CREATE TRIGGER trg_permits_set_location/);
  });

  it('creates a GIST index on the location column', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_permits_location_gist[\s\S]*USING GIST \(location\)/);
  });
});
