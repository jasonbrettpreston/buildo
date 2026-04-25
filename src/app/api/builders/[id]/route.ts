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
      { error: 'Invalid builder ID' },
      { status: 400 }
    );
  }

  try {
    // Fetch entity
    const entities = await query(
      'SELECT * FROM entities WHERE id = $1',
      [entityId]
    );

    if (entities.length === 0) {
      return NextResponse.json(
        { error: 'Builder not found' },
        { status: 404 }
      );
    }

    const builder = entities[0];

    // Fetch permits via entity_projects junction
    const permits = await query(
      `SELECT p.permit_num, p.revision_num, p.permit_type, p.work, p.status,
              p.street_num, p.street_name, p.street_type, p.city, p.ward,
              p.est_const_cost, p.issued_date, p.description
       FROM permits p
       JOIN entity_projects ep ON ep.permit_num = p.permit_num AND ep.revision_num = p.revision_num
       WHERE ep.entity_id = $1 AND ep.role = 'Builder'
       ORDER BY p.issued_date DESC NULLS LAST
       LIMIT 50`,
      [entityId]
    );

    // Fetch user-contributed contacts
    const contacts = await query(
      `SELECT * FROM entity_contacts
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    );

    return NextResponse.json({
      builder,
      permits,
      contacts,
    });
  } catch (err) {
    logError('[api/builders]', err, { handler: 'GET_detail' });
    return NextResponse.json(
      { error: 'Failed to fetch builder' },
      { status: 500 }
    );
  }
});
