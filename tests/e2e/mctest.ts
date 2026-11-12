// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3.
//
// MF-79 · what every McTest spec shares: the catalogue, the test-stack decision and the one results file.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { readCatalogue, result, testStack } from "../../scripts/mctest/lib.cjs";

export const cat = readCatalogue();
export const stack: { ok: boolean; reason?: string } = testStack(process.env);
export const RUN_DIR = process.env.MCTEST_RUN_DIR ?? "";

export type Line = {
  row: string;
  owner: string;
  kase: string;
  status: "PASS" | "FAIL" | "SKIP" | "WAITS";
  detail?: string;
  label?: string;
  replay?: string;
};

/** Appends one result line (scripts/mctest/lib.cjs result) to <run>/results.jsonl; without a run dir the line is only returned. */
export function record(r: Line) {
  const line = (result as (x: Line) => unknown)(r);
  if (RUN_DIR) {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(RUN_DIR, "results.jsonl"),
      `${JSON.stringify(line)}\n`,
    );
  }
  return line;
}

/** A persona row by id; throws on a missing id (the catalogue lock keeps ids stable). */
export function persona(id: string): Record<string, unknown> {
  const p = (cat.personas as Record<string, unknown>[]).find(
    (x) => x.id === id,
  );
  if (!p) throw new Error(`persona ${id} not in the catalogue`);
  return p;
}

/**
 * Runs one test body; a throw (a dead server, a failed sign-in or sample, a timeout) is recorded as a FAIL line before it is rethrown,
 * so no outcome is silent (OUTPUT panel, observability F2).
 */
export async function guarded<T>(
  row: string,
  owner: string,
  kase: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    record({
      row,
      owner,
      kase,
      status: "FAIL",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}

/** The rows of a lot case's catalogue SQL ($1 the seed, $2 the count), read in a read-only session on the test stack only. */
/** The night's sample seed (logged in every replay command, so a failure replays on the same lots). */
export const SEED =
  process.env.MCTEST_SEED ?? new Date().toISOString().slice(0, 10);

export async function sample(
  caseId: string,
  count: number,
): Promise<Record<string, string | null>[]> {
  if (!stack.ok) throw new Error(String(stack.reason));
  const sql = (cat.lot_cases as { id: string; sql?: string }[]).find(
    (l) => l.id === caseId,
  )?.sql;
  if (!sql) throw new Error(`lot case ${caseId} has no sql`);
  const db = new Client({ connectionString: process.env.MCTEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query("SET default_transaction_read_only = on");
    return (await db.query(sql, [SEED, count])).rows;
  } finally {
    await db.end();
  }
}

/** A seeded persona's access token from the test stack's own sign-in service (D-3 a: sign-in itself is exercised). */
export async function token(email: string): Promise<string> {
  const res = await fetch(
    `${process.env.MCTEST_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: String(process.env.MCTEST_SUPABASE_ANON_KEY),
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password: process.env.MCTEST_PASSWORD }),
    },
  );
  if (!res.ok) throw new Error(`sign_in_${res.status}`);
  return (await res.json()).access_token as string;
}
