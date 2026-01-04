-- Migration: Create inspections table
-- Purpose: Store inspection records linked to leads
-- Required by: inspection.create, inspection.lock
-- Workflow: leads → inspections → quotes → jobs

CREATE TABLE IF NOT EXISTS inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    site_address text NULL,
    notes text NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
    locked_at timestamptz NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for lead lookup
CREATE INDEX IF NOT EXISTS idx_inspections_lead_id ON inspections(lead_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);

COMMENT ON TABLE inspections IS 'CKR-CORE inspection records linked to leads';
COMMENT ON COLUMN inspections.status IS 'Inspection status: open (editable), locked (ready for quoting)';
COMMENT ON COLUMN inspections.locked_at IS 'Timestamp when inspection was locked for quoting';
