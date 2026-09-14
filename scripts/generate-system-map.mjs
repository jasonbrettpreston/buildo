#!/usr/bin/env node
// ---------------------------------------------------------------------------
// System Map Generator — auto-generates docs/specs/00-architecture/00_system_map.md
//
// Recursively reads every spec file in docs/specs/ (including subdirectories)
// and compiles the registry table grouped by directory.
//
// Usage:
//   npm run system-map
//   node scripts/generate-system-map.mjs
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(import.meta.dirname, '..');
const SPECS_DIR = path.join(ROOT, 'docs', 'specs');
const DOCS_DIR = path.join(ROOT, 'docs');
const OUTPUT = path.join(SPECS_DIR, '00-architecture', '00_system_map.md');

// Directory → display name mapping (order determines output order).
// `base` defaults to SPECS_DIR; generated reference docs live under docs/.
const SECTIONS = [
  { dir: '00-architecture', name: 'Architecture & Standards' },
  { dir: '01-pipeline',     name: 'Pipeline (Data Engineering)' },
  { dir: '02-web-admin',    name: 'Web Admin' },
  { dir: '03-mobile',       name: 'Mobile (Lead Feed)' },
  { dir: 'archive',         name: 'Archive (Deprecated)' },
  { dir: 'reference',       name: 'Reference & Generated Docs', base: DOCS_DIR, pathPrefix: 'docs/' },
];

// Skip these directories entirely
const SKIP_DIRS = new Set([]);

