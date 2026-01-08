# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GEM (General Execution Manager) is a **registry-driven, contract-first tool execution system** for Call Kaids Roofing. It's a monorepo containing two services that communicate via Supabase:

- **gem-brain/**: AI orchestrator that translates natural language into tool calls
- **gem-core/**: Background worker that executes tool calls and writes receipts

**Data Flow**: `Message → Brain → core_tool_calls → Executor → core_tool_receipts`

## Quick Start

### Development Commands

```bash
# Install dependencies for both modules
cd gem-core && npm install
cd ../gem-brain && npm install

# Start the executor (polls and executes)
cd gem-core && npm start

# Start the brain server (HTTP API)
cd gem-brain && npm start

# Run brain CLI for testing
cd gem-brain && node scripts/brain.js "create a task to call John"

# Verify database schema and connectivity
cd gem-core && node check_db.js
```

### Environment Variables

Both modules require:
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Executor-specific:
```bash
TOOLS_POLL_INTERVAL_MS=5000  # Optional, default 5000ms
```

Brain-specific:
```bash
PORT=3000  # Optional, default 3000
ANTHROPIC_API_KEY=your_api_key  # Required for AI features
```

## Repository Structure

```
/
├── docs/                   # Canonical system documentation (READ THESE FIRST)
│   ├── SYSTEM.md          # High-level architecture
│   ├── CONSTRAINTS.md     # Hard rules (DO NOT VIOLATE)
│   ├── STATE.md           # Current phase and implementation status
│   ├── AGENTS.md          # AI agent guidelines
│   ├── PLATFORMS.md       # Deployment info (Render)
│   └── DECISIONS.md       # Locked architectural decisions
│
├── gem-core/              # GEM-CORE Executor (Background Worker)
│   ├── index.js           # Main worker loop
│   ├── tools.registry.json # Authoritative tool contracts (99 tools)
│   ├── src/
│   │   ├── handlers/      # Tool implementations by domain
│   │   │   ├── leads.js   # Leads domain (create, update, list, etc.)
│   │   │   ├── quote.js   # Quote domain (create, calculate, send, etc.)
│   │   │   ├── os.js      # Operating system (tasks, notes, health)
│   │   │   ├── inspection.js
│   │   │   ├── invoice.js
│   │   │   ├── job.js
│   │   │   ├── entity.js
│   │   │   ├── comms.js
│   │   │   └── ... (16 domain handlers total)
│   │   └── lib/
│   │       ├── registry.js     # Tool registry loader
│   │       ├── validate.js     # JSON schema validation
│   │       ├── idempotency.js  # Duplicate prevention
│   │       ├── responses.js    # Standard response helpers
│   │       └── supabase.js     # Database client
│   ├── sql/               # Database migrations
│   ├── migrations/        # Incremental schema changes
│   └── docs/              # Executor-specific docs
│
└── gem-brain/             # GEM Brain (Web Service)
    ├── src/
    │   ├── brain.js       # Main orchestration logic
    │   ├── server.js      # HTTP API server
    │   ├── planner/
    │   │   └── rules.js   # Pattern-to-tool mapping rules
    │   └── lib/
    │       ├── registry.js   # Registry reader (same contract)
    │       └── supabase.js   # Database client
    ├── scripts/
    │   └── brain.js       # CLI interface for testing
    ├── sql/               # Brain-specific tables
    └── docs/              # Brain-specific docs
```

## Critical Conventions

### 1. tools.registry.json is Law

**Location**: `gem-core/tools.registry.json`

**NEVER modify this file without understanding full implications**. This single source of truth defines:

- All 99 tool names (domain.method format)
- Input/output JSON schemas
- Idempotency modes (`none`, `safe-retry`, `keyed`)
- Timeout values
- Permissions
- Receipt audit fields

**Current Status**: 40 tools implemented, 59 return `not_configured`

### 2. Receipt Contract

Every tool call produces exactly ONE receipt with this structure:

```javascript
{
  status: "succeeded" | "failed" | "not_configured",
  result: { /* tool-specific output */ },
  effects: {
    db_writes: [{ table: 'leads', action: 'insert', id: 'uuid' }],
    messages_sent: [...],     // optional
    files_written: [...],     // optional
    external_calls: [...]     // optional
  }
}
```

**Use helper functions** from `gem-core/src/lib/responses.js`:

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

### Brain Responsibilities
- Parse natural language messages
- Match against rules to determine tools
- Validate inputs against registry schemas
- Enqueue to `core_tool_calls` table
- Optionally wait for receipts
- Return structured responses

### Executor Responsibilities
- Poll `core_tool_calls` queue atomically
- Validate inputs (redundant safety check)
- Check idempotency
- Execute handlers with timeout
- Write receipts to `core_tool_receipts`
- Update call status

### What Brain Does NOT Do
- Execute tool logic directly
- Access domain tables (leads, quotes, etc.)
- Make external API calls

### What Executor Does NOT Do
- Parse natural language
- Have HTTP endpoints
- Make decisions about which tools to run

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

## Database Schema

### Core Tables

**`core_tool_calls`**: Queue of tool invocations
- `id` (UUID, PK)
- `tool_name` (text, indexed)
- `input` (jsonb)
- `status` (text: `queued` → `running` → `succeeded`/`failed`)
- `claimed_at`, `worker_id` (for atomic claiming)
- `idempotency_key` (text, optional)

**`core_tool_receipts`**: Execution results (exactly one per call)
- `call_id` (UUID, FK to core_tool_calls)
- `tool_name` (text)
- `status` (text: `succeeded`, `failed`, `not_configured`)
- `result` (jsonb)
- `effects` (jsonb)

**`brain_runs`**: Brain request/response audit log
- `id` (UUID, PK)
- `request` (jsonb)
- `response` (jsonb)
- `status` (text)

### Domain Tables

Located in `gem-core/sql/004_minimal_domain_tables.sql`:
- `notes`, `tasks`
- `leads` (with unique constraint on `phone`)
- `quotes`, `quote_line_items`
- `entities`, `jobs`, `invoices`, `inspections`, `comms_log`

## Key Implementation Details

### Atomic Job Claiming

Uses `claim_next_core_tool_call(p_worker_id TEXT)` RPC:
- `FOR UPDATE SKIP LOCKED` prevents race conditions
- Atomically updates `queued` → `running`
- Sets `claimed_at` and `worker_id`
- Returns claimed row or null

### Handler Return Format

```javascript
{
  result: { /* matches output_schema */ },
  effects: {
    db_writes: [{ table, action, id }],  // Audit trail
    messages_sent: [...],                 // For comms tools
    files_written: [...],                 // For media/export tools
    external_calls: [...]                 // For integration tools
  }
}
```

### Status Column Mapping (Important!)

**The `leads` table uses `status` column, NOT `stage`**:
- Registry defines parameter as `stage` for API consistency
- Handlers MUST map: `input.stage` → database `status` column
- See `gem-core/src/handlers/leads.js:90` and `:230` for examples

### Keyed Idempotency Implementation

For tools with `idempotency.mode: "keyed"`:

```javascript
// 1. Check for existing record
const { data: existing } = await supabase
  .from('leads')
  .select('id')
  .eq('phone', input.phone)
  .maybeSingle();

