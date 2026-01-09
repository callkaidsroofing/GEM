-- Migration: Create integrations_highlevel_connections table
-- Purpose: Track HighLevel/LeadConnector location connections and sync state
-- Required by: integrations.highlevel.health_check, integrations.highlevel.sync_contacts
-- Safe to run multiple times (IF NOT EXISTS)

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
