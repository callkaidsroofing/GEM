---
description: Generate a GEM handler function skeleton from registry definition
allowed-tools:
  - Read
  - Write
  - Grep
---

# Handler Skeleton Generator

Generate a handler function skeleton for the specified tool that follows GEM patterns exactly.

## Input

Tool name: $ARGUMENTS

## Instructions

1. **Read the registry entry** from `gem-core/tools.registry.json` for the specified tool
2. **Determine implementation type** based on context:
   - `real` - Full implementation with database operations
   - `not_configured` - Safe stub that returns not_configured status

3. **Generate handler skeleton** following this pattern:

```javascript
async function methodName(input, context) {
  // 1. Input validation (from registry input_schema)

  // 2. Idempotency check (if mode is "keyed")

  // 3. Business logic placeholder

  // 4. Return receipt with status, result, effects
  return {
    status: 'succeeded', // or 'failed' or 'not_configured'
    result: { /* fields from registry receipt_fields */ },
    effects: {
      db_writes: [],
      // other effects as needed
    }
  };
}
```

4. **For not_configured**, use this exact pattern:
```javascript
async function methodName(input, context) {
  return {
    status: 'not_configured',
    result: {
      status: 'not_configured',
      reason: '[Domain] [method] is not yet implemented',
      next_steps: [
        'Implement [specific requirement]',
        'Configure [specific integration]'
      ]
    },
    effects: {}
  };
}
```

5. **Output the skeleton** ready to paste into `gem-core/src/handlers/{domain}.js`

## Validation Checklist

- [ ] Handler exports match registry tool name (domain.method -> exports.method)
- [ ] Input validation covers all required fields from input_schema
- [ ] Idempotency mode matches registry (none/safe-retry/keyed)
- [ ] Receipt fields match registry receipt_fields exactly
- [ ] Error messages include tool name and context

## Example Usage

```
/project:handler-skeleton-generate leads.create
/project:handler-skeleton-generate quote.calculate_totals
```
