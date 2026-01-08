# GEM Core Changelog

## [0.3.0] - 2026-01-08

### Major Changes

This release implements the 11-step GEM execution plan for production stability.

### Step 1: Executor Stabilization
- **Pinned Node.js to 20.x** in package.json engines
- **Hardened polling loop** with exponential backoff (1s → 5s → 15s → 30s)
- **Added structured logging** with JSON output for production monitoring
- **Improved error handling** with graceful shutdown on SIGTERM/SIGINT

### Step 2: Queue Fix (SQL Migrations)
- **Created `DEPLOY_ALL.sql`** - consolidated migration bundle
- **Atomic RPC claiming** via `claim_next_core_tool_call` function
- **Added `FOR UPDATE SKIP LOCKED`** to prevent race conditions

### Step 3: Worker RPC Update
- Worker now uses RPC-based atomic claiming (already implemented)
- Removed polling-based status checks

### Step 4: AJV Validation
- **Rewrote `validate.js`** with proper AJV-based validation
- **Added schema compilation caching** for performance
- **Strict mode enabled** - rejects unknown properties
- **Clear error messages** with field paths

### Step 5: Idempotency
- Existing idempotency implementation verified and retained
- Supports `none`, `safe-retry`, and `keyed` modes
- Keyed idempotency for leads.create (by phone)

### Step 6: Tool Coverage
- Verified 100% handler coverage for all registry tools
- All handlers return proper `success()` or `notConfigured()` responses

### Step 7: Inspection Spine
- **Created `inspections` table** with full JSONB payload storage
- **Implemented inspection handlers:**
  - `inspection.create` - Create with lead linkage
  - `inspection.update` - Patch payload and fields
  - `inspection.submit` - Lock for quoting
  - `inspection.get` - Retrieve by ID
  - `inspection.list` - Filter by lead/status
  - `inspection.add_checklist_item` - Store in payload.checklist
  - `inspection.add_measurement` - Store in payload.measurements
  - `inspection.add_photo_ref` - Store in payload.photos
  - `inspection.add_defect` - Store in payload.defects

### Step 8: Leads with LeadConnector Priority
- **Added `leads.upsert`** - Create or update with LC priority
- **LeadConnector values overwrite** local Supabase data on conflict
- **Added `leadconnector_contact_id`** field support
- **Added `leads.get`** for single lead retrieval
- **Updated `leads.schedule_inspection`** to create inspection records

### Step 9: Quotes + Pricebook
- **Added `quote.create_draft`** - Create standalone quote
- **Added `quote.add_item`** - Add individual line items
- **Added `quote.update_item`** - Edit line item prices
- **Added `quote.remove_item`** - Remove line items
- **Added `quote.finalize`** - Lock quote for sending
- **Added `quote.get`** - Retrieve with line items
- **Prices are editable per item** (pricebook ranges future work)

### Step 10: Safe Comms Stubs
- **Added `comms.draft_sms`** - Create SMS draft (NO SENDING)
- **Added `comms.draft_email`** - Create email draft (NO SENDING)
- **Added `comms.log_interaction`** - Log any interaction type
- **Added `comms.create_followup_task`** - Create task with entity linkage
- **Added `comms.get_draft`** - Retrieve draft by ID
- **Added `comms.list_pending_drafts`** - List all pending drafts
- **`send_sms` and `send_email` return `not_configured`** (safe mode)

### Step 11: Verification Assets
- **Created `test/verify-gem.js`** - Comprehensive verification script
- **Created `sql/DEPLOY_ALL.sql`** - Consolidated migration bundle
- **Created this CHANGELOG**

### Files Modified
- `package.json` - Node 20.x, added AJV dependency
- `index.js` - Hardened executor with structured logging
- `src/lib/validate.js` - AJV-based validation
- `src/handlers/inspection.js` - Full implementation
- `src/handlers/leads.js` - LeadConnector priority
- `src/handlers/quote.js` - Pricebook-ready quotes
- `src/handlers/comms.js` - Safe stubs

### Files Created
- `sql/006_create_inspections_table.sql`
- `sql/DEPLOY_ALL.sql`
- `test/verify-gem.js`
- `CHANGELOG.md`

### Database Changes Required
Run `sql/DEPLOY_ALL.sql` in Supabase SQL Editor to apply all migrations.

### Breaking Changes
- None. All changes are backward compatible.

### Known Issues
- `inspections` table may not exist - run migrations
- PDF generation not implemented (returns `not_configured`)
- Email/SMS sending not implemented (returns `not_configured`)

---

## [0.2.0] - Previous Release

Initial GEM core implementation with basic tool handlers.
