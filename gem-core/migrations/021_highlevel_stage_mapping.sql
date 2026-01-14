-- Migration: GoHighLevel Pipeline Stage Mapping
-- Purpose: Map GHL pipeline stages to CKR lead statuses for bidirectional sync
-- Safe to run multiple times (IF NOT EXISTS + upsert)

-- ============================================
-- PIPELINE STAGE MAPPING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS highlevel_stage_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- GoHighLevel identifiers
    highlevel_pipeline_id TEXT NOT NULL,
    highlevel_pipeline_name TEXT NOT NULL,
    highlevel_stage_id TEXT NOT NULL,
    highlevel_stage_name TEXT NOT NULL,
    highlevel_stage_position INTEGER DEFAULT 0,
    
    -- CKR mapping
    ckr_lead_status TEXT NOT NULL CHECK (ckr_lead_status IN (
        'new', 'contacted', 'inspection_scheduled', 'quoted', 'won', 'lost'
    )),
    
    -- Sync behavior
    auto_sync_inbound BOOLEAN DEFAULT TRUE,
    auto_sync_outbound BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT uq_highlevel_stage UNIQUE (highlevel_pipeline_id, highlevel_stage_id)
);

-- ============================================
-- INSERT DEFAULT STAGE MAPPINGS
-- ============================================
-- Based on actual pipeline data from location g9ue9OBQ12B8KgPIszOo

-- Pipeline: 1-Step Funnel | Quotes & Enquiries (7zMxpJIUy0vtIWzdjnuK)
INSERT INTO highlevel_stage_mapping 
    (highlevel_pipeline_id, highlevel_pipeline_name, highlevel_stage_id, highlevel_stage_name, highlevel_stage_position, ckr_lead_status)
VALUES
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', 'f2545f7a-c364-4545-bc64-169f29ce1475', 'New Lead', 0, 'new'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', 'b6d840bb-260f-4e64-8212-95232f0f1c6a', 'Contacted', 1, 'contacted'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', '1038f62b-0be2-44b1-94c0-0ebaa73fdd59', 'Roof Health Check Booked', 2, 'inspection_scheduled'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', 'bbc51746-485d-4703-a78f-c1b5631a241a', 'Quoting', 3, 'quoted'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', '17b86090-5bed-4af5-81de-2c88472a3046', 'Follow Up', 4, 'quoted'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', 'a4ca55e9-d67b-494c-be55-c2718b1e07f5', 'Services Sold', 5, 'won'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', 'f4476684-a0f0-4fd6-a392-bfe630a8fd6c', 'Ghosting', 6, 'lost'),
    ('7zMxpJIUy0vtIWzdjnuK', '1-Step Funnel | Quotes & Enquiries', '54d25149-a992-4050-91c0-81082e4829d4', 'Disqualified', 7, 'lost')
ON CONFLICT (highlevel_pipeline_id, highlevel_stage_id) DO UPDATE SET
    highlevel_stage_name = EXCLUDED.highlevel_stage_name,
    highlevel_stage_position = EXCLUDED.highlevel_stage_position,
    ckr_lead_status = EXCLUDED.ckr_lead_status,
    updated_at = NOW();

-- Pipeline: Lead Management (Kh73wln8M2JjhO9LrBLD)
INSERT INTO highlevel_stage_mapping 
    (highlevel_pipeline_id, highlevel_pipeline_name, highlevel_stage_id, highlevel_stage_name, highlevel_stage_position, ckr_lead_status)
VALUES
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '739acf7d-d73c-4d35-8c10-84e4825055c9', 'Lead In', 0, 'new'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', 'c7b902d8-4d26-456a-b9a6-c6005132f1af', 'Contact Made', 1, 'contacted'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '1a7a427c-563f-45a2-8475-f9722a6854b0', 'Qualified', 2, 'contacted'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '88c9a543-01cd-45d5-944f-93984a4e3121', 'In person meeting scheduled', 3, 'inspection_scheduled'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '6c508856-abdd-4b31-9aa5-3b7a159f6532', 'In person meeting completed', 4, 'inspection_scheduled'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '4bde2822-0901-4079-bbc7-dc1c2c82d999', 'On hold', 5, 'contacted'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '6d5d9af3-1aa3-4dae-ac35-fc004175042a', 'Sales Quote', 6, 'quoted'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', 'de11caf8-4369-467a-87a7-0028abe2d2d2', 'Sales Quote Signed', 7, 'won'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '27315f70-3c3a-49e8-bec0-8e3a0d0694e8', 'Disqualified', 8, 'lost'),
    ('Kh73wln8M2JjhO9LrBLD', 'Lead Management', '5463dd4d-da7b-400c-819a-5eb423698763', 'Ghosting', 9, 'lost')
ON CONFLICT (highlevel_pipeline_id, highlevel_stage_id) DO UPDATE SET
    highlevel_stage_name = EXCLUDED.highlevel_stage_name,
    highlevel_stage_position = EXCLUDED.highlevel_stage_position,
    ckr_lead_status = EXCLUDED.ckr_lead_status,
    updated_at = NOW();

-- ============================================
-- ADD HIGHLEVEL FIELDS TO LEADS TABLE
-- ============================================
-- Add GoHighLevel linking columns if they don't exist

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'highlevel_contact_id') THEN
        ALTER TABLE leads ADD COLUMN highlevel_contact_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'highlevel_opportunity_id') THEN
        ALTER TABLE leads ADD COLUMN highlevel_opportunity_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'highlevel_synced_at') THEN
        ALTER TABLE leads ADD COLUMN highlevel_synced_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create index for GoHighLevel lookups
CREATE INDEX IF NOT EXISTS idx_leads_highlevel_contact 
    ON leads(highlevel_contact_id) WHERE highlevel_contact_id IS NOT NULL;

-- ============================================
-- AUTO-UPDATE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_highlevel_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all sync tables
DROP TRIGGER IF EXISTS trg_highlevel_contact_sync_updated ON highlevel_contact_sync;
CREATE TRIGGER trg_highlevel_contact_sync_updated
    BEFORE UPDATE ON highlevel_contact_sync
    FOR EACH ROW EXECUTE FUNCTION update_highlevel_sync_timestamp();

DROP TRIGGER IF EXISTS trg_highlevel_document_mapping_updated ON highlevel_document_mapping;
CREATE TRIGGER trg_highlevel_document_mapping_updated
    BEFORE UPDATE ON highlevel_document_mapping
    FOR EACH ROW EXECUTE FUNCTION update_highlevel_sync_timestamp();

DROP TRIGGER IF EXISTS trg_highlevel_opportunity_sync_updated ON highlevel_opportunity_sync;
CREATE TRIGGER trg_highlevel_opportunity_sync_updated
    BEFORE UPDATE ON highlevel_opportunity_sync
    FOR EACH ROW EXECUTE FUNCTION update_highlevel_sync_timestamp();

