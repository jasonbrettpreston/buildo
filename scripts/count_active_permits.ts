import { query, pool } from '../src/lib/db/client';

async function main() {
    try {
        console.log("Querying for permits issued in the last 2 years...");
        const rows = await query(`
      SELECT status, COUNT(*) as count 
      FROM permits 
      WHERE issued_date >= CURRENT_DATE - INTERVAL '2 years'
      GROUP BY status
      ORDER BY count DESC
    `);
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
