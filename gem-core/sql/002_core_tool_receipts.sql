-- Create core_tool_receipts table
CREATE TABLE IF NOT EXISTS public.core_tool_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.core_tool_calls(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL,
    result JSONB NOT NULL DEFAULT '{}',
    effects JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for idempotency checks
CREATE INDEX IF NOT EXISTS idx_core_tool_receipts_call_id ON public.core_tool_receipts (call_id);
