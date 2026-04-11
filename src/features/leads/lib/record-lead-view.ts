// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// Helper for the Phase 2 `POST /api/leads/view` route. Wraps the lead_views
// upsert + competition-count read so Phase 2 routes don't have to re-derive
// the deterministic `lead_key` format or re-implement migration 070's XOR
// CHECK constraint compliance.
//
// Never throws — returns `{ ok: false }` on error so the route handler can
// surface a 500 without its own try/catch.

import type { Pool } from 'pg';
import { logError } from '@/lib/logger';

export type LeadViewAction = 'view' | 'save' | 'unsave';

export type RecordLeadViewInput =
  | {
      user_id: string;
      trade_slug: string;
      action: LeadViewAction;
      lead_type: 'permit';
      permit_num: string;
      revision_num: string;
    }
  | {
      user_id: string;
      trade_slug: string;
      action: LeadViewAction;
      lead_type: 'builder';
      entity_id: number;
    };

export interface RecordLeadViewResult {
  ok: boolean;
  competition_count: number;
}

/**
 * Build the deterministic `lead_key` per spec 70 §Database Schema:
 *   permit lead → `permit:{permit_num}:{revision_num}` (revision zero-padded to 2 digits)
 *   builder lead → `builder:{entity_id}`
 *
 * Normalization: the permits table has historical drift between `'0'` and
 * `'00'` for the zero revision (migration 001 loader uses `'00'` but some
 * earlier-ingested rows carry bare `'0'`). Without padding, the same permit
 * revision could produce two different lead_keys depending on which ingest
 * path wrote it — breaking the competition_count UNIQUE (user_id, lead_key,
 * trade_slug) dedup. `padStart(2, '0')` collapses `'0'` and `'00'` to the
 * same canonical `'00'`. Matches the `LPAD(p.revision_num, 2, '0')`
 * normalization in `LEAD_FEED_SQL`.
 *
 * Exported so the API route layer (Phase 2) can echo the same key in its
 * response payload if needed.
 */
export function buildLeadKey(input: RecordLeadViewInput): string {
  if (input.lead_type === 'permit') {
    // Normalize to EXACTLY 2 characters matching PostgreSQL's
    // `LPAD(p.revision_num, 2, '0')` in LEAD_FEED_SQL. PostgreSQL
    // LPAD TRUNCATES when the input exceeds target length, but JS
    // `padStart` preserves longer strings. Without `.slice(-2)` a
    // `revision_num = '000'` would produce `permit:X:000` in JS
    // while SQL produces `permit:X:00` — a silent mismatch that
    // breaks the UNIQUE dedup. Caught by the Phase 0-3 comprehensive
    // review (DeepSeek Phase 1 HIGH finding).
    const rev = input.revision_num.padStart(2, '0').slice(-2);
    return `permit:${input.permit_num}:${rev}`;
  }
  return `builder:${input.entity_id}`;
}

/**
 * Upsert a lead_views row. The UNIQUE `(user_id, lead_key, trade_slug)`
 * constraint guarantees state-table semantics: subsequent calls for the
 * same (user, lead, trade) tuple update `viewed_at` and `saved` rather
 * than insert a new row. Spec 70 calls this an "upsert" not an event log.
 *
 * Action semantics:
 *   - 'view'   → upsert, refresh `viewed_at = NOW()`, preserve `saved`, preserve `saved_at`
 *   - 'save'   → upsert with `saved = true`,  set `saved_at = NOW()`, preserve existing `viewed_at`
 *   - 'unsave' → upsert with `saved = false`, set `saved_at = NULL`,  preserve existing `viewed_at`
 *
 * Save/unsave deliberately do NOT update `viewed_at`. Spec 70 §Behavioral
 * Contract line 249: "Only count views, not saves — saves are private."
 * The competition count query filters by `viewed_at > NOW() - INTERVAL '30 days'`,
 * so refreshing the timestamp on save/unsave would artificially keep a lead
 * "hot" in the competition window for a user who hadn't actually looked at
 * it recently. On first-insert via save (no prior view), `viewed_at` still
 * defaults to NOW() because the column is NOT NULL — edge case; in the UI
 * flow every save is preceded by a view.
 *
 * `saved_at` (migration 082, WF3 Phase 3) tracks the save timestamp
 * INDEPENDENTLY of `viewed_at` so `getEngagement.saves_7d` can reflect
 * recent save activity without refreshing `viewed_at`. Invariant:
 * `saved = false` implies `saved_at IS NULL`. Set on save, cleared on
 * unsave. Views do not touch it.
 *
 * After the upsert, returns the competition_count for the (lead_key,
 * trade_slug) pair from the last 30 days. Per spec 70 §API Endpoints
 * Race condition note, this read is intentionally NOT in the same
 * transaction as the upsert — concurrent views can leave the count
 * stale by 1-2, which is an acceptable tradeoff for write-path simplicity.
 */
