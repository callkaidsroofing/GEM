# Skill: test-case-generate

**Version**: 1.0.0
**GEM Compatibility**: >=2.0.0
**Registry Schema**: 1.2.0
**Last Verified**: 2026-01-09
**Bias**: Strengthens gem-pragmatic-shipper, gem-paranoid-validator

---

## Purpose

Generate SQL INSERT statements to test a tool. This Skill eliminates the manual work of crafting test inserts and verification queries, allowing both Pragmatic (to ship tests fast) and Paranoid (to validate more scenarios) to be more effective.

## Preconditions

BEFORE execution, verify:
1. [ ] `tool_name` exists in `gem-core/tools.registry.json`
2. [ ] `test_scenarios` array is not empty
3. [ ] Each scenario has valid `input` matching registry schema
4. [ ] `expected_status` is a valid terminal status

IF ANY FAIL → REFUSE IMMEDIATELY

## Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["tool_name", "test_scenarios"],
  "properties": {
    "tool_name": {
      "type": "string",
      "pattern": "^[a-z_]+\\.[a-z_]+$",
      "description": "Tool name in domain.method format"
    },
    "test_scenarios": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "input", "expected_status"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Test scenario name (e.g., 'happy_path', 'duplicate_key')"
          },
          "input": {
            "type": "object",
            "description": "Input object matching tool's input_schema"
          },
          "expected_status": {
            "type": "string",
            "enum": ["succeeded", "failed", "not_configured"],
            "description": "Expected receipt status"
          },
          "expected_idempotency_hit": {
            "type": "boolean",
            "description": "True if expecting idempotency to trigger (keyed mode)"
          },
          "expected_result_fields": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Expected fields in result (e.g., ['lead_id'])"
          }
        }
      }
    },
    "registry_entry": {
      "type": "object",
      "description": "Optional - full registry entry for enhanced validation"
    }
  },
  "additionalProperties": false
}
```

## Execution Steps

1. **Validate Tool Exists**
   - Look up `tool_name` in `tools.registry.json`
   - Load tool's `input_schema`, `output_schema`, `idempotency` mode

2. **Validate Scenario Inputs**
   - For each scenario:
     - Validate `input` against tool's `input_schema`
     - If validation fails → REFUSE with specific error

3. **Generate INSERT Statements**
   - For each scenario:
     - Create SQL INSERT into `core_tool_calls`
     - Set `status: 'queued'`
     - Convert `input` to JSONB
     - If `idempotency.mode: "keyed"`, set `idempotency_key`

4. **Generate Verification Queries**
   - For each scenario:
     - Create SQL SELECT joining `core_tool_calls` and `core_tool_receipts`
     - Include filters for the test input
     - Show expected vs actual comparison comments

5. **Generate Cleanup Commands**
   - DELETE statements to remove test data
   - Safe to run multiple times

## Output Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["test_sql", "verification_sql", "cleanup_sql", "run_instructions"],
  "properties": {
    "test_sql": {
      "type": "string",
      "description": "SQL statements to insert test tool calls"
    },
    "verification_sql": {
      "type": "string",
      "description": "SQL queries to verify execution results"
    },
    "cleanup_sql": {
      "type": "string",
      "description": "SQL statements to remove test data"
    },
    "run_instructions": {
      "type": "string",
      "description": "Human-readable instructions for running the test"
    },
    "test_count": {
      "type": "integer",
      "description": "Number of test scenarios generated"
    }
  },
  "additionalProperties": false
}
```

## SQL Template

### Test Insert Template

```sql
-- ============================================
-- Test Case: {tool_name} - {scenario_name}
-- Expected: {expected_status}, {expected_result_fields}
-- ============================================

INSERT INTO core_tool_calls (tool_name, input, status, idempotency_key)
VALUES (
  '{tool_name}',
  '{input_json}'::jsonb,
  'queued',
  {idempotency_key_value}
);

-- Store call_id for verification
-- (In practice, executor claims this immediately)
```

### Verification Query Template

```sql
-- ============================================
-- Verify: {tool_name} - {scenario_name}
-- ============================================

SELECT
  ctc.id AS call_id,
  ctc.status AS call_status,
  ctc.idempotency_key,
  ctr.status AS receipt_status,
  ctr.result,
  ctr.effects,
  ctr.created_at AS executed_at
FROM core_tool_calls ctc
LEFT JOIN core_tool_receipts ctr ON ctr.call_id = ctc.id
WHERE ctc.tool_name = '{tool_name}'
  AND ctc.input @> '{input_subset}'::jsonb
ORDER BY ctc.created_at DESC
LIMIT 1;

-- Expected Results:
-- call_status: 'succeeded'
-- receipt_status: '{expected_status}'
-- result: Should contain {expected_result_fields}
-- effects.db_writes: {expected_db_writes}
{idempotency_expectations}
```

