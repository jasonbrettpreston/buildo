// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1, Rule 3, §5 R-BA (gate A)
//
// GATE A — every `checks[].limit` (and `checks[].warn_limit` when declared) is a
// CLOSED-ANSWER bound, never a bare prose number (Rule 1 "nothing hidden",
// Rule 3 "no second copy of a tunable", §5 R-BA's closed gate set):
//   1. `limit_from_config` / `warn_limit_from_config` names a DECLARED
//      `config.logic_variables[].name` in the SAME descriptor → OK (Ruling A-4).
//   2. `limit === "viol == 0"` EXACTLY → OK (zero tolerance, nothing to tune).
//      NOT extended to `warn_limit`: a WARN tier that can never fire is
//      decoration, not a bound (the link_neighbourhoods case).
//   3. a `{gate:'A', step, item:'checks.<id>.limit'|'checks.<id>.warn_limit'}`
//      ledger row with disposition `non_tunable`|`pending_remediation` → OK.
//   4. anything else → RED — including a `limit_from_config` naming an
//      UNDECLARED variable (it LOOKS like answer 1 while binding to nothing).
// The GATE half of §5 R-BA: `ledger.mjs` owns the row shape + the match, this
// file owns the answer set and the fleet walk (DERIVED from converted.json,
// R-AN). An ORPHAN row — its violation since fixed — is RED (R-X posture).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { readConvertedJson } from './converted-set.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const GATE_A_DISPOSITIONS = ['non_tunable', 'pending_remediation'];
const ZERO_TOLERANCE = 'viol == 0';
const FIELDS = [['limit', 'limit_from_config', true], ['warn_limit', 'warn_limit_from_config', false]];
const kebab = (slug) => String(slug).replace(/_/g, '-');

/**
 * Every bound in ONE descriptor the closed answer set does not cover. PURE — no
 * disk, no ledger (answer 3 is a ledger fact, applied by `checkClosedBounds`).
 * `limit` is REQUIRED (A-4: it carries the seed default) → full answer set;
 * `warn_limit` is optional and only moves FAIL→WARN → answers 1 + 3 only.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {Array<{step:string, item:string, detail:string}>}
 */
export function boundViolations(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const cfg = descriptor.config;
  const declared = new Set(
    cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables)
      ? cfg.logic_variables.map((v) => v && v.name).filter(Boolean)
      : [],
  );
  const violations = [];
  for (const check of Array.isArray(descriptor.checks) ? descriptor.checks : []) {
    if (!check || typeof check !== 'object') continue;
    const id = typeof check.id === 'string' ? check.id : '(no-id)';
    for (const [field, refKey, zeroApplies] of FIELDS) {
      if (check[field] === undefined) continue;
      const item = `checks.${id}.${field}`;
      const ref = check[refKey];
      const why = ref !== undefined
        ? (declared.has(ref) ? null : `${refKey} names "${ref}", not a declared config.logic_variables[].name in this descriptor`)
        : (zeroApplies && check[field] === ZERO_TOLERANCE
          ? null
          : zeroApplies
            ? `${field} ${JSON.stringify(check[field])} is neither ${refKey} nor exactly "${ZERO_TOLERANCE}"`
            : `${field} ${JSON.stringify(check[field])} is hard-coded with no ${refKey} (the zero-tolerance answer does not apply to a WARN tier)`);
      if (why) violations.push({ step, item, detail: why });
    }
  }
  return violations;
}

/**
 * Gate A over the whole converted fleet. An ORPHAN makes `pass` false (R-X).
 */
export function checkClosedBounds(descriptors, ledgerRows) {
  const violations = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) violations.push(...boundViolations(d));
  const { unallowed, orphans, allowed } = matchLedger('A', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const detail = (unallowed.length || orphans.length)
    ? `CLOSED-BOUNDS (gate A): ${unallowed.length} unallowed bound(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
    : `CLOSED-BOUNDS (gate A): ${violations.length} bound(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} from config/viol==0)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed };
}

/** Descriptor path convention — `<step>.descriptor.json` beside the script (seam.js's rule). */
const descriptorPathFor = (relFile) => String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';

/**
 * Every CONVERTED step's descriptor, in `converted.json` order (R-AN — never a
 * retyped list). Throws on a missing/unparsable descriptor: a converted entry
 * with no readable descriptor is a broken registry, never something to skip.
 * @param {string} [repoRoot]
 */
