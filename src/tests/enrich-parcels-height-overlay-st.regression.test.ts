// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §3 (zoning_overlays JSONB shape: height_overlay
//            {applied, height_max_m, stories}) + DEC-1 (overlay replaces base) + the height-overlay weld fence;
//            docs/specs/01-pipeline/58_source_zoning_bylaw.md §9 (zoning_layers_loaded consumer contract);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.6 (lot vector: overlays undefined = map not held,
//            a held map with no value = map_value_absent)
//
// Regression lock (WF3 st-overlay, 2026-10-14). The ST ("storeys") value of the Height Overlay Map IS carried to
// the parcel as `zoning_overlays.height_overlay.stories`; the object is wrapped in jsonb_strip_nulls, so a parcel
// on an HT polygon with no ST keeps {applied:true, height_max_m} and simply has no `stories` key. That is what lets
// a McBylaw lot vector say "the map is held, ST is absent" (map_value_absent) instead of "ST not attached".
// Two load-bearing facts are pinned here:
//   1. the SQL emits `'stories'` inside the height_overlay object, under jsonb_strip_nulls;
//   2. the height / coverage overlays can never be dropped by the Spec 58 §9 stale-layer path (the runner only
//      stales layers that carry a membership `col`), so an absent height_overlay on an enriched parcel means the
//      parcel is off every HT polygon, never "layer skipped".
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
type Layer = { key: string; table: string; kind: string; col?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped CJS compute module
const EP: any = require(path.join(process.cwd(), 'scripts/lib/compute/enrich-parcels.js'));
const squash = (s: string): string => s.replace(/\s+/g, ' ');

describe('enrich_parcels carries the Height Overlay ST value to the parcel', () => {
  const sql = squash(EP.buildEnrichmentSql({ full: true, bboxDivisor: 78000 }));

  it("height_overlay carries 'stories' from ht_stories (paired with the chosen HT row)", () => {
    expect(sql).toContain("h.height_max_m AS bylaw_max_height_m, h.ht_stories AS bylaw_max_stories");
    expect(sql).toContain(
      "'height_overlay', CASE WHEN ha.parcel_id IS NOT NULL THEN jsonb_build_object('applied', true, 'height_max_m', ha.bylaw_max_height_m, 'stories', ha.bylaw_max_stories) END",
    );
  });

  it('the overlay object is null-stripped: no ST on the polygon → no stories key, applied/height_max_m kept', () => {
    const start = sql.indexOf('jsonb_strip_nulls(jsonb_build_object(');
    const end = sql.indexOf(') AS zoning_overlays');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(sql.slice(start, end)).toContain("'stories', ha.bylaw_max_stories");
  });

  it('height and coverage overlays are never stale-dropped (no membership col), so absent = off-map', () => {
    const layers: Layer[] = EP.OVERLAY_LAYERS;
    for (const key of ['height_overlay', 'lot_coverage_overlay']) {
      const l = layers.find((x) => x.key === key);
      expect(l, key).toBeDefined();
      expect(l!.col, key).toBeUndefined();
    }
    const runner = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(runner).toContain('.filter((l) => l.col && contract.layers[l.key] === false)');
  });
});
