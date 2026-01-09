# Current State

This document is the canonical source for "where we are".

## Phase Status

| Phase | Status | Summary |
|-------|--------|---------|
| 1B Registry Coverage | COMPLETE | 99 tools, all produce receipts |
| 2A Brain MVP | COMPLETE | Rules planner, API, CLI, brain_runs table |
| 2B Controlled Expansion | CURRENT | Inspection flow complete, expanding handlers |
| 2C Monorepo Unification | COMPLETE | 3-layer architecture, gem-shared contracts |
| 1C Provider Integration | DEFERRED | Twilio, SendGrid, Google APIs |

## Repository Structure

```
/
├── docs/              # Canonical system documentation
├── gem-core/          # Executor (Render background worker)
├── gem-brain/         # Brain (Render web service)
├── gem-shared/        # Shared contracts, schemas, validation
└── .claude/           # Claude Code agents (6) and commands (9)
```

## Tool Coverage

- **Total tools**: 99
- **Real implementation**: ~50
- **Not configured**: ~49

### Real Implementations by Domain

| Domain | Count | Examples |
|--------|-------|----------|
| os | 13 | health_check, create_task, create_note |
| leads | 7 | create (keyed), update_stage, list_by_stage |
| inspection | 10 | create, submit, add_measurement, add_defect, add_photo_ref |
| quote | 12 | create_from_inspection, add_item, calculate_totals, finalize |
| media | 5 | register_asset, tag_asset, link_to_inspection, get_asset |
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
- `inspections` - Inspection records with JSONB payload
- `media_assets` - Media asset registry (migration 007)
- `inspection_packets` - Normalized inspection data (migration 008)

### Analytics Views (migration 009)
- `gem_tool_execution_stats` - Per-tool execution statistics
- `gem_recent_failures` - Recent failed calls
- `gem_queue_depth` - Current queue depth by tool
- `gem_worker_activity` - Worker load over 24h
- `gem_idempotency_hits` - Idempotency hit rates

### Functions
- `gem_check_tool_health(tool_name)` - Tool health metrics
- `gem_get_pipeline_progress(inspection_id)` - Pipeline tracking
- `get_inspection_packet_stats(inspection_id)` - Packet statistics

## Key Workflows

### Inspection → Quote Pipeline (E2E Complete)

```
Lead → Inspection → Photos/Measurements/Defects → Submit → Quote → Line Items → Finalize
```

**Brain Commands:**
- `create inspection for lead [uuid]`
- `add measurement to [uuid]: roof area 150 sqm`
- `add defect to [uuid]: cracked tiles high severity`
- `submit inspection [uuid]`
- `create quote from inspection [uuid]`
- `add item to quote [uuid]: 3x Tiles $45`
- `finalize quote [uuid]`

**Test:** `node gem-core/tests/inspection_flow_e2e.js`

## Services Status

### GEM-CORE Executor
- Worker loop: polls every 5000ms
- Atomic claim via `claim_next_core_tool_call` RPC
- Handlers: `src/handlers/<domain>.js`
- Deployed: Render background worker

### GEM Brain
- HTTP: `POST /brain/run`
- CLI: `node scripts/brain.js`
- Modes: answer, plan, enqueue, enqueue_and_wait
- Rules-first planner with inspection flow support
- Deployed: Render web service

## Known Gaps

1. Provider integrations not configured (Twilio, SendGrid, etc.)
2. LLM planner not implemented (rules-first only)
3. PDF generation returns not_configured
4. AI vision tools (generate_alt_text) return not_configured

## Recent Changes

- **2026-01-09**: Full inspection → quote pipeline implemented
- **2026-01-09**: Migrations 007-009 deployed (media_assets, inspection_packets, analytics)
- **2026-01-09**: Brain rules expanded for inspection workflow
- **2026-01-09**: E2E test script created

---

*Last updated: 2026-01-09*
