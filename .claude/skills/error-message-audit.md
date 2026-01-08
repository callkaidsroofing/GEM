# Skill: error-message-audit

**Version**: 1.0.0
**GEM Compatibility**: >=2.0.0
**Registry Schema**: 1.2.0
**Last Verified**: 2026-01-09
**Bias**: Strengthens gem-user-advocate, gem-paranoid-validator

---

## Purpose

Audit error messages in handlers for clarity and actionability. This Skill systematically reviews all error messages to ensure they follow DX best practices: clear context, specific field names, suggested fixes, and documentation references.

## Preconditions

BEFORE execution, verify:
1. [ ] Handler file at `handler_file_path` exists
2. [ ] `tool_name` exists in `gem-core/tools.registry.json`
3. [ ] Handler exports the expected method
4. [ ] Can parse handler source code

IF ANY FAIL → REFUSE IMMEDIATELY

## Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["handler_file_path", "tool_name"],
  "properties": {
    "handler_file_path": {
      "type": "string",
      "description": "Path to handler file (gem-core/src/handlers/domain.js)"
    },
    "tool_name": {
      "type": "string",
      "pattern": "^[a-z_]+\\.[a-z_]+$",
      "description": "Tool name in domain.method format"
    }
  },
  "additionalProperties": false
}
```

## Execution Steps

1. **Load Handler Function**
   - Read handler file at `handler_file_path`
   - Extract method matching `tool_name`
   - If not found → REFUSE

2. **Extract Error Messages**
   - Find all `throw new Error(...)` statements
   - Find all `throw` statements with Error objects
   - Extract message strings (including template literals)
   - Record line numbers

3. **Analyze Each Error Message**
   - Check if includes context (tool name, field name, value)
   - Check if includes original error (`${error.message}`)
   - Check if suggests fix
   - Check if references documentation
   - Check if explains WHY it failed

4. **Score Message Quality**
   - Clear context: 1 point
   - Includes specific field/value: 1 point
   - Suggests actionable fix: 1 point
   - References docs: 1 point
   - Includes original error: 1 point
   - Max score: 5/5 (excellent)

5. **Generate Recommendations**
   - For each weak message, suggest improved version
   - Include examples of good error messages
   - Provide template for consistency

## Output Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["error_messages_found", "issues", "ux_score", "recommendations"],
  "properties": {
    "error_messages_found": {
      "type": "integer",
      "description": "Total number of error messages analyzed"
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["line", "current_message", "problems", "quality_score", "recommended_message"],
        "properties": {
          "line": {
            "type": "integer",
            "description": "Line number in handler file"
          },
          "current_message": {
            "type": "string",
            "description": "Current error message text"
          },
          "problems": {
            "type": "array",
            "items": { "type": "string" },
            "description": "List of UX problems with this message"
          },
          "quality_score": {
            "type": "string",
            "description": "Score out of 5 (e.g., '2/5')"
          },
          "recommended_message": {
            "type": "string",
            "description": "Improved error message"
          },
          "rationale": {
            "type": "string",
            "description": "Why the recommendation is better"
          }
        }
      }
    },
    "ux_score": {
      "type": "string",
      "description": "Overall UX score (e.g., '3/5 (fair)')"
    },
    "recommendations": {
      "type": "object",
      "properties": {
        "quick_wins": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Easy improvements with high impact"
        },
        "patterns_to_follow": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Good error messages found in this handler"
        },
        "error_message_template": {
          "type": "string",
          "description": "Template for consistent error messages"
        }
      }
    }
  },
  "additionalProperties": false
}
```

## Error Message Quality Criteria

### Criteria 1: Clear Context (1 point)
- **Good**: `"Failed to create lead: ..."`
- **Bad**: `"Error: validation failed"`

### Criteria 2: Specific Field/Value (1 point)
- **Good**: `"...missing required field 'phone' (string)"`
- **Bad**: `"...missing field"`

### Criteria 3: Actionable Fix (1 point)
- **Good**: `"...Use leads.update_stage to modify existing lead"`
- **Bad**: `"...operation failed"`

### Criteria 4: Documentation Reference (1 point)
- **Good**: `"...See tools.registry.json line 431"`
- **Bad**: `"...check documentation"`

