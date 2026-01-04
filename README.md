# GEM - General Execution Manager

GEM is a registry-driven tool execution system for Call Kaids Roofing. It provides reliable, auditable execution of business operations via a deterministic contract-based architecture.

## Repository Structure

```
/
├── gem-core/           # CKR-CORE Tool Executor (Render Background Worker)
│   ├── index.js        # Worker entry point
│   ├── package.json    # Dependencies
│   ├── tools.registry.json  # Tool definitions
│   ├── src/            # Handler implementations
│   ├── docs/           # System documentation
│   ├── sql/            # Core table migrations
│   ├── migrations/     # Domain table migrations
│   ├── scripts/        # Utility scripts
│   └── tests/          # Verification SQL
└── README.md           # This file
```

## GEM-CORE Executor

The executor is a background worker that processes tool calls from a Supabase queue.

### Architecture

```
┌─────────────────────┐
│  core_tool_calls    │  ← Enqueued tool invocations
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CKR-CORE Worker    │  ← Claims, validates, executes, writes receipts
│  (gem-core/)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  core_tool_receipts │  ← Execution results and effects
└─────────────────────┘
```

### Quick Start

```bash
cd gem-core
npm install
npm start
```

### Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TOOLS_POLL_INTERVAL_MS=5000  # optional, default 5000
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

## Documentation

All system documentation lives in `gem-core/docs/`. Read in this order:

1. **`SYSTEM.md`** - What GEM/CKR-CORE is (and isn't)
2. **`INTENT.md`** - Current development phase and focus
3. **`CONSTRAINTS.md`** - Non-negotiable rules
4. **`STATE.md`** - What exists today, what's next

Reference docs:
- `REGISTRY.md` - How tools and idempotency work
- `AGENTS.md` - Guidelines for AI coding agents
- `PLATFORMS.md` - Render and Supabase deployment
- `DECISIONS.md` - Architectural decisions (locked)
- `registry_coverage.md` - Generated tool coverage report

## Deployment (Render)

After restructure, configure Render with:
- **Root Directory**: `gem-core`
- **Start Command**: `node index.js`
- **Build Command**: `npm install`

See `gem-core/docs/PLATFORMS.md` for full details.

## License

Proprietary - Call Kaids Roofing
