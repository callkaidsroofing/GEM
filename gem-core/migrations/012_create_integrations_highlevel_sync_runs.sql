-- Migration: Create integrations_highlevel_sync_runs table
-- Purpose: Audit trail for sync operations (optional but recommended)
-- Required by: integrations.highlevel.sync_contacts (for auditing)
-- Safe to run multiple times (IF NOT EXISTS)

-- Table: integrations_highlevel_sync_runs
-- Audit log for each sync operation
CREATE TABLE IF NOT EXISTS integrations_highlevel_sync_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id text NOT NULL,
    run_type text NOT NULL DEFAULT 'manual',
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status text NOT NULL DEFAULT 'running',
    counts jsonb NOT NULL DEFAULT '{"fetched": 0, "upserted": 0, "unchanged": 0, "errors": 0}',
    cursor_start text,
    cursor_end text,
    since_filter timestamptz,
    dry_run boolean NOT NULL DEFAULT false,
    error_message text,
    call_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_highlevel_sync_runs_location_id 
    ON integrations_highlevel_sync_runs(location_id);

-- Index for started_at ordering (recent runs)
CREATE INDEX IF NOT EXISTS idx_highlevel_sync_runs_started_at 
    ON integrations_highlevel_sync_runs(started_at DESC);

-- Index for status monitoring
CREATE INDEX IF NOT EXISTS idx_highlevel_sync_runs_status 
    ON integrations_highlevel_sync_runs(status);

-- Index for call_id lookup (link to core_tool_calls)
CREATE INDEX IF NOT EXISTS idx_highlevel_sync_runs_call_id 
    ON integrations_highlevel_sync_runs(call_id) 
    WHERE call_id IS NOT NULL;

-- Comments
COMMENT ON TABLE integrations_highlevel_sync_runs IS 
    'Audit trail for HighLevel contact sync operations';
COMMENT ON COLUMN integrations_highlevel_sync_runs.location_id IS 
    'HighLevel location ID being synced';
COMMENT ON COLUMN integrations_highlevel_sync_runs.run_type IS 
    'Type of sync: manual, scheduled, webhook';
COMMENT ON COLUMN integrations_highlevel_sync_runs.status IS 
    'Run status: running, completed, failed, partial';
COMMENT ON COLUMN integrations_highlevel_sync_runs.counts IS 
    'Sync counts: {fetched, upserted, unchanged, errors}';
COMMENT ON COLUMN integrations_highlevel_sync_runs.cursor_start IS 
    'Starting cursor/pagination token';
COMMENT ON COLUMN integrations_highlevel_sync_runs.cursor_end IS 
    'Ending cursor/pagination token for resume';
COMMENT ON COLUMN integrations_highlevel_sync_runs.since_filter IS 
    'Optional since filter used for incremental sync';
COMMENT ON COLUMN integrations_highlevel_sync_runs.dry_run IS 
    'Whether this was a dry run (no DB writes)';
COMMENT ON COLUMN integrations_highlevel_sync_runs.call_id IS 
    'Reference to core_tool_calls for traceability';
