# GEM Brain Runbook

> For system overview, see `/docs/SYSTEM.md`. For deployment context, see `/docs/PLATFORMS.md`.

## Prerequisites

- Node.js 20+
- Access to Supabase project with:
  - `core_tool_calls` table (created by gem-core migrations)
  - `core_tool_receipts` table (created by gem-core migrations)
  - `brain_runs` table (created by gem-brain migration)
- GEM-CORE executor running (for enqueue modes)

## Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional
PORT=3000                    # API server port (default: 3000)
HOST=0.0.0.0                 # API server host (default: 0.0.0.0)
LOG_LEVEL=info               # Logging level (default: info)
REGISTRY_PATH=/path/to/tools.registry.json  # Custom registry path
```

## Run Brain Locally

### 1. Install Dependencies

```bash
cd gem-brain
npm install
```

### 2. Run Database Migration

Execute in Supabase SQL Editor:

```sql
-- Copy contents of gem-brain/sql/001_brain_runs.sql
```

### 3. Start API Server

```bash
npm start
# Output: GEM Brain API running on http://0.0.0.0:3000
```

### 4. Test with curl

```bash
# Health check
curl http://localhost:3000/health

# Get help
curl http://localhost:3000/brain/help

# List tools
curl http://localhost:3000/brain/tools

# Run Brain (answer mode - no execution)
curl -X POST http://localhost:3000/brain/run \
  -H "Content-Type: application/json" \
  -d '{"message": "system status", "mode": "answer"}'

# Run Brain (enqueue_and_wait mode)
curl -X POST http://localhost:3000/brain/run \
  -H "Content-Type: application/json" \
  -d '{"message": "create task: test the brain", "mode": "enqueue_and_wait"}'
```

### 5. Use CLI

```bash
# Show help
node scripts/brain.js --help

# Run with message
node scripts/brain.js -m "system status" -M enqueue_and_wait

# Create a task
node scripts/brain.js -m "create task: review proposal" -M enqueue
```

## Deploy to Render

### 1. Create Web Service

- **Name**: gem-brain
- **Root Directory**: gem-brain
- **Build Command**: npm install
- **Start Command**: npm start
- **Environment**: Node

### 2. Set Environment Variables

In Render dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` (Render sets this automatically)

### 3. Deploy

Push to main branch or trigger manual deploy.

## Verify via Supabase

### Check Brain Runs

```sql
-- Recent brain runs
SELECT id, created_at, mode, status, message, assistant_message
FROM brain_runs
ORDER BY created_at DESC
LIMIT 10;

-- Failed brain runs
SELECT id, created_at, message, error
FROM brain_runs
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Brain runs with enqueued calls
SELECT id, message, enqueued_call_ids, status
FROM brain_runs
WHERE array_length(enqueued_call_ids, 1) > 0
ORDER BY created_at DESC;
```

### Check Tool Execution

```sql
-- Calls enqueued by brain
SELECT c.id, c.tool_name, c.status, c.created_at,
       r.status as receipt_status, r.result
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON c.id = r.call_id
WHERE c.created_at > NOW() - INTERVAL '1 hour'
ORDER BY c.created_at DESC;
```

### Verify Brain-to-Executor Flow

```sql
-- End-to-end: brain_run -> tool_call -> receipt
SELECT
  b.id as brain_run_id,
  b.message,
  b.status as brain_status,
  c.id as call_id,
  c.tool_name,
  c.status as call_status,
  r.status as receipt_status,
  r.result
FROM brain_runs b
CROSS JOIN LATERAL unnest(b.enqueued_call_ids) as call_id
LEFT JOIN core_tool_calls c ON c.id = call_id
LEFT JOIN core_tool_receipts r ON r.call_id = c.id
ORDER BY b.created_at DESC
LIMIT 20;
```

## Troubleshooting

### Brain returns "No matching rules"

The message doesn't match any known patterns. Use:
- `GET /brain/help` to see available commands
- Rephrase using exact patterns like "create task: [title]"

### Timeout waiting for receipts

The executor may be slow or not running. Check:
1. Is the executor running? (`gem-core` logs)
2. Are there queued calls? (`SELECT * FROM core_tool_calls WHERE status = 'queued'`)
3. Increase timeout: `{"limits": {"wait_timeout_ms": 60000}}`

### Validation errors

Input doesn't match registry schema. Check:
1. Response `errors` array for details
2. Tool schema in `tools.registry.json`

### Database connection errors

Check environment variables:
```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

---

*This runbook should be updated when deployment or operational procedures change.*
