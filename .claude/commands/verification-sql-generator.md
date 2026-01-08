---
description: Generate SQL to verify GEM tool execution effects
allowed-tools:
  - Read
  - Grep
---

# Verification SQL Generator

Generate SQL queries to verify that a tool call executed correctly and produced the expected effects.

## Input

```json
{
  "tool_name": "inspection.create",
  "call_id": "uuid-of-call",
  "expected_effects": {
    "db_writes": [{ "table": "inspections", "action": "insert" }]
  }
}
```

## Process

### Step 1: Read Handler to Understand Effects

Read `gem-core/src/handlers/<domain>.js` to understand what the tool does:
- What tables does it write to?
- What fields are set?
- What is the expected result structure?

### Step 2: Generate Receipt Verification SQL

```sql
-- 1. Verify receipt exists
SELECT
  call_id,
  tool_name,
  status,
  result,
  effects,
  created_at
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: Exactly 1 row

-- 2. Verify receipt status
SELECT status = 'succeeded' AS status_ok
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: true
```

### Step 3: Generate Effect Verification SQL

For each expected db_write:

```sql
-- 3. Verify db_write effect recorded
SELECT
  jsonb_array_length(effects->'db_writes') AS write_count,
  effects->'db_writes'->0->>'table' AS target_table,
  effects->'db_writes'->0->>'action' AS action
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: write_count >= 1, target_table = 'inspections', action = 'insert'
```

### Step 4: Generate Domain Table Verification SQL

Verify the actual data was written:

```sql
-- 4. Verify inspection record exists
SELECT
  id,
  lead_id,
  status,
  site_address,
  created_at
FROM inspections
WHERE id = (
  SELECT result->>'inspection_id'
  FROM core_tool_receipts
  WHERE call_id = '<call_id>'
);
-- Expected: 1 row with correct data
```

## Output Format

```sql
-- ============================================
-- Verification SQL for: inspection.create
-- Call ID: <uuid>
-- Generated: 2026-01-09
-- ============================================

-- Section 1: Receipt Verification
-- --------------------------------

-- 1.1 Check receipt exists
SELECT COUNT(*) AS receipt_count
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: 1

-- 1.2 Check receipt status and result
SELECT
  status,
  result->>'inspection_id' AS inspection_id,
  result->>'status' AS result_status,
  created_at
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: status = 'succeeded', inspection_id IS NOT NULL

-- 1.3 Check effects structure
SELECT
  jsonb_array_length(effects->'db_writes') AS db_write_count,
  effects->'db_writes'->0->>'table' AS written_table,
  effects->'db_writes'->0->>'action' AS write_action,
  effects->'db_writes'->0->>'id' AS written_id
FROM core_tool_receipts
WHERE call_id = '<call_id>';
-- Expected: db_write_count = 1, written_table = 'inspections', write_action = 'insert'

-- Section 2: Domain Table Verification
-- ------------------------------------

-- 2.1 Verify inspection record exists
SELECT
  i.id,
  i.lead_id,
  i.status,
  i.site_address,
  i.site_suburb,
  i.created_at
FROM inspections i
WHERE i.id = (
  SELECT r.result->>'inspection_id'
  FROM core_tool_receipts r
  WHERE r.call_id = '<call_id>'
);
-- Expected: 1 row

-- 2.2 Cross-check with effects
SELECT
  CASE
    WHEN i.id::text = (r.effects->'db_writes'->0->>'id')
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS id_verification
FROM inspections i
CROSS JOIN core_tool_receipts r
WHERE r.call_id = '<call_id>'
  AND i.id = (r.result->>'inspection_id')::uuid;
-- Expected: 'MATCH'

-- Section 3: Call Status Verification
-- -----------------------------------

-- 3.1 Verify call status updated
SELECT
  status,
  updated_at,
  claimed_at,
  worker_id
FROM core_tool_calls
WHERE id = '<call_id>';
-- Expected: status = 'succeeded'

-- ============================================
-- Summary Query
-- ============================================

SELECT
  c.id AS call_id,
  c.tool_name,
  c.status AS call_status,
  r.status AS receipt_status,
  CASE
    WHEN r.status = 'succeeded'
         AND (r.effects->'db_writes'->0->>'table') = 'inspections'
    THEN 'VERIFIED'
    ELSE 'FAILED'
  END AS verification_result,
  r.result->>'inspection_id' AS created_id
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON r.call_id = c.id
WHERE c.id = '<call_id>';
```

## Templates by Tool Type

### Create Tools (insert)

```sql
-- For tools like leads.create, inspection.create, etc.
SELECT COUNT(*) FROM <table> WHERE id = (SELECT result->>'<id_field>' FROM core_tool_receipts WHERE call_id = ?);
```

### Update Tools (update)

```sql
-- For tools like leads.update_stage, inspection.update, etc.
SELECT updated_at > (SELECT c.claimed_at FROM core_tool_calls c WHERE c.id = ?)
FROM <table>
WHERE id = ?;
```

### Link/Associate Tools

```sql
-- For tools that create relationships
SELECT COUNT(*) FROM <junction_table> WHERE <fk1> = ? AND <fk2> = ?;
```

## Usage

```
Input: tool_name, call_id, and optionally expected_effects
Output: Complete SQL script to verify the tool execution
```

Run the generated SQL against the Supabase database:
```bash
psql $SUPABASE_URL -f verification.sql
```
