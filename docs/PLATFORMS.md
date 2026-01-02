# Platform Documentation

## Render (CKR-CORE Worker)

### Environment
- **Type**: Background Worker
- **Runtime**: Node.js 20.x
- **Module System**: ESM (`"type": "module"` in package.json)

### Configuration
Environment variables (set in Render dashboard):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access
- `TOOLS_POLL_INTERVAL_MS` - Poll interval (default: 5000)

### Deployment
- Auto-deploys from main branch
- Health monitored via process status
- Graceful shutdown on SIGTERM/SIGINT

### Logs
- Access via Render dashboard
- Worker ID prefix: `[worker-xxxxxxxx]`
- Tool execution logged with call ID and tool name

## Supabase (Database + RPC)

### Tables

**Core System:**
- `core_tool_calls` - Tool invocation queue
- `core_tool_receipts` - Execution receipts

**Domain Tables:**
- `notes`, `tasks`, `leads`, `quotes`, `quote_line_items`
- `entities`, `jobs`, `invoices`, `comms_log` (pending migration)

### RPC Functions
- `claim_next_core_tool_call(p_worker_id)` - Atomic job claim (Updates `claimed_by`, `claimed_at`)

### Access
- Worker uses service role key
- Full database access for tool execution
- Row-level security bypassed via service role

## Frontend Bridge (Termux)

> **IMPORTANT: This is a separate system. Do not modify.**

The `frontend_bridge.py` runs locally on Termux and handles:
- Local voice/chat interface
- Enqueueing tool calls to Supabase
- Reading receipts from Supabase

### Boundary
- CKR-CORE worker **only** processes queued calls
- CKR-CORE worker **never** initiates calls
- All local/mobile logic is in `frontend_bridge.py`
- GEM repository does not contain Termux code

---

*This document grounds execution environments.*
