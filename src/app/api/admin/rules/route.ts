import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';

/**
 * GET /api/admin/rules - Return all trade mapping rules with trade name joined.
 */
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

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
    logError('[admin/rules]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch trade mapping rules' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/rules - Insert a new trade mapping rule.
 *
 * Body: { trade_id, tier, match_field, match_pattern, confidence, phase_start?, phase_end? }
 */
export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/rules');

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

    // INSERT + audit row commit together (Spec 33 §8.1) — a rule that exists
    // with no record of who created it is the R-12 compliance hole.
    const rule = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO trade_mapping_rules
          (trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        RETURNING *`,
        [trade_id, tier, match_field, match_pattern, confidence, phase_start ?? null, phase_end ?? null],
      );
      const row = inserted.rows[0];
      await writeAdminAudit(
        {
          adminUid: adminCtx.uid,
          action: 'trade_mapping_rule_create',
          targetUid: null,
          newValue: {
            rule_id: row?.id ?? null,
            trade_id,
            tier,
            match_field,
            match_pattern,
            confidence,
          },
          reason: 'Admin created a trade mapping rule',
        },
        client,
      );
      return row;
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    logError('[admin/rules]', err, { handler: 'POST' });
    return NextResponse.json(
      { error: 'Failed to create rule' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/admin/rules - Update an existing rule by id.
 *
 * Body: { id: number, ...fieldsToUpdate }
 * Supports is_active toggle or full updates of mutable fields.
 */
export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/rules');

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

    // UPDATE + audit row commit together (Spec 33 §8.1). The before-image is
    // read inside the same transaction so old_value is the value the UPDATE
    // actually replaced.
    const rule = await withTransaction(async (client) => {
      const before = await client.query(
        `SELECT trade_id, tier, match_field, match_pattern, confidence,
                phase_start, phase_end, is_active
           FROM trade_mapping_rules WHERE id = $1`,
        [id],
      );
      const updated = await client.query(
        `UPDATE trade_mapping_rules
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx}
         RETURNING *`,
        values,
      );
      const row = updated.rows[0];
      if (row) {
        await writeAdminAudit(
          {
            adminUid: adminCtx.uid,
            action: 'trade_mapping_rule_update',
            targetUid: null,
            oldValue: { rule_id: id, ...(before.rows[0] ?? {}) },
            newValue: { rule_id: id, ...updates },
            reason: 'Admin updated a trade mapping rule',
          },
          client,
        );
      }
      return row;
    });

    if (!rule) {
      return NextResponse.json(
        { error: `Rule id=${id} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule });
  } catch (err) {
    logError('[admin/rules]', err, { handler: 'PATCH' });
    return NextResponse.json(
      { error: 'Failed to update rule' },
      { status: 500 }
    );
  }
});
