# Agent Guidelines

Rules for AI coding agents working on GEM.

## Documentation Hierarchy

**Root `/docs/` is canonical system truth.**

- Only `/docs/STATE.md` describes project phases and progress
- Only `/docs/SYSTEM.md` defines what GEM is
- Subsystem docs (`gem-core/docs/`, `gem-brain/docs/`) are local mechanics only
- Subsystem docs cannot redefine system purpose or phase
- If conflict exists, root `/docs/` wins

## Required Reading (In Order)

1. `/docs/CONSTRAINTS.md` - Hard rules, stop-the-line conditions
2. `/docs/SYSTEM.md` - What GEM is, two services, data flow
3. `/docs/STATE.md` - Current phase, what exists, known gaps
4. `/docs/AGENTS.md` - This document

Then for specific work:
- Executor: `gem-core/docs/EXECUTOR.md`
- Brain: `gem-brain/docs/BRAIN.md`

## Stop-The-Line Rules

If you're about to do any of these, STOP and ask:

1. Rename or alter tool names in registry
2. Add external provider (Twilio, SendGrid, Google APIs)
3. Add HTTP server to executor
4. Change executor start command
5. Modify multiple tools in one PR
6. Skip receipt writing
7. Fake success or empty receipts

## Core Principles

### Registry First
- `tools.registry.json` is the contract
- Tool definitions are immutable at runtime
- All behavior derives from registry

### Receipt Enforcement
- One receipt per call, always
- Three states only: succeeded, failed, not_configured
- No silent success

### Separation of Concerns
- Brain validates and enqueues
- Executor claims and executes
- Communication via Supabase only

## What TO Do

- Follow existing patterns in handlers
- Return structured `not_configured` for unimplemented tools
- Validate input against registry schemas
- Update `/docs/STATE.md` after changes
- Test with verification SQL

## What NOT To Do

- Redesign architecture
- Add abstractions "for later"
- Add providers without approval
- Modify Termux code
- Skip documentation updates

## Testing

### Executor
```sql
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES ('os.health_check', '{}', 'queued');

SELECT * FROM core_tool_receipts ORDER BY created_at DESC LIMIT 1;
```

### Brain
```bash
# CLI testing
cd gem-brain
node scripts/brain.js "system status"
node scripts/brain.js "create task: test task"

# E2E inspection flow
node gem-core/tests/inspection_flow_e2e.js
```

## Claude Code Resources

### Agents (`.claude/agents/`)
Specialized agents with intentional biases for different tasks:
- `gem-contract-enforcer` - Registry and contract validation
- `gem-paranoid-validator` - Edge case and race condition detection
- `gem-pragmatic-shipper` - Fast implementation focus
- `gem-architect-visionary` - Long-term design
- `gem-user-advocate` - DX and error message improvement
- `gem-performance-hawk` - Optimization focus

See `/docs/AGENT_FAMILY.md` for full documentation.

### Commands (`.claude/commands/`)
Deterministic tools for common workflows:
- `contract-drift-detect` - Find schema mismatches
- `handler-skeleton-generate` - Generate handler boilerplate
- `receipt-validate` - Validate receipt structure
- `test-case-generate` - Generate test SQL
- `tool-call-builder` - Build tool call payloads
- `verification-sql-generator` - Generate verification queries

## Documentation Update Rule

Any change that affects tool behavior, coverage, or project phase must update at least one of:
- `/docs/STATE.md`
- `/docs/DECISIONS.md`

Code without docs is incomplete.
