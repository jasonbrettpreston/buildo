#!/usr/bin/env node
/**
 * Spec Audit — programmatic evaluation of all specs against the codebase.
 *
 * Checks:
 *   - File implementation alignment (do Target Files from specs exist?)
 *   - Test coverage volume (it/test counts in matching test files)
 *   - Pipeline script observability (pipeline.log + records_meta)
 *
 * Usage:
 *   node scripts/audit_all_specs.mjs                    # audit all specs
 *   node scripts/audit_all_specs.mjs --spec=12_coa      # audit single spec
 *
 * Output: docs/reports/full_spec_audit_report.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const specsDir = path.join(projectRoot, 'docs', 'specs');
const reportsDir = path.join(projectRoot, 'docs', 'reports');
const reportPath = path.join(reportsDir, 'full_spec_audit_report.md');

function countTestsInFile(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.match(/\b(it|test)\s*\(/g);
  return matches ? matches.length : 0;
}

function checkPipelineObservability(scriptPath) {
  if (!fs.existsSync(scriptPath)) return null;
  const content = fs.readFileSync(scriptPath, 'utf-8');
  return {
    has_pipeline_log: content.includes('pipeline.log.'),
    has_records_meta: content.includes('records_meta'),
    has_emit_summary: content.includes('emitSummary'),
    has_is_distinct: content.includes('IS DISTINCT FROM'),
  };
}

function auditSpecs() {
  // Support --spec=NN_name to audit a single spec
  const specArg = process.argv.find(a => a.startsWith('--spec='));
  const specFilter = specArg ? specArg.split('=')[1] : null;

  let files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
  if (specFilter) {
    files = files.filter(f => f.includes(specFilter));
    if (files.length === 0) {
      console.error(`No spec file matching "${specFilter}" found in ${specsDir}`);
      process.exit(1);
    }
    console.log(`Auditing ${files.length} spec(s) matching "${specFilter}"`);
  }

  // Ensure reports directory exists
  fs.mkdirSync(reportsDir, { recursive: true });

  let reportMd = `# Complete Codebase vs. Specification Audit Report\n\n`;
  reportMd += `**Generated:** ${new Date().toISOString().slice(0, 10)}\n\n`;
  reportMd += `This report evaluates ${files.length} specifications against the codebase, checking file implementation, test coverage, and pipeline observability.\n\n`;

  reportMd += `## Audit Rubric\n`;
  reportMd += `- **Spec Alignment [1-5]:** Do the "Target Files" mandated by the spec exist in the codebase?\n`;
  reportMd += `- **Testing Coverage [1-5]:** Volume of unit/logic tests for the component.\n`;
  reportMd += `- **Pipeline Observability:** Does the pipeline script use \`pipeline.log\`, \`records_meta\`, \`IS DISTINCT FROM\`?\n\n`;

  reportMd += `## Summary Matrix\n\n`;
  reportMd += `| Spec | Alignment | Test Coverage | Pipeline Obs. | Notes |\n`;
  reportMd += `|---|---|---|---|---|\n`;

  const detailSections = [];

  files.forEach(file => {
    const fullPath = path.join(specsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Extract Title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : file;

    // Find mentioned source files (src/...)
    const srcFilesMatch = [...content.matchAll(/(src\/[a-zA-Z0-9_\-\.\/]+\.(ts|tsx|js))/g)];
    const uniqueSrcFiles = [...new Set(srcFilesMatch.map(m => m[1]))];

    // Find mentioned pipeline scripts (scripts/...)
    const scriptFilesMatch = [...content.matchAll(/(scripts\/[a-zA-Z0-9_\-\.\/]+\.js)/g)];
    const uniqueScriptFiles = [...new Set(scriptFilesMatch.map(m => m[1]))];

    // Check implementation alignment (src/ files)
    let implementedFiles = 0;
    uniqueSrcFiles.forEach(srcFile => {
      if (fs.existsSync(path.join(projectRoot, srcFile))) implementedFiles++;
    });

    let alignmentScore;
    if (uniqueSrcFiles.length === 0) {
      alignmentScore = 'N/A';
    } else {
      const ratio = implementedFiles / uniqueSrcFiles.length;
      if (ratio === 1) alignmentScore = 5;
      else if (ratio >= 0.8) alignmentScore = 4;
      else if (ratio >= 0.5) alignmentScore = 3;
      else if (ratio > 0) alignmentScore = 2;
      else alignmentScore = 1;
    }

    // Check pipeline script implementation
    let implementedScripts = 0;
    const scriptObs = [];
    uniqueScriptFiles.forEach(scriptFile => {
      const fullScriptPath = path.join(projectRoot, scriptFile);
      if (fs.existsSync(fullScriptPath)) {
        implementedScripts++;
        const obs = checkPipelineObservability(fullScriptPath);
        if (obs) scriptObs.push({ file: scriptFile, ...obs });
      }
    });

    // Test Coverage Calculation
    const specPrefixMatch = file.match(/^(\d+[a-z]?)_(.+)\.md$/);
    let specBaseName = '';
    if (specPrefixMatch) {
      specBaseName = specPrefixMatch[2].replace(/_/g, '-');
    } else {
      specBaseName = file.replace('.md', '');
    }

    const possibleTestFiles = [
      path.join(projectRoot, 'src', 'tests', `${specBaseName}.logic.test.ts`),
      path.join(projectRoot, 'src', 'tests', `${specBaseName.split('-')[0]}.logic.test.ts`),
      ...uniqueSrcFiles.map(f => path.join(projectRoot, f.replace('.ts', '.test.ts').replace('.tsx', '.test.tsx'))),
    ];

    // Also check explicitly mentioned test files in the spec
    const explicitTestMatch = [...content.matchAll(/(src\/tests\/[a-zA-Z0-9_\-\.\/]+\.test\.tsx?)/g)];
    explicitTestMatch.forEach(m => {
      possibleTestFiles.push(path.join(projectRoot, m[1]));
    });

    let totalTests = 0;
    const foundTestFiles = [];
    const checkedPaths = new Set();

    possibleTestFiles.forEach(tf => {
      const normalized = path.normalize(tf);
      if (!checkedPaths.has(normalized) && fs.existsSync(normalized)) {
        checkedPaths.add(normalized);
        const count = countTestsInFile(normalized);
        if (count > 0) {
          totalTests += count;
          foundTestFiles.push(path.relative(projectRoot, normalized).replace(/\\/g, '/'));
        }
      }
    });

    let testScore = 1;
    let appropriateness = 'FAIL';
    if (totalTests > 40) { testScore = 5; appropriateness = 'PASS'; }
    else if (totalTests > 15) { testScore = 4; appropriateness = 'PASS'; }
    else if (totalTests > 5) { testScore = 3; appropriateness = 'PASS'; }
    else if (totalTests > 0) { testScore = 2; appropriateness = 'CAUTION'; }

    const infoSpecs = ['00_system_map.md', '01_database_schema.md', '08b_classification_assumptions.md', '08c_description_keyword_trades.md', '00_engineering_standards.md'];
    if (infoSpecs.includes(file)) {
      testScore = 'N/A';
      appropriateness = 'N/A';
    }

    // Pipeline observability summary
    let obsLabel = '—';
    if (scriptObs.length > 0) {
      const allHaveLog = scriptObs.every(s => s.has_pipeline_log);
      const allHaveMeta = scriptObs.every(s => s.has_records_meta);
      if (allHaveLog && allHaveMeta) obsLabel = 'PASS';
      else if (allHaveLog) obsLabel = 'PARTIAL';
      else obsLabel = 'FAIL';
    }

    let notes = '';
    if (testScore === 1 && alignmentScore === 5) notes = 'Implemented, but missing test suite.';
    else if (alignmentScore === 1 && uniqueSrcFiles.length > 0) notes = 'Not yet implemented.';
    else if (testScore === 5) notes = 'Excellent coverage.';
    else if (testScore === 'N/A') notes = 'Informational/Architectural spec.';

    reportMd += `| ${file} | ${alignmentScore === 'N/A' ? 'N/A' : alignmentScore + '/5'} | ${testScore === 'N/A' ? 'N/A' : testScore + '/5'} | ${obsLabel} | ${notes} |\n`;

    // Detail Section
    let detail = `### ${title} (${file})\n`;
    detail += `- **Source Files Specified:** ${uniqueSrcFiles.length} | **Implemented:** ${implementedFiles}\n`;
    detail += `- **Pipeline Scripts Specified:** ${uniqueScriptFiles.length} | **Implemented:** ${implementedScripts}\n`;
    detail += `- **Testing Volume:** ${totalTests} individual test cases\n`;
    detail += `- **Test Suites:** ${foundTestFiles.length > 0 ? foundTestFiles.join(', ') : 'None'}\n`;
    if (scriptObs.length > 0) {
      detail += `- **Pipeline Observability:**\n`;
      for (const s of scriptObs) {
        const checks = [
          s.has_pipeline_log ? '✔ log' : '✘ log',
          s.has_records_meta ? '✔ meta' : '✘ meta',
          s.has_emit_summary ? '✔ emit' : '✘ emit',
          s.has_is_distinct ? '✔ DIST' : '— DIST',
        ].join(', ');
        detail += `  - \`${s.file}\`: ${checks}\n`;
      }
    }
    detailSections.push(detail);
  });

  reportMd += `\n## Detailed Spec Breakdown\n\n`;
  reportMd += detailSections.join('\n');

  fs.writeFileSync(reportPath, reportMd);
  console.log(`✔ Report generated: ${path.relative(projectRoot, reportPath)}`);
  console.log(`  Specs audited: ${files.length}`);
}

auditSpecs();
