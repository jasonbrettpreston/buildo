// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7
//            (W1-W9 and D1-D4); McTest DECISIONS D-8 (a), D-13 (a).
//
// MF-79 · layer 2, the dead-wire crawler, and J-PIN. The pages come from schemas, never a hand list: the maxbld.ca host table
// (MAXBLD_ROUTES, API rows excluded) and the catalogue's admin pages (§11b.7 D1-D4). Per page and persona it fails on an HTTP
// error, an uncaught page error, a console error, visible broken text (the catalogue's regex) or a link that answers 4xx/5xx.
// While MAXBLD_WEB_LIVE is false the /parcel-tool pages prove the gate only and are labelled "gate-only".
import { expect, test, type Page } from "playwright/test";
import { MAXBLD_ROUTES } from "../../src/lib/auth/host-policy";
import { MAXBLD_WEB_LIVE } from "../../src/lib/surfaces/maxbld-web";
import { brokenText } from "../../scripts/mctest/lib.cjs";
import { cat, persona, record, stack } from "./mctest";

const C = cat.crawler as {
  id: string;
  status: string;
  owner: string;
  personas: string[];
  fail_on: { http_status_min: number; visible_text_regex: string };
  admin_pages: { route: string }[];
};
const ROW = `crawler/${C.id}`;
const SAMPLE = process.env.MCTEST_SAMPLE_PARCEL_ID ?? "0";
const pages = [
  ...MAXBLD_ROUTES.filter(
    (r) => !r.path.startsWith("/api/") && r.path !== "/auth/callback",
  ).map((r) => `http://maxbld.ca${r.path}`),
  `http://maxbld.ca/parcel-tool/${SAMPLE}`,
  ...C.admin_pages.map((p) => p.route),
];
const gateOnly = (url: string) =>
  !MAXBLD_WEB_LIVE && url.includes("maxbld.ca/parcel-tool");
const checkedLinks = new Map<string, number>();

async function signIn(page: Page, origin: string, id: string) {
  await page.goto(`${origin}/login`);
  await page
    .getByLabel(/email/i)
    .first()
    .fill(String(persona(id).email));
  await page
    .getByLabel(/password/i)
    .first()
    .fill(String(process.env.MCTEST_PASSWORD ?? ""));
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login")),
    page.keyboard.press("Enter"),
  ]);
}

async function crawl(page: Page, url: string): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page_error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console_error: ${m.text()}`);
  });
  const res = await page.goto(url, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  if (status >= C.fail_on.http_status_min)
    problems.push(`http_${status}: ${url}`);
  for (const w of brokenText(
    await page.locator("body").innerText(),
    C.fail_on.visible_text_regex,
  ))
    problems.push(`broken_text: "${w}"`);
  const origin = new URL(page.url()).origin;
  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => (a as HTMLAnchorElement).href),
  );
  for (const href of new Set(hrefs.filter((h) => h.startsWith(origin)))) {
    if (!checkedLinks.has(href))
      checkedLinks.set(
        href,
        (await page.request.get(href, { maxRedirects: 5 })).status(),
      );
    const s = checkedLinks.get(href) ?? 0;
    if (s >= C.fail_on.http_status_min)
      problems.push(`dead_link_${s}: ${href}`);
  }
  return problems;
}

for (const who of C.personas) {
  test.describe(`C-DEAD-WIRE as ${who}`, () => {
    test.skip(C.status !== "active", `catalogue row ${ROW} waits`);
    test.skip(who !== "anonymous" && !stack.ok, String(stack.reason));
    for (const url of pages) {
      test(`${who} ${url}`, async ({ page }) => {
        if (who !== "anonymous")
          await signIn(page, new URL(url, "http://127.0.0.1").origin, who);
        const problems = await crawl(page, url);
        const labels = [
          gateOnly(url) ? "gate-only" : "",
          stack.ok ? "" : "no-DB",
        ]
          .filter(Boolean)
          .join(", ");
        record({
          row: ROW,
          owner: C.owner,
          kase: `${who} ${url}`,
          status: problems.length ? "FAIL" : "PASS",
          detail: problems.join(" | "),
          label: labels,
          replay: `npm run mctest:web -- -g "${who} ${url}"`,
        });
        expect(problems).toEqual([]);
      });
    }
  });
}

const pin = (
  cat.journeys as {
    id: string;
    personas: string[];
    steps: Record<string, string>[];
  }[]
).find((j) => j.id === "J-PIN");
test.describe("J-PIN", () => {
  const step = pin?.steps[0] ?? {};
  test.skip(step.status !== "active", `catalogue row journeys/J-PIN waits`);
  test.skip(!stack.ok, String(stack.reason));
  test("the report page follows the live switch", async ({ page }) => {
    await signIn(page, "http://maxbld.ca", pin?.personas[0] ?? "paid");
    const status =
      (await page.goto(`http://maxbld.ca/parcel-tool/${SAMPLE}`))?.status() ??
      0;
    const want = MAXBLD_WEB_LIVE ? 200 : 404; // read from the switch, never typed (plan J-PIN)
    record({
      row: "journeys/J-PIN/report_follows_live_switch",
      owner: step.owner ?? "MF-44",
      kase: "paid",
      status: status === want ? "PASS" : "FAIL",
      detail: `http_${status} (want ${want})`,
      label: "gate-only",
    });
    expect(status).toBe(want);
  });
});
