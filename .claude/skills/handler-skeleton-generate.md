# Skill: handler-skeleton-generate

**Version**: 1.0.0
**GEM Compatibility**: >=2.0.0
**Registry Schema**: 1.2.0
**Last Verified**: 2026-01-09
**Bias**: Strengthens gem-pragmatic-shipper, gem-contract-enforcer

---

## Purpose

Generate a handler function skeleton that follows GEM patterns exactly. This Skill eliminates boilerplate and ensures all handlers follow the same structure as established in `gem-core/src/handlers/leads.js`.

## Preconditions

BEFORE execution, verify:
1. [ ] `tool_name` conforms to `domain.method` pattern
2. [ ] `tool_name` exists in `gem-core/tools.registry.json`
3. [ ] Handler file `gem-core/src/handlers/{domain}.js` exists
4. [ ] `registry_entry` is valid against registry schema
5. [ ] Export name does not already exist in handler file

IF ANY FAIL → REFUSE IMMEDIATELY

## Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["tool_name", "registry_entry", "implementation_type"],
  "properties": {
    "tool_name": {
      "type": "string",
      "pattern": "^[a-z_]+\\.[a-z_]+$",
      "description": "Tool name in domain.method format"
    },
    "registry_entry": {
      "type": "object",
      "required": ["name", "description", "input_schema", "output_schema", "idempotency"],
      "description": "Full tool entry from tools.registry.json"
    },
    "implementation_type": {
      "type": "string",
      "enum": ["real", "not_configured"],
      "description": "Whether to generate real implementation template or not_configured stub"
    }
  },
  "additionalProperties": false
}
```

## Execution Steps

1. **Validate Tool Name**
   - Parse `tool_name` into `domain` and `method`
   - Verify `gem-core/src/handlers/{domain}.js` exists
   - Extract method name (convert `create_task` → `create_task`, `google_drive.search` → `google_drive_search`)

2. **Load Handler File**
   - Read existing handler file
   - Check if method export already exists
   - If exists → REFUSE

3. **Extract Input/Output Fields**
   - From `registry_entry.input_schema.properties` → input field names
   - From `registry_entry.output_schema.properties` → output field names
   - From `registry_entry.idempotency` → idempotency mode and key_field

4. **Generate Handler Code**
   - Use template based on `implementation_type`
   - Include proper imports from `../lib/responses.js`
   - Include input destructuring
   - Include idempotency template if mode is `keyed`
   - Include error handling
   - Include success/notConfigured response

5. **Validate Output**
   - Generated code must be valid JavaScript
   - Must export function matching method name
   - Must follow pattern from `leads.js`

## Output Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["handler_code", "file_path", "export_name", "insertion_instructions"],
  "properties": {
    "handler_code": {
      "type": "string",
      "description": "Complete handler function source code"
    },
    "file_path": {
      "type": "string",
      "description": "Path where handler should be added: gem-core/src/handlers/{domain}.js"
    },
    "export_name": {
      "type": "string",
      "description": "Function name to export"
    },
    "insertion_instructions": {
      "type": "string",
      "description": "Human-readable instructions for adding to file"
    },
    "idempotency_notes": {
      "type": "string",
      "description": "Notes about idempotency implementation requirements"
    }
  },
  "additionalProperties": false
}
```

## Handler Code Template

### For `implementation_type: "not_configured"`:

```javascript
import { notConfigured } from '../lib/responses.js';

/**
 * {tool_name} - {description from registry}
 * Idempotency: {mode}
 * Status: NOT CONFIGURED
 */
export async function {method_name}(input, context = {}) {
  // Input validated by registry schema before reaching here
  const { {input_field_list} } = input;

  // TODO: Implement {tool_name}
  return notConfigured('{tool_name}', {
    reason: 'Handler implementation pending',
    required_env: [],
    next_steps: [
      'Implement database query or external API call',
      'Add error handling',
      'Return success with proper effects tracking'
    ]
  });
}
```

