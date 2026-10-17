// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BG / R-BJ (#44 witness), 122 §6.6.1(a)
//
// #44 diagnosis 2026-10-17 (.cursor/v3-w44-diagnosis-2026-10-17.md), McDonald's Airtight V3: three resolver
// defects that made real reads invisible (declared == observed at column level, never weakened):
//   G9  a column used only in ORDER BY / DISTINCT ON / WINDOW was never recorded;
//   G10 a SubLink inside an UPDATE … FROM (subselect) was re-resolved against the UPDATE's scope, where the
//       subselect's own aliases are not bound (link_neighbourhoods update_sql; enrich_parcels comps LATERAL);
//   G11 a composite-returning function in FROM (`ST_Dump(a.geom) d`) did not bind its own output columns.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

type Resolved = { reads: Record<string, string[]>; writes: Record<string, string[]>; error: string | null };
type Resolver = { init: () => Promise<void>; resolveStatement: (sql: string, catalog: Record<string, string[]>) => Resolved };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require(path.join(process.cwd(), 'scripts/lib/sql-witness/resolve.cjs')) as Resolver;
const CAT = (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/reports/witness/_catalog.json'), 'utf8')) as {
  tables: Record<string, string[]>;
}).tables;

describe('sql-witness resolver — #44 G9/G10/G11 (McDonald\'s Airtight V3)', () => {
  beforeAll(async () => {
    await R.init();
  });

  it('G9 an ORDER-BY-only column is a read', () => {
    const r = R.resolveStatement('SELECT hp.id FROM heritage_properties hp ORDER BY hp.address_text', CAT);
    expect(r.error).toBeNull();
    expect(r.reads.heritage_properties).toEqual(['address_text', 'id']);
  });

  it('G9 control: ORDER BY an output alias is not a catalog read', () => {
    const r = R.resolveStatement('SELECT count(*) AS n FROM heritage_properties hp ORDER BY n', CAT);
    expect(r.error).toBeNull();
    expect(r.reads.heritage_properties ?? []).not.toContain('n');
  });

  it('G9 a DISTINCT ON column is a read', () => {
    const r = R.resolveStatement('SELECT DISTINCT ON (hp.address_text) hp.id FROM heritage_properties hp', CAT);
    expect(r.reads.heritage_properties).toEqual(['address_text', 'id']);
  });

  it('G10 a correlated SubLink inside UPDATE … FROM (subselect) sees the subselect scope', () => {
    const r = R.resolveStatement(
      'UPDATE permits p SET neighbourhood_id = m.nid FROM (SELECT (SELECT n.id FROM neighbourhoods n WHERE n.id = q.revision_num) AS nid, q.permit_num FROM permits q) m WHERE p.permit_num = m.permit_num',
      CAT,
    );
    expect(r.error).toBeNull();
    expect(r.reads.permits).toEqual(['permit_num', 'revision_num']);
    expect(r.writes.permits).toEqual(['neighbourhood_id']);
  });

  it('G10 a LATERAL sibling reference inside UPDATE … FROM (subselect) resolves (enrich_parcels comps form)', () => {
    const r = R.resolveStatement(
      'UPDATE parcels p SET comp_count = agg.cnt FROM (SELECT s.id, count(*)::int AS cnt FROM (SELECT sp.id, sp.zoning_class AS subj_family FROM parcels sp) s CROSS JOIN LATERAL (SELECT c.id FROM parcels c WHERE c.zoning_class = s.subj_family) m GROUP BY s.id) agg WHERE p.id = agg.id',
      CAT,
    );
    expect(r.error).toBeNull();
    expect(r.reads.parcels).toEqual(['id', 'zoning_class']);
  });

  it('G10 control: an unknown qualifier inside the subselect still fails', () => {
    const r = R.resolveStatement(
      'UPDATE permits p SET neighbourhood_id = m.nid FROM (SELECT (SELECT n.id FROM neighbourhoods n WHERE n.id = zz.revision_num) AS nid, q.permit_num FROM permits q) m WHERE p.permit_num = m.permit_num',
      CAT,
    );
    expect(r.error).toBe('FAIL:INPUT:column:revision_num');
  });

  it('G11 a composite-returning function alias binds its own output columns, closed', () => {
    const ok = R.resolveStatement('SELECT ST_Area(d.geom) FROM bylaw_map_areas a CROSS JOIN LATERAL ST_Dump(a.geom) d', CAT);
    expect(ok.error).toBeNull();
    expect(ok.reads.bylaw_map_areas).toEqual(['geom']);
    expect(R.resolveStatement('SELECT d.nope FROM bylaw_map_areas a CROSS JOIN LATERAL ST_Dump(a.geom) d', CAT).error).toBe(
      'FAIL:INPUT:column:nope',
    );
  });
});
