# Current State

This document reflects operational truth as of the last update.

## Tables (Verified to Exist)

### Core System Tables
- `core_tool_calls` - Tool invocation queue
- `core_tool_receipts` - Execution receipts

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

### Real DB Implementation
| Handler | Status |
|---------|--------|
| os.create_note | Real |
| os.search_notes | Real |
| os.create_task | Real |
| os.complete_task | Real |
| os.list_tasks | Real |
| os.health_check | Real |
| leads.create | Real (keyed) |
| leads.update_stage | Real |
| leads.list_by_stage | Real |
| quote.create_from_inspection | Real |
| quote.calculate_totals | Real |
| entity.create | Real |
| entity.update | Real |
| entity.search | Real |
| entity.get | Real |
| job.create_from_accepted_quote | Real |
| job.assign_dates | Real |
| job.complete | Real |
| comms.log_call_outcome | Real |
| comms.create_followup_task_from_message | Real |
| invoice.create_from_job | Real |
| invoice.add_payment | Real |
| invoice.mark_overdue | Real |

### Not Configured (Stub Implementation)
All remaining tools in registry return structured `not_configured` responses.

## Worker Status

- **Worker loop**: Running on Render
- **Atomic claim RPC**: `claim_next_core_tool_call`
- **Poll interval**: 5000ms default

## Known Gaps

1. Tables `entities`, `jobs`, `invoices`, `comms_log` need migration execution
2. Integration tools require external provider configuration
3. PDF generation tools not configured
4. AI composition tools not configured

---

*This document updates frequently as implementation progresses.*
