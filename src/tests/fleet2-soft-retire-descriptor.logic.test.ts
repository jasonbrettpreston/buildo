// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md; registry-truth plan fold 10 (soft-retire) items 1/3/4, fold 15 (default 0.02) — the REAL load_address_points descriptor + seed declare retract "departed_mark"
//
// RED-FIRST (B-1): `scripts/load-address-points.descriptor.json` today declares
// `outputs.writes[0].retract === "none"`, `write_inventory.statements === 1`, `inputs.reads.tables: []`
// and NO `retired_at` column; the real seed carries no `address_points_mass_retire_max_pct` key. Every
// assertion below drives the REAL files on disk (never a fixture of them), so each `it` names exactly
// one clause of the soft-retire declaration and is expected to FAIL until the descriptor/seed land.
//
// The declaration shape is fixed by the lib schema's `x-rule` for retract `departed_mark`: a
// single-column key, `write_discipline.class === "guarded_upsert"`, a declared `retired_at` column
// written `insert_only`, a `retire_max_pct_from_config` binding, and a guarded `retired_at` column
// that is NOT part of the IS DISTINCT FROM guard set.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();

const DESCRIPTOR_REL = 'scripts/load-address-points.descriptor.json';
const SEED_REL = 'scripts/seeds/logic_variables.json';

const RETIRE_VAR = 'address_points_mass_retire_max_pct';
const RETIRED_AT = 'retired_at';

interface WriteColumn {
  name: string;
  vocabulary?: string;
  written?: string;
  [k: string]: unknown;
}

interface WriteDiscipline {
  class: string;
  guard?: string;
  guard_columns?: string[];
  [k: string]: unknown;
}

interface Write {
  table: string;
  key: string;
  columns: WriteColumn[];
  write_discipline: WriteDiscipline;
  retract: string;
  retire_max_pct_from_config?: string;
  [k: string]: unknown;
}

interface ReadTable {
  table: string;
  columns: string[];
  [k: string]: unknown;
}

interface LogicVariable {
  name: string;
  min?: number;
  max?: number;
  on_invalid?: string;
  [k: string]: unknown;
}

interface Descriptor {
  outputs: {
    writes: Write[];
    write_inventory: { statements: number; [k: string]: unknown };
  };
  inputs: { reads: { tables: ReadTable[]; [k: string]: unknown } };
  config: { logic_variables: LogicVariable[] };
}

interface SeedEntry {
  default: number;
  type?: string;
  description?: string;
  min?: number;
  max?: number;
  admin?: { group?: string };
}

function readJson<T>(rel: string): T {
  const raw = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  return JSON.parse(raw) as T;
}

function descriptor(): Descriptor {
  return readJson<Descriptor>(DESCRIPTOR_REL);
}

function addressPointsWrite(): Write {
  const writes = descriptor().outputs.writes;
  const write = writes.find((w) => w.table === 'address_points');
  expect(write, `${DESCRIPTOR_REL}: outputs.writes has no entry for table "address_points"`).toBeDefined();
  return write as Write;
}

function seedEntry(name: string): SeedEntry | undefined {
  const seeds = readJson<Record<string, SeedEntry>>(SEED_REL);
  return seeds[name];
}

