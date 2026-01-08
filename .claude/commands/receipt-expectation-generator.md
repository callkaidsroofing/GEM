---
description: Generate expected receipt structure for a given tool call
allowed-tools:
  - Read
  - Grep
---

# Receipt Expectation Generator

Generate the expected receipt structure for a tool call, useful for testing and verification.

## Input

```json
{
  "tool_name": "inspection.create",
  "input": {
    "lead_id": "abc123",
    "site_address": "45 Smith St"
  }
}
```

## Process

### Step 1: Read Registry Definition

Find the tool in `gem-core/tools.registry.json`:

```json
{
  "name": "inspection.create",
  "output_schema": {
    "type": "object",
    "required": ["inspection_id"],
    "properties": {
      "inspection_id": { "type": "string" }
    }
  },
  "idempotency": { "mode": "none" },
  "receipt_fields": ["effects.db_writes", "result.inspection_id"]
}
```

### Step 2: Read Handler Implementation

Read `gem-core/src/handlers/inspection.js` to understand the actual output:

```javascript
return success(
  { inspection_id: data.id, status: data.status },
  { db_writes: [{ table: 'inspections', action: 'insert', id: data.id }] }
);
```

### Step 3: Generate Expected Receipt

Build the expected receipt structure:

```json
{
  "expected_receipt": {
    "status": "succeeded",
    "result": {
      "inspection_id": "<uuid>",
      "status": "draft"
    },
    "effects": {
      "db_writes": [
        {
          "table": "inspections",
          "action": "insert",
          "id": "<uuid>"
        }
      ]
    }
  }
}
```

### Step 4: Generate Assertion SQL

Create SQL to verify the receipt:

```sql
-- Verify inspection.create receipt
-- Input: lead_id = 'abc123', site_address = '45 Smith St'

-- Check inspection was created
SELECT COUNT(*) = 1 AS inspection_created
FROM inspections
WHERE lead_id = 'abc123'
  AND site_address = '45 Smith St';

-- Check receipt was written
SELECT
  status = 'succeeded' AS status_ok,
  result->>'inspection_id' IS NOT NULL AS has_inspection_id,
  jsonb_array_length(effects->'db_writes') = 1 AS has_db_write
FROM core_tool_receipts
WHERE tool_name = 'inspection.create'
  AND (result->>'inspection_id') IN (
    SELECT id::text FROM inspections
    WHERE lead_id = 'abc123'
  )
ORDER BY created_at DESC
LIMIT 1;
```

## Output Format

```json
{
  "expected_receipt": {
    "status": "succeeded | failed | not_configured",
    "result": {
      // Fields from output_schema with placeholder values
    },
    "effects": {
      "db_writes": [
        {
          "table": "<table_name>",
          "action": "insert | update | delete",
          "id": "<uuid placeholder>"
        }
      ]
    }
  },
  "assertion_sql": "-- SQL to verify the receipt...",
  "field_expectations": [
    {
      "path": "result.inspection_id",
      "type": "uuid",
      "nullable": false
    },
    {
      "path": "effects.db_writes[0].table",
      "expected": "inspections"
    }
  ],
  "registry_ref": {
    "output_schema_line": 519,
    "receipt_fields": ["effects.db_writes", "result.inspection_id"]
  }
}
```

## Special Cases

### not_configured Tools

For tools returning `not_configured`:

```json
{
  "expected_receipt": {
    "status": "not_configured",
    "result": {
      "status": "not_configured",
      "reason": "AI vision service not configured",
      "required_env": ["OPENAI_API_KEY"],
      "next_steps": ["Set OPENAI_API_KEY environment variable"]
    },
    "effects": {}
  }
}
```

### Keyed Idempotency

For tools with `idempotency.mode: "keyed"`:

```json
{
  "expected_receipt": {
    "status": "succeeded",
    "result": { "lead_id": "<uuid>" },
    "effects": {
      "db_writes": [{ "table": "leads", "action": "insert", "id": "<uuid>" }],
      "idempotency": {
        "mode": "keyed",
        "hit": false,
        "key_field": "phone",
        "key_value": "+1234567890"
      }
    }
  },
  "idempotency_hit_receipt": {
    "status": "succeeded",
    "result": { "lead_id": "<existing_uuid>" },
    "effects": {
      "db_writes": [],
      "idempotency": {
        "mode": "keyed",
        "hit": true,
        "key_field": "phone",
        "key_value": "+1234567890"
      }
    }
  }
}
```

### Failed Receipts

For validation or execution errors:

```json
{
  "expected_receipt_on_error": {
    "status": "failed",
    "result": {
      "error": {
        "code": "validation_error | execution_error",
        "message": "<error description>",
        "details": {}
      }
    },
    "effects": {}
  }
}
```

## Usage Examples

**Example 1: Simple creation**
```
Input: tool_name=leads.create, input={name:"John", phone:"+1234567890", suburb:"Brisbane"}
Output: Expected receipt with lead_id, db_write to leads table
```

**Example 2: Multi-step pipeline**
```
Input: Generate expectations for inspection pipeline
Output: Array of expected receipts for each step
```