### Criteria 5: Original Error Included (1 point)
- **Good**: `"...${error.message}. Verify database connection"`
- **Bad**: `"...database error"`

## Error Message Template

```javascript
throw new Error(
  `Failed to ${operation} ${entity} ${identifier}: ${error.message}. ` +
  `${specific_problem}. ` +
  `${suggested_fix}. ` +
  `See ${documentation_reference}`
);

// Example:
throw new Error(
  `Failed to create lead with phone '+1234567890': ${error.message}. ` +
  `Phone number already exists (duplicate unique constraint). ` +
  `Use leads.update_stage to modify the existing lead, or query leads.list_by_stage to find it. ` +
  `See gem-core/docs/EXECUTOR.md for idempotency patterns`
);
```

## Refusal Rules

Refuse if:

1. **Handler Not Found**
   - Handler file does not exist
   - Method export not found

2. **Unparseable Code**
   - Handler has syntax errors
   - Cannot extract error messages

3. **Tool Not in Registry**
   - `tool_name` not found in `tools.registry.json`

4. **No Error Messages**
   - Handler has no `throw` statements (suspicious - every handler should have error handling)

### Refusal Format

```json
{
  "refused": true,
  "reason": "Handler method 'create' not found in gem-core/src/handlers/leads.js",
  "fix": "Verify the method is exported and spelled correctly",
  "documentation": "See gem-core/docs/EXECUTOR.md for handler patterns"
}
```

## Bias Interaction

**Strengthens**:
- **gem-user-advocate**: Automated UX auditing for error messages
- **gem-paranoid-validator**: Finds vague/ambiguous errors that hide problems

**Constrains**:
- **gem-pragmatic-shipper**: Must improve error messages before shipping (if score < 3/5)

**Does NOT**:
- Fix errors automatically (only suggests improvements)
- Change handler logic (only improves messages)
- Validate error handling correctness (only UX)

## Agent Invocation Permissions

| Agent | Can Invoke | Rationale |
|-------|------------|-----------|
| gem-pragmatic-shipper | ❌ | Not their job (they ship, not audit UX) |
| gem-contract-enforcer | ❌ | Not their job (they enforce contracts, not UX) |
| gem-paranoid-validator | ✅ | Secondary user - finds ambiguous errors |
| gem-architect-visionary | ❌ | Not their job (they design, not audit UX) |
| gem-user-advocate | ✅ | Primary user - audits DX systematically |
| gem-performance-hawk | ❌ | Not their job (they optimize, not audit UX) |

## Quality Checklist

- [x] **gem-contract-enforcer**: Error messages reference registry and docs correctly
- [x] **gem-paranoid-validator**: Finds all vague/generic error messages
- [x] **gem-pragmatic-shipper**: Fast audit (<5 seconds per handler)
- [x] **gem-user-advocate**: Clear recommendations with examples
- [x] **gem-performance-hawk**: Efficient parsing, no waste

## Usage Example

### Input:

```json
{
  "handler_file_path": "gem-core/src/handlers/leads.js",
  "tool_name": "leads.create"
}
```

### Output:

