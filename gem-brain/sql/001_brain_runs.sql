-- Brain Runs Table
-- Tracks every Brain request for audit and debugging

CREATE TABLE IF NOT EXISTS public.brain_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Request
    message TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('answer', 'plan', 'enqueue', 'enqueue_and_wait')),
    conversation_id UUID,
    context JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',

    -- Decision
    decision JSONB NOT NULL DEFAULT '{}',
    planned_tool_calls JSONB NOT NULL DEFAULT '[]',
    enqueued_call_ids UUID[] NOT NULL DEFAULT '{}',

    -- Outcome
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'planning', 'enqueued', 'waiting', 'completed', 'failed')),
    assistant_message TEXT,
    next_actions JSONB NOT NULL DEFAULT '[]',
    receipts JSONB NOT NULL DEFAULT '[]',

    -- Error handling
    error JSONB
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_brain_runs_status ON public.brain_runs (status);
CREATE INDEX IF NOT EXISTS idx_brain_runs_created_at ON public.brain_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_runs_conversation_id ON public.brain_runs (conversation_id) WHERE conversation_id IS NOT NULL;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_brain_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brain_runs_updated_at ON public.brain_runs;
CREATE TRIGGER brain_runs_updated_at
    BEFORE UPDATE ON public.brain_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_brain_runs_updated_at();
