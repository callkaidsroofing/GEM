# GEM - General Execution Manager

GEM is a registry-driven tool execution system for Call Kaids Roofing. It provides reliable, auditable execution of business operations via a deterministic contract-based architecture.

## Repository Structure

```
/
├── gem-core/           # CKR-CORE Tool Executor (Render Background Worker)
│   ├── index.js        # Worker entry point
│   ├── package.json    # Dependencies
│   ├── tools.registry.json  # Tool definitions (99 tools)
│   ├── src/            # Handler implementations
│   ├── docs/           # System documentation
│   ├── sql/            # Core table migrations
│   ├── migrations/     # Domain table migrations
│   ├── scripts/        # Utility scripts
│   └── tests/          # Verification SQL
│
├── gem-brain/          # AI Brain Layer (Render Web Service)
│   ├── src/            # Brain implementation
│   │   ├── server.js   # HTTP API (Fastify)
│   │   ├── brain.js    # Core runner
│   │   └── planner/    # Rules-first planner
│   ├── scripts/        # CLI wrapper
│   ├── docs/           # Brain documentation
│   ├── sql/            # brain_runs migration
│   └── tests/          # Verification SQL
│
└── README.md           # This file
```

## Architecture

```
┌─────────────────────┐
│  User Message       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM Brain          │  ← Plans, validates, enqueues
│  (gem-brain/)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_calls    │  ← Queue (Supabase)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GEM-CORE Executor  │  ← Executes, writes receipts
│  (gem-core/)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Results (Supabase)
└─────────────────────┘
```

## Quick Start

### GEM-CORE Executor

```bash
cd gem-core
npm install
npm start
```

### GEM Brain

```bash
cd gem-brain
npm install
npm start  # Starts HTTP API on port 3000
```

### Environment Variables

```bash
# Required for both
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional
TOOLS_POLL_INTERVAL_MS=5000  # Executor poll interval
PORT=3000                    # Brain API port
```

## Using the Brain

### CLI

```bash
cd gem-brain

# Answer mode (no execution)
node scripts/brain.js -m "system status" -M answer

# Enqueue and wait for results
node scripts/brain.js -m "create task: test the brain" -M enqueue_and_wait
```

### HTTP API

```bash
# Health check
curl http://localhost:3000/health

# Run Brain
curl -X POST http://localhost:3000/brain/run \
  -H "Content-Type: application/json" \
  -d '{"message": "system status", "mode": "enqueue_and_wait"}'
```

## Documentation

### Core Documentation (`gem-core/docs/`)

1. **`SYSTEM.md`** - What GEM is (executor + brain)
2. **`INTENT.md`** - Current development phase
3. **`CONSTRAINTS.md`** - Non-negotiable rules
4. **`STATE.md`** - Current implementation status
5. **`AGENTS.md`** - Guidelines for AI coding agents

### Brain Documentation (`gem-brain/docs/`)

1. **`BRAIN.md`** - Brain contract, modes, failure modes
2. **`RUNBOOK.md`** - How to run and deploy Brain

## Deployment (Render)

### GEM-CORE Executor (Background Worker)
- **Root Directory**: `gem-core`
- **Start Command**: `node index.js`
- **Build Command**: `npm install`

### GEM Brain (Web Service)
- **Root Directory**: `gem-brain`
- **Start Command**: `npm start`
- **Build Command**: `npm install`

See `gem-core/docs/PLATFORMS.md` for full details.

## License

Proprietary - Call Kaids Roofing
