---
description: Audit error messages in a handler for clarity and actionability
allowed-tools:
  - Read
  - Grep
---

# Error Message Auditor

Audit error messages in a handler for DX quality - clarity, context, and actionability.

## Input

Handler to audit: $ARGUMENTS

Format: `tool_name` or `domain` (audits all tools in domain)

## Instructions

1. **Load handler file** from `gem-core/src/handlers/{domain}.js`

2. **Extract all error messages**:
   - Find `throw new Error(...)` statements
   - Find `throw` with Error objects
   - Record line numbers and message text

3. **Score each message** (0-5 points):

| Criteria | Points | Good Example | Bad Example |
|----------|--------|--------------|-------------|
| Clear context | 1 | `Failed to create lead:` | `Error:` |
| Specific field/value | 1 | `missing 'phone' (string)` | `missing field` |
| Actionable fix | 1 | `Use leads.update_stage to modify` | `operation failed` |
| Documentation reference | 1 | `See tools.registry.json line 431` | `check docs` |
| Original error included | 1 | `${error.message}` | `database error` |

4. **Output audit report**:

```json
{
  "handler": "leads.js",
  "tool": "leads.create",
  "error_messages_found": 3,
  "overall_score": "2/5 (poor)",
  "issues": [
    {
      "line": 70,
      "current": "Failed to create lead: ${error.message}",
      "problems": ["No field context", "No fix suggestion", "No docs reference"],
      "score": "2/5",
      "recommended": "Failed to create lead '${input.name}' with phone '${input.phone}': ${error.message}. If duplicate phone, use leads.list_by_stage to find existing lead. See tools.registry.json line 431."
    }
  ],
  "quick_wins": [
    "Add field values to all error messages",
    "Include valid value lists for validation errors",
    "Reference registry line numbers for schema errors"
  ]
}
```

## Error Message Template

Use this template for consistent, helpful error messages:

```javascript
throw new Error(
  `Failed to ${operation} ${entity} ${identifier}: ${error.message}. ` +
  `${specific_problem}. ` +
  `${suggested_fix}. ` +
  `See ${documentation_reference}`
);
```

## Common Anti-Patterns

1. **Generic database error**: `Database error` -> Include table, operation, ID
2. **Silent field names**: `Validation failed` -> Name the field and expected type
3. **No actionable fix**: `Operation failed` -> Suggest what to do next
4. **Magic codes**: `Error code 23505` -> Explain what 23505 means (unique constraint)

## Example Usage

```
/project:error-message-audit leads.create
/project:error-message-audit leads
/project:error-message-audit quote
```
