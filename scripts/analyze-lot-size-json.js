const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/buildo'
});

async function run() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
      SELECT 
        parcel_id,
        lot_size_sqm, 
        frontage_m, 
        depth_m 
      FROM parcels 
      WHERE lot_size_sqm IS NOT NULL 
        AND lot_size_sqm > 0
        AND frontage_m IS NOT NULL 
        AND depth_m IS NOT NULL
        AND frontage_m > 0
        AND depth_m > 0
    `);

        if (rows.length === 0) {
            fs.writeFileSync('lot_size_accuracy.json', JSON.stringify({ error: "No rows found" }));
            return;
        }

        let totalError = 0;
        let exactMatches = 0;
        let within5Percent = 0;
        let within10Percent = 0;
        let within20Percent = 0;

        const errors = [];
        let overestimates = 0;
        let underestimates = 0;

        for (const row of rows) {
            const stated = Number(row.lot_size_sqm);
            const estimatedArea = Number(row.frontage_m) * Number(row.depth_m);

            const absError = Math.abs(estimatedArea - stated);
            const percentError = absError / stated;

            errors.push(percentError);
            totalError += percentError;

            if (percentError < 0.01) exactMatches++;
            if (percentError <= 0.05) within5Percent++;
            if (percentError <= 0.10) within10Percent++;
            if (percentError <= 0.20) within20Percent++;

            if (estimatedArea > stated) {
                overestimates++;
            } else if (estimatedArea < stated) {
                underestimates++;
            }
        }

        errors.sort((a, b) => a - b);
        const medianError = errors[Math.floor(errors.length / 2)];
        const avgError = totalError / rows.length;

        const report = {
            totalParcelsAnalyzed: rows.length,
            averageError: (avgError * 100).toFixed(2) + '%',
            medianError: (medianError * 100).toFixed(2) + '%',
            within1Percent: exactMatches,
            within1PercentPct: ((exactMatches / rows.length) * 100).toFixed(2) + '%',
            within5Percent: within5Percent,
            within5PercentPct: ((within5Percent / rows.length) * 100).toFixed(2) + '%',
            within10Percent: within10Percent,
            within10PercentPct: ((within10Percent / rows.length) * 100).toFixed(2) + '%',
            within20Percent: within20Percent,
            within20PercentPct: ((within20Percent / rows.length) * 100).toFixed(2) + '%',
            overestimates,
            underestimates
        };

        fs.writeFileSync('lot_size_accuracy.json', JSON.stringify(report, null, 2));

    } finally {
        client.release();
        pool.end();
    }
}

run().catch(console.error);
