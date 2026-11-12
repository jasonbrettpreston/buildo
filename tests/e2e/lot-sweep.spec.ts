// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40, FE-06; McTest PLAN §2 layer 3 (L3a), DECISIONS D-11 (a), D-12 (a);
//            walk-through rulings W-0 (a) and W-1 (a) (2026-11-12, the bounds); McStorage strategy ST-3 (S-STORAGE) and ST-5 (L3b waits).
//
// MF-80 · layer 3, L3a: lots reached the way a user reaches them, by address search, on the test stack only. Per lot: the search lands on
// the sampled lot, the payload parses, no field the screen shows is empty, and every catalogue bound holds. Which fields the screen shows
// is read from the served report page (dated 2026-11-12, MF-48 Stage B, operator "S1 a": the value parts of the lookup's `page`; a lot whose page
// is null records not_evaluated:no_page, never a pass; prior text: "from the generated report-field inventory"); a bound is on the lookup payload,
// which the screen no longer shows, so it is a data finding, labelled so. A lot with no limit
// value is not_evaluated, never a pass. Opening a lot is metered: the sweep spreads lots over the seeded sweep pool under each user's
// allowance and the 30-a-minute lookup limit; it never bypasses either. S-STORAGE reads table sizes only.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "playwright/test";
import { Client } from "pg";
import { ConsumerParcelLookupResponseSchema } from "../../src/app/api/parcels/lookup/types";
import {
  emptyShown,
  evalBound,
  shownFields,
} from "../../scripts/mctest/lib.cjs";
import { cat, persona, record, sample, SEED, stack, token } from "./mctest";

type Lot = {
  id: string;
  status: string;
  owner: string;
  count: number;
  expect: Record<string, unknown>;
};
type Bound = {
  id: string;
  status: string;
  owner: string;
  lhs: string;
  rhs: string[];
  tol: number;
  source: string;
};
const ROOT = path.resolve(__dirname, "../..");
const lotCases = (cat.lot_cases as Lot[]).filter((l) => l.status === "active");
const bounds = (cat.bounds as Bound[]).filter((b) => b.status === "active");
const PACE_MS = 2_100; // under 30 lookups a minute per user (the route's limit), so the run measures the app, not the limiter
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const replay = `MCTEST_SEED=${SEED} npm run mctest:web -- tests/e2e/lot-sweep.spec.ts`;

