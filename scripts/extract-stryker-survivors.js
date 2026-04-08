// One-shot helper: extract survivor mutants from a Stryker HTML report.
// Stryker 8.x emits the JSON inline as `.report = {...}` inside a <script>
// tag. We brace-match the literal and walk the file tree to collect every
// mutant with status === 'Survived'.
//
// Usage: node scripts/extract-stryker-survivors.js [report-path]
// Default: reports/mutation/mutation.html

const fs = require('fs');
const path = require('path');

const reportPath = process.argv[2] || 'reports/mutation/mutation.html';
const html = fs.readFileSync(reportPath, 'utf8');

const marker = '.report = ';
const idx = html.indexOf(marker);
if (idx < 0) {
  console.error('Could not find ".report = " marker in', reportPath);
  process.exit(1);
}
const start = idx + marker.length;

// Brace-match while respecting string literals + escapes.
let depth = 0;
let end = -1;
let inStr = false;
let esc = false;
for (let i = start; i < html.length; i++) {
  const c = html[i];
  if (esc) {
    esc = false;
    continue;
  }
  if (c === '\\') {
    esc = true;
    continue;
  }
  if (c === '"') {
    inStr = !inStr;
    continue;
  }
  if (inStr) continue;
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

if (end < 0) {
  console.error('Brace match failed');
  process.exit(1);
}

const report = JSON.parse(html.substring(start, end));

const survivors = {};
for (const [name, file] of Object.entries(report.files || {})) {
  if (!Array.isArray(file.mutants)) continue;
  const list = [];
  for (const mut of file.mutants) {
    if (mut.status !== 'Survived') continue;
    list.push({
      mutator: mut.mutatorName,
      line: mut.location.start.line,
      column: mut.location.start.column,
      replacement: (mut.replacement || '').replace(/\s+/g, ' ').slice(0, 80),
    });
  }
  if (list.length > 0) survivors[name] = list;
}

const outPath = path.join('reports', 'mutation', 'survivors.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(survivors, null, 2));

console.log(`Wrote ${outPath}`);
for (const [f, list] of Object.entries(survivors)) {
  console.log(`  ${f} — ${list.length} survivors`);
  // group by mutator
  const byMutator = {};
  for (const s of list) byMutator[s.mutator] = (byMutator[s.mutator] || 0) + 1;
  for (const [m, c] of Object.entries(byMutator).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c}× ${m}`);
  }
}
