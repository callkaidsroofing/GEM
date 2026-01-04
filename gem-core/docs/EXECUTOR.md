# GEM-CORE Executor

Local documentation for executor mechanics. For system overview, see `/docs/SYSTEM.md`.

## What It Does

Polls `core_tool_calls` for queued work, executes handlers, writes receipts.

## Entry Point

```bash
node index.js
```

Starts worker loop polling every 5000ms (configurable via `TOOLS_POLL_INTERVAL_MS`).

## Execution Flow

1. Call `claim_next_core_tool_call(worker_id)` RPC
2. If job claimed:
   - Validate input against registry schema
   - Check idempotency (safe-retry/keyed)
   - Resolve handler: `src/handlers/<domain>.js` → `<method>`
   - Execute with timeout
   - Write receipt to `core_tool_receipts`
   - Update call status

## Handler Pattern

File: `src/handlers/<domain>.js`
Export: function matching method name

```javascript
// For tool: os.create_task
export async function create_task(input) {
  // validate, execute, return
  return { result: {...}, effects: {...} };
}
```

## Responses

Use `src/lib/responses.js`:

```javascript
import { success, notConfigured } from '../lib/responses.js';

// Real implementation
return success({ task_id: id }, { db_writes: [...] });

// Not configured
return notConfigured('domain.tool', {
  reason: 'Provider not configured',
  required_env: ['API_KEY'],
  next_steps: ['Set env var']
});
```

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | Worker loop, claim, execute, receipt |
| `tools.registry.json` | Tool definitions (read-only) |
| `src/lib/registry.js` | Registry loader |
| `src/lib/validate.js` | Input/output validation |
| `src/lib/idempotency.js` | Duplicate prevention |
| `src/lib/supabase.js` | Database client |
| `src/handlers/*.js` | Tool implementations |

## Environment

```
SUPABASE_URL=required
SUPABASE_SERVICE_ROLE_KEY=required
TOOLS_POLL_INTERVAL_MS=5000 (optional)
```

## Constraints

- No HTTP server
- One receipt per call
- Never crash loop on handler failure
- Never modify registry at runtime

See `/docs/CONSTRAINTS.md` for full list.
