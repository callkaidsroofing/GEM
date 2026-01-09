-- ============================================
-- GEM HighLevel Integration - Combined Migrations
-- ============================================
-- Run this file in Supabase SQL Editor to deploy all HighLevel tables
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================

-- ============================================
-- 010: integrations_highlevel_connections
-- ============================================

-- Table: integrations_highlevel_connections
-- Stores connection state for each HighLevel location
CREATE TABLE IF NOT EXISTS integrations_highlevel_connections (
    location_id text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true,
    last_sync_at timestamptz,
    last_cursor jsonb,
    sync_status text DEFAULT 'pending',
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_integrations_highlevel_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_integrations_highlevel_connections_updated_at 
    ON integrations_highlevel_connections;

CREATE TRIGGER trg_integrations_highlevel_connections_updated_at
    BEFORE UPDATE ON integrations_highlevel_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_integrations_highlevel_connections_updated_at();

-- Index for enabled connections lookup
CREATE INDEX IF NOT EXISTS idx_highlevel_connections_enabled 
    ON integrations_highlevel_connections(enabled) 
    WHERE enabled = true;

-- Index for sync status monitoring
CREATE INDEX IF NOT EXISTS idx_highlevel_connections_sync_status 
    ON integrations_highlevel_connections(sync_status);

-- Comments
COMMENT ON TABLE integrations_highlevel_connections IS 
    'HighLevel/LeadConnector location connection state and sync tracking';
COMMENT ON COLUMN integrations_highlevel_connections.location_id IS 
    'HighLevel location ID (tenant boundary)';
COMMENT ON COLUMN integrations_highlevel_connections.enabled IS 
    'Whether sync is enabled for this location';
COMMENT ON COLUMN integrations_highlevel_connections.last_sync_at IS 
    'Timestamp of last successful sync';
COMMENT ON COLUMN integrations_highlevel_connections.last_cursor IS 
    'Cursor/pagination state from last sync (JSON for flexibility)';
COMMENT ON COLUMN integrations_highlevel_connections.sync_status IS 
    'Current sync status: pending, syncing, completed, error';

-- ============================================
-- 011: integrations_highlevel_contacts
-- ============================================

-- Table: integrations_highlevel_contacts
-- Stores contacts synced from HighLevel with payload hash for change detection
CREATE TABLE IF NOT EXISTS integrations_highlevel_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id text NOT NULL,
    highlevel_contact_id text NOT NULL,
    payload jsonb NOT NULL,
    payload_hash text,
    mapped_entity_id uuid,
    sync_status text DEFAULT 'active',
    first_synced_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure unique contact per location
    CONSTRAINT uq_highlevel_contact_per_location 
        UNIQUE (location_id, highlevel_contact_id)
);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_integrations_highlevel_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_integrations_highlevel_contacts_updated_at 
    ON integrations_highlevel_contacts;

CREATE TRIGGER trg_integrations_highlevel_contacts_updated_at
    BEFORE UPDATE ON integrations_highlevel_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_integrations_highlevel_contacts_updated_at();

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_highlevel_contacts_location_id 
    ON integrations_highlevel_contacts(location_id);

-- Index for updated_at ordering (recent changes)
CREATE INDEX IF NOT EXISTS idx_highlevel_contacts_updated_at 
    ON integrations_highlevel_contacts(updated_at DESC);

-- Unique index on highlevel_contact_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_highlevel_contacts_highlevel_id 
    ON integrations_highlevel_contacts(highlevel_contact_id);

-- Index for mapped entity lookups
CREATE INDEX IF NOT EXISTS idx_highlevel_contacts_mapped_entity 
    ON integrations_highlevel_contacts(mapped_entity_id) 
    WHERE mapped_entity_id IS NOT NULL;

-- Index for sync status
CREATE INDEX IF NOT EXISTS idx_highlevel_contacts_sync_status 
    ON integrations_highlevel_contacts(sync_status);

-- Comments
COMMENT ON TABLE integrations_highlevel_contacts IS 
    'Contacts synced from HighLevel/LeadConnector with change detection';
COMMENT ON COLUMN integrations_highlevel_contacts.location_id IS 
    'HighLevel location ID this contact belongs to';
COMMENT ON COLUMN integrations_highlevel_contacts.highlevel_contact_id IS 
    'Unique contact ID from HighLevel API';
COMMENT ON COLUMN integrations_highlevel_contacts.payload IS 
    'Full contact payload from HighLevel API';
COMMENT ON COLUMN integrations_highlevel_contacts.payload_hash IS 
    'SHA-256 hash of payload for change detection (unchanged detection)';
COMMENT ON COLUMN integrations_highlevel_contacts.mapped_entity_id IS 
    'Reference to GEM entities table (soft FK, nullable)';
COMMENT ON COLUMN integrations_highlevel_contacts.sync_status IS 
    'Sync status: active, deleted, error';
COMMENT ON COLUMN integrations_highlevel_contacts.first_synced_at IS 
    'When this contact was first synced from HighLevel';

-- ============================================
-- 012: integrations_highlevel_sync_runs
-- ============================================

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

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify tables were created:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name LIKE 'integrations_highlevel%';
