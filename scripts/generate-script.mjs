#!/usr/bin/env node
/**
 * Spec-47 Compliant Pipeline Script Generator
 *
 * Generates a pristine, 100% Spec-47 compliant script skeleton so that new pipeline
 * steps never inherit legacy bugs (missing 'use strict', dead SPEC LINKs, wrong
 * ADVISORY_LOCK_IDs, missing ON CONFLICT guards, bare mutations).
 *
 * Usage: npm run generate:script
 *
 * SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §16 (Bug Prevention §8)
 */

import { createInterface } from 'readline/promises';
import { createHash } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function prompt(question) {
  return (await rl.question(question)).trim();
}

async function promptBool(question, defaultYes = false) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await rl.question(question + suffix)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return answer === 'y' || answer === 'yes';
}

/**
 * Derive a stable ADVISORY_LOCK_ID from the script name.
 * Uses xxhash-inspired 16-bit folding on the script name so the ID is
 * deterministic and very unlikely to collide with existing IDs (which use
 * spec numbers 2-108 and 97-108 range).
 *
 * The output is in the range 1000-9999 to avoid collisions with spec-number IDs.
 */
function deriveAdvisoryLockId(scriptName) {
  const hash = createHash('sha256').update(scriptName).digest('hex');
  // Take first 4 hex chars (16-bit), fold into 1000-9999 range
  const raw = parseInt(hash.slice(0, 4), 16); // 0-65535
  return 1000 + (raw % 9000); // 1000-9999
}

function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateTemplate({
  scriptName,
  scriptSlug,
  specPath,
  description,
  mutatesData,
  readTables,
  writeTables,
  chainName,
  advisoryLockId,
  columnCount,
}) {
  const batchSizeComment = mutatesData
    ? `// §R3 — Batch size: adjust column_count to match your INSERT column list (§9.2)\nconst BATCH_SIZE = Math.floor(65535 / ${columnCount}); // ${columnCount} columns × BATCH_SIZE ≤ 65535`
    : `// §R3 — No batch writes in this script`;

  const readTablesObj = readTables.length > 0
    ? `{ ${readTables.map(t => `${t}: ['col1', 'col2']`).join(', ')} }`
    : '{}';

  const writeTablesObj = writeTables.length > 0
    ? `{ ${writeTables.map(t => `${t}: ['col1', 'col2']`).join(', ')} }`
    : '{}';

  const transactionBlock = mutatesData ? `
    // §R9 — Atomic write: all INSERTs/UPDATEs/DELETEs MUST be inside withTransaction
    const { inserted, updated } = await pipeline.withTransaction(pool, async (client) => {
      let insertedCount = 0;
      let updatedCount = 0;

      // Build your INSERT batches here. Use UNNEST for batch ops to avoid N+1.
      // Example:
      //   const result = await client.query(\`
      //     INSERT INTO ${writeTables[0] ?? 'your_table'} (col1, col2, updated_at)
      //     SELECT * FROM UNNEST($1::text[], $2::text[], $3::timestamptz[])
      //     AS t(col1, col2, updated_at)
      //     ON CONFLICT (col1) DO UPDATE SET
      //       col2 = EXCLUDED.col2,
      //       updated_at = EXCLUDED.updated_at
      //     WHERE ${writeTables[0] ?? 'your_table'}.col2 IS DISTINCT FROM EXCLUDED.col2
      //   \`, [col1Array, col2Array, col1Array.map(() => RUN_AT)]);
      //   insertedCount += result.rowCount ?? 0;

      return { inserted: insertedCount, updated: updatedCount };
    });
` : `
    // No DB writes in this script — read-only analysis or probe
    const inserted = 0;
    const updated = 0;
`;

  return `#!/usr/bin/env node
/**
 * ${scriptName} — ${description}
 *
 * Chain: ${chainName || 'permits'}
 * Reads: ${readTables.join(', ') || '(list input tables)'}
 * Writes: ${writeTables.join(', ') || '(list output tables)'}
 *
 * SPEC LINK: ${specPath}
 */
'use strict';

// §R1 — SDK imports (MANDATORY)
const pipeline = require('./lib/pipeline');
// const { loadMarketplaceConfigs } = require('./lib/config-loader'); // uncomment if using logic_variables

// §R2 — Advisory lock ID (MANDATORY — derived from script name, range 1000-9999)
// Override with spec number if this script maps directly to a spec (e.g. const ADVISORY_LOCK_ID = 85;)
const ADVISORY_LOCK_ID = ${advisoryLockId};

${batchSizeComment}

pipeline.run('${scriptSlug}', async (pool) => {

  // §R3.5 — Startup timestamp (MANDATORY for any script that writes timestamps)
  // Capture the DB clock ONCE. Pass RUN_AT as $N to all SQL writes that set a
  // timestamp column. Never call getDbTimestamp() inside a loop.
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // §R4 — Config load (IF APPLICABLE — uncomment if using logic_variables)
  // const { logicVars } = await loadMarketplaceConfigs(pool, '${scriptSlug}');
  // const config = validateConfig(logicVars);

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    // §R7 — Data read
    // Use pipeline.streamQuery() for any table expected to return >10K rows.
    // Use pool.query() ONLY for bounded queries (config tables, rollup aggregates).
    const { rows: sourceRows } = await pool.query(\`
      SELECT col1, col2
      FROM ${readTables[0] ?? 'source_table'}
      WHERE /* your filter here */
      ORDER BY col1
    \`);

    const total = sourceRows.length;
    pipeline.log.info('[${scriptSlug}]', 'Loaded source rows', { total });
${transactionBlock}
    // §R10 — PIPELINE_SUMMARY with audit_table (MANDATORY)
    pipeline.emitSummary({
      records_total: total,
      records_new: inserted,
      records_updated: updated,
      records_meta: {
        duration_ms: 0, // optional: track elapsed time
        audit_table: {
          phase: ${advisoryLockId},
          name: '${scriptName}',
          verdict: 'PASS',
          rows: [
            { metric: 'total', value: total, threshold: null, status: 'INFO' },
            { metric: 'inserted', value: inserted, threshold: null, status: 'INFO' },
            { metric: 'updated', value: updated, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    // §R11 — PIPELINE_META (MANDATORY)
    pipeline.emitMeta(
      ${readTablesObj},
      ${writeTablesObj},
    );

  });

  if (!lockResult.acquired) {
    pipeline.log.info('[${scriptSlug}]', 'Advisory lock not acquired — another instance is running. Skipping.');
  }
});
`;
}

