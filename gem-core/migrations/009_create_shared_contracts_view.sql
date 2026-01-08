-- 009_create_shared_contracts_view.sql
-- Purpose: Database-side contract visibility and analytics
-- Provides runtime views of tool execution patterns

-- View: gem_tool_execution_stats
-- Shows execution statistics per tool
CREATE OR REPLACE VIEW gem_tool_execution_stats AS
SELECT
  c.tool_name,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE c.status = 'succeeded') AS succeeded,
  COUNT(*) FILTER (WHERE c.status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE c.status = 'not_configured') AS not_configured,
  COUNT(*) FILTER (WHERE c.status = 'queued') AS queued,
  COUNT(*) FILTER (WHERE c.status = 'running') AS running,
  AVG(EXTRACT(EPOCH FROM (r.created_at - c.claimed_at))) FILTER (WHERE r.status = 'succeeded') AS avg_execution_seconds,
  MAX(r.created_at) AS last_execution,
  MIN(c.created_at) AS first_call
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON r.call_id = c.id
GROUP BY c.tool_name
ORDER BY total_calls DESC;

COMMENT ON VIEW gem_tool_execution_stats IS 'Execution statistics per tool for monitoring and analysis';

-- View: gem_recent_failures
-- Shows recent failed tool calls with error details
CREATE OR REPLACE VIEW gem_recent_failures AS
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
FROM core_tool_calls c
WHERE c.status = 'failed'
ORDER BY c.created_at DESC
LIMIT 100;

COMMENT ON VIEW gem_recent_failures IS 'Recent failed tool calls for debugging';

-- View: gem_idempotency_hits
-- Shows idempotency hit patterns
CREATE OR REPLACE VIEW gem_idempotency_hits AS
SELECT
  r.tool_name,
  COUNT(*) AS total_receipts,
  COUNT(*) FILTER (WHERE (r.effects->'idempotency'->>'hit')::boolean = true) AS idempotency_hits,
  ROUND(
    COUNT(*) FILTER (WHERE (r.effects->'idempotency'->>'hit')::boolean = true)::numeric /
    NULLIF(COUNT(*)::numeric, 0) * 100,
    2
  ) AS hit_rate_percent
FROM core_tool_receipts r
WHERE r.effects->'idempotency' IS NOT NULL
GROUP BY r.tool_name
ORDER BY idempotency_hits DESC;

COMMENT ON VIEW gem_idempotency_hits IS 'Idempotency hit rates per tool';

-- View: gem_queue_depth
-- Shows current queue depth by tool
CREATE OR REPLACE VIEW gem_queue_depth AS
SELECT
  tool_name,
  COUNT(*) AS queued_count,
  MIN(created_at) AS oldest_queued,
  MAX(created_at) AS newest_queued,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) AS oldest_age_seconds
FROM core_tool_calls
WHERE status = 'queued'
GROUP BY tool_name
ORDER BY queued_count DESC;

COMMENT ON VIEW gem_queue_depth IS 'Current queue depth per tool for capacity planning';

-- View: gem_worker_activity
-- Shows worker activity and load
CREATE OR REPLACE VIEW gem_worker_activity AS
SELECT
  worker_id,
  COUNT(*) AS total_claimed,
  COUNT(*) FILTER (WHERE status = 'running') AS currently_running,
  MAX(claimed_at) AS last_claim,
  AVG(EXTRACT(EPOCH FROM (COALESCE(
    (SELECT r.created_at FROM core_tool_receipts r WHERE r.call_id = c.id),
    NOW()
  ) - c.claimed_at))) AS avg_processing_seconds
FROM core_tool_calls c
WHERE worker_id IS NOT NULL
  AND claimed_at > NOW() - INTERVAL '24 hours'
GROUP BY worker_id
ORDER BY last_claim DESC;

COMMENT ON VIEW gem_worker_activity IS 'Worker activity over the last 24 hours';

-- View: gem_tool_contracts_runtime
-- Runtime contract information based on execution history
CREATE OR REPLACE VIEW gem_tool_contracts_runtime AS
SELECT DISTINCT ON (tool_name)
  tool_name,
  SPLIT_PART(tool_name, '.', 1) AS domain,
  ARRAY_AGG(DISTINCT effects->'idempotency'->>'mode') FILTER (WHERE effects->'idempotency'->>'mode' IS NOT NULL) AS observed_idempotency_modes,
  BOOL_OR((effects->'db_writes' IS NOT NULL AND jsonb_array_length(effects->'db_writes') > 0)) AS has_db_writes,
  BOOL_OR((effects->'external_calls' IS NOT NULL AND jsonb_array_length(effects->'external_calls') > 0)) AS has_external_calls,
  BOOL_OR((effects->'messages_sent' IS NOT NULL AND jsonb_array_length(effects->'messages_sent') > 0)) AS has_messages,
  COUNT(*) AS execution_count,
  MAX(created_at) AS last_execution
