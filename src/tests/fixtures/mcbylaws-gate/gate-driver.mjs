// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-LS; CARD-prepolicy-exempt (option A).
// TEST-ONLY driver: runs the gate's `main` with a bootstrap sha given as a function parameter (the CLI itself always
// uses the frozen constant and reads no environment variable). argv: <gate.mjs path> <bootstrap sha> <real|ancestry-error> ...gate args.
import { pathToFileURL } from 'node:url';

const [gatePath, bootstrap, mode, ...args] = process.argv.slice(2);
const { main } = await import(pathToFileURL(gatePath).href);
const opts = { bootstrap };
if (mode === 'ancestry-error') opts.ancestry = () => ({ status: 128 });
main(args, opts);
