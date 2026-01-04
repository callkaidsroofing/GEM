# GEM System Overview

## What is GEM?

GEM (General Execution Manager) is a cloud-hosted, registry-driven execution system designed to reliably perform business actions for Call Kaids Roofing via deterministic tool contracts.

GEM consists of two main components:

1. **GEM-CORE (Executor)** - Background worker that executes tool calls
2. **GEM-Brain** - AI interaction layer that translates messages to tool calls

## GEM-CORE (Executor)

The execution engine. It is:

- **A background worker** - Not an API server, not a UI, not a chat interface
- **Registry-driven** - All tools are defined in `tools.registry.json`
- **Database-authoritative** - Supabase is the single source of truth
- **Receipt-enforced** - Every tool execution produces exactly one receipt
- **Idempotent by design** - Safe retries and keyed deduplication built-in

**Location**: `gem-core/`

## GEM-Brain

The AI interaction layer. It:

- Translates natural language messages into registry-valid tool calls
- Validates input against registry schemas before enqueueing
- Enqueues tool calls to Supabase for the executor to process
- Optionally waits for and returns execution receipts
- Provides both HTTP API and CLI interfaces

**Location**: `gem-brain/`

See `gem-brain/docs/BRAIN.md` for detailed Brain documentation.

## What This System Is NOT

- A user interface
- A chat frontend
- A workflow designer
- An agent orchestration platform

## Core Principles

1. **Registry is law** - Tool definitions in `tools.registry.json` are the contract
2. **No fake success** - Every tool returns real status (succeeded, failed, not_configured)
3. **Exactly one receipt per call** - Audit trail is complete and deterministic
4. **Idempotency guarantees** - Safe retries, no duplicate effects
5. **Worker loop stability** - Individual tool failures never crash the worker
6. **Brain validates, Executor executes** - Clear separation of concerns

## Full Architecture

```
┌─────────────────────┐
│  User Message       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM Brain          │  ← Plans, validates, enqueues
│  (gem-brain/)       │
│  - Rules-first      │
│  - HTTP API + CLI   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_calls    │  ← Enqueued tool invocations (Supabase)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM-CORE Executor  │  ← Claims, executes, writes receipts
│  (gem-core/)        │
│  - Background worker│
│  - No HTTP server   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Execution results (Supabase)
└─────────────────────┘
```

## Queue-Based Communication

Brain and Executor communicate only through Supabase tables:

1. Brain inserts to `core_tool_calls` with status `queued`
2. Executor claims the call atomically via RPC
3. Executor validates input against registry schema
4. Executor checks idempotency (safe-retry or keyed)
5. Executor runs handler
6. Executor writes receipt to `core_tool_receipts`
7. Executor updates call status
8. Brain can poll `core_tool_receipts` for results

## Deployment

### GEM-CORE Executor
- **Type**: Render Background Worker
- **Root Directory**: `gem-core`
- **Start Command**: `node index.js`
- **Runtime**: Node.js 20+

### GEM Brain
- **Type**: Render Web Service
- **Root Directory**: `gem-brain`
- **Start Command**: `npm start`
- **Runtime**: Node.js 20+

### Database
- **Provider**: Supabase (PostgreSQL)
- **Configuration**: Environment variables only (no dotenv)

---

*This document defines system identity and rarely changes.*
