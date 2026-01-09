-- 009_create_shared_contracts_view.sql
-- Purpose: Database-side contract visibility and analytics
-- Provides runtime views of tool execution patterns

-- View: gem_tool_execution_stats
CREATE OR REPLACE VIEW public.gem_tool_execution_stats AS
SELECT
  c.tool_name,
  count(*) AS total_calls,
  count(*) FILTER (WHERE c.status = 'succeeded') AS succeeded,
  count(*) FILTER (WHERE c.status = 'failed') AS failed,
  count(*) FILTER (WHERE c.status = 'not_configured') AS not_configured,
  count(*) FILTER (WHERE c.status = 'queued') AS queued,
  count(*) FILTER (WHERE c.status = 'running') AS running,
  avg(EXTRACT(EPOCH FROM (r.created_at - c.claimed_at))) FILTER (WHERE r.status = 'succeeded') AS avg_execution_seconds,
  max(r.created_at) AS last_execution,
  min(c.created_at) AS first_call
FROM public.core_tool_calls c
LEFT JOIN public.core_tool_receipts r ON r.call_id = c.id
GROUP BY c.tool_name
ORDER BY total_calls DESC;

COMMENT ON VIEW public.gem_tool_execution_stats IS 'Execution statistics per tool for monitoring and analysis';

-- View: gem_recent_failures
CREATE OR REPLACE VIEW public.gem_recent_failures AS
SELECT
  c.id AS call_id,
  c.tool_name,
  c.status,
  c.error->>'message' AS error_message,
  c.error->>'error_code' AS error_code,
  c.input,
  c.created_at,
  c.claimed_at,
  c.worker_id
FROM public.core_tool_calls c
WHERE c.status = 'failed'
ORDER BY c.created_at DESC
LIMIT 100;

COMMENT ON VIEW public.gem_recent_failures IS 'Recent failed tool calls for debugging';

-- View: gem_idempotency_hits
CREATE OR REPLACE VIEW public.gem_idempotency_hits AS
SELECT
  r.tool_name,
  count(*) AS total_receipts,
  count(*) FILTER (WHERE (r.effects->'idempotency'->>'hit')::boolean = true) AS idempotency_hits,
  round(
    count(*) FILTER (WHERE (r.effects->'idempotency'->>'hit')::boolean = true)::numeric /
    nullif(count(*)::numeric, 0) * 100,
    2
  ) AS hit_rate_percent
FROM public.core_tool_receipts r
WHERE r.effects->'idempotency' IS NOT NULL
GROUP BY r.tool_name
ORDER BY idempotency_hits DESC;

COMMENT ON VIEW public.gem_idempotency_hits IS 'Idempotency hit rates per tool';

-- View: gem_queue_depth
CREATE OR REPLACE VIEW public.gem_queue_depth AS
SELECT
  tool_name,
  count(*) AS queued_count,
  min(created_at) AS oldest_queued,
  max(created_at) AS newest_queued,
  EXTRACT(EPOCH FROM (now() - min(created_at))) AS oldest_age_seconds
FROM public.core_tool_calls
WHERE status = 'queued'
GROUP BY tool_name
ORDER BY queued_count DESC;

COMMENT ON VIEW public.gem_queue_depth IS 'Current queue depth per tool for capacity planning';

-- View: gem_worker_activity
CREATE OR REPLACE VIEW public.gem_worker_activity AS
SELECT
  c.worker_id,
  count(*) AS total_claimed,
  count(*) FILTER (WHERE c.status = 'running') AS currently_running,
  max(c.claimed_at) AS last_claim,
  avg(EXTRACT(EPOCH FROM (
    coalesce(
      (SELECT r.created_at FROM public.core_tool_receipts r WHERE r.call_id = c.id LIMIT 1),
      now()
    ) - c.claimed_at
  ))) AS avg_processing_seconds
FROM public.core_tool_calls c
WHERE c.worker_id IS NOT NULL
  AND c.claimed_at > now() - interval '24 hours'
GROUP BY c.worker_id
ORDER BY last_claim DESC;

COMMENT ON VIEW public.gem_worker_activity IS 'Worker activity over the last 24 hours';

