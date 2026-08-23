require('dotenv').config();
// Spec 122 §P0 (WF3 2026-08-23) — FENCE PRESERVED, now stated instead of implied.
// This was `delete process.env.PG_HOST; pipeline.createPool()`. That deletion
// was not cleanup: it was the mechanism. `createPool()` takes its
// SUPABASE_DATABASE_URL branch only `if (!process.env.PG_HOST && …)`, so
// unsetting PG_HOST is what pointed this helper at the CLOUD database. Reading
// it as dead code and dropping it would have silently repointed the tool at the
// local DB — the exact defect class this WF3 closes. The intent is now declared:
// this helper queries CLOUD, so SUPABASE_DATABASE_URL is its ONLY target, and
// DATABASE_URL (local) must never win.
const { createResolvedPool } = require('../lib/resolve-db');
const pool = createResolvedPool({ label: '_rc_q', envVars: ['SUPABASE_DATABASE_URL'] });

const sql = process.argv[2];
(async () => {
  try {
    const r = await pool.query(sql);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
