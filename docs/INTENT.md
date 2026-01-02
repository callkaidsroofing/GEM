# Current Intent

## Active Phase

**PHASE 1B - REGISTRY COVERAGE**

## Goal

Achieve 100% executable coverage of every tool defined in `tools.registry.json`.

For every tool invocation, exactly one receipt must be written. Each tool must resolve to one of three explicit outcomes:

1. **Real execution** - DB-backed effects, real business logic
2. **Structured not_configured** - Explicit, honest, documented
3. **Failed** - Validation error, unknown tool, or execution error

**Silent success is forbidden.**

## Success Criteria

- [ ] Every tool in registry has a corresponding handler export
- [ ] Unknown tools return `error_code: unknown_tool`
- [ ] Validation failures return `error_code: validation_error`
- [ ] Keyed idempotency prevents duplicate domain rows
- [ ] Not configured tools return structured response with next_steps
- [ ] `registry_coverage.md` shows 100% coverage

## Real Implementations (Phase 1B)

The following tools have real DB-backed implementations:

**OS Domain:**
- os.create_task
- os.complete_task
- os.list_tasks
- os.create_note
- os.search_notes

**Entity Domain:**
- entity.create
- entity.update
- entity.search
- entity.get

**Leads Domain:**
- leads.create (keyed by phone)
- leads.update_stage
- leads.list_by_stage

**Quote Domain:**
- quote.create_from_inspection
- quote.calculate_totals
- quote.update_line_items

**Job Domain:**
- job.create_from_accepted_quote
- job.assign_dates
- job.complete
- job.add_site_notes

**Invoice Domain:**
- invoice.create_from_job
- invoice.add_payment
- invoice.mark_overdue

**Comms Domain:**
- comms.log_call_outcome
- comms.create_followup_task_from_message

## Explicitly Out of Scope

- Frontend/UI work
- External provider integrations (Twilio, SendGrid, Google APIs)
- Mobile or Termux modifications
- Agent orchestration layer
- Workflow automation

---

*This document updates when development focus changes.*
