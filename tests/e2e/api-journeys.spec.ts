// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7
//            (dated note 2026-11-11, MF-45: the plan gate and the report allowance); McTest DECISIONS D-1 (a), D-3 (a), D-12 (a).
//
// MF-79 · layer 1, J-API: per persona, entitlement → search by address → open the lot (counted) → reopen it (not counted again)
// → a new lot at the cap (403 REPORT_LIMIT_REACHED). The expectations are the persona rows' `expect`, never typed here. Signed-in
// personas sign in through the test stack's own sign-in service; without the test stack they are SKIP with the reason.
// The anonymous persona needs no database and runs always.
import { expect, test, type APIRequestContext } from "playwright/test";
import { ConsumerParcelLookupResponseSchema } from "../../src/app/api/parcels/lookup/types";
import { cat, persona, record, sample, stack, token as signIn } from "./mctest";

type Step = {
  step: string;
  owner: string;
  status: string;
  personas_only?: string[];
};
const J = (
  cat.journeys as { id: string; personas: string[]; steps: Step[] }[]
).find((j) => j.id === "J-API");
const stepOf = (name: string) => J?.steps.find((s) => s.step === name);
/** Two sampled lots (L-RANDOM's catalogue SQL): [0] opened and reopened, [1] the new lot at the cap. */
const sampleLots = async () =>
  (await sample("L-RANDOM", 2)).map((r) => ({
    address: String(r.address_full),
    parcelId: String(r.parcel_id),
  }));

async function call(
  req: APIRequestContext,
  path: string,
  bearer: string | null,
) {
  const res = await req.get(path, {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
  const body = await res.json().catch(() => null);
  return {
    status: res.status(),
    body,
    code: body?.error?.code as string | undefined,
  };
}

/** What a persona's lookup answers: its `expect.lookup_api` (401, 403_<CODE>, 200), else the lot is shown (200). */
function wanted(e: Record<string, string>): {
  status: number;
  code?: string | undefined;
} {
  const raw = String(e.lookup_api ?? "200");
  const [s, code] = raw.split(/_(.+)/);
  return { status: Number(s), code };
}

for (const id of J?.personas ?? []) {
  test(`J-API ${id}`, async ({ request }) => {
    test.skip(
      !J || J.steps.every((s) => s.status !== "active"),
      "catalogue row journeys/J-API waits",
    );
    test.skip(id !== "anonymous" && !stack.ok, String(stack.reason));
    const p = persona(id);
    const e = (p.expect ?? {}) as Record<string, string>;
    const lots =
      id === "anonymous"
        ? [
            { address: "100 Queen St W", parcelId: "0" },
            { address: "", parcelId: "1" },
          ]
        : await sampleLots();
    const bearer = id === "anonymous" ? null : await signIn(String(p.email));
    const want = wanted(e);
    const outcomes: [string, boolean, string][] = [];
    const usage = async () =>
      (await call(request, "/api/parcels/entitlement", bearer)).body?.data
        ?.reportsUsed ?? null;
    const check = (step: string, ok: boolean, detail: string) =>
      outcomes.push([step, ok, detail]);

    const ent = await call(request, "/api/parcels/entitlement", bearer);
    check(
      "entitlement",
      ent.status === (bearer ? 200 : 401),
      `http_${ent.status}`,
    );
    const lot = lots[0] ?? { address: "", parcelId: "" };
    const before = bearer ? await usage() : null;
    const search = await call(
      request,
      `/api/parcels/lookup?q=${encodeURIComponent(lot.address)}`,
      bearer,
    );
    const atCap = e.new_lot === "403_REPORT_LIMIT_REACHED";
    if (want.status !== 200 || atCap) {
      const s = atCap ? { status: 403, code: "REPORT_LIMIT_REACHED" } : want;
      check(
        "search",
        search.status === s.status && (!s.code || search.code === s.code),
        `http_${search.status} ${search.code ?? ""} (want ${s.status} ${s.code ?? ""})`,
      );
    } else {
      const parsed = ConsumerParcelLookupResponseSchema.safeParse(
        search.body?.data,
      );
      const lands =
        parsed.success && parsed.data.match?.parcelId === lot.parcelId;
      check(
        "search",
        search.status === 200 && lands,
        `http_${search.status} ${parsed.success ? `lands_${lands}` : "schema_drift"}`,
      );
      const afterOpen = await usage();
      const metered = e.meter !== "unmetered";
      check(
        "open_lot",
        afterOpen === (before ?? 0) + (metered ? 1 : 0),
        `reportsUsed ${before} -> ${afterOpen}`,
      );
      const reopen = await call(
        request,
        `/api/parcels/lookup?parcelId=${encodeURIComponent(lot.parcelId)}`,
        bearer,
      );
      const afterReopen = await usage();
      check(
        "reopen_lot",
        reopen.status === 200 && afterReopen === afterOpen,
        `http_${reopen.status} reportsUsed ${afterOpen} -> ${afterReopen}`,
      );
    }
    if (stepOf("new_lot_at_cap")?.personas_only?.includes(id)) {
      const next = await call(
        request,
        `/api/parcels/lookup?parcelId=${encodeURIComponent(lots[1]?.parcelId ?? "")}`,
        bearer,
      );
      check(
        "new_lot_at_cap",
        next.status === 403 &&
          next.code === "REPORT_LIMIT_REACHED" &&
          !next.body?.data,
        `http_${next.status} ${next.code ?? ""}`,
      );
    }
    for (const [step, ok, detail] of outcomes) {
      const s = stepOf(step);
      record({
        row: `journeys/J-API/${step}`,
        owner: s?.owner ?? "MF-45",
        kase: id,
        status: ok ? "PASS" : "FAIL",
        detail: ok ? "" : detail,
        label: stack.ok ? "" : "no-DB",
        replay: `npm run mctest:web -- -g "J-API ${id}"`,
      });
    }
    expect(outcomes.filter(([, ok]) => !ok)).toEqual([]);
  });
}
