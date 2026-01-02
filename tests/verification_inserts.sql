-- Verification INSERTs for CKR-CORE Tool Executor
-- Run these after deploying the worker to verify correct behavior

-- ============================================================================
-- PREREQUISITE: Run migrations first
-- ============================================================================
-- Execute the following migrations in order:
-- 1. migrations/001_create_entities_table.sql
-- 2. migrations/002_create_jobs_table.sql
-- 3. migrations/003_create_invoices_table.sql
-- 4. migrations/004_create_comms_log_table.sql

-- ============================================================================
-- TEST 1: Real tool - os.create_task
-- Expected: status=succeeded, receipt with task_id
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-001-create-task',
  'os.create_task',
  '{"title": "Test task for verification", "domain": "business", "priority": "normal"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-001-create-task';
-- Expected: status = 'succeeded', result contains task_id

-- ============================================================================
-- TEST 2: Real tool - entity.create
-- Expected: status=succeeded, receipt with entity_id
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-002-entity-create',
  'entity.create',
  '{"entity_type": "client", "name": "Test Client Co", "contact": {"phone": "0400000001"}}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-002-entity-create';
-- SELECT * FROM entities ORDER BY created_at DESC LIMIT 1;
-- Expected: New entity created, receipt with entity_id

-- ============================================================================
-- TEST 3: Real tool - leads.create (keyed idempotency)
-- Expected: status=succeeded, receipt with lead_id
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-003-leads-create',
  'leads.create',
  '{"name": "John Test", "phone": "0400000002", "suburb": "TestSuburb", "source": "referral"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-003-leads-create';
-- SELECT * FROM leads WHERE phone = '0400000002';
-- Expected: New lead created, receipt with lead_id

-- ============================================================================
-- TEST 4: Not configured tool - calendar.create_event
-- Expected: status=not_configured, receipt with reason and next_steps
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-004-calendar-event',
  'calendar.create_event',
  '{"title": "Test Event", "start_at": "2025-01-15T09:00:00Z", "end_at": "2025-01-15T10:00:00Z"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-004-calendar-event';
-- Expected: status = 'not_configured', result contains reason and required_env

-- ============================================================================
-- TEST 5: Not configured tool - comms.send_sms
-- Expected: status=not_configured, receipt with reason and required_env
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-005-send-sms',
  'comms.send_sms',
  '{"to": "0400000003", "message": "Test message", "context_ref": {"type": "lead", "id": "test-lead"}}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-005-send-sms';
-- Expected: status = 'not_configured', required_env contains TWILIO credentials

-- ============================================================================
-- TEST 6: Validation failure - missing required field
-- Expected: status=failed, error_code=validation_error
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-006-validation-fail',
  'os.create_task',
  '{"domain": "business"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-006-validation-fail';
-- SELECT * FROM core_tool_calls WHERE id = 'test-006-validation-fail';
-- Expected: status = 'failed', error mentions 'Missing required field: title'

-- ============================================================================
-- TEST 7: Unknown tool - not in registry
-- Expected: status=failed, error_code=unknown_tool
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-007-unknown-tool',
  'nonexistent.fake_tool',
  '{}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-007-unknown-tool';
-- Expected: status = 'failed', error_code = 'unknown_tool'

-- ============================================================================
-- TEST 8: Keyed idempotency - duplicate leads.create (same phone)
-- Expected: First call creates, second returns existing lead_id
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-008-leads-dup-1',
  'leads.create',
  '{"name": "Duplicate Test", "phone": "0400000008", "suburb": "DupSuburb"}',
  'queued'
);

-- Wait for processing, then insert duplicate
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-008-leads-dup-2',
  'leads.create',
  '{"name": "Duplicate Test Again", "phone": "0400000008", "suburb": "DupSuburb2"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id LIKE 'test-008-leads-dup%';
-- SELECT * FROM leads WHERE phone = '0400000008';
-- Expected: Only ONE lead with phone 0400000008, both receipts have same lead_id

-- ============================================================================
-- TEST 9: Real tool - comms.log_call_outcome
-- Expected: status=succeeded, logs to comms_log table
-- ============================================================================
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-009-log-call',
  'comms.log_call_outcome',
  '{"entity_id": "test-entity-123", "outcome": "answered", "notes": "Discussed project timeline"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-009-log-call';
-- SELECT * FROM comms_log ORDER BY created_at DESC LIMIT 1;
-- Expected: New entry in comms_log, receipt with interaction_id

-- ============================================================================
-- TEST 10: Real tool - invoice.create_from_job (with job dependency)
-- Expected: status=succeeded or failed depending on job existence
-- ============================================================================
-- First create a job to reference
INSERT INTO core_tool_calls (id, tool_name, input, status) VALUES (
  'test-010-job-first',
  'job.create_from_accepted_quote',
  '{"quote_id": "test-quote-for-invoice", "notes": "Test job for invoice"}',
  'queued'
);

-- Verification:
-- SELECT * FROM core_tool_receipts WHERE call_id = 'test-010-job-first';
-- Note: This may fail if quotes table doesn't have the test quote
-- That's expected behavior - demonstrates referential integrity

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count all receipts
-- SELECT status, COUNT(*) FROM core_tool_receipts GROUP BY status;

-- Check for any missing receipts (calls without receipts)
-- SELECT c.id, c.tool_name, c.status
-- FROM core_tool_calls c
-- LEFT JOIN core_tool_receipts r ON c.id = r.call_id
-- WHERE r.id IS NULL AND c.status != 'queued';

-- View recent execution results
-- SELECT
--   c.id,
--   c.tool_name,
--   c.status as call_status,
--   r.status as receipt_status,
--   r.result
-- FROM core_tool_calls c
-- LEFT JOIN core_tool_receipts r ON c.id = r.call_id
-- ORDER BY c.created_at DESC
-- LIMIT 20;

-- ============================================================================
-- CLEANUP (optional - run after verification)
-- ============================================================================
-- DELETE FROM core_tool_receipts WHERE call_id LIKE 'test-%';
-- DELETE FROM core_tool_calls WHERE id LIKE 'test-%';
-- DELETE FROM leads WHERE phone IN ('0400000002', '0400000008');
-- DELETE FROM entities WHERE name = 'Test Client Co';
-- DELETE FROM tasks WHERE title = 'Test task for verification';
-- DELETE FROM comms_log WHERE recipient = 'test-entity-123';
