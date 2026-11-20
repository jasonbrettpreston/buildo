// @ts-nocheck
// Gate B clean twin (task-367): zero, one, indices and served numbers only; no factor, no timer constant, no retry count in code.
export function pick(list: string[]) { return list.length > 0 ? list[0] : null; }
export function show(served: { sqm: string; sqft: string }, metric: boolean) { return metric ? served.sqm : served.sqft; }
export const opts = { staleTime: 0 };
