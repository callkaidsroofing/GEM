# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GEM (General Execution Manager) is a **registry-driven, contract-first tool execution system** for Call Kaids Roofing. It's a monorepo with three modules communicating via Supabase:

- **gem-brain/**: AI orchestrator that translates natural language into tool calls (Render web service)
- **gem-core/**: Background worker that executes tool calls and writes receipts (Render background worker)
- **gem-shared/**: Shared contracts, schemas, and validation utilities

**Data Flow**: `Message → Brain → core_tool_calls → Executor → core_tool_receipts`

## Development Commands

```bash
# Install dependencies
cd gem-core && npm install
cd ../gem-brain && npm install

# Start executor (polls and executes)
cd gem-core && npm start

# Start brain server (HTTP API on port 3000)
cd gem-brain && npm start

# Brain CLI for testing
cd gem-brain && node scripts/brain.js "create a task to call John"

# Verify syntax
cd gem-core && npm run verify
cd gem-brain && npm run verify

# Check tool coverage
cd gem-core && npm run coverage

# E2E inspection flow test
node gem-core/tests/inspection_flow_e2e.js

# Check database connectivity
cd gem-core && node check_db.js
```

## Environment Variables

Both modules require:
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # NOT anon key
```

Brain-specific:
```bash
ANTHROPIC_API_KEY=your_api_key  # Required for LLM features
PORT=3000  # Optional, default 3000
```

Executor-specific:
```bash
TOOLS_POLL_INTERVAL_MS=5000  # Optional, default 5000ms
```

## Critical Conventions

### 1. tools.registry.json is Law

**Location**: `gem-core/tools.registry.json`

**NEVER modify without understanding full implications**. This single source of truth defines all 99 tool names (domain.method format), input/output JSON schemas, idempotency modes, timeouts, and permissions. See `/docs/STATE.md` for current implementation status.

### 2. Receipt Contract

Every tool call produces exactly ONE receipt. Use helpers from `gem-core/src/lib/responses.js`:

```javascript
import { success, notConfigured, failed } from '../lib/responses.js';

// Real implementation
return success(
  { task_id: id },
  { db_writes: [{ table: 'tasks', action: 'insert', id }] }
);

// Not yet implemented
return notConfigured('calendar.find_slots', {
  reason: 'Google Calendar API not configured',
  required_env: ['GOOGLE_CALENDAR_API_KEY'],
  next_steps: ['Set up OAuth credentials']
});
```

Receipt structure: `{ status: "succeeded"|"failed"|"not_configured", result: {...}, effects: { db_writes, messages_sent, files_written, external_calls } }`

### 3. Idempotency Modes

Defined in registry, enforced by executor BEFORE handler execution:

- **`none`**: Execute every time, no deduplication
- **`safe-retry`**: Return existing receipt if one exists for this `call_id`
- **`keyed`**: Check for existing receipt matching `tool_name` + `idempotency_key`
  - Requires `idempotency.key_field` in registry
  - Handler must implement duplicate detection
  - Example: `leads.create` uses `phone` as key

### 4. Handler Dispatch Pattern

Tool name `domain.method` maps to:
- File: `gem-core/src/handlers/<domain>.js`
- Export: `export async function <method>(input, context) { ... }`

Multi-part tools (e.g., `integrations.google_drive.search`):
- Export name becomes: `google_drive_search`

**Handler signature**:
```javascript
export async function method_name(input, context = {}) {
  // input: validated against input_schema
  // context: { job, tool } metadata

  // Return { result, effects }
  return {
    result: { /* matches output_schema */ },
    effects: { db_writes: [...] }
  };
}
```

### 5. Not-Configured Pattern

If a handler is not yet implemented, it MUST NOT throw or fail. Instead:

```javascript
export async function unimplemented_tool(input) {
  return notConfigured('domain.unimplemented_tool', {
    reason: 'Handler implementation pending',
    required_env: ['API_KEY'], // if applicable
    next_steps: ['Implement handler in src/handlers/domain.js']
  });
}
```

This ensures the system remains operational with partial implementation.

### 6. Database Access

All handlers use Supabase client from `gem-core/src/lib/supabase.js`:

```javascript
import { supabase } from '../lib/supabase.js';

// Always handle errors explicitly
const { data, error } = await supabase
  .from('leads')
  .select('*')
  .eq('id', lead_id)
  .single();