export async function recordLeadView(
  input: RecordLeadViewInput,
  pool: Pool,
): Promise<RecordLeadViewResult> {
  const lead_key = buildLeadKey(input);

  try {
    // Upsert. The XOR CHECK constraint in migration 070 enforces that
    // permit fields and entity_id are mutually exclusive — we satisfy it
    // by passing NULLs for the unused side based on lead_type.
    const permit_num = input.lead_type === 'permit' ? input.permit_num : null;
    const revision_num = input.lead_type === 'permit' ? input.revision_num : null;
    const entity_id = input.lead_type === 'builder' ? input.entity_id : null;

    // 'view' should not regress a saved state — use COALESCE to keep the
    // existing `saved` value on the upsert path. 'save'/'unsave' force.
    // View upserts NEVER touch `saved_at` — the save timestamp is only
    // written or cleared by the save/unsave branches.
    if (input.action === 'view') {
      await pool.query(
        `INSERT INTO lead_views (
           user_id, lead_key, lead_type, permit_num, revision_num,
           entity_id, trade_slug, viewed_at, saved, saved_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), false, NULL)
         ON CONFLICT (user_id, lead_key, trade_slug) DO UPDATE
           SET viewed_at = NOW()`,
        [input.user_id, lead_key, input.lead_type, permit_num, revision_num, entity_id, input.trade_slug],
      );
    } else {
      const saved = input.action === 'save';
      // `saved_at` follows the invariant: `saved = true → saved_at = NOW()`,
      // `saved = false → saved_at = NULL`. The CASE expression inside the
      // ON CONFLICT DO UPDATE runs per-row with EXCLUDED.saved referencing
      // the new incoming value, and since we know the incoming value at
      // the application layer we could just hardcode it — but keeping the
      // CASE makes the invariant visible in the SQL itself and survives
      // any future refactor that parameterizes `saved` differently.
      await pool.query(
        `INSERT INTO lead_views (
           user_id, lead_key, lead_type, permit_num, revision_num,
           entity_id, trade_slug, viewed_at, saved, saved_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, NOW(), $8,
           CASE WHEN $8 THEN NOW() ELSE NULL END
         )
         ON CONFLICT (user_id, lead_key, trade_slug) DO UPDATE
           SET saved = EXCLUDED.saved,
               saved_at = CASE WHEN EXCLUDED.saved THEN NOW() ELSE NULL END`,
        [input.user_id, lead_key, input.lead_type, permit_num, revision_num, entity_id, input.trade_slug, saved],
      );
    }

    // Competition count: distinct users who viewed this lead in the same
    // trade in the last 30 days. Uses the covering index
    // (lead_key, trade_slug, viewed_at) created in migration 070.
    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS count
         FROM lead_views
        WHERE lead_key = $1
          AND trade_slug = $2
          AND viewed_at > NOW() - INTERVAL '30 days'`,
      [lead_key, input.trade_slug],
    );
    const count_raw = countRes.rows[0]?.count ?? '0';
    const competition_count = Number.parseInt(count_raw, 10);

    // Route owns the single success log via logRequestComplete — no
    // duplicate logInfo here (prevents PII double-emission per request).
    return { ok: true, competition_count };
  } catch (err) {
    logError('[record-lead-view]', err, {
      user_id: input.user_id,
      trade_slug: input.trade_slug,
      lead_key,
      action: input.action,
    });
    return { ok: false, competition_count: 0 };
  }
}
