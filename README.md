# GEM - General Execution Manager

GEM is a registry-driven tool execution system for Call Kaids Roofing. It provides reliable, auditable execution of business operations via a deterministic contract-based architecture.

## Architecture

```
┌─────────────────────┐
│  core_tool_calls    │  ← Enqueued tool invocations
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CKR-CORE Worker    │  ← Claims, validates, executes, writes receipts
│  (index.js)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Execution results and effects
└─────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20.x
- Supabase project with required tables

### Environment Variables
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TOOLS_POLL_INTERVAL_MS=5000  # optional, default 5000
```

### Run Locally
```bash
npm install
npm start
```

### Enqueue a Tool Call
```sql
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES ('os.create_task', '{"title": "Test task", "domain": "business"}', 'queued');
```

### Check Receipt
```sql
SELECT * FROM core_tool_receipts ORDER BY created_at DESC LIMIT 1;
```

## Core Concepts

### Registry-Driven
All tools are defined in `tools.registry.json`. The registry is the contract.

### Three Outcome States
Every tool execution produces exactly one of:
- `succeeded` - Real execution with effects
- `failed` - Error with details
- `not_configured` - Tool exists but requires setup

### Idempotency
- `none` - Always execute
- `safe-retry` - Return existing receipt for same call
- `keyed` - Prevent duplicates based on key field

## Documentation

See `/docs` for detailed documentation:
- `SYSTEM.md` - System overview
- `INTENT.md` - Current development focus
- `CONSTRAINTS.md` - Non-negotiable rules
- `STATE.md` - Current implementation status
- `REGISTRY.md` - How tools work
- `AGENTS.md` - Guidelines for AI coding agents
- `PLATFORMS.md` - Deployment environments
- `DECISIONS.md` - Architectural decisions
- `registry_coverage.md` - Tool coverage report

## Deployment

Deployed as a background worker on Render. See `PLATFORMS.md` for details.

## License

Proprietary - Call Kaids Roofing
