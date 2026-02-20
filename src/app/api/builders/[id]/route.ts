import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const builderId = parseInt(id, 10);

  if (isNaN(builderId)) {
    return NextResponse.json(
      { error: 'Invalid builder ID' },
      { status: 400 }
    );
  }

  try {
    // Fetch builder
    const builders = await query(
      'SELECT * FROM builders WHERE id = $1',
      [builderId]
    );

    if (builders.length === 0) {
      return NextResponse.json(
        { error: 'Builder not found' },
        { status: 404 }
      );
    }

    const builder = builders[0];

    // Fetch permits by this builder (match on normalized name)
    const permits = await query(
      `SELECT permit_num, revision_num, permit_type, work, status,
              street_num, street_name, street_type, city, ward,
              est_const_cost, issued_date, description
       FROM permits
       WHERE UPPER(REGEXP_REPLACE(TRIM(builder_name), '\\s+', ' ', 'g')) = $1
       ORDER BY issued_date DESC NULLS LAST
       LIMIT 50`,
      [builder.name_normalized]
    );

    // Fetch user-contributed contacts
    const contacts = await query(
      `SELECT * FROM builder_contacts
       WHERE builder_id = $1
       ORDER BY created_at DESC`,
      [builderId]
    );

    return NextResponse.json({
      builder,
      permits,
      contacts,
    });
  } catch (err) {
    console.error('Error fetching builder detail:', err);
    return NextResponse.json(
      { error: 'Failed to fetch builder' },
      { status: 500 }
    );
  }
}