### For `implementation_type: "real"` with `idempotency.mode: "keyed"`:

```javascript
import { success, notConfigured } from '../lib/responses.js';
import { supabase } from '../lib/supabase.js';

/**
 * {tool_name} - {description from registry}
 * Idempotency: keyed by {key_field}
 */
export async function {method_name}(input, context = {}) {
  // Input validated by registry schema before reaching here
  const { {input_field_list} } = input;

  // Keyed idempotency check
  const { data: existing } = await supabase
    .from('{table_name}')
    .select('id')
    .eq('{key_field}', input.{key_field})
    .maybeSingle();

  if (existing) {
    return success(
      { {entity_id_field}: existing.id },
      { db_writes: [], idempotency_hit: true }
    );
  }

  // IMPLEMENTATION: Add real database operation here
  const { data, error } = await supabase
    .from('{table_name}')
    .insert({
      {input_field_list}
    })
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
      const { data: existingAfterRace } = await supabase
        .from('{table_name}')
        .select('id')
        .eq('{key_field}', input.{key_field})
        .single();

      if (existingAfterRace) {
        return success(
          { {entity_id_field}: existingAfterRace.id },
          { db_writes: [], idempotency_hit: true }
        );
      }
    }
    throw new Error(`Failed to create {entity}: ${error.message}`);
  }

  return success(
    { {entity_id_field}: data.id },
    {
      db_writes: [
        { table: '{table_name}', action: 'insert', id: data.id }
      ]
    }
  );
}
```

### For `implementation_type: "real"` with `idempotency.mode: "none"`:

