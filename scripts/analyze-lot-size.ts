import { Pool } from 'pg';

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

        console.log(\`Found \${rows.length} parcels with both stated area and estimated dimensions.\`);

    if (rows.length === 0) {
      return;
    }

    let totalError = 0;
    let exactMatches = 0;
    let within5Percent = 0;
    let within10Percent = 0;
    let within20Percent = 0;

    const errors: number[] = [];
    const overestimates = [];
    const underestimates = [];

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
        overestimates.push(percentError);
      } else {
        underestimates.push(percentError);
      }
    }

    errors.sort((a, b) => a - b);
    const medianError = errors[Math.floor(errors.length / 2)];
    const avgError = totalError / rows.length;

    console.log('--- Accuracy Report ---');
    console.log(\`Total Parcels Analyzed: \${rows.length}\`);
    console.log(\`Average Error: \${(avgError * 100).toFixed(2)}%\`);
    console.log(\`Median Error: \${(medianError * 100).toFixed(2)}%\`);
    console.log(\`Within 1%: \${exactMatches} (\${((exactMatches / rows.length) * 100).toFixed(2)}%)\`);
    console.log(\`Within 5%: \${within5Percent} (\${((within5Percent / rows.length) * 100).toFixed(2)}%)\`);
    console.log(\`Within 10%: \${within10Percent} (\${((within10Percent / rows.length) * 100).toFixed(2)}%)\`);
    console.log(\`Within 20%: \${within20Percent} (\${((within20Percent / rows.length) * 100).toFixed(2)}%)\`);
    console.log(\`Overestimates: \${overestimates.length} parcels\`);
    console.log(\`Underestimates: \${underestimates.length} parcels\`);

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