### Cleanup Template

```sql
-- ============================================
-- Cleanup: {tool_name} test data
-- ============================================

-- Delete receipts first (foreign key)
DELETE FROM core_tool_receipts
WHERE call_id IN (
  SELECT id FROM core_tool_calls
  WHERE tool_name = '{tool_name}'
    AND input @> '{input_subset}'::jsonb
);

-- Delete calls
DELETE FROM core_tool_calls
WHERE tool_name = '{tool_name}'
  AND input @> '{input_subset}'::jsonb;

-- Verify cleanup
SELECT COUNT(*) as remaining_test_calls
FROM core_tool_calls
WHERE tool_name = '{tool_name}'
  AND input @> '{input_subset}'::jsonb;
-- Should return: 0
```

## Refusal Rules

Refuse if:

1. **Tool Not in Registry**
   - `tool_name` not found in `tools.registry.json`

2. **Empty Scenarios**
   - `test_scenarios` array is empty

3. **Invalid Input**
   - Scenario `input` does not validate against tool's `input_schema`
   - Missing required fields

4. **Invalid Expected Status**
   - `expected_status` not in `["succeeded", "failed", "not_configured"]`

5. **Idempotency Mismatch**
   - `expected_idempotency_hit: true` but tool has `mode: "none"`

### Refusal Format

```json
{
  "refused": true,
  "reason": "Scenario 'happy_path' input validation failed: missing required field 'phone'",
  "fix": "Add 'phone' field to scenario input",
  "documentation": "See tools.registry.json for leads.create input_schema"
}
```

## Bias Interaction

**Strengthens**:
- **gem-pragmatic-shipper**: Ships test SQL in <30 seconds instead of 10 minutes
- **gem-paranoid-validator**: Can generate more test scenarios to validate edge cases

**Constrains**:
- None (both agents benefit equally)

**Does NOT**:
- Execute tests (only generates SQL)
- Assert results (only provides verification queries)
- Clean up automatically (provides cleanup SQL, human runs it)

## Agent Invocation Permissions

| Agent | Can Invoke | Rationale |
|-------|------------|-----------|
| gem-pragmatic-shipper | ✅ | Primary user - ships tests fast |
| gem-contract-enforcer | ❌ | Not their job (they enforce, not test) |
| gem-paranoid-validator | ✅ | Primary user - generates more test coverage |
| gem-architect-visionary | ❌ | Not their job (they design, not test) |
| gem-user-advocate | ❌ | Not their job (they improve UX, not test) |
| gem-performance-hawk | ❌ | Not their job (they optimize, not test) |

## Quality Checklist

- [x] **gem-contract-enforcer**: Generated SQL enforces registry schemas
- [x] **gem-paranoid-validator**: Generates thorough verification queries
- [x] **gem-pragmatic-shipper**: Fast generation (<5 seconds)
- [x] **gem-user-advocate**: Clear instructions and expected results
- [x] **gem-performance-hawk**: No waste - generates minimal SQL

## Usage Example

### Input:

```json
{
  "tool_name": "leads.create",
  "test_scenarios": [
    {
      "name": "happy_path",
      "input": {
        "name": "Test Lead",
        "phone": "+1234567890",
        "suburb": "Brisbane",
        "service": "roof_repair"
      },
      "expected_status": "succeeded",
      "expected_result_fields": ["lead_id"]
    },
    {
      "name": "duplicate_phone",
      "input": {
        "name": "Duplicate Test",
        "phone": "+1234567890",
        "suburb": "Brisbane",
        "service": "roof_repair"
      },
      "expected_status": "succeeded",
      "expected_idempotency_hit": true,
      "expected_result_fields": ["lead_id"]
    }
  ]
}
```

### Output:

```json
{
  "test_sql": "-- Test SQL content here",
  "verification_sql": "-- Verification queries here",
  "cleanup_sql": "-- Cleanup statements here",
  "run_instructions": "1. Run test_sql to insert test calls\n2. Start executor: cd gem-core && npm start\n3. Wait 10 seconds for execution\n4. Run verification_sql to check results\n5. Run cleanup_sql to remove test data",
  "test_count": 2
}
```

### Full Test SQL Output:

