// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §11 (specific 4xx bodies), docs/specs/00_engineering_standards.md §2
//
// MF-40 · a refusal raised inside a placements transaction: it rolls the transaction back (no mutation, no audit row) and the route turns it
// into the envelope error with its own status and code (plan fold 5: 400/404/409 bodies are specific and tested).

export type RefusalStatus = 400 | 404 | 409;

export class PlacementRefusal extends Error {
  constructor(readonly status: RefusalStatus, readonly code: string, message: string) {
    super(message);
    this.name = 'PlacementRefusal';
  }
}

/** Postgres: a timestamp text the cast cannot read (22007, 22008) or a unique race (23505) means the client's view is stale. */
export const isStaleCast = (e: unknown): boolean => ['22007', '22008'].includes(String((e as { code?: unknown } | null)?.code));
export const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === '23505';
