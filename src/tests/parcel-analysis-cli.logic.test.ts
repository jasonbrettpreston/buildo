// SPEC LINK: docs/specs/00-architecture/08_agents.md (A7 Reality-Check instruments)
//
// Source-scan + pure-logic locks for the Reality-Check reviewer's instruments
// (scripts/analysis/parcel-sanity-audit.js + parcel-field-dump.js), P4-F0
// fold C6: the CLI entrypoints must honor DATABASE_URL (cloud-capable, TLS
// via ssl-config) instead of a silent hardcoded localhost pool, must LOG the
// graded target, and the distribution sample-picker must be deterministic
// (id tiebreaker). parcel-field-dump.js is scanned as SOURCE, never
// require()'d — it fires a module-scope IIFE that connects to a real DB.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const AUDIT_PATH = path.resolve(__dirname, '../../scripts/analysis/parcel-sanity-audit.js');
const DUMP_PATH = path.resolve(__dirname, '../../scripts/analysis/parcel-field-dump.js');
// R-T addendum, commit 2 — the distribution-scan query (incl. the id tiebreaker) is
// extracted to scripts/lib/step/plausibility.js (Fold A-4d/B-7: "extract once, both
// sides import"); parcel-sanity-audit.js no longer carries this SQL text itself.
const PLAUSIBILITY_PATH = path.resolve(__dirname, '../../scripts/lib/step/plausibility.js');
const auditSource = () => fs.readFileSync(AUDIT_PATH, 'utf-8');
const dumpSource = () => fs.readFileSync(DUMP_PATH, 'utf-8');
const plausibilitySource = () => fs.readFileSync(PLAUSIBILITY_PATH, 'utf-8');

describe('parcel-sanity-audit.js — C6 CLI pool (DATABASE_URL-aware, target always logged)', () => {
  // ── WHY THESE THREE CHANGED (WF3 2026-08-23, Spec 122 §P0) ────────────────
  // The C6 fold (P4-F0, Reality-Check) put three properties on makeCliPool:
  // DATABASE_URL-aware with ssl-config TLS · logs its target on BOTH branches ·
  // redacts the password. All three are PRESERVED — makeCliPool now delegates
  // to scripts/lib/resolve-db.js, which does each one for every caller — so the
  // assertions follow the behaviour to its new home instead of being deleted.
  //
  // The ONE property knowingly retired is C6's second branch: "grading the
  // default local dev DB (localhost:5432/buildo)". C6 fixed the SILENCE but
  // kept the wrong DEFAULT, so this audit still graded the 222-migration
  // pre-cutover DB whenever DATABASE_URL was unset — it just announced it
  // while doing so. Measured 2026-08-23: 2,394 HIGH/MED violations on that DB
  // vs 30,288 on the authoritative one, and max_build_dim_below_floor read
  // 0 — PASS instead of 27,984 — GATE→FAIL. Announcing a wrong answer is not
  // transparency. There is now no second branch to log.
  const resolverSource = () =>
    fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/resolve-db.js'), 'utf-8');

  it('exports makeCliPool, which resolves DATABASE_URL with ssl-config TLS via the shared resolver', () => {
    const source = auditSource();
    expect(source).toMatch(/function makeCliPool/);
    expect(source).toMatch(/createResolvedPool\(\{\s*label\s*\}\)/);
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*makeCliPool/);
    const resolver = resolverSource();
    expect(resolver).toMatch(/DATABASE_URL/);
    expect(resolver).toMatch(/resolveSslConfig\(\{\s*connectionString\s*\}\)/);
  });

  it('still logs which DB it is grading — and now REFUSES rather than defaulting', () => {
    const resolver = resolverSource();
    // The log is unconditional, not per-branch: every resolution prints the
    // database, user and migration depth actually connected to.
    expect(resolver).toMatch(/\$\{label\}\] target: \$\{description\} → database=/);
    // The retired branch must not come back.
    expect(auditSource()).not.toMatch(/grading the default local dev DB/);
    expect(resolver).toMatch(/no explicit database target/);
  });

  it('redacts the connection-string password before logging it', () => {
    const resolver = resolverSource();
    expect(resolver).toMatch(/\.replace\(.*\*\*\*/);
    // no branch logs the raw connectionString variable directly
    expect(resolver).not.toMatch(/console\.log\(`?.*\$\{connectionString\}/);
    expect(auditSource()).not.toMatch(/console\.log\(`?.*\$\{connectionString\}/);
  });

  it('runAudit uses makeCliPool — the hardcoded localhost Pool literal is gone from the entrypoint', () => {
    const source = auditSource();
    const runAuditBody = source.slice(source.indexOf('async function runAudit'));
    expect(runAuditBody).toMatch(/makeCliPool\('parcel-sanity-audit'\)/);
    expect(runAuditBody).not.toMatch(/new Pool\(\{\s*host/);
  });

  it('distribution sample-picker carries the id tiebreaker for reproducible output (R-T addendum, commit 2: now in plausibility.js, not the audit CLI)', () => {
    expect(plausibilitySource()).toMatch(/array_agg\(b\.id ORDER BY b\.f DESC, b\.id\)/);
    // the audit CLI no longer carries this SQL text itself — it calls runDistributionScan
    expect(auditSource()).not.toMatch(/array_agg\(b\.id ORDER BY b\.f DESC, b\.id\)/);
    // batch2 P1.1 (2026-09-18, Rule 3): the call now threads the 3 registered
    // parcel_sanity_distribution_* logic variables from the resolved `config`
    // object as a 5th argument — the call SITE is still exactly one line, still
    // the direct re-export target, only the trailing literal changed.
    expect(auditSource()).toMatch(/runDistributionScan\(pool, DIST_FIELDS, RES, ZC, \{/);
  });
});

describe('parcel-field-dump.js — C6 shares the sanity audit CLI pool', () => {
  it('imports makeCliPool from parcel-sanity-audit.js and uses it as the entrypoint pool', () => {
    const source = dumpSource();
    expect(source).toMatch(/makeCliPool\s*\}\s*=\s*require\(['"]\.\/parcel-sanity-audit\.js['"]\)/);
    expect(source).toMatch(/makeCliPool\('parcel-field-dump'\)/);
  });

  it('no longer constructs a hardcoded localhost Pool of its own', () => {
    const source = dumpSource();
    expect(source).not.toMatch(/new Pool\(/);
    expect(source).not.toMatch(/require\(['"]pg['"]\)/);
  });

  it('Round-3 RC: the CLEAN-parcel auto-picker is deterministic (md5(id) spread, never ORDER BY random())', () => {
    const source = dumpSource();
    expect(source).not.toMatch(/ORDER BY random\(\)/);
    expect(source).toMatch(/ORDER BY md5\(id::text\)/);
  });
});
