const { Client } = require('pg');

async function getTags() {
    const client = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', database: 'buildo', port: 5432 });
    await client.connect();
    const res = await client.query('SELECT tags FROM permits WHERE tags IS NOT NULL LIMIT 5000');

    const allTags = new Set();
    res.rows.forEach(r => {
        if (Array.isArray(r.tags)) {
            r.tags.forEach(t => allTags.add(t));
        } else if (typeof r.tags === 'string') {
            try { JSON.parse(r.tags).forEach(t => allTags.add(t)); } catch (e) { }
        }
    });

    console.log(Array.from(allTags).slice(0, 100));
    await client.end();
}

getTags().catch(console.error);
