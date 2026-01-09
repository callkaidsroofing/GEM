# GEM System

GEM (General Execution Manager) is a registry-driven tool execution system for Call Kaids Roofing. A monorepo with three modules, two running as services on Render, all backed by Supabase.

## Modules

### GEM-CORE Executor (`/gem-core`)
- Render background worker
- Polls `core_tool_calls` queue
- Executes handlers from `tools.registry.json`
- Writes receipts to `core_tool_receipts`
- Start: `node index.js`

### GEM Brain (`/gem-brain`)
- Render web service
- Translates messages to tool calls via rules-first planner
- Validates against registry before enqueueing
- HTTP API: `POST /brain/run`
- CLI: `node scripts/brain.js`
- Start: `npm start`

### GEM Shared (`/gem-shared`)
- Shared contracts, schemas, and validation utilities
- Used by both gem-core and gem-brain
- Not deployed as a service

## Data Flow

```
Message → Brain → core_tool_calls → Executor → core_tool_receipts
```

Brain enqueues. Executor executes. Both use Supabase.

## Core Tables

| Table | Purpose |
|-------|---------|
| `core_tool_calls` | Queue of pending/running/completed calls |
| `core_tool_receipts` | Execution results (one per call) |
| `brain_runs` | Brain request/response audit log |

## Contract

Every tool call produces exactly one receipt with status:
- `succeeded` - Real execution completed
- `failed` - Error occurred
- `not_configured` - Tool exists but needs setup

No silent success. No missing receipts.

## Registry

`gem-core/tools.registry.json` defines all 99 tools:
- Names, schemas, idempotency rules
- ~50 have real implementations
- ~49 return `not_configured`

See `/docs/STATE.md` for current coverage. Registry is read-only at runtime.

## Boundaries

- Executor has no HTTP server
- Brain has no tool execution logic
- Termux/frontend_bridge.py is a separate system (not in this repo)
- All communication via Supabase tables
