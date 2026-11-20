// @ts-nocheck
// Gate B planted defects (task-367): a unit-conversion factor in code (fe.44), and the informational classes (UPPER_SNAKE wait, timer, retry count, query option).
const SQFT_PER_SQM = 10.7639;
export const SLOW_WAIT_MS = 45_000;
export function toFeet(m: number) { return m * 3.28084; }
export function later(cb: () => void) { setTimeout(cb, 2500); }
export function shouldRetry(failureCount: number) { return failureCount < 4; }
export const opts = { staleTime: 30000 };