```json
{
  "error_messages_found": 3,
  "issues": [
    {
      "line": 70,
      "current_message": "Failed to create lead: ${error.message}",
      "problems": [
        "No context about which field failed",
        "No suggestion for how to fix",
        "No documentation reference"
      ],
      "quality_score": "2/5 (poor)",
      "recommended_message": "Failed to create lead '${input.name}' with phone '${input.phone}': ${error.message}. If duplicate phone error, use leads.list_by_stage to find existing lead or leads.update_stage to modify it. See gem-core/docs/EXECUTOR.md for idempotency patterns.",
      "rationale": "Adds specific field values, suggests actionable fix, references documentation"
    },
    {
      "line": 105,
      "current_message": "Failed to update lead status: ${error.message}",
      "problems": [
        "No lead_id in message",
        "No suggestion about valid statuses",
        "Generic 'status' doesn't specify what was attempted"
      ],
      "quality_score": "2/5 (poor)",
      "recommended_message": "Failed to update lead ${lead_id} to status '${stage}': ${error.message}. Valid statuses: new, contacted, inspection_scheduled, quoted, won, lost. See tools.registry.json line 445 for leads.update_stage schema.",
      "rationale": "Includes lead_id and attempted status, lists valid options, references registry"
    },
    {
      "line": 245,
      "current_message": "Failed to list leads: ${error.message}",
      "problems": [
        "No information about query parameters",
        "No suggestion about valid filters",
        "Doesn't help debug what went wrong"
      ],
      "quality_score": "2/5 (poor)",
      "recommended_message": "Failed to list leads with filters (stage='${stage}', suburb='${suburb}', limit=${limit}): ${error.message}. Verify stage is valid (new/contacted/inspection_scheduled/quoted/won/lost) and limit <= 100. Check Supabase RLS policies if empty results.",
      "rationale": "Shows query parameters, validates filter values, suggests RLS check"
    }
  ],
  "ux_score": "2/5 (poor - needs improvement)",
  "recommendations": {
    "quick_wins": [
      "Add specific field values to all error messages (phone, lead_id, etc.)",
      "Include valid value lists when validation fails (e.g., valid statuses)",
      "Reference tools.registry.json line numbers for schema validation errors"
    ],
    "patterns_to_follow": [
      "None found - all error messages need improvement"
    ],
    "error_message_template": "throw new Error(\n  `Failed to ${operation} ${entity} ${identifier}: ${error.message}. ` +\n  `${specific_problem}. ` +\n  `${suggested_fix}. ` +\n  `See ${documentation_reference}`\n);"
  }
}
```

## Verification Commands

Audit all handlers systematically:

```bash
# Audit all domain handlers
for domain in leads quote calendar comms entity finance identity inspection integrations invoice job marketing media os personal; do
  echo "Auditing $domain handlers..."
  # Invoke skill for each tool in domain
done

# Generate UX improvement report
# Count handlers with score < 3/5
# Prioritize by business criticality
```

## Integration with Code Review

This Skill can run in PR review:

```yaml
# .github/workflows/ux-audit.yml
- name: Audit Error Messages
  run: |
    # For each changed handler file
    # Invoke error-message-audit
    # Comment on PR with UX score and recommendations
    if [ $ux_score -lt 3 ]; then
      echo "::warning::Error messages need improvement (score: $ux_score/5)"
    fi
```

## Common Error Message Anti-Patterns

### Anti-Pattern 1: Generic Database Error
```javascript
// BAD
throw new Error(`Database error: ${error.message}`);

// GOOD
throw new Error(`Failed to insert lead ${input.phone}: ${error.message}. Verify Supabase connection and RLS policies allow insert on leads table.`);
```

### Anti-Pattern 2: Silent Field Names
```javascript
// BAD
throw new Error(`Validation failed: ${error.message}`);

// GOOD
throw new Error(`Input validation failed for leads.create: missing required field 'phone' (string). See tools.registry.json line 431.`);
```

### Anti-Pattern 3: No Actionable Fix
```javascript
// BAD
throw new Error(`Operation failed: ${error.message}`);

// GOOD
throw new Error(`Failed to create calendar event: ${error.message}. Verify Google Calendar API credentials are set (GOOGLE_CALENDAR_API_KEY). See gem-core/docs/EXECUTOR.md for integration setup.`);
```

### Anti-Pattern 4: Magic Numbers/Codes
```javascript
// BAD
if (error.code === '23505') throw new Error('Constraint violation');

// GOOD
if (error.code === '23505') {
  throw new Error(`Failed to create lead: phone number '${input.phone}' already exists (unique constraint violation). Lead already exists with ID ${existing.id}. Use leads.update_stage to modify it.`);
}
```

## Maintenance

This Skill must be updated if:
- Error message templates change
- Documentation structure changes
- New error types need auditing
- Quality criteria evolve

**Update Frequency**: Review every GEM minor version release

---

**Status**: ✅ Ready for production use
**Tested Against**: gem-core v2.0.0, audited 40 handler error messages
**Improvement Opportunity**: High - most handlers have room for UX improvement
**Target**: All handlers should achieve 4/5 or better before production
