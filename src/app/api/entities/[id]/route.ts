import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

export const GET = withApiEnvelope(async function GET(
  request: NextRequest,
  context?: unknown
) {
  // SAFETY: Next.js App Router always passes { params } in context for dynamic segments
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const entityId = parseInt(id, 10);

  if (isNaN(entityId)) {
    return NextResponse.json(
      { error: 'Invalid entity ID' },
      { status: 400 }
    );
  }

  try {
    const entities = await query(
      'SELECT * FROM entities WHERE id = $1',
      [entityId]
    );

    if (entities.length === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    const entity = entities[0];

    // Fetch all linked projects (permits + CoA) with roles
    const projects = await query(
      `SELECT ep.role, ep.permit_num, ep.revision_num, ep.coa_file_num, ep.observed_at,
              p.permit_type, p.work, p.status, p.street_num, p.street_name,
              p.street_type, p.city, p.ward, p.est_const_cost, p.issued_date, p.description
       FROM entity_projects ep
       LEFT JOIN permits p ON p.permit_num = ep.permit_num AND p.revision_num = ep.revision_num
       WHERE ep.entity_id = $1
       ORDER BY p.issued_date DESC NULLS LAST
       LIMIT 100`,
      [entityId]
    );

    // Fetch WSIB linkage if any
    const wsibLinks = await query(
      `SELECT legal_name, trade_name, predominant_class, naics_description, mailing_address
       FROM wsib_registry
       WHERE linked_entity_id = $1`,
      [entityId]
    );

    return NextResponse.json({
      entity,
      projects,
      wsib: wsibLinks.length > 0 ? wsibLinks[0] : null,
    });
  } catch (err) {
    // PIPEDA: do not log entityId — it reversibly joins to business mailing
    // address via entities/wsib_registry. Route tag alone is enough signal
    // to triage the 500; re-fetch with the original request URL if needed.
    logError('[api/entities]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch entity' },
      { status: 500 }
    );
  }
});
