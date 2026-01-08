---
description: Generate SQL test cases for a GEM tool
allowed-tools:
  - Read
  - Write
---

# Test Case Generator

Generate SQL INSERT statements and verification queries to test a GEM tool.

## Input

Tool name and scenarios: $ARGUMENTS

Format: `tool_name [scenario1,scenario2,...]`
Example: `leads.create happy_path,duplicate_phone`

## Instructions

1. **Load registry entry** for the tool from `gem-core/tools.registry.json`
   - Get input_schema for valid test inputs
   - Get idempotency mode and key_field
   - Get receipt_fields for verification

2. **Generate test scenarios**:

### Standard Scenarios:
- `happy_path` - Valid input, expect succeeded
- `missing_required` - Missing required field, expect failed
- `invalid_type` - Wrong field type, expect failed
- `duplicate_key` - Same idempotency key (if keyed mode), expect succeeded with idempotency_hit

3. **Output SQL**:

```sql
-- ============================================
-- Test Suite: {tool_name}
-- Generated: {date}
-- ============================================

-- Test Case: {scenario_name}
-- Expected: {expected_status}
INSERT INTO core_tool_calls (tool_name, input, status, idempotency_key)
VALUES (
  '{tool_name}',
  '{input_json}'::jsonb,
  'queued',
  {idempotency_key}
);

-- Verification Query
SELECT
  ctc.id AS call_id,
  ctc.status AS call_status,
  ctr.status AS receipt_status,
  ctr.result,
  ctr.effects
FROM core_tool_calls ctc
LEFT JOIN core_tool_receipts ctr ON ctr.call_id = ctc.id
WHERE ctc.tool_name = '{tool_name}'
  AND ctc.input @> '{input_filter}'::jsonb
ORDER BY ctc.created_at DESC LIMIT 1;

-- Cleanup
DELETE FROM core_tool_receipts WHERE call_id IN (
  SELECT id FROM core_tool_calls WHERE tool_name = '{tool_name}' AND input @> '{filter}'::jsonb
);
DELETE FROM core_tool_calls WHERE tool_name = '{tool_name}' AND input @> '{filter}'::jsonb;
```

4. **Save to file**: `gem-core/tests/acceptance/{tool_name}.sql`

## Run Instructions

```bash
# 1. Insert test calls
psql $SUPABASE_URL -f gem-core/tests/acceptance/{tool}.sql

# 2. Run executor
cd gem-core && npm start &
sleep 10

# 3. Verify results
psql $SUPABASE_URL -c "SELECT * FROM core_tool_receipts ORDER BY created_at DESC LIMIT 5;"

# 4. Cleanup
# Run cleanup section of SQL
```

## Example Usage

```
/project:test-case-generate leads.create
/project:test-case-generate quote.calculate_totals happy_path,missing_line_items
```
