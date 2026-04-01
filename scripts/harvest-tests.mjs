#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Test Harvester — extracts describe() blocks from test files and injects
// them into spec files between <!-- TEST_INJECT_START/END --> markers.
//
// Usage: npm run spec:tests
//
// Maps test files to specs via the Operating Boundaries "Target Files" section.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SPECS_DIR = path.join(ROOT, 'docs', 'specs');

// ---------------------------------------------------------------------------
// Parse a spec file's Operating Boundaries to find test file paths
// ---------------------------------------------------------------------------
function findTestFiles(specContent) {
  const testFiles = [];
  const lines = specContent.split('\n');
  let inTargetFiles = false;

  for (const line of lines) {
    if (line.includes('Target Files')) inTargetFiles = true;
    else if (line.includes('Out-of-Scope') || line.includes('Cross-Spec')) inTargetFiles = false;

    if (inTargetFiles) {
      const match = line.match(/`(src\/tests\/[^`]+\.test\.tsx?)`/);
      if (match) testFiles.push(match[1]);
    }
  }
  return testFiles;
}

// ---------------------------------------------------------------------------
// Extract top-level describe() names from a test file
// ---------------------------------------------------------------------------
function extractDescribes(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const describes = [];
    const regex = /^describe\(['"`]([^'"`]+)['"`]/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      describes.push(match[1]);
    }
    return describes;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Classify test file by triad layer
// ---------------------------------------------------------------------------
function classifyTestFile(filename) {
  if (filename.includes('.logic.test.')) return 'Logic';
  if (filename.includes('.ui.test.')) return 'UI';
  if (filename.includes('.infra.test.')) return 'Infra';
  if (filename.includes('.security.test.')) return 'Security';
  return 'Logic';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const specFiles = fs.readdirSync(SPECS_DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== '00_system_map.md')
  .sort();

let updated = 0;
let skipped = 0;

for (const specFile of specFiles) {
  const specPath = path.join(SPECS_DIR, specFile);
  let content = fs.readFileSync(specPath, 'utf-8');

  const startMarker = '<!-- TEST_INJECT_START -->';
  const endMarker = '<!-- TEST_INJECT_END -->';

  if (!content.includes(startMarker) || !content.includes(endMarker)) {
    skipped++;
    continue;
  }

  // Find test files from Operating Boundaries
  const testFiles = findTestFiles(content);
  if (testFiles.length === 0) {
    skipped++;
    continue;
  }

  // Group describes by triad layer
  const layers = {};

  for (const tf of testFiles) {
    const fullPath = path.join(ROOT, tf);
    const describes = extractDescribes(fullPath);
    const layer = classifyTestFile(tf);
    const basename = path.basename(tf);
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push({ file: basename, describes });
  }

  // Build injection content
  const lines = [];
  for (const layer of ['Logic', 'UI', 'Infra', 'Security']) {
    const files = layers[layer];
    if (!files || files.length === 0) continue;
    const allDescribes = files.flatMap(f => f.describes);
    if (allDescribes.length === 0) continue;
    const fileNames = files.map(f => f.file).join(', ');
    lines.push(`- **${layer}** (\`${fileNames}\`): ${allDescribes.join('; ')}`);
  }

  // Replace between markers — even if lines is empty (clears stale test references
  // when test files are deleted or migrated, instead of leaving old content)
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  const injected = lines.length > 0
    ? '\n' + lines.join('\n') + '\n'
    : '\n*No tests mapped*\n';
  const newContent =
    content.slice(0, startIdx + startMarker.length) +
    injected +
    content.slice(endIdx);

  fs.writeFileSync(specPath, newContent);
  updated++;
  console.log(`\u2714 ${specFile}: ${lines.length} layers, ${testFiles.length} test files`);
}

console.log(`\nDone: ${updated} specs updated, ${skipped} skipped`);
