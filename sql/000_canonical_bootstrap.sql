-- CANONICAL BOOTSTRAP FOR CKR-CORE TOOL EXECUTOR
-- This file ensures the database schema and RPC match the worker expectations.
-- Run this in the Supabase SQL Editor.

-- 1. Ensure core_tool_calls exists with correct columns
CREATE TABLE IF NOT EXISTS public.core_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name TEXT NOT NULL,
    input JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'not_configured')),
    idempotency_key TEXT,
    error JSONB,
    claimed_at TIMESTAMPTZ,
    claimed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure core_tool_receipts exists
CREATE TABLE IF NOT EXISTS public.core_tool_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.core_tool_calls(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'not_configured')),
    result JSONB NOT NULL DEFAULT '{}',
    effects JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add indexes for performance and reliability
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_status_created ON public.core_tool_calls (status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_claimed_by ON public.core_tool_calls (claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_core_tool_receipts_call_id ON public.core_tool_receipts (call_id);

-- 4. Create or Replace the Atomic Claim RPC
-- Fixes ambiguity and ensures FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_next_core_tool_call(p_worker_id TEXT)
RETURNS SETOF public.core_tool_calls
LANGUAGE plpgsql
AS $$
DECLARE
    v_claimed_id UUID;
BEGIN
    -- Select and lock the oldest queued job
    -- Use explicit table alias 'c' to avoid ambiguity
    SELECT c.id INTO v_claimed_id
    FROM public.core_tool_calls AS c
    WHERE c.status = 'queued'
    ORDER BY c.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- If no job found, return empty
    IF v_claimed_id IS NULL THEN
        RETURN;
    END IF;

    -- Update the job to running status
    -- Use explicit table alias and qualified columns
    UPDATE public.core_tool_calls AS c
    SET
        status = 'running',
        claimed_at = NOW(),
        claimed_by = p_worker_id,
        updated_at = NOW()
    WHERE c.id = v_claimed_id;

    -- Return the claimed row
    RETURN QUERY
    SELECT *
    FROM public.core_tool_calls AS c
    WHERE c.id = v_claimed_id;
END;
$$;

-- 5. Domain Tables (Minimal requirements for existing handlers)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    stage TEXT DEFAULT 'new',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
