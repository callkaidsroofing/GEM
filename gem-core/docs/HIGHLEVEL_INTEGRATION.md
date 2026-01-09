# GEM ⇄ HighLevel (Location-only) Integration

This document describes the HighLevel/LeadConnector contact sync integration for the GEM system.

## Overview

The integration provides:
- **Health check** for HighLevel API connectivity
- **Contact sync** from HighLevel to local Supabase database
- **Audit trail** for all sync operations
- **Change detection** using payload hashing

## Scope

- **Location-only**: Single tenant boundary via `HIGHLEVEL_LOCATION_ID`
- **Contact sync only**: No campaigns, outbound comms, or pipelines
- **Supabase as system-of-record**: HighLevel is upstream data source

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HIGHLEVEL_PRIVATE_API_KEY` | Yes | Private API key from HighLevel |
| `HIGHLEVEL_LOCATION_ID` | Yes | Location ID (e.g., `g9ue9OBQ12B8KgPIszOo`) |
| `HIGHLEVEL_BASE_URL` | No | API base URL (default: `https://services.leadconnectorhq.com`) |

**Security**: Never log, print, or commit API keys.

## Tools

### `integrations.highlevel.health_check`

Check HighLevel API connectivity and location access.

**Input Schema**: `{}`

**Output Schema**:
```json
{
  "status": "ok|degraded|down",
  "location_id": "string",
  "checks": {
    "api": true|false
  }
}
```

**Idempotency**: `safe-retry`

### `integrations.highlevel.sync_contacts`

Sync contacts from HighLevel to local database.

**Input Schema**:
```json
{
  "location_id": "string (optional, defaults to env)",
  "cursor": "string (optional, pagination)",
  "since": "ISO timestamp (optional, incremental sync)",
  "limit": "integer (optional, default 100, max 200)",
  "dry_run": "boolean (optional, default false)"
}
```

**Output Schema**:
```json
{
  "status": "ok|partial|failed",
  "location_id": "string",
  "counts": {
    "fetched": 0,
    "upserted": 0,
    "unchanged": 0,
    "errors": 0
  },
  "cursor": "string|null",
  "next_cursor": "string|null",
  "last_sync_at": "ISO timestamp"
}
```

**Idempotency**: `safe-retry` (keyed by location_id + cursor/since)

## Database Tables

### `integrations_highlevel_connections`

Tracks connection state for each HighLevel location.

| Column | Type | Description |
|--------|------|-------------|
| `location_id` | text PK | HighLevel location ID |
| `enabled` | boolean | Whether sync is enabled |
| `last_sync_at` | timestamptz | Last successful sync |
| `last_cursor` | jsonb | Pagination state |
| `sync_status` | text | pending/syncing/completed/error |
| `created_at` | timestamptz | Record creation |
| `updated_at` | timestamptz | Last update (auto-trigger) |

### `integrations_highlevel_contacts`

Stores synced contacts with change detection.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Internal ID |
| `location_id` | text | HighLevel location |
| `highlevel_contact_id` | text UNIQUE | Contact ID from HighLevel |
| `payload` | jsonb | Full contact payload |
| `payload_hash` | text | SHA-256 for change detection |
| `mapped_entity_id` | uuid | Link to entities table (soft FK) |
| `sync_status` | text | active/deleted/error |
| `first_synced_at` | timestamptz | First sync timestamp |
| `created_at` | timestamptz | Record creation |
| `updated_at` | timestamptz | Last update (auto-trigger) |

### `integrations_highlevel_sync_runs`

Audit trail for sync operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Run ID |
| `location_id` | text | HighLevel location |
| `run_type` | text | manual/scheduled/webhook |
| `started_at` | timestamptz | Start time |
| `finished_at` | timestamptz | End time |
| `status` | text | running/completed/failed/partial |
| `counts` | jsonb | {fetched, upserted, unchanged, errors} |
| `cursor_start` | text | Starting cursor |
| `cursor_end` | text | Ending cursor |
| `since_filter` | timestamptz | Since filter used |
| `dry_run` | boolean | Whether dry run |
| `error_message` | text | Error details (redacted) |
| `call_id` | uuid | Link to core_tool_calls |

## Natural Language Commands

The gem-brain planner supports these phrases:

| Phrase | Tool |
|--------|------|
| `highlevel status` | `integrations.highlevel.health_check` |
| `check highlevel health` | `integrations.highlevel.health_check` |
| `sync highlevel contacts` | `integrations.highlevel.sync_contacts` |
| `sync highlevel contacts since 2026-01-01` | `integrations.highlevel.sync_contacts` with `since` |
| `sync highlevel contacts dry run` | `integrations.highlevel.sync_contacts` with `dry_run: true` |

## Deployment

### 1. Run Migrations

In Supabase SQL Editor, run:
```sql
-- Option A: Run combined file
\i migrations/DEPLOY_HIGHLEVEL.sql

-- Option B: Run individual migrations
\i migrations/010_create_integrations_highlevel_connections.sql
\i migrations/011_create_integrations_highlevel_contacts.sql
\i migrations/012_create_integrations_highlevel_sync_runs.sql
```

Or copy-paste the contents of `DEPLOY_HIGHLEVEL.sql` directly.

### 2. Set Environment Variables

On Render (or your deployment platform):
```bash
HIGHLEVEL_PRIVATE_API_KEY=your_api_key_here
HIGHLEVEL_LOCATION_ID=g9ue9OBQ12B8KgPIszOo
```

### 3. Verify Installation

```bash
# Run drift check
cd gem-core
node scripts/drift-check.js
```

## Verification Commands

### Enqueue Health Check

```sql
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES (
  'integrations.highlevel.health_check',
  '{}',
  'queued'
);
```

### Enqueue Dry Run Sync

```sql
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES (
  'integrations.highlevel.sync_contacts',
  '{"dry_run": true}',
  'queued'
);
```

### Check Receipts

```sql
SELECT 
  id,
  tool_name,
  status,
  result,
  created_at
FROM core_tool_receipts 
WHERE tool_name LIKE 'integrations.highlevel.%'
ORDER BY created_at DESC 
LIMIT 5;
```

### Verify Tables Exist

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'integrations_highlevel%';
```

## File Changes Summary

| File | Purpose |
|------|---------|
| `migrations/010_create_integrations_highlevel_connections.sql` | Connection state table |
| `migrations/011_create_integrations_highlevel_contacts.sql` | Contacts table |
| `migrations/012_create_integrations_highlevel_sync_runs.sql` | Audit table |
| `migrations/DEPLOY_HIGHLEVEL.sql` | Combined deployment script |
| `tools.registry.json` | Added 2 new tools |
| `src/providers/highlevel.js` | HighLevel API provider |
| `src/handlers/integrations.js` | Handler implementations |
| `scripts/drift-check.js` | Registry/handler drift detection |
| `gem-brain/src/planner/rules.js` | Natural language rules |

## Terminal States

All receipts use terminal states only:
- `succeeded` - Operation completed successfully
- `failed` - Operation failed with error
- `not_configured` - Required environment variables missing

## Security Notes

1. **API Key Protection**: Never log, print, or store `HIGHLEVEL_PRIVATE_API_KEY`
2. **Error Redaction**: Error messages are sanitized before storage
3. **Supabase as SoR**: HighLevel is upstream; Supabase is system-of-record
4. **Location Scoping**: All operations scoped to single `HIGHLEVEL_LOCATION_ID`
