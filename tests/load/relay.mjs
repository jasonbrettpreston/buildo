// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 5; plan MF81-4 (a), operator "MF81 all a".
//
// MF-81 · the drill relay: a TCP relay between the drill's own app and the test-stack Postgres, so DB slow and DB down need no DB write
// and no container change. Modes: "pass" forwards; "slow" delays every database reply by delayMs; "down" closes every open connection
// and drops new ones; cutOn(re) forwards until a query matching re is sent, then goes "down" (the DB lost after sign-in passed).
// Replies on one connection always keep their order, across mode switches. It listens on loopback only and ends when closed.
import net from "node:net";

/**
 * @param {{ listenPort: number, target: { host: string, port: number }, delayMs?: number, onReply?: (chunk: Buffer) => void }} o
 *   onReply: called with each database reply as it arrives, before it is scheduled (the canaries drive mode switches from it).
 * @returns {Promise<{ setMode: (m: "pass" | "slow" | "down") => void, cutOn: (re: RegExp) => void, close: () => Promise<void>, port: number }>}
 */
export function startRelay({ listenPort, target, delayMs = 3000, onReply }) {
  let mode = "pass";
  let cut = null;
  const open = new Set();
  const destroyAll = () => {
    for (const p of open) p.end();
  };
  const server = net.createServer((client) => {
    if (mode === "down") return client.destroy();
    const upstream = net.connect(target.port, target.host);
    // One FIFO queue of replies per connection: only the head is ever written, and only once its own time has come, so a later
    // reply (even one sent in "pass") waits for every earlier one: order holds by construction, whatever the timing or load.
    const queue = [];
    let timer = null;
    const pump = () => {
      timer = null;
      while (queue.length) {
        const wait = queue[0].at - Date.now();
        if (wait > 0) {
          timer = setTimeout(pump, wait);
          return;
        }
        const { chunk } = queue.shift();
        if (!client.destroyed) client.write(chunk);
      }
    };
    const pair = {
      end: () => {
        if (timer) clearTimeout(timer);
        timer = null;
        queue.length = 0;
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
      onReply?.(chunk);
      queue.push({ chunk, at: Date.now() + (mode === "slow" ? delayMs : 0) });
      if (!timer) pump();
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
