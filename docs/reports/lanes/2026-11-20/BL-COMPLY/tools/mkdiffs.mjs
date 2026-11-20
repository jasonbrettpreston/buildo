import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const B = process.argv[2]; const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const LIM = 38000; const manifest = [];
for (const p of ['route', 'mobile', 'mobile-tests', 'surface', 'scripts', 'load1']) {
  const files = fs.readFileSync(`${B}/part-${p}.txt`, 'utf8').split('\n').filter(Boolean);
  const chunks = []; let cur = []; let n = 0;
  for (const f of files) {
    const d = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '9f04d9074', '3a36e8b26', '--', f], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (n + d.length > LIM && cur.length) { chunks.push(cur); cur = []; n = 0; }
    cur.push([f, d]); n += d.length;
  }
  if (cur.length) chunks.push(cur);
  chunks.forEach((c, i) => {
    const name = `${p}-${i + 1}`;
    const txt = `# DIFF PART ${name}: git diff 9f04d9074..3a36e8b26, files: ${c.map((x) => x[0]).join(', ')}\n` + c.map((x) => x[1]).join('');
    fs.writeFileSync(`${out}/diff-${name}.patch`, txt);
    manifest.push(`${name}\t${txt.length}\t${c.map((x) => x[0]).join(' ; ')}`);
  });
}
fs.writeFileSync(`${out}/MANIFEST.tsv`, manifest.join('\n') + '\n'); console.log(manifest.map((l) => l.split('\t').slice(0, 2).join(' ')).join('\n'));
