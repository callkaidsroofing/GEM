-- ============================================
-- GEM CORE DATABASE DEPLOYMENT BUNDLE
-- Run this in Supabase SQL Editor to deploy all migrations
-- ============================================

-- IMPORTANT: This file consolidates all migrations.
-- Run individual migrations if you need granular control.

-- ============================================
-- 1. CORE TOOL CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.core_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name TEXT NOT NULL,
    input JSONB NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'running', 'succeeded', 'failed')),
    worker_id TEXT,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_tool_calls_status ON public.core_tool_calls (status);
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_tool_name ON public.core_tool_calls (tool_name);
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_created_at ON public.core_tool_calls (created_at);

-- ============================================
-- 2. CORE TOOL RECEIPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.core_tool_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.core_tool_calls(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'not_configured')),
    result JSONB,
    effects JSONB,
    error_message TEXT,
    error_code TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_tool_receipts_call_id ON public.core_tool_receipts (call_id);
CREATE INDEX IF NOT EXISTS idx_core_tool_receipts_tool_name ON public.core_tool_receipts (tool_name);
CREATE INDEX IF NOT EXISTS idx_core_tool_receipts_status ON public.core_tool_receipts (status);

-- ============================================
-- 3. ATOMIC CLAIM RPC FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_next_core_tool_call(p_worker_id TEXT)
RETURNS SETOF public.core_tool_calls
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_call public.core_tool_calls;
BEGIN
    -- Atomically claim the next pending call
    UPDATE public.core_tool_calls
    SET 
        status = 'claimed',
        worker_id = p_worker_id,
        claimed_at = NOW(),
        updated_at = NOW()
    WHERE id = (
        SELECT id 
        FROM public.core_tool_calls
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_call;
    
    IF v_call.id IS NOT NULL THEN
        RETURN NEXT v_call;
    END IF;
    
    RETURN;
END;
$$;

-- ============================================
-- 4. INSPECTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lead/Contact linkage
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    leadconnector_contact_id TEXT,
    
    -- Inspection status workflow
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'scheduled',
        'in_progress',
        'completed',
        'submitted',
        'cancelled'
    )),
    
    -- Full inspection form data as JSON
    payload JSONB NOT NULL DEFAULT '{}',
    
    -- Site information
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

CREATE INDEX IF NOT EXISTS idx_inspections_lead_id ON public.inspections (lead_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections (status);
CREATE INDEX IF NOT EXISTS idx_inspections_leadconnector_id ON public.inspections (leadconnector_contact_id);
CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_at ON public.inspections (scheduled_at);

-- ============================================
-- 5. ENSURE LEADS TABLE HAS REQUIRED COLUMNS
-- ============================================
DO $$
BEGIN
    -- Add leadconnector_contact_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'leadconnector_contact_id'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN leadconnector_contact_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_leads_leadconnector_id ON public.leads (leadconnector_contact_id);
    END IF;
    
    -- Add metadata if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    
    -- Add address if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'address'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN address TEXT;
    END IF;
END $$;

-- ============================================
-- 6. ENSURE QUOTES TABLE HAS REQUIRED COLUMNS
-- ============================================
DO $$
BEGIN
    -- Add metadata if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quotes' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.quotes ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    
    -- Add finalized_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quotes' AND column_name = 'finalized_at'
    ) THEN
        ALTER TABLE public.quotes ADD COLUMN finalized_at TIMESTAMPTZ;
    END IF;
    
    -- Add title if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quotes' AND column_name = 'title'
    ) THEN
        ALTER TABLE public.quotes ADD COLUMN title TEXT;
    END IF;
END $$;

-- ============================================
-- 7. ENSURE NOTES TABLE HAS REQUIRED COLUMNS
-- ============================================
DO $$
BEGIN
    -- Add note_type if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notes' AND column_name = 'note_type'
    ) THEN
        ALTER TABLE public.notes ADD COLUMN note_type TEXT DEFAULT 'general';
    END IF;
    
    -- Add metadata if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notes' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.notes ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- ============================================
-- 8. ENSURE TASKS TABLE HAS REQUIRED COLUMNS
-- ============================================
DO $$
BEGIN
    -- Add entity_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'entity_id'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN entity_id UUID;
    END IF;
    
    -- Add entity_type if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'entity_type'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN entity_type TEXT;
    END IF;
    
    -- Add metadata if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    
    -- Add assigned_to if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'assigned_to'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN assigned_to TEXT;
    END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE public.core_tool_calls IS 'Queue of tool calls pending execution by GEM workers';
COMMENT ON TABLE public.core_tool_receipts IS 'Receipts/results from executed tool calls';
COMMENT ON TABLE public.inspections IS 'Roof inspection records with full form payload';
COMMENT ON FUNCTION public.claim_next_core_tool_call IS 'Atomically claim the next pending tool call for processing';

-- ============================================
-- DONE
-- ============================================
SELECT 'GEM Core migrations applied successfully' AS status;
