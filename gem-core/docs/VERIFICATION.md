# Verification Guide

> For system overview, see `/docs/SYSTEM.md`. For project state, see `/docs/STATE.md`.

Verify that the executor is working correctly:

## 1. Database Verification

Run the following queries in the Supabase SQL Editor:

### Check Table Schema
```sql
-- Verify core_tool_calls has the correct columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'core_tool_calls' 
AND column_name IN ('claimed_by', 'claimed_at', 'status');
```
**Expected Result**: `claimed_by` (text), `claimed_at` (timestamp), `status` (text).

### Test the RPC
```sql
-- 1. Insert a test job
INSERT INTO public.core_tool_calls (tool_name, input)
VALUES ('os.health_check', '{}');

-- 2. Call the claim RPC
SELECT * FROM public.claim_next_core_tool_call('test-worker');
```
**Expected Result**: The RPC should return the row you just inserted, with `status` as `running` and `claimed_by` as `test-worker`.

## 2. Render Logs Verification

Check the Render dashboard logs for the background worker. You should see:

1.  **Startup**: `CKR Tool Executor started. Worker ID: worker-xxxx. Polling every 5000ms...`
2.  **Processing**: `[worker-xxxx] Processing job <uuid>: os.health_check`
3.  **Success**: No more `relation "public.core_tool_calls" does not exist` or `column reference "id" is ambiguous` errors.

## 3. Receipt Verification

```sql
-- Check if a receipt was written for the test job
SELECT * FROM public.core_tool_receipts 
WHERE tool_name = 'os.health_check' 
ORDER BY created_at DESC LIMIT 1;
```
**Expected Result**: A receipt with `status = 'succeeded'` and the health check result.
