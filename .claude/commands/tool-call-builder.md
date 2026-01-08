---
description: Build a valid GEM tool call payload from natural language or structured input
allowed-tools:
  - Read
  - Grep
---

# Tool Call Builder

Build a valid tool call payload that can be enqueued to `core_tool_calls`.

## Input

You will receive either:
1. **Natural language intent**: "create inspection for lead abc123 at 45 Smith St"
2. **Structured input**: `{ "tool_name": "inspection.create", "lead_id": "abc123" }`

If the user provides context (lead_id, inspection_id, job_id, quote_id), use it to populate the input.

## Process

### Step 1: Read the Registry

Read `gem-core/tools.registry.json` to find the tool definition:

```
1. Search for the tool by name if provided
2. Or search for tools matching the intent keywords
3. Extract: name, input_schema, idempotency config
```

### Step 2: Extract Parameters

Parse the intent to extract parameters:

```
Intent: "create inspection for lead abc123 at 45 Smith St"
Extracted:
- tool_name: inspection.create
- lead_id: abc123
- site_address: 45 Smith St
```

### Step 3: Validate Against Schema

Check the extracted input against the tool's `input_schema`:

```javascript
// From registry
input_schema: {
  type: "object",
  required: ["lead_id"],
  properties: {
    lead_id: { type: "string" },
    site_address: { type: "string" }
  }
}

// Validation
- All required fields present? YES
- Types match? YES
- Valid: true
```

### Step 4: Build Tool Call

Construct the final tool call payload:

```json
{
  "tool_call": {
    "tool_name": "inspection.create",
    "input": {
      "lead_id": "abc123",
      "site_address": "45 Smith St"
    },
    "idempotency_key": null
  },
  "validation": {
    "valid": true,
    "errors": []
  },
  "registry_ref": "tools.registry.json:516"
}
```

## Output Format

```json
{
  "tool_call": {
    "tool_name": "<domain.method>",
    "input": {
      // Validated input matching input_schema
    },
    "idempotency_key": "<optional key for keyed idempotency>"
  },
  "validation": {
    "valid": true|false,
    "errors": ["<error messages if invalid>"]
  },
  "registry_ref": "tools.registry.json:<line_number>",
  "metadata": {
    "tool_description": "<from registry>",
    "idempotency_mode": "none|safe-retry|keyed",
    "timeout_ms": <number>,
    "permissions": ["<permissions>"]
  }
}
```

## Common Tools Reference

| Intent Pattern | Tool Name |
|----------------|-----------|
| create lead | leads.create |
| create inspection | inspection.create |
| add photo to inspection | inspection.add_photo_ref |
| add measurement | inspection.add_measurement |
| add defect | inspection.add_defect |
| submit inspection | inspection.submit |
| create quote from inspection | quote.create_from_inspection |
| calculate quote totals | quote.calculate_totals |
| create task | os.create_task |
| register media/photo | media.register_asset |

## Error Handling

If the tool call cannot be built:

```json
{
  "tool_call": null,
  "validation": {
    "valid": false,
    "errors": [
      "Tool 'unknown.tool' not found in registry",
      "Missing required field: lead_id"
    ]
  },
  "suggestions": [
    "Did you mean 'leads.create'?",
    "Provide lead_id as: 'for lead <uuid>'"
  ]
}
```

## Usage Examples

**Example 1: Natural language**
```
Input: "create a new inspection for lead 12345 at 100 Main Street Brisbane"
Output: {
  "tool_call": {
    "tool_name": "inspection.create",
    "input": {
      "lead_id": "12345",
      "site_address": "100 Main Street",
      "site_suburb": "Brisbane"
    }
  },
  "validation": { "valid": true }
}
```

**Example 2: With context**
```
Input: "add a tile defect with high severity"
Context: { "inspection_id": "abc123" }
Output: {
  "tool_call": {
    "tool_name": "inspection.add_defect",
    "input": {
      "inspection_id": "abc123",
      "defect_type": "tile",
      "severity": "high"
    }
  },
  "validation": { "valid": true }
}
```
