#!/usr/bin/env node
// ---------------------------------------------------------------------------
// DB Docs Generator — queries PostgreSQL information_schema and regenerates
// the schema listing in docs/specs/00-architecture/01_database_schema.md.
//
// Usage: npm run db:docs
//
// Injects content between <!-- DB_SCHEMA_START --> and <!-- DB_SCHEMA_END -->
// markers in the spec file. Everything outside the markers is preserved.
// ---------------------------------------------------------------------------

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const ROOT = path.resolve(import.meta.dirname, '..');
const SPEC_PATH = path.join(ROOT, 'docs', 'specs', '00-architecture', '01_database_schema.md');
const DB_START = '<!-- DB_SCHEMA_START -->';
const DB_END = '<!-- DB_SCHEMA_END -->';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/buildo',
  });

  try {
    // ── Tables ──────────────────────────────────────────────────────────────
    const { rows: tables } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    // ── Columns per table ───────────────────────────────────────────────────
    const { rows: columns } = await pool.query(`
      SELECT table_name, column_name, data_type,
             character_maximum_length, numeric_precision, numeric_scale,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    // ── Indexes ─────────────────────────────────────────────────────────────
    const { rows: indexes } = await pool.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    // ── Materialized views ──────────────────────────────────────────────────
    const { rows: matviews } = await pool.query(`
      SELECT matviewname
      FROM pg_matviews
      WHERE schemaname = 'public'
      ORDER BY matviewname
    `);

    // ── Group by table ──────────────────────────────────────────────────────
    const colsByTable = {};
    for (const col of columns) {
      if (!colsByTable[col.table_name]) colsByTable[col.table_name] = [];
      colsByTable[col.table_name].push(col);
    }

    const idxByTable = {};
    for (const idx of indexes) {
      if (!idxByTable[idx.tablename]) idxByTable[idx.tablename] = [];
      idxByTable[idx.tablename].push(idx);
    }

    // ── Build markdown ──────────────────────────────────────────────────────
    let md = '';

    // Summary table
    md += `### Tables (${tables.length})\n\n`;
    md += `| Table | Columns | Indexes |\n`;
    md += `|-------|---------|--------|\n`;
    for (const t of tables) {
      const colCount = (colsByTable[t.table_name] || []).length;
      const idxCount = (idxByTable[t.table_name] || [])
        .filter(i => !i.indexname.endsWith('_pkey')).length;
      md += `| \`${t.table_name}\` | ${colCount} | ${idxCount} |\n`;
    }

    if (matviews.length > 0) {
      md += `\n### Materialized Views (${matviews.length})\n\n`;
      for (const mv of matviews) {
        md += `- \`${mv.matviewname}\`\n`;
      }
    }

    // Per-table column detail
    md += `\n### Column Detail\n\n`;
    for (const t of tables) {
      const cols = colsByTable[t.table_name] || [];
      md += `#### \`${t.table_name}\` (${cols.length} columns)\n\n`;
      md += `| Column | Type | Nullable | Default |\n`;
      md += `|--------|------|----------|--------|\n`;
      for (const c of cols) {
        let type = c.data_type.toUpperCase();
        if (c.character_maximum_length) type += `(${c.character_maximum_length})`;
        if (c.numeric_precision && c.data_type === 'numeric')
          type += `(${c.numeric_precision},${c.numeric_scale})`;
        const nullable = c.is_nullable === 'YES' ? 'YES' : 'NO';
        const def = c.column_default
          ? c.column_default.replace(/::[\w\s]+/g, '').replace(/'/g, '')
          : '-';
        md += `| \`${c.column_name}\` | ${type} | ${nullable} | ${def} |\n`;
      }
      md += '\n';
    }

    // ── Inject into spec ────────────────────────────────────────────────────
    let spec = fs.readFileSync(SPEC_PATH, 'utf-8');

    const startIdx = spec.indexOf(DB_START);
    const endIdx = spec.indexOf(DB_END);

    if (startIdx === -1 || endIdx === -1) {
      console.error('\u274C Missing DB_SCHEMA markers in 01_database_schema.md');
      console.error('  Add <!-- DB_SCHEMA_START --> and <!-- DB_SCHEMA_END --> markers.');
      process.exit(1);
    }

    const newSpec =
      spec.slice(0, startIdx + DB_START.length) +
      '\n' + md +
      spec.slice(endIdx);

    fs.writeFileSync(SPEC_PATH, newSpec);
    console.log(`\u2714 Updated 01_database_schema.md`);
    console.log(`  ${tables.length} tables, ${columns.length} columns, ${indexes.length} indexes`);
    if (matviews.length > 0) console.log(`  ${matviews.length} materialized views`);

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('\u274C', err.message);
  process.exit(1);
});
