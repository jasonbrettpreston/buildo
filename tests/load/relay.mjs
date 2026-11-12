// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 5; plan MF81-4 (a), operator "MF81 all a".
//
// MF-81 · the drill relay: a TCP relay between the drill's own app and the test-stack Postgres, so DB slow and DB down need no DB write
// and no container change. Modes: "pass" forwards; "slow" delays every database reply by delayMs; "down" closes every open connection
// and drops new ones; cutOn(re) forwards until a query matching re is sent, then goes "down" (the DB lost after sign-in passed).
// Replies on one connection always keep their order, across mode switches. It listens on loopback only and ends when closed.
import net from "node:net";

/**
 * @param {{ listenPort: number, target: { host: string, port: number }, delayMs?: number }} o
 * @returns {Promise<{ setMode: (m: "pass" | "slow" | "down") => void, cutOn: (re: RegExp) => void, close: () => Promise<void>, port: number }>}
 */
export function startRelay({ listenPort, target, delayMs = 3000 }) {
  let mode = "pass";
  let cut = null;
  const open = new Set();
  const destroyAll = () => {
    for (const p of open) p.end();
  };
  const server = net.createServer((client) => {
    if (mode === "down") return client.destroy();
    const upstream = net.connect(target.port, target.host);
    const timers = new Set();
    let due = 0; // when this connection's last reply is written: a later reply is never written before it
    const pair = {
      end: () => {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        client.destroy();
        upstream.destroy();
        open.delete(pair);
      },
    };
    open.add(pair);
    client.on("error", pair.end).on("close", pair.end);
    upstream.on("error", pair.end).on("close", pair.end);
    client.on("data", (chunk) => {
      if (cut && cut.test(chunk.toString("latin1"))) {
        mode = "down";
        cut = null;
        return destroyAll();
      }
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      const now = Date.now();
      due = Math.max(now + (mode === "slow" ? delayMs : 0), due);
      if (due <= now) return client.write(chunk);
      const t = setTimeout(() => {
        timers.delete(t);
        if (!client.destroyed) client.write(chunk);
      }, due - now);
      timers.add(t);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () =>
      resolve({
        port: /** @type {net.AddressInfo} */ (server.address()).port,
        setMode(m) {
          mode = m;
          cut = null;
          if (m === "down") destroyAll();
        },
        cutOn(re) {
          mode = "pass";
          cut = re;
        },
        close: () =>
          new Promise((r) => {
            destroyAll();
            server.close(() => r());
          }),
      }),
    );
  });
}
