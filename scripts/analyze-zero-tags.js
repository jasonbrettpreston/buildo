const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'buildo',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});

const STOP_WORDS = new Set([
    'and', 'or', 'to', 'for', 'of', 'the', 'in', 'on', 'with', 'a', 'an', 'at',
    'by', 'as', 'will', 'be', 'this', 'that', 'from', 'is', 'are', 'was', 'were',
    'it', 'has', 'have', 'all', 'any', 'new', 'existing', 'building', 'permit',
    'work', 'proposed', 'construct', 'construction', 'dwelling', 'unit', 'units',
    'house', 'residential', 'commercial', 'floor', 'story', 'storey', 'storeys',
    'interior', 'alterations', 'alteration', 'addition', 'additions', 'part',
    'remove', 'replace', 'install', 'installation', 'create', 'into', 'under', 'over',
    'using', 'one', 'two', 'three', 'four', 'only', 'also', 'not', 'no', 'yes',
    'per', 'see', 'drawings', 'plans', 'plan', 'application', 'file', 'owner',
    'property', 'lot', 'line', 'lines', 'which', 'other', 'related', 'associated',
    'including', 'include', 'project', 'sf', 'sq', 'ft', 'm', 'use', 'change', 'up',
    'down', 'out', 'back', 'room', 'rooms', 'area', 'space', 'spaces', 'rear', 'front',
    'side', 'build', 'buildings', 'permits', 'works', 'constructs', 'constructed',
    'attached', 'non', 'above', 'below', 'within', 'subject', 'conditions', 'details',
    'provide', 'system', 'site', 'folder', 'design', 'review'
]);

function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word) && isNaN(word));
}

async function run() {
    console.log('--- Analyzing 5,027 Zero-Tag General BLD Permits ---');

    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT description, permit_type, structure_type 
      FROM permits 
      WHERE permit_num LIKE '% BLD' 
      AND permit_type NOT IN ('Small Residential Projects', 'New Houses')
      AND array_length(scope_tags, 1) IS NULL
      AND work != 'Party Wall Admin Permits'
    `);

        console.log(`Found ${res.rows.length} untagged permits to analyze.\n`);

        const freq = {};
        for (const row of res.rows) {
            const words = tokenize(row.description);
            for (const w of words) {
                freq[w] = (freq[w] || 0) + 1;
            }
        }

        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30);

        console.log('Top 30 Missing Concepts:');
        sorted.forEach(([word, count], i) => {
            console.log(`${i + 1}. ${word}: ${count}`);
        });

    } finally {
        client.release();
        pool.end();
    }
}

run().catch(console.error);
