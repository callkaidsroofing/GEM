# Absolute Constraints

These are non-negotiable rules. Violating any is a hard failure.

## Registry Constraints

- **DO NOT** rename, alter, or "clean up" registry tool names
- **DO NOT** alter registry schemas
- **DO NOT** modify `tools.registry.json` except to read it
- Registry is law - tool definitions are the contract

## Architecture Constraints

- **DO NOT** add a web server
- **DO NOT** add external providers (Twilio, SendGrid, Google APIs, Ads APIs, Analytics APIs)
- **DO NOT** hardcode secrets or introduce dotenv
- **DO NOT** modify `frontend_bridge.py` or any local Termux code

## Execution Constraints

- **DO NOT** "fake success" - every tool returns real status
- **DO NOT** skip receipts - exactly one receipt per call
- **DO NOT** crash the worker loop - individual failures are isolated
- **DO NOT** return empty receipts or ambiguous status

## Idempotency Constraints

- Keyed tools must never create duplicates
- Key field missing on keyed tool = validation failure
- Safe-retry must return existing receipt, not re-execute

## Receipt Contract

Every processed call must write exactly one receipt with this structure:

```json
{
  "status": "succeeded | failed | not_configured",
  "result": { ... },
  "effects": { ... }
}
```

For `not_configured` status:

```json
{
  "status": "not_configured",
  "reason": "string",
  "required_env": ["string"],
  "next_steps": ["string"]
}
```

## Dispatch Pattern (Fixed)

```
tool_name = "domain.method"
→ handler file: src/handlers/<domain>.js
→ exported function: <method>
```

For multi-part names (e.g., `integrations.google_drive.search`):
```
→ handler file: src/handlers/integrations.js
→ exported function: google_drive_search
```

---

*This document defines hard guardrails and should rarely change.*
