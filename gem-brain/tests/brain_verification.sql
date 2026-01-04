-- Brain Verification SQL
-- Run these after deploying Brain and Executor to verify correct behavior

-- ============================================================================
-- PREREQUISITE: Run migrations first
-- ============================================================================
-- 1. gem-core/sql/001_core_tool_calls.sql
-- 2. gem-core/sql/002_core_tool_receipts.sql
-- 3. gem-core/sql/003_claim_next_core_tool_call.sql
-- 4. gem-brain/sql/001_brain_runs.sql

-- ============================================================================
-- BRAIN RUN TESTS
-- ============================================================================

-- TEST BR-1: Brain run with answer mode (sanity check)
INSERT INTO brain_runs (id, message, mode, status, decision, assistant_message) VALUES (
  'test-br-001',
  'system status',
  'answer',
  'completed',
  '{"mode_used": "answer", "reason": "Test insert"}',
  'System status check would be performed.'
);

-- TEST BR-2: Brain run with enqueue_and_wait mode
INSERT INTO brain_runs (id, message, mode, status, decision, planned_tool_calls, enqueued_call_ids, assistant_message) VALUES (
  'test-br-002',
  'create task: test the brain system',
  'enqueue_and_wait',
  'completed',
  '{"mode_used": "enqueue_and_wait", "reason": "Matched rule pattern for os.create_task"}',
  '[{"tool_name": "os.create_task", "input": {"title": "test the brain system", "domain": "business", "priority": "normal"}}]',
  ARRAY['test-call-001']::uuid[],
  'Executed 1/1 tool calls. 1 succeeded.'
);

-- ============================================================================
-- TOOL CALL TESTS (Via Queue)
-- ============================================================================

-- TEST TC-1: Real tool - os.health_check (should succeed)
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-001',
  'os.health_check',
  '{}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-001';
-- Expected: status = 'succeeded', result contains checks object

-- TEST TC-2: Real tool - os.create_task (should succeed)
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-002',
  'os.create_task',
  '{"title": "Brain verification task", "domain": "business", "priority": "normal"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-002';
-- Expected: status = 'succeeded', result contains task_id

-- TEST TC-3: Real tool - leads.create (keyed idempotency, should succeed)
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-003',
  'leads.create',
  '{"name": "Brain Test Lead", "phone": "0400999888", "suburb": "TestSuburb", "source": "brain"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-003';
-- Expected: status = 'succeeded', result contains lead_id

-- TEST TC-4: Not configured tool - calendar.create_event
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-004',
  'calendar.create_event',
  '{"title": "Test Event", "start_at": "2026-01-15T09:00:00Z", "end_at": "2026-01-15T10:00:00Z"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-004';
-- Expected: status = 'not_configured', result contains reason and required_env

-- TEST TC-5: Validation failure - missing required field
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-005',
  'os.create_task',
  '{"domain": "business"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-005';
-- Expected: status = 'failed', error mentions 'Missing required field: title'

-- TEST TC-6: Unknown tool
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-tc-006',
  'nonexistent.fake_tool',
  '{}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-tc-006';
-- Expected: status = 'failed', error_code = 'unknown_tool'

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check brain_runs
SELECT id, message, mode, status, assistant_message
FROM brain_runs
WHERE id LIKE 'test-br-%'
ORDER BY created_at;

-- Expected:
-- test-br-001 | system status | answer | completed | System status check would be performed.
-- test-br-002 | create task: test the brain system | enqueue_and_wait | completed | Executed 1/1 tool calls...

-- Check tool call status
SELECT c.id, c.tool_name, c.status as call_status, r.status as receipt_status
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON c.id = r.call_id
WHERE c.id LIKE 'test-tc-%'
ORDER BY c.created_at;

-- Expected (after executor processes):
-- test-tc-001 | os.health_check | succeeded | succeeded
-- test-tc-002 | os.create_task | succeeded | succeeded
-- test-tc-003 | leads.create | succeeded | succeeded
-- test-tc-004 | calendar.create_event | not_configured | not_configured
-- test-tc-005 | os.create_task | failed | failed
-- test-tc-006 | nonexistent.fake_tool | failed | failed

-- Check for missing receipts (calls without receipts that aren't queued)
SELECT c.id, c.tool_name, c.status
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON c.id = r.call_id
WHERE r.id IS NULL AND c.status != 'queued' AND c.id LIKE 'test-tc-%';

-- Expected: Empty result (all non-queued calls should have receipts)

-- End-to-end: brain_run -> tool_call -> receipt
SELECT
  b.id as brain_run_id,
  b.message,
  b.status as brain_status,
  c.id as call_id,
  c.tool_name,
  r.status as receipt_status
FROM brain_runs b
CROSS JOIN LATERAL unnest(b.enqueued_call_ids) as call_id
LEFT JOIN core_tool_calls c ON c.id = call_id
LEFT JOIN core_tool_receipts r ON r.call_id = c.id
WHERE b.id LIKE 'test-br-%'
ORDER BY b.created_at;

-- ============================================================================
-- CLEANUP (optional - run after verification)
-- ============================================================================
-- DELETE FROM brain_runs WHERE id LIKE 'test-br-%';
-- DELETE FROM core_tool_receipts WHERE call_id LIKE 'test-tc-%';
-- DELETE FROM core_tool_calls WHERE id LIKE 'test-tc-%';
-- DELETE FROM leads WHERE phone = '0400999888';
-- DELETE FROM tasks WHERE title = 'Brain verification task';