async function main() {
  console.log('\n=== Spec-47 Pipeline Script Generator ===\n');

  const rawName = await prompt('Script name (human-readable, e.g. "Link Similar Permits"): ');
  if (!rawName) { console.error('Script name is required.'); process.exit(1); }

  const slugSuggestion = toKebabCase(rawName);
  const slug = await prompt(`Script slug (file name without .js) [${slugSuggestion}]: `) || slugSuggestion;
  const scriptSlug = toKebabCase(slug);
  const outputPath = join(SCRIPTS_DIR, `${scriptSlug}.js`);

  if (existsSync(outputPath)) {
    const overwrite = await promptBool(`${outputPath} already exists. Overwrite?`, false);
    if (!overwrite) { console.log('Aborted.'); rl.close(); return; }
  }

  const description = await prompt('One-sentence description: ');
  const specPathInput = await prompt('Spec path (e.g. docs/specs/product/future/85_trade_forecast_engine.md): ');
  const specPath = specPathInput || `docs/specs/pipeline/47_pipeline_script_protocol.md`;

  const mutatesData = await promptBool('Does this script write to the database?', true);

  let columnCount = 10;
  let readTablesStr = '';
  let writeTablesStr = '';

  readTablesStr = await prompt('Read tables (comma-separated, e.g. permits,parcels): ');
  if (mutatesData) {
    writeTablesStr = await prompt('Write tables (comma-separated): ');
    const colCountStr = await prompt('Approximate column count in your INSERT (for BATCH_SIZE calc) [10]: ');
    columnCount = parseInt(colCountStr || '10', 10) || 10;
  }

  const chainName = await prompt('Chain membership (permits/coa/sources/deep_scrapes) [permits]: ') || 'permits';

  const advisoryLockId = deriveAdvisoryLockId(scriptSlug);
  console.log(`\n→ Derived ADVISORY_LOCK_ID: ${advisoryLockId} (from hash of "${scriptSlug}")`);
  console.log('  Override in the generated file if this script maps to a spec number.');

  const readTables = readTablesStr.split(',').map(s => s.trim()).filter(Boolean);
  const writeTables = writeTablesStr.split(',').map(s => s.trim()).filter(Boolean);

  const content = generateTemplate({
    scriptName: rawName,
    scriptSlug,
    specPath,
    description,
    mutatesData,
    readTables,
    writeTables,
    chainName,
    advisoryLockId,
    columnCount,
  });

  writeFileSync(outputPath, content, 'utf8');
  console.log(`\n✅ Generated: ${outputPath}`);
  console.log('\nNext steps:');
  console.log('  1. Replace the placeholder SQL with your real queries');
  console.log('  2. Update the ADVISORY_LOCK_ID if this maps to a spec number');
  console.log('  3. Update emitMeta read/write column lists');
  console.log('  4. Register the script in scripts/manifest.json');
  console.log('  5. Add a SPEC LINK pointing to the correct spec file');

  rl.close();
}

main().catch((err) => {
  console.error('Generator failed:', err.message);
  rl.close();
  process.exit(1);
});
