Grounder: Cairn-Ground-O456
Lane: BL-SFX8

Ruled: out-code-review-p1.txt sha256:7a1ad488ba7d findings:7

Output review of task-456, ROUND 1 (RR-0385: round 1 resolves CRITICAL, HIGH and MED), ruled by reading the repo at the lane HEAD 204821b3c (work 8abc92777..5e4d68bc1). 7 lens ids: 1 CONFIRMED (LOW), 6 REJECTED; no CRITICAL, HIGH or MED stands, so no fix commit is owed.

out-code-review-p1#1 REJECTED src/tests/factories.ts:822 "import type { StoredRow, LotStamp } from '@/lib/report-projection/project';" the same file already carries a mid-file import type block at line 680 (Control Panel factories, older commit) and eslint.config.mjs has no import-first rule, so there is no lint failure; cosmetic, not MED
out-code-review-p1#2 REJECTED src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts:34 "describe.skipIf(!dbAvailable() || process.env.BUILDO_TEST_DB_EXTERNAL === '1')" the whole describe is skipped when DATABASE_URL is unset, and getTestPool returns null only then (setup-testcontainer.ts:404), so the guard at :41 is the 58-file gated pattern of src/tests/db and never meets a null pool; db-green.out ran all 10 cases with real assertions
out-code-review-p1#3 REJECTED src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts:50 "parcelPk = rows[0]!.id; // parcel_maxbld_scenarios.parcel_id is parcels.id" the SELECT follows the INSERT in the same transaction, which would have thrown first; a missing row is still a loud failure with the file in the stack, so no wrong pass is possible
out-code-review-p1#4 CONFIRMED src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts:105 "])('refuses: %s (23514, %s)', async (_name, s, name) => {" LOW the second percent-s binds to the Scenario argument, not to name, so the report title shows the row object; the assertions at :107-108 still lock code and constraint, so only the title is wrong and LOW is recorded (RR-0385)
out-code-review-p1#5 REJECTED src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts:55 "await client.query('ROLLBACK');" the plan step 10 fixes this teardown (one ROLLBACK in afterAll, then release and pool.end) in a throwaway container; a failed ROLLBACK means a dead connection and nothing is committed either way
out-code-review-p1#6 REJECTED src/tests/parcel-routes.security.test.ts:116 "vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'active' } as never);" plan step 7 says reuse the sibling mocks, and parcels-lot-size-route.infra.test.ts:112 uses the identical cast
out-code-review-p1#7 REJECTED src/tests/parcel-routes.security.test.ts:135 "expect(res.status).not.toBe(500);" the re-bound plan step 7 (FOLD-CHECK) requires each served case to assert not 500 so a missing settings answer cannot pass; the assertion is deliberate and harmless
