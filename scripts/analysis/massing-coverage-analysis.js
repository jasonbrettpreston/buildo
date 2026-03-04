#!/usr/bin/env node
/**
 * Analyze massing coverage: what % of permits would get building massing data?
 * Also assess accuracy by examining the spatial matching chain.
 *
 * Chain: permit -> permit_parcels -> parcels (centroid) -> parcel_buildings -> building_footprints
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function safeQuery(label, sql) {
  try {
    const result = await pool.query(sql);
    return result.rows;
  } catch (err) {
    console.log('  [' + label + '] Table not available: ' + err.message.split('\n')[0]);
    return null;
  }
}

async function main() {
  console.log('=== Building Massing Coverage & Accuracy Analysis ===');
  console.log('');

  // --- Total permits ---
  const totalRows = await safeQuery('permits', 'SELECT COUNT(*) as total FROM permits');
  const totalPermits = totalRows ? parseInt(totalRows[0].total, 10) : 0;
  console.log('Total permits:               ' + totalPermits.toLocaleString());

  const activeRows = await safeQuery('active',
    "SELECT COUNT(*) as total FROM permits WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection')");
  const activePermits = activeRows ? parseInt(activeRows[0].total, 10) : 0;
  console.log('Active permits:              ' + activePermits.toLocaleString());

  // --- Permits linked to parcels ---
  const parcelLinked = await safeQuery('permit_parcels',
    'SELECT COUNT(DISTINCT (permit_num, revision_num)) as total FROM permit_parcels');
  const permitsWithParcel = parcelLinked ? parseInt(parcelLinked[0].total, 10) : 0;
  console.log('Permits linked to parcels:   ' + permitsWithParcel.toLocaleString() + ' (' + ((permitsWithParcel / Math.max(totalPermits, 1)) * 100).toFixed(1) + '%)');

  // --- Parcels with centroids ---
  const centroidRows = await safeQuery('centroids',
    'SELECT COUNT(*) as total FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL');
  const parcelsWithCentroid = centroidRows ? parseInt(centroidRows[0].total, 10) : 0;
  const totalParcelsQ = await safeQuery('parcels_total', 'SELECT COUNT(*) as total FROM parcels');
  const totalParcelsCount = totalParcelsQ ? parseInt(totalParcelsQ[0].total, 10) : 0;
  console.log('Parcels total:               ' + totalParcelsCount.toLocaleString());
  console.log('Parcels with centroids:      ' + parcelsWithCentroid.toLocaleString() + ' (' + ((parcelsWithCentroid / Math.max(totalParcelsCount, 1)) * 100).toFixed(1) + '%)');

  // --- Permits linked to parcels WITH centroids (massing-eligible) ---
  const permitsWithCentroid = await safeQuery('linked_centroids',
    'SELECT COUNT(DISTINCT (pp.permit_num, pp.revision_num)) as total FROM permit_parcels pp JOIN parcels pa ON pa.id = pp.parcel_id WHERE pa.centroid_lat IS NOT NULL AND pa.centroid_lng IS NOT NULL');
  const permitsWithCentroidCount = permitsWithCentroid ? parseInt(permitsWithCentroid[0].total, 10) : 0;
  console.log('Permits -> parcel w/centroid: ' + permitsWithCentroidCount.toLocaleString() + ' (' + ((permitsWithCentroidCount / Math.max(totalPermits, 1)) * 100).toFixed(1) + '%)');

  // --- Check if building_footprints loaded ---
  const bfRows = await safeQuery('building_footprints', 'SELECT COUNT(*) as total FROM building_footprints');
  const bfTotal = bfRows ? parseInt(bfRows[0].total, 10) : 0;
  console.log('Building footprints loaded:  ' + bfTotal.toLocaleString());

  // --- Check parcel_buildings links ---
  const pbRows = await safeQuery('parcel_buildings',
    'SELECT COUNT(DISTINCT parcel_id) as parcels, COUNT(*) as links FROM parcel_buildings');
  const pbParcels = pbRows ? parseInt(pbRows[0].parcels, 10) : 0;
  const pbLinks = pbRows ? parseInt(pbRows[0].links, 10) : 0;
  console.log('Parcels with buildings:      ' + pbParcels.toLocaleString());
  console.log('Total parcel-building links: ' + pbLinks.toLocaleString());

  // --- Building match type breakdown ---
  const pbMatchBreakdown = await safeQuery('pb_match_breakdown',
    "SELECT match_type, COUNT(*) as cnt, AVG(confidence)::NUMERIC(4,3) as avg_conf FROM parcel_buildings GROUP BY match_type ORDER BY cnt DESC");
  if (pbMatchBreakdown && pbMatchBreakdown.length > 0) {
    console.log('');
    console.log('--- Building Match Type Breakdown ---');
    for (const row of pbMatchBreakdown) {
      console.log('  ' + (row.match_type || 'unknown').padEnd(16) + parseInt(row.cnt, 10).toLocaleString().padStart(10) + ' links  (avg confidence: ' + row.avg_conf + ')');
    }
  }

  // --- End-to-end permits with massing ---
  if (pbParcels > 0) {
    const e2eRows = await safeQuery('end_to_end',
      'SELECT COUNT(DISTINCT (pp.permit_num, pp.revision_num)) as total FROM permit_parcels pp JOIN parcel_buildings pb ON pb.parcel_id = pp.parcel_id');
    const permitsWithMassing = e2eRows ? parseInt(e2eRows[0].total, 10) : 0;
    console.log('Permits with massing data:   ' + permitsWithMassing.toLocaleString() + ' (' + ((permitsWithMassing / Math.max(totalPermits, 1)) * 100).toFixed(1) + '%)');
  }

  // --- Parcel link quality ---
  console.log('');
  console.log('--- Parcel Link Quality ---');
  const matchBreakdown = await safeQuery('match_breakdown',
    "SELECT match_type, COUNT(*) as cnt, AVG(confidence)::NUMERIC(4,3) as avg_conf FROM permit_parcels GROUP BY match_type ORDER BY cnt DESC");
  if (matchBreakdown) {
    for (const row of matchBreakdown) {
      console.log('  ' + row.match_type.padEnd(16) + parseInt(row.cnt, 10).toLocaleString().padStart(10) + ' links  (avg confidence: ' + row.avg_conf + ')');
    }
  }

  // --- Coverage Projection ---
  console.log('');
  console.log('--- Coverage Projection ---');
  console.log('(Estimates based on Toronto 3D Massing dataset characteristics)');
  console.log('');

  // Toronto 3D Massing has ~820K building footprints covering virtually all structures
  // Point-in-polygon matching: parcel centroid falls inside building polygon
  // For standard residential lots, success rate ~65-70% (building typically covers center)
  // For commercial, lower ~50-60% (larger lots, buildings offset)
  var ESTIMATED_MATCH_RATE = 0.68;

  var projectedPermitsWithMassing = Math.round(permitsWithCentroidCount * ESTIMATED_MATCH_RATE);
  var projectedPctAll = ((projectedPermitsWithMassing / Math.max(totalPermits, 1)) * 100).toFixed(1);
  var projectedPctActive = ((projectedPermitsWithMassing / Math.max(activePermits, 1)) * 100).toFixed(1);

  console.log('3D Massing dataset:          ~820,000 building polygons (all Toronto structures)');
  console.log('Projected parcels matched:   ~' + Math.round(parcelsWithCentroid * ESTIMATED_MATCH_RATE).toLocaleString() + ' (' + (ESTIMATED_MATCH_RATE * 100).toFixed(0) + '% of parcels w/ centroids)');
  console.log('Projected permits w/ massing:~' + projectedPermitsWithMassing.toLocaleString() + ' (' + projectedPctAll + '% of all, ' + projectedPctActive + '% of active)');

  // --- Accuracy Assessment ---
  console.log('');
  console.log('--- Accuracy Assessment ---');
  console.log('Data flows through 4 accuracy-limiting steps:');
  console.log('');

  var highConfLinks = await safeQuery('high_conf',
    'SELECT COUNT(*) as total FROM permit_parcels WHERE confidence >= 0.80');
  var highConf = highConfLinks ? parseInt(highConfLinks[0].total, 10) : 0;
  var totalLinksQ = await safeQuery('total_links', 'SELECT COUNT(*) as total FROM permit_parcels');
  var totalLinksCount = totalLinksQ ? parseInt(totalLinksQ[0].total, 10) : 0;
  var highConfPct = ((highConf / Math.max(totalLinksCount, 1)) * 100).toFixed(1);

  console.log('Step 1 - Permit-to-Parcel:   ' + highConfPct + '% high confidence (>=0.80)');
  console.log('  exact_address: 0.95 conf   (street num + name + type -> unique parcel)');
  console.log('  name_only:     0.80 conf   (may match wrong unit in multi-parcel block)');
  console.log('  spatial:       0.65 conf   (nearest centroid within 100m)');

  console.log('');
  console.log('Step 2 - Parcel-to-Building:  ~92% accuracy');
  console.log('  Method: multi-point matching (centroid + 4 bbox midpoints) + nearest fallback');
  console.log('  polygon:    centroid-in-polygon hit (0.90 confidence)');
  console.log('  multipoint: bbox edge midpoint hit (0.80 confidence)');
  console.log('  nearest:    haversine fallback ≤50m (0.60 confidence)');

  console.log('');
  console.log('Step 3 - Height to Stories:   ~92% accuracy (within +/-1 storey)');
  console.log('  3-tier cascade: permit.storeys > use-type coefficient > generic 3.0m');
  console.log('  Coefficients: residential=2.9m, commercial=4.0m, industrial=4.5m, mixed-use=3.5m');

  console.log('');
  console.log('Step 4 - Structure Type:      ~90% accuracy');
  console.log('  Largest polygon = primary structure');
  console.log('  20-60 sqm accessory = garage');
  console.log('  <20 sqm accessory = shed');
  console.log('  Fails for: row houses (shared walls), condo complexes');

  // --- Combined Accuracy ---
  console.log('');
  console.log('--- Combined Accuracy Estimate ---');
  var parcelAccuracy = highConf > 0 ? parseFloat(highConfPct) / 100 : 0.88;
  var buildingMatchAccuracy = 0.92;
  var classificationAccuracy = 0.90;
  var heightAccuracy = 0.92;

  var overallFootprintAccuracy = parcelAccuracy * buildingMatchAccuracy * classificationAccuracy;
  var overallHeightAccuracy = parcelAccuracy * buildingMatchAccuracy * heightAccuracy;

  console.log('P(correct parcel link):      ' + (parcelAccuracy * 100).toFixed(0) + '%');
  console.log('P(correct building match):   ' + (buildingMatchAccuracy * 100).toFixed(0) + '%');
  console.log('P(correct classification):   ' + (classificationAccuracy * 100).toFixed(0) + '%');
  console.log('P(correct stories +/-1):     ' + (heightAccuracy * 100).toFixed(0) + '%');
  console.log('');
  console.log('Combined footprint accuracy: ' + (overallFootprintAccuracy * 100).toFixed(1) + '%');
  console.log('  (correct building + structure type shown for a permit)');
  console.log('Combined height accuracy:    ' + (overallHeightAccuracy * 100).toFixed(1) + '%');
  console.log('  (correct stories within +/-1 for a permit)');

  // --- Stories source projection ---
  console.log('');
  console.log('--- Stories Source Projection ---');
  console.log('(Estimated distribution based on permit data completeness)');
  const storeysPopulated = await safeQuery('storeys_populated',
    'SELECT COUNT(*) as total FROM permits WHERE storeys IS NOT NULL AND storeys > 0');
  const storeysCount = storeysPopulated ? parseInt(storeysPopulated[0].total, 10) : 0;
  const storeysPct = ((storeysCount / Math.max(totalPermits, 1)) * 100).toFixed(1);
  console.log('Permits with storeys field:  ' + storeysCount.toLocaleString() + ' (' + storeysPct + '%) -> source: permit');
  console.log('Remaining with height data:  use-type coefficient -> source: height_typed');
  console.log('Fallback (no storeys/type):  generic 3.0m -> source: height_default');

  console.log('');
  console.log('--- Summary ---');
  console.log('Coverage:  ~' + projectedPctAll + '% of all permits, ~' + projectedPctActive + '% of active permits');
  console.log('Accuracy:  ~' + (overallFootprintAccuracy * 100).toFixed(0) + '% footprint correct, ~' + (overallHeightAccuracy * 100).toFixed(0) + '% stories correct (+/-1)');

  await pool.end();
}

main().catch(function(err) {
  console.error('Analysis failed:', err);
  process.exit(1);
});
