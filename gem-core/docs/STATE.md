# Current State

This document reflects operational truth as of the last update.

## Phase Status

**Phase 1B: COMPLETE** (Registry Coverage)

All 99 tools in `tools.registry.json` are executable without crashing.
Every call produces exactly one receipt.
Only three terminal states: `succeeded`, `failed`, `not_configured`.

See `registry_coverage.md` for authoritative tool-by-tool status.

**Phase 2A: COMPLETE** (Brain MVP)

GEM-Brain implemented with:
- Rules-first planner (no LLM required)
- HTTP API (`POST /brain/run`)
- CLI wrapper (`node scripts/brain.js`)
- brain_runs persistence table
- Registry guardrails (validation before enqueue)
- Receipt waiting (enqueue_and_wait mode)

Location: `gem-brain/`

**Current: Phase 2B** (Controlled Expansion)
- Documentation accuracy verified and locked
- Coverage generator script added (`scripts/analyze-coverage.js`)
- Ready for controlled tool expansion (one tool at a time)

**Next: Phase 1C** (Provider Integration) - Deferred
- Configure SMS provider (Twilio)
- Configure email provider (SendGrid)
- Execute pending table migrations

## Repository Structure

```
/
├── gem-core/           # CKR-CORE Executor (Render Background Worker)
├── gem-brain/          # AI Brain Layer (Render Web Service)
└── README.md
```

## Tables (Verified to Exist)

### Core System Tables
- `core_tool_calls` - Tool invocation queue (Stabilized with `claimed_by`, `claimed_at`)
- `core_tool_receipts` - Execution receipts (Stabilized)
- `brain_runs` - Brain request/response audit log (NEW in Phase 2A)

### Domain Tables
- `notes` - OS notes
- `tasks` - OS tasks
- `leads` - Lead records
- `quotes` - Quote records
- `quote_line_items` - Quote line items

### Tables to Create (Migrations Pending)
- `entities` - Entity records (migrations/001)
- `jobs` - Job records (migrations/002)
- `invoices` - Invoice records (migrations/003)
- `comms_log` - Communication log (migrations/004)

## Handler Status

### Real DB Implementation (40 tools)

**OS Domain (13 real):**
- os.health_check, os.get_state_snapshot, os.refresh_state_snapshot
- os.create_note, os.search_notes
- os.create_task, os.update_task, os.complete_task, os.defer_task, os.list_tasks
- os.create_reminder, os.audit_log_search, os.rollback_last_action

**Entity Domain (4 real):**
- entity.create, entity.update, entity.search, entity.get

**Leads Domain (7 real):**
- leads.create (keyed by phone), leads.update_stage, leads.add_source
- leads.add_photos_link, leads.schedule_inspection, leads.list_by_stage, leads.mark_lost

**Quote Domain (7 real):**
- quote.create_from_inspection, quote.update_line_items, quote.calculate_totals
- quote.generate_pdf, quote.send_to_client, quote.mark_accepted, quote.mark_declined

**Job Domain (4 real):**
- job.create_from_accepted_quote, job.assign_dates, job.add_site_notes, job.complete

**Invoice Domain (3 real):**
- invoice.create_from_job, invoice.add_payment, invoice.mark_overdue

**Comms Domain (2 real):**
- comms.log_call_outcome, comms.create_followup_task_from_message

### Not Configured (59 tools)
All remaining tools in registry return structured `not_configured` responses.
See `registry_coverage.md` for the complete list with required providers.

## Worker Status

### GEM-CORE Executor
- `worker_loop`: Running on Render (background worker)
- `atomic_claim_rpc`: `claim_next_core_tool_call` (Stabilized)
- `poll_interval`: 5000ms default

### GEM-Brain
- HTTP API available at `/brain/run`
- CLI available at `scripts/brain.js`
- Modes: answer, plan, enqueue, enqueue_and_wait

## Known Gaps

1. Tables `entities`, `jobs`, `invoices`, `comms_log` need migration execution
2. Integration tools require external provider configuration
3. PDF generation tools not configured
4. AI composition tools not configured
5. LLM integration for Brain not implemented (rules-first only)

---

*This document updates frequently as implementation progresses.*
*Last updated: 2026-01-04*
