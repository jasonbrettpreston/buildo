import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const C = process.env.HOME + '/Buildo-scratch/lanes-20261119/inc1b/comply3';
const all = fs.readFileSync(`${C}/files-all.txt`, 'utf8').split('\n').filter(Boolean);
const bound = all.filter((f) => /^(scripts\/surfaces\/|src\/components\/surfaces\/|src\/lib\/surfaces\/|mobile\/src\/components\/surfaces\/|mobile\/app\/|mobile\/src\/|src\/app\/api\/parcels\/(lookup|entitlement)\/|src\/lib\/entitlements\/)/.test(f));
const isGen = (f) => /^mobile\/src\/generated\//.test(f) || /\.goldens\.json$|\/fixtures\//.test(f);
const isTest = (f) => /(^|\/)__tests__\/|\.test\.(ts|tsx|mjs|js)$|\.golden\.test/.test(f);
const excluded = bound.filter((f) => isGen(f) || isTest(f)); const prod = bound.filter((f) => !isGen(f) && !isTest(f));
const grp = (f) => /^scripts\/surfaces\/_schema\//.test(f) ? 'schema' : /^scripts\/surfaces\/parcel_product\//.test(f) || /^src\/app\/api\/parcels\//.test(f) ? 'content-route'
  : /^src\/(components|lib)\/surfaces\//.test(f) || /^src\/lib\/entitlements\//.test(f) ? 'web' : /^mobile\/(app|src\/components\/surfaces)\//.test(f) ? 'mobile-ui' : 'mobile-src';
fs.mkdirSync(`${C}/diffs`, { recursive: true }); const man = [];
for (const g of ['schema', 'content-route', 'web', 'mobile-ui', 'mobile-src']) {
  const fs_ = prod.filter((f) => grp(f) === g); const ds = fs_.map((f) => execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '9f04d9074', '3a36e8b26', '--', f], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const txt = `# DIFF PART ${g}: git diff 9f04d9074..3a36e8b26, files: ${fs_.join(', ')}\n` + ds.join('');
  fs.writeFileSync(`${C}/diffs/diff-${g}.patch`, txt); man.push(`${g}\t${txt.length}\t${fs_.join(' ; ')}`);
}
fs.writeFileSync(`${C}/diffs/MANIFEST.tsv`, man.join('\n') + '\n'); fs.writeFileSync(`${C}/diffs/EXCLUDED.txt`, excluded.join('\n') + '\n');
console.log(man.map((l) => l.split('\t').slice(0, 2).join(' ')).join('\n')); console.log('excluded', excluded.length, excluded.join(' ; '));