describe('fleet2 soft-retire — the REAL address_points descriptor declares the soft-retire (fold 10)', () => {
  it('1. outputs.writes[0].retract is "departed_mark"', () => {
    const write = addressPointsWrite();
    expect(
      write.retract,
      `${DESCRIPTOR_REL}: address_points outputs.writes[].retract must be "departed_mark" (fold 10 item 1), got ${JSON.stringify(write.retract)}`,
    ).toBe('departed_mark');
  });

  it('2. outputs.writes[0].retire_max_pct_from_config binds to address_points_mass_retire_max_pct', () => {
    const write = addressPointsWrite();
    expect(
      write.retire_max_pct_from_config,
      `${DESCRIPTOR_REL}: address_points outputs.writes[].retire_max_pct_from_config must be "${RETIRE_VAR}" (fold 10 item 1)`,
    ).toBe(RETIRE_VAR);
  });

  it('3. columns declare retired_at written insert_only (vocabulary none) and it is NOT a guard column', () => {
    const write = addressPointsWrite();
    const retiredAt = write.columns.find((c) => c.name === RETIRED_AT);
    expect(
      retiredAt,
      `${DESCRIPTOR_REL}: address_points outputs.writes[].columns must contain a "${RETIRED_AT}" entry (fold 10 item 3)`,
    ).toBeDefined();
    expect(
      retiredAt?.vocabulary,
      `${DESCRIPTOR_REL}: ${RETIRED_AT} must declare vocabulary "none"`,
    ).toBe('none');
    expect(
      retiredAt?.written,
      `${DESCRIPTOR_REL}: ${RETIRED_AT} must be written "insert_only"`,
    ).toBe('insert_only');
    const guardColumns = write.write_discipline.guard_columns ?? [];
    expect(
      guardColumns,
      `${DESCRIPTOR_REL}: write_discipline.guard_columns must NOT contain "${RETIRED_AT}" (a retired_at column cannot be part of the IS DISTINCT FROM guard set)`,
    ).not.toContain(RETIRED_AT);
  });

  it('4. config.logic_variables declares address_points_mass_retire_max_pct { min 0, max 1, on_invalid "fail" }', () => {
    const vars = descriptor().config.logic_variables;
    const entry = vars.find((v) => v.name === RETIRE_VAR);
    expect(
      entry,
      `${DESCRIPTOR_REL}: config.logic_variables must declare "${RETIRE_VAR}" (fold 10 item 4)`,
    ).toBeDefined();
    expect(entry?.min, `${DESCRIPTOR_REL}: ${RETIRE_VAR}.min must be 0`).toBe(0);
    expect(entry?.max, `${DESCRIPTOR_REL}: ${RETIRE_VAR}.max must be 1`).toBe(1);
    expect(entry?.on_invalid, `${DESCRIPTOR_REL}: ${RETIRE_VAR}.on_invalid must be "fail"`).toBe('fail');
  });

  it('5. the seed entry address_points_mass_retire_max_pct exists with default 0.02, min 0, max 1', () => {
    const entry = seedEntry(RETIRE_VAR);
    expect(
      entry,
      `${SEED_REL}: seed "${RETIRE_VAR}" must exist (fold 15 default 0.02)`,
    ).toBeDefined();
    expect(entry?.default, `${SEED_REL}: ${RETIRE_VAR}.default must be 0.02`).toBe(0.02);
    expect(entry?.min, `${SEED_REL}: ${RETIRE_VAR}.min must be 0`).toBe(0);
    expect(entry?.max, `${SEED_REL}: ${RETIRE_VAR}.max must be 1`).toBe(1);
  });

  it('6. outputs.write_inventory.statements is 3 (guarded upsert + UNMARK UPDATE + MARK UPDATE)', () => {
    const statements = descriptor().outputs.write_inventory.statements;
    expect(
      statements,
      `${DESCRIPTOR_REL}: outputs.write_inventory.statements must be 3 (fold 10 item 1), got ${JSON.stringify(statements)}`,
    ).toBe(3);
  });

  it('7. inputs.reads.tables declares address_points with columns address_point_id and retired_at', () => {
    const tables = descriptor().inputs.reads.tables;
    const read = tables.find((t) => t.table === 'address_points');
    expect(
      read,
      `${DESCRIPTOR_REL}: inputs.reads.tables must contain an entry { table: "address_points", columns: [...] } (fold 10 item 3)`,
    ).toBeDefined();
    expect(
      read?.columns,
      `${DESCRIPTOR_REL}: inputs.reads.tables[address_points].columns must include "address_point_id"`,
    ).toContain('address_point_id');
    expect(
      read?.columns,
      `${DESCRIPTOR_REL}: inputs.reads.tables[address_points].columns must include "${RETIRED_AT}"`,
    ).toContain(RETIRED_AT);
  });
});
