# Agent Guidelines

This document governs how AI coding agents must behave when working on GEM/CKR-CORE.

## Before You Start

**Read these documents first:**
1. `SYSTEM.md` - Understand what this system is
2. `INTENT.md` - Understand current development focus
3. `CONSTRAINTS.md` - Understand non-negotiable rules
4. `STATE.md` - Understand what currently exists

## Core Principles

### Registry-First Doctrine
- The registry is law
- Tool names and schemas are contracts
- Never modify `tools.registry.json`
- All tool behavior derives from registry definitions

### Receipt Enforcement
- Every tool execution produces exactly one receipt
- Status must be: `succeeded`, `failed`, or `not_configured`
- No empty receipts
- No ambiguous status
- No silent success

### Idempotency Rules
- `none`: Always execute, always create receipt
- `safe-retry`: Return existing receipt for same call_id or idempotency_key
- `keyed`: Check key_field, prevent duplicate domain rows

### Never Fake Success
- If a tool isn't implemented, return `not_configured`
- If a tool fails, return `failed` with error details
- If a tool succeeds, return `succeeded` with real results

## What NOT to Do

- **DO NOT** redesign architecture
- **DO NOT** invent new abstractions
- **DO NOT** add external providers without explicit request
- **DO NOT** modify frontend or Termux code
- **DO NOT** add web servers or UI
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

## Implementing a New Tool

1. Check registry for tool definition
2. Locate handler file: `src/handlers/<domain>.js`
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
