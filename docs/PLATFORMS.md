# Platforms

Deployment and infrastructure.

## Render

### GEM-CORE Executor
- **Type**: Background Worker
- **Root Directory**: `gem-core`
- **Start Command**: `node index.js`
- **Runtime**: Node.js 20+

### GEM Brain
- **Type**: Web Service
- **Root Directory**: `gem-brain`
- **Start Command**: `npm start`
- **Runtime**: Node.js 20+
- **Port**: Set by Render via `PORT` env var

### Environment Variables

Both services need:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Executor optional:
```
TOOLS_POLL_INTERVAL_MS=5000
```

Brain optional:
```
PORT=3000
LOG_LEVEL=info
```

## Supabase

### Core Tables

| Table | Purpose |
|-------|---------|
| `core_tool_calls` | Tool invocation queue |
| `core_tool_receipts` | Execution results |
| `brain_runs` | Brain request audit log |

### RPC Functions

- `claim_next_core_tool_call(p_worker_id)` - Atomic job claim

### Migrations

Core system: `gem-core/sql/`
Domain tables: `gem-core/migrations/`
Brain tables: `gem-brain/sql/`

## Termux (Separate System)

`frontend_bridge.py` runs on local device, not in this repo.

- Enqueues calls to Supabase
- Reads receipts from Supabase
- No direct connection to GEM services

DO NOT modify Termux code from this repo.
