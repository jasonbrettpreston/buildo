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
const auditSource = () => fs.readFileSync(AUDIT_PATH, 'utf-8');
const dumpSource = () => fs.readFileSync(DUMP_PATH, 'utf-8');

describe('parcel-sanity-audit.js — C6 CLI pool (DATABASE_URL-aware, target always logged)', () => {
  it('exports makeCliPool and honors process.env.DATABASE_URL with ssl-config TLS', () => {
    const source = auditSource();
    expect(source).toMatch(/function makeCliPool/);
    expect(source).toMatch(/process\.env\.DATABASE_URL/);
    expect(source).toMatch(/resolveSslConfig\(\{\s*connectionString\s*\}\)/);
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*makeCliPool/);
  });

  it('logs which DB it is grading on BOTH branches — the silence was the blind spot', () => {
    const source = auditSource();
    const fnBody = source.slice(source.indexOf('function makeCliPool'), source.indexOf('function makeCliPool') + 1200);
    expect(fnBody).toMatch(/grading DATABASE_URL target/);
    expect(fnBody).toMatch(/grading the default local dev DB/);
  });

  it('redacts the connection-string password before logging it', () => {
    const source = auditSource();
    expect(source).toMatch(/\.replace\(.*\*\*\*/);
    // no branch logs the raw connectionString variable directly
    expect(source).not.toMatch(/console\.log\(`?.*\$\{connectionString\}/);
  });

  it('runAudit uses makeCliPool — the hardcoded localhost Pool literal is gone from the entrypoint', () => {
    const source = auditSource();
    const runAuditBody = source.slice(source.indexOf('async function runAudit'));
    expect(runAuditBody).toMatch(/makeCliPool\('parcel-sanity-audit'\)/);
    expect(runAuditBody).not.toMatch(/new Pool\(\{\s*host/);
  });

  it('distribution sample-picker carries the id tiebreaker for reproducible output', () => {
    const source = auditSource();
    expect(source).toMatch(/array_agg\(b\.id ORDER BY b\.f DESC, b\.id\)/);
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
});