async function lookup(req: APIRequestContext, bearer: string, q: string) {
  const res = await req.get(`/api/parcels/lookup?q=${encodeURIComponent(q)}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

test.describe("L3a lot sweep", () => {
  test.skip(!stack.ok, String(stack.reason));
  test.setTimeout(60 * 60_000);

  test("lot cases and bounds", async ({ request }) => {
    const pool = persona("sweep_pool") as {
      count: number;
      email_pattern: string;
    };
    const users = Array.from({ length: pool.count }, (_, i) =>
      pool.email_pattern.replace("{n}", String(i + 1)),
    );
    const tokens = await Promise.all(users.map((u) => token(u)));
    const tally = new Map<
      string,
      { pass: number; fail: number; not_evaluated: number; examples: string[] }
    >();
    const note = (
      key: string,
      result: "pass" | "fail" | "not_evaluated",
      example: string,
      keep = result === "fail", // MF-48 Stage B: a closed not_evaluated reason (no_page) is kept as an example too
    ) => {
      const t = tally.get(key) ?? {
        pass: 0,
        fail: 0,
        not_evaluated: 0,
        examples: [],
      };
      t[result] += 1;
      if (keep && t.examples.length < 10) t.examples.push(example);
      tally.set(key, t);
    };

    for (const lc of lotCases) {
      const rows = await sample(lc.id, lc.count);
      // One queue per sweep user, each paced; lots spread round-robin so no user passes its allowance on a 1,000-lot night.
      const queues = tokens.map(() => [] as typeof rows);
      rows.forEach((r, i) => queues[i % tokens.length]?.push(r));
      await Promise.all(
        queues.map(async (q, u) => {
          for (const row of q) {
            const res = await lookup(
              request,
              String(tokens[u]),
              String(row.address_full),
            );
            const data = res.body?.data;
            const parsed = ConsumerParcelLookupResponseSchema.safeParse(data);
            const want = lc.expect.resolution;
            const where = `${row.parcel_id ?? ""} ${row.address_full}`;
            note(
              `${lc.id}|resolution`,
              res.status === 200 && parsed.success && data.resolution === want
                ? "pass"
                : "fail",
              `${where}: http_${res.status} ${parsed.success ? data.resolution : "schema_drift"}`,
            );
            if (lc.expect.map_lots_min)
              note(
                `${lc.id}|map_lots`,
                (data?.map?.lots?.length ?? 0) >= Number(lc.expect.map_lots_min)
                  ? "pass"
                  : "fail",
                where,
              );
            if (want === "unique" && parsed.success && data.parcel) {
              note(
                `${lc.id}|lands_on_same_parcel`,
                data.match?.parcelId === row.parcel_id ? "pass" : "fail",
                `${where}: got ${data.match?.parcelId}`,
              );
              // MF-48 Stage B: the fields the screen shows are the served page's value parts; no page (every lot until MB-44) is not_evaluated:no_page.
              const shown = shownFields(data);
              const empty = emptyShown(data);
              if (shown === null)
                note(`${lc.id}|no_empty_shown_field`, "not_evaluated", `${where}: not_evaluated:no_page`, true);
              else
                note(
                  `${lc.id}|no_empty_shown_field`,
                  empty.length ? "fail" : "pass",
                  `${where}: ${empty.join(", ")}`,
                );
              for (const b of bounds) {
                const r = evalBound(b, { parcel: data.parcel, db: row });
                note(
                  `bounds/${b.id}`,
                  r.result as "pass" | "fail" | "not_evaluated",
                  `${where}: ${r.lhs} > ${r.limit}`,
                );
              }
            }
            await sleep(PACE_MS);
          }
        }),
      );
    }

    for (const [key, t] of tally) {
      const [row, kase] = key.startsWith("bounds/")
        ? [key, "all sampled lots"]
        : [`lot_cases/${key.split("|")[0]}`, key.split("|")[1] ?? ""];
      const b = bounds.find((x) => `bounds/${x.id}` === key);
      const lc = lotCases.find((x) => row === `lot_cases/${x.id}`);
      // MF-48 Stage B: the screen shows the served page only, so a bound on the lookup payload is a data finding.
      const label = b ? "payload-only: data finding" : "";
      const detail = `pass ${t.pass}, fail ${t.fail}, not_evaluated ${t.not_evaluated}${t.examples.length ? `; e.g. ${t.examples.join(" | ")}` : ""}`;
      record({
        row,
        owner: b?.owner ?? lc?.owner ?? "MF-44",
        kase: String(kase),
        // PASS needs at least one evaluated lot: all not_evaluated is a SKIP with its count, never a pass (D-11 a; OUTPUT panel).
        status: t.fail ? "FAIL" : t.pass ? "PASS" : "SKIP",
        detail: t.fail
          ? `fail: ${detail}`
          : t.pass
            ? detail
            : `not_evaluated: ${detail}`,
        label,
        replay,
      });
    }
    expect(
      [...tally.values()].reduce(
        (n, t) => n + t.pass + t.fail + t.not_evaluated,
        0,
      ),
    ).toBeGreaterThan(0);
  });

  test("S-STORAGE", async () => {
    const s = (cat.checks as Record<string, unknown>[]).find(
      (c) => c.id === "S-STORAGE",
    ) as {
      status: string;
      owner: string;
      tables: string[];
      later_tables: string[];
      budget_setting: string;
      warn_ratio: number;
    };
    test.skip(s.status !== "active", "catalogue row checks/S-STORAGE waits");
    const stop = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "docs/reports/storage-gates/MB-27L2-G-STOR.json"),
        "utf8",
      ),
    ).stop_mib as number;
    const db = new Client({
      connectionString: process.env.MCTEST_DATABASE_URL,
    });
    await db.connect();
    try {
      await db.query("SET default_transaction_read_only = on");
      const mib = async (tables: string[]) =>
        Number(
          (
            await db.query(
              "SELECT coalesce(sum(pg_total_relation_size(to_regclass(t))), 0) / 1048576.0 AS m FROM unnest($1::text[]) t",
              [tables],
            )
          ).rows[0].m,
        );
      const l2 = await mib(s.tables);
      const l3 = await mib(s.later_tables);
      const budget = Number(
        (
          await db.query(
            "SELECT variable_value FROM logic_variables WHERE variable_key = $1",
            [s.budget_setting],
          )
        ).rows[0]?.variable_value,
      );
      const ratio = (l2 + l3) / budget;
      const ok = l2 <= stop && Number.isFinite(budget) && l2 + l3 <= budget;
      const detail = `Layer 2 ${l2.toFixed(1)} MiB (stop ${stop}); Layer 3 ${l3.toFixed(1)} MiB; budget ${budget} MB; ratio ${ratio.toFixed(3)}`;
      record({
        row: "checks/S-STORAGE",
        owner: s.owner,
        kase: "sizes",
        status: ok ? "PASS" : "FAIL",
        detail,
        label: ratio >= s.warn_ratio ? `WARN at the ${s.warn_ratio} line` : "",
      });
      expect(ok, detail).toBe(true);
    } finally {
      await db.end();
    }
  });
});