export function loadConvertedDescriptors(repoRoot = REPO_ROOT) {
  // converted-set.mjs: the ONE read — includes a pending step evaluated as-converted (item 1).
  const parsed = readConvertedJson(repoRoot);
  const read = (rel, from) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    } catch (e) {
      throw new Error(`${from} has no readable descriptor at ${rel}: ${e.message}`);
    }
  };
  return (Array.isArray(parsed.converted) ? parsed.converted : [])
    .map((relFile) => read(descriptorPathFor(relFile), `converted step ${relFile}`));
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const d = (vars, checks) => ({
    identity: { name: 'fixture_step' },
    config: vars === null ? 'none' : { logic_variables: vars.map((name) => ({ name })) },
    checks,
  });
  const c = (over) => ({ id: 'pct_check', limit: 'pct <= 0.05', severity: 'FAIL', ...over });
  const bv = (vars, over) => boundViolations(d(vars, [c(over)]));
  const want = (got, n, msg) => { if (got.length !== n) throw new Error(`self-test FAILED (${msg}): got ${JSON.stringify(got)}`); };
  const S = 'fixture_step';
  const row = { gate: 'A', step: S, item: 'checks.pct_check.limit', disposition: 'pending_remediation', why: 'w', closing_brief: '.cursor/plan.md row A', filed: '2026-09-25', adjudicated_by: 'operator' };

  // 1/2/3 — `limit_from_config`: bare RED, declared GREEN, undeclared RED.
  want(bv([], {}), 1, '1 bare pct limit');
  if (bv([], {})[0].item !== 'checks.pct_check.limit') throw new Error('self-test FAILED (1): wrong item');
  want(bv(['pct_max'], { limit_from_config: 'pct_max' }), 0, '2 declared limit_from_config');
  const und = bv([], { limit_from_config: 'nope_var' });
  want(und, 1, '3 undeclared limit_from_config');
  if (!und[0].detail.includes('nope_var')) throw new Error('self-test FAILED (3): detail must name the missing var');
  // 4/5 — zero tolerance GREEN, `viol <= 3` RED.
  want(bv([], { limit: 'viol == 0' }), 0, '4 zero tolerance');
  want(bv([], { limit: 'viol <= 3' }), 1, '5 viol <= 3');
  // 6 — warn_limit with no warn_limit_from_config → RED, on the warn item.
  const warn = bv([], { limit: 'viol == 0', warn_limit: 'pct >= 0' });
  want(warn, 1, '6 bare warn_limit');
  if (warn[0].item !== 'checks.pct_check.warn_limit') throw new Error('self-test FAILED (6): wrong item');
  // 7 — the RED item with a matching pending ledger row → GREEN.
  const ok = checkClosedBounds([d([], [c()])], [row]);
  if (!ok.pass || ok.unallowed.length || ok.orphans.length) throw new Error(`self-test FAILED (7): ledger-allowed violation not GREEN (${JSON.stringify(ok)})`);
  // 8 — a ledger row with NO violation is an ORPHAN → RED.
  const orph = checkClosedBounds([d([], [c({ limit: 'viol == 0' })])], [row]);
  if (orph.pass || orph.orphans.length !== 1 || !orph.detail.includes('orphan')) throw new Error(`self-test FAILED (8): orphan row not RED (${JSON.stringify(orph)})`);
  // 9 — clean fleet + no rows → GREEN.
  const clean = checkClosedBounds([d([], [c({ limit: 'viol == 0' })])], []);
  if (!clean.pass || clean.blockedSlugs.length) throw new Error(`self-test FAILED (9): clean fleet not GREEN (${JSON.stringify(clean)})`);
}

/** CLI — `--list` prints the orchestrator-pasteable row for every CURRENT unallowed violation. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('closed-bounds self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const violations = [];
    for (const d of loadConvertedDescriptors(REPO_ROOT)) violations.push(...boundViolations(d));
    const { unallowed } = matchLedger('A', violations, loadLedger(REPO_ROOT).rows);
    const out = unallowed.map((v) => ({
      gate: 'A', step: v.step, item: v.item, disposition: 'pending_remediation',
      why: (violations.find((x) => x.step === v.step && x.item === v.item) || {}).detail || '',
      closing_brief: `wf2-remediate-${kebab(v.step)}`,
      filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
    }));
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: closed-bounds.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH };
