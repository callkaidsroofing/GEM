-- ============================================
-- INSPECTIONS TABLE
-- Core table for storing roof inspection data
-- ============================================

CREATE TABLE IF NOT EXISTS public.inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lead/Contact linkage
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    leadconnector_contact_id TEXT,
    
    -- Inspection status workflow
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',           -- Initial creation, not yet started
        'scheduled',       -- Inspection date set
        'in_progress',     -- Inspector on site
        'completed',       -- Inspection finished, data collected
        'submitted',       -- Formally submitted/locked
        'cancelled'        -- Cancelled
    )),
    
    -- Full inspection form data as JSON
    payload JSONB NOT NULL DEFAULT '{}',
    
    -- Site information (indexed for search)
    site_address TEXT,
    site_suburb TEXT,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Assignment
    assigned_to TEXT,
    created_by TEXT NOT NULL DEFAULT 'system',
    
    -- Metadata
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inspections_lead_id ON public.inspections (lead_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections (status);
CREATE INDEX IF NOT EXISTS idx_inspections_leadconnector_id ON public.inspections (leadconnector_contact_id);
CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_at ON public.inspections (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_site_suburb ON public.inspections (site_suburb);

-- Comments
COMMENT ON TABLE public.inspections IS 'Roof inspection records with full form payload';
COMMENT ON COLUMN public.inspections.payload IS 'Full inspection form data as JSONB - includes all measurements, findings, photos, etc.';
COMMENT ON COLUMN public.inspections.leadconnector_contact_id IS 'GoHighLevel/LeadConnector contact ID for CRM sync';