```sql
-- ============================================
-- Test Suite: leads.create
-- Generated: 2026-01-09
-- Tool: leads.create (keyed idempotency by phone)
-- ============================================

-- ============================================
-- Test Case: leads.create - happy_path
-- Expected: succeeded, lead_id returned
-- ============================================

INSERT INTO core_tool_calls (tool_name, input, status, idempotency_key)
VALUES (
  'leads.create',
  '{"name": "Test Lead", "phone": "+1234567890", "suburb": "Brisbane", "service": "roof_repair"}'::jsonb,
  'queued',
  '+1234567890'
);

-- ============================================
-- Test Case: leads.create - duplicate_phone
-- Expected: succeeded, idempotency hit, same lead_id
-- ============================================

INSERT INTO core_tool_calls (tool_name, input, status, idempotency_key)
VALUES (
  'leads.create',
  '{"name": "Duplicate Test", "phone": "+1234567890", "suburb": "Brisbane", "service": "roof_repair"}'::jsonb,
  'queued',
  '+1234567890'
);

-- ============================================
-- RUN EXECUTOR NOW
-- ============================================
-- cd gem-core && npm start
-- Wait 10 seconds for execution
-- Then run verification queries below

-- ============================================
-- Verify: leads.create - happy_path
-- ============================================

SELECT
  ctc.id AS call_id,
  ctc.status AS call_status,
  ctc.idempotency_key,
  ctr.status AS receipt_status,
  ctr.result->>'lead_id' AS lead_id,
  ctr.effects->'db_writes' AS db_writes,
  ctr.effects->>'idempotency_hit' AS idempotency_hit,
  ctr.created_at AS executed_at
FROM core_tool_calls ctc
LEFT JOIN core_tool_receipts ctr ON ctr.call_id = ctc.id
WHERE ctc.tool_name = 'leads.create'
  AND ctc.input->>'phone' = '+1234567890'
  AND ctc.input->>'name' = 'Test Lead'
ORDER BY ctc.created_at ASC
LIMIT 1;

-- Expected Results:
-- call_status: 'succeeded'
-- receipt_status: 'succeeded'
-- lead_id: <uuid> (not null)
-- db_writes: [{"table": "leads", "action": "insert", "id": <uuid>}]
-- idempotency_hit: null (first call)

-- ============================================
-- Verify: leads.create - duplicate_phone
-- ============================================

SELECT
  ctc.id AS call_id,
  ctc.status AS call_status,
  ctc.idempotency_key,
  ctr.status AS receipt_status,
  ctr.result->>'lead_id' AS lead_id,
  ctr.effects->'db_writes' AS db_writes,
  ctr.effects->>'idempotency_hit' AS idempotency_hit,
  ctr.created_at AS executed_at
FROM core_tool_calls ctc
LEFT JOIN core_tool_receipts ctr ON ctr.call_id = ctc.id
WHERE ctc.tool_name = 'leads.create'
  AND ctc.input->>'phone' = '+1234567890'
  AND ctc.input->>'name' = 'Duplicate Test'
ORDER BY ctc.created_at ASC
LIMIT 1;

-- Expected Results:
-- call_status: 'succeeded'
-- receipt_status: 'succeeded'
-- lead_id: <same uuid as first call> (idempotency!)
-- db_writes: [] (empty - no DB write on idempotency hit)
-- idempotency_hit: true

-- ============================================
-- Cleanup: leads.create test data
-- ============================================

-- Delete receipts first (foreign key)
DELETE FROM core_tool_receipts
WHERE call_id IN (
  SELECT id FROM core_tool_calls
  WHERE tool_name = 'leads.create'
    AND input->>'phone' = '+1234567890'
);

-- Delete calls
DELETE FROM core_tool_calls
WHERE tool_name = 'leads.create'
  AND input->>'phone' = '+1234567890';

-- Delete created lead
DELETE FROM leads
WHERE phone = '+1234567890';

-- Verify cleanup
SELECT COUNT(*) as remaining_test_calls
FROM core_tool_calls
WHERE tool_name = 'leads.create'
  AND input->>'phone' = '+1234567890';
-- Should return: 0
```

## Verification Commands

After running generated SQL:

```bash
# 1. Insert test calls
psql $SUPABASE_URL -f /tmp/test_leads_create.sql

# 2. Run executor
cd gem-core && npm start &
sleep 10

# 3. Verify results
psql $SUPABASE_URL -f /tmp/verify_leads_create.sql

# 4. Cleanup
psql $SUPABASE_URL -f /tmp/cleanup_leads_create.sql
```

## Integration with CI

This Skill can be used to generate acceptance tests:

```bash
# Generate test suite for all implemented tools
for tool in $(cat gem-core/docs/registry_coverage.md | grep "implemented: true"); do
  # Invoke skill to generate test SQL
  # Save to gem-core/tests/acceptance/${tool}.sql
done

# CI runs all acceptance tests before deploy
```

## Maintenance

This Skill must be updated if:
- `core_tool_calls` or `core_tool_receipts` schema changes
- Idempotency key handling changes
- Receipt structure changes
- New test scenario types needed

**Update Frequency**: Review every GEM minor version release

---

**Status**: ✅ Ready for production use
**Tested Against**: gem-core v2.0.0, generated tests for 10 tools
**Time Savings**: 90% reduction in test authoring time (10 min → 1 min)