if (error) {
  throw new Error(`Failed to fetch lead: ${error.message}`);
}
```

**Important**: Use `.maybeSingle()` when record might not exist (returns `null` without error).

## Architecture Boundaries

**Brain** (gem-brain): Parses messages → matches rules → validates against registry → enqueues to `core_tool_calls`. Does NOT execute tools or access domain tables.

**Executor** (gem-core): Polls queue → validates → checks idempotency → executes handlers → writes receipts. Does NOT parse messages or have HTTP endpoints.

**Shared** (gem-shared): Common contracts, schemas, validation. Used by both modules.

## Common Development Tasks

### Adding a New Tool

1. **Define in registry** (`gem-core/tools.registry.json`):
```json
{
  "name": "domain.new_tool",
  "description": "What it does",
  "input_schema": { "type": "object", "required": ["field"], "properties": {...} },
  "output_schema": { "type": "object", "required": ["result"], "properties": {...} },
  "idempotency": { "mode": "none" },
  "permissions": ["write:db"],
  "timeout_ms": 30000,
  "receipt_fields": ["result.entity_id"]
}
```

2. **Implement handler** (`gem-core/src/handlers/domain.js`):
```javascript
export async function new_tool(input) {
  // Implementation
  return success({ entity_id: id }, { db_writes: [...] });
}
```

3. **Add brain rule** (if applicable) (`gem-brain/src/planner/rules.js`)

4. **Test with CLI**:
```bash
cd gem-brain
node scripts/brain.js "test message that should trigger new tool"
```

### Testing a Handler

1. **Insert test call** directly to database:
```sql
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES ('domain.tool_name', '{"field": "value"}'::jsonb, 'queued');
```

2. **Run executor** and watch logs:
```bash
cd gem-core && npm start
```

3. **Query receipt**:
```sql
SELECT * FROM core_tool_receipts
WHERE tool_name = 'domain.tool_name'
ORDER BY created_at DESC LIMIT 1;
```

### Debugging Failed Calls

```sql
-- View recent failures
SELECT id, tool_name, error->>'message' as error_msg, created_at
FROM core_tool_calls
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- View receipt details
SELECT r.status, r.result, r.effects, c.input
FROM core_tool_receipts r
JOIN core_tool_calls c ON c.id = r.call_id
WHERE r.status = 'failed'
ORDER BY r.created_at DESC;
```

### Running Verification Tests

```bash
# Core executor verification (checks 40 implemented tools)
cd gem-core
node test/verify-gem.js

# Brain verification (checks planning and enqueueing)
cd gem-brain
psql $SUPABASE_URL -f tests/brain_verification.sql
```

## Database Tables

**Core tables**: `core_tool_calls` (queue), `core_tool_receipts` (results), `brain_runs` (audit log)

**Domain tables** (see `gem-core/sql/`): `leads`, `quotes`, `quote_line_items`, `inspections`, `inspection_packets`, `media_assets`, `jobs`, `invoices`, `tasks`, `notes`, `entities`, `comms_log`

**Analytics views** (migration 009): `gem_tool_execution_stats`, `gem_recent_failures`, `gem_queue_depth`, `gem_worker_activity`

## Key Implementation Details

### Atomic Job Claiming

Uses `claim_next_core_tool_call(p_worker_id TEXT)` RPC with `FOR UPDATE SKIP LOCKED` for race-free queue processing.

### Status Column Mapping

**The `leads` table uses `status` column, NOT `stage`**. Registry defines parameter as `stage` for API consistency; handlers map `input.stage` → database `status`. See `gem-core/src/handlers/leads.js:90`.

### Keyed Idempotency

For `idempotency.mode: "keyed"` tools: (1) check for existing record, (2) insert with race handling, (3) catch unique constraint violation (error code `23505`). See `gem-core/src/handlers/leads.js` for reference implementation.

## Documentation Reading Order

For new contributors, read in this order:

1. `/docs/SYSTEM.md` - Understand what GEM is
2. `/docs/CONSTRAINTS.md` - Learn the hard rules
3. `/docs/STATE.md` - See what's implemented vs planned
4. `gem-core/docs/EXECUTOR.md` - Executor mechanics
5. `gem-brain/docs/BRAIN.md` - Brain mechanics
6. `gem-core/docs/REGISTRY.md` - Deep dive on tool contracts

## Custom Claude Agents and Commands

### Agents (in `.claude/agents/`)

- **gem-contract-enforcer**: Use BEFORE modifying `tools.registry.json` or handler contracts
- **gem-monorepo-agent-factory-builder**: For generating agent specifications
- **gem-skills-architect**: For designing skill packs with execution plans
- **gem-paranoid-validator**: For thorough validation checks
- **gem-pragmatic-shipper**: For shipping features efficiently

### Commands (in `.claude/commands/`)

- **contract-drift-detect**: Detect schema drift between registry and handlers
- **handler-skeleton-generate**: Generate skeleton handler code
- **receipt-validate**: Validate receipt structure
- **test-case-generate**: Generate test cases for tools
- **tool-call-builder**: Build tool call payloads
- **verification-sql-generator**: Generate verification SQL queries

Invoke agents proactively when working on contract-level changes.

## Common Gotchas

1. **Never modify `tools.registry.json` at runtime** - It's loaded once on startup
2. **Every call needs exactly one receipt** - No silent failures or missing receipts
3. **Individual handler failures must not crash the worker** - Errors are caught and logged
4. **Brain and Executor are separate processes** - They communicate only via Supabase tables
5. **Not-configured ≠ failed** - Unimplemented tools should return `not_configured`, not throw
6. **Idempotency is checked BEFORE handler execution** - Don't rely on handlers alone
7. **Status fields vary by table** - Some use `status`, some use `stage` (check schema)
8. **Use `.maybeSingle()` for optional records** - `.single()` throws if not found
9. **Service role key required** - Anon key doesn't have write permissions for tool calls
10. **Timeout is per-tool** - Configured in registry, enforced by Promise.race

## Deployment

Both services deploy to Render (see `/docs/PLATFORMS.md`):
- **gem-core**: Background Worker → `node index.js`
- **gem-brain**: Web Service → `node src/server.js`

Node.js 20.x required.
