import * as fs from 'fs';
import * as path from 'path';

// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
// scripts/lib/resolve-db.js is CommonJS; Node's ESM loader resolves named
// imports from CJS via cjs-module-lexer, so no default-import shim is needed.
import { createResolvedPool } from './lib/resolve-db';

async function seedTrades() {
  const pool = createResolvedPool({ label: 'seed-trades' });

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
