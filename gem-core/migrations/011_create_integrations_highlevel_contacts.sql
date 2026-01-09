-- Migration: Create integrations_highlevel_contacts table
-- Purpose: Store synced contacts from HighLevel with change detection
-- Required by: integrations.highlevel.sync_contacts
-- Safe to run multiple times (IF NOT EXISTS)

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

-- Optional: GIN index on payload for JSONB queries (can be added later if needed)
-- CREATE INDEX IF NOT EXISTS idx_highlevel_contacts_payload_gin 
--     ON integrations_highlevel_contacts USING gin(payload);

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
