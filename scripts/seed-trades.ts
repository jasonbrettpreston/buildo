import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function seedTrades() {
  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432', 10),
          database: process.env.PG_DATABASE || 'buildo',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
        }
  );

  try {
    console.log('Running trade seed data...');

    // Run the trades migration which includes seed data
    const tradesSql = fs.readFileSync(
      path.join(__dirname, '../migrations/004_trades.sql'),
      'utf-8'
    );
    await pool.query(tradesSql);
    console.log('  Trades seeded (20 categories)');

    // Run the trade mapping rules migration
    const rulesSql = fs.readFileSync(
      path.join(__dirname, '../migrations/005_trade_mapping_rules.sql'),
      'utf-8'
    );
    await pool.query(rulesSql);
    console.log('  Trade mapping rules seeded (91 rules across 3 tiers)');

    // Verify
    const { rows: trades } = await pool.query('SELECT COUNT(*) as count FROM trades');
    const { rows: rules } = await pool.query('SELECT COUNT(*) as count FROM trade_mapping_rules');
    console.log(`\nVerification: ${trades[0].count} trades, ${rules[0].count} rules`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedTrades();
