const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'buildo',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});

async function run() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT permit_num, work, description 
      FROM permits 
      WHERE permit_type = 'Small Residential Projects'
      AND description ~* '\\y(hvac|furnace|air condition|heat pump|plumbing|plumber|electrical|wiring|panel|duct)\\y'
    `);

        console.log(`Found ${res.rows.length} SRP permits mentioning systems.\n`);

        let systemOnly = 0;
        let mixed = 0;

        for (const row of res.rows) {
            const desc = row.description.toLowerCase();
            // Architectural proxies (simplified) using standard JS word boundaries
            const hasArchitecture = /\\b(addition|deck|garage|porch|underpinn|walkout|balcony|dormer|second suite|kitchen|bath|washroom|roof|door|window|alter|reno|basement)\\b/.test(desc);

            if (!hasArchitecture) {
                systemOnly++;
                if (systemOnly <= 15) {
                    console.log(`[SYSTEM ONLY] ${row.permit_num} | ${row.work}: ${row.description.trim()}`);
                }
            } else {
                mixed++;
            }
        }

        console.log(`\nSystem Only (Good targets): ${systemOnly}`);
        console.log(`Mixed with Arch (Ignore to avoid noise): ${mixed}`);

    } finally {
        client.release();
        pool.end();
    }
}

run().catch(console.error);
