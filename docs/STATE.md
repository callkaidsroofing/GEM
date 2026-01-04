# Current State

This document is the canonical source for "where we are".

## Phase Status

| Phase | Status | Summary |
|-------|--------|---------|
| 1B Registry Coverage | COMPLETE | 99 tools, all produce receipts |
| 2A Brain MVP | COMPLETE | Rules planner, API, CLI, brain_runs table |
| 2B Controlled Expansion | CURRENT | One tool at a time, docs locked |
| 1C Provider Integration | DEFERRED | Twilio, SendGrid, Google APIs |

## Repository Structure

```
/
├── docs/              # Canonical system documentation (this)
├── gem-core/          # Executor (Render background worker)
├── gem-brain/         # Brain (Render web service)
└── README.md
```

## Tool Coverage

- **Total tools**: 99
- **Real implementation**: 40
- **Not configured**: 59

See `gem-core/docs/registry_coverage.md` for tool-by-tool breakdown.

### Real Implementations by Domain

| Domain | Count | Examples |
|--------|-------|----------|
| os | 13 | health_check, create_task, create_note |
| leads | 7 | create (keyed), update_stage, list_by_stage |
| quote | 7 | create_from_inspection, calculate_totals |
| entity | 4 | create, update, search, get |
| job | 4 | create_from_accepted_quote, complete |
| invoice | 3 | create_from_job, add_payment |
| comms | 2 | log_call_outcome |

## Database Tables

### Exist and Stable
- `core_tool_calls` - Tool queue
- `core_tool_receipts` - Execution results
- `brain_runs` - Brain audit log
- `notes`, `tasks`, `leads`, `quotes`, `quote_line_items`

### Migrations Pending

- `entities` (gem-core/migrations/001)
- `jobs` (gem-core/migrations/002)
- `invoices` (gem-core/migrations/003)
- `comms_log` (gem-core/migrations/004)
- `inspections` (gem-core/migrations/005)

## Services Status

### GEM-CORE Executor
- Worker loop: polls every 5000ms
- Atomic claim via `claim_next_core_tool_call` RPC (queue → claim RPC → handler → receipt)
- All handlers export from `src/handlers/<domain>.js`

### GEM Brain
- HTTP: `POST /brain/run`
- CLI: `node scripts/brain.js`
- Modes: answer, plan, enqueue, enqueue_and_wait
- Rules-first planner (planner → enqueue calls → optional receipt wait → brain_runs logging)

## Known Gaps

1. Domain table migrations not yet executed
2. Provider integrations not configured (Twilio, SendGrid, etc.)
3. LLM planner not implemented (rules-first only)
4. PDF generation returns not_configured

---

*Last updated: 2026-01-05*