function parseSpec(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);

  // Extract number prefix (e.g., "01", "08b", "40", "80")
  const prefixMatch = filename.match(/^(\d+[a-z]?)_/);
  const prefix = prefixMatch ? prefixMatch[1] : '99';

  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1] : filename.replace('.md', '');
  // Clean up title — remove "Spec NN --", "Feature:", "Chain:", "Source:", "Step:" prefixes
  title = title
    .replace(/^Spec\s+\d+[a-z]?\s*[-—]+\s*/i, '')
    .replace(/^(Feature|Chain|Source|Step|Taxonomy|Pipeline):\s*/i, '')
    .replace(/^\d+[a-z]?\s*[-—]+\s*/i, '')
    .trim();

  // Extract status — check for blockquote status headers first
  const blockquoteStatus = content.match(/>\s*\*\*Status:\s*(\w+)\*\*/);
  const statusMatch = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const status = blockquoteStatus ? blockquoteStatus[1].trim() :
                 statusMatch ? statusMatch[1].trim() : 'Done';

  // Extract target files from Operating Boundaries
  const targetFilesSection = content.match(/### Target Files[\s\S]*?(?=###|## |$)/);
  let implFiles = [];
  let testFiles = [];

  if (targetFilesSection) {
    const lines = targetFilesSection[0].split('\n');
    for (const line of lines) {
      // PILOT 8 FIX (2026-08-31, refresh_snapshot PH-0/Finding 3): `.match()` with no
      // `/g` flag returns only the FIRST hit per line, so a Target Files bullet listing
      // several `scripts/x.js`/`src/y.ts` refs on one comma-separated line (the repo's
      // own convention, e.g. Spec 60's 3-per-line bullets) silently dropped every file
      // after the first — `refresh-snapshot.js` was declared in Spec 60's own Target
      // Files section the whole time but never reached the generated table. `matchAll`
      // with `/g` is the fix; behaviour for a one-ref-per-line spec is unchanged.
      for (const fileMatch of line.matchAll(/`(src\/[^`]+)`/g)) {
        const f = fileMatch[1];
        if (f.includes('.test.')) {
          testFiles.push(f);
        } else {
          implFiles.push(f);
        }
      }
      // Also capture scripts/ references for pipeline specs
      for (const scriptMatch of line.matchAll(/`(scripts\/[^`]+)`/g)) {
        implFiles.push(scriptMatch[1]);
      }
    }
  }

  // Fallback: scan for src/ file references if no Operating Boundaries
  if (implFiles.length === 0) {
    const srcMatches = [...content.matchAll(/`(src\/(?:lib|app|components)\/[^`]+\.(?:ts|tsx))`/g)];
    const unique = [...new Set(srcMatches.map(m => m[1]))];
    implFiles = unique.filter(f => !f.includes('.test.'));
    if (testFiles.length === 0) {
      testFiles = unique.filter(f => f.includes('.test.'));
    }
  }

  // Also check for test file references in tests/ dir
  if (testFiles.length === 0) {
    const testMatches = [...content.matchAll(/`(src\/tests\/[^`]+\.test\.(?:ts|tsx))`/g)];
    testFiles = [...new Set(testMatches.map(m => m[1]))];
  }

  // Check for Testing Mandate section test references (e.g., "scope.logic.test.ts")
  if (testFiles.length === 0) {
    const testSection = content.match(/## \d+\.\s*Testing Mandate[\s\S]*?(?=## |$)/);
    if (testSection) {
      const testRefs = [...testSection[0].matchAll(/`([a-z-]+\.(?:logic|ui|infra|security)\.test\.(?:ts|tsx))`/g)];
      testFiles = [...new Set(testRefs.map(m => `src/tests/${m[1]}`))];
    }
  }

  return {
    filename, prefix, title, status,
    implFiles: [...new Set(implFiles)],
    testFiles: [...new Set(testFiles)],
  };
}

// WF2 2026-09-14: NO cap. The map is the Single Source of Truth (CLAUDE.md PD #2) and Spec 123 G0
// greps it for a step file; the former `max = 3` + `+N more` collapse made that grep a false
// negative for every spec with >3 target files (measured: assert-data-bounds.js in Spec 44 → 0 hits).
function formatList(items) {
  return items.map(f => `\`${f}\``).join(', ');
}

/**
 * Collect spec files from a directory (non-recursive for the given dir).
 * Returns array of { relPath, absPath } sorted by filename.
 */
function collectSpecs(baseDir, subDir) {
  const fullDir = subDir === '.' ? baseDir : path.join(baseDir, subDir);
  if (!fs.existsSync(fullDir)) return [];

  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.md') && f !== '00_system_map.md' && f !== '_spec_template.md')
    .sort()
    .map(f => ({
      relPath: subDir === '.' ? f : `${subDir}/${f}`,
      absPath: path.join(fullDir, f),
    }));
}

// ── Build ───────────────────────────────────────────────────────────────────
// Pure: reads the spec files, returns the markdown. Exported so the drift lock
// (src/tests/system-map.infra.test.ts) can assert the COMMITTED map equals what the
// specs currently produce — the map is derived, never hand-edited, and the existing
// pre-commit test run is the only process that keeps it accurate.
export function buildSystemMap() {
let totalSpecs = 0;
let sectionCount = 0;

let md = `# Buildo System Map
**Single Source of Truth - All Features Registry**
*Auto-generated by \`npm run system-map\` — do not edit manually.*

---

`;

for (const section of SECTIONS) {
  const base = section.base || SPECS_DIR;
  const files = collectSpecs(base, section.dir);
  if (files.length === 0) continue;

  const prefix = section.pathPrefix || '';
  const specs = files.map(f => ({ ...parseSpec(f.absPath), relPath: `${prefix}${f.relPath}` }));

  md += `## ${section.name}\n\n`;
  md += `| # | Spec File | Feature | Implementation | Tests | Status |\n`;
  md += `|---|-----------|---------|---------------|-------|--------|\n`;

  for (const spec of specs) {
    const impl = spec.implFiles.length > 0 ? formatList(spec.implFiles) : '—';
    const tests = spec.testFiles.length > 0 ? formatList(spec.testFiles) : '—';
    md += `| ${spec.prefix} | \`${spec.relPath}\` | ${spec.title} | ${impl} | ${tests} | ${spec.status} |\n`;
  }

  md += '\n';
  totalSpecs += specs.length;
  sectionCount++;
}

md += `---

## Key Paths

| Category | Path |
|----------|------|
| Database | \`src/lib/db/client.ts\`, \`migrations/\` |
| Generated Types | \`src/lib/db/generated/schema.ts\`, \`src/lib/db/table-types.ts\` |
| Business Logic | \`src/lib/*/\` |
| API Routes | \`src/app/api/*/route.ts\` |
| Components | \`src/components/\` |
| Tests | \`src/tests/\` |
| Factories | \`src/tests/factories.ts\` |
| Pipeline Scripts | \`scripts/*.js\`, \`scripts/quality/*.js\` |
| Pipeline SDK | \`scripts/lib/pipeline.js\` |
| Pipeline Manifest | \`scripts/manifest.json\` |
| Specs | \`docs/specs/\` (platform, product, pipeline) |
`;
return { md, totalSpecs, sectionCount };
}

// ── Main ────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { md, totalSpecs, sectionCount } = buildSystemMap();
  fs.writeFileSync(OUTPUT, md);
  console.log(`✔ Generated ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  ${totalSpecs} specs across ${sectionCount} sections`);
}
