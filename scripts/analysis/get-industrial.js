const { Pool } = require('pg');
const pool = new Pool({ database: 'buildo', user: 'postgres', password: 'postgres' });
async function run() {
    const { rows } = await pool.query("SELECT description FROM permits WHERE description ILIKE '%industrial%' AND permit_type NOT IN ('Small Residential Projects', 'New Houses')");
    const words = {};
    rows.forEach(r => {
        r.description.toLowerCase().split(/\\W+/).forEach(w => {
            if (w.length > 3 && !['this', 'that', 'with', 'from', 'into', 'under', 'only', 'also', 'have', 'were', 'they', 'some', 'does', 'industrial', 'building', 'new', 'existing', 'permit', 'work', 'proposed', 'construct', 'construction', 'alterations', 'alteration', 'addition', 'additions', 'part', 'interior', 'toronto', 'base'].includes(w)) {
                words[w] = (words[w] || 0) + 1;
            }
        });
    });
    const sorted = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log(sorted.map(x => x[0] + ':' + x[1]).join('\\n'));
    pool.end();
}
run().catch(console.error);
