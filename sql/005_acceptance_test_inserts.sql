-- ============================================
-- ACCEPTANCE TEST INSERTS
-- 5 example SQL inserts to enqueue tool calls
-- Run these after applying migrations 001-004
-- ============================================

-- Test 1: os.create_note
-- Creates a business note with title and content
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'os.create_note',
    '{"domain": "business", "title": "Test Note", "content": "This is a test note for acceptance testing.", "entity_refs": []}'::jsonb,
    'queued'
);

-- Test 2: os.list_tasks
-- Lists all open tasks in the business domain
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'os.list_tasks',
    '{"status": "open", "domain": "business", "limit": 10}'::jsonb,
    'queued'
);

-- Test 3: leads.create with keyed idempotency by phone
-- Creates a new lead; duplicate phone will return existing lead_id
INSERT INTO public.core_tool_calls (tool_name, input, status, idempotency_key)
VALUES (
    'leads.create',
    '{"name": "John Smith", "phone": "+61412345678", "email": "john@example.com", "suburb": "Marrickville", "source": "google_ads", "notes": "Interested in roof repair"}'::jsonb,
    'queued',
    '+61412345678'
);

-- Test 4: quote.calculate_totals
-- To test this properly, first create test data:
-- INSERT INTO quotes (id, status) VALUES ('11111111-1111-1111-1111-111111111111', 'draft');
-- INSERT INTO quote_line_items (quote_id, description, quantity, unit_price_cents, line_total_cents, item_type)
-- VALUES
--   ('11111111-1111-1111-1111-111111111111', 'Labour - Roof Repair', 8, 7500, 60000, 'labour'),
--   ('11111111-1111-1111-1111-111111111111', 'Materials - Tiles', 20, 2500, 50000, 'materials');
-- Then run:
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'quote.calculate_totals',
    '{"quote_id": "11111111-1111-1111-1111-111111111111"}'::jsonb,
    'queued'
);

-- Test 5: inspection.create (will return not_configured)
-- Demonstrates safe handling of not-yet-implemented handlers
INSERT INTO public.core_tool_calls (tool_name, input, status)
VALUES (
    'inspection.create',
    '{"lead_id": "22222222-2222-2222-2222-222222222222", "site_address": "123 Test St, Sydney", "notes": "Initial inspection request"}'::jsonb,
    'queued'
);

-- ============================================
-- HELPER: Setup test data for quote.calculate_totals
-- ============================================
-- Uncomment and run this section to set up test quote data:

-- INSERT INTO quotes (id, status)
-- VALUES ('11111111-1111-1111-1111-111111111111', 'draft')
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO quote_line_items (quote_id, description, quantity, unit_price_cents, line_total_cents, item_type, sort_order)
-- VALUES
--   ('11111111-1111-1111-1111-111111111111', 'Labour - Roof Tile Replacement', 8, 7500, 60000, 'labour', 0),
--   ('11111111-1111-1111-1111-111111111111', 'Materials - Concrete Tiles', 20, 2500, 50000, 'materials', 1),
--   ('11111111-1111-1111-1111-111111111111', 'Materials - Ridge Capping', 5, 4500, 22500, 'materials', 2)
-- ON CONFLICT DO NOTHING;

-- ============================================
-- VERIFICATION QUERIES
-- Run these after the executor processes jobs
-- ============================================

-- Check job statuses:
-- SELECT id, tool_name, status, error, created_at, updated_at
-- FROM core_tool_calls
-- ORDER BY created_at DESC
-- LIMIT 10;

-- Check receipts:
-- SELECT id, call_id, tool_name, status, result, effects, created_at
-- FROM core_tool_receipts
-- ORDER BY created_at DESC
-- LIMIT 10;

-- Check notes created:
-- SELECT * FROM notes ORDER BY created_at DESC LIMIT 5;

-- Check leads created:
-- SELECT * FROM leads ORDER BY created_at DESC LIMIT 5;

-- Check quote totals:
-- SELECT id, subtotal_cents, tax_cents, total_cents, labour_cents, materials_cents
-- FROM quotes
-- WHERE id = '11111111-1111-1111-1111-111111111111';
