# GEM / CKR-CORE System Overview

## What is GEM?

GEM (General Execution Manager) is a cloud-hosted, registry-driven execution system designed to reliably perform business actions for Call Kaids Roofing via deterministic tool contracts.

## What is CKR-CORE?

CKR-CORE is the execution engine inside GEM. It is:

- **A background worker** - Not an API server, not a UI, not a chat interface
- **Registry-driven** - All tools are defined in `tools.registry.json`
- **Database-authoritative** - Supabase is the single source of truth
- **Receipt-enforced** - Every tool execution produces exactly one receipt
- **Idempotent by design** - Safe retries and keyed deduplication built-in

## What This System Is NOT

- A user interface
- An API server
- An agent chat interface
- A workflow designer
- A frontend application

## Core Principles

1. **Registry is law** - Tool definitions in `tools.registry.json` are the contract
2. **No fake success** - Every tool returns real status (succeeded, failed, not_configured)
3. **Exactly one receipt per call** - Audit trail is complete and deterministic
4. **Idempotency guarantees** - Safe retries, no duplicate effects
5. **Worker loop stability** - Individual tool failures never crash the worker

## Architecture

```
┌─────────────────────┐
│  core_tool_calls    │  ← Enqueued tool invocations
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CKR-CORE Worker    │  ← Claims, executes, writes receipts
│  (index.js)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Execution results and effects
└─────────────────────┘
```

## Tool Execution Flow

1. Tool call is inserted into `core_tool_calls` with status `queued`
2. Worker claims the call atomically via RPC
3. Worker validates input against registry schema
4. Worker checks idempotency (safe-retry or keyed)
5. Worker executes handler
6. Worker writes receipt to `core_tool_receipts`
7. Worker updates call status (succeeded, failed, not_configured)

## Deployment

- **Runtime**: Node.js 20.x (ESM)
- **Host**: Render (background worker)
- **Database**: Supabase (PostgreSQL)
- **Configuration**: Environment variables only (no dotenv)

---

*This document defines system identity and rarely changes.*
