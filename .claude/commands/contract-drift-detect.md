---
description: Detect contract drift between handler implementation and registry definition
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Contract Drift Detector

Compare a handler implementation against its registry contract to detect violations.

## Input

Tool name: $ARGUMENTS

## Instructions

1. **Load the registry contract** from `gem-core/tools.registry.json`:
   - Extract input_schema (required/optional fields, types)
   - Extract receipt_fields (expected output fields)
   - Extract idempotency mode and key_field
   - Extract timeout_ms

2. **Load the handler implementation** from `gem-core/src/handlers/{domain}.js`:
   - Find the exported function matching the method name
   - Extract input field access patterns
   - Extract return statement structure
   - Extract idempotency handling logic

3. **Compare and detect drift**:

| Check | Registry | Handler | Status |
|-------|----------|---------|--------|
| Input fields used | List from input_schema | List accessed in code | MATCH/DRIFT |
| Receipt fields returned | List from receipt_fields | List in return | MATCH/DRIFT |
| Idempotency mode | mode value | Implementation pattern | MATCH/DRIFT |
| Idempotency key | key_field value | Key used in code | MATCH/DRIFT |

4. **Report violations** with severity:
   - **BLOCKER**: Missing required input validation, wrong receipt fields
   - **WARNING**: Extra fields returned, inconsistent naming

5. **Output format**:

```json
{
  "tool_name": "domain.method",
  "contract_version": "1.2.0",
  "violations": [
    {
      "type": "input_field_missing",
      "field": "phone",
      "severity": "BLOCKER",
      "fix": "Add validation for input.phone"
    }
  ],
  "compliance_score": "X/Y",
  "recommendation": "..."
}
```

## Example Usage

```
/project:contract-drift-detect leads.create
/project:contract-drift-detect quote.calculate_totals
```
