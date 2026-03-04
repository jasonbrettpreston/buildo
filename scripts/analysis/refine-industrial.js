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
      SELECT description 
      FROM permits 
      WHERE permit_type NOT IN ('Small Residential Projects', 'New Houses')
      AND array_length(scope_tags, 1) IS NULL
      AND work != 'Party Wall Admin Permits'
      AND description ~* '\\bindustrial\\b'
    `);

        const STOP_WORDS = new Set(['and', 'or', 'to', 'for', 'of', 'the', 'in', 'on', 'with', 'a', 'an', 'industrial', 'building', 'new', 'existing', 'permit', 'work', 'proposed', 'construct', 'construction', 'part', 'alterations', 'alteration', 'addition', 'additions', 'remove', 'replace', 'install', 'installation', 'create', 'into', 'under', 'over', 'using', 'one', 'two', 'is', 'are', 'was', 'were', 'be', 'will', 'per', 'see', 'drawings', 'plans', 'project', 'sf', 'sq', 'ft', 'm', 'use', 'change', 'up', 'down', 'out', 'back', 'room', 'rooms', 'area', 'space', 'rear', 'front', 'side', 'build', 'buildings', 'permits', 'works', 'constructs', 'constructed', 'attached', 'non', 'above', 'below', 'within', 'subject', 'conditions', 'details', 'provide', 'system', 'site', 'folder', 'design', 'review', 'associated', 'related']);

        const freq = {};
        for (const row of res.rows) {
            const words = row.description.toLowerCase()
                .replace(/[.,\/#!$%\\^&\\*;:{}=\\-_`~()]/g, ' ')
                .split(/\\s+/)
                .filter(w => w.length > 2 && !STOP_WORDS.has(w) && isNaN(w));

            for (const w of words) {
                freq[w] = (freq[w] || 0) + 1;
            }
        }

        console.log('Top words co-occurring with "industrial":');
        Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([word, count]) => {
            console.log(`${word}: ${count}`);
        });

    } finally {
        client.release();
        pool.end();
    }
}

run().catch(console.error);
