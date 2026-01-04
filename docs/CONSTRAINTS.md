# Constraints

Hard rules. Violating any is a failure.

## Registry

- DO NOT rename or alter tool names in `tools.registry.json`
- DO NOT modify tool schemas
- DO NOT change idempotency definitions
- Registry is read-only at runtime

## Architecture

- DO NOT add HTTP server to executor
- DO NOT add external providers without explicit approval
- DO NOT hardcode secrets
- DO NOT use dotenv in production
- DO NOT modify Termux/frontend_bridge.py (separate system)

## Execution

- Every tool call produces exactly one receipt
- Status must be: succeeded, failed, or not_configured
- No silent success
- No empty receipts
- Individual failures must not crash worker loop

## Idempotency

- `none`: Always execute
- `safe-retry`: Return existing receipt for same key
- `keyed`: Prevent duplicate domain rows

## Receipt Contract

```json
{
  "status": "succeeded | failed | not_configured",
  "result": {},
  "effects": {}
}
```

For not_configured:
```json
{
  "status": "not_configured",
  "reason": "string",
  "required_env": [],
  "next_steps": []
}
```

## Handler Dispatch

```
tool_name = "domain.method"
→ file: gem-core/src/handlers/<domain>.js
→ export: <method>
```

Multi-part: `integrations.google_drive.search` → `google_drive_search`

## Brain

- Only enqueue tools from registry
- Validate input before enqueueing
- Never fake execution
- Fall back to answer mode if no rules match
