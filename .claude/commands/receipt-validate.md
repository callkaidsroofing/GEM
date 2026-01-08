---
description: Validate a receipt object against GEM receipt doctrine
allowed-tools:
  - Read
---

# Receipt Validator

Verify a receipt object matches GEM receipt doctrine exactly.

## Input

Provide receipt JSON: $ARGUMENTS

Or specify a tool call ID to fetch from database.

## Receipt Doctrine Rules

Every tool call MUST produce exactly ONE receipt with:

### Rule 1: Terminal Status Required
- Status must be exactly: `"succeeded"`, `"failed"`, or `"not_configured"`
- NO intermediate states (`"pending"`, `"running"`, `"queued"`)

### Rule 2: Result Object Required
- `result` field must exist and be an object
- If `succeeded`: result must have at least one field
- If `not_configured`: result must have `status`, `reason`, `next_steps`

### Rule 3: Effects Object Required
- `effects` field must exist (can be empty `{}`)
- If `db_writes` present: array of `{table, action, id}`
- Other valid effects: `messages_sent`, `files_written`, `external_calls`

## Validation Checklist

For the provided receipt, check:

- [ ] `status` exists and is terminal (succeeded/failed/not_configured)
- [ ] `result` exists and is an object
- [ ] `effects` exists and is an object
- [ ] If succeeded: result has data (not empty)
- [ ] If not_configured: has reason and next_steps
- [ ] If effects.db_writes: entries have table/action/id
- [ ] No conflicting fields (e.g., `error` when status is `succeeded`)

## Output Format

```json
{
  "valid": true|false,
  "doctrine_compliance_score": "X/8",
  "violations": [
    {
      "rule": "status_must_be_terminal",
      "expected": "succeeded|failed|not_configured",
      "actual": "pending",
      "severity": "blocker",
      "fix": "Change status to terminal value"
    }
  ],
  "status_validation": { "is_terminal": true, "status": "succeeded" },
  "structure_validation": { "has_status": true, "has_result": true, "has_effects": true }
}
```

## Example Usage

```
/project:receipt-validate {"status":"succeeded","result":{"lead_id":"abc"},"effects":{}}
```