FROM core_tool_receipts
WHERE status = 'succeeded'
GROUP BY tool_name
ORDER BY tool_name, last_execution DESC;

COMMENT ON VIEW gem_tool_contracts_runtime IS 'Runtime-observed tool behavior patterns';

-- Function: gem_check_tool_health
-- Check if a tool is healthy based on recent execution
CREATE OR REPLACE FUNCTION gem_check_tool_health(p_tool_name TEXT)
RETURNS TABLE (
  tool_name TEXT,
  is_healthy BOOLEAN,
  success_rate NUMERIC,
  recent_failures INTEGER,
  avg_execution_ms INTEGER,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_tool_name,
    (COUNT(*) FILTER (WHERE r.status = 'succeeded')::numeric / NULLIF(COUNT(*)::numeric, 0)) > 0.9 AS is_healthy,
    ROUND(COUNT(*) FILTER (WHERE r.status = 'succeeded')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS success_rate,
    COUNT(*) FILTER (WHERE r.status = 'failed' AND r.created_at > NOW() - INTERVAL '1 hour')::INTEGER AS recent_failures,
    AVG(EXTRACT(EPOCH FROM (r.created_at - c.claimed_at)) * 1000)::INTEGER AS avg_execution_ms,
    MAX(r.created_at) FILTER (WHERE r.status = 'succeeded') AS last_success,
    MAX(r.created_at) FILTER (WHERE r.status = 'failed') AS last_failure
  FROM core_tool_calls c
  JOIN core_tool_receipts r ON r.call_id = c.id
  WHERE c.tool_name = p_tool_name
    AND c.created_at > NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION gem_check_tool_health IS 'Check health metrics for a specific tool';

-- Function: gem_get_pipeline_progress
-- Get progress of an inspection through the pipeline
CREATE OR REPLACE FUNCTION gem_get_pipeline_progress(p_inspection_id UUID)
RETURNS TABLE (
  step_name TEXT,
  status TEXT,
  call_id UUID,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'inspection.create'::TEXT,
    COALESCE(
      (SELECT c.status FROM core_tool_calls c
       JOIN core_tool_receipts r ON r.call_id = c.id
       WHERE c.tool_name = 'inspection.create'
         AND (r.result->>'inspection_id')::UUID = p_inspection_id
       LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM core_tool_calls c
     JOIN core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.create'
       AND (r.result->>'inspection_id')::UUID = p_inspection_id
     LIMIT 1),
    (SELECT r.created_at FROM core_tool_calls c
     JOIN core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.create'
       AND (r.result->>'inspection_id')::UUID = p_inspection_id
     LIMIT 1)

  UNION ALL

  SELECT
    'inspection.submit'::TEXT,
    COALESCE(
      (SELECT c.status FROM core_tool_calls c
       WHERE c.tool_name = 'inspection.submit'
         AND (c.input->>'inspection_id')::UUID = p_inspection_id
       ORDER BY c.created_at DESC LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM core_tool_calls c
     WHERE c.tool_name = 'inspection.submit'
       AND (c.input->>'inspection_id')::UUID = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1),
    (SELECT r.created_at FROM core_tool_calls c
     JOIN core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'inspection.submit'
       AND (c.input->>'inspection_id')::UUID = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1)

  UNION ALL

  SELECT
    'quote.create_from_inspection'::TEXT,
    COALESCE(
      (SELECT c.status FROM core_tool_calls c
       WHERE c.tool_name = 'quote.create_from_inspection'
         AND (c.input->>'inspection_id')::UUID = p_inspection_id
       ORDER BY c.created_at DESC LIMIT 1),
      'not_started'
    ),
    (SELECT c.id FROM core_tool_calls c
     WHERE c.tool_name = 'quote.create_from_inspection'
       AND (c.input->>'inspection_id')::UUID = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1),
    (SELECT r.created_at FROM core_tool_calls c
     JOIN core_tool_receipts r ON r.call_id = c.id
     WHERE c.tool_name = 'quote.create_from_inspection'
       AND (c.input->>'inspection_id')::UUID = p_inspection_id
     ORDER BY c.created_at DESC LIMIT 1);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION gem_get_pipeline_progress IS 'Track inspection pipeline progress';
