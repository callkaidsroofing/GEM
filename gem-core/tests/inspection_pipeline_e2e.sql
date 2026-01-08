-- ============================================
-- GEM Inspection Pipeline E2E Test
-- ============================================
-- Purpose: Verify the full inspection pipeline from lead to quote
-- Prerequisites: Run migrations 007-009 first
--
-- Usage:
--   psql $SUPABASE_URL -f gem-core/tests/inspection_pipeline_e2e.sql
--
-- Note: This test uses fixed UUIDs for reproducibility.
--       Run cleanup section at end if re-running.
-- ============================================

\echo '============================================'
\echo 'GEM Inspection Pipeline E2E Test'
\echo '============================================'

-- ============================================
-- SETUP: Create Test Data
-- ============================================

\echo ''
\echo '>> Step 1: Create test lead'

-- Create test lead (idempotent)
INSERT INTO leads (id, name, phone, suburb, source, status)
VALUES (
  'e2e-test-lead-001',
  'E2E Test Customer',
  '0400999001',
  'Brisbane',
  'e2e_test',
  'new'
)
ON CONFLICT (phone) DO UPDATE SET
  name = EXCLUDED.name,
  suburb = EXCLUDED.suburb
RETURNING id, name, phone, status;

-- ============================================
-- TEST 1: inspection.create
-- ============================================

\echo ''
\echo '>> Step 2: Queue inspection.create tool call'

-- Queue the tool call
INSERT INTO core_tool_calls (id, tool_name, input, status, idempotency_key)
VALUES (
  'e2e-call-insp-create-001',
  'inspection.create',
  '{
    "lead_id": "e2e-test-lead-001",
    "site_address": "123 E2E Test Street",
    "site_suburb": "Brisbane"
  }'::jsonb,
  'queued',
  'e2e-inspection-create-001'
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id, tool_name, status;

\echo 'Tool call queued. Run executor to process, then continue...'
\echo 'Or manually execute by running: cd gem-core && npm start'
\echo ''

-- Check if receipt exists (after executor runs)
\echo '>> Checking for inspection.create receipt...'

SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'PASS: Receipt exists'
    ELSE 'PENDING: Run executor first'
  END AS receipt_check
FROM core_tool_receipts
WHERE call_id = 'e2e-call-insp-create-001';

-- Show receipt details if exists
SELECT
  call_id,
  tool_name,
  status,
  result->>'inspection_id' AS inspection_id,
  effects->'db_writes'->0->>'table' AS written_table,
  created_at
FROM core_tool_receipts
WHERE call_id = 'e2e-call-insp-create-001';

-- ============================================
-- TEST 2: media.register_asset
-- ============================================

\echo ''
\echo '>> Step 3: Queue media.register_asset tool call'

-- Queue media registration
INSERT INTO core_tool_calls (id, tool_name, input, status, idempotency_key)
VALUES (
  'e2e-call-media-001',
  'media.register_asset',
  '{
    "file_ref": "e2e-test/photo-001.jpg",
    "asset_type": "photo",
    "suburb": "Brisbane",
    "tags": ["before", "exterior", "e2e_test"]
  }'::jsonb,
  'queued',
  'e2e-media-register-001'
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id, tool_name, status;

-- Check if receipt exists
\echo '>> Checking for media.register_asset receipt...'

SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'PASS: Receipt exists'
    ELSE 'PENDING: Run executor first'
  END AS receipt_check
FROM core_tool_receipts
WHERE call_id = 'e2e-call-media-001';

SELECT
  status,
  result->>'asset_id' AS asset_id,
  created_at
FROM core_tool_receipts
WHERE call_id = 'e2e-call-media-001';

-- ============================================
-- TEST 3: inspection.add_measurement
-- ============================================

\echo ''
\echo '>> Step 4: Queue inspection.add_measurement (requires inspection_id)'

-- Get the inspection_id from the receipt (if exists)
DO $$
DECLARE
  v_inspection_id TEXT;
