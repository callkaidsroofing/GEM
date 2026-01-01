-- ============================================
-- PHASE 1B: Test Inserts for Registry Coverage
-- 10 examples: real implementations, not_configured, invalid input
-- ============================================

-- ============================================
-- SETUP: Create test data for job/invoice tests
-- ============================================

-- Create a test lead
INSERT INTO public.leads (id, name, phone, suburb, service, status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Client', '+61400000001', 'Marrickville', 'roof_repair', 'new')
ON CONFLICT DO NOTHING;

-- Create a test quote
INSERT INTO public.quotes (id, lead_id, status, subtotal_cents, tax_cents, total_cents)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accepted', 100000, 10000, 110000)
ON CONFLICT DO NOTHING;

-- Create quote line items for calculate_totals test
INSERT INTO public.quote_line_items (quote_id, description, quantity, unit_price_cents, line_total_cents, item_type, sort_order)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Labour - Tile Replacement', 8, 7500, 60000, 'labour', 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Materials - Tiles', 20, 2000, 40000, 'materials', 1)
ON CONFLICT DO NOTHING;

-- Create a test job for invoice tests
INSERT INTO public.jobs (id, quote_id, lead_id, status)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'completed')
ON CONFLICT DO NOTHING;

-- Create a test entity
INSERT INTO public.entities (id, entity_type, name, contact)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'client', 'John Smith', '{"phone": "+61400000002", "email": "john@example.com"}')
ON CONFLICT DO NOTHING;

-- ============================================
-- TEST 1: entity.create (Real Implementation)
-- Expected: succeeded, creates entity record
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'entity.create',
    '{"entity_type": "client", "name": "Jane Doe", "contact": {"phone": "+61400000003", "email": "jane@example.com"}, "notes": "New client from referral"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 2: job.create_from_accepted_quote (Real Implementation)
-- Expected: succeeded, creates job record
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'job.create_from_accepted_quote',
    '{"quote_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "notes": "Scheduled for next week"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 3: invoice.create_from_job (Real Implementation)
-- Expected: succeeded, creates invoice record
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'invoice.create_from_job',
    '{"job_id": "cccccccc-cccc-cccc-cccc-cccccccccccc", "due_days": 14, "notes": "Net 14 payment terms"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 4: comms.log_call_outcome (Real Implementation)
-- Expected: succeeded, creates comms_log + interaction records
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'comms.log_call_outcome',
    '{"entity_id": "dddddddd-dddd-dddd-dddd-dddddddddddd", "outcome": "answered", "notes": "Confirmed appointment for Tuesday", "context_ref": {"type": "lead", "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 5: finance.generate_cashflow_snapshot (Real Implementation)
-- Expected: succeeded, returns summary from invoices
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'finance.generate_cashflow_snapshot',
    '{"from": "2024-01-01", "to": "2024-12-31"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 6: inspection.create (Not Configured)
-- Expected: succeeded with status=not_configured
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'inspection.create',
    '{"lead_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "site_address": "123 Test St", "notes": "Initial inspection"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 7: integrations.sms_provider.health (Not Configured)
-- Expected: succeeded with status=not_configured, required_env listed
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'integrations.sms_provider.health',
    '{}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 8: calendar.create_event (Not Configured)
-- Expected: succeeded with status=not_configured
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'calendar.create_event',
    '{"title": "Site Inspection", "start_at": "2024-03-15T09:00:00Z", "end_at": "2024-03-15T10:00:00Z", "location": "123 Test St"}'::jsonb,
    'queued'
);

-- ============================================
-- TEST 9: os.create_note (Invalid Input - missing required field)
-- Expected: failed with validation error
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'os.create_note',
    '{"domain": "business", "title": "Test Note"}'::jsonb,  -- Missing required 'content' field
    'queued'
);

-- ============================================
-- TEST 10: unknown.tool_name (Unknown Tool)
-- Expected: failed with "Tool not found in registry"
-- ============================================
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'unknown.nonexistent_tool',
    '{"foo": "bar"}'::jsonb,
    'queued'
);

-- ============================================
-- VERIFICATION QUERIES
-- Run these after the executor processes jobs
-- ============================================

-- Check job statuses (should see mix of succeeded/failed):
-- SELECT id, tool_name, status, error, created_at
-- FROM core_tool_calls
-- ORDER BY created_at DESC
-- LIMIT 15;

-- Check receipts (every job should have exactly one):
-- SELECT call_id, tool_name, status, result->>'status' as result_status, created_at
-- FROM core_tool_receipts
-- ORDER BY created_at DESC
-- LIMIT 15;

-- Verify entity was created:
-- SELECT * FROM entities WHERE name = 'Jane Doe';

-- Verify job was created:
-- SELECT * FROM jobs WHERE quote_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Verify invoice was created:
-- SELECT * FROM invoices WHERE job_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Verify comms_log entry:
-- SELECT * FROM comms_log ORDER BY created_at DESC LIMIT 5;

-- Verify not_configured responses:
-- SELECT call_id, tool_name, result->>'status' as result_status, result->'reason' as reason
-- FROM core_tool_receipts
-- WHERE result->>'status' = 'not_configured';

-- Verify failed responses:
-- SELECT c.tool_name, c.error, r.result
-- FROM core_tool_calls c
-- JOIN core_tool_receipts r ON r.call_id = c.id
-- WHERE c.status = 'failed';
