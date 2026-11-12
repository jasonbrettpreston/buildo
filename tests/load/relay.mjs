// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN Layer 5; plan MF81-4 (a), operator "MF81 all a".
//
// MF-81 · the drill relay: a TCP relay between the drill's own app and the test-stack Postgres, so DB slow and DB down need no DB write
// and no container change. Modes: "pass" forwards; "slow" delays every database reply by delayMs; "down" closes every open connection
// and drops new ones. It listens on loopback only and ends when closed.
import net from "node:net";

/**
 * @param {{ listenPort: number, target: { host: string, port: number }, delayMs?: number }} o
 * @returns {Promise<{ setMode: (m: "pass" | "slow" | "down") => void, close: () => Promise<void>, port: number }>}
 */
export function startRelay({ listenPort, target, delayMs = 3000 }) {
  let mode = "pass";
  const open = new Set();
  const server = net.createServer((client) => {
    if (mode === "down") return client.destroy();
    const upstream = net.connect(target.port, target.host);
    const pair = { client, upstream };
    open.add(pair);
    const end = () => {
      client.destroy();
      upstream.destroy();
      open.delete(pair);
    };
    client.on("error", end).on("close", end);
    upstream.on("error", end).on("close", end);
    client.on("data", (chunk) => upstream.write(chunk));
    // One fixed delay per reply keeps the order (timers with the same delay fire in order).
    upstream.on("data", (chunk) =>
      mode === "slow"
        ? setTimeout(() => client.destroyed || client.write(chunk), delayMs)
        : client.write(chunk),
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () =>
      resolve({
        port: /** @type {net.AddressInfo} */ (server.address()).port,
        setMode(m) {
          mode = m;
          if (m === "down")
            for (const { client, upstream } of open) {
              client.destroy();
              upstream.destroy();
            }
        },
        close: () =>
          new Promise((r) => {
            for (const { client, upstream } of open) {
              client.destroy();
              upstream.destroy();
            }
            server.close(() => r());
          }),
      }),
    );
  });
}