BEGIN
  SELECT result->>'inspection_id' INTO v_inspection_id
  FROM core_tool_receipts
  WHERE call_id = 'e2e-call-insp-create-001';

  IF v_inspection_id IS NOT NULL THEN
    INSERT INTO core_tool_calls (id, tool_name, input, status, idempotency_key)
    VALUES (
      'e2e-call-measurement-001',
      'inspection.add_measurement',
      jsonb_build_object(
        'inspection_id', v_inspection_id,
        'measurement_type', 'roof_area',
        'value', 150,
        'unit', 'm2',
        'location', 'Main roof section'
      ),
      'queued',
      'e2e-measurement-001'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RAISE NOTICE 'Queued measurement for inspection: %', v_inspection_id;
  ELSE
    RAISE NOTICE 'Skipping measurement - inspection not created yet';
  END IF;
END $$;

-- ============================================
-- TEST 4: inspection.add_defect
-- ============================================

\echo ''
\echo '>> Step 5: Queue inspection.add_defect'

DO $$
DECLARE
  v_inspection_id TEXT;
BEGIN
  SELECT result->>'inspection_id' INTO v_inspection_id
  FROM core_tool_receipts
  WHERE call_id = 'e2e-call-insp-create-001';

  IF v_inspection_id IS NOT NULL THEN
    INSERT INTO core_tool_calls (id, tool_name, input, status, idempotency_key)
    VALUES (
      'e2e-call-defect-001',
      'inspection.add_defect',
      jsonb_build_object(
        'inspection_id', v_inspection_id,
        'defect_type', 'tile',
        'severity', 'high',
        'description', 'E2E Test - cracked tiles near ridge',
        'location', 'North side ridge'
      ),
      'queued',
      'e2e-defect-001'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RAISE NOTICE 'Queued defect for inspection: %', v_inspection_id;
  ELSE
    RAISE NOTICE 'Skipping defect - inspection not created yet';
  END IF;
END $$;

-- ============================================
-- VERIFICATION: Check Pipeline Status
-- ============================================

\echo ''
\echo '>> Pipeline Status Summary'
\echo '============================================'

SELECT
  c.id AS call_id,
  c.tool_name,
  c.status AS call_status,
  COALESCE(r.status, 'no_receipt') AS receipt_status,
  CASE
    WHEN r.status = 'succeeded' THEN 'PASS'
    WHEN r.status = 'failed' THEN 'FAIL'
    WHEN r.status = 'not_configured' THEN 'NOT_CONFIGURED'
    WHEN c.status = 'queued' THEN 'QUEUED'
    WHEN c.status = 'running' THEN 'RUNNING'
    ELSE 'UNKNOWN'
  END AS test_status,
  c.created_at
FROM core_tool_calls c
LEFT JOIN core_tool_receipts r ON r.call_id = c.id
WHERE c.id LIKE 'e2e-call-%'
ORDER BY c.created_at;

-- ============================================
-- VERIFICATION: Check Domain Tables
-- ============================================

\echo ''
\echo '>> Domain Table Verification'

-- Check lead
\echo '>> Lead:'
SELECT id, name, phone, status, created_at
FROM leads
WHERE id = 'e2e-test-lead-001';

-- Check inspection (if created)
\echo ''
\echo '>> Inspection:'
SELECT
  i.id,
  i.lead_id,
  i.status,
  i.site_address,
  jsonb_array_length(i.payload->'measurements') AS measurement_count,
  jsonb_array_length(i.payload->'defects') AS defect_count,
  i.created_at
FROM inspections i
WHERE i.lead_id = 'e2e-test-lead-001';

-- Check media assets (if created)
\echo ''
\echo '>> Media Assets:'
SELECT
  id,
  file_ref,
  asset_type,
  tags,
  processing_status,
  created_at
FROM media_assets
WHERE file_ref LIKE 'e2e-test/%';

-- ============================================
-- CLEANUP (Uncomment to run)
-- ============================================

-- To clean up test data, uncomment and run:

-- \echo ''
-- \echo '>> Cleaning up E2E test data...'

-- DELETE FROM core_tool_receipts WHERE call_id LIKE 'e2e-call-%';
-- DELETE FROM core_tool_calls WHERE id LIKE 'e2e-call-%';
-- DELETE FROM media_assets WHERE file_ref LIKE 'e2e-test/%';
-- DELETE FROM inspections WHERE lead_id = 'e2e-test-lead-001';
-- DELETE FROM leads WHERE id = 'e2e-test-lead-001';

-- \echo 'Cleanup complete.'

-- ============================================
-- END OF E2E TEST
-- ============================================

\echo ''
\echo '============================================'
\echo 'E2E Test Complete'
\echo '============================================'
\echo ''
\echo 'Next steps:'
\echo '1. If tests show QUEUED, run the executor: cd gem-core && npm start'
\echo '2. Re-run this script to verify receipts'
\echo '3. Uncomment cleanup section to remove test data'
\echo ''
