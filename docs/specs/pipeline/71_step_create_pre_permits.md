# Step: Create Pre-Permits

<requirements>
## 1. Goal & User Story
As an early-stage lead hunter, I need approved CoA variance applications that don't yet have building permits identified as speculative "pre-permit" leads — so I can reach contractors months before the official permit is filed.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/create-pre-permits.js` |
| **Reads** | `coa_applications` (decision, linked_permit_num, decision_date) |
| **Writes** | Read-only reporting step (queries and logs, does not mutate) |
| **Chain** | `chain_permits` (step 15), `chain_coa` (step 5) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query approved CoA applications where `linked_permit_num IS NULL` (no associated permit yet)
2. Filter to applications within 18-month window (older ones are likely dead leads)
3. Report pre-permit pool size and characteristics
4. Emit PIPELINE_SUMMARY with pool counts

### Pre-Permit Pool Criteria
- Decision = "Approved" (or variant)
- No linked building permit
- Decision date within last 18 months
- Currently ~408 qualifying leads

### Edge Cases
- CoA application gets linked to a permit in a later run → drops out of pre-permit pool naturally
- Application older than 18 months → flagged by `assert_pre_permit_aging` quality gate
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/create-pre-permits.js`, `src/lib/coa/pre-permits.ts`
- **Consumed by:** `chain_permits.md` (step 15), `chain_coa.md` (step 5)
- **Testing:** `coa.logic.test.ts`
</constraints>
