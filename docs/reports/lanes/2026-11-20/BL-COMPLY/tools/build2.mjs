// Copies each handbook / rule list verbatim (whole line ranges), adds a header (source, generator, rule count), splits into parts under the size bound.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const REPO = process.cwd(); const HOME = os.homedir();
const rf = (f) => (f.startsWith('~/') ? path.join(HOME, f.slice(2)) : path.join(REPO, f));
const LIM = 33000;
const D = 'docs/specs/';
const P = {
  fe: { title: 'McFrontend handbook (Spec 136 section 2, fe.01..fe.44; register Spec 135)', generator: 'scripts/surfaces/generate-surface-handbook.mjs --write, from docs/specs/02-web-admin/135_mcfrontend_decisions_register.md via scripts/surfaces/_schema/surface-rule-map.json', countRe: /^- \*\*fe\.\d+\*\*/, pieces: [[D + '02-web-admin/136_mcfrontend_handbook.md', 32, 165, 'Spec 136 section 2 Rules']] },
  step: { title: 'Step standard handbook (Spec 132 sections 2, 3, 4 and 6)', generator: 'scripts/generate-step-handbook.mjs --write, from scripts/steps/_schema/rule-map.json (444 mapped rule ids) and Spec 124/124a/122', countRe: /^- \*\*[a-z0-9.\-]+\*\* /, pieces: [[D + '01-pipeline/132_step_standard_handbook.md', 122, 463, 'Spec 132 sections 2 (every step), 3 (by archetype), 4 (cross-cutting)'], [D + '01-pipeline/132_step_standard_handbook.md', 503, 591, 'Spec 132 section 6 (the 80 in-force rules with no or partial machine check)']] },
  bylaw: { title: 'By-law handbook (Spec 133 section 2, rules by provision family)', generator: 'scripts/generate-bylaw-handbook.mjs --write, from scripts/analysis/bylaw/_schema/bylaw-rule-map.json (Spec 69a M-rows, Spec 131 LC-rows)', countRe: /^- \*\*(m|lc)\.\d+\*\*/, pieces: [[D + '01-pipeline/133_bylaw_handbook.md', 28, 1826, 'Spec 133 section 2']] },
  storage: { title: 'McStorage policy v2 (backlog doc-16, whole)', generator: 'hand-written (DRAFT for the operator), not generated; no rule map', countRe: /^\| P\d+ \|/, pieces: [['backlog/docs/doc-16 - McStorage-policy-v2.md', 1, 141, 'doc-16 whole']] },
  queue: { title: 'McQueue / McLane (Spec 137 sections 2 to 6)', generator: 'hand-written (Status: DRAFT), not generated', countRe: /^\*\*Rule \d+/, pieces: [[D + '00-architecture/137_mcqueue.md', 33, 176, 'Spec 137 sections 2-6']] },
  spec08: { title: 'McIncrement, McProof and agent rules (Spec 08 section 7 and section 11)', generator: 'hand-written, not generated', countRe: /^(\d+\. \*\*|\d+\. \(M?[A-Z]+[A-Z0-9-]*|### 11\.)/, pieces: [[D + '00-architecture/08_agents.md', 330, 346, 'Spec 08 section 7 Rules and economics'], [D + '00-architecture/08_agents.md', 453, 516, 'Spec 08 section 11 (11.1 to 11.9)']] },
  airtight: { title: "McDonald's Airtight V1, V2, V3 (compute purity G0-G13, traps, compute shape, R-BA, R-BF, R-BZ, R-CA, R-DT, R-EY)", generator: 'hand-written spec text and register rows; the gates are in scripts/analysis/step-validate.mjs, scripts/analysis/gates/, scripts/hooks/check-step-shape.mjs', countRe: /^\| R-[A-Z]{2} \|/, pieces: [
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 240, 240, 'V1: Spec 124a R-BA (five words, each a closed-answer gate)'],
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 245, 245, 'V2: Spec 124a R-BF (registry and cross-step)'],
    [D + '01-pipeline/122_pipeline_step_optimization.md', 1040, 1053, 'V2: Spec 122 section 6.6.1 registry and ledger truth'],
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 254, 254, 'V3: package note (operator directive 2026-10-18)'],
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 280, 281, 'V3: R-BZ and R-CA'],
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 511, 511, 'V3: R-DT (standard V3 means the whole package)'],
    [D + '01-pipeline/124a_step_standard_policy_appendix.md', 943, 943, 'V3: R-EY (nine standards, fail closed)'],
    [D + '01-pipeline/122_pipeline_step_optimization.md', 800, 850, 'Spec 122 section 5.5 the compute shape and its gates (incl. the V3 checklist line at 809)'],
    [D + '01-pipeline/122a_step_optimization_appendix.md', 753, 818, 'Spec 122a A26 (compute purity codes G0-G13) and A27 (conversion traps checklist)']] },
  'mobile-core': { title: 'Mobile rules: Spec 90 (all sections), Spec 98, and .claude/domain-admin.md (the domain file the root CLAUDE.md names for mobile/)', generator: 'hand-written, not generated', countRe: /^(## \d+\.|### \d+\.\d+)/, pieces: [[D + '03-mobile/90_mobile_engineering_protocol.md', 1, 9999, 'Spec 90 whole'], [D + '03-mobile/98_mobile_testing_protocol.md', 1, 9999, 'Spec 98 whole'], ['.claude/domain-admin.md', 1, 9999, '.claude/domain-admin.md whole']] },
  'mobile-99': { title: 'Mobile state architecture (Spec 99, whole)', generator: 'hand-written', countRe: /^## \d+\./, pieces: [[D + '03-mobile/99_mobile_state_architecture.md', 1, 99999, 'Spec 99 whole']] },
  'mobile-100': { title: 'Mobile parcel cost tool (Spec 100, whole)', generator: 'hand-written', countRe: /^## \d+\./, pieces: [[D + '03-mobile/100_mobile_parcel_cost_tool.md', 1, 99999, 'Spec 100 whole']] },
  'mobile-96': { title: 'Mobile subscription (Spec 96, whole; governs the no-plan and limit states)', generator: 'hand-written', countRe: /^## \d+\./, pieces: [[D + '03-mobile/96_mobile_subscription.md', 1, 99999, 'Spec 96 whole']] },
  eng: { title: 'Engineering standards (docs/specs/00_engineering_standards.md, whole; section 11 is the plan compliance checklist)', generator: 'hand-written', countRe: /^## \S+ \d+\./, pieces: [[D + '00_engineering_standards.md', 1, 99999, 'Spec 00 whole']] },
};
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const rows = [];
for (const [name, p] of Object.entries(P)) {
  let body = []; let count = 0; const srcs = [];
  for (const [f, a, b, label] of p.pieces) {
    const L = fs.readFileSync(rf(f), 'utf8').split('\n'); const e = Math.min(b, L.length);
    srcs.push(`${f}:${a}-${e}`);
    body.push(`<<< ${label} (${f}:${a}-${e}) >>>`);
    for (let i = a - 1; i < e; i++) { body.push(L[i]); if (p.countRe.test(L[i])) count++; }
    body.push('');
  }
  // split
  const parts = []; let cur = []; let n = 0;
  const flush = () => { if (cur.length) parts.push(cur); cur = []; n = 0; };
  for (let i = 0; i < body.length; i++) {
    const t = body[i];
    if (n + t.length > LIM && n > LIM * 0.5) { // find break: back up to last heading or blank line
      let k = cur.length - 1; while (k > cur.length * 0.5 && !/^(#{1,3} |<<<)/.test(cur[k])) k--;
      if (k <= cur.length * 0.5) { k = cur.length - 1; while (k > cur.length * 0.5 && cur[k] !== '') k--; }
      const tail = cur.splice(k); flush(); cur = tail; n = tail.reduce((s, x) => s + x.length + 1, 0);
    }
    cur.push(t); n += t.length + 1;
  }
  flush();
  parts.forEach((pl, i) => {
    const header = `# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): ${p.title}\nSource: ${srcs.join('; ')}\nGenerator: ${p.generator}\nRules in the whole list: ${count} (counted by pattern ${p.countRe}) · this is part ${i + 1} of ${parts.length}\n\n`;
    const text = header + pl.join('\n') + '\n';
    const fn = parts.length > 1 ? `${name}-p${i + 1}.md` : `${name}.md`;
    fs.writeFileSync(path.join(out, fn), text);
    rows.push(`${fn}\t${text.length}\t${count}\t${i + 1}/${parts.length}`);
  });
}
console.log(rows.join('\n'));
