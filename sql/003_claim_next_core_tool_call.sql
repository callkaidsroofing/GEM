-- Atomic claim function for tool executor
-- Claims the oldest queued job using FOR UPDATE SKIP LOCKED
-- Returns the claimed row or null if none available

CREATE OR REPLACE FUNCTION claim_next_core_tool_call(p_worker_id TEXT)
RETURNS SETOF public.core_tool_calls
LANGUAGE plpgsql
AS $$
DECLARE
    v_claimed_id UUID;
BEGIN
    -- Select and lock the oldest queued job
    SELECT id INTO v_claimed_id
    FROM public.core_tool_calls
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- If no job found, return empty
    IF v_claimed_id IS NULL THEN
        RETURN;
    END IF;

    -- Update the job to running status
    UPDATE public.core_tool_calls
    SET
        status = 'running',
        claimed_at = NOW(),
        worker_id = p_worker_id,
        updated_at = NOW()
    WHERE id = v_claimed_id;

    -- Return the claimed row
    RETURN QUERY
    SELECT *
    FROM public.core_tool_calls
    WHERE id = v_claimed_id;
END;
$$;

-- Add columns to core_tool_calls if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'core_tool_calls'
        AND column_name = 'claimed_at'
    ) THEN
        ALTER TABLE public.core_tool_calls ADD COLUMN claimed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'core_tool_calls'
        AND column_name = 'worker_id'
    ) THEN
        ALTER TABLE public.core_tool_calls ADD COLUMN worker_id TEXT;
    END IF;
END;
$$;

-- Add index for worker_id lookups
CREATE INDEX IF NOT EXISTS idx_core_tool_calls_worker_id
ON public.core_tool_calls (worker_id)
WHERE worker_id IS NOT NULL;
