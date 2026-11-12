// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN §5 (the nightly order, the skip rules, the disk floor).
//
// MF-79 · usage: node scripts/mctest/nightly.mjs   (npm run mctest:nightly; scheduled by the operator's launchd job)
// One run folder ~/Buildo-scratch/mctest/runs/<YYYYMMDD-HHMM>/. It never waits on a lock and never takes one: a held
// SUITE.lock, a running vitest or a running pipeline chain, or less than 60 GB free, records SKIP with the reason and stops.
// Order: one Playwright run (crawler, journeys, then the lot sweep on the test stack only) → the results page and cards.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { result, testStack } from "./lib.cjs";

const DISK_FLOOR_GB = 60;
const home = os.homedir();
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 13);
const runDir = path.join(home, "Buildo-scratch/mctest/runs", stamp);
fs.mkdirSync(runDir, { recursive: true });
const write = (r) =>
  fs.appendFileSync(
    path.join(runDir, "results.jsonl"),
    `${JSON.stringify(r)}\n`,
  );
const busy = (pattern) => spawnSync("pgrep", ["-f", pattern]).status === 0;
const freeGb = Number(
  execFileSync("df", ["-g", path.join(home, "Buildo-scratch")], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")[1]
    .split(/\s+/)[3],
);

const skip = fs.existsSync(path.join(home, "Buildo-scratch/SUITE.lock"))
  ? "SUITE.lock is held"
  : busy("vitest")
    ? "a vitest run is in progress"
    : busy("run-chain.js")
      ? "a pipeline chain (DB job) is running"
      : freeGb < DISK_FLOOR_GB
        ? `disk ${freeGb} GB free, under the ${DISK_FLOOR_GB} GB floor`
        : "";
const env = { ...process.env, MCTEST_RUN_DIR: runDir };
if (skip) {
  write(
    result({
      row: "nightly",
      owner: "MF-79",
      kase: stamp,
      status: "SKIP",
      detail: skip,
    }),
  );
} else {
  // One Playwright run: the crawler, the journeys and the lot sweep (each signed-in run skips itself without the test stack).
  spawnSync("npx", ["playwright", "test"], { stdio: "inherit", env });
  const stack = testStack(process.env);
  if (!stack.ok)
    write(
      result({
        row: "nightly",
        owner: "MF-79",
        kase: "signed-in runs, the lot sweep, S-STORAGE",
        status: "SKIP",
        detail: stack.reason,
      }),
    );
}
spawnSync("node", ["scripts/mctest/report.mjs", runDir], {
  stdio: "inherit",
  env,
});

// Keep 14 days of runs (PLAN §5); only folders this job named (YYYYMMDD-HHMM) are removed.
const runsRoot = path.dirname(runDir);
const cutoff = Date.now() - 14 * 86_400_000;
for (const d of fs.readdirSync(runsRoot)) {
  if (
    /^\d{8}-\d{4}$/.test(d) &&
    fs.statSync(path.join(runsRoot, d)).mtimeMs < cutoff
  )
    fs.rmSync(path.join(runsRoot, d), { recursive: true });
}