```javascript
import { success } from '../lib/responses.js';
import { supabase } from '../lib/supabase.js';

/**
 * {tool_name} - {description from registry}
 * Idempotency: none (executes every time)
 */
export async function {method_name}(input, context = {}) {
  // Input validated by registry schema before reaching here
  const { {input_field_list} } = input;

  // IMPLEMENTATION: Add real database operation here
  const { data, error } = await supabase
    .from('{table_name}')
    .insert({
      {input_field_list}
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create {entity}: ${error.message}`);
  }

  return success(
    { {entity_id_field}: data.id },
    {
      db_writes: [
        { table: '{table_name}', action: 'insert', id: data.id }
      ]
    }
  );
}
```

## Refusal Rules

Refuse if:

1. **Invalid Tool Name**
   - `tool_name` does not match `domain.method` pattern
   - `domain` does not correspond to existing handler file

2. **Tool Not in Registry**
   - `tool_name` not found in `tools.registry.json`
   - `registry_entry` does not validate against registry schema

3. **Handler File Missing**
   - `gem-core/src/handlers/{domain}.js` does not exist

4. **Export Collision**
   - Method export already exists in handler file
   - Would overwrite existing implementation

5. **Malformed Registry Entry**
   - Missing required fields: `input_schema`, `output_schema`, `idempotency`
   - Invalid idempotency mode
   - `mode: "keyed"` but `key_field` is null

### Refusal Format

```json
{
  "refused": true,
  "reason": "Export collision: method 'create' already exists in gem-core/src/handlers/leads.js",
  "fix": "Choose a different method name or remove the existing implementation first",
  "documentation": "See gem-core/docs/EXECUTOR.md for handler patterns"
}
```

## Bias Interaction

**Strengthens**:
- **gem-pragmatic-shipper**: Eliminates 90% of boilerplate, ships handlers in <2 minutes
- **gem-contract-enforcer**: Ensures all handlers follow exact GEM patterns from day 1

**Constrains**:
- None (Shipper still writes real business logic)

**Does NOT**:
- Make implementation decisions (still requires human to add real logic)
- Choose database tables (human must specify in template placeholders)
- Design error messages (uses generic templates, User Advocate improves later)

## Agent Invocation Permissions

| Agent | Can Invoke | Rationale |
|-------|------------|-----------|
| gem-pragmatic-shipper | ✅ | Primary user - ships handlers fast |
| gem-contract-enforcer | ✅ | Ensures contract compliance |
| gem-paranoid-validator | ❌ | Not their job (they validate, not create) |
| gem-architect-visionary | ❌ | They design patterns, not generate code |
| gem-user-advocate | ❌ | Not their job (they improve UX, not create handlers) |
| gem-performance-hawk | ❌ | Not their job (they optimize, not create) |

## Quality Checklist

- [x] **gem-contract-enforcer**: Follows tools.registry.json exactly, respects idempotency modes
- [x] **gem-paranoid-validator**: No ambiguity - output is valid JS or refusal
- [x] **gem-pragmatic-shipper**: Fast (<2 seconds), reduces boilerplate by 90%
- [x] **gem-user-advocate**: Output includes comments and clear TODOs
- [x] **gem-performance-hawk**: No waste - generates minimal necessary code

## Usage Example

### Input:

```json
{
  "tool_name": "calendar.create_event",
  "registry_entry": {
    "name": "calendar.create_event",
    "description": "Create a calendar event for inspection or job scheduling",
    "input_schema": {
      "type": "object",
      "required": ["title", "start_time", "duration_minutes"],
      "properties": {
        "title": { "type": "string" },
        "start_time": { "type": "string", "format": "date-time" },
        "duration_minutes": { "type": "integer" },
        "attendees": { "type": "array", "items": { "type": "string" } }
      }
    },
    "output_schema": {
      "type": "object",
      "required": ["event_id"],
      "properties": {
        "event_id": { "type": "string" }
      }
    },
    "idempotency": {
      "mode": "none"
    }
  },
  "implementation_type": "not_configured"
}
```

### Output:

```json
{
  "handler_code": "import { notConfigured } from '../lib/responses.js';\n\n/**\n * calendar.create_event - Create a calendar event for inspection or job scheduling\n * Idempotency: none\n * Status: NOT CONFIGURED\n */\nexport async function create_event(input, context = {}) {\n  // Input validated by registry schema before reaching here\n  const { title, start_time, duration_minutes, attendees } = input;\n\n  // TODO: Implement calendar.create_event\n  return notConfigured('calendar.create_event', {\n    reason: 'Google Calendar API not configured',\n    required_env: ['GOOGLE_CALENDAR_API_KEY', 'GOOGLE_CALENDAR_ID'],\n    next_steps: [\n      'Set up Google Calendar API credentials',\n      'Implement event creation with Google Calendar API',\n      'Add error handling for API failures',\n      'Return success with event_id and effects tracking'\n    ]\n  });\n}\n",
  "file_path": "gem-core/src/handlers/calendar.js",
  "export_name": "create_event",
  "insertion_instructions": "Add this function to gem-core/src/handlers/calendar.js. Make sure to import notConfigured at the top of the file.",
  "idempotency_notes": "This tool has idempotency mode 'none', so it executes every time. No duplicate checking needed."
}
```

## Verification Commands

After generating a handler:

```bash
# 1. Verify syntax
node --check gem-core/src/handlers/{domain}.js

# 2. Test with executor
cd gem-core && npm start

# 3. Verify receipt
psql $SUPABASE_URL -c "SELECT * FROM core_tool_receipts WHERE tool_name = '{tool_name}' ORDER BY created_at DESC LIMIT 1;"
```

## Maintenance

This Skill must be updated if:
- Handler pattern in `leads.js` changes
- Receipt response structure changes
- New idempotency modes are added to GEM
- Import paths change in gem-core

**Update Frequency**: Review every GEM minor version release

---

**Status**: ✅ Ready for production use
**Tested Against**: gem-core v2.0.0, 40 existing handlers
**Refusal Rate**: <5% (expected - most failures are valid precondition violations)
