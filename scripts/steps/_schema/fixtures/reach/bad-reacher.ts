// @ts-nocheck
// Gate A planted defect (task-367): reaches the compute core, then breaks five reused rules. Never imported by product code.
const WAIT_LIMIT = 5;
export async function badReach(url: string) {
  const core = await import('../../../../../scripts/lib/compute/demo-core.js');
  console.log('narration');
  const t = Date.now();
  const res = await fetch(url);
  const key = process.env.SECRET;
  return { core, t, res, key, WAIT_LIMIT };
}
