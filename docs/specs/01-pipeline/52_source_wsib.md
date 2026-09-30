# Source: Ontario WSIB Contractor Registry

<requirements>
## 1. Goal & User Story
As a business analyst, I need the Ontario Workplace Safety and Insurance Board registry imported as a trusted source — so the system can verify which builders are legally insured and flag high-value leads with WSIB-matched contractors.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **Source** | Ontario WSIB CSV (Class G — Construction only) |
| **Format** | CSV |
| **Schedule** | Annual MANUAL download (wsib.ca, no stable URL). The `chain_sources` `load_wsib` step SKIPs (PASS + instructions) when no `--file` is provided — the scheduled-runner case. Operator procedure: runbook §WSIB annual refresh |
| **Script** | `scripts/load-wsib.js` |
| **Filter** | Class G (Construction) only, deduplicated by normalized name + address |

### Target Table: `wsib_registry`
| Column | Type | Notes |
|--------|------|-------|
| `legal_name_normalized` | TEXT | PK part 1 — uppercased, trimmed |
| `mailing_address` | TEXT | PK part 2 |
| `trade_name` | TEXT | Operating/trade name |
| `predominant_class` | TEXT | WSIB class (loader keeps Class G only) |
| `naics_code` / `naics_description` | TEXT | NAICS classification |
| `subclass` / `subclass_description` | TEXT | G1 residential · G3 foundation/exterior · G4 building equipment · G5 specialty trades · G6 non-res, etc. |
| `business_size` | TEXT | e.g. Small/Medium/Large |
| `is_gta` | BOOLEAN | Computed per-row at load; gates the Serper enrichment queue (Spec 46) |

> NOTE (2026-07-29): earlier versions listed `status`/`class_code` columns — they do not exist; the table above matches `load-wsib.js`'s real loaded columns. The CSV carries **no contact fields**; `primary_phone`/`primary_email`/`website` on `wsib_registry` are populated only by Serper enrichment (Spec 46).

**Composite PK:** `(legal_name_normalized, mailing_address)`
**Upsert:** `ON CONFLICT DO UPDATE`
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- WSIB CSV file (local or downloaded)

### Core Logic
1. Parse CSV, filter to Class G (Construction)
2. Normalize legal names (uppercase, trim whitespace)
3. Deduplicate by (legal_name_normalized, mailing_address)
4. Batch upsert to `wsib_registry`

### Outputs
- `wsib_registry` table refreshed with current WSIB registrants

### Edge Cases
- Truncated download → could drop previously matched builders (no rollback protection)
- Duplicate entries with different trade names → first-seen wins by dedup
- Non-Class-G entries → filtered out before insert
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `wsib.logic.test.ts` (name normalization, class filtering, dedup)
- **Infra:** `wsib.infra.test.ts` (WSIB table schema, upsert behavior)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `load_wsib` — INGESTOR · unconverted · owner specs: 52
  - `scripts/load-wsib.js`
  - data: `wsib_registry` writes (migrations/040_wsib_registry.sql)
  - upstream: none
  - downstream: link_wsib
  - consumers: none
<!-- /generated:target-files -->

### Out-of-Scope Files
- `scripts/link-wsib.js` — governed by step spec
- `scripts/link-wsib.js` — governed by its own step spec, not this source's contract (see the note above under "Out-of-Scope").

### Cross-Spec Dependencies
- **Consumed by:** `chain_sources.md` (step 11)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
