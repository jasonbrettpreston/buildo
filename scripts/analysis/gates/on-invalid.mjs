// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3, §5 R-G, §5 R-BA (gate B)
//
// GATE B — every `config.logic_variables[].on_invalid` is drawn from a CLOSED
// answer set (Rule 3, §5 R-BA): (1) `fail` → OK; (2) `default|clamp` AND a
// `deviations[]` entry carrying `/on_invalid/i` in `from` AND naming THIS
// variable's exact `name` (in `from` or `why.text`) AND dated a valid ISO date
// → OK — a blanket deviation naming NO variable does NOT count (measured:
// assert_schema/load_ravines/link_massing carry ONLY blanket ones → RED);
// (3) a `{gate:'B', item:'config.<name>.on_invalid'}` `pending_remediation`
// ledger row → OK; (4) anything else → RED.
//
// STRICTER than the pre-existing verdict-half checker (`step-validate.mjs`
// `checkOnInvalidFail`, unchanged here): this closes §5 R-G's G-4 WRITE-affecting
// note — ANY non-`fail` needs a dated, named why, so no write-vs-verdict
// classification is needed. `ledger.mjs` owns the row shape + match; this file
// owns the answer set and the fleet walk. An ORPHAN row is RED (R-X posture).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { loadConvertedDescriptors } from './closed-bounds.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const GATE_B_DISPOSITIONS = ['pending_remediation'];
const DEVIATING_VALUES = ['default', 'clamp'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The deviations[] entry covering ONE variable, or null (blanket fails the name test). */
function namingDeviation(descriptor, name) {
  const deviations = Array.isArray(descriptor.deviations) ? descriptor.deviations : [];
  for (const d of deviations) {
    if (!d || typeof d !== 'object') continue;
    const from = typeof d.from === 'string' ? d.from : '';
    if (!/on_invalid/i.test(from)) continue;
    const whyText = d.why && typeof d.why === 'object' && typeof d.why.text === 'string' ? d.why.text : '';
    if (!from.includes(name) && !whyText.includes(name)) continue;
    if (typeof d.date !== 'string' || !ISO_DATE_RE.test(d.date) || Number.isNaN(Date.parse(d.date))) continue;
    return d;
  }
  return null;
}

/** Every `on_invalid` in ONE descriptor the closed answer set does not cover. PURE — answer 3 is a ledger fact applied below. */
export function onInvalidViolations(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const cfg = descriptor.config;
  const vars = cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables : [];
  const violations = [];
  for (const v of vars) {
    if (!v || typeof v !== 'object' || typeof v.name !== 'string') continue;
    if (v.on_invalid === 'fail') continue;
    if (DEVIATING_VALUES.includes(v.on_invalid) && namingDeviation(descriptor, v.name)) continue;
    violations.push({ step, item: `config.${v.name}.on_invalid`,
      detail: `on_invalid ${JSON.stringify(v.on_invalid)} for "${v.name}" is neither "fail" nor a default|clamp value with a dated deviations[] entry naming it` });
  }
  return violations;
}

/** Gate B over the whole converted fleet. An ORPHAN makes `pass` false (R-X). */
export function checkOnInvalidClosed(descriptors, ledgerRows) {
  const violations = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) violations.push(...onInvalidViolations(d));
  const { unallowed, orphans, allowed } = matchLedger('B', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const detail = (unallowed.length || orphans.length)
    ? `ON-INVALID-CLOSED (gate B): ${unallowed.length} unallowed on_invalid(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)` + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
    : `ON-INVALID-CLOSED (gate B): ${violations.length} on_invalid(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} from fail/named-deviation)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed };
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const d = (vars, deviations) => ({ identity: { name: 'fixture_step' }, config: { logic_variables: vars },
    ...(deviations === undefined ? {} : { deviations }) });
  const v = (over) => ({ name: 'x_warn_count', min: 0, max: 100, on_invalid: 'clamp', ...over });
  const ov = (over) => onInvalidViolations(d([v(over)]));
  const want = (got, n, msg) => { if (got.length !== n) throw new Error(`self-test FAILED (${msg}): got ${JSON.stringify(got)}`); };
  const naming = (over) => ({ from: 'the P4 on_invalid "fail" posture', why: { text: 'x_warn_count bounds a WARN-only counter' }, date: '2026-09-16', ...over });

  want(ov({ on_invalid: 'fail' }), 0, '1 fail');
  const bare = ov({});
  want(bare, 1, '2 clamp no deviation');
  if (bare[0].item !== 'config.x_warn_count.on_invalid') throw new Error('self-test FAILED (2): wrong item');
  const blanket = d([v({})], [{ from: 'the P4 on_invalid "fail" posture for every declared logic variable', why: { text: 'All six variables are seeded late' }, date: '2026-08-25' }]);
  want(onInvalidViolations(blanket), 1, '3 blanket deviation');
  want(onInvalidViolations(d([v({})], [naming({})])), 0, '4 naming deviation');
  want(onInvalidViolations(d([v({})], [naming({ date: 'soon' })])), 1, '5 bad date');
  const row = { gate: 'B', step: 'fixture_step', item: 'config.x_warn_count.on_invalid', disposition: 'pending_remediation', why: 'w', closing_brief: '.cursor/plan.md row B', filed: '2026-09-26', adjudicated_by: 'operator' };
  const ok = checkOnInvalidClosed([d([v({})])], [row]);
  if (!ok.pass || ok.unallowed.length || ok.orphans.length) throw new Error(`self-test FAILED (6): ledger-allowed violation not GREEN (${JSON.stringify(ok)})`);
  const orph = checkOnInvalidClosed([d([v({ on_invalid: 'fail' })])], [row]);
  if (orph.pass || orph.orphans.length !== 1 || !orph.detail.includes('orphan')) throw new Error(`self-test FAILED (7): orphan row not RED (${JSON.stringify(orph)})`);
}

/** CLI — `--list` prints the orchestrator-pasteable row for every CURRENT unallowed violation. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('on-invalid self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const violations = [];
    for (const d of loadConvertedDescriptors(REPO_ROOT)) violations.push(...onInvalidViolations(d));
    const { unallowed } = matchLedger('B', violations, loadLedger(REPO_ROOT).rows);
    const out = unallowed.map((v) => ({
      gate: 'B', step: v.step, item: v.item, disposition: 'pending_remediation',
      why: (violations.find((x) => x.step === v.step && x.item === v.item) || {}).detail || '',
      closing_brief: 'chain_sources conversion complete (Spec 124 R-AQ full-chain acceptance; OPERATOR DIRECTION 2026-09-26 "McDonald\'s Airtight" scope item 3 — deferred, dated)',
      filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator' }));
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: on-invalid.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH, loadConvertedDescriptors };
