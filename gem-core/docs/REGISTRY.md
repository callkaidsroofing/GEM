# Registry System

The registry (`tools.registry.json`) is the single source of truth for all tool definitions in CKR-CORE.

> **For current implementation status of each tool, see `registry_coverage.md`.**
> That file is generated and shows which tools are real vs not_configured.

## Registry Structure

```json
{
  "version": "1.0.0",
  "tools": [
    {
      "name": "domain.method",
      "description": "What the tool does",
      "input_schema": { ... },
      "output_schema": { ... },
      "permissions": ["read:db", "write:db"],
      "idempotency": { "mode": "none|safe-retry|keyed", "key_field": "..." },
      "timeout_ms": 30000,
      "receipt_fields": ["result.field"]
    }
  ]
}
```

## Idempotency Modes

### none
- Always execute
- Always create new receipt
- Use for operations that should run every time

### safe-retry
- If receipt exists for same `call_id`, return existing result
- If `idempotency_key` provided and matches, return existing result
- Do not re-execute effects
- Use for read operations and operations safe to retry

### keyed
- Uses `key_field` from tool definition
- If key field is missing → validation failure
- If prior successful receipt exists for same tool + key value → return prior result
- Do not create duplicate domain rows
- Use for create operations with natural keys

## Keyed Tools (Authoritative List)

| Tool | Key Field |
|------|-----------|
| leads.create | phone |
| media.register_asset | file_ref |
| identity.add_memory | key |
| identity.score_pattern | key |
| personal.boundary_set | key |

## Dispatch Pattern

Tool names follow the pattern `domain.method`:

```
os.create_task
  → src/handlers/os.js
  → export create_task
```

For multi-part names:

```
integrations.google_drive.search
  → src/handlers/integrations.js
  → export google_drive_search
```

## Validation

Input is validated against `input_schema` before execution:
- Required fields must be present
- Types must match
- String formats (date-time, etc.) are checked

Output is validated against `output_schema` after execution:
- Warnings logged for mismatches
- Execution not blocked (for forward compatibility)

## Permissions

Permissions indicate what a tool can do:
- `read:db` - Read from database
- `write:db` - Write to database
- `send:sms` - Send SMS (requires provider)
- `send:email` - Send email (requires provider)
- `calendar:read` - Read calendar (requires Google API)
- `calendar:write` - Write calendar (requires Google API)

---

*This document explains how to reason about tools.*
