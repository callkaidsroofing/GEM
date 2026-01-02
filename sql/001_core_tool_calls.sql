-- Create core_tool_calls table
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

-- Add index for polling
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_status_created ON public.core_tool_calls (status, created_at) WHERE status = 'queued';