-- View: gem_tool_contracts_runtime
CREATE OR REPLACE VIEW public.gem_tool_contracts_runtime AS
SELECT DISTINCT ON (tool_name)
  tool_name,
  split_part(tool_name, '.', 1) AS domain,
  array_agg(DISTINCT effects->'idempotency'->>'mode') FILTER (WHERE effects->'idempotency'->>'mode' IS NOT NULL) AS observed_idempotency_modes,
  bool_or((effects->'db_writes' IS NOT NULL AND jsonb_array_length(effects->'db_writes') > 0)) AS has_db_writes,
  bool_or((effects->'external_calls' IS NOT NULL AND jsonb_array_length(effects->'external_calls') > 0)) AS has_external_calls,
  bool_or((effects->'messages_sent' IS NOT NULL AND jsonb_array_length(effects->'messages_sent') > 0)) AS has_messages,
  count(*) AS execution_count,
  max(created_at) AS last_execution
FROM public.core_tool_receipts
WHERE status = 'succeeded'
GROUP BY tool_name
ORDER BY tool_name, last_execution DESC;

COMMENT ON VIEW public.gem_tool_contracts_runtime IS 'Runtime-observed tool behavior patterns';

-- Function: gem_check_tool_health
CREATE OR REPLACE FUNCTION public.gem_check_tool_health(p_tool_name text)
RETURNS TABLE (
  tool_name text,
  is_healthy boolean,
  success_rate numeric,
  recent_failures integer,
  avg_execution_ms integer,
  last_success timestamptz,
  last_failure timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_tool_name,
    (count(*) FILTER (WHERE r.status = 'succeeded')::numeric / nullif(count(*)::numeric, 0)) > 0.9 AS is_healthy,
    round(count(*) FILTER (WHERE r.status = 'succeeded')::numeric / nullif(count(*)::numeric, 0) * 100, 2) AS success_rate,
    count(*) FILTER (WHERE r.status = 'failed' AND r.created_at > now() - interval '1 hour')::integer AS recent_failures,
    avg(EXTRACT(EPOCH FROM (r.created_at - c.claimed_at)) * 1000)::integer AS avg_execution_ms,
    max(r.created_at) FILTER (WHERE r.status = 'succeeded') AS last_success,
    max(r.created_at) FILTER (WHERE r.status = 'failed') AS last_failure
  FROM public.core_tool_calls c
  JOIN public.core_tool_receipts r ON r.call_id = c.id
  WHERE c.tool_name = p_tool_name
    AND c.created_at > now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.gem_check_tool_health IS 'Check health metrics for a specific tool';

-- Function: gem_get_pipeline_progress
CREATE OR REPLACE FUNCTION public.gem_get_pipeline_progress(p_inspection_id uuid)
RETURNS TABLE (
  step_name text,
  status text,
  call_id uuid,
  completed_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'inspection.create'::text,
    coalesce(
      (SELECT c.status FROM public.core_tool_calls c
       JOIN public.core_tool_receipts r ON r.call_id = c.id
       WHERE c.tool_name = 'inspection.create'
         AND (r.result->>'inspection_id')::uuid = p_inspection_id
       LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM public.core_tool_calls c
     JOIN public.core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.create'
       AND (r.result->>'inspection_id')::uuid = p_inspection_id
     LIMIT 1),
    (SELECT r.created_at FROM public.core_tool_calls c
     JOIN public.core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.create'
       AND (r.result->>'inspection_id')::uuid = p_inspection_id
     LIMIT 1)

  UNION ALL

  SELECT
    'inspection.submit'::text,
    coalesce(
      (SELECT c.status FROM public.core_tool_calls c
       WHERE c.tool_name = 'inspection.submit'
         AND (c.input->>'inspection_id')::uuid = p_inspection_id
       ORDER BY c.created_at DESC LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM public.core_tool_calls c
     WHERE c.tool_name = 'inspection.submit'
       AND (c.input->>'inspection_id')::uuid = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1),
    (SELECT r.created_at FROM public.core_tool_calls c
     JOIN public.core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.submit'
       AND (c.input->>'inspection_id')::uuid = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1)

  UNION ALL

  SELECT
    'quote.create_from_inspection'::text,
    coalesce(
      (SELECT c.status FROM public.core_tool_calls c
       WHERE c.tool_name = 'quote.create_from_inspection'
         AND (c.input->>'inspection_id')::uuid = p_inspection_id
       ORDER BY c.created_at DESC LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM public.core_tool_calls c
     WHERE c.tool_name = 'quote.create_from_inspection'
       AND (c.input->>'inspection_id')::uuid = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1),
    (SELECT r.created_at FROM public.core_tool_calls c
     JOIN public.core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'quote.create_from_inspection'
       AND (c.input->>'inspection_id')::uuid = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1);
END;
$$;

COMMENT ON FUNCTION public.gem_get_pipeline_progress IS 'Track inspection pipeline progress';
