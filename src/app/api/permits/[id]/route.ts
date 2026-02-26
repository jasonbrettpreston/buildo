import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { classifyScope, extractBasePermitNum } from '@/lib/classification/scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ID format: "permitNum--revisionNum" (double dash separator)
  const parts = id.split('--');
  if (parts.length !== 2) {
    return NextResponse.json(
      { error: 'Invalid permit ID format. Use: permitNum--revisionNum' },
      { status: 400 }
    );
  }

  const [permitNum, revisionNum] = parts;

  try {
    // Fetch permit
    const permits = await query(
      'SELECT * FROM permits WHERE permit_num = $1 AND revision_num = $2',
      [permitNum, revisionNum]
    );

    if (permits.length === 0) {
      return NextResponse.json(
        { error: 'Permit not found' },
        { status: 404 }
      );
    }

    // Fetch trade matches
    const trades = await query(
      `SELECT pt.*, t.slug as trade_slug, t.name as trade_name, t.icon, t.color
       FROM permit_trades pt
       JOIN trades t ON t.id = pt.trade_id
       WHERE pt.permit_num = $1 AND pt.revision_num = $2
       ORDER BY pt.lead_score DESC`,
      [permitNum, revisionNum]
    );

    // Fetch change history
    const history = await query(
      `SELECT * FROM permit_history
       WHERE permit_num = $1 AND revision_num = $2
       ORDER BY changed_at DESC
       LIMIT 50`,
      [permitNum, revisionNum]
    );

    // Fetch builder info if available
    let builder = null;
    if (permits[0].builder_name) {
      const builders = await query(
        `SELECT * FROM builders
         WHERE name_normalized = UPPER(REGEXP_REPLACE(TRIM($1), '\\s+', ' ', 'g'))
         LIMIT 1`,
        [permits[0].builder_name]
      );
      if (builders.length > 0) {
        builder = builders[0];
      }
    }

    // Fetch parcel info if linked (graceful fallback if tables don't exist yet)
    let parcel = null;
    try {
      const parcels = await query(
        `SELECT pa.*, pp.match_type, pp.confidence AS link_confidence
         FROM permit_parcels pp
         JOIN parcels pa ON pa.id = pp.parcel_id
         WHERE pp.permit_num = $1 AND pp.revision_num = $2
         ORDER BY pp.confidence DESC
         LIMIT 1`,
        [permitNum, revisionNum]
      );
      if (parcels.length > 0) {
        parcel = parcels[0];
      }
    } catch {
      // parcels/permit_parcels tables may not exist yet
    }

    // Fetch neighbourhood info if linked (graceful fallback if table doesn't exist yet)
    let neighbourhood = null;
    try {
      if (permits[0].neighbourhood_id && permits[0].neighbourhood_id > 0) {
        const nhoods = await query(
          `SELECT name, neighbourhood_id, avg_household_income, median_household_income,
                  avg_individual_income, low_income_pct, tenure_owner_pct, tenure_renter_pct,
                  period_of_construction, couples_pct, lone_parent_pct, married_pct,
                  university_degree_pct, immigrant_pct, visible_minority_pct,
                  english_knowledge_pct, top_mother_tongue, census_year
           FROM neighbourhoods WHERE id = $1`,
          [permits[0].neighbourhood_id]
        );
        if (nhoods.length > 0) neighbourhood = nhoods[0];
      }
    } catch {
      // neighbourhoods table may not exist yet
    }

    // Compute scope classification on-the-fly if not in DB
    const permit = permits[0];
    const scopeTags = Array.isArray(permit.scope_tags) && permit.scope_tags.length > 0
      ? permit.scope_tags
      : null;

    if (!scopeTags || !permit.project_type) {
      try {
        const scope = classifyScope(permit as unknown as Parameters<typeof classifyScope>[0]);
        if (!permit.project_type) permit.project_type = scope.project_type;
        if (!scopeTags) permit.scope_tags = scope.scope_tags;
      } catch {
        // Classification failure is non-fatal; permit still renders without tags
      }
    }

    // Fetch linked permits (same base number, different permit)
    let linkedPermits: Record<string, unknown>[] = [];
    try {
      const baseNum = extractBasePermitNum(permitNum);
      linkedPermits = await query(
        `SELECT permit_num, revision_num, permit_type, work, status, est_const_cost
         FROM permits
         WHERE TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) = $1
           AND NOT (permit_num = $2 AND revision_num = $3)
         ORDER BY permit_num`,
        [baseNum, permitNum, revisionNum]
      );
    } catch {
      // Non-fatal; linked permits are optional
    }

    return NextResponse.json({
      permit,
      trades,
      history,
      builder,
      parcel,
      neighbourhood,
      linkedPermits,
    });
  } catch (err) {
    console.error('Error fetching permit detail:', err);
    return NextResponse.json(
      { error: 'Failed to fetch permit' },
      { status: 500 }
    );
  }
}
