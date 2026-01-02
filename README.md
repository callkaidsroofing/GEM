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

## Documentation

All system documentation lives in `/docs`. Read in this order:

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

## Deployment

Deployed as a background worker on Render. See `PLATFORMS.md` for details.

## License

Proprietary - Call Kaids Roofing