if (existing) {
  return success(
    { lead_id: existing.id },
    { db_writes: [], idempotency_hit: true }
  );
}

// 2. Insert with race condition handling
const { data, error } = await supabase
  .from('leads')
  .insert({ phone: input.phone, ... })
  .select('id')
  .single();

// 3. Handle unique constraint violation
if (error && error.code === '23505') {
  const { data: existingAfterRace } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', input.phone)
    .single();

  if (existingAfterRace) {
    return success(
      { lead_id: existingAfterRace.id },
      { db_writes: [], idempotency_hit: true }
    );
  }
}
```

## Documentation Reading Order

For new contributors, read in this order:

1. `/docs/SYSTEM.md` - Understand what GEM is
2. `/docs/CONSTRAINTS.md` - Learn the hard rules
3. `/docs/STATE.md` - See what's implemented vs planned
4. `gem-core/docs/EXECUTOR.md` - Executor mechanics
5. `gem-brain/docs/BRAIN.md` - Brain mechanics
6. `gem-core/docs/REGISTRY.md` - Deep dive on tool contracts

## Custom Claude Agents

This repository has specialized Claude Code agents available:

- **gem-contract-enforcer**: Use BEFORE modifying `tools.registry.json` or handler contracts. Validates contract compliance and prevents schema drift.

- **gem-monorepo-agent-factory-builder**: For generating agent specifications aligned with repo structure and contracts.

- **gem-skills-architect**: For designing skill packs that wrap tools with execution plans, validation gates, and documentation.

Invoke these agents proactively when working on contract-level changes or architectural modifications.

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

## Testing Workflows

### End-to-End Test

```bash
# 1. Start executor in one terminal
cd gem-core && npm start

# 2. In another terminal, use brain CLI
cd gem-brain
node scripts/brain.js "create a business task to review quotes"

# 3. Check receipt
psql $SUPABASE_URL -c "SELECT * FROM core_tool_receipts ORDER BY created_at DESC LIMIT 1;"
```

### Unit Test Handler

```javascript
// gem-core/test/handlers/my_test.js
import { create } from '../src/handlers/leads.js';

const result = await create({
  name: 'Test Lead',
  phone: '+1234567890',
  suburb: 'Brisbane',
  service: 'roof_repair'
});

console.log(result); // { result: { lead_id: '...' }, effects: {...} }
```

### Verify Registry Coverage

```bash
cd gem-core
node scripts/analyze-coverage.js
```

This shows which tools are implemented vs returning `not_configured`.

## Deployment

Both services deploy to Render:
- **gem-core**: Background Worker (always running)
- **gem-brain**: Web Service (HTTP API)

See `/docs/PLATFORMS.md` for deployment configuration.

Build commands are simple:
```bash
npm install  # Both use Node.js 20.x
```

Start commands:
```bash
# gem-core
node index.js

# gem-brain
node src/server.js
```

## Support and Escalation

- For contract questions: Use `gem-contract-enforcer` agent
- For architectural decisions: Check `/docs/DECISIONS.md` first
- For phase/status questions: See `/docs/STATE.md`
- For hard rules: See `/docs/CONSTRAINTS.md`
