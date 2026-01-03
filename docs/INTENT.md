# Current Intent

## Active Phase

**PHASE 2 - DOCUMENTATION LOCK-IN + CONTROLLED EXPANSION**

## Previous Phase

**Phase 1B (COMPLETE)**: Achieved 100% executable coverage of all 99 tools in `tools.registry.json`.

## Goal

Lock in documentation accuracy and prepare for controlled capability expansion.

Phase 2 operates under strict constraints:
- One tool at a time for any expansion
- Documentation must be updated with every code change
- No provider integrations without explicit approval
- No architecture redesign

## Success Criteria

- [x] Every tool in registry has a corresponding handler export (99/99)
- [x] Unknown tools return `error_code: unknown_tool`
- [x] Validation failures return `error_code: validation_error`
- [x] Keyed idempotency prevents duplicate domain rows
- [x] Not configured tools return structured response with next_steps
- [x] `registry_coverage.md` shows 100% coverage with accurate counts

## Current Implementation Summary

**Total Tools**: 99
**Real Implementations**: 40
**Not Configured**: 59

### Real Implementations by Domain

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

## Explicitly Out of Scope

- Frontend/UI work
- External provider integrations (Twilio, SendGrid, Google APIs)
- Mobile or Termux modifications
- Agent orchestration layer
- Workflow automation
- Adding multiple tools at once

## Phase 2 Tasks

1. Documentation lock-in (registry_coverage.md, STATE.md, INTENT.md)
2. Add coverage generator script
3. Add npm verification scripts
4. Validate SQL migrations
5. Controlled expansion of high-value tools (one at a time, with approval)

---

*This document updates when development focus changes.*
*Last updated: 2026-01-03*
