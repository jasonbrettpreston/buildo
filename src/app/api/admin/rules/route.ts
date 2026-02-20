import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

/**
 * GET /api/admin/rules - Return all trade mapping rules with trade name joined.
 */
export async function GET() {
  try {
    const rules = await query(
      `SELECT
        r.id, r.trade_id, r.tier, r.match_field, r.match_pattern,
        r.confidence, r.phase_start, r.phase_end, r.is_active,
        t.name AS trade_name
      FROM trade_mapping_rules r
      LEFT JOIN trades t ON t.id = r.trade_id
      ORDER BY r.trade_id, r.tier, r.id`
    );

    return NextResponse.json({ rules });
  } catch (err) {
    console.error('[admin/rules] Error fetching rules:', err);
    return NextResponse.json(
      { error: 'Failed to fetch trade mapping rules' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/rules - Insert a new trade mapping rule.
 *
 * Body: { trade_id, tier, match_field, match_pattern, confidence, phase_start?, phase_end? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end } = body;

    // Validate required fields
    if (trade_id == null || tier == null || !match_field || !match_pattern || confidence == null) {
      return NextResponse.json(
        { error: 'trade_id, tier, match_field, match_pattern, and confidence are required' },
        { status: 400 }
      );
    }

    // Validate match_field against allowed values
    const ALLOWED_FIELDS = ['description', 'work', 'permit_type', 'structure_type', 'category', 'proposed_use'];
    if (!ALLOWED_FIELDS.includes(match_field)) {
      return NextResponse.json(
        { error: `match_field must be one of: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate confidence range
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return NextResponse.json(
        { error: 'confidence must be a number between 0 and 1' },
        { status: 400 }
      );
    }

    const [rule] = await query(
      `INSERT INTO trade_mapping_rules
        (trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [trade_id, tier, match_field, match_pattern, confidence, phase_start ?? null, phase_end ?? null]
    );

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    console.error('[admin/rules] Error creating rule:', err);
    return NextResponse.json(
      { error: 'Failed to create rule', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/rules - Update an existing rule by id.
 *
 * Body: { id: number, ...fieldsToUpdate }
 * Supports is_active toggle or full updates of mutable fields.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (id == null || typeof id !== 'number') {
      return NextResponse.json(
        { error: 'id is required and must be a number' },
        { status: 400 }
      );
    }

    // Build dynamic SET clause from allowed fields
    const MUTABLE_FIELDS = [
      'trade_id', 'tier', 'match_field', 'match_pattern',
      'confidence', 'phase_start', 'phase_end', 'is_active',
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const field of MUTABLE_FIELDS) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    values.push(id);

    const [rule] = await query(
      `UPDATE trade_mapping_rules
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx}
       RETURNING *`,
      values
    );

    if (!rule) {
      return NextResponse.json(
        { error: `Rule id=${id} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule });
  } catch (err) {
    console.error('[admin/rules] Error updating rule:', err);
    return NextResponse.json(
      { error: 'Failed to update rule', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
