'use strict';
// SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 ([PF6])
//
// One-off backfill: seed admin_watchlist (migration 215) from the admins'
// existing lead_views saved rows so the Flight Center board doesn't arrive
// empty after the lead_views → admin_watchlist move.
//
// WHY A SCRIPT, NOT A MIGRATION [PF6 / Integration BUG-1]: the admin uids
// live in the ADMIN_USER_IDS env allowlist — a .sql migration cannot read
// env, and hardcoding Firebase uids in a committed migration is brittle and
// leaks identifiers. Runbook-indexed per convention (docs/runbook/README.md
// §2); run ONCE after migration 215:
//
//   node scripts/analysis/backfill-admin-watchlist.js --confirm
//
// Guarded: without --confirm it only COUNTS (dry-run) and writes nothing.
// Idempotent: ON CONFLICT (admin_uid, lead_key) DO NOTHING — safe to re-run.
//
// Scope: lead_type IN ('permit','coa') only — builder saves have no
// watchlist arm (Spec 36 §2). lead_views UNIQUE is (user_id, lead_key,
// trade_slug), so the same lead saved under several trade_slugs collapses
// via DISTINCT ON (user_id, lead_key), keeping the earliest saved_at.
// address_snapshot is captured from permits street-concat / coa address
// ([PF8] — the list renders the snapshot without a per-row display JOIN).

require('dotenv/config');
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');

const CONFIRM = process.argv.includes('--confirm');

function parseAdminUids(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const pool = createResolvedPool({ label: 'backfill-admin-watchlist' });

const SELECT_SQL = `
  SELECT DISTINCT ON (lv.user_id, lv.lead_key)
    lv.user_id                                   AS admin_uid,
    lv.lead_type,
    lv.lead_key,
    lv.permit_num,
    lv.revision_num,
    CASE WHEN lv.lead_type = 'coa'
         THEN substring(lv.lead_key from 5)       -- strip the 'coa:' prefix
    END                                           AS coa_application_number,
    CASE
      WHEN lv.lead_type = 'permit'
        THEN TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, ''))
      WHEN lv.lead_type = 'coa'
        THEN c.address
    END                                           AS address_snapshot,
    COALESCE(lv.saved_at, lv.viewed_at)           AS saved_at
  FROM lead_views lv
  LEFT JOIN permits p
    ON lv.lead_type = 'permit'
    AND p.permit_num = lv.permit_num
    AND p.revision_num = lv.revision_num
  LEFT JOIN coa_applications c
    ON lv.lead_type = 'coa'
    AND c.application_number = substring(lv.lead_key from 5)
  WHERE lv.saved = true
    AND lv.lead_type IN ('permit', 'coa')
    AND lv.user_id = ANY($1)
  ORDER BY lv.user_id, lv.lead_key, lv.saved_at ASC NULLS LAST
`;

const INSERT_SQL = `
  INSERT INTO admin_watchlist
    (admin_uid, lead_type, lead_key, permit_num, revision_num,
     coa_application_number, address_snapshot, saved_at)
  ${SELECT_SQL}
  ON CONFLICT (admin_uid, lead_key) DO NOTHING
`;

(async () => {
  const adminUids = parseAdminUids(process.env.ADMIN_USER_IDS);
  // Dev-bypass rows are dev-local artifacts but still a real board on this
  // single-operator deployment — include the sentinel so the local board
  // migrates too ([ORC1] sentinel behavior, Spec 36 §3).
  if (!adminUids.includes('dev-user')) adminUids.push('dev-user');

  if (adminUids.length === 0) {
    console.error('[backfill-admin-watchlist] ADMIN_USER_IDS is empty — nothing to backfill.');
    await pool.end();
    return;
  }
  console.log(`[backfill-admin-watchlist] admin uids: ${adminUids.length} (allowlist + dev-user sentinel)`);

  const { rows } = await pool.query(SELECT_SQL, [adminUids]);
  console.log(`[backfill-admin-watchlist] eligible saved lead_views rows (deduped): ${rows.length}`);
  const byType = rows.reduce((acc, r) => {
    acc[r.lead_type] = (acc[r.lead_type] || 0) + 1;
    return acc;
  }, {});
  console.log(`[backfill-admin-watchlist] by lead_type: ${JSON.stringify(byType)}`);

  if (!CONFIRM) {
    console.log('[backfill-admin-watchlist] DRY-RUN (no --confirm) — no writes. Re-run with --confirm to backfill.');
    await pool.end();
    return;
  }

  const res = await pool.query(INSERT_SQL, [adminUids]);
  console.log(`[backfill-admin-watchlist] inserted ${res.rowCount} admin_watchlist rows (${rows.length - res.rowCount} already present, skipped by ON CONFLICT)`);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
