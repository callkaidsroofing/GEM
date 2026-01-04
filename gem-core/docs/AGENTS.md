# Agent Guidelines

This document governs how AI coding agents must behave when working on GEM.

## Before You Start

**Read these documents first (in order):**
1. `SYSTEM.md` - Understand what GEM is (executor + brain)
2. `INTENT.md` - Understand current development focus
3. `CONSTRAINTS.md` - Understand non-negotiable rules
4. `STATE.md` - Understand what currently exists

**For Brain work, also read:**
- `gem-brain/docs/BRAIN.md` - Brain contract and behavior
- `gem-brain/docs/RUNBOOK.md` - How to run and test Brain

## Stop-The-Line Rules

These rules are non-negotiable. If you find yourself about to violate one, STOP and ask for clarification.

1. **DO NOT** rename or alter any tool names or schemas in `tools.registry.json`
2. **DO NOT** add external providers (Twilio/SendGrid/Google APIs) without explicit approval
3. **DO NOT** add web servers to the executor (gem-core)
4. **DO NOT** change the executor start command (`node index.js`)
5. **DO NOT** fake success - if something isn't working, say so
6. **DO NOT** skip receipt writing for tool execution
7. **DO NOT** implement multiple tools at once - one tool per PR

## Core Principles

### Registry-First Doctrine
- The registry is law
- Tool names and schemas are contracts
- Never modify `tools.registry.json` without versioning
- All tool behavior derives from registry definitions

### Receipt Enforcement (Executor)
- Every tool execution produces exactly one receipt
- Status must be: `succeeded`, `failed`, or `not_configured`
- No empty receipts
- No ambiguous status
- No silent success

### Brain Guardrails
- Brain only enqueues tools found in registry
- Brain validates input before enqueueing
- Brain never fakes execution - if not enqueued, say so
- Brain falls back to answer mode if no rules match

### Idempotency Rules
- `none`: Always execute, always create receipt
- `safe-retry`: Return existing receipt for same call_id or idempotency_key
- `keyed`: Check key_field, prevent duplicate domain rows

### Never Fake Success
- If a tool isn't implemented, return `not_configured`
- If a tool fails, return `failed` with error details
- If a tool succeeds, return `succeeded` with real results
- If Brain can't plan, return helpful error message

## What NOT to Do

- **DO NOT** redesign architecture
- **DO NOT** invent new abstractions
- **DO NOT** add external providers without explicit request
- **DO NOT** modify frontend or Termux code
- **DO NOT** add web servers to executor
- **DO NOT** guess at requirements - ask for clarification
- **DO NOT** modify registry tool names or schemas
- **DO NOT** skip receipt writing

## What TO Do

- Follow existing patterns in handler implementations
- Return structured `not_configured` responses for unimplemented tools
- Validate input against registry schemas
- Update `STATE.md` after making changes
- Update `registry_coverage.md` after implementing tools
- Test with verification INSERTs

## Documentation Update Rule (Non-Negotiable)

Any change that:
- Alters tool behaviour
- Changes registry coverage
- Adds or removes real implementations
- Advances or closes a development phase
- Modifies Brain behavior

**Must update at least one of:**
- `docs/STATE.md`
- `docs/INTENT.md`
- `docs/DECISIONS.md`

**Code changes without documentation updates are considered incomplete.**

## Testing Safely

### Test Executor (gem-core)
```sql
-- Insert a test tool call
INSERT INTO core_tool_calls (tool_name, input, status)
VALUES ('os.health_check', '{}', 'queued');

-- Check for receipt
SELECT * FROM core_tool_receipts ORDER BY created_at DESC LIMIT 1;
```

### Test Brain (gem-brain)
```bash
# CLI test (answer mode - no execution)
node scripts/brain.js -m "system status" -M answer

# CLI test (enqueue - requires executor running)
node scripts/brain.js -m "create task: test" -M enqueue_and_wait
```

```bash
# API test
curl -X POST http://localhost:3000/brain/run \
  -H "Content-Type: application/json" \
  -d '{"message": "system status", "mode": "answer"}'
```

## Implementing a New Tool

1. Check registry for tool definition
2. Locate handler file: `gem-core/src/handlers/<domain>.js`
3. Export function matching method name
4. Validate input against registry schema
5. Implement logic (real DB or not_configured)
6. Return `{ result, effects }` structure
7. Update `STATE.md` and `registry_coverage.md`

## Example: Not Configured Response

```javascript
import { notConfigured } from '../lib/responses.js';

export async function some_tool(input) {
  return notConfigured('domain.some_tool', {
    reason: 'External provider not configured',
    required_env: ['PROVIDER_API_KEY'],
    next_steps: ['Configure provider credentials', 'Set environment variable']
  });
}
```

## Example: Real Implementation

```javascript
import { supabase } from '../lib/supabase.js';
import { success } from '../lib/responses.js';

export async function create_thing(input) {
  const { name } = input;

  const { data, error } = await supabase
    .from('things')
    .insert({ name })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create thing: ${error.message}`);
  }

  return success(
    { thing_id: data.id },
    { db_writes: [{ table: 'things', action: 'insert', id: data.id }] }
  );
}
```

---

*This document defines agent behavior and should rarely change.*
