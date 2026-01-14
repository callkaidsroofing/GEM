-- Migration: Create bidirectional sync tables for GoHighLevel integration
-- Purpose: Track sync status, document mappings, and conflict resolution
-- Required by: integrations.highlevel.* sync handlers
-- Safe to run multiple times (IF NOT EXISTS)

-- ============================================
-- HIGHLEVEL CONTACT SYNC STATUS TABLE
-- ============================================
-- Tracks sync status for each contact between CKR and GoHighLevel
CREATE TABLE IF NOT EXISTS highlevel_contact_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- CKR side
    ckr_lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    
    -- GoHighLevel side  
    highlevel_contact_id TEXT NOT NULL,
    highlevel_location_id TEXT NOT NULL DEFAULT 'g9ue9OBQ12B8KgPIszOo',
    
    -- Sync metadata
    sync_direction TEXT NOT NULL CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional')),
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error', 'conflict')),
    last_sync_at TIMESTAMPTZ,
    last_sync_direction TEXT CHECK (last_sync_direction IN ('inbound', 'outbound')),
    
    -- Conflict resolution
    ckr_updated_at TIMESTAMPTZ,
    highlevel_updated_at TIMESTAMPTZ,
    conflict_resolved_by TEXT CHECK (conflict_resolved_by IN ('ghl_wins', 'ckr_wins', 'manual', NULL)),
    conflict_resolved_at TIMESTAMPTZ,
    
    -- Data snapshots for change detection
    ckr_payload_hash TEXT,
    highlevel_payload_hash TEXT,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT uq_highlevel_contact_sync UNIQUE (highlevel_contact_id, highlevel_location_id)
);

-- Index for fast lookup by CKR lead
CREATE INDEX IF NOT EXISTS idx_highlevel_contact_sync_ckr_lead 
    ON highlevel_contact_sync(ckr_lead_id) WHERE ckr_lead_id IS NOT NULL;

-- Index for pending syncs
CREATE INDEX IF NOT EXISTS idx_highlevel_contact_sync_pending 
    ON highlevel_contact_sync(sync_status, next_retry_at) 
    WHERE sync_status IN ('pending', 'error');

-- ============================================
-- HIGHLEVEL DOCUMENT MAPPING TABLE
-- ============================================
-- Links CKR documents (inspections, quotes, photos) to GoHighLevel documents
CREATE TABLE IF NOT EXISTS highlevel_document_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- CKR side
    ckr_entity_type TEXT NOT NULL CHECK (ckr_entity_type IN ('inspection', 'quote', 'photo', 'report')),
    ckr_entity_id UUID NOT NULL,
    ckr_document_url TEXT,
    
    -- GoHighLevel side
    highlevel_contact_id TEXT NOT NULL,
    highlevel_location_id TEXT NOT NULL DEFAULT 'g9ue9OBQ12B8KgPIszOo',
    highlevel_document_id TEXT,
    highlevel_note_id TEXT,
    
    -- Sync metadata
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'uploaded', 'error')),
    uploaded_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT uq_highlevel_document UNIQUE (ckr_entity_type, ckr_entity_id)
);

-- Index for pending uploads
CREATE INDEX IF NOT EXISTS idx_highlevel_document_pending 
    ON highlevel_document_mapping(sync_status) WHERE sync_status = 'pending';

-- ============================================
-- HIGHLEVEL OPPORTUNITY SYNC TABLE
-- ============================================
-- Tracks opportunity/pipeline stage sync between CKR and GoHighLevel
CREATE TABLE IF NOT EXISTS highlevel_opportunity_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- CKR side
    ckr_lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    ckr_lead_status TEXT,
    
    -- GoHighLevel side
    highlevel_opportunity_id TEXT NOT NULL,
    highlevel_contact_id TEXT NOT NULL,
    highlevel_pipeline_id TEXT NOT NULL DEFAULT '7zMxpJIUy0vtIWzdjnuK',
    highlevel_stage_id TEXT,
    highlevel_stage_name TEXT,
    highlevel_monetary_value NUMERIC(12,2) DEFAULT 0,
    
    -- Sync metadata
    sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending_update', 'error')),
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT uq_highlevel_opportunity UNIQUE (highlevel_opportunity_id)
);

-- Index for CKR lead lookup
CREATE INDEX IF NOT EXISTS idx_highlevel_opportunity_ckr_lead 
    ON highlevel_opportunity_sync(ckr_lead_id) WHERE ckr_lead_id IS NOT NULL;

-- ============================================
-- HIGHLEVEL SYNC QUEUE TABLE
-- ============================================
-- Outbound sync queue for offline support
CREATE TABLE IF NOT EXISTS highlevel_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What to sync
    operation TEXT NOT NULL CHECK (operation IN (
        'create_note', 'upload_document', 'update_opportunity', 
        'create_task', 'update_contact', 'move_stage'
    )),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    highlevel_contact_id TEXT NOT NULL,
    
    -- Payload to send
    payload JSONB NOT NULL,
    
    -- Queue metadata
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    
    -- Retry logic
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for queue processing
CREATE INDEX IF NOT EXISTS idx_highlevel_sync_queue_pending 
    ON highlevel_sync_queue(status, priority DESC, next_attempt_at) 
    WHERE status IN ('queued', 'failed');

